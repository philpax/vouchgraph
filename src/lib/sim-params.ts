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
  simulationGravity: 0.1,
  simulationRepulsion: 2,
  simulationFriction: 0.9,
  simulationLinkSpring: 0.1,
  simulationLinkDistance: 20,
  simulationDecay: 3000,
  nodeSizeMin: 1,
  nodeSizeMax: 4,
  nodeSizeScale: 1,
};
