import assert from 'assert';
import { fetchJobs, SourceConfig } from './sources/index.js';

function mockFetch(response: unknown, status = 200): typeof fetch {
  return async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: async () => response,
      text: async () => JSON.stringify(response),
    } as unknown as Response);
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

console.log('\nRunning source adapter tests...\n');

// 1. Greenhouse maps jobs correctly
await test('Greenhouse adapter maps jobs correctly', async () => {
  const mockResponse = {
    jobs: [
      {
        id: 123,
        title: 'Backend Engineer',
        location: { name: 'Remote' },
        absolute_url: 'https://boards.greenhouse.io/testco/jobs/123',
        updated_at: '2024-01-15T10:00:00Z',
        content: 'Build APIs with Go.',
      },
    ],
  };

  const config: SourceConfig = {
    name: 'TestCo',
    type: 'greenhouse',
    boardToken: 'testco',
  };

  const jobs = await fetchJobs(config, mockFetch(mockResponse));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].title, 'Backend Engineer');
  assert.strictEqual(jobs[0].company, 'TestCo');
  assert.strictEqual(jobs[0].location, 'Remote');
  assert.strictEqual(jobs[0].url, 'https://boards.greenhouse.io/testco/jobs/123');
  assert.strictEqual(jobs[0].canonical_url, 'https://boards.greenhouse.io/testco/jobs/123');
  assert.strictEqual(jobs[0].external_id, '123');
  assert.strictEqual(jobs[0].source, 'greenhouse');
  assert.strictEqual(jobs[0].posted_date, '2024-01-15');
  assert.strictEqual(jobs[0].remote_type, 'remote');
});

// 2. Lever maps jobs correctly
await test('Lever adapter maps jobs correctly', async () => {
  const mockResponse = [
    {
      id: 'abc-456',
      text: 'Senior React Developer',
      categories: { location: 'Remote - US', team: 'Engineering' },
      hostedUrl: 'https://jobs.lever.co/testco/abc-456',
      description: 'Build React apps.',
      createdAt: 1705312800000,
    },
  ];

  const config: SourceConfig = {
    name: 'TestCo',
    type: 'lever',
    site: 'testco',
  };

  const jobs = await fetchJobs(config, mockFetch(mockResponse));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].title, 'Senior React Developer');
  assert.strictEqual(jobs[0].company, 'TestCo');
  assert.strictEqual(jobs[0].location, 'Remote - US');
  assert.strictEqual(jobs[0].url, 'https://jobs.lever.co/testco/abc-456');
  assert.strictEqual(jobs[0].canonical_url, 'https://jobs.lever.co/testco/abc-456');
  assert.strictEqual(jobs[0].external_id, 'abc-456');
  assert.strictEqual(jobs[0].source, 'lever');
  assert.strictEqual(jobs[0].posted_date, '2024-01-15');
  assert.strictEqual(jobs[0].remote_type, 'remote');
});

// 3. Empty results return empty array
await test('Empty Greenhouse response returns empty array', async () => {
  const config: SourceConfig = {
    name: 'EmptyCo',
    type: 'greenhouse',
    boardToken: 'emptyco',
  };

  const jobs = await fetchJobs(config, mockFetch({ jobs: [] }));
  assert.strictEqual(jobs.length, 0);
});

// 4. Empty Lever results return empty array
await test('Empty Lever response returns empty array', async () => {
  const config: SourceConfig = {
    name: 'EmptyCo',
    type: 'lever',
    site: 'emptyco',
  };

  const jobs = await fetchJobs(config, mockFetch([]));
  assert.strictEqual(jobs.length, 0);
});

// 5. HTTP 404 throws descriptive error
await test('HTTP 404 throws descriptive error', async () => {
  const config: SourceConfig = {
    name: 'FailCo',
    type: 'greenhouse',
    boardToken: 'failco',
  };

  try {
    await fetchJobs(config, mockFetch({}, 404));
    assert.fail('Should have thrown');
  } catch (err: any) {
    assert.ok(err.message.includes('404'));
    assert.ok(err.message.includes('FailCo'));
  }
});

