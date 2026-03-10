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
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-56 h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-sm text-white/70">
          Fetching vouches... {progressPct}%
        </span>
      </div>
    </div>
  );
}
