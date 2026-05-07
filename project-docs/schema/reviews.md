# Schema · Reviews

Public restaurant reviews written by customers. **Canonical store** for post-visit feedback: optional per-dimension star ratings, optional free-text comment, and linkage to a reservation when the review follows a completed visit.

This collection is separate from `reservations` so discovery, moderation, and aggregates stay queryable without scanning reservation rows. `restaurants.reviewCount` and `restaurants.averageRating` are **denormalized** and updated whenever a review is created or edited.

Source READMEs:

- `reservation/Discover/README.md`, `reservation/Explorer/README.md` (restaurant detail, review list)
- `reservation/Dining/README.md` (post-visit flow)

## Collection

| Collection | Purpose |
| ---------- | ------- |
| `reviews`  | One row per customer review of a restaurant; optional tie to `reservations._id`. |

---

## `reviews`

```ts
/** 1–5 star slice; omit a key entirely if the user did not rate that dimension. */
type ReviewRating = {
  overall?: number;       // 1..5
  ambience?: number;      // 1..5
  taste?: number;         // 1..5
  service?: number;       // 1..5
  valueOfPrice?: number;  // 1..5 ("value for price")
};

type Review = {
  _id: ObjectId;
  userId: ObjectId;       // -> customer_users
  restaurantId: ObjectId; // -> restaurants

  /** Present when the review is tied to a visit; enables idempotent upsert per visit. */
  reservationId?: ObjectId | null; // -> reservations

  /**
   * Optional structured stars. Every field inside `rating` is optional.
   * A review may omit `rating` entirely (comment-only) or include only some dimensions.
   */
  rating?: ReviewRating | null;

  /** Optional text; omit or null if the user left no comment. */
  comment?: string | null;

  createdAt: Date;
  updatedAt: Date;
};
```

### Validation (product rules)

- A write must carry **at least one** of: a non-empty `comment` (after trim), or a `rating` object with **at least one** numeric field set. Pure empty reviews are rejected (the user simply skips the flow).
- Star values, when present, are integers **1–5** (or half-star if the product allows; default docs assume integer stars).
- When `reservationId` is set, the server checks: reservation `userId` matches author, reservation `restaurantId` matches, and status is appropriate for review (e.g. `visited`). **At most one** review per `(userId, reservationId)` — upsert on repeat submit.

### Indexes

- `{ restaurantId: 1, createdAt: -1 }` — public review feed for a restaurant.
- `{ userId: 1, createdAt: -1 }` — "my reviews".
- `{ userId: 1, reservationId: 1 }` **unique sparse** — one review per reservation when `reservationId` is present.
- `{ restaurantId: 1, userId: 1 }` — optional guard if the product allows only one review per user per restaurant **lifetime** (policy choice; if not required, skip this index).

### Restaurant aggregates

On every insert/update/delete of a review affecting a restaurant, recompute on `restaurants`:

- `reviewCount` — number of `reviews` documents for that `restaurantId` (includes comment-only rows).
- `averageRating` — object of **Decimal128** means, one field per dimension that has at least one submitted score in the corpus; dimensions with no data are omitted or `null`. `overall` mean uses only reviews where `rating.overall` was provided.

See `[restaurants.md](./restaurants.md)` for the exact field names on the tenant document.

### Relationship to `reservations`

`reservations` may still expose optional `rating` / `ratingComment` for backward compatibility or fast read on the Dining "past" tab; if both exist, the **source of truth** for discovery and analytics is `reviews`. Preferred linkage: `reservations.reviewId?: ObjectId` → `reviews._id` (optional migration).

---

## Realtime channels

- `restaurant.reviews.updated` — optional; payload includes `restaurantId` and new `reviewCount` / `averageRating` snapshot for clients listing the venue.
