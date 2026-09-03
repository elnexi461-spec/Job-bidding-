import type {
  ApplicationMatch,
  ApplicationSnapshot,
  IncomingEmail,
} from "./types";
import { searchableEmailText } from "./detection";

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalized(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function senderAddress(value: string): string {
  const match = value.match(/<([^>]+)>/) ?? value.match(/([^\s<]+@[^\s>]+)/);
  return (match?.[1] ?? value).toLowerCase();
}

function senderDomain(value: string): string {
  return senderAddress(value).split("@")[1] ?? "";
}

function includesValue(text: string, value?: string | null): boolean {
  return Boolean(value && normalized(text).includes(normalized(value)));
}

export function matchEmailToApplication(
  email: IncomingEmail,
  applications: ApplicationSnapshot[],
): ApplicationMatch {
  const text = searchableEmailText(email).toLowerCase();
  const domain = senderDomain(email.from);
  const candidates = applications.map((application) => {
    let score = 0;
    const reasons: string[] = [];

    if (includesValue(text, application.externalId)) {
      score += 100;
      reasons.push(`application identifier matched: ${application.externalId}`);
    }
    if (includesValue(text, application.canonicalUrl)) {
      score += 90;
      reasons.push("application URL matched");
    }
    if (includesValue(text, application.company)) {
      score += 50;
      reasons.push(`company matched: ${application.company}`);
    }

    const roleTokens = tokens(application.role);
    const matchedRoleTokens = roleTokens.filter((token) => text.includes(token));
    if (roleTokens.length > 0 && matchedRoleTokens.length >= Math.ceil(roleTokens.length / 2)) {
      score += 30;
      reasons.push(`role matched: ${application.role}`);
    }

    const companyTokens = tokens(application.company);
    if (companyTokens.some((token) => domain.includes(token))) {
      score += 20;
      reasons.push(`sender domain matched company: ${domain}`);
    }

    return { application, score, reasons };
  });

  candidates.sort(
    (left, right) => right.score - left.score || left.application.id - right.application.id,
  );
  const best = candidates[0];
  if (!best || best.score < 30) {
    return {
      applicationId: null,
      score: best?.score ?? 0,
      reasons: ["No application met the deterministic matching threshold"],
    };
  }
  return {
    applicationId: best.application.id,
    score: best.score,
    reasons: best.reasons.concat(`deterministic match score: ${best.score}`),
  };
}