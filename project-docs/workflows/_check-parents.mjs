// Sanity check: confirm every diagram block in workflows.mmd and
// workflows.md starts with a valid Mermaid diagram-type line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = /^[ \t]*(flowchart(?:\s+\w+)?|graph(?:\s+\w+)?|sequenceDiagram|stateDiagram-v2|stateDiagram|erDiagram|classDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|requirementDiagram|quadrantChart|sankey-beta|xychart-beta|block-beta)\s*$/;

function firstNonBlank(body) {
  for (const ln of body.split(/\r?\n/)) if (ln.trim()) return ln;
  return '';
}

const mmd = fs.readFileSync(path.join(__dirname, '..', 'workflows.mmd'), 'utf8');
const md = fs.readFileSync(path.join(__dirname, '..', 'workflows.md'), 'utf8');

let bad = 0;
console.log('--- workflows.mmd ---');
for (const m of mmd.matchAll(/%% --- BEGIN: ([\w-]+) -+\s*\r?\n([\s\S]*?)\r?\n%% --- END: \1 -+/g)) {
  const [, name, body] = m;
  const ln = firstNonBlank(body);
  const ok = TYPE.test(ln);
  console.log(`${ok ? 'ok ' : 'FAIL'}  ${name.padEnd(34)} ${ok ? '' : ' first line: ' + JSON.stringify(ln)}`);
  if (!ok) bad++;
}
console.log('\n--- workflows.md ---');
let i = 0;
for (const m of md.matchAll(/```mermaid\r?\n([\s\S]*?)\r?\n```/g)) {
  i++;
  const ln = firstNonBlank(m[1]);
  const ok = TYPE.test(ln);
  console.log(`${ok ? 'ok ' : 'FAIL'}  appendix block #${String(i).padStart(2, '0')}  ${ok ? '' : ' first line: ' + JSON.stringify(ln)}`);
  if (!ok) bad++;
}
console.log(`\n${bad === 0 ? 'all blocks start with a diagram-type line' : bad + ' BAD blocks'}`);
process.exit(bad === 0 ? 0 : 1);
