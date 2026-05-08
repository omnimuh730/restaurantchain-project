# Schema · `cards` (wallets + stored-value cards)

**Wallets are not embedded on `customer_users`.** Every spendable balance for a customer lives as a row in the **`cards`** collection, discriminated by **`type`**.

| `type`   | Meaning |
| -------- | ------- |
| `wallet` | Main app wallet (logical pools: domestic KRW, foreign USD, bonus — one document per pool per owner). |
| `card`   | Visa-like stored-value card (`cardNumber`, `passCode`, balances). |

This is **one MongoDB collection** with two shapes; the app UI still treats “Wallet” vs “Card” as different surfaces.

Related ledgers (see other files):

- **`payment_transactions`** — PSP / cash / checkout payments only (`[payments.md](./payments.md)`).
- **`rewards`** — points earn/burn only (`[rewards.md](./rewards.md)`).
- **`wallet_transactions`** — **all** movements between wallet rows, between card rows, and **wallet ↔ card** (top-up, withdraw, refund to main wallet, gift, internal transfers, etc.) (`[wallets.md](./wallets.md)`).

---

## `cards`

```ts
type CardsRowBase = {
  _id: ObjectId;
  type: "wallet" | "card";
  /** Owner of this row (customer). */
  ownerUserId: ObjectId;
  balanceKrw: Decimal128;
  balanceUsd: Decimal128;
  createdAt: Date;
  updatedAt: Date;
};

type WalletRow = CardsRowBase & {
  type: "wallet";
  /** One document per pool per user (never auto-convert across pools). */
  pool: "domestic" | "foreign" | "bonus";
};

type CardRow = CardsRowBase & {
  type: "card";
  cardNumber: string;
  passCode: string;
};

type CardsDocument = WalletRow | CardRow;
```

### Indexes

- `{ ownerUserId: 1, type: 1, pool: 1 }` **unique partial** — `type: "wallet"` only (one row per pool per user).
- `{ cardNumber: 1 }` **unique partial** — `type: "card"` only, when numbers are globally unique.
- `{ ownerUserId: 1, type: 1, createdAt: -1 }` — list a user’s cards.

### Security

Prefer hashing/encryption at rest for `cardNumber` and `passCode` on **`type: "card"`** rows.

---

## `customer_users` pointers (no wallet balances here)

```ts
/** -> cards._id where type === "wallet" (typically 3 ids: domestic, foreign, bonus). */
ownedWalletIds: ObjectId[];

/** -> cards._id where type === "card" */
ownedCardIds: ObjectId[];

/** Linked access to another user’s card rows — policy outside `cards`. */
linkedCardIds: ObjectId[];
```

Caches on the user (optional, for fast Profile): you may keep **denormalized balance snapshots** only as a performance layer; **source of truth** remains `cards.balanceKrw` / `balanceUsd` updated in the same transaction as `wallet_transactions`.

---

## Realtime

- `user.storedValue.updated` — when `ownedWalletIds` / `ownedCardIds` / `linkedCardIds` change
- `cards.balances.updated` — when a `cards` balance changes
