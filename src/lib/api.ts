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
