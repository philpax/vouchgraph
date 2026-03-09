import type { VouchNode } from '../lib/types';

interface NodeListProps {
  nodes: Map<string, VouchNode>;
}

export function NodeList({ nodes }: NodeListProps) {
  const sorted = [...nodes.values()].sort((a, b) => {
    const aName = a.handle ?? a.did;
    const bName = b.handle ?? b.did;
    return aName.localeCompare(bName);
  });

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold px-3 py-2 border-b border-gray-700">
        Users ({sorted.length})
      </h2>
      <div className="overflow-y-auto flex-1">
        {sorted.map((node) => (
          <div
            key={node.did}
            className="px-3 py-1.5 border-b border-gray-800 text-sm truncate hover:bg-gray-800"
            title={node.did}
          >
            {node.handle ?? <span className="text-gray-500">{node.did}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
