"""Optional Mandalorian faction plugin; mirrors mandalorian-rules.js.

No imports of the core engine: the host passes its small calculation interface.
All generated cards are in-memory copies and can be removed with this plugin.
"""
from copy import deepcopy
import re

INITIATES = 'mercenary-creedless-mandalorian-initiates'
TOOLS = ['flame-projector', 'mandalorian-rockets-clan', 'whipcord-launcher']
VEHICLES = ['mercenary-raiders-aa5-speeder-truck', 'empire-tx-225', 'mercenary-raiders-wlo5-speeder-tank']
OPTIONS = ['veterans', 'toolsOfTrade', 'rapidDeployment', 'gunsForHire', 'featsOfValor']
count_mercenaries = True

def config(army_id, package):
    return package.get('battleForces', {}).get(str(army_id), {}).get('mandalorian')

def applies(army_id, package):
    return config(army_id, package) is not None

def selected(army, package, option):
    return bool((config(army['armyId'], package) or {}).get('custom') and option in army.get('options', []))

def available(card, army, package):
    variant = (card or {}).get('runtimeVariant')
    return not variant or selected(army, package, variant['option'])

def affiliations(unit):
    return [str(a) for a in unit.get('affiliationIds', [])]

def prepare_data(data):
    units, upgrades, package = data['units'], data['upgrades'], data['pkg']
    custom = [int(i) for i in package.get('battleForces', {}) if (config(i,package) or {}).get('custom')]
    if not custom:
        return
    for source_id in TOOLS:
        card_id = 'mc-tools-' + source_id
        if source_id not in upgrades or card_id in upgrades:
            continue
        card = deepcopy(upgrades[source_id])
        card.update(id=card_id,points=0,upstream={'collection':'local','id':card_id},selectionGroup=card_id,
                    runtimeVariant={'sourceId':source_id,'option':'toolsOfTrade','kind':'upgrade'},variantLabel='看家装备 · 免费独特副本')
        card['rules'] = {'unique':True,'uniqueScope':'card','limit':1,'locallyUnique':True,'slotTypes':card['slotIds'][:],'factions':custom}
        card['restrictions'] = {'text':{'zh':['仅限曼达洛人士兵；正常占用升级槽。'],'en':['Mandalorian Trooper only.']},
                                'condition':{'field':'unit.unitSubtypeId','op':'eq','value':'mandalorian_trooper'}}
        if source_id == 'whipcord-launcher':
            for language in ['en','zh']:
                text=' '.join(card['description'][language])
                if '{@icon.action}' in text:
                    card['description'][language]=[text[text.index('{@icon.action}'):]]
        upgrades[card_id] = card
    for source_id in VEHICLES:
        unit_id = 'mc-hired-' + source_id
        if source_id not in units or unit_id in units:
            continue
        unit = deepcopy(units[source_id])
        unit.update(id=unit_id,affiliationIds=['1084'],factions=[{'id':i,'rankId':5} for i in custom],
                    runtimeVariant={'sourceId':source_id,'option':'gunsForHire','kind':'unit'},variantLabel='雇佣火力 · 全军三选一')
        unit['keywords'] += [{'id':'coordinate','parameter':'曼达洛战士','parameterRefs':[{'kind':'nameIdentity','id':'mandalorian-warriors'}]},
                             {'id':'independent','parameter':'激增 1'}]
        units[unit_id] = unit

def rank(unit, army_id, package):
    cfg = config(army_id,package)
    if not cfg:
        return NotImplemented
    if unit.get('runtimeVariant',{}).get('kind') == 'unit':
        return 5 if cfg.get('custom') else None
    base = next((f for f in unit.get('factions',[]) if f['id']==8),None)
    if not base or not set(affiliations(unit)) & set(cfg.get('allowedAffiliations',[])):
        return None
    return base['rankId']

def cap(unit, army_id, package):
    if not applies(army_id,package) or unit['id']!=INITIATES:
        return NotImplemented
    return None if config(army_id,package).get('clanAffiliation')=='965' else 2

