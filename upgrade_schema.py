"""Normalize legacy upgrade terms onto the unit editor's shared keyword IDs."""
import copy,re

def normalize_army_faces(army, upgrades, units):
    """Return a copy with legacy back IDs mapped to one physical upgrade."""
    result=copy.deepcopy(army)
    aliases={c['back']['legacyId']:c for c in upgrades.values()
             if c.get('dualSided') and c.get('back',{}).get('legacyId')}
    for inst in result.get('units',[]):
        for choice in inst.get('upgrades',[]):
            old=choice.get('upgradeId');card=aliases.get(old) or upgrades.get(old)
            if not card:continue
            if old in aliases:
                choice['upgradeId']=card['id'];choice['face']='back'
                slots=(units.get(inst.get('unitId')) or {}).get('upgradeSlots',[])
                sources=[s.get('id') if isinstance(s,dict) else s for s in slots]
                index=choice.get('slotIndex',-1)
                if 0<=index<len(sources) and sources[index] not in card['slotIds']:
                    free=next((i for i,s in enumerate(sources) if s in card['slotIds'] and not any(c is not choice and c.get('slotIndex')==i for c in inst['upgrades'])),None)
                    if free is not None:choice['slotIndex']=free
            if card.get('dualSided'):choice['face']='back' if choice.get('face')=='back' else 'front'
    return result

def reference(term,definitions):
    known={k['id']:k for k in definitions['keywords']}
    candidates=[term.get('ruleId'),term.get('id'),re.sub(r'_x$','',term.get('id',''))]
    key=next((k for k in candidates if k in known),None)
    if not key:
        key=term.get('ruleId')or term.get('id')or'pending_unknown'
        definitions['keywords'].append({'id':key,'name':{'en':term.get('id',key),'zh':term.get('label','')},'summary':term.get('summary')or'','full':term.get('full')or'','timing':term.get('timing',[]),'status':'needs_review'})
    result={'id':key}
    for prop in ['value','parameter','action']:
        if term.get(prop)is not None:result[prop]=copy.deepcopy(term[prop])
    return result

def compact_upgrade(card,definitions):
    c=copy.deepcopy(card);c['keywords']=[reference(t,definitions)for t in c['keywords']]
    for w in c['weapons']:
        zh=w.pop('zh',{})
        if isinstance(w['name'],str):w['name']={'en':w['name'],'zh':zh.get('name','')}
        w['keywords']=[reference({**t,**next((z for z in zh.get('keywords',[])if z.get('id')==t.get('id')),{}),**{k:t[k]for k in ['value','parameter','action']if k in t}},definitions)for t in w['keywords']]
    return c
