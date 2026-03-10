import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { VouchGraphStatus } from "../hooks/useVouchGraph";
import type { useProfileCache } from "../hooks/useProfileCache";
import { getHandle } from "../lib/handle-resolver";
import { ProfileCard } from "./ProfileCard";

type MobileTab = "info" | "selected";
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
}: InfoPanelProps) {
  const hasSelection = !!profile || profileLoading;
  const [mobileTabManual, setMobileTabManual] = useState<MobileTab | null>(
    null,
  );
  const [prevHasSelection, setPrevHasSelection] = useState(hasSelection);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset manual override when selection state changes
  if (hasSelection !== prevHasSelection) {
    setPrevHasSelection(hasSelection);
    setMobileTabManual(null);
  }

  const mobileTab = mobileTabManual ?? (hasSelection ? "selected" : "info");
  const setMobileTab = setMobileTabManual;

  return (
    <>
      {/* Desktop: overlay panel */}
      <div
        ref={panelRef}
        className="hidden md:block absolute top-4 left-4 bg-gray-950/85 backdrop-blur rounded-xl px-5 py-4 max-w-80 text-white/85 text-sm leading-normal border border-white/10 pointer-events-auto"
      >
        <InfoContent status={status} onRebuild={onRebuild} />
        {!status.loading && (
          <SearchBar nodeDids={nodeDids} onSelect={onSelectDid} />
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
        />
      </div>

      {/* Mobile: bottom panel */}
      <div className="md:hidden flex flex-col shrink-0 overflow-hidden bg-gray-950/95 backdrop-blur text-white/85 text-sm leading-normal border-t border-white/10 pointer-events-auto">
        {!status.loading && (
          <div className="px-4 pt-3 pb-1">
            <SearchBar nodeDids={nodeDids} onSelect={onSelectDid} />
          </div>
        )}
        <div className="flex text-sm border-b border-white/10">
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
          {mobileTab === "info" ? (
            <InfoContent status={status} onRebuild={onRebuild} />
          ) : (
            <MobileSelectedContent
              profile={profile}
              profileLoading={profileLoading}
              vouchDetails={vouchDetails}
              onSelectDid={onSelectDid}
              profileCache={profileCache}
              onPreviewDid={onPreviewDid}
              onClearPreview={onClearPreview}
            />
          )}
        </div>
      </div>
    </>
  );
}

function InfoContent({
  status,
  onRebuild,
}: {
  status: VouchGraphStatus;
  onRebuild: () => void;
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
      <div>
        A{" "}
        <span
          className="underline decoration-dotted cursor-help"
          title="Most graph visualisation libraries do not deal well with having their nodes and edges change on them. Forgive me."
        >
          semi-live
        </span>{" "}
        graph of all vouches on{" "}
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
      <div className="mt-2 text-xs text-white/50 flex items-center gap-2">
        <span>
          {status.nodeCount} nodes · {status.edgeCount} edges
        </span>
        {status.pendingChanges &&
          (status.rebuilding ? (
            <span className="text-white/30">Rebuilding...</span>
          ) : (
            <button
              onClick={onRebuild}
              className="text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
            >
              Update with new data
            </button>
          ))}
      </div>
      {status.error && (
        <div className="mt-2 text-red-400 text-xs">{status.error}</div>
      )}
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
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
}) {
  if (!profile && !profileLoading) return null;

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
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
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
}) {
  const [subTab, setSubTab] = useState<MobileSelectedSubTab>("profile");

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
      {subTab === "profile" && <ProfileCard profile={profile} />}
      {subTab === "inbound" && (
        <DidList
          dids={inbound}
          onSelect={onSelectDid}
          profileCache={profileCache}
          onPreviewDid={onPreviewDid}
          onClearPreview={onClearPreview}
        />
      )}
      {subTab === "outbound" && (
        <DidList
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
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
  profileCache: ReturnType<typeof useProfileCache>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onPreviewDid?: (did: string) => void;
  onClearPreview?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<VouchTab>("inbound");
  const vd = vouchDetails.get(profile.did);
  const inbound = vd?.inbound ?? [];
  const outbound = vd?.outbound ?? [];

  return (
    <div>
      <ProfileCard profile={profile} />
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
      <DidList
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

function SearchBar({
  nodeDids,
  onSelect,
}: {
  nodeDids: string[];
  onSelect: (did: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches: { did: string; handle: string }[] = [];
    for (const did of nodeDids) {
      const handle = getHandle(did) ?? did;
      if (handle.toLowerCase().includes(q) || did.toLowerCase().includes(q)) {
        matches.push({ did, handle });
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches;
  }, [query, nodeDids]);

  const selectResult = (did: string) => {
    setQuery("");
    inputRef.current?.blur();
    onSelect(did);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      selectResult(results[0].did);
    }
    if (e.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="mt-2 relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Search users..."
        className="w-full text-sm px-3 py-2 bg-white/10 border border-white/10 rounded text-white placeholder-white/30 outline-none focus:border-indigo-400/50"
      />
      {focused && query.trim() && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded overflow-hidden z-10 bottom-full md:bottom-auto md:top-full mb-1 md:mb-0">
          {results.map((r) => (
            <button
              key={r.did}
              onMouseDown={() => selectResult(r.did)}
              className="block w-full text-left px-3 py-1.5 text-sm text-indigo-400 hover:bg-white/10 cursor-pointer truncate"
            >
              @{r.handle}
            </button>
          ))}
        </div>
      )}
      {focused && query.trim() && results.length === 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded px-3 py-2 text-sm text-white/30 z-10 bottom-full md:bottom-auto md:top-full mb-1 md:mb-0">
          No results
        </div>
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

function DidList({
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

      // If already showing this did, cancel any pending dismiss
      if (activeDid === did) {
        clearTimer(coyoteTimerRef);
        return;
      }

      // Cancel any pending open for a different did
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

  const showingPopup = activeDid && (hoverProfile || hoverLoading);

  return (
    <>
      <ul className="mt-1 max-h-40 overflow-y-auto text-sm list-disc list-inside">
        {dids.map((did) => (
          <li key={did} className="py-0.5">
            <button
              ref={(el) => {
                if (el) buttonRefs.current.set(did, el);
                else buttonRefs.current.delete(did);
              }}
              onClick={() => onSelect(did)}
              onMouseEnter={() => {
                handleMouseEnter(did);
                clearTimer(previewCoyoteRef);
                onPreviewDid?.(did);
              }}
              onMouseLeave={() => {
                handleMouseLeave();
                clearTimer(previewCoyoteRef);
                previewCoyoteRef.current = setTimeout(() => {
                  previewCoyoteRef.current = null;
                  onClearPreview?.();
                }, PREVIEW_COYOTE_TIME);
              }}
              className="text-indigo-400 hover:bg-white/10 rounded cursor-pointer truncate"
            >
              @{getHandle(did) ?? did}
            </button>
          </li>
        ))}
      </ul>
      {showingPopup &&
        createPortal(
          <div
            ref={popupRef}
            onMouseEnter={handlePopupEnter}
            onMouseLeave={handlePopupLeave}
            className="hidden md:block fixed z-50 bg-gray-950/95 backdrop-blur border border-white/10 rounded-lg px-3 py-2.5 w-64 text-white/85 text-sm leading-normal shadow-lg"
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
