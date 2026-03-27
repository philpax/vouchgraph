import { useEffect, useMemo, useRef, useState } from "react";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { VouchGraphStatus } from "../hooks/useVouchGraph";
import type { useProfileCache } from "../hooks/useProfileCache";
import type { Auth } from "../hooks/useAuth";
import { getHandle, setHandle } from "../lib/handle-resolver";
import { searchActorsTypeahead, type TypeaheadActor } from "../lib/api";
import { ProfileCard } from "./ProfileCard";
import { UserList, type UserListItem } from "./UserList";
import { VouchList } from "./VouchList";
import { SearchBar } from "./SearchBar";
import { LoginSection, PermissionNotice } from "./LoginSection";
import { VouchButton } from "./VouchButton";
import { useVouchBadge } from "../hooks/useVouchBadge";
import { PANEL_BG } from "./ui";

// ─── Types ──────────────────────────────────────────────────────────────────

type MobileTab = "info" | "selected" | "search";

interface InfoPanelProps {
  status: VouchGraphStatus;
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  nodeDids: string[];
  onSelectDid: (did: string) => void;
  onRebuild: () => void;
  profileCache: ReturnType<typeof useProfileCache>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
  auth: Auth;
  queueAutoRebuild: () => void;
  onZoomAfterRebuild?: (did: string) => void;
  nodeIdToIndex: Map<string, number>;
}

interface UnifiedSearchResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  onGraph: boolean;
}

const MAX_RESULTS = 8;

// ─── Shared small components ────────────────────────────────────────────────

