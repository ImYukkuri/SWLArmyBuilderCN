"""Canonical compact records and shared ID dictionaries; supports legacy history."""
import copy,json,re,unicodedata
from pathlib import Path
ROOT=Path(__file__).resolve().parent
DEFINITIONS=ROOT/'data/catalog-definitions.json'
def norm(s):return re.sub('[^a-z0-9]+','',unicodedata.normalize('NFKD',s or'').encode('ascii','ignore').decode().lower())
RANK_IDS={'commander':1,'operative':6,'corps':2,'special-forces':3,'support':4,'heavy':5}
FACTION_IDS={'rebels':1,'empire':2,'mercenary':3,'republic':4,'separatists':5,'mandalorian':6}
AFFILIATION_IDS={'pyke_syndicate':'1','black_sun':'2','raiders':'3','rogue':'6','ewoks':'7','clan_covert':'965','clan_kryze':'1081','clan_wren':'1082','clan_saxon':'1083','creedless':'1084','maul_loyalists':'5'}
def keyword_ref(k,definitions):
    if 'id'in k and 'raw'not in k:return copy.deepcopy(k)
    key=k.get('ruleId')
    if not key:
        key='pending_'+re.sub('[^a-z0-9]+','_',k.get('raw','unknown').lower()).strip('_')
    if not any(d['id']==key for d in definitions['keywords']):
        definitions['keywords'].append({'id':key,'name':{'en':k.get('raw','Unknown'),'zh':k.get('label','')},'summary':'','full':'','timing':[],'status':'unresolved'})
    out={'id':key}
    for name in ['value','parameter','action']:
        v=k.get(name)
        if v is not None and v!='none':out[name]=v
    return out
def definitions_by_id(definitions):return {d['id']:d for d in definitions['keywords']}
def compact_card(card,definitions):
    if 'factionId'in card:return copy.deepcopy(card)
    c=copy.deepcopy(card)
    result={k:c[k]for k in ['id','name','title','points','upgradeSlots','stats','assets','review']}
    result.update(factionId=FACTION_IDS.get((c.get('factions')or[''])[0]),factions=[],affiliationIds=[AFFILIATION_IDS[a]for a in c.get('affiliations',[])if a in AFFILIATION_IDS],rankId=RANK_IDS.get(c.get('rank')),unitTypeId=None)
    if c.get('rank')=='counterpart':result['isCounterpart']=True
    typ=norm(c.get('unitType',{}).get('en',''))
    matches=[t for t in definitions['unitTypes']if norm(t['name']['en'])==typ]
    if matches:result['unitTypeId']=matches[0]['id']
    result['keywords']=[keyword_ref(k,definitions)for k in c.get('keywords',[])]
    result['weapons']=[{**{k:copy.deepcopy(w[k])for k in ['name','range','dice']},'keywords':[keyword_ref(k,definitions)for k in w['keywords']]}for w in c.get('weapons',[])]
    if c.get('specialRules'):result['specialRules']=c['specialRules']
    return result
def migrate_legacy(card):
    if 'factionId'in card:return copy.deepcopy(card)
    return compact_card(card,json.loads(DEFINITIONS.read_bytes()))
