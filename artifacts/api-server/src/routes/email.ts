import { Router, type IRouter, type Request } from "express";
import { EmailEngine } from "../email-engine/engine";
import { EmailOAuthService } from "../email-engine/oauth";
import { GmailProvider, ProviderRegistry } from "../email-engine/providers";
import { getDefaultEmailEngineStore } from "../email-engine/default-store";
import { safeConnectionMetadata } from "../email-engine/store";
import { tokenVaultFromEnvironment } from "../email-engine/token-vault";

const router: IRouter = Router();
const providers = new ProviderRegistry([new GmailProvider()]);
let contextPromise:
  | Promise<{ store: Awaited<ReturnType<typeof getDefaultEmailEngineStore>>; oauth: EmailOAuthService }>
  | undefined;

function getContext() {
  contextPromise ??= (async () => {
    const store = await getDefaultEmailEngineStore();
    return {
      store,
      oauth: new EmailOAuthService(providers, store, tokenVaultFromEnvironment()),
    };
  })();
  return contextPromise;
}

function userIdFromRequest(request: Request): string {
  const header = request.header("x-user-id");
  const query = request.query.user_id;
  const userId = header ?? (typeof query === "string" ? query : undefined);
  if (!userId) throw new Error("A user context is required");
  return userId;
}

router.get("/email/oauth/connect", async (request, response) => {
  try {
    const provider = String(request.query.provider ?? "gmail");
    const redirectUri = String(request.query.redirect_uri ?? "");
    if (!redirectUri) return response.status(400).json({ error: "redirect_uri is required" });
    const result = (await getContext()).oauth.begin({
      userId: userIdFromRequest(request),
      providerId: provider,
      redirectUri,
    });
    return response.json(result);
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/email/oauth/callback", async (request, response) => {
  try {
    const state = String(request.query.state ?? "");
    const code = String(request.query.code ?? "");
    if (!state || !code) return response.status(400).json({ error: "state and code are required" });
    const connection = await (await getContext()).oauth.callback({ state, code });
    return response.json({ connection: safeConnectionMetadata(connection) });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.get("/email/connections/status", async (request, response) => {
  try {
    const store = (await getContext()).store;
    const connections = await store.listConnections(userIdFromRequest(request));
    return response.json({ connections: connections.map(safeConnectionMetadata) });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.delete("/email/connections/:connectionId", async (request, response) => {
  try {
    const { oauth } = await getContext();
    const disconnected = await oauth.disconnect(
      userIdFromRequest(request),
      request.params.connectionId,
    );
    return response.status(disconnected ? 200 : 404).json({ disconnected });
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

router.post("/email/ingest", async (request, response) => {
  try {
    const { store, oauth } = await getContext();
    const userId = userIdFromRequest(request);
    const connectionId = String(request.body?.connection_id ?? "");
    if (!connectionId) return response.status(400).json({ error: "connection_id is required" });
    const connection = await store.getConnection(userId, connectionId);
    if (!connection) return response.status(404).json({ error: "Email connection not found" });
    const token = await oauth.getAccessToken(connection);
    const provider = providers.get(connection.provider);
    const engine = new EmailEngine(provider, store, token);
    const result = await engine.ingest({
      query: typeof request.body?.query === "string" ? request.body.query : undefined,
      limit: typeof request.body?.limit === "number" ? request.body.limit : undefined,
    });
    return response.json(result);
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;