import { useCallback, useEffect, useRef, useState } from "react";
import type { OAuthUserAgent } from "@atcute/oauth-browser-client";
import {
  initOAuth,
  handleCallback,
  resumeSession,
  startLogin,
  logout as doLogout,
} from "../lib/auth";
import { getHandle, resolveHandles } from "../lib/handle-resolver";

export interface AuthState {
  agent: OAuthUserAgent | null;
  did: string | null;
  handle: string | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    agent: null,
    did: null,
    handle: null,
    loading: true,
    error: null,
  });
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        initOAuth();

        // Check for OAuth callback params
        let agent = await handleCallback();
        if (!agent) {
          agent = await resumeSession();
        }

        if (agent) {
          setState({
            agent,
            did: agent.sub,
            handle: null,
            loading: false,
            error: null,
          });
          // Resolve handle early so we don't show a raw DID
          resolveHandles([agent.sub])
            .then(() => {
              const handle = getHandle(agent.sub);
              if (handle) {
                setState((s) => ({ ...s, handle }));
              }
            })
            .catch(() => {});
        } else {
          setState((s) => ({ ...s, loading: false }));
        }
      } catch (err) {
        setState({
          agent: null,
          did: null,
          handle: null,
          loading: false,
          error: err instanceof Error ? err.message : "Auth error",
        });
      }
    })();
  }, []);

  const login = useCallback(async (handle: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await startLogin(handle);
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Login failed",
      }));
    }
  }, []);

  const logout = useCallback(async () => {
    if (state.agent) {
      await doLogout(state.agent);
    }
    setState({
      agent: null,
      did: null,
      handle: null,
      loading: false,
      error: null,
    });
  }, [state.agent]);

  return { ...state, login, logout };
}
