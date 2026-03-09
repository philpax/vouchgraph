import { JetstreamSubscription } from '@atcute/jetstream';
import type { VouchEdge } from './types';

const COLLECTION = 'dev.atvouch.graph.vouch';

export interface JetstreamCallbacks {
  onCreate: (edge: VouchEdge) => void;
  onDelete: (did: string, rkey: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function createJetstreamSubscription(callbacks: JetstreamCallbacks): JetstreamSubscription {
  const subscription = new JetstreamSubscription({
    url: 'wss://jetstream2.us-west.bsky.network/subscribe',
    wantedCollections: [COLLECTION],
    onConnectionOpen: () => callbacks.onConnect(),
    onConnectionClose: () => callbacks.onDisconnect(),
    onConnectionError: () => callbacks.onDisconnect(),
  });

  (async () => {
    for await (const event of subscription) {
      if (event.kind !== 'commit') continue;
      const { commit } = event;
      if (commit.collection !== COLLECTION) continue;

      if (commit.operation === 'create') {
        const value = commit.record as { subject?: string; createdAt?: string };
        if (!value.subject || commit.rkey !== value.subject) continue;

        callbacks.onCreate({
          from: event.did,
          to: value.subject,
          rkey: commit.rkey,
          uri: `at://${event.did}/${COLLECTION}/${commit.rkey}`,
          createdAt: value.createdAt ?? new Date().toISOString(),
        });
      } else if (commit.operation === 'delete') {
        callbacks.onDelete(event.did, commit.rkey);
      }
    }
  })();

  return subscription;
}
