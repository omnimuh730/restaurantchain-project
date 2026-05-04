# Schema · Metadata

A single read-mostly collection that holds **all static catalogs** referenced by the rest of the schema. One document per catalog, identified by a string `_id`.

This replaces what would otherwise be many tiny lookup collections: `security_questions`, `subscription_plans`, `reward_tiers`, `amenities`, `reservation_preferences`, `support_articles`, etc.

Source READMEs:

- `reservation/Auth/README.md` (security questions)
- `reservation/Profile/README.md` (CatchTable Pro plans, reward tiers, help center)
- `reservation/Discover/README.md`, `reservation/Explorer/README.md`, `reservation/Reservation Flow/README.md` (cuisines, amenities, preferences)
- `pos/Settings/README.md` (Upgrade Plans, security questions, amenities)

## Collection

| Collection | Purpose |
|---|---|
| `metadata` | One document per catalog. Read-heavy, write-rare. Cached aggressively at the edge. |

---

## Document shape

Every document follows the same envelope:

```ts
type MetadataDoc<TItem = unknown> = {
  _id: string;                      // catalog id, e.g. "reward_tiers"
  description?: string;             // human-readable purpose
  version: number;                  // bumped on every edit
  items: TItem[];                   // catalog rows
  updatedBy?: ObjectId;             // -> staff_users (admin tooling)
  createdAt: Date;
  updatedAt: Date;
};
```

### Indexes

- Default `_id` index is sufficient for catalog lookup.
- Optional partial multikey indexes only if a screen filters by `items[].code`:
  - `{ "items.code": 1 }` (multikey, sparse)

### Caching

Catalog reads are app-side cached for minutes. Cache key: `metadata:<id>:v<version>`. Bumping `version` invalidates clients on next refresh.

---

## Catalogs

Each subsection below documents one document. They are stored in the same collection.

### `_id: "security_questions"`

```ts
{
  _id: "security_questions",
  version: 1,
  items: [
    { code: "first_pet",       label: "What was the name of your first pet?" },
    { code: "mother_maiden",   label: "What is your mother's maiden name?" },
    { code: "first_school",    label: "What was the name of your first school?" },
    { code: "favorite_movie",  label: "What is your favorite movie?" }
  ]
}
```

Used by:

- `customer_users.securityAnswers[].questionId` and `staff_users.securityAnswers[].questionId` (TODO: add to staff_users when needed).
- `password_reset_sessions.questionId`.

### `_id: "subscription_plans"`

```ts
{
  _id: "subscription_plans",
  version: 4,
  items: [
    // restaurant subscription tiers
    { subject: "restaurant", tier: "free",  name: "Free",  price: { amount: "0",   currency: "USD" }, billingCycle: "monthly",  trialDays: 0,  features: ["...","..."], sortOrder: 1 },
    { subject: "restaurant", tier: "pro",   name: "Pro",   price: { amount: "49",  currency: "USD" }, billingCycle: "monthly",  trialDays: 7,  features: ["...","..."], sortOrder: 2 },
    { subject: "restaurant", tier: "ultra", name: "Ultra", price: { amount: "129", currency: "USD" }, billingCycle: "monthly",  trialDays: 7,  features: ["...","..."], sortOrder: 3 },
    // customer subscription (single tier, billing cycle selectable)
    { subject: "customer", tier: "pro", name: "Pro Monthly",   price: { amount: "9.99",  currency: "USD" }, billingCycle: "monthly",   trialDays: 7,  sortOrder: 1 },
    { subject: "customer", tier: "pro", name: "Pro Quarterly", price: { amount: "26.99", currency: "USD" }, billingCycle: "quarterly", trialDays: 7,  sortOrder: 2 },
    { subject: "customer", tier: "pro", name: "Pro Yearly",    price: { amount: "89.99", currency: "USD" }, billingCycle: "yearly",    trialDays: 14, sortOrder: 3, badge: "Best Value" }
  ]
}
```

Used by `customer_users.subscription.{tier,billingCycle}`, `restaurants.subscription.tier`, and the upgrade wizards.

### `_id: "reward_tiers"`

```ts
{
  _id: "reward_tiers",
  version: 1,
  items: [
    { code: "silver",   name: "Silver",   threshold: 0,    benefits: ["Standard support"], pointsPerCurrency: 1, currency: "USD" },
    { code: "gold",     name: "Gold",     threshold: 100,  benefits: ["Priority booking"],  pointsPerCurrency: 1, currency: "USD" },
    { code: "platinum", name: "Platinum", threshold: 500,  benefits: ["Free deserts"],      pointsPerCurrency: 1.5, currency: "USD" },
    { code: "diamond",  name: "Diamond",  threshold: 2000, benefits: ["Concierge"],         pointsPerCurrency: 2, currency: "USD" }
  ]
}
```

