/* Rule library editor for data/slot-rules.json (semantic rule package). */
const {el,api}=EditorCommon,$=s=>document.querySelector(s);
let rules,defs,revision,dirty=false,tab='slots';
let bfId=null,bfData=null,bfPreview={unitId:'',cardId:''};
function status(t,error=false){$('#status').textContent=t;$('#status').classList.toggle('error',error)}
function setDirty(){dirty=true;$('#dirty').textContent='有未保存修改';$('#raw-json').value=JSON.stringify(rules,null,2)}
function renderSlots(){
  const table=$('#slots-table');table.replaceChildren();
  const head=document.createElement('tr');
  for(const t of ['语义 ID','来源','类别','中文','英文'])head.append(el('th',t));
  table.append(head);
  for(const s of rules.slots){
    const row=document.createElement('tr');
    row.append(el('td',s.id),el('td',String(s.sourceId)),el('td',s.kind),el('td',s.name.zh),el('td',s.name.en));
    table.append(row);
  }
}
function renderDedicated(){
  const box=$('#dedicated-grants');box.replaceChildren();
  const pred=el('details');pred.open=true;pred.append(el('summary','命名条件 predicates'));
  pred.append(el('pre',JSON.stringify(rules.predicates||{},null,2)));box.append(pred);
  box.append(el('p','槽位授予已并入卡片 rules.slotGrants（equipped / unitQualifies）；请到升级卡编辑器维护。'));}
function renderUpgradeRules(){
  const box=$('#upgrade-rules');box.replaceChildren();
  for(const [id,rule] of Object.entries(rules.upgradeRules||{})){
    const d=el('details');d.append(el('summary',id+' · '+(rule.host?'角色限定':'军队唯一/互斥')));
    d.append(el('pre',JSON.stringify(rule,null,2)));box.append(d);
  }
  if(!Object.keys(rules.upgradeRules||{}).length)box.append(el('p','暂无人工语义覆盖；默认按升级卡 slotIds 推导槽位匹配，其余限制回退上游快照。'));
}
function renderModes(){$('#modes-pre').textContent=JSON.stringify(rules.modes,null,2)}
function renderDictionary(){
  const box=$('#dictionary');box.replaceChildren();
  const tables=[['unitTypes','单位类型'],['factions','卡牌阵营'],['armies','军队 / 战斗部队'],['affiliations','组织'],['ranks','军阶'],['upgradeSlots','升级槽位'],['options','选项']];
  for(const [key,label]of tables){const d=el('details');d.open=key==='unitTypes';d.append(el('summary',label+' · '+((defs[key]||[]).length)+' 项'));const tbl=document.createElement('table');tbl.className='reference-table';for(const item of defs[key]||[]){const tr=document.createElement('tr');tr.append(el('td',String(item.id)),el('td',item.name?(item.name.zh||item.name.en):''),el('td',item.name?(item.name.en||''):''));tbl.append(tr)}d.append(tbl);box.append(d)}
  const kw=el('details');kw.append(el('summary','关键词 · '+((defs.keywords||[]).length)+' 项'));kw.append(el('p','关键词数量较多，此处仅显示计数；完整词条在关键词词典维护。'));box.append(kw);
}

