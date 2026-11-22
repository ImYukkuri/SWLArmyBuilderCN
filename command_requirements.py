"""Typed command-card requirements for storage validation and the V1 preview.

V2 previews already use the browser engine through battleforce_bridge.
Groups are alternatives; atoms in a group must all hold. Unit filters refer
to one effective unit, while unitNames requires distinct army instances.
"""
import unicodedata

FIELDS = {'id', 'name', 'title', 'nameIdentityId', 'factionId', 'affiliationIds', 'rankId', 'unitTypeId', 'keywords'}


def normalize(value):
    return ' '.join(unicodedata.normalize('NFKC', str(value or '')).split()).lower()


def validate(value):
    def obj(v, keys):
        return isinstance(v, dict) and set(v) <= set(keys)
    def values(v, numeric=False):
        return isinstance(v, list) and 0 < len(v) <= 256 and all(
            type(x) is int and x > 0 if numeric else isinstance(x, str) and x.strip() for x in v
        ) and len(set(v)) == len(v)
    if not obj(value, ['any']) or not isinstance(value.get('any'), list) or len(value['any']) > 32:
        raise ValueError('使用条件需要 any 条件组数组')
    for group in value['any']:
        if not obj(group, ['all']) or not isinstance(group.get('all'), list) or not 0 < len(group['all']) <= 32:
            raise ValueError('条件组至少需要一个条件')
        for atom in group['all']:
            if isinstance(atom, dict) and atom.get('type') == 'unit':
                if not obj(atom, ['type', 'all']) or not isinstance(atom.get('all'), list) or not 0 < len(atom['all']) <= 16:
                    raise ValueError('单位匹配至少需要一个筛选条件')
                for f in atom['all']:
                    if not obj(f, ['field', 'values']) or not isinstance(f.get('field'), str) or f['field'] not in FIELDS or not values(f.get('values'), f.get('field') in ('factionId', 'rankId', 'unitTypeId')):
                        raise ValueError('单位匹配方式或取值无效')
            elif not obj(atom, ['type', 'values']) or atom.get('type') not in ('unitNames', 'armyFaction', 'battleForce', 'upgrade') or not values(atom.get('values'), atom['type'] in ('armyFaction', 'battleForce')) or atom['type'] == 'unitNames' and len(atom['values']) < 2:
                raise ValueError('匹配方式或取值无效；名称组合至少选择两个名称')


def context(army, units, upgrades, definitions, package, apply_effects):
    indexes = {field: {} for field in FIELDS}
    selected = set()
    for index, inst in enumerate(army.get('units', [])):
        unit = units.get(inst.get('unitId'))
        if not unit:
            continue
        equipped = [upgrades[c['upgradeId']] for c in inst.get('upgrades', []) if c.get('upgradeId') in upgrades]
        selected.update(c['id'] for c in equipped)
        unit = apply_effects(unit, equipped, definitions)
        for field in FIELDS:
            if field in ('name', 'title'):
                vals = (unit.get(field) or {}).values()
            elif field == 'keywords':
                vals = [k['id'] for k in unit.get('keywords', [])]
            elif field == 'affiliationIds':
                vals = unit.get(field, [])
            else:
                vals = [unit.get(field)]
            for value in vals:
                if value is None or value == '':
                    continue
                key = normalize(value) if field in ('name', 'title') else str(value)
                indexes[field].setdefault(key, set()).add(index)
    faction, seen = army.get('armyId'), set()
    while faction not in seen:
        seen.add(faction)
        bf = package.get('battleForces', {}).get(str(faction), {})
        parent = bf.get('v2', {}).get('parentFactionId')
        if parent is None:
            parent = next((a['id'] for a in definitions.get('armies', []) if bf.get('parentFaction') and bf['parentFaction'] in a.get('name', {}).values()), None)
        if parent is None:
            break
        faction = parent
    return {'indexes': indexes, 'upgrades': selected, 'faction': faction, 'armyId': army.get('armyId')}


def failures(requirements, ctx):
    validate(requirements)
    def hits(f):
        return set().union(*(ctx['indexes'][f['field']].get(normalize(v) if f['field'] in ('name', 'title') else str(v), set()) for v in f['values']))
    def check(atom):
        kind = atom['type']
        if kind == 'unit':
            return bool(set.intersection(*(hits(f) for f in atom['all'])))
        if kind == 'unitNames':
            sets = [hits({'field': 'name', 'values': [v]}) for v in atom['values']]
            owners = {}
            def assign(i, seen):
                for instance in sets[i] - seen:
                    seen.add(instance)
                    if instance not in owners or assign(owners[instance], seen):
                        owners[instance] = i
                        return True
                return False
            return all(assign(i, set()) for i in range(len(sets)))
        if kind == 'upgrade':
            return any(v in ctx['upgrades'] for v in atom['values'])
        return ctx['faction' if kind == 'armyFaction' else 'armyId'] in atom['values']
    groups = [[atom for atom in group['all'] if not check(atom)] for group in requirements['any']]
    return min(groups, key=len) if groups else []
