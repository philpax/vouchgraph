import { useCallback, useRef, useState } from "react";
import { publicClient } from "../lib/api";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { Did } from "@atcute/lexicons";

const CACHE_SIZE = 20;

interface CacheEntry {
  profile: AppBskyActorDefs.ProfileViewDetailed;
}

export function useProfileCache() {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  // Incremented to trigger re-renders when cache updates
  const [, setTick] = useState(0);

  const evictOldest = useCallback(() => {
    const cache = cacheRef.current;
    while (cache.size > CACHE_SIZE) {
      const firstKey = cache.keys().next().value!;
      cache.delete(firstKey);
    }
  }, []);

  const get = useCallback(
    (did: string): AppBskyActorDefs.ProfileViewDetailed | undefined => {
      const cache = cacheRef.current;
      const entry = cache.get(did);
      if (!entry) return undefined;
      // Move to end (most recently used)
      cache.delete(did);
      cache.set(did, entry);
      return entry.profile;
    },
    [],
  );

  const fetch = useCallback(
    async (
      did: string,
      signal?: AbortSignal,
    ): Promise<AppBskyActorDefs.ProfileViewDetailed | null> => {
      const cached = get(did);
      if (cached) return cached;

      try {
        const res = await publicClient.get("app.bsky.actor.getProfile", {
          params: { actor: did as Did },
          signal,
        });
        if (res.ok) {
          cacheRef.current.set(did, { profile: res.data });
          evictOldest();
          setTick((t) => t + 1);
          return res.data;
        }
      } catch {
        // Ignore fetch errors (aborted, network, etc.)
      }
      return null;
    },
    [get, evictOldest],
  );

  return { get, fetch };
}
