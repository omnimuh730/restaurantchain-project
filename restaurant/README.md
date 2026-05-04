# Restaurant service

Catalog, discovery, metadata, **customer** reservations and drafts, **customer profile / notifications / social** subset, **auth** (customer + staff sign-in for JWT issuance), optional **MongoDB** persistence, and **internal** reservation mutations for the POS service.

## Layout

| Path | Description |
| --- | --- |
| [src/index.js](src/index.js) | Bootstraps Express, optional Mongo, mounts routes |
| [src/store.js](src/store.js) | In-memory domain state (users, reservations, idempotency, invites, table QR demo) |
| [src/middleware.js](src/middleware.js) | `X-Request-Id`, HTTP logging, `customerAuth`, internal key guard |
| [src/jwt.js](src/jwt.js) | HS256 access/refresh JWT (`jose`) |
| [src/db/mongo.js](src/db/mongo.js) | Optional Mongo client |
| [src/persistence.js](src/persistence.js) | `replaceOne` helpers for reservations/users when Mongo is enabled |
| [src/routes/](src/routes/) | `public`, `auth`, `customer`, `reservations` (+ `/internal` router) |

## Setup

```bash
cd restaurant
cp .env.example .env
npm install
npm run dev
```

Default: `http://127.0.0.1:4001`.

## Auth

- `POST /auth/customer/sign-in` — body `{ "username": "demo", "password": "demo" }` returns JWTs + user.
- `POST /auth/staff/sign-in` — `{ "username": "staff", "password": "demo" }` for POS demos.
- `POST /auth/refresh` — refresh rotation (JWT verify/issue).
- Customer routes accept `Authorization: Bearer <access>` **or** legacy `X-Customer-User-Id` when `ALLOW_LEGACY_AUTH_HEADERS=true`.

**`JWT_SECRET` must match the POS service** so staff access tokens validate downstream.

## MongoDB (optional)

Set `MONGODB_URI`. On startup, if `reservations` or `customer_users` collections have documents, they are loaded into the in-memory store (counts \> 0). Writes call `persistReservation` / `persistUser` when the DB is connected.

## Internal API

`X-Internal-Key` must match `INTERNAL_SERVICE_KEY` (and POS service). Used for POS-driven reservation transitions under `/internal/...`.

## Realtime stub

`GET /realtime/channels` — static channel name list; replace with a WebSocket gateway per `project-docs`.
