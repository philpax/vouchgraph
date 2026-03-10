import { ok } from "@atcute/client";
import { appviewClient } from "./api";
import type { VouchEdge } from "./types";

export interface FetchProgress {
  phase: "vouches";
  current: number;
  total: number;
}

export async function fetchAllVouches(
  onProgress?: (progress: FetchProgress) => void,
  signal?: AbortSignal,
): Promise<VouchEdge[]> {
  const edges: VouchEdge[] = [];
  let cursor: string | undefined;

  do {
    const res = await ok(
      appviewClient.get("dev.atvouch.graph.getEntireGraph", {
        params: { limit: 100, cursor },
        signal,
      }),
    );

    for (const vouch of res.vouches) {
      const rkey = vouch.uri.split("/").pop()!;
      edges.push({
        from: vouch.creatorDid,
        to: vouch.targetDid,
        rkey,
        uri: vouch.uri,
        createdAt: vouch.createdAt,
      });
    }

    cursor = res.cursor;
    onProgress?.({ phase: "vouches", current: edges.length, total: res.total });
  } while (cursor);

  return edges;
}
