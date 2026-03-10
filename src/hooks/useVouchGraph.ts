import { useCallback, useEffect, useRef, useState } from "react";
import type { VouchEdge } from "../lib/types";
import { fetchAllVouches, type FetchProgress } from "../lib/vouch-fetcher";
import { resolveHandles, getHandle } from "../lib/handle-resolver";
import { hueFromName, pastelColorFromHue, circularMeanHue } from "../lib/color";
import { createJetstreamSubscription } from "../lib/jetstream";
import type { JetstreamSubscription } from "@atcute/jetstream";

export interface VouchNode {
  id: string;
  label: string;
  color: string;
  hue: number;
  size: number;
  cluster: number;
}

export interface VouchLink {
  source: string;
  target: string;
  color?: string;
}

export interface VouchGraphStatus {
  loading: boolean;
  rebuilding: boolean;
  error: string | null;
  progress: FetchProgress | null;
  jetstreamConnected: boolean;
  nodeCount: number;
  edgeCount: number;
  pendingChanges: boolean;
}

export interface VouchGraphResult {
  /** Frozen snapshot for Cosmograph — only changes on rebuild */
  cosmoNodes: VouchNode[];
  cosmoLinks: VouchLink[];
  /** Accumulated nodes/links including Jetstream updates — for highlight system */
  allNodes: VouchNode[];
  allLinks: VouchLink[];
  status: VouchGraphStatus;
  /** Promote live data into the Cosmograph snapshot */
  rebuild: () => void;
}

function linkKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function parseLinkKey(key: string) {
  const [source, target] = key.split("->");
  return { source, target };
}

const HANDLE_RESOLVE_BATCH = 50;
const HANDLE_RESOLVE_INTERVAL = 2000;

interface ClusterInfo {
  clusters: Map<string, number>;
  clusterHues: Map<number, number>;
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

  const clusterHueMap = new Map<number, number>();
  for (const [cid, hues] of clusterHues) {
    clusterHueMap.set(cid, circularMeanHue(hues));
  }

  return { clusters: clusterMap, clusterHues: clusterHueMap };
}

function makeNode(
  id: string,
  degree: number,
  clusterId: number,
  hue: number,
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
    color: pastelColorFromHue(hue),
    hue,
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
} {
  const degree = new Map<string, number>();
  for (const id of nodeSet) degree.set(id, 0);
  for (const link of linkList) {
    degree.set(link.source, (degree.get(link.source) ?? 0) + 1);
    degree.set(link.target, (degree.get(link.target) ?? 0) + 1);
  }

  const { clusters, clusterHues } = computeClusters(nodeSet, linkList);

  const nodes: VouchNode[] = [];
  for (const id of nodeSet) {
    const cid = clusters.get(id) ?? 0;
    const hue = clusterHues.get(cid) ?? 0;
    nodes.push(
      makeNode(
        id,
        degree.get(id) ?? 0,
        cid,
        hue,
        nodeSizeMin,
        nodeSizeMax,
        nodeSizeScale,
      ),
    );
  }

  // Color each link by its source node's cluster color
  const links: VouchLink[] = linkList.map((l) => {
    const srcCluster = clusters.get(l.source) ?? 0;
    const color = pastelColorFromHue(clusterHues.get(srcCluster) ?? 0);
    return { source: l.source, target: l.target, color };
  });
  return { nodes, links };
}

export function useVouchGraph(
  nodeSizeMin: number,
  nodeSizeMax: number,
  nodeSizeScale: number,
): VouchGraphResult {
  const [status, setStatus] = useState<VouchGraphStatus>({
    loading: true,
    rebuilding: false,
    error: null,
    progress: null,
    jetstreamConnected: false,
    nodeCount: 0,
    edgeCount: 0,
    pendingChanges: false,
  });

  // Graph data — only changes on initial load or rebuild
  const [graphData, setGraphData] = useState<{
    nodes: VouchNode[];
    links: VouchLink[];
  }>({ nodes: [], links: [] });

  // Internal mutable state for tracking known nodes/edges
  const nodeSetRef = useRef<Set<string>>(new Set());
  const linkSetRef = useRef<Set<string>>(new Set());
  const pendingDidsRef = useRef<Set<string>>(new Set());
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionRef = useRef<JetstreamSubscription | null>(null);

  // Keep size params in a ref so Jetstream callback uses latest values
  const sizeParamsRef = useRef({ nodeSizeMin, nodeSizeMax, nodeSizeScale });
  sizeParamsRef.current = { nodeSizeMin, nodeSizeMax, nodeSizeScale };

  // Rebuild: resolve all unresolved handles, then promote live data into the Cosmograph snapshot
  const rebuild = useCallback(async () => {
    setStatus((s) => ({ ...s, rebuilding: true }));

    // Cancel any pending timer
    if (resolveTimerRef.current) {
      clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
    pendingDidsRef.current.clear();

    // Resolve every DID in the graph that doesn't have a handle yet
    const unresolved = [...nodeSetRef.current].filter((d) => !getHandle(d));
    if (unresolved.length > 0) {
      await resolveHandles(unresolved);
    }

    const {
      nodeSizeMin: sm,
      nodeSizeMax: sM,
      nodeSizeScale: sS,
    } = sizeParamsRef.current;
    const linkList = [...linkSetRef.current].map(parseLinkKey);
    const data = buildNodesAndLinks(nodeSetRef.current, linkList, sm, sM, sS);
    setGraphData(data);
    setStatus((s) => ({ ...s, pendingChanges: false, rebuilding: false }));
  }, []);

  const scheduleHandleResolve = useCallback(() => {
    if (resolveTimerRef.current) return;

    const flush = async () => {
      resolveTimerRef.current = null;
      const pending = pendingDidsRef.current;
      if (pending.size === 0) return;

      const batch = [...pending].slice(0, HANDLE_RESOLVE_BATCH);
      for (const did of batch) pending.delete(did);

      await resolveHandles(batch);

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
          linkSetRef.current.add(linkKey(edge.from, edge.to));
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

        setGraphData(data);
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
            const key = linkKey(edge.from, edge.to);
            if (linkSetRef.current.has(key)) return;
            linkSetRef.current.add(key);

            for (const did of [edge.from, edge.to]) {
              if (!nodeSetRef.current.has(did)) {
                nodeSetRef.current.add(did);
                if (!getHandle(did)) pendingDidsRef.current.add(did);
              }
            }

            setStatus((s) => ({
              ...s,
              pendingChanges: true,
              nodeCount: nodeSetRef.current.size,
              edgeCount: linkSetRef.current.size,
            }));

            scheduleHandleResolve();
          },
          onDelete: (did, rkey) => {
            const key = linkKey(did, rkey);
            if (linkSetRef.current.has(key)) {
              linkSetRef.current.delete(key);
              setStatus((s) => ({
                ...s,
                pendingChanges: true,
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
    cosmoNodes: graphData.nodes,
    cosmoLinks: graphData.links,
    allNodes: graphData.nodes,
    allLinks: graphData.links,
    status,
    rebuild,
  };
}
