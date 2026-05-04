/**
 * Integration smoke: restaurant + POS (defaults 4001 / 4002).
 * Uses staff JWT when `POST /auth/staff/sign-in` exists; otherwise legacy POS headers.
 *
 * Run: node scripts/smoke.mjs
 * Optional: BFF_URL=http://127.0.0.1:4000 to assert BFF health (if that port is your BFF).
 */

const REST = process.env.REST_URL || 'http://127.0.0.1:4001';
const POS = process.env.POS_URL || 'http://127.0.0.1:4002';
const BFF = process.env.BFF_URL;
const RID = '65f0000000000000000b0001';
const FLOOR = '65f0000000000000000f0001';
const RES = '65f0000000000000000e0001';

async function json(url, opts = {}) {
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const raw = await r.text();
  if (!ct.includes('application/json')) {
    throw new Error(`Non-JSON ${r.status} from ${url}: ${raw.slice(0, 120)}`);
  }
  return JSON.parse(raw);
}

async function main() {
  const rh = await json(`${REST}/health`);
  if (!rh.ok) throw new Error(`restaurant health ${JSON.stringify(rh)}`);

  const disc = await json(`${REST}/discover?lat=37.5&lng=127.0`);
  if (!disc.sections?.length) throw new Error(`discover ${JSON.stringify(disc)}`);

  let staffHeaders = {
    'X-Staff-User-Id': 'staff-1',
    'X-Restaurant-Id': RID,
  };
  try {
    const signIn = await json(`${REST}/auth/staff/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'staff', password: 'demo' }),
    });
    const token = signIn.tokens?.accessToken;
    if (token) {
      staffHeaders = { Authorization: `Bearer ${token}`, 'X-Restaurant-Id': RID };
    }
  } catch {
    /* older restaurant build without auth routes — legacy headers only */
  }

  const ph = await json(`${POS}/health`);
  if (!ph.ok) throw new Error(`pos health ${JSON.stringify(ph)}`);

  const resv = await json(`${POS}/pos/reservations/${RES}`, { headers: staffHeaders });
  if (!resv.id) throw new Error(`pos get reservation ${JSON.stringify(resv)}`);

  let tables;
  try {
    tables = await json(`${POS}/pos/restaurants/${RID}/floors/${FLOOR}/tables`, { headers: staffHeaders });
  } catch {
    tables = await json(`${POS}/pos/restaurants/${RID}/tables`, { headers: staffHeaders });
  }
  if (!Array.isArray(tables.data)) throw new Error(`tables ${JSON.stringify(tables)}`);

  const orders = await json(`${POS}/pos/restaurants/${RID}/orders`, { headers: staffHeaders });
  if (!Array.isArray(orders.data)) throw new Error(`orders ${JSON.stringify(orders)}`);

  if (BFF) {
    const bh = await json(`${BFF.replace(/\/$/, '')}/health`);
    if (!bh.ok) throw new Error(`bff health ${JSON.stringify(bh)}`);
    console.log('OK restaurant + POS + BFF');
  } else {
    console.log('OK restaurant + POS');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
