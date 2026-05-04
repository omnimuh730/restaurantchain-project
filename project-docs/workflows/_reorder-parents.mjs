// One-off: reorder leading `%%` comments to AFTER the diagram type line in
// the parent files (../workflows.md appendix blocks and ../workflows.mmd
// catalog blocks). Idempotent — safe to re-run after edits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TYPE = /^[ \t]*(flowchart(?:\s+\w+)?|graph(?:\s+\w+)?|sequenceDiagram|stateDiagram-v2|stateDiagram|erDiagram|classDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|requirementDiagram|quadrantChart|sankey-beta|xychart-beta|block-beta)\s*$/;

function reorder(body) {
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const leadComments = [];
  while (i < lines.length && /^[ \t]*%%/.test(lines[i])) {
    leadComments.push(lines[i]);
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && TYPE.test(lines[i])) {
    const typeLine = lines[i];
    const rest = lines.slice(i + 1).join('\n');
    const head = leadComments.length ? leadComments.join('\n') + '\n' : '';
    return typeLine + '\n' + head + rest;
  }
  return body; // no diagram type found — leave untouched
}

// --- workflows.mmd: BEGIN/END blocks -------------------------------------
const mmdPath = path.join(__dirname, '..', 'workflows.mmd');
let mmd = fs.readFileSync(mmdPath, 'utf8');
let mmdCount = 0;
mmd = mmd.replace(
  /(%% --- BEGIN: ([\w-]+) -+\s*\r?\n)([\s\S]*?)(\r?\n%% --- END: \2 -+)/g,
  (_, head, _name, body, tail) => {
    mmdCount++;
    return head + reorder(body) + tail;
  },
);
fs.writeFileSync(mmdPath, mmd);

// --- workflows.md: ```mermaid ... ``` blocks -----------------------------
const mdPath = path.join(__dirname, '..', 'workflows.md');
let md = fs.readFileSync(mdPath, 'utf8');
let mdCount = 0;
md = md.replace(/(```mermaid\r?\n)([\s\S]*?)(\r?\n```)/g, (_, open, body, close) => {
  mdCount++;
  return open + reorder(body) + close;
});
fs.writeFileSync(mdPath, md);

console.log(`reordered ${mmdCount} blocks in workflows.mmd`);
console.log(`reordered ${mdCount} blocks in workflows.md`);