function TabBar({
  tabs,
  activeTab,
  onTabChange,
  size = "sm",
}: {
  tabs: { key: string; label: string; static?: boolean }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  size?: "sm" | "xs";
}) {
  const py = size === "sm" ? "py-2.5" : "py-1.5";
  const hoverClass = size === "sm" ? "" : "hover:text-white/70";
  return (
    <div className={`flex text-${size} border-b border-white/10`}>
      {tabs.map((tab) =>
        tab.static ? (
          <button
            key={tab.key}
            className={`flex-1 ${py} cursor-pointer transition-colors text-white border-b border-white`}
          >
            {tab.label}
          </button>
        ) : (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 ${py} cursor-pointer transition-colors ${
              activeTab === tab.key
                ? "text-white border-b border-white"
                : `text-white/50 ${hoverClass}`
            }`}
          >
            {tab.label}
          </button>
        ),
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function searchResultsToItems(results: UnifiedSearchResult[]): UserListItem[] {
  return results.map((r) => ({
    did: r.did,
    handle: r.handle,
    displayName: r.displayName,
    avatar: r.avatar,
    badge: r.onGraph ? "on graph" : undefined,
  }));
}

// ─── Profile + Vouch section (shared between desktop & mobile) ──────────────
//
// Desktop ("inline"): ProfileCard + VouchButton always visible, vouch lists
// in inbound/outbound tabs below.
// Mobile ("tabs"): Profile/Inbound/Outbound as sub-tabs so each gets full
// height in the constrained mobile panel.

type ProfileSectionTab = "profile" | "inbound" | "outbound";

function ProfileSection({
  profile,
  profileLoading,
  vouchDetails,
  onSelectDid,
  profileCache,
  panelRef,
  onPreviewDid,
  onClearPreview,
  auth,
  queueAutoRebuild,
  onZoomAfterRebuild,
  nodeIdToIndex,
  layout = "inline",
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
  auth: Auth;
  queueAutoRebuild: () => void;
  onZoomAfterRebuild?: (did: string) => void;
  nodeIdToIndex: Map<string, number>;
  layout?: "inline" | "tabs";
}) {
  const [activeTab, setActiveTab] = useState<ProfileSectionTab>(
    layout === "tabs" ? "profile" : "inbound",
  );
  const badge = useVouchBadge(
    auth,
    profile?.did ?? "",
    vouchDetails,
    nodeIdToIndex,
  );

  if (profileLoading && !profile) {
    return <div className="text-sm text-white/50">Loading profile...</div>;
  }
  if (!profile) {
    return (
      <div className="text-sm text-white/30">
        Tap a node on the graph to see user details.
      </div>
    );
  }

  const vd = vouchDetails.get(profile.did);
  const inbound = vd?.inbound ?? [];
  const outbound = vd?.outbound ?? [];

  const vouchListProps = {
    onSelect: onSelectDid,
    profileCache,
    panelRef,
    onPreviewDid,
    onClearPreview,
  };

  if (layout === "tabs") {
    // Mobile: sub-tabs for Profile / Vouched by / Vouching for
    return (
      <div>
        <TabBar
          tabs={[
            { key: "profile", label: "Profile" },
            { key: "inbound", label: `Vouched by (${inbound.length})` },
            { key: "outbound", label: `Vouching for (${outbound.length})` },
          ]}
          activeTab={activeTab}
          onTabChange={(k) => setActiveTab(k as ProfileSectionTab)}
          size="xs"
        />
        <div className="mt-2">
          {activeTab === "profile" && (
            <>
              <ProfileCard profile={profile} badge={badge} />
              <VouchButton
                auth={auth}
                profile={profile}
                vouchDetails={vouchDetails}
                queueAutoRebuild={queueAutoRebuild}
                onZoomAfterRebuild={onZoomAfterRebuild}
              />
            </>
          )}
          {activeTab === "inbound" && (
            <VouchList dids={inbound} {...vouchListProps} />
          )}
          {activeTab === "outbound" && (
            <VouchList dids={outbound} {...vouchListProps} />
          )}
        </div>
      </div>
    );
  }

  // Desktop: profile card always visible with inbound/outbound vouch tabs
  return (
    <div>
      <ProfileCard profile={profile} badge={badge} />
      <VouchButton
        auth={auth}
        profile={profile}
        vouchDetails={vouchDetails}
        queueAutoRebuild={queueAutoRebuild}
      />
      <TabBar
        tabs={[
          { key: "inbound", label: `Vouched by (${inbound.length})` },
          { key: "outbound", label: `Vouching for (${outbound.length})` },
        ]}
        activeTab={activeTab}
        onTabChange={(k) => setActiveTab(k as ProfileSectionTab)}
        size="xs"
      />
      <VouchList
        dids={activeTab === "inbound" ? inbound : outbound}
        {...vouchListProps}
      />
    </div>
  );
}

// ─── Info content ───────────────────────────────────────────────────────────

function InfoContent({
  status,
  onRebuild,
  auth,
}: {
  status: VouchGraphStatus;
  onRebuild: () => void;
  auth: Auth;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 mb-2">
        <img src="./vouchgraph-icon.svg" alt="" className="w-9 h-9 shrink-0" />
        <div>
          <a
            href="https://github.com/philpax/vouchgraph"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-lg leading-tight text-indigo-400 no-underline hover:text-indigo-300 transition-colors"
          >
            vouchgraph
          </a>
          <div className="text-xs text-white/50">
            by{" "}
            <a href="#philpax.me" className="text-indigo-400 no-underline">
              @philpax.me
            </a>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div>
          A{" "}
          <span
            className="underline decoration-dotted cursor-help"
            title="Most graph visualisation libraries do not deal well with having their nodes and edges change on them. Forgive me."
          >
            semi-live
          </span>{" "}
          graph of all vouches
          {status.nodeCount > 0 && (
            <span className="text-white/50">
              {" "}
              ({status.nodeCount} accounts, {status.edgeCount} vouches)
            </span>
          )}{" "}
          on{" "}
          <a
            href="https://atvouch.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline"
          >
            atvouch.dev
          </a>
          .
        </div>
        {!auth.did && (
          <div className="flex flex-col gap-0.5">
            <div>
              Log in with Bluesky to vouch for people directly from the graph.
            </div>
            <PermissionNotice />
          </div>
        )}
        <LoginSection auth={auth} />
        {auth.error && <div className="text-red-400 text-xs">{auth.error}</div>}
        {status.pendingChanges && (
          <div className="text-xs text-white/50">
            {status.autoRebuildQueued ? (
              <span className="text-white/30">Rebuild queued...</span>
            ) : status.rebuilding ? (
              <span className="text-white/30">Rebuilding...</span>
            ) : (
              <button
                onClick={onRebuild}
                className="text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
              >
                Update with new data
              </button>
            )}
          </div>
        )}
        {status.error && (
          <div className="text-red-400 text-xs">{status.error}</div>
        )}
      </div>
    </>
  );
}

// ─── Main InfoPanel ─────────────────────────────────────────────────────────

export function InfoPanel({
  status,
  profile,
  profileLoading,
  vouchDetails,
  nodeDids,
  onSelectDid,
  onRebuild,
  profileCache,
  onPreviewDid,
  onClearPreview,
  auth,
  queueAutoRebuild,
  onZoomAfterRebuild,
  nodeIdToIndex,
}: InfoPanelProps) {
  const hasSelection = !!profile || profileLoading;
  const [mobileTabManual, setMobileTabManual] = useState<MobileTab | null>(
    null,
  );
  const [prevHasSelection, setPrevHasSelection] = useState(hasSelection);
  const panelRef = useRef<HTMLDivElement>(null);

  // Search state (lifted so mobile inline results and desktop dropdown share it)
  const [searchQuery, setSearchQuery] = useState("");
  const [typeaheadResults, setTypeaheadResults] = useState<TypeaheadActor[]>(
    [],
  );
  const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeaheadAbortRef = useRef<AbortController | null>(null);

  const graphResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: UnifiedSearchResult[] = [];
    for (const did of nodeDids) {
      const handle = getHandle(did) ?? did;
      if (handle.toLowerCase().includes(q) || did.toLowerCase().includes(q)) {
        matches.push({ did, handle, onGraph: true });
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [searchQuery, nodeDids]);

  // Debounced typeahead search
  useEffect(() => {
    if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    typeaheadAbortRef.current?.abort();
    const q = searchQuery.trim();
    if (q.length < 2) return;
    typeaheadTimerRef.current = setTimeout(async () => {
      const abort = new AbortController();
      typeaheadAbortRef.current = abort;
      try {
        const results = await searchActorsTypeahead(q, 8, abort.signal);
        if (!abort.signal.aborted) setTypeaheadResults(results);
      } catch {
        // ignore
      }
    }, 200);
    return () => {
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    };
  }, [searchQuery]);

  // Merge graph + typeahead results (UserList handles avatar fetching)
  const searchResults = useMemo(() => {
    const typeaheadByDid = new Map(typeaheadResults.map((r) => [r.did, r]));
    const graphDids = new Set(graphResults.map((r) => r.did));
    const enriched: UnifiedSearchResult[] = graphResults.map((r) => {
      const ta = typeaheadByDid.get(r.did);
      return {
        ...r,
        displayName: ta?.displayName ?? profileCache.getDisplayName(r.did),
        avatar: ta?.avatar ?? profileCache.getAvatar(r.did),
      };
    });
    const offGraph: UnifiedSearchResult[] = typeaheadResults
      .filter((r) => !graphDids.has(r.did))
      .slice(0, MAX_RESULTS - graphResults.length)
      .map((r) => ({
        did: r.did,
        handle: r.handle,
        displayName: r.displayName,
        avatar: r.avatar,
        onGraph: nodeIdToIndex.has(r.did),
      }));
    return [...enriched, ...offGraph];
  }, [graphResults, typeaheadResults, nodeIdToIndex, profileCache]);

  const clearSearch = () => {
    setSearchQuery("");
    setTypeaheadResults([]);
  };

  const handleSearchQueryChange = (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) setTypeaheadResults([]);
    if (q.trim()) {
      setMobileTabManual("search");
    } else if (mobileTabManual === "search") {
      setMobileTabManual(null);
    }
  };

  const selectSearchResult = (did: string) => {
    // Register handle from search results so URL uses handle, not DID
    const result = searchResults.find((r) => r.did === did);
    if (result && !getHandle(did)) setHandle(did, result.handle);
    clearSearch();
    setMobileTabManual(null);
    onSelectDid(did);
  };

  // Reset manual override when selection state changes
  if (hasSelection !== prevHasSelection) {
    setPrevHasSelection(hasSelection);
    setMobileTabManual(null);
  }

  const mobileTab = mobileTabManual ?? (hasSelection ? "selected" : "info");
  const setMobileTab = (tab: MobileTab) => {
    if (tab !== "search") clearSearch();
    setMobileTabManual(tab);
  };

  // Shared props for ProfileSection
  const profileSectionProps = {
    profile,
    profileLoading,
    vouchDetails,
    onSelectDid,
    profileCache,
    onPreviewDid,
    onClearPreview,
    auth,
    queueAutoRebuild,
    onZoomAfterRebuild,
    nodeIdToIndex,
  };

  const searchItems = searchResultsToItems(searchResults);

  return (
    <>
      {/* Desktop: overlay panel */}
      <div
        ref={panelRef}
        className={`hidden md:flex md:flex-col absolute top-4 left-4 ${PANEL_BG} rounded-xl max-w-80 text-white/85 text-sm leading-normal border border-white/10 pointer-events-auto`}
      >
        <div className="px-5 py-4">
          <InfoContent status={status} onRebuild={onRebuild} auth={auth} />
        </div>
        {!status.loading && (
          <SearchBar
            query={searchQuery}
            onQueryChange={(q) => {
              setSearchQuery(q);
              if (q.trim().length < 2) setTypeaheadResults([]);
            }}
            results={searchItems}
            onSelect={selectSearchResult}
            mode="dropdown"
            profileCache={profileCache}
          />
        )}
        {(profile || profileLoading) && (
          <div className="border-t border-white/10 px-5 py-4">
            <ProfileSection {...profileSectionProps} panelRef={panelRef} />
          </div>
        )}
      </div>

      {/* Mobile: bottom panel */}
      <div
        className={`md:hidden flex flex-col shrink-0 ${PANEL_BG} text-white/85 text-sm leading-normal border-t border-white/10 pointer-events-auto`}
      >
        {!status.loading && (
          <SearchBar
            query={searchQuery}
            onQueryChange={handleSearchQueryChange}
            results={searchItems}
            onSelect={selectSearchResult}
            mode="inline"
            profileCache={profileCache}
          />
        )}
        <TabBar
          tabs={[
            ...(mobileTab === "search"
              ? [{ key: "search", label: "Search", static: true }]
              : []),
            { key: "info", label: "Info" },
            { key: "selected", label: "Selected" },
          ]}
          activeTab={mobileTab}
          onTabChange={(k) => setMobileTab(k as MobileTab)}
        />
        <div
          className={`px-4 pb-3 h-56 overflow-y-auto ${mobileTab !== "selected" ? "pt-3" : ""}`}
        >
          {mobileTab === "search" ? (
            <UserList
              items={searchItems}
              profileCache={profileCache}
              onSelect={selectSearchResult}
            />
          ) : mobileTab === "info" ? (
            <InfoContent status={status} onRebuild={onRebuild} auth={auth} />
          ) : (
            <ProfileSection {...profileSectionProps} layout="tabs" />
          )}
        </div>
      </div>
    </>
  );
}
