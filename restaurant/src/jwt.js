import * as jose from 'jose';

const encoder = new TextEncoder();

export function getJwtSecret() {
  const s = process.env.JWT_SECRET || 'dev-only-change-me';
  return encoder.encode(s);
}

export async function signAccessToken(payload) {
  const secret = getJwtSecret();
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_ACCESS_TTL || '15m')
    .sign(secret);
}

export async function signRefreshToken(payload) {
  const secret = getJwtSecret();
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_TTL || '30d')
    .sign(secret);
}

export async function verifyToken(token) {
  const secret = getJwtSecret();
  const { payload } = await jose.jwtVerify(token, secret);
  return payload;
}
