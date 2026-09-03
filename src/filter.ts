import { JobInput, FilterResult } from './types.js';

const PREFERRED_KEYWORDS = [
  'Software Engineer',
  'Full Stack Developer',
  'Backend Engineer',
  'Frontend Developer',
  'Infrastructure Engineer',
  'Cloud Engineer',
  'Python Developer',
  'Go Developer',
  'Node.js Developer',
  'TypeScript Developer',
  'React Developer',
];

const EXCLUDE_KEYWORDS = [
  'Manager',
  'Architect',
  'Mentor',
  'Designer',
  'Director',
  'VP',
  'Head of',
];

function isRemote(job: JobInput): boolean {
  const rt = (job.remote_type || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();
  // Fully remote only. Hybrid and onsite are not accepted.
  return rt === 'remote' || loc.includes('remote');
}

function matchesPreferred(text: string): string | null {
  for (const kw of PREFERRED_KEYWORDS) {
    if (text.toLowerCase().includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

function matchesExcludeTitle(title: string): string | null {
  for (const kw of EXCLUDE_KEYWORDS) {
    if (title.toLowerCase().includes(kw.toLowerCase())) {
      return kw;
    }
  }
  return null;
}

export function filterJob(job: JobInput): FilterResult {
  const text = `${job.title} ${job.description || ''}`;

  if (!isRemote(job)) {
    return { accepted: false, reason: 'Not a remote job' };
  }

  // Excluded roles are checked against the title only,
  // so a Backend Engineer job mentioning "Manager" in the description is not rejected.
  const excludeMatch = matchesExcludeTitle(job.title);
  if (excludeMatch) {
    return { accepted: false, reason: `Excluded role: ${excludeMatch}` };
  }

  const preferredMatch = matchesPreferred(text);
  if (!preferredMatch) {
    return { accepted: false, reason: 'Not a Software & IT role' };
  }

  return { accepted: true, reason: `Good match: ${preferredMatch}` };
}
