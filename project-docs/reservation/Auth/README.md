# Reservation App · Auth

Customer-facing authentication for the CatchTable reservation app. This module covers sign in, account creation, password recovery, daily login bonus, and the "sign in required" modal shown when anonymous users try to access authenticated actions.

Screens used for this analysis:

- `SignIn.png`
- `Daily First login for getting bonus.png`
- `If currently logged, ask signin in several pages.png`
- `Forget Password/Step 1 - Find Username.png`
- `Forget Password/Step 2 - Answer question.png`
- `Forget Password/Step 3 - Set new password.png`
- `Forget Password/Step 4 - Get update of confirmation.png`
- `Sign Up/Step 1 - referrel code(optional).png`
- `Sign Up/Step 2 - user info.png`
- `Sign Up/Step 3 - user info(Full Name).png`
- `Sign Up/Step 4 - Security Question.png`
- `Sign Up/Step 4 - Security Question(select question which is fetched from db - this is static data).png`
- `Sign Up/Step 5- Register Success, login.png`

---

## 1. Sign In

**Screen:** `SignIn.png`.

Fields:

- `Username`
- `Password`
- password visibility toggle
- `Forgot password?`
- primary `Sign In`
- secondary `Sign Up`

The screen includes demo credentials:

- `catchtable / Pass1234`
- `admin` to test deactivated or invalid-login behavior

### Flow

1. User enters username and password.
2. Taps **Sign In**.
3. Server verifies the credentials and account status.
4. On success, app stores access/refresh tokens and routes to Discover or the originally requested protected action.
5. If this is the first login of the day, the app opens the Daily Bonus modal.

### Backend contract

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Sign in | `POST` | `/auth/sign-in` | `{ username, password, device: { platform, appVersion } }` | `{ accessToken, refreshToken, user: { id, username, fullName, email?, phone?, tier, rewardPoints, dailyBonusAvailable } }` |
| Refresh token | `POST` | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| Sign out | `POST` | `/auth/sign-out` | `{}` | `204` |

### Edge cases

- Invalid username/password -> inline error below password.
- Deactivated user -> block sign-in and show a status-specific message.
- Network failure -> keep form values and offer retry.

---

## 2. Daily First Login Bonus

**Screen:** `Daily First login for getting bonus.png`.

Modal:

- label `DAILY BONUS`
- title `Pick a gift!`
- helper text `Tap one of the boxes below to reveal today's reward`
- three gift boxes
- disabled-looking button `Select a box`
- close `x`

### Behavior

1. After successful sign-in, if `dailyBonusAvailable = true`, the app opens the modal over Discover.
2. User taps one of three boxes.
3. Client sends only the chosen index; server determines the reward to prevent client-side tampering.
4. Reward is applied to the user's wallet or reward points.
5. Modal closes or changes to a reward-result state.

### Backend contract

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Check daily bonus | `GET` | `/users/me/daily-bonus` | — | `{ available, claimedAt?, optionsCount: 3 }` |
| Claim daily bonus | `POST` | `/users/me/daily-bonus:claim` | `{ selectedBox: 0 | 1 | 2 }` | `{ reward: { type: "points"|"domestic_bonus"|"coupon", amount, currency? }, wallet, rewardPoints }` |

The endpoint must be idempotent per local day. A second claim attempt returns the already claimed reward or a `409 already_claimed`.

---

## 3. Sign-In Required Modal

**Screen:** `If currently logged, ask signin in several pages.png`.

Shown when an anonymous user tries to:

- manage or view reservations
- save a restaurant
- open Profile wallet/history/friends
- start a booking that requires payment
- invite friends or send gifts

### Behavior

- `Sign in` opens the Sign In screen and stores a `returnTo` route.
- `Not now` closes the modal and leaves the user where they were.
- Close `x` is equivalent to `Not now`.

No backend call is needed. This is a client-side guard based on missing auth tokens.

---

## 4. Sign Up

Five-step wizard with progress labels:

1. `Refer`
2. `Account`
3. `Profile`
4. `Security`
5. `Done`

### Step 1 - Referral Code

**Screen:** `Sign Up/Step 1 - referrel code(optional).png`.

Inputs:

- `Enter referral code (optional)`
- `Scan QR code`
- `Continue`
- `Skip for now`
- `Sign In`

#### Behavior

- Referral is optional.
- Typing a code or scanning a QR validates the referral before continuing.
- `Skip for now` advances with no referral.

#### Backend

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Validate referral | `GET` | `/referrals/{code}` | — | `{ valid, referrerName?, rewardPreview: { userReward, referrerReward } }` |

