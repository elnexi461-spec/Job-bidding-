import { createHash } from 'crypto';
import { JobInput, NormalizedJob } from './types.js';

const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'li_fat_id', 'mc_cid', 'mc_eid',
  'trk', 'trk_contact', 'trk_profile', 'trk_email',
];

function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    for (const param of TRACKING_PARAMS) {
      u.searchParams.delete(param);
    }
    return u.toString().replace(/\?$/, '');
  } catch {
    return url.trim();
  }
}

function normalizeUrl(url: string): string {
  let u = url.trim();
  u = stripTrackingParams(u);
  try {
    const parsed = new URL(u);
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return u;
  }
}

function simpleHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export function normalizeJob(input: JobInput): NormalizedJob {
  const title = (input.title || '').trim();
  const company = (input.company || '').trim();
  const location = (input.location || '').trim();
  const description = (input.description || '').trim();
  const url = normalizeUrl(input.url || '');
  const canonical_url = normalizeUrl(input.canonical_url || input.url || '');
  const external_id = (input.external_id || '').trim();
  const source = (input.source || '').trim().toLowerCase();
  const posted_date = input.posted_date || new Date().toISOString().split('T')[0];
  const salary_min = input.salary_min ?? null;
  const salary_max = input.salary_max ?? null;
  const currency = (input.currency || 'USD').trim().toUpperCase();
  const remote_type = (input.remote_type || '').trim().toLowerCase();

  const hashInput = `${title.toLowerCase()}|${company.toLowerCase()}|${description.toLowerCase()}`;
  const content_hash = simpleHash(hashInput);

  return {
    title,
    company,
    location,
    description,
    url,
    canonical_url,
    external_id,
    source,
    posted_date,
    salary_min,
    salary_max,
    currency,
    remote_type,
    content_hash,
  };
}
