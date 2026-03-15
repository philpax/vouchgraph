import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { VouchGraphStatus } from "../hooks/useVouchGraph";
import type { useProfileCache } from "../hooks/useProfileCache";
import type { AuthState } from "../hooks/useAuth";
import { getHandle, setHandle, truncateHandle } from "../lib/handle-resolver";
import { searchActorsTypeahead, type TypeaheadActor } from "../lib/api";
import { createVouch, deleteVouch } from "../lib/vouch-actions";
import { ProfileCard } from "./ProfileCard";
import { VouchConfirmModal } from "./VouchConfirmModal";
import { Button, PANEL_BG } from "./ui";

type MobileTab = "info" | "selected" | "search";
type MobileSelectedSubTab = "profile" | "inbound" | "outbound";
type VouchTab = "inbound" | "outbound";

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
  auth: AuthState & {
    login: (handle: string) => Promise<void>;
    logout: () => Promise<void>;
  };
  queueAutoRebuild: () => void;
  nodeIdToIndex: Map<string, number>;
}

interface UnifiedSearchResult {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  onGraph: boolean;
}

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
  nodeIdToIndex,
}: InfoPanelProps) {
  const hasSelection = !!profile || profileLoading;
  const [mobileTabManual, setMobileTabManual] = useState<MobileTab | null>(
    null,
  );
  const [prevHasSelection, setPrevHasSelection] = useState(hasSelection);
  const panelRef = useRef<HTMLDivElement>(null);

  // Search state (lifted for mobile inline results)
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
    if (q.length < 2) {
      // Clear outside effect to satisfy react-hooks/set-state-in-effect
      return;
    }

    typeaheadTimerRef.current = setTimeout(async () => {
      const abort = new AbortController();
      typeaheadAbortRef.current = abort;
      try {
        const results = await searchActorsTypeahead(q, 8, abort.signal);
        if (!abort.signal.aborted) {
          setTypeaheadResults(results);
        }
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

  const handleSearchQueryChange = (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setTypeaheadResults([]);
    }
    if (q.trim()) {
      setMobileTabManual("search");
    } else if (mobileTabManual === "search") {
      setMobileTabManual(null);
    }
  };

  const selectSearchResult = (did: string) => {
    // Register handle from search results so URL uses handle, not DID
    const result = searchResults.find((r) => r.did === did);
    if (result && !getHandle(did)) {
      setHandle(did, result.handle);
    }
    setSearchQuery("");
    setTypeaheadResults([]);
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
    if (tab !== "search") {
      setSearchQuery("");
      setTypeaheadResults([]);
    }
    setMobileTabManual(tab);
  };

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
            results={searchResults}
            onSelect={selectSearchResult}
            mode="dropdown"
            profileCache={profileCache}
          />
        )}
        <DesktopUserContent
          profile={profile}
          profileLoading={profileLoading}
          vouchDetails={vouchDetails}
          onSelectDid={onSelectDid}
          profileCache={profileCache}
          panelRef={panelRef}
          onPreviewDid={onPreviewDid}
          onClearPreview={onClearPreview}
          auth={auth}
          queueAutoRebuild={queueAutoRebuild}
          nodeIdToIndex={nodeIdToIndex}
        />
      </div>

      {/* Mobile: bottom panel */}
      <div
        className={`md:hidden flex flex-col shrink-0 ${PANEL_BG} text-white/85 text-sm leading-normal border-t border-white/10 pointer-events-auto`}
      >
        {!status.loading && (
          <SearchBar
            query={searchQuery}
            onQueryChange={handleSearchQueryChange}
            results={searchResults}
            onSelect={selectSearchResult}
            mode="inline"
            profileCache={profileCache}
          />
        )}
        <div className="flex text-sm border-b border-white/10">
          {mobileTab === "search" && (
            <button className="flex-1 py-2.5 cursor-pointer transition-colors text-white border-b border-white">
              Search
            </button>
          )}
          <button
            onClick={() => setMobileTab("info")}
            className={`flex-1 py-2.5 cursor-pointer transition-colors ${
              mobileTab === "info"
                ? "text-white border-b border-white"
                : "text-white/50"
            }`}
          >
            Info
          </button>
          <button
            onClick={() => setMobileTab("selected")}
            className={`flex-1 py-2.5 cursor-pointer transition-colors ${
              mobileTab === "selected"
                ? "text-white border-b border-white"
                : "text-white/50"
            }`}
          >
            Selected
          </button>
        </div>
        <div className="px-4 py-3 h-56 overflow-y-auto">
          {mobileTab === "search" ? (
            <UserList
              items={searchResults.map((r) => ({
                did: r.did,
                handle: r.handle,
                displayName: r.displayName,
                avatar: r.avatar,
                badge: r.onGraph ? "on graph" : undefined,
              }))}
              profileCache={profileCache}
              onSelect={selectSearchResult}
            />
          ) : mobileTab === "info" ? (
            <InfoContent status={status} onRebuild={onRebuild} auth={auth} />
          ) : (
            <MobileSelectedContent
              profile={profile}
              profileLoading={profileLoading}
              vouchDetails={vouchDetails}
              onSelectDid={onSelectDid}
              profileCache={profileCache}
              onPreviewDid={onPreviewDid}
              onClearPreview={onClearPreview}
              auth={auth}
              queueAutoRebuild={queueAutoRebuild}
              nodeIdToIndex={nodeIdToIndex}
            />
          )}
        </div>
      </div>
    </>
  );
}

