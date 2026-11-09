const $=s=>document.querySelector(s),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
let catalog,revision,mappings,selected,draft,dirty=false,currentTab='form',busy=false;
const labels={id:'固定 ID',name:'名称',title:'称号',en:'英文',zh:'中文',factions:'可加入军队及军阶',affiliations:'组织',rank:'军阶',unique:'唯一单位',points:'点数',unitType:'单位类型',upgradeSlots:'基础升级槽',stats:'单位属性',models:'模型数量',wounds:'生命值',courage:'勇气',resilience:'韧性',speed:'速度',defenseDie:'防御骰',attackSurge:'攻击激增',defenseSurge:'防御激增',keywords:'单位词条',weapons:'武器',raw:'卡面原文',ruleId:'词条映射 ID',label:'中文显示',parameter:'参数',value:'数值',action:'行动类型',range:'射程',min:'最小',max:'最大',dice:'骰池',red:'红骰',black:'黑骰',white:'白骰',review:'校对',status:'状态',notes:'备注',issues:'待检查项',mapping:'名称关联',matched:'已匹配',method:'匹配方式',score:'匹配分数',candidate:'候选名称',specialRules:'额外规则',assets:'图片',portraitCrop:'裁剪范围',source:'来源',factionId:'所属阵营',rankId:'军阶 ID',unitTypeId:'单位类型 ID',affiliationIds:'组织',conditionalUpgradeSlots:'条件解锁槽位',upgradeId:'解锁升级 ID',required:'必选',isCounterpart:'伙伴单位',usage:'用途',upstream:'上游引用',collection:'数据类别',text:'卡面参数文字'};
const SWL_DICE=window.SWLDice?{attackColors:Object.values(window.SWLDice.attackColors||{}),defenseColors:Object.values(window.SWLDice.defenseColors||{}),attackFaces:Object.values(window.SWLDice.attackFaces||{}),defenseFaces:Object.values(window.SWLDice.defenseFaces||{})}:{attackColors:['red','black','white'],defenseColors:['red','white'],attackFaces:['blank','hit','critical','surge'],defenseFaces:['blank','block','surge','surge-block']};const enums={usage:['army_unit','counterpart'],rank:['commander','operative','corps','special-forces','support','heavy','counterpart'],defenseDie:SWL_DICE.defenseColors,attackDie:SWL_DICE.attackColors,attackFace:SWL_DICE.attackFaces,defenseFace:SWL_DICE.defenseFaces,attackSurge:['none','hit','critical'],defenseSurge:['none','block'],status:['needs_review','reviewed'],action:['action','free-action','none']};
const enumLabels={army_unit:'加入军队的单位',commander:'指挥官',operative:'特工',corps:'核心','special-forces':'特种部队',support:'支援',heavy:'重型',counterpart:'伙伴',red:'红骰',black:'黑骰',white:'白骰',blank:'空白',surge:'激增','surge-block':'激增格挡',none:'无',hit:'命中',critical:'暴击',block:'格挡',needs_review:'待校对',reviewed:'已校对',action:'卡牌行动','free-action':'免费卡牌行动'};
function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error)}
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const text=await r.text();let d;try{d=JSON.parse(text)}catch(e){throw Error('此操作需要 python server.py（当前静态服务无法读写源文件）。')}if(!r.ok)throw Error(d.error||r.statusText);return d}
// 成员关系同步边界：顶层 `factions` 是组军/军阶计数的权威来源；
function setDirty(){dirty=true;$('#dirty').textContent='有未保存修改';$('#raw-json').value=JSON.stringify(draft,null,2)}
function get(path){return path.reduce((o,k)=>o[k],draft)}
function put(path,value){const p=path.slice(),k=p.pop();get(p)[k]=value;if(k==='usage'){draft.isCounterpart=value==='counterpart';if(draft.isCounterpart)draft.rankId=null}if(k==='action')delete get(p).actionDetection;setDirty()}
function displayPath(path){return path.map(x=>labels[x]||x).join(' / ')}
function formField(key,value,path){
  const row=el('label');row.className='field';row.title=path.join('.');row.append(el('span',labels[key]||key));let control;
  const table=referenceTable(key,path);if(table==='keywords')row.firstChild.textContent='词条 ID';else if(table==='armies')row.firstChild.textContent='军队 ID';
  if(table){control=el('select');const none=el('option','未确认');none.value='';control.append(none);for(const item of mappings.definitions[table]||[]){const op=el('option',item.id+' · '+(item.name.zh||item.name.en)+' / '+item.name.en);op.value=String(item.id);control.append(op)}control.value=value==null?'':String(value);control.addEventListener('change',()=>{const item=mappings.definitions[table].find(x=>String(x.id)===control.value);put(path,item?item.id:null);if(table==='keywords')renderForm()})}
  else if(enums[key]){control=el('select');const empty=el('option','未确认');empty.value='';control.append(empty);for(const v of [...new Set([...enums[key],...(value&&!enums[key].includes(value)?[value]:[])])]){const op=el('option',enumLabels[v]||v);op.value=v;control.append(op)}control.value=value??'';control.addEventListener('change',()=>put(path,control.value||null))}
  else if(typeof value==='boolean'){control=el('input');control.type='checkbox';control.checked=value;control.addEventListener('change',()=>put(path,control.checked))}
  else if(typeof value==='number'||(value===null&&['points','models','wounds','courage','resilience','speed','min','max','red','black','white','value'].includes(key))){control=el('input');control.type='number';control.step='1';control.value=value??'';control.placeholder='未确认 / null';control.addEventListener('input',()=>put(path,control.value===''?null:Number(control.value)))}
  else if(value===null){control=el('textarea');control.value='null';control.setAttribute('aria-label',displayPath(path));control.addEventListener('change',()=>{try{put(path,JSON.parse(control.value));status('字段已应用')}catch{status('该字段需要有效 JSON，例如 null 或 []',true)}})}
  else{control=el(String(value).length>80?'textarea':'input');control.value=value;control.addEventListener('input',()=>put(path,control.value))}
  control.setAttribute('aria-label',displayPath(path));if(key==='id'&&path.length===1)control.disabled=true;row.append(control);return row;
}
function referenceTable(key,path){
 if(key==='factionId')return 'factions';if(key==='rankId')return 'ranks';if(key==='unitTypeId')return 'unitTypes';if(key==='upgradeId')return 'upgrades';
 if(path[0]==='affiliationIds')return 'affiliations';
 if(path.includes('keywords')&&key==='id')return 'keywords';
 if(['upgradeSlots','conditionalUpgradeSlots'].includes(path[0])&&(key==='id'||path.length===2))return 'upgradeSlots';
 if(path[0]==='factions'&&key==='id')return 'armies';return null;
}
function lookup(table,id){return mappings?.definitions?.[table]?.find(x=>x.id===id)}
function arrayDefault(key){if(key==='weapons')return {name:{en:'New Weapon',zh:''},range:{min:null,max:null},dice:{red:null,black:null,white:null},keywords:[]};if(key==='keywords')return {id:'jump',value:null,parameter:null,action:'none'};if(key==='factions')return {id:1,rankId:2};if(key==='affiliationIds')return '1';if(key==='upgradeSlots')return 1;if(key==='conditionalUpgradeSlots')return {id:1,upgradeId:mappings.definitions.upgrades[0]?.id||null};return ''}
function objectForm(object,path=[],container){
 for(const [key,value]of Object.entries(object)){
  const p=[...path,key];
  if(key==='divisions'&&path.length===0&&Array.isArray(value)){
   const row=el('label');row.className='field';row.append(el('span','光明/黑暗面'));
   const box=el('div');box.className='rule-add';
   for(const [v,t]of [['Light','光明面'],['Dark','黑暗面']]){
    const chip=el('label');chip.className='checkbox-chip';
    const input=el('input');input.type='checkbox';input.checked=value.includes(v);
    input.onchange=()=>{const arr=(draft.divisions||[]).filter(x=>x!==v);if(input.checked)arr.push(v);draft.divisions=arr;setDirty();renderForm()};
    chip.append(input,el('span',t));box.append(chip);
   }
   row.append(box);container.append(row);continue;
  }
  if(Array.isArray(value)){
   const box=el('fieldset');box.append(el('legend',(labels[key]||key)+' · '+value.length));
   value.forEach((item,i)=>{
    const wrap=el('div');wrap.className='array-item';
    if(key==='upgradeSlots'||key==='conditionalUpgradeSlots'){
     const slot=lookup('upgradeSlots',typeof item==='object'?item.id:item);
     if(slot){const head=el('div');head.className='slot-heading';if(slot.iconGlyph){const symbol=el('span',slot.iconGlyph);symbol.className='slot-glyph';symbol.setAttribute('aria-label',slot.name.zh);head.append(symbol)}head.append(el('strong',slot.id+' · '+slot.name.zh));wrap.append(head)}
    }
    if(item!==null&&typeof item==='object')objectForm(key==='keywords'?{value:null,parameter:null,action:'none',...item}:item,[...p,i],wrap);else wrap.append(formField(String(i+1),item,[...p,i]));
    if(key==='keywords'){
     const rule=lookup('keywords',item.id);
     if(rule){const details=el('details');details.append(el('summary',(rule.name.zh||rule.name.en)+' · '+(rule.timing||[]).join(' / ')),el('p',rule.summary||'暂无简写'),el('pre',rule.full||'暂无完整规则'));wrap.append(details)}
    }
    const tools=el('div');tools.className='rowtools';
    if(key==='upgradeSlots'&&typeof item!=='object'){const required=el('button','设为必选');required.addEventListener('click',()=>{get(p)[i]={id:item,required:true};setDirty();renderForm()});tools.append(required)}
    const del=el('button','删除该项');del.addEventListener('click',()=>{get(p).splice(i,1);setDirty();renderForm()});tools.append(del);wrap.append(tools);box.append(wrap);
   });
   const add=el('button','＋ 添加'+(labels[key]||key));add.addEventListener('click',()=>{get(p).push(arrayDefault(key));setDirty();renderForm()});box.append(add);container.append(box);
  }else if(value!==null&&typeof value==='object'){
   const box=el('details');box.open=['name','title','stats','review'].includes(key)||path[0]==='weapons';box.append(el('summary',labels[key]||key));objectForm(value,p,box);container.append(box);
  }else container.append(formField(key,value,p));
 }
}
function renderRules(){ConditionEditor.render(document.querySelector('#condition-editor'),draft.restrictions||(draft.restrictions={}),mappings.definitions,()=>setDirty(),renderRules);RuleEditor.render(document.querySelector('#unit-rules'),draft.rules||(draft.rules={}),mappings.definitions,()=>{setDirty()},{kind:'units',usage:draft.usage||'army_unit'});}
let kwSeq=0;function normName(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function renderKeywordParams(){const box=document.querySelector('#keyword-params');if(!box)return;box.replaceChildren();const kws=(draft.keywords||[]).filter(k=>k&&k.parameter!==undefined&&k.parameter!==null&&k.parameter!=='');const fs=el('fieldset');fs.className='restriction-section';fs.append(el('legend','关键词参数（随从/统率等：需解析到具体单位名）'));const hint=el('p','随从/统率的参数必须是单位名称；输入即过滤候选，也可自定义。未解析的参数会被引擎标为待确认。');hint.className='hint';fs.append(hint);const names=(catalog.units||[]).map(u=>[u.name.en,u.name.zh||'']);if(!kws.length){fs.append(el('p','当前单位没有带参数的关键词。'))}else for(const kw of kws){const row=el('div');row.className='rule-item';const def=mappings.definitions.keywords?.find(k=>k.id===kw.id);row.append(el('strong',(def&&def.name&&def.name.zh)||kw.id));const input=el('input');input.value=kw.parameter||'';input.placeholder='单位名称';const dl=el('datalist');dl.id='kw-dl-'+(++kwSeq);for(const [en,zh] of names){const o=el('option');o.value=en;o.label=zh?en+' · '+zh:en;o.textContent=zh||en;dl.append(o)}input.setAttribute('list',dl.id);const resolved=names.some(([en,zh])=>normName(en)===normName(kw.parameter)||normName(zh)===normName(kw.parameter));const badge=el('span',resolved?'已解析':'未解析');badge.className=resolved?'issue':'issue invalid';input.onchange=()=>{kw.parameter=input.value;setDirty();renderKeywordParams()};row.append(input,dl,badge);fs.append(row)}box.append(fs)}
let creating=false;
function newUnitDraft(){
  const id='new-unit-'+Date.now().toString(36);
  return {id,name:{en:'New Unit',zh:'新单位'},title:{en:'',zh:''},factionId:1,rankId:1,unitTypeId:1,affiliationIds:[],keywords:[],weapons:[],upgradeSlots:[],factions:[{id:1,rankId:1}],
    stats:{models:1,wounds:1,courage:0,resilience:null,speed:null,defenseDie:'white'},points:0,
    assets:{front:null,portrait:null,portraitCrop:[0,0,1,1]},
    review:{status:'needs_review',notes:'',issues:['新建卡片，待补全字段']},usage:'army_unit'}
}
function newUnit(){
  if(dirty&&!confirm('当前单位有未保存修改，确定放弃并新建？'))return;
  draft=newUnitDraft();selected=draft.id;creating=true;dirty=false;
  catalog.units.push(structuredClone(draft));
  $('#dirty').textContent='新建（未保存）';$('#raw-json').value=JSON.stringify(draft,null,2);
  renderForm();renderList();status('已创建草稿：填写字段后点击保存');
}
function renderForm(){
  $('#fields').replaceChildren();objectForm(Object.fromEntries(Object.entries(draft).filter(([k])=>!['assets','source','rules'].includes(k))),[],$('#fields'));
  $('#title').textContent=draft.name.zh||draft.name.en;$('#subtitle').textContent=draft.name.en+(draft.title.en?' / '+draft.title.en:'');
  if(draft.assets.front)$('#front').src=draft.assets.front;if(draft.assets.portrait)$('#portrait').src=draft.assets.portrait;
  $('#source').textContent='提取依据已归档至 data/extraction-evidence.json，单位运行数据不再重复保存 OCR 和武器 source。';
  $('#issues').replaceChildren();for(const s of draft.review.issues||[]){const n=el('div',typeof s==='string'?s:JSON.stringify(s));n.className='issue';$('#issues').append(n)}
  $('#crop-controls').replaceChildren();['左','上','右','下'].forEach((label,i)=>{const l=el('label');l.className='field';l.append(el('span',label));const input=el('input');input.type='number';input.step='.005';input.min=0;input.max=1;input.value=draft.assets.portraitCrop[i];input.setAttribute('aria-label','裁剪'+label);input.addEventListener('input',()=>put(['assets','portraitCrop',i],Number(input.value)));l.append(input);$('#crop-controls').append(l)});renderKeywordParams();
}
function renderList(){const q=$('#search').value.trim().toLocaleLowerCase(),f=$('#faction').value,r=$('#review-filter').value;$('#list').replaceChildren();for(const u of catalog.units){if(f&&u.factionId!==Number(f)||r&&u.review.status!==r||q&&!JSON.stringify([u.id,u.name,u.title]).toLocaleLowerCase().includes(q))continue;const b=el('button');b.dataset.id=u.id;b.classList.toggle('active',u.id===selected);const img=el('img');img.src=u.assets.portrait;img.alt='';img.loading='lazy';const text=el('span');text.append(el('strong',u.name.zh||u.name.en),el('small',u.name.en),el('small',(u.title.zh||u.title.en||lookup('ranks',u.rankId)?.name.zh||'军阶待校对')+' · '+(u.review.status==='reviewed'?'已校对':'待校对')));b.append(img,text);b.addEventListener('click',()=>select(u.id));$('#list').append(b)}$('#counts').textContent=catalog.units.length+' 张卡 · '+catalog.units.filter(u=>u.review.status==='reviewed').length+' 已校对'}
function syncRaw(){if(currentTab!=='json')return true;try{const v=JSON.parse($('#raw-json').value);if(v.id!==selected)throw Error('不可更改单位 ID');if(!v.name||!v.assets||!v.review)throw Error('缺少单位必要字段');draft=v;return true}catch(e){status('JSON 未应用：'+e.message,true);return false}}
function select(id){if(busy)return;if(dirty&&!confirm('当前单位有未保存修改，确定放弃并切换？'))return;selected=id;draft=structuredClone(catalog.units.find(u=>u.id===id));dirty=false;$('#dirty').textContent='';$('#raw-json').value=JSON.stringify(draft,null,2);renderForm();renderList();status('');if(currentTab==='rules')renderRules();if(currentTab==='history')loadHistory();if(currentTab==='refs')loadReferences()}
async function tab(name){if(!syncRaw())return;currentTab=name;for(const n of ['form','rules','json','history','refs'])$('#'+n+'-pane').hidden=n!==name;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===name)));if(name==='form')renderForm();if(name==='rules')renderRules();if(name==='json')$('#raw-json').value=JSON.stringify(draft,null,2);if(name==='history')await loadHistory();if(name==='refs')await loadReferences()}

