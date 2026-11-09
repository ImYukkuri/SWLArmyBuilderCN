"""Incremental enrichment: never regenerate cards or overwrite hand-edited fields."""
import collections,copy,difflib,json,re
from datetime import datetime,timezone
from pathlib import Path
from server import ROOT,DATA,HISTORY,LOCK,atomic,encoded,digest,validate
from action_icons import detect_lines

def norm(text):
    import unicodedata
    return re.sub('[^a-z0-9]+','',unicodedata.normalize('NFKD',text).encode('ascii','ignore').decode().lower())
def label_value(values,key):
    matches={v for k,v in values.items()if norm(k)==norm(key)and v}
    return next(iter(matches))if len(matches)==1 else None
def name_indexes(mapping):
    names=collections.defaultdict(set);titles=collections.defaultdict(set)
    for u in mapping['units']:
        if u['name']['zh']:names[norm(u['name']['en'])].add(u['name']['zh'])
        if u['title']['zh']:titles[norm(u['title']['en'])].add(u['title']['zh'])
    return names,titles
def fill_names(card,mapping,local):
    names,titles=name_indexes(mapping);changed=[]
    for field,index,extras in [('name',names,local['names']),('title',titles,local['titles'])]:
        if card[field]['zh']or not card[field]['en']:continue
        en=card[field]['en'];candidates=index.get(norm(en),set());value=next(iter(candidates))if len(candidates)==1 else label_value(extras,en)
        if value:card[field]['zh']=value;changed.append(field)
    return changed
def line_key(text):
    key=norm(text)
    # Compare source words, ignoring OCR's rendering of a leading arrow.
    key=re.sub(r'^(?:4a|4p|4|aa|ap|ay|ah|slump|allume)(?=jump|calculate|repair|observe|spotter|bolster|guidance)','',key)
    return key
def apply_actions(card,lines):
    changed=[];used=set()
    for i,k in enumerate(card['keywords']):
        if k.get('action')is not None and not k.get('actionDetection'):continue
        raw=line_key(k.get('originalRaw')or k['raw']);ranked=[]
        for n,line in enumerate(lines):
            key=line_key(line['text']);score=difflib.SequenceMatcher(None,raw,key).ratio()
            if raw==key:score=1
            elif len(raw)>=4 and raw in key:score=max(score,.9)
            ranked.append((score,n,line))
        ranked.sort(key=lambda x:x[0],reverse=True)
        if not ranked or ranked[0][0]<.62:continue
        score,n,line=ranked[0]
        # Only first printed term on a line inherits its icon; later terms are passive.
        fullkey=line_key(line['text'])
        leading=n not in used and(fullkey.startswith(raw)or score>=.86 and raw not in fullkey)
        action=line['action']if leading else'none'
        if action!='none':used.add(n)
        k['action']=action;k['actionDetection']={'method':'printed_symbol','bbox':line['bbox']if leading else None,'score':line['score']if leading else None,'lineRaw':line['text'],'matchScore':round(score,3)};changed.append(i)
    return changed

def main():
    mapping=json.loads((ROOT/'references/unit-names.zh.json').read_bytes());local=json.loads((ROOT/'references/name-translations.local.json').read_bytes());jobs=json.loads((ROOT/'work/weapon-jobs.json').read_bytes());byimage={j['image']:j for j in jobs}
    original=DATA.read_bytes();catalog=json.loads(original)
    if catalog['schema']!='swl-unit-catalog/v1':raise SystemExit('This legacy enrichment handles v1 only. Edit v2 ID references in the editor; archived evidence stays unchanged.')
    before=copy.deepcopy(catalog);name_count=0;actions=0
    detections={}
    cache=ROOT/'work/action-icons.json'
    if cache.exists():detections=json.loads(cache.read_bytes())
    for card in catalog['units']:
        name_count+=bool(fill_names(card,mapping,local))
        lines=detections.get(card['assets']['front'])
        if lines is None:lines=detect_lines(byimage[card['assets']['front']])
        actions+=len(apply_actions(card,lines));validate(card)
    for old,new in zip(before['units'],catalog['units']):
        assert [w['source']for w in old['weapons']]==[w['source']for w in new['weapons']], 'Weapon provenance must not change'
    with LOCK:
        if DATA.read_bytes()!=original:raise RuntimeError('Source changed during enrichment; no overwrite performed')
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');atomic(HISTORY/(stamp+'-'+digest(original)[:12]+'.json'),original)
        # Keep the requested name mapping reusable, including newly translated variants.
        keys={(n['faction'],norm(n['name']['en']),norm(n['title']['en']))for n in mapping['units']}
        for card in catalog['units']:
            key=(card['factions'][0],norm(card['name']['en']),norm(card['title']['en']))
            if key in keys:continue
            mapping['units'].append({'faction':key[0],'name':copy.deepcopy(card['name']),'title':copy.deepcopy(card['title']),
                'weapons':[], 'translationStatus':'local_draft'})
            keys.add(key)
        file=ROOT/'references/unit-names.zh.json';old=file.read_bytes()
        if json.loads(old)!=mapping:
            atomic(HISTORY/'mappings'/(stamp+'-unit-names.zh.json'),old);atomic(file,encoded(mapping))
        catalog['updatedAt']=datetime.now(timezone.utc).isoformat();atomic(DATA,encoded(catalog))
    print('Filled names/titles for',name_count,'cards; assigned',actions,'keyword action types.')
    print(collections.Counter(k['action']for c in catalog['units']for k in c['keywords']))
if __name__=='__main__':main()
