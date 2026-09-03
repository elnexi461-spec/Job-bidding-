export type EmailProviderId = "gmail" | (string & {});

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  tokenType?: string;
}

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export interface EncryptedTokenBundle {
  accessToken: EncryptedToken;
  refreshToken?: EncryptedToken;
}

export interface EmailConnection {
  id: string;
  userId: string;
  provider: EmailProviderId;
  emailAddress: string;
  providerAccountId: string;
  scopes: string[];
  tokenExpiresAt?: Date;
  tokens: EncryptedTokenBundle;
  status: "active" | "disconnected";
  connectedAt: Date;
  updatedAt: Date;
}

export interface ProviderMessageSummary {
  providerMessageId: string;
  threadId?: string;
  receivedAt?: Date;
}

export interface IncomingEmail {
  providerMessageId: string;
  threadId?: string;
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
  headers?: Record<string, string>;
}

export interface EmailProvider {
  readonly id: EmailProviderId;
  readonly requiredScopes: readonly string[];
  getAuthorizationUrl(input: {
    state: string;
    redirectUri: string;
  }): string;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet>;
  getConnectionMetadata(accessToken: string): Promise<{
    emailAddress: string;
    providerAccountId: string;
  }>;
  listMessages(
    accessToken: string,
    input: { query: string; limit: number },
  ): Promise<ProviderMessageSummary[]>;
  getMessage(accessToken: string, providerMessageId: string): Promise<IncomingEmail>;
}

export interface ApplicationSnapshot {
  id: number;
  company: string;
  role: string;
  canonicalUrl?: string | null;
  externalId?: string | null;
  appliedAt?: Date | null;
}

export type DetectedEmailEventType = "response" | "interview";

export interface DetectedEmailEvent {
  type: DetectedEmailEventType;
  status: "response_detected" | "interview_detected";
  reasons: string[];
}

export interface ApplicationMatch {
  applicationId: number | null;
  score: number;
  reasons: string[];
}

export interface EmailEventRecord {
  id: string;
  providerMessageId: string;
  applicationId: number | null;
  eventType: DetectedEmailEventType;
  status: DetectedEmailEvent["status"];
  matchingReasons: string[];
  receivedAt: Date;
  createdAt: Date;
}