# Schema · Restaurants

The tenant-root document for the POS, with **embedded** settings, floors, simplified menu items, deposit cards, and the pending-staff inbox.

Source READMEs:

- `pos/Floor Plan/README.md`
- `pos/Settings/README.md`
- `pos/Auth/README.md` (restaurant sign-up)
- `pos/Orders/README.md` (menu browsing)
- `reservation/Discover/README.md`, `reservation/Explorer/README.md` (public discovery fields)

## Collection


| Collection    | Purpose                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `restaurants` | Tenant root + public profile + settings + layout (floors) + menu + payment cards + pending staff inbox. |


`tables` lives in its own collection because it carries operational state changed concurrently during service. See `[tables.md](./tables.md)`.

`amenities` (catalog of available codes) lives in `[metadata](./metadata.md)`.

---

## `restaurants`

```ts
type Restaurant = {
  _id: ObjectId;
  name: string;
  cuisine: string[];                // ["korean", "bbq"]
  priceLevel: 1 | 2 | 3 | 4;
  description?: string;

  status: "pending_approval" | "active" | "suspended";

  thumbnailUrl?: string;
  imageUrls: string[];

  address: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    country: string;
    postalCode?: string;
  };
  location: {                       // GeoJSON
    type: "Point";
    coordinates: [number, number];  // [lng, lat]
  };

  primaryPhone?: string;
  secondaryPhone?: string;

  /**
   * Denormalized from the `reviews` collection. Recomputed on review write.
   * `reviewCount` includes comment-only reviews (no stars).
   * `averageRating` fields are means over reviews that submitted that dimension; omit or null when no data.
   */
  reviewCount: number;
  averageRating: {
    overall?: Decimal128 | null;
    taste?: Decimal128 | null;
    ambience?: Decimal128 | null;
    service?: Decimal128 | null;
    valueOfPrice?: Decimal128 | null;
  };

  amenities: string[];              // amenity codes (catalog: metadata.amenities)
  flags: {
    isNew?: boolean;
  };

  // Subscription state (restaurant tiers). Mandatory for active restaurants.
  subscription: {
    tier: "free" | "pro" | "ultra";
    issueDate: Date;
    expireDate: Date;
    status: "active" | "expired" | "cancelled" | "past_due" | "trialing";
  };

  // ---- Embedded: Settings ----
  settings: {
    general: {
      deposit: {
        moneyType: "domestic" | "foreign";
        amount: Decimal128;
      };
      gracePeriodMinutes: number;
      operatingHours: Array<{
        day: 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = Sun
        open: string;                  // "10:00"
        close: string;                 // "22:00"
        closed?: boolean;
      }>;
      /**
       * Calendar dates (YYYY-MM-DD in restaurant local tz) when the venue is **fully closed**
       * regardless of weekly `operatingHours` (holidays, private buyouts, maintenance days).
       */
      nonOperatingDates: string[];
    };
  };

  // ---- Embedded: Floors ----
  floors: Array<{
    _id: ObjectId;
    name: string;                   // "Main", "Patio"
    sortOrder: number;
    isPublished: boolean;
    /** Soft delete — never hard-remove floor rows referenced by layout/history. */
    deletedAt?: Date | null;
    deletedBy?: ObjectId | null;   // staff who removed from published layout
  }>;

  // ---- Embedded: Menu ----
  menu: {
    categories: Array<{
      _id: ObjectId;
      name: string;                 // "Appetizers"
      iconUrl?: string;
      sortOrder: number;
      isActive: boolean;
      deletedAt?: Date | null;
      deletedBy?: ObjectId | null;
      subcategories: Array<{
        _id: ObjectId;
        name: string;               // "Cold Appetizers"
        sortOrder: number;
        isActive: boolean;
        deletedAt?: Date | null;
        deletedBy?: ObjectId | null;
      }>;
    }>;
    items: Array<{
      _id: ObjectId;                // referenced by order_items as menuItemId
      categoryId: ObjectId;
      subcategoryId?: ObjectId | null;
      name: string;
      shortName?: string;
      description?: string;
      imageUrl?: string;
      tags?: string[];

      price: { amount: Decimal128; currency: string };

      isActive: boolean;
      deletedAt?: Date | null;
      deletedBy?: ObjectId | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };

  // ---- Embedded: Deposit cards (cards the restaurant uses to RECEIVE money) ----
  depositCards: Array<{
    _id: ObjectId;
    pspProvider: "stripe" | "toss" | "adyen" | string;
    pspExternalId: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
    registrationMode: "scan" | "type";
    createdBy: ObjectId;            // staff user
    addedAt: Date;
    deletedAt?: Date | null;
    deletedBy?: ObjectId | null;
  }>;

  // ---- Embedded: Pending staff sign-ups inbox ----
  // On approval, a fresh staff_users row is inserted and the entry removed.
  pendingStaff: Array<{
    _id: ObjectId;
    fullName: string;
    username: string;
    passwordHash: string;
    requestedRole: "waiter" | "chef" | "cashier";
    requestedAt: Date;
  }>;

  createdBy: ObjectId;              // -> staff_users (registering manager)
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
};
```

