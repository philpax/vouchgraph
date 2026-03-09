## How it works

On page load, the app:

1. Queries the Bluesky relay to discover all repos with `dev.atvouch.graph.vouch` records
2. Fetches vouch records from each repo's PDS
3. Resolves DIDs to handles via the public Bluesky API
4. Renders the vouch graph using Cosmograph
5. Subscribes to Jetstream for live updates

There is no backend or caching - every page load does a full backfill.

## Stack

- **React 19** + **Vite** - UI framework and build tool
- **Cosmograph** (`@cosmograph/react`) - GPU-accelerated graph visualization via cosmos.gl/WebGL
- **Tailwind CSS v4** - styling
- **@atcute/client** - AT Protocol API client
- **@atcute/jetstream** - live event subscription

## Development

```sh
npm install
npm run dev
```

Append `?debugControls` to the URL to show simulation parameter sliders.

## Code quality

This project uses ESLint for linting and Prettier for formatting. CI enforces both on every push and PR.

```sh
npm run lint          # check for lint errors
npm run format        # format all files
npm run format:check  # check formatting (used in CI)
```
