const {el,api,download,field,select:selectField}=EditorCommon,$=s=>document.querySelector(s);
let catalog,defs,revision,draft,selected,tab='browse',dirty=false,busy=false,face='front',lastDeleted=null;
let optionsReload=null;
const printedFace=()=>face==='back'&&draft.dualSided?draft.back:draft;
function status(s,error=false){$('#status').textContent=s;$('#status').classList.toggle('error',error)}
function changed(){dirty=true;$('#dirty').textContent='有未保存修改';$('#raw-json').value=JSON.stringify(draft,null,2)}
function sync(){if(!draft||tab!=='json')return true;try{const d=JSON.parse($('#raw-json').value);if(d.id!==selected)throw Error('固定 ID 不可修改');draft=d;return true}catch(e){status(e.message,true);return false}}
function list(){const q=$('#search').value.toLowerCase(),slot=$('#slot-filter').value,match=$('#match-filter').value;$('#list').replaceChildren();for(const c of catalog.cards){if(q&&!JSON.stringify([c.id,c.name,c.back?.name]).toLowerCase().includes(q)||slot&&!c.slotIds.includes(Number(slot))||match&&c.matching.status!==match)continue;const b=el('button');b.dataset.id=c.id;b.classList.toggle('active',c.id===selected);if(c.assets.front){const img=el('img');img.src=c.assets.front;img.loading='lazy';img.alt='';b.append(img)}const text=el('span');text.append(el('strong',c.name.zh||c.name.en),el('small',c.name.en),el('small',c.points+' 分 · '+c.slotIds.map(id=>defs.upgradeSlots.find(s=>s.id===id)?.name.zh||id).join(' / ')));b.append(text);b.onclick=()=>choose(c.id);$('#list').append(b)}$('#counts').textContent=catalog.cards.length+' 条记录 · '+catalog.cards.filter(c=>c.matching.status==='unmatched').length+' 待匹配'}
function choose(id){if(busy)return;if(dirty&&!confirm('放弃未保存修改？'))return;face="front";selected=id||null;creating=unsavedIds.has(id);draft=structuredClone(catalog.cards.find(c=>c.id===id)||null);dirty=false;$('#dirty').textContent=creating?'新建（未保存）':'';$('#raw-json').value=draft?JSON.stringify(draft,null,2):'';render();list();status('')}
function render(){
 updateActions();
 if(!draft){$('#title').textContent='暂无升级卡';$('#subtitle').textContent='点击“新建升级卡”开始编辑';$('#shared-fields').replaceChildren();$('#fields').replaceChildren();$('#description-preview').replaceChildren();$('#issues').replaceChildren();$('#condition-editor').replaceChildren();$('#rule-editor').replaceChildren();$('#front').hidden=true;$('#front').removeAttribute('src');$('#upgrade-face-tabs').hidden=true;$('#image-status').textContent='';if(tab==='history')history();return;}
 if(!draft.dualSided)face='front';
 const printed=printedFace();
 $('#upgrade-face-tabs').hidden=!draft.dualSided;
 for(const side of ['front','back']){const b=$('#edit-'+side);b.setAttribute('aria-selected',String(side===face));b.tabIndex=side===face?0:-1;}
 $('#upgrade-face-panel').setAttribute('aria-labelledby','edit-'+face);
 const shared=$('#shared-fields');shared.replaceChildren();
 const dual=el('label'),check=el('input');check.type='checkbox';check.checked=!!draft.dualSided;check.id='dual-sided';
 check.onchange=()=>{draft.dualSided=check.checked;if(check.checked&&!draft.back)draft.back={name:{en:'',zh:''},description:{en:[],zh:[]},actionTypes:[],keywords:[],weapons:[],assets:{front:null}};face=check.checked?'back':'front';changed();render()};
 dual.append(check,document.createTextNode('双面升级卡'));shared.append(dual,el('p','两面共用费用、用途、槽位和规则限制；取消双面时保留背面草稿。'));
 shared.append(field('点数',draft.points,v=>{draft.points=v;changed()},'number'));
 const affiliations=el('fieldset');affiliations.className='upgrade-affiliations';affiliations.append(el('legend','升级卡自身组织（与改变母单位组织的效果独立）'));if(draft.affiliationReview?.status==='unresolved')affiliations.append(el('p',draft.affiliationReview.reason));
 for(const affiliation of defs.affiliations||[]){const label=el('label'),input=el('input');input.type='checkbox';input.checked=(draft.affiliationIds||[]).map(String).includes(String(affiliation.id));input.onchange=()=>{const values=new Set((draft.affiliationIds||[]).map(String));if(input.checked)values.add(String(affiliation.id));else values.delete(String(affiliation.id));draft.affiliationIds=[...values];if(draft.affiliationReview)draft.affiliationReview={status:'reviewed'};changed()};label.append(input,document.createTextNode(affiliation.name.zh||affiliation.name.en));affiliations.append(label)}shared.append(affiliations);
 $('#title').textContent=draft.name.zh||draft.name.en;$('#subtitle').textContent=draft.name.en+' · '+(draft.upstream?'上游 '+draft.upstream.id:'机器限制未匹配');const image=$('#front');image.hidden=!printed.assets.front;if(printed.assets.front&&image.getAttribute('src')!==printed.assets.front){image.style.visibility='hidden';image.onload=()=>{image.style.visibility='visible'};image.onerror=()=>{image.hidden=true;$('#image-status').textContent='当前面卡图无法载入'};image.src=printed.assets.front;}$('#front').alt=(face==='back'?'反面':'正面')+'卡图';$('#image-status').textContent=(draft.dualSided?(face==='back'?'反面':'正面')+' · ':'')+(printed.assets.front?'本地原卡图':'尚无卡图');$('#issues').replaceChildren();for(const issue of draft.review.issues){const p=el('p',issue);p.className='issue';$('#issues').append(p)}
 $('#description-preview').replaceChildren();for(const text of printed.description.zh.length?printed.description.zh:printed.description.en){const p=el('p',text);p.className='card-copy';$('#description-preview').append(p)}
 const box=$('#fields');box.replaceChildren();const add=(name,v,fn,type)=>box.append(field(name,v,x=>{fn(x);changed()},type));add('英文名',printed.name.en,v=>printed.name.en=v);add('中文名',printed.name.zh,v=>printed.name.zh=v);
 shared.append(selectField('用途',draft.usage,[['unit_upgrade','单位升级'],['counterpart','伙伴升级槽'],['campaign','战役资料']],v=>{draft.usage=v;changed()}));
 shared.append(slotFields());
 box.append(actionFields(printed));
 add('中文卡文（每行一段）',printed.description.zh.join('\n'),v=>printed.description.zh=v.split('\n'),'textarea');add('英文卡文（每行一段）',printed.description.en.join('\n'),v=>printed.description.en=v.split('\n'),'textarea');add('人工备注',draft.review.notes,v=>draft.review.notes=v,'textarea');box.append(selectField('校对状态',draft.review.status,[['needs_review','待校对'],['reviewed','已校对']],v=>{draft.review.status=v;changed()}));
 const terms=el('details');terms.append(el('summary','词条、武器与显示要求'),EditorCommon.objectFields({keywords:printed.keywords,requirementsText:draft.requirementsText},defs,changed));box.append(terms,EditorForms.weapons(printed.weapons,defs,changed,{variable:true}));
 if(tab==='rules')renderRules();if(tab==='history')history();
}
function actionFields(printed){
 const box=el('fieldset');box.className='upgrade-action-fields';box.disabled=busy;
 box.append(el('legend','行动类型（可多选）'));
 const options=el('div');options.className='upgrade-action-options';
 for(const [value,name] of [['action','行动'],['double-action','双行动'],['free-action','免费行动'],['free-exhaust','免费行动：横置']]){
  const label=el('label'),input=el('input');input.type='checkbox';input.value=value;
  input.checked=Array.isArray(printed.actionTypes)&&printed.actionTypes.includes(value);
  input.onchange=()=>{printed.actionTypes=[...options.querySelectorAll('input:checked')].map(i=>i.value);changed()};
  label.append(input,document.createTextNode(name));options.append(label);
 }
 box.append(options);return box;
}
function slotFields(){
 const box=el('fieldset');box.className='upgrade-slot-fields';box.append(el('legend','候选槽位：任一类型均可匹配，不同时占多槽'));
 const semantic=defs.slotRules?.slots||[];
 const focusAdd=()=>requestAnimationFrame(()=>(box.querySelector('.combo-trigger')||box.querySelector('select'))?.focus({preventScroll:true}));
 const redraw=()=>{
  box.querySelectorAll(':scope > :not(legend)').forEach(n=>n.remove());
  const chips=el('div');chips.className='rule-overview';
  for(const sourceId of draft.slotIds){
   const s=semantic.find(x=>x.sourceId===sourceId),name=s?.name.zh||s?.name.en||('来源槽位 '+sourceId);
   const chip=el('span');chip.className='rule-chip editable-slot';chip.append(el('span',name+' · '+(s?.id||sourceId)));
   const remove=el('button','×');remove.type='button';remove.title='移除'+name+'候选槽位';remove.setAttribute('aria-label',remove.title);
   remove.onclick=()=>{if(busy)return;draft.slotIds=draft.slotIds.filter(id=>id!==sourceId);(draft.rules||={}).slotTypes=[...draft.slotIds];changed();redraw();focusAdd()};
   chip.append(remove);chips.append(chip);
  }
  box.append(chips);
  if(!draft.slotIds.length){const hint=el('p','尚未设置候选槽位。');hint.className='hint';box.append(hint);}
  const add=el('select');add.setAttribute('aria-label','添加候选槽位');const placeholder=el('option','添加候选槽位…');placeholder.value='';add.append(placeholder);
  for(const s of semantic.filter(s=>!draft.slotIds.includes(s.sourceId))){const option=el('option',(s.name.zh||s.name.en)+' · '+s.id);option.value=String(s.sourceId);add.append(option)}
  add.onchange=()=>{if(busy||!add.value)return;draft.slotIds.push(Number(add.value));(draft.rules||={}).slotTypes=[...draft.slotIds];changed();redraw();focusAdd()};box.append(add);
  const extra=[...new Set((draft.rules?.slotGrants||[]).filter(g=>g.trigger==='unitQualifies').flatMap(g=>g.ifAbsentAny||[]))].filter(key=>!draft.slotIds.some(id=>semantic.find(s=>s.sourceId===id)?.id===key));
  if(extra.length){const hint=el('p','缺槽补位规则仍允许：'+extra.map(key=>semantic.find(s=>s.id===key)?.name.zh||key).join('、')+'。如需取消，请在“规则限制 → 槽位授予”中同步调整。');hint.className='hint';box.append(hint);}
 };redraw();return box;
}
function renderRules(){if(!draft)return;ConditionEditor.render($('#condition-editor'),draft.restrictions||(draft.restrictions={}),defs,()=>changed(),renderRules);RuleEditor.render($('#rule-editor'),draft.rules||(draft.rules={}),defs,()=>{if(Array.isArray(draft.rules.slotTypes))draft.slotIds=[...draft.rules.slotTypes];changed()},{kind:'upgrades',usage:draft.usage})}
async function refreshReferenceOptions(announce=false){
 if(busy)return;if(optionsReload)return optionsReload;
 $('#refresh-upgrade-options').disabled=true;
 optionsReload=EditorOptions.load(true).then(loaded=>{
  defs=loaded.defs;if(tab==='rules'&&draft)renderRules();
  if(announce)status('单位与关联选项已更新；当前升级卡草稿保留。');
 }).catch(e=>status('关联选项刷新失败：'+e.message,true)).finally(()=>{optionsReload=null;$('#refresh-upgrade-options').disabled=false;});
 return optionsReload;
}
async function setTab(name){if(busy)return;if(!sync())return;tab=name;for(const key of ['browse','rules','json','history'])$('#'+key+'-pane').hidden=key!==name;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===name)));if(name==='json')$('#raw-json').value=JSON.stringify(draft,null,2);if(name==='rules'){renderRules();await refreshReferenceOptions();}if(name==='browse')render();if(name==='history')await history()}
async function history(){try{$('#history').replaceChildren();for(const h of await api('/api/upgrades/history')){const row=el('div');row.append(el('code',h.file));const b=el('button','恢复当前升级');b.disabled=!draft||creating||busy;b.onclick=async()=>{if(busy||!draft||!confirm('恢复这张升级卡？未保存修改将被替换，恢复前自动备份。'))return;busy=true;updateActions();try{accept(await api('/api/upgrades/restore',{id:selected,snapshot:h.file,revision}))}catch(e){status(e.message,true)}finally{busy=false;updateActions();await history()}};row.append(b);$('#history').append(row)}}catch(e){status(e.message,true)}}
let creating=false;const unsavedIds=new Set();
function updateActions(){
 $('#save').disabled=busy||!draft;$('#delete-upgrade').disabled=busy||!draft;$('#delete-upgrade').textContent=creating?'丢弃草稿':'删除升级卡';
 $('#image-upload').disabled=busy||!draft;$('#apply-json').disabled=busy||!draft;$('#raw-json').disabled=busy||!draft;$('#restore-deleted-upgrade').disabled=busy;
 const actions=$('.upgrade-action-fields');if(actions)actions.disabled=busy||!draft;
}
function showDeletedNotice(){
 $('#deleted-upgrade-notice').hidden=!lastDeleted;
 if(lastDeleted)$('#deleted-upgrade-label').textContent='已删除「'+lastDeleted.name+'」。卡图与已有军表引用保留，原记录已备份。';
}
async function deleteUpgrade(){
 if(busy||!draft)return;
 const id=selected,name=draft.name.zh||draft.name.en||id,isDraft=creating;
 if(!confirm(isDraft?'丢弃未保存的「'+name+'」草稿？':'删除升级卡「'+name+'」？\n固定 ID：'+id+'\n删除前自动备份，可恢复。已有军表中的引用会显示为失效升级。'+(dirty?'\n当前未保存的修改将被丢弃。':'')))return;
 busy=true;updateActions();
 try{
  if(!isDraft){const result=await api('/api/upgrades/delete',{id,revision});revision=result.revision;lastDeleted={id,name,snapshot:result.snapshot};}
  catalog.cards=catalog.cards.filter(c=>c.id!==id);unsavedIds.delete(id);dirty=false;busy=false;choose(catalog.cards[0]?.id);showDeletedNotice();status(isDraft?'已丢弃未保存草稿。':'已删除升级卡；可使用下方按钮恢复。');
 }catch(e){status(e.message,true)}finally{busy=false;updateActions()}
}
async function restoreDeletedUpgrade(){
 if(busy||!lastDeleted)return;if(dirty&&!confirm('放弃当前未保存修改并恢复已删除的升级卡？'))return;
 busy=true;updateActions();
 try{const result=await api('/api/upgrades/restore',{id:lastDeleted.id,snapshot:lastDeleted.snapshot,revision});face='front';accept(result);lastDeleted=null;showDeletedNotice();status('已恢复升级卡。')}
 catch(e){status(e.message,true)}finally{busy=false;updateActions()}
}
function newUpgradeDraft(){
  const id='new-upgrade-'+Date.now().toString(36);
  return {id,name:{en:'New Upgrade',zh:'新升级'},points:0,slotIds:[1],usage:'unit_upgrade',
    rules:{slotTypes:[1],unique:false,locallyUnique:true},assets:{front:null},
    description:{en:[],zh:[]},actionTypes:[],requirementsText:[],keywords:[],weapons:[],
    review:{status:'needs_review',notes:'',issues:['新建卡片，待补全字段']},
    matching:{status:'unmatched',candidates:[]},restrictions:{}}
}
function newUpgrade(){
  if(busy)return;
  if(dirty&&!confirm('当前升级卡有未保存修改，确定放弃并新建？'))return;
  face='front';draft=newUpgradeDraft();selected=draft.id;creating=true;dirty=false;
  unsavedIds.add(selected);
  catalog.cards.push(structuredClone(draft));
  $('#dirty').textContent='新建（未保存）';$('#raw-json').value=JSON.stringify(draft,null,2);
  render();list();status('已创建草稿：填写字段后点击保存');
}
function accept(d){creating=false;revision=d.revision;draft=d.card;selected=draft.id;unsavedIds.delete(selected);const index=catalog.cards.findIndex(c=>c.id===selected);if(index<0)catalog.cards.push(structuredClone(draft));else catalog.cards[index]=structuredClone(draft);dirty=false;$('#dirty').textContent='';if(window.SaveUI)SaveUI.flashSaved();$('#raw-json').value=JSON.stringify(draft,null,2);render();list();status('已保存升级源文件；备份 history/upgrades/'+d.snapshot)}
async function reload(){if(busy)return;if(dirty&&!confirm('放弃修改并重新载入？'))return;try{const loaded=await EditorOptions.load(true);catalog=loaded.upgrades;defs=loaded.defs;try{const stored=await api('/api/upgrades');revision=stored.revision;catalog=stored.catalog}catch(e){revision=null}unsavedIds.clear();dirty=false;$('#slot-filter').replaceChildren();const all=el('option','全部槽位');all.value='';$('#slot-filter').append(all);for(const s of defs.upgradeSlots){const op=el('option',s.id+' · '+s.name.zh);op.value=s.id;$('#slot-filter').append(op)}choose(catalog.cards.find(c=>c.id===selected)?.id||catalog.cards[0]?.id)}catch(e){status(e.message,true)}}
for(const side of ['front','back']){
 const button=$('#edit-'+side);
 button.onclick=()=>{if(busy||!draft||!sync())return;face=side;render()};
 button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const target=e.key==='Home'?'front':e.key==='End'?'back':side==='front'?'back':'front';$('#edit-'+target).click();$('#edit-'+target).focus()};
}
$('#save').onclick=async()=>{if(busy||!draft||!sync())return;busy=true;updateActions();try{accept(await api('/api/upgrades/save',{card:draft,revision,create:creating}))}catch(e){if(window.SaveUI)SaveUI.fail(e,reload);else status(e.message,true)}finally{busy=false;updateActions()}};
$('#delete-upgrade').onclick=deleteUpgrade;$('#restore-deleted-upgrade').onclick=restoreDeletedUpgrade;
$('#refresh-upgrade-options').onclick=()=>refreshReferenceOptions(true);
$('#apply-json').onclick=()=>{if(sync()){changed();setTab('browse')}};$('#raw-json').oninput=()=>{dirty=true;$('#dirty').textContent='有未保存修改'};$('#new-upgrade').onclick=newUpgrade;$('#reload').onclick=reload;$('#export').onclick=()=>download({...catalog,definitions:defs},'upgrades.bundle.json');for(const id of ['search','slot-filter','match-filter'])$('#'+id).oninput=list;document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});$('#image-upload').onclick=()=>$('#image-file').click();$('#image-file').onchange=async()=>{
 const f=$('#image-file').files[0];if(!f||busy)return;
 const saved=catalog.cards.find(c=>c.id===selected);
 if(creating||(face==='back'&&!saved?.dualSided)){status('请先保存升级卡及双面设置，再上传卡图。',true);$('#image-file').value='';return;}
 if(!confirm('替换当前'+(face==='back'?'反面':'正面')+'卡图？文本草稿会保留。'))return;
 const uploadSide=face,recordId=draft.id;
 busy=true;updateActions();
 try{
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取文件失败'));r.readAsDataURL(f)});
  const result=await api('/api/upgrades/image',{id:recordId,revision,dataUrl,face:uploadSide});
  revision=result.revision;
  const target=uploadSide==='back'?draft.back:draft;target.assets={...target.assets,front:result.front};delete target.assets.portrait;
  catalog.cards[catalog.cards.findIndex(c=>c.id===recordId)]=result.card;
  $('#raw-json').value=JSON.stringify(draft,null,2);render();list();status('已更新'+(uploadSide==='back'?'反面':'正面')+'卡图'+(dirty?'；文本草稿尚未保存。':'。'));
 }catch(e){status(e.message,true)}finally{busy=false;updateActions();$('#image-file').value=''}
};reload();
