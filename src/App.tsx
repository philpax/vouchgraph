import { useVouchGraph } from './hooks/useVouchGraph';
import { StatusBar } from './components/StatusBar';
import { NodeList } from './components/NodeList';
import { EdgeList } from './components/EdgeList';

export default function App() {
  const { nodes, edges, loading, error, progress, jetstreamConnected } = useVouchGraph();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <StatusBar
        loading={loading}
        error={error}
        progress={progress}
        jetstreamConnected={jetstreamConnected}
        nodeCount={nodes.size}
        edgeCount={edges.length}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/3 border-r border-gray-700 overflow-hidden">
          <NodeList nodes={nodes} />
        </div>
        <div className="flex-1 overflow-hidden">
          <EdgeList edges={edges} nodes={nodes} />
        </div>
      </div>
    </div>
  );
}
