/* Static list builder — one shared card browser: rank chip → unit cards, slot chip → upgrade cards. */
const $=s=>document.querySelector(s);
const el=(t,s)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=s;return n};
const uid=()=>crypto.randomUUID();
let data=null,army=null,browser=null;const Q=new URLSearchParams(location.search),DATA_BASE=Q.get('base')||'';

const RANK_ORDER=[1,6,2,3,4,5];
const RANK_GLYPH={1:'5',6:'b',2:'6',3:'7',4:'8',5:'9'};
const RANK_SHORT={1:"指挥",6:"特工",2:"核心",3:"特种",4:"支援",5:"重型"};
const RANK_LABEL={1:"Commander",6:"Operative",2:"Corps",3:"Special Forces",4:"Support",5:"Heavy"};

async function loadFile(path){
  let resp;
  try{resp=await fetch(path)}catch(e){throw Error(path+' 无法读取（'+e.message+'）')}
  if(!resp.ok)throw Error(path+' → HTTP '+resp.status)
  const text=await resp.text();
  try{return JSON.parse(text)}
  catch(e){throw Error(path+' 不是有效 JSON（开头是「'+text.trim().slice(0,24).replace(String.fromCharCode(10),' ')+'」）。请用 Live Server 以 SWLArmyBuilderCN 目录为根启动，或运行 python server.py --port 8770')}
}
function load(){
  Promise.all([
    loadFile(DATA_BASE+'data/units.json'),
    loadFile(DATA_BASE+'data/upgrades.json'),
    loadFile(DATA_BASE+'data/catalog-definitions.json'),
    loadFile(DATA_BASE+'data/slot-rules.json'),
    loadFile(DATA_BASE+'data/battle-deck.json').catch(()=>({objectives:[],deployments:[],conditions:[]})),
  ]).then(([uj,gj,dj,pj,bj])=>{
    data={units:Object.fromEntries(uj.units.map(u=>[u.id,u])),upgrades:Object.fromEntries(gj.cards.map(c=>[c.id,c])),defs:dj,pkg:pj};
    data.deckData=bj||{objectives:[],deployments:[],conditions:[]};
    data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
    restore();
    army.commandIds=army.commandIds||[];
    const pipsList=commandSlotPips();
    const p4=pipsList.lastIndexOf(4);
    if(p4>=0&&!army.commandIds[p4])army.commandIds[p4]='8';
    render();
  }).catch(e=>{const p=$('#issues');if(p)p.textContent='数据载入失败：'+e.message});
}
function rankOf(u,armyId){return RulesCore.armyRank(u,armyId,data.pkg,data.defs,data.units)}
let unitNameIndex=null;
function buildUnitNameIndex(){const idx={};const add=(key,id)=>{const k=String(key||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/1/g,'i');if(k){(idx[k]||=new Set()).add(id)}};for(const u of Object.values(data.units)){add(u.id,u.id);add((u.name&&u.name.en)||'',u.id);add((u.name&&u.name.zh)||'',u.id)}return idx}
function resolveUnitIdByName(name){if(!unitNameIndex)unitNameIndex=buildUnitNameIndex();const k=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/1/g,'i');const hits=unitNameIndex[k]||new Set();return hits.size===1?[...hits][0]:null}
function unitParentIds(u){
  const parents=[];
  for(const q of (u.rules||{}).quantityLimitedBy||[]){if(q&&q.unit!=null)parents.push({id:String(q.unit),ratio:q.ratio||1})}
  for(const k of (u.keywords||[])){
    if(!k||typeof k!=='object')continue;
    if(k.id==='detachment'){const pid=resolveUnitIdByName(k.parameter);if(pid){const x=data.units[pid];const up=x&&x.upstream?String(x.upstream.id):null;if(up&&!parents.some(p=>p.id===up))parents.push({id:up,ratio:1})}}
  }
  return parents;
}
function unitAvailability(u){
  if(u.restrictions&&u.restrictions.condition&&RulesCore.restrictionConditionOk(u,u,data.pkg)===false)return {hidden:true,orphan:false};
  const parents=unitParentIds(u);
  if(!parents.length)return {hidden:false,orphan:false};
  const childCount=army.units.filter(inst=>inst.unitId===u.id).length;
  let hidden=false,orphan=false;
  for(const p of parents){
    const parentCount=army.units.filter(inst=>{const x=data.units[inst.unitId];return x&&x.upstream&&String(x.upstream.id)===p.id}).length;
    if(parentCount===0||childCount+1>parentCount*p.ratio)hidden=true;
    if(childCount>parentCount*p.ratio)orphan=true;
  }
  return {hidden,orphan:orphan&&childCount>0};
}
function isUnique(u){return !!(u.rules&&u.rules.unlimited===false)}
function uniqueKey(u){return String((u.name&&u.name.en)||u.id).toLowerCase()}
function alreadyInArmy(u){if(!isUnique(u))return false;const k=uniqueKey(u);return army.units.some(inst=>{const x=data.units[inst.unitId];return x&&isUnique(x)&&uniqueKey(x)===k})}
function setStatus(t,error){const p=$('#status');if(!p)return;p.textContent=t;p.classList.toggle('error',!!error)}
function slotDef(key){const s=(data.pkg.slots||[]).find(x=>x.id===key);if(!s)return null;return (data.defs.upgradeSlots||[]).find(x=>x.id===s.sourceId)||s}
function slotName(key){const d=slotDef(key);return d&&d.name?d.name.zh:key}
function unitSlotRecords(u,inst){return RulesCore.slotListFor(data.pkg,u,inst,data.upgrades,army.armyId)}
function accessOf(card){const rule=(data.pkg.upgradeRules||{})[String(card.upstream&&card.upstream.id||'')]||{};return RulesCore.accessKeys(card,data.pkg,rule)}

