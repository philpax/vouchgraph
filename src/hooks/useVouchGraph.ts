import { useCallback, useEffect, useRef, useState } from "react";
import type { VouchEdge } from "../lib/types";
import { fetchAllVouches, type FetchProgress } from "../lib/vouch-fetcher";
import { resolveHandles, getHandle } from "../lib/handle-resolver";
import { hueFromName, pastelColorFromHue, circularMeanHue } from "../lib/color";
import { createJetstreamSubscription } from "../lib/jetstream";
import type { JetstreamSubscription } from "@atcute/jetstream";

export interface VouchNode {
  [key: string]: unknown;
  id: string;
  label: string;
  color: string;
  size: number;
  cluster: number;
}

export interface VouchLink {
  [key: string]: unknown;
  source: string;
  target: string;
}

export interface VouchGraphStatus {
  loading: boolean;
  error: string | null;
  progress: FetchProgress | null;
  jetstreamConnected: boolean;
  nodeCount: number;
  edgeCount: number;
}

export interface IncrementalUpdate {
  newNodes: VouchNode[];
  newLinks: VouchLink[];
  removedLinks: [string, string][]; // [source, target] pairs
}

export interface VouchGraphResult {
  /** Initial nodes — set once when backfill completes, never changes after */
  nodes: VouchNode[];
  /** Initial links — set once when backfill completes, never changes after */
  links: VouchLink[];
  status: VouchGraphStatus;
  /** Register a callback for live Jetstream updates (new nodes/links) */
  onIncremental: (cb: (update: IncrementalUpdate) => void) => void;
}

const HANDLE_RESOLVE_BATCH = 50;
const HANDLE_RESOLVE_INTERVAL = 2000;

interface ClusterInfo {
  clusters: Map<string, number>;
  clusterColors: Map<number, string>;
}

function computeClusters(
  nodeIds: Set<string>,
  links: { source: string; target: string }[],
): ClusterInfo {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string) {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const link of links) {
    union(link.source, link.target);
  }

  const rootCounts = new Map<string, number>();
  for (const node of nodeIds) {
    const root = find(node);
    rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
  }

  const sortedRoots = [...rootCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([root]) => root);

  const rootToCluster = new Map<string, number>();
  for (let i = 0; i < sortedRoots.length; i++) {
    rootToCluster.set(sortedRoots[i], i);
  }

  const clusterMap = new Map<string, number>();
  for (const node of nodeIds) {
    clusterMap.set(node, rootToCluster.get(find(node))!);
  }

  // Collect per-member hues, then take the circular mean per cluster
  const clusterHues = new Map<number, number[]>();
  for (const node of nodeIds) {
    const cid = clusterMap.get(node)!;
    const name = getHandle(node) ?? node;
    let hues = clusterHues.get(cid);
    if (!hues) {
      hues = [];
      clusterHues.set(cid, hues);
    }
    hues.push(hueFromName(name));
  }

  const clusterColors = new Map<number, string>();
  for (const [cid, hues] of clusterHues) {
    clusterColors.set(cid, pastelColorFromHue(circularMeanHue(hues)));
  }

  return { clusters: clusterMap, clusterColors };
}

function makeNode(
  id: string,
  degree: number,
  clusterId: number,
  color: string,
  nodeSizeMin: number,
  nodeSizeMax: number,
  nodeSizeScale: number,
): VouchNode {
  const raw = nodeSizeMin + Math.log2(degree + 1) * nodeSizeScale;
  const size = Math.min(nodeSizeMax, Math.max(nodeSizeMin, raw));
  const handle = getHandle(id);
  return {
    id,
    label: handle ?? id,
    color,
    size,
    cluster: clusterId,
  };
}

