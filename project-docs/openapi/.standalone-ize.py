"""Convert every YAML in the openapi/ folder into a standalone OpenAPI 3.1 doc.

Why:
  Editors like VS Code's Swagger Preview don't follow cross-file `$ref`s and
  also won't render a file that lacks `openapi: 3.x.y` and `info:`. Each
  fragment file (`paths/*.yaml`, `components/*.yaml`) currently is just a bag
  of named definitions, so they fail those checks.

What we do:
  1. For each `paths/*.yaml` file:
       * Indent the existing operation-named entries under a single `x-operations:`
         block (a valid OpenAPI specification extension key).
       * Prepend `openapi: 3.1.0`, `info:`, and a `paths:` block whose entries
         use local `$ref`s like `#/x-operations/<OpName>`.
       * URL+method mapping is mined from the root `openapi.yaml` (single
         source of truth).
  2. For each `components/*.yaml` file:
       * Prepend `openapi: 3.1.0`, `info:`, `paths: {}`. The existing
         top-level `components:` block already contains everything Swagger
         needs to validate.
  3. Rewrite refs in the root `openapi.yaml` from
       `./paths/foo.yaml#/<OpName>`
     to
       `./paths/foo.yaml#/x-operations/<OpName>`.

Idempotent: re-running on already-wrapped files is a no-op.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml


HERE = Path(__file__).resolve().parent


def title_for(domain: str) -> str:
    return ' '.join(w.capitalize() for w in domain.split('-'))


def main() -> int:
    root_path = HERE / 'openapi.yaml'
    root_text_before = root_path.read_text(encoding='utf-8')
    root_spec = yaml.safe_load(root_text_before)

    # ---- Step 1: scan root paths to discover (file, op_name) per (url, method).
    file_ops: dict[str, list[tuple[str, str, str]]] = {}
    ref_pattern = re.compile(r'^\./paths/([^#]+)#/(\w+)$')

    for url, methods in (root_spec.get('paths') or {}).items():
        if not isinstance(methods, dict):
            continue
        for method, operation in methods.items():
            if isinstance(operation, dict) and '$ref' in operation:
                m = ref_pattern.match(operation['$ref'])
                if m:
                    filename = f'paths/{m.group(1)}'
                    file_ops.setdefault(filename, []).append((url, method, m.group(2)))

    # ---- Step 2: rewrite each paths/*.yaml file.
    for filename in sorted(file_ops):
        ops = file_ops[filename]
        file_path = HERE / filename
        domain = filename.removeprefix('paths/').removesuffix('.yaml')
        title = title_for(domain)
        original = file_path.read_text(encoding='utf-8')

        if original.lstrip().startswith('openapi:'):
            print(f'  skip (already wrapped)  {filename}')
            continue

        indented_body = '\n'.join(
            (('  ' + line) if line.strip() else line)
            for line in original.splitlines()
        )

        # Group methods per URL so each URL appears once.
        per_url: dict[str, dict[str, str]] = {}
        for url, method, op_name in ops:
            per_url.setdefault(url, {})[method] = op_name

        paths_lines: list[str] = []
        for url in sorted(per_url, key=lambda u: (u.count('/'), u)):
            paths_lines.append(f'  {url}:')
            for method in sorted(per_url[url]):
                op_name = per_url[url][method]
                paths_lines.append(f"    {method}: {{ $ref: '#/x-operations/{op_name}' }}")

        paths_block = '\n'.join(paths_lines)

        envelope = (
            'openapi: 3.1.0\n'
            'info:\n'
            f"  title: 'CatchTable Page-Driven — {title}'\n"
            '  version: 1.0.0\n'
            '  description: |\n'
            f'    Standalone OpenAPI 3.1 document for the `{domain}` path module.\n'
            '\n'
            '    Operations live under `x-operations` (a spec-compliant extension key) so that:\n'
            f'      * the root `openapi.yaml` can $ref each one via `paths/{domain}.yaml#/x-operations/<OpName>`; and\n'
            '      * editors that do not follow cross-file `$ref`s (Swagger Preview, Postman import,\n'
            '        Stoplight, ...) can still parse and render this single file in isolation.\n'
            '\n'
            '    Cross-file refs into `../components/*.yaml` will appear unresolved when this file\n'
            '    is opened standalone. To see the full spec resolved, open `openapi.bundled.yaml`\n'
            '    or run `redocly preview-docs` on the root `openapi.yaml`.\n'
            'paths:\n'
            f'{paths_block}\n'
            '\n'
            'x-operations:\n'
            f'{indented_body}\n'
        )

        file_path.write_text(envelope, encoding='utf-8')
        print(f'  wrapped {filename}  ({len(ops)} ops)')

    # ---- Step 3: rewrite refs in root openapi.yaml.
    new_root_text = re.sub(
        r"(\$ref:\s*'\./paths/[^#]+#/)(\w+)",
        lambda m: f"{m.group(1)}x-operations/{m.group(2)}",
        root_text_before,
    )
    if new_root_text != root_text_before:
        root_path.write_text(new_root_text, encoding='utf-8')
        print('  updated root openapi.yaml refs')

    # ---- Step 4: wrap components files.
    for short in ('common', 'schemas'):
        comp_path = HERE / 'components' / f'{short}.yaml'
        text = comp_path.read_text(encoding='utf-8')
        if text.lstrip().startswith('openapi:'):
            print(f'  skip (already wrapped)  components/{short}.yaml')
            continue

        envelope = (
            'openapi: 3.1.0\n'
            'info:\n'
            f"  title: 'CatchTable Page-Driven — Shared {short.capitalize()} Components'\n"
            '  version: 1.0.0\n'
            '  description: |\n'
            f'    Shared OpenAPI {short} components $ref''ed from every path module and the root spec.\n'
            '    Wrapped as a standalone OpenAPI 3.1 doc (with `paths: {}`) so editors that require\n'
            '    a complete document can render it without a bundler.\n'
            'paths: {}\n'
            '\n'
        )
        comp_path.write_text(envelope + text, encoding='utf-8')
        print(f'  wrapped  components/{short}.yaml')

    print('\nDone.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
