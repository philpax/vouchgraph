import type { FetchProgress } from '../lib/vouch-fetcher';

interface StatusBarProps {
  loading: boolean;
  error: string | null;
  progress: FetchProgress | null;
  jetstreamConnected: boolean;
  nodeCount: number;
  edgeCount: number;
}

export function StatusBar({ loading, error, progress, jetstreamConnected, nodeCount, edgeCount }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-900 text-sm text-gray-300 border-b border-gray-700">
      {loading && progress && (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span>
            {progress.phase === 'repos'
              ? `Discovering repos... ${progress.current}`
              : `Fetching records... ${progress.current}/${progress.total}`}
          </span>
        </div>
      )}

      {error && <span className="text-red-400">Error: {error}</span>}

      {!loading && (
        <>
          <span>{nodeCount} users</span>
          <span>{edgeCount} vouches</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${jetstreamConnected ? 'bg-green-400' : 'bg-red-400'}`}
        />
        <span>{jetstreamConnected ? 'Live' : 'Disconnected'}</span>
      </div>
    </div>
  );
}
