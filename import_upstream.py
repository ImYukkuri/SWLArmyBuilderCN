"""Reviewable exact/scoped import of the owner-selected upstream snapshot.

Copies only selected fields. No implicit rule engine or broad name fuzzy matching.
"""
import collections,copy,hashlib,json,re
from datetime import datetime,timezone
from pathlib import Path
from catalog_schema import ROOT,FACTION_IDS,RANK_IDS,norm,compact_card
from server import atomic,encoded,digest
URL='https://nowforwrath.github.io/legion.json'
SLOTS={1:('Personnel','人员'),2:('Gear','装备'),3:('Grenades','手雷'),4:('Heavy Weapon','重武器'),5:('Force','原力'),6:('Comms','通讯'),7:('Pilot','驾驶员'),8:('Hardpoint','挂载点'),9:('Command','指挥'),10:('Training','训练'),11:('Generator','发生器'),12:('Armament','武装'),13:('Crew','乘员'),14:('Ordnance','弹药'),15:('Counterpart','伙伴'),16:('Electrobinoculars','电动双筒望远镜专用'),17:('Portable Scanner','便携扫描仪专用'),18:('Protocol','程序'),19:('Squad Leader','小队队长'),20:('Strike and Fade','打了就跑专用'),21:('Door Gunners','舱门机枪手专用'),22:('Imperial March','帝国行军专用'),23:('Dug In','掘壕专用'),24:('Doctrine','学说'),25:('Helmet','头盔'),26:('Hit the Dirt','卧倒专用')}
FACTION_ZH={1:'义军',2:'帝国',3:'佣兵',4:'共和国',5:'分离主义',6:'犯罪辛迪加'}
ARMY_ZH={1:'义军',2:'帝国',4:'银河共和国',5:'分离主义联盟',7:'帝国残部',8:'曼达洛氏族',9:'暗影集团',10:'冲锋队营',11:'分离主义入侵部队',12:'212攻击营',13:'回声基地守军',14:'奥纳卡帮',15:'快速拦截部队',16:'501军团',17:'暴雪部队',18:'亮树村',19:'暴风部队',20:'实验机器人',21:'伍基守军'}
RANK_ZH={1:'指挥官',6:'特工',2:'核心',3:'特种部队',4:'支援',5:'重型'}
TYPE_ZH={1:'士兵',2:'反重力载具',3:'地面载具',4:'架设士兵',5:'克隆人士兵',6:'机器人士兵',7:'生物士兵',9:'曼达洛士兵'}
AFF_ZH={'1':'派克辛迪加','2':'黑日','3':'威奎海盗','6':'义军无赖','7':'伊沃克','965':'守望之子','1081':'克里兹氏族','1082':'雷恩氏族','1083':'萨克森氏族','1084':'曼达洛人','5':'摩尔的打手'}
# Explicit version/name differences reviewed from local cards and upstream records.
OVERRIDES={'separatists-geonosian-engineer':'34054','republic-delta-squad':'24084','mercenary-ewoks-c3po-golden':'15016','mercenary-ewoks-logray':'16687','rebels-sleeper-cell':'25968','republic-r2d2-gar':'56','republic-arf-troopers':'28861'}
COUNTERPARTS={'empire-id10-seeker':167,'republic-c3po':131,'rebels-c-3po-cyborg':131,'mercenary-clan-covert-grogu-covert':22586,'mercenary-rogue-omega':15628}
def match(card,data):
    if card['id']in COUNTERPARTS:
        return next(u for u in data['upgrades']if u['id']==COUNTERPARTS[card['id']]),'upgrades','counterpart_explicit'
    if card['id']in OVERRIDES:return next(u for u in data['units']if u['id']==OVERRIDES[card['id']]),'units','reviewed_alias'
    choices=[u for u in data['units']if norm(u['name'])==norm(card['name']['en'])and norm(u['title'])==norm(card['title']['en'])]
    if len(choices)>1:
        faction=FACTION_IDS.get(card['factions'][0]);scoped=[u for u in choices if u['faction']==(6 if faction==3 else faction)]
        if len(scoped)==1:choices=scoped
    if len(choices)==1:return choices[0],'units','name_title_faction'
    return None,None,'unresolved'
