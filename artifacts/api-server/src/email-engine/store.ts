import { randomUUID } from "node:crypto";
import type {
  ApplicationSnapshot,
  EmailConnection,
  EmailEventRecord,
  IncomingEmail,
} from "./types";

export interface EmailMessageRecord {
  provider: string;
  providerMessageId: string;
  receivedAt: Date;
}

export interface EmailEngineStore {
  saveConnection(connection: EmailConnection): Promise<EmailConnection>;
  getConnection(userId: string, connectionId: string): Promise<EmailConnection | null>;
  listConnections(userId: string): Promise<EmailConnection[]>;
  updateConnectionTokens(
    connectionId: string,
    accessToken: EmailConnection["tokens"]["accessToken"],
    refreshToken: EmailConnection["tokens"]["refreshToken"],
    tokenExpiresAt?: Date,
  ): Promise<void>;
  disconnectConnection(userId: string, connectionId: string): Promise<boolean>;
  insertMessage(message: EmailMessageRecord): Promise<boolean>;
  listApplications(): Promise<ApplicationSnapshot[]>;
  insertEvent(input: Omit<EmailEventRecord, "id" | "createdAt">): Promise<{
    event: EmailEventRecord;
    duplicate: boolean;
  }>;
}

export interface OAuthState {
  state: string;
  userId: string;
  provider: string;
  redirectUri: string;
  expiresAt: Date;
}

export interface OAuthStateStore {
  save(state: OAuthState): void;
  consume(state: string): OAuthState | null;
}

export class MemoryOAuthStateStore implements OAuthStateStore {
  private readonly states = new Map<string, OAuthState>();

  save(state: OAuthState): void {
    this.states.set(state.state, state);
  }

  consume(state: string): OAuthState | null {
    const saved = this.states.get(state);
    this.states.delete(state);
    if (!saved || saved.expiresAt.getTime() < Date.now()) return null;
    return saved;
  }
}

export class InMemoryEmailEngineStore implements EmailEngineStore {
  readonly connections: EmailConnection[] = [];
  readonly messages: EmailMessageRecord[] = [];
  readonly events: EmailEventRecord[] = [];
  applications: ApplicationSnapshot[] = [];

  async saveConnection(connection: EmailConnection): Promise<EmailConnection> {
    const index = this.connections.findIndex((item) => item.id === connection.id);
    if (index === -1) this.connections.push(connection);
    else this.connections[index] = connection;
    return connection;
  }

  async getConnection(userId: string, connectionId: string) {
    return (
      this.connections.find(
        (connection) =>
          connection.userId === userId &&
          connection.id === connectionId &&
          connection.status === "active",
      ) ?? null
    );
  }

  async listConnections(userId: string) {
    return this.connections.filter(
      (connection) => connection.userId === userId && connection.status === "active",
    );
  }

  async updateConnectionTokens(
    connectionId: string,
    accessToken: EmailConnection["tokens"]["accessToken"],
    refreshToken: EmailConnection["tokens"]["refreshToken"],
    tokenExpiresAt?: Date,
  ): Promise<void> {
    const connection = this.connections.find((item) => item.id === connectionId);
    if (!connection) throw new Error("Email connection not found");
    connection.tokens = { accessToken, refreshToken };
    connection.tokenExpiresAt = tokenExpiresAt;
    connection.updatedAt = new Date();
  }

  async disconnectConnection(userId: string, connectionId: string): Promise<boolean> {
    const connection = this.connections.find(
      (item) => item.userId === userId && item.id === connectionId,
    );
    if (!connection) return false;
    connection.status = "disconnected";
    connection.updatedAt = new Date();
    return true;
  }

  async insertMessage(message: EmailMessageRecord): Promise<boolean> {
    if (
      this.messages.some(
        (item) =>
          item.provider === message.provider &&
          item.providerMessageId === message.providerMessageId,
      )
    ) {
      return false;
    }
    this.messages.push(message);
    return true;
  }

  async listApplications() {
    return this.applications;
  }

  async insertEvent(input: Omit<EmailEventRecord, "id" | "createdAt">) {
    const duplicate = this.events.find(
      (event) =>
        event.providerMessageId === input.providerMessageId &&
        event.eventType === input.eventType &&
        event.applicationId === input.applicationId,
    );
    if (duplicate) return { event: duplicate, duplicate: true };
    const event: EmailEventRecord = {
      ...input,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.events.push(event);
    return { event, duplicate: false };
  }
}

export function safeConnectionMetadata(connection: EmailConnection) {
  return {
    id: connection.id,
    userId: connection.userId,
    provider: connection.provider,
    emailAddress: connection.emailAddress,
    providerAccountId: connection.providerAccountId,
    scopes: connection.scopes,
    tokenExpiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
    status: connection.status,
    connectedAt: connection.connectedAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function messageRecordFromEmail(
  provider: string,
  email: IncomingEmail,
): EmailMessageRecord {
  return {
    provider,
    providerMessageId: email.providerMessageId,
    receivedAt: email.receivedAt,
  };
}