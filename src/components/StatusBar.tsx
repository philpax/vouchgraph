import type { VouchGraphStatus } from '../hooks/useVouchGraph';

interface StatusBarProps {
  status: VouchGraphStatus;
}

export function ProgressBar({ status }: StatusBarProps) {
  const progressPct = status.progress
    ? Math.round((status.progress.current / Math.max(status.progress.total, 1)) * 100)
    : 0;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: '8px 16px',
        background: 'rgba(3, 7, 18, 0.85)',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13, color: 'rgba(255,255,255,0.7)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          flex: 1, height: 4, background: 'rgba(255,255,255,0.1)',
          borderRadius: 2, overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${progressPct}%`, height: '100%',
            background: '#6366f1', borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span>
        {status.progress?.phase === 'repos' ? 'Discovering repos...' : `${progressPct}%`}
      </span>
      <JetstreamDot connected={status.jetstreamConnected} />
    </div>
  );
}

export function JetstreamStatus({ connected }: { connected: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12, right: 16,
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'rgba(255,255,255,0.5)',
        pointerEvents: 'none',
      }}
    >
      <JetstreamDot connected={connected} />
      {connected ? 'Live' : 'Disconnected'}
    </div>
  );
}

function JetstreamDot({ connected }: { connected: boolean }) {
  return (
    <span
      style={{
        width: 8, height: 8, borderRadius: '50%',
        background: connected ? '#4ade80' : '#f87171',
        flexShrink: 0,
      }}
      title={connected ? 'Jetstream connected' : 'Jetstream disconnected'}
    />
  );
}
