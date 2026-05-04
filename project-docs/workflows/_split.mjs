// Splits ../workflows.mmd at the BEGIN/END markers and writes each diagram
// as its own standalone .mmd file in this folder.
//
// IMPORTANT layout invariant (so strict Mermaid parsers don't reject leading
// comments): each output file has the DIAGRAM TYPE LINE FIRST, then any `%%`
// comments that originally appeared above it, then the rest of the body.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'workflows.mmd'), 'utf8');

const re = /%% --- BEGIN: ([\w-]+) -+\s*\r?\n([\s\S]*?)\r?\n%% --- END: \1 -+/g;

// Mermaid diagram-type declarations we expect at the top of a block.
// Anchored to the start of a line and accepts an optional direction/title token.
const TYPE = /^[ \t]*(flowchart(?:\s+\w+)?|graph(?:\s+\w+)?|sequenceDiagram|stateDiagram-v2|stateDiagram|erDiagram|classDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|requirementDiagram|quadrantChart|sankey-beta|xychart-beta|block-beta)\s*$/;

function reorder(body) {
  const lines = body.split(/\r?\n/);
  // Skip leading blank lines.
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  // Collect leading %% comment lines.
  const leadComments = [];
  while (i < lines.length && /^[ \t]*%%/.test(lines[i])) {
    leadComments.push(lines[i]);
    i++;
  }
  // Skip blank lines between comments and the diagram type.
  while (i < lines.length && lines[i].trim() === '') i++;
  // If the next line is the diagram type, hoist it above the comments.
  if (i < lines.length && TYPE.test(lines[i])) {
    const typeLine = lines[i];
    const rest = lines.slice(i + 1).join('\n');
    const head = leadComments.length ? leadComments.join('\n') + '\n' : '';
    return typeLine + '\n' + head + rest;
  }
  // Couldn't find a type line — return body untouched.
  return body;
}

let count = 0;
let m;
while ((m = re.exec(src)) !== null) {
  const [, name, body] = m;
  const reordered = reorder(body).trim() + '\n';
  const file = path.join(__dirname, `${name}.mmd`);
  fs.writeFileSync(file, reordered);
  count++;
}
console.log(`extracted ${count} diagrams (type-line-first layout) into ${__dirname}`);
