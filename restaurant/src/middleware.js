import { log } from './logger.js';
import { verifyToken } from './jwt.js';

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

const LEGACY = process.env.ALLOW_LEGACY_AUTH_HEADERS !== 'false';

/** Resolve customer user id: Bearer JWT (typ customer) or legacy X-Customer-User-Id when allowed. */
export async function customerAuth(req, res, next) {
  const auth = req.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    try {
      const payload = await verifyToken(m[1].trim());
      if (payload.typ !== 'customer' || !payload.sub) {
        res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
        return;
      }
      req.customerUserId = String(payload.sub);
      return next();
    } catch {
      res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401, code: 'token_invalid' });
      return;
    }
  }
  if (LEGACY) {
    const h = req.get('x-customer-user-id');
    if (h) {
      req.customerUserId = h.trim();
      return next();
    }
  }
  res.status(401).json({ type: 'https://errors.catchtable.example/unauthenticated', title: 'Unauthorized', status: 401 });
}

export function optionalCustomerAuth(req, res, next) {
  const auth = req.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    return verifyToken(m[1].trim())
      .then((payload) => {
        if (payload.typ === 'customer' && payload.sub) req.customerUserId = String(payload.sub);
        next();
      })
      .catch(() => next());
  }
  if (LEGACY && req.get('x-customer-user-id')) {
    req.customerUserId = req.get('x-customer-user-id').trim();
  }
  next();
}

export function internalAuth(internalKey) {
  return (req, res, next) => {
    const k = req.get('x-internal-key');
    if (k !== internalKey) {
      res.status(401).json({
        type: 'https://errors.catchtable.example/unauthenticated',
        title: 'Unauthorized',
        status: 401,
        code: 'unauthenticated',
      });
      return;
    }
    next();
  };
}
