// Render every per-diagram .mmd file to SVG using @mermaid-js/mermaid-cli
// (`mmdc`). This is a render-level smoke check; if mmdc renders without
// throwing, the diagram is fully valid Mermaid (lexer + parser + layout).
//
// Requires Chrome/Edge somewhere on disk; the path is read from
// `_puppeteer.json` and passed to mmdc with `-p`.
//
// Usage:  node _render.mjs            (renders ALL into _render-out/)
//         node _render.mjs 01 08      (renders only the listed numbers)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '_render-out');
fs.mkdirSync(outDir, { recursive: true });

const allFiles = fs
  .readdirSync(__dirname)
  .filter((f) => /^\d{2}-.+\.mmd$/.test(f))
  .sort();

const filter = process.argv.slice(2);
const files =
  filter.length === 0
    ? allFiles
    : allFiles.filter((f) => filter.some((p) => f.startsWith(p)));

const isWin = process.platform === 'win32';
const mmdc = path.join(
  __dirname,
  'node_modules',
  '.bin',
  isWin ? 'mmdc.cmd' : 'mmdc'
);
const puppeteer = path.join(__dirname, '_puppeteer.json');

let bad = 0;
for (const f of files) {
  const out = path.join(outDir, f.replace(/\.mmd$/, '.svg'));
  process.stdout.write(`  ${f.padEnd(40)} -> ${path.basename(out)}  `);
  await new Promise((resolve) => {
    const p = spawn(
      mmdc,
      ['-p', puppeteer, '-i', path.join(__dirname, f), '-o', out, '-q'],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: true }
    );
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.stdout.on('data', () => {});
    p.on('close', (code) => {
      if (code === 0 && fs.existsSync(out)) {
        console.log('OK');
      } else {
        bad++;
        console.log('FAIL');
        if (err) console.log('    ' + err.split('\n').slice(0, 4).join('\n    '));
      }
      resolve();
    });
  });
}

console.log(`\nresult: ${files.length - bad}/${files.length} rendered`);
process.exit(bad === 0 ? 0 : 1);