def create_definitions(upstream):
    d=upstream['data'];rules={k['identifier']:k for p in ['tactical-keywords-supplement.zh.json','keywords-supplement.zh.json','keywords.zh.json']for k in json.loads((ROOT/'references'/p).read_bytes())}
    definitions={'schema':'swl-catalog-definitions/v1','keywords':[],
      'factions':[{'id':f['id'],'name':{'en':f['name'],'zh':FACTION_ZH[f['id']]},'color':f.get('color')}for f in d['faction']],
      'armies':[{'id':f['id'],'name':{'en':f['name'],'zh':ARMY_ZH.get(f['id'],'')},'parentName':f.get('parentFaction')}for f in d['factions']],
      'ranks':[{'id':r['id'],'name':{'en':r['name'],'zh':RANK_ZH[r['id']]},'order':r['rank']}for r in d['ranks']],
      'unitTypes':[{'id':t['id'],'name':{'en':t['name'],'zh':TYPE_ZH[t['id']]}}for t in d['unitTypes']],
      'affiliations':[{'id':a['id'],'name':{'en':a['name'],'zh':AFF_ZH[a['id']]},'color':a['color']}for a in d['affiliation']],
      'upgradeSlots':[], 'upgrades':[]}
    for key,k in rules.items():
        en=k.get('rulebook_english_heading')or key.replace('_',' ').title()
        definitions['keywords'].append({'id':key,'name':{'en':en,'zh':k['rulebook_heading']},'summary':k['summary'],'full':k['rulebook_quote'],'timing':k['timing']})
    definitions['unitTypes'] += [{'id':'local:wookiee_trooper','name':{'en':'Wookiee Trooper','zh':'伍基人士兵'}},{'id':'local:heavy_droid_trooper','name':{'en':'Heavy Droid Trooper','zh':'重型机器人士兵'}},{'id':'local:flying_vehicle','name':{'en':'Flying Vehicle','zh':'飞行载具'}}]
    def rulekey(name):return norm(re.sub(r'\b[XxYy]\b|\d+','',re.split('[:：]',name)[0]))
    for k in definitions['keywords']:
        k['upstreamIds']=[v['id']for v in d['keywords']if rulekey(v['name'])==rulekey(k['name']['en'])]
    for slot,(en,zh)in SLOTS.items():
        examples=[u['name']for u in d['upgrades']if slot in(u['type']if isinstance(u['type'],list)else[u['type']])]
        source=upstream['iconLibrary'].get(en)
        definitions['upgradeSlots'].append({'id':slot,'name':{'en':en,'zh':zh},'kind':'dedicated'if slot in [16,17,20,21,22,23,26]else'category','icon':f'assets/slot-icons/{slot}.webp'if source else None,'iconUrl':source,'examples':examples[:5],'meaningStatus':'data_label'if source else'inferred_from_upgrade_types'})
    return definitions
