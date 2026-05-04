# POS · Analytics

Read‑only dashboards for the manager/admin. Left rail has five sections that map 1:1 to the screenshots. Two global controls sit on every sub‑page:

- **Currency pool toggle** (top‑right): `$ Foreign` / `₩ Domestic`. Foreign and domestic revenues are tracked as independent pools — the UI never auto‑converts them, it lets the user flip pools.
- **Period picker** (top of each body): `Today`, `1 W` (default), `1 M`, `3 Q`, `📅 Custom`.

Screens used for this analysis:

- `Sales Dashboard.png`
- `Revenue Analysis.png`
- `Menu Analysis - 1.png`, `Menu Analysis - 2.png`
- `Customer Analysis.png`
- `History - Compact.png`, `History - Receipts.png`

All endpoints below accept the same query params: `?period=today|1w|1m|3q|custom&from=...&to=...&pool=dom|fgn`.

---

## 1. Sales Dashboard

**Screen:** `Sales Dashboard.png` — the landing page of Analytics.

Hero card: `Total Revenue $9,920.00 ▼‑2.8%` with a stacked breakdown bar showing `Credit Card $7,738.00` and `Cash $2,182.00`.

Three KPI tiles below: `186 Total Orders ▲+11.0%`, `$53.34 Avg Ticket Size ▼‑12.4%`, `4 Cancellations ▲+33%`.

Big chart: `Sales Trend — Tap on the chart to view revenue and order count`, a smoothed area chart from Mon to Sun.

### Fetch

```
GET /analytics/sales-summary?period=1w&pool=fgn
→ {
  totalRevenue: 9920.00,
  revenueDelta: -0.028,           // vs previous equal‑length window
  breakdown: { creditCard: 7738.00, cash: 2182.00 },
  totalOrders: 186, ordersDelta: 0.110,
  avgTicket: 53.34, avgTicketDelta: -0.124,
  cancellations: 4, cancellationsDelta: 0.33,
  trend: [
    { bucket: "Mon", revenue: ..., orders: ... },
    ...
    { bucket: "Sun", revenue: ..., orders: ... }
  ]
}
```

### Interactions

- Tap a point on the Sales Trend → dispatches a drill‑down drawer showing `revenue` and `orderCount` for that bucket.
- Toggle `$ Foreign` / `₩ Domestic` → refetches with `pool=…`.

---

## 2. Revenue Analysis

**Screen:** `Revenue Analysis.png`.

Two side‑by‑side cards: `This Period $12,140`, `Last Period $10,860` — each with a progress‑bar‑style fill for visual comparison. Below, a bar chart `Peak revenue at Sat — Revenue over time` with one highlighted bar (`Sat`, ~3400). At the bottom, an insight card `Dine‑in generates the most revenue! — Revenue by order type`:

```
Dine‑in    $8,240.00   68%
Takeaway   $2,680.00   22%
Delivery   $1,220.00   10%
```

### Fetch

```
GET /analytics/revenue?period=1w&pool=fgn
→ {
  current: 12140,
  previous: 10860,
  peakBucket: "Sat",
  buckets: [{ bucket, revenue }, ...],
  byOrderType: {
    dineIn:   { amount: 8240, pct: 0.68 },
    takeaway: { amount: 2680, pct: 0.22 },
    delivery: { amount: 1220, pct: 0.10 }
  }
}
```

- Highlighted bar is computed server‑side (`peakBucket`).
- Natural‑language headline (`Dine‑in generates the most revenue!`) is derived from `byOrderType` — render the winning type inline.

---

## 3. Menu Analysis

**Screens:** `Menu Analysis - 1.png`, `Menu Analysis - 2.png`.

Upper half — doughnut chart with legend:

```
Grilled & BBQ   35.1%   $7150.00   230
Entrees         26%     $5300.00   146
Salads          10.9%   $2212.00   158
Cocktails        8.9%   $1821.00   157
Appetizers       8.6%   $1752.00   146
Sides            7.2%   $1456.00   182
Desserts         3.3%    $666.00    74
```

Headline above the chart: `The Grilled & BBQ category is loved the most in $!`. Sub‑copy: `Foreign ($) category breakdown — independent pool` — makes the pool isolation explicit.

Lower half — a leaderboard of items (`All Foreign Items`) with a Revenue/Volume toggle:

```
 1. Ribeye Steak      Grilled & BBQ   102   $4590.00
 2. Lobster Tail      Entrees          58   $3364.00
 3. Grilled Salmon    Grilled & BBQ   128   $2560.00
 ...
10. Tiramisu          Desserts         74    $666.00
```

Selecting a row (`Ribeye Steak — Weekly Sales Trend — Top $ seller across the week`) reveals a per‑item weekly bar chart at the bottom (second screenshot), highlighting the best day.

### Fetches

```
GET /analytics/menu/categories?period=1w&pool=fgn
→ [{ categoryId, name, pct, revenue, sold }]

GET /analytics/menu/items?period=1w&pool=fgn&sort=revenue|volume
→ [{ itemId, name, categoryName, sold, revenue }]

GET /analytics/menu/items/{itemId}/trend?period=1w&pool=fgn
→ { buckets: [{ bucket, sold, revenue }], peakBucket: "Sat" }
```

- Revenue/Volume toggle changes the `sort` param and the column that is bolded.
- The leaderboard's top‑1 row is preselected so the trend chart appears by default.

