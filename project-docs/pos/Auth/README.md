# POS · Auth

Mobile‑first authentication flow. Covers Sign In, the Sign‑Up mode selector, and the two divergent registration paths: **Restaurant Sign Up** (manager creates a new tenant) and **Staff Sign Up** (worker joins an existing tenant).

Screens used for this analysis:

- `Sign In/Sign In.png`
- `Sign Up/Sign Up mode select.png`
- `Sign Up/Restaurant/Step 1 - Restaurant Sign Up(register manager's profile concurrently).png`
- `Sign Up/Restaurant/Step 2 - Restaurant Registration Approval wait.png`
- `Sign Up/Staff/Step 1 - Restaurant selection - 1.png`
- `Sign Up/Staff/Step 2- Restaurant selection - 2.png`
- `Sign Up/Staff/Step 3 - Staff Registration.png`
- `Sign Up/Staff/Step 4 - Staff Registration Approval.png`

---

## 1. Sign In

**Screen:** `Sign In.png` — username + password form, "Sign In" CTA, secondary "Sign Up" link.

### Flow

1. User opens app unauthenticated → app shows Sign In.
2. User types `username` + `password` → taps **Sign In**.
3. On success the app routes to the last valid workspace (usually **Floor Plan** or **Orders** depending on role permissions).
4. "Sign Up" link → go to **Sign Up mode select**.

### Backend contract

| Action | Method | Endpoint (suggested) | Request | Response |
|---|---|---|---|---|
| Sign in | `POST` | `/auth/sign-in` | `{ username, password, device: { platform, appVersion } }` | `{ accessToken, refreshToken, user: { id, fullName, role, permissions[], status }, restaurant: { id, name, tier } }` |
| Refresh token | `POST` | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| Sign out | `POST` | `/auth/sign-out` | `{}` (uses access token) | `204` |

### Validation / edge cases the UI must handle

- `401` invalid credentials → inline error under password field.
- User status ≠ `active` (e.g. `pending_approval`, `inactive`, `rejected`) → deny sign‑in with dedicated message.
- Restaurant status ≠ `approved` (admin's restaurant still awaiting approval) → redirect to the "Request Submitted" screen.

---

## 2. Sign Up — mode select

**Screen:** `Sign Up mode select.png` — two cards: **Restaurant Sign Up** and **Staff Sign Up**. "Already have an account? Sign In" as secondary.

### Flow

1. Tap **Restaurant Sign Up** → Restaurant Step 1.
2. Tap **Staff Sign Up** → Staff Step 1.
3. No backend call on this screen.

---

## 3. Restaurant Sign Up (new tenant + admin)

### Step 1 — Register restaurant + manager's profile concurrently

**Screen:** `Restaurant/Step 1 ... .png` — one form with:

- `Restaurant Name *`
- `Admin Name *`
- `Username *` (admin's login)
- `Password *`
- `Confirm Password *`
- Primary CTA **Register Restaurant**, secondary **Back**.

#### Behavior

- Client validates: non‑empty required fields, password = confirm, username format (lowercase, no spaces), minimum password length.
- Submit creates *both* entities in a single transaction: a new `restaurant` in `status = pending_approval` and its first `user` with `role = admin`, `status = pending_approval`, linked as the restaurant's owner.

#### Backend contract

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Check username available | `GET` | `/auth/username-available?username=...` | — | `{ available: boolean }` (optional, debounce on blur) |
| Register restaurant + admin | `POST` | `/auth/sign-up/restaurant` | `{ restaurant: { name }, admin: { fullName, username, password } }` | `{ restaurantId, userId, status: "pending_approval" }` |

### Step 2 — Approval wait

**Screen:** `Restaurant/Step 2 - Restaurant Registration Approval wait.png` — clock icon, "Request Submitted", copy: *"Your request to join '{restaurantName}' has been sent. The admin will review and approve your registration."*, link **Back to Sign In**.

> Note: the copy on this screen is template‑reused from the staff flow. For a new tenant, approval is performed by the platform operator (super‑admin), not a local restaurant admin.

#### Behavior

- App does *not* auto‑sign the user in. The session is cleared and the only CTA returns to Sign In.
- If the user attempts to sign in while `status = pending_approval`, Sign In should respond with a human‑readable reason and deep‑link back to this screen.

---

## 4. Staff Sign Up (join existing tenant)

### Step 1 — Restaurant selection (open picker)

**Screen:** `Staff/Step 1 - Restaurant selection - 1.png` — dropdown titled "Choose a restaurant...". Opened state shows a searchable list of restaurants each tagged with **Approved** (rows without the tag are hidden from selection in practice).

#### Backend contract

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| List joinable restaurants | `GET` | `/public/restaurants?query=...&status=approved&limit=50` | — | `[{ id, name, status: "approved" }]` |

- Search is debounced and server‑side; list only returns restaurants with `status = approved` (they are the only ones that can accept staff).

### Step 2 — Restaurant confirmed

**Screen:** `Staff/Step 2 - Restaurant selection - 2.png` — collapsed dropdown now shows "Glass Onion", CTA **Next**, **Back**.

- No backend call; `Next` passes `restaurantId` forward.

### Step 3 — Staff details

**Screen:** `Staff/Step 3 - Staff Registration.png` — header "Staff Details — Create your staff account for {restaurantName}", "Change" pill to go back to picker, fields:

- `Full Name *`
- `Username *`
- `Password *`
- `Confirm Password *`
- CTA **Request to Join**.

#### Backend contract

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Submit staff registration | `POST` | `/auth/sign-up/staff` | `{ restaurantId, fullName, username, password }` | `{ userId, restaurantId, status: "pending_approval" }` |

- Username uniqueness is scoped **per restaurant** (same username may exist across tenants).
- The new user is created with `role = null` and no permissions; the approving admin assigns `role` and `permissions[]` at approval time (see Settings · Staff & Roles).

### Step 4 — Approval wait

**Screen:** `Staff/Step 4 - Staff Registration Approval.png` — same "Request Submitted" layout as the restaurant flow. Copy references the chosen restaurant (`Glass Onion`). Only action is **Back to Sign In**.

- The restaurant's admin approves from **Settings → Staff & Roles → Pending Requests** (see that module).
- Until approval, Sign In must reject the user and explain the pending state.

---

## 5. Cross‑cutting concerns

### Token & session

- All subsequent page modules assume an `accessToken` in `Authorization: Bearer …`.
- Token carries `restaurantId`, `userId`, `role`, and the resolved `permissions[]`. The POS router uses `permissions` to show/hide bottom tabs (Floor Plan / Orders / Kitchen / Analytics / Settings).

### Default password

Per the Settings/Staff & Roles screenshot ("password is default - 12345678"), when an admin **registers** a staff directly from Settings the server applies a fixed default password (`12345678`). That path is separate from the Staff Sign Up self‑service flow documented above.

### Push / realtime

- When an admin approves or rejects a pending request, the affected waiting user should receive a push notification + a realtime event (`user.status.updated`) so the "Back to Sign In" screen can reveal the decision on next sign‑in attempt.

---

## 6. State machine — user account

```
           ┌─────────────────────── reject ───────────────────────┐
           │                                                      │
pending_approval ──approve──▶ active ──deactivate──▶ inactive     ▼
           ▲                    │                                rejected
           │                    └─── reset password (admin) ──▶  active
           └── (re‑apply via new sign‑up)
```

- `pending_approval` → user cannot sign in.
- `active` → normal access gated by `permissions[]`.
- `inactive` → sign‑in denied; data retained; can be re‑activated from Staff & Roles.
- `rejected` → historical record only; user cannot sign in and must re‑register.
