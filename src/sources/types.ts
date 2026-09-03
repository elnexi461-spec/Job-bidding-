export interface SourceConfig {
  name: string;
  type: 'greenhouse' | 'lever';
  boardToken?: string; // Greenhouse board token
  site?: string;       // Lever site slug
}

export type FetchFn = typeof fetch;