async function loadReferences(){
 const panel=$('#reference-tables');panel.replaceChildren();
 for(const [key,label]of [['upgradeSlots','升级槽位'],['factions','卡牌所属阵营'],['armies','可加入军队 / 战斗部队'],['ranks','军阶 ID'],['unitTypes','单位类型']]){
  const details=el('details');details.open=key==='upgradeSlots';details.append(el('summary',label));const table=el('table');table.className='reference-table';
  for(const item of mappings.definitions[key]){const row=el('tr');row.append(el('td',String(item.id)));const cell=el('td');if(item.iconGlyph){const glyph=el('span',item.iconGlyph);glyph.className='slot-glyph';cell.append(glyph)}cell.append(el('span',item.name.zh+' / '+item.name.en));row.append(cell,el('td',item.kind==='dedicated'?'专用槽':item.examples?.join('、')||''));table.append(row)}details.append(table);panel.append(details);
 }
 const requested=selected;
 try{const [report,evidence]=await Promise.all([api('/api/comparison'),api('/api/evidence/'+encodeURIComponent(requested))]);if(selected!==requested)return;$('#comparison').textContent=JSON.stringify(report.records.find(r=>r.id===requested)||{},null,2);$('#evidence').textContent=JSON.stringify(evidence,null,2)}catch(e){status(e.message,true)}
}

