import { randomBytes } from "node:crypto";
import type {
  EmailConnection,
  EmailProvider,
  OAuthTokenSet,
} from "./types";
import {
  type EmailEngineStore,
  MemoryOAuthStateStore,
  type OAuthStateStore,
} from "./store";
import { TokenVault } from "./token-vault";

function connectionId() {
  return `email_${randomBytes(16).toString("hex")}`;
}

export class EmailOAuthService {
  constructor(
    private readonly providers: { get(id: string): EmailProvider },
    private readonly store: EmailEngineStore,
    private readonly vault: TokenVault,
    private readonly states: OAuthStateStore = new MemoryOAuthStateStore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  begin(input: {
    userId: string;
    providerId: string;
    redirectUri: string;
  }) {
    const provider = this.providers.get(input.providerId);
    const state = randomBytes(32).toString("base64url");
    this.states.save({
      state,
      userId: input.userId,
      provider: provider.id,
      redirectUri: input.redirectUri,
      expiresAt: new Date(this.now().getTime() + 10 * 60 * 1000),
    });
    return {
      provider: provider.id,
      authorizationUrl: provider.getAuthorizationUrl({
        state,
        redirectUri: input.redirectUri,
      }),
    };
  }

  async callback(input: { state: string; code: string }): Promise<EmailConnection> {
    const saved = this.states.consume(input.state);
    if (!saved) throw new Error("Invalid or expired OAuth state");
    const provider = this.providers.get(saved.provider);
    const tokenSet = await provider.exchangeCode({
      code: input.code,
      redirectUri: saved.redirectUri,
    });
    this.assertScopes(provider, tokenSet);
    const metadata = await provider.getConnectionMetadata(tokenSet.accessToken);
    if (!metadata.emailAddress || !metadata.providerAccountId) {
      throw new Error("Email provider returned incomplete account metadata");
    }
    const current = (await this.store.listConnections(saved.userId)).find(
      (connection) =>
        connection.provider === provider.id &&
        connection.providerAccountId === metadata.providerAccountId,
    );
    const connection: EmailConnection = {
      id: current?.id ?? connectionId(),
      userId: saved.userId,
      provider: provider.id,
      emailAddress: metadata.emailAddress,
      providerAccountId: metadata.providerAccountId,
      scopes: tokenSet.scopes,
      tokens: {
        accessToken: this.vault.encrypt(tokenSet.accessToken),
        refreshToken: tokenSet.refreshToken
          ? this.vault.encrypt(tokenSet.refreshToken)
          : current?.tokens.refreshToken,
      },
      tokenExpiresAt: tokenSet.expiresAt,
      status: "active",
      connectedAt: current?.connectedAt ?? this.now(),
      updatedAt: this.now(),
    };
    return this.store.saveConnection(connection);
  }

  async getAccessToken(connection: EmailConnection): Promise<string> {
    if (
      connection.tokenExpiresAt &&
      connection.tokenExpiresAt.getTime() <= this.now().getTime() + 60_000
    ) {
      if (!connection.tokens.refreshToken) {
        throw new Error("Email connection needs to be reconnected");
      }
      const provider = this.providers.get(connection.provider);
      const refreshToken = this.vault.decrypt(connection.tokens.refreshToken);
      const refreshed = await provider.refreshAccessToken(refreshToken);
      this.assertScopes(provider, refreshed);
      const accessToken = this.vault.encrypt(refreshed.accessToken);
      await this.store.updateConnectionTokens(
        connection.id,
        accessToken,
        connection.tokens.refreshToken,
        refreshed.expiresAt,
      );
      return refreshed.accessToken;
    }
    return this.vault.decrypt(connection.tokens.accessToken);
  }

  async disconnect(userId: string, connectionId: string) {
    return this.store.disconnectConnection(userId, connectionId);
  }

  private assertScopes(provider: EmailProvider, tokenSet: OAuthTokenSet) {
    const missing = provider.requiredScopes.filter(
      (scope) => !tokenSet.scopes.includes(scope),
    );
    if (missing.length > 0) {
      throw new Error(`OAuth grant is missing required email scopes: ${missing.join(", ")}`);
    }
  }
}