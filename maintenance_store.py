"""Separate upgrade and army storage, each with its own revisions and snapshots."""
import copy,hashlib,json,os,re,threading,uuid
from datetime import datetime,timezone
from pathlib import Path
from rule_schema import validate_rules,KNOWN
ROOT=Path(__file__).resolve().parent;LOCK=threading.Lock()
CONFIG={'upgrades':('data/upgrades.json','cards'),'armies':('data/armies.json','armies'),'commands':('data/catalog-definitions.json','commands')}
def encode(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode('utf8')
def hashof(b):return hashlib.sha256(b).hexdigest()
def write(path,content):
    path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name('.'+path.name+'.'+uuid.uuid4().hex+'.tmp')
    try:
        with tmp.open('xb')as f:f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:tmp.unlink(missing_ok=True)
def read(kind):
    filename,key=CONFIG[kind]
    with LOCK:content=(ROOT/filename).read_bytes()
    return {'revision':hashof(content),'catalog':json.loads(content),'recordsKey':key}
def validate(kind,card):
    if kind=='commands':
        if not isinstance(card,dict):raise ValueError('战术卡必须是 JSON 对象')
        if not isinstance(card.get('id'),str)or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,150}',card['id']):raise ValueError('战术卡 ID 无效')
        name=card.get('name')
        if not isinstance(name,dict)or not isinstance(name.get('en'),str)or not name['en'].strip():raise ValueError('战术卡需要英文名称')
        if name.get('zh')is not None and not isinstance(name.get('zh'),str):raise ValueError('中文名称必须是字符串')
        pips=card.get('pips')
        if type(pips)is not int or not 1<=pips<=4:raise ValueError('打出点数必须是 1–4 的整数')
        slot=card.get('slotPips')
        if slot is not None and (type(slot)is not int or not 1<=slot<=4):raise ValueError('写表槽位点数必须是 1–4 的整数或 null')
        if not isinstance(card.get('factions')or[],list)or any(type(f)is not int for f in card.get('factions')or[]):raise ValueError('factions 必须是军队 ID 数组')
        for un in card.get('unlockedBy')or[]:
            if not isinstance(un,dict)or 'id'not in un or un.get('propertyName')not in ('units','upgrades'):raise ValueError('unlockedBy 需要 {id, propertyName}')
        for field in ('description','orders'):
            value=card.get(field)
            if value is not None and (not isinstance(value,dict)or any(not isinstance(value.get(k),str)for k in ('en','zh')if k in value)):raise ValueError(field+' 必须是 {en,zh} 文本对象')
        image=card.get('image')
        if image and (not isinstance(image,str)or not image.startswith('assets/')):
            raise ValueError('卡图必须使用 assets/ 下的相对路径')
        return
    if not isinstance(card,dict)or not isinstance(card.get('id'),str)or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,150}',card['id']):raise ValueError('记录 ID 无效')
    if kind=='upgrades':
        if not isinstance(card.get('name'),dict)or any(not isinstance(card['name'].get(k),str)for k in ['en','zh'])or not card['name']['en'].strip():raise ValueError('升级卡需要中英文名称字段')
        if card.get('points')is not None and(type(card['points'])is not int or card['points']<0):raise ValueError('费用必须为非负整数或 null')
        if not isinstance(card.get('slotIds'),list)or any(type(x)is not int or not 1<=x<=30 for x in card['slotIds']):raise ValueError('slotIds 必须为槽位 ID 数组')
        if card.get('usage')not in ['unit_upgrade','counterpart','campaign']:raise ValueError('升级用途无效')
        validate_rules(card.get('rules'))
        if card['rules'].get('slotTypes',card['slotIds'])!=card['slotIds']:raise ValueError('升级的槽位类型与规则 slotTypes 必须一致')
        assets=card.get('assets')
        if not isinstance(assets,dict):raise ValueError('assets 必须为对象')
        if assets.get('front'):
            path=(ROOT/assets['front']).resolve()
            if not str(assets['front']).startswith('assets/')or not path.is_relative_to((ROOT/'assets').resolve())or not path.is_file():raise ValueError('卡图必须是存在的 assets 相对文件')
        if not isinstance(card.get('description'),dict)or any(not isinstance(card['description'].get(k),list)or any(not isinstance(s,str)for s in card['description'][k])for k in ['en','zh']):raise ValueError('卡文 en/zh 必须为文本数组')
        for k in ['keywords','weapons','requirementsText']:
            if not isinstance(card.get(k),list):raise ValueError(k+' 必须为数组')
        if not isinstance(card.get('review'),dict)or card['review'].get('status')not in ['needs_review','reviewed']:raise ValueError('校对状态无效')
    else:
        if not isinstance(card.get('name'),str)or not card['name'].strip():raise ValueError('军表需要名称')
        if card.get('mode')not in ['standard','recon']:raise ValueError('模式无效')
        if type(card.get('pointsLimit'))is not int or card['pointsLimit']<=0:raise ValueError('点数上限无效')
        defs=json.loads((ROOT/'data/catalog-definitions.json').read_bytes())
        if card.get('armyId')not in [a['id']for a in defs['armies']]:raise ValueError('军队 ID 不存在')
        for key in ['units','commandIds','options']:
            if not isinstance(card.get(key),list):raise ValueError(key+' 必须为数组')
        instances=set()
        for u in card['units']:
            if not isinstance(u,dict)or not isinstance(u.get('unitId'),str)or not isinstance(u.get('instanceId'),str)or not isinstance(u.get('upgrades'),list):raise ValueError('军表单位需 unitId、instanceId 与 upgrades')
            if u['instanceId']in instances:raise ValueError('单位实例 ID 不能重复')
            instances.add(u['instanceId'])
            for c in u['upgrades']:
                if not isinstance(c,dict)or not isinstance(c.get('upgradeId'),str)or not isinstance(c.get('instanceId'),str):raise ValueError('军表升级需 upgradeId 与 instanceId')
                if c['instanceId']in instances:raise ValueError('升级实例 ID 不能重复')
                instances.add(c['instanceId'])
        validate_rules(card.get('rules',{}))
