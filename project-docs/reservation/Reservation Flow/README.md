# Reservation App · Reservation Flow

Four-step customer booking wizard for reserving a table and paying the upfront deposit/service fee.

Entry points:

- Explorer restaurant card -> `Reserve`
- Discover restaurant/collection card -> restaurant detail -> reserve
- Dining -> `Book Again`

Screens used for this analysis:

- `Step 1 - setting time, number of seats.png`
- `Step 2.png`
- `Step 3.png`
- `Step 4(upfront pay for reservation).png`

---

## 1. Flow Overview

Stepper:

1. guests, date, and time
2. contact, occasion, and special requests
3. preferences
4. review and upfront payment

The top header always includes:

- back arrow
- page title (`Book a Table`, `Preferences`, `Review & Pay`)
- restaurant name (`Steakhouse Prime`, `Gangnam BBQ`)
- progress dots and/or progress bars

Draft state should be kept locally until the final payment succeeds.

---

## 2. Step 1 - Guests, Date, Time

**Screen:** `Step 1 - setting time, number of seats.png`.

Controls:

- `Number of Guests` stepper with `-`, count, `+`
- date cards:
  - `Today 25 Apr`
  - `Tomorrow 26 Apr`
  - `Mon 27 Apr`
  - `Tue 28 Apr`
  - partially visible next date
  - `Custom Pick`
- time chips:
  - `17:00`
  - `17:30`
  - `18:00`
  - `18:30`
  - `19:00`
  - `19:30`
  - `20:00`
  - `20:30`
  - `21:00`
  - `21:30`
- CTA `Continue`

### Behavior

1. Load reservation config and available slots for the selected restaurant.
2. Default guest count is `2`.
3. Changing guest count or date refetches availability.
4. Time must be selected before Continue becomes active.
5. `Custom Pick` opens a calendar picker and then fetches slots for that date.

### Backend contract

```json
GET /restaurants/{restaurantId}/reservation-config
→ {
  "minPartySize": 1,
  "maxPartySize": 12,
  "slotMinutes": 30,
  "depositPerGuest": 10,
  "serviceFee": 2.99,
  "currency": "USD",
  "openingHours": [...]
}
```

```json
GET /restaurants/{restaurantId}/availability?date=2026-04-25&partySize=2
→ {
  "date": "2026-04-25",
  "slots": [
    { "time": "17:00", "available": true },
    { "time": "17:30", "available": true },
    { "time": "18:00", "available": true }
  ]
}
```

### Edge cases

- If restaurant is closed on selected date, show no slots and disable Continue.
- If selected slot becomes unavailable before payment, final reservation creation returns `409 slot_unavailable` and Step 1 refetches.

---

## 3. Step 2 - Contact and Occasion

**Screen:** `Step 2.png`.

Sections:

- `Contact Information` with `From your profile`
  - `Full Name` -> `Alex Chen`
  - `Phone Number` -> `+1 (415) 555-0142`
  - helper: `To change these, edit your profile.`
- `Occasion *`
  - `Anniversary`
  - `Birthday`
  - `Date Night`
  - `Business`
  - `Casual`
  - `Celebration`
- `Special Requests`
  - multiline text area: `Allergies, dietary restrictions, celebrations...`
- CTA `Set Preferences`

### Behavior

- Contact fields are read-only snapshots from profile.
- Occasion is required.
- Special requests are optional.
- If user is anonymous, show Auth sign-in-required modal before Step 2 because profile fields and payment are required.

### Backend contract

Profile fetch:

```json
GET /users/me/profile
→ {
  "fullName": "Alex Chen",
  "phone": "+1 (415) 555-0142"
}
```

Draft update can remain client-side, but for abandoned reservation recovery:

```json
PATCH /reservation-drafts/{draftId}
{
  "contact": { "fullName": "Alex Chen", "phone": "+1 (415) 555-0142" },
  "occasion": "celebration",
  "specialRequests": "Allergy notes..."
}
```

---

## 4. Step 3 - Preferences

**Screen:** `Step 3.png`.

This step collects optional tags that help the restaurant prepare. Header message:

`Customize your dining experience. These help the restaurant prepare for your visit.`

Sections:

### Seating Preference

Options:

- `Dining Hall`
- `Private Room`
- `Terrace`
- `Window Seat`
- `Bar`
- `Booth`
- `Rooftop`
- `Counter`

### Cuisine Preferences

Options:

- `Grilled Beef`
- `Seafood`
- `Italian`
- `Japanese`
- `French`
- `Korean`
- `Chinese`
- `Thai`
- `Wine Pairing`
- `Brunch`
- `Steakhouse`
- `Healthy`

