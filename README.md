# vouchgraph

A semi-live graph visualization of all vouches on [atvouch.dev](https://atvouch.dev), built with React and [Cosmograph](https://cosmograph.app/).

On load, the Sync 1.1 `listReposByCollection` XRPC is sent to an atproto relay to get all of the repos that contain records in the vouch collection, and then these records are requested from each PDS, essentially backfilling the network on load. This will not scale very far, but it is sufficient for the current scale of the trust network.

This is then rendered using Cosmograph to produce an interactive graph visualisation, complete with on-demand information about each member of the graph. Live updates from Jetstream are accumulated and can be applied to rerender the graph; unfortunately, Cosmograph deals poorly with nodes/edges being added and removed, so this was the best compromise I could come up with on short notice.

## Development

```sh
npm install
npm run dev
```

## License

MIT
