import type { AppBskyActorDefs } from "@atcute/bluesky";
import type { ReactNode } from "react";
import { truncateHandle } from "../lib/handle-resolver";

interface ProfileCardProps {
  profile: AppBskyActorDefs.ProfileViewDetailed;
  compact?: boolean;
  badge?: ReactNode;
}

export function ProfileCard({ profile, compact, badge }: ProfileCardProps) {
  return (
    <div>
      <div className="flex gap-2.5 items-center mb-2">
        {profile.avatar && (
          <img
            src={profile.avatar}
            alt=""
            className={`rounded-full object-cover shrink-0 ${compact ? "w-8 h-8" : "w-12 h-12"}`}
          />
        )}
        <div className="min-w-0">
          {profile.displayName && (
            <div
              className={`font-bold overflow-hidden text-ellipsis whitespace-nowrap ${compact ? "text-sm" : "text-base"}`}
            >
              {profile.displayName}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <a
              href={`https://bsky.app/profile/${profile.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 text-sm no-underline truncate"
            >
              @{truncateHandle(profile.handle)}
            </a>
            {badge}
          </div>
        </div>
      </div>
      {profile.description && (
        <div className="text-sm text-white/70 whitespace-pre-wrap break-words mb-1.5 line-clamp-3">
          {profile.description}
        </div>
      )}
      <div className="flex gap-3 text-xs text-white/50">
        {profile.followersCount != null && (
          <span>{profile.followersCount} followers</span>
        )}
        {profile.followsCount != null && (
          <span>{profile.followsCount} following</span>
        )}
        {!compact && profile.postsCount != null && (
          <span>{profile.postsCount} posts</span>
        )}
      </div>
    </div>
  );
}
