import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CosmographProvider,
  Cosmograph,
  prepareCosmographData,
  type CosmographRef,
  type CosmographConfig,
} from '@cosmograph/react';
import { useVouchGraph } from './hooks/useVouchGraph';
import { publicClient } from './lib/api';
import type { AppBskyActorDefs } from '@atcute/bluesky/lexicons';
import type { Did } from '@atcute/lexicons';

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

  // Selected profile info
  const [selectedProfile, setSelectedProfile] = useState<AppBskyActorDefs.ProfileViewDetailed | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileAbortRef = useRef<AbortController | null>(null);

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

  // Outbound adjacency: source index → list of target indices
  // Also count inbound/outbound vouches per node ID
  const { outboundAdj, vouchCounts } = useMemo(() => {
    const adj = new Map<number, number[]>();
    const counts = new Map<string, { inbound: number; outbound: number }>();
    for (const l of links) {
      const srcIdx = nodeIdToIndex.get(l.source) ?? -1;
      const tgtIdx = nodeIdToIndex.get(l.target) ?? -1;
      if (srcIdx === -1 || tgtIdx === -1) continue;
      const list = adj.get(srcIdx);
      if (list) list.push(tgtIdx);
      else adj.set(srcIdx, [tgtIdx]);
      const src = counts.get(l.source) ?? { inbound: 0, outbound: 0 };
      src.outbound++;
      counts.set(l.source, src);
      const tgt = counts.get(l.target) ?? { inbound: 0, outbound: 0 };
      tgt.inbound++;
      counts.set(l.target, tgt);
    }
    return { outboundAdj: adj, vouchCounts: counts };
  }, [links, nodeIdToIndex]);

  // All highlight dimming goes through pointColorByFn — no selectPoints greyout.
  const hl = highlight;

  const pointLabelClassName = useCallback((_text: string, pointIndex: number) => {
    const baseStyle = labelStyleByIndex.get(pointIndex) ?? 'background: rgba(3,7,18,0.8); color: white; padding: 2px 6px; border-radius: 4px;';
    if (!hl) return baseStyle;
    const dist = hl.distances.get(pointIndex);
    if (dist === undefined) return baseStyle + ' opacity: 0.2; filter: brightness(0.4);';
    if (dist <= 1) return baseStyle;
    const alpha = Math.pow(0.25, dist - 1);
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
      // Non-highlighted: heavily dimmed
      return hexToRgba(colorHex, 0.06, 0.3);
    }
    if (dist <= 1) return colorHex;
    // Aggressive falloff: 0.25^(dist-1) — dist 2 = 0.25, dist 3 = 0.0625
    const alpha = Math.pow(0.25, dist - 1);
    return hexToRgba(colorHex, alpha, 1.0);
  }, [hl]);

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

    // BFS following only outbound edges (vouches FROM the clicked node)
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
    cosmo.setFocusedPoint(index);

    // Fetch profile
    const node = nodes[index];
    if (!node) return;
    profileAbortRef.current?.abort();
    const abort = new AbortController();
    profileAbortRef.current = abort;
    setProfileLoading(true);
    setSelectedProfile(null);
    publicClient.get('app.bsky.actor.getProfile', {
      params: { actor: node.id as Did },
      signal: abort.signal,
    }).then(res => {
      if (!abort.signal.aborted && res.ok) {
        setSelectedProfile(res.data);
      }
    }).catch(() => {}).finally(() => {
      if (!abort.signal.aborted) setProfileLoading(false);
    });
  }, [outboundAdj, nodes]);

  const handleBackgroundClick = useCallback(() => {
    if (!highlight) return;
    setHighlight(null);
    setSelectedProfile(null);
    profileAbortRef.current?.abort();
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

        {/* Selected profile card */}
        {(selectedProfile || profileLoading) && (
          <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
            {profileLoading && !selectedProfile && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Loading profile...</div>
            )}
            {selectedProfile && (
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  {selectedProfile.avatar && (
                    <img
                      src={selectedProfile.avatar}
                      alt=""
                      style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    {selectedProfile.displayName && (
                      <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedProfile.displayName}
                      </div>
                    )}
                    <a
                      href={`https://bsky.app/profile/${selectedProfile.handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#818cf8', fontSize: 12, textDecoration: 'none' }}
                    >
                      @{selectedProfile.handle}
                    </a>
                  </div>
                </div>
                {selectedProfile.description && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
                    {selectedProfile.description}
                  </div>
                )}
                {(() => {
                  const vc = vouchCounts.get(selectedProfile.did);
                  if (!vc) return null;
                  return (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <span>{vc.outbound} vouched for</span>
                      <span>{vc.inbound} vouched by</span>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                  {selectedProfile.followersCount != null && <span>{selectedProfile.followersCount} followers</span>}
                  {selectedProfile.followsCount != null && <span>{selectedProfile.followsCount} following</span>}
                  {selectedProfile.postsCount != null && <span>{selectedProfile.postsCount} posts</span>}
                </div>
              </div>
            )}
          </div>
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
