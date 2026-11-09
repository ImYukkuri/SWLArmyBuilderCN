"""Rebuild the local review queue from the current edited source file."""
import collections,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def main():
    catalog=json.loads((ROOT/'data/units.json').read_bytes());units=catalog['units'];unresolved=[];weapons=[];incomplete=[]
    compact=catalog['schema']=='swl-unit-catalog/v2'
    definitions=json.loads((ROOT/'data/catalog-definitions.json').read_bytes())if compact else{}
    rules={k['id']:k for k in definitions.get('keywords',[])}
    evidence=json.loads((ROOT/'data/extraction-evidence.json').read_bytes())['units']if compact else{}
    for u in units:
        for group,owner in [(u,'unit')]+[(w,w['name']['en'])for w in u['weapons']]:
            for k in group['keywords']:
                if compact:
                    rule=rules[k['id']]
                    if rule.get('status')in ['unresolved','english_only']:unresolved.append({'unitId':u['id'],'owner':owner,'id':k['id'],'raw':rule['name']['en'],'status':rule['status']})
                elif not k['ruleId']:unresolved.append({'unitId':u['id'],'owner':owner,'raw':k['raw'],'originalRaw':k.get('originalRaw',k['raw'])})
        for w in u['weapons']:
            missing=[k for k,v in w['dice'].items()if v is None]
            missing_range=w['range']['min']is None and w['range'].get('type')!='overrun'
            if missing or missing_range:weapons.append({'unitId':u['id'],'weapon':w['name']['en'],'missingDice':missing,'missingRange':missing_range})
        needed=['models','wounds']+([]if u.get('isCounterpart')or u.get('rank')=='counterpart'else['speed','defenseDie','attackSurge','defenseSurge'])
        missing=[k for k in needed if u['stats'].get(k)is None and not u['stats'].get(k+'Symbol')]
        if missing:incomplete.append({'unitId':u['id'],'missing':missing})
    summary={'cards':len(units),'frontImages':len(list((ROOT/'assets/unit-cards').rglob('*.webp'))),'linkedPortraits':len({u['assets']['portrait']for u in units}),'mappedCardIdentities':sum(bool(u.get('upstream'))if compact else u['mapping']['matched']for u in units),'unitsWithChineseNames':sum(bool(u['name']['zh'])for u in units),'weapons':sum(len(u['weapons'])for u in units),'unitKeywords':sum(len(u['keywords'])for u in units),'weaponKeywords':sum(len(w['keywords'])for u in units for w in u['weapons']),'unresolvedKeywords':len(unresolved),'unitRecordsWithIncompleteStats':len(incomplete),'weaponRecordsWithIncompleteDiceOrRange':len(weapons),'missingPoints':sum(u['points']is None for u in units),'missingUpgradeSlots':sum(u['upgradeSlots']is None for u in units),'layouts':dict(collections.Counter((evidence[u['id']]['source']if compact else u['source'])['layout']for u in units))}
    report={'schema':'swl-extraction-review/v2'if compact else'swl-extraction-review/v1','summary':summary,'limits':['Card text and image values still need human review.','Points, speed and upgrade slots imported from selected upstream snapshot; not an official accuracy guarantee.','Conditional slots are recorded, not evaluated; army-building constraints are deferred.'],'unmappedNames':[{'id':u['id'],'name':u['name'],'title':u['title']}for u in units if not(u.get('upstream')if compact else u['mapping']['matched'])],'unresolvedKeywords':unresolved,'incompleteStats':incomplete,'incompleteWeapons':weapons}
    (ROOT/'data/extraction-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
