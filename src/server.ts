import Fastify from 'fastify';
import { config } from './config.js';
import { pool, initDatabase } from './db.js';
import { ingestJobs } from './jobs/ingest.js';
import { countJobs } from './jobs/repository.js';
import { SourceConfig } from './sources/types.js';

const fastify = Fastify({
  logger: true,
});

// Health check endpoint
fastify.get('/health', async () => {
  try {
    const result = await pool.query('SELECT NOW() as time');
    return {
      status: 'ok',
      db: 'connected',
      dbTime: result.rows[0].time,
    };
  } catch (err) {
    fastify.log.error(err);
    return {
      status: 'degraded',
      db: 'disconnected',
      error: 'Database connection failed',
    };
  }
});

// Ingest jobs from a source
fastify.post('/jobs/ingest', async (request, reply) => {
  try {
    const body = request.body as Record<string, unknown>;

    if (!body.source || !body.company) {
      reply.status(400);
      return { error: 'Missing required fields: source, company' };
    }

    const sourceConfig: SourceConfig = {
      name: String(body.company),
      type: body.source as 'greenhouse' | 'lever',
      boardToken: body.token ? String(body.token) : undefined,
      site: body.token ? String(body.token) : undefined,
    };

    const result = await ingestJobs(sourceConfig);
    return result;
  } catch (err) {
    fastify.log.error(err);
    reply.status(500);
    return {
      error: 'Ingestion failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
});

// Count stored qualified jobs
fastify.get('/jobs/count', async () => {
  try {
    const count = await countJobs();
    return { count };
  } catch (err) {
    fastify.log.error(err);
    return { error: 'Failed to count jobs' };
  }
});

async function start() {
  try {
    await initDatabase();
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