### Indexes

- `{ status: 1, "subscription.tier": 1 }`
- `{ "averageRating.overall": -1 }` (sparse, for sort-by-rating in discovery)
- `{ reviewCount: -1 }` — optional for popularity sorts
- `{ cuisine: 1 }`
- `{ amenities: 1 }`
- `{ location: "2dsphere" }` for Explorer map queries
- text index on `name`, `description` for search suggestions
- `{ "menu.items._id": 1 }` (multikey, lookup by item id from order snapshots)
- `{ "menu.items.categoryId": 1 }` (multikey, POS Orders catalog browsing)
- `{ "menu.items.name": 1 }` (multikey, Menu Analysis cross-restaurant when scoped)
- `{ "settings.general.nonOperatingDates": 1 }` (multikey, optional — block-out date queries)

### State machine

```text
pending_approval ─approve─▶ active ─suspend─▶ suspended ─reactivate─▶ active
```

### Soft delete (menu, floors, deposit cards, tenant)

**Do not hard-delete** rows that can be referenced historically (orders, analytics, payouts). Use:

- `deletedAt: Date` and optionally **`deletedBy: ObjectId`** (staff) when a manager “removes” a category, subcategory, menu item, floor, or deposit card.
- POS and discovery UIs filter to `deletedAt == null` (and `isActive` / `isPublished` as applicable). Order snapshots continue to reference `menu.items[]._id` even after soft delete.

### Why menu is embedded

A restaurant typically has 50–500 menu items × ~500 B = 25–250 KB. Edits are infrequent and usually performed by 1–2 managers, so concurrent-edit conflicts are rare. The trade-off:

- **Snapshot stability**: each `menu.items[]._id` is a real `ObjectId` so `order_items` can stably reference (`menuItemId`) and snapshot (`name`, `price`, `pool`) at order time. Live menu mutations never break old order receipts.
- **Cross-restaurant analytics** (e.g. "top items chain-wide") will need `$unwind` over restaurants. Acceptable for MVP; revisit when the chain feature ships.

### Why tables are NOT embedded

Tables carry runtime status (`available | reserved | occupied | needs_cleaning | out_of_service`) updated concurrently by waiters and the QR check-in flow. Embedding would cause write contention on the restaurant document and pollute realtime change-stream consumers. See `[tables.md](./tables.md)`.

---

## Cross-document rules

- `reviewCount` / `averageRating` are maintained from `[reviews.md](./reviews.md)`; do not treat them as user-editable.
- `restaurants.amenities[]` contains amenity codes from the `metadata` catalog.
- The default `depositCards[i].isDefault === true` is the card customer payments settle into.
- Floor edits replace the floor's contents transactionally; tables not in the request are soft-deleted in the `tables` collection.
- Staff sign-up appends a row into `pendingStaff[]`; approval atomically inserts a `staff_users` row and removes the pending entry.
- Menu soft-delete (`deletedAt` / `deletedBy` on categories, subcategories, items) keeps rows for historical order rendering; listings exclude deleted rows.
- `settings.general.nonOperatingDates` blocks reservations for those calendar dates in addition to weekly hours.
- Restaurant subscription is persisted directly in this document (`subscription.`*) and validated against `metadata.subscription_plans`.

## Realtime channels

- `restaurant.profile.updated`
- `restaurant.reviews.updated`
- `restaurant.menu.updated`
- `restaurant.settings.updated`
- `restaurant.staff.pending` (when a new sign-up appears)

