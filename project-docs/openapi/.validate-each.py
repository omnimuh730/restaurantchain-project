"""Validate that EVERY .yaml file in this folder is a parseable standalone OpenAPI 3.1 doc.

For each file, check:
  * YAML parses;
  * top-level `openapi:` field starts with `3.`;
  * `info:` has `title` and `version`;
  * `paths:` exists (may be empty);
  * every local (`#/...`) `$ref` resolves inside the same document.

Cross-file refs (`./other.yaml#/...`) are resolved if the other file exists, but
their absence does NOT fail this check (Swagger Preview tolerates them too).
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml


HERE = Path(__file__).resolve().parent


def resolve_pointer(doc, pointer):
    if pointer in ('', '/'):
        return doc
    node = doc
    for raw in pointer.lstrip('/').split('/'):
        token = raw.replace('~1', '/').replace('~0', '~')
        if isinstance(node, list):
            node = node[int(token)]
        elif isinstance(node, dict):
            if token not in node:
                raise KeyError(f'missing {token!r} in {pointer!r}')
            node = node[token]
        else:
            raise KeyError(f'cannot descend into scalar at {pointer!r}')
    return node


def collect_local_refs(node, parent=None):
    out = []
    parent = parent or []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == '$ref' and isinstance(value, str) and value.startswith('#/'):
                out.append((value, parent + [key]))
            else:
                out.extend(collect_local_refs(value, parent + [str(key)]))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            out.extend(collect_local_refs(value, parent + [str(i)]))
    return out


def main() -> int:
    files = sorted(HERE.rglob('*.yaml'))
    bad = 0
    print(f'validating {len(files)} files as standalone OpenAPI 3.1 docs:\n')
    for path in files:
        rel = path.relative_to(HERE)
        try:
            with path.open(encoding='utf-8') as f:
                doc = yaml.safe_load(f)
        except yaml.YAMLError as exc:
            bad += 1
            print(f'  PARSE FAIL  {rel}\n    {exc}')
            continue

        problems: list[str] = []

        version = (doc or {}).get('openapi') if isinstance(doc, dict) else None
        if not isinstance(version, str) or not version.startswith('3.'):
            problems.append(f"missing or invalid `openapi:` (got {version!r})")

        info = (doc or {}).get('info') if isinstance(doc, dict) else None
        if not isinstance(info, dict) or not info.get('title') or not info.get('version'):
            problems.append('missing `info.title` or `info.version`')

        if 'paths' not in (doc or {}):
            problems.append('missing `paths:` (Swagger requires it; can be {})')

        for ref, where in collect_local_refs(doc):
            try:
                resolve_pointer(doc, ref[1:])  # strip leading '#'
            except (KeyError, ValueError, IndexError) as exc:
                problems.append(f"local ref {ref!r} at /{'/'.join(where)} -> {exc}")

        if problems:
            bad += 1
            print(f'  FAIL  {rel}')
            for p in problems:
                print(f'    - {p}')
        else:
            print(f'  ok    {rel}')

    print()
    if bad:
        print(f'{bad} file(s) failed.')
        return 1
    print('All files are standalone-renderable.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
