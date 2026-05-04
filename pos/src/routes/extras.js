import { staffAuth, requireRestaurantScope, requirePermission } from '../middleware.js';

export function mountExtraPosRoutes(app, _ctx) {
  app.get(
    '/pos/restaurants/:restaurantId/analytics/sales',
    staffAuth,
    requireRestaurantScope,
    requirePermission('analytics.view'),
    (req, res) => {
      res.json({
        from: req.query.from || new Date().toISOString(),
        to: req.query.to || new Date().toISOString(),
        totals: {
          revenueDomestic: { amount: '0', currency: 'KRW' },
          revenueForeign: { amount: '0', currency: 'USD' },
          ordersCount: 0,
          guestsCount: 0,
        },
        dailyRevenue: [],
        topItems: [],
        hourlyHeatmap: [],
        note: 'Stub: wire pos-analytics per project-docs',
      });
    },
  );

  app.get(
    '/pos/restaurants/:restaurantId/subscription',
    staffAuth,
    requireRestaurantScope,
    requirePermission('restaurant.settings'),
    (_req, res) => {
      res.json({
        tier: 'pro',
        status: 'active',
        note: 'Stub: wire pos-subscriptions per project-docs',
      });
    },
  );
}
