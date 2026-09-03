import assert from 'assert';
import { normalizeJob } from './normalize.js';
import { rankJobs, scoreJob } from './scoring.js';
import { NormalizedJob } from './types.js';

function makeJob(
  title: string,
  overrides: Partial<NormalizedJob> = {},
): NormalizedJob {
  return normalizeJob({
    title,
    company: overrides.company || 'TestCo',
    source: overrides.source || 'manual',
    remote_type: overrides.remote_type ?? 'remote',
    location: overrides.location || 'Remote',
    description: overrides.description || '',
  });
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.error(`     ${err}`);
    failed++;
  }
}

console.log('\nRunning scoring tests...\n');

test('strong role matches score higher than weak description matches', () => {
  const strong = scoreJob(makeJob('Senior Full Stack Developer'));
  const weak = scoreJob(
    makeJob('Technical Specialist', {
      description: 'Work with a software engineer team.',
    }),
  );

  assert.ok(strong.score > weak.score);
  assert.ok(strong.reason.includes('strong title match'));
  assert.ok(weak.reason.includes('weaker description match'));
});

test('explicit fully remote jobs receive the remote score bonus', () => {
  const explicit = scoreJob(makeJob('Backend Engineer'));
  const locationOnly = scoreJob(
    makeJob('Backend Engineer', {
      remote_type: '',
      location: 'Remote',
    }),
  );

  assert.ok(explicit.score > locationOnly.score);
  assert.ok(explicit.reason.includes('explicitly fully remote'));
});

test('unqualified jobs receive no score', () => {
  const result = scoreJob(
    makeJob('Marketing Specialist', {
      description: '',
    }),
  );

  assert.strictEqual(result.score, 0);
  assert.ok(result.reason.includes('Not scored'));
});

test('ranking orders qualified jobs by score and excludes rejected jobs', () => {
  const ranked = rankJobs([
    makeJob('Cloud Engineer', { company: 'CloudCo' }),
    makeJob('Full Stack Developer', { company: 'StackCo' }),
    makeJob('Remote Marketing Specialist', { company: 'MarketingCo' }),
  ]);

  assert.strictEqual(ranked.length, 2);
  assert.strictEqual(ranked[0].job.company, 'StackCo');
  assert.strictEqual(ranked[1].job.company, 'CloudCo');
  assert.ok(ranked[0].score > ranked[1].score);
  assert.strictEqual(ranked[0].qualification.accepted, true);
});

test('ranking uses deterministic tie breakers', () => {
  const jobs = [
    makeJob('Backend Engineer', { company: 'ZuluCo' }),
    makeJob('Backend Engineer', { company: 'AlphaCo' }),
  ];

  const first = rankJobs(jobs);
  const second = rankJobs([...jobs].reverse());

  assert.deepStrictEqual(
    first.map((entry) => entry.job.company),
    ['AlphaCo', 'ZuluCo'],
  );
  assert.deepStrictEqual(
    first.map((entry) => entry.job.company),
    second.map((entry) => entry.job.company),
  );
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);