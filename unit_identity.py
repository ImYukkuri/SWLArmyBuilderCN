"""Explicit local unit-ID changes; never rewrite text, upstream IDs or namespaces."""
import copy
import re


def resolve_id(value, aliases):
    seen = set()
    while value in aliases and value not in seen:
        seen.add(value)
        value = aliases[value]
    return value


def rewrite_references(value, old_id, new_id):
    if isinstance(value, list):
        return [rewrite_references(v, old_id, new_id) for v in value]
    if not isinstance(value, dict):
        return value
    result = {k: rewrite_references(v, old_id, new_id) for k, v in value.items()}
    if value.get('kind') == 'unit' and value.get('id') == old_id:
        result['id'] = new_id
    if value.get('unitId') == old_id:
        result['unitId'] = new_id
    if value.get('field') == 'unit.id':
        target = value.get('value')
        if target == old_id:
            result['value'] = new_id
        elif isinstance(target, list):
            result['value'] = [new_id if v == old_id else v for v in target]
    return result


def rename_documents(documents, old_id, new_id):
    if not isinstance(new_id, str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,150}', new_id):
        raise ValueError('单位 ID 只能包含小写英文字母、数字、连字符和下划线，长度 1–151')
    if new_id == old_id:
        raise ValueError('新 ID 与当前 ID 相同')
    catalog = documents['units.json']
    card = next((u for u in catalog['units'] if u['id'] == old_id), None)
    if card is None:
        raise ValueError('原单位 ID 不存在，请重新载入')
    if any(u['id'] == new_id for u in catalog['units']) or new_id in catalog.get('idAliases', {}):
        raise ValueError('该 ID 已存在或用于旧军表兼容，请选择其他 ID')
    refs = documents.get('tts-names.json', {}).get('units', {})
    if new_id in refs:
        raise ValueError('该 ID 已被 TTS 引用占用')
    result = {name: rewrite_references(copy.deepcopy(doc), old_id, new_id)
              for name, doc in documents.items()}
    catalog = result['units.json']
    next(u for u in catalog['units'] if u['id'] == old_id)['id'] = new_id
    aliases = catalog.setdefault('idAliases', {})
    for alias, target in list(aliases.items()):
        if resolve_id(target, aliases) == old_id:
            aliases[alias] = new_id
    aliases[old_id] = new_id
    refs = result.get('tts-names.json', {}).get('units', {})
    if old_id in refs:
        refs[new_id] = refs.pop(old_id)
    return result
