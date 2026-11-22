"""Migrate active command cards to local, typed requirements (with an external backup)."""
import argparse
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from command_requirements import validate


def migrate(definitions, units, package):
    result = copy.deepcopy(definitions)
    by_source = {}
    for unit in units:
        if unit.get('upstream', {}).get('collection') == 'units':
            by_source.setdefault(str(unit['upstream']['id']), []).append(unit['id'])
    # This locally-created replacement has no import ID; its exact name AND
    # title identify the missing mounted version, without changing unit data.
    mounted = [u['id'] for u in units if u['name']['en'] == 'Obi-Wan Kenobi' and u['title']['en'] == 'Mounted Jedi General']
    if len(mounted) != 1:
        raise ValueError('Expected one local Mounted Jedi General Obi-Wan')
    by_source['36283'] = mounted
    removed = {}
    count = 0
    universal = {1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21}
    def unit(field, values):
        return {'type': 'unit', 'all': [{'field': field, 'values': values}]}
    for card in result['commands']:
        if card.get('hidden') or 'requirements' in card:
            continue
        scopes = [[]]
        factions = set(card.get('factions') or [])
        if factions and not universal <= factions:
            parents = sorted(factions & {1, 2, 4, 5, 6, 8, 9})
            scopes = [[{'type': 'armyFaction', 'values': parents}]] if parents else []
            extras = []
            for id in sorted(factions - set(parents)):
                bf = package['battleForces'].get(str(id), {})
                parent = bf.get('v2', {}).get('parentFactionId') or next((a['id'] for a in definitions['armies'] if bf.get('parentFaction') in a['name'].values()), None)
                if parent not in parents:
                    extras.append(id)
            if extras:
                scopes.append([{'type': 'battleForce', 'values': extras}])
        alternatives, ids = [], []
        for unlock in card.get('unlockedBy') or []:
            if unlock['propertyName'] != 'units':
                raise ValueError('Unexpected legacy upgrade unlock')
            if 'id' in unlock:
                linked = by_source.get(str(unlock['id']), [])
                if not linked:
                    removed.setdefault(str(unlock['id']), []).append(card['id'])
                ids.extend(linked)
            else:
                field = {'faction': 'factionId', 'affiliation': 'affiliationIds'}[unlock['property']]
                value = str(unlock['value']) if field == 'affiliationIds' else unlock['value']
                alternatives.append(unit(field, [value]))
        if ids:
            alternatives.insert(0, unit('id', sorted(set(ids))))
        if card.get('unlockedBy') and not alternatives:
            raise ValueError('No local unlock remains: ' + card['id'])
        if card['id'] in ('49', '51', '54'):
            alternatives = [unit('nameIdentityId', ['obi-wan-kenobi'])]
        if card['id'] == '20052':
            alternatives = [{'type': 'unit', 'all': [
                {'field': 'nameIdentityId', 'values': ['obi-wan-kenobi']},
                {'field': 'title', 'values': ['Mounted Jedi General']},
            ]}]
        if card['id'] == '20053':
            alternatives = [unit('title', ['Mounted Jedi General'])]
        if card.get('requiredUnitGroups'):
            if card['id'] != '18903':
                raise ValueError('Unexpected multiple-unit requirement')
            alternatives = [{'type': 'unitNames', 'values': ['Han Solo', 'Luke Skywalker']}]
        groups = [{'all': scope + ([alternative] if alternative else [])} for scope in scopes for alternative in alternatives or [None]]
        card['requirements'] = {'any': [group for group in groups if group['all']]}
        validate(card['requirements'])
        for key in ('factions', 'unlockedBy', 'requiredUnitGroups', 'titleMatch', 'mercenary', 'condition'):
            card.pop(key, None)
        count += 1
    return result, {'migrated': count, 'retiredSourceAlternativesRemoved': removed, 'mountedObiWan': mounted[0]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-dir', type=Path, required=True)
    backup = parser.parse_args().backup_dir.resolve()
    if backup == ROOT or backup.is_relative_to(ROOT):
        raise ValueError('Backup directory must be outside the repository')
    backup.mkdir(parents=True, exist_ok=True)
    path = ROOT / 'data/catalog-definitions.json'
    content = path.read_bytes()
    target = backup / 'catalog-definitions-before-command-migration.json'
    if not target.exists():
        target.write_bytes(content)
    definitions, report = migrate(json.loads(content), json.loads((ROOT/'data/units.json').read_bytes())['units'], json.loads((ROOT/'data/slot-rules.json').read_bytes()))
    if report['migrated']:
        path.write_text(json.dumps(definitions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
