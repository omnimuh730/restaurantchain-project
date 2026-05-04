import { log } from './logger.js';

export async function persistReservation(db, doc) {
  if (!db) return;
  try {
    await db.collection('reservations').replaceOne({ id: doc.id }, doc, { upsert: true });
  } catch (e) {
    log('error', 'mongo_persist_reservation_failed', { id: doc.id, detail: String(e?.message || e) });
  }
}

export async function persistUser(db, doc) {
  if (!db) return;
  try {
    await db.collection('customer_users').replaceOne({ id: doc.id }, doc, { upsert: true });
  } catch (e) {
    log('error', 'mongo_persist_user_failed', { id: doc.id, detail: String(e?.message || e) });
  }
}

export async function loadReservationsIntoStore(db, store) {
  if (!db) return;
  const cur = db.collection('reservations').find({});
  const list = await cur.toArray();
  for (const r of list) {
    store.reservations.set(r.id, r);
  }
  log('info', 'mongo_loaded_reservations', { count: list.length });
}

export async function loadUsersIntoStore(db, store) {
  if (!db) return;
  const list = await db.collection('customer_users').find({}).toArray();
  for (const u of list) {
    store.users.set(u.id, u);
  }
  log('info', 'mongo_loaded_users', { count: list.length });
}
