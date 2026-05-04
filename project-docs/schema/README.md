# MongoDB Schema

Canonical MongoDB collection schemas derived from the page-driven READMEs in:

- `api-docs/page-driven/pos/` (restaurant/staff facing)
- `api-docs/page-driven/reservation/` (customer facing)

This schema follows a **simplified 12-collection design**: aggressive embedding for bounded data, separate collections only for unbounded growth (ledgers, notifications), realtime contention (tables), or audit-critical history (payments).

## Collection list

| # | Collection | File | Notes |
|---|---|---|---|
| 1 | `customer_users` | [`users.md`](./users.md) | Embeds wallets cache, rewards cache, saved items, friends, payment methods, daily-bonus history, and customer Pro subscription summary. |
| 2 | `staff_users` | [`users.md`](./users.md) | POS staff identities and permissions. |
| 3 | `restaurants` | [`restaurants.md`](./restaurants.md) | Embeds settings, floors, simplified menu items, primary/secondary phones, deposit cards. |
| 4 | `tables` | [`tables.md`](./tables.md) | Separate — operational realtime state. |
| 5 | `reservations` | [`reservations.md`](./reservations.md) | Bridge between users and restaurants; embeds invites and timeline. |
| 6 | `orders` | [`orders.md`](./orders.md) | Embeds `order_items[]`; chef batches expressed via `sendBatchId` field. |
| 7 | `payments` | [`payments.md`](./payments.md) | Append-only; embeds `refunds[]` and method/intent metadata. |
| 8 | `wallet_transactions` | [`wallets.md`](./wallets.md) | Append-only ledger; wallet amounts on user are derived. |
| 9 | `points_ledger` | [`rewards.md`](./rewards.md) | Append-only ledger; tier/points cache lives on user. |
| 10 | `notifications` | [`notifications.md`](./notifications.md) | High-write fan-out; push tokens live on user devices. |
| 11 | `support_conversations` | [`support.md`](./support.md) | Embeds `messages[]`. |
| 12 | `metadata` | [`metadata.md`](./metadata.md) | Read-mostly catalogs (security questions, plans, tiers, amenities, preferences, support articles) as one doc per catalog. |

Plus auxiliary auth-infra collections (TTL'd, isolated): `sessions`, `password_reset_sessions`. Documented in `users.md`.

For a flat single-file dump of every schema, see [`all-collections.md`](./all-collections.md).
JSON sample documents per collection live in [`examples/`](./examples/).

## What got embedded vs. separate

The deliberate choice is to embed where data is **bounded, mostly read with the parent, and rarely written by other actors**, and separate where data is **unbounded, hot-written, queried independently, or required for audit**.

### Embedded (no longer their own collection)

| Was | Now lives on |
|---|---|
| `menu_categories`, `menu_subcategories`, `menu_items`, `menu_item_modifiers` | `restaurants.menu` |
| `floors` | `restaurants.floors[]` |
| `restaurant_settings` | `restaurants.settings` |
| `restaurant_phones` | `restaurants.primaryPhone`, `restaurants.secondaryPhone` |
| `restaurant_payment_cards` / `restaurant_deposit_cards` | `restaurants.depositCards[]` |
| `staff_join_requests` | `restaurants.pendingStaff[]` |
| `wallets` | `customer_users.wallets.{domestic,foreign,bonus}` |
| `customer_payment_methods` | `customer_users.paymentMethods[]` |
| `friend_requests`, `friends` | `customer_users.friends[]` |
| `saved_items` | `customer_users.savedItems[]` |
| `daily_bonus_claims` | `customer_users.dailyBonus.history[]` (capped, archive older) |
| `referral_codes`, `referral_redemptions` | `customer_users.referral` |
| `reward_tiers` | `metadata` doc `_id: "reward_tiers"` |
| `subscription_plans` | `metadata` doc `_id: "subscription_plans"` |
| `security_questions` | `metadata` doc `_id: "security_questions"` |
| `amenities` | `metadata` doc `_id: "amenities"` |
| `reservation_preferences_catalog` | `metadata` doc `_id: "reservation_preferences"` |
| `support_articles` | `metadata` doc `_id: "support_articles"` |
| `reservation_invites` | `reservations.invites[]` |
| subscription billing state | Embedded summaries on subject docs (`customer_users.subscription`, `restaurants.subscription`) with static plan catalog in `metadata.subscription_plans` |
| `wallet_top_ups`, `wallet_gifts` | `wallet_transactions` rows + `payments` rows linked by `groupId`/`giftId` |
| `chef_tickets`, `chef_ticket_items` | `orders.items[].chefStatus` and `orders.items[].sendBatchId` |
| `payment_intents` | `payments.intent` (latest intent state) |
| `support_messages` | `support_conversations.messages[]` |

### Stayed separate (with reason)

| Collection | Reason |
|---|---|
| `tables` | Operational realtime state changed concurrently by multiple staff; separate to avoid contention on the restaurant doc. |
| `wallet_transactions` | Append-only money ledger; unbounded growth; financial audit; power-user volume exceeds safe embedding. |
| `points_ledger` | Append-only loyalty ledger; required to explain tier and reverse fraud. |
| `notifications` | Highest write rate per recipient; unbounded growth; mark-read/delete-all are per-row mutations. |
| `payments` | Append-only finance record; cross-purpose queries (reservation, order, top-up, subscription); audit. |
| `reservations` | Bridges customer ↔ restaurant; queried from both sides; central state machine. |
| `orders` | Operational; lifecycle independent of any single reservation. |
| `support_conversations` | Agent queue requires querying all open chats across users. |

## Conventions

### IDs

- Every document has `_id: ObjectId`.
- Cross-references use `<entity>Id: ObjectId`.
- Embedded subdocuments that are referenced from other collections (e.g. `restaurants.menu.items[]._id`) keep their own `ObjectId` so order snapshots can point at them.
- Human-friendly codes (confirmation codes, referral codes, slugs) are separate string fields with their own indexes.

### Timestamps

- `createdAt: Date` and `updatedAt: Date` on every collection.
- `deletedAt: Date | null` for soft delete on collections that need it.

### Money

```ts
type Money = {
  amount: Decimal128;          // never floats
  currency: "KRW" | "USD" | string;
};
```

KRW has zero minor units; USD has two. Servers compute totals in `Decimal128` and reject mixed-currency arithmetic.

### Multi-tenant scoping

POS-side collections carry `restaurantId`. Customer-side collections carry `userId`. `reservations` and `payments` may carry both.

### Status enums

State machines are documented per-collection. Statuses are stored as snake_case strings (`requested`, `confirmed`, `arrived`, `paid`, `voided`, `cancelled`, etc.).

### Indexes

Each file lists `Indexes:` blocks. Defaults:

- single-field index on every foreign key
- compound index on `(tenantId, status, createdAt desc)` for any list/feed
- TTL index on transient sessions, drafts, qr nonces
- text index only when a screen exposes free-text search
- `2dsphere` index on `restaurants.location` for map queries

### Money-related integrity rules

- Wallet amounts on `customer_users` are derived from `wallet_transactions` and recomputable.
- Reward points/tier on `customer_users` are derived from `points_ledger` and recomputable.
- Payments are append-only. Refunds are embedded rows on the parent payment, not mutations.

### Realtime channels

Channels referenced in the page READMEs are listed alongside the collection that owns the entity. They are emitted from changes; not stored in MongoDB.
