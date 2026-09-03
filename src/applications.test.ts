import assert from 'assert';
import { Pool } from 'pg';
import { normalizeJob } from './normalize.js';
import { filterJob } from './filter.js';
import { scoreJob, RankedJob } from './scoring.js';
import {
  enqueueApplication,
  getApplicationByJobId,
  updateApplicationStatus,
  ApplicationRecord,
} from './applications/repository.js';

function createMockPool() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let nextResults: unknown[][] = [];

  const mockPool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params || [] });
      const rows = nextResults.shift() || [];
      return { rows, command: '', rowCount: rows.length } as any;
    },
    calls,
    setNextResults: (results: unknown[][]) => {
      nextResults = results;
    },
  };

  return mockPool;
}

function makeRankedJob(): RankedJob {
  const job = normalizeJob({
    title: 'Full Stack Developer',
    company: 'QueueCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
  });
  const qualification = filterJob(job);
  return {
    job,
    qualification,
    ...scoreJob(job, qualification),
  };
}

function makeApplication(overrides: Partial<ApplicationRecord> = {}): ApplicationRecord {
  return {
    id: 1,
    job_id: 42,
    status: 'queued',
    job_score: 100,
    canonical_url: 'https://queue.example/job-42',
    applied_at: 'now',
    notes: null,
    created_at: 'now',
    updated_at: 'now',
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.error(`     ${err}`);
    failed++;
  }
}

console.log('\nRunning application pipeline tests...\n');

await test('qualified scored job enters the application queue', async () => {
  const mock = createMockPool();
  const rankedJob = makeRankedJob();
  const application = makeApplication({
    job_score: rankedJob.score,
    canonical_url: rankedJob.job.canonical_url,
  });
  mock.setNextResults([[], [application]]);

  const result = await enqueueApplication(
    42,
    rankedJob,
    mock as unknown as Pool,
  );

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.duplicate, false);
  assert.strictEqual(result.application?.job_id, 42);
  assert.strictEqual(result.application?.job_score, rankedJob.score);
  assert.strictEqual(
    result.application?.canonical_url,
    rankedJob.job.canonical_url,
  );
  assert.deepStrictEqual(mock.calls[1].params, [
    42,
    'queued',
    rankedJob.score,
    rankedJob.job.canonical_url,
  ]);
});

await test('unqualified jobs cannot enter the application queue', async () => {
  const mock = createMockPool();
  const rankedJob = makeRankedJob();
  rankedJob.qualification = {
    accepted: false,
    reason: 'Not a remote job',
  };

  const result = await enqueueApplication(
    42,
    rankedJob,
    mock as unknown as Pool,
  );

  assert.strictEqual(result.created, false);
  assert.strictEqual(result.duplicate, false);
  assert.strictEqual(result.application, null);
  assert.ok(result.reason.includes('Not a remote job'));
  assert.strictEqual(mock.calls.length, 0);
});

await test('duplicate applications are not created', async () => {
  const mock = createMockPool();
  const existing = makeApplication();
  mock.setNextResults([[existing]]);

  const result = await enqueueApplication(
    42,
    makeRankedJob(),
    mock as unknown as Pool,
  );

  assert.strictEqual(result.created, false);
  assert.strictEqual(result.duplicate, true);
  assert.strictEqual(result.application?.id, existing.id);
  assert.strictEqual(mock.calls.length, 1);
});

await test('application status advances through the lifecycle', async () => {
  const mock = createMockPool();
  const updated = makeApplication({ status: 'applied' });
  mock.setNextResults([[updated]]);

  const result = await updateApplicationStatus(
    1,
    'applied',
    mock as unknown as Pool,
  );

  assert.strictEqual(result?.status, 'applied');
  assert.deepStrictEqual(mock.calls[0].params, ['applied', 1]);
  assert.ok(mock.calls[0].sql.includes('UPDATE applications'));
});

await test('application lookup is linked by job id', async () => {
  const mock = createMockPool();
  mock.setNextResults([[makeApplication()]]);

  const result = await getApplicationByJobId(42, mock as unknown as Pool);

  assert.strictEqual(result?.job_id, 42);
  assert.deepStrictEqual(mock.calls[0].params, [42]);
  assert.ok(mock.calls[0].sql.includes('WHERE job_id'));
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);