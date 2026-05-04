# Schema · Payments

Unified payments domain for every transaction in the product:

- POS Orders payments (cash, credit, mix, wallet)
- Reservation deposits paid upfront
- Customer wallet top-ups
- Subscription billing

Append-only. Refunds are embedded inline. PSP intent state is captured inline (no separate `payment_intents` collection).

Source READMEs:

- `pos/Orders/README.md` (Payment cash/credit/mix)
- `pos/Settings/README.md` (Restaurant deposit cards, Upgrade Plans)
- `reservation/Reservation Flow/README.md` (Step 4)
- `reservation/Dining/README.md` (Step 3 Pay)
- `reservation/Profile/README.md` (Top Up, Pro)

## Collection

| Collection | Purpose |
|---|---|
| `payments` | Captured payments. Append-only on success; embeds refunds and PSP intent metadata. |

Customer payment methods live on `customer_users.paymentMethods[]`.
Restaurant deposit cards live on `restaurants.depositCards[]`.

---

## `payments`

A "mix" payment in POS Orders becomes two `payments` rows that share `groupId`. A wallet gift becomes two `wallet_transactions` rows linked by `giftId` (no `payments` row, since money never leaves the wallet system).

```ts
type Payment = {
  _id: ObjectId;
  groupId?: ObjectId;               // groups split payments (mix cash + credit)

  purpose:
    | "reservation_deposit"
    | "order_bill"
    | "wallet_top_up"
    | "subscription";

  // Polymorphic linkage; exactly one is set per purpose
  reservationId?: ObjectId;
  orderId?: ObjectId;
  topUpId?: ObjectId;               // logical id; the matching wallet_transactions row carries it too
  subscriptionId?: ObjectId;
  subscriptionInvoiceIndex?: number;// index into subscriptions.invoices[]

  // Who pays
  payer: {
    kind: "customer" | "restaurant";
    customerUserId?: ObjectId;
    restaurantId?: ObjectId;
  };

  receivedBy?: ObjectId;            // staff_user when applicable

  // Method used
  method:
    | { kind: "cash"; tendered: { amount: Decimal128; currency: string }; change: { amount: Decimal128; currency: string } }
    | { kind: "credit"; brand: string; last4: string; pspChargeId: string }
    | { kind: "wallet"; wallet: "domestic" | "foreign" | "bonus"; walletTransactionId?: ObjectId };

  // Embedded PSP intent metadata (was its own collection). Null for cash and wallet.
  intent?: {
    pspProvider: "stripe" | "toss" | "adyen" | string;
    pspIntentId: string;
    selectedMethodId?: ObjectId;    // -> customer_users.paymentMethods[]._id or restaurants.depositCards[]._id
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

  // ---- Embedded: Refunds ----
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

  // Computed for fast queries: amount minus successful refunds
  netAmount: { amount: Decimal128; currency: string };

  createdAt: Date;
};
```

### Indexes

- `{ orderId: 1 }`
- `{ reservationId: 1 }`
- `{ topUpId: 1 }`
- `{ subscriptionId: 1, capturedAt: -1 }`
- `{ groupId: 1 }`
- `{ "payer.customerUserId": 1, capturedAt: -1 }`
- `{ "payer.restaurantId": 1, capturedAt: -1 }`
- `{ "intent.pspIntentId": 1 }` unique sparse
- `{ purpose: 1, capturedAt: -1 }`
- `{ "refunds.status": 1, "refunds.requestedAt": -1 }` (multikey, refund worker)

### State machine

```text
intent.statusTimeline:  requires_payment ─▶ processing ─▶ succeeded  (insert payment row)
                                                       └▶ failed     (no payment row)
payment.status:         succeeded ─void─▶ voided
refund.status:          pending ─psp ok─▶ succeeded
                                ─psp fail─▶ failed
```

### Realtime channels

- `payment.captured`
- `payment.voided`
- `payment.refund.requested`
- `payment.refund.succeeded`
- `payment.refund.failed`

---

## Cross-document rules

- A `payments` row is **only** inserted after the PSP confirms capture (or for cash, immediately on tender). Failed/abandoned attempts live entirely inside `intent.statusTimeline` of an unsaved working draft and are discarded if no capture occurs.
- **Mix payments** (POS Orders → Payment(mix)) share a `groupId` and must sum to the order total. Each row records its own method.
- **Reservation refund**: a refund is appended to `payments[i].refunds[]` and `reservations.refundId` is set to that refund's `_id`. The reservation status moves to `cancelled` or `declined`.
- **Wallet top-ups** create:
  1. A `payments` row of `purpose: "wallet_top_up"`.
  2. A matching `wallet_transactions` row of `type: "top_up"` referencing `paymentId`.
  3. (If bonus applies) a second `wallet_transactions` row of `type: "top_up_bonus"` against the bonus wallet.
- **Subscription billing**: `subscriptions.invoices[i]` references the `payments` row by `paymentId`. A failed invoice writes `intent.statusTimeline` failure entries; a `payments` row is only created on success.
- **Wallet payment** (paying a bill from the wallet): the `payments.method.kind = "wallet"` row carries `walletTransactionId` to the matching `wallet_transactions` debit. The two are inserted in the same transaction.
- **netAmount** is recomputed every time a refund row is appended or its status flips. Used for finance dashboards and "amount available to refund" checks.
