import { useState } from "react";
import { createPortal } from "react-dom";
import type { AppBskyActorDefs } from "@atcute/bluesky";
import { Button, PANEL_BG } from "./ui";

interface VouchConfirmModalProps {
  profile: AppBskyActorDefs.ProfileViewDetailed;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function VouchConfirmModal({
  profile,
  onConfirm,
  onCancel,
}: VouchConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to vouch");
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !loading) onCancel();
      }}
    >
      <div
        className={`${PANEL_BG} border border-white/10 rounded-xl px-6 py-5 max-w-sm mx-4 text-white/85 text-sm`}
      >
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
              <div className="font-bold text-base overflow-hidden text-ellipsis whitespace-nowrap">
                {profile.displayName}
              </div>
            )}
            <div className="text-indigo-400 text-sm">@{profile.handle}</div>
          </div>
        </div>
        {profile.description && (
          <div className="text-sm text-white/70 whitespace-pre-wrap break-words mb-1.5">
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
          {profile.postsCount != null && (
            <span>{profile.postsCount} posts</span>
          )}
        </div>
        <div className="border-t border-white/10 mt-4 pt-4">
          <p className="mb-4 text-white">
            Are you sure you can vouch for this user as a developer?
          </p>
          {error && <p className="mb-3 text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="danger" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? "Vouching..." : "Vouch"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
