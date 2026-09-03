import { fetchJobs, SourceConfig } from '../sources/index.js';
import { normalizeJob } from '../normalize.js';
import { filterJob } from '../filter.js';
import { upsertJob } from './repository.js';

export interface IngestResult {
  fetched: number;
  qualified: number;
  inserted: number;
  duplicates: number;
  rejected: number;
}

export async function ingestJobs(config: SourceConfig): Promise<IngestResult> {
  const rawJobs = await fetchJobs(config);

  let fetched = rawJobs.length;
  let qualified = 0;
  let inserted = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const raw of rawJobs) {
    const normalized = normalizeJob(raw);
    const filterResult = filterJob(normalized);

    if (!filterResult.accepted) {
      rejected++;
      continue;
    }

    qualified++;

    const result = await upsertJob(normalized);
    if (result.isNew) {
      inserted++;
    } else {
      duplicates++;
    }
  }

  return { fetched, qualified, inserted, duplicates, rejected };
}
