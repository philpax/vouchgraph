# vouchgraph

A semi-live graph visualization of all vouches on [atvouch.dev](https://atvouch.dev), built with React and [Cosmograph](https://cosmograph.app/).

On load, all vouches are fetched from the [atvouch appview](https://api.atvouch.dev) via the `dev.atvouch.graph.getEntireGraph` XRPC endpoint, a single paginated query that returns the entire graph.

This is then rendered using Cosmograph to produce an interactive graph visualisation, complete with on-demand information about each member of the graph. Live updates from Jetstream are accumulated and can be applied to rerender the graph; unfortunately, Cosmograph deals poorly with nodes/edges being added and removed, so this was the best compromise I could come up with on short notice.

## Development

```sh
npm install
npm run dev
```

## License

MIT
