"""Build editable unit records, preserving canonical mapping spelling and uncertainty.

Never replace an edited catalog without --replace. Raw OCR stays under work/;
source data retains compact text and per-field provenance for human review.
"""
import argparse,collections,copy,difflib,hashlib,json,re,unicodedata
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image,ImageOps
from prepare import ROOT,WORK,REGIONS
from server import make_portrait,validate,encoded,atomic
from enrich_catalog import fill_names,apply_actions
from action_icons import detect_lines
from weapon_range import parse_weapon_range

def load(path):return json.loads((ROOT/path).read_text(encoding='utf8'))
def norm(s):return re.sub(r'[^a-z0-9]+','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def similarity(a,b):return difflib.SequenceMatcher(None,norm(a),norm(b)).ratio()
NAMES=load('references/unit-names.zh.json')['units']
RULES={k['identifier']:k for p in ['references/tactical-keywords-supplement.zh.json','references/keywords-supplement.zh.json','references/keywords.zh.json']for k in load(p)}
UPGRADES=load('references/upgrades-slim.json')['cards']
ALIASES={'brock':'block','al':'ai','all':'ai','anti_material':'anti_materiel','prepared_positions':'prepared_position'}
NAME_OVERRIDES={
 'admiral-trench':('Admiral Trench','Fleet Commander'),'b2-rocket':('B2 Super Rocket Battle Droids',''),'aqua-droids':('Aqua Droids',''),
 'geonosian-engineer':('Geonosian Engineers','Warriors'),'save-opress-cis':('Savage Opress',"Dooku's Apprentice"),
 'grievous-wheelbike':('General Grievous','Wheel Bike Warlord'),'super-tactica-command-droid-aux':('Super Tactical Command Droid','Auxiliary Command Droid'),
 'super-tactica-command-droid-cnc':('Super Tactical Command Droid','Command and Control Droid'),
 'gideon':('Moff Gideon','Long Live the Empire'),'ki_aadi_mundu':('Ki-Adi-Mundi','Jedi Council'),'plo_koon':('Plo Koon','Jedi Council'),
 'mace_windu':('Mace Windu','Jedi Council'),'shaak_ti':('Shaak Ti','Jedi Council'),'ahsoka_padawan_commander':('Ahsoka Tano','Padawan Commander'),
 'jedi-barc':('Jedi Knight','Mounted Jedi General'),'anakin-barc':('Anakin Skywalker','Mounted Jedi General'),
 'jedi_knight':('Jedi Knight','Keeper of the Peace'),'jedi_knight_general':('Jedi Knight General','Strong in the Force'),
 'clone_commander_leadership':('Clone Commander','Trained for Leadership'),'cody':('Clone Commander Cody','Leader of the 212th'),
 'padme':('Padmé Amidala','Spirited Senator'),'rex':('Clone Captain Rex','Honorable Soldier'),
 'din-djarin-covert':('Din Djarin','The Mandalorian'),'the-armorer':('The Armorer','Forging the Future'),
 'sabine-wren-clan':('Sabine Wren','Back in the Fold'),'ursa-wren':('Ursa Wren','Leader of Clan Wren'),
 'logray':('Logray','Ewok Shaman'),'wicket':('Wicket','Hero of Bright Tree'),
 'maul-rival':('Maul','A Rival'),'bossk':('Bossk','Trandoshan Terror'),'ig-88':('IG-88','Notorious Assassin Droid'),
 'han-and-chewie':('Han & Chewie','Notorious Scoundrels'),'c-3po-cyborg':('C-3PO','Human Cyborg Relations'),
 'chewbacca_rebel':('Chewbacca','Walking Carpet'),'k-2so':('K-2SO','Sardonic Security Droid'),
 'rebel-agent-defender-democracy':('Rebel Agent','Defender of Democracy'),'mark-2-blaster':('Mark II Medium Blaster Trooper',''),
 'luke-tauntaun':('Luke Skywalker','Commander Skywalker'),'han-solo-tauntaun':('Han Solo','Reluctant Hero'),
 'id10-seeker':("Iden's ID10 Seeker Droid",'“Droid”'),'shoretroopers':('Shoretroopers',''),
 'special-forces':('Imperial Special Forces',''),'stormtroopers':('Stormtroopers',''),
 'at_rt_gar':('AT-RT',''),'at_rt_rebel':('AT-RT',''),'c3po':('C-3PO','Human Cyborg Relations'),
 'r2d2_gar':('R2-D2','Hero of a Thousand Devices'),'r2d2_hero':('R2-D2','Hero of a Thousand Devices'),
 'black-sun-enforcers':('Black Sun Enforcers',''),'black-sun-vigo':('Black Sun Vigo',''),
 'paz-vizsla':('Paz Vizsla','Proud Warrior'),'axe-woves':('Axe Woves','Cunning Warrior'),
 'bo-katan-kryze':('Bo-Katan Kryze','Savior of Mandalore'),'clan-kryze-veterans':('Clan Kryze Veterans',''),
 'mandalorian-hunter':('Mandalorian Hunter',''),'mandalorian-leader':('Mandalorian Leader',''),
 'mandalorian-initiates':('Mandalorian Initiates',''),'mandalorian-warriors-corps':('Mandalorian Warriors',''),
 'mandalorian-warriors-support':('Mandalorian Warriors','Fire Support'),'c3po-golden':('C-3PO','Golden God'),
 'chewbacca':('Chewbacca','Let the Wookiee Win'),'mandalorian-super':('Mandalorian Super Commandos',''),
 'gar-saxon':('Gar Saxon','Militant Commando'),'boba-fett-infamous':('Boba Fett','Infamous Bounty Hunter'),
 'ig-11':('IG-11','Nurse and Protect'),'cad-bane':('Cad Bane','Needs No Introduction'),
 'boba-fett-daimyo':('Boba Fett','Daimyo of Mos Espa'),'omega':('Omega','Mascot of the 99th'),
 'ahsoka':('Ahsoka Tano','Fulcrum'),'imperial-agent-order-to-galaxy':('Imperial Agent','Bringing Order to the Galaxy'),
 'grogu-covert':('Grogu','The Child'),
 'rebel-officer-fight-freedom':('Rebel Officer','Fighting for Freedom'),
}
def words(field,region=None,imheight=726):
    out=[]
    for line in field.get('tsv','').splitlines()[1:]:
        cells=line.split('\t')
        if len(cells)<12 or cells[0]!='5' or not cells[11].strip():continue
        item={'text':cells[11],'x':int(cells[6]),'y':int(cells[7]),'width':int(cells[8]),'height':int(cells[9]),'confidence':float(cells[10]),'line':tuple(cells[1:5])}
        if region:item['globalY']=(item['y']-15)/2+region[1]*imheight
        out.append(item)
    return out
def clean(s):return re.sub(r'^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$','',s.strip()).strip()
def title(s):
    s=clean(s)
    return ' '.join(w if any(c.isdigit()for c in w)or w.isupper()and len(w)<=3 else w.capitalize()for w in s.split())
def name_mapping(job,ocr):
    stem=Path(job['image']).stem.removesuffix('_front');f=Path(job['image']).parts[2];f={'cis':'separatists','gar':'republic','rebel':'rebels'}.get(f,f)
    pool=[n for n in NAMES if n['faction']==f]if f!='mercenary'else NAMES
    lines=[clean(s)for s in ocr['header']['text'].splitlines()if re.search('[A-Za-z]{3}',s)]
    override=NAME_OVERRIDES.get(stem)
    if override:rawname,rawtitle=override;method='reviewed_filename_identity'
    else:rawname=lines[0]if lines else title(stem.replace('_',' ').replace('-',' '));rawtitle=lines[1]if len(lines)>1 else'';method='ocr'
    ranked=[]
    for n in pool:
        ns=similarity(rawname,n['name']['en']);ts=similarity(rawtitle,n['title']['en'])if rawtitle else (1 if not n['title']['en']else 0)
        ranked.append((ns*.75+ts*.25,ns,ts,n))
    ranked.sort(key=lambda x:x[0],reverse=True);score,ns,ts,candidate=ranked[0]if ranked else(0,0,0,None)
    # Require both the unit name and the variant title to avoid cross-version merges.
    matched=candidate if ns>.80 and(ts>.60 or norm(rawtitle)==norm(candidate['title']['en']))else None
    if override and candidate and norm(override[0])!=norm(candidate['name']['en']):matched=None
    if matched:name=copy.deepcopy(matched['name']);subtitle=copy.deepcopy(matched['title'])
    else:name={'en':title(rawname),'zh':''};subtitle={'en':title(rawtitle),'zh':''}
    # Preserve explicit canonical overrides for names not present in the old mapping.
    if override and not matched:name['en'],subtitle['en']=override
    return name,subtitle,matched,{'matched':bool(matched),'method':method,'score':round(score,3),'candidate':(candidate['name']['en']+' / '+candidate['title']['en'])if candidate else''}
def rule_base(k):
    en=k.get('rulebook_english_heading')or k['identifier'].replace('_',' ').upper()
    return re.split(r'\s+X\b|:',en,maxsplit=1)[0].strip()
BASES={norm(rule_base(k)):(key,rule_base(k))for key,k in RULES.items()if rule_base(k)}
def keyword(raw,action=None):
    original=raw;raw=clean(raw);raw=re.sub(r'^(?:aA|ap|4p|4|p|ay|ah)\s*(?=Jump\b|Observe\b|Repair\b)','',raw,flags=re.I)
    for a,b in {'Scour':'Scout','Slump':'Jump','Derfenp':'Defend','Reaby':'Ready','Sreapy':'Steady','Acie':'Agile','Hunteed':'Hunted','Wounb':'Wound'}.items():raw=re.sub(r'^'+a+r'\b',b,raw,flags=re.I)
    if re.search(r'Calcu(?:late|rate)|Calcurate',raw,re.I)and re.search(r'O[bp]*ds|Opps',raw,re.I):raw='Calculate Odds'
    raw=re.sub(r'^All?\s*:','AI:',raw,flags=re.I)
    # Protect the specific immune family; its suffix is not a unit parameter.
    base=raw;parameter=None;value=None
    if ':'in raw:
        base,parameter=map(str.strip,raw.split(':',1))
        if norm(base)=='immune':base=raw;parameter=None
    count=re.search(r'\s+(\d+)$',base)
    if count:value=int(count[1]);base=base[:count.start()]
    key=re.sub('[^a-z0-9]+','_',base.lower()).strip('_');key=ALIASES.get(key,key)
    found=RULES.get(key);method='exact'
    if not found and norm(base)in BASES:key,canonical=BASES[norm(base)];found=RULES[key]
    if not found:
        candidates=sorted(((similarity(base,rule_base(k)),key,k)for key,k in RULES.items()),reverse=True)
        if candidates and candidates[0][0]>=(.96 if norm(base).startswith('immune')else .83):_,key,found=candidates[0];method='ocr_fuzzy'
    if found:
        canonical=rule_base(found)
        # For immutable specific families keep the complete English heading.
        if key.startswith('immune_'):canonical=found['rulebook_english_heading']
        canonical=title(canonical)
        label=found['rulebook_heading'].replace('X',str(value))if value is not None else found['rulebook_heading']
        if parameter:label=re.split('[:：]',label)[0]+'：'+title(parameter)
        en=canonical+(' '+str(value)if value is not None else'')+(': '+title(parameter)if parameter else'')
        return {'raw':en,'originalRaw':original,'ruleId':key,'label':label,'value':value,'parameter':title(parameter)if parameter else None,'action':action,'mappingMethod':method}
    return {'raw':title(raw),'originalRaw':original,'ruleId':None,'label':'','value':value,'parameter':parameter,'action':action,'mappingMethod':'unresolved'}
def split_keywords(text):
    result=[]
    for raw in re.split(r'[.;\n]+',text):
        raw=clean(raw)
        if len(re.sub('[^A-Za-z]','',raw))<3:continue
        # Wrapped parameters continue the preceding line; standalone known terms do not.
        k=keyword(raw)
        if not k['ruleId']and result and ':'in result[-1]and not result[-1].lower().startswith('immune:')and norm(raw)in ['force','droids','commandos','trooper','troopers']:result[-1]+=' '+raw
        else:result.append(raw)
    return [keyword(s)for s in result]
def canonical_weapon(raw,mapping):
    pairs=list(mapping['weapons'])if mapping else[]
    if not pairs:pairs=[w for n in NAMES for w in n['weapons']]
    pairs+= [{'en':w['name'],'zh':z.get('name','')}for c in UPGRADES for w,z in zip(c.get('weapons',[]),c.get('zh',{}).get('weapons',[]))]
    scores=sorted(((similarity(raw,p['en']),-i,p)for i,p in enumerate(pairs)),reverse=True)
    if scores and scores[0][0]>=(.90 if mapping else .94)and re.findall(r'\d+',raw)==re.findall(r'\d+',scores[0][2]['en']):return copy.deepcopy(scores[0][2]),round(scores[0][0],3)
    return {'en':title(raw)or'Unknown Weapon','zh':''},0
def digit_mask(p):
    im=Image.open(p).convert('L');box=ImageOps.invert(im).getbbox()
    return im.crop(box).resize((30,40))if box else im.resize((30,40))
def digit_dist(a,b):return sum(abs(x-y)for x,y in zip(a.getdata(),b.getdata()))/(1200*255)
def number(field):
    s=field['text'].strip();return int(s)if re.fullmatch(r'\d{1,2}',s)else None
def build():
    jobs=load('work/weapon-jobs.json');digits=load('work/digits.json');numbers=load('work/numbers.json');corrections=load('references/visual-corrections.json');templates=collections.defaultdict(list)
    # Dice use their printed numeral shapes, not the arbitrary symbols returned by OCR.
    for j in jobs:
        shapes=load(j['folder']+'/shapes.json')
        for row in shapes['weaponDice']:
            for die in row:
                d=digits[die['image']];v=int(d['text'])if d['text'].isdigit()else None
                if v and v<=6 and d['confidence']>=75:templates[v].append(digit_mask(ROOT/die['image']))
        if'luke_skywalker_hero'in j['image']:
            for d in shapes['weaponDice'][0]:templates[2 if d['color']=='red'else 3].append(digit_mask(ROOT/d['image']))
    units=[]
    for j in jobs:
        ocr=load(j['folder']+'/ocr.json');wp=load(j['folder']+'/weapons.json');shapes=load(j['folder']+'/shapes.json')
        name,subtitle,mapping,matching=name_mapping(j,ocr);issues=['仅有正面图：点数与升级槽在背面，暂留 null。','机器提取初稿：请对照原图校对全部数值、图标与词条。']
        if not mapping:issues.append('名称/称号未能唯一匹配既有中英文映射，保留英文；中文待补。')
        # Exclude weapon panels from keyword OCR by geometry.
        limit=min((r['top']*j['height']for r in j['weaponRows']),default=.99*j['height'])
        groups=collections.OrderedDict()
        for word in words(ocr['keywords'],j['regions']['keywords'],j['height']):
            if word['globalY']>=limit-3:continue
            groups.setdefault(word['line'],[]).append(word['text'])
        unitkeys=split_keywords('\n'.join(' '.join(v)for v in groups.values()))
        weapons=[]
        im=Image.open(ROOT/j['image']).convert('RGB').resize((1040,726))
        for i,row in enumerate(j['weaponRows']):
            raw=clean(wp[f'w{i}_name']['text'])
            if not raw and mapping and i<len(mapping['weapons']):raw=mapping['weapons'][i]['en']
            pair,score=canonical_weapon(raw,mapping)
            ks=split_keywords(wp[f'w{i}_rules']['text']);top=round(row['top']*726)
            dx=350 if j['layout']=='counterpart'else 0;colors=[im.getpixel((x,y))for y in range(top+9,min(725,top+35))for x in range(405+dx,475+dx)]
            red=sum(r>g*1.4 and r>90 for r,g,b in colors);blue=sum(b>r*1.15 and b>80 for r,g,b in colors)
            range_raw=wp[f'w{i}_range']['text']
            rmin,rmax=parse_weapon_range(range_raw,red,blue)
            dice={'red':0,'black':0,'white':0};die_sources=[]
            for die in shapes['weaponDice'][i]:
                d=digits[die['image']];v=int(d['text'])if d['text'].isdigit()and 0<int(d['text'])<=6 else None
                mask=digit_mask(ROOT/die['image']);scores=sorted((min(digit_dist(mask,t)for t in ts),n)for n,ts in templates.items()if ts)
                if scores and scores[0][0]<.19:v=scores[0][1]
                if v is None:dice[die['color']]=None
                elif dice[die['color']]is not None:dice[die['color']]+=v
                die_sources.append({'color':die['color'],'ocr':d['text'],'confidence':d['confidence'],'bbox':die['bbox']})
            if not shapes['weaponDice'][i]:dice={k:None for k in dice}
            if any(v is None for v in dice.values()):issues.append(f'武器 {pair["en"]}：部分骰数未识别。')
            if rmin is None:issues.append(f'武器 {pair["en"]}：射程图标待校对。')
            weapons.append({'name':pair,'range':{'min':rmin,'max':rmax},'dice':dice,'keywords':ks,'source':{'nameRaw':raw,'nameMatchScore':score,'rangeRaw':range_raw,'rulesRaw':wp[f'w{i}_rules']['text'],'panel':[.02,row['top'],.64,row['bottom']],'dice':die_sources}})
        allkeys=unitkeys+[k for w in weapons for k in w['keywords']]
        unresolved=[k['raw']for k in allkeys if not k['ruleId']]
        if unresolved:issues.append('词条未匹配：'+'；'.join(unresolved))
        if not unitkeys and ocr['keywords']['text']:issues.append('单位词条未可靠识别，请对照卡图。')
        if not weapons:issues.append('卡面未发现武器栏；部分单位需通过 Equip 获得武器，请校对。')
        types={'Trooper':'士兵','Droid Trooper':'机器人士兵','Clone Trooper':'克隆人士兵','Mandalorian Trooper':'曼达洛士兵','Wookiee Trooper':'伍基人士兵','Creature Trooper':'生物士兵','Emplacement Trooper':'架设士兵','Heavy Droid Trooper':'重型机器人士兵','Ground Vehicle':'地面载具','Repulsor Vehicle':'反重力载具','Flying Vehicle':'飞行载具'}
        ts=sorted(((similarity(ocr['type']['text'],t),t)for t in types),reverse=True);typ=ts[0][1]if ts[0][0]>.70 else title(ocr['type']['text']);vehicle='vehicle'in typ.lower()
        num=numbers[j['key']];stats={'models':number(num['models']),'wounds':number(num['hp']),'courage':None if vehicle else number(num['courage']),'resilience':number(num['courage'])if vehicle else None,'speed':shapes['speed'],'defenseDie':shapes['defenseDie'],'attackSurge':shapes['attackSurge'],'defenseSurge':shapes['defenseSurge']}
        model_review={'range-trooper':4,'bad-batch-gar':0,'clone_commandos':4,'delta-squad':4,'black-sun-enforcers':4}
        stem=path_stem=Path(j['image']).stem.removesuffix('_front')
        if stem in model_review:stats['models']=model_review[stem]
        elif stats['models']and stats['models']>6:stats['models']=None
        if j['layout']=='counterpart':stats.update(models=1,courage=None,resilience=None,speed=None,defenseDie=None,attackSurge=None,defenseSurge=None)
        for k in ['models','wounds','speed','attackSurge']:
            if j['layout']=='counterpart'and k in ['speed','attackSurge']:continue
            if stats[k]is None:issues.append(f'属性 {k}：未可靠识别，保留 null。')
        path=Path(j['image']);parts=path.parts;f={'cis':'separatists','gar':'republic','rebel':'rebels'}.get(parts[2],parts[2]);affiliations=[parts[3]]if f=='mercenary'else[]
        uid=re.sub(r'[^a-z0-9]+','-',('-'.join([f,*affiliations,path.stem.removesuffix('_front')])).lower()).strip('-')
        bullet=sum(min(im.getpixel((x,y)))>180 for y in range(20,44)for x in range(136,151))
        card={'id':uid,'name':name,'title':subtitle,'factions':[f],'affiliations':affiliations,'rank':shapes['rank'],'unique':bullet>35,'points':None,'unitType':{'en':typ,'zh':types.get(typ,'')},'upgradeSlots':None,'stats':stats,'keywords':unitkeys,'weapons':weapons,'specialRules':[],
          'assets':{'front':j['image'],'portrait':'','portraitCrop':[.005,.20,.333,.915]if j['layout']=='counterpart'else[.669,.174,.998,.725]},
          'mapping':matching,'review':{'status':'needs_review','notes':'','issues':issues},
          'source':{'method':'local_image_ocr_and_shape_matching','layout':j['layout'],'sha256':hashlib.sha256((ROOT/j['image']).read_bytes()).hexdigest(),'size':[j['width'],j['height']],'regions':j['regions'],'headerRaw':ocr['header']['text'],'typeRaw':ocr['type']['text'],'keywordRaw':ocr['keywords']['text'],'numericRaw':{k:num[k]['text']for k in ['models','hp','courage']},'confidence':{k:v['confidence']for k,v in ocr.items()},'rankScores':shapes['rankScores'],'attackSurgeScores':shapes['attackSurgeScores']}}
        if not card['name']['zh']:
            zhs={n['name']['zh']for n in NAMES if norm(n['name']['en'])==norm(card['name']['en'])and n['name']['zh']}
            if len(zhs)==1:card['name']['zh']=next(iter(zhs))
        if uid in corrections:
            c=corrections[uid];card['stats'].update(c.get('stats',{}))
            if'rank'in c:card['rank']=c['rank']
            for index,patch in c.get('weapons',{}).items():
                w=card['weapons'][int(index)]
                for key in ['range','dice']:
                    if key in patch:w[key]=copy.deepcopy(patch[key])
                if'nameEn'in patch:
                    w['name']=canonical_weapon(patch['nameEn'],mapping)[0];w['name']['en']=patch['nameEn']
            card['source']['visualCorrections']=c
            card['review']['issues']=[issue for issue in card['review']['issues']if not any(issue.startswith('属性 '+k+'：')for k in c.get('stats',{}))and not any(issue.startswith('武器 '+card['weapons'][int(index)]['name']['en']+'：')for index in c.get('weapons',{}))]
        fill_names(card,{'units':NAMES},load('references/name-translations.local.json'))
        apply_actions(card,detect_lines(j))
        make_portrait(card);validate(card);units.append(card)
    return {'schema':'swl-unit-catalog/v1','updatedAt':datetime.now(timezone.utc).isoformat(),'language':'en+zh-CN','units':units}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--replace',action='store_true');args=p.parse_args();dest=ROOT/'data/units.json'
    if dest.exists()and json.loads(dest.read_bytes())['schema']!='swl-unit-catalog/v1':raise SystemExit('The v2 catalog must not be replaced by legacy OCR extraction. Use the editor; raw evidence remains in work/.')
    if dest.exists()and not args.replace:raise SystemExit('Catalog exists; use the editor. Explicit --replace is required to regenerate.')
    if dest.exists():
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');old=dest.read_bytes();atomic(ROOT/'history'/(stamp+'-'+hashlib.sha256(old).hexdigest()[:12]+'.json'),old)
    catalog=build();atomic(dest,encoded(catalog));print('Created',len(catalog['units']),'cards;',sum(u['mapping']['matched']for u in catalog['units']),'mapped identities;',sum(len(u['weapons'])for u in catalog['units']),'weapon panels')
