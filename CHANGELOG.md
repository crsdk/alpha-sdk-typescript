# Changelog

All notable changes to `@alpha-sdk/client` will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-04-28

### Added

- `liveView.getFrame({ cameraId })` and `liveView.getOsdFrame({ cameraId })` —
  return Fern's `BinaryResponse` (call `.arrayBuffer()`, `.blob()`, `.bytes()`,
  or `.stream()` to read the JPEG payload). Previously these endpoints were
  marked `x-fern-ignore` and required raw `fetch` calls.

## [0.2.0] — 2026-04-27

### Added

- `ConnectionStatusResponse` schema — the response type of
  `cameras.getConnectionStatus()`. Replaces the generic `CameraResponse` and
  exposes a typed `data.mode: ConnectionMode` field so callers can read the
  active connection mode (`"remote"` / `"remote-transfer"` / `"contents"`)
  without coercing untyped JSON.
- `ConnectionStatusResponseData` helper type.

### Changed

- `cameras.getConnectionStatus({ cameraId })` return type narrowed from
  `CameraResponse` → `ConnectionStatusResponse`. **Breaking** for callers
  that imported `CameraResponse` for this method specifically; otherwise the
  on-the-wire JSON is a strict superset.
- `BulkPropertiesData.totalProperties` is now `integer` (no longer needs
  string-coercion). Reflects matching server change.

## [0.1.0] — 2026-04-23

Initial release. Thin TypeScript client generated from the Alpha Camera REST API
OpenAPI spec via [Fern](https://buildwithfern.com/).

### Added
- `AlphaSDKClient` with resource sub-clients:
  `server`, `cameras`, `properties`, `actions`, `liveView`, `sdCard`, `settings`
- Full coverage of every REST endpoint declared in the OpenAPI spec
- Typed error classes: `AlphaSDKError` (base), `BadRequestError`,
  `NotFoundError`, `InternalServerError`
- Dual ESM + CJS builds with sentinel `package.json` files

### Not included (by design)
- SSE consumption — `subscribeAllEvents` / `subscribeCameraEvents` are marked
  `x-fern-ignore: true` in the spec. Consume via native `EventSource` (browser)
  or raw `fetch` streaming (Node) — see project docs.
- Live-view frame polling — `getLiveViewFrame` returns binary JPEG and is marked
  `x-fern-ignore: true`. Fetch directly from `/api/cameras/{id}/live-view/frame`.
