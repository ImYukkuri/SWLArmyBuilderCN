"""Local-only unit catalog editor with optimistic locking and immutable history."""
import argparse,copy,hashlib,json,os,re,threading,uuid
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,unquote
from PIL import Image
from catalog_schema import DEFINITIONS,migrate_legacy,validate_unit_classification,validate_keyword_targets
import maintenance_store
import rules
from unit_identity import rename_documents, resolve_id, rewrite_references
from rule_schema import validate_rules
from battleforce_bridge import validate_package as validate_battleforce_package

ROOT=Path(__file__).resolve().parent;DATA=ROOT/'data/units.json';HISTORY=ROOT/'history'
LOCK=threading.Lock()
def encoded(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf8')
def digest(content):return hashlib.sha256(content).hexdigest()
def atomic(path,content):
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with tmp.open('xb')as f:f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:tmp.unlink(missing_ok=True)
def relative_asset(value):
    if not isinstance(value,str)or '\\'in value or not value.startswith('assets/'):raise ValueError('图片必须使用 assets/ 下的相对路径')
    p=(ROOT/value).resolve()
    if not p.is_relative_to((ROOT/'assets').resolve())or not p.is_file():raise ValueError('图片文件不存在或路径越界')
    return p
def validate(card):
    if not isinstance(card,dict):raise ValueError('单位必须是 JSON 对象')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,150}',card.get('id','')):raise ValueError('单位 ID 格式不正确')
    for key in ['name','title']:
        if not isinstance(card.get(key),dict)or any(not isinstance(card[key].get(k),str)for k in ['en','zh']):raise ValueError(key+' 需要 en / zh 文本')
    if not card['name']['en'].strip():raise ValueError('英文名称不能为空')
    if 'rules'in card:validate_rules(card['rules'])
    if 'usage'in card and card['usage']not in ['army_unit','counterpart']:raise ValueError('单位用途无效')
    if 'equipUpgradeIds' in card:
        ids=card['equipUpgradeIds']
        if not isinstance(ids,list) or any(not isinstance(v,str) for v in ids) or len(ids)!=len(set(ids)):
            raise ValueError('Equip 关联必须为不重复的本地升级卡 ID 数组')
        known={c['id'] for c in json.loads((ROOT/'data/upgrades.json').read_bytes())['cards']}
        if any(v not in known for v in ids):raise ValueError('Equip 关联的升级卡 ID 不存在，请用选择器选择正面主记录')
    if 'equipSlotIds' in card:
        ids=card['equipSlotIds']
        if not isinstance(ids,list) or any(not isinstance(v,str) for v in ids) or len(ids)!=len(set(ids)):
            raise ValueError('Equip 槽位关联必须为不重复的槽位 ID 数组')
        known={s['id'] for s in rules.load_package()['slots']}
        if any(v not in known for v in ids):raise ValueError('Equip 关联的槽位不存在，请用槽位选择器选择')
    legacy='factionId'not in card
    for key in ['keywords','weapons','factions',*(['affiliations']if legacy else['affiliationIds'])]:
        if not isinstance(card.get(key),list):raise ValueError(key+' 必须为数组')
    for key in ['review','assets',*(['unitType','source']if legacy else[])]:
        if not isinstance(card.get(key),dict):raise ValueError(key+' 必须为对象')
    if legacy and any(not isinstance(v,str)for key in ['factions','affiliations']for v in card[key]):raise ValueError('阵营和组织必须为文本数组')
    if not legacy:
        definitions=json.loads(DEFINITIONS.read_bytes())
        validate_unit_classification(card,definitions)
        existing_units=json.loads(DATA.read_bytes())['units']
        target_units=[u for u in existing_units if u['id']!=card['id']]+[card]
        previous=next((u for u in existing_units if u['id']==card['id']),{})
        old_identity=previous.get('nameIdentityId')
        if old_identity and old_identity!=card.get('nameIdentityId') and not any(u.get('nameIdentityId')==old_identity for u in target_units):
            # Do not leave another card's rule pointing at an empty namespace.
            cards=target_units+json.loads((ROOT/'data/upgrades.json').read_bytes())['cards']
            for owner in cards:
                for face in [owner,owner.get('back') or {}]:
                    keywords=face.get('keywords',[])+[k for w in face.get('weapons',[]) for k in w.get('keywords',[])]
                    for keyword in keywords:
                        refs=keyword.get('parameterRefs') or ([keyword['parameterRef']] if keyword.get('parameterRef') else [])
                        if any(r.get('kind')=='nameIdentity' and r.get('id')==old_identity for r in refs):
                            raise ValueError('名称标识仍被「'+str(owner.get('name',{}).get('zh') or owner['id'])+'」关联，请先调整其目标条件')
        def check_ref(table,value,nullable=False):
            if nullable and value is None:return
            if not any(type(x['id'])is type(value)and x['id']==value for x in definitions[table]):raise ValueError(f'{table} 引用不存在：{value}')
        check_ref('factions',card.get('factionId'));check_ref('ranks',card.get('rankId'),True);check_ref('unitTypes',card.get('unitTypeId'),True)
        for a in card['affiliationIds']:check_ref('affiliations',a)
        for f in card['factions']:
            if not isinstance(f,dict):raise ValueError('可用军队需包含 id / rankId')
            check_ref('armies',f.get('id'));check_ref('ranks',f.get('rankId'),True)
        for slot in card.get('upgradeSlots')or[]:
            check_ref('upgradeSlots',slot.get('id')if isinstance(slot,dict)else slot)
        for slot in card.get('conditionalUpgradeSlots',[]):
            check_ref('upgradeSlots',slot.get('id'));check_ref('upgrades',slot.get('upgradeId'))
    if not isinstance(card['review'].get('issues'),list)or not isinstance(card['review'].get('notes'),str):raise ValueError('校对需包含 issues 数组与 notes 文本')
    if not isinstance(card.get('stats'),dict):raise ValueError('stats 必须为对象')
    for key in ['models','wounds','courage','resilience','speed']:
        v=card['stats'].get(key)
        if v is not None and (type(v)is not int or v<0 or v>999):raise ValueError(key+' 必须为非负整数或 null')
    if card.get('points')is not None and (type(card['points'])is not int or card['points']<0):raise ValueError('points 必须为非负整数或 null')
    if card.get('upgradeSlots')is not None and not isinstance(card['upgradeSlots'],list):raise ValueError('upgradeSlots 必须为数组或 null')
    if card['stats'].get('defenseDie')not in [None,'red','white']:raise ValueError('防御骰为 red / white / null')
    if card['stats'].get('attackSurge')not in [None,'none','hit','critical']:raise ValueError('攻击激增为 none / hit / critical / null')
    if card['stats'].get('defenseSurge')not in [None,'none','block']:raise ValueError('防御激增为 none / block / null')
    for w in card['weapons']:
        if not isinstance(w,dict)or not isinstance(w.get('name'),dict)or not isinstance(w['name'].get('en'),str):raise ValueError('武器需要 name.en')
        if not isinstance(w.get('keywords'),list):raise ValueError('武器 keywords 必须为数组')
        if not isinstance(w.get('dice'),dict):raise ValueError('武器 dice 必须为对象')
        r=w.get('range')
        if not isinstance(r,dict):raise ValueError('武器 range 必须为对象')
        for key in ['min','max']:
            value=r.get(key)
            if value is not None and (type(value)is not int or value<0 or value>99):raise ValueError('射程必须为非负整数或 null')
        if r.get('min')is not None and r.get('max')is not None and r['min']>r['max']:raise ValueError('最小射程不能大于最大射程')
        for c in ['red','black','white']:
            v=w['dice'].get(c)
            if v is not None and (type(v)is not int or v<0 or v>99):raise ValueError('武器骰数必须为 0–99 或 null')
    for k in card['keywords']+[k for w in card['weapons']for k in w['keywords']]:
        if not isinstance(k,dict):raise ValueError('词条必须为对象')
        if legacy:
            if not isinstance(k.get('raw'),str):raise ValueError('词条必须为含 raw 的对象')
        else:
            check_ref('keywords',k.get('id'))
            validate_keyword_targets(k,definitions,target_units)
        if k.get('action')not in [None,'none','action','double-action','free-action','free-exhaust']:raise ValueError('行动类型无效')
    assets=card.get('assets',{})
    box=assets.get('portraitCrop')
    if not isinstance(box,list)or len(box)!=4 or any(type(n)not in [int,float]for n in box)or not(0<=box[0]<box[2]<=1 and 0<=box[1]<box[3]<=1):raise ValueError('立绘裁剪为 [左,上,右,下]，范围 0–1')
    if assets.get('front'):
        with Image.open(relative_asset(assets['front']))as im:
            if round(box[2]*im.width)<=round(box[0]*im.width)or round(box[3]*im.height)<=round(box[1]*im.height):raise ValueError('裁剪范围至少包含一个像素')
    if card.get('review',{}).get('status')not in ['needs_review','reviewed']:raise ValueError('校对状态无效')
    if legacy and card.get('rank')not in [None,'commander','operative','corps','special-forces','support','heavy','flier','counterpart']:raise ValueError('军阶枚举无效')