Used by the cache `customer_users.rewards.tier` and tier promotions written via `points_ledger`.

### `_id: "amenities"`

```ts
{
  _id: "amenities",
  version: 2,
  items: [
    { code: "wifi",        label: "Wi-Fi",         icon: "wifi" },
    { code: "parking",     label: "Parking",       icon: "car" },
    { code: "outdoor",     label: "Outdoor",       icon: "tree" },
    { code: "wheelchair",  label: "Wheelchair",    icon: "accessibility" },
    { code: "vegan",       label: "Vegan options", icon: "leaf" },
    { code: "private",     label: "Private room",  icon: "lock" }
  ]
}
```

Used by `restaurants.amenities[]` and the Reservation preferences picker.

### `_id: "reservation_preferences"`

```ts
{
  _id: "reservation_preferences",
  version: 1,
  items: [
    { group: "seating",  code: "indoor",      label: "Indoor" },
    { group: "seating",  code: "outdoor",     label: "Outdoor" },
    { group: "seating",  code: "bar",         label: "Bar" },
    { group: "seating",  code: "private",     label: "Private room" },

    { group: "cuisine",  code: "korean",      label: "Korean" },
    { group: "cuisine",  code: "japanese",    label: "Japanese" },
    { group: "cuisine",  code: "italian",     label: "Italian" },

    { group: "vibe",     code: "cozy",        label: "Cozy" },
    { group: "vibe",     code: "lively",      label: "Lively" },
    { group: "vibe",     code: "romantic",    label: "Romantic" }
  ]
}
```

Used by `reservations.preferences.{seating,cuisine,vibe}[]`.

### `_id: "support_articles"`

```ts
{
  _id: "support_articles",
  version: 7,
  items: [
    {
      slug: "how-to-cancel-reservation",
      title: "How to cancel a reservation",
      category: "reservations",
      tags: ["cancel","refund","grace"],
      bodyMarkdown: "...",
      relatedSlugs: ["refund-policy"],
      updatedAt: "2026-04-15T00:00:00Z"
    },
    {
      slug: "refund-policy",
      title: "Refund policy",
      category: "payments",
      tags: ["refund","wallet"],
      bodyMarkdown: "..."
    }
  ]
}
```

Used by:

- `reservation/Profile` Help Center listing/search.
- `support_conversations.context.articleSlug` when a conversation is started from an article.

> If `support_articles` ever exceeds ~5 MB total (long-form content + many entries), promote it to its own collection. Catalog access pattern stays identical because every consumer reads by `slug`.

### `_id: "occasions"` (optional)

```ts
{
  _id: "occasions",
  version: 1,
  items: [
    { code: "anniversary",  label: "Anniversary",   emoji: "💍" },
    { code: "birthday",     label: "Birthday",      emoji: "🎂" },
    { code: "date_night",   label: "Date Night",    emoji: "💕" },
    { code: "business",     label: "Business",      emoji: "💼" },
    { code: "casual",       label: "Casual",        emoji: "🍽" },
    { code: "celebration",  label: "Celebration",   emoji: "🎉" }
  ]
}
```

Used by `reservations.occasion`.

### `_id: "feature_flags"` (operational)

```ts
{
  _id: "feature_flags",
  version: 12,
  items: [
    { key: "ENABLE_WALLET_GIFTS",       enabled: true,  rolloutPercent: 100 },
    { key: "ENABLE_DAILY_BONUS",        enabled: true,  rolloutPercent: 100 },
    { key: "ENABLE_FRIEND_INVITES",     enabled: true,  rolloutPercent: 100 },
    { key: "ENABLE_KITCHEN_REALTIME",   enabled: true,  rolloutPercent: 100 }
  ]
}
```

Optional but useful — keeps runtime toggles in one place clients can poll.

---

## Cross-document rules

- Every consumer references catalogs by stable `code` / `slug` strings — never by document position.
- `version` bumps on **every** write; clients that have cached a stale version refresh on the next request.
- Admin tooling is the only writer. The application reads.
- Localized labels can be added later via `items[].i18n: { ko: "...", en: "..." }`. The `code` remains the stable key.
