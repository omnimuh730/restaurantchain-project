import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { log } from './logger.js';

const PORT = Number(process.env.PORT ?? 4000);
const RESTAURANT_URL = (process.env.RESTAURANT_SERVICE_URL ?? 'http://127.0.0.1:4001').replace(/\/$/, '');
const POS_URL = (process.env.POS_SERVICE_URL ?? 'http://127.0.0.1:4002').replace(/\/$/, '');
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS ?? 15000);
const CORS_ORIGINS = process.env.CORS_ORIGINS;
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

const app = express();
if (TRUST_PROXY) app.set('trust proxy', 1);

const corsOptions = CORS_ORIGINS
  ? { origin: CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) }
  : { origin: true };
app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && incoming.trim() ? incoming.trim() : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  req.requestId = id;
  next();
});

app.use((req, res, next) => {
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
});

function forwardHeaders(req) {
  const h = new Headers();
  const pass = [
    'authorization',
    'idempotency-key',
    'accept-language',
    'x-customer-user-id',
    'x-staff-user-id',
    'x-restaurant-id',
    'if-none-match',
  ];
  for (const name of pass) {
    const v = req.get(name);
    if (v) h.set(name, v);
  }
  h.set('X-Request-Id', req.requestId);
  return h;
}

async function proxy(req, res, baseUrl) {
  const url = new URL(req.originalUrl, baseUrl);
  const headers = forwardHeaders(req);
  const init = { method: req.method, headers };
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) {
    headers.set('Content-Type', 'application/json');
    init.body = JSON.stringify(req.body ?? {});
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
  init.signal = ctl.signal;
  let upstream;
  try {
    upstream = await fetch(url, init);
  } catch (err) {
    clearTimeout(t);
    const aborted = err?.name === 'AbortError';
    log('error', 'upstream_fetch_failed', { requestId: req.requestId, url: url.href, aborted, detail: String(err?.message || err) });
    res.status(aborted ? 504 : 502).json({
      type: aborted ? 'https://errors.catchtable.example/timeout' : 'https://errors.catchtable.example/bad_gateway',
      title: aborted ? 'Upstream timeout' : 'Upstream unavailable',
      status: aborted ? 504 : 502,
      detail: String(err?.message || err),
    });
    return;
  }
  clearTimeout(t);
  const etag = upstream.headers.get('etag');
  if (etag) res.setHeader('ETag', etag);
  const ct = upstream.headers.get('content-type');
  if (ct) res.setHeader('Content-Type', ct);
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.status(upstream.status).send(buf);
}

/** Routing: only restaurant and POS upstreams; future auth service would add a branch here. */
function pickTarget(path) {
  if (path.startsWith('/pos')) return POS_URL;
  return RESTAURANT_URL;
}

app.get('/health', async (req, res) => {
  const rid = req.requestId;
  const h = { 'X-Request-Id': rid };
  const [r, p] = await Promise.all([
    fetch(`${RESTAURANT_URL}/health`, { headers: h, signal: AbortSignal.timeout(Math.min(3000, UPSTREAM_TIMEOUT_MS)) })
      .then((x) => x.json())
      .catch(() => ({ ok: false })),
    fetch(`${POS_URL}/health`, { headers: h, signal: AbortSignal.timeout(Math.min(3000, UPSTREAM_TIMEOUT_MS)) })
      .then((x) => x.json())
      .catch(() => ({ ok: false })),
  ]);
  res.json({ ok: true, service: 'bff', requestId: rid, upstream: { restaurant: r, pos: p } });
});

app.use((req, res) => {
  const base = pickTarget(req.path);
  return proxy(req, res, base);
});

app.listen(PORT, () => {
  log('info', 'bff_listen', { port: PORT, restaurant: RESTAURANT_URL, pos: POS_URL });
});
