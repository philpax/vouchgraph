import type { AppBskyActorDefs } from "@atcute/bluesky/lexicons";
import type { VouchGraphStatus } from "../hooks/useVouchGraph";

interface InfoPanelProps {
  status: VouchGraphStatus;
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchCounts: Map<string, { inbound: number; outbound: number }>;
}

export function InfoPanel({
  status,
  profile,
  profileLoading,
  vouchCounts,
}: InfoPanelProps) {
  return (
    <div className="absolute top-4 right-4 bg-gray-950/85 backdrop-blur rounded-xl px-5 py-4 max-w-80 text-white/85 text-sm leading-normal border border-white/10 pointer-events-auto">
      <div className="font-bold text-lg">vouchgraph</div>
      <div className="text-xs text-white/50 mb-2">
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
      <div>
        A live graph of all vouches on{" "}
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
      <div className="mt-2 text-xs text-white/50">
        {status.nodeCount} nodes · {status.edgeCount} edges
      </div>
      {status.error && (
        <div className="mt-2 text-red-400 text-xs">{status.error}</div>
      )}

      {(profile || profileLoading) && (
        <div className="mt-3 border-t border-white/10 pt-3">
          {profileLoading && !profile && (
            <div className="text-xs text-white/50">Loading profile...</div>
          )}
          {profile && (
            <ProfileCard profile={profile} vouchCounts={vouchCounts} />
          )}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  vouchCounts,
}: {
  profile: AppBskyActorDefs.ProfileViewDetailed;
  vouchCounts: Map<string, { inbound: number; outbound: number }>;
}) {
  const vc = vouchCounts.get(profile.did);
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
      {vc && (
        <div className="flex gap-3 text-[11px] text-white/50">
          <span>{vc.outbound} vouched for</span>
          <span>{vc.inbound} vouched by</span>
        </div>
      )}
      <div className="flex gap-3 text-[11px] text-white/50 mt-1">
        {profile.followersCount != null && (
          <span>{profile.followersCount} followers</span>
        )}
        {profile.followsCount != null && (
          <span>{profile.followsCount} following</span>
        )}
        {profile.postsCount != null && <span>{profile.postsCount} posts</span>}
      </div>
    </div>
  );
}
