import { signAccessToken, signRefreshToken, verifyToken } from '../jwt.js';

export function mountAuthRoutes(app, ctx) {
  const { store } = ctx;

  app.get('/auth/username-available', (req, res) => {
    const u = (req.query.username || '').toString().toLowerCase();
    if (!u) {
      res.status(400).json({ type: 'https://errors.catchtable.example/bad_request', title: 'Bad request', status: 400 });
      return;
    }
    const taken = [...store.users.values()].some((x) => x.username.toLowerCase() === u);
    res.json({ available: !taken });
  });

  app.post('/auth/customer/sign-in', async (req, res) => {
    const { username, password } = req.body || {};
    const user = [...store.users.values()].find((x) => x.username === username);
    if (!user || password !== 'demo') {
      res.status(401).json({
        type: 'https://errors.catchtable.example/unauthenticated',
        title: 'Unauthorized',
        status: 401,
        code: 'invalid_credentials',
      });
      return;
    }
    const accessToken = await signAccessToken({ typ: 'customer', sub: user.id });
    const refreshToken = await signRefreshToken({ typ: 'refresh', sub: user.id, jti: crypto.randomUUID() });
    res.json({
      tokens: {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        tokenType: 'Bearer',
      },
      user: publicCustomer(user),
    });
  });

  app.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      res.status(400).json({ type: 'https://errors.catchtable.example/bad_request', title: 'Bad request', status: 400 });
      return;
    }
    let payload;
    try {
      payload = await verifyToken(refreshToken);
    } catch {
      res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
      return;
    }
    if (payload.typ !== 'refresh' || !payload.sub) {
      res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
      return;
    }
    const user = store.users.get(String(payload.sub));
    if (!user) {
      res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
      return;
    }
    const accessToken = await signAccessToken({ typ: 'customer', sub: user.id });
    const newRefresh = await signRefreshToken({ typ: 'refresh', sub: user.id, jti: crypto.randomUUID() });
    res.json({
      tokens: {
        accessToken,
        refreshToken: newRefresh,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
        tokenType: 'Bearer',
      },
    });
  });

  app.post('/auth/sign-out', (_req, res) => {
    res.status(204).send();
  });

  app.post('/auth/staff/sign-in', async (req, res) => {
    const { username, password } = req.body || {};
    if (username === 'staff' && password === 'demo') {
      const accessToken = await signAccessToken({
        typ: 'staff',
        sub: 'staff-demo-1',
        restaurantId: store.RID,
        role: 'manager',
        permissions: [
          'restaurant.settings',
          'staff.manage',
          'menu.edit',
          'floors.edit',
          'tables.edit',
          'orders.take',
          'payments.process',
          'payments.refund',
          'kitchen.act',
          'analytics.view',
          'reservations.approve',
        ],
      });
      const refreshToken = await signRefreshToken({ typ: 'refresh', sub: 'staff-demo-1', jti: crypto.randomUUID() });
      res.json({
        tokens: {
          accessToken,
          refreshToken,
          accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          refreshTokenExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
          tokenType: 'Bearer',
        },
        user: {
          id: 'staff-demo-1',
          restaurantId: store.RID,
          username: 'staff',
          fullName: 'Staff Demo',
          role: 'manager',
          permissions: [
            'restaurant.settings',
            'staff.manage',
            'menu.edit',
            'floors.edit',
            'tables.edit',
            'orders.take',
            'payments.process',
            'payments.refund',
            'kitchen.act',
            'analytics.view',
            'reservations.approve',
          ],
          status: 'active',
          createdAt: store.nowIso(),
        },
        restaurant: { id: store.RID, name: 'Sakura Omakase', status: 'active', tier: 'pro' },
      });
      return;
    }
    res.status(401).json({
      type: 'https://errors.catchtable.example/unauthenticated',
      title: 'Unauthorized',
      status: 401,
      code: 'invalid_credentials',
    });
  });
}

function publicCustomer(u) {
  return { ...u };
}
