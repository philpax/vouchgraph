import type { VouchEdge, VouchNode } from '../lib/types';

interface EdgeListProps {
  edges: VouchEdge[];
  nodes: Map<string, VouchNode>;
}

function displayName(nodes: Map<string, VouchNode>, did: string): string {
  return nodes.get(did)?.handle ?? did;
}

export function EdgeList({ edges, nodes }: EdgeListProps) {
  const sorted = [...edges].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold px-3 py-2 border-b border-gray-700">
        Vouches ({sorted.length})
      </h2>
      <div className="overflow-y-auto flex-1">
        {sorted.map((edge) => (
          <div
            key={edge.uri}
            className="px-3 py-1.5 border-b border-gray-800 text-sm hover:bg-gray-800"
          >
            <span className="text-blue-400 truncate">{displayName(nodes, edge.from)}</span>
            <span className="text-gray-500 mx-1.5">&rarr;</span>
            <span className="text-green-400 truncate">{displayName(nodes, edge.to)}</span>
            <span className="text-gray-600 ml-2 text-xs">
              {new Date(edge.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
