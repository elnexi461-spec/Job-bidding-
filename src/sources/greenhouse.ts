import { JobInput } from '../types.js';
import { SourceConfig, FetchFn } from './types.js';

interface GreenhouseJob {
  id: number;
  title: string;
  location?: { name?: string };
  absolute_url?: string;
  updated_at?: string;
  content?: string;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

function inferRemoteType(title: string, location: string): string {
  const text = `${title} ${location}`.toLowerCase();
  if (text.includes('remote')) return 'remote';
  if (text.includes('hybrid')) return 'hybrid';
  return '';
}

export async function fetchGreenhouse(
  config: SourceConfig,
  fetchFn: FetchFn = fetch,
): Promise<JobInput[]> {
  const token = config.boardToken || config.name.toLowerCase().replace(/\s+/g, '');
  const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (err) {
    throw new Error(
      `Greenhouse network error for ${config.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Greenhouse HTTP ${response.status} for ${config.name}: ${response.statusText}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Greenhouse: invalid JSON from ${config.name}`);
  }

  if (!data || typeof data !== 'object' || !('jobs' in data)) {
    throw new Error(`Greenhouse: unexpected response structure from ${config.name}`);
  }

  const { jobs } = data as GreenhouseResponse;
  if (!Array.isArray(jobs)) {
    return [];
  }

  const results: JobInput[] = [];

  for (const job of jobs) {
    if (!job.id || !job.title) {
      continue; // skip entries missing required fields
    }

    const location = job.location?.name || '';

    results.push({
      title: job.title,
      company: config.name,
      location,
      description: job.content || '',
      url: job.absolute_url || '',
      canonical_url: job.absolute_url || '',
      external_id: String(job.id),
      source: 'greenhouse',
      posted_date: job.updated_at ? job.updated_at.split('T')[0] : undefined,
      remote_type: inferRemoteType(job.title, location),
    });
  }

  return results;
}