def save(kind,card,revision,create=False):
    validate(kind,card);filename,key=CONFIG[kind];path=ROOT/filename
    with LOCK:
        old=path.read_bytes()
        if hashof(old)!=revision:raise FileExistsError('该模块源文件已被修改，请重新载入；草稿不会被覆盖。')
        catalog=json.loads(old);index=next((i for i,c in enumerate(catalog[key])if c['id']==card['id']),None)
        if index is None and not(create and kind in ('armies','upgrades','commands')):raise ValueError('没有此记录；不能修改固定 ID')
        if index is not None and create:raise ValueError('ID 已存在')
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');snapshot=stamp+'-'+hashof(old)[:12]+'.json';write(ROOT/'history'/kind/snapshot,old)
        if index is None:catalog[key].append(copy.deepcopy(card))
        else:catalog[key][index]=copy.deepcopy(card)
        catalog['updatedAt']=datetime.now(timezone.utc).isoformat();content=encode(catalog);write(path,content)
        return {'revision':hashof(content),'card':card,'snapshot':snapshot}
def history(kind):return [{'file':p.name,'size':p.stat().st_size}for p in sorted((ROOT/'history'/kind).glob('*.json'),reverse=True)]
def restore(kind,name,record_id,revision):
    if not re.fullmatch(r'\d{8}T\d{6}\.\d{6}Z-[a-f0-9]{12}\.json',name):raise ValueError('历史文件名无效')
    _,key=CONFIG[kind];old=json.loads((ROOT/'history'/kind/name).read_bytes());card=next((c for c in old[key]if c['id']==record_id),None)
    if card is None:raise ValueError('此版本没有该记录')
    missing=kind=='armies' and not any(c['id']==record_id for c in read(kind)['catalog'][key])
    return save(kind,card,revision,create=missing)
def delete_army(record_id,revision):
    path=ROOT/CONFIG['armies'][0]
    with LOCK:
        old=path.read_bytes()
        if hashof(old)!=revision:raise FileExistsError('军表源文件已修改，请重新载入。')
        catalog=json.loads(old)
        if not any(c['id']==record_id for c in catalog['armies']):raise ValueError('军表不存在')
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ');snapshot=stamp+'-'+hashof(old)[:12]+'.json';write(ROOT/'history/armies'/snapshot,old)
        catalog['armies']=[c for c in catalog['armies']if c['id']!=record_id];catalog['updatedAt']=datetime.now(timezone.utc).isoformat();content=encode(catalog);write(path,content)
        return {'revision':hashof(content),'snapshot':snapshot}


def save_image(kind, record_id, image_bytes, revision):
    import io
    from PIL import Image
    if kind not in ("upgrades", "commands"):
        raise ValueError("只支持升级卡与战术卡卡图")
    if not isinstance(record_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,150}", record_id):
        raise ValueError("记录 ID 无效")
    if not image_bytes:
        raise ValueError("图片为空")
    try:
        probe = Image.open(io.BytesIO(image_bytes))
        probe.verify()
    except Exception:
        raise ValueError("不是有效的图片文件")
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    filename, key = CONFIG[kind]
    path = ROOT / filename
    with LOCK:
        old = path.read_bytes()
        if hashof(old) != revision:
            raise FileExistsError("该模块源文件已被修改，请重新载入；草稿不会被覆盖。")
        catalog = json.loads(old)
        index = next((i for i, c in enumerate(catalog[key]) if c["id"] == record_id), None)
        if index is None:
            raise ValueError("没有此记录；不能修改固定 ID")
        card = catalog[key][index]
        if kind == "commands":
            rel = f"assets/command-cards/{record_id}.webp"
        else:
            rel = f"assets/upgrade-cards/{record_id}.webp"
        abs_path = ROOT / rel
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = abs_path.with_name("." + abs_path.name + "." + uuid.uuid4().hex + ".tmp")
        try:
            image.save(tmp, format="WEBP", quality=90, method=6)
            os.replace(tmp, abs_path)
        finally:
            tmp.unlink(missing_ok=True)
        if kind == "commands":
            card["image"] = rel
        else:
            card.setdefault("assets", {})["front"] = rel
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
        snapshot = stamp + "-" + hashof(old)[:12] + ".json"
        write(ROOT / "history" / kind / snapshot, old)
        catalog["updatedAt"] = datetime.now(timezone.utc).isoformat()
        content = encode(catalog)
        write(path, content)
        return {"revision": hashof(content), "card": card, "snapshot": snapshot, "front": rel}
