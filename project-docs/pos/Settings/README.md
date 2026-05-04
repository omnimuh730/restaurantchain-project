# POS · Settings

Admin/manager configuration. Left rail has six sections:

1. **General** — restaurant info, hours, deposit, grace period, phone numbers.
2. **Menu Management** — categories / sub‑categories / items.
3. **Amenities & Services** — togglable restaurant features.
4. **Security & Payments** — password, notifications, saved cards.
5. **Staff & Roles** — team + permissions + pending registrations.
6. **Upgrade Plans** — Free/Pro/Ultra tier with inline payment.

Every sub‑page shares a **Save Changes** button in the top‑right that commits all local edits on that page at once.

Screens used for this analysis:

- `General/Deposit Money, money type, grace period setting.png`
- `General/Operating hours setting.png`
- `General/phone number setting.png`
- `Menu Management/Load Categories, Select Main Category, Sub category.png`
- `Menu Management/Add items to selected categories(load all menu item status to disable already added items).png`
- `Amentities & Services/Screenshot 2026-04-24 110638.png`
- `Security & Payments/Password Setting(ignore notification setting).png`
- `Security & Payments/Add Payment Card(just registering - user's pay will sent to this deposit)/Typing Mode.png`
- `Security & Payments/Add Payment Card(just registering - user's pay will sent to this deposit)/Scan Mode.png`
- `Security & Payments/Add Payment Card(just registering - user's pay will sent to this deposit)/list registerd cards.png`
- `Staff & Roles/Main scene.png`
- `Staff & Roles/Register New Staff(pasword is default - 12345678).png`
- `Staff & Roles/Approve & Reject registration request.png`
- `Staff & Roles/Permission, active(inactive), password reset, remove of a staff.png`
- `Staff & Roles/Permission setting.png`
- `Upgrade Plans/Step 1 - Choose Plan.png`
- `Upgrade Plans/Step 2 - Confirm select plan.png`
- `Upgrade Plans/Step 3- Try Pay.png`
- `Upgrade Plans/Step 4 - Update Tier.png`

---

## 1. General

**Screens:** `Deposit Money, money type, grace period setting.png`, `Operating hours setting.png`, `phone number setting.png`.

Three cards scroll in sequence:

### 1.1 Restaurant Info + Deposit + Grace Period

- `Restaurant Name` (e.g. `Glass Onion`), `Description`, **Thumbnail Image** (uploadable).
- `Deposit Money` — numeric stepper, paired with a **currency toggle** `$ / ₩`. Caption: *"Starting cash in drawer at the beginning of each shift."*
- `Grace Period` — minutes (e.g. `20`). Caption: *"Wait time before a reservation is marked as no‑show."*
- Top‑right badge `Free Tier` (read from the current subscription; see §6).

### 1.2 Opening Hours

Seven rows `Monday … Sunday`. Each row has:

- Toggle (on = open, off = closed).
- Start time picker + `to` + End time picker.

In the screenshot Mon–Fri = 10:00‑22:00, Sat = 11:00‑23:00, Sun = 11:00‑21:00.

### 1.3 Phone Numbers

- `Main Phone` (required), `Alternative Phone` (optional secondary contact).

### Fetch / save

```
GET /restaurants/{rid}/settings/general
→ {
  name, description, thumbnailUrl,
  deposit: { amount, currency: "dom"|"fgn" },
  graceMinutes: 20,
  openingHours: [ { weekday: 1..7, open: true, start: "10:00", end: "22:00" } ],
  phones: { main, alternative }
}

PUT /restaurants/{rid}/settings/general
→ same shape (diff‑patch acceptable)
```

- Thumbnail upload is a pre‑signed URL flow: `POST /uploads` → upload to returned URL → patch `thumbnailUrl`.

---

## 2. Menu Management

**Screens:** `Load Categories, Select Main Category, Sub category.png`, `Add items to selected categories(load all menu item status to disable already added items).png`.

Hierarchy:

```
Main Category  ──▶  Sub Category  ──▶  Items
```

Top of page three count tiles: `Categories 4`, `Sub‑Categories 12`, `Total Items 27`. Right edge shows the same totals as a pill (`27 items`).

Layout is three stacked pickers:

