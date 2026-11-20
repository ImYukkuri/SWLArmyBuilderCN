"""Structural checks for editable machine restrictions, not a full game interpreter."""
import math
ARRAY_FIELDS={'availableIn','unavailableWith','requiresTier','requiredDivisions','poolBonuses','requiredChildren','quantityLimitedBy','factions','slotTypes','modifiedPointsWith','addProperties','replaceProperties','slotGrants'}
BOOL_FIELDS={'unique','unlimited','locallyUnique'}
KNOWN=ARRAY_FIELDS|BOOL_FIELDS|{'requiredProperties','limit','chooseOneKey','exclusion','tierCounting','replaceTier','unlockedBy'}
def validate_rules(rules):
    if not isinstance(rules,dict):raise ValueError('限制规则必须为对象')
    for key,value in rules.items():
        if value is None:continue
        if key in ARRAY_FIELDS and not isinstance(value,list):raise ValueError(key+' 必须为数组')
        if key in BOOL_FIELDS and type(value)is not bool:raise ValueError(key+' 必须为布尔值或 null')
        if key=='limit'and(type(value)is not int or value<0):raise ValueError('limit 必须为非负整数或 null')
        if key=='exclusion':
            if not isinstance(value,dict) or not isinstance(value.get('name'),str):
                raise ValueError('互斥命名依据必须为文本')
            if value.get('scope') not in ('unit','army'):
                raise ValueError('互斥作用域必须为同单位卡（unit）或同军表（army）')
        if key=='tierCounting'and not isinstance(value,dict):raise ValueError('tierCounting 必须为对象')
        if key=='requiredProperties':
            if not isinstance(value,list)or any(not isinstance(group,list)for group in value):raise ValueError('requiredProperties 必须为 OR 包含 AND 分组')
            for group in value:
                for atom in group:
                    if not isinstance(atom,dict)or not isinstance(atom.get('property'),str)or 'value'not in atom:raise ValueError('条件需要 property 和 value')
        if key in ['addProperties','replaceProperties']:
            if any(not isinstance(g,list)or any(not isinstance(a,dict)or 'property'not in a or'value'not in a for a in g)for g in value):raise ValueError(key+' 需要属性效果分组')
        if key=='slotTypes'and any(type(v)is not int or not 1<=v<=30 for v in value):raise ValueError('槽位类别需要有效 ID')
        if key=='availableIn':
            for target in value:
                if isinstance(target, dict):
                    # Retain pre-existing source condition groups on edited cards.
                    if set(target) == {'all'} and isinstance(target['all'], list) and all(isinstance(a, dict) for a in target['all']):
                        continue
                    if set(target) != {'kind','id'} or target.get('kind') != 'unit' or not isinstance(target.get('id'),str) or not target['id']:
                        raise ValueError('允许的本地单位需要 {kind: "unit", id: "固定 ID"}')
                elif type(target) not in (int,str) or not str(target):
                    raise ValueError('允许的单位需要本地单位引用或来源编号')
        if key=='slotGrants':
            for grant in value:
                if not isinstance(grant, dict):raise ValueError('槽位授予必须为对象')
                if 'holders' in grant:
                    if not isinstance(grant['holders'], list):raise ValueError('指定单位必须为数组')
                    validate_rules({'availableIn': grant['holders']})
                for condition_key in ('condition', 'when'):
                    if grant.get(condition_key) is not None and not isinstance(grant[condition_key], dict):
                        raise ValueError('槽位授予条件必须为表达式对象')
                if 'ifAbsentAny' in grant and (not isinstance(grant['ifAbsentAny'], list) or
                        any(not isinstance(s, str) or not s for s in grant['ifAbsentAny'])):
                    raise ValueError('缺少槽位条件需要槽位标识数组')
    def walk(v):
        if isinstance(v,float)and not math.isfinite(v):raise ValueError('JSON 数值必须有限')
        if isinstance(v,dict):
            for child in v.values():walk(child)
        if isinstance(v,list):
            for child in v:walk(child)
    walk(rules)
