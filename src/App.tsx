import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVouchGraph } from "./hooks/useVouchGraph";
import { useGraphHighlight } from "./hooks/useGraphHighlight";
import { useSelectedProfile } from "./hooks/useSelectedProfile";
import { useProfileCache } from "./hooks/useProfileCache";
import { VouchGraph } from "./components/VouchGraph";
import { InfoPanel } from "./components/InfoPanel";
import { DebugControls } from "./components/DebugControls";
import { DEFAULT_SIM_PARAMS, type SimParams } from "./lib/sim-params";
import { ProgressBar } from "./components/StatusBar";
import {
  getHandle,
  getDidByHandle,
  truncateHandle,
} from "./lib/handle-resolver";

const SHOW_DEBUG_CONTROLS = new URLSearchParams(window.location.search).has(
  "debugControls",
);

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);
  const reheatRef = useRef<(() => void) | null>(null);
  const focusNodeRef = useRef<((did: string | undefined) => void) | null>(null);

  const { cosmoNodes, cosmoLinks, allNodes, allLinks, status, rebuild } =
    useVouchGraph(params.nodeSizeMin, params.nodeSizeMax, params.nodeSizeScale);

  const {
    highlight,
    highlightNode,
    clearHighlight,
    vouchDetails,
    showLabelsFor,
    nodeColorFn,
    linkColorFn,
    nodeIdToIndex,
  } = useGraphHighlight(allNodes, allLinks);

  const {
    profile,
    loading: profileLoading,
    fetchProfile,
    clearProfile,
  } = useSelectedProfile();

  const profileCache = useProfileCache();

  const nodeDids = useMemo(() => allNodes.map((n) => n.id), [allNodes]);

  // Track the currently selected (clicked) DID so preview can restore it
  const selectedDidRef = useRef<string | undefined>(undefined);

  const selectNode = useCallback(
    (did: string) => {
      const index = nodeIdToIndex.get(did);
      if (index === undefined) return;
      selectedDidRef.current = did;
      highlightNode(index);
      focusNodeRef.current?.(did);
      const node = allNodes[index];
      if (node) {
        fetchProfile(node.id);
        const handle = getHandle(node.id) ?? node.id;
        window.history.pushState(null, "", `#${handle}`);
        document.title = `vouchgraph: ${truncateHandle(handle)}`;
      }
    },
    [highlightNode, allNodes, fetchProfile, nodeIdToIndex],
  );

  const previewNode = useCallback(
    (did: string) => {
      const index = nodeIdToIndex.get(did);
      if (index === undefined) return;
      highlightNode(index);
      focusNodeRef.current?.(did);
      if (!selectedDidRef.current) {
        fetchProfile(did);
      }
    },
    [highlightNode, nodeIdToIndex, fetchProfile],
  );

  const clearPreview = useCallback(() => {
    const sel = selectedDidRef.current;
    if (sel) {
      const index = nodeIdToIndex.get(sel);
      if (index !== undefined) {
        highlightNode(index);
        focusNodeRef.current?.(sel);
        return;
      }
    }
    clearHighlight();
    clearProfile();
    focusNodeRef.current?.(undefined);
  }, [highlightNode, clearHighlight, clearProfile, nodeIdToIndex]);

  const handleBackgroundClick = useCallback(() => {
    if (!highlight) return;
    selectedDidRef.current = undefined;
    clearHighlight();
    clearProfile();
    focusNodeRef.current?.(undefined);
    window.history.pushState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    document.title = "vouchgraph";
  }, [highlight, clearHighlight, clearProfile]);

  // Sync selection from URL hash (initial load + back/forward navigation)
  useEffect(() => {
    if (status.loading || allNodes.length === 0) return;

    const selectFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) {
        // Hash cleared (e.g. back to no selection)
        selectedDidRef.current = undefined;
        clearHighlight();
        clearProfile();
        focusNodeRef.current?.(undefined);
        document.title = "vouchgraph";
        return;
      }

      // Try as DID first, then as handle
      let did = nodeIdToIndex.has(hash) ? hash : undefined;
      if (!did) did = getDidByHandle(hash);
      if (!did) return;

      // Avoid re-selecting the same node
      if (did === selectedDidRef.current) return;

      const index = nodeIdToIndex.get(did);
      if (index === undefined) return;
      selectedDidRef.current = did;
      highlightNode(index);
      focusNodeRef.current?.(did);
      fetchProfile(did);
      const handle = getHandle(did) ?? did;
      document.title = `vouchgraph: ${truncateHandle(handle)}`;
    };

    selectFromHash();

    window.addEventListener("popstate", selectFromHash);
    return () => window.removeEventListener("popstate", selectFromHash);
  }, [
    status.loading,
    allNodes,
    nodeIdToIndex,
    highlightNode,
    fetchProfile,
    clearHighlight,
    clearProfile,
  ]);

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
          highlight={highlight}
          nodeIdToIndex={nodeIdToIndex}
          nodeColorFn={nodeColorFn}
          linkColorFn={linkColorFn}
          onNodeClick={selectNode}
          onNodeHover={previewNode}
          onNodeHoverEnd={clearPreview}
          onFocusNodeRef={focusNodeRef}
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
        onSelectDid={selectNode}
        onRebuild={rebuild}
        profileCache={profileCache}
        onPreviewDid={previewNode}
        onClearPreview={clearPreview}
      />
    </div>
  );
}
