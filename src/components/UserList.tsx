import { useEffect } from "react";
import type { useProfileCache } from "../hooks/useProfileCache";
import { truncateHandle } from "../lib/handle-resolver";

export interface UserListItem {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  badge?: string;
}

export function UserRow({
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
export function UserList({
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
