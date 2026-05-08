import 'dotenv/config';
import express from 'express';

const PORT = Number(process.env.PORT ?? 4004);
const RESTAURANT_URL = (process.env.RESTAURANT_SERVICE_URL ?? 'http://127.0.0.1:4001').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? 'dev-internal-key';

const app = express();
app.use(express.json({ limit: '512kb' }));

const deliveries = [];
const MAX_LOG = 200;

function logDelivery(entry) {
  deliveries.push({ at: new Date().toISOString(), ...entry });
  if (deliveries.length > MAX_LOG) deliveries.splice(0, deliveries.length - MAX_LOG);
}

function internalGate(req, res, next) {
  const k = req.get('x-internal-key');
  if (k !== INTERNAL_KEY) {
    res.status(401).json({ title: 'Unauthorized', status: 401 });
    return;
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'notification', at: new Date().toISOString() });
});

app.get('/internal/deliveries', internalGate, (_req, res) => {
  res.json({ data: [...deliveries].reverse() });
});

/**
 * Service-to-service: payment (or others) asks us to deliver a customer in-app notification.
 * We persist it via the restaurant internal API (source of truth for the bell feed).
 */
app.post('/internal/dispatch', internalGate, async (req, res) => {
  const { channel, customerUserId, notification } = req.body || {};
  if (channel !== 'in_app') {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'channel must be in_app' });
    return;
  }
  const uid = customerUserId != null ? String(customerUserId).trim() : '';
  if (!uid) {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'customerUserId required' });
    return;
  }
  if (!notification || typeof notification !== 'object') {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'notification object required' });
    return;
  }

  const rid = req.get('x-request-id')?.trim() || crypto.randomUUID();
  const url = `${RESTAURANT_URL}/internal/customers/${encodeURIComponent(uid)}/in-app-notifications`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_KEY,
        'X-Request-Id': rid,
      },
      body: JSON.stringify({ notification }),
    });
  } catch (err) {
    logDelivery({ event: 'restaurant.unreachable', customerUserId: uid, detail: String(err?.message || err) });
    res.status(502).json({ title: 'Restaurant unreachable', status: 502 });
    return;
  }

  const text = await upstream.text();
  logDelivery({
    event: 'in_app.delivered',
    customerUserId: uid,
    restaurantStatus: upstream.status,
    requestId: rid,
  });

  res.status(upstream.status).type('application/json').send(text);
});

app.listen(PORT, () => {
  console.log(JSON.stringify({ msg: 'notification_service_listen', port: PORT, restaurant: RESTAURANT_URL }));
});
