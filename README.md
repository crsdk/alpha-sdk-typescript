# @alpha-sdk/client

TypeScript client for the Alpha Camera REST API — control Sony cameras via REST.

## Install

```bash
npm install @alpha-sdk/client
```

## Usage

```typescript
import { AlphaSDKClient } from "@alpha-sdk/client";

const client = new AlphaSDKClient({
  environment: "http://localhost:8080",
});

// Discover cameras
const listing = await client.cameras.list();
console.log(listing.cameras);

// Connect, shoot, disconnect
const cameraId = listing.cameras[0].id;
await client.cameras.connect({ cameraId, mode: "remote" });
await new Promise((r) => setTimeout(r, 500)); // settle (see Recipe 5)
await client.properties.setPriorityKey({ cameraId, setting: "pc-remote" });
await client.actions.afShutter({ cameraId });
await client.cameras.disconnect({ cameraId });
```

## Resources exposed

| Accessor | What it covers |
|----------|----------------|
| `client.server` | Server status, logs, shutdown |
| `client.cameras` | Discover, connect, disconnect |
| `client.properties` | Read/write properties (ISO, aperture, priority key, etc.) |
| `client.actions` | Shoot, focus near/far, zoom, movie recording |
| `client.liveView` | Enable/start/stop live view stream |
| `client.sdCard` | List + download SD card files |
| `client.settings` | Save-info, LUT import, settings-file up/download |

Every REST endpoint in the OpenAPI spec has a method here.

## Recipes — SSE, live view, server lifecycle, discovery

Some patterns aren't REST and are intentionally left as app-owned code. The reference implementations live on [crsdk.app](https://crsdk.app/docs/sdk/overview#recipes):

| Pattern | Recipe |
|---------|--------|
| Real-time events (SSE) | [Recipe 1 — SSE event consumer](https://crsdk.app/docs/sdk/recipes/sse-events) |
| Live view frame polling | [Recipe 2 — Live view polling](https://crsdk.app/docs/sdk/recipes/live-view-polling) |
| Server subprocess lifecycle | [Recipe 3 — Server subprocess manager](https://crsdk.app/docs/sdk/recipes/server-subprocess) |
| Camera discovery / hot-plug | [Recipe 4 — Discovery + auto-reconnect](https://crsdk.app/docs/sdk/recipes/discovery-reconnect) |
| Retry with backoff | [Recipe 5 — Retry + backoff](https://crsdk.app/docs/sdk/recipes/retry-backoff) |
| React hook | [Recipe 6 — React hook](https://crsdk.app/docs/sdk/recipes/react-hook) |

**Why recipes instead of a wrapper library?** These patterns are standard JS/TS idioms (`fetch` streaming, `setInterval`, `child_process.spawn`). Owning the code in your app is easier to debug, easier to modify, and easier for AI coding assistants to reason about than an opaque library abstraction.

## Error handling

Every non-2xx response throws a typed subclass of `AlphaSDKError`:

```typescript
import { AlphaCameraRestApi, AlphaSDKError } from "@alpha-sdk/client";

const { BadRequestError, NotFoundError } = AlphaCameraRestApi;

try {
  await client.cameras.connect({ cameraId: "unknown", mode: "remote" });
} catch (err) {
  if (err instanceof BadRequestError) {
    console.error("400:", (err.body as any).message);
  } else if (err instanceof NotFoundError) {
    console.error("404:", err.body);
  } else if (err instanceof AlphaSDKError) {
    console.error(`${err.statusCode}: ${err.message}`);
  }
}
```

## License

MIT — see `LICENSE`.
