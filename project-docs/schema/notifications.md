# Schema · Notifications

In-app notification feed (top-right bell). **One document per delivered notification** in the `notifications` collection. **Counts and read-id references** for each recipient are denormalized on `customer_users` / `staff_users` — see `[users.md](./users.md)`.

Source READMEs:

- `reservation/Discover/README.md` (Notifications page)
- `reservation/Auth/README.md` (push/realtime cross-cutting)
- `pos/Auth/README.md`, `pos/Floor Plan/README.md`, `pos/Kitchen/README.md`

## Collection

| Collection       | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `notifications`  | One row per delivered in-app notification (customer or staff).          |

## `notifications`

```ts
type Notification = {
  _id: ObjectId;

  /** Who receives this row — `recipientId` points at that user document. */
  recipientKind: "customer" | "staff";
  recipientId: ObjectId; // -> customer_users._id | staff_users._id

  /** Present for staff notifications or tenant-scoped customer notifications. */
  restaurantId?: ObjectId;

  type:
    // customer
    | "reservation_requested"
    | "reservation_confirmed"
    | "reservation_declined"
    | "reservation_reminder"
    | "table_ready"
    | "bill_finalized"
    | "payment_succeeded"
    | "payment_failed"
    | "review_reply"
    | "flash_deal"
    | "weekly_picks"
    | "you_earned_points"
    | "tier_promoted"
    | "gift_received"
    | "friend_request"
    // staff
    | "new_reservation"
    | "reservation_cancelled"
    | "update_reservation"
    | "subscription_renewal"
    | "staff_join_request"
    | string;

  /** Human-readable content shown in the feed. */
  title: string;
  body: string;
  iconHint: "success" | "notify" | "warning" | "error";

  deepLink: string;

  /** Authoritative read flag for indexed queries; kept in sync with `users.notifications.readIds`. */
  read: boolean;
  readAt?: Date | null;
  // soft delete via "Remove all" or per-row trash
  deletedAt?: Date | null;

  // Delivery
  deliveredChannels: Array<"in_app" | "push">;
  pushDelivery?: {
    sentAt?: Date;
    failures?: Array<{ reason: string }>;
  };

  createdAt: Date;
  updatedAt: Date;
};
```

### Indexes

- `{ recipientId: 1, deletedAt: 1, createdAt: -1 }`
- `{ recipientId: 1, read: 1 }` — unread lists and badge recompute
- `{ restaurantId: 1, type: 1, createdAt: -1 }`

### Behavior

- The Notifications page tabs (`All`, `Unread`, `Read`) filter on `read` and `deletedAt`.
- **Insert**: create a `notifications` row; increment `users.notifications.totalCount` for the recipient; emit realtime.
- **Mark read** (single row): set `read: true`, `readAt: now`; append `_id` to `users.notifications.readIds` (respect cap policy); increment `users.notifications.readCount`.
- **Mark all read**: bulk-update matching rows; set `users.notifications.readCount = users.notifications.totalCount`; merge ids into `readIds` or rebuild from query depending on cap strategy.
- **Remove all**: set `deletedAt: now` on rows; recompute or decrement `users.notifications.totalCount` (and adjust `readCount` / `readIds` consistently).
- Tapping a notification routes by `deepLink` and applies the single-row mark-read flow above.

### Consistency

- Per-row **`read` / `readAt`** on `notifications` is the source optimized for list queries.
- **`users.notifications.readIds`** duplicates which `_id`s are read for quick membership checks and client sync; it must stay aligned with `read: true` rows (subject to an optional max length — if capped, older read ids drop from the array but rows remain `read: true`).

---

## Cross-document rules

- **Writers**: page-readme endpoints (`POST /reservations`, `POST /payments`, etc.) emit events that a worker consumes to insert `notifications` rows, bump **`users.notifications.totalCount`**, and trigger push delivery.
- **Badge**: `unread = users.notifications.totalCount - users.notifications.readCount` (or derive from `readIds` only if you guarantee full coverage without a cap).

## Realtime channels

- `notification.created` (per recipient)
- `notification.read` / `notification.deleted`
- `user.notifications.unreadCountChanged`