def make_portrait(card):
    front=(card.get('assets') or {}).get('front')
    if not front:
        card['assets']['portrait']=None
        return
    path=relative_asset(front);crop=card['assets']['portraitCrop']
    fingerprint=digest(path.read_bytes()+encoded(crop))[:20];target=ROOT/'assets/portraits'/(card['id']+'-'+fingerprint+'.webp')
    if not target.exists():
        with Image.open(path)as im:
            box=tuple(round(v*(im.width if i%2==0 else im.height))for i,v in enumerate(crop));im.crop(box).save(target,format='WEBP',quality=94)
    card['assets']['portrait']=target.relative_to(ROOT).as_posix()
def default_portrait_crop(width=1040,height=726):
    # Uniform 83% / 41% centre with a 4:5 portrait, wholly inside the original.
    pixels=min(width*.32,height*.82*.8)
    w=pixels/width;h=pixels/.8/height
    return [.83-w/2,.41-h/2,.83+w/2,.41+h/2]
DEFAULT_PORTRAIT_CROP=default_portrait_crop()
def save_unit_image(record_id,image_bytes,revision):
    import io
    if not isinstance(record_id,str)or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,150}',record_id):raise ValueError('单位 ID 无效')
    if not image_bytes:raise ValueError('图片为空')
    try:
        probe=Image.open(io.BytesIO(image_bytes));probe.verify()
    except Exception:raise ValueError('不是有效的图片文件')
    image=Image.open(io.BytesIO(image_bytes)).convert('RGB')
    rel=f'assets/unit-cards/{record_id}.webp'
    target=ROOT/rel
    target.parent.mkdir(parents=True,exist_ok=True)
    image.save(target,format='WEBP',quality=90,method=6)
    with LOCK:
        original=DATA.read_bytes()
        if revision!=digest(original):raise FileExistsError('单位源文件已修改，请重新载入后再上传。')
        catalog=json.loads(original)
        card=next((c for c in catalog['units']if c['id']==record_id),None)
        if card is None:raise ValueError('单位不存在')
    assets=card.setdefault('assets',{})
    assets['front']=rel
    assets['portraitCrop']=default_portrait_crop(image.width,image.height)
    return commit_card(card,revision)


