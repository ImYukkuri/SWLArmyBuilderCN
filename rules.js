/* Rule library editor for data/slot-rules.json (semantic rule package). */
const {el,api}=EditorCommon,$=s=>document.querySelector(s);
let rules,defs,revision,dirty=false,tab='slots';
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
function renderBattleForces(){
  const box=$('#battle-forces');box.replaceChildren();
  for(const [id,bf] of Object.entries(rules.battleForces||{})){
    const d=el('details');d.open=id==='7';
    d.append(el('summary',id+' · '+bf.name+' · 母阵营 '+bf.parentFaction+' · '+(bf.status||'skeleton')));
    if(bf.textRules?.length)d.append(el('p','自然语言规则：'+bf.textRules.join(' / ')));
    d.append(el('pre',JSON.stringify(bf.modes,null,2)));
    box.append(d);
  }
  if(!Object.keys(rules.battleForces||{}).length)box.append(el('p','暂无战斗部队骨架。'));
}
function render(){
  $('#title').textContent='规则包 swl-rules/v1';
  $('#subtitle').textContent='来源 '+rules.source.provider+' · '+rules.source.contentVersion+' · '+rules.slots.length+' 类槽位';
  renderSlots();renderDedicated();renderUpgradeRules();renderBattleForces();renderModes();renderDictionary();
  $('#sections').replaceChildren();
  for(const [key,label] of [['slots','槽位'],['dedicated','专用槽授予'],['upgradeRules','升级语义规则'],['battleForces','战斗部队'],['modes','模式配额'],['dictionary','数据字典']]){const b=el('button',label);b.dataset.tab=key;b.onclick=()=>setTab(key);$('#sections').append(b)}
}
function setTab(t){tab=t;for(const k of ['slots','dedicated','upgradeRules','battleForces','modes','dictionary','json'])$('#'+k+'-pane').hidden=k!==t;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===t)));if(t==='json')$('#raw-json').value=JSON.stringify(rules,null,2)}
async function reload(){if(dirty&&!confirm('放弃未保存修改？'))return;try{[rules,defs]=await Promise.all([fetch('data/slot-rules.json').then(r=>r.json()),fetch('data/catalog-definitions.json').then(r=>r.json())]);revision=null;dirty=false;$('#dirty').textContent='';render();$('#raw-json').value=JSON.stringify(rules,null,2);status('')}catch(e){status(e.message,true)}}
$('#save').onclick=async()=>{try{if(tab==='json'){rules=JSON.parse($('#raw-json').value)}$('#save').disabled=true;const resp=await fetch('/api/slot-rules/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules,revision})});const text=await resp.text();let r;try{r=JSON.parse(text)}catch{throw Error('保存需要 python server.py（当前静态服务无法写回源文件）。')}if(!resp.ok)throw Error(r.error||('HTTP '+resp.status));revision=r.revision;dirty=false;$('#dirty').textContent='';render();status('已保存规则包；备份 history/slot-rules/'+r.snapshot)}catch(e){status(e.message,true)}finally{$('#save').disabled=false}};
$('#apply-json').onclick=()=>{try{rules=JSON.parse($('#raw-json').value);setDirty();render();setTab('slots')}catch(e){status('JSON 无效：'+e.message,true)}};
$('#raw-json').oninput=()=>setDirty();
$('#reload').onclick=reload;
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
reload();