def inherited_army_ids(army,package):
    return [8]

def eligibility(card, unit, army, data, core):
    cfg = config(army['armyId'],data['pkg'])
    if not cfg:
        return []
    if 1 in card.get('slotIds',[]):
        icons={'covert':'965','kryze':'1081','wren':'1082','saxon':'1083'}
        text=' '.join(card.get('restrictions',{}).get('text',{}).get('en',[]))
        required=[icons[key] for key in re.findall(r'\{@icon\.clan-(covert|kryze|wren|saxon)\}',text)]
        if required and not set(required) & set(affiliations(unit)):
            return [('invalid','clan_personnel','此人员升级需要对应氏族组织；先配置符合要求的头盔')]
    if 25 not in card.get('slotIds',[]):
        return []
    target = affiliations(core.apply_property_effects(unit,[card],data['defs']))
    if cfg.get('clanAffiliation') and cfg['clanAffiliation'] not in target:
        return [('invalid','clan_helmet','此头盔不属于当前选择的氏族')]
    if cfg.get('custom') and '1084' not in target:
        return [('invalid','clan_helmet','自定义氏族须保留曼达洛人组织')]
    return []

def owns_point_modifier(modifier):
    return modifier.get('property')=='options' and modifier.get('id') in ('veterans','Children of the Watch')

def adjustment(card, unit, army, package):
    cfg = config(army['armyId'],package)
    if not cfg:
        return 0
    if cfg.get('clanAffiliation')=='965' and (unit or {}).get('id')==INITIATES and card.get('rules',{}).get('unique') and 1 in card.get('slotIds',[]):
        return -5
    if selected(army,package,'veterans') and card['id']=='galaar-15-carbines' and (unit or {}).get('nameIdentityId')=='mandalorian-warriors':
        return -5
    return 0

def required_child_active(child,army,package):
    clans={'Children of the Watch':'965','Clan Kryze':'1081','Clan Wren':'1082','Clan Saxon':'1083'}
    return not child.get('with') or clans.get(child['with'])==config(army['armyId'],package).get('clanAffiliation')

def validate(army,data,core,issue):
    if not applies(army['armyId'],data['pkg']):
        return
    effective=[]
    for inst in army.get('units',[]):
        unit=data['units'].get(inst['unitId'])
        if unit:
            cards=[data['upgrades'][ch['upgradeId']] for ch in inst.get('upgrades',[]) if ch['upgradeId'] in data['upgrades']]
            effective.append((inst,core.apply_property_effects(unit,cards,data['defs']),core.army_rank(unit,army['armyId'],data['pkg'],data['defs'],data['units'])))
    leaders=[u for _,u,r in effective if r in (1,6)]
    if not any(r==1 for _,_,r in effective) and any(1 in u.get('rules',{}).get('tierCounting',{}).get('waivesMinimum',{}).get('tiers',[]) for _,u,_ in effective):
        issue('invalid','rank_min','曼达洛军表须包含至少 1 个指挥官',None,{'rank':1})
    for inst,unit,rank_id in effective:
        if not any(set(affiliations(unit)) & set(affiliations(leader)) for leader in leaders):
            issue('invalid','battle_force_affiliation','需要至少一个具有相同组织的指挥官或特工（按已装备升级后的组织判断）',inst['instanceId'],{'rank':rank_id})
    if config(army['armyId'],data['pkg']).get('custom'):
        count=len(set(army.get('options',[])) & set(OPTIONS))
        if count!=2:
            issue('invalid','battle_force_options',f'自定义氏族须选择 2 条规则，当前已选择 {count} 条',None)
    hired=[i for i in army.get('units',[]) if data['units'].get(i['unitId'],{}).get('runtimeVariant',{}).get('option')=='gunsForHire']
    if len(hired)>1:
        for inst in hired:
            issue('invalid','clan_hired_limit','雇佣火力：三种载具全军合计最多 1 辆',inst['instanceId'],{'rank':5})