- **Main Categories** row: `Hot Foods` (selected), `Cold Foods`, `Main Meal`, `Drinks`.
- **{Main} – Sub‑Categories** row: `Dumplings 3`, `Spring Rolls 2`, **`Bao Buns 2`** (selected), `Hot Soups 3`.
- **{Sub} Items** grid with per‑item price, plus search and a primary **+ Add Item** button.

### 2.1 Add items modal

**Screen:** `Add items to selected categories(...).png`. Title `Add items to Bao Buns`. Grid of *all* catalog items:

- Selectable cards are in normal state (`Grilled Salmon $28.00`, `Ribeye Steak $45.00`, `Garlic Bread $7.00`).
- Already‑linked items render **disabled** with an `Already added` chip (`Wagyu Burger`, `Caesar Salad`, `Fresh Juice`). The backend drives this by returning `isInCurrentSub: boolean` per item.
- Footer counter `3 selected` and CTA `Add 3 items`.

### Fetch / save

```
GET /restaurants/{rid}/menu/full
→ {
  mainCategories: [{ id, name, subCategories: [{ id, name, items: [{ id, name, price }] }] }]
}

GET /restaurants/{rid}/menu/items?subCategoryId=...
→ [{ id, name, price, isInCurrentSub }]   // drives the Already added state

POST /restaurants/{rid}/menu/sub-categories/{sid}/items
{ itemIds: ["it_1","it_2","it_3"] }

POST /restaurants/{rid}/menu/main-categories       { name }
POST /restaurants/{rid}/menu/sub-categories        { mainCategoryId, name }
POST /restaurants/{rid}/menu/items                 { name, price: { dom?, fgn? } }
DELETE /restaurants/{rid}/menu/.../{id}            // cascading rules
```

- An item may live in **0 or more** sub‑categories; deleting the last link only removes the association, not the item itself.
- Price is stored per currency pool (see Orders — dual‑currency totals).

---

## 3. Amenities & Services

**Screen:** `Screenshot 2026-04-24 110638.png`. Grid of ~20 toggle tiles:

`Parking, Valet, Free WiFi, Credit Cards, Cash, Mobile Pay, Wheelchair, High Chairs, Kids Menu, Dog Friendly, Live Music, Dress Code, Smoking Area, Private Events, Catering, Delivery, Takeout, Reservations, Walk‑ins, Outdoor, …`.

Header badge `13 active` = count of currently on toggles.

### Behavior

- Each tile = boolean. Tap toggles local state; `Save Changes` commits.
- Three tiles visually gate other features of the POS:
  - **Reservations** off → hides the Calendar View tab in Floor Plan, blocks `reservation.*` endpoints.
  - **Credit Cards** off → hides the Credit tile on Orders → Payment.
  - **Cash** off → hides the Cash tile on Orders → Payment.

### Fetch / save

```
GET /restaurants/{rid}/settings/amenities
→ { items: [{ key: "parking", enabled: true }, ...] }

PUT /restaurants/{rid}/settings/amenities
{ items: [{ key: "parking", enabled: true }, ...] }
```

---

## 4. Security & Payments

**Screens:** `Password Setting(...).png`, `Add Payment Card/*.png`.

Three cards.

### 4.1 Password Settings

- `New Password`, `Confirm Password`, `Update Password` button (disabled until valid).

```
POST /auth/change-password
{ newPassword, confirmPassword }
→ 204
```

### 4.2 Notifications

- `Floor Plan — New reservation requests` toggle.
- `Kitchen — New chef tickets created` toggle.

The file name hints to "ignore notification setting" — this section is optional scaffolding; values saved into `/users/me/notifications`.

```
PUT /users/me/notifications
{ floorPlanNewReservations: true, kitchenNewTickets: true }
```

### 4.3 Saved Payment Methods

**Screen:** `list registerd cards.png` — list of cards with brand icon, masked PAN (`Credit Card .... 4242`), card holder, expiry, `Default` pill. Dashed CTA `+ Add New Card`.

These are the **platform‑billing** cards the restaurant uses to pay for its own subscription (see Upgrade Plans §6). Also documented in this folder's filename as *"Add Payment Card(just registering - user's pay will sent to this deposit)"*.

#### Add New Card modal

Two entry modes via a segmented control:

