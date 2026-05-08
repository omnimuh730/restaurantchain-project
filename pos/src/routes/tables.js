import { staffAuth, requireRestaurantScope, requirePermission } from '../middleware.js';

function floorKey(rid, fid) {
  return `${rid}:${fid}`;
}

export function mountTableRoutes(app, ctx) {
  const { store } = ctx;

  app.get(
    '/pos/restaurants/:restaurantId/floors/:floorId/tables',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const k = floorKey(req.params.restaurantId, req.params.floorId);
      const data = (store.tablesByFloor.get(k) || []).filter((t) => t.deletedAt == null);
      res.json({ data });
    },
  );

  app.get(
    '/pos/restaurants/:restaurantId/tables',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const rid = req.params.restaurantId;
      const data = [];
      for (const [k, rows] of store.tablesByFloor) {
        if (k.startsWith(`${rid}:`)) data.push(...rows.filter((t) => t.deletedAt == null));
      }
      res.json({ data });
    },
  );

  app.get(
    '/pos/restaurants/:restaurantId/tables/:tableId',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const row = findTable(store, req.params.restaurantId, req.params.tableId, { includeDeleted: false });
      if (!row) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      res.json(row);
    },
  );

  app.post(
    '/pos/restaurants/:restaurantId/floors/:floorId/tables',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const k = floorKey(req.params.restaurantId, req.params.floorId);
      const list = store.tablesByFloor.get(k) || [];
      const id = store.oid();
      const t = {
        id,
        restaurantId: req.params.restaurantId,
        floorId: req.params.floorId,
        name: req.body?.name || 'T',
        seats: req.body?.seats ?? 2,
        shape: req.body?.shape || 'rect',
        size: req.body?.size || { w: 1, h: 1 },
        position: req.body?.position || { x: 0, y: 0 },
        z: req.body?.z ?? 0,
        status: 'available',
        qrCode: null,
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
        deletedAt: null,
        deletedBy: null,
      };
      list.push(t);
      store.tablesByFloor.set(k, list);
      res.status(201).location(`/pos/restaurants/${req.params.restaurantId}/tables/${id}`).json(t);
    },
  );

  app.patch(
    '/pos/restaurants/:restaurantId/tables/:tableId',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const t = findTable(store, req.params.restaurantId, req.params.tableId, { includeDeleted: true });
      if (!t || t.deletedAt != null) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      const patch = { ...(req.body || {}) };
      delete patch.deletedAt;
      delete patch.deletedBy;
      Object.assign(t, patch, { updatedAt: store.nowIso() });
      res.json(t);
    },
  );

  app.delete(
    '/pos/restaurants/:restaurantId/tables/:tableId',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const rid = req.params.restaurantId;
      const tid = req.params.tableId;
      for (const [k, list] of store.tablesByFloor) {
        if (!k.startsWith(`${rid}:`)) continue;
        const t = list.find((x) => x.id === tid);
        if (t) {
          if (t.deletedAt != null) return res.status(204).send();
          t.deletedAt = store.nowIso();
          t.deletedBy = req.staffUserId;
          t.updatedAt = store.nowIso();
          return res.status(204).send();
        }
      }
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
    },
  );

  app.put(
    '/pos/restaurants/:restaurantId/floors/:floorId/tables',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const k = floorKey(req.params.restaurantId, req.params.floorId);
      const data = Array.isArray(req.body) ? req.body : req.body?.data || [];
      store.tablesByFloor.set(k, data);
      res.json({ data });
    },
  );

  app.post(
    '/pos/restaurants/:restaurantId/tables/:tableId/qr-code/rotate',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const t = findTable(store, req.params.restaurantId, req.params.tableId, { includeDeleted: false });
      if (!t) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      const v = (t.qrCode?.rotationVersion || 0) + 1;
      t.qrCode = {
        payload: `qr-${t.id}-${v}`,
        payloadHash: `hash-${v}`,
        rotationVersion: v,
        validFrom: store.nowIso(),
        validUntil: null,
        issuedBy: req.staffUserId,
      };
      t.updatedAt = store.nowIso();
      res.json(t);
    },
  );

  app.put(
    '/pos/restaurants/:restaurantId/tables/:tableId/status',
    staffAuth,
    requireRestaurantScope,
    requirePermission('tables.edit'),
    (req, res) => {
      const t = findTable(store, req.params.restaurantId, req.params.tableId, { includeDeleted: false });
      if (!t) {
        res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'Not found', status: 404 });
        return;
      }
      t.status = req.body?.status || t.status;
      t.updatedAt = store.nowIso();
      res.json(t);
    },
  );
}

function findTable(store, restaurantId, tableId, opts = {}) {
  const { includeDeleted = true } = opts;
  for (const [k, list] of store.tablesByFloor) {
    if (!k.startsWith(`${restaurantId}:`)) continue;
    const t = list.find((x) => x.id === tableId);
    if (t && (includeDeleted || t.deletedAt == null)) return t;
  }
  return null;
}
