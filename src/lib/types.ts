export interface VouchNode {
  did: string;
  handle?: string;
}

export interface VouchEdge {
  from: string;
  to: string;
  rkey: string;
  uri: string;
  createdAt: string;
}
