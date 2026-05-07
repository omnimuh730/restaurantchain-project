# Schema · Credit cards (Visa-like) & card transactions

In-app **stored-value cards** that are visually and functionally distinct from **wallets**:

- **Wallet** (`customer_users.wallets`): domestic / foreign / bonus pools funded by top-ups, gifts, and rewards — no card number or passcode.
- **Credit-style card** (`customer_users.cards[]`): user-issued card with **card number + passcode** for access; optional **family / linked access** with owner approval; balances live only on **owned** cards.

Cards are **not** PSP tokenized payment methods (`paymentMethods[]`); they are first-party ledger buckets with hashed secrets.

Source READMEs:

- `reservation/Profile/README.md` (wallets vs cards UI)

## Data layout

| Where | Purpose |
| ----- | ------- |
| `customer_users.cards[]` | Single array mixing **owned** (real card + balance + secrets + link ACL) and **linked** (reference only — no copied balance or password). |
| `card_transactions` | Append-only payment / transfer history against cards; unbounded growth — **not** embedded on the user. |

Terminology: docs use `userId` (this codebase’s `customer_users._id`). The product may still label the screen "profile".

---

## Embedded `customer_users.cards[]`

Discriminate with `cardKind`.

### Shared / security

- **Never** store raw passcode or full card number. Store `passwordHash`, `cardNumberHash`, and `cardNumberLast4` for display.
- Lookup for link or pay-by-number: hash the submitted card number with a **server-side pepper**, match `cardNumberHash`, then verify passcode against `passwordHash`.

### `cardKind: "owned"`

```ts
type OwnedCard = {
  _id: ObjectId;
  cardKind: "owned";

  /** Display name on the card ("Mom Family Card"). */
  name: string;

  cardNumberHash: string;
  cardNumberLast4: string;
  passwordHash: string;

  /**
   * Per-currency balances for this card only (distinct from wallet pools).
   * Same shape idea as wallet: available vs locked.
   */
  balances: Record<
    string, // "KRW" | "USD" | ...
    { available: Decimal128; locked: Decimal128 }
  >;

  isFrozen: boolean;

  /** Owner allows new users to request linking this card (number + passcode). */
  allowExternalLink: boolean;

  /** Linked users with `active` may spend only when this is true (and other checks pass). */
  allowExternalUse: boolean;

  linkedUsers: Array<{
    userId: ObjectId; // child / linked customer
    status: "pending_approval" | "active" | "revoked";

    permissions: {
      canSpend: boolean;
      canViewBalance: boolean;
      canViewTransactions: boolean;
    };

    /** Optional per-currency daily caps for this linked user. */
    limits?: Record<string, { daily: Decimal128 }>;

    linkedAt: Date;
    decidedAt?: Date; // when approved or revoked
  }>;

  createdAt: Date;
  updatedAt: Date;
};
```

### `cardKind: "linked"`

Holds **only** a reference to someone else’s owned card. No `passwordHash`, no `cardNumberHash`, and **no** balance copy.

```ts
type LinkedCard = {
  _id: ObjectId;
  cardKind: "linked";

  /** Local label ("Mom's Card"). */
  alias: string;

  ownerUserId: ObjectId; // -> customer_users
  ownerCardId: ObjectId; // -> cards[]._id on owner's document

  status: "pending_approval" | "active" | "revoked";

  permissions: {
    canSpend: boolean;
    canViewBalance: boolean;
    canViewTransactions: boolean;
  };

  linkedAt: Date;
};
```

### Control flags (owned card)

| Field | Meaning |
| ----- | ------- |
| `isFrozen` | Card cannot be used by **anyone** (owner or linked). |
| `allowExternalLink` | New link requests can be started (number + passcode flow). |
| `allowExternalUse` | Existing **active** linked users may spend (subject to permissions and limits). |

---

## Link flow (requires approval)

```text
1. User B enters owner card number + passcode.
2. Server finds owner user A where A.cards[].cardNumberHash matches (owned card).
3. Server verifies passcode; rejects if isFrozen, !allowExternalLink, or duplicate link.
4. Server appends to A.cards[ownerIdx].linkedUsers: { userId: B, status: "pending_approval", ... }.
5. Server appends to B.cards[]: { cardKind: "linked", ownerUserId: A, ownerCardId, status: "pending_approval", ... }.
6. Owner A approves → both sides' entries move to status: "active" (permissions and limits as configured).
```

Until approved, B must not spend or see balance (per product UX).

---

## Spending resolution

Spend **always** mutates the **owner’s** `OwnedCard.balances** — never a field on `LinkedCard`.

Preconditions (all must pass):

```text
Linked: linked card status is active; owner user + owner card exist; owner card is owned, not frozen;
        allowExternalUse; linkedUsers row for this user is active; canSpend; within limits; sufficient balance.

Owner:  card not frozen; sufficient available balance; move funds available → locked or debit per your txn pattern.
```

Emit a `card_transactions` row for audit and feeds.

---

## `card_transactions`

```ts
type CardTransaction = {
  _id: ObjectId;

  /** Customer who initiated the spend (owner or linked user). */
  usedByUserId: ObjectId;

  ownerUserId: ObjectId;
  ownerCardId: ObjectId;

  /** Whether the spender used their own physical card or a linked reference. */
  cardKindSpentAs: "owned" | "linked";

  amount: { amount: Decimal128; currency: string };
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
- `{ ownerUserId: 1, ownerCardId: 1, createdAt: -1 }`
- `{ restaurantId: 1, createdAt: -1 }` (sparse)
- `{ reservationId: 1 }` (sparse)

---

## Cross-document rules

- Card balance caches on the owned card are authoritative for the card product; they are **not** the same as `customer_users.wallets`. Transfers between wallet and card (if ever allowed) are explicit operations with double-entry style rows in `card_transactions` and/or `wallet_transactions`.
- Cap `customer_users.cards` length in product policy (e.g. ≤ 100) so embedding stays bounded; `card_transactions` stays unbounded in its own collection.

## Realtime channels

- `user.cards.updated`
- `card.transaction.created`