function LoginSection({ auth }: { auth: InfoPanelProps["auth"] }) {
  const [handle, setHandle] = useState("");
  const [suggestions, setSuggestions] = useState<TypeaheadActor[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanHandle = (v: string) => v.replace(/^@/, "");

  const doLogin = (h: string) => {
    const cleaned = cleanHandle(h).trim();
    if (cleaned) {
      setSuggestions([]);
      setShowSuggestions(false);
      auth.login(cleaned);
    }
  };

  const handleChange = (val: string) => {
    setHandle(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const q = cleanHandle(val).trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const abort = new AbortController();
      abortRef.current = abort;
      try {
        const results = await searchActorsTypeahead(q, 5, abort.signal);
        if (!abort.signal.aborted) setSuggestions(results);
      } catch {
        // ignore
      }
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  if (auth.loading) {
    return <div className="text-white/30">Restoring session...</div>;
  }

  if (auth.did) {
    const displayHandle = auth.handle ?? getHandle(auth.did);
    return (
      <div className="flex items-center gap-2">
        {displayHandle ? (
          <a
            href={`#${displayHandle}`}
            className="text-indigo-400 no-underline truncate"
          >
            @{displayHandle}
          </a>
        ) : (
          <span className="text-white/30 truncate">Loading...</span>
        )}
        <button
          onClick={() => auth.logout()}
          className="text-white/30 hover:text-white/50 cursor-pointer transition-colors shrink-0"
        >
          Log out
        </button>
      </div>
    );
  }

  const dropdownVisible =
    showSuggestions && suggestions.length > 0 && handle.trim().length >= 2;

  return (
    <form
      className="flex gap-2 relative"
      onSubmit={(e) => {
        e.preventDefault();
        doLogin(handle);
      }}
    >
      <div className="flex-1 min-w-0 relative">
        <input
          ref={inputRef}
          type="text"
          value={handle}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          }}
          placeholder="handle.bsky.social"
          className="w-full text-xs px-2 py-1.5 bg-white/10 border border-white/10 rounded text-white placeholder-white/30 outline-none focus:border-indigo-400/50"
        />
        {dropdownVisible && (
          <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded overflow-hidden z-10 top-full">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.did}
                onMouseDown={() => {
                  setHandle(s.handle);
                  setSuggestions([]);
                  setShowSuggestions(false);
                  doLogin(s.handle);
                }}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs hover:bg-white/10 cursor-pointer truncate"
              >
                {s.avatar ? (
                  <img
                    src={s.avatar}
                    alt=""
                    className="w-4 h-4 rounded-full shrink-0"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
                )}
                <span className="truncate">
                  {s.displayName && (
                    <span className="text-white/70 mr-1">{s.displayName}</span>
                  )}
                  <span className="text-indigo-400">@{s.handle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        disabled={!handle.trim()}
        className="shrink-0"
      >
        Log in
      </Button>
    </form>
  );
}

function useVouchBadge(
  auth: InfoPanelProps["auth"],
  profileDid: string,
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>,
  nodeIdToIndex: Map<string, number>,
) {
  const onGraph = nodeIdToIndex.has(profileDid);
  const pill = "text-[10px] px-1.5 py-0.5 rounded-full shrink-0 leading-none";

  if (!onGraph)
    return (
      <span className={`${pill} bg-white/10 text-white/40`}>not in graph</span>
    );

  if (!auth.did || auth.did === profileDid) return null;

  const myVouches = vouchDetails.get(auth.did);
  const iVouchThem = myVouches?.outbound.includes(profileDid) ?? false;
  const theyVouchMe = myVouches?.inbound.includes(profileDid) ?? false;

  if (iVouchThem && theyVouchMe)
    return (
      <span className={`${pill} bg-emerald-500/20 text-emerald-400`}>
        mutual
      </span>
    );
  if (iVouchThem)
    return (
      <span className={`${pill} bg-blue-500/20 text-blue-400`}>vouched</span>
    );
  if (theyVouchMe)
    return (
      <span className={`${pill} bg-orange-500/20 text-orange-400`}>
        vouches you
      </span>
    );
  return null;
}

function VouchButton({
  auth,
  profile,
  vouchDetails,
  queueAutoRebuild,
}: {
  auth: InfoPanelProps["auth"];
  profile: AppBskyActorDefs.ProfileViewDetailed;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  queueAutoRebuild: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [unvouching, setUnvouching] = useState(false);

  if (!auth.agent || !auth.did || auth.did === profile.did) return null;

  const myVouches = vouchDetails.get(auth.did);
  const isVouching = myVouches?.outbound.includes(profile.did) ?? false;

  const handleVouch = async () => {
    await createVouch(auth.agent!, profile.did);
    queueAutoRebuild();
    setShowModal(false);
  };

  const handleUnvouch = async () => {
    setUnvouching(true);
    try {
      await deleteVouch(auth.agent!, profile.did);
      queueAutoRebuild();
    } catch {
      // ignore
    } finally {
      setUnvouching(false);
    }
  };

  return (
    <>
      {isVouching ? (
        <Button
          variant="danger"
          onClick={handleUnvouch}
          disabled={unvouching}
          fullWidth
          className="mt-2"
        >
          {unvouching ? "Unvouching..." : "Unvouch"}
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => setShowModal(true)}
          fullWidth
          className="mt-2"
        >
          Vouch
        </Button>
      )}
      {showModal && (
        <VouchConfirmModal
          profile={profile}
          onConfirm={handleVouch}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function InfoContent({
  status,
  onRebuild,
  auth,
}: {
  status: VouchGraphStatus;
  onRebuild: () => void;
  auth: InfoPanelProps["auth"];
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 mb-2">
        <img src="./vouchgraph-icon.svg" alt="" className="w-9 h-9 shrink-0" />
        <div>
          <div className="font-bold text-lg leading-tight">vouchgraph</div>
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
              ({status.nodeCount} users, {status.edgeCount} vouches)
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
            <div className="text-white/50">
              Log in with Bluesky to vouch for people directly from the graph.
            </div>
            <LoginSection auth={auth} />
          </div>
        )}
        {auth.did && <LoginSection auth={auth} />}
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

/** Desktop: profile card with inline vouch tabs + lists */
function DesktopUserContent({
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
  nodeIdToIndex,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
  auth: InfoPanelProps["auth"];
  queueAutoRebuild: () => void;
  nodeIdToIndex: Map<string, number>;
}) {
  if (!profile && !profileLoading) return null;

  return (
    <div className="border-t border-white/10 px-5 py-4">
      {profileLoading && !profile && (
        <div className="text-sm text-white/50">Loading profile...</div>
      )}
      {profile && (
        <DesktopProfileCard
          profile={profile}
          vouchDetails={vouchDetails}
          onSelectDid={onSelectDid}
          profileCache={profileCache}
          panelRef={panelRef}
          onPreviewDid={onPreviewDid}
          onClearPreview={onClearPreview}
          auth={auth}
          queueAutoRebuild={queueAutoRebuild}
          nodeIdToIndex={nodeIdToIndex}
        />
      )}
    </div>
  );
}

/** Mobile "Selected" tab: sub-tabs for Profile / Vouched by / Vouching for */
function MobileSelectedContent({
  profile,
  profileLoading,
  vouchDetails,
  onSelectDid,
  profileCache,
  onPreviewDid,
  onClearPreview,
  auth,
  queueAutoRebuild,
  nodeIdToIndex,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
  auth: InfoPanelProps["auth"];
  queueAutoRebuild: () => void;
  nodeIdToIndex: Map<string, number>;
}) {
  const [subTab, setSubTab] = useState<MobileSelectedSubTab>("profile");
  const badge = useVouchBadge(
    auth,
    profile?.did ?? "",
    vouchDetails,
    nodeIdToIndex,
  );

  if (!profile && !profileLoading) {
    return (
      <div className="text-sm text-white/30">
        Tap a node on the graph to see user details.
      </div>
    );
  }

  if (profileLoading && !profile) {
    return <div className="text-sm text-white/50">Loading profile...</div>;
  }

  if (!profile) return null;

  const vd = vouchDetails.get(profile.did);
  const inbound = vd?.inbound ?? [];
  const outbound = vd?.outbound ?? [];

  return (
    <div>
      <div className="flex text-xs border-b border-white/10 mb-2">
        <button
          onClick={() => setSubTab("profile")}
          className={`flex-1 py-1.5 cursor-pointer transition-colors ${
            subTab === "profile"
              ? "text-white border-b border-white"
              : "text-white/50"
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setSubTab("inbound")}
          className={`flex-1 py-1.5 cursor-pointer transition-colors ${
            subTab === "inbound"
              ? "text-white border-b border-white"
              : "text-white/50"
          }`}
        >
          Vouched by ({inbound.length})
        </button>
        <button
          onClick={() => setSubTab("outbound")}
          className={`flex-1 py-1.5 cursor-pointer transition-colors ${
            subTab === "outbound"
              ? "text-white border-b border-white"
              : "text-white/50"
          }`}
        >
          Vouching for ({outbound.length})
        </button>
      </div>
      {subTab === "profile" && (
        <>
          <ProfileCard profile={profile} badge={badge} />
          <VouchButton
            auth={auth}
            profile={profile}
            vouchDetails={vouchDetails}
            queueAutoRebuild={queueAutoRebuild}
          />
        </>
      )}
      {subTab === "inbound" && (
        <VouchList
          dids={inbound}
          onSelect={onSelectDid}
          profileCache={profileCache}
          onPreviewDid={onPreviewDid}
          onClearPreview={onClearPreview}
        />
      )}
      {subTab === "outbound" && (
        <VouchList
          dids={outbound}
          onSelect={onSelectDid}
          profileCache={profileCache}
          onPreviewDid={onPreviewDid}
          onClearPreview={onClearPreview}
        />
      )}
    </div>
  );
}

/** Desktop: full profile card with inline vouch tabs */
function DesktopProfileCard({
  profile,
  vouchDetails,
  onSelectDid,
  profileCache,
  panelRef,
  onPreviewDid,
  onClearPreview,
  auth,
  queueAutoRebuild,
  nodeIdToIndex,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
  auth: InfoPanelProps["auth"];
  queueAutoRebuild: () => void;
  nodeIdToIndex: Map<string, number>;
}) {
  const [activeTab, setActiveTab] = useState<VouchTab>("inbound");
  const vd = vouchDetails.get(profile.did);
  const inbound = vd?.inbound ?? [];
  const outbound = vd?.outbound ?? [];
  const badge = useVouchBadge(auth, profile.did, vouchDetails, nodeIdToIndex);

  return (
    <div>
      <ProfileCard profile={profile} badge={badge} />
      <VouchButton
        auth={auth}
        profile={profile}
        vouchDetails={vouchDetails}
        queueAutoRebuild={queueAutoRebuild}
      />
      <div className="flex text-xs mt-2 border-b border-white/10">
        <button
          onClick={() => setActiveTab("inbound")}
          className={`flex-1 py-1 cursor-pointer transition-colors ${
            activeTab === "inbound"
              ? "text-white border-b border-white"
              : "text-white/50 hover:text-white/70"
          }`}
        >
          Vouched by ({inbound.length})
        </button>
        <button
          onClick={() => setActiveTab("outbound")}
          className={`flex-1 py-1 cursor-pointer transition-colors ${
            activeTab === "outbound"
              ? "text-white border-b border-white"
              : "text-white/50 hover:text-white/70"
          }`}
        >
          Vouching for ({outbound.length})
        </button>
      </div>
      <VouchList
        dids={activeTab === "inbound" ? inbound : outbound}
        onSelect={onSelectDid}
        profileCache={profileCache}
        panelRef={panelRef}
        onPreviewDid={onPreviewDid}
        onClearPreview={onClearPreview}
      />
    </div>
  );
}

const MAX_RESULTS = 8;

interface UserListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  badge?: string;
}

function UserRow({
  avatar,
  displayName,
  handle,
  badge,
  size = "sm",
}: {
  avatar?: string;
  displayName?: string;
  handle: string;
  badge?: string;
  size?: "sm" | "xs";
}) {
  const imgSize = size === "sm" ? "w-5 h-5" : "w-4 h-4";
  return (
    <>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className={`${imgSize} rounded-full shrink-0`}
        />
      ) : (
        <div className={`${imgSize} rounded-full bg-white/10 shrink-0`} />
      )}
      <span className="truncate">
        {displayName && (
          <span className="text-white/70 mr-1.5">{displayName}</span>
        )}
        <span className="text-indigo-400">@{truncateHandle(handle)}</span>
      </span>
      {badge && (
        <span className="text-[10px] text-white/30 shrink-0 ml-auto">
          {badge}
        </span>
      )}
    </>
  );
}

/**
 * Shared list of user rows with avatar batch-fetching.
 * Used by search results, search dropdown, and vouch lists.
 */
function UserList({
  items,
  profileCache,
  onSelect,
  onMouseDown,
  size = "sm",
  className,
  itemClassName,
  itemRef,
  onItemMouseEnter,
  onItemMouseLeave,
  emptyMessage = "No results",
}: {
  items: UserListItem[];
  profileCache: ReturnType<typeof useProfileCache>;
  onSelect?: (did: string) => void;
  onMouseDown?: (did: string) => void;
  size?: "sm" | "xs";
  className?: string;
  itemClassName?: string;
  itemRef?: (did: string, el: HTMLButtonElement | null) => void;
  onItemMouseEnter?: (did: string) => void;
  onItemMouseLeave?: (did: string) => void;
  emptyMessage?: string;
}) {
  // Batch-fetch avatars for items that don't already have one.
  // Use a joined string key to avoid re-firing when array reference changes
  // but content is the same.
  const didsToFetch = items.filter((i) => !i.avatar).map((i) => i.did);
  const fetchKey = didsToFetch.join(",");
  useEffect(() => {
    if (!fetchKey) return;
    const abort = new AbortController();
    profileCache.fetchBatch(fetchKey.split(","), abort.signal);
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, profileCache.fetchBatch]);

  if (items.length === 0) {
    return (
      <div className={className}>
        <div
          className={`text-sm text-white/30 italic ${itemClassName ? "px-3 py-1.5" : "py-0.5"}`}
        >
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((item) => {
        const avatar = item.avatar ?? profileCache.getAvatar(item.did);
        const displayName =
          item.displayName ?? profileCache.getDisplayName(item.did);
        return (
          <button
            key={item.did}
            ref={itemRef ? (el) => itemRef(item.did, el) : undefined}
            onClick={onSelect ? () => onSelect(item.did) : undefined}
            onMouseDown={onMouseDown ? () => onMouseDown(item.did) : undefined}
            onMouseEnter={
              onItemMouseEnter ? () => onItemMouseEnter(item.did) : undefined
            }
            onMouseLeave={
              onItemMouseLeave ? () => onItemMouseLeave(item.did) : undefined
            }
            className={
              itemClassName ??
              "flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 cursor-pointer truncate rounded"
            }
          >
            <UserRow
              avatar={avatar}
              displayName={displayName}
              handle={item.handle}
              badge={item.badge}
              size={size}
            />
          </button>
        );
      })}
    </div>
  );
}

function SearchBar({
  query,
  onQueryChange,
  results,
  onSelect,
  mode,
  profileCache,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  results: UnifiedSearchResult[];
  onSelect: (did: string) => void;
  mode: "dropdown" | "inline";
  profileCache: ReturnType<typeof useProfileCache>;
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectResult = (did: string) => {
    inputRef.current?.blur();
    onSelect(did);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      selectResult(results[0].did);
    }
    if (e.key === "Escape") {
      onQueryChange("");
      inputRef.current?.blur();
    }
  };

  const showDropdown = mode === "dropdown" && focused && query.trim();

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Search users..."
        className="w-full text-sm px-3 py-2.5 bg-white/10 text-white placeholder-white/30 outline-none"
      />
      {showDropdown && (
        <UserList
          items={results.map((r) => ({
            did: r.did,
            handle: r.handle,
            displayName: r.displayName,
            avatar: r.avatar,
            badge: r.onGraph ? "on graph" : undefined,
          }))}
          profileCache={profileCache}
          onMouseDown={selectResult}
          className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded overflow-hidden z-10 top-full"
          itemClassName="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 cursor-pointer truncate"
        />
      )}
    </div>
  );
}

/** How long the cursor must hover over a handle before fetching its profile. */
const HOVER_DELAY = 400;
/** Grace period after the cursor leaves the handle or popup before dismissing,
 *  allowing the user to move between the two without the popup disappearing. */
const COYOTE_TIME = 600;
/** Grace period before clearing the graph preview highlight. */
const PREVIEW_COYOTE_TIME = 250;

function clearTimer(
  ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

function VouchList({
  dids,
  onSelect,
  profileCache,
  panelRef,
  onPreviewDid,
  onClearPreview,
}: {
  dids: string[];
  onSelect: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
}) {
  const items = useMemo<UserListItem[]>(
    () => dids.map((did) => ({ did, handle: getHandle(did) ?? did })),
    [dids],
  );

  const [activeDid, setActiveDid] = useState<string | null>(null);
  const [hoverProfile, setHoverProfile] =
    useState<AppBskyActorDefs.ProfileViewDetailed | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coyoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewCoyoteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const popupRef = useRef<HTMLDivElement>(null);
  const onPopupRef = useRef(false);
  const onButtonRef = useRef<string | null>(null);

  const dismiss = useCallback(() => {
    clearTimer(hoverTimerRef);
    clearTimer(coyoteTimerRef);
    abortRef.current?.abort();
    abortRef.current = null;
    onPopupRef.current = false;
    onButtonRef.current = null;
    setActiveDid(null);
    setHoverProfile(null);
    setHoverLoading(false);
  }, []);

  const startCoyoteTimer = useCallback(() => {
    clearTimer(coyoteTimerRef);
    coyoteTimerRef.current = setTimeout(() => {
      coyoteTimerRef.current = null;
      if (!onPopupRef.current && !onButtonRef.current) {
        dismiss();
      }
    }, COYOTE_TIME);
  }, [dismiss]);

  const showPopup = useCallback(
    (did: string) => {
      clearTimer(coyoteTimerRef);

      const el = buttonRefs.current.get(did);
      const panelEl = panelRef?.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const panelRight = panelEl
          ? panelEl.getBoundingClientRect().right
          : rect.right;
        setPopupPos({ x: panelRight + 8, y: rect.top });
      }

      setActiveDid(did);

      const cached = profileCache.get(did);
      if (cached) {
        setHoverProfile(cached);
        setHoverLoading(false);
        return;
      }

      setHoverProfile(null);
      setHoverLoading(true);

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      profileCache.fetch(did, abort.signal).then((profile) => {
        if (!abort.signal.aborted) {
          setHoverProfile(profile);
          setHoverLoading(false);
        }
      });
    },
    [profileCache, panelRef],
  );

  const handleMouseEnter = useCallback(
    (did: string) => {
      onButtonRef.current = did;

      if (activeDid === did) {
        clearTimer(coyoteTimerRef);
        return;
      }

      clearTimer(hoverTimerRef);

      const cached = profileCache.get(did);
      if (cached) {
        showPopup(did);
        return;
      }

      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        showPopup(did);
      }, HOVER_DELAY);
    },
    [activeDid, profileCache, showPopup],
  );

  const handleMouseLeave = useCallback(() => {
    onButtonRef.current = null;
    clearTimer(hoverTimerRef);
    startCoyoteTimer();
  }, [startCoyoteTimer]);

  const handlePopupEnter = useCallback(() => {
    onPopupRef.current = true;
    clearTimer(coyoteTimerRef);
  }, []);

  const handlePopupLeave = useCallback(() => {
    onPopupRef.current = false;
    startCoyoteTimer();
  }, [startCoyoteTimer]);

  useEffect(() => {
    return () => {
      clearTimer(hoverTimerRef);
      clearTimer(coyoteTimerRef);
      clearTimer(previewCoyoteRef);
      abortRef.current?.abort();
    };
  }, []);

  const onItemMouseEnter = useCallback(
    (did: string) => {
      handleMouseEnter(did);
      clearTimer(previewCoyoteRef);
      onPreviewDid?.(did);
    },
    [handleMouseEnter, onPreviewDid],
  );

  const onItemMouseLeave = useCallback(() => {
    handleMouseLeave();
    clearTimer(previewCoyoteRef);
    previewCoyoteRef.current = setTimeout(() => {
      previewCoyoteRef.current = null;
      onClearPreview?.();
    }, PREVIEW_COYOTE_TIME);
  }, [handleMouseLeave, onClearPreview]);

  const showingPopup = activeDid && (hoverProfile || hoverLoading);

  return (
    <>
      <UserList
        items={items}
        profileCache={profileCache}
        onSelect={onSelect}
        size="xs"
        className="mt-1 max-h-40 overflow-y-auto text-sm"
        itemClassName="flex items-center gap-1.5 w-full text-left py-0.5 hover:bg-white/10 rounded cursor-pointer truncate"
        itemRef={(did, el) => {
          if (el) buttonRefs.current.set(did, el);
          else buttonRefs.current.delete(did);
        }}
        onItemMouseEnter={onItemMouseEnter}
        onItemMouseLeave={onItemMouseLeave}
      />
      {showingPopup &&
        createPortal(
          <div
            ref={popupRef}
            onMouseEnter={handlePopupEnter}
            onMouseLeave={handlePopupLeave}
            className={`hidden md:block fixed z-50 ${PANEL_BG} border border-white/10 rounded-lg px-3 py-2.5 w-64 text-white/85 text-sm leading-normal shadow-lg`}
            style={{
              left: popupPos.x,
              top: Math.max(8, popupPos.y - 8),
            }}
          >
            {hoverLoading && !hoverProfile ? (
              <div className="text-xs text-white/50">Loading...</div>
            ) : (
              hoverProfile && <ProfileCard profile={hoverProfile} compact />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
