import { JobInput } from '../types.js';
import { SourceConfig, FetchFn } from './types.js';
import { fetchGreenhouse } from './greenhouse.js';
import { fetchLever } from './lever.js';

export type { SourceConfig, FetchFn } from './types.js';

export async function fetchJobs(
  config: SourceConfig,
  fetchFn: FetchFn = fetch,
): Promise<JobInput[]> {
  switch (config.type) {
    case 'greenhouse':
      return fetchGreenhouse(config, fetchFn);
    case 'lever':
      return fetchLever(config, fetchFn);
    default:
      throw new Error(`Unknown source type: ${(config as SourceConfig).type}`);
  }
}
