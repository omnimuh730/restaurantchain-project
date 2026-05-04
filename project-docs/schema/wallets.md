# Schema · Wallets & Wallet Transactions

The wallet domain follows a **cache + ledger** pattern:

- **Cached amount** lives on the customer (`customer_users.wallets.{domestic,foreign,bonus}`) for fast reads on every Profile page load.
- **Source of truth** is the immutable `wallet_transactions` collection. The cached amount is `SUM(direction × amount)` over the user's transactions in the wallet's pool.

Every customer has three logical wallets that **never auto-convert**: domestic (KRW), foreign (USD), and bonus.

Source READMEs:

- `reservation/Profile/README.md` (wallets, top-up, send gift, history)

## Collection


| Collection            | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `wallet_transactions` | Immutable ledger of every credit/debit. Append-only. |


`wallets` itself (per-pool amount) is embedded on `customer_users` — see `[users.md](./users.md)`.

Top-ups and gifts do **not** have their own collections any more:

- A top-up is a `payments` row (`purpose: "wallet_top_up"`) plus matching `wallet_transactions` rows of `type: "top_up"` (and `top_up_bonus` if applicable).
- A gift is two `wallet_transactions` rows (a debit on the sender, a credit on the recipient) linked by `giftId`.

---

## Embedded wallet shape (recap)

For reference; canonical definition lives in `[users.md](./users.md)`.

```ts
customer_users.wallets = {
  domestic: { currency: "KRW" | string; amount: Decimal128 };
  foreign:  { currency: "USD" | string; amount: Decimal128 };
  bonus:    { currency: string;          amount: Decimal128 };
};
```

The cache is updated by the worker that consumes new `wallet_transactions` rows. It is recomputable from history at any time.

---

## `wallet_transactions`

```ts
type WalletTransaction = {
  _id: ObjectId;
  userId: ObjectId;
  pool: "domestic" | "foreign" | "bonus";
  currency: string;

  type:
    | "top_up"
    | "top_up_bonus"
    | "restaurant_payment"
    | "reward_earned"
    | "referral_bonus"
    | "gift_sent"
    | "gift_received"
    | "birthday_bonus"
    | "daily_bonus"
    | "refund"
    | "subscription_charge"
    | "adjustment";

  direction: "credit" | "debit";
  amount: { amount: Decimal128; currency: string };
  balanceAfter: { amount: Decimal128; currency: string };  // snapshot for audit

  // Cross-references — populate the ones that apply
  paymentId?: ObjectId;             // -> payments
  giftId?: ObjectId;                // pairs sender + recipient transactions
  reservationId?: ObjectId;
  orderId?: ObjectId;
  subscriptionId?: ObjectId;
  pointsLedgerId?: ObjectId;        // when reward credit also writes points
  dailyBonusDate?: string;          // YYYY-MM-DD when type=daily_bonus

  // Gift-specific snapshots (when type in [gift_sent, gift_received])
  giftCounterpartyUserId?: ObjectId;
  giftCounterpartyUsernameAtSend?: string;
  giftMessage?: string;

  title: string;                    // "Top Up", "Sakura Omakase", "Reward Earned"
  description?: string;
  occurredAt: Date;                 // displayed in History tab
  createdAt: Date;
};
```

### Indexes

- `{ userId: 1, occurredAt: -1 }`         // History view
- `{ userId: 1, pool: 1, occurredAt: -1 }`
- `{ type: 1, occurredAt: -1 }`
- `{ paymentId: 1 }`
- `{ giftId: 1 }`
- `{ reservationId: 1 }`
- `{ subscriptionId: 1 }`

---

## Cross-document rules

- **Immutability**: Never UPDATE a `wallet_transactions` row. Corrections are new compensating rows of `type: "adjustment"`.
- **Currency integrity**: a row's `amount.currency` must equal the wallet pool's currency; the writer rejects mismatches.
- **Top-up flow** (Profile → Top Up):
  1. Insert `payments` row (`purpose: "wallet_top_up"`) with intent metadata.
  2. On PSP success: insert `wallet_transactions` `{ type: "top_up", direction: "credit", paymentId }`.
  3. If a bonus applies: insert a second `wallet_transactions` `{ type: "top_up_bonus", direction: "credit" }` against the bonus wallet.
  4. Recompute `customer_users.wallets.{pool}.amount` for both affected wallets.
- **Gift flow** (Profile → Send Gift):
  1. Generate a `giftId`.
  2. Insert sender debit `{ type: "gift_sent", direction: "debit", giftId, giftCounterpartyUserId, giftCounterpartyUsernameAtSend, giftMessage }`.
  3. Insert recipient credit `{ type: "gift_received", direction: "credit", giftId, ... }`.
  4. Update both users' `wallets.{pool}.amount`.
  5. The product enforces: gifts cannot mix domestic and foreign in one transfer; the bonus pool is not giftable.
- **Restaurant payment via wallet**: `payments.method.kind = "wallet"` row carries `walletTransactionId` for the matching debit. Both are inserted in one transaction.
- **Refund**: refund of a wallet-funded payment writes a credit `wallet_transactions` of `type: "refund"` referencing `paymentId`.
- **Daily bonus** that pays into the wallet (vs. points): inserts `{ type: "daily_bonus", direction: "credit", dailyBonusDate }`. The same claim is also written to `customer_users.dailyBonus.history[]` for UI rendering.

## Realtime channels

- `wallet.transaction.created` (per row)
- `user.wallets.updated` (after amount recomputation)

