import { useCallback, useEffect, useRef, useState } from "react";
import {
  CosmographProvider,
  Cosmograph,
  prepareCosmographData,
  type CosmographRef,
  type CosmographConfig,
} from "@cosmograph/react";
import type { VouchNode, VouchLink } from "../hooks/useVouchGraph";
import type { SimParams } from "./DebugControls";

const DATA_PREP_CONFIG = {
  points: {
    pointIdBy: "id",
    pointLabelBy: "label",
    pointColorBy: "color",
    pointSizeBy: "size",
    pointIncludeColumns: ["*"] as string[],
  },
  links: {
    linkSourceBy: "source",
    linkTargetsBy: ["target"],
    linkColorBy: "color",
    linkIncludeColumns: ["*"] as string[],
  },
};

interface VouchGraphProps {
  nodes: VouchNode[];
  links: VouchLink[];
  loading: boolean;
  params: SimParams;
  showLabelsFor: string[] | undefined;
  pointLabelClassName: (text: string, pointIndex: number) => string;
  pointColorByFn: (colorHex: string, index?: number) => string;
  linkColorByFn: (colorHex: string, index?: number) => string;
  onPointClick: (index: number) => void;
  onBackgroundClick: () => void;
  onReheatRef?: React.MutableRefObject<(() => void) | null>;
  onFocusPointRef?: React.MutableRefObject<
    ((index: number | undefined) => void) | null
  >;
}

export function VouchGraph({
  nodes,
  links,
  loading,
  params,
  showLabelsFor,
  pointLabelClassName,
  pointColorByFn,
  linkColorByFn,
  onPointClick,
  onBackgroundClick,
  onReheatRef,
  onFocusPointRef,
}: VouchGraphProps) {
  const cosmographRef = useRef<CosmographRef>(undefined);
  const [cosmographConfig, setCosmographConfig] =
    useState<Partial<CosmographConfig> | null>(null);

  // Expose reheat to parent
  useEffect(() => {
    if (onReheatRef) {
      onReheatRef.current = () => cosmographRef.current?.start();
    }
  }, [onReheatRef]);

  // Expose focus point to parent
  useEffect(() => {
    if (onFocusPointRef) {
      onFocusPointRef.current = (index) =>
        cosmographRef.current?.setFocusedPoint(index);
    }
  }, [onFocusPointRef]);

  // Prepare data when nodes/links change (initial load or rebuild)
  useEffect(() => {
    if (loading || nodes.length === 0) return;

    let cancelled = false;

    (async () => {
      const result = await prepareCosmographData(
        DATA_PREP_CONFIG,
        nodes,
        links,
      );
      if (cancelled || !result) return;

      setCosmographConfig({
        points: result.points,
        links: result.links,
        ...result.cosmographConfig,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, nodes, links]);

  const handlePointClick = useCallback(
    (index: number) => {
      onPointClick(index);
    },
    [onPointClick],
  );

  const handleBackgroundClick = useCallback(() => {
    onBackgroundClick();
  }, [onBackgroundClick]);

  if (!cosmographConfig) return null;

  return (
    <CosmographProvider>
      <Cosmograph
        ref={cosmographRef}
        className="w-full h-full"
        {...cosmographConfig}
        showHoveredPointLabel
        showDynamicLabels={!showLabelsFor}
        showTopLabels={!showLabelsFor}
        showLabelsFor={showLabelsFor}
        pointLabelColor="rgba(255,255,255,0.9)"
        pointLabelClassName={pointLabelClassName}
        pointColorByFn={pointColorByFn}
        linkColorByFn={linkColorByFn}
        backgroundColor="#030712"
        linkDefaultColor="rgba(255,255,255,0.6)"
        linkDefaultWidth={6}
        linkDefaultArrows
        linkArrowsSizeScale={3}
        fitViewOnInit
        fitViewDelay={2000}
        fitViewPadding={0.15}
        simulationGravity={params.simulationGravity}
        simulationRepulsion={params.simulationRepulsion}
        simulationFriction={params.simulationFriction}
        simulationLinkSpring={params.simulationLinkSpring}
        simulationLinkDistance={params.simulationLinkDistance}
        simulationDecay={params.simulationDecay}
        pointSizeRange={[params.nodeSizeMin, params.nodeSizeMax]}
        renderHoveredPointRing
        hoveredPointRingColor="#ffffff"
        onPointClick={handlePointClick}
        onBackgroundClick={handleBackgroundClick}
        disableLogging
      />
    </CosmographProvider>
  );
}
