#!/usr/bin/env python3
# Fill keyword parameterRef (unit / unit type) from existing parameter names.
# parameterRef makes ENTOURAGE/RETINUE targets deterministic; a name that matches
# several local cards (same-name variants) keeps the name so all variants match.
# Usage: python tools/migrate_keyword_refs.py [--apply]
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UNITS = ROOT / 'data/units.json'
KINDS = ('entourage', 'retinue', 'detachment')


def norm(v):
    return re.sub(r'[^a-z0-9]', '', str(v or '').lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    data = json.loads(UNITS.read_text(encoding='utf-8'))
    units = {u['id']: u for u in data['units']}
    by_name = {}
    for u in data['units']:
        key = norm((u.get('name') or {}).get('en'))
        if key:
            by_name.setdefault(key, []).append(u['id'])
    stats = {'filled': 0, 'ambiguous': [], 'unresolved': [], 'skipped': 0}
    for u in data['units']:
        for kw in u.get('keywords') or []:
            if kw.get('id') not in KINDS:
                continue
            if kw.get('parameterRef'):
                stats['skipped'] += 1
                continue
            name = kw.get('parameter')
            if not name:
                stats['unresolved'].append((u['id'], kw.get('id'), None))
                continue
            hits = by_name.get(norm(name), [])
            if len(hits) == 1:
                kw['parameterRef'] = {'kind': 'unit', 'id': hits[0]}
                stats['filled'] += 1
            elif len(hits) > 1:
                stats['ambiguous'].append((u['id'], kw.get('id'), name, hits))
            else:
                stats['unresolved'].append((u['id'], kw.get('id'), name))
    print(json.dumps({k: (v if not isinstance(v, list) else len(v)) for k, v in stats.items()}, ensure_ascii=False))
    for row in stats['ambiguous']:
        print('AMBIGUOUS', row)
    for row in stats['unresolved']:
        print('UNRESOLVED', row)
    if args.apply:
        UNITS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + chr(10), encoding='utf-8')
        print('applied')


if __name__ == '__main__':
    main()