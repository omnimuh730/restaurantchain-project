# Reservation App · Profile

Customer account, wallet, rewards, friends, settings, support, and CatchTable Pro subscription surface.

Screens used for this analysis:

- `Profile page view 1.png`
- `Profile page view 2.png`
- `Profile Edit.png`
- `Top Up Balance.png`
- `Send gift.png`
- `Friend(send, pending approval, remove).png`
- `Tier, bonus pts load from DB.png`
- `History.png`
- `Contact Support(chat available).png`
- `Upgrade to Pro.png`

---

## 1. Profile Landing

**Screens:** `Profile page view 1.png`, `Profile page view 2.png`.

Top profile card:

- initials avatar `AC`
- name `Alex Chen`
- badge `FREE`
- email `alexchen@email.com`
- chevron to edit profile

Wallet card:

- `DOMESTIC · KRW` balance: `₩13,000,000`
- `FOREIGN · USD` balance: `$5,000.00`
- `BONUS · KRW` balance: `₩330,000`
- label `Gold Member`
- helper: `Balances aren't interchangeable. Bonus stacks on Domestic only.`

Quick actions:

- `Top Up`
- `Send Gift`
- `History`

Reward tier card:

- `Reward Tier`
- `2,340 pts`
- tiers:
  - `Silver 0+`
  - `Gold 1,000+`
  - `Platinum 5,000+`
  - `Diamond 10,000+`
- progress bar
- `2,660 pts to Platinum`
- `View Benefits`

Other rows:

- `Refer a Friend` - `You both get $10 in rewards`
- Appearance theme selector: `Airbnb`, `Ocean`, `Forest`, `Midnight`
- `Upgrade to Pro`
- `Friends & Contacts`
- `Settings`
- `Help & Guide`
- `Contact Support`
- `App Version 2.4.1`

### Page mount

```json
GET /users/me/profile-dashboard
→ {
  "profile": {
    "id": "u1",
    "fullName": "Alex Chen",
    "username": "alexchen",
    "email": "alexchen@email.com",
    "phone": "+1 (555) 234-5678",
    "avatarUrl": null,
    "plan": "free"
  },
  "wallet": {
    "domestic": { "currency": "KRW", "balance": 13000000 },
    "foreign": { "currency": "USD", "balance": 5000, "paymentMethod": "VISA ••4242" },
    "bonus": { "currency": "KRW", "balance": 330000 }
  },
  "rewards": {
    "tier": "gold",
    "points": 2340,
    "nextTier": "platinum",
    "pointsToNextTier": 2660
  },
  "contactsCount": 8,
  "appearance": "airbnb",
  "appVersion": "2.4.1"
}
```

---

## 2. Edit Profile

**Screen:** `Profile Edit.png`.

Fields:

- avatar initials with `Change Photo`
- `Full Name`
- `Phone Number`
- `Username`
- actions: `Cancel`, `Save Changes`

### Backend

```json
PUT /users/me/profile
{
  "fullName": "Alex Chen",
  "phone": "+1 (555) 234-5678",
  "username": "alexchen",
  "avatarUrl": "..."
}
```

Username uniqueness check:

```json
GET /auth/username-available?username=alexchen
```

Photo upload:

1. `POST /uploads/avatar`
2. upload image to pre-signed URL
3. save `avatarUrl` through `PUT /users/me/profile`

---

## 3. Wallets

Wallets are intentionally separate:

- **Domestic - KRW**: in-app balance used for domestic charges and gifts.
- **Foreign - USD**: foreign wallet backed by a saved payment method (`VISA ••4242`).
- **Bonus - KRW**: promotional balance that stacks only on domestic payments.

The app must never auto-convert balances between pools.

### Fetch wallet

```json
GET /users/me/wallet
→ {
  "domestic": { "currency": "KRW", "balance": 13000000 },
  "foreign": { "currency": "USD", "balance": 5000, "paymentMethodId": "pm_1", "paymentMethodLabel": "VISA ••4242" },
  "bonus": { "currency": "KRW", "balance": 330000 }
}
```

---

## 4. Top Up Balance

**Screen:** `Top Up Balance.png`.

Sections:

- `Top Up To`
  - domestic card `₩13,000,000` and `+₩330,000 bonus`
  - foreign card `$5,000.00`, `VISA ••4242`
- amount presets:
  - `$10.00`
  - `$25.00`
  - `$50.00` with `+$1`
  - `$100.00` with `+$5`
  - `$200.00` with `+$10`
  - `$500.00` with `+$25`
