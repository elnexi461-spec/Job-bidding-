import { JobInput } from '../types.js';
import { SourceConfig, FetchFn } from './types.js';

interface LeverPosting {
  id?: string;
  text?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
  };
  hostedUrl?: string;
  applyUrl?: string;
  description?: string;
  createdAt?: number; // Unix timestamp in milliseconds
}

function inferRemoteType(title: string, location: string): string {
  const text = `${title} ${location}`.toLowerCase();
  if (text.includes('remote')) return 'remote';
  if (text.includes('hybrid')) return 'hybrid';
  return '';
}

export async function fetchLever(
  config: SourceConfig,
  fetchFn: FetchFn = fetch,
): Promise<JobInput[]> {
  const site = config.site || config.name.toLowerCase().replace(/\s+/g, '');
  const url = `https://api.lever.co/v0/postings/${site}?mode=json`;

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (err) {
    throw new Error(
      `Lever network error for ${config.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Lever HTTP ${response.status} for ${config.name}: ${response.statusText}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Lever: invalid JSON from ${config.name}`);
  }

  if (!Array.isArray(data)) {
    throw new Error(`Lever: unexpected response structure from ${config.name}`);
  }

  const postings = data as LeverPosting[];
  const results: JobInput[] = [];

  for (const posting of postings) {
    if (!posting.id || !posting.text) {
      continue; // skip entries missing required fields
    }

    const location = posting.categories?.location || '';
    const postedDate = posting.createdAt
      ? new Date(posting.createdAt).toISOString().split('T')[0]
      : undefined;

    results.push({
      title: posting.text,
      company: config.name,
      location,
      description: posting.description || '',
      url: posting.hostedUrl || posting.applyUrl || '',
      canonical_url: posting.hostedUrl || posting.applyUrl || '',
      external_id: posting.id,
      source: 'lever',
      posted_date: postedDate,
      remote_type: inferRemoteType(posting.text, location),
    });
  }

  return results;
}
