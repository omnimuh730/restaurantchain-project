# Schema · Rewards & Points Ledger

Same **cache + ledger** pattern as wallets:

- **Cached state** lives on the customer (`customer_users.rewards.{tier, points, ...}`) for fast Profile reads.
- **Source of truth** is the immutable `points_ledger` collection. The cached `points` is `SUM(direction × points)`; the cached `tier` is the highest `metadata.reward_tiers.items[].threshold` ≤ `points`.

Daily-bonus claims are embedded on the user (`customer_users.dailyBonus.history[]`). Referral codes and redemptions are embedded on the user (`customer_users.referral`).

Source READMEs:

- `reservation/Profile/README.md` (Reward Tier card)
- `reservation/Auth/README.md` (Daily Bonus, Refer a Friend)

## Collection

| Collection | Purpose |
|---|---|
| `points_ledger` | Append-only points credits/debits. Source of truth for `customer_users.rewards.points`. |

The reward-tier catalog (silver/gold/platinum/diamond and their thresholds + benefits) lives in [`metadata`](./metadata.md) under `_id: "reward_tiers"`.

---

## Embedded reward shape (recap)

For reference; canonical definition lives in [`users.md`](./users.md).

```ts
customer_users.rewards = {
  tier: "silver" | "gold" | "platinum" | "diamond";
  points: number;
  nextTier?: "gold" | "platinum" | "diamond" | null;
  pointsToNextTier?: number;
};

customer_users.dailyBonus = {
  lastClaimedDate?: string;             // YYYY-MM-DD in user's local tz
  history: Array<{                      // last 30 entries inline
    localDate: string;
    selectedBox: 0 | 1 | 2;
    reward:
      | { kind: "points"; points: number }
      | { kind: "bonus_credit"; amount: { amount: Decimal128; currency: string } }
      | { kind: "coupon"; couponCode: string };
    pointsLedgerId?: ObjectId;
    walletTransactionId?: ObjectId;
    claimedAt: Date;
  }>;
};

customer_users.referral = {
  code: string;                         // user's own referral code
  referredByCode?: string;              // referral code consumed at sign-up
  redemptions: Array<{                  // people who used this user's code
    refereeUserId: ObjectId;
    redeemedAt: Date;
    reward: { kind: "points" | "wallet"; amount: number; currency?: string };
  }>;
};
```

---

## `points_ledger`

Immutable. Every credit and debit is a new row. Compensating rows undo prior credits (e.g. fraud reversal).

```ts
type PointsLedgerEntry = {
  _id: ObjectId;
  userId: ObjectId;

  type:
    | "reservation_completed"   // earned from a paid visit
    | "review_bonus"
    | "birthday_bonus"
    | "referral_bonus"
    | "daily_bonus"
    | "manual_adjustment"
    | "expiration"              // points expiring (debit)
    | "redemption";             // (future) using points for rewards

  direction: "credit" | "debit";
  points: number;
  balanceAfter: number;

  reservationId?: ObjectId;
  giftId?: ObjectId;
  walletTransactionId?: ObjectId;   // when a single event credits both points and wallet
  notes?: string;

  createdBy?: { kind: "system" | "staff"; id?: ObjectId };
  occurredAt: Date;
  createdAt: Date;
};
```

### Indexes

- `{ userId: 1, occurredAt: -1 }`
- `{ reservationId: 1 }`
- `{ type: 1, occurredAt: -1 }`
- `{ userId: 1, type: 1, occurredAt: -1 }`

---

## Cross-document rules

- **Reservation visit credit**: when a reservation reaches `visited`, the system inserts one `points_ledger` row of `type: "reservation_completed"`, updates `customer_users.rewards.{points, tier, nextTier, pointsToNextTier}`, and mirrors the credited `points` back onto `reservations.pointsEarned`.
- **Daily bonus**:
  - The claim endpoint is idempotent per `(userId, localDate)` enforced by a unique partial index on `customer_users.dailyBonus.history.localDate` — repeated claims read the existing row.
  - If the chosen box rewards points, insert a `points_ledger` row of `type: "daily_bonus"` and store its `_id` in `dailyBonus.history[].pointsLedgerId`.
  - If the box rewards wallet credit, insert a `wallet_transactions` row instead and store its `_id` in `dailyBonus.history[].walletTransactionId`.
- **Referral**:
  - At sign-up, the referee writes `referral.referredByCode` and an entry is appended to the referrer's `referral.redemptions[]`.
  - Each side is rewarded with either points (a `points_ledger` row) or wallet credit (a `wallet_transactions` row) as configured in `metadata.reward_tiers` / referral config.
  - Reverting a referral inserts a compensating `points_ledger` row of `type: "manual_adjustment"` plus a wallet adjustment if applicable; nothing is deleted.
- **Tier promotion** is computed on every `points_ledger` write: pick the highest tier whose `threshold` ≤ new `points`. The cached `tier`, `nextTier`, `pointsToNextTier` on the user are updated in the same write.
- **Expiration** policy (if enabled) inserts `direction: "debit"` rows of `type: "expiration"` against points older than the configured age.

## Realtime channels

- `points.ledger.created` (per row)
- `user.rewards.updated` (after cache recomputation; tier promotion broadcasts here)
