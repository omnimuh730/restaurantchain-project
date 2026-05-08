import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';

const PORT = Number(process.env.PORT ?? 4003);
const RESTAURANT_URL = (process.env.RESTAURANT_SERVICE_URL ?? 'http://127.0.0.1:4001').replace(/\/$/, '');
const NOTIFICATION_URL = (process.env.NOTIFICATION_SERVICE_URL ?? 'http://127.0.0.1:4004').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? 'dev-internal-key';
const WEBHOOK_SECRET = process.env.TESTNET_WEBHOOK_SECRET ?? 'dev-testnet-webhook-secret';

const app = express();

const events = [];
const MAX_LOG = 200;

function logEvent(entry) {
  events.push({ at: new Date().toISOString(), ...entry });
  if (events.length > MAX_LOG) events.splice(0, events.length - MAX_LOG);
}

function verifySignature(rawBody, sigHeader) {
  if (!sigHeader || typeof sigHeader !== 'string') return false;
  const m = sigHeader.match(/^sha256=(.+)$/i);
  if (!m) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
  const got = m[1].trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(got, 'hex'));
  } catch {
    return false;
  }
}

async function dispatchWalletTopUpNotification(reqId, customerUserId, amount, currency) {
  const url = `${NOTIFICATION_URL}/internal/dispatch`;
  const body = {
    channel: 'in_app',
    customerUserId,
    notification: {
      type: 'payment_succeeded',
      title: 'Wallet topped up (TestNet)',
      body: `${amount} ${currency} added via virtual bank (test).`,
      iconHint: 'success',
      deepLink: '/wallet',
    },
  };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_KEY,
        'X-Request-Id': reqId,
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      logEvent({ event: 'notification.dispatch_failed', customerUserId, status: r.status, detail: t.slice(0, 500) });
      return { ok: false, status: r.status };
    }
    return { ok: true, status: r.status };
  } catch (err) {
    logEvent({ event: 'notification.unreachable', customerUserId, detail: String(err?.message || err) });
    return { ok: false, detail: String(err?.message || err) };
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'payment', at: new Date().toISOString() });
});

app.get('/internal/events', (req, res) => {
  const k = req.get('x-internal-key');
  if (k !== INTERNAL_KEY) {
    res.status(401).json({ title: 'Unauthorized', status: 401 });
    return;
  }
  res.json({ data: [...events].reverse() });
});

app.post('/webhooks/virtualbank', express.raw({ type: 'application/json' }), async (req, res) => {
  const raw = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  const sig = req.get('x-testnet-signature') || '';
  if (!verifySignature(raw, sig)) {
    logEvent({ event: 'virtualbank.rejected', reason: 'bad_signature' });
    res.status(401).json({ title: 'Invalid signature', status: 401 });
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    res.status(400).json({ title: 'Invalid JSON', status: 400 });
    return;
  }
  if (payload.event !== 'testnet.charge.succeeded') {
    res.status(400).json({ title: 'Unknown event', status: 400 });
    return;
  }
  const { chargeId, customerUserId, amount, currency, intentId } = payload;
  const rid = req.get('x-request-id')?.trim() || crypto.randomUUID();
  const url = `${RESTAURANT_URL}/internal/wallet/testnet-top-up`;
  let upstream;
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_KEY,
        'X-Request-Id': rid,
      },
      body: JSON.stringify({ chargeId, customerUserId, amount, currency, intentId }),
    });
  } catch (err) {
    logEvent({ event: 'restaurant.unreachable', chargeId, detail: String(err?.message || err) });
    res.status(502).json({ title: 'Restaurant unreachable', status: 502 });
    return;
  }
  const text = await upstream.text();
  logEvent({
    event: 'wallet.settled',
    chargeId,
    restaurantStatus: upstream.status,
    requestId: rid,
  });

  if (upstream.status === 201) {
    const notif = await dispatchWalletTopUpNotification(rid, customerUserId, amount, currency);
    logEvent({ event: 'notification.dispatched', chargeId, ok: notif.ok });
  }

  res.status(upstream.status).type('application/json').send(text);
});

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      msg: 'payment_service_listen',
      port: PORT,
      restaurant: RESTAURANT_URL,
      notification: NOTIFICATION_URL,
    }),
  );
});