def commit_card(card,revision,create=False):
    card=migrate_legacy(card)
    validate(card)
    with LOCK:
        original=DATA.read_bytes()
        if revision!=digest(original):raise FileExistsError('源文件已发生修改，请重新载入后合并修改；未覆盖你的草稿。')
        catalog=json.loads(original);index=next((i for i,c in enumerate(catalog['units'])if c['id']==card['id']),None)
        if create and card['id'] in catalog.get('idAliases',{}):raise ValueError('该 ID 用于旧军表兼容，不能重复使用')
        if index is None and not create:raise ValueError('单位 ID 不存在；为避免误覆盖，不允许直接更改 ID')
        if index is not None and create:raise ValueError('该单位 ID 已存在')
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');snapshot=stamp+'-'+digest(original)[:12]+'.json'
        HISTORY.mkdir(exist_ok=True);atomic(HISTORY/snapshot,original)
        make_portrait(card)
        if index is None:catalog['units'].append(card)
        else:catalog['units'][index]=card
        catalog['updatedAt']=datetime.now(timezone.utc).isoformat()
        content=encoded(catalog);atomic(DATA,content)
        return {'revision':digest(content),'card':card,'snapshot':snapshot}
def rename_unit(old_id,new_id,revision):
    with LOCK, maintenance_store.LOCK:
        paths={'units.json':DATA,**{name:ROOT/'data'/name for name in
            ['upgrades.json','catalog-definitions.json','slot-rules.json','armies.json','tts-names.json']}}
        original={name:path.read_bytes() for name,path in paths.items() if path.is_file()}
        if revision!=digest(original['units.json']):raise FileExistsError('单位源文件已修改，请重新载入后再修改 ID')
        documents={name:json.loads(raw) for name,raw in original.items()}
        renamed=rename_documents(documents,old_id,new_id)
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
        snapshot=stamp+'-'+digest(original['units.json'])[:12]+'.json'
        updates={name:encoded(doc) for name,doc in renamed.items() if doc!=documents[name]}
        atomic(HISTORY/snapshot,original['units.json'])
        for name in updates:atomic(ROOT/'history/unit-id-changes'/stamp/name,original[name])
        written=[]
        try:
            for name,content in updates.items():
                # Recheck files changed outside this process before replacing them.
                if paths[name].read_bytes()!=original[name]:raise FileExistsError('关联数据已修改，请重新载入后重试')
                atomic(paths[name],content);written.append(name)
        except Exception:
            for name in reversed(written):atomic(paths[name],original[name])
            raise
        return {'revision':digest(updates['units.json']),'snapshot':snapshot,
                'card':next(u for u in renamed['units.json']['units'] if u['id']==new_id),
                'changedFiles':list(updates),'oldId':old_id,'newId':new_id}


