import type {
  EmailProvider,
  IncomingEmail,
  OAuthTokenSet,
  ProviderMessageSummary,
} from "./types";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
}

async function expectJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new Error(`Email provider request failed (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function decodeGmailBody(data?: string): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function findPlainText(part?: GmailMessagePart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeGmailBody(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const text = findPlainText(child);
    if (text) return text;
  }
  return "";
}

function headerMap(headers: Array<{ name: string; value: string }> = []) {
  return Object.fromEntries(
    headers.map((header) => [header.name.toLowerCase(), header.value]),
  );
}

export class GmailProvider implements EmailProvider {
  readonly id = "gmail" as const;
  readonly requiredScopes = [GMAIL_SCOPE] as const;

  constructor(
    private readonly clientId = process.env.GMAIL_CLIENT_ID,
    private readonly clientSecret = process.env.GMAIL_CLIENT_SECRET,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  getAuthorizationUrl(input: { state: string; redirectUri: string }): string {
    if (!this.clientId) throw new Error("GMAIL_CLIENT_ID is not configured");
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: this.requiredScopes.join(" "),
      state: input.state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<OAuthTokenSet> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Gmail OAuth credentials are not configured");
    }
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const body = await expectJson(response);
    return this.tokenSet(body);
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Gmail OAuth credentials are not configured");
    }
    const response = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "refresh_token",
      }),
    });
    const body = await expectJson(response);
    return this.tokenSet(body, [GMAIL_SCOPE]);
  }

  async getConnectionMetadata(accessToken: string) {
    const body = await expectJson(
      await this.fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    );
    return {
      emailAddress: String(body.emailAddress ?? ""),
      providerAccountId: String(body.emailAddress ?? ""),
    };
  }

  async listMessages(
    accessToken: string,
    input: { query: string; limit: number },
  ): Promise<ProviderMessageSummary[]> {
    const params = new URLSearchParams({
      maxResults: String(Math.min(Math.max(input.limit, 1), 100)),
      q: input.query,
    });
    const body = await expectJson(
      await this.fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ),
    );
    return ((body.messages ?? []) as Array<{ id: string; threadId?: string }>).map(
      (message) => ({
        providerMessageId: message.id,
        threadId: message.threadId,
      }),
    );
  }

  async getMessage(accessToken: string, providerMessageId: string): Promise<IncomingEmail> {
    const body = (await expectJson(
      await this.fetchImpl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(providerMessageId)}?format=full`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      ),
    )) as unknown as GmailMessage;
    const headers = headerMap(body.payload?.headers);
    const bodyText =
      decodeGmailBody(body.payload?.body?.data) ||
      findPlainText({
        mimeType: body.payload?.mimeType,
        body: body.payload?.body,
        parts: body.payload?.parts,
      });
    return {
      providerMessageId: body.id,
      threadId: body.threadId,
      from: headers.from ?? "",
      to: (headers.to ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      subject: headers.subject ?? "",
      bodyText,
      receivedAt: new Date(Number(body.internalDate ?? Date.now())),
      headers,
    };
  }

  private tokenSet(
    body: Record<string, unknown>,
    defaultScopes: string[] = [],
  ): OAuthTokenSet {
    const accessToken = String(body.access_token ?? "");
    if (!accessToken) throw new Error("Email provider did not return an access token");
    const expiresIn = Number(body.expires_in ?? 0);
    return {
      accessToken,
      refreshToken: body.refresh_token ? String(body.refresh_token) : undefined,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
      scopes: String(body.scope ?? "")
        .split(" ")
        .filter(Boolean)
        .concat(defaultScopes)
        .filter((scope, index, scopes) => scopes.indexOf(scope) === index),
      tokenType: body.token_type ? String(body.token_type) : undefined,
    };
  }
}

export class ProviderRegistry {
  private readonly providers = new Map<string, EmailProvider>();

  constructor(providers: EmailProvider[]) {
    for (const provider of providers) this.providers.set(provider.id, provider);
  }

  get(id: string): EmailProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unsupported email provider: ${id}`);
    return provider;
  }
}