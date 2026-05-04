# All Collections (12)

Single-file reference for every MongoDB collection in the system. For per-domain context, sample documents, and state diagrams, see the individual files in this directory.


| #   | Collection              | Purpose                                                                                                                                              | Detail                                   |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `customer_users`        | End users of the reservation app; embeds wallet amounts cache, rewards cache, social, payment methods, daily-bonus, referral, subscription summary. | `[users.md](./users.md)`                 |
| 2   | `staff_users`           | POS users tied to a single restaurant.                                                                                                               | `[users.md](./users.md)`                 |
| 3   | `restaurants`           | Tenant root; embeds settings, floors, simplified menu, deposit cards, pending-staff inbox.                                                             | `[restaurants.md](./restaurants.md)`     |
| 4   | `tables`                | Per-floor operational state with QR; separate from `restaurants` to avoid contention.                                                                | `[tables.md](./tables.md)`               |
| 5   | `reservations`          | Customer ↔ restaurant bridge; embeds invites and timeline.                                                                                           | `[reservations.md](./reservations.md)`   |
| 6   | `orders`                | POS order; embeds items with chef batches via `sendBatchId`.                                                                                         | `[orders.md](./orders.md)`               |
| 7   | `payments`              | Append-only payments; embeds `refunds[]` and PSP intent metadata.                                                                                    | `[payments.md](./payments.md)`           |
| 8   | `wallet_transactions`   | Append-only wallet ledger across domestic, foreign, bonus pools.                                                                                     | `[wallets.md](./wallets.md)`             |
| 9   | `points_ledger`         | Append-only loyalty points ledger.                                                                                                                   | `[rewards.md](./rewards.md)`             |
| 10  | `notifications`         | One row per delivered in-app notification (customer or staff).                                                                                       | `[notifications.md](./notifications.md)` |
| 11  | `support_conversations` | Support thread; embeds messages.                                                                                                                     | `[support.md](./support.md)`             |
| 12  | `metadata`              | One doc per static catalog (security questions, plans, tiers, amenities, articles, ...).                                                             | `[metadata.md](./metadata.md)`           |


