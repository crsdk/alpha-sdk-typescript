# Next.js Example App

Public React / Next.js reference app for the Alpha Camera REST API.

This example shows how to:

- start or adopt the local camera server from a Next.js route
- use the published TypeScript SDK client from `@alpha-sdk/client`
- handle camera discovery, connect, reconnect, and SSE updates in app code
- render live view and common camera controls in a browser UI

## Requirements

- Node.js 20+
- npm
- a camera supported by the SDK
- macOS / Windows / Linux machine that can build and run the camera server (built from source — see [Camera server](#camera-server) below)

## Camera setup

For USB SDK detection, set the camera body to remote shooting / PC Remote mode.

Typical Sony menu path:

- `Menu -> Setup -> USB -> USB Connection Mode -> Remote Shooting` or `PC Remote`
- `Menu -> Network -> Cnct./Remote Sht. -> Remote Shooting Function -> Remote Shooting -> On`

Some models also require:

- `Connect without Pairing`

For network / Ethernet setup, compatibility depends on camera model. Use:

- [the Alpha Camera REST API docs](https://crsdk.github.io/alpha-sdk-api/)

and the camera help guide for model-specific steps.

Not all camera models support SDK network connection, and not all network-capable models support both wired and wireless operation.

## Install

Clone the repo, then install **from inside the app folder** — run `npm install`
in `alpha-sdk-typescript/`, not in a parent directory (a stray `package-lock.json`
one level up will confuse the build's workspace-root detection):

```bash
git clone https://github.com/crsdk/alpha-sdk-typescript.git
cd alpha-sdk-typescript
npm install
```

This installs:

- the Next.js app dependencies
- `@alpha-sdk/client` for typed REST calls

## Camera server

This app talks to the native **Alpha Camera REST server** (`CameraWebApp`), which
is built from source — it needs Sony's Camera Remote SDK and is never shipped as a
prebuilt binary. Build it once with the [`crsdk`](https://github.com/crsdk/alpha-sdk-api) CLI:

```bash
git clone https://github.com/crsdk/alpha-sdk-api.git
cd alpha-sdk-api
./crsdk install --zip <sony-camera-remote-sdk.zip>
./crsdk build
```

Then either **let this app spawn it** by pointing `CRSDK_BINARY` at the built binary:

```bash
export CRSDK_BINARY=/path/to/alpha-sdk-api/api/server/build/CameraWebApp
```

…or **run it yourself** (`./crsdk start`) and the app will adopt the running server.

## Run

Development:

```bash
npm run dev
```

Open:

- [http://localhost:3000](http://localhost:3000)

Production build:

```bash
npm run build
npm run start
```

## How server startup works

The browser UI does **not** spawn the native camera server directly.

Instead:

1. the page calls `POST /api/server`
2. `src/app/api/server/route.ts` uses a small vendored `ServerManager`
   (`src/lib/server-manager.ts`) — the app carries its own copy rather than
   depending on a published package
3. the route either:
   - spawns a local `CameraWebApp` from `$CRSDK_BINARY`, or
   - adopts an already-running healthy server
4. the page then creates a `CameraManager` against that server URL

Relevant files:

- `src/app/api/server/route.ts`
- `src/lib/camera-manager.ts`
- `src/lib/event-stream.ts`
- `src/app/page.tsx`

## Lifecycle model

The app uses three layers:

### 1. Server route

`src/app/api/server/route.ts`

- starts / stops the server
- adopts an already-running server on `8080`
- avoids duplicate-start races during Next.js reloads

### 2. Camera lifecycle layer

`src/lib/camera-manager.ts`

- polls `GET /api/cameras`
- auto-connects detected cameras
- waits for SSE connect confirmation
- handles reconnect after disconnect
- exposes a bound camera helper for actions and property access

### 3. Browser SSE helper

`src/lib/event-stream.ts`

- uses native `EventSource`
- reconnects automatically on stream failure
- exposes typed event listeners to the lifecycle layer and UI

## Live view

The app polls live-view JPEG frames over HTTP and swaps the current image in the page.

The browser UI also supports:

- OSD toggle
- zoom in/out
- focus near/far
- AF shutter / continuous shutter
- movie record toggle
- SD card file listing and download

## Key files to modify

### UI layout

- `src/app/page.tsx`

### Server lifecycle

- `src/app/api/server/route.ts`
- `src/lib/server-manager.ts` — vendored spawn/adopt logic (`$CRSDK_BINARY`)

### Camera lifecycle

- `src/lib/camera-manager.ts`

### SSE behavior

- `src/lib/event-stream.ts`

## Troubleshooting

### Camera is detected but will not connect

Try this in order:

1. unplug the camera
2. turn the camera off
3. turn the camera back on
4. reconnect USB

If it still fails:

1. stop other camera apps that may hold the camera
   - Imaging Edge Desktop
   - Creators’ App
2. stop any other running camera servers
3. restart the computer

### Next.js route keeps failing to start the server

Check whether another server is already running on `8080`. The route will usually adopt it, but stale dev processes can interfere during reloads.

Useful checks:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

### Live view or controls feel stale after code edits

Restart the Next.js dev server. Route-module and lifecycle state can survive HMR in ways that do not match a clean startup.

## Related docs

- [SSE events](https://crsdk.github.io/alpha-sdk-api/sdk/recipes/sse-events/)
- [Server subprocess](https://crsdk.github.io/alpha-sdk-api/sdk/recipes/server-subprocess/)
- [Discovery + reconnect](https://crsdk.github.io/alpha-sdk-api/sdk/recipes/discovery-reconnect/)
- [React hook](https://crsdk.github.io/alpha-sdk-api/sdk/recipes/react-hook/)
