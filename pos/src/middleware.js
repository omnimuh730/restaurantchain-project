import { verifyAccessToken } from './jwt.js';
import { log } from './logger.js';

const LEGACY = process.env.ALLOW_LEGACY_AUTH_HEADERS !== 'false';

export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  const id = incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  req.requestId = id;
  next();
}

export function httpLog(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    log('info', 'http', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
}

export async function staffAuth(req, res, next) {
  const auth = req.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    try {
      const payload = await verifyAccessToken(m[1].trim());
      if (payload.typ !== 'staff' || !payload.sub) {
        res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
        return;
      }
      req.staffUserId = String(payload.sub);
      req.staffRestaurantId = payload.restaurantId ? String(payload.restaurantId) : null;
      req.staffPermissions = Array.isArray(payload.permissions) ? payload.permissions : [];
      req.staffRole = payload.role ? String(payload.role) : null;
      return next();
    } catch {
      res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
      return;
    }
  }
  if (LEGACY) {
    const sid = req.get('x-staff-user-id');
    const rid = req.get('x-restaurant-id') || req.params?.restaurantId;
    if (sid && rid) {
      req.staffUserId = sid.trim();
      req.staffRestaurantId = String(rid);
      req.staffPermissions = (process.env.DEMO_STAFF_PERMISSIONS || 'reservations.approve,orders.take,payments.process,kitchen.act,tables.edit')
        .split(',')
        .map((s) => s.trim());
      req.staffRole = 'manager';
      return next();
    }
  }
  res.status(401).json({
    type: 'https://errors.catchtable.example/unauthenticated',
    title: 'Missing staff auth',
    status: 401,
    detail: 'Bearer staff access token or legacy X-Staff-User-Id + X-Restaurant-Id',
  });
}

export function requireRestaurantScope(req, res, next) {
  const pathRid = req.params.restaurantId;
  if (pathRid && req.staffRestaurantId && pathRid !== req.staffRestaurantId) {
    res.status(403).json({ type: 'https://errors.catchtable.example/forbidden', title: 'Wrong restaurant', status: 403 });
    return;
  }
  next();
}

export function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.staffPermissions?.includes(perm)) {
      res.status(403).json({
        type: 'https://errors.catchtable.example/forbidden',
        title: 'Forbidden',
        status: 403,
        code: 'missing_permission',
        detail: perm,
      });
      return;
    }
    next();
  };
}