def commit_rules(package,revision,definitions_revision=None):
    if not isinstance(package,dict):raise ValueError('规则包必须为对象')
    if package.get('schema')!='swl-rules/v1':raise ValueError('规则包 schema 必须为 swl-rules/v1')
    if not isinstance(package.get('slots'),list)or not package['slots']:raise ValueError('slots 必须为非空数组')
    for s in package['slots']:
        if not isinstance(s,dict)or not isinstance(s.get('id'),str)or not isinstance(s.get('sourceId'),int)or s.get('kind')not in ['category','counterpart','dedicated']:raise ValueError('槽位注册表项无效')
    path=ROOT/'data/slot-rules.json'
    with LOCK, maintenance_store.LOCK:
        original=path.read_bytes()
        if revision!=digest(original):raise FileExistsError('规则包源文件已修改，请重新载入后合并。')
        package=copy.deepcopy(package)
        previous=json.loads(original)
        definitions_path=ROOT/'data/catalog-definitions.json'
        definitions_bytes=definitions_path.read_bytes()
        definitions=json.loads(definitions_bytes)
        armies={str(a['id']):a for a in definitions['armies']}
        renamed=False
        for key,bf in package.get('battleForces',{}).items():
            if not isinstance(bf,dict):raise ValueError('战斗部队必须为对象')
            for field in ['textRules','textRulesZh','unitLimitsText']:
                if field in bf and (not isinstance(bf[field],list) or any(not isinstance(s,str) for s in bf[field])):
                    raise ValueError('战斗部队 '+field+' 必须为文本数组')
            old=previous.get('battleForces',{}).get(key,{})
            army=armies.get(key)
            for field in ['name','nameZh']:
                if field in bf and (not isinstance(bf[field],str) or not bf[field].strip()):
                    raise ValueError('战斗部队中英文名称不能为空')
            if 'nameAliases' in bf and (not isinstance(bf['nameAliases'],list) or
                    any(not isinstance(n,str) or not n.strip() for n in bf['nameAliases'])):
                raise ValueError('战斗部队旧名称必须为非空文本数组')
            name=bf.get('name',old.get('name'))
            zh=bf.get('nameZh',old.get('nameZh',army['name']['zh'] if army else ''))
            changed=name!=old.get('name') or zh!=old.get('nameZh',army['name']['zh'] if army else '')
            if not changed:continue
            if not army:raise ValueError('战斗部队 ID 不存在，不能通过改名新建部队')
            if definitions_revision!=digest(definitions_bytes):
                raise FileExistsError('名称字典已修改，请重新载入后合并；尚未保存任何修改。')
            name=name.strip();zh=zh.strip()
            aliases=[*old.get('nameAliases',[]),*bf.get('nameAliases',[]),old.get('name'),army['name']['en']]
            bf['nameAliases']=list(dict.fromkeys(n for n in aliases if n and n!=name))
            bf['name']=name;bf['nameZh']=zh
            army['name']={'en':name,'zh':zh}
            renamed=True
        validate_battleforce_package(package)
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');snapshot=stamp+'-'+digest(original)[:12]+'.json'
        (ROOT/'history/slot-rules').mkdir(parents=True,exist_ok=True);atomic(ROOT/'history/slot-rules'/snapshot,original)
        content=encoded(package)
        if renamed:
            atomic(ROOT/'history/battleforce-names'/(stamp+'-'+digest(definitions_bytes)[:12]+'.json'),definitions_bytes)
            definitions['updatedAt']=datetime.now(timezone.utc).isoformat()
            atomic(definitions_path,encoded(definitions))
        try:atomic(path,content)
        except Exception:
            if renamed:atomic(definitions_path,definitions_bytes)
            raise
        return {'revision':digest(content),'snapshot':snapshot,'rules':package,
                'definitionsRevision':digest(encoded(definitions) if renamed else definitions_bytes),
                'definitions':definitions}
