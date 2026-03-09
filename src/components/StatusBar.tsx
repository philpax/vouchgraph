import type { VouchGraphStatus } from "../hooks/useVouchGraph";

interface StatusBarProps {
  status: VouchGraphStatus;
}

export function ProgressBar({ status }: StatusBarProps) {
  const progressPct = status.progress
    ? Math.round(
        (status.progress.current / Math.max(status.progress.total, 1)) * 100,
      )
    : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 px-4 py-2 bg-gray-950/85 flex items-center gap-3 text-[13px] text-white/70 pointer-events-none">
      <div className="flex-1 h-1 bg-white/10 rounded-sm overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-sm transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <span>
        {status.progress?.phase === "repos"
          ? "Discovering repos..."
          : `${progressPct}%`}
      </span>
      <JetstreamDot connected={status.jetstreamConnected} />
    </div>
  );
}

export function JetstreamStatus({ connected }: { connected: boolean }) {
  return (
    <div className="absolute bottom-3 right-4 flex items-center gap-1.5 text-xs text-white/50 pointer-events-none">
      <JetstreamDot connected={connected} />
      {connected ? "Live" : "Disconnected"}
    </div>
  );
}

function JetstreamDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-400" : "bg-red-400"}`}
      title={connected ? "Jetstream connected" : "Jetstream disconnected"}
    />
  );
}
