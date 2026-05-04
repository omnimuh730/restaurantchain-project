# POS service

Staff APIs under `/pos/*`: reservations (proxy to restaurant **internal** API), **tables**, **orders**, **kitchen**, **payments**, and stubs for **analytics** and **subscription**.

## Auth

- Prefer `Authorization: Bearer <staff access JWT>` from `POST /auth/staff/sign-in` on the restaurant service (`JWT_SECRET` must match).
- Legacy: `X-Staff-User-Id` + `X-Restaurant-Id` when `ALLOW_LEGACY_AUTH_HEADERS=true`.

## Permissions

Routes check JWT `permissions` claims (or `DEMO_STAFF_PERMISSIONS` in legacy mode), e.g. `reservations.approve`, `tables.edit`, `orders.take`, `payments.process`, `payments.refund`, `kitchen.act`, `analytics.view`, `restaurant.settings`.

## OpenAPI path note

Colon-suffix verbs in OpenAPI (e.g. `:approve`) are implemented as extra path segments (e.g. `/approve`) for Express compatibility.

## Setup

```bash
cd pos
cp .env.example .env
npm install
npm run dev
```

## Key routes

- Reservations: `GET /pos/restaurants/:rid/reservations`, `GET /pos/reservations/:id`, `POST .../approve|decline|check-in|no-show|cancel`
- Tables: `GET/POST /pos/restaurants/:rid/floors/:fid/tables`, `GET /pos/restaurants/:rid/tables`, `PATCH|DELETE .../tables/:tid`, `PUT .../floors/:fid/tables`, `POST .../tables/:tid/qr-code/rotate`, `PUT .../tables/:tid/status`
- Orders: `GET|POST /pos/restaurants/:rid/orders`, `GET /pos/orders/:id`, items CRUD, `send-batch`, `request-bill`, `finalize-bill`, `payments`, `void`
- Kitchen: `GET /pos/restaurants/:rid/kitchen/batches`, `POST .../batches/:bid/accept`, item `complete` / `recall`
- Payments: `GET /pos/restaurants/:rid/payments`, `GET /pos/payments/:id`, `POST .../refunds`

## Internal dependency

POS calls restaurant `RESTAURANT_SERVICE_URL` with `INTERNAL_SERVICE_KEY` for reservation reads/writes.
