import { Client, simpleFetchHandler } from '@atcute/client';
import '@atcute/atproto';
import '@atcute/bluesky';
import '../lexicons';

export const relayClient = new Client({
  handler: simpleFetchHandler({ service: 'https://bsky.network' }),
});

export const publicClient = new Client({
  handler: simpleFetchHandler({ service: 'https://public.api.bsky.app' }),
});
