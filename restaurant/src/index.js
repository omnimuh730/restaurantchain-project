import 'dotenv/config';
import express from 'express';
import { connectMongo, getDb } from './db/mongo.js';
import { loadReservationsIntoStore, loadUsersIntoStore } from './persistence.js';
import { createStore } from './store.js';
import { log } from './logger.js';
import { requestId, httpLog } from './middleware.js';
import { mountPublicRoutes } from './routes/public.js';
import { mountAuthRoutes } from './routes/auth.js';
import { mountCustomerRoutes } from './routes/customer.js';
import { mountReservationRoutes } from './routes/reservations.js';

const PORT = Number(process.env.PORT ?? 4001);
const internalKey = process.env.INTERNAL_SERVICE_KEY ?? 'dev-internal-key';

const store = createStore();
let db = null;
try {
  db = await connectMongo(process.env.MONGODB_URI);
  if (db) {
    const rc = await db.collection('reservations').countDocuments();
    if (rc > 0) await loadReservationsIntoStore(db, store);
    const uc = await db.collection('customer_users').countDocuments();
    if (uc > 0) await loadUsersIntoStore(db, store);
  }
} catch (e) {
  log('error', 'startup_db_failed', { detail: String(e?.message || e) });
  db = null;
}

const ctx = { store, db: getDb(), internalKey };

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(requestId);
app.use(httpLog);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'restaurant', mongo: !!getDb(), at: store.nowIso() });
});

mountPublicRoutes(app, ctx);
mountAuthRoutes(app, ctx);
mountCustomerRoutes(app, ctx);
mountReservationRoutes(app, ctx);

app.listen(PORT, () => {
  log('info', 'restaurant_listen', { port: PORT, mongo: !!getDb() });
});
