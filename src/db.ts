import { Pool, PoolClient } from 'pg';
import { config } from './config.js';

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

const SCHEMA_SQL = `
-- Jobs table: tracks scraped/added job postings
-- Duplicate detection uses three levels:
--   1. source + external_id (when external_id is present)
--   2. canonical_url (when available)
--   3. content_hash (fallback for jobs without stable URLs/IDs)
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  company VARCHAR(500) NOT NULL,
  location VARCHAR(500),
  description TEXT,
  url VARCHAR(2000) UNIQUE,
  canonical_url TEXT,
  external_id TEXT,
  content_hash TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  currency VARCHAR(10) DEFAULT 'USD',
  remote_type VARCHAR(50), -- 'remote', 'hybrid', 'onsite'
  source VARCHAR(100),     -- 'linkedin', 'indeed', 'manual', etc.
  posted_date DATE,
  scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique indexes for duplicate detection across sources.
-- Only enforce uniqueness when the identifying field is actually set.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_external_id
  ON jobs(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_canonical_url
  ON jobs(canonical_url)
  WHERE canonical_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_content_hash
  ON jobs(content_hash)
  WHERE content_hash IS NOT NULL;

-- Standard lookup indexes
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date ON jobs(posted_date);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);

-- Applications table: tracks jobs the user has applied to
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interviews table: tracks interview rounds for each application
CREATE TABLE IF NOT EXISTS interviews (
  id SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1,
  interview_type VARCHAR(50), -- 'phone', 'video', 'technical', 'onsite', 'final'
  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  outcome VARCHAR(50),          -- 'pending', 'passed', 'failed', 'no-show', 'rescheduled'
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily progress table: tracks daily job-search metrics
CREATE TABLE IF NOT EXISTS daily_progress (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  jobs_scraped INTEGER DEFAULT 0,
  jobs_applied INTEGER DEFAULT 0,
  applications_followed_up INTEGER DEFAULT 0,
  interviews_scheduled INTEGER DEFAULT 0,
  offers_received INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email accounts table: stores Gmail OAuth credentials (placeholder for now)
CREATE TABLE IF NOT EXISTS email_accounts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL DEFAULT 'gmail',
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Remaining indexes
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_daily_progress_date ON daily_progress(date);
`;

export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('Running database initialization...');
    await client.query(SCHEMA_SQL);
    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
