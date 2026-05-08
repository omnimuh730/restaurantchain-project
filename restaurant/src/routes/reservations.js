import crypto from 'crypto';
import express from 'express';
import { customerAuth } from '../middleware.js';
import { internalAuth } from '../middleware.js';
import { persistReservation } from '../persistence.js';

function idempotencyRead(store, key, bodyHash) {
  if (!key) return null;
  const row = store.idempotency.get(key);
  if (!row) return null;
  if (row.bodyHash !== bodyHash) return { conflict: true };
  return { replay: true, status: row.status, body: row.body };
}

function idempotencyWrite(store, key, bodyHash, status, body) {
  store.idempotency.set(key, { bodyHash, status, body, at: Date.now() });
}

function bodyHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj || {})).digest('hex');
}

export function mountReservationRoutes(app, ctx) {
  const { store, db } = ctx;

  app.get('/me/reservations', customerAuth, (req, res) => {
    const uid = req.customerUserId;
    const tab = (req.query.tab || 'upcoming').toString();
    const mine = [...store.reservations.values()].filter((r) => r.userId === uid);
    const upcomingStatuses = new Set(['requested', 'confirmed', 'arrived', 'dining', 'bill_requested', 'bill']);
    const data = mine.filter((r) => {
      if (tab === 'upcoming') return upcomingStatuses.has(r.status);
      if (tab === 'past') return ['visited', 'cancelled', 'no_show', 'declined'].includes(r.status);
      return true;
    });
    res.json({ data, nextCursor: null, unreadCount: 0 });
  });

  app.get('/me/active-draft', customerAuth, (req, res) => {
    res.json(store.drafts.get(req.customerUserId) ?? null);
  });

  app.put('/me/active-draft', customerAuth, (req, res) => {
    const uid = req.customerUserId;
    const body = req.body || {};
    if (body.restaurantId && body.restaurantId !== store.RID) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Restaurant not found', status: 404 });
      return;
    }
    const draft = {
      restaurantId: store.RID,
      step: body.step ?? 1,
      partySize: body.partySize ?? 2,
      date: body.date ?? '2026-05-10',
      time: body.time ?? '19:00',
      preferences: body.preferences ?? { seating: [], cuisine: [], vibe: [], amenities: [] },
      contact: body.contact ?? {},
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      updatedAt: store.nowIso(),
    };
    store.drafts.set(uid, draft);
    res.json(draft);
  });

  app.delete('/me/active-draft', customerAuth, (req, res) => {
    store.drafts.delete(req.customerUserId);
    res.status(204).send();
  });

  app.post('/reservations', customerAuth, async (req, res) => {
    const uid = req.customerUserId;
    const idemKey = req.get('idempotency-key');
    const bh = bodyHash(req.body);
    if (idemKey) {
      const hit = idempotencyRead(store, idemKey, bh);
      if (hit?.conflict) {
        res.status(409).json({
          type: 'https://errors.catchtable.example/conflict',
          title: 'Conflict',
          status: 409,
          code: 'idempotency_key_conflict',
        });
        return;
      }
      if (hit?.replay) {
        res.setHeader('Idempotency-Replay', 'true');
        return res.status(hit.status).json(hit.body);
      }
    }
    const { restaurantId, paymentId, orderId } = req.body || {};
    if (restaurantId !== store.RID) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (!paymentId) {
      res.status(422).json({
        type: 'https://errors.catchtable.example/validation_failed',
        title: 'Deposit required',
        status: 422,
        code: 'deposit_required',
      });
      return;
    }
    const id = store.oid();
    const d = store.drafts.get(uid);
    const reservation = {
      id,
      restaurantId: store.RID,
      userId: uid,
      confirmationCode: `CT-${new Date().getFullYear()}-${id.slice(0, 6).toUpperCase()}`,
      partySize: d?.partySize ?? 2,
      date: d?.date ?? '2026-05-10',
      time: d?.time ?? '19:00',
      contact: d?.contact?.fullName ? d.contact : { fullName: 'Guest', phone: '+821000000000' },
      occasion: 'casual',
      specialRequests: '',
      preferences: d?.preferences ?? { seating: [], cuisine: [], vibe: [], amenities: [] },
      deposit: { amount: '60000', currency: 'KRW' },
      paymentId,
      orderId: orderId ?? null,
      refundId: null,
      tableId: null,
      status: 'requested',
      invites: [],
      timeline: [{ at: store.nowIso(), type: 'requested', actor: { kind: 'customer', id: uid } }],
      createdAt: store.nowIso(),
      updatedAt: store.nowIso(),
    };
    store.reservations.set(id, reservation);
    store.drafts.delete(uid);
    await persistReservation(db, reservation);
    if (idemKey) idempotencyWrite(store, idemKey, bh, 201, structuredClone(reservation));
    res.status(201).location(`/reservations/${id}`).json(reservation);
  });

  app.get('/reservations/:reservationId', customerAuth, (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    res.json(r);
  });

  app.post('/reservations/:reservationId/cancel', customerAuth, async (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (r.status === 'cancelled') {
      res.status(409).json({
        type: 'https://errors.catchtable.example/conflict',
        title: 'Already cancelled',
        status: 409,
        code: 'reservation_already_cancelled',
      });
      return;
    }
    const cancellable = new Set(['requested', 'confirmed', 'arrived', 'dining', 'bill_requested', 'bill']);
    if (!cancellable.has(r.status)) {
      res.status(409).json({ type: 'https://errors.catchtable.example/conflict', title: 'Invalid transition', status: 409 });
      return;
    }
    r.status = 'cancelled';
    r.cancelledAt = store.nowIso();
    r.cancelReason = (req.body && req.body.reason) || 'user_cancelled';
    r.timeline.push({ at: store.nowIso(), type: 'cancelled_by_user', actor: { kind: 'customer', id: req.customerUserId } });
    r.updatedAt = store.nowIso();
    await persistReservation(db, r);
    res.json(r);
  });

  app.get('/reservations/:reservationId/invites', customerAuth, (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    res.json({ data: r.invites || [] });
  });

  app.post('/reservations/:reservationId/invites', customerAuth, (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const inviteeUserId = req.body?.inviteeUserId || store.oid();
    const invId = store.oid();
    const token = store.oid() + store.oid();
    const invite = {
      id: invId,
      inviteeUserId,
      status: 'pending',
      invitedAt: store.nowIso(),
      expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    };
    r.invites = r.invites || [];
    r.invites.push(invite);
    store.inviteTokenIndex.set(token, { reservationId: r.id, inviteId: invId });
    res.status(201).json({ ...invite, token });
  });

  app.delete('/reservations/:reservationId/invites/:inviteId', customerAuth, (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    r.invites = (r.invites || []).filter((i) => i.id !== req.params.inviteId);
    res.status(204).send();
  });

  app.post('/reservations/invites/:inviteToken/accept', customerAuth, (req, res) => {
    const meta = store.inviteTokenIndex.get(req.params.inviteToken);
    if (!meta) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const r = store.reservations.get(meta.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const inv = (r.invites || []).find((i) => i.id === meta.inviteId);
    if (!inv || inv.status !== 'pending') {
      res.status(409).json({
        type: 'https://errors.catchtable.example/conflict',
        title: 'Conflict',
        status: 409,
        code: 'invite_already_decided',
      });
      return;
    }
    inv.status = 'accepted';
    inv.decidedAt = store.nowIso();
    res.json({ invite: inv, reservation: r });
  });

  app.post('/reservations/invites/:inviteToken/decline', customerAuth, (req, res) => {
    const meta = store.inviteTokenIndex.get(req.params.inviteToken);
    if (!meta) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const r = store.reservations.get(meta.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const inv = (r.invites || []).find((i) => i.id === meta.inviteId);
    if (!inv) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    inv.status = 'declined';
    inv.decidedAt = store.nowIso();
    res.status(204).send();
  });

  app.post('/reservations/:reservationId/check-in-by-qr', customerAuth, (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const qr = req.body?.qrPayload || '';
    const tid = r.tableId || '65f0000000000000000t0001';
    const qrState = store.tableQrByTableId.get(tid);
    if (!qrState || (!qr.includes(qrState.payloadHash) && !qr.includes('demo-qr'))) {
      res.status(400).json({
        type: 'https://errors.catchtable.example/bad_request',
        title: 'Bad request',
        status: 400,
        code: 'qr_invalid',
      });
      return;
    }
    if (!['confirmed', 'arrived'].includes(r.status) && r.status !== 'requested') {
      res.status(409).json({ type: 'https://errors.catchtable.example/conflict', title: 'Invalid state', status: 409 });
      return;
    }
    r.status = 'arrived';
    r.tableId = tid;
    r.timeline.push({ at: store.nowIso(), type: 'checked_in', actor: { kind: 'customer', id: req.customerUserId } });
    r.updatedAt = store.nowIso();
    res.json(r);
  });

  app.post('/reservations/:reservationId/rate', customerAuth, (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r || r.userId !== req.customerUserId) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (r.status !== 'visited') {
      res.status(409).json({ type: 'https://errors.catchtable.example/conflict', title: 'Not visited', status: 409 });
      return;
    }
    const rating = req.body?.rating || {};
    r.rating = {
      overall: rating.overall,
      taste: rating.taste,
      ambience: rating.ambience,
      service: rating.service,
      valueOfPrice: rating.valueOfPrice,
    };
    r.ratingComment = req.body?.comment || null;
    r.pointsEarned = 50;
    res.json({ reservation: r, pointsAwarded: r.pointsEarned });
  });

  const internal = express.Router();
  internal.use(internalAuth(ctx.internalKey));

  internal.get('/restaurants/:restaurantId/reservations', (req, res) => {
    const data = [...store.reservations.values()].filter((x) => x.restaurantId === req.params.restaurantId);
    res.json({ data, page: 1, pageSize: 50, total: data.length });
  });

  internal.get('/reservations/:reservationId', (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    res.json(r);
  });

  internal.post('/reservations/:reservationId/approve', async (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (r.status !== 'requested') {
      res.status(409).json({ type: 'https://errors.catchtable.example/conflict', title: 'Invalid transition', status: 409 });
      return;
    }
    r.status = 'confirmed';
    if (req.body?.assignTableId) r.tableId = req.body.assignTableId;
    r.timeline.push({ at: store.nowIso(), type: 'approved', actor: { kind: 'staff', id: 'pos-staff' } });
    r.updatedAt = store.nowIso();
    await persistReservation(db, r);
    res.json(r);
  });

  internal.post('/reservations/:reservationId/decline', async (req, res) => {
    if (!req.body?.reason) {
      res.status(422).json({
        type: 'https://errors.catchtable.example/validation_failed',
        title: 'Validation failed',
        status: 422,
        code: 'validation_failed',
      });
      return;
    }
    const r = store.reservations.get(req.params.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    r.status = 'declined';
    r.timeline.push({ at: store.nowIso(), type: 'declined', actor: { kind: 'staff', id: 'pos-staff' }, note: req.body?.reason });
    r.updatedAt = store.nowIso();
    await persistReservation(db, r);
    res.json(r);
  });

  internal.post('/reservations/:reservationId/check-in', async (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    r.status = 'arrived';
    if (req.body?.tableId) r.tableId = req.body.tableId;
    r.timeline.push({ at: store.nowIso(), type: 'checked_in', actor: { kind: 'staff', id: 'pos-staff' } });
    r.updatedAt = store.nowIso();
    await persistReservation(db, r);
    res.json(r);
  });

  internal.post('/reservations/:reservationId/no-show', async (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    r.status = 'no_show';
    r.timeline.push({ at: store.nowIso(), type: 'no_show', actor: { kind: 'staff', id: 'pos-staff' } });
    r.updatedAt = store.nowIso();
    await persistReservation(db, r);
    res.json(r);
  });

  internal.post('/reservations/:reservationId/cancel', async (req, res) => {
    const r = store.reservations.get(req.params.reservationId);
    if (!r) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    r.status = 'cancelled';
    r.cancelledAt = store.nowIso();
    r.cancelReason = req.body?.reason || 'restaurant_cancelled';
    r.timeline.push({ at: store.nowIso(), type: 'cancelled_by_restaurant', actor: { kind: 'staff', id: 'pos-staff' } });
    r.updatedAt = store.nowIso();
    await persistReservation(db, r);
    res.json(r);
  });

  app.use('/internal', internal);
}
