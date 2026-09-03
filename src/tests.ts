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

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
