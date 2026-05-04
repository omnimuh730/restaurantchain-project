# OpenAPI

Multi-file **OpenAPI 3.1** spec for the entire page-driven product (POS + reservation app). Endpoints are derived directly from the page READMEs in `api-docs/page-driven/pos/` and `api-docs/page-driven/reservation/`. Schemas are derived from `api-docs/page-driven/schema/`.

## Layout

```
openapi/
  openapi.yaml                  # root entry: info, servers, tags, security, $refs all paths and components
  openapi.bundled.yaml          # generated single-file artifact for tools that don't follow cross-file $refs
  components/
    common.yaml                 # security schemes, error schemas, common parameters/headers/responses, Money/ObjectId/Pagination
    schemas.yaml                # every domain schema (entities + request/response DTOs)
  paths/
    auth.yaml                   # customer + staff sign-in / sign-up / refresh / sign-out / password reset
    metadata.yaml               # GET /metadata/{catalog}
    customer-profile.yaml       # /me, preferences, security answers, devices, payment methods
    customer-social.yaml        # saved items, recent searches, friends, daily bonus, referral
    customer-wallets.yaml       # wallets, top-up, gift, transactions
    customer-rewards.yaml       # rewards cache + points ledger
    customer-notifications.yaml # in-app feed, mark-read, delete
    customer-support.yaml       # support conversations and messages
    customer-subscriptions.yaml # CatchTable Pro
    discovery.yaml              # discover home, explorer search/map, public restaurant + menu, availability
    reservations.yaml           # reservation lifecycle (customer + POS shared) + invites + ratings + draft
    pos-restaurant.yaml         # settings, phones, deposit cards, staff (incl. pending), floors, menu
    pos-tables.yaml             # table CRUD, QR rotation, status flips
    pos-orders.yaml             # POS orders, items, send-batches, bills, payments (cash/credit/wallet/mix)
    pos-kitchen.yaml            # kitchen view (batches), accept / complete / recall
    pos-payments.yaml           # payment queries + refunds
    pos-analytics.yaml          # sales dashboard, revenue, menu, customers, history
    pos-subscriptions.yaml      # restaurant tier
```

## Conventions

### Versioning & base path

- `servers[0].url`: `https://api.catchtable.example/v1`
- All paths are relative; the base path includes the version segment.

### Authentication

Three security schemes are defined in `components/common.yaml`:

- `customerAuth` — Bearer JWT, scoped to a customer (`subjectKind=customer`).
- `staffAuth`    — Bearer JWT, scoped to a staff user inside a single restaurant (`subjectKind=staff`, `restaurantId` claim required).
- `publicAuth`   — Optional bearer; the same routes that work anonymously may also accept a customer token to personalize results.

Endpoints declare which scheme(s) they accept via the `security` field. POS endpoints under `/pos/restaurants/{restaurantId}/...` additionally require that the token's `restaurantId` claim equals the path parameter.

### IDs

- All entity IDs are `string` 24-char hex `ObjectId` (`pattern: ^[0-9a-fA-F]{24}$`). Defined as `#/components/schemas/ObjectId`.

### Money

Returned and accepted as:

```yaml
{ amount: "60000", currency: "KRW" }
```

`amount` is a decimal string to preserve `Decimal128` precision in transit. Server rejects mixed-currency arithmetic. Defined as `#/components/schemas/Money`.

### Timestamps

ISO-8601 UTC strings, e.g. `"2026-04-25T11:00:00.000Z"`.

### Pagination

Two patterns:

- **Offset** for stable lists (analytics, reservation history): `?page=1&pageSize=20`. Response wraps results in `{ data, page, pageSize, total }`.
- **Cursor** for feeds (notifications, transactions, points ledger): `?cursor=<opaque>&limit=20`. Response is `{ data, nextCursor }`.

### Errors

Every error response uses **RFC 7807 `application/problem+json`** with our extensions:

```json
{
  "type": "https://errors.catchtable.example/validation_failed",
  "title": "Validation failed",
  "status": 422,
  "code": "validation_failed",
  "detail": "partySize must be between 1 and 20",
  "instance": "/v1/reservations",
  "traceId": "01HK3NQ7K0F8Q9MZGE6VYYJ4G2",
  "errors": [
    { "field": "partySize", "rule": "range", "message": "must be between 1 and 20" }
  ]
}
```

The `code` enum lives in `components/common.yaml#/components/schemas/ErrorCode` and includes business errors like `deposit_required`, `qr_invalid`, `qr_rotated`, `wallet_insufficient_balance`, `currency_mismatch`, `grace_elapsed`, `payment_failed`, `subscription_past_due`, `seat_not_available`, `chef_batch_already_accepted`, etc.

Common response refs in every endpoint:

- `400` — `BadRequest` (malformed JSON, missing required fields)
- `401` — `Unauthenticated` (no/invalid token)
- `403` — `Forbidden` (token valid but missing role/permission/tenant scope)
- `404` — `NotFound`
- `409` — `Conflict` (state transition not allowed, idempotency conflict)
- `422` — `UnprocessableEntity` (validation errors)
- `429` — `TooManyRequests` (rate limit; includes `Retry-After` header)
- `500` — `InternalServerError`

### Idempotency

Mutations that may be retried (payment captures, top-ups, reservation creation, gift sends, mark-all-read) accept an `Idempotency-Key` header. Replays return the original response with `Idempotency-Replay: true`.

### Realtime

This OpenAPI document covers HTTP only. The realtime channels (e.g. `reservation.updated`, `order.batch.sent`, `wallet.transaction.created`) are documented in each schema's README under "Realtime channels". See `../schema/README.md` for the canonical list.

## Building / previewing

The spec uses external `$ref`s. Different viewers handle cross-file refs differently:

| Viewer                                                 | Use this file                       | Notes                                                   |
| ------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------- |
| **Redocly Preview**, **Stoplight Studio**, Swagger Editor (web) | `openapi.yaml` (multi-file source)  | Follows `./paths/*.yaml#/...` refs natively.            |
| **VS Code Swagger Preview / Swagger UI / Postman import** | `openapi.bundled.yaml` (generated)  | These viewers only resolve `#/...` refs in one document.|
| Code generators (`openapi-generator`, `oazapfts`, ...) | `openapi.bundled.yaml`              | Single file removes all surprises.                      |

Why two files? The multi-file source is the **editable** form (one file per domain ≈ 200–800 lines). The bundled file is **generated output** — never edit it by hand; regenerate it after touching the source.

### Regenerate the bundle

```bash
npm i -g @redocly/cli
redocly bundle api-docs/page-driven/openapi/openapi.yaml \
  -o api-docs/page-driven/openapi/openapi.bundled.yaml
```

### Lint

```bash
redocly lint api-docs/page-driven/openapi/openapi.yaml
```

The current spec lints clean against Redocly's `recommended` ruleset.

### Live preview

```bash
redocly preview-docs api-docs/page-driven/openapi/openapi.yaml   # hot-reloading docs site
```

Or with Swagger CLI (single-file only):

```bash
npm i -g swagger-cli
swagger-cli validate api-docs/page-driven/openapi/openapi.bundled.yaml
```

## Cross-reference to other docs

- Page READMEs (workflows + UX): `api-docs/page-driven/pos/*/README.md`, `api-docs/page-driven/reservation/*/README.md`
- Schema reference: `api-docs/page-driven/schema/`
- Sample documents per collection: `api-docs/page-driven/schema/examples/`
