import { JobInput, FilterResult } from './types.js';

export const PREFERRED_KEYWORDS = [
  'Software Engineer',
  'Software Developer',
  'Full Stack Developer',
  'Backend Engineer',
  'Frontend Developer',
  'Infrastructure Engineer',
  'Cloud Engineer',
  'DevOps Engineer',
  'Platform Engineer',
  'Site Reliability Engineer',
  'Data Engineer',
  'Security Engineer',
  'Python Developer',
  'Go Developer',
  'Node.js Developer',
  'TypeScript Developer',
  'React Developer',
];

const EXCLUDE_KEYWORDS = [
  'Manager',
  'Management',
  'Architect',
  'Mentor',
  'Designer',
  'Director',
  'VP',
  'Head of',
];

function isFullyRemote(job: JobInput): boolean {
  const rt = (job.remote_type || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();
  const remoteDetails = `${rt} ${loc}`;

  // Explicit hybrid, onsite, and remote-friendly language never qualifies.
  if (
    /\bhybrid\b|\bon[-\s]?site\b|\bin[-\s]?office\b/.test(remoteDetails) ||
    /\bremote[-\s]?friendly\b|\bremote[-\s]?optional\b|\bremote[-\s]?possible\b/.test(remoteDetails)
  ) {
    return false;
  }

  // An explicit remote_type is authoritative. Unknown values are not assumed
  // to mean fully remote.
  if (rt) {
    return rt === 'remote';
  }

  // With no remote_type, accept only an unambiguous remote location.
  return /\bremote\b/.test(loc);
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

  if (!isFullyRemote(job)) {
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
