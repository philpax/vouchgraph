import { Client, simpleFetchHandler } from "@atcute/client";
import "@atcute/atproto";
import "@atcute/bluesky";
import "../lexicons";

export const appviewClient = new Client({
  handler: simpleFetchHandler({ service: "https://api.atvouch.dev" }),
});

export const publicClient = new Client({
  handler: simpleFetchHandler({ service: "https://public.api.bsky.app" }),
});

export interface TypeaheadActor {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export async function searchActorsTypeahead(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<TypeaheadActor[]> {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const resp = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?${params}`,
    { signal },
  );
  if (!resp.ok) return [];
  const data: { actors: TypeaheadActor[] } = await resp.json();
  return data.actors;
}