/* ---------- battle force editor ---------- */
async function loadBfData(){
  if(bfData)return bfData;
  const [units,upgrades]=await Promise.all([
    fetch('data/units.json').then(r=>r.json()),
    fetch('data/upgrades.json').then(r=>r.json())
  ]);
  bfData={units:Object.fromEntries((units.units||[]).map(u=>[u.id,u])),upgrades:Object.fromEntries((upgrades.cards||[]).map(c=>[c.id,c]))};
  bfData.nameIndex=window.RulesCore?window.RulesCore.buildNameIndex(bfData.upgrades,defs):{};
  return bfData;
}
function bfRow(children){
  const row=el('div');row.className='bf-row';
  for(const c of children)row.append(c);
  return row;
}
function bfText(value,onchange,placeholder){
  const i=el('input');i.value=value==null?'':String(value);i.placeholder=placeholder||'';
  i.onchange=()=>{onchange(i.value);setDirty()};
  return i;
}
function bfNum(value,onchange){
  const i=el('input');i.type='number';i.step='1';i.value=value==null?'':String(value);
  i.onchange=()=>{onchange(i.value===''?null:Number(i.value));setDirty()};
  return i;
}
function bfSelect(options,value,onchange){
  const s=el('select');
  for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o)}
  s.value=value==null?'':String(value);
  s.onchange=()=>{onchange(s.value);setDirty()};
  return s;
}
function bfMulti(options,values,onchange){
  const s=el('select');s.multiple=true;s.size=Math.min(4,options.length);
  for(const [v,t] of options){const o=el('option',t);o.value=v;s.append(o)}
  const set=new Set((values||[]).map(String));
  for(const o of [...s.options])o.selected=set.has(o.value);
  s.onchange=()=>{onchange([...s.selectedOptions].map(o=>o.value));setDirty()};
  return s;
}
function bfDel(list,index,rerender){
  const b=el('button','删除');b.type='button';b.className='minor';
  b.onclick=()=>{list.splice(index,1);setDirty();rerender()};
  return b;
}
function bfAdd(label,getList,item,rerender){
  const b=el('button','＋ '+label);b.type='button';
  b.onclick=()=>{const list=getList();list.push(item());setDirty();rerender()};
  return b;
}
function slotOptions(){return (rules.slots||[]).map(s=>[s.id,(s.name.zh||s.name.en||s.id)+' · '+s.id])}
function unitTypeOptions(){return (defs.unitTypes||[]).map(t=>[String(t.id),(t.name.zh||t.name.en)+' · '+t.id])}
function keywordOptions(){return (defs.keywords||[]).map(k=>[k.id,(k.name.zh||k.name.en||k.id)])}
function unitNameOptions(){return ((defs.sourceUnits||[]).map(s=>s.name.en)).slice(0,400)}

function renderAllowedUnits(box,bf,rerender){
  const sec=el('div');sec.className='bf-section';
  sec.append(el('h3','允许单位（按名字 · 按军阶）'));
  const hint=el('p','默认按单位卡里的「可加入军队」自动汇总；在这里可以逐个军阶增加或移除单位名称。同名单位会一起生效。');
  hint.className='hint';sec.append(hint);
  if(!bfData){
    const loading=el('p','正在载入单位数据…');loading.className='hint';sec.append(loading);box.append(sec);
    loadBfData().then(()=>renderBattleForces()).catch(e=>status(e.message,true));
    return;
  }
  const rankName={1:'指挥官',6:'特工',2:'核心',3:'特种部队',4:'支援',5:'重型'};
  const derived={};
  for(const u of Object.values(bfData.units||{})){
    const rank=window.RulesCore?window.RulesCore.armyRank(u,Number(bfId),rules,defs,bfData.units):null;
    if(rank==null) continue;
    const name=(u.name&&u.name.en)||u.id;
    (derived[rank]=derived[rank]||[]).includes(name)||derived[rank].push(name);
  }
  const explicit=(bf.allowedUnits&&typeof bf.allowedUnits==='object')?bf.allowedUnits:null;
  const source=explicit||derived;
  const materialize=()=>{
    if(bf.allowedUnits) return bf.allowedUnits;
    const copy={};
    for(const [rank,names] of Object.entries(derived)) copy[rank]=names.slice();
    bf.allowedUnits=copy;
    return bf.allowedUnits;
  };
  let total=0;
  for(const rank of [1,6,2,3,4,5]){
    const names=source[rank]||source[String(rank)]||[];
    total+=names.length;
    const fs=el('fieldset');fs.className='restriction-section';
    fs.append(el('legend',(rankName[rank]||rank)+' · rank '+rank+' · '+names.length+' 个名字'));
    fs.append(unitMultiField('允许单位',names,v=>{
      const target=materialize();
      if(v.length) target[rank]=v; else delete target[rank];
      setDirty();
      rerender();
    }));
    sec.append(fs);
  }
  const sum=el('p','当前共 '+total+' 个允许单位名称'+(explicit?'（已自定义）':'（按卡牌归属自动汇总）'));
  sum.className='hint';sec.append(sum);
  if(explicit){
    const reset=el('button','恢复默认（按卡牌归属）');reset.type='button';
    reset.onclick=()=>{delete bf.allowedUnits;setDirty();rerender()};
    sec.append(reset);
  }
  box.append(sec);
}

