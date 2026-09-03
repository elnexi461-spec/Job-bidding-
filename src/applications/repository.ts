import { Pool } from 'pg';
import { FilterResult } from '../types.js';
import { RankedJob } from '../scoring.js';
import { pool as defaultPool } from '../db.js';

export const APPLICATION_STATUSES = [
  'queued',
  'applied',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ApplicationRecord {
  id: number;
  job_id: number;
  status: ApplicationStatus;
  job_score: number | null;
  canonical_url: string | null;
  applied_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationQueueResult {
  application: ApplicationRecord | null;
  created: boolean;
  duplicate: boolean;
  reason: string;
}

const INSERT_APPLICATION_SQL = `
  INSERT INTO applications (job_id, status, job_score, canonical_url)
  VALUES ($1, $2, $3, $4)
  RETURNING *
`;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export async function getApplicationByJobId(
  jobId: number,
  dbPool: Pool = defaultPool,
): Promise<ApplicationRecord | null> {
  const result = await dbPool.query(
    'SELECT * FROM applications WHERE job_id = $1 LIMIT 1',
    [jobId],
  );
  return (result.rows[0] as ApplicationRecord | undefined) || null;
}

export async function enqueueApplication(
  jobId: number,
  rankedJob: RankedJob,
  dbPool: Pool = defaultPool,
): Promise<ApplicationQueueResult> {
  if (!rankedJob.qualification.accepted) {
    return {
      application: null,
      created: false,
      duplicate: false,
      reason: `Not queued: ${rankedJob.qualification.reason}`,
    };
  }

  const existing = await getApplicationByJobId(jobId, dbPool);
  if (existing) {
    return {
      application: existing,
      created: false,
      duplicate: true,
      reason: 'Application already exists for this job',
    };
  }

  try {
    const result = await dbPool.query(INSERT_APPLICATION_SQL, [
      jobId,
      'queued',
      rankedJob.score,
      rankedJob.job.canonical_url,
    ]);

    return {
      application: result.rows[0] as ApplicationRecord,
      created: true,
      duplicate: false,
      reason: 'Qualified job added to application queue',
    };
  } catch (error) {
    // The unique index closes the race between the duplicate check and insert.
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const concurrentApplication = await getApplicationByJobId(jobId, dbPool);
    if (!concurrentApplication) {
      throw error;
    }

    return {
      application: concurrentApplication,
      created: false,
      duplicate: true,
      reason: 'Application already exists for this job',
    };
  }
}

export async function updateApplicationStatus(
  applicationId: number,
  status: ApplicationStatus,
  dbPool: Pool = defaultPool,
): Promise<ApplicationRecord | null> {
  if (!APPLICATION_STATUSES.includes(status)) {
    throw new Error(`Invalid application status: ${status}`);
  }

  const result = await dbPool.query(
    `UPDATE applications
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [status, applicationId],
  );
  return (result.rows[0] as ApplicationRecord | undefined) || null;
}