---

## 4. Customer Analysis

**Screen:** `Customer Analysis.png`.

Top row KPIs: `1,284 Total Customers ▲+8.3%`, `186 New Customers ▲+14.2%`, `62% Returning Rate ▲+3.1%`, `4.6 Avg Satisfaction ▼‑0.1`.

Middle row:

- Line area chart `Most visitors come at 19:00 — Customer traffic by hour` (hourly x‑axis 6‑22).
- Doughnut `62% of customers are returning! — New vs Returning customers` — `Returning 62%` / `New 38%`.

Bottom row:

- Horizontal bar chart `Visit Frequency` bucketed `1×, 2‑3×, 4‑6×, 7‑10×, 10+`.
- Horizontal bars `Groups of 3‑4 are the most common! — Party size distribution` (`1` 8%, `2` 32%, `3‑4` 38%, `5‑6` 15%, `7+` 7%).

### Fetches

```
GET /analytics/customers/summary?period=1w
→ { total, totalDelta, newCount, newDelta, returningRate, returningDelta, avgSatisfaction, avgSatisfactionDelta }

GET /analytics/customers/traffic?period=1w
→ { buckets: [{ hour: 6, visits }, ... { hour: 22, visits }], peakHour: 19 }

GET /analytics/customers/mix?period=1w
→ { new: 0.38, returning: 0.62 }

GET /analytics/customers/frequency?period=1w
→ [{ bucket: "1×", count }, { bucket: "2-3×", count }, ...]

GET /analytics/customers/party-size?period=1w
→ [{ bucket: "1 guests", pct }, ..., { bucket: "7+ guests", pct }]
```

`Avg Satisfaction` implies there is a guest rating input somewhere (e.g. from the post‑payment QR page). If that isn't implemented yet, the field will read `—`.

---

## 5. History

### 5.1 Filters row (shared by both renders)

**Screens:** `History - Compact.png`, `History - Receipts.png`.

- Period picker (same as other Analytics pages).
- Full‑text search: `Search by order ID, menu item, payer name, table...` — server‑side search with debounce.
- Tab chips: `All 20`, `Orders 8`, `Reservations 7`, `Payments 7`, `No‑Shows 4`, `Walk‑ins 4` — each with its own count badge.
- Top summary tiles: `Events 20`, `Revenue $1,232.55`, `No‑Shows 4 — Refunds $18.50`.

### 5.2 Event feed

A unified timeline of heterogeneous events. In `History - Compact.png` each row is one line:

```
[icon]  Lee S.    [Paid]        ₩41.00
       ● Table 3 · ♦ 3P · ⏱ Today · 01:12 PM
```

- Icon + colour encode the event type (credit card icon = payment, calendar icon = reservation, person icon = walk‑in/order).
- Status pill: `Paid`, `Completed`, `No‑Show`, `Refunded`.

### 5.3 Compact vs Receipts render

Top‑right of the list there is a segmented control `Compact / Receipts`.

- **Compact** (default) — one line per event.
- **Receipts** (`History - Receipts.png`) — expands any event that has a receipt body into a full receipt block:

```
Park K.  [Completed]                           $156.50
📅 h-11  🪑 Table 2  ⏱ Today · 12:35 PM  💳 Credit Card

Item           Qty   Each    Total
Americano       2    $3.50   $7.00
Cafe Latte      1    $4.00   $4.00
Honey Cold Brew 1    $5.50   $5.50
Croissant       2    $4.00   $8.00
Tiramisu        1    $6.50   $6.50

Subtotal $31.00                           Total $156.50
```

Events without a receipt (reservation only, no‑shows) render as `Receipt summary unavailable` or `No receipt — reservation only`.

### 5.4 Right‑hand detail rail

Clicking any row opens a detail rail (visible in both screenshots) with normalized fields:

```
Lee S. — Today · 01:12 PM   [Paid]
Table: Table 3       Party: 3 guests
Paid at: 13:12       Method: Cash
# ID: h-12
```

### Fetches

```
GET /analytics/history?period=1w&tab=all|orders|reservations|payments|no_shows|walk_ins&query=...&cursor=...
→ {
  summary: { events: 20, revenue: 1232.55, noShows: { count: 4, refunds: 18.50 } },
  results: [
    { id, type: "payment", guestName, table, partySize, occurredAt, amount, method, status, receiptId? },
    { id, type: "reservation", guestName, table, partySize, startAt, endAt, status },
    { id, type: "order", ... },
    ...
  ],
  nextCursor
}

GET /analytics/history/{id}/receipt
→ { items: [...], subtotal, tax, tip, total, currency }
```

- Tab chip counts come from the `summary` block; the `All N` chip equals `results.length` for the filter (before pagination) or the server total.
- Search is a `query` param across `order id`, `item name`, `payer name`, `table name`.

---

## 6. Permissions

All Analytics sub‑pages require the `Analytics` page permission. Waiter/Chef/Cashier default permission sets (from Staff & Roles) do **not** include it; only admin/manager roles see the tab in the bottom nav.

---

## 7. Realtime

Analytics is pull‑based. There is no websocket subscription; KPIs refresh when the user changes the period or flips the currency pool. A `Refresh` pull‑to‑refresh gesture re‑runs every fetch on the current page.
