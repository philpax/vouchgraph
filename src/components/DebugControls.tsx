import { useCallback } from 'react';

export interface SimParams {
  simulationGravity: number;
  simulationRepulsion: number;
  simulationFriction: number;
  simulationLinkSpring: number;
  simulationLinkDistance: number;
  simulationDecay: number;
  nodeSizeMin: number;
  nodeSizeMax: number;
  nodeSizeScale: number;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  simulationGravity: 0.6,
  simulationRepulsion: 2,
  simulationFriction: 0.9,
  simulationLinkSpring: 0.3,
  simulationLinkDistance: 8,
  simulationDecay: 3000,
  nodeSizeMin: 8,
  nodeSizeMax: 16,
  nodeSizeScale: 3,
};

interface DebugControlsProps {
  params: SimParams;
  onParamsChange: (params: SimParams) => void;
  onReheat: () => void;
}

export function DebugControls({ params, onParamsChange, onReheat }: DebugControlsProps) {
  const updateParam = useCallback(<K extends keyof SimParams>(key: K, value: SimParams[K]) => {
    onParamsChange({ ...params, [key]: value });
  }, [params, onParamsChange]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: 'rgba(3, 7, 18, 0.92)',
        borderRadius: 12,
        padding: '12px 16px',
        width: 300,
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        lineHeight: 1.8,
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: 'monospace',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Debug Controls</div>

      <SliderControl label="gravity" value={params.simulationGravity} min={0} max={2} step={0.01}
        onChange={v => updateParam('simulationGravity', v)} />
      <SliderControl label="repulsion" value={params.simulationRepulsion} min={0} max={5} step={0.1}
        onChange={v => updateParam('simulationRepulsion', v)} />
      <SliderControl label="friction" value={params.simulationFriction} min={0} max={1} step={0.01}
        onChange={v => updateParam('simulationFriction', v)} />
      <SliderControl label="linkSpring" value={params.simulationLinkSpring} min={0} max={5} step={0.1}
        onChange={v => updateParam('simulationLinkSpring', v)} />
      <SliderControl label="linkDist" value={params.simulationLinkDistance} min={1} max={50} step={1}
        onChange={v => updateParam('simulationLinkDistance', v)} />
      <SliderControl label="decay" value={params.simulationDecay} min={100} max={20000} step={100}
        onChange={v => updateParam('simulationDecay', v)} />

      <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
        <SliderControl label="sizeMin" value={params.nodeSizeMin} min={1} max={20} step={0.5}
          onChange={v => updateParam('nodeSizeMin', v)} />
        <SliderControl label="sizeMax" value={params.nodeSizeMax} min={5} max={50} step={1}
          onChange={v => updateParam('nodeSizeMax', v)} />
        <SliderControl label="sizeScale" value={params.nodeSizeScale} min={0.5} max={10} step={0.5}
          onChange={v => updateParam('nodeSizeScale', v)} />
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button
          onClick={onReheat}
          style={{
            flex: 1, padding: '6px 0', background: '#6366f1', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
          }}
        >
          Reheat
        </button>
        <button
          onClick={() => onParamsChange(DEFAULT_SIM_PARAMS)}
          style={{
            flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.1)', color: 'white',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
        <button
          onClick={() => navigator.clipboard.writeText(JSON.stringify(params, null, 2))}
          style={{
            flex: 1, padding: '6px 0', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
          }}
        >
          Copy JSON
        </button>
      </div>
    </div>
  );
}

function SliderControl({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 80, flexShrink: 0, color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: '#6366f1' }}
      />
      <span style={{ width: 48, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}
