import { useCallback, useEffect, useRef } from "react";
import { Cosmograph as RawCosmograph } from "@cosmograph/cosmograph";
import {
  CosmographProvider,
  Cosmograph,
  useCosmograph,
  type CosmographRef,
} from "@cosmograph/react";
import type { VouchNode, VouchLink } from "../hooks/useVouchGraph";
import type { SimParams } from "../lib/sim-params";
import type { HighlightState } from "../hooks/useGraphHighlight";
import { hexToRgba } from "../lib/color";
import "./vouch-graph.css";

/** Duration in ms for fitView animations (used on init and after rebuild). */
export const FIT_VIEW_DURATION = 2000;
/** Zoom scale used when navigating to a specific node (initial load, post-vouch). */
export const ZOOM_TO_NODE_SCALE = 12;

const LABEL_COLOR = "rgba(255,255,255,0.9)";
const LABEL_OPACITY_DECAY = 0.5;

interface VouchGraphProps {
  nodes: VouchNode[];
  links: VouchLink[];
  loading: boolean;
  params: SimParams;
  showLabelsFor: VouchNode[] | undefined;
  highlight: HighlightState | null;
  nodeIdToIndex: Map<string, number>;
  nodeColorFn: (node: VouchNode) => string;
  linkColorFn: (link: VouchLink) => string;
  getAvatar: (did: string) => string | undefined;
  fetchAvatarBatch: (dids: string[], signal?: AbortSignal) => Promise<void>;
  cacheVersion: number;
  onNodeClick: (did: string) => void;
  onNodeHover?: (did: string) => void;
  onNodeHoverEnd?: () => void;
  onBackgroundClick: () => void;
  onReheatRef?: React.MutableRefObject<(() => void) | null>;
  onFocusNodeRef?: React.MutableRefObject<
    ((did: string | undefined) => void) | null
  >;
  onFitViewRef?: React.MutableRefObject<((duration?: number) => void) | null>;
  onZoomToNodeRef?: React.MutableRefObject<((did: string) => void) | null>;
  disableFitViewOnInit?: boolean;
}

export function VouchGraph({
  nodes,
  links,
  loading,
  ...rest
}: VouchGraphProps) {
  if (loading || nodes.length === 0) return null;

  return (
    <CosmographProvider nodes={nodes} links={links}>
      <VouchGraphInner nodes={nodes} {...rest} />
    </CosmographProvider>
  );
}