function restrictionOk(card,unit,inst){const equipped=((inst&&inst.upgrades)||[]).map(x=>data.upgrades[x.upgradeId]).filter(Boolean);return RulesCore.upgradeEligibility(card,unit,army,data,equipped).ok}
function sameNameSelected(card,inst){const nm=String((card.name&&card.name.en)||card.id||'').toLowerCase();return (inst.upgrades||[]).some(x=>{const c=data.upgrades[x.upgradeId];return c&&String((c.name&&c.name.en)||c.id||'').toLowerCase()===nm})}
function alreadySelectedUnique(card){const r=card.rules||{};if(!(r.unique===true||Number.isInteger(r.limit)))return false;const name=String(card.name&&card.name.en||'').toLowerCase();let n=0;for(const inst of army.units)for(const ch of inst.upgrades||[]){const c=data.upgrades[ch.upgradeId];if(!c)continue;if(c.id===card.id)n++;else if(r.unique===true&&String(c.name&&c.name.en||'').toLowerCase()===name)n++}const lim=Number.isInteger(r.limit)?r.limit:1;return n>=lim}

function selectedUpstreamIds(){const s=new Set();for(const inst of army.units)for(const ch of inst.upgrades||[]){const c=data.upgrades[ch.upgradeId];if(c&&c.upstream)s.add(String(c.upstream.id))}return s}
function instUpstreamIds(inst){const s=new Set();for(const ch of inst.upgrades||[]){const c=data.upgrades[ch.upgradeId];if(c&&c.upstream)s.add(String(c.upstream.id))}return s}
function conflictsWithSelected(card,selUp){const own=String(card.upstream&&card.upstream.id||'');const mine=RulesCore.unavailableSets(card,data.nameIndex,data.defs).up;for(const id of mine)if(selUp.has(id)&&id!==own)return true;for(const inst of army.units)for(const ch of inst.upgrades||[]){const c=data.upgrades[ch.upgradeId];if(!c)continue;if(RulesCore.unavailableSets(c,data.nameIndex,data.defs).up.has(own))return true}return false}
function slotVisible(inst,rec,i){if((inst.upgrades||[]).some(x=>x.slotIndex===i))return false;if(rec.unlockedBy&&!instUpstreamIds(inst).has(String(rec.unlockedBy)))return false;return true}
function nextEmptySlot(inst,records,after){const n=records.length;for(let k=1;k<=n;k++){const i=(after+k)%n;if(slotVisible(inst,records[i],i))return i}return -1}

function unitCard(u){
  const taken=alreadyInArmy(u);
  const b=el('button');b.className='card card--unit'+(taken?' taken':'');
  b.onclick=()=>{if(taken){setStatus('独特单位「'+(u.name.zh||u.name.en)+'」整军只能携带一次。',true);return}army.units.push({instanceId:uid(),unitId:u.id,upgrades:[]});setStatus('已加入 '+(u.name.zh||u.name.en));save();render()};
  const im=el('img');im.src=u.assets&&u.assets.front?u.assets.front:'';im.alt='';im.loading='lazy';im.onerror=()=>im.remove();b.append(im);
  const meta=el('div');meta.className='meta';
  const strong=el('strong');strong.append(el('span',u.name.zh||u.name.en));
  if(isUnique(u)){const badge=el('span','独特');badge.className='unique-badge';strong.append(badge)}
  meta.append(strong,el('span',(u.points||0)+' 分'+(taken?' · 已加入':'') ));b.append(meta);
  return b;
}
function upgradeCard(card,inst,slotIndex){
  const b=el('button');b.className='card card--upgrade';
  if((inst.upgrades||[]).some(x=>x.slotIndex===slotIndex&&x.upgradeId===card.id))b.classList.add('chosen');
  b.onclick=()=>{
    inst.upgrades=(inst.upgrades||[]).filter(x=>x.slotIndex!==slotIndex);
    inst.upgrades.push({instanceId:uid(),upgradeId:card.id,slotIndex});
    save();
    const u=data.units[inst.unitId];const records=u?unitSlotRecords(u):[];
    const next=u?nextEmptySlot(inst,records,slotIndex):-1;
    browser=next>=0?{mode:'upgrades',unitInstanceId:inst.instanceId,slotIndex:next,slotKey:records[next].key}:null;
    render();
  };
  if(card.assets&&card.assets.front){const im=el('img');im.src=card.assets.front;im.alt='';im.loading='lazy';im.onerror=()=>{const ph=el('div');ph.className='card-placeholder';ph.textContent='暂无卡图';im.replaceWith(ph)};b.append(im)}
  else{const ph=el('div');ph.className='card-placeholder';ph.textContent='暂无卡图';b.append(ph)}
  const meta=el('div');meta.className='meta';meta.append(el('strong',card.name.zh||card.name.en),el('span',(card.points||0)+' 分'));b.append(meta);
  return b;
}