### Vibe & Atmosphere

Options:

- `Date Night`
- `Business Dinner`
- `Celebration`
- `Casual Dining`
- `Romantic`
- `Family-friendly`
- `Late Night`
- `Quiet / Intimate`

### Amenities

Options:

- `Parking`
- `Valet`
- `Corkage-free`
- `Lettering`
- `Kids Welcome`
- `Kids-free Zone`
- `Sommelier`
- `Accessible`
- `Pet-friendly`
- `High Chair`
- `Waiting Space`
- `Wi-Fi`
- `Live Music`
- `Projector/AV`
- `Birthday Setup`
- `Flower Deco`

Footer:

- `Skip`
- `Continue`

### Behavior

- All chips are multi-select.
- `Skip` advances with an empty preferences object.
- Some options may map to restaurant amenities; unavailable preferences should either be hidden or accepted as requests.

Backend:

```json
GET /reservation-preferences
→ {
  "seating": [...],
  "cuisine": [...],
  "vibe": [...],
  "amenities": [...]
}
```

The final reservation submit sends selected keys:

```json
{
  "preferences": {
    "seating": ["private_room", "window_seat"],
    "cuisine": ["japanese", "wine_pairing"],
    "vibe": ["celebration"],
    "amenities": ["parking", "birthday_setup"]
  }
}
```

---

## 5. Step 4 - Review & Pay

**Screen:** `Step 4(upfront pay for reservation).png`.

Sections:

- Restaurant summary:
  - image
  - `Gangnam BBQ`
  - `Korean · 0.8 mi`
  - rating `4.6`
- `Booking Details`
  - Date `Sat, Apr 25`
  - Time `19:00`
  - Guests `2 people`
  - Occasion `Celebration`
- `Contact`
  - Name `Alex Chen`
  - Phone `+1 (415) 555-0142`
- `Payment Summary`
  - `Reservation Deposit (2 x $10)` -> `$20.00`
  - `Service Fee` -> `$2.99`
  - `Total` -> `$22.99`
- Refund Policy:
  - if restaurant declines, `100% full refund instantly`
  - once approved, deposit is non-refundable
- CTA `Confirm & Pay $22.99`

### Backend contract

Create a payment intent first:

```json
POST /reservations/payment-intents
{
  "restaurantId": "r3",
  "date": "2026-04-25",
  "time": "19:00",
  "partySize": 2,
  "depositAmount": 20,
  "serviceFee": 2.99,
  "currency": "USD"
}
```

Response:

```json
{
  "paymentIntentId": "pi_123",
  "clientSecret": "...",
  "amount": 22.99,
  "currency": "USD"
}
```

After payment succeeds:

```json
POST /reservations
{
  "restaurantId": "r3",
  "date": "2026-04-25",
  "time": "19:00",
  "partySize": 2,
  "contact": {
    "fullName": "Alex Chen",
    "phone": "+1 (415) 555-0142"
  },
  "occasion": "celebration",
  "specialRequests": "...",
  "preferences": { "...": "..." },
  "paymentIntentId": "pi_123"
}
```

Response:

```json
{
  "reservationId": "res_1",
  "confirmationCode": "CT-2026-0418A",
  "status": "requested",
  "payment": {
    "status": "authorized",
    "amount": 22.99
  }
}
```

### Status semantics

- Initial state after payment is `requested`, not necessarily confirmed.
- Restaurant admin approves/declines from POS Calendar View.
- If approved -> status `confirmed`, notification is sent to user.
- If declined -> status `declined`, full refund is triggered.

---

## 6. Reservation State Machine

```text
draft
  └─ confirm & pay ─▶ requested

requested
  ├─ restaurant approves ─▶ confirmed
  ├─ restaurant declines ─▶ declined + refund
  └─ user cancels ────────▶ cancelled

confirmed
  ├─ user checks in / QR scan ─▶ arrived
  ├─ grace elapsed ───────────▶ no_show
  └─ user cancels ────────────▶ cancelled

arrived
  └─ POS opens order ─────────▶ dining

dining
  └─ bill paid ───────────────▶ visited
```

---

## 7. Cross-Module Events

Successful booking should trigger:

- Dining Scheduled list refresh
- notification `Booking Confirmed` or `Reservation Requested`
- POS Floor Plan `reservation.created` event
- restaurant-side approval workflow

If payment succeeds but reservation creation fails, server should either auto-refund or keep the payment intent uncaptured.
