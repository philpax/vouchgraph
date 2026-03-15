import {
  configureOAuth,
  createAuthorizationUrl,
  finalizeAuthorization,
  getSession,
  deleteStoredSession,
  OAuthUserAgent,
} from "@atcute/oauth-browser-client";
import type { Did, ActorIdentifier } from "@atcute/lexicons";
import {
  CompositeDidDocumentResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  XrpcHandleResolver,
} from "@atcute/identity-resolver";

const STORAGE_KEY = "vouchgraph_did";
const AUTH_VERSION_KEY = "vouchgraph_auth_version";
const AUTH_VERSION = 1;

export function initOAuth() {
  configureOAuth({
    metadata: {
      client_id: import.meta.env.VITE_OAUTH_CLIENT_ID,
      redirect_uri: import.meta.env.VITE_OAUTH_REDIRECT_URI,
    },
    identityResolver: new LocalActorResolver({
      handleResolver: new XrpcHandleResolver({
        serviceUrl: "https://public.api.bsky.app",
      }),
      didDocumentResolver: new CompositeDidDocumentResolver({
        methods: {
          plc: new PlcDidDocumentResolver(),
          web: new WebDidDocumentResolver(),
        },
      }),
    }),
  });
}

export async function startLogin(handle: string): Promise<void> {
  const authUrl = await createAuthorizationUrl({
    scope: import.meta.env.VITE_OAUTH_SCOPE,
    target: { type: "account", identifier: handle as ActorIdentifier },
  });
  window.location.assign(authUrl);
}

export async function handleCallback(): Promise<OAuthUserAgent | null> {
  // OAuth params may arrive in the query string or the hash fragment
  const params = new URLSearchParams(
    window.location.hash.slice(1) || window.location.search.slice(1),
  );
  if (!params.has("code") && !params.has("error")) {
    return null;
  }

  // Clean up the URL
  history.replaceState(null, "", window.location.pathname);

  if (params.has("error")) {
    throw new Error(
      `OAuth error: ${params.get("error")} - ${params.get("error_description")}`,
    );
  }

  const result = await finalizeAuthorization(params);
  const agent = new OAuthUserAgent(result.session);
  localStorage.setItem(STORAGE_KEY, agent.sub);
  localStorage.setItem(AUTH_VERSION_KEY, String(AUTH_VERSION));
  return agent;
}

export async function resumeSession(): Promise<OAuthUserAgent | null> {
  const did = localStorage.getItem(STORAGE_KEY);
  if (!did) return null;

  const storedVersion = parseInt(
    localStorage.getItem(AUTH_VERSION_KEY) ?? "0",
    10,
  );
  if (storedVersion < AUTH_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
    return null;
  }

  try {
    const session = await getSession(did as Did, { allowStale: true });
    return new OAuthUserAgent(session);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
    return null;
  }
}

export async function logout(agent: OAuthUserAgent): Promise<void> {
  const did = agent.sub;
  try {
    await agent.signOut();
  } catch {
    // ignore signout errors
  }
  await deleteStoredSession(did);
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(AUTH_VERSION_KEY);
}
