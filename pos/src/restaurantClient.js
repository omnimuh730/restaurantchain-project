export async function restaurantFetch(base, internalKey, path, init = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Key': internalKey,
    ...(init.headers || {}),
  };
  const url = `${base}${path}`;
  return fetch(url, { ...init, headers });
}
