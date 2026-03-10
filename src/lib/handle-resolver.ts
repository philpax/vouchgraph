import { publicClient } from "./api";
import type { Did } from "@atcute/lexicons";

const BATCH_SIZE = 25;
const cache = new Map<string, string>();

export function getHandle(did: string): string | undefined {
  return cache.get(did);
}

export async function resolveHandles(dids: string[]): Promise<void> {
  const unresolved = dids.filter((d) => !cache.has(d));
  if (unresolved.length === 0) return;

  for (let i = 0; i < unresolved.length; i += BATCH_SIZE) {
    const batch = unresolved.slice(i, i + BATCH_SIZE) as Did[];
    try {
      const res = await publicClient.get("app.bsky.actor.getProfiles", {
        params: { actors: batch },
      });
      if (res.ok) {
        for (const profile of res.data.profiles) {
          cache.set(profile.did, profile.handle);
        }
      }
    } catch {
      // Fall back to raw DIDs on failure
    }
  }
}

export function getDidByHandle(handle: string): string | undefined {
  for (const [did, h] of cache) {
    if (h === handle) return did;
  }
  return undefined;
}
