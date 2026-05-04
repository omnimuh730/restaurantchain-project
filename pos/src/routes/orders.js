import { staffAuth, requireRestaurantScope, requirePermission } from '../middleware.js';

function emptyTotals() {
  return {
    domestic: { amount: '0', currency: 'KRW' },
    foreign: { amount: '0', currency: 'USD' },
  };
}

export function mountOrderRoutes(app, ctx) {
  const { store } = ctx;

  app.get(
    '/pos/restaurants/:restaurantId/orders',
    staffAuth,
    requireRestaurantScope,
    requirePermission('orders.take'),
    (req, res) => {
      const rid = req.params.restaurantId;
      const statusFilter = req.query.status;
      let data = [...store.orders.values()].filter((o) => o.restaurantId === rid);
      if (statusFilter) {
        const set = new Set(String(statusFilter).split(','));
        data = data.filter((o) => set.has(o.status));
      }
      res.json({ data, page: 1, pageSize: data.length, total: data.length });
    },
  );

  app.post(
    '/pos/restaurants/:restaurantId/orders',
    staffAuth,
    requireRestaurantScope,
    requirePermission('orders.take'),
    (req, res) => {
      const rid = req.params.restaurantId;
      const openSameTable = [...store.orders.values()].find(
        (o) => o.restaurantId === rid && o.tableId === req.body?.tableId && o.status === 'open',
      );
      if (openSameTable) {
        res.status(409).json({
          type: 'https://errors.catchtable.example/conflict',
          title: 'Table has open order',
          status: 409,
        });
        return;
      }
      const id = store.oid();
      const order = {
        id,
        restaurantId: rid,
        floorId: store.FLOOR,
        tableId: req.body?.tableId,
        reservationId: req.body?.reservationId || null,
        openedBy: req.staffUserId,
        openedAt: store.nowIso(),
        partySize: req.body?.partySize ?? 1,
        guestUserIds: req.body?.guestUserIds || [],
        totals: emptyTotals(),
        itemCount: 0,
        draftItemCount: 0,
        status: 'open',
        paymentIds: [],
        items: [],
        notes: req.body?.notes || '',
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      };
      store.orders.set(id, order);
      res.status(201).location(`/pos/orders/${id}`).json(order);
    },
  );

  app.get('/pos/orders/:orderId', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (req.staffRestaurantId && o.restaurantId !== req.staffRestaurantId) {
      res.status(403).json({ type: 'https://errors.catchtable.example/forbidden', title: 'Forbidden', status: 403 });
      return;
    }
    res.json(o);
  });

  app.post('/pos/orders/:orderId/items', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o || o.status !== 'open') {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const iid = store.oid();
    const item = {
      id: iid,
      menuItemId: req.body?.menuItemId || store.oid(),
      snapshot: {
        name: req.body?.name || 'Item',
        shortName: req.body?.shortName || '',
        price: req.body?.price || { amount: '10000', currency: 'KRW' },
        pool: req.body?.pool || 'domestic',
      },
      qty: req.body?.qty ?? 1,
      modifiers: req.body?.modifiers || [],
      chefStatus: 'draft',
      sendBatchId: null,
      addedBy: req.staffUserId,
      addedAt: store.nowIso(),
    };
    o.items.push(item);
    o.itemCount = o.items.filter((x) => x.chefStatus !== 'voided').length;
    o.draftItemCount = o.items.filter((x) => x.chefStatus === 'draft').length;
    o.updatedAt = store.nowIso();
    recalcTotals(o);
    res.status(201).json(item);
  });

  app.patch('/pos/orders/:orderId/items/:itemId', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const item = o.items.find((x) => x.id === req.params.itemId);
    if (!item) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (req.body?.qty !== undefined) item.qty = req.body.qty;
    o.updatedAt = store.nowIso();
    recalcTotals(o);
    res.json(item);
  });

  app.delete('/pos/orders/:orderId/items/:itemId', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const idx = o.items.findIndex((x) => x.id === req.params.itemId);
    if (idx < 0 || !o.items[idx] || o.items[idx].chefStatus !== 'draft') {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    o.items.splice(idx, 1);
    o.itemCount = o.items.filter((x) => x.chefStatus !== 'voided').length;
    o.draftItemCount = o.items.filter((x) => x.chefStatus === 'draft').length;
    o.updatedAt = store.nowIso();
    recalcTotals(o);
    res.status(204).send();
  });

  app.post('/pos/orders/:orderId/send-batch', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    const batchId = store.oid();
    const ids = new Set(req.body?.itemIds || []);
    for (const it of o.items) {
      if (ids.has(it.id) && it.chefStatus === 'draft') {
        it.chefStatus = 'sent';
        it.sendBatchId = batchId;
        it.sentAt = store.nowIso();
      }
    }
    o.draftItemCount = o.items.filter((x) => x.chefStatus === 'draft').length;
    o.updatedAt = store.nowIso();
    res.json(o);
  });

  app.post('/pos/orders/:orderId/request-bill', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    o.status = 'bill_requested';
    o.updatedAt = store.nowIso();
    res.json(o);
  });

  app.post('/pos/orders/:orderId/finalize-bill', staffAuth, requirePermission('payments.process'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    o.status = 'bill';
    o.bill = {
      subtotal: o.totals.domestic,
      taxRate: 0.1,
      tax: { amount: String(Math.round(Number(o.totals.domestic.amount) * 0.1)), currency: 'KRW' },
      tipRate: 0,
      tip: { amount: '0', currency: 'KRW' },
      total: { amount: String(Math.round(Number(o.totals.domestic.amount) * 1.1)), currency: 'KRW' },
      finalizedAt: store.nowIso(),
      finalizedBy: req.staffUserId,
    };
    o.updatedAt = store.nowIso();
    res.json(o);
  });

  app.post('/pos/orders/:orderId/payments', staffAuth, requirePermission('payments.process'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o || o.status !== 'bill') {
      res.status(409).json({ type: 'https://errors.catchtable.example/conflict', title: 'Bill not ready', status: 409 });
      return;
    }
    const pid = store.oid();
    const pay = {
      id: pid,
      purpose: 'order_bill',
      payer: { kind: 'customer', customerUserId: null },
      method: { kind: req.body?.method || 'cash', tendered: o.bill.total, change: { amount: '0', currency: 'KRW' } },
      amount: o.bill.total,
      pool: 'domestic',
      status: 'succeeded',
      capturedAt: store.nowIso(),
      refunds: [],
      netAmount: o.bill.total,
      orderId: o.id,
      restaurantId: o.restaurantId,
      createdAt: store.nowIso(),
    };
    store.payments.set(pid, pay);
    o.paymentIds.push(pid);
    o.status = 'paid';
    o.closedAt = store.nowIso();
    o.updatedAt = store.nowIso();
    res.json(pay);
  });

  app.post('/pos/orders/:orderId/void', staffAuth, requirePermission('payments.refund'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    if (!o) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    o.status = 'voided';
    o.updatedAt = store.nowIso();
    res.json(o);
  });

  app.post('/pos/orders/:orderId/items/:itemId/void', staffAuth, requirePermission('orders.take'), (req, res) => {
    const o = store.orders.get(req.params.orderId);
    const item = o?.items.find((x) => x.id === req.params.itemId);
    if (!item) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
      return;
    }
    if (item.chefStatus === 'sent') {
      res.status(409).json({
        type: 'https://errors.catchtable.example/conflict',
        title: 'Cannot void',
        status: 409,
        code: 'cannot_void_after_send',
      });
      return;
    }
    item.chefStatus = 'voided';
    item.voidedAt = store.nowIso();
    item.voidedBy = req.staffUserId;
    o.updatedAt = store.nowIso();
    recalcTotals(o);
    res.json(item);
  });
}

function recalcTotals(o) {
  let sum = 0;
  for (const it of o.items) {
    if (it.chefStatus === 'voided') continue;
    const a = Number(it.snapshot?.price?.amount || 0);
    sum += a * (it.qty || 1);
  }
  o.totals = {
    domestic: { amount: String(sum), currency: 'KRW' },
    foreign: { amount: '0', currency: 'USD' },
  };
  o.itemCount = o.items.filter((x) => x.chefStatus !== 'voided').length;
  o.draftItemCount = o.items.filter((x) => x.chefStatus === 'draft').length;
}
