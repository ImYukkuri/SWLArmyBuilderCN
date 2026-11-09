"""Enrich the private maintenance library without changing the converter catalog."""
import copy,json,re,shutil
from pathlib import Path
from datetime import datetime,timezone
from catalog_schema import norm,keyword_ref
from upgrade_schema import compact_upgrade
from server import ROOT,atomic,encoded,digest

OVERRIDES={'armament-maul-darksaber':2632,'bo-katan-darksaber':22612,'din-djarin-darksaber':22611,'gideon-darksaber':6132,'sabine-darksaber':71,'saxon-darksaber':22610,'beskad-duelist-clan':22602,'cis-crab-twin':16578,'isp-twin-blaster':964,'combat-armor':20272,'combat-armor-rebel':20282,'heavy-blaster-pistol':20275,'heavy-blaster-pistol-rebel':20284,'galaar-90-sniper':22419,'galaar-90-sniper-leader':22654,'gar-jedi-guardian':18478,'jedi-guardian':20431,'heavy-rook-kast':2718,'rook-kast-clan':22593,'plo-koon':150,'plo-koon-leader':22964,'super-commando-gunslinger':22600,'super-commando-marksman':2717,'super-commando-marksman-super':22601,'stormtrooper-dlt19':7,'stormtrooper-rt97c':121,'tristan-wren-clan':22608,'ursa-wren-clan':22650,'training-dug-in':19830,'training-imperial-march':19828,'kraken':20803,'b2-anti-infantry-missile':23145,'b2-anti-infantry-missile-flipside':23145,'cassian-a280-pistol':142,'commandos-sniper-b':15012,'training-stance-a':179,'training-stance-b':179}
FIELDS=['requiredProperties','availableIn','unavailableIn','unavailableWith','requiresTier','requiredDivisions','unique','limit','chooseOneKey','addProperties','replaceProperties','modifiedPointsWith','poolBonuses','tierCounting','replaceTier','requiredChildren','quantityLimitedBy','unlimited','unlockedBy','factions']
def backup(path):
    if path.exists():
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');atomic(ROOT/'history/migrations'/(stamp+'-'+path.name),path.read_bytes())
def rules(source,kind):
    result={key:copy.deepcopy(source[key])for key in FIELDS if key in source and source[key]not in [None,[],{}]}
    props=result.get('requiredProperties')
    if props and all(isinstance(x,dict)for x in props):result['requiredProperties']=[props]
    if kind=='upgrades':result['slotTypes']=source['type']if isinstance(source['type'],list)else[source['type']];result['locallyUnique']=True
    return result
