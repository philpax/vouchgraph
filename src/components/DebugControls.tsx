import { useCallback } from "react";

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
  simulationFriction: 0.7,
  simulationLinkSpring: 0.3,
  simulationLinkDistance: 8,
  simulationDecay: 500,
  nodeSizeMin: 8,
  nodeSizeMax: 16,
  nodeSizeScale: 3,
};

interface DebugControlsProps {
  params: SimParams;
  onParamsChange: (params: SimParams) => void;
  onReheat: () => void;
}

export function DebugControls({
  params,
  onParamsChange,
  onReheat,
}: DebugControlsProps) {
  const updateParam = useCallback(
    <K extends keyof SimParams>(key: K, value: SimParams[K]) => {
      onParamsChange({ ...params, [key]: value });
    },
    [params, onParamsChange],
  );

  return (
    <div className="absolute top-4 left-4 bg-gray-950/90 backdrop-blur rounded-xl px-4 py-3 w-[300px] text-white/85 text-xs leading-loose border border-white/10 font-mono pointer-events-auto">
      <div className="font-bold text-sm mb-2">Debug Controls</div>

      <SliderControl
        label="gravity"
        value={params.simulationGravity}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => updateParam("simulationGravity", v)}
      />
      <SliderControl
        label="repulsion"
        value={params.simulationRepulsion}
        min={0}
        max={5}
        step={0.1}
        onChange={(v) => updateParam("simulationRepulsion", v)}
      />
      <SliderControl
        label="friction"
        value={params.simulationFriction}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => updateParam("simulationFriction", v)}
      />
      <SliderControl
        label="linkSpring"
        value={params.simulationLinkSpring}
        min={0}
        max={5}
        step={0.1}
        onChange={(v) => updateParam("simulationLinkSpring", v)}
      />
      <SliderControl
        label="linkDist"
        value={params.simulationLinkDistance}
        min={1}
        max={50}
        step={1}
        onChange={(v) => updateParam("simulationLinkDistance", v)}
      />
      <SliderControl
        label="decay"
        value={params.simulationDecay}
        min={100}
        max={20000}
        step={100}
        onChange={(v) => updateParam("simulationDecay", v)}
      />

      <div className="mt-2 border-t border-white/10 pt-2">
        <SliderControl
          label="sizeMin"
          value={params.nodeSizeMin}
          min={1}
          max={20}
          step={0.5}
          onChange={(v) => updateParam("nodeSizeMin", v)}
        />
        <SliderControl
          label="sizeMax"
          value={params.nodeSizeMax}
          min={5}
          max={50}
          step={1}
          onChange={(v) => updateParam("nodeSizeMax", v)}
        />
        <SliderControl
          label="sizeScale"
          value={params.nodeSizeScale}
          min={0.5}
          max={10}
          step={0.5}
          onChange={(v) => updateParam("nodeSizeScale", v)}
        />
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={onReheat}
          className="flex-1 py-1.5 bg-indigo-500 text-white border-none rounded-md cursor-pointer text-xs font-mono"
        >
          Reheat
        </button>
        <button
          onClick={() => onParamsChange(DEFAULT_SIM_PARAMS)}
          className="flex-1 py-1.5 bg-white/10 text-white border border-white/20 rounded-md cursor-pointer text-xs font-mono"
        >
          Reset
        </button>
      </div>

      <div className="mt-1 flex gap-2">
        <button
          onClick={() =>
            navigator.clipboard.writeText(JSON.stringify(params, null, 2))
          }
          className="flex-1 py-1.5 bg-white/5 text-white/60 border border-white/10 rounded-md cursor-pointer text-[11px] font-mono"
        >
          Copy JSON
        </button>
      </div>
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-white/60">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-indigo-500"
      />
      <span className="w-12 text-right shrink-0">{value}</span>
    </div>
  );
}
