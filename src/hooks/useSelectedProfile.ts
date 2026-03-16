import { useCallback, useRef, useState } from "react";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { useProfileCache } from "./useProfileCache";

export interface SelectedProfileState {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  loading: boolean;
}

export function useSelectedProfile(
  profileCache: ReturnType<typeof useProfileCache>,
) {
  const [state, setState] = useState<SelectedProfileState>({
    profile: null,
    loading: false,
  });
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(profileCache);
  cacheRef.current = profileCache;

  const fetchProfile = useCallback((did: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setState({ profile: null, loading: true });

    cacheRef.current
      .fetch(did, abort.signal)
      .then((profile) => {
        if (!abort.signal.aborted) {
          setState({ profile, loading: false });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!abort.signal.aborted)
          setState((s) => ({ ...s, loading: false }));
      });
  }, []);

  const clearProfile = useCallback(() => {
    abortRef.current?.abort();
    setState({ profile: null, loading: false });
  }, []);

  return { ...state, fetchProfile, clearProfile };
}
