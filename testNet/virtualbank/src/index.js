import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';

const PORT = Number(process.env.PORT ?? 4105);
const WEBHOOK_URL = (process.env.PAYMENT_SERVICE_WEBHOOK_URL ?? 'http://127.0.0.1:4003/webhooks/virtualbank').replace(
  /\/$/,
  '',
);
const WEBHOOK_SECRET = process.env.TESTNET_WEBHOOK_SECRET ?? 'dev-testnet-webhook-secret';

/** Test-only “Apple Pay” style PAN — any amount succeeds when this card is used. */
const TEST_APPLE_PAY_PAN = '1234567890123456';

const app = express();
app.use(express.json({ limit: '512kb' }));

function normalizePan(pan) {
  return String(pan || '').replace(/\D/g, '');
}

function signBody(jsonStr) {
  const h = crypto.createHmac('sha256', WEBHOOK_SECRET).update(jsonStr).digest('hex');
  return `sha256=${h}`;
}

function oid() {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'testnet-virtualbank',
    at: new Date().toISOString(),
    testCardPan: '1234 5678 9012 3456',
  });
});

/**
 * Simulate wallet / Apple Pay authorization: POST with test PAN to get an immediate success
 * and a signed webhook to the payment service (which settles the wallet and asks the notification service to fan out).
 */
app.post('/v1/testnet/charges', async (req, res) => {
  const { intentId, customerUserId, amount, currency, pan } = req.body || {};
  const panNorm = normalizePan(pan);
  if (panNorm !== TEST_APPLE_PAY_PAN) {
    res.status(402).json({
      title: 'Payment declined',
      status: 402,
      detail: 'Use the TestNet card 1234 5678 9012 3456 (any amount). Other cards are declined in TestNet.',
      code: 'testnet_card_not_allowed',
    });
    return;
  }
  const amt = amount != null ? String(amount).trim() : '';
  if (!/^\d+$/.test(amt) || amt === '0') {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'amount must be a positive integer string' });
    return;
  }
  const cur = (currency || 'KRW').toString().toUpperCase();
  if (!['KRW', 'USD'].includes(cur)) {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'currency must be KRW or USD' });
    return;
  }
  const uid = customerUserId != null ? String(customerUserId).trim() : '';
  if (!uid) {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'customerUserId required' });
    return;
  }
  const iid = intentId != null ? String(intentId).trim() : '';
  if (!iid) {
    res.status(400).json({ title: 'Bad request', status: 400, detail: 'intentId required (create via restaurant POST /me/wallet/top-up/intent)' });
    return;
  }

  const chargeId = oid();
  const payload = {
    event: 'testnet.charge.succeeded',
    chargeId,
    intentId: iid,
    customerUserId: uid,
    amount: amt,
    currency: cur,
    method: 'apple_pay_simulated',
    ts: new Date().toISOString(),
  };
  const raw = JSON.stringify(payload);
  const sig = signBody(raw);

  let webhookStatus;
  try {
    const wh = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Testnet-Signature': sig,
      },
      body: raw,
    });
    webhookStatus = wh.status;
    if (!wh.ok) {
      const t = await wh.text();
      res.status(502).json({
        title: 'Webhook delivery failed',
        status: 502,
        detail: 'Virtual charge succeeded but downstream webhook returned an error',
        webhookStatus,
        webhookBody: t.slice(0, 2000),
      });
      return;
    }
  } catch (err) {
    res.status(502).json({
      title: 'Webhook unreachable',
      status: 502,
      detail: String(err?.message || err),
    });
    return;
  }

  res.status(201).json({
    status: 'succeeded',
    chargeId,
    intentId: iid,
    amount: amt,
    currency: cur,
    method: 'apple_pay_simulated',
    webhookDelivered: true,
    webhookStatus,
  });
});

app.use((_req, res) => {
  res.status(404).json({ title: 'Not found', status: 404 });
});

app.listen(PORT, () => {
  console.log(
    JSON.stringify({
      msg: 'testnet_virtualbank_listen',
      port: PORT,
      webhook: WEBHOOK_URL,
      testPan: '1234 5678 9012 3456',
    }),
  );
});
