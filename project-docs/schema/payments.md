# Schema · Payment transactions

**Checkout / PSP / cash captures only** — reservation deposits, order bills, subscription charges, and other **payment** events that are not purely internal `cards` balance moves.

Internal top-ups (money hitting a `cards` row) pair a **`payment_transactions`** row with one or more **`wallet_transactions`** rows (`[wallets.md](./wallets.md)`).

Source READMEs:

- `pos/Orders/README.md`, `reservation/Reservation Flow/README.md`, `reservation/Profile/README.md`

## Collection

| Collection               | Purpose |
| ------------------------ | ------- |
| `payment_transactions`   | Append-only payment captures; embeds refunds and PSP intent metadata. |

Customer PSP payment methods: `customer_users.paymentMethods[]`. Restaurant deposit cards: `restaurants.depositCards[]`.

---

## `payment_transactions`

```ts
type PaymentTransaction = {
  _id: ObjectId;
  groupId?: ObjectId;

  purpose:
    | "reservation_deposit"
    | "order_bill"
    | "wallet_top_up"
    | "subscription";

  reservationId?: ObjectId;
  orderId?: ObjectId;
  topUpId?: ObjectId;
  subscriptionId?: ObjectId;
  subscriptionInvoiceIndex?: number;

  payer: {
    kind: "customer" | "restaurant";
    customerUserId?: ObjectId;
    restaurantId?: ObjectId;
  };

  receivedBy?: ObjectId;

  method:
    | { kind: "cash"; tendered: { amount: Decimal128; currency: string }; change: { amount: Decimal128; currency: string } }
    | { kind: "credit"; brand: string; last4: string; pspChargeId: string }
    | { kind: "wallet"; cardsAccountId: ObjectId; walletTransactionId?: ObjectId };

  intent?: {
    pspProvider: "stripe" | "toss" | "adyen" | string;
    pspIntentId: string;
    selectedMethodId?: ObjectId;
    rawMethodHint?: "apple_pay" | "google_pay" | "paypal" | "bank_transfer" | "card";
    statusTimeline: Array<{
      at: Date;
      status: "requires_payment" | "processing" | "succeeded" | "failed" | "cancelled";
      failure?: { code: string; message: string };
    }>;
  };

  amount: { amount: Decimal128; currency: string };
  pool: "domestic" | "foreign";

  status: "succeeded" | "voided";
  capturedAt: Date;
  voidedAt?: Date | null;
  voidReason?: string | null;

  refunds: Array<{
    _id: ObjectId;
    amount: { amount: Decimal128; currency: string };
    reason:
      | "reservation_declined"
      | "user_cancelled"
      | "no_show_waiver"
      | "order_voided"
      | "duplicate"
      | "other";
    pspRefundId?: string;
    status: "pending" | "succeeded" | "failed";
    initiatedBy: { kind: "customer" | "staff" | "system"; id?: ObjectId };
    failure?: { code: string; message: string };
    refundedAt?: Date;
    requestedAt: Date;
    updatedAt: Date;
  }>;

  netAmount: { amount: Decimal128; currency: string };
  createdAt: Date;
};
```

### Indexes

Same as legacy `payments`: `{ orderId: 1 }`, `{ reservationId: 1 }`, `{ topUpId: 1 }`, `{ subscriptionId: 1, capturedAt: -1 }`, `{ groupId: 1 }`, payer indexes, `{ "intent.pspIntentId": 1 }` unique sparse, `{ purpose: 1, capturedAt: -1 }`, refund multikey.

### Cross-document rules

- Insert only after capture succeeds (or immediately for cash).
- **Wallet-funded payment**: `method.kind = "wallet"` references the debited **`cards._id`** (`cardsAccountId`) and links `walletTransactionId` to the matching **`wallet_transactions`** row. Written in one DB transaction with the balance update on `cards`.
- **Top-up**: `purpose: "wallet_top_up"` here; credits applied via **`wallet_transactions`** referencing `paymentTransactionId`.
- **Gifts** between users (no PSP): **no** `payment_transactions` row; only **`wallet_transactions`** legs between `cards` rows.

### Realtime

- `payment.captured`, `payment.voided`, `payment.refund.requested`, `payment.refund.succeeded`, `payment.refund.failed`
