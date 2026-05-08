# Schema · `wallet_transactions` (unified money movement)

**Single append-only ledger** for every internal movement that touches **`cards`** balances:

- **Wallet ↔ wallet** (e.g. domestic → foreign only if product allows; usually gifts are same-pool).
- **Card ↔ card**.
- **Wallet ↔ card** — top-up from PSP into wallet, load from wallet onto card, withdraw from card to main wallet, close card and refund to wallet, etc.
- **Top-up / withdraw / gift / daily bonus / subscription charge** when the effect is on `cards` rows (not the PSP capture itself — that is `payment_transactions`).

**Not in this collection:** PSP payment capture rows → **`payment_transactions`**. Points-only events → **`rewards`**.

Source READMEs:

- `reservation/Profile/README.md` (wallets, cards, top-up, history)

## Collection

| Collection              | Purpose |
| ----------------------- | ------- |
| `wallet_transactions` | Immutable ledger for all `cards`-balance movements and cross-account flows. |

---

## `wallet_transactions`

```ts
type WalletTransaction = {
  _id: ObjectId;

  /** Primary user for feed queries (sender, payer, or owner of the debited account — product rule). */
  userId: ObjectId;

  /**
   * High-level category. Extend as needed.
   * Examples: top_up, withdraw, wallet_to_card, card_to_wallet, wallet_to_wallet,
   * card_to_card, gift_sent, gift_received, restaurant_payment, refund, daily_bonus,
   * subscription_charge, adjustment, ...
   */
  kind: string;

  /**
   * Optional double-entry legs — both reference `cards._id` (wallet or card row).
   * Single-leg events (e.g. fee) may set only one side.
   */
  fromAccountId?: ObjectId;
  toAccountId?: ObjectId;

  amount: { amount: Decimal128; currency: "KRW" | "USD" | string };

  /** Snapshots after apply (optional but useful for audit). */
  balanceAfterFrom?: { amount: Decimal128; currency: string };
  balanceAfterTo?: { amount: Decimal128; currency: string };

  /** When money entered via PSP / checkout, link the capture row. */
  paymentTransactionId?: ObjectId;

  /** When tied to a points event. */
  rewardsEntryId?: ObjectId;

  giftId?: ObjectId;
  reservationId?: ObjectId;
  orderId?: ObjectId;
  subscriptionId?: ObjectId;
  dailyBonusDate?: string;

  giftCounterpartyUserId?: ObjectId;
  giftCounterpartyUsernameAtSend?: string;
  giftMessage?: string;

  title: string;
  description?: string;
  occurredAt: Date;
  createdAt: Date;
};
```

### Indexes

- `{ userId: 1, occurredAt: -1 }`
- `{ fromAccountId: 1, occurredAt: -1 }` (sparse)
- `{ toAccountId: 1, occurredAt: -1 }` (sparse)
- `{ paymentTransactionId: 1 }` (sparse)
- `{ rewardsEntryId: 1 }` (sparse)
- `{ giftId: 1 }`, `{ reservationId: 1 }`, `{ orderId: 1 }`

---

## Cross-document rules

- **Immutability**: never UPDATE a `wallet_transactions` row; use compensating `kind: "adjustment"` rows.
- **Consistency**: update `cards.balanceKrw` / `balanceUsd` and insert `wallet_transactions` in **one database transaction**.
- **Top-up**: `payment_transactions` records the PSP success; `wallet_transactions` records the credit to the target `cards` row (`type: "wallet"` or load onto `type: "card"`).
- **Restaurant bill paid from wallet/card**: `payment_transactions` for the checkout line; `wallet_transactions` for the debit from the relevant `cards._id`.

## Realtime channels

- `wallet.transaction.created`
- `cards.balances.updated`
