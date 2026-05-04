# Schema · Notifications

In-app notification feed (top-right bell). One row per delivered notification.

Source READMEs:

- `reservation/Discover/README.md` (Notifications page)
- `reservation/Auth/README.md` (push/realtime cross-cutting)
- `pos/Auth/README.md`, `pos/Floor Plan/README.md`, `pos/Kitchen/README.md`

## Collection

| Collection | Purpose |
|---|---|
| `notifications` | One row per delivered in-app notification (customer or staff). |

## `notifications`

```ts
type Notification = {
  _id: ObjectId;

  // Recipient — exactly one of customerUserId or staffUserId is set
  recipientKind: "customer" | "staff";
  customerUserId?: ObjectId;
  staffUserId?: ObjectId;
  restaurantId?: ObjectId;          // present for staff or for tenant-scoped customer notifications

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

  title: string;                    // "Reservation Confirmed"
  body: string;                     // human readable line shown in the feed
  iconHint: "success" | "notify" | "warning" | "error";

  deepLink: string;

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

- `{ customerUserId: 1, deletedAt: 1, createdAt: -1 }`
- `{ staffUserId: 1, deletedAt: 1, createdAt: -1 }`
- `{ customerUserId: 1, read: 1 }`        // unread count badge
- `{ staffUserId: 1, read: 1 }`
- `{ restaurantId: 1, type: 1, createdAt: -1 }`

### Behavior

- The Notifications page tabs (`All`, `Unread`, `Read`) are filters on `read` and `deletedAt`.
- `Mark all read` writes `{ read: true, readAt: now }` for the current user's unread rows; `customer_users.unreadNotifications` is decremented to 0.
- `Remove all` writes `{ deletedAt: now }`; we do not hard-delete so analytics can audit delivery rate.
- Tapping a notification routes by `deepLink` and patches `read = true` (and decrements `unreadNotifications`).

---

## Cross-document rules

- **Writers**: page-readme endpoints (`POST /reservations`, `POST /payments`, etc.) emit events that a worker consumes to insert `notifications` rows and trigger push delivery.
- **Unread badge** caches:
  - `customer_users.unreadNotifications` is recomputed on insert/mark-read/delete.
  - Staff equivalent lives on `staff_users` if needed (optional; computed live from a small index lookup is also acceptable).

## Realtime channels

- `notification.created` (per recipient)
- `notification.read` / `notification.deleted`
- `user.notifications.unreadCountChanged`
