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
import { ProgressBar } from "./components/StatusBar";

const SHOW_DEBUG_CONTROLS = new URLSearchParams(window.location.search).has(
  "debugControls",
);

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);
  const reheatRef = useRef<(() => void) | null>(null);
  const focusPointRef = useRef<((index: number | undefined) => void) | null>(
    null,
  );

  const { cosmoNodes, cosmoLinks, allNodes, allLinks, status, rebuild } =
    useVouchGraph(params.nodeSizeMin, params.nodeSizeMax, params.nodeSizeScale);

  const {
    highlight,
    highlightNode,
    clearHighlight,
    vouchDetails,
    pointLabelClassName,
    showLabelsFor,
    pointColorByFn,
    linkColorByFn,
  } = useGraphHighlight(allNodes, allLinks);

  const {
    profile,
    loading: profileLoading,
    fetchProfile,
    clearProfile,
  } = useSelectedProfile();

  const nodeDids = useMemo(() => allNodes.map((n) => n.id), [allNodes]);

  const nodeIdToIndex = useMemo(() => {
    const map = new Map<string, number>();
    allNodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [allNodes]);

  const selectNode = useCallback(
    (index: number) => {
      highlightNode(index);
      focusPointRef.current?.(index);
      const node = allNodes[index];
      if (node) fetchProfile(node.id);
    },
    [highlightNode, allNodes, fetchProfile],
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
        nodes={cosmoNodes}
        links={cosmoLinks}
        loading={status.loading}
        params={params}
        showLabelsFor={showLabelsFor}
        pointLabelClassName={pointLabelClassName}
        pointColorByFn={pointColorByFn}
        linkColorByFn={linkColorByFn}
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
        nodeDids={nodeDids}
        onSelectDid={handleSelectDid}
        onRebuild={rebuild}
      />

      {SHOW_DEBUG_CONTROLS && !status.loading && (
        <DebugControls
          params={params}
          onParamsChange={setParams}
          onReheat={handleReheat}
        />
      )}

      {status.loading && <ProgressBar status={status} />}
    </div>
  );
}
