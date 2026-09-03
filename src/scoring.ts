import { FilterResult, NormalizedJob } from './types.js';
import { filterJob, PREFERRED_KEYWORDS } from './filter.js';

export interface JobScore {
  score: number;
  reason: string;
}

export interface RankedJob {
  job: NormalizedJob;
  qualification: FilterResult;
  score: number;
  reason: string;
}

const ROLE_WEIGHTS: Record<string, number> = {
  'Full Stack Developer': 40,
  'Software Engineer': 38,
  'Backend Engineer': 36,
  'Frontend Developer': 36,
  'Software Developer': 36,
  'DevOps Engineer': 34,
  'Node.js Developer': 34,
  'Platform Engineer': 32,
  'Cloud Engineer': 32,
  'Go Developer': 32,
  'Python Developer': 32,
  'TypeScript Developer': 32,
  'React Developer': 30,
  'Infrastructure Engineer': 30,
  'Site Reliability Engineer': 30,
  'Security Engineer': 28,
  'Data Engineer': 26,
};

const WEAK_TITLE_MARKERS = [
  'support',
  'analyst',
  'consultant',
  'specialist',
];

function findRoleMatch(text: string): string | null {
  const lowerText = text.toLowerCase();
  return (
    PREFERRED_KEYWORDS.find((keyword) =>
      lowerText.includes(keyword.toLowerCase()),
    ) || null
  );
}

function getRoleWeight(role: string): number {
  return ROLE_WEIGHTS[role] || 20;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function scoreJob(
  job: NormalizedJob,
  qualification: FilterResult = filterJob(job),
): JobScore {
  if (!qualification.accepted) {
    return {
      score: 0,
      reason: `Not scored: ${qualification.reason}`,
    };
  }

  let score = 40;
  const reasons = ['Qualified for the target workflow'];
  const title = job.title.toLowerCase();
  const description = job.description.toLowerCase();
  const remoteType = job.remote_type.toLowerCase();

  if (remoteType === 'remote') {
    score += 20;
    reasons.push('explicitly fully remote');
  } else {
    score += 10;
    reasons.push('remote location without an explicit remote type');
  }

  const titleRole = findRoleMatch(title);
  const textRole = findRoleMatch(`${title} ${description}`);

  if (titleRole) {
    score += getRoleWeight(titleRole);
    reasons.push(`strong title match: ${titleRole}`);
  } else if (textRole) {
    score += 12;
    reasons.push(`weaker description match: ${textRole}`);
  }

  for (const marker of WEAK_TITLE_MARKERS) {
    if (title.includes(marker)) {
      score -= 8;
      reasons.push(`less relevant title marker: ${marker}`);
    }
  }

  return {
    score: clampScore(score),
    reason: reasons.join('; '),
  };
}

export function rankJobs(jobs: NormalizedJob[]): RankedJob[] {
  return jobs
    .map((job) => {
      const qualification = filterJob(job);
      if (!qualification.accepted) {
        return null;
      }

      const result = scoreJob(job, qualification);
      return {
        job,
        qualification,
        score: result.score,
        reason: result.reason,
      };
    })
    .filter((job): job is RankedJob => job !== null)
    .sort((left, right) => {
      return (
        right.score - left.score ||
        left.job.title.localeCompare(right.job.title) ||
        left.job.company.localeCompare(right.job.company) ||
        left.job.canonical_url.localeCompare(right.job.canonical_url) ||
        left.job.content_hash.localeCompare(right.job.content_hash)
      );
    });
}