function VouchGraphInner({
  nodes,
  params,
  showLabelsFor,
  highlight,
  nodeIdToIndex,
  nodeColorFn,
  linkColorFn,
  getAvatar,
  fetchAvatarBatch,
  cacheVersion,
  onNodeClick,
  onNodeHover,
  onNodeHoverEnd,
  onBackgroundClick,
  onReheatRef,
  onFocusNodeRef,
  onFitViewRef,
  onZoomToNodeRef,
  disableFitViewOnInit,
}: Omit<VouchGraphProps, "links" | "loading">) {
  const cosmographRef = useRef<CosmographRef<VouchNode, VouchLink>>(undefined);
  const { cosmograph } = useCosmograph<VouchNode, VouchLink>()!;

  useVouchLabelPatch(
    cosmograph,
    highlight,
    nodeIdToIndex,
    nodeColorFn,
    getAvatar,
    fetchAvatarBatch,
    cacheVersion,
  );

  // Expose reheat to parent
  useEffect(() => {
    if (onReheatRef) {
      onReheatRef.current = () => cosmographRef.current?.start();
    }
  }, [onReheatRef]);

  // Expose fitView to parent
  useEffect(() => {
    if (onFitViewRef) {
      onFitViewRef.current = (duration?: number) => {
        cosmographRef.current?.fitView(duration);
      };
    }
  }, [onFitViewRef]);

  // Expose zoomToNode to parent (for initial load / post-vouch).
  // Smoothly zooms in while following the node until the user interacts.
  const followRafRef = useRef<number | null>(null);
  const stopFollow = useCallback(() => {
    if (followRafRef.current) {
      cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (onZoomToNodeRef) {
      onZoomToNodeRef.current = (did) => {
        const node = nodes.find((n) => n.id === did);
        if (!node) return;

        stopFollow();

        let started = false;
        let startZoom = 1;
        let start = 0;
        const zoomDuration = 3000;

        const frame = () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cosmos = (cosmographRef.current as any)?._cosmos;
          if (!cosmos) {
            // Cosmos not ready yet — retry next frame
            followRafRef.current = requestAnimationFrame(frame);
            return;
          }

          if (!started) {
            started = true;
            startZoom = cosmos.getZoomLevel() ?? 1;
            start = performance.now();

            // Stop following on any user interaction
            const stop = () => {
              stopFollow();
              window.removeEventListener("pointerdown", stop, true);
              window.removeEventListener("wheel", stop, true);
              window.removeEventListener("keydown", stop, true);
              window.removeEventListener("touchstart", stop, true);
            };
            window.addEventListener("pointerdown", stop, {
              once: true,
              capture: true,
            });
            window.addEventListener("wheel", stop, {
              once: true,
              capture: true,
            });
            window.addEventListener("keydown", stop, {
              once: true,
              capture: true,
            });
            window.addEventListener("touchstart", stop, {
              once: true,
              capture: true,
            });
          }

          const elapsed = performance.now() - start;
          const t = Math.min(elapsed / zoomDuration, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          const zoom = startZoom + (ZOOM_TO_NODE_SCALE - startZoom) * eased;

          cosmos.zoomToNode(node, 0, zoom, false);
          followRafRef.current = requestAnimationFrame(frame);
        };

        followRafRef.current = requestAnimationFrame(frame);
      };
    }
  }, [onZoomToNodeRef, nodes, stopFollow]);

  // Expose focus node to parent
  useEffect(() => {
    if (onFocusNodeRef) {
      onFocusNodeRef.current = (did) => {
        const node = did ? nodes.find((n) => n.id === did) : undefined;
        cosmographRef.current?.focusNode(node);
      };
    }
  }, [onFocusNodeRef, nodes]);

  const handleClick = useCallback(
    (node: VouchNode | undefined) => {
      if (node) {
        onNodeClick(node.id);
      } else {
        onBackgroundClick();
      }
    },
    [onNodeClick, onBackgroundClick],
  );

  const handleLabelClick = useCallback(
    (node: VouchNode) => {
      onNodeClick(node.id);
    },
    [onNodeClick],
  );

  const handleNodeMouseOver = useCallback(
    (node: VouchNode) => {
      onNodeHover?.(node.id);
    },
    [onNodeHover],
  );

  const handleNodeMouseOut = useCallback(() => {
    onNodeHoverEnd?.();
  }, [onNodeHoverEnd]);

  return (
    <Cosmograph
      ref={cosmographRef}
      className="w-full h-full"
      backgroundColor="#030712"
      spaceSize={4096}
      nodeColor={nodeColorFn}
      linkColor={linkColorFn}
      nodeSize={(n: VouchNode) => n.size}
      linkWidth={1}
      linkArrows={true}
      linkArrowsSizeScale={0.5}
      nodeLabelAccessor={(n: VouchNode) => n.label}
      nodeLabelColor={LABEL_COLOR}
      showDynamicLabels={!showLabelsFor}
      showTopLabels={!showLabelsFor}
      showHoveredNodeLabel
      showLabelsFor={showLabelsFor}
      renderHoveredNodeRing
      hoveredNodeRingColor="#ffffff"
      fitViewOnInit={!disableFitViewOnInit}
      fitViewDelay={FIT_VIEW_DURATION}
      simulationGravity={params.simulationGravity}
      simulationRepulsion={params.simulationRepulsion}
      simulationFriction={params.simulationFriction}
      simulationLinkSpring={params.simulationLinkSpring}
      simulationLinkDistance={params.simulationLinkDistance}
      simulationDecay={params.simulationDecay}
      onClick={handleClick}
      onLabelClick={handleLabelClick}
      onNodeMouseOver={handleNodeMouseOver}
      onNodeMouseOut={handleNodeMouseOut}
    />
  );
}

/**
 * Patch Cosmograph's label rendering to use custom per-node styling.
 *
 * Cosmograph v1's `nodeLabelClassName` sets element.className (not inline styles),
 * so we monkey-patch `_renderLabels` and `_renderLabelForHovered` to get full control
 * over per-label style, color, className, and weight.
 *
 * Adapted from genresinspace's Graph.tsx.
 */
/** Max DIDs to fetch per interval tick. */
const AVATAR_BATCH_SIZE = 25;
/** How often (ms) to drain the visible-but-uncached avatar queue. */
const AVATAR_FETCH_INTERVAL = 1000;

function useVouchLabelPatch(
  cosmograph: RawCosmograph<VouchNode, VouchLink> | undefined,
  highlight: HighlightState | null,
  nodeIdToIndex: Map<string, number>,
  nodeColorFn: (node: VouchNode) => string,
  getAvatar: (did: string) => string | undefined,
  fetchAvatarBatch: (dids: string[], signal?: AbortSignal) => Promise<void>,
  cacheVersion: number,
) {
  // Queue of visible DIDs whose avatars haven't been fetched yet.
  const pendingAvatarsRef = useRef<Set<string>>(new Set());

  // Periodically drain the queue.
  useEffect(() => {
    const abort = new AbortController();
    const timer = setInterval(() => {
      const pending = pendingAvatarsRef.current;
      if (pending.size === 0) return;
      const batch = [...pending].slice(0, AVATAR_BATCH_SIZE);
      for (const did of batch) pending.delete(did);
      fetchAvatarBatch(batch, abort.signal);
    }, AVATAR_FETCH_INTERVAL);
    return () => {
      clearInterval(timer);
      abort.abort();
    };
  }, [fetchAvatarBatch]);

  useEffect(() => {
    if (!cosmograph) return;

    const avatarStyle =
      "width:14px;height:14px;border-radius:50%;vertical-align:middle;margin-right:4px;display:inline-block;flex-shrink:0;";

    const getNodeLabelText = (node: VouchNode, text: string) => {
      const avatarUrl = getAvatar(node.id);
      if (avatarUrl) {
        return `<img src="${avatarUrl}" style="${avatarStyle}object-fit:cover;">${text}`;
      }
      return `<span style="${avatarStyle}background:#555;"></span>${text}`;
    };

    const getNodeLabelStyle = (node: VouchNode, isVisible: boolean) => {
      const color = nodeColorFn(node);
      const bg = hexToRgba(color, 0.85, 0.35);
      const parts = [`background-color: ${bg};`];
      if (!isVisible) {
        parts.push("opacity: 0.1;");
      } else if (highlight) {
        const index = nodeIdToIndex.get(node.id);
        if (index !== undefined) {
          const outDist = highlight.outboundDist.get(index);
          const inDist = highlight.inboundDist.get(index);
          if (outDist === undefined && inDist === undefined) {
            parts.push("opacity: 0.1;");
          } else {
            const dist = Math.min(outDist ?? Infinity, inDist ?? Infinity);
            if (dist > 1) {
              parts.push(
                `opacity: ${Math.max(0.2, Math.pow(LABEL_OPACITY_DECAY, dist - 1))};`,
              );
            }
          }
        }
      }
      return parts.join(" ");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cosmograph as unknown as any)._renderLabels = function (): void {
      if (this._isLabelsDestroyed || !this._cosmos) return;
      const {
        _cosmos,
        _selectedNodesSet,
        _cosmographConfig: { showDynamicLabels, nodeLabelAccessor },
      } = this;
      let labels = [];
      const trackedNodesPositions = _cosmos.getTrackedNodePositionsMap();
      const nodeToLabelInfo = new Map<
        VouchNode,
        [string | undefined, [number, number] | undefined, number]
      >();
      if (showDynamicLabels) {
        const sampledNodesPositions = (
          this as RawCosmograph<VouchNode, VouchLink>
        ).getSampledNodePositionsMap();
        sampledNodesPositions?.forEach(
          (positions: [number, number], id: string) => {
            const node = _cosmos.graph.getNodeById(id);
            if (node)
              nodeToLabelInfo.set(node, [
                nodeLabelAccessor?.(node) ?? node.id,
                positions,
                0.7,
              ]);
          },
        );
      }
      this._nodesForTopLabels.forEach((node: VouchNode) => {
        nodeToLabelInfo.set(node, [
          this._trackedNodeToLabel.get(node),
          trackedNodesPositions.get(node.id),
          0.9,
        ]);
      });
      this._nodesForForcedLabels.forEach((node: VouchNode) => {
        nodeToLabelInfo.set(node, [
          this._trackedNodeToLabel.get(node),
          trackedNodesPositions.get(node.id),
          1.0,
        ]);
      });
      labels = [...nodeToLabelInfo.entries()].map(
        ([node, [text, positions, weight]]) => {
          const screenPosition = this.spaceToScreenPosition([
            positions?.[0] ?? 0,
            positions?.[1] ?? 0,
          ]) as [number, number];

          const isSelected = _selectedNodesSet?.has(node);
          const isVisible =
            isSelected ||
            this._nodesForForcedLabels.size === 0 ||
            this._nodesForForcedLabels.has(node);

          return {
            id: node.id,
            text: getNodeLabelText(node, text ?? ""),
            x: screenPosition[0],
            y: screenPosition[1],
            weight:
              this._nodesForForcedLabels.size > 0
                ? isVisible
                  ? 100 + (isSelected ? 100 : 0)
                  : 0.1
                : weight,
            shouldBeShown: isVisible,
            style: getNodeLabelStyle(node, isVisible),
            color: LABEL_COLOR,
            className: "vouch-label",
          };
        },
      );
      // Queue visible labels missing avatars for lazy fetching.
      for (const [node] of nodeToLabelInfo) {
        if (!getAvatar(node.id)) {
          pendingAvatarsRef.current.add(node.id);
        }
      }

      this._cssLabelsRenderer.setLabels(labels);
      this._cssLabelsRenderer.draw(true);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cosmograph as unknown as any)._renderLabelForHovered = function (
      node?: VouchNode,
      nodeSpacePosition?: [number, number],
    ): void {
      if (!this._cosmos) return;
      const {
        _cosmographConfig: { showHoveredNodeLabel, nodeLabelAccessor },
      } = this;
      if (this._isLabelsDestroyed) return;
      if (showHoveredNodeLabel && node && nodeSpacePosition) {
        const screenPosition = this.spaceToScreenPosition(
          nodeSpacePosition,
        ) as [number, number];
        this._hoveredCssLabel.setText(
          getNodeLabelText(node, nodeLabelAccessor?.(node) ?? node.id),
        );
        this._hoveredCssLabel.setVisibility(true);
        this._hoveredCssLabel.setPosition(screenPosition[0], screenPosition[1]);
        this._hoveredCssLabel.setClassName("vouch-label vouch-hovered-label");
        this._hoveredCssLabel.setStyle(getNodeLabelStyle(node, true));
        this._hoveredCssLabel.setColor(LABEL_COLOR);
      } else {
        this._hoveredCssLabel.setVisibility(false);
      }
      this._hoveredCssLabel.draw();
    };

    // Force an immediate label redraw so new avatars appear without
    // waiting for the next zoom/tick event from Cosmograph.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cosmograph as unknown as any)._renderLabels();
  }, [
    cosmograph,
    highlight,
    nodeIdToIndex,
    nodeColorFn,
    getAvatar,
    cacheVersion,
  ]);
}