- **Type Card Number** (`Typing Mode.png`) — 16‑digit input, `Cancel` / `Add Card` (disabled until complete).
- **Scan QR Code** (`Scan Mode.png`) — camera viewfinder, `Start Scanning` — scan a QR emitted by a payment tokenization partner.

Regardless of mode, the UI only ever sends a **tokenized** representation; raw PAN never hits our servers.

```
POST /billing/payment-methods
{ token: "tok_...", brand: "visa", last4: "4242", expMonth, expYear, holderName }
→ { id, isDefault }

DELETE /billing/payment-methods/{id}
PATCH  /billing/payment-methods/{id}  { isDefault: true }
```

---

## 5. Staff & Roles

**Screens:** `Main scene.png`, `Register New Staff(...).png`, `Approve & Reject registration request.png`, `Permission, active(inactive), password reset, remove of a staff.png`, `Permission setting.png`.

### 5.1 Landing

Header `Staff Management — Register staff and manage permissions`, primary `+ Register Staff`.

Counters: `Total 8`, `Active 6`, `Inactive 1`, `Pending 1`.

Below, three sections:

1. **Pending Requests** — each request is a row with initials, `@username`, a role pill (e.g. `Waiter`), and per‑row `Approve` / `Reject`.
2. **Search bar** — `Search by name, username or card ID…`.
3. **Role tabs** + staff grid — `All Roles (7)`, `Waiter (4)`, `Chef (2)`, `Cashier (2)`. Each staff card shows initials, name, `@username`, role pill, `active`/`inactive` chip, `Joined Mar 2023`, the count of permissions (`2/7 permissions`) with permission icons, and row actions:

   - `Permissions` button (opens modal §5.4).
   - `⊘` — toggle active/inactive.
   - `🔑` — reset password (to the default `12345678`).
   - `🗑️` — remove staff.

### 5.2 Register Staff modal

**Screen:** `Register New Staff(...).png`. Fields:

- `Full Name *`
- `Username *`
- `Role *` — one of three preset tiles `Waiter` (3 perms default), `Chef` (1 perm default), `Cashier` (7 perms default).
- Footer preview: `DEFAULT PERMISSIONS FOR WAITER` chips showing what will be granted.
- Buttons: `Cancel`, `Register` (disabled until valid).

The folder/file name documents: *"password is default — 12345678"*. So this direct‑registration path does **not** ask the admin for a password; the backend generates the fixed default and the user can rotate it from Security & Payments.

```
POST /restaurants/{rid}/staff
{ fullName, username, role: "waiter"|"chef"|"cashier" }
→ { userId, defaultPassword: "12345678" }   // server may also email/SMS the credentials
```

### 5.3 Approve / Reject pending requests

**Screen:** `Approve & Reject registration request.png`. Standalone block replicated from §5.1. Actions:

```
POST /restaurants/{rid}/staff/{uid}:approve   { role?, permissions?: [...] }
POST /restaurants/{rid}/staff/{uid}:reject    { reason? }
```

On approve, the user's status goes `pending_approval → active` (see Auth README). If `role` is omitted, the role carried in the request is used; `permissions` default to the role's preset.

### 5.4 Per‑staff actions

**Screens:** `Permission, active(inactive), password reset, remove of a staff.png`, `Permission setting.png`.

- `Permissions` → modal:

  Header: user's initials + name + `2 of 7 permissions`.

  Quick actions: `Reset to {Role} Defaults`, `Select All`, `Clear All`.

  Two groups of toggles:

  - **PAGE ACCESS** (3): `Floor Plan`, `Orders`, `Kitchen`. Counter `X/3`.
  - **ACTIONS** (4): `Reservations`, `Take Orders`, `Process Payment`, (plus a fourth scrolled — e.g. `Refunds / Void Items` typical). Counter `X/4`.

  Footer: `Cancel`, `Save Permissions`.

  ```
  PUT /restaurants/{rid}/staff/{uid}/permissions
  { pageAccess: ["kitchen"], actions: ["reservations","take_orders","process_payment"] }
  ```

- `⊘` (activate/deactivate):

  ```
  POST /restaurants/{rid}/staff/{uid}:deactivate
  POST /restaurants/{rid}/staff/{uid}:activate
  ```

- `🔑` (reset to default password):

  ```
  POST /restaurants/{rid}/staff/{uid}:reset-password
  → { defaultPassword: "12345678" }
  ```

