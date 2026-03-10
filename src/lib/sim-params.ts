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
