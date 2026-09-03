export interface JobInput {
  title: string;
  company: string;
  location?: string;
  description?: string;
  url?: string;
  canonical_url?: string;
  external_id?: string;
  source: string;
  posted_date?: string; // ISO date string
  salary_min?: number | null;
  salary_max?: number | null;
  currency?: string;
  remote_type?: string;
}

export interface FilterResult {
  accepted: boolean;
  reason: string;
}

export interface NormalizedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  canonical_url: string;
  external_id: string;
  source: string;
  posted_date: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  remote_type: string;
  content_hash: string;
}
