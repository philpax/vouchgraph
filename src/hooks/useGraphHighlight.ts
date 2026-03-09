import { useCallback, useMemo, useState } from "react";
import { hexToRgba } from "../lib/color";
import type { VouchNode, VouchLink } from "./useVouchGraph";

export interface HighlightState {
  distances: Map<number, number>;
  center: number;
}

export function useGraphHighlight(nodes: VouchNode[], links: VouchLink[]) {
  const [highlight, setHighlight] = useState<HighlightState | null>(null);

  const nodeIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const { outboundAdj, vouchDetails } = useMemo(() => {
    const adj = new Map<number, number[]>();
    const details = new Map<
      string,
      { inbound: string[]; outbound: string[] }
    >();
    for (const l of links) {
      const srcIdx = nodeIdToIndex.get(l.source) ?? -1;
      const tgtIdx = nodeIdToIndex.get(l.target) ?? -1;
      if (srcIdx === -1 || tgtIdx === -1) continue;
      const list = adj.get(srcIdx);
      if (list) list.push(tgtIdx);
      else adj.set(srcIdx, [tgtIdx]);
      const src = details.get(l.source) ?? { inbound: [], outbound: [] };
      src.outbound.push(l.target);
      details.set(l.source, src);
      const tgt = details.get(l.target) ?? { inbound: [], outbound: [] };
      tgt.inbound.push(l.source);
      details.set(l.target, tgt);
    }
    return { outboundAdj: adj, vouchDetails: details };
  }, [links, nodeIdToIndex]);

  const highlightNode = useCallback(
    (index: number) => {
      const distances = new Map<number, number>();
      distances.set(index, 0);
      const queue = [index];
      while (queue.length > 0) {
        const current = queue.shift()!;
        const currentDist = distances.get(current)!;
        const outbound = outboundAdj.get(current) ?? [];
        for (const n of outbound) {
          if (!distances.has(n)) {
            distances.set(n, currentDist + 1);
            queue.push(n);
          }
        }
      }
      setHighlight({ distances, center: index });
    },
    [outboundAdj],
  );

  const clearHighlight = useCallback(() => {
    setHighlight(null);
  }, []);

  // Label styles
  const labelStyleByIndex = useMemo(() => {
    const map = new Map<number, string>();
    nodes.forEach((node, i) => {
      map.set(
        i,
        `background: ${hexToRgba(node.color, 0.85, 0.35)}; color: white; padding: 2px 6px; border-radius: 4px;`,
      );
    });
    return map;
  }, [nodes]);

  const pointLabelClassName = useCallback(
    (_text: string, pointIndex: number) => {
      const baseStyle =
        labelStyleByIndex.get(pointIndex) ??
        "background: rgba(3,7,18,0.8); color: white; padding: 2px 6px; border-radius: 4px;";
      if (!highlight) return baseStyle;
      const dist = highlight.distances.get(pointIndex);
      if (dist === undefined)
        return baseStyle + " opacity: 0.2; filter: brightness(0.4);";
      if (dist <= 1) return baseStyle;
      const alpha = Math.pow(0.25, dist - 1);
      return baseStyle + ` opacity: ${alpha};`;
    },
    [labelStyleByIndex, highlight],
  );

  const showLabelsFor = useMemo(() => {
    if (!highlight) return undefined;
    const ids: string[] = [];
    for (const [idx, dist] of highlight.distances) {
      if (dist <= 2 && idx < nodes.length) {
        ids.push(nodes[idx].id);
      }
    }
    return ids;
  }, [highlight, nodes]);

  const pointColorByFn = useCallback(
    (colorHex: string, index?: number): string => {
      if (!highlight || index === undefined) return colorHex;
      const dist = highlight.distances.get(index);
      if (dist === undefined) return hexToRgba(colorHex, 0.06, 0.3);
      if (dist <= 1) return colorHex;
      const alpha = Math.pow(0.25, dist - 1);
      return hexToRgba(colorHex, alpha, 1.0);
    },
    [highlight],
  );

  return {
    highlight,
    highlightNode,
    clearHighlight,
    vouchDetails,
    pointLabelClassName,
    showLabelsFor,
    pointColorByFn,
  };
}