- custom amount input
- bonus preview: `You'll get $1.00 bonus with this top up!`
- payment methods:
  - `Apple Pay`
  - `Google Pay`
  - `PayPal`
  - `Bank Transfer`
- CTA `Continue · $50.00`

### Behavior

1. User chooses target wallet.
2. User selects preset or custom amount.
3. Server calculates bonus eligibility.
4. User selects payment method.
5. Payment intent is created.
6. On success, wallet balance and transaction history update.

### Backend

```json
GET /wallet/top-up-options?wallet=foreign
→ {
  "amounts": [
    { "amount": 10, "bonus": 0 },
    { "amount": 50, "bonus": 1 },
    { "amount": 100, "bonus": 5 }
  ],
  "paymentMethods": ["apple_pay", "google_pay", "paypal", "bank_transfer"]
}
```

```json
POST /wallet/top-ups
{
  "wallet": "foreign",
  "amount": 50,
  "paymentMethod": "apple_pay"
}
```

Response:

```json
{
  "topUpId": "top_1",
  "paymentIntentId": "pi_1",
  "amount": 50,
  "bonus": 1,
  "status": "pending"
}
```

Webhook finalizes:

```text
wallet.top_up.completed
```

---

## 5. Send Gift Card

**Screen:** `Send gift.png`.

Fields:

- `Send From`
  - domestic wallet
  - foreign wallet
- `Recipient Username`
- `Gift Amount` stepper, e.g. `₩30,000`
- `Personal Message (optional)`
- payment source summary `Pay from Domestic Balance`, `Available: ₩13,000,000`, `Default`
- CTA `Send ₩30,000`

### Backend

Validate recipient:

```json
GET /users/lookup?username=sarahkim
→ { "userId": "u2", "displayName": "Sarah Kim", "canReceiveGift": true }
```

Send gift:

```json
POST /wallet/gifts
{
  "recipientUserId": "u2",
  "sourceWallet": "domestic",
  "amount": 30000,
  "currency": "KRW",
  "message": "Enjoy a great meal!"
}
```

Response:

```json
{
  "giftId": "gift_1",
  "status": "sent",
  "senderWallet": { "balance": 12970000 },
  "recipientNotificationId": "n1"
}
```

Rules:

- Amount must be <= available source wallet balance.
- Bonus balance may or may not be giftable; default to not giftable unless product says otherwise.
- Domestic and foreign wallets cannot be mixed in a single gift.

---

## 6. Transaction History

**Screen:** `History.png`.

Rows include:

- `Top Up` -> `+$50.00`
- restaurant charges -> negative amounts, e.g. `Sakura Omakase -$42.50`
- `Reward Earned` -> `+$4.25`
- `Referral Bonus` -> `+$10.00`
- `Gift Received` -> `+$25.00`
- `Birthday Bonus` -> `+$25.00`

### Backend

```json
GET /users/me/wallet/transactions?cursor=...
→ {
  "items": [
    {
      "id": "tx_1",
      "type": "top_up",
      "title": "Top Up",
      "occurredAt": "2026-04-10",
      "amount": 50,
      "currency": "USD",
      "direction": "credit",
      "wallet": "foreign"
    }
  ],
  "nextCursor": null
}
```

Transaction types:

- `top_up`
- `restaurant_payment`
- `reward_earned`
- `referral_bonus`
- `gift_sent`
- `gift_received`
- `birthday_bonus`
- `refund`

---

## 7. Friends & Contacts

**Screen:** `Friend(send, pending approval, remove).png`.

Content:

- `Add a Friend` dashed card
- `8 contacts`
- contact rows with initials, display name, username or phone number
- delete icon per contact

Examples:

- `Sarah Kim @sarahkim`
- `David Park +1 (555) 567-8901`

### Behavior

- `Add a Friend` opens a search/invite modal.
- Adding by username creates a friend request.
- Adding by phone can create an invite if the phone is not registered.
- Pending requests should be shown in the same page or a modal.
- Delete removes an accepted contact.

### Backend

```json
GET /users/me/friends
→ [{ "id": "u2", "displayName": "Sarah Kim", "username": "sarahkim", "status": "accepted" }]
```

```json
POST /users/me/friends/requests
{ "usernameOrPhone": "sarahkim" }
```

```json
POST /users/me/friends/requests/{requestId}:accept
POST /users/me/friends/requests/{requestId}:reject
DELETE /users/me/friends/{friendUserId}
```

Friend list is used by:

- Dining reservation `Invite`
- Send Gift recipient autocomplete
- referral sharing

