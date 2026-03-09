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

function directionColor(hex: string, dist: number): string {
  if (dist <= 1) return hex;
  return hexToRgba(hex, Math.pow(0.25, dist - 1), 1.0);
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
      // Outbound BFS (who does this node trust, transitively)
      const outboundDist = new Map<number, number>();
      outboundDist.set(index, 0);
      let queue = [index];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDist = outboundDist.get(current)!;
        for (const n of outboundAdj.get(current) ?? []) {
          if (!outboundDist.has(n)) {
            outboundDist.set(n, currentDist + 1);
            queue.push(n);
          }
        }
      }

      // Inbound BFS (who trusts this node, transitively)
      const inboundDist = new Map<number, number>();
      inboundDist.set(index, 0);
      queue = [index];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDist = inboundDist.get(current)!;
        for (const n of inboundAdj.get(current) ?? []) {
          if (!inboundDist.has(n)) {
            inboundDist.set(n, currentDist + 1);
            queue.push(n);
          }
        }
      }

      setHighlight({ outboundDist, inboundDist, center: index });
    },
    [outboundAdj, inboundAdj],
  );

  const clearHighlight = useCallback(() => {
    setHighlight(null);
  }, []);

  const pointLabelClassName = useCallback(
    (_text: string, pointIndex: number) => {
      const node = nodes[pointIndex];
      const color = highlight
        ? nodeHighlightColor(highlight, pointIndex, node?.color ?? "#888888")
        : (node?.color ?? "#888888");
      const bg = hexToRgba(color, 0.85, 0.35);
      let style = `background: ${bg}; color: white; padding: 2px 6px; border-radius: 4px;`;

      if (highlight) {
        const outDist = highlight.outboundDist.get(pointIndex);
        const inDist = highlight.inboundDist.get(pointIndex);
        if (outDist === undefined && inDist === undefined) {
          style += " opacity: 0.2; filter: brightness(0.4);";
        } else {
          const dist = Math.min(outDist ?? Infinity, inDist ?? Infinity);
          if (dist > 1) {
            style += ` opacity: ${Math.pow(0.25, dist - 1)};`;
          }
        }
      }

      return style;
    },
    [nodes, highlight],
  );

  const showLabelsFor = useMemo(() => {
    if (!highlight) return undefined;
    const ids = new Set<string>();
    for (const [idx, dist] of highlight.outboundDist) {
      if (dist <= 2 && idx < nodes.length) ids.add(nodes[idx].id);
    }
    for (const [idx, dist] of highlight.inboundDist) {
      if (dist <= 2 && idx < nodes.length) ids.add(nodes[idx].id);
    }
    return [...ids];
  }, [highlight, nodes]);

  const pointColorByFn = useCallback(
    (colorHex: string, index?: number): string => {
      if (!highlight || index === undefined) return colorHex;
      return nodeHighlightColor(highlight, index, colorHex);
    },
    [highlight],
  );

  const linkColorByFn = useCallback(
    (colorHex: string, index?: number): string => {
      if (!highlight || index === undefined || index >= links.length)
        return colorHex;
      const l = links[index];
      const srcIdx = nodeIdToIndex.get(l.source);
      const tgtIdx = nodeIdToIndex.get(l.target);
      if (srcIdx === undefined || tgtIdx === undefined) return colorHex;

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
    [highlight, links, nodeIdToIndex],
  );

  return {
    highlight,
    highlightNode,
    clearHighlight,
    vouchDetails,
    pointLabelClassName,
    showLabelsFor,
    pointColorByFn,
    linkColorByFn,
  };
}
