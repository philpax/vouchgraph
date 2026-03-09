import { useCallback, useMemo, useRef, useState } from "react";
import { useVouchGraph } from "./hooks/useVouchGraph";
import { useGraphHighlight } from "./hooks/useGraphHighlight";
import { useSelectedProfile } from "./hooks/useSelectedProfile";
import { VouchGraph } from "./components/VouchGraph";
import { InfoPanel } from "./components/InfoPanel";
import {
  DebugControls,
  DEFAULT_SIM_PARAMS,
  type SimParams,
} from "./components/DebugControls";
import { ProgressBar, JetstreamStatus } from "./components/StatusBar";

const SHOW_DEBUG_CONTROLS = new URLSearchParams(window.location.search).has(
  "debugControls",
);

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);
  const reheatRef = useRef<(() => void) | null>(null);
  const focusPointRef = useRef<((index: number | undefined) => void) | null>(
    null,
  );

  const { nodes, links, status, onIncremental } = useVouchGraph(
    params.nodeSizeMin,
    params.nodeSizeMax,
    params.nodeSizeScale,
  );

  const {
    highlight,
    highlightNode,
    clearHighlight,
    vouchDetails,
    pointLabelClassName,
    showLabelsFor,
    pointColorByFn,
  } = useGraphHighlight(nodes, links);

  const {
    profile,
    loading: profileLoading,
    fetchProfile,
    clearProfile,
  } = useSelectedProfile();

  const nodeIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const selectNode = useCallback(
    (index: number) => {
      highlightNode(index);
      focusPointRef.current?.(index);
      const node = nodes[index];
      if (node) fetchProfile(node.id);
    },
    [highlightNode, nodes, fetchProfile],
  );

  const handleSelectDid = useCallback(
    (did: string) => {
      const index = nodeIdToIndex.get(did);
      if (index !== undefined) selectNode(index);
    },
    [nodeIdToIndex, selectNode],
  );

  const handleBackgroundClick = useCallback(() => {
    if (!highlight) return;
    clearHighlight();
    clearProfile();
    focusPointRef.current?.(undefined);
  }, [highlight, clearHighlight, clearProfile]);

  const handleReheat = useCallback(() => {
    reheatRef.current?.();
  }, []);

  return (
    <div className="w-screen h-screen relative bg-gray-950">
      <VouchGraph
        nodes={nodes}
        links={links}
        loading={status.loading}
        params={params}
        onIncremental={onIncremental}
        showLabelsFor={showLabelsFor}
        pointLabelClassName={pointLabelClassName}
        pointColorByFn={pointColorByFn}
        onPointClick={selectNode}
        onFocusPointRef={focusPointRef}
        onBackgroundClick={handleBackgroundClick}
        onReheatRef={reheatRef}
      />

      <InfoPanel
        status={status}
        profile={profile}
        profileLoading={profileLoading}
        vouchDetails={vouchDetails}
        onSelectDid={handleSelectDid}
      />

      {SHOW_DEBUG_CONTROLS && !status.loading && (
        <DebugControls
          params={params}
          onParamsChange={setParams}
          onReheat={handleReheat}
        />
      )}

      {status.loading && <ProgressBar status={status} />}
      {!status.loading && (
        <JetstreamStatus connected={status.jetstreamConnected} />
      )}
    </div>
  );
}