class Handler(BaseHTTPRequestHandler):
    def reply(self,status,value,kind='application/json; charset=utf-8'):
        body=encoded(value)if not isinstance(value,bytes)else value
        self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
    def valid_host(self):
        return self.headers.get('Host','')in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']
    def do_GET(self):
        if not self.valid_host():return self.reply(403,{'error':'仅允许本机访问'})
        path=unquote(urlsplit(self.path).path)
        try:
            if path=='/api/catalog':
                with LOCK:content=DATA.read_bytes()
                return self.reply(200,{'revision':digest(content),'catalog':json.loads(content)})
            if path in ['/api/upgrades','/api/armies','/api/commands','/api/keywords']:return self.reply(200,maintenance_store.read(path.split('/')[-1]))
            if path in ['/api/upgrades/history','/api/armies/history','/api/commands/history','/api/keywords/history']:return self.reply(200,maintenance_store.history(path.split('/')[2]))
            if path=='/api/upgrade-report':return self.reply(200,json.loads((ROOT/'data/upgrade-crosswalk.json').read_bytes()))
            if path=='/api/unit-options':
                units=json.loads(DATA.read_bytes())['units'];upgrades=maintenance_store.read('upgrades')['catalog']['cards']
                return self.reply(200,{'units':units,'upgrades':upgrades})
            if path=='/api/mappings':
                return self.reply(200,{'names':json.loads((ROOT/'references/unit-names.zh.json').read_bytes()),'definitions':json.loads(DEFINITIONS.read_bytes())})
            if path=='/api/comparison':return self.reply(200,json.loads((ROOT/'data/comparison.json').read_bytes()))
            if path=='/api/definitions':
                definitions=json.loads(DEFINITIONS.read_bytes())
                slot_rules=ROOT/'data/slot-rules.json'
                if slot_rules.is_file(): definitions['slotRules']=json.loads(slot_rules.read_bytes())
                return self.reply(200,definitions)
            if path=='/api/slot-rules':
                with LOCK, maintenance_store.LOCK:
                    content=(ROOT/'data/slot-rules.json').read_bytes()
                    definitions=(ROOT/'data/catalog-definitions.json').read_bytes()
                return self.reply(200,{'revision':digest(content),'rules':json.loads(content),
                    'definitionsRevision':digest(definitions)})
            if path.startswith('/api/evidence/'):
                key=path.removeprefix('/api/evidence/');records=json.loads((ROOT/'data/extraction-evidence.json').read_bytes())['units']
                if key not in records:return self.reply(404,{'error':'没有此单位的提取依据'})
                return self.reply(200,records[key])
            if path=='/api/history':return self.reply(200,[{'file':p.name,'size':p.stat().st_size}for p in sorted(HISTORY.glob('*.json'),reverse=True)])
            files={'/':'index.html','/maintenance':'maintenance.html','/units':'units.html','/upgrades':'upgrades.html','/commands':'commands.html','/armies':'armies.html','/rules':'rules.html',**{'/'+name:name for name in ['index.html','maintenance.html','units.html','upgrades.html','commands.html','armies.html','rules.html','dice-enums.js','combo.js','command-editor.js','app.js','builder.js','builder-model.js','builder-library.js','builder-view.js','builder-home.js','builder.css','rules-core.js','rules.js','rule-editor.js','condition-editor.js','upgrade-editor.js','army-editor.js','editor-common.js','editor-options.js','editor-forms.js','portrait-crop.js','editor-shell.js','editor.css','style.css']}}
            files['/upgrade-faces.js']='upgrade-faces.js'
            files['/command-requirements-editor.js']='command-requirements-editor.js'
            files['/builder-transfer.js']='builder-transfer.js'
            files['/builder-share.js']='builder-share.js'
            files['/builder-transfer-ui.js']='builder-transfer-ui.js'
            files['/builder-overlays.js']='builder-overlays.js'
            files['/builder-sticky.js']='builder-sticky.js'
            files['/mandalorian-rules.js']='mandalorian-rules.js'
            files['/battleforce-v2.js']='battleforce-v2.js'
            files['/battleforce-runtime.js']='battleforce-runtime.js'
            files.update({'/battleforces':'battleforce-editor.html', **{'/'+name:name for name in ['battleforce-editor.html','battleforce-editor.js','battleforce-editor.css']}})
            files['/rule-icons.js']='rule-icons.js'
            files['/rule-icons.css']='rule-icons.css'
            files['/editor-symbols.js']='editor-symbols.js'
            files.update({'/keywords':'keywords.html','/keywords.html':'keywords.html','/keyword-editor.js':'keyword-editor.js','/keyword-editor.css':'keyword-editor.css'})
            if path in files:p=ROOT/files[path]
            elif path.startswith('/assets/'):
                p=relative_asset(path[1:])
            elif path.startswith('/data/')or path.startswith('/references/'):
                p=(ROOT/path[1:]).resolve()
                if not p.is_relative_to(ROOT)or not p.is_file():return self.reply(404,{'error':'没有此资源'})
            else:return self.reply(404,{'error':'没有此资源'})
            kinds={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png'}
            return self.reply(200,p.read_bytes(),kinds.get(p.suffix,'application/octet-stream'))
        except (OSError,ValueError)as e:return self.reply(400,{'error':str(e)})
    def do_POST(self):
        if not self.valid_host()or self.headers.get('Origin')not in [f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}']:return self.reply(403,{'error':'只接受同源本地编辑请求'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.reply(415,{'error':'需要 application/json'})
        try:
            path=urlsplit(self.path).path
            maxsize=20_000_000 if path in ['/api/upgrades/image','/api/units/image','/api/commands/image'] else 3_000_000
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<maxsize:raise ValueError('请求大小无效')
            data=json.loads(self.rfile.read(size))
            if path=='/api/upgrades/image':
                import base64
                raw=data.get('dataUrl','')
                if not isinstance(raw,str)or not raw.startswith('data:image/'):raise ValueError('需要图片 data URL')
                head,_,b64=raw.partition(',')
                if ';base64'not in head:raise ValueError('需要 base64 图片')
                return self.reply(200,maintenance_store.save_image('upgrades',data['id'],base64.b64decode(b64),data['revision'],data.get('face','front')))
            if path=='/api/commands/image':
                import base64
                raw=data.get('dataUrl','')
                if not isinstance(raw,str)or not raw.startswith('data:image/'):raise ValueError('需要图片 data URL')
                head,_,b64=raw.partition(',')
                if ';base64'not in head:raise ValueError('需要 base64 图片')
                return self.reply(200,maintenance_store.save_image('commands',data['id'],base64.b64decode(b64),data['revision']))
            if path=='/api/units/image':
                import base64
                raw=data.get('dataUrl','')
                if not isinstance(raw,str)or not raw.startswith('data:image/'):raise ValueError('需要图片 data URL')
                head,_,b64=raw.partition(',')
                if ';base64'not in head:raise ValueError('需要 base64 图片')
                return self.reply(200,save_unit_image(data['id'],base64.b64decode(b64),data['revision']))
            if path=='/api/save':return self.reply(200,commit_card(copy.deepcopy(data['card']),data['revision'],bool(data.get('create'))))
            if path=='/api/units/rename':return self.reply(200,rename_unit(data['id'],data['newId'],data['revision']))
            if path in ['/api/upgrades/save','/api/armies/save','/api/armies/create','/api/commands/save','/api/keywords/save']:
                kind=path.split('/')[2];return self.reply(200,maintenance_store.save(kind,copy.deepcopy(data['card']),data['revision'],path.endswith('/create')or bool(data.get('create'))))
            if path in ['/api/upgrades/restore','/api/armies/restore','/api/commands/restore','/api/keywords/restore']:
                kind=path.split('/')[2];return self.reply(200,maintenance_store.restore(kind,data['snapshot'],data['id'],data['revision']))
            if path=='/api/armies/delete':return self.reply(200,maintenance_store.delete_army(data['id'],data['revision']))
            if path=='/api/upgrades/delete':return self.reply(200,maintenance_store.delete('upgrades',data['id'],data['revision']))
            if path=='/api/commands/delete':return self.reply(200,maintenance_store.delete('commands',data['id'],data['revision']))
            if path=='/api/armies/preview':
                from army_preview import preview
                return self.reply(200,preview(data['card']))
            if path=='/api/restore':
                name=data['snapshot']
                if not re.fullmatch(r'\d{8}T\d{6}\.\d{6}Z-[a-f0-9]{12}\.json',name):raise ValueError('历史文件名称无效')
                old=json.loads((HISTORY/name).read_bytes())
                aliases=json.loads(DATA.read_bytes()).get('idAliases',{})
                card=next((u for u in old['units']if resolve_id(u['id'],aliases)==data['id']),None)
                if card is None:raise ValueError('该版本没有此单位')
                for previous,current in aliases.items():card=rewrite_references(card,previous,current)
                card['id']=data['id']
                return self.reply(200,commit_card(card,data['revision']))
            if path=='/api/candidates':
                return self.reply(200,rules.query_candidates(data.get('unitId')))
            if path=='/api/slot-rules/save':
                return self.reply(200,commit_rules(data['rules'],data['revision'],data.get('definitionsRevision')))
            return self.reply(404,{'error':'没有此操作'})
        except FileExistsError as e:return self.reply(409,{'error':str(e)})
        except (OSError,ValueError,KeyError,TypeError)as e:return self.reply(400,{'error':str(e)})
if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('--port',type=int,default=8770);args=cli.parse_args()
    print(f'Unit card editor: http://127.0.0.1:{args.port}/',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
