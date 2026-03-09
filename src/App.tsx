import { useCallback, useRef, useState } from 'react';
import { useVouchGraph } from './hooks/useVouchGraph';
import { useGraphHighlight } from './hooks/useGraphHighlight';
import { useSelectedProfile } from './hooks/useSelectedProfile';
import { VouchGraph } from './components/VouchGraph';
import { InfoPanel } from './components/InfoPanel';
import { DebugControls, DEFAULT_SIM_PARAMS, type SimParams } from './components/DebugControls';
import { ProgressBar, JetstreamStatus } from './components/StatusBar';

const SHOW_DEBUG_CONTROLS = new URLSearchParams(window.location.search).has('debugControls');

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);
  const reheatRef = useRef<(() => void) | null>(null);

  const { nodes, links, status, onIncremental } = useVouchGraph(
    params.nodeSizeMin,
    params.nodeSizeMax,
    params.nodeSizeScale,
  );

  const {
    highlight,
    highlightNode,
    clearHighlight,
    vouchCounts,
    pointLabelClassName,
    showLabelsFor,
    pointColorByFn,
  } = useGraphHighlight(nodes, links);

  const { profile, loading: profileLoading, fetchProfile, clearProfile } = useSelectedProfile();

  const handlePointClick = useCallback((index: number) => {
    highlightNode(index);
    const node = nodes[index];
    if (node) fetchProfile(node.id);
  }, [highlightNode, nodes, fetchProfile]);

  const handleBackgroundClick = useCallback(() => {
    if (!highlight) return;
    clearHighlight();
    clearProfile();
  }, [highlight, clearHighlight, clearProfile]);

  const handleReheat = useCallback(() => {
    reheatRef.current?.();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#030712' }}>
      <VouchGraph
        nodes={nodes}
        links={links}
        loading={status.loading}
        params={params}
        onIncremental={onIncremental}
        showLabelsFor={showLabelsFor}
        pointLabelClassName={pointLabelClassName}
        pointColorByFn={pointColorByFn}
        onPointClick={handlePointClick}
        onBackgroundClick={handleBackgroundClick}
        onReheatRef={reheatRef}
      />

      <InfoPanel
        status={status}
        profile={profile}
        profileLoading={profileLoading}
        vouchCounts={vouchCounts}
      />

      {SHOW_DEBUG_CONTROLS && !status.loading && (
        <DebugControls params={params} onParamsChange={setParams} onReheat={handleReheat} />
      )}

      {status.loading && <ProgressBar status={status} />}
      {!status.loading && <JetstreamStatus connected={status.jetstreamConnected} />}
    </div>
  );
}
