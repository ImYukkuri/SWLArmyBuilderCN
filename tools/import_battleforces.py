#!/usr/bin/env python3
# Import battle-force (battleForces) data from the upstream snapshot.
# Source: references/upstream/legion.json -> data.factions (battle-force records).
# tierRequirements.tiers[].tier == local rankId (Commander=1, Corps=2, Special=3, Support=4, Heavy=5, Operative=6).
# Usage: python tools/import_battleforces.py [--apply]
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = ROOT / 'references/upstream/legion.json'
SLOTRULES = ROOT / 'data/slot-rules.json'
ARMIES = ROOT / 'data/catalog-definitions.json'


def quotas(tier_req):
    out = {'rankQuotas': [], 'combined': []}
    for t in (tier_req or {}).get('tiers', []):
        out['rankQuotas'].append({'rankId': t['tier'], 'min': t.get('minimum', 0), 'max': t.get('maximum', 0)})
    out['combined'] = (tier_req or {}).get('combined') or []
    return out


def battleforce_ids(defs):
    return [a['id'] for a in defs['armies'] if a.get('parentName') or a['id'] in (8, 9, 14)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()
    up = json.loads(UPSTREAM.read_text(encoding='utf-8'))
    pkg = json.loads(SLOTRULES.read_text(encoding='utf-8'))
    defs = json.loads(ARMIES.read_text(encoding='utf-8'))
    factions = {f['id']: f for f in up['data']['factions']}
    bf = pkg.setdefault('battleForces', {})
    for aid in battleforce_ids(defs):
        army = next(a for a in defs['armies'] if a['id'] == aid)
        src = factions.get(aid)
        if not src:
            print(aid, army['name']['en'], 'no upstream record')
            continue
        entry = bf.setdefault(str(aid), {})
        entry['name'] = src.get('name') or army['name']['en']
        entry['parentFaction'] = src.get('parentFaction') or army.get('parentName')
        entry['alignment'] = src.get('alignment')
        modes = {}
        for mode in ('standard', 'recon'):
            tr = (src.get('tierRequirements') or {}).get(mode)
            if tr:
                modes[mode] = quotas(tr)
        if modes:
            entry['modes'] = modes
        if src.get('rules'):
            entry['textRules'] = list(src['rules'])
        if src.get('options'):
            entry['options'] = [{'id': o.get('id'), 'name': o.get('name'), 'chooseOneKey': o.get('chooseOneKey')} for o in src['options']]
        entry.setdefault('machineRules', [])
        entry['status'] = 'text_only' if src.get('rules') else 'quotas_only'
        print(aid, '|', entry['name'], '| modes', len(modes), '| rules', len(src.get('rules') or []), '| options', len(src.get('options') or []))
    print('battleForces:', len(bf))
    if args.apply:
        text = json.dumps(pkg, ensure_ascii=False, indent=2) + chr(10)
        SLOTRULES.write_text(text, encoding='utf-8')
        print('applied')


if __name__ == '__main__':
    main()