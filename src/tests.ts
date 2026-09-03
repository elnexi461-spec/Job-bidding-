import assert from 'assert';
import { filterJob } from './filter.js';
import { normalizeJob } from './normalize.js';
import { JobInput } from './types.js';

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

console.log('\nRunning tests...\n');

// 1. Valid fully remote Backend Engineer accepted
test('Remote Backend Engineer is accepted', () => {
  const job: JobInput = {
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    source: 'linkedin',
    remote_type: 'remote',
    location: 'Remote',
  };
  const result = filterJob(job);
  assert.strictEqual(result.accepted, true);
  assert.ok(result.reason.includes('Backend Engineer'));
});

// 2. Engineering Manager title is rejected
test('Engineering Manager title is rejected', () => {
  const job: JobInput = {
    title: 'Engineering Manager',
    company: 'BigTech',
    source: 'indeed',
    remote_type: 'remote',
  };
  const result = filterJob(job);
  assert.strictEqual(result.accepted, false);
  assert.ok(result.reason.includes('Manager'));
});

// 3. Onsite job is rejected
test('Onsite job is rejected', () => {
  const job: JobInput = {
    title: 'Full Stack Developer',
    company: 'LocalShop',
    source: 'linkedin',
    remote_type: 'onsite',
    location: 'New York, NY',
  };
  const result = filterJob(job);
  assert.strictEqual(result.accepted, false);
  assert.strictEqual(result.reason, 'Not a remote job');
});

// 4. Hybrid job is rejected (fully remote only)
test('Hybrid job is rejected', () => {
  const job: JobInput = {
    title: 'Frontend Developer',
    company: 'MixedMode',
    source: 'linkedin',
    remote_type: 'hybrid',
    location: 'San Francisco, CA (Hybrid)',
  };
  const result = filterJob(job);
  assert.strictEqual(result.accepted, false);
  assert.strictEqual(result.reason, 'Not a remote job');
});

// 5. Designer title is rejected
test('Designer title is rejected', () => {
  const job: JobInput = {
    title: 'Remote UX Designer',
    company: 'DesignCo',
    source: 'indeed',
    remote_type: 'remote',
  };
  const result = filterJob(job);
  assert.strictEqual(result.accepted, false);
  assert.ok(result.reason.includes('Designer'));
});

// 6. Backend Engineer mentioning "Manager" in description is accepted
test('Backend Engineer with Manager in description is accepted', () => {
  const job: JobInput = {
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    source: 'linkedin',
    remote_type: 'remote',
    location: 'Remote',
    description: 'You will work closely with an Engineering Manager.',
  };
  const result = filterJob(job);
  assert.strictEqual(result.accepted, true);
  assert.ok(result.reason.includes('Backend Engineer'));
});

// 7. URL normalization removes tracking params
test('URL normalization strips tracking params', () => {
  const job: JobInput = {
    title: 'React Developer',
    company: 'Startup',
    source: 'linkedin',
    remote_type: 'remote',
    url: 'https://example.com/jobs/123?utm_source=linkedin&fbclid=abc123',
  };
  const norm = normalizeJob(job);
  assert.strictEqual(norm.url, 'https://example.com/jobs/123');
  assert.ok(!norm.url.includes('utm_source'));
  assert.ok(!norm.url.includes('fbclid'));
});

// 8. Content hash is created
test('Content hash is created from normalized fields', () => {
  const job: JobInput = {
    title: 'Python Developer',
    company: 'DataCo',
    source: 'indeed',
    remote_type: 'remote',
    description: 'Build APIs with Python',
  };
  const norm = normalizeJob(job);
  assert.ok(norm.content_hash.length > 0);
  assert.strictEqual(norm.content_hash.length, 16);
});

// 9. canonical_url falls back to url
test('canonical_url falls back to url when not provided', () => {
  const job: JobInput = {
    title: 'Go Developer',
    company: 'CloudCo',
    source: 'linkedin',
    remote_type: 'remote',
    url: 'https://jobs.cloudco.com/go-dev',
  };
  const norm = normalizeJob(job);
  assert.strictEqual(norm.canonical_url, 'https://jobs.cloudco.com/go-dev');
});

