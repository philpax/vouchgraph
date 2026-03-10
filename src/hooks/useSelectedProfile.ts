import { useCallback, useRef, useState } from "react";
import { publicClient } from "../lib/api";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { Did } from "@atcute/lexicons";

export interface SelectedProfileState {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  loading: boolean;
}

export function useSelectedProfile() {
  const [state, setState] = useState<SelectedProfileState>({
    profile: null,
    loading: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchProfile = useCallback((did: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setState({ profile: null, loading: true });

    publicClient
      .get("app.bsky.actor.getProfile", {
        params: { actor: did as Did },
        signal: abort.signal,
      })
      .then((res) => {
        if (!abort.signal.aborted && res.ok) {
          setState({ profile: res.data, loading: false });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!abort.signal.aborted) setState((s) => ({ ...s, loading: false }));
      });
  }, []);

  const clearProfile = useCallback(() => {
    abortRef.current?.abort();
    setState({ profile: null, loading: false });
  }, []);

  return { ...state, fetchProfile, clearProfile };
}
