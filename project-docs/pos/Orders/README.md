# POS · Orders

The waiter's workbench: pick a table, add menu items, push those items to the kitchen, then collect payment. The screen splits into two panes:

- **Left — Ticket pane:** floor/table selectors at the top, items list, running totals.
- **Right — Catalog pane:** menu search, Main Categories row, Sub Categories row, items grid.

Bottom nav tabs: `Analytics · Floor Plan · Orders · Kitchen · Settings`.

Screens used for this analysis:

- `Orders.png`
- `Orders(load floors of restaurant).png`
- `Orders(load tables of selected floor).png`
- `Orders(load menu, main category, sub category).png`
- `Orders(Draft new items that is not stilll orderd to kitchen).png`
- `Payment/Payment(cash).png`
- `Payment/Payment(credit).png`
- `Payment/Payment(mix).png`

---

## 1. Page mount

On mount the app resolves two things in parallel:

1. The restaurant's **floors + tables** (reused from Floor Plan).
2. The **menu catalog** (categories + sub‑categories + items).

| Fetch | Method | Endpoint | Response |
|---|---|---|---|
| Floors | `GET` | `/restaurants/{rid}/floors` | `[{ id, name }]` |
| Tables (per floor, lazy) | `GET` | `/restaurants/{rid}/floors/{fid}/tables` | `[{ id, name, seats }]` |
| Menu tree | `GET` | `/restaurants/{rid}/menu` | `{ mainCategories: [{ id, name, subCategories: [{ id, name, itemIds: [] }] }], items: [{ id, name, price: { dom, fgn }, available }] }` |
| Current order on table | `GET` | `/tables/{tid}/current-order` | `{ orderId, items: [...], totals }` or `null` |

### Header controls

Top‑left on the ticket pane there are two dropdowns:

- **Floor picker** — `1st Floor ▾` → opens a list of floors (`1st Floor`, `2nd Floor`, `Bar`) seen in `Orders(load floors ...).png`. Changing it resets the table picker.
- **Table picker** — `Table 12 ▾` → lazy‑loads tables for the selected floor (`Orders(load tables ...).png`). The menu next to the total confirms the seat count per table (e.g. `Table 1 — 2 seats`, `Table 4 — 6 seats`).

Selecting a new table loads that table's current order or opens a new empty order.

---

## 2. Ticket pane

**Screen:** `Orders.png` — left pane shows:

```
Name           Qty   Each       Total
Lychee Martini  2    $12.00     $24.00   ×
Chicken Wings   1    $12.00     $12.00   ×
Grilled Salmon  1    $20.00     $20.00   ×
Bulgogi         1    ₩18,000    ₩18,000  ×

Domestic (₩)                    ₩18,000
Foreign ($)                     $56.00
```

- Dual currency totals — `Domestic (₩)` and `Foreign ($)` are kept independent (not auto‑converted). An item priced in ₩ only contributes to the ₩ total; a $ item only contributes to the $ total.
- Quantity is editable inline; `×` removes an item (only allowed for items still in draft — see §4).
- Top of the ticket pane has two tabs in the screenshot: **Order** and **Pay ₩18,000 · $56.00**. Tapping the blue **Pay** button routes to Payment (§5) with the current `orderId`.

### Backend operations for existing items

| Action | Method | Endpoint | Notes |
|---|---|---|---|
| Change qty of existing (already‑sent) item | `PATCH` | `/orders/{oid}/items/{iid}` | Server re‑issues a delta chef ticket to Kitchen |
| Void existing item | `DELETE` | `/orders/{oid}/items/{iid}` | Requires `Process Payment` or manager permission depending on settings |

---

## 3. Catalog pane (menu browsing)

**Screen:** `Orders(load menu, main category, sub category).png`.

- Top row: search box (`Search`).
- Below it: **Main Categories** tabs (`Hot Foods` (selected), `Cold Foods`, `Main Meal`, `Drinks`).
- Below that: **Sub Categories** of the currently selected main (`Dumplings`, `Spring Rolls`, `Bao Buns`, `Hot Soups`, `Hot Appetizers`).
- Grid of items in the selected sub (`Pork Dumplings`, `Shrimp Dumplings`, …, `Takoyaki`, `Tempura`).
- In `Orders.png` the sub‑category `Spring Rolls` is selected and the items include `Vegetable Spring Rolls`, `Pork Spring Rolls`, `Shrimp Spring Rolls`, `Crispy Egg Rolls`.

### Behavior

- All menu data comes from a single `GET /restaurants/{rid}/menu` fetch on mount. Tapping categories/sub‑categories is purely client‑side filtering; no per‑click network I/O.
- Search filters across item `name` (and optionally `tags`). Debounced locally; no server round‑trip unless the dataset is big enough to warrant `?query=` paging.
- Tapping an item card adds it to the ticket as a **draft** item (see §4). Tapping again increments qty.
- Items flagged `available = false` in the catalog render disabled; tapping is a no‑op.

---

## 4. Draft vs sent items

**Screen:** `Orders(Draft new items that is not stilll orderd to kitchen).png` — shows the ticket split:

```
Name                  Qty   Each    Total
Lychee Martini         2    $12.00  $24.00  ×
Chicken Wings          1    $12.00  $12.00  ×
Grilled Salmon         1    $20.00  $20.00  ×
Bulgogi                1    ₩18,000 ₩18,000 ×
─────── NEW ITEMS ───────
Vegetable Spring Rolls 4    $6.00   $24.00  ×
```

