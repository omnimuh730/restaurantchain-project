import { customerAuth } from '../middleware.js';
import { persistUser } from '../persistence.js';

export function mountCustomerRoutes(app, ctx) {
  const { store, db } = ctx;

  app.get('/me', customerAuth, (req, res) => {
    const u = store.users.get(req.customerUserId);
    if (!u) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    res.json(u);
  });

  app.patch('/me', customerAuth, async (req, res) => {
    const u = store.users.get(req.customerUserId);
    if (!u) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const b = req.body || {};
    if (b.fullName !== undefined) u.fullName = b.fullName;
    if (b.phone !== undefined) u.phone = b.phone;
    if (b.avatarImg !== undefined) u.avatarImg = b.avatarImg;
    u.updatedAt = store.nowIso();
    await persistUser(db, u);
    res.json(u);
  });

  app.get('/me/payment-methods', customerAuth, (req, res) => {
    const u = store.users.get(req.customerUserId);
    const data = (u?.paymentMethods || []).filter((p) => p.deletedAt == null);
    res.json({ data });
  });

  app.post('/me/payment-methods', customerAuth, (req, res) => {
    const u = store.users.get(req.customerUserId);
    const id = store.oid();
    const row = {
      id,
      pspProvider: req.body?.pspProvider || 'stripe',
      pspExternalId: req.body?.pspExternalId || 'tok_demo',
      kind: req.body?.kind || 'card',
      isDefault: !!req.body?.isDefault,
      fundsForeign: req.body?.fundsForeign !== false,
      fundsDomestic: !!req.body?.fundsDomestic,
      addedAt: store.nowIso(),
    };
    u.paymentMethods = u.paymentMethods || [];
    u.paymentMethods.push(row);
    res.status(201).location(`/me/payment-methods/${id}`).json(row);
  });

  app.delete('/me/payment-methods/:methodId', customerAuth, async (req, res) => {
    const u = store.users.get(req.customerUserId);
    if (!u) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const row = (u.paymentMethods || []).find((p) => p.id === req.params.methodId);
    if (!row || row.deletedAt != null) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    row.deletedAt = store.nowIso();
    row.deletedBy = req.customerUserId;
    u.updatedAt = store.nowIso();
    await persistUser(db, u);
    res.status(204).send();
  });

  app.put('/me/password', customerAuth, (_req, res) => {
    res.status(501).json({ title: 'Not implemented', status: 501, detail: 'Wire password hash + sessions invalidation' });
  });

  app.get('/me/notifications', customerAuth, (req, res) => {
    const list = store.notificationsByUser.get(req.customerUserId) || [];
    const active = list.filter((n) => n.deletedAt == null);
    const tab = (req.query.tab || 'all').toString();
    const filtered =
      tab === 'unread'
        ? active.filter((n) => !n.read)
        : tab === 'reservation'
          ? active.filter((n) => String(n.type || '').startsWith('reservation.'))
          : tab === 'system'
            ? active.filter((n) => String(n.type || '').startsWith('system.'))
            : active;
    const unreadCount = active.filter((n) => !n.read).length;
    res.json({ data: filtered, nextCursor: null, unreadCount });
  });

  app.post('/me/notifications/mark-all-read', customerAuth, (_req, res) => {
    const list = store.notificationsByUser.get(req.customerUserId) || [];
    let affected = 0;
    for (const n of list) {
      if (n.deletedAt != null) continue;
      n.read = true;
      n.readAt = store.nowIso();
      affected += 1;
    }
    res.json({ affected, unreadCount: 0 });
  });

  app.post('/me/notifications/:notificationId/read', customerAuth, (req, res) => {
    const list = store.notificationsByUser.get(req.customerUserId) || [];
    const n = list.find((x) => x.id === req.params.notificationId && x.deletedAt == null);
    if (!n) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    n.read = true;
    n.readAt = store.nowIso();
    res.json(n);
  });

  app.delete('/me/notifications', customerAuth, (req, res) => {
    const list = store.notificationsByUser.get(req.customerUserId) || [];
    const at = store.nowIso();
    for (const n of list) {
      if (n.deletedAt == null) {
        n.deletedAt = at;
        n.deletedBy = req.customerUserId;
      }
    }
    res.status(204).send();
  });

  app.delete('/me/notifications/:notificationId', customerAuth, (req, res) => {
    const list = store.notificationsByUser.get(req.customerUserId) || [];
    const n = list.find((x) => x.id === req.params.notificationId);
    if (n && n.deletedAt == null) {
      n.deletedAt = store.nowIso();
      n.deletedBy = req.customerUserId;
    }
    res.status(204).send();
  });

  app.get('/me/saved-items', customerAuth, (req, res) => {
    const list = store.savedItemsByUser.get(req.customerUserId) || [];
    const data = list.filter((x) => x.deletedAt == null);
    res.json({ data, nextCursor: null });
  });

  app.post('/me/saved-items', customerAuth, (req, res) => {
    const id = store.oid();
    const row = {
      id,
      itemType: req.body?.itemType || 'restaurant',
      restaurantId: req.body?.restaurantId || store.RID,
      foodId: req.body?.foodId,
      savedAt: store.nowIso(),
    };
    const list = store.savedItemsByUser.get(req.customerUserId) || [];
    list.push(row);
    store.savedItemsByUser.set(req.customerUserId, list);
    res.status(201).json(row);
  });

  app.delete('/me/saved-items/:savedItemId', customerAuth, (req, res) => {
    const list = store.savedItemsByUser.get(req.customerUserId) || [];
    const row = list.find((x) => x.id === req.params.savedItemId);
    if (row && row.deletedAt == null) {
      row.deletedAt = store.nowIso();
      row.deletedBy = req.customerUserId;
    }
    res.status(204).send();
  });

  app.get('/me/friends', customerAuth, (_req, res) => {
    res.json({ data: [], nextCursor: null });
  });

  app.get('/me/daily-bonus', customerAuth, (_req, res) => {
    res.json({
      localDate: new Date().toISOString().slice(0, 10),
      alreadyClaimed: false,
      boxes: [
        { index: 0, hint: 'Small surprise' },
        { index: 1, hint: 'Medium surprise' },
        { index: 2, hint: 'Big surprise' },
      ],
      streakDays: 0,
      history: [],
    });
  });

  app.post('/me/daily-bonus:claim', customerAuth, (_req, res) => {
    res.status(501).json({ title: 'Not implemented', status: 501 });
  });

  app.get('/me/referral', customerAuth, (req, res) => {
    const u = store.users.get(req.customerUserId);
    const ref = u?.referral || { code: 'DEMO', redemptions: [] };
    res.json({
      code: ref.code,
      shareUrl: `/r/${ref.code}`,
      referredByCode: ref.referredByCode || null,
      redemptions: ref.redemptions,
      reward: ref.reward || { amount: '0', currency: 'KRW' },
    });
  });
}
