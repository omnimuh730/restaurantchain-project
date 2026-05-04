export function log(level, msg, fields = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'pos', level, msg, ...fields }));
}
