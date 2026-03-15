import { useCallback, useMemo, useRef, useState } from "react";
import { publicClient } from "../lib/api";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { Did } from "@atcute/lexicons";

const CACHE_SIZE = 250;
const BATCH_SIZE = 25;

interface CacheEntry {
  profile: AppBskyActorDefs.ProfileViewDetailed;
}

export function useProfileCache() {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  // Incremented to trigger re-renders when cache updates
  const [tick, setTick] = useState(0);

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

  /** Batch-fetch profiles for multiple DIDs, skipping already-cached ones. */
  const fetchBatch = useCallback(
    async (dids: string[], signal?: AbortSignal): Promise<void> => {
      const uncached = dids.filter((d) => !cacheRef.current.has(d));
      if (uncached.length === 0) return;

      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        if (signal?.aborted) break;
        const batch = uncached.slice(i, i + BATCH_SIZE);
        try {
          const res = await publicClient.get("app.bsky.actor.getProfiles", {
            params: { actors: batch as Did[] },
            signal,
          });
          if (res.ok) {
            for (const profile of res.data.profiles) {
              cacheRef.current.set(profile.did, { profile });
            }
            evictOldest();
          }
        } catch {
          // Ignore fetch errors (aborted, network, etc.)
        }
      }

      if (!signal?.aborted) {
        setTick((t) => t + 1);
      }
    },
    [evictOldest],
  );

  /** Get just the avatar URL for a DID, if cached. */
  const getAvatar = useCallback((did: string): string | undefined => {
    return cacheRef.current.get(did)?.profile.avatar;
  }, []);

  /** Get the display name for a DID, if cached. */
  const getDisplayName = useCallback((did: string): string | undefined => {
    return cacheRef.current.get(did)?.profile.displayName;
  }, []);

  // Stable object reference — individual callbacks are already stable via useCallback.
  // tick is included so consumers re-render when cache updates.
  return useMemo(
    () => ({ get, fetch, fetchBatch, getAvatar, getDisplayName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [get, fetch, fetchBatch, getAvatar, getDisplayName, tick],
  );
}
