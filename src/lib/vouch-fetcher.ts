import { Client, ok, simpleFetchHandler } from '@atcute/client';
import type { ActorIdentifier } from '@atcute/lexicons';
import { relayClient } from './api';
import { resolvePds } from './pds-resolver';
import type { VouchEdge } from './types';

const COLLECTION = 'dev.atvouch.graph.vouch';
const CONCURRENCY = 5;

export interface FetchProgress {
  phase: 'repos' | 'records';
  current: number;
  total: number;
}

export async function fetchAllVouches(
  onProgress?: (progress: FetchProgress) => void,
  onEdges?: (edges: VouchEdge[]) => void,
  signal?: AbortSignal,
): Promise<VouchEdge[]> {
  // Phase 1: Get all DIDs that have vouch records
  const dids: string[] = [];
  let cursor: string | undefined;

  do {
    const res = await ok(
      relayClient.get('com.atproto.sync.listReposByCollection', {
        params: { collection: COLLECTION, limit: 1000, cursor },
        signal,
      }),
    );
    for (const repo of res.repos) {
      dids.push(repo.did);
    }
    cursor = res.cursor;
    onProgress?.({ phase: 'repos', current: dids.length, total: dids.length });
  } while (cursor);

  // Phase 2: Fetch records from each DID via their PDS
  const edges: VouchEdge[] = [];
  let completed = 0;

  const queue = [...dids];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      if (signal?.aborted) return;
      const did = queue.shift()!;
      try {
        const repoEdges = await fetchRepoVouches(did, signal);
        edges.push(...repoEdges);
        if (repoEdges.length > 0) {
          onEdges?.(repoEdges);
        }
      } catch {
        // Skip individual repo failures
      }
      completed++;
      onProgress?.({ phase: 'records', current: completed, total: dids.length });
    }
  });

  await Promise.all(workers);
  return edges;
}

async function fetchRepoVouches(did: string, signal?: AbortSignal): Promise<VouchEdge[]> {
  const pdsUrl = await resolvePds(did);
  const pdsClient = new Client({
    handler: simpleFetchHandler({ service: pdsUrl }),
  });

  const edges: VouchEdge[] = [];
  let cursor: string | undefined;

  do {
    const res = await ok(
      pdsClient.get('com.atproto.repo.listRecords', {
        params: { repo: did as ActorIdentifier, collection: COLLECTION, limit: 100, cursor },
        signal,
      }),
    );

    for (const record of res.records) {
      const value = record.value as { subject?: string; createdAt?: string };
      const rkey = record.uri.split('/').pop()!;

      // Validate: rkey must equal subject DID
      if (!value.subject || rkey !== value.subject) continue;

      edges.push({
        from: did,
        to: value.subject,
        rkey,
        uri: record.uri,
        createdAt: value.createdAt ?? new Date().toISOString(),
      });
    }

    cursor = res.cursor;
  } while (cursor);

  return edges;
}
