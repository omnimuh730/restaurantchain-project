# Reservation App · Explorer

Map-first restaurant search. Explorer turns location, keyword, category, and dynamic filters into a list/map result set. It also provides the main entry point into directions, restaurant details, menu preview, and the reservation flow.

Screens used for this analysis:

- `Map View.png`
- `Show Recent results, only show search keyword containing restaurants.png`
- `Filtering is available(you can use dynamic object data in request for filtering).png`
- `When click restaurant.png`
- `When click Direction.png`
- `When click reservation.png`

---

## 1. Page Layout

Header:

- Current area: `Gangnam Station ^`
- Prompt: `Where shall we dine?`
- Notification and saved buttons (shared with Discover)

Map body:

- Search input: `Search restaurants, cuisines...`
- Cuisine chips: `All`, `Sushi`, `Italian`, `Thai`, `Korean`, `French`
- Map markers with restaurant thumbnails and short labels
- User location blue dot
- Zoom controls `+` / `-`
- Locate-me button
- Result count pill, e.g. `100 restaurants`

Bottom sheet:

- drag handle
- filter buttons:
  - advanced filter icon
  - `Sort`
  - `Open Now`
  - `Price`
  - `Cuisine`
  - `Ame...` (Amenities)
- can expand into list mode

---

## 2. Page Mount

Explorer requires location permission or a saved location. If neither exists, it falls back to the currently selected area from Discover.

Initial fetch:

```json
GET /restaurants/search
  ?lat=37.78
  &lng=-122.41
  &radiusKm=5
  &sort=relevance
  &openNow=false
  &limit=100
```

Suggested response:

```json
{
  "bounds": { "north": 37.8, "south": 37.7, "east": -122.3, "west": -122.5 },
  "total": 100,
  "restaurants": [
    {
      "id": "r1",
      "name": "Sakura Omakase",
      "cuisine": "Japanese",
      "priceLevel": 3,
      "rating": 4.9,
      "reviewCount": 2341,
      "distanceMiles": 0.3,
      "openStatus": "open",
      "lat": 37.78,
      "lng": -122.41,
      "thumbnailUrl": "...",
      "saved": false,
      "amenities": ["parking", "wifi"]
    }
  ]
}
```

Map markers and bottom list are rendered from the same result set.

---

## 3. Search Input and Recent Searches

**Screen:** `Show Recent results, only show search keyword containing restaurants.png`.

When the user focuses the search box, a panel opens with:

- `Recent Searches`
- `Clear All`
- rows such as `Sakura Omakase`, `Italian`, `Seafood`, `Brunch`, `Korean BBQ`
- delete `x` per row

### Behavior

- Typing filters suggestions by keyword and only shows matching restaurants/cuisines.
- Selecting a recent search reruns map search with that query.
- Clearing all deletes the user's recent search history.

Backend:

| Action | Method | Endpoint |
|---|---|---|
| Suggestions | `GET` | `/search/suggestions?query=...&lat=...&lng=...` |
| Recent searches | `GET` | `/users/me/searches/recent` |
| Save search | `POST` | `/users/me/searches/recent` |
| Delete search | `DELETE` | `/users/me/searches/recent/{id}` |
| Clear all | `DELETE` | `/users/me/searches/recent` |

For anonymous users, recent searches are stored locally until sign-in.

---

## 4. Filters and List Mode

**Screen:** `Filtering is available(you can use dynamic object data in request for filtering).png`.

The bottom sheet can expand into a list:

- `100 restaurants found`
- `Close list`
- rows with thumbnail, restaurant name, open status dot, cuisine, price, distance, rating, review count, and chevron

Example rows:

- `Sakura Omakase` - Japanese - `$$$` - `0.3 mi` - `4.9 (2,341)` - green dot
- `Trattoria Moderna` - Italian - `$$` - `0.5 mi`
- `Gangnam BBQ` - Korean - `$$$` - `0.8 mi` - grey dot

### Dynamic filter object

The screenshot file name explicitly notes that filtering can use a dynamic object data request. Prefer a single JSON filter object over many one-off query params.

