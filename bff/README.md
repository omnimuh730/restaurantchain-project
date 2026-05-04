# BFF (Backend for Frontend)

Single HTTP entry for clients. Proxies to upstream services with timeouts, CORS, request IDs, and structured logs.

## Routing (edge)

| Path prefix | Upstream |
| --- | --- |
| `/pos/*` | `POS_SERVICE_URL` (POS service) |
| Everything else (e.g. `/auth/*`, `/me/*`, `/discover`, `/reservations`, `/metadata`, `/internal` is **not** exposed through BFF) | `RESTAURANT_SERVICE_URL` (restaurant service) |

Future services (e.g. dedicated `auth/`): add a branch in `pickTarget` in [src/index.js](src/index.js) and document here.

## Setup

```bash
cd bff
cp .env.example .env
npm install
```

## Run

```bash
npm run dev
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PORT` | BFF listen port (default 4000) |
| `RESTAURANT_SERVICE_URL` | Restaurant service base URL |
| `POS_SERVICE_URL` | POS service base URL |
| `UPSTREAM_TIMEOUT_MS` | Abort upstream `fetch` after this many ms (default 15000) |
| `CORS_ORIGINS` | Comma-separated allowed origins; omit for `origin: true` (dev) |
| `TRUST_PROXY` | `1` / `true` to enable `trust proxy` behind a gateway |

## Forwarded headers

`Authorization`, `Idempotency-Key`, `Accept-Language`, `If-None-Match`, `X-Customer-User-Id`, `X-Staff-User-Id`, `X-Restaurant-Id`, and `X-Request-Id` (BFF-generated or echoed).

## Health

`GET /health` aggregates `GET /health` from both upstreams.

## Run order

Start **restaurant**, then **pos**, then **bff**. Integration smoke: `node ../scripts/smoke.mjs` from repo root (with all three running).
