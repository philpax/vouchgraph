import { Client } from "@atcute/client";
import type { OAuthUserAgent } from "@atcute/oauth-browser-client";

async function authedPost(
  agent: OAuthUserAgent,
  nsid: "com.atproto.repo.createRecord" | "com.atproto.repo.deleteRecord",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
) {
  const client = new Client({ handler: agent });
  const res = await client.post(nsid, { input });
  if (!res.ok) {
    const error = res.data as { error?: string; message?: string };
    // Retry once on DPoP nonce mismatch — the agent caches the nonce
    // after the first attempt, so the second should succeed.
    if (error.error === "use_dpop_nonce") {
      const retry = await client.post(nsid, { input });
      if (!retry.ok) {
        const retryError = retry.data as { message?: string };
        throw new Error(retryError.message ?? "Request failed");
      }
      return retry;
    }
    throw new Error(error.message ?? "Request failed");
  }
  return res;
}

export async function createVouch(
  agent: OAuthUserAgent,
  targetDid: string,
): Promise<{ uri: string }> {
  const res = await authedPost(agent, "com.atproto.repo.createRecord", {
    repo: agent.sub,
    collection: "dev.atvouch.graph.vouch",
    rkey: targetDid,
    record: {
      $type: "dev.atvouch.graph.vouch",
      subject: targetDid,
      createdAt: new Date().toISOString(),
    },
  });

  return {
    uri: (res.data as unknown as { uri: string }).uri,
  };
}

export async function deleteVouch(
  agent: OAuthUserAgent,
  targetDid: string,
): Promise<void> {
  await authedPost(agent, "com.atproto.repo.deleteRecord", {
    repo: agent.sub,
    collection: "dev.atvouch.graph.vouch",
    rkey: targetDid,
  });
}
