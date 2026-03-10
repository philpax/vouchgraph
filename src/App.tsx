import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVouchGraph } from "./hooks/useVouchGraph";
import { useGraphHighlight } from "./hooks/useGraphHighlight";
import { useSelectedProfile } from "./hooks/useSelectedProfile";
import { VouchGraph } from "./components/VouchGraph";
import { InfoPanel } from "./components/InfoPanel";
import { DebugControls } from "./components/DebugControls";
import { DEFAULT_SIM_PARAMS, type SimParams } from "./lib/sim-params";
import { ProgressBar } from "./components/StatusBar";
import { getHandle, getDidByHandle } from "./lib/handle-resolver";

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
      if (node) {
        fetchProfile(node.id);
        const handle = getHandle(node.id) ?? node.id;
        window.history.replaceState(null, "", `#${handle}`);
      }
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
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }, [highlight, clearHighlight, clearProfile]);

  // Sync selection from URL hash
  useEffect(() => {
    if (status.loading || allNodes.length === 0) return;

    const selectFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;

      // Try as DID first, then as handle
      let did = nodeIdToIndex.has(hash) ? hash : undefined;
      if (!did) did = getDidByHandle(hash);
      if (!did) return;

      const index = nodeIdToIndex.get(did);
      if (index !== undefined) selectNode(index);
    };

    selectFromHash();

    window.addEventListener("hashchange", selectFromHash);
    return () => window.removeEventListener("hashchange", selectFromHash);
  }, [status.loading, allNodes, nodeIdToIndex, selectNode]);

  const handleReheat = useCallback(() => {
    reheatRef.current?.();
  }, []);

  return (
    <div className="w-screen h-dvh flex flex-col md:block bg-gray-950 overflow-hidden">
      <div className="flex-1 min-h-0 relative md:w-full md:h-full">
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

        {SHOW_DEBUG_CONTROLS && !status.loading && (
          <DebugControls
            params={params}
            onParamsChange={setParams}
            onReheat={handleReheat}
          />
        )}

        {status.loading && <ProgressBar status={status} />}
      </div>

      <InfoPanel
        status={status}
        profile={profile}
        profileLoading={profileLoading}
        vouchDetails={vouchDetails}
        nodeDids={nodeDids}
        onSelectDid={handleSelectDid}
        onRebuild={rebuild}
      />
    </div>
  );
}
