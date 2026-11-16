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
    definitions=json.loads(DEFINITIONS.read_bytes())
    result=compact_card(card,definitions)
    subtype=next((s for s in definitions.get('unitSubtypes',[]) if s['legacyTypeId']==result.get('unitTypeId')),None)
    if 'unitCategoryId' not in result and (subtype or result.get('unitTypeId')==1):
        result['unitCategoryId']=subtype['categoryId'] if subtype else 'trooper'
        result['unitSubtypeId']=subtype['id'] if subtype else None
    if 'nameIdentityId' not in result:
        result['nameIdentityId']=re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',result['name']['en']).encode('ascii','ignore').decode().lower()).strip('-') or result['id']
    if any(k.get('id')=='detachment' and (k.get('parameterRefs') or k.get('parameterRef')) for k in result.get('keywords',[])):
        (result.get('rules') or {}).pop('quantityLimitedBy',None)
    return result

def validate_unit_classification(card,definitions):
    """Keep the new hierarchy coherent with the legacy restriction field."""
    if not any(k in card for k in ('unitCategoryId','unitSubtypeId','nameIdentityId')):return
    category=card.get('unitCategoryId');subtype=card.get('unitSubtypeId')
    if not isinstance(category,str) or category not in {c['id'] for c in definitions.get('unitCategories',[])}:raise ValueError('请选择士兵或载具类型')
    row=next((s for s in definitions.get('unitSubtypes',[]) if s['id']==subtype),None)
    if subtype is not None and (not row or row['categoryId']!=category):raise ValueError('单位子类型不属于所选单位类型')
    if category=='vehicle' and row is None:raise ValueError('载具必须选择地面、反重力或飞机子类型')
    expected=row['legacyTypeId'] if row else 1
    if card.get('unitTypeId')!=expected:raise ValueError('新旧单位类型不一致，请通过类型下拉联动修改')
    if not isinstance(card.get('nameIdentityId'),str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,150}',card['nameIdentityId']):raise ValueError('名称标识需要小写英文字母、数字、连字符或下划线')

def validate_keyword_targets(keyword,definitions,units):
    refs=keyword.get('parameterRefs')
    if refs is not None:
        if not isinstance(refs,list) or not refs:raise ValueError('关联目标必须是非空条件数组')
        if keyword.get('parameterRef') is not None:raise ValueError('请勿同时保存新旧关联目标')
    elif keyword.get('parameterRef') is not None:refs=[keyword['parameterRef']]
    else:return
    tables={'unitCategory':'unitCategories','unitSubtype':'unitSubtypes','unitType':'unitTypes','rank':'ranks'}
    known={kind:[r['id'] for r in definitions.get(table,[])] for kind,table in tables.items()}
    known['unit']=[u['id'] for u in units]
    known['nameIdentity']=[u.get('nameIdentityId') for u in units if u.get('nameIdentityId')]
    seen=set()
    for ref in refs:
        if not isinstance(ref,dict) or not isinstance(ref.get('kind'),str) or ref['kind'] not in known:raise ValueError('关联目标匹配方式无效')
        value=ref.get('id')
        if not any(type(value) is type(v) and value==v for v in known[ref['kind']]):raise ValueError('关联目标不存在：'+str(value))
        key=(ref['kind'],value)
        if key in seen:raise ValueError('关联目标条件不能重复')
        seen.add(key)
