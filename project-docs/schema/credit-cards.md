# Schema · Credit cards (Visa-like) & card transactions

In-app **stored-value cards** that are visually and functionally distinct from **wallets**:

- **Wallet** (`customer_users.wallets`): domestic / foreign / bonus pools — no card number or passcode.
- **Credit-style card** (`cards` collection): **only** identifier, card number, passcode, and KRW/USD balances — see below.
- **User pointers** (`customer_users`): **`ownedCardIds`** and **`linkedCardIds`** — arrays of `ObjectId` → `cards._id`. Ownership and “who may use which card” are expressed here, not on the card row.

Cards are **not** PSP payment methods (`paymentMethods[]`).

Source READMEs:

- `reservation/Profile/README.md` (wallets vs cards UI)

## Collections

| Collection          | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `cards`             | Minimal row: number, passcode, KRW/USD balances only.        |
| `card_transactions` | Append-only spend / transfer history (unbounded).          |

Terminology: `userId` means `customer_users._id`.

---

## `cards`

**Canonical shape — these fields only** (plus MongoDB `_id`):

```ts
type Card = {
  _id: ObjectId;
  cardNumber: string;
  passCode: string;
  balanceKrw: Decimal128;
  balanceUsd: Decimal128;
};
```

No `ownerUserId`, `linkedUsers`, freeze flags, or timestamps on this collection unless you explicitly extend the product later.

### Indexes

- `{ cardNumber: 1 }` **unique** — if every card number is globally unique (typical).

### Security note

Prefer **hashing or encryption at rest** for `cardNumber` and `passCode` in production; the logical model above names the plaintext fields the product conceptually uses.

---

## `customer_users` (card fields only)

```ts
type CustomerUserCardRefs = {
  /** This user created/owns these cards (`cards._id`). */
  ownedCardIds: ObjectId[];

  /** This user may spend/view these cards as a linked holder (policy outside `cards`). */
  linkedCardIds: ObjectId[];
};
```

Link requests, approval state, permissions, daily limits, freeze, and display aliases **cannot** live on the minimal `cards` document — model them on `customer_users` (embedded structs) or a separate small collection if you need them.

### Invariants

- Every `ownedCardIds[i]` and `linkedCardIds[i]` must reference an existing `cards._id`.
- **Balances**: only `balanceKrw` / `balanceUsd` on the `cards` row are authoritative for card stored value.

---

## Link & spend (high level)

- **Link**: verify `cardNumber` + `passCode` against the `cards` row, then update **users’** id arrays / link metadata (not fields on `cards`).
- **Spend**: debit `cards.balanceKrw` or `balanceUsd` in one transaction; enforce “may this user use this card?” using `ownedCardIds` / `linkedCardIds` plus your link policy.

Emit **`card_transactions`** for audit.

---

## `card_transactions`

```ts
type CardTransaction = {
  _id: ObjectId;
  usedByUserId: ObjectId;
  cardId: ObjectId;
  /** Resolve owner by finding the user whose `ownedCardIds` contains `cardId`. */
  ownerUserId: ObjectId;
  cardKindSpentAs: "owned" | "linked";
  amount: { amount: Decimal128; currency: "KRW" | "USD" | string };
  type: "payment" | "transfer" | "adjustment" | string;
  status: "pending" | "completed" | "failed" | "reversed";
  restaurantId?: ObjectId;
  reservationId?: ObjectId;
  orderId?: ObjectId;
  paymentId?: ObjectId;
  createdAt: Date;
};
```

### Indexes

- `{ usedByUserId: 1, createdAt: -1 }`
- `{ cardId: 1, createdAt: -1 }`
- `{ ownerUserId: 1, cardId: 1, createdAt: -1 }`
- `{ restaurantId: 1, createdAt: -1 }` (sparse)
- `{ reservationId: 1 }` (sparse)

---

## Cross-document rules

- **Single source of truth** for card money: `cards.balanceKrw` / `balanceUsd` only.
- Card history: append-only `card_transactions`.

## Realtime channels

- `user.cardRefs.updated`
- `card.balances.updated` (optional, when a `cards` balance changes)
- `card.transaction.created`