Auxiliary auth-infra (TTL'd, not part of the 12): `sessions`, `password_reset_sessions` — see `[users.md](./users.md)`.

## Conventions (recap)

- `_id: ObjectId` on every document.
- Cross-references: `<entity>Id: ObjectId`.
- Money: `{ amount: Decimal128; currency: "KRW" | "USD" | string }`. Never floats. Never auto-converted.
- Timestamps: `createdAt`, `updatedAt`. Soft delete via `deletedAt`.
- Multi-tenant: POS-side carries `restaurantId`; customer-side carries `userId`; `reservations` and `payments` carry both as needed.
- Status fields are snake_case strings.
- Indexes: foreign keys + `(tenantId, status, createdAt desc)` for feeds + TTL on transient docs + 2dsphere for geo.

---

## 1) `customer_users`

```ts
type CustomerUser = {
  _id: ObjectId;

  username: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  avatarImg?: string;               // base64 image data

  status: "active" | "deactivated" | "deleted";

  securityAnswers: Array<{
    questionId: string;             // metadata.security_questions.items[].code
    answerHash: string;
  }>;

  wallets: {
    domestic: { currency: "KRW" | string; amount: Decimal128 };
    foreign:  { currency: "USD" | string; amount: Decimal128 };
    bonus:    { currency: string;          amount: Decimal128 };
  };

  rewards: {
    tier: "silver" | "gold" | "platinum" | "diamond";
    points: number;
    nextTier?: "gold" | "platinum" | "diamond" | null;
    pointsToNextTier?: number;
  };

  paymentMethods: Array<{
    _id: ObjectId;
    pspProvider: string;
    pspExternalId: string;
    kind: "card" | "apple_pay" | "google_pay" | "paypal" | "bank_account";
    card?: { brand: string; last4: string; expMonth: number; expYear: number };
    bank?: { bankName: string; last4: string };
    isDefault: boolean;
    fundsForeign: boolean;
    fundsDomestic: boolean;
    addedAt: Date;
  }>;

  savedItems: Array<{
    _id: ObjectId;
    itemType: "restaurant" | "food";
    restaurantId?: ObjectId;
    foodId?: ObjectId;
    savedAt: Date;
  }>;

  friends: Array<{
    friendId: ObjectId;
    status: "pending_outgoing" | "pending_incoming" | "accepted" | "blocked";
    source: "request" | "import";
    requestedAt: Date;
    acceptedAt?: Date;
  }>;

  referral: {
    code: string;
    referredByCode?: string;
    reward?: { amount: Decimal128; currency: string };
    redemptions: Array<{
      refereeUserId: ObjectId;
      redeemedAt?: Date;
    }>;
  };

  dailyBonus: {
    lastClaimedDate?: string;
    history: Array<{
      localDate: string;
      selectedBox: number;
      reward?: { amount: Decimal128; currency: string };
      claimedAt: Date;
    }>;
  };

  subscription?: {
    tier: "pro";
    billingCycle: "monthly" | "quarterly" | "yearly";
    status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
    issueDate: Date;
    expireDate: Date;
    currentPeriodEnd: Date;
    cancelAtPeriodEnd: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};
```

Indexes: `{username:1}`u, `{phone:1}`us, `{"referral.code":1}`u, `{status:1, createdAt:-1}`, `{"savedItems.restaurantId":1}`mk, `{"friends.friendId":1, "friends.status":1}`mk.

---

## 2) `staff_users`

```ts
type StaffUser = {
  _id: ObjectId;
  restaurantId: ObjectId;
  username: string;
  passwordHash: string;
  passwordIsDefault: boolean;
  fullName: string;
  role: "manager" | "waiter" | "chef" | "cashier";
  permissions: string[];
  status: "pending_approval" | "active" | "inactive" | "rejected";
  approvedBy?: ObjectId; approvedAt?: Date;
  rejectedBy?: ObjectId; rejectedAt?: Date;
  inactivatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```

Indexes: `{restaurantId:1, username:1}`u, `{restaurantId:1, role:1, status:1}`, `{status:1, createdAt:-1}`.

---

## 3) `restaurants`

```ts
type Restaurant = {
  _id: ObjectId;
  name: string;
  cuisine: string[];
  priceLevel: 1 | 2 | 3 | 4;
  description?: string;
  status: "pending_approval" | "active" | "suspended";
  thumbnailUrl?: string;
  imageUrls: string[];
  address: { line1: string; line2?: string; city: string; state?: string; country: string; postalCode?: string };
  location: { type: "Point"; coordinates: [number, number] };
  primaryPhone?: string;
  secondaryPhone?: string;
  rating: {
    reviewCount: number;
    overall: Decimal128;
    taste: Decimal128;
    ambience: Decimal128;
    service: Decimal128;
    valueOfPrice: Decimal128;
  };
  amenities: string[];
  flags: { isNew?: boolean };
  subscription: {
    tier: "free" | "pro" | "ultra";
    issueDate: Date;
    expireDate: Date;
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing";
  };

  settings: {
    general: {
      deposit: { moneyType: "domestic" | "foreign"; amount: Decimal128 };
      gracePeriodMinutes: number;
      operatingHours: Array<{ day: 0|1|2|3|4|5|6; open: string; close: string; closed?: boolean }>;
    };
  };

  floors: Array<{ _id: ObjectId; name: string; sortOrder: number; isPublished: boolean; deletedAt?: Date | null }>;

  menu: {
    categories: Array<{
      _id: ObjectId; name: string; iconUrl?: string; sortOrder: number; isActive: boolean;
      subcategories: Array<{ _id: ObjectId; name: string; sortOrder: number; isActive: boolean }>;
    }>;
    items: Array<{
      _id: ObjectId; categoryId: ObjectId; subcategoryId?: ObjectId | null;
      name: string; shortName?: string; description?: string; imageUrl?: string; tags?: string[];
      price: { amount: Decimal128; currency: string };
      isActive: boolean; deletedAt?: Date | null;
      createdAt: Date; updatedAt: Date;
    }>;
  };

  depositCards: Array<{
    _id: ObjectId; pspProvider: string; pspExternalId: string;
    brand: string; last4: string; expMonth: number; expYear: number;
    isDefault: boolean; registrationMode: "scan" | "type";
    createdBy: ObjectId; addedAt: Date; deletedAt?: Date | null;
  }>;

  pendingStaff: Array<{
    _id: ObjectId; fullName: string; username: string; passwordHash: string;
    requestedRole: "waiter" | "chef" | "cashier"; requestedAt: Date;
  }>;

  createdBy: ObjectId;
  createdAt: Date; updatedAt: Date; deletedAt?: Date | null;
};
```

Indexes: `{status:1, "subscription.tier":1}`, `{"rating.overall":-1}`, `{cuisine:1}`, `{amenities:1}`, `{location:"2dsphere"}`, text(`name, description`), `{"menu.items._id":1}`mk, `{"menu.items.categoryId":1}`mk.

---

## 4) `tables`

```ts
type Table = {
  _id: ObjectId;
  restaurantId: ObjectId;
  floorId: ObjectId;
  name: string;
  seats: number;
  shape: "circle" | "square" | "rect";
  size: { w: number; h: number };
  position: { x: number; y: number };
  z: number;
  status: "available" | "reserved" | "occupied" | "needs_cleaning" | "out_of_service";
  occupancy?: {
    reservationId?: ObjectId | null;
    orderId?: ObjectId | null;
    seatedAt: Date;
    partySize?: number;
  };
  createdAt: Date; updatedAt: Date; deletedAt?: Date | null;
};
```

Indexes: `{restaurantId:1, floorId:1}`, `{restaurantId:1, status:1}`, `{"occupancy.reservationId":1}`, `{"occupancy.orderId":1}`.

---

## 5) `reservations`

```ts
type Reservation = {
  _id: ObjectId;
  restaurantId: ObjectId;
  userId: ObjectId;
  confirmationCode: string;
  partySize: number;
  date: string;
  time: string;
  seating?: string;
  contact: { fullName: string; phone: string };
  occasion: "anniversary" | "birthday" | "date_night" | "business" | "casual" | "celebration";
  specialRequests?: string;
  preferences: { seating: string[]; cuisine: string[]; vibe: string[]; amenities: string[] };
  deposit:    { amount: Decimal128; currency: string };
  paymentId?: ObjectId | null;
  refundId?: ObjectId | null;
  tableId?: ObjectId | null;
  orderId?: ObjectId | null;
  status:
    | "requested" | "confirmed" | "declined"
    | "arrived" | "dining" | "bill_requested" | "bill"
    | "visited" | "cancelled" | "no_show";
  invites: Array<{
    _id: ObjectId;
    inviteeUserId: ObjectId;
    status: "pending" | "accepted" | "declined" | "expired";
    invitedAt: Date; decidedAt?: Date; expiresAt: Date;
  }>;
  timeline: Array<{
    at: Date;
    type: "requested" | "approved" | "declined" | "checked_in" | "order_opened"
        | "bill_requested" | "bill_finalized" | "paid"
        | "cancelled_by_user" | "cancelled_by_restaurant" | "no_show";
    actor?: { kind: "customer" | "staff" | "system"; id?: ObjectId };
    note?: string;
  }>;
  rating?: {
    overall?: number | null;
    taste?: number | null;
    ambience?: number | null;
    service?: number | null;
    valueOfPrice?: number | null;
  } | null;
  ratingComment?: string | null;
  pointsEarned?: number;
  createdAt: Date; updatedAt: Date;
  cancelledAt?: Date | null; cancelReason?: string | null;
};
```

Indexes: `{confirmationCode:1}`u, `{userId:1, status:1, date:-1, time:-1}`, `{restaurantId:1, status:1, date:1, time:1}`, `{tableId:1}`, `{orderId:1}`, `{paymentId:1}`, `{status:1, date:1, time:1}`, `{"invites.inviteeUserId":1, "invites.status":1}`mk.

---

## 6) `orders`

```ts
type Order = {
  _id: ObjectId;
  restaurantId: ObjectId;
  floorId: ObjectId;
  tableId: ObjectId;
  reservationId?: ObjectId | null;
  openedBy: ObjectId; openedAt: Date; closedAt?: Date | null;
  partySize?: number;
  guestUserIds: ObjectId[];
  totals: {
    domestic: { amount: Decimal128; currency: string };
    foreign:  { amount: Decimal128; currency: string };
  };
  itemCount: number;
  draftItemCount: number;
  bill?: {
    subtotal: { amount: Decimal128; currency: string };
    taxRate: number;
    tax:     { amount: Decimal128; currency: string };
    tipRate?: number;
    tip:     { amount: Decimal128; currency: string };
    total:   { amount: Decimal128; currency: string };
    finalizedAt?: Date; finalizedBy?: ObjectId;
  };
  status: "open" | "bill_requested" | "bill" | "paid" | "voided";
  paymentIds: ObjectId[];
  items: Array<{
    _id: ObjectId;
    menuItemId: ObjectId;
    snapshot: { name: string; shortName?: string; price: { amount: Decimal128; currency: string }; pool: "domestic"|"foreign"|"either" };
    qty: number;
    modifiers: Array<{ modifierId: ObjectId; name: string; priceDelta: { amount: Decimal128; currency: string } }>;
    note?: string;
    chefStatus: "draft" | "sent" | "in_progress" | "ready" | "voided";
    sendBatchId?: ObjectId | null;
    sentAt?: Date;
    acceptedBy?: ObjectId; acceptedAt?: Date;
    completedBy?: ObjectId; completedAt?: Date;
    addedBy: ObjectId; addedAt: Date;
    voidedBy?: ObjectId | null; voidedAt?: Date | null; voidReason?: string | null;
  }>;
  notes?: string;
  createdAt: Date; updatedAt: Date;
};
```

Indexes: `{restaurantId:1, status:1, openedAt:-1}`, `{tableId:1, status:1}`, `{reservationId:1}`us, `{restaurantId:1, "bill.finalizedAt":-1}`, `{"items.sendBatchId":1}`mk, `{restaurantId:1, "items.snapshot.name":1}`mk, `{"items.chefStatus":1}`mk.

---

## 7) `payments`

```ts
type Payment = {
  _id: ObjectId;
  groupId?: ObjectId;
  purpose: "reservation_deposit" | "order_bill" | "wallet_top_up" | "subscription";
  reservationId?: ObjectId; orderId?: ObjectId;
  topUpId?: ObjectId; subscriptionId?: ObjectId; subscriptionInvoiceIndex?: number;
  payer: { kind: "customer" | "restaurant"; customerUserId?: ObjectId; restaurantId?: ObjectId };
  receivedBy?: ObjectId;
  method:
    | { kind: "cash"; tendered: { amount: Decimal128; currency: string }; change: { amount: Decimal128; currency: string } }
    | { kind: "credit"; brand: string; last4: string; pspChargeId: string }
    | { kind: "wallet"; wallet: "domestic" | "foreign" | "bonus"; walletTransactionId?: ObjectId };
  intent?: {
    pspProvider: string;
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
  capturedAt: Date; voidedAt?: Date | null; voidReason?: string | null;
  refunds: Array<{
    _id: ObjectId;
    amount: { amount: Decimal128; currency: string };
    reason: "reservation_declined" | "user_cancelled" | "no_show_waiver" | "order_voided" | "duplicate" | "other";
    pspRefundId?: string;
    status: "pending" | "succeeded" | "failed";
    initiatedBy: { kind: "customer" | "staff" | "system"; id?: ObjectId };
    failure?: { code: string; message: string };
    refundedAt?: Date; requestedAt: Date; updatedAt: Date;
  }>;
  netAmount: { amount: Decimal128; currency: string };
  createdAt: Date;
};
```

Indexes: `{orderId:1}`, `{reservationId:1}`, `{topUpId:1}`, `{subscriptionId:1, capturedAt:-1}`, `{groupId:1}`, `{"payer.customerUserId":1, capturedAt:-1}`, `{"payer.restaurantId":1, capturedAt:-1}`, `{"intent.pspIntentId":1}`us, `{purpose:1, capturedAt:-1}`, `{"refunds.status":1, "refunds.requestedAt":-1}`mk.

---

## 8) `wallet_transactions`

```ts
type WalletTransaction = {
  _id: ObjectId;
  userId: ObjectId;
  pool: "domestic" | "foreign" | "bonus";
  currency: string;
  type:
    | "top_up" | "top_up_bonus" | "restaurant_payment" | "reward_earned" | "referral_bonus"
    | "gift_sent" | "gift_received" | "birthday_bonus" | "daily_bonus"
    | "refund" | "subscription_charge" | "adjustment";
  direction: "credit" | "debit";
  amount: { amount: Decimal128; currency: string };
  balanceAfter: { amount: Decimal128; currency: string };
  paymentId?: ObjectId; giftId?: ObjectId;
  reservationId?: ObjectId; orderId?: ObjectId; subscriptionId?: ObjectId;
  pointsLedgerId?: ObjectId; dailyBonusDate?: string;
  giftCounterpartyUserId?: ObjectId;
  giftCounterpartyUsernameAtSend?: string;
  giftMessage?: string;
  title: string; description?: string;
  occurredAt: Date; createdAt: Date;
};
```

Indexes: `{userId:1, occurredAt:-1}`, `{userId:1, pool:1, occurredAt:-1}`, `{type:1, occurredAt:-1}`, `{paymentId:1}`, `{giftId:1}`, `{reservationId:1}`, `{subscriptionId:1}`.

---

## 9) `points_ledger`

```ts
type PointsLedgerEntry = {
  _id: ObjectId;
  userId: ObjectId;
  type:
    | "reservation_completed" | "review_bonus" | "birthday_bonus" | "referral_bonus"
    | "daily_bonus" | "manual_adjustment" | "expiration" | "redemption";
  direction: "credit" | "debit";
  points: number;
  balanceAfter: number;
  reservationId?: ObjectId; giftId?: ObjectId;
  walletTransactionId?: ObjectId;
  notes?: string;
  createdBy?: { kind: "system" | "staff"; id?: ObjectId };
  occurredAt: Date; createdAt: Date;
};
```

Indexes: `{userId:1, occurredAt:-1}`, `{reservationId:1}`, `{type:1, occurredAt:-1}`, `{userId:1, type:1, occurredAt:-1}`.

---

## 10) `notifications`

```ts
type Notification = {
  _id: ObjectId;
  recipientKind: "customer" | "staff";
  customerUserId?: ObjectId; staffUserId?: ObjectId; restaurantId?: ObjectId;
  type:
    | "reservation_requested" | "reservation_confirmed" | "reservation_declined" | "reservation_reminder"
    | "table_ready" | "bill_finalized" | "payment_succeeded" | "payment_failed"
    | "review_reply" | "flash_deal" | "weekly_picks" | "you_earned_points" | "tier_promoted"
    | "gift_received" | "friend_request"
    | "new_reservation" | "reservation_cancelled" | "update_reservation"
    | "subscription_renewal" | "staff_join_request" | string;
  title: string; body: string;
  iconHint: "success" | "notify" | "warning" | "error";
  deepLink: string;
  read: boolean; readAt?: Date | null;
  deletedAt?: Date | null;
  deliveredChannels: Array<"in_app" | "push">;
  pushDelivery?: {
    sentAt?: Date;
    failures?: Array<{ reason: string }>;
  };
  createdAt: Date; updatedAt: Date;
};
```

Indexes: `{customerUserId:1, deletedAt:1, createdAt:-1}`, `{staffUserId:1, deletedAt:1, createdAt:-1}`, `{customerUserId:1, read:1}`, `{staffUserId:1, read:1}`, `{restaurantId:1, type:1, createdAt:-1}`.

---

## 11) `support_conversations`

```ts
type SupportConversation = {
  _id: ObjectId;
  subjectKind: "customer" | "staff";
  customerUserId?: ObjectId; staffUserId?: ObjectId; restaurantId?: ObjectId;
  topic?: string; subject?: string;
  status: "open" | "pending_user" | "pending_agent" | "resolved" | "closed";
  priority?: "low" | "normal" | "high" | "urgent";
  channel: "in_app_chat" | "email" | "phone";
  assignedAgentId?: string;
  context?: {
    reservationId?: ObjectId; orderId?: ObjectId; paymentId?: ObjectId;
    articleSlug?: string;
  };
  messageCount: number;
  unreadByUser: number; unreadByAgent: number;
  lastMessageAt: Date; lastMessagePreview?: string;
  messages: Array<{
    _id: ObjectId;
    senderKind: "user" | "agent" | "system";
    senderId?: ObjectId;
    body: string;
    attachments?: Array<{ kind: "image" | "file"; url: string; mime?: string; size?: number; filename?: string }>;
    readByUserAt?: Date; readByAgentAt?: Date;
    sentAt: Date;
  }>;
  openedAt: Date; resolvedAt?: Date | null; closedAt?: Date | null;
  rating?: 1 | 2 | 3 | 4 | 5; ratingComment?: string;
  createdAt: Date; updatedAt: Date;
};
```

Indexes: `{customerUserId:1, status:1, lastMessageAt:-1}`, `{staffUserId:1, status:1, lastMessageAt:-1}`, `{restaurantId:1, status:1, lastMessageAt:-1}`, `{status:1, priority:1, lastMessageAt:-1}`, `{assignedAgentId:1, status:1}`, `{"context.reservationId":1}`, `{"context.orderId":1}`.

---

## 12) `metadata`

```ts
type MetadataDoc<TItem = unknown> = {
  _id: string;                      // catalog id, e.g. "reward_tiers"
  description?: string;
  version: number;
  items: TItem[];
  updatedBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
```

Documents stored in this collection (one per `_id`):

- `security_questions`     — list of selectable security questions
- `subscription_plans`     — subscription plan matrix for restaurant and customer subjects
- `reward_tiers`           — silver/gold/platinum/diamond + thresholds + benefits
- `amenities`              — amenity codes with labels and icons
- `reservation_preferences`— seating, cuisine, vibe, amenity preference codes
- `support_articles`       — help-center article corpus
- `occasions`              — anniversary/birthday/date_night/...
- `feature_flags`          — runtime toggles

Default `_id` index is sufficient.

---

## Index legend

- `u` = unique
- `s` = sparse
- `us` = unique sparse
- `mk` = multikey (array path)
- `us-mk` = unique sparse multikey

