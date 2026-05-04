import * as jose from 'jose';

const encoder = new TextEncoder();

export function getJwtSecret() {
  return encoder.encode(process.env.JWT_SECRET || 'dev-only-change-me');
}

export async function verifyAccessToken(token) {
  const { payload } = await jose.jwtVerify(token, getJwtSecret());
  return payload;
}
