import express from 'express';
import { customerAuth, internalAuth } from '../middleware.js';
import { persistUser } from '../persistence.js';

const TESTNET_VIRTUALBANK_URL = process.env.TESTNET_VIRTUALBANK_URL ?? 'http://127.0.0.1:4105';

function parsePositiveIntegerAmount(v) {
  const s = v == null ? '' : String(v).trim();
  if (!/^\d+$/.test(s)) return null;
  return s;
}

function creditWallet(u, currency, amountStr) {
  const c = (currency || 'KRW').toString().toUpperCase();
  if (c === 'USD') {
    const w = u.wallets.foreign;
    const cur = BigInt(w.amount || '0');
    w.amount = (cur + BigInt(amountStr)).toString();
    w.currency = 'USD';
  } else {
    const w = u.wallets.domestic;
    const cur = BigInt(w.amount || '0');
    w.amount = (cur + BigInt(amountStr)).toString();
    w.currency = 'KRW';
  }
}

export function mountWalletTestnetCustomerRoutes(app, ctx) {
  const { store } = ctx;

  app.post('/me/wallet/top-up/intent', customerAuth, (req, res) => {
    const amount = parsePositiveIntegerAmount(req.body?.amount);
    const currency = (req.body?.currency || 'KRW').toString().toUpperCase();
    if (!amount || amount === '0') {
      res.status(400).json({
        title: 'Bad request',
        status: 400,
        detail: 'amount must be a positive integer (minor units, e.g. KRW won)',
      });
      return;
    }
    if (!['KRW', 'USD'].includes(currency)) {
      res.status(400).json({ title: 'Bad request', status: 400, detail: 'currency must be KRW or USD' });
      return;
    }
    const intentId = store.oid();
    store.topUpIntents.set(intentId, {
      intentId,
      userId: req.customerUserId,
      amount,
      currency,
      status: 'pending',
      createdAt: store.nowIso(),
    });
    res.status(201).json({
      intentId,
      amount,
      currency,
      testnet: {
        virtualBankBaseUrl: TESTNET_VIRTUALBANK_URL,
        chargePath: '/v1/testnet/charges',
        testCardPan: '1234 5678 9012 3456',
        hint:
          'POST JSON to virtualBankBaseUrl + chargePath with intentId, customerUserId, amount, currency, pan — simulates Apple Pay / wallet tap; only the test PAN succeeds.',
      },
    });
  });
}

export function mountWalletTestnetInternalRoutes(app, ctx) {
  const { store, db } = ctx;
  const r = express.Router();
  r.use(internalAuth(ctx.internalKey));

  r.post('/wallet/testnet-top-up', async (req, res) => {
    const { chargeId, customerUserId, amount, currency, intentId } = req.body || {};
    const cid = chargeId && String(chargeId).trim();
    if (!cid) {
      res.status(400).json({ title: 'Bad request', status: 400, detail: 'chargeId required' });
      return;
    }
    if (store.processedTestnetCharges.has(cid)) {
      res.json(store.processedTestnetCharges.get(cid));
      return;
    }
    const amt = parsePositiveIntegerAmount(amount);
    const cur = (currency || 'KRW').toString().toUpperCase();
    if (!amt || !['KRW', 'USD'].includes(cur)) {
      res.status(400).json({ title: 'Bad request', status: 400, detail: 'amount and currency invalid' });
      return;
    }
    const uid = customerUserId && String(customerUserId).trim();
    if (!uid) {
      res.status(400).json({ title: 'Bad request', status: 400, detail: 'customerUserId required' });
      return;
    }
    const iid = intentId && String(intentId).trim();
    if (iid) {
      const intent = store.topUpIntents.get(iid);
      if (!intent) {
        res.status(404).json({
          type: 'https://errors.catchtable.example/not_found',
          title: 'Intent not found',
          status: 404,
        });
        return;
      }
      if (intent.userId !== uid) {
        res.status(403).json({ title: 'Forbidden', status: 403 });
        return;
      }
      if (String(intent.amount) !== amt || intent.currency !== cur) {
        res.status(400).json({
          title: 'Bad request',
          status: 400,
          detail: 'amount/currency does not match intent',
        });
        return;
      }
      if (intent.status !== 'pending') {
        res.status(409).json({ title: 'Conflict', status: 409, detail: 'intent is not pending' });
        return;
      }
    }

    const u = store.users.get(uid);
    if (!u) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'User not found', status: 404 });
      return;
    }

    creditWallet(u, cur, amt);
    u.updatedAt = store.nowIso();
    if (iid) {
      const intent = store.topUpIntents.get(iid);
      if (intent) {
        intent.status = 'completed';
        intent.completedAt = store.nowIso();
        intent.chargeId = cid;
      }
    }

    await persistUser(db, u);

    const body = {
      ok: true,
      chargeId: cid,
      customerUserId: uid,
      amount: amt,
      currency: cur,
      wallets: u.wallets,
    };
    store.processedTestnetCharges.set(cid, body);
    res.status(201).json(body);
  });

  app.use('/internal', r);
}