def main():
    original=(ROOT/'data/units.json').read_bytes();old=json.loads(original)
    if old['schema']!='swl-unit-catalog/v1':raise SystemExit('Already migrated. Reconcile updates explicitly; do not re-import over edited v2 records.')
    upstream=json.loads((ROOT/'references/upstream/legion.json').read_bytes());data=upstream['data'];defs=create_definitions(upstream);evidence={'schema':'swl-extraction-evidence/v1','units':{}};comparison=[];units=[];unmatched=[];unlock_ids=set()
    for card in old['units']:
        u,collection,method=match(card,data);c=compact_card(card,defs);changes=[]
        evidence['units'][card['id']]={k:copy.deepcopy(card[k])for k in ['source','mapping']if k in card}
        evidence['units'][card['id']]['keywords']=copy.deepcopy(card['keywords']);evidence['units'][card['id']]['weapons']=[copy.deepcopy(w.get('source',{}))for w in card['weapons']]
        if u is None:unmatched.append({'id':card['id'],'name':card['name']});units.append(c);continue
        c['upstream']={'collection':collection,'id':str(u['id'])}
        def assign(key,value,obj=c):
            if obj.get(key)!=value:changes.append({'field':('stats.'if obj is c['stats']else'')+key,'before':obj.get(key),'after':value});obj[key]=copy.deepcopy(value)
        assign('points',u['points'])
        if collection=='units':
            if c['stats'].get('speed')is None:assign('speed',u['speed'],c['stats'])
            elif c['stats']['speed']!=u['speed']:changes.append({'field':'stats.speed','before':c['stats']['speed'],'upstream':u['speed'],'resolution':'retain_card_image_value'})
            assign('factionId',u['faction'])
            # Preserve per-army rank; deduplicate identical entries in the source.
            assign('factions',list({(f['id'],f['rank']):{'id':f['id'],'rankId':f['rank']}for f in u['factions']}.values()))
            ranks={f['rank']for f in u['factions']if f['id']==u['faction']}
            if len(ranks)==1:assign('rankId',next(iter(ranks)))
            if c.get('unitTypeId')is None:assign('unitTypeId',u['unitType'])
            elif c['unitTypeId']!=u['unitType']:changes.append({'field':'unitTypeId','before':c['unitTypeId'],'upstream':u['unitType'],'resolution':'retain_card_image_value'})
            assign('affiliationIds',[str(u['affiliation'])]if u.get('affiliation')else[])
            slots=[];conditional=[]
            for slot in u['upgradeTypes']:
                if isinstance(slot,int):slots.append(slot)
                elif 'unlockedBy'in slot:
                    conditional.append({'id':slot['id'],'upgradeId':str(slot['unlockedBy'])});unlock_ids.add(str(slot['unlockedBy']))
                else:slots.append({'id':slot['id'],'required':bool(slot.get('required'))})
            assign('upgradeSlots',slots)
            if conditional:c['conditionalUpgradeSlots']=conditional
            for field,v in [('models',u['figures']),('wounds',u['health'])]:
                if card['stats'].get(field)!=v:changes.append({'field':'stats.'+field,'before':card['stats'].get(field),'upstream':v,'resolution':'retain_card_image_value'})
            if card['id']=='republic-arf-troopers':
                assign('name',{'en':u['name'],'zh':'ARF士兵'})
            evidence['units'][c['id']]['upstreamKeywords']=u['keywords']
            # Card edition names stay as printed. Aliases document spelling/version changes.
            if norm(u['name'])!=norm(card['name']['en'])or norm(u['title'])!=norm(card['title']['en']):changes.append({'field':'identity','card':[card['name']['en'],card['title']['en']],'upstream':[u['name'],u['title']],'resolution':'reviewed_alias_keep_printed_name'})
        else:
            c['upgradeSlots']=[];c['isCounterpart']=True;c['rankId']=None
            c['factions']=[{'id':i,'rankId':None}for i in u.get('factions',[])]
        c['review']['issues']=[s for s in c['review']['issues']if not s.startswith('仅有正面图')]
        if any(x.get('resolution')=='retain_card_image_value'for x in changes):c['review']['issues'].append('上游与卡图的属性存在差异，暂保留卡图值；详见 comparison.json。')
        comparison.append({'id':c['id'],'upstream':c['upstream'],'matchMethod':method,'changes':changes});units.append(c)
    defs['upgrades']=[{'id':str(v['id']),'name':{'en':v['name'],'zh':''},'slotIds':v['type']if isinstance(v['type'],list)else[v['type']]}for v in data['upgrades']if str(v['id'])in unlock_ids]
    # Link unresolved terms to exact upstream labels without importing the rulebook.
    for k in defs['keywords']:
        if k.get('status')!='unresolved':continue
        matches=[v for v in data['keywords']if norm(v['name'])==norm(k['name']['en'])]
        if len(matches)==1:k['upstreamIds']=[matches[0]['id']];k['full']=matches[0]['definition'];k['status']='english_only'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');atomic(ROOT/'history'/(stamp+'-'+digest(original)[:12]+'.json'),original)
    version=upstream['update']['contentVersion'];catalog={'schema':'swl-unit-catalog/v2','updatedAt':datetime.now(timezone.utc).isoformat(),'definitions':'catalog-definitions.json','referenceVersion':version,'units':units}
    report={'schema':'swl-upstream-comparison/v1','url':URL,'contentVersion':version,'sha256':digest((ROOT/'references/upstream/legion.json').read_bytes()),'counts':{'localCards':len(units),'upstreamUnits':len(data['units']),'matched':len(comparison),'unmatched':len(unmatched)},'unmatched':unmatched,'records':comparison,'notImported':['encyclopedia','campaigns','packs','quantityLimitedBy','ignoreMinimum','unavailableWith','tierCounting','poolBonuses','requiredChildren','ttsName'],'fieldPolicy':{'points':'upstream','speed':'fill missing only; retain existing card values and report conflicts','upgradeSlots':'upstream, conditions kept separate','keywords':'printed card values and action types + shared rule IDs; upstream keyword lists mix weapon and unit rules','models/health/courage':'retain card values; differences reported'}}
    for name,value in [('catalog-definitions.json',defs),('extraction-evidence.json',evidence),('comparison.json',report),('units.json',catalog)]:atomic(ROOT/'data'/name,encoded(value))
    print(json.dumps(report['counts']));print('Units bytes:',len(original),'->',len(encoded(catalog)))
if __name__=='__main__':main()
