import { Pool } from 'pg';
import { NormalizedJob } from '../types.js';
import { pool as defaultPool } from '../db.js';

export interface JobRecord {
  id: number;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  url: string | null;
  canonical_url: string | null;
  external_id: string | null;
  content_hash: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  remote_type: string | null;
  source: string | null;
  posted_date: string | null;
  scraped_at: string;
  created_at: string;
}

const INSERT_SQL = `
  INSERT INTO jobs (
    title, company, location, description,
    url, canonical_url, external_id, content_hash,
    salary_min, salary_max, currency,
    remote_type, source, posted_date
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  RETURNING *
`;

export async function getJobByExternalId(
  source: string,
  externalId: string,
  dbPool: Pool = defaultPool,
): Promise<JobRecord | null> {
  const result = await dbPool.query(
    'SELECT * FROM jobs WHERE source = $1 AND external_id = $2',
    [source, externalId],
  );
  return result.rows[0] || null;
}

export async function getJobByCanonicalUrl(
  canonicalUrl: string,
  dbPool: Pool = defaultPool,
): Promise<JobRecord | null> {
  const result = await dbPool.query(
    'SELECT * FROM jobs WHERE canonical_url = $1',
    [canonicalUrl],
  );
  return result.rows[0] || null;
}

export async function getJobByContentHash(
  contentHash: string,
  dbPool: Pool = defaultPool,
): Promise<JobRecord | null> {
  const result = await dbPool.query(
    'SELECT * FROM jobs WHERE content_hash = $1',
    [contentHash],
  );
  return result.rows[0] || null;
}

export async function upsertJob(
  job: NormalizedJob,
  dbPool: Pool = defaultPool,
): Promise<{ job: JobRecord; isNew: boolean }> {
  // Deduplication order:
  // 1. source + external_id
  if (job.external_id) {
    const existing = await getJobByExternalId(job.source, job.external_id, dbPool);
    if (existing) return { job: existing, isNew: false };
  }

  // 2. canonical_url
  if (job.canonical_url) {
    const existing = await getJobByCanonicalUrl(job.canonical_url, dbPool);
    if (existing) return { job: existing, isNew: false };
  }

  // 3. content_hash
  if (job.content_hash) {
    const existing = await getJobByContentHash(job.content_hash, dbPool);
    if (existing) return { job: existing, isNew: false };
  }

  // Insert new job
  const result = await dbPool.query(INSERT_SQL, [
    job.title,
    job.company,
    job.location,
    job.description,
    job.url,
    job.canonical_url,
    job.external_id,
    job.content_hash,
    job.salary_min,
    job.salary_max,
    job.currency,
    job.remote_type,
    job.source,
    job.posted_date,
  ]);

  return { job: result.rows[0] as JobRecord, isNew: true };
}

export async function countJobs(dbPool: Pool = defaultPool): Promise<number> {
  const result = await dbPool.query('SELECT COUNT(*) FROM jobs');
  return parseInt(result.rows[0].count, 10);
}
