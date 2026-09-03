import type { DetectedEmailEvent, IncomingEmail } from "./types";

const JOB_MARKERS = [
  "application",
  "candidate",
  "recruiter",
  "recruitment",
  "hiring",
  "job",
  "position",
  "role",
  "interview",
  "careers",
  "talent",
];

const INTERVIEW_MARKERS = [
  "interview",
  "phone screen",
  "video call",
  "technical screen",
  "technical interview",
  "schedule a call",
  "schedule your call",
  "meet with",
  "calendar invite",
];

const RESPONSE_MARKERS = [
  "thank you for applying",
  "application received",
  "application update",
  "application status",
  "moving forward",
  "next steps",
  "not selected",
  "unfortunately",
  "we regret",
  "offer",
  "candidacy",
  "position has been filled",
  "reviewing your application",
];

function containsMarker(text: string, markers: string[]): string | undefined {
  const lowerText = text.toLowerCase();
  return markers.find((marker) => lowerText.includes(marker));
}

export function searchableEmailText(email: Pick<IncomingEmail, "subject" | "bodyText">) {
  return `${email.subject}\n${email.bodyText}`.replace(/\s+/g, " ").trim();
}

export function detectEmailEvent(email: IncomingEmail): DetectedEmailEvent | null {
  const text = searchableEmailText(email);
  const jobMarker = containsMarker(text, JOB_MARKERS);
  if (!jobMarker) return null;

  const interviewMarker = containsMarker(text, INTERVIEW_MARKERS);
  if (interviewMarker) {
    return {
      type: "interview",
      status: "interview_detected",
      reasons: [
        `Interview signal detected: "${interviewMarker}"`,
        `Job context detected: "${jobMarker}"`,
      ],
    };
  }

  const responseMarker = containsMarker(text, RESPONSE_MARKERS);
  if (!responseMarker) return null;
  return {
    type: "response",
    status: "response_detected",
    reasons: [
      `Application response signal detected: "${responseMarker}"`,
      `Job context detected: "${jobMarker}"`,
    ],
  };
}