def main():
    target=ROOT/'data/upgrades.json'
    if target.exists():raise SystemExit('Maintenance upgrade library exists; use editor, do not overwrite.')
    source=json.loads((ROOT/'references/upstream/legion.json').read_bytes());data=source['data'];legacy=json.loads((ROOT/'references/upgrades-slim.json').read_bytes())['cards'];defs=json.loads((ROOT/'data/catalog-definitions.json').read_bytes())
    units=json.loads((ROOT/'data/units.json').read_bytes());upbyid={str(s['id']):s for s in data['upgrades']};result=[];used=set();crosswalk=[]
    for card in legacy:
        keys={norm(n)for n in [card['name'],*card.get('names',[])]};matches=[s for s in data['upgrades']if norm(s['name'])in keys]
        chosen=upbyid.get(str(OVERRIDES.get(card['id'])))
        if not chosen and len(matches)==1:chosen=matches[0]
        # Exact unit scope disambiguates e.g. Empire/Rebel weapon versions.
        if not chosen and matches and card.get('requiredUnitNames'):
            unitids={int(u['id'])for u in data['units']if norm(u['name'])in {norm(n)for n in card['requiredUnitNames']}}
            scoped=[s for s in matches if any(isinstance(i,int)and i in unitids for i in s.get('availableIn',[]))]
            if len(scoped)==1:chosen=scoped[0]
        image=ROOT/'assets/upgrade-cards'/(card['id']+'.webp');original=ROOT.parent/'LegionHelper - 副本/upgradecards/card'/image.name
        if original.is_file():image.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(original,image)
        z=card.get('zh',{});row={'id':card['id'],'name':{'en':card['name'],'zh':z.get('name','')},'points':chosen['points']if chosen else card.get('cost'),'slotIds':[],'usage':'counterpart'if chosen and chosen['type']==15 else'campaign'if card['id'].startswith('tod-')else'unit_upgrade','description':{'en':card.get('description',[]),'zh':z.get('description',[])},'requirementsText':z.get('requirements',[]),'keywords':[keyword_ref(k,defs)for k in z.get('keywords',[])],'weapons':copy.deepcopy(card.get('weapons',[])),'assets':{'front':image.relative_to(ROOT).as_posix()if image.exists()else None},'rules':rules(chosen,'upgrades')if chosen else{},'review':{'status':'needs_review','notes':'','issues':[]},'matching':{'status':'matched'if chosen else'unmatched','candidates':[str(m['id'])for m in matches]}}
        if chosen:
            used.add(str(chosen['id']));row['upstream']={'collection':'upgrades','id':str(chosen['id'])};row['slotIds']=row['rules']['slotTypes'];row['selectionGroup']='upgrade:'+str(chosen['id'])
            if card.get('cost')!=row['points']:row['review']['issues'].append(f"原映射 {card.get('cost')} 分；参考版本 {row['points']} 分。")
        else:row['review']['issues'].append('未匹配上游机器约束；战役卡或卡面别名请人工校对，不能视为无限制。')
        row['review']['issues'].append('机器限制已导入；执行语义和卡面仍需校对。')
        for w,zweapon in zip(row['weapons'],z.get('weapons',[])):w['zh']=copy.deepcopy(zweapon)
        result.append(row);crosswalk.append({'localId':row['id'],'upstreamId':row.get('upstream',{}).get('id'),'status':row['matching']['status']})
    for s in data['upgrades']:
        if str(s['id'])in used:continue
        rr=rules(s,'upgrades');result.append({'id':'upstream-'+str(s['id']),'name':{'en':s['name'],'zh':''},'points':s['points'],'slotIds':rr['slotTypes'],'usage':'counterpart'if s['type']==15 else'unit_upgrade','description':{'en':[],'zh':[]},'requirementsText':[],'keywords':[],'weapons':[],'assets':{'front':None},'rules':rr,'upstream':{'collection':'upgrades','id':str(s['id'])},'selectionGroup':'upgrade:'+str(s['id']),'matching':{'status':'upstream_only','candidates':[]},'review':{'status':'needs_review','notes':'','issues':['仅有上游结构化记录；缺少本地卡图/中文对应。']}})
    # Restore unit constraints with clear army / counterpart contexts.
    for c in units['units']:
        s=next(s for s in data[c['upstream']['collection']]if str(s['id'])==c['upstream']['id'])
        c['usage']='counterpart'if c.get('isCounterpart')else'army_unit';c['rules']=rules(s,c['upstream']['collection'])
        if c.get('isCounterpart'):
            c['rules']['slotTypes']=[15];c['rules']['countsAsActivation']=False;c['rules']['costViaUpgrade']=True
        else:c['rules']['memberships']=copy.deepcopy(s['factions']);c['rules'].pop('factions',None)
    defs['upgrades']=[{'id':str(s['id']),'name':{'en':s['name'],'zh':next((c['name']['zh']for c in result if c.get('upstream',{}).get('id')==str(s['id'])and c['name']['zh']), '')},'slotIds':s['type']if isinstance(s['type'],list)else[s['type']]}for s in data['upgrades']]
    defs['sourceUnits']=[{'id':str(s['id']),'name':{'en':s['name']+(' · '+s['title']if s['title']else''),'zh':next((c['name']['zh']for c in units['units']if c['upstream']['id']==str(s['id'])and c['upstream']['collection']=='units'),'')}}for s in data['units']]
    defs['sourceKeywords']=[{'id':s['id'],'name':{'en':s['name'],'zh':''}}for s in data['keywords']]
    defs['options']=[{'id':s.get('id',s['name']),'name':{'en':s['name'],'zh':''}}for s in data['factions']for s in s.get('options',[])]
    defs['gameModes']=copy.deepcopy(source['gameModes']);defs['tierRequirementSets']=copy.deepcopy(source['tierRequirementSets'])
    result=[compact_upgrade(c,defs)for c in result]
    stamp=datetime.now(timezone.utc).isoformat();units['updatedAt']=stamp
    for path,value in [(ROOT/'data/units.json',units),(ROOT/'data/catalog-definitions.json',defs),(target,{'schema':'swl-upgrades/v1','referenceVersion':source['update']['contentVersion'],'updatedAt':stamp,'cards':result}),(ROOT/'data/armies.json',{'schema':'swl-army-library/v1','armies':[]}),(ROOT/'data/upgrade-crosswalk.json',{'records':crosswalk,'summary':{'legacy':len(legacy),'matched':sum(bool(c['upstreamId'])for c in crosswalk),'unmatched':sum(not c['upstreamId']for c in crosswalk),'upstreamOnly':sum(c['matching']['status']=='upstream_only'for c in result)}})]:
        backup(path);atomic(path,encoded(value))
    print('Upgrade records:',len(result),'matched legacy:',sum(bool(c['upstreamId'])for c in crosswalk),'images:',sum(bool(c['assets']['front'])for c in result))
if __name__=='__main__':main()
