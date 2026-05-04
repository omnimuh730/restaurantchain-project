# Reservation App · Discover

Personalized home feed for restaurant discovery. It combines location context, search, promotional carousels, curated sections, saved restaurants, and notifications.

Screens used for this analysis:

- `Discover - 1.png`
- `Discover - 2.png`
- `Discover - 3.png`
- `Discover - 4.png`
- `Discover - 5.png`
- `Notification(top right button).png`
- `Saved(top right button).png`

---

## 1. Page Layout

Header:

- Current area selector, e.g. `Gangnam Station ^`
- Hero prompt: `Where shall we dine?`
- Notification bell with unread badge `5`
- Heart button for saved items

Main body:

- Search input: `Restaurant, Location or Cuisine...`
- Featured hero carousel (`Chef's Table`, page indicator `4/6`, `View All`)
- Icon quick categories:
  - `Trending Now`
  - `Catch Only`
  - `Top Ranking`
  - `Hot in New York`
  - `Best K-BBQ`
  - `Best American`
  - `Local Favorite`
  - `Nearby Me`
- Content rails and lists:
  - `Where to Eat?` city cards (`San Francisco`, `New York`, `Los Angeles`)
  - `Top Picks by Food Type`
  - `Monthly Best`
  - `Loved by Locals`
  - `Date Night Picks`
  - `Editor's Choice`
  - `Weekend Brunch Spots`
  - `New This Week`
  - `Late Night Eats`
  - `Restaurants by Price`

Bottom nav:

- `Discover`
- `Explorer`
- center QR action button
- `Dining`
- `Profile`

---

## 2. Page Mount

Discover is feed-driven. It should request a complete home payload to avoid many waterfall calls.

```json
GET /discover/home?lat=...&lng=...&area=Gangnam%20Station
```

Suggested response:

```json
{
  "area": { "id": "area_1", "name": "Gangnam Station" },
  "unreadNotificationCount": 5,
  "hero": [
    {
      "id": "hero_1",
      "title": "Chef's Table",
      "subtitle": "Exclusive Omakase",
      "tagline": "RESERVED FOR CATCHTABLE MEMBERS",
      "imageUrl": "...",
      "target": { "type": "collection", "id": "chef_table" }
    }
  ],
  "quickCategories": [
    { "key": "trending", "label": "Trending Now", "icon": "flame" }
  ],
  "sections": [
    {
      "id": "monthly_best",
      "title": "Monthly Best",
      "layout": "horizontal_cards",
      "items": [
        {
          "restaurantId": "r1",
          "name": "Ilpyeon Sirloin Hongik",
          "cuisine": "Grilled Beef",
          "rating": 4.7,
          "priceLevel": "$$",
          "distanceMiles": 0.5,
          "badges": ["new"],
          "saved": false,
          "imageUrl": "..."
        }
      ]
    }
  ]
}
```

---

## 3. Search

The search box appears at the top of Discover but routes into Explorer behavior.

### Behavior

1. User taps the input.
2. App navigates to Explorer with the query focused.
3. Recent searches and live restaurant/cuisine results appear there.

Backend:

```json
GET /search/suggestions?query=...&lat=...&lng=...
```

Response:

```json
{
  "restaurants": [{ "id": "r1", "name": "Sakura Omakase" }],
  "cuisines": ["Italian", "Seafood"],
  "locations": [{ "id": "loc_1", "name": "Gangnam Station" }]
}
```

---

## 4. Feed Sections

### Hero carousel

**Screen:** `Discover - 1.png`.

Shows a wide carousel card with title, subtitle, image, page indicator, and `View All`.

Interactions:

- Swipe -> local carousel pagination.
- Tap card -> open collection or restaurant detail depending on target.
- `View All` -> list page for that collection.

### Quick categories

Icon buttons run canned filters. Examples:

- `Trending Now` -> restaurants sorted by momentum.
- `Catch Only` -> restaurants or deals exclusive to CatchTable.
- `Top Ranking` -> best overall rating/booking volume.
- `Nearby Me` -> nearest restaurants by current GPS.

Backend pattern:

```json
GET /restaurants?collection=trending&lat=...&lng=...
GET /restaurants?collection=nearby&lat=...&lng=...
```

### Horizontal restaurant rails

