import express from 'express';
import { internalAuth } from '../middleware.js';

/**
 * In-app feed rows (mirrors customer GET /me/notifications shape).
 * Populated by the notification microservice after payment events.
 */
export function mountInternalNotificationRoutes(app, ctx) {
  const { store } = ctx;
  const r = express.Router();
  r.use(internalAuth(ctx.internalKey));

  r.post('/customers/:customerUserId/in-app-notifications', (req, res) => {
    const uid = req.params.customerUserId?.trim();
    if (!uid) {
      res.status(400).json({ title: 'Bad request', status: 400 });
      return;
    }
    const u = store.users.get(uid);
    if (!u) {
      res.status(404).json({ type: 'https://errors.catchtable.example/not_found', title: 'User not found', status: 404 });
      return;
    }
    const n = req.body?.notification || req.body;
    const type = n?.type || 'system.message';
    const title = n?.title != null ? String(n.title) : 'Notification';
    const body = n?.body != null ? String(n.body) : '';
    const iconHint = n?.iconHint || 'notify';
    const deepLink = n?.deepLink != null ? String(n.deepLink) : '/';

    const id = store.oid();
    const row = {
      id,
      type,
      title,
      body,
      iconHint,
      deepLink,
      read: false,
      readAt: null,
      createdAt: store.nowIso(),
    };
    const list = store.notificationsByUser.get(uid) || [];
    list.push(row);
    store.notificationsByUser.set(uid, list);
    res.status(201).json(row);
  });

  app.use('/internal', r);
}