- `🗑️` (remove):

  ```
  DELETE /restaurants/{rid}/staff/{uid}
  ```

  Backend soft‑deletes; the user cannot sign in and appears in historical receipts with `[removed]` suffix.

### 5.5 Realtime

The Staff & Roles landing shows a toast `KITCHEN · 11:18 AM — New chef ticket — Table 16 · Seafood Pasta` in the screenshot, illustrating the same global notification channel documented in Kitchen. Nothing in Staff itself needs sockets; all mutations above are request/response.

---

## 6. Upgrade Plans

**Screens:** `Step 1 - Choose Plan.png` → `Step 2 - Confirm select plan.png` → `Step 3- Try Pay.png` → `Step 4 - Update Tier.png`.

Tiers (observed from card copy):

| Tier | Price | Key entitlements |
|---|---|---|
| **Free** | $0 | basic |
| **Pro** | $49/month | Up to 20 staff, advanced analytics & reports, multi‑floor plan, priority email support, custom receipt branding, table reservation system |
| **Ultra** | $99/month | Everything in Pro, unlimited staff, multi‑location, 24/7 priority support, API access & integrations, custom domain & branding, advanced inventory, dedicated account manager |

Entitlements gate features elsewhere (e.g. Pro unlocks the Calendar View and therefore `Reservations`; Ultra unlocks multi‑location + API).

### 6.1 Step 1 — Choose Plan

Side‑by‑side Pro/Ultra cards, `Choose Pro` / `Choose Ultra` buttons. "Popular" pill on Ultra.

```
GET /billing/plans → [{ code:"pro", price:49, features:[...]}, { code:"ultra", price:99, features:[...]}]
```

### 6.2 Step 2 — Confirm

Modal `Subscribe to Pro — You're about to subscribe to the Pro plan at $49/month. You can cancel anytime from your settings.` Buttons: `Cancel`, `→ Proceed to Payment`.

No backend call; just a client‑side confirmation step.

### 6.3 Step 3 — Try Pay

Full‑page payment: plan summary (`Pro Plan · Monthly subscription · $49 · Billed monthly. Cancel anytime.`), currently selected card (`Visa ... 4242 Expires 12/26`, with a checkmark), and the signature **"Slide to pay $49"** confirmation control. Secondary `Cancel`.

The slider prevents accidental taps; on full release it:

```
POST /billing/subscriptions
{ planCode: "pro", paymentMethodId: "pm_..." }
→ { subscriptionId, status: "active", currentPeriodEnd, plan: "pro", nextBillingAt }
```

If the payment method returns a challenge (3DS etc.) the PSP surfaces it; the status is polled like the Orders credit flow.

### 6.4 Step 4 — Update Tier (post‑purchase view)

Top card: `Pro Plan [Active] · $49/month · Next billing: May 17, 2026`. Features listed. Buttons: `Upgrade to Ultra`, `Cancel Subscription` (red link).

Below, the original two tier cards reappear but Pro's button now reads `Current Plan` (disabled) and Ultra still offers `Choose Ultra` (for upsell).

### Subscription endpoints

```
GET    /billing/subscription        → current subscription
POST   /billing/subscription:change { planCode: "ultra" }   // upgrade/downgrade
POST   /billing/subscription:cancel { reason? }
```

Cancelling schedules termination at `currentPeriodEnd` (typical SaaS semantics) and surfaces an inline banner `Active until YYYY‑MM‑DD` for the remainder.

---

## 7. Cross‑cutting concerns

- Only users with the `Admin` or `Manager` role see **Settings** at all. A number of sub‑sections require admin specifically (Staff & Roles, Upgrade Plans, Security & Payments — Saved Cards). Treat the whole tab as admin‑default.
- `Save Changes` in the page header commits the entire page as a single `PUT` where possible; sub‑modals (Permissions, Register Staff, Add Card) commit independently.
- Settings changes frequently ripple to other modules:
  - Opening Hours → Analytics baselines, no‑show cron windows.
  - Grace Period → Floor Plan reservation no‑show cutoff.
  - Amenities toggles → visibility of Payment tiles, Calendar View, Delivery/Takeout flows.
  - Tier → feature gating across the entire app (e.g. Reservations enabled on Pro+).