function unitMultiField(label,values,onChange){
  const row=el('div');row.className='bf-row';
  const btn=el('button','选择单位'+(values.length?'（'+values.length+'）':''));btn.type='button';
  btn.onclick=()=>{
    if(!window.UnitPicker){status('单位选择器未载入',true);return}
    const units=(defs.sourceUnits||[]).map(s=>({id:s.id,name:s.name}));
    const selected=values.map(n=>{const hit=(defs.sourceUnits||[]).find(s=>(s.name&&s.name.en)===n||String(s.id)===String(n));return hit?String(hit.id):null}).filter(Boolean);
    window.UnitPicker.openMulti(units,selected,ids=>{
      const names=ids.map(id=>{const s=(defs.sourceUnits||[]).find(x=>String(x.id)===String(id));return s?((s.name&&s.name.en)||String(id)):String(id)});
      onChange(names);setDirty();renderBattleForces();
    });
  };
  row.append(el('span',label),btn);
  for(const n of values){const chip=el('span',n);chip.className='rule-chip';row.append(chip)}
  return row;
}
function renderOverrides(box,bf,rerender){
  const ov=rules.armyOverrides=rules.armyOverrides||{};
  const id=bfId;
  const data=ov[id]=ov[id]||{};
  const sec=el('div');sec.className='bf-section';
  sec.append(el('h3','本部队专属规则（覆盖默认行为）'));
  const hint=el('p','下面的规则只对「'+ (bf.name||'本部队') +'」生效，是在通用规则之上叠加的增量：先应用「排除 / 移除」，再应用「纳入 / 新增」——也就是禁止优先。');hint.className='hint';sec.append(hint);

  /* unitCaps */
  const caps=data.unitCaps=data.unitCaps||[];
  const capBox=el('fieldset');capBox.className='restriction-section';
  capBox.append(el('legend','单位数量上限（覆盖单位自身的数量限制）'));
  const dl=el('datalist');dl.id='bf-unit-names';for(const n of unitNameOptions()){const o=el('option');o.value=n;dl.append(o)}
  capBox.append(dl);
  caps.forEach((cap,i)=>{
    const name=el('input');name.value=cap.unitName||'';name.setAttribute('list',dl.id);name.placeholder='单位名';
    name.onchange=()=>{cap.unitName=name.value;setDirty()};
    capBox.append(bfRow([name,bfNum(cap.max,v=>cap.max=v),bfDel(caps,i,rerender)]));
  });
  capBox.append(bfAdd('单位上限',()=>caps,()=>({unitName:'',max:1}),rerender));
  sec.append(capBox);

  /* slotHosts */
  const hosts=data.slotHosts=data.slotHosts||[];
  const hostBox=el('fieldset');hostBox.className='restriction-section';
  hostBox.append(el('legend','槽位可用单位（纳入 = 允许额外使用；排除 = 禁止原本可用的）'));
  hosts.forEach((h,i)=>{
    h.target=h.target||{};
    const slot=bfSelect(slotOptions(),h.slot,v=>h.slot=v);
    const types=bfMulti(unitTypeOptions(),h.target.unitTypes||[],v=>h.target.unitTypes=v.map(Number));
    hostBox.append(el('div','槽位'),slot,el('div','目标单位类型'),types,unitMultiField('纳入',h.include||[],v=>h.include=v),bfRow([unitMultiField('排除',h.exclude||[],v=>h.exclude=v),bfDel(hosts,i,rerender)]));
  });
  hostBox.append(bfAdd('宿主放宽',()=>hosts,()=>({slot:'heavy_weapon',target:{unitTypes:[1]},include:[],exclude:[]}),rerender));
  sec.append(hostBox);

  /* slots add/deny */
  const slots=data.slots=data.slots||[];
  const slotBox=el('fieldset');slotBox.className='restriction-section';
  slotBox.append(el('legend','槽位增减（新增 = 给单位加槽；移除 = 去掉原有的槽）'));
  slots.forEach((r,i)=>{
    const op=bfSelect([['deny','deny 收回'],['add','add 追加']],r.op,v=>r.op=v);
    const slot=bfSelect(slotOptions(),r.slot,v=>r.slot=v);
    const name=bfText((r.target&&r.target.unitNames||[]).join(', '),v=>{r.target=r.target||{};r.target.unitNames=v.split(',').map(x=>x.trim()).filter(Boolean)},'目标单位名，逗号分隔');
    slotBox.append(bfRow([op,slot,name,bfDel(slots,i,rerender)]));
  });
  slotBox.append(bfAdd('槽位覆盖',()=>slots,()=>({op:'deny',slot:'heavy_weapon',target:{unitNames:[]}}),rerender));
  sec.append(slotBox);

  /* keywords */
  const kws=data.keywords=data.keywords||[];
  const kwBox=el('fieldset');kwBox.className='restriction-section';
  kwBox.append(el('legend','关键词规则（禁用 = 不许出现；移除 = 该单位失去此关键词）'));
  const kwdl=el('datalist');kwdl.id='bf-keywords';for(const [v,t] of keywordOptions()){const o=el('option');o.value=v;o.label=t;kwdl.append(o)}
  kwBox.append(kwdl);
  kws.forEach((r,i)=>{
    const op=bfSelect([['ban','ban 禁用'],['remove','remove 剔除']],r.op,v=>r.op=v);
    const kw=el('input');kw.value=r.keyword||'';kw.setAttribute('list',kwdl.id);kw.placeholder='关键词 id';
    kw.onchange=()=>{r.keyword=kw.value;setDirty()};
    const name=bfText((r.target&&r.target.unitNames||[]).join(', '),v=>{r.target=r.target||{};r.target.unitNames=v.split(',').map(x=>x.trim()).filter(Boolean)},'目标单位名（可空=全部）');
    kwBox.append(bfRow([op,kw,name,bfDel(kws,i,rerender)]));
  });
  kwBox.append(bfAdd('关键词规则',()=>kws,()=>({op:'ban',keyword:'',target:{unitNames:[]}}),rerender));
  sec.append(kwBox);
  box.append(sec);
}

