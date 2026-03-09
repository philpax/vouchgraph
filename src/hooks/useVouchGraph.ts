import { useCallback, useEffect, useRef, useState } from 'react';
import type { VouchEdge, VouchNode } from '../lib/types';
import { fetchAllVouches, type FetchProgress } from '../lib/vouch-fetcher';
import { resolveHandles, getHandle } from '../lib/handle-resolver';
import { createJetstreamSubscription } from '../lib/jetstream';
import type { JetstreamSubscription } from '@atcute/jetstream';

export interface VouchGraphState {
  nodes: Map<string, VouchNode>;
  edges: VouchEdge[];
  loading: boolean;
  error: string | null;
  progress: FetchProgress | null;
  jetstreamConnected: boolean;
}

export function useVouchGraph() {
  const [state, setState] = useState<VouchGraphState>({
    nodes: new Map(),
    edges: [],
    loading: true,
    error: null,
    progress: null,
    jetstreamConnected: false,
  });

  const subscriptionRef = useRef<JetstreamSubscription | null>(null);

  const ensureNode = useCallback((nodes: Map<string, VouchNode>, did: string) => {
    if (!nodes.has(did)) {
      nodes.set(did, { did, handle: getHandle(did) });
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    (async () => {
      try {
        // Fetch all vouches
        const edges = await fetchAllVouches(
          (progress) => setState((s) => ({ ...s, progress })),
          abortController.signal,
        );

        if (abortController.signal.aborted) return;

        // Collect all unique DIDs
        const allDids = new Set<string>();
        for (const edge of edges) {
          allDids.add(edge.from);
          allDids.add(edge.to);
        }

        // Resolve handles
        await resolveHandles([...allDids]);

        // Build node map
        const nodes = new Map<string, VouchNode>();
        for (const did of allDids) {
          nodes.set(did, { did, handle: getHandle(did) });
        }

        setState((s) => ({
          ...s,
          nodes,
          edges,
          loading: false,
          progress: null,
        }));

        // Start Jetstream
        subscriptionRef.current = createJetstreamSubscription({
          onCreate: (edge) => {
            setState((s) => {
              const newNodes = new Map(s.nodes);
              ensureNode(newNodes, edge.from);
              ensureNode(newNodes, edge.to);

              // Resolve new DIDs in background
              const newDids = [edge.from, edge.to].filter((d) => !getHandle(d));
              if (newDids.length > 0) {
                resolveHandles(newDids).then(() => {
                  setState((prev) => {
                    const updated = new Map(prev.nodes);
                    for (const did of newDids) {
                      const handle = getHandle(did);
                      if (handle) {
                        updated.set(did, { did, handle });
                      }
                    }
                    return { ...prev, nodes: updated };
                  });
                });
              }

              return {
                ...s,
                nodes: newNodes,
                edges: [edge, ...s.edges],
              };
            });
          },
          onDelete: (did, rkey) => {
            setState((s) => ({
              ...s,
              edges: s.edges.filter((e) => !(e.from === did && e.rkey === rkey)),
            }));
          },
          onConnect: () => setState((s) => ({ ...s, jetstreamConnected: true })),
          onDisconnect: () => setState((s) => ({ ...s, jetstreamConnected: false })),
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }));
        }
      }
    })();

    return () => {
      abortController.abort();
      // JetstreamSubscription doesn't have a close method exposed directly,
      // but aborting prevents new state updates
    };
  }, [ensureNode]);

  return state;
}
