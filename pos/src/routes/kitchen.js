import { staffAuth, requireRestaurantScope, requirePermission } from '../middleware.js';

function isItemRemoved(it) {
  return it.deletedAt != null;
}

export function mountKitchenRoutes(app, ctx) {
  const { store } = ctx;

  app.get(
    '/pos/restaurants/:restaurantId/kitchen/batches',
    staffAuth,
    requireRestaurantScope,
    requirePermission('kitchen.act'),
    (req, res) => {
      const rid = req.params.restaurantId;
      const data = [];
      for (const o of store.orders.values()) {
        if (o.restaurantId !== rid) continue;
        const byBatch = new Map();
        for (const it of o.items || []) {
          if (isItemRemoved(it)) continue;
          if (!it.sendBatchId || !['sent', 'in_progress', 'ready'].includes(it.chefStatus)) continue;
          if (!byBatch.has(it.sendBatchId)) {
            byBatch.set(it.sendBatchId, {
              orderId: o.id,
              batchId: it.sendBatchId,
              restaurantId: rid,
              floorId: o.floorId,
              tableId: o.tableId,
              tableName: o.tableId,
              sentAt: it.sentAt,
              status: 'sent',
              items: [],
            });
          }
          byBatch.get(it.sendBatchId).items.push(it);
        }
        for (const b of byBatch.values()) {
          const st = b.items.every((x) => x.chefStatus === 'ready')
            ? 'ready'
            : b.items.some((x) => x.chefStatus === 'in_progress')
              ? 'in_progress'
              : 'sent';
          b.status = b.items.some((x) => x.chefStatus === 'ready') && st !== 'ready' ? 'mixed' : st;
          data.push(b);
        }
      }
      res.json({ data, page: 1, pageSize: data.length, total: data.length });
    },
  );

  app.post(
    '/pos/orders/:orderId/batches/:batchId/accept',
    staffAuth,
    requirePermission('kitchen.act'),
    (req, res) => {
      const o = store.orders.get(req.params.orderId);
      if (!o) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      if (req.staffRestaurantId && o.restaurantId !== req.staffRestaurantId) {
        res.status(403).json({ type: 'https://errors.catchtable.example/forbidden', title: 'Forbidden', status: 403 });
        return;
      }
      const bid = req.params.batchId;
      for (const it of o.items) {
        if (isItemRemoved(it)) continue;
        if (it.sendBatchId === bid && it.chefStatus === 'sent') {
          it.chefStatus = 'in_progress';
          it.acceptedAt = store.nowIso();
          it.acceptedBy = req.staffUserId;
        }
      }
      o.updatedAt = store.nowIso();
      res.json(o);
    },
  );

  app.post(
    '/pos/orders/:orderId/items/:itemId/complete',
    staffAuth,
    requirePermission('kitchen.act'),
    (req, res) => {
      const o = store.orders.get(req.params.orderId);
      if (!o || (req.staffRestaurantId && o.restaurantId !== req.staffRestaurantId)) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      const it = o.items.find((x) => x.id === req.params.itemId);
      if (!it || isItemRemoved(it)) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      it.chefStatus = 'ready';
      it.completedAt = store.nowIso();
      it.completedBy = req.staffUserId;
      o.updatedAt = store.nowIso();
      res.json(it);
    },
  );

  app.post(
    '/pos/orders/:orderId/items/:itemId/recall',
    staffAuth,
    requirePermission('kitchen.act'),
    (req, res) => {
      const o = store.orders.get(req.params.orderId);
      if (!o || (req.staffRestaurantId && o.restaurantId !== req.staffRestaurantId)) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      const it = o.items.find((x) => x.id === req.params.itemId);
      if (!it || isItemRemoved(it)) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      it.chefStatus = 'in_progress';
      o.updatedAt = store.nowIso();
      res.json(it);
    },
  );
}