function renderPreview(box,bf,rerender){
  const sec=el('div');sec.className='bf-section preview';
  sec.append(el('h3','预览（基线 vs 有效）'));
  if(!window.RulesCore){const h1=el('p','rules-core.js 未载入，预览不可用。');h1.className='hint';sec.append(h1);box.append(sec);return}
  if(!bfData){const h2=el('p','正在载入单位/升级数据…');h2.className='hint';sec.append(h2);box.append(sec);
    loadBfData().then(()=>renderBattleForces()).catch(e=>status(e.message,true));
    return}
  const units=Object.values(bfData.units||{}).filter(u=>(u.factions||[]).some(f=>String(f.id)===String(bfId)));
  if(!bfPreview.unitId&&units.length)bfPreview.unitId=units[0].id;
  const unitSel=bfSelect(units.map(u=>[u.id,(u.name.zh||u.name.en)+' · '+u.id]),bfPreview.unitId,v=>{bfPreview.unitId=v;rerender()});
  const cards=Object.values(bfData.upgrades||{});
  const cardSel=bfSelect([['', '（不测试升级卡）'], ...cards.map(c=>[c.id,(c.name.zh||c.name.en)+' · '+c.id])],bfPreview.cardId,v=>{bfPreview.cardId=v;rerender()});
  sec.append(el('div','单位'),unitSel,el('div','升级卡'),cardSel);
  const unit=bfData.units[bfPreview.unitId];
  if(unit){
    const pkg=JSON.parse(JSON.stringify(rules));
    const data={units:bfData.units,upgrades:bfData.upgrades,defs,pkg,nameIndex:bfData.nameIndex};
    const base=window.RulesCore.slotListFor(pkg,unit,{upgrades:[]},bfData.upgrades);
    const eff=window.RulesCore.slotListFor(pkg,unit,{upgrades:[]},bfData.upgrades,Number(bfId));
    const baseKeys=base.map(r=>r.key), effKeys=eff.map(r=>r.key);
    const added=effKeys.filter(k=>!baseKeys.includes(k));
    const removed=baseKeys.filter(k=>!effKeys.includes(k));
    const row=el('div');row.className='bf-preview';
    row.append(el('div','基线槽位：'+baseKeys.join(' / ')));
    row.append(el('div','有效槽位：'+effKeys.join(' / ')));
    row.append(el('div','新增：'+(added.length?added.join(' / '):'无')));
    row.append(el('div','移除：'+(removed.length?removed.join(' / '):'无')));
    if(bfPreview.cardId){
      const card=bfData.upgrades[bfPreview.cardId];
      const r=window.RulesCore.upgradeEligibility(card,unit,{armyId:Number(bfId)},data);
      row.append(el('div','升级卡资格：'+(r.ok?'通过':'拒绝')+(r.issues.length?' · '+r.issues.map(i=>i.code).join(' / '):'')));
    }
    sec.append(row);
  }
  box.append(sec);
}