// 6. Invalid JSON throws descriptive error
await test('Invalid JSON throws descriptive error', async () => {
  const badFetch = async () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        throw new Error('parse error');
      },
      text: async () => 'not json',
    } as unknown as Response);

  const config: SourceConfig = {
    name: 'BadJsonCo',
    type: 'greenhouse',
    boardToken: 'badjson',
  };

  try {
    await fetchJobs(config, badFetch);
    assert.fail('Should have thrown');
  } catch (err: any) {
    assert.ok(err.message.includes('invalid JSON'));
    assert.ok(err.message.includes('BadJsonCo'));
  }
});

// 7. Missing required fields are skipped
await test('Jobs missing title or id are skipped', async () => {
  const mockResponse = {
    jobs: [
      {
        id: 1,
        title: 'Valid Job',
        location: { name: 'Remote' },
        absolute_url: 'https://example.com/1',
      },
      {
        id: 2,
        location: { name: 'Remote' },
        absolute_url: 'https://example.com/2',
      }, // missing title
      {
        title: 'No ID',
        location: { name: 'Remote' },
        absolute_url: 'https://example.com/3',
      }, // missing id
    ],
  };

  const config: SourceConfig = {
    name: 'PartialCo',
    type: 'greenhouse',
    boardToken: 'partial',
  };

  const jobs = await fetchJobs(config, mockFetch(mockResponse));
  assert.strictEqual(jobs.length, 1);
  assert.strictEqual(jobs[0].title, 'Valid Job');
});

// 8. Network error throws descriptive error
await test('Network error throws descriptive error', async () => {
  const networkFail = async () => {
    throw new Error('ECONNREFUSED');
  };

  const config: SourceConfig = {
    name: 'NetFailCo',
    type: 'greenhouse',
    boardToken: 'netfail',
  };

  try {
    await fetchJobs(config, networkFail as any);
    assert.fail('Should have thrown');
  } catch (err: any) {
    assert.ok(err.message.includes('network error'));
    assert.ok(err.message.includes('NetFailCo'));
  }
});

// 9. Unexpected response structure throws
await test('Unexpected Greenhouse structure throws', async () => {
  const config: SourceConfig = {
    name: 'StructCo',
    type: 'greenhouse',
    boardToken: 'struct',
  };

  try {
    await fetchJobs(config, mockFetch({ data: 'wrong' }));
    assert.fail('Should have thrown');
  } catch (err: any) {
    assert.ok(err.message.includes('unexpected response structure'));
  }
});

// 10. Unexpected Lever structure throws
await test('Unexpected Lever structure throws', async () => {
  const config: SourceConfig = {
    name: 'StructCo',
    type: 'lever',
    site: 'struct',
  };

  try {
    await fetchJobs(config, mockFetch({ jobs: 'wrong' }));
    assert.fail('Should have thrown');
  } catch (err: any) {
    assert.ok(err.message.includes('unexpected response structure'));
  }
});

// 11. Greenhouse infers remote_type from title
await test('Greenhouse infers remote_type from title', async () => {
  const mockResponse = {
    jobs: [
      {
        id: 10,
        title: 'Hybrid Software Engineer',
        location: { name: 'New York' },
        absolute_url: 'https://example.com/10',
      },
    ],
  };

  const config: SourceConfig = {
    name: 'HybridCo',
    type: 'greenhouse',
    boardToken: 'hybridco',
  };

  const jobs = await fetchJobs(config, mockFetch(mockResponse));
  assert.strictEqual(jobs[0].remote_type, 'hybrid');
});

// 12. Lever infers remote_type from location
await test('Lever infers remote_type from location', async () => {
  const mockResponse = [
    {
      id: 'xyz',
      text: 'Frontend Developer',
      categories: { location: 'Remote Worldwide' },
      hostedUrl: 'https://example.com/xyz',
    },
  ];

  const config: SourceConfig = {
    name: 'RemoteCo',
    type: 'lever',
    site: 'remoteco',
  };

  const jobs = await fetchJobs(config, mockFetch(mockResponse));
  assert.strictEqual(jobs[0].remote_type, 'remote');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
