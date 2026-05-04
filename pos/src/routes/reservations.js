import { restaurantFetch } from '../restaurantClient.js';
import { staffAuth, requireRestaurantScope, requirePermission } from '../middleware.js';

async function forwardJson(res, p) {
  const body = await p.text();
  res.status(p.status).type(p.headers.get('content-type') || 'application/json').send(body);
}

export function mountReservationPosRoutes(app, ctx) {
  const { base, internalKey } = ctx;

  app.get(
    '/pos/restaurants/:restaurantId/reservations',
    staffAuth,
    requireRestaurantScope,
    requirePermission('reservations.approve'),
    async (req, res) => {
      const rid = req.params.restaurantId;
      const q = new URLSearchParams(req.query).toString();
      const path = `/internal/restaurants/${encodeURIComponent(rid)}/reservations${q ? `?${q}` : ''}`;
      const p = await restaurantFetch(base, internalKey, path, { method: 'GET' });
      return forwardJson(res, p);
    },
  );

  app.get('/pos/reservations/:reservationId', staffAuth, requirePermission('reservations.approve'), async (req, res) => {
    const p = await restaurantFetch(base, internalKey, `/internal/reservations/${encodeURIComponent(req.params.reservationId)}`, {
      method: 'GET',
    });
    return forwardJson(res, p);
  });

  const actions = [
    ['approve', 'reservations.approve'],
    ['decline', 'reservations.approve'],
    ['check-in', 'reservations.approve'],
    ['no-show', 'reservations.approve'],
    ['cancel', 'reservations.approve'],
  ];

  for (const [action, perm] of actions) {
    app.post(
      `/pos/reservations/:reservationId/${action}`,
      staffAuth,
      requirePermission(perm),
      async (req, res) => {
        const p = await restaurantFetch(
          base,
          internalKey,
          `/internal/reservations/${encodeURIComponent(req.params.reservationId)}/${action}`,
          { method: 'POST', body: JSON.stringify(req.body || {}) },
        );
        return forwardJson(res, p);
      },
    );
  }
}
