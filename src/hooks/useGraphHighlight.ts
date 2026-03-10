import { useCallback, useMemo, useState } from "react";
import { hexToRgba, pastelColorFromHue } from "../lib/color";
import type { VouchNode, VouchLink } from "./useVouchGraph";

export interface HighlightState {
  outboundDist: Map<number, number>;
  inboundDist: Map<number, number>;
  center: number;
}

// Fixed hues for trust directions
const OUTBOUND_HEX = pastelColorFromHue(200); // blue — who this node vouches for
const INBOUND_HEX = pastelColorFromHue(30); // orange — who vouches for this node
const MUTUAL_HEX = pastelColorFromHue(145); // green — mutual recognition

const OPACITY_DECAY = 0.25;
const LABEL_DISTANCE_THRESHOLD = 2;

function directionColor(hex: string, dist: number): string {
  if (dist <= 1) return hex;
  return hexToRgba(hex, Math.pow(OPACITY_DECAY, dist - 1), 1.0);
}

function bfs(
  start: number,
  adjacency: Map<number, number[]>,
): Map<number, number> {
  const dist = new Map<number, number>();
  dist.set(start, 0);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDist = dist.get(current)!;
    for (const n of adjacency.get(current) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, currentDist + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}

const DIMMED = hexToRgba("#888888", 0.06, 0.3);

/** Resolve the highlight color for a node given the highlight state. */
function nodeHighlightColor(
  highlight: HighlightState,
  index: number,
  originalColor: string,
): string {
  if (index === highlight.center) return originalColor;

  const outDist = highlight.outboundDist.get(index);
  const inDist = highlight.inboundDist.get(index);

  if (outDist === undefined && inDist === undefined) return DIMMED;

  // On both trees — mutual recognition
  if (outDist !== undefined && inDist !== undefined)
    return directionColor(MUTUAL_HEX, Math.min(outDist, inDist));

  if (outDist !== undefined) return directionColor(OUTBOUND_HEX, outDist);
  if (inDist !== undefined) return directionColor(INBOUND_HEX, inDist);

  return DIMMED;
}

export function useGraphHighlight(nodes: VouchNode[], links: VouchLink[]) {
  const [highlight, setHighlight] = useState<HighlightState | null>(null);

  const nodeIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const { outboundAdj, inboundAdj, vouchDetails } = useMemo(() => {
    const outAdj = new Map<number, number[]>();
    const inAdj = new Map<number, number[]>();
    const details = new Map<
      string,
      { inbound: string[]; outbound: string[] }
    >();
    for (const l of links) {
      const srcIdx = nodeIdToIndex.get(l.source) ?? -1;
      const tgtIdx = nodeIdToIndex.get(l.target) ?? -1;
      if (srcIdx === -1 || tgtIdx === -1) continue;

      const outList = outAdj.get(srcIdx);
      if (outList) outList.push(tgtIdx);
      else outAdj.set(srcIdx, [tgtIdx]);

      const inList = inAdj.get(tgtIdx);
      if (inList) inList.push(srcIdx);
      else inAdj.set(tgtIdx, [srcIdx]);

      const src = details.get(l.source) ?? { inbound: [], outbound: [] };
      src.outbound.push(l.target);
      details.set(l.source, src);
      const tgt = details.get(l.target) ?? { inbound: [], outbound: [] };
      tgt.inbound.push(l.source);
      details.set(l.target, tgt);
    }
    return {
      outboundAdj: outAdj,
      inboundAdj: inAdj,
      vouchDetails: details,
    };
  }, [links, nodeIdToIndex]);

  const highlightNode = useCallback(
    (index: number) => {
      const outboundDist = bfs(index, outboundAdj);
      const inboundDist = bfs(index, inboundAdj);
      setHighlight({ outboundDist, inboundDist, center: index });
    },
    [outboundAdj, inboundAdj],
  );

  const clearHighlight = useCallback(() => {
    setHighlight(null);
  }, []);

  const showLabelsFor = useMemo(() => {
    if (!highlight) return undefined;
    const result: VouchNode[] = [];
    for (const [idx, dist] of highlight.outboundDist) {
      if (dist <= LABEL_DISTANCE_THRESHOLD && idx < nodes.length)
        result.push(nodes[idx]);
    }
    for (const [idx, dist] of highlight.inboundDist) {
      if (dist <= LABEL_DISTANCE_THRESHOLD && idx < nodes.length) {
        // Avoid duplicates
        if (
          !highlight.outboundDist.has(idx) ||
          highlight.outboundDist.get(idx)! > LABEL_DISTANCE_THRESHOLD
        ) {
          result.push(nodes[idx]);
        }
      }
    }
    return result;
  }, [highlight, nodes]);

  const nodeColorFn = useCallback(
    (node: VouchNode): string => {
      if (!highlight) return node.color;
      const index = nodeIdToIndex.get(node.id);
      if (index === undefined) return node.color;
      return nodeHighlightColor(highlight, index, node.color);
    },
    [highlight, nodeIdToIndex],
  );

  const linkColorFn = useCallback(
    (link: VouchLink): string => {
      const defaultColor = link.color ?? "rgba(255,255,255,0.6)";
      if (!highlight) return defaultColor;
      const srcIdx = nodeIdToIndex.get(link.source);
      const tgtIdx = nodeIdToIndex.get(link.target);
      if (srcIdx === undefined || tgtIdx === undefined) return defaultColor;

      const srcOutDist = highlight.outboundDist.get(srcIdx);
      const tgtOutDist = highlight.outboundDist.get(tgtIdx);
      const srcInDist = highlight.inboundDist.get(srcIdx);
      const tgtInDist = highlight.inboundDist.get(tgtIdx);

      const onOutbound = srcOutDist !== undefined && tgtOutDist !== undefined;
      const onInbound = srcInDist !== undefined && tgtInDist !== undefined;

      // Both endpoints on both trees — mutual
      if (onOutbound && onInbound) {
        const dist = Math.min(
          Math.max(srcOutDist, tgtOutDist),
          Math.max(srcInDist!, tgtInDist!),
        );
        return directionColor(MUTUAL_HEX, dist);
      }

      // Outbound edge
      if (onOutbound)
        return directionColor(OUTBOUND_HEX, Math.max(srcOutDist, tgtOutDist));

      // Inbound edge
      if (onInbound)
        return directionColor(INBOUND_HEX, Math.max(srcInDist!, tgtInDist!));

      return DIMMED;
    },
    [highlight, nodeIdToIndex],
  );

  return {
    highlight,
    highlightNode,
    clearHighlight,
    vouchDetails,
    showLabelsFor,
    nodeColorFn,
    linkColorFn,
    nodeIdToIndex,
  };
}
