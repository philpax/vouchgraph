import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CosmographProvider,
  Cosmograph,
  prepareCosmographData,
  type CosmographRef,
  type CosmographConfig,
} from '@cosmograph/react';
import { useVouchGraph } from './hooks/useVouchGraph';

// Toggle this to show/hide the debug tuning panel
const SHOW_DEBUG_CONTROLS = new URLSearchParams(window.location.search).has('debugControls');

function hexToRgba(hex: string, alpha: number, darken: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * darken);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * darken);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * darken);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

interface SimParams {
  simulationGravity: number;
  simulationRepulsion: number;
  simulationFriction: number;
  simulationLinkSpring: number;
  simulationLinkDistance: number;
  simulationDecay: number;
  nodeSizeMin: number;
  nodeSizeMax: number;
  nodeSizeScale: number;
}

const DEFAULT_PARAMS: SimParams = {
  simulationGravity: 0.6,
  simulationRepulsion: 2,
  simulationFriction: 0.9,
  simulationLinkSpring: 0.3,
  simulationLinkDistance: 8,
  simulationDecay: 3000,
  nodeSizeMin: 8,
  nodeSizeMax: 16,
  nodeSizeScale: 3,
};

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS);
  const cosmographRef = useRef<CosmographRef>(undefined);
  const [cosmographConfig, setCosmographConfig] = useState<Partial<CosmographConfig> | null>(null);
  // Click highlight: BFS distances from clicked node
  const [highlight, setHighlight] = useState<{
    distances: Map<number, number>;
    center: number;
  } | null>(null);

  const { nodes, links, status, onIncremental } = useVouchGraph(
    params.nodeSizeMin,
    params.nodeSizeMax,
    params.nodeSizeScale,
  );

  // Build a map from point index to darkened background color for labels
  const labelStyleByIndex = useMemo(() => {
    const map = new Map<number, string>();
    nodes.forEach((node, i) => {
      map.set(i, `background: ${hexToRgba(node.color, 0.85, 0.35)}; color: white; padding: 2px 6px; border-radius: 4px;`);
    });
    return map;
  }, [nodes]);

  // Map node id → point index, and link index → [sourcePointIndex, targetPointIndex]
  const nodeIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const linkEndpoints = useMemo(() => {
    return links.map(l => [
      nodeIdToIndex.get(l.source) ?? -1,
      nodeIdToIndex.get(l.target) ?? -1,
    ] as [number, number]);
  }, [links, nodeIdToIndex]);

  // All highlight dimming goes through pointColorByFn — no selectPoints greyout.
  const hl = highlight;

  const pointLabelClassName = useCallback((_text: string, pointIndex: number) => {
    const baseStyle = labelStyleByIndex.get(pointIndex) ?? 'background: rgba(3,7,18,0.8); color: white; padding: 2px 6px; border-radius: 4px;';
    if (!hl) return baseStyle;
    const dist = hl.distances.get(pointIndex);
    if (dist === undefined) return baseStyle + ' opacity: 0.05;';
    const alpha = Math.max(0.2, Math.pow(0.8, dist));
    return baseStyle + ` opacity: ${alpha};`;
  }, [labelStyleByIndex, hl]);

  // Limit visible labels to highlighted nodes during click selection
  const showLabelsFor = useMemo(() => {
    if (!highlight) return undefined;
    // Show labels for nodes up to 2 hops away
    const ids: string[] = [];
    for (const [idx, dist] of highlight.distances) {
      if (dist <= 2 && idx < nodes.length) {
        ids.push(nodes[idx].id);
      }
    }
    return ids;
  }, [highlight, nodes]);
  const pointColorByFn = useCallback((colorHex: string, index?: number): string => {
    if (!hl || index === undefined) return colorHex;
    const dist = hl.distances.get(index);
    if (dist === undefined) {
      return hexToRgba(colorHex, 0.05, 0.15);
    }
    const alpha = Math.max(0.2, Math.pow(0.8, dist));
    return hexToRgba(colorHex, alpha, 1.0);
  }, [hl]);

  // Link color: use cluster color from the color column, dim on click highlight
  const linkColorByFn = useCallback((colorHex: string, index?: number): string => {
    // Default: show link in its cluster color
    const baseColor = hexToRgba(colorHex, 0.7, 0.9);
    if (!hl || index === undefined) return baseColor;

    const endpoints = linkEndpoints[index];
    if (!endpoints) return baseColor;
    const [srcIdx, tgtIdx] = endpoints;
    const srcDist = hl.distances.get(srcIdx);
    const tgtDist = hl.distances.get(tgtIdx);

    // Click: fade link based on the farther endpoint's distance
    if (srcDist === undefined || tgtDist === undefined) {
      return hexToRgba(colorHex, 0.03, 0.15);
    }
    const maxDist = Math.max(srcDist, tgtDist);
    const alpha = Math.max(0.05, 0.4 * Math.pow(0.8, maxDist));
    return hexToRgba(colorHex, alpha, 0.8);
  }, [hl, linkEndpoints]);

  // Prepare initial data once when backfill completes
  useEffect(() => {
    if (status.loading || nodes.length === 0 || cosmographConfig) return;

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
  }, [status.loading, nodes, links, cosmographConfig]);

  // Wire up incremental Jetstream updates to Cosmograph instance
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

  const progressPct = status.progress
    ? Math.round((status.progress.current / Math.max(status.progress.total, 1)) * 100)
    : 0;

  const updateParam = useCallback(<K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    setParams(p => ({ ...p, [key]: value }));
  }, []);

  const handleReheat = useCallback(() => {
    cosmographRef.current?.start();
  }, []);

  const handlePointClick = useCallback((index: number) => {
    const cosmo = cosmographRef.current;
    if (!cosmo) return;

    // BFS to find the entire connected component with distances
    const distances = new Map<number, number>();
    distances.set(index, 0);
    const queue = [index];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current)!;
      const neighbors = cosmo.getConnectedPointIndices(current) ?? [];
      for (const n of neighbors) {
        if (!distances.has(n)) {
          distances.set(n, currentDist + 1);
          queue.push(n);
        }
      }
    }
    setHighlight({ distances, center: index });
    cosmo.setFocusedPoint(index);
  }, []);

  const handleBackgroundClick = useCallback(() => {
    if (!highlight) return;
    setHighlight(null);
    cosmographRef.current?.setFocusedPoint(undefined);
  }, [highlight]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#030712' }}>
      {cosmographConfig && (
        <CosmographProvider>
          <Cosmograph
            ref={cosmographRef}
            style={{ width: '100%', height: '100%' }}
            {...cosmographConfig}
            showHoveredPointLabel
            showDynamicLabels={!showLabelsFor}
            showTopLabels={!showLabelsFor}
            showLabelsFor={showLabelsFor}
            pointLabelColor="rgba(255,255,255,0.9)"
            pointLabelClassName={pointLabelClassName}
            pointColorByFn={pointColorByFn}
            pointColorStrategy={undefined}
            backgroundColor="#030712"
            linkDefaultColor="rgba(255,255,255,0.15)"
            linkDefaultWidth={6}
            linkColorByFn={linkColorByFn}
            linkColorStrategy={undefined}
            linkDefaultArrows
            linkArrowsSizeScale={1.5}
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
      )}

      {/* Info panel - top right */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(3, 7, 18, 0.85)',
          borderRadius: 12,
          padding: '16px 20px',
          maxWidth: 320,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 14,
          lineHeight: 1.5,
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>vouchgraph</div>
        <div>
          This is a live graph of all vouches on{' '}
          <a
            href="https://atvouch.dev"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#818cf8', textDecoration: 'underline' }}
          >
            atvouch.dev
          </a>
          . This may be taken down at any time: it is purely clientside with no caching, and is thus
          very inefficient.
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          {status.nodeCount} nodes · {status.edgeCount} edges
        </div>
        {status.error && (
          <div style={{ marginTop: 8, color: '#f87171', fontSize: 12 }}>{status.error}</div>
        )}
      </div>

      {/* Debug tuning panel - top left */}
      {SHOW_DEBUG_CONTROLS && !status.loading && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            background: 'rgba(3, 7, 18, 0.92)',
            borderRadius: 12,
            padding: '12px 16px',
            width: 300,
            color: 'rgba(255,255,255,0.85)',
            fontSize: 12,
            lineHeight: 1.8,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: 'monospace',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Debug Controls</div>

          <SliderControl label="gravity" value={params.simulationGravity} min={0} max={2} step={0.01}
            onChange={v => updateParam('simulationGravity', v)} />
          <SliderControl label="repulsion" value={params.simulationRepulsion} min={0} max={5} step={0.1}
            onChange={v => updateParam('simulationRepulsion', v)} />
          <SliderControl label="friction" value={params.simulationFriction} min={0} max={1} step={0.01}
            onChange={v => updateParam('simulationFriction', v)} />
          <SliderControl label="linkSpring" value={params.simulationLinkSpring} min={0} max={5} step={0.1}
            onChange={v => updateParam('simulationLinkSpring', v)} />
          <SliderControl label="linkDist" value={params.simulationLinkDistance} min={1} max={50} step={1}
            onChange={v => updateParam('simulationLinkDistance', v)} />
          <SliderControl label="decay" value={params.simulationDecay} min={100} max={20000} step={100}
            onChange={v => updateParam('simulationDecay', v)} />

          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
            <SliderControl label="sizeMin" value={params.nodeSizeMin} min={1} max={20} step={0.5}
              onChange={v => updateParam('nodeSizeMin', v)} />
            <SliderControl label="sizeMax" value={params.nodeSizeMax} min={5} max={50} step={1}
              onChange={v => updateParam('nodeSizeMax', v)} />
            <SliderControl label="sizeScale" value={params.nodeSizeScale} min={0.5} max={10} step={0.5}
              onChange={v => updateParam('nodeSizeScale', v)} />
          </div>

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              onClick={handleReheat}
              style={{
                flex: 1,
                padding: '6px 0',
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              Reheat
            </button>
            <button
              onClick={() => setParams(DEFAULT_PARAMS)}
              style={{
                flex: 1,
                padding: '6px 0',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'monospace',
              }}
            >
              Reset
            </button>
          </div>

          <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(params, null, 2))}
              style={{
                flex: 1,
                padding: '6px 0',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'monospace',
              }}
            >
              Copy JSON
            </button>
          </div>
        </div>
      )}

      {/* Progress bar - bottom */}
      {status.loading && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '8px 16px',
            background: 'rgba(3, 7, 18, 0.85)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              flex: 1,
              height: 4,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: '#6366f1',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <span>
            {status.progress?.phase === 'repos' ? 'Discovering repos...' : `${progressPct}%`}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: status.jetstreamConnected ? '#4ade80' : '#f87171',
              flexShrink: 0,
            }}
            title={status.jetstreamConnected ? 'Jetstream connected' : 'Jetstream disconnected'}
          />
        </div>
      )}

      {/* Jetstream status dot when not loading */}
      {!status.loading && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: status.jetstreamConnected ? '#4ade80' : '#f87171',
            }}
          />
          {status.jetstreamConnected ? 'Live' : 'Disconnected'}
        </div>
      )}
    </div>
  );
}

function SliderControl({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 80, flexShrink: 0, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: '#6366f1' }}
      />
      <span style={{ width: 48, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}
