"""Normalize legacy upgrade terms onto the unit editor's shared keyword IDs."""
import copy,re

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