function invalidMarks(report){
  const units=new Set(),ranks=new Set();
  for(const i of (report&&report.issues)||[]){
    if(i.status!=='invalid')continue;
    if(i.rank!=null)ranks.add(Number(i.rank));
    const key=i.instanceId;
    if(!key)continue;
    if(army.units.some(u=>u.instanceId===key)){units.add(key);continue}
    for(const u of army.units){if((u.upgrades||[]).some(x=>x.instanceId===key)){units.add(u.instanceId);break}}
  }
  return {units,ranks};
}
function renderRankBar(report){
  const bar=$('#rank-bar');bar.replaceChildren();
  const counts={},badByRank={};
  const marks=invalidMarks(report);
  for(const inst of army.units){
    const u=data.units[inst.unitId];if(!u)continue;
    const r=rankOf(u,army.armyId);if(r==null)continue;
    counts[r]=(counts[r]||0)+1;
    if(marks.ranks.has(r)||marks.units.has(inst.instanceId))badByRank[r]=true;
  }
  for(const r of RANK_ORDER){
    const chip=el('div');chip.className='rank-chip';chip.title='查看 '+RANK_LABEL[r]+' 单位卡';
    if(browser&&browser.mode==='units'&&browser.rank===r)chip.classList.add('active');
    const icon=el('span',RANK_GLYPH[r]||'');icon.className='rank-icon';
    const name=el('span',RANK_SHORT[r]);name.className='rank-name';
    const b=el('span',String(counts[r]||0));b.className='badge'+(badByRank[r]?' bad':'');
    chip.append(icon,name,b);
    chip.onclick=()=>{browser={mode:'units',rank:r};render()};
    bar.append(chip);
  }
}
function keywordRef(id){
  return (data.defs.keywords||[]).find(k=>String(k.id)===String(id));
}
function kwChip(kid){
  const kw=keywordRef(kid);if(!kw)return null;
  const label=(kw.name&&(kw.name.zh||kw.name.en))||kid;
  const chip=el('span',label);chip.className='kw-chip';chip.title=kw.summary||kw.full||label;
  return chip;
}
function diceText(d){
  const d2=d||{};
  const parts=[];if(d2.red)parts.push(d2.red+'R');if(d2.black)parts.push(d2.black+'B');if(d2.white)parts.push(d2.white+'W');
  return parts.join(' ');
}
function rangeText(r){
  if(!r)return '—';
  const mn=r.min??null,mx=r.max??null;
  if(mn===null)return '—';
  if(mx===null||mx===mn)return String(mn);
  return mn+'-'+mx;
}
function weaponLine(w){
  const name=(w.name&&(w.name.zh||w.name.en))||'武器';
  const line=el('span');line.className='weapon-line';
  line.append(el('b',name),el('i','射程 '+rangeText(w.range)),el('i','骰 '+diceText(w.dice)));
  for(const k of (w.keywords||[])){const c=kwChip(k.id||k);if(c)line.append(c)}
  return line;
}
function renderUnits(){
  const box=$('#army-units');box.replaceChildren();
  const rankIdx=r=>{const i=RANK_ORDER.indexOf(r);return i<0?99:i};
  const sorted=[...army.units].sort((a,b)=>{const ua=data.units[a.unitId],ub=data.units[b.unitId];return rankIdx(ua?rankOf(ua,army.armyId):null)-rankIdx(ub?rankOf(ub,army.armyId):null)});
  for(const inst of sorted){
    const u=data.units[inst.unitId];const row=el('div');row.className='unit-row'+(u&&unitAvailability(u).orphan?' orphan':'');
    if(!u){row.append(el('span','失效单位：'+inst.unitId));box.append(row);continue}
    const rank=rankOf(u,army.armyId);
    const portrait=el('img');portrait.className='portrait';portrait.src=u.assets&&u.assets.portrait?u.assets.portrait:'';portrait.alt='';portrait.onerror=()=>portrait.style.visibility='hidden';
    const tag=el('span',RANK_SHORT[rank]||'—');tag.className='rank-tag';
    const main=el('div');main.className='main';
    const nameRow=el('div');nameRow.className='name';
    nameRow.append(el('span',u.name.zh||u.name.en));
    const titleTxt=(u.title&&(u.title.zh||u.title.en))||'';
    if(titleTxt){const t=el('span',titleTxt);t.className='unit-title';nameRow.append(t)}
    nameRow.append(el('small','（'+(u.points||0)+'）'));
    main.append(nameRow);
    const slots=el('div');slots.className='slots';
    const records=unitSlotRecords(u,inst);
    records.forEach((rec,i)=>{
      const chosen=(inst.upgrades||[]).find(x=>x.slotIndex===i);
      if(chosen){
        const c=data.upgrades[chosen.upgradeId];const chip=el('span');chip.className='slot-chip filled';chip.append(el('span',c?(c.name.zh||c.name.en):chosen.upgradeId));
        for(const k of (c&&c.keywords)||[]){const kc=kwChip(k.id||k);if(kc)chip.append(kc)}
        const x=el('span','×');x.className='x';x.onclick=e=>{e.stopPropagation();inst.upgrades=inst.upgrades.filter(y=>y!==chosen);save();render()};chip.append(x);slots.append(chip);
      }else{
        const def=slotDef(rec.key);const chip=el('span');chip.className='slot-chip';const glyph=el('span',def&&def.iconGlyph?def.iconGlyph:'');glyph.className='slot-glyph';chip.append(glyph,el('span',slotName(rec.key)));
        if(browser&&browser.mode==='upgrades'&&browser.unitInstanceId===inst.instanceId&&browser.slotIndex===i)chip.classList.add('active');
        chip.onclick=e=>{e.stopPropagation();browser={mode:'upgrades',unitInstanceId:inst.instanceId,slotIndex:i,slotKey:rec.key};render()};
        slots.append(chip);
      }
    });
    for(const ch of (inst.upgrades||[]).filter(x=>x.slotIndex>=records.length)){
      const c=data.upgrades[ch.upgradeId];const chip=el('span');chip.className='slot-chip filled invalid';chip.append(el('span',c?(c.name.zh||c.name.en):ch.upgradeId));
      const x=el('span','×');x.className='x';x.onclick=e=>{e.stopPropagation();inst.upgrades=inst.upgrades.filter(y=>y!==ch);save();render()};chip.append(x);slots.append(chip);
    }
    main.append(slots);
    const weaponsBox=el('div');weaponsBox.className='weapons';
    for(const w of (u.weapons||[])){if(!w||!(w.name&&(w.name.zh||w.name.en)))continue;weaponsBox.append(weaponLine(w))}
    if(weaponsBox.children.length)main.append(weaponsBox);
    const ukw=el('div');ukw.className='unit-kws';
    for(const k of (u.keywords||[])){const id=(k&&k.id)?k.id:k;const c=kwChip(id);if(c){const wrap=el('span');wrap.className='unit-kw';wrap.append(c);if(k&&k.value!=null)wrap.append(el('i',k.value));ukw.append(wrap)}}
    if(ukw.children.length)main.append(ukw);
    const pts=el('div',String((u.points||0)+(inst.upgrades||[]).reduce((s,x)=>s+((data.upgrades[x.upgradeId]||{}).points||0),0)));pts.className='pts';
    const ops=el('div');ops.className='ops';
    if(isUnique(u)){const t=el('button','🗑');t.className='trash';t.onclick=e=>{e.stopPropagation();army.units=army.units.filter(x=>x!==inst);save();render()};ops.append(t)}
    else{const minus=el('button','−1');minus.onclick=e=>{e.stopPropagation();army.units=army.units.filter(x=>x!==inst);save();render()};const plus=el('button','+1');plus.onclick=e=>{e.stopPropagation();army.units.push({instanceId:uid(),unitId:inst.unitId,upgrades:JSON.parse(JSON.stringify(inst.upgrades||[]))});save();render()};ops.append(minus,plus)}
    row.append(portrait,tag,main,pts,ops);box.append(row);
  }
  if(!army.units.length)box.append(el('p','点击上方军阶图标查看并添加单位卡。'));
}
function renderBrowser(){
  const title=$('#browser-title'),grid=$('#card-grid'),close=$('#browser-close');
  grid.className='card-grid';grid.replaceChildren();
  close.hidden=true;
  if(!browser){title.textContent='点击军阶或槽位查看卡牌';return}
  if(browser.mode==='units'){
    close.hidden=false;grid.className='card-grid units';
    title.textContent='单位卡 · '+(RANK_LABEL[browser.rank]||browser.rank);
    const list=Object.values(data.units).filter(u=>u.usage!=='counterpart'&&!u.isCounterpart&&rankOf(u,army.armyId)===browser.rank&&!unitAvailability(u).hidden);
    for(const u of list)grid.append(unitCard(u));
    if(!list.length)grid.append(el('p','该军阶没有可用单位。'));
  }else if(browser.mode==='upgrades'){
    close.hidden=false;grid.className='card-grid upgrades';
    const inst=army.units.find(x=>x.instanceId===browser.unitInstanceId),u=inst&&data.units[inst.unitId];
    if(!u){browser=null;renderBrowser();return}
    title.textContent='升级卡 · '+(u.name.zh||u.name.en)+' · '+slotName(browser.slotKey);
    const selUp=selectedUpstreamIds();const cands=Object.values(data.upgrades).filter(c=>restrictionOk(c,u,inst)&&accessOf(c).includes(browser.slotKey)&&!alreadySelectedUnique(c)&&!sameNameSelected(c,inst)&&!conflictsWithSelected(c,selUp));
    cands.sort((a,b)=>(a.name.zh||a.name.en).localeCompare(b.name.zh||b.name.en,'zh'));
    for(const c of cands)grid.append(upgradeCard(c,inst,browser.slotIndex));
    if(!cands.length)grid.append(el('p','没有可放入该槽的升级。'));
  }else if(browser.mode==='commands'){
    close.hidden=false;grid.className='card-grid commands';
    const idx=browser.slotIndex;
    const wanted=commandSlotPips()[idx];
    const picked=new Set((army.commandIds||[]).map(String));
    title.textContent='战术卡 · 牌点 '+wanted+(wanted===4?' · Standing Orders':'');
    const list=(data.defs.commands||[])
      .filter(c=>!c.hidden)
      .filter(commandAvailable)
      .filter(c=>slotPipOf(c)===wanted)
      .filter(c=>!picked.has(String(c.id))||String(army.commandIds[idx])===String(c.id))
      .sort((a,b)=>String(a.name.en).localeCompare(String(b.name.en)));
    for(const c of list){
      const b=el('button');b.type='button';b.className='command-slot filled'+(c.image?' with-art':'');
      if(c.image){const art=el('img');art.className='slot-art';art.src=c.image;art.alt='';art.loading='lazy';b.append(art)}
      const pip=document.createElement('span');pip.className='slot-pip';pip.append(pipDots(c.pips));b.append(pip);
      b.append(commandMask(c));
      b.title=((c.name&&c.name.en)||'')+' · '+(commandText(((c.description||{}).zh)||((c.description||{}).en)||''));
      b.onclick=()=>pickCommand(c,idx);
      grid.append(b);
    }
    if(!list.length)grid.append(el('p','该牌点没有可选的战术卡。'));
  }
}
function renderIssues(report){
  const box=$('#issues');box.replaceChildren();
  const h=el('p',report.status==='invalid'?'存在明确问题':report.status==='valid'?'规则范围内通过':'规则覆盖待确认');h.className='issue '+report.status;box.append(h);
  for(const i of report.issues){const p=el('p',(i.instanceId?'['+i.instanceId+'] ':'')+i.message);p.className='issue '+i.status;box.append(p)}
}
function renderFaction(){
  const sel=$('#faction');sel.replaceChildren();
  const ids=[...new Set([...data.defs.armies.map(a=>a.id),...Object.keys(data.pkg.battleForces||{}).map(Number)])];
  for(const id of ids){const a=data.defs.armies.find(x=>x.id===id);const bf=(data.pkg.battleForces||{})[String(id)];const op=el('option',(a?a.name.zh||a.name.en:id)+(bf&&bf.status==='machine'?'':(bf?'（部分规则）':'')));op.value=id;sel.append(op)}
  sel.value=army.armyId;sel.onchange=()=>{army.armyId=Number(sel.value);army.units=[];army.commandIds=[];army.deck={};browser=null;save();render()};
}
function renderMode(){const sel=$('#mode');sel.value=army.mode;sel.onchange=()=>{army.mode=sel.value;army.pointsLimit=sel.value==='standard'?1000:600;save();render()}}
function renderPoints(report){const limit=army.pointsLimit||1000;$('#points').textContent=report.basePoints+' / '+limit+' ('+(limit-report.basePoints)+')'}
function pipDots(n){
  const box=document.createElement('span');
  box.className='pip-badge pip-'+(Number(n)||0);
  box.title='牌点 '+n;
  return box;
}
function commandOf(id){return (data.defs.commands||[]).find(c=>String(c.id)===String(id))||null}
function commandName(cmd){return (cmd.name&&(cmd.name.zh||cmd.name.en))||String(cmd.id)}
function unitMatchesUnlock(entry,u){
  if(!entry||!u)return false;
  if(entry.id!=null)return String(entry.id)===String(((u.upstream||{}).id||' '));
  const prop=entry.property, val=entry.value;
  if(prop==='faction')return Number(u.factionId)===Number(val);
  if(prop==='affiliation')return (u.affiliationIds||[]).map(String).includes(String(val));
  if(prop==='unitType')return Number(u.unitTypeId)===Number(val);
  if(prop==='rank')return Number(u.rankId)===Number(val);
  if(prop==='keywords')return (u.keywords||[]).some(k=>k&&String(k.id)===String(val));
  return false;
}
function isMercenaryUnit(u){
  if(!u)return false;
  if((u.keywords||[]).some(k=>k&&k.id==='mercenary'))return true;
  return (u.factions||[]).some(f=>f&&(f.tierPools||[]).includes('mercenary'));
}
function commandAvailable(cmd){
  const facs=cmd.factions||[];
  const armyId=Number(army.armyId);
  const parent=(data.defs.armies||[]).find(a=>a.id===armyId)?null:null;
  if(facs.length&&!facs.includes(armyId)){
    const bf=(data.pkg.battleForces||{})[String(armyId)];
    const parentName=bf&&bf.parentFaction;
    const parentArmy=parentName?(data.defs.armies||[]).find(a=>(a.name&&(a.name.en===parentName||a.name.zh===parentName))):null;
    if(!(parentArmy&&facs.includes(parentArmy.id)))return false;
  }
  const units=(army.units||[]).map(i=>data.units[i.unitId]).filter(Boolean);
  if(cmd.mercenary&&!units.some(isMercenaryUnit))return false;
  if(cmd.condition){
    const preds=data.pkg.predicates||{};
    const ok=units.some(u=>RulesCore.evaluate(cmd.condition,RulesCore.unitContext(u),preds)===true);
    if(!ok)return false;
  }
  const unlocks=(cmd.unlockedBy||[]).filter(x=>x&&x.propertyName==='units');
  if(unlocks.length){
    const hit=unlocks.some(x=>units.some(u=>unitMatchesUnlock(x,u)));
    if(!hit)return false;
  }
  return true;
}
function commandSlotPips(){
  const mode=(data.pkg.modes||{})[army.mode]||{};
  const hand=mode.commandHand||[];
  const out=[];
  for(const rule of hand){const n=rule.min||0;for(let i=0;i<n;i++)out.push(rule.pips)}
  return out.length?out:[1,1,2,2,3,3,4];
}
function commandSlots(){return commandSlotPips().length}
function slotPipOf(cmd){return cmd?(cmd.slotPips!=null?cmd.slotPips:cmd.pips):null}
function pipLabel(cmd){
  const printed=cmd.pips, slot=slotPipOf(cmd);
  return '';
}
function deckPicker(title,items,onPick){
  const overlay=el('div');overlay.className='pick-overlay';
  const box=el('div');box.className='pick-box';
  const head=el('div');head.className='pick-head';
  const input=el('input');input.placeholder='搜索名称';
  const close=el('button','×');close.type='button';close.className='pick-close';close.onclick=()=>overlay.remove();
  head.append(el('strong',title),input,close);
  const list=el('div');list.className='pick-list';
  const draw=q=>{
    list.replaceChildren();
    const key=String(q||'').toLowerCase();
    for(const it of items){
      if(key&&!((it.label||'').toLowerCase().includes(key)||String(it.sub||'').toLowerCase().includes(key)))continue;
      const b=el('button');b.type='button';b.className='pick-item'+(it.image?' with-art':'');
      if(it.image){const thumb=el('img');thumb.className='pick-thumb';thumb.src=it.image;thumb.alt='';thumb.loading='lazy';b.append(thumb)}
      const body=el('span');body.className='pick-body';
      const line=el('span');line.className='pick-line';
      line.append(el('strong',it.label||it.id));
      if(it.sub)line.append(el('small',it.sub));
      if(it.pips!=null){const bd=document.createElement('span');bd.className='pick-badge';bd.append(pipDots(it.pips));line.append(bd)}
      body.append(line);
      if(it.text)body.append(el('p',it.text));
      if(it.owner||it.orders){const meta=el('span',((it.owner?('所属 '+it.owner):'')+(it.orders?(' · 下令 '+it.orders):'')).trim());meta.className='pick-meta';body.append(meta)}
      b.append(body);
      b.onclick=()=>{onPick(it);overlay.remove()};
      list.append(b);
    }
    if(!list.children.length)list.append(el('p','没有可选项'));
  };
  input.oninput=()=>draw(input.value);
  box.append(head,list);overlay.append(box);document.body.append(overlay);
  draw('');input.focus();
}
const ORDER_GLYPH={'rank-commander':'5','rank-operative':'b','rank-corps':'6','rank-special-forces':'7','rank-special':'7','rank-support':'8','rank-heavy':'9'};
const ORDER_NAME={'rank-commander':'指挥官','rank-operative':'特工','rank-corps':'核心','rank-special-forces':'特种','rank-special':'特种','rank-support':'支援','rank-heavy':'重型'};
function ordersNodes(text){
  const frag=document.createDocumentFragment();
  const src=String(text||'');
  const re=/\{@icon\.([a-z0-9-]+)\}/g;
  let last=0,m;
  while((m=re.exec(src))){
    if(m.index>last)frag.append(document.createTextNode(src.slice(last,m.index)));
    const glyph=ORDER_GLYPH[m[1]];
    if(glyph){const chip=document.createElement('span');chip.className='order-chip';const ic=document.createElement('i');ic.className='order-glyph';ic.textContent=glyph;chip.append(ic);const nm=document.createElement('em');nm.className='order-name';nm.textContent=ORDER_NAME[m[1]]||'';chip.append(nm);frag.append(chip)}
    last=re.lastIndex;
  }
  if(last<src.length)frag.append(document.createTextNode(src.slice(last)));
  return frag;
}
function ownerLabel(cmd){
  if(cmd.owner&&String(cmd.owner).toLowerCase()==='generic')return '通用';
  if(cmd.owner)return cmd.owner;
  const armies=(data.defs.armies||[]).map(a=>a.id);
  const facs=(cmd.factions||[]);
  if(armies.length&&armies.every(id=>facs.includes(id)))return '通用';
  const names=facs.map(id=>{const a=(data.defs.armies||[]).find(x=>x.id===id);return a?((a.name&&(a.name.zh||a.name.en))||String(id)):String(id)});
  if(!names.length)return '通用';
  return names.length>3?names.slice(0,3).join(' / ')+' …':names.join(' / ');
}
function commandMask(card){
  const mask=el('div');mask.className='slot-mask';
  const nm=el('div',commandName(card));nm.className='mask-seg mask-name';mask.append(nm);
  const orders=((card.orders||{}).zh)||((card.orders||{}).en)||'';
  const od=el('div');od.className='mask-seg mask-orders';
  const odk=el('span','下令');const odv=el('b');odv.append(ordersNodes(orders));if(!orders)odv.textContent='—';
  od.append(odk,odv);mask.append(od);
  const eff=commandText(((card.description||{}).zh)||((card.description||{}).en)||'');
  const pp=el('div',eff||'—');pp.className='mask-seg mask-effect';mask.append(pp);
  const ow=el('div');ow.className='mask-seg mask-owner';
  const owk=el('span','所属');const owv=el('b',ownerLabel(card));ow.append(owk,owv);mask.append(ow);
  return mask;
}
function commandText(text){
  if(!text)return '';
  const map={'rank-commander':'指挥官','rank-operative':'特工','rank-corps':'核心','rank-special-forces':'特种','rank-support':'支援','rank-heavy':'重型','rank-special':'特种'};
  return String(text).replace(/\{@icon\.([a-z0-9-]+)\}/g,(m,name)=>map[name]||'');
}
function openCommandCard(cmd,index){
  const overlay=el('div');overlay.className='card-view-overlay';
  const box=el('div');box.className='card-view';
  const head=el('div');head.className='card-view-head';
  head.append(el('strong',commandName(cmd)),pipDots(cmd.pips));
  const close=el('button','×');close.type='button';close.className='pick-close';close.onclick=()=>overlay.remove();
  head.append(close);
  const figure=el('div');figure.className='card-view-figure';
  if(cmd.image){const img=el('img');img.src=cmd.image;img.alt=commandName(cmd);figure.append(img)}
  else figure.append(el('p','暂无卡图'));
  const mask=el('div');mask.className='card-view-mask';
  const titleRow=el('div');titleRow.className='view-title';titleRow.append(el('strong',commandName(cmd)));
  const ozh=(cmd.orders||{}).zh||'';const oen=(cmd.orders||{}).en||'';
  const tag=el('span','下令 · '+(commandText(ozh)||commandText(oen)||'—'));tag.className='view-tag';
  const dzh=(cmd.description||{}).zh||'';const den=(cmd.description||{}).en||'';
  const eff=el('p',commandText(dzh)||commandText(den)||'暂无效果文本');eff.className='view-effect';
  const ownerLine=el('div','所属 · '+ownerLabel(cmd));ownerLine.className='view-owner';
  mask.append(titleRow,tag,eff,ownerLine);
  figure.append(mask);
  box.append(head,figure);
  if(index!=null){
    const actions=el('div');actions.className='card-view-actions';
    const swap=el('button','更换这张');swap.type='button';
    swap.onclick=()=>{overlay.remove();openCommandSlot(index)};
    actions.append(swap);
    box.append(actions);
  }
  overlay.append(box);document.body.append(overlay);
}
function openCommandSlot(index){
  browser={mode:'commands',slotIndex:index};
  render();
}
function pickCommand(cmd,index){
  army.commandIds[index]=String(cmd.id);
  save();render();
  const total=commandSlots();
  let next=-1;
  for(let i=index+1;i<total;i++){if(!army.commandIds[i]){next=i;break}}
  if(next<0)for(let i=0;i<index;i++){if(!army.commandIds[i]){next=i;break}}
  if(next>=0){browser={mode:'commands',slotIndex:next};render()}
  else browser=null;
}
function openDeckSlot(kind,label){
  army.deck=army.deck||{};
  const source=kind==='advantage'?data.deckData.conditions:kind==='deployment'?data.deckData.deployments:data.deckData.objectives;
  const items=(source||[]).filter(x=>{
    if(x.armyIds&&x.armyIds.length&&!x.armyIds.includes(Number(army.armyId)))return false;
    return true;
  }).map(x=>({id:x.id,label:(x.name&&(x.name.zh||x.name.en))||x.id,sub:(x.name&&x.name.en)||''}));
  deckPicker('选择'+label,items,it=>{army.deck[kind]=it.id;save();render()});
}
function renderDeck(){
  const box=$('#deck-panel');if(!box)return;box.replaceChildren();
  army.commandIds=army.commandIds||[];army.deck=army.deck||{};
  const section=el('section');section.className='deck-section';
  const head=el('div');head.className='deck-head';
  head.append(el('h3','战术卡'));
  const picked=(army.commandIds||[]).filter(Boolean);
  head.append(el('span','已选 '+picked.length+'/'+commandSlots()));
  section.append(head);
  const grid=el('div');grid.className='command-slots';
  const slotPips=commandSlotPips();
  for(let i=0;i<slotPips.length;i++){
    const card=commandOf(army.commandIds[i]);
    const b=el('button');b.type='button';b.className='command-slot'+(card?' filled':'')+(card&&card.image?' with-art':'');
    if(card){
      if(card.image){const art=el('img');art.className='slot-art';art.src=card.image;art.alt='';art.loading='lazy';b.append(art)}
      const pip=document.createElement('span');pip.className='slot-pip';pip.append(pipDots(card.pips));b.append(pip);
      const mask=el('div');mask.className='slot-mask';
      const nm=el('div',commandName(card));nm.className='mask-seg mask-name';mask.append(nm);
      const ordersRaw=((card.orders||{}).zh)||((card.orders||{}).en)||'';
      const orders=ordersRaw;
      const od=el('div');od.className='mask-seg mask-orders';
      const odk=el('span','下令');const odv=el('b');odv.append(ordersNodes(orders));if(!orders)odv.textContent='—';
      od.append(odk,odv);mask.append(od);
      const eff=commandText(((card.description||{}).zh)||((card.description||{}).en)||'');
      const pp=el('div',eff||'—');pp.className='mask-seg mask-effect';mask.append(pp);
      const ow=el('div');ow.className='mask-seg mask-owner';
      const owk=el('span','所属');const owv=el('b',ownerLabel(card));ow.append(owk,owv);mask.append(ow);
      b.append(mask);
      b.title=((card.name&&card.name.en)||'')+' · '+eff;
      const rm=el('span','×');rm.className='command-remove';rm.title='移除';
      rm.onclick=ev=>{ev.stopPropagation();army.commandIds[i]=null;save();render()};
      b.append(rm);
    }else{
      const slotDots=document.createElement('span');slotDots.append(pipDots(slotPips[i]));b.append(slotDots,el('strong','+ 选择'));
    }
    b.onclick=()=>card?openCommandCard(card,i):openCommandSlot(i);
    grid.append(b);
  }
  section.append(grid);
  const deckRow=el('div');deckRow.className='deck-row';
  for(const [kind,label] of [['primary','主要目标'],['secondary','次要目标'],['advantage','优势'],['deployment','部署']]){
    const id=army.deck[kind];
    const source=kind==='advantage'?data.deckData.conditions:kind==='deployment'?data.deckData.deployments:data.deckData.objectives;
    const entry=id?(source||[]).find(x=>x.id===id):null;
    const b=el('button');b.type='button';b.className='deck-slot'+(entry?' filled':'');
    b.append(el('small',label),el('strong',entry?((entry.name&&(entry.name.zh||entry.name.en))||entry.id):'未选择'));
    b.onclick=()=>openDeckSlot(kind,label);
    deckRow.append(b);
  }
  section.append(deckRow);
  box.append(section);
}
function render(){
  if(!data||!army)return;
  renderFaction();renderMode();
  const report=RulesCore.validateArmy(army,data);
  renderPoints(report);renderRankBar(report);renderUnits();renderDeck();renderBrowser();renderIssues(report);
  const bad=report.issues.filter(i=>i.status==='invalid').length;
  $('#issue-count').textContent=bad?('⚠ '+bad):'';
}
function save(){try{localStorage.setItem('swl-army-draft',JSON.stringify(army))}catch(e){}}
function restore(){try{const s=localStorage.getItem('swl-army-draft');if(s)army=JSON.parse(s)}catch(e){}if(!army)army={mode:'standard',armyId:1,pointsLimit:1000,units:[],commandIds:[],options:[]}}
$('#info').onclick=()=>{const p=$('#issues-panel');p.hidden=!p.hidden};
$('#browser-close').onclick=()=>{browser=null;render()};
load();