function buildNodesAndLinks(
  nodeSet: Set<string>,
  linkList: { source: string; target: string }[],
  nodeSizeMin: number,
  nodeSizeMax: number,
  nodeSizeScale: number,
): {
  nodes: VouchNode[];
  links: VouchLink[];
  clusterColors: Map<number, string>;
} {
  const degree = new Map<string, number>();
  for (const id of nodeSet) degree.set(id, 0);
  for (const link of linkList) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const { clusters, clusterColors } = computeClusters(nodeSet, linkList);

  const nodes: VouchNode[] = [];
  for (const id of nodeSet) {
    const cid = clusters.get(id) ?? 0;
    nodes.push(
      makeNode(
        id,
        degree.get(id) ?? 0,
        cid,
        clusterColors.get(cid) ?? "#888888",
        nodeSizeMin,
        nodeSizeMax,
        nodeSizeScale,
      ),
    );
  }

  // Color each link by its source node's cluster color
  const links: VouchLink[] = linkList.map((l) => {
    const srcCluster = clusters.get(l.source) ?? 0;
    const color = clusterColors.get(srcCluster) ?? "#888888";
    return { source: l.source, target: l.target, color };
  });
  return { nodes, links, clusterColors };
}

export function useVouchGraph(
  nodeSizeMin: number,
  nodeSizeMax: number,
  nodeSizeScale: number,
): VouchGraphResult {
  const [status, setStatus] = useState<VouchGraphStatus>({
    loading: true,
    error: null,
    progress: null,
    jetstreamConnected: false,
    nodeCount: 0,
    edgeCount: 0,
  });

  // Initial data — set once after backfill
  const [initialData, setInitialData] = useState<{
    nodes: VouchNode[];
    links: VouchLink[];
  }>({ nodes: [], links: [] });

  // Internal mutable state for tracking known nodes/edges
  const nodeSetRef = useRef<Set<string>>(new Set());
  const linkSetRef = useRef<Set<string>>(new Set());
  const pendingDidsRef = useRef<Set<string>>(new Set());
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionRef = useRef<JetstreamSubscription | null>(null);
  const clusterColorsRef = useRef<Map<number, string>>(new Map());

  // Incremental update callback (set by App after Cosmograph mounts)
  const incrementalCbRef = useRef<((update: IncrementalUpdate) => void) | null>(
    null,
  );

  // Keep size params in a ref so Jetstream callback uses latest values
  const sizeParamsRef = useRef({ nodeSizeMin, nodeSizeMax, nodeSizeScale });
  sizeParamsRef.current = { nodeSizeMin, nodeSizeMax, nodeSizeScale };

  const onIncremental = useCallback(
    (cb: (update: IncrementalUpdate) => void) => {
      incrementalCbRef.current = cb;
    },
    [],
  );

  const scheduleHandleResolve = useCallback(() => {
    if (resolveTimerRef.current) return;

    const flush = async () => {
      resolveTimerRef.current = null;
      const pending = pendingDidsRef.current;
      if (pending.size === 0) return;

      const batch = [...pending].slice(0, HANDLE_RESOLVE_BATCH);
      for (const did of batch) pending.delete(did);

      await resolveHandles(batch);

      // Note: labels won't live-update for already-rendered nodes in Cosmograph
      // since we can't easily update individual point labels without re-preparing data.
      // New nodes added via Jetstream will pick up resolved handles though.

      if (pending.size > 0) {
        resolveTimerRef.current = setTimeout(flush, HANDLE_RESOLVE_INTERVAL);
      }
    };

    if (pendingDidsRef.current.size >= HANDLE_RESOLVE_BATCH) {
      flush();
    } else {
      resolveTimerRef.current = setTimeout(flush, HANDLE_RESOLVE_INTERVAL);
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    (async () => {
      try {
        const allEdges = await fetchAllVouches(
          (progress) => setStatus((s) => ({ ...s, progress })),
          undefined,
          abortController.signal,
        );

        if (abortController.signal.aborted) return;

        // Filter out self-vouches
        const filteredEdges = allEdges.filter((e) => e.from !== e.to);

        const allDids = new Set<string>();
        for (const edge of filteredEdges) {
          allDids.add(edge.from);
          allDids.add(edge.to);
        }

        await resolveHandles([...allDids]);

        if (abortController.signal.aborted) return;

        // Track all known nodes/edges
        for (const edge of filteredEdges) {
          nodeSetRef.current.add(edge.from);
          nodeSetRef.current.add(edge.to);
          linkSetRef.current.add(`${edge.from}->${edge.to}`);
        }

        const linkList = filteredEdges.map((e) => ({
          source: e.from,
          target: e.to,
        }));
        const {
          nodeSizeMin: sm,
          nodeSizeMax: sM,
          nodeSizeScale: sS,
        } = sizeParamsRef.current;
        const data = buildNodesAndLinks(
          nodeSetRef.current,
          linkList,
          sm,
          sM,
          sS,
        );

        clusterColorsRef.current = data.clusterColors;
        setInitialData(data);
        setStatus((s) => ({
          ...s,
          loading: false,
          progress: null,
          nodeCount: nodeSetRef.current.size,
          edgeCount: linkSetRef.current.size,
        }));

        // Pending handle resolution for any remaining
        for (const did of allDids) {
          if (!getHandle(did)) pendingDidsRef.current.add(did);
        }
        scheduleHandleResolve();

        // Start Jetstream for live updates
        subscriptionRef.current = createJetstreamSubscription({
          onCreate: (edge: VouchEdge) => {
            if (edge.from === edge.to) return;
            const key = `${edge.from}->${edge.to}`;
            if (linkSetRef.current.has(key)) return;
            linkSetRef.current.add(key);

            const newNodes: VouchNode[] = [];
            const {
              nodeSizeMin: nMin,
              nodeSizeMax: nMax,
              nodeSizeScale: nScale,
            } = sizeParamsRef.current;

            // For new nodes from Jetstream, assign cluster 0 and minimal degree.
            // Full cluster recomputation would be expensive and disruptive.
            const fallbackColor =
              clusterColorsRef.current.get(0) ?? pastelColorFromHue(0);
            for (const did of [edge.from, edge.to]) {
              if (!nodeSetRef.current.has(did)) {
                nodeSetRef.current.add(did);
                if (!getHandle(did)) pendingDidsRef.current.add(did);
                newNodes.push(
                  makeNode(did, 1, 0, fallbackColor, nMin, nMax, nScale),
                );
              }
            }

            const newLinks: VouchLink[] = [
              { source: edge.from, target: edge.to, color: fallbackColor },
            ];

            if (incrementalCbRef.current) {
              incrementalCbRef.current({
                newNodes,
                newLinks,
                removedLinks: [],
              });
            }

            setStatus((s) => ({
              ...s,
              nodeCount: nodeSetRef.current.size,
              edgeCount: linkSetRef.current.size,
            }));

            scheduleHandleResolve();
          },
          onDelete: (did, rkey) => {
            const key = `${did}->${rkey}`;
            if (linkSetRef.current.has(key)) {
              linkSetRef.current.delete(key);
              if (incrementalCbRef.current) {
                incrementalCbRef.current({
                  newNodes: [],
                  newLinks: [],
                  removedLinks: [[did, rkey]],
                });
              }
              setStatus((s) => ({
                ...s,
                edgeCount: linkSetRef.current.size,
              }));
            }
          },
          onConnect: () =>
            setStatus((s) => ({ ...s, jetstreamConnected: true })),
          onDisconnect: () =>
            setStatus((s) => ({ ...s, jetstreamConnected: false })),
        });
      } catch (err) {
        if (!abortController.signal.aborted) {
          setStatus((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      }
    })();

    return () => {
      abortController.abort();
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    };
  }, [scheduleHandleResolve]);

  return {
    nodes: initialData.nodes,
    links: initialData.links,
    status,
    onIncremental,
  };
}
