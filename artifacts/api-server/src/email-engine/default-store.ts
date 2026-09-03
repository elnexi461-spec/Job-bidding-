import type { EmailEngineStore } from "./store";
import { InMemoryEmailEngineStore } from "./store";
import { PostgresEmailEngineStore, ensureEmailEngineSchema } from "./postgres-store";

let storePromise: Promise<EmailEngineStore> | undefined;

export function getDefaultEmailEngineStore(): Promise<EmailEngineStore> {
  storePromise ??= createStore();
  return storePromise;
}

async function createStore(): Promise<EmailEngineStore> {
  if (process.env.EMAIL_ENGINE_STORE === "memory" || !process.env.DATABASE_URL) {
    return new InMemoryEmailEngineStore();
  }
  const { pool } = await import("@workspace/db");
  const store = new PostgresEmailEngineStore(pool);
  await ensureEmailEngineSchema(pool);
  return store;
}