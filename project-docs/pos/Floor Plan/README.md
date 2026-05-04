# POS · Floor Plan

The operational home screen for hosts/waiters. Three mutually exclusive sub‑views switch at the top of the page:

- **Floor View** — visual canvas; tables drawn as shapes on a grid.
- **Table View** — grid/list of tables as cards.
- **Calendar View** — time × table reservation timeline.

Bottom tab badge ("Floor Plan • 12") reflects actionable items: pending reservation requests and/or occupied tables with unpaid totals.

Screens used for this analysis:

- `Floor View(Preview).png`
- `Floor View(Edit).png`
- `Floor View(Edit - floor name).png`
- `Table View.png`
- `When click table.png`
- `Calendar View - 1.png`
- `Calendar View - 2.png`
- `When click reservation slot in Calendar View(to let users scan QR to confirm arrival).png`

---

## 1. Shared state on page entry

When Floor Plan mounts the POS fetches the restaurant's floors, tables, today's orders and today's reservations in parallel. These feeds are reused by all three sub‑views.

| Fetch | Method | Endpoint | Query | Response (shape) |
|---|---|---|---|---|
| Floors | `GET` | `/restaurants/{rid}/floors` | — | `[{ id, name, order, tableCount }]` — e.g. `Hall 11`, `Lounge 8`, `3F 0` |
| Tables | `GET` | `/restaurants/{rid}/floors/{fid}/tables` | — | `[{ id, name, seats, shape: "rect"|"circle"|"oval", size: {w,h}, position: {x,y}, status }]` |
| Live table states | `GET` | `/restaurants/{rid}/tables/state?date=today` | — | `[{ tableId, status: "available"|"occupied"|"reserved", partySize, seatedAt, orderId, orderTotal: {dom, fgn}, itemCount }]` |
| Today's reservations | `GET` | `/restaurants/{rid}/reservations?date=YYYY‑MM‑DD` | — | `[{ id, guest, partySize, tableId?, startAt, endAt, status: "request"|"confirmed"|"seated"|"no_show"|"cancelled" }]` |

Live state updates arrive via websocket (`table.updated`, `reservation.updated`, `order.updated`) so the badges and overlays stay in sync without manual refresh.

---

## 2. Floor View — Preview (default)

**Screen:** `Floor View(Preview).png` — dotted grid canvas with tables rendered at their true shape/size/position. Floor tabs at the top (`Hall 11`, `Lounge 8`, `3F 0`) switch the canvas. Top‑right actions: `+ Add Floor`, `Edit Layout`.

### Visual encoding (read from images)

- **Grey** table → `available` (e.g. `Table 1`, `Table 4`).
- **Filled blue** table → `occupied` with an active order; card shows `seats occupied / seats total` and the open‑order amount (e.g. `Table 2 4/4 ₩156,500`, `Table 10 5/6 ₩17,500`).
- **Outlined blue** table → selected / has a confirmed reservation arriving soon.

### Actions

- Switch floor tab → reuses cached data if already fetched.
- Tap a table → opens the right‑side panel (see §4).
- Tap **Add Floor** → modal to create a new floor (`POST /floors { name }`).
- Tap **Edit Layout** → enters Floor View **Edit** mode (§3).

---

## 3. Floor View — Edit mode

**Screens:** `Floor View(Edit).png`, `Floor View(Edit - floor name).png`.

The whole top chrome is replaced by an editor chrome: `X` close, floor‑name text field, **Show seats** toggle, `Undo`, `Redo`, **Save**. The left rail hosts the *Tools* panel:

- `+` add‑table button.
- Selected table's properties: **Name** (e.g. `Table 2`), **Seats** (stepper − 4 +), **Shape** (square / circle), **Size** (3×3 grid of preset sizes), **Copy**, **Delete**.
- The body of the canvas remains draggable; tables snap to the dotted grid.

### Behavior

- All edits are local until **Save**. `Undo/Redo` operate on the in‑memory history stack.
- Renaming the floor edits the text in the chrome (`Floor View(Edit - floor name).png`); it's bundled with the same save call.
- `Copy` clones the currently selected table with a new id and auto‑incremented name (`Table N+1`).
- `Delete` removes the currently selected table; disabled if the table has an `occupied` state or any `confirmed` reservation within a configurable future window.

### Backend contract

| Action | Method | Endpoint | Request | Notes |
|---|---|---|---|---|
| Save layout | `PUT` | `/restaurants/{rid}/floors/{fid}` | `{ name, tables: [{ id?, name, seats, shape, size, position, z }] }` | Upsert: items without `id` are created, missing items are deleted |
| Add floor | `POST` | `/restaurants/{rid}/floors` | `{ name }` | Returns new floor |
| Delete floor | `DELETE` | `/restaurants/{rid}/floors/{fid}` | — | Blocked if any table is occupied or has reservations |

---

## 4. Table detail panel (right drawer)

**Screen:** `When click table.png` — opens when a table is tapped in either Floor View or Table View.

Header shows `Table 10`, `6 seats | 26 min | Occupied`. Body is a mini receipt:

```
Name       Qty   Each      Total
Vanil...    2    ₩6,500    ₩13,000
Espr...     1    ₩4,500    ₩4,500
```

Footer: `Order total (3 items) ₩17,500`, `Payment total ₩17,500`, primary button **Payment**.

