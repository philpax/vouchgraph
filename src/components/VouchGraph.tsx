import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CosmographProvider,
  Cosmograph,
  prepareCosmographData,
  type CosmographRef,
  type CosmographConfig,
} from '@cosmograph/react';
import type { VouchNode, VouchLink, IncrementalUpdate } from '../hooks/useVouchGraph';
import type { SimParams } from './DebugControls';

const DATA_PREP_CONFIG = {
  points: {
    pointIdBy: 'id',
    pointLabelBy: 'label',
    pointColorBy: 'color',
    pointSizeBy: 'size',
    pointIncludeColumns: ['*'] as string[],
  },
  links: {
    linkSourceBy: 'source',
    linkTargetsBy: ['target'],
    linkColorBy: 'color',
    linkIncludeColumns: ['*'] as string[],
  },
};

interface VouchGraphProps {
  nodes: VouchNode[];
  links: VouchLink[];
  loading: boolean;
  params: SimParams;
  onIncremental: (cb: (update: IncrementalUpdate) => void) => void;
  showLabelsFor: string[] | undefined;
  pointLabelClassName: (text: string, pointIndex: number) => string;
  pointColorByFn: (colorHex: string, index?: number) => string;
  onPointClick: (index: number) => void;
  onBackgroundClick: () => void;
  onReheatRef?: React.MutableRefObject<(() => void) | null>;
}

export function VouchGraph({
  nodes, links, loading, params, onIncremental,
  showLabelsFor, pointLabelClassName, pointColorByFn,
  onPointClick, onBackgroundClick, onReheatRef,
}: VouchGraphProps) {
  const cosmographRef = useRef<CosmographRef>(undefined);
  const [cosmographConfig, setCosmographConfig] = useState<Partial<CosmographConfig> | null>(null);

  // Expose reheat to parent
  useEffect(() => {
    if (onReheatRef) {
      onReheatRef.current = () => cosmographRef.current?.start();
    }
  }, [onReheatRef]);

  // Prepare initial data once when backfill completes
  useEffect(() => {
    if (loading || nodes.length === 0 || cosmographConfig) return;

    let cancelled = false;

    (async () => {
      const result = await prepareCosmographData(DATA_PREP_CONFIG, nodes, links);
      if (cancelled || !result) return;

      setCosmographConfig({
        points: result.points,
        links: result.links,
        ...result.cosmographConfig,
      });
    })();

    return () => { cancelled = true; };
  }, [loading, nodes, links, cosmographConfig]);

  // Wire up incremental Jetstream updates
  useEffect(() => {
    onIncremental((update) => {
      const cosmo = cosmographRef.current;
      if (!cosmo) return;

      if (update.newNodes.length > 0) {
        cosmo.addPoints(update.newNodes.map(n => ({ id: n.id, label: n.label, color: n.color, size: n.size, cluster: n.cluster })));
      }
      if (update.newLinks.length > 0) {
        cosmo.addLinks(update.newLinks.map(l => ({ source: l.source, target: l.target })));
      }
      if (update.removedLinks.length > 0) {
        cosmo.removeLinksByPointIdPairs(update.removedLinks);
      }
    });
  }, [onIncremental]);

  const handlePointClick = useCallback((index: number) => {
    cosmographRef.current?.setFocusedPoint(index);
    onPointClick(index);
  }, [onPointClick]);

  const handleBackgroundClick = useCallback(() => {
    cosmographRef.current?.setFocusedPoint(undefined);
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
        backgroundColor="#030712"
        linkDefaultColor="rgba(255,255,255,0.6)"
        linkDefaultWidth={6}
        linkDefaultArrows
        linkArrowsSizeScale={3}
        fitViewOnInit
        fitViewDelay={1000}
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