async function loadHistory(){try{const items=await api('/api/history');$('#history').replaceChildren();if(!items.length)$('#history').append(el('p','尚无历史。首次保存时自动创建。'));for(const x of items){const row=el('div');row.append(el('code',x.file));const b=el('button','恢复当前单位至此版本');b.addEventListener('click',async()=>{if(!confirm('恢复当前单位？恢复前会创建备份。'))return;try{busy=true;b.disabled=true;const result=await api('/api/restore',{id:selected,snapshot:x.file,revision});acceptSave(result);await loadHistory()}catch(e){status(e.message,true)}finally{busy=false;b.disabled=false}});row.append(b);$('#history').append(row)}}catch(e){status(e.message,true)}}
function acceptSave(result){creating=false;revision=result.revision;draft=result.card;catalog.units[catalog.units.findIndex(u=>u.id===selected)]=structuredClone(draft);dirty=false;$('#dirty').textContent='';$('#raw-json').value=JSON.stringify(draft,null,2);renderForm();renderList();status('已保存到源文件；备份：history/'+result.snapshot)}
async function reload(){if(dirty&&!confirm('放弃未保存修改并重新读取源文件？'))return;try{const [loadedCatalog,definitions,names,ruleFields]=await Promise.all([fetch('data/units.json').then(r=>r.json()),fetch('data/catalog-definitions.json').then(r=>r.json()),fetch('references/unit-names.zh.json').then(r=>r.json()).catch(()=>null),fetch('data/rule-fields.json').then(r=>r.json()).catch(()=>null)]);catalog=loadedCatalog;if(ruleFields)definitions.ruleFields=ruleFields;mappings={definitions,names};try{revision=(await api('/api/catalog')).revision}catch(e){revision=null}dirty=false;const previous=$('#faction').value;$('#faction').replaceChildren();const all=el('option','所有阵营');all.value='';$('#faction').append(all);for(const f of mappings.definitions.factions){const o=el('option',f.id+' · '+f.name.zh);o.value=String(f.id);$('#faction').append(o)}$('#faction').value=previous;select(catalog.units.find(u=>u.id===selected)?.id||catalog.units[0].id)}catch(e){status(e.message,true)}}
$('#save').addEventListener('click',async()=>{if(!syncRaw()||busy)return;try{busy=true;$('#save').disabled=true;acceptSave(await api('/api/save',{revision,card:draft,create:creating}))}catch(e){status(e.message,true)}finally{busy=false;$('#save').disabled=false}});
$('#apply-json').addEventListener('click',()=>{if(syncRaw()){setDirty();tab('form');status('JSON 已应用到表单，尚未写入源文件')}});
$('#raw-json').addEventListener('input',()=>{dirty=true;$('#dirty').textContent='有未保存修改'});
$('#new-unit').addEventListener('click',newUnit);
$('#unit-image-upload').addEventListener('click',()=>$('#unit-image-file').click());
$('#unit-image-file').addEventListener('change',async()=>{
  const f=$('#unit-image-file').files[0];
  if(!f)return;
  if(!confirm('用所选图片替换「'+draft.id+'」的卡图？会自动按标准位置裁剪立绘，源文件会备份。')){$('#unit-image-file').value='';return}
  busy=true;$('#unit-image-upload').disabled=true;
  try{
    const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('读取文件失败'));r.readAsDataURL(f)});
    const result=await api('/api/units/image',{id:draft.id,revision,dataUrl});
    acceptSave(result);
    status('卡图已更新并生成立绘：'+((result.card.assets||{}).portrait||''));
  }catch(e){status(e.message,true)}
  finally{busy=false;$('#unit-image-upload').disabled=false;$('#unit-image-file').value=''}
});
$('#reload').addEventListener('click',reload);for(const id of ['search','faction','review-filter'])$('#'+id).addEventListener('input',renderList);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
$('#export').addEventListener('click',()=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({...catalog,definitions:mappings.definitions},null,2)],{type:'application/json'}));a.download='unit-catalog.bundle.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);status('已导出已保存的数据；草稿请先保存。')});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
reload();