```json
POST /restaurants/search
{
  "viewport": {
    "north": 37.80,
    "south": 37.70,
    "east": -122.35,
    "west": -122.50
  },
  "query": "bbq",
  "filters": {
    "sort": "rating",
    "openNow": true,
    "priceLevels": [2, 3],
    "cuisines": ["korean", "japanese"],
    "amenities": ["parking", "reservations"],
    "partySize": 2,
    "date": "2026-04-25",
    "time": "19:00"
  },
  "limit": 100
}
```

Response is the same restaurant list shape as page mount.

### Filter behavior

- `Sort` opens sort options: relevance, distance, rating, popular, price low/high.
- `Open Now` toggles a boolean and refetches immediately.
- `Price` allows multi-select `$` to `$$$$`.
- `Cuisine` allows multi-select cuisines.
- `Amenities` allows multi-select service tags.
- Category chips above the map are quick cuisine filters.

---

## 5. Selecting a Restaurant Marker

**Screen:** `When click restaurant.png`.

Tap a map marker -> marker gets pink outline and a bottom card appears:

- thumbnail
- name: `Gangnam BBQ`
- metadata: `4.6 · Korean · $$$ · Closed`
- close `x`
- actions:
  - `Directions`
  - `Reserve`
  - `Menu`

### Backend behavior

Marker selection can use data already in the search response. If the bottom card needs richer detail:

```json
GET /restaurants/{restaurantId}/summary
```

Response:

```json
{
  "id": "r3",
  "name": "Gangnam BBQ",
  "rating": 4.6,
  "cuisine": "Korean",
  "priceLevel": 3,
  "openStatus": "closed",
  "thumbnailUrl": "...",
  "address": "243 S San Pedro St, Los Angeles, CA 90012",
  "lat": 37.78,
  "lng": -122.41,
  "reservable": true,
  "menuUrl": "...",
  "websiteUrl": "..."
}
```

---

## 6. Directions

**Screen:** `When click Direction.png`.

After tapping `Directions`, a route polyline appears from the user's blue location dot to the selected restaurant marker. The selected marker label becomes highlighted.

Backend / provider:

```json
GET /directions?fromLat=...&fromLng=...&toLat=...&toLng=...&mode=walking
```

Response:

```json
{
  "distanceMeters": 1300,
  "durationSeconds": 900,
  "polyline": "encoded_polyline",
  "steps": [
    { "instruction": "Head northeast...", "distanceMeters": 120 }
  ]
}
```

Map state:

- draw route polyline
- keep restaurant card open
- preserve the `Reserve` and `Menu` actions

If device maps integration is available, tapping route details can open Apple Maps / Google Maps via deep link.

---

## 7. Reserve

**Screen:** `When click reservation.png`.

Tap `Reserve` on the restaurant card -> navigate into `Reservation Flow` Step 1:

- title `Book a Table`
- subtitle with restaurant name, e.g. `Gangnam BBQ`
- guest count, date, and time selector

Navigation params:

```json
{
  "restaurantId": "r3",
  "restaurantName": "Gangnam BBQ",
  "source": "explorer_map"
}
```

Before navigation, the app can optionally fetch slot metadata:

```json
GET /restaurants/{restaurantId}/reservation-config
→ {
  "minPartySize": 1,
  "maxPartySize": 12,
  "depositPerGuest": 10,
  "serviceFee": 2.99,
  "availableDays": [...]
}
```

The full booking process is documented in `Reservation Flow/README.md`.

---

## 8. Menu

Tap `Menu` from the restaurant card.

Expected behavior:

- If the restaurant has an in-app menu, open a menu preview.
- If not, open the restaurant's website or web menu.

Backend:

```json
GET /restaurants/{restaurantId}/menu/public
```

Response:

```json
{
  "sections": [
    {
      "name": "Popular",
      "items": [
        { "id": "m1", "name": "A5 Wagyu Steak", "price": 120, "currency": "USD", "imageUrl": "..." }
      ]
    }
  ],
  "externalUrl": null
}
```

---

## 9. Realtime / Map Refresh

Explorer does not require websocket updates. It should refetch when:

- map viewport changes significantly
- current location changes
- filters change
- search query changes
- the user taps locate-me

For performance, debounce viewport searches and cluster markers server-side or client-side when zoomed out.
