import type { AppBskyActorDefs } from '@atcute/bluesky/lexicons';
import type { VouchGraphStatus } from '../hooks/useVouchGraph';

interface InfoPanelProps {
  status: VouchGraphStatus;
  profile: AppBskyActorDefs.ProfileViewDetailed | null;
  profileLoading: boolean;
  vouchCounts: Map<string, { inbound: number; outbound: number }>;
}

export function InfoPanel({ status, profile, profileLoading, vouchCounts }: InfoPanelProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        background: 'rgba(3, 7, 18, 0.85)',
        borderRadius: 12,
        padding: '16px 20px',
        maxWidth: 320,
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        lineHeight: 1.5,
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 18 }}>vouchgraph</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
        by{' '}
        <a
          href="https://bsky.app/profile/philpax.me"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#818cf8', textDecoration: 'none' }}
        >
          philpax.me
        </a>
      </div>
      <div>
        A live graph of all vouches on{' '}
        <a
          href="https://atvouch.dev"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#818cf8', textDecoration: 'underline' }}
        >
          atvouch.dev
        </a>
        . Proof of concept - every page load queries the relay and each PDS
        to do a full backfill with no caching, so please be gentle.
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
        {status.nodeCount} nodes · {status.edgeCount} edges
      </div>
      {status.error && (
        <div style={{ marginTop: 8, color: '#f87171', fontSize: 12 }}>{status.error}</div>
      )}

      {(profile || profileLoading) && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
          {profileLoading && !profile && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Loading profile...</div>
          )}
          {profile && <ProfileCard profile={profile} vouchCounts={vouchCounts} />}
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        {profile.avatar && (
          <img
            src={profile.avatar}
            alt=""
            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        )}
        <div style={{ minWidth: 0 }}>
          {profile.displayName && (
            <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile.displayName}
            </div>
          )}
          <a
            href={`https://bsky.app/profile/${profile.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#818cf8', fontSize: 12, textDecoration: 'none' }}
          >
            @{profile.handle}
          </a>
        </div>
      </div>
      {profile.description && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 6 }}>
          {profile.description}
        </div>
      )}
      {vc && (
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
          <span>{vc.outbound} vouched for</span>
          <span>{vc.inbound} vouched by</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
        {profile.followersCount != null && <span>{profile.followersCount} followers</span>}
        {profile.followsCount != null && <span>{profile.followsCount} following</span>}
        {profile.postsCount != null && <span>{profile.postsCount} posts</span>}
      </div>
    </div>
  );
}