- The "NEW ITEMS" separator is the client's way of marking items that are **drafted** but not yet sent to the kitchen. They exist only on the client (plus an optional autosaved draft cache) until the waiter confirms.
- Sending drafts is implied by a dedicated action (the blue primary button at the top of the ticket pane becomes a "Send to Kitchen" when there are drafts, otherwise "Pay ₩18,000 · $56.00"). That action calls:

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Open order on table (if none) | `POST` | `/tables/{tid}/orders` | `{ partySize? }` | `{ orderId, status: "open" }` |
| Send items to kitchen | `POST` | `/orders/{oid}/items` | `[{ menuItemId, qty, note?, modifiers?: [] }]` | `{ items: [...], chefTickets: [{ id, status: "received" }] }` |
| Save draft locally | (client only) | — | — | Autosaved every N seconds; restored on reload |

- After the kitchen receives items, they flip to "sent" state on the ticket — the `×` button is replaced by a void flow that requires permissions.

---

## 5. Payment

Entry: tap **Pay ₩18,000 · $56.00** in the ticket header → `/orders/{oid}/payment` screen.

Header: `Payment · Table 12 · Ch. #85`, back arrow, status pill (`Due` / `Paid`).

### 5.1 Amount due

Two read‑only cards: `DOMESTIC ₩18,000` and `FOREIGN $56.00`. These mirror the two running totals from the ticket pane and are paid *independently*. Payment cannot be confirmed until **both** currencies are fully covered.

### 5.2 Method selector

Three mutually exclusive tiles: **Cash**, **Credit**, **Mix**.

#### Cash

**Screen:** `Payment/Payment(cash).png`.

- Two inputs: `Domestic (₩)` and `Foreign ($)` for "Record cash received".
- Under each input the UI shows a live delta: `Short by ₩14,438`, `Short by $32.00`. If user enters more than due, label should flip to `Change ₩X`.
- `Confirm Payment` is **disabled** until both inputs are ≥ due.

Request on confirm:

```json
POST /orders/{oid}:pay
{
  "method": "cash",
  "received": { "domestic": 18000, "foreign": 56.00 },
  "change":   { "domestic": 0,     "foreign": 0 }
}
```

#### Credit

**Screen:** `Payment/Payment(credit).png`.

- No input fields. Instead a large QR ("Scan to Pay — Show this QR to the guest"). Caption below the QR shows `₩18,000 + $56.00`.
- The QR is a short‑lived PSP (payment service provider) checkout link that settles both currencies in one go. The POS polls payment status (or receives a push) while the guest pays.
- `Confirm Payment` stays active; pressing it before the PSP reports success triggers a confirmation ("Mark as paid manually?" — typical fallback for offline PSPs).

Fetch the QR:

```
POST /orders/{oid}/payments/credit:init
→ { paymentId, qrUrl, expiresAt, amount: { dom, fgn } }
```

Webhook / poll:

```
GET /orders/{oid}/payments/credit/{paymentId}
→ { status: "pending" | "succeeded" | "failed" | "expired" }
```

Confirm on success:

```
POST /orders/{oid}:pay
{ "method": "credit", "paymentId": "...", "amount": { "domestic": 18000, "foreign": 56 } }
```

#### Mix

**Screen:** `Payment/Payment(mix).png`.

- "Split cash & credit" — the UI lets the user enter either the cash or the credit portion; the *other* is auto‑computed so they sum to due. Shown per currency:
  - `Domestic — due ₩18,000`: `Cash ₩3,562`, `Credit ₩14,438`.
  - `Foreign — due $56.00`: `Cash $24`, `Credit $32.00`.
- Below the inputs, the UI renders a QR labeled "Credit portion QR" whose amount is `₩14,438 + $32.00` (the credit sides of both currencies).
- `Confirm Payment` requires: cash covers its share AND credit QR returns success for the remainder.

Request on confirm:

```json
POST /orders/{oid}:pay
{
  "method": "mix",
  "cash":   { "domestic": 3562,  "foreign": 24 },
  "credit": { "domestic": 14438, "foreign": 32, "paymentId": "..." }
}
```

### 5.3 On success

- Order transitions `open → paid`. Response returns `{ orderId, status: "paid", receiptId, paidAt, method }`.
- Table flips to `available` on the Floor Plan (via `table.updated`).
- History is appended in Analytics (§History — receipt format).
- App navigates back to Orders on the same table, now empty.

---

## 6. Permissions summary

The Staff Permission dialog (see Settings · Staff & Roles) gates Orders:

- **Orders** page access → required to reach the screen at all.
- **Take Orders** → required to add/modify items and send to kitchen.
- **Process Payment** → required for the Payment sub‑screen and for voiding already‑sent items.

Without `Take Orders`, the catalog pane renders read‑only (tiles become non‑interactive) and the "Send to Kitchen" / "Pay" buttons are hidden.

---

## 7. State diagram — order

```
(none) ──open table──▶ open(draft items only)
  open ──send items──▶ open(with sent items + chefTickets)
  open ──add more──▶ open  (loop; each send creates a new chefTicket batch)
  open ──pay──▶ paid
  open ──cancel order──▶ cancelled  (permission‑gated)
```

Every item within an order has its own state that syncs with the Kitchen module:

```
drafted ─send─▶ received ─accept─▶ in_progress ─complete─▶ completed
completed ─recall─▶ in_progress   (from Kitchen Completed tab)
```