### Step 2 - Credentials

**Screen:** `Sign Up/Step 2 - user info.png`.

Fields:

- `Username`
- `Password (min 6, 1 uppercase, 1 number)`
- `Confirm password`

#### Backend

| Action | Method | Endpoint | Request | Response |
|---|---|---|---|---|
| Check username | `GET` | `/auth/username-available?username=...` | — | `{ available }` |

The account is not created yet; data is held in wizard state.

### Step 3 - Profile

**Screen:** `Sign Up/Step 3 - user info(Full Name).png`.

Field:

- `Display name`

The display name is used across reviews, booking contact defaults, friend lists, and receipts.

### Step 4 - Password Recovery

**Screens:** `Sign Up/Step 4 - Security Question.png`, plus the variant named `select question which is fetched from db`.

The user sets three security questions and answers:

- `Question 1` - e.g. `What is your pet's name?`
- `Question 2` - e.g. `What city were you born in?`
- `Question 3` - e.g. `What is your favorite food?`

The file name notes the question list is fetched from DB as static data.

#### Backend

| Action | Method | Endpoint | Response |
|---|---|---|---|
| Load security questions | `GET` | `/auth/security-questions` | `[{ id, question }]` |

### Step 5 - Create account success

**Screen:** `Sign Up/Step 5- Register Success, login.png`.

CTA `Get Started` routes to Discover. The success text says `Welcome, abcd!`, showing the username/display name is echoed from the completed registration.

Final registration request:

```json
POST /auth/sign-up
{
  "referralCode": "OPTIONAL",
  "username": "abcd",
  "password": "Pass1234",
  "displayName": "Alex Chen",
  "securityAnswers": [
    { "questionId": "q1", "answer": "..." },
    { "questionId": "q2", "answer": "..." },
    { "questionId": "q3", "answer": "..." }
  ]
}
```

Response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "u1",
    "username": "abcd",
    "fullName": "Alex Chen",
    "tier": "free",
    "rewardPoints": 0
  }
}
```

Registration should auto-login the user unless the product requires email/phone verification later.

---

## 5. Forgot Password

Four-step recovery wizard:

1. Find account
2. Answer security question
3. Set new password
4. Confirmation

### Step 1 - Find Username

**Screen:** `Forget Password/Step 1 - Find Username.png`.

Field:

- `Username`

CTA:

- `Find Account`

Test accounts shown:

- `catchtable` answers: `fluffy`, `seoul`, `pizza`
- `foodie99` answers: `pizza`, `buddy`, `foodster`

Backend:

```json
POST /auth/password-reset:start
{ "username": "catchtable" }
```

Response:

```json
{
  "resetSessionId": "prs_...",
  "question": {
    "id": "q2",
    "question": "What city were you born in?"
  }
}
```

### Step 2 - Security Question

**Screen:** `Forget Password/Step 2 - Answer question.png`.

The question is rendered read-only. User types answer and taps `Verify`.

```json
POST /auth/password-reset:verify-answer
{
  "resetSessionId": "prs_...",
  "answer": "seoul"
}
```

Response:

```json
{ "resetToken": "prt_..." }
```

Security rules:

- Compare normalized answers server-side.
- Rate-limit attempts per username and IP/device.
- Do not reveal whether the answer was close.

### Step 3 - Set New Password

**Screen:** `Forget Password/Step 3 - Set new password.png`.

Fields:

- `New password`
- `Confirm new password`

```json
POST /auth/password-reset:complete
{
  "resetToken": "prt_...",
  "newPassword": "Pass1234"
}
```

### Step 4 - Confirmation

**Screen:** `Forget Password/Step 4 - Get update of confirmation.png`.

Shows `Password Reset!` and a `Back to Sign In` CTA.

No backend call.

---

## 6. Auth State

```text
anonymous
  ├─ sign in success ───────────────▶ authenticated
  ├─ sign up success ───────────────▶ authenticated
  └─ protected action ──────────────▶ sign_in_required_modal

authenticated
  ├─ first login today ─────────────▶ daily_bonus_modal
  ├─ token expired + refresh ok ────▶ authenticated
  ├─ token expired + refresh failed ▶ anonymous
  └─ sign out ─────────────────────▶ anonymous
```

---

## 7. Permissions / Privacy

- Password recovery answers must be hashed or encrypted at rest; never store raw answers in plain text.
- Referral and daily bonus rewards should be granted by server-side business rules.
- Anonymous browsing is allowed for Discover and Explorer, but any personalized action should use the sign-in-required modal.
