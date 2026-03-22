import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVouchGraph } from "./hooks/useVouchGraph";
import { useGraphHighlight } from "./hooks/useGraphHighlight";
import { useSelectedProfile } from "./hooks/useSelectedProfile";
import { useProfileCache } from "./hooks/useProfileCache";
import { useAuth } from "./hooks/useAuth";
import { VouchGraph, FIT_VIEW_DURATION } from "./components/VouchGraph";
import { InfoPanel } from "./components/InfoPanel";
import { DebugControls } from "./components/DebugControls";
import { DEFAULT_SIM_PARAMS, type SimParams } from "./lib/sim-params";
import { ProgressBar } from "./components/StatusBar";
import {
  getHandle,
  getDidByHandle,
  truncateHandle,
  setHandle,
} from "./lib/handle-resolver";
import { publicClient } from "./lib/api";

const SHOW_DEBUG_CONTROLS = new URLSearchParams(window.location.search).has(
  "debugControls",
);

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);
  const reheatRef = useRef<(() => void) | null>(null);
  const focusNodeRef = useRef<((did: string | undefined) => void) | null>(null);
  const fitViewRef = useRef<
    ((duration?: number, nodeIds?: string[]) => void) | null
  >(null);
  /** Node IDs to focus on after the next rebuild (e.g. vouch source + target). */
  const fitViewNodesRef = useRef<string[] | null>(null);

  const auth = useAuth();

  const {
    cosmoNodes,
    cosmoLinks,
    allNodes,
    allLinks,
    status,
    rebuild,
    queueAutoRebuild,
  } = useVouchGraph(
    params.nodeSizeMin,
    params.nodeSizeMax,
    params.nodeSizeScale,
  );

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

  const profileCache = useProfileCache();
  const profileCacheRef = useRef(profileCache);
  useEffect(() => {
    profileCacheRef.current = profileCache;
  }, [profileCache]);

  const {
    profile,
    loading: profileLoading,
    fetchProfile,
    clearProfile,
  } = useSelectedProfile(profileCache);

  const nodeDids = useMemo(() => allNodes.map((n) => n.id), [allNodes]);

  // Track the currently selected (clicked) DID so preview can restore it
  const selectedDidRef = useRef<string | undefined>(undefined);

  const selectNode = useCallback(
    (did: string) => {
      const index = nodeIdToIndex.get(did);
      const handle = getHandle(did) ?? did;
      if (index !== undefined) {
        // On-graph node
        selectedDidRef.current = did;
        highlightNode(index);
        focusNodeRef.current?.(did);
        fetchProfile(did);
      } else {
        // Off-graph node — show profile without graph highlighting
        selectedDidRef.current = did;
        clearHighlight();
        focusNodeRef.current?.(undefined);
        fetchProfile(did);
      }
      window.history.pushState(null, "", `#${handle}`);
      document.title = `vouchgraph: ${truncateHandle(handle)}`;
    },
    [highlightNode, clearHighlight, fetchProfile, nodeIdToIndex],
  );

  const previewNode = useCallback(
    (did: string) => {
      const index = nodeIdToIndex.get(did);
      if (index === undefined) return;
      highlightNode(index);
      focusNodeRef.current?.(did);
      if (!selectedDidRef.current) {
        fetchProfile(did);
      } else {
        // Still fetch into cache so the graph label gets an avatar
        profileCacheRef.current.fetch(did);
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
  }, [clearHighlight, clearProfile]);

  // Auto-select own node on login when no hash is set
  const autoSelectedRef = useRef(false);

  // Sync selection from URL hash (initial load + back/forward navigation)
  useEffect(() => {
    if (status.loading || allNodes.length === 0) return;

    const selectFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) {
        // Hash cleared (e.g. back to no selection)
        // Auto-select own node if logged in and on graph
        if (
          auth.did &&
          !autoSelectedRef.current &&
          nodeIdToIndex.has(auth.did)
        ) {
          autoSelectedRef.current = true;
          selectNode(auth.did);
          return;
        }

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
      // Also try as a raw DID for off-graph users
      if (!did && hash.startsWith("did:")) did = hash;

      if (!did) {
        // Hash might be an off-graph handle — resolve it async
        resolveOffGraphHandle(hash);
        return;
      }

      // Avoid re-selecting the same node
      if (did === selectedDidRef.current) return;

      selectNode(did);
    };

    const resolveOffGraphHandle = async (handle: string) => {
      // Looks like a handle (contains a dot, doesn't start with did:)
      if (!handle.includes(".") || handle.startsWith("did:")) return;
      try {
        const res = await publicClient.get(
          "com.atproto.identity.resolveHandle",
          { params: { handle: handle as `${string}.${string}` } },
        );
        if (res.ok) {
          const resolved = (res.data as unknown as { did: string }).did;
          setHandle(resolved, handle);
          selectNode(resolved);
        }
      } catch {
        // Handle not found
      }
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
    auth.did,
    selectNode,
  ]);

  // Re-highlight selected node after graph rebuild if its on-graph status changed
  useEffect(() => {
    const did = selectedDidRef.current;
    if (!did) return;
    const index = nodeIdToIndex.get(did);
    if (index !== undefined) {
      // Node is (now) on-graph — ensure it's highlighted
      highlightNode(index);
      focusNodeRef.current?.(did);
    }
  }, [nodeIdToIndex, highlightNode]);

  // Fit view after rebuild completes
  const wasRebuildingRef = useRef(false);
  useEffect(() => {
    if (status.rebuilding) {
      wasRebuildingRef.current = true;
    } else if (wasRebuildingRef.current) {
      wasRebuildingRef.current = false;
      const nodeIds = fitViewNodesRef.current;
      fitViewNodesRef.current = null;
      setTimeout(
        () => fitViewRef.current?.(FIT_VIEW_DURATION, nodeIds ?? undefined),
        FIT_VIEW_DURATION,
      );
    }
  }, [status.rebuilding]);

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
          getAvatar={profileCache.getAvatar}
          fetchAvatarBatch={profileCache.fetchBatch}
          cacheVersion={profileCache.cacheVersion}
          onNodeClick={selectNode}
          onNodeHover={previewNode}
          onNodeHoverEnd={clearPreview}
          onFocusNodeRef={focusNodeRef}
          onBackgroundClick={handleBackgroundClick}
          onReheatRef={reheatRef}
          onFitViewRef={fitViewRef}
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
        auth={auth}
        queueAutoRebuild={queueAutoRebuild}
        onFitViewNodes={(ids) => {
          fitViewNodesRef.current = ids;
        }}
        nodeIdToIndex={nodeIdToIndex}
      />
    </div>
  );
}
