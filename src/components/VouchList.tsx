import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { useProfileCache } from "../hooks/useProfileCache";
import { getHandle } from "../lib/handle-resolver";
import { ProfileCard } from "./ProfileCard";
import { UserList, type UserListItem } from "./UserList";
import { PANEL_BG } from "./ui";

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

export function VouchList({
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
      if (!onPopupRef.current && !onButtonRef.current) dismiss();
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
      if (profileCache.get(did)) {
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
            onMouseEnter={() => {
              onPopupRef.current = true;
              clearTimer(coyoteTimerRef);
            }}
            onMouseLeave={() => {
              onPopupRef.current = false;
              startCoyoteTimer();
            }}
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
