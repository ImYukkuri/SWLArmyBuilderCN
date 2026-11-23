"""Stable numeric identities, scoped to each card catalog (units / upgrades).

Existing string IDs remain the rule references. The high-water mark and retired
IDs live in the same JSON as the cards, so saving either is one atomic write.
Call these helpers under the catalog's normal revision check and write lock.
"""


def valid(value):
    return type(value) is int and 0 < value <= 9007199254740991


def assign(catalog, key, card, previous=None, *, restoring=False):
    records = catalog[key]
    retired = catalog.get('retiredNumericIds', {})
    known = [c['numericId'] for c in records if valid(c.get('numericId'))]
    known += [value for value in retired.values() if valid(value)]
    next_id = max([catalog.get('nextNumericId', 1), *(value + 1 for value in known)])
    supplied = card.get('numericId')
    if previous and valid(previous.get('numericId')):
        number = previous['numericId']
        if supplied is not None and supplied != number and not restoring:
            raise ValueError('数字 ID 自动分配，已保存卡牌的数字 ID 不可修改')
    elif card['id'] in retired:
        if not restoring:
            raise ValueError('该 ID 已删除并保留编号，请从历史恢复，或使用新的固定 ID')
        number = retired[card['id']]
    else:
        # Never trust copied/new draft numbers, including IDs in old snapshots.
        number = next_id
    if not valid(number):
        raise ValueError('数字 ID 必须为有效的正整数')
    if any(c['id'] != card['id'] and c.get('numericId') == number for c in records):
        raise ValueError('数字 ID 冲突，请检查卡牌数据')
    card['numericId'] = number
    catalog['nextNumericId'] = max(next_id, number + 1)
    if restoring:
        retired.pop(card['id'], None)


def retire(catalog, card):
    if valid(card.get('numericId')):
        catalog.setdefault('retiredNumericIds', {})[card['id']] = card['numericId']
        catalog['nextNumericId'] = max(catalog.get('nextNumericId', 1), card['numericId'] + 1)


def migrate(catalog, key):
    """One-time, idempotent allocation. Existing numeric IDs are never changed."""
    seen = set()
    for card in catalog[key]:
        number = card.get('numericId')
        if number is not None:
            if not valid(number) or number in seen:
                raise ValueError('已有数字 ID 无效或重复')
            seen.add(number)
    for card in catalog[key]:
        if card.get('numericId') is None:
            assign(catalog, key, card)
