import assert from "node:assert/strict";
import { EmailEngine } from "./email-engine/engine";
import { detectEmailEvent } from "./email-engine/detection";
import { matchEmailToApplication } from "./email-engine/matching";
import { EmailOAuthService } from "./email-engine/oauth";
import { GmailProvider, ProviderRegistry } from "./email-engine/providers";
import {
  InMemoryEmailEngineStore,
  MemoryOAuthStateStore,
} from "./email-engine/store";
import { TokenVault } from "./email-engine/token-vault";
import type {
  EmailProvider,
  IncomingEmail,
  OAuthTokenSet,
  ProviderMessageSummary,
} from "./email-engine/types";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`PASS: ${name}`);
    });
}

class FakeProvider implements EmailProvider {
  readonly id = "fake";
  readonly requiredScopes = ["mail.read"] as const;
  readonly refreshedTokens: string[] = [];
  messages = new Map<string, IncomingEmail>();

  getAuthorizationUrl(input: { state: string; redirectUri: string }) {
    return `https://fake.example/authorize?state=${input.state}&redirect_uri=${encodeURIComponent(input.redirectUri)}`;
  }

  async exchangeCode(): Promise<OAuthTokenSet> {
    return {
      accessToken: "access-token-secret",
      refreshToken: "refresh-token-secret",
      scopes: ["mail.read"],
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenSet> {
    this.refreshedTokens.push(refreshToken);
    return {
      accessToken: "refreshed-access-token",
      scopes: ["mail.read"],
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  async getConnectionMetadata() {
    return {
      emailAddress: "candidate@example.com",
      providerAccountId: "candidate@example.com",
    };
  }

  async listMessages(): Promise<ProviderMessageSummary[]> {
    return [...this.messages.values()].map((message) => ({
      providerMessageId: message.providerMessageId,
    }));
  }

  async getMessage(_accessToken: string, id: string) {
    const message = this.messages.get(id);
    if (!message) throw new Error("missing fake message");
    return message;
  }
}

function email(
  id: string,
  subject: string,
  bodyText: string,
  from = "recruiting@acme.example",
): IncomingEmail {
  return {
    providerMessageId: id,
    from,
    to: ["candidate@example.com"],
    subject,
    bodyText,
    receivedAt: new Date("2026-09-03T12:00:00Z"),
  };
}

async function run() {
  await test("provider abstraction registers a provider without engine changes", () => {
    const provider = new FakeProvider();
    assert.equal(new ProviderRegistry([provider]).get("fake"), provider);
    assert.throws(() => new ProviderRegistry([]).get("outlook"), /Unsupported email provider/);
  });

  await test("Gmail requests only readonly mail scope", () => {
    const provider = new GmailProvider("client-id", "client-secret");
    const url = new URL(
      provider.getAuthorizationUrl({ state: "state", redirectUri: "https://app/callback" }),
    );
    assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
    assert.equal(url.searchParams.get("access_type"), "offline");
  });

  await test("OAuth state is single-use and tokens are encrypted at rest", async () => {
    const provider = new FakeProvider();
    const store = new InMemoryEmailEngineStore();
    const vault = new TokenVault(Buffer.alloc(32, 7));
    const states = new MemoryOAuthStateStore();
    const oauth = new EmailOAuthService(
      new ProviderRegistry([provider]),
      store,
      vault,
      states,
    );
    const started = oauth.begin({
      userId: "user-1",
      providerId: "fake",
      redirectUri: "https://app/callback",
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state");
    assert.ok(state);
    const connection = await oauth.callback({ state, code: "one-time-code" });
    assert.equal(connection.emailAddress, "candidate@example.com");
    assert.equal(JSON.stringify(connection).includes("access-token-secret"), false);
    assert.equal(vault.decrypt(connection.tokens.accessToken), "access-token-secret");
    await assert.rejects(() => oauth.callback({ state, code: "replay" }), /Invalid or expired/);
  });

  await test("expired access tokens refresh through the provider", async () => {
    const provider = new FakeProvider();
    const store = new InMemoryEmailEngineStore();
    const vault = new TokenVault(Buffer.alloc(32, 8));
    const oauth = new EmailOAuthService(new ProviderRegistry([provider]), store, vault);
    const started = oauth.begin({
      userId: "user-2",
      providerId: "fake",
      redirectUri: "https://app/callback",
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    const connection = await oauth.callback({ state, code: "code" });
    connection.tokenExpiresAt = new Date(Date.now() - 1);
    await store.saveConnection(connection);
    assert.equal(await oauth.getAccessToken(connection), "refreshed-access-token");
    assert.deepEqual(provider.refreshedTokens, ["refresh-token-secret"]);
  });

  await test("response, interview, and unrelated email detection is deterministic", () => {
    assert.equal(
      detectEmailEvent(email("r", "Application update", "Thank you for applying to the Backend Engineer role.", "jobs@acme.example"))?.type,
      "response",
    );
    assert.equal(
      detectEmailEvent(email("i", "Interview invitation", "Please schedule your technical interview for the role."))?.type,
      "interview",
    );
    assert.equal(detectEmailEvent(email("x", "Weekend plans", "The job market is difficult to discuss.")), null);
  });

  await test("matching uses explainable signals and leaves weak matches unmatched", () => {
    const applications = [
      { id: 3, company: "Acme", role: "Backend Engineer", externalId: "APP-3" },
      { id: 8, company: "Other", role: "Frontend Developer", externalId: "APP-8" },
    ];
    const match = matchEmailToApplication(
      email("m", "Acme application update", "Your Backend Engineer application APP-3 is moving forward."),
      applications,
    );
    assert.equal(match.applicationId, 3);
    assert.ok(match.reasons.some((reason) => reason.includes("application identifier")));
    assert.equal(
      matchEmailToApplication(email("m2", "Application update", "We received your application."), applications)
        .applicationId,
      null,
    );
  });

  await test("ingestion links events, ignores unrelated mail, and deduplicates messages", async () => {
    const provider = new FakeProvider();
    provider.messages.set("r", email("r", "Application update", "Acme Backend Engineer APP-3 is moving forward."));
    provider.messages.set("i", email("i", "Interview invitation", "Schedule your technical interview for Acme Backend Engineer APP-3."));
    provider.messages.set("x", email("x", "Newsletter", "A job market newsletter with no application details.", "news@example.com"));
    const store = new InMemoryEmailEngineStore();
    store.applications = [{ id: 3, company: "Acme", role: "Backend Engineer", externalId: "APP-3" }];
    const engine = new EmailEngine(provider, store, "access-token");

    const first = await engine.ingest();
    assert.deepEqual(
      {
        fetched: first.fetched,
        newMessages: first.newMessages,
        ignored: first.ignored,
        detected: first.detected,
        matched: first.matched,
        unmatched: first.unmatched,
        duplicates: first.duplicates,
      },
      { fetched: 3, newMessages: 3, ignored: 1, detected: 2, matched: 2, unmatched: 0, duplicates: 0 },
    );
    assert.equal(store.events.length, 2);
    assert.ok(store.events.every((event) => event.applicationId === 3));

    const second = await engine.ingest();
    assert.equal(second.newMessages, 0);
    assert.equal(second.duplicates, 3);
    assert.equal(second.events.length, 0);
    assert.equal(store.events.length, 2);
  });

  await test("unmatched detected email is safely stored without an application link", async () => {
    const provider = new FakeProvider();
    provider.messages.set("u", email("u", "Application response", "Thank you for applying to a role at UnknownCo."));
    const store = new InMemoryEmailEngineStore();
    const result = await new EmailEngine(provider, store, "access-token").ingest();
    assert.equal(result.unmatched, 1);
    assert.equal(store.events[0]?.applicationId, null);
    assert.ok(store.events[0]?.matchingReasons.some((reason) => reason.includes("threshold")));
  });

  await test("duplicate application events are rejected deterministically", async () => {
    const store = new InMemoryEmailEngineStore();
    const input = {
      providerMessageId: "same-message",
      applicationId: 4,
      eventType: "response" as const,
      status: "response_detected" as const,
      matchingReasons: ["company matched"],
      receivedAt: new Date("2026-09-03T12:00:00Z"),
    };
    const first = await store.insertEvent(input);
    const second = await store.insertEvent(input);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(store.events.length, 1);
  });

  console.log(`\n${passed} email engine tests passed`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});