// 10. Qualification accepts fully remote software roles
test('Fully remote Software Engineer qualifies', () => {
  const result = filterJob({
    title: 'Senior Software Engineer',
    company: 'SoftwareCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
  });
  assert.deepStrictEqual(result, {
    accepted: true,
    reason: 'Good match: Software Engineer',
  });
});

// 11. Hybrid jobs are rejected even if another field mentions remote
test('Hybrid job is rejected as not fully remote', () => {
  const result = filterJob({
    title: 'Backend Engineer',
    company: 'HybridCo',
    source: 'manual',
    remote_type: 'hybrid',
    location: 'Remote and hybrid',
  });
  assert.deepStrictEqual(result, {
    accepted: false,
    reason: 'Not a remote job',
  });
});

// 12. Onsite jobs are rejected
test('Onsite job is rejected by qualification', () => {
  const result = filterJob({
    title: 'Cloud Engineer',
    company: 'OnsiteCo',
    source: 'manual',
    remote_type: 'onsite',
    location: 'New York, NY',
  });
  assert.strictEqual(result.accepted, false);
  assert.strictEqual(result.reason, 'Not a remote job');
});

// 13. Non-IT jobs are rejected
test('Non-IT role is rejected', () => {
  const result = filterJob({
    title: 'Remote Marketing Specialist',
    company: 'MarketingCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
  });
  assert.deepStrictEqual(result, {
    accepted: false,
    reason: 'Not a Software & IT role',
  });
});

// 14. Leadership roles are rejected
test('Manager role is rejected', () => {
  const result = filterJob({
    title: 'Remote Software Engineering Manager',
    company: 'LeadershipCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
  });
  assert.strictEqual(result.accepted, false);
  assert.strictEqual(result.reason, 'Excluded role: Manager');
});

test('Architect role is rejected', () => {
  const result = filterJob({
    title: 'Remote Solutions Architect',
    company: 'ArchitectureCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
  });
  assert.strictEqual(result.accepted, false);
  assert.strictEqual(result.reason, 'Excluded role: Architect');
});

test('Designer role is rejected', () => {
  const result = filterJob({
    title: 'Remote Product Designer',
    company: 'DesignCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
  });
  assert.strictEqual(result.accepted, false);
  assert.strictEqual(result.reason, 'Excluded role: Designer');
});

// 15. Preferred software roles qualify
test('Python, Go, Cloud, Backend, and Frontend roles qualify', () => {
  const roles = [
    'Remote Python Developer',
    'Remote Go Developer',
    'Remote Cloud Engineer',
    'Remote Backend Engineer',
    'Remote Frontend Developer',
  ];

  for (const title of roles) {
    const result = filterJob({
      title,
      company: 'EngineeringCo',
      source: 'manual',
      remote_type: 'remote',
      location: 'Remote',
    });
    assert.strictEqual(result.accepted, true, title);
  }
});

// 16. Missing or ambiguous remote information is rejected
test('Missing remote information is rejected', () => {
  const result = filterJob({
    title: 'Backend Engineer',
    company: 'UnknownLocationCo',
    source: 'manual',
  });
  assert.deepStrictEqual(result, {
    accepted: false,
    reason: 'Not a remote job',
  });
});

test('Remote-friendly is not assumed to be fully remote', () => {
  const result = filterJob({
    title: 'Backend Engineer',
    company: 'FlexibleCo',
    source: 'manual',
    remote_type: 'remote-friendly',
    location: 'Remote-friendly',
  });
  assert.deepStrictEqual(result, {
    accepted: false,
    reason: 'Not a remote job',
  });
});

// 17. Qualification decisions are deterministic
test('Qualification result is deterministic', () => {
  const job: JobInput = {
    title: 'Remote Platform Engineer',
    company: 'DeterministicCo',
    source: 'manual',
    remote_type: 'remote',
    location: 'Remote',
    description: 'Build reliable developer infrastructure.',
  };
  assert.deepStrictEqual(filterJob(job), filterJob(job));
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
