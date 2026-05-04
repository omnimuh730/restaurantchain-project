import 'dotenv/config';
import express from 'express';
import { createPosStore } from './store.js';
import { log } from './logger.js';
import { requestId, httpLog } from './middleware.js';
import { mountReservationPosRoutes } from './routes/reservations.js';
import { mountTableRoutes } from './routes/tables.js';
import { mountOrderRoutes } from './routes/orders.js';
import { mountKitchenRoutes } from './routes/kitchen.js';
import { mountPaymentRoutes } from './routes/payments.js';
import { mountExtraPosRoutes } from './routes/extras.js';

const PORT = Number(process.env.PORT ?? 4002);
const RESTAURANT_BASE = (process.env.RESTAURANT_SERVICE_URL ?? 'http://127.0.0.1:4001').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? 'dev-internal-key';

const store = createPosStore();
const ctx = { store, base: RESTAURANT_BASE, internalKey: INTERNAL_KEY };

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(requestId);
app.use(httpLog);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pos', at: store.nowIso() });
});

mountReservationPosRoutes(app, ctx);
mountTableRoutes(app, ctx);
mountOrderRoutes(app, ctx);
mountKitchenRoutes(app, ctx);
mountPaymentRoutes(app, ctx);
mountExtraPosRoutes(app, ctx);

app.use((_req, res) => {
  res.status(404).json({ title: 'Not found', status: 404 });
});

app.listen(PORT, () => {
  log('info', 'pos_listen', { port: PORT });
});