function renderBattleForces(){
  const box=$('#battle-forces');box.replaceChildren();
  const ids=Object.keys(rules.battleForces||{}).sort((a,b)=>Number(a)-Number(b));
  if(!ids.length){box.append(el('p','暂无战斗部队骨架。'));return}
  if(!bfId||!ids.includes(bfId))bfId=ids[0];
  const layout=el('div');layout.className='bf-editor';
  const aside=el('aside');aside.className='bf-list';
  for(const id of ids){
    const b=el('button',id+' · '+(rules.battleForces[id].name||''));
    b.className=id===bfId?'active':'';
    b.onclick=()=>{bfId=id;bfPreview={unitId:'',cardId:''};renderBattleForces()};
    aside.append(b);
  }
  layout.append(aside);
  const main=el('div');main.className='bf-main';
  const bf=rules.battleForces[bfId];
  const head=el('div');head.className='bf-head';
  head.append(el('h2',bf.name||''));
  const sub=el('p','所属阵营：'+(bf.parentFaction||'未标注')+' · 规则类型：'+(bf.status==='quotas_only'?'仅军阶配额':'规则 + 配额'));sub.className='hint';head.append(sub);
  main.append(head);

  /* quotas */
  const qbox=el('div');qbox.className='bf-section';
  qbox.append(el('h3','军阶配额'));
  for(const mode of ['standard','recon']){
    const m=(bf.modes=bf.modes||{})[mode]=bf.modes&&bf.modes[mode]||{rankQuotas:[],combined:[]};
    m.rankQuotas=m.rankQuotas||[];m.combined=m.combined||[];
    const fs=el('fieldset');fs.className='restriction-section';
    fs.append(el('legend',mode));
    m.rankQuotas.forEach((q,i)=>{
      fs.append(bfRow([el('span','rank '+q.rankId),bfNum(q.min,v=>q.min=v),bfNum(q.max,v=>q.max=v),bfDel(m.rankQuotas,i,renderBattleForces)]));
    });
    fs.append(bfAdd('军阶配额',()=>m.rankQuotas,()=>({rankId:1,min:0,max:2}),renderBattleForces));
    m.combined.forEach((c,i)=>{
      fs.append(bfRow([el('span','combined'),bfText((c.tiers||[]).join(','),v=>c.tiers=v.split(',').map(Number).filter(n=>!isNaN(n)),'tiers'),bfNum(c.maximum,v=>c.maximum=v),bfDel(m.combined,i,renderBattleForces)]));
    });
    fs.append(bfAdd('组合上限',()=>m.combined,()=>({tiers:[1,6],maximum:2}),renderBattleForces));
    qbox.append(fs);
  }
  main.append(qbox);

  /* text rules */
  const tbox=el('div');tbox.className='bf-section';
  tbox.append(el('h3','特殊规则文本'));
  const ta=el('textarea');ta.value=(bf.textRules||[]).join('\n');ta.rows=4;
  ta.onchange=()=>{bf.textRules=ta.value.split('\n').map(s=>s.trim()).filter(Boolean);setDirty()};
  tbox.append(ta);
  main.append(tbox);

  renderAllowedUnits(main,bf,renderBattleForces);
  renderOverrides(main,bf,renderBattleForces);
  renderPreview(main,bf,renderBattleForces);
  layout.append(main);
  box.append(layout);
}

