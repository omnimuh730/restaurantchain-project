# Schema · Orders

POS-side operational orders. Items are **embedded inline** with their full lifecycle and chef-batch grouping; no separate `chef_tickets` collection.

Source READMEs:

- `pos/Orders/README.md`
- `pos/Kitchen/README.md`
- `reservation/Dining/README.md` (live bill mirrors `orders.items`)

## Collection

| Collection | Purpose |
|---|---|
| `orders` | Open or closed table order; one per dining session. Embeds the full item list. |

The kitchen view is a **derived view**: group `orders.items[]` by `sendBatchId` filtered to `chefStatus != "draft"`. No separate chef ticket rows exist.

---

## `orders`

```ts
type Order = {
  _id: ObjectId;
  restaurantId: ObjectId;
  floorId: ObjectId;                // -> restaurants.floors[]._id
  tableId: ObjectId;                // -> tables
  reservationId?: ObjectId | null;  // present when opened from a reservation

  openedBy: ObjectId;               // staff_users
  openedAt: Date;
  closedAt?: Date | null;

  partySize?: number;
  guestUserIds: ObjectId[];         // optional: linked customer users (e.g. via QR)

  // Dual-pool totals — never mixed. Excludes drafts.
  totals: {
    domestic: { amount: Decimal128; currency: string };
    foreign:  { amount: Decimal128; currency: string };
  };
  itemCount: number;                // cached, excludes drafts
  draftItemCount: number;           // cached

  // Tax + tip captured at bill time
  bill?: {
    subtotal: { amount: Decimal128; currency: string };
    taxRate: number;                // 0.0875
    tax:     { amount: Decimal128; currency: string };
    tipRate?: number;               // 0.18
    tip:     { amount: Decimal128; currency: string };
    total:   { amount: Decimal128; currency: string };
    finalizedAt?: Date;
    finalizedBy?: ObjectId;         // staff
  };

  status:
    | "open"             // accepting drafts/sends
    | "bill_requested"   // guest tapped Request Bill
    | "bill"             // bill finalized, awaiting payment
    | "paid"             // fully paid
    | "voided";          // cancelled before payment

  paymentIds: ObjectId[];           // -> payments (mix payment may produce 2 rows)

  // ---- Embedded: Items ----
  items: Array<{
    _id: ObjectId;
    menuItemId: ObjectId;           // -> restaurants.menu.items[]._id

    // Snapshot at order time so prices/names are stable even if the menu changes.
    snapshot: {
      name: string;
      shortName?: string;
      price: { amount: Decimal128; currency: string };
      pool: "domestic" | "foreign" | "either";
    };

    qty: number;
    modifiers: Array<{
      modifierId: ObjectId;         // -> restaurants.menu.items[].modifiers[]._id
      name: string;
      priceDelta: { amount: Decimal128; currency: string };
    }>;
    note?: string;

    // Item lifecycle
    chefStatus:
      | "draft"                     // entered locally, not sent
      | "sent"                      // forwarded to kitchen
      | "in_progress"               // chef accepted
      | "ready"                     // ticked off / served
      | "voided";                   // cancelled before/after send

    // Chef batch — items sent together share the same sendBatchId.
    // Kitchen UI groups items by sendBatchId to render one "ticket" card.
    sendBatchId?: ObjectId | null;
    sentAt?: Date;
    acceptedBy?: ObjectId;          // chef who accepted the batch
    acceptedAt?: Date;
    completedBy?: ObjectId;
    completedAt?: Date;

    addedBy: ObjectId;              // staff
    addedAt: Date;
    voidedBy?: ObjectId | null;
    voidedAt?: Date | null;
    voidReason?: string | null;
  }>;

  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};
```

### Indexes

- `{ restaurantId: 1, status: 1, openedAt: -1 }`
- `{ tableId: 1, status: 1 }`
- `{ reservationId: 1 }` unique sparse
- `{ restaurantId: 1, "bill.finalizedAt": -1 }`
- `{ "items.sendBatchId": 1 }` (multikey, kitchen view)
- `{ restaurantId: 1, "items.snapshot.name": 1 }` (multikey, Menu Analysis)
- `{ "items.chefStatus": 1 }` (multikey)

### Order state diagram

```text
open ─request_bill─▶ bill_requested ─finalize─▶ bill ─pay─▶ paid
open ─void──────────▶ voided
bill ─void──────────▶ voided   (only by manager + with audit reason)
```

### Item (chefStatus) state diagram

```text
draft ─send─▶ sent ─accept─▶ in_progress ─complete─▶ ready
any ─void─▶ voided
ready ─recall─▶ in_progress
```

### Realtime channels

- `order.updated`
- `order.item.added`
- `order.item.updated`        // status change, qty change, modifier change
- `order.item.voided`
- `order.bill.finalized`
- `order.paid`
- `order.batch.sent`          // emitted when a new sendBatchId is created
- `order.batch.accepted`
- `order.batch.completed`

---

## Cross-document rules

- **Sending drafts to the kitchen**: assigns a fresh `sendBatchId` to all currently-`draft` items in the order, flips their `chefStatus` to `sent`, sets `sentAt`. The kitchen subscribes to `order.batch.sent` and renders one card per batch.
- **Kitchen acceptance** sets `acceptedBy`/`acceptedAt` on every item in the batch and flips `chefStatus` to `in_progress`.
- **Completion** is per-item: each ticked line moves to `ready`. The batch is "completed" when every item in the batch is `ready` or `voided`.
- **Recall** flips `ready` → `in_progress` for that one item.
- `orders.totals.{domestic,foreign}` is recomputed on every item change. Drafts are excluded.
- An order can be opened with or without a reservation. From reservation QR check-in, `reservationId` is set and the matching `tables.occupancy.orderId` is set in the same transaction.
- Voiding the order leaves all items in `voided`. Refunds go through the `payments` row, never by mutating order data.
- The customer's "Live Bill" view aggregates `orders.items[]` filtered to `chefStatus != "draft"`.
