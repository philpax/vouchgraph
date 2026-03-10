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
    <div className="absolute bottom-0 left-0 right-0 md:px-4 md:py-2 flex items-center justify-center gap-3 text-[13px] text-white/70 pointer-events-none">
      <div className="hidden md:flex flex-1 items-center gap-3">
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
      </div>
      <div className="flex md:hidden flex-col items-center gap-2 pb-8">
        <div className="w-48 h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs">
          {status.progress?.phase === "repos"
            ? "Discovering repos..."
            : `${progressPct}%`}
        </span>
      </div>
    </div>
  );
}
