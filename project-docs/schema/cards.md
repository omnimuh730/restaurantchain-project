# Schema · `cards` (wallets + stored-value cards)

**Wallets are not embedded on `customer_users`.** Every spendable balance for a customer lives as a row in the **`cards`** collection, discriminated by **`type`**.

| `type`   | Meaning |
| -------- | ------- |
| `wallet` | **Exactly one** per customer — default main wallet; holds **both** `balanceKrw` and `balanceUsd` (no separate pool documents). |
| `card`   | Stored-value card (`cardNumber`, `passCodeHash`); also holds **both** `balanceKrw` and `balanceUsd`. |

This is **one MongoDB collection** with two shapes; the app UI still treats “Wallet” vs “Card” as different surfaces.

Related ledgers (see other files):

- **`payment_transactions`** — PSP / cash / checkout payments only (`[payments.md](./payments.md)`).
- **`rewards`** — points earn/burn only (`[rewards.md](./rewards.md)`).
- **`wallet_transactions`** — **all** movements between the user’s wallet row, card rows, and **wallet ↔ card** (top-up, withdraw, refund to main wallet, gift, internal transfers, etc.) (`[wallets.md](./wallets.md)`).

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
};

type CardRow = CardsRowBase & {
  type: "card";
  cardNumber: string;
  /** Argon2/bcrypt (or similar) hash of the card pass code; never store plaintext. */
  passCodeHash: string;
};

type CardsDocument = WalletRow | CardRow;
```

### Indexes

- `{ ownerUserId: 1, type: 1 }` **unique partial** — `type: "wallet"` only (**one wallet per user**).
- `{ cardNumber: 1 }` **unique partial** — `type: "card"` only, when numbers are globally unique.
- `{ ownerUserId: 1, type: 1, createdAt: -1 }` — list a user’s card rows.

### Security

Store **only** `passCodeHash` for the pass code (hash client-supplied codes on create/rotate; verify with constant-time compare). Prefer hashing or encryption at rest for `cardNumber` on **`type: "card"`** rows.

---

## `customer_users` pointers (no wallet balances here)

```ts
/** -> cards._id where type === "wallet" (exactly one per user; created with the account). */
ownedWalletId: ObjectId;

/** -> cards._id where type === "card" */
ownedCardIds: ObjectId[];

/** Linked access to another user’s card rows — policy outside `cards`. */
linkedCardIds: ObjectId[];
```

Caches on the user (optional, for fast Profile): you may keep **denormalized balance snapshots** only as a performance layer; **source of truth** remains `cards.balanceKrw` / `balanceUsd` updated in the same transaction as `wallet_transactions`.

---

## Realtime

- `user.storedValue.updated` — when `ownedWalletId` / `ownedCardIds` / `linkedCardIds` change
- `cards.balances.updated` — when a `cards` balance changes
