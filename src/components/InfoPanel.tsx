import { useMemo, useRef, useState } from "react";
import type { AppBskyActorDefs } from "@atcute/bluesky/lexicons";
import type { VouchGraphStatus } from "../hooks/useVouchGraph";
import { getHandle } from "../lib/handle-resolver";

interface InfoPanelProps {
  status: VouchGraphStatus;
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  nodeDids: string[];
  onSelectDid: (did: string) => void;
  onRebuild: () => void;
}

export function InfoPanel({
  status,
  profile,
  profileLoading,
  vouchDetails,
  nodeDids,
  onSelectDid,
  onRebuild,
}: InfoPanelProps) {
  return (
    <div className="absolute top-4 right-4 bg-gray-950/85 backdrop-blur rounded-xl px-5 py-4 max-w-80 text-white/85 text-sm leading-normal border border-white/10 pointer-events-auto">
      <div className="flex items-center gap-2.5 mb-2">
        <img
          src="/vouchgraph-icon.svg"
          alt=""
          className="w-9 h-9 shrink-0"
        />
        <div>
          <div className="font-bold text-lg leading-tight">vouchgraph</div>
          <div className="text-xs text-white/50">
            by{" "}
            <a
              href="https://bsky.app/profile/philpax.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 no-underline"
            >
              philpax.me
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
        . Proof of concept - every page load queries the relay and each PDS to
        do a full backfill with no caching, so please be gentle.
      </div>
      <div className="mt-2 text-xs text-white/50 flex items-center gap-2">
        <span>
          {status.nodeCount} nodes · {status.edgeCount} edges
        </span>
        {status.pendingChanges && (
          <button
            onClick={onRebuild}
            className="text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
          >
            Update with new data
          </button>
        )}
      </div>
      {status.error && (
        <div className="mt-2 text-red-400 text-xs">{status.error}</div>
      )}

      {!status.loading && (
        <SearchBar nodeDids={nodeDids} onSelect={onSelectDid} />
      )}

      {(profile || profileLoading) && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {profileLoading && !profile && (
            <div className="text-xs text-white/50">Loading profile...</div>
          )}
          {profile && (
            <ProfileCard
              profile={profile}
              vouchDetails={vouchDetails}
              onSelectDid={onSelectDid}
            />
          )}
        </div>
      )}
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
        className="w-full text-xs px-2.5 py-1.5 bg-white/10 border border-white/10 rounded text-white placeholder-white/30 outline-none focus:border-indigo-400/50"
      />
      {focused && query.trim() && results.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded overflow-hidden z-10">
          {results.map((r) => (
            <button
              key={r.did}
              onMouseDown={() => selectResult(r.did)}
              className="block w-full text-left px-2.5 py-1 text-xs text-indigo-400 hover:bg-white/10 cursor-pointer truncate"
            >
              @{r.handle}
            </button>
          ))}
        </div>
      )}
      {focused && query.trim() && results.length === 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white/30 z-10">
          No results
        </div>
      )}
    </div>
  );
}

type VouchTab = "inbound" | "outbound";

function ProfileCard({
  profile,
  vouchDetails,
  onSelectDid,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed;
  vouchDetails: Map<string, { inbound: string[]; outbound: string[] }>;
  onSelectDid: (did: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<VouchTab>("inbound");
  const vd = vouchDetails.get(profile.did);
  const inbound = vd?.inbound ?? [];
  const outbound = vd?.outbound ?? [];

  return (
    <div>
      <div className="flex gap-2.5 items-center mb-2">
        {profile.avatar && (
          <img
            src={profile.avatar}
            alt=""
            className="w-12 h-12 rounded-full object-cover shrink-0"
          />
        )}
        <div className="min-w-0">
          {profile.displayName && (
            <div className="font-bold text-[15px] overflow-hidden text-ellipsis whitespace-nowrap">
              {profile.displayName}
            </div>
          )}
          <a
            href={`https://bsky.app/profile/${profile.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 text-xs no-underline"
          >
            @{profile.handle}
          </a>
        </div>
      </div>
      {profile.description && (
        <div className="text-xs text-white/70 whitespace-pre-wrap break-words mb-1.5">
          {profile.description}
        </div>
      )}
      <div className="flex gap-3 text-[11px] text-white/50">
        {profile.followersCount != null && (
          <span>{profile.followersCount} followers</span>
        )}
        {profile.followsCount != null && (
          <span>{profile.followsCount} following</span>
        )}
        {profile.postsCount != null && <span>{profile.postsCount} posts</span>}
      </div>
      <div className="flex text-[11px] mt-2 border-b border-white/10">
        <button
          onClick={() => setActiveTab("inbound")}
          className={`flex-1 py-1 cursor-pointer transition-colors ${
            activeTab === "inbound"
              ? "text-white border-b border-white"
              : "text-white/50 hover:text-white/70"
          }`}
        >
          Vouched for by {inbound.length}
        </button>
        <button
          onClick={() => setActiveTab("outbound")}
          className={`flex-1 py-1 cursor-pointer transition-colors ${
            activeTab === "outbound"
              ? "text-white border-b border-white"
              : "text-white/50 hover:text-white/70"
          }`}
        >
          Vouching {outbound.length}
        </button>
      </div>
      <DidList
        dids={activeTab === "inbound" ? inbound : outbound}
        onSelect={onSelectDid}
      />
    </div>
  );
}

function DidList({
  dids,
  onSelect,
}: {
  dids: string[];
  onSelect: (did: string) => void;
}) {
  return (
    <div className="mt-1 max-h-40 overflow-y-auto text-xs">
      {dids.map((did) => (
        <button
          key={did}
          onClick={() => onSelect(did)}
          className="block w-full text-left px-2 py-0.5 text-indigo-400 hover:bg-white/10 rounded cursor-pointer truncate"
        >
          @{getHandle(did) ?? did}
        </button>
      ))}
    </div>
  );
}