function render(){
  $('#title').textContent='规则包 swl-rules/v1';
  $('#subtitle').textContent='来源 '+rules.source.provider+' · '+rules.source.contentVersion+' · '+rules.slots.length+' 类槽位';
  renderSlots();renderDedicated();renderUpgradeRules();renderBattleForces();renderModes();renderDictionary();
  $('#sections').replaceChildren();
  for(const [key,label] of [['slots','槽位'],['dedicated','专用槽授予'],['upgradeRules','升级语义规则'],['battleForces','战斗部队'],['modes','模式配额'],['dictionary','数据字典']]){const b=el('button',label);b.dataset.tab=key;b.onclick=()=>setTab(key);$('#sections').append(b)}
}
function setTab(t){tab=t;for(const k of ['slots','dedicated','upgradeRules','battleForces','modes','dictionary','json'])$('#'+k+'-pane').hidden=k!==t;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===t)));if(t==='json')$('#raw-json').value=JSON.stringify(rules,null,2)}
async function reload(){
  if(dirty&&!confirm('放弃未保存修改？'))return;
  try{
    let loaded=null;revision=null;
    try{const resp=await api('/api/slot-rules');loaded=resp.rules;revision=resp.revision}catch(e){loaded=await fetch('data/slot-rules.json').then(r=>r.json())}
    rules=loaded;
    defs=await fetch('data/catalog-definitions.json').then(r=>r.json());
    dirty=false;$('#dirty').textContent='';render();$('#raw-json').value=JSON.stringify(rules,null,2);status('')
  }catch(e){status(e.message,true)}
}
$('#save').onclick=async()=>{try{if(tab==='json'){rules=JSON.parse($('#raw-json').value)}$('#save').disabled=true;const resp=await fetch('/api/slot-rules/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules,revision})});const text=await resp.text();let r;try{r=JSON.parse(text)}catch{throw Error('保存需要 python server.py（当前静态服务无法写回源文件）。')}if(!resp.ok)throw Error(r.error||('HTTP '+resp.status));revision=r.revision;dirty=false;$('#dirty').textContent='';if(window.SaveUI)SaveUI.flashSaved();render();status('已保存规则包；备份 history/slot-rules/'+r.snapshot)}catch(e){if(window.SaveUI)SaveUI.fail(e,reload);else status(e.message,true)}finally{$('#save').disabled=false}};
$('#apply-json').onclick=()=>{try{rules=JSON.parse($('#raw-json').value);setDirty();render();setTab('slots')}catch(e){status('JSON 无效：'+e.message,true)}};
$('#raw-json').oninput=()=>setDirty();
$('#reload').onclick=reload;
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
reload();
