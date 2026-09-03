import { randomUUID } from "node:crypto";
import type {
  ApplicationSnapshot,
  EmailConnection,
  EmailEventRecord,
  EncryptedToken,
} from "./types";
import type {
  EmailEngineStore,
  EmailMessageRecord,
} from "./store";

interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

type ConnectionRow = Record<string, unknown> & {
  id: string;
  user_id: string;
  provider: string;
  email_address: string;
  provider_account_id: string;
  scopes: string[];
  token_expires_at: Date | null;
  access_token_ciphertext: string;
  access_token_iv: string;
  access_token_auth_tag: string;
  access_token_key_version: number;
  refresh_token_ciphertext: string | null;
  refresh_token_iv: string | null;
  refresh_token_auth_tag: string | null;
  refresh_token_key_version: number | null;
  status: "active" | "disconnected";
  connected_at: Date;
  updated_at: Date;
};

export async function ensureEmailEngineSchema(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      email_address TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      scopes TEXT[] NOT NULL,
      token_expires_at TIMESTAMPTZ,
      access_token_ciphertext TEXT NOT NULL,
      access_token_iv TEXT NOT NULL,
      access_token_auth_tag TEXT NOT NULL,
      access_token_key_version INTEGER NOT NULL,
      refresh_token_ciphertext TEXT,
      refresh_token_iv TEXT,
      refresh_token_auth_tag TEXT,
      refresh_token_key_version INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      connected_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (user_id, provider, provider_account_id)
    );
    CREATE TABLE IF NOT EXISTS email_messages (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_message_id TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (provider, provider_message_id)
    );
    CREATE TABLE IF NOT EXISTS application_email_events (
      id TEXT PRIMARY KEY,
      provider_message_id TEXT NOT NULL,
      application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      matching_reasons JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      dedupe_key TEXT NOT NULL UNIQUE
    );
  `);
}

export class PostgresEmailEngineStore implements EmailEngineStore {
  constructor(private readonly db: Queryable) {}

  async saveConnection(connection: EmailConnection): Promise<EmailConnection> {
    const result = await this.db.query<ConnectionRow>(
      `INSERT INTO email_connections (
        id, user_id, provider, email_address, provider_account_id, scopes,
        token_expires_at, access_token_ciphertext, access_token_iv,
        access_token_auth_tag, access_token_key_version, refresh_token_ciphertext,
        refresh_token_iv, refresh_token_auth_tag, refresh_token_key_version,
        status, connected_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (user_id, provider, provider_account_id) DO UPDATE SET
        email_address = EXCLUDED.email_address,
        scopes = EXCLUDED.scopes,
        token_expires_at = EXCLUDED.token_expires_at,
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        access_token_iv = EXCLUDED.access_token_iv,
        access_token_auth_tag = EXCLUDED.access_token_auth_tag,
        access_token_key_version = EXCLUDED.access_token_key_version,
        refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, email_connections.refresh_token_ciphertext),
        refresh_token_iv = COALESCE(EXCLUDED.refresh_token_iv, email_connections.refresh_token_iv),
        refresh_token_auth_tag = COALESCE(EXCLUDED.refresh_token_auth_tag, email_connections.refresh_token_auth_tag),
        refresh_token_key_version = COALESCE(EXCLUDED.refresh_token_key_version, email_connections.refresh_token_key_version),
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        connection.id,
        connection.userId,
        connection.provider,
        connection.emailAddress,
        connection.providerAccountId,
        connection.scopes,
        connection.tokenExpiresAt ?? null,
        connection.tokens.accessToken.ciphertext,
        connection.tokens.accessToken.iv,
        connection.tokens.accessToken.authTag,
        connection.tokens.accessToken.keyVersion,
        connection.tokens.refreshToken?.ciphertext ?? null,
        connection.tokens.refreshToken?.iv ?? null,
        connection.tokens.refreshToken?.authTag ?? null,
        connection.tokens.refreshToken?.keyVersion ?? null,
        connection.status,
        connection.connectedAt,
        connection.updatedAt,
      ],
    );
    return this.toConnection(result.rows[0]);
  }

  async getConnection(userId: string, connectionId: string) {
    const result = await this.db.query<ConnectionRow>(
      "SELECT * FROM email_connections WHERE user_id = $1 AND id = $2 AND status = 'active'",
      [userId, connectionId],
    );
    return result.rows[0] ? this.toConnection(result.rows[0]) : null;
  }

  async listConnections(userId: string) {
    const result = await this.db.query<ConnectionRow>(
      "SELECT * FROM email_connections WHERE user_id = $1 AND status = 'active' ORDER BY connected_at DESC",
      [userId],
    );
    return result.rows.map((row) => this.toConnection(row));
  }

  async updateConnectionTokens(
    connectionId: string,
    accessToken: EncryptedToken,
    refreshToken: EncryptedToken | undefined,
    tokenExpiresAt?: Date,
  ) {
    await this.db.query(
      `UPDATE email_connections SET
        access_token_ciphertext = $1, access_token_iv = $2,
        access_token_auth_tag = $3, access_token_key_version = $4,
        refresh_token_ciphertext = COALESCE($5, refresh_token_ciphertext),
        refresh_token_iv = COALESCE($6, refresh_token_iv),
        refresh_token_auth_tag = COALESCE($7, refresh_token_auth_tag),
        refresh_token_key_version = COALESCE($8, refresh_token_key_version),
        token_expires_at = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10`,
      [
        accessToken.ciphertext,
        accessToken.iv,
        accessToken.authTag,
        accessToken.keyVersion,
        refreshToken?.ciphertext ?? null,
        refreshToken?.iv ?? null,
        refreshToken?.authTag ?? null,
        refreshToken?.keyVersion ?? null,
        tokenExpiresAt ?? null,
        connectionId,
      ],
    );
  }

  async disconnectConnection(userId: string, connectionId: string) {
    const result = await this.db.query(
      "UPDATE email_connections SET status = 'disconnected', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id = $2 AND status = 'active' RETURNING id",
      [userId, connectionId],
    );
    return result.rows.length > 0;
  }

  async insertMessage(message: EmailMessageRecord) {
    const result = await this.db.query(
      `INSERT INTO email_messages (provider, provider_message_id, received_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, provider_message_id) DO NOTHING
       RETURNING id`,
      [message.provider, message.providerMessageId, message.receivedAt],
    );
    return result.rows.length > 0;
  }

  async listApplications(): Promise<ApplicationSnapshot[]> {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT a.id, j.company, j.title AS role, j.canonical_url,
              j.external_id, a.applied_at
       FROM applications a
       LEFT JOIN jobs j ON j.id = a.job_id
       ORDER BY a.id ASC`,
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      company: String(row.company ?? ""),
      role: String(row.role ?? ""),
      canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
      externalId: row.external_id ? String(row.external_id) : null,
      appliedAt: row.applied_at ? new Date(String(row.applied_at)) : null,
    }));
  }

  async insertEvent(input: Omit<EmailEventRecord, "id" | "createdAt">) {
    const id = randomUUID();
    const dedupeKey = [
      input.providerMessageId,
      input.eventType,
      input.applicationId ?? "unmatched",
    ].join(":");
    const result = await this.db.query<Record<string, unknown>>(
      `INSERT INTO application_email_events (
        id, provider_message_id, application_id, event_type, status,
        matching_reasons, received_at, dedupe_key
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING *`,
      [
        id,
        input.providerMessageId,
        input.applicationId,
        input.eventType,
        input.status,
        JSON.stringify(input.matchingReasons),
        input.receivedAt,
        dedupeKey,
      ],
    );
    if (result.rows.length === 0) {
      const existing = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM application_email_events WHERE dedupe_key = $1",
        [dedupeKey],
      );
      return { event: this.toEvent(existing.rows[0]), duplicate: true };
    }
    return { event: this.toEvent(result.rows[0]), duplicate: false };
  }

  private toConnection(row: ConnectionRow): EmailConnection {
    return {
      id: row.id,
      userId: row.user_id,
      provider: row.provider,
      emailAddress: row.email_address,
      providerAccountId: row.provider_account_id,
      scopes: row.scopes,
      tokenExpiresAt: row.token_expires_at ?? undefined,
      tokens: {
        accessToken: this.encrypted(
          row.access_token_ciphertext,
          row.access_token_iv,
          row.access_token_auth_tag,
          row.access_token_key_version,
        ),
        refreshToken:
          row.refresh_token_ciphertext &&
          row.refresh_token_iv &&
          row.refresh_token_auth_tag &&
          row.refresh_token_key_version
            ? this.encrypted(
                row.refresh_token_ciphertext,
                row.refresh_token_iv,
                row.refresh_token_auth_tag,
                row.refresh_token_key_version,
              )
            : undefined,
      },
      status: row.status,
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
    };
  }

  private encrypted(
    ciphertext: string,
    iv: string,
    authTag: string,
    keyVersion: number,
  ): EncryptedToken {
    return { ciphertext, iv, authTag, keyVersion };
  }

  private toEvent(row: Record<string, unknown>): EmailEventRecord {
    return {
      id: String(row.id),
      providerMessageId: String(row.provider_message_id),
      applicationId: row.application_id == null ? null : Number(row.application_id),
      eventType: row.event_type as EmailEventRecord["eventType"],
      status: row.status as EmailEventRecord["status"],
      matchingReasons: Array.isArray(row.matching_reasons)
        ? (row.matching_reasons as string[])
        : JSON.parse(String(row.matching_reasons)),
      receivedAt: new Date(String(row.received_at)),
      createdAt: new Date(String(row.created_at)),
    };
  }
}