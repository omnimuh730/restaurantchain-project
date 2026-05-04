import { staffAuth, requireRestaurantScope, requirePermission } from '../middleware.js';

export function mountPaymentRoutes(app, ctx) {
  const { store } = ctx;

  app.get(
    '/pos/restaurants/:restaurantId/payments',
    staffAuth,
    requireRestaurantScope,
    requirePermission('payments.process'),
    (req, res) => {
      const rid = req.params.restaurantId;
      const data = [...store.payments.values()].filter((p) => p.restaurantId === rid);
      res.json({ data, page: 1, pageSize: data.length, total: data.length });
    },
  );

  app.get('/pos/payments/:paymentId', staffAuth, requirePermission('payments.process'), (req, res) => {
    const p = store.payments.get(req.params.paymentId);
    if (!p) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (req.staffRestaurantId && p.restaurantId !== req.staffRestaurantId) {
      res.status(403).json({ type: 'https://errors.catchtable.example/forbidden', title: 'Forbidden', status: 403 });
      return;
    }
    res.json(p);
  });

  app.post('/pos/payments/:paymentId/refunds', staffAuth, requirePermission('payments.refund'), (req, res) => {
    const p = store.payments.get(req.params.paymentId);
    if (!p) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    p.refunds = p.refunds || [];
    const rid = store.oid();
    p.refunds.push({
      id: rid,
      amount: req.body?.amount || p.amount,
      reason: req.body?.reason || 'other',
      status: 'pending',
      initiatedBy: { kind: 'staff', id: req.staffUserId },
      requestedAt: store.nowIso(),
      updatedAt: store.nowIso(),
    });
    res.status(201).json(p.refunds[p.refunds.length - 1]);
  });
}