**Screens:** `Discover - 2.png`, `Discover - 3.png`, `Discover - 4.png`.

Cards display:

- image
- optional ribbon: `New`, `Sale`
- heart save icon
- restaurant name
- cuisine/category copy
- rating
- optional price level badge (`$$`, `$$$$`)
- optional open timing (`Open Today`, `3 days ago`, `Open till 3 AM`)

Tapping a card opens restaurant detail or begins Explorer focused on that restaurant.

### Restaurants by Price

**Screen:** `Discover - 5.png`.

This section has price tabs:

- `$`
- `$$`
- `$$$`
- `$$$$`

Selecting a tab filters the list. It is functionally the same as Explorer's `Price` filter, but embedded in Discover.

Backend:

```json
GET /restaurants?priceLevel=1&lat=...&lng=...&limit=10
```

---

## 5. Save / Unsave

Heart icons appear in cards and top-right saved page button.

### Behavior

- Tapping a restaurant heart requires authentication.
- If anonymous, show Auth's sign-in-required modal.
- If signed in, optimistically toggle the heart.

Backend:

| Action | Method | Endpoint |
|---|---|---|
| Save restaurant | `POST` | `/users/me/saved/restaurants/{restaurantId}` |
| Unsave restaurant | `DELETE` | `/users/me/saved/restaurants/{restaurantId}` |
| Save food/menu item | `POST` | `/users/me/saved/foods/{foodId}` |
| Unsave food/menu item | `DELETE` | `/users/me/saved/foods/{foodId}` |

---

## 6. Saved Page

**Screen:** `Saved(top right button).png`.

Tabs:

- `Restaurants (0)`
- `Foods (0)`

Empty state:

- heart outline
- `No saved restaurants yet`
- `Tap the bookmark icon on any restaurant to save it`

Backend:

```json
GET /users/me/saved?type=restaurants
GET /users/me/saved?type=foods
```

Response:

```json
{
  "items": [
    {
      "type": "restaurant",
      "restaurantId": "r1",
      "name": "Sakura Omakase",
      "imageUrl": "...",
      "rating": 4.9,
      "cuisine": "Japanese"
    }
  ]
}
```

---

## 7. Notifications

**Screen:** `Notification(top right button).png`.

Tabs:

- `All`
- `Unread (5)`
- `Read`

Actions:

- `Mark all read`
- `Remove all`
- per-notification mark read check
- per-notification delete

Notification card examples:

- `Reservation Confirmed` - `Your table at Sakura Omakase is confirmed for Apr 18 at 7:30 PM.`
- `Flash Deal: 30% Off`
- `You Earned 425 pts!`
- `New Review Reply`
- `Booking Confirmed`
- `Weekend Picks`

### Backend contract

| Action | Method | Endpoint |
|---|---|---|
| List notifications | `GET` | `/users/me/notifications?status=all|unread|read&cursor=...` |
| Mark one read | `PATCH` | `/users/me/notifications/{id}` |
| Delete one | `DELETE` | `/users/me/notifications/{id}` |
| Mark all read | `POST` | `/users/me/notifications:mark-all-read` |
| Remove all | `DELETE` | `/users/me/notifications` |

Suggested notification shape:

```json
{
  "id": "n1",
  "type": "reservation_confirmed",
  "title": "Reservation Confirmed",
  "body": "Your table at Sakura Omakase is confirmed for Apr 18 at 7:30 PM.",
  "read": false,
  "createdAt": "2026-04-24T16:00:00Z",
  "target": { "type": "reservation", "id": "res_1" }
}
```

Tapping a notification routes based on `target`.

---

## 8. Location Selector

The header area text `Gangnam Station ^` implies a current location selector.

Expected behavior:

- Tap the area name -> open location picker.
- Pick location -> refresh Discover and Explorer feeds.
- If GPS permission is available, user can select "Use current location".

Backend:

```json
GET /locations/search?query=gangnam
PATCH /users/me/preferences/location { "areaId": "area_1", "lat": ..., "lng": ... }
```

Anonymous users store this locally until sign-in.

---

## 9. Data Ownership

Discover is mostly public data, but these fields are user-specific:

- saved status per restaurant/food
- unread notification count
- location preference
- personalization sections based on previous dining history
- Pro-only section ranking, if applicable
