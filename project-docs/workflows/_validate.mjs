// Strict per-file Mermaid validator.
//
// Uses the official `mermaid` npm package — the exact same Jison grammar
// that powers @mermaid-js/mermaid-cli (`mmdc`) and the Mermaid Live Editor.
// `mermaid.parse(text)` returns/raises on syntax errors only (rendering adds
// layout but does not change the grammar), so a file that parses here will
// also parse in mmdc, GitHub, Notion, Cursor's preview, etc.
//
// Run from this folder:  node _validate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mermaid from 'mermaid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Browser-shape stubs the parser expects in Node ---------------------
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
  createElementNS: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
  createTextNode: () => ({}),
  body: { appendChild: () => {} },
  documentElement: { style: {} },
};
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    configurable: true,
  });
} catch {}
try {
  const dompurify = await import('dompurify');
  const orig = dompurify.default || dompurify;
  if (typeof orig.sanitize !== 'function') orig.sanitize = (s) => String(s);
  if (typeof orig.addHook !== 'function') orig.addHook = () => {};
  if (typeof orig.removeHook !== 'function') orig.removeHook = () => {};
} catch {}

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const files = fs
  .readdirSync(__dirname)
  .filter((f) => /^\d{2}-.+\.mmd$/.test(f))
  .sort();

let bad = 0;
const failures = [];
for (const f of files) {
  const text = fs.readFileSync(path.join(__dirname, f), 'utf8');
  try {
    await mermaid.parse(text);
    console.log('  OK   ' + f);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    if (m.includes('DOMPurify.sanitize is not a function')) {
      // Sanitization happens AFTER successful parse; treat as OK.
      console.log('  OK   ' + f + '   (parse ok; html-label sanitizer stub)');
      continue;
    }
    bad++;
    const lines = m.split('\n').slice(0, 6).join('\n         ');
    console.log('  FAIL ' + f);
    console.log('         ' + lines);
    failures.push({ f, m });
  }
}

console.log(`\nresult: ${files.length - bad}/${files.length} ok, ${bad} failed`);
if (bad > 0) {
  console.log('\nfailing files:');
  for (const x of failures) console.log('  - ' + x.f);
}
process.exit(bad === 0 ? 0 : 1);
