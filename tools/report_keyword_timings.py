"""List the 28 reviewed keyword timings and their current card references.

Reads local IDs and explicit upstream mappings only; never edits game data.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REVIEWED_IDS = ('eyes_on_the_prize', 'permanent', 'hover_ground', 'associate', 'equip',
                'were_not_regs', 'aid', 'allies_of_convenience', 'mercenary', 'detachment',
                'heavy_weapon_team', 'incognito', 'enrage', 'exemplar', 'field_commander',
                'teamwork', 'leader', 'sidearm', 'entourage', 'plodding', 'unconcerned',
                'command_vehicle', 'weighed_down', 'programmed', 'hold_the_line',
                'pending_i_m_part_of_the_squad_too', 'counterpart', 'flexible_response')
LABELS = {'global': '全局', 'army_building': '组军', 'setup': '设置',
          'deployment': '部署', 'command': '命令阶段', 'activation_start': '激活开始',
          'activation': '激活', 'activation_end': '激活结束', 'movement': '移动',
          'attack': '攻击', 'defense': '防御', 'end_round': '回合结束'}


def read(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf8'))


def name(card):
    n, t = card.get('name') or {}, card.get('title') or {}
    label = lambda value: value if isinstance(value, str) else value.get('zh') or value.get('en')
    return ' · '.join(x for x in [label(n) or card.get('id', '未命名'), label(t)] if x)


def report():
    defs = read('catalog-definitions.json')
    by_id = {k['id']: k for k in defs['keywords']}
    keywords = [by_id[key] for key in REVIEWED_IDS]
    ids = {k['id']: k['id'] for k in keywords}
    ids.update({str(i): k['id'] for k in keywords for i in k.get('upstreamIds', [])})
    found = {k['id']: {} for k in keywords}
    catalogs = [('单位', read('units.json')['units']), ('升级卡', read('upgrades.json')['cards']),
                ('指挥卡', defs.get('commands', []))]
    for kind, cards in catalogs:
        for card in cards:
            def add(refs, location):
                for ref in refs or []:
                    ref_id = ref.get('id') if isinstance(ref, dict) else ref
                    key = ids.get(str(ref_id))
                    if key:
                        item = found[key].setdefault((kind, card['id']), {'card': card, 'locations': []})
                        if location not in item['locations']:
                            item['locations'].append(location)

            faces = [('正面', card)]
            if card.get('dualSided') and card.get('back'):
                faces.append(('反面', card['back']))
            for face_name, face in faces:
                add(face.get('keywords'), face_name + '词条')
                for weapon in face.get('weapons') or []:
                    add(weapon.get('keywords'), face_name + '武器：' + name(weapon))
                for field in ['addProperties', 'replaceProperties']:
                    for group in (face.get('rules') or {}).get(field) or []:
                        for prop in group:
                            if isinstance(prop, dict) and prop.get('property') == 'keywords':
                                add(prop.get('value'), face_name + '规则授予')
            if card.get('equipUpgradeIds') or card.get('equipSlotIds'):
                add(['equip'], 'Equip 关联')

    lines = ['# 词条时机确认与卡牌引用清单', '',
             '来源：当前本地 JSON。此表只列词条名称和卡牌引用，不修改时机归属。', '',
             '写表器与词条编辑器已区分 `global`（全局）和 `army_building`（组军）。'
             '以下 28 项按用户于 2026-11-16 提供的完整时机列表更新，未列出的旧时机已移除。'
             '表格直接读取当前 JSON；保留原编号，便于后续校对。', '',
             '时机只决定展示分组，不改变统率、附属、配备、灵活响应等规则引擎按词条 ID 执行的效果。'
             '多时机在每个分组各显示一次；已标记行动类型的词条仍优先进入“行动”。', '',
             '写表器主界面隐藏组军分组；单位详情与候选选择完整显示。'
             '例如统率在主界面保留命令阶段，在详情中同时显示组军和命令阶段。', '',
             '统计包含单位、升级卡正反面、武器、指挥卡的显式词条引用，以及明确 ID 的规则授予和 Equip 关联。'
             '每类同一卡牌仅计一次；不根据效果正文猜测词条，也不把所有可装备单位重复列作引用。'
             '“未发现引用”表示当前结构化数据未关联，不代表游戏中没有该词条。', '',
             '| 序号 | 词条 | ID | 当前时机 | 单位 / 升级卡 / 指挥卡 |',
             '| --- | --- | --- | --- | --- |']
    for i, k in enumerate(keywords, 1):
        counts = [sum(key[0] == kind for key in found[k['id']]) for kind, _ in catalogs]
        timings = '、'.join(LABELS.get(t, t) for t in k['timing']) or '—'
        lines.append(f"| {i} | {name(k)} | `{k['id']}` | {timings} | {' / '.join(map(str, counts))} |")
    for i, k in enumerate(keywords, 1):
        lines.extend(['', f"## {i}. {name(k)} · {k['id']}", ''])
        if not found[k['id']]:
            lines.append('未发现结构化卡牌引用。')
        for kind, _ in catalogs:
            entries = [(cid, item) for (category, cid), item in found[k['id']].items() if category == kind]
            if not entries:
                continue
            lines.extend([f'**{kind}**', ''])
            for cid, item in entries:
                lines.append(f"- {name(item['card'])}（`{cid}`；{'、'.join(item['locations'])}）")
            lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


if __name__ == '__main__':
    target = ROOT / 'docs/KEYWORD_TIMING_REVIEW.md'
    target.write_text(report(), encoding='utf8')
    print(target.relative_to(ROOT).as_posix())
