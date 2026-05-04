export function log(level, msg, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'restaurant', level, msg, ...fields }));
}