---

## 8. Reward Tier

**Screen:** `Tier, bonus pts load from DB.png`.

The tier thresholds must come from DB:

- `Silver`: `0+`
- `Gold`: `1,000+`
- `Platinum`: `5,000+`
- `Diamond`: `10,000+`

Current:

- `Gold`
- `2,340 pts`
- `2,660 pts to Platinum`

### Backend

```json
GET /rewards/tiers
→ [
  { "code": "silver", "name": "Silver", "threshold": 0, "benefits": [...] },
  { "code": "gold", "name": "Gold", "threshold": 1000, "benefits": [...] },
  { "code": "platinum", "name": "Platinum", "threshold": 5000, "benefits": [...] },
  { "code": "diamond", "name": "Diamond", "threshold": 10000, "benefits": [...] }
]
```

```json
GET /users/me/rewards
→ {
  "points": 2340,
  "tier": "gold",
  "nextTier": "platinum",
  "pointsToNextTier": 2660
}
```

Points are earned from completed/paid reservations and promotional events.

---

## 9. Appearance

Theme chips:

- `Airbnb`
- `Ocean`
- `Forest`
- `Midnight`

Behavior:

- Tap theme -> update local preview immediately.
- Persist preference to profile.

Backend:

```json
PATCH /users/me/preferences
{ "theme": "airbnb" }
```

---

## 10. CatchTable Pro

**Screen:** `Upgrade to Pro.png`.

Pro benefits:

- `Unlimited Reservations`
- `Priority Booking`
- `Exclusive Deals`
- `No Booking Fees`
- `Early Access`
- `Dining Concierge`

Plan options:

- Monthly `$9.99/month` -> `$9.99`
- Quarterly `$8.33/month`, `Save 17%` -> `$24.99`
- Yearly `$6.67/month`, `Save 33%`, `Best Value` -> `$79.99`

CTA:

- `Continue to Payment`

### Backend

```json
GET /subscriptions/plans?product=catchtable_pro
→ [
  { "code": "monthly", "price": 9.99, "billingPeriod": "month" },
  { "code": "quarterly", "price": 24.99, "billingPeriod": "quarter" },
  { "code": "yearly", "price": 79.99, "billingPeriod": "year" }
]
```

```json
POST /users/me/subscription
{
  "planCode": "yearly",
  "paymentMethodId": "pm_1"
}
```

Response:

```json
{
  "subscriptionId": "sub_1",
  "plan": "pro_yearly",
  "status": "active",
  "currentPeriodEnd": "2027-04-25"
}
```

Feature gates:

- remove booking fees during Reservation Flow Step 4
- priority booking sorting / early access sections in Discover
- concierge support entry in Contact Support

---

## 11. Contact Support

**Screen:** `Contact Support(chat available).png`.

Chat widget:

- header `CatchTable Helper`
- status `Online · replies in seconds`
- greeting `Hi there! I'm the CatchTable helper.`
- quick topics:
  - `How do I book a table?`
  - `How does QR Pay work?`
  - `Save to Heart list`
  - `I forgot my password`
  - `Cancel a booking`
  - `Talk to a human`
- bottom topic chips:
  - `Live agent`
  - `Booking`
  - `QR Pay`
- message composer

### Backend

```json
POST /support/conversations
{ "source": "profile", "topic": "booking" }
```

```json
GET /support/conversations/{conversationId}/messages
POST /support/conversations/{conversationId}/messages
```

Realtime channel:

```text
support.message.created
support.agent.assigned
support.conversation.closed
```

Quick topic taps either send a predefined message or call a help-article endpoint:

```json
GET /support/articles?topic=qr_pay
```

---

## 12. Settings / Help & Guide / App Version

The screenshots only show navigation rows, not child pages.

Suggested behavior:

- `Settings` -> account preferences, notification settings, privacy, sign out.
- `Help & Guide` -> step-by-step documentation.
- `App Version 2.4.1` -> static about card or release notes.

Suggested endpoints:

```json
GET /users/me/settings
PATCH /users/me/settings
GET /app/releases/latest
```

---

## 13. Wallet / Reward State Machine

```text
top_up_requested ─payment_success─▶ wallet_credit_posted
top_up_requested ─payment_failed──▶ failed

gift_created ─recipient_accepts──▶ transferred
gift_created ─expires────────────▶ refunded

reservation_paid ─visit_complete─▶ points_pending ─settlement─▶ points_posted
```

Use immutable transaction rows for every wallet movement. Never mutate historical balances without writing a compensating transaction.