### Behavior

- Opening the panel fetches the currently open order snapshot: `GET /tables/{tid}/current-order` → `{ orderId, tableId, openedAt, items: [...], totals: { domestic, foreign } }`.
- `26 min` is the *occupancy duration* (now − `openedAt`).
- **Payment** navigates to the Orders Payment screen pre‑filled with `orderId` (see *Orders* module §5).
- There is also an overflow menu (`⋯` in the screenshot) for: "Transfer table", "Merge tables", "Split check", "Cancel order" (intended but not all visible in one screen — infer from typical POS semantics).

---

## 5. Table View

**Screen:** `Table View.png` — same floor tabs, but tables render as uniform cards in a grid. Each card shows `name`, `seats` (e.g. `4/4 seats` when occupied, `4 seats` when available) and the order total for occupied tables.

- Purely a different render of the same data as Floor View. No extra fetches.
- Tap a table card → same right drawer as §4.

---

## 6. Calendar View

**Screens:** `Calendar View - 1.png`, `Calendar View - 2.png`, `When click reservation slot ... .png`.

Layout:

- Left: vertical table list (every table across *every* floor, 20+ rows visible), acting as rows.
- Top: hourly header `16:00 · 18:00 · 20:00 · 22:00 · 00:h` with a date picker (`Fri, Apr 24, 2026 Today 12`) and `‹ › Now 1h` zoom.
- Body: reservations as horizontal pills positioned by (table, startAt, duration). Two visual states:
  - **Confirmed** — solid blue pill.
  - **Request** — dashed/orange pill (not yet assigned to a specific slot).
- Right rail: `Requests 11` list with `Approve` per item. Each request shows the guest initials, relative date (`Today`, `Apr 24`…), requested time, party size, duration, and — if already slotted — the candidate `Table N` chip.

### Fetches

| Fetch | Method | Endpoint | Query |
|---|---|---|---|
| Reservations for date | `GET` | `/restaurants/{rid}/reservations` | `?date=YYYY-MM-DD` |
| Pending requests | `GET` | `/restaurants/{rid}/reservations` | `?status=request` |
| Search guest | `GET` | `/restaurants/{rid}/reservations` | `?query=...&date=...` (debounced from the search box) |

### Actions

- **Drag a request pill onto a row** (see `Calendar View - 2.png` where a "Confirm Yoo N. → Table 5" inline confirmation bar appears) → the UI is proposing to place a pending request into a concrete slot. Confirming it sends `PATCH /reservations/{id} { tableId, startAt, endAt, status: "confirmed" }`.
- **Approve** in the rail → shorter path: system picks the suggested table/time already encoded in the request → `POST /reservations/{id}:approve { tableId?, startAt?, endAt? }`.
- **Reject / hide** (`×` in `Calendar View - 2.png`) → `POST /reservations/{id}:reject`.
- **Tap a confirmed pill** → QR side panel (§7).

---

## 7. Reservation QR side panel

**Screen:** `When click reservation slot in Calendar View(...).png` — sheet shows:

- Header `RESERVATION QR`, guest `Kim M.`, `4P`, `18:00–20:00`, status pill `Confirmed`.
- Big QR image, helper text "Scan to view reservation, check in, or pay.", button **Copy link payload**.
- Details grid: `Reservation ID r1`, `Guest`, `Party size`, `Date`, `Time`, `Estimated duration`, `Table`.

### Purpose

- The QR encodes a short‑lived signed URL that the guest scans on arrival. Scanning it (from the guest's phone, or from a staff device) triggers **check‑in**:
  - `POST /reservations/{id}:check-in` → transitions the reservation to `seated`, marks the table `occupied`, and auto‑opens an order so the POS flips into the order flow.
- The *Copy link payload* button copies the same URL (useful when the QR cannot be scanned, e.g. share via SMS).

### Backend contract (summary)

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Fetch QR payload | `GET` | `/reservations/{id}/qr` | — | `{ url, expiresAt }` |
| Check‑in | `POST` | `/reservations/{id}:check-in` | `{}` | `{ reservationId, status: "seated", tableId, orderId }` |
| No‑show after grace | (server cron) | — | — | Status flips to `no_show` after `graceMinutes` (see Settings · General) |

---

## 8. Notifications that target Floor Plan

- `reservation.created` → increments `Requests N` counter and appears in the rail.
- `reservation.updated` (status change) → updates pill colour/position.
- `table.updated` (e.g. occupied/available) → recolours tile in Floor & Table views.
- `order.updated` (totals change) → updates the per‑table amount label on Floor & Table cards.

A realtime toast also fires from elsewhere (e.g. Kitchen screenshot shows a "FLOOR PLAN · 10:53 AM — New reservation request — D. Kim · 4 guests" toast) so the user does not need to be on the page to see incoming requests.

---

## 9. State diagrams

### Table

```
available ──seat guest──▶ occupied ──pay──▶ available
available ──reserve (near)──▶ reserved ──check‑in──▶ occupied
reserved ──grace elapsed──▶ available (reservation marked no_show)
```

### Reservation

```
request ─approve─▶ confirmed ─check‑in─▶ seated ─close order─▶ completed
request ─reject─▶ rejected
confirmed ─no‑show grace─▶ no_show
confirmed ─cancel─▶ cancelled
```
