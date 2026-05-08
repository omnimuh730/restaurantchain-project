const RID = '65f0000000000000000b0001';
const FLOOR_MAIN = '65f0000000000000000f0001';

function oid() {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function nowIso() {
  return new Date().toISOString();
}

export function createStore() {
  const drafts = new Map();
  const reservations = new Map();
  const idempotency = new Map();
  const inviteTokenIndex = new Map();
  const tableQrByTableId = new Map();

  const users = new Map();
  const notificationsByUser = new Map();
  const savedItemsByUser = new Map();
  const friendsByUser = new Map();
  const recentSearchesByUser = new Map();
  /** @type {Map<string, object>} */
  const topUpIntents = new Map();
  /** @type {Map<string, object>} idempotent TestNet charge results */
  const processedTestnetCharges = new Map();

  function seedUser() {
    const id = 'customer-demo-1';
    users.set(id, {
      id,
      username: 'demo',
      fullName: 'Demo Customer',
      phone: '+821000000001',
      avatarImg: null,
      status: 'active',
      wallets: {
        domestic: { currency: 'KRW', amount: '50000' },
        foreign: { currency: 'USD', amount: '0' },
        bonus: { currency: 'USD', amount: '0' },
      },
      rewards: { tier: 'silver', points: 120, nextTier: 'gold', pointsToNextTier: 380 },
      paymentMethods: [],
      savedItems: [],
      friends: [],
      referral: { code: 'DEMO-REF', redemptions: [], reward: { amount: '5000', currency: 'KRW' } },
      dailyBonus: { lastClaimedDate: null, history: [] },
      subscription: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  function seedReservation() {
    const id = '65f0000000000000000e0001';
    reservations.set(id, {
      id,
      restaurantId: RID,
      userId: 'customer-demo-1',
      confirmationCode: 'CT-2026-0425A',
      partySize: 2,
      date: '2026-05-10',
      time: '19:00',
      contact: { fullName: 'Demo Customer', phone: '+821000000001' },
      occasion: 'date_night',
      specialRequests: '',
      preferences: { seating: [], cuisine: [], vibe: [], amenities: [] },
      deposit: { amount: '60000', currency: 'KRW' },
      paymentId: '65f0000000000000000d0001',
      orderId: null,
      refundId: null,
      tableId: null,
      status: 'requested',
      invites: [],
      timeline: [{ at: nowIso(), type: 'requested', actor: { kind: 'customer', id: 'customer-demo-1' } }],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  function seedTableQr() {
    const tid = '65f0000000000000000t0001';
    tableQrByTableId.set(tid, {
      payload: 'demo-qr-payload',
      payloadHash: 'hash-demo',
      rotationVersion: 1,
      validFrom: new Date(Date.now() - 3600000).toISOString(),
      validUntil: new Date(Date.now() + 3600000).toISOString(),
    });
  }

  seedUser();
  seedReservation();
  seedTableQr();

  return {
    RID,
    FLOOR_MAIN,
    drafts,
    reservations,
    idempotency,
    inviteTokenIndex,
    tableQrByTableId,
    users,
    notificationsByUser,
    savedItemsByUser,
    friendsByUser,
    recentSearchesByUser,
    topUpIntents,
    processedTestnetCharges,
    oid,
    nowIso,
  };
}
