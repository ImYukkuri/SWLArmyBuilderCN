const {el,api}=window.EditorCommon||{};
const $=s=>document.querySelector(s);
const mk=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
const E=(tag,text)=>{const n=mk(tag,text);return n};
let catalog,defs,revision,draft,selected,dirty=false,busy=false,tab='form',creating=false;

function status(text,error=false){$('#status').textContent=text;$('#status').classList.toggle('error',error)}
function setDirty(){dirty=true;$('#dirty').textContent='有未保存修改';$('#raw-json').value=JSON.stringify(draft,null,2)}
async function call(path,body){
  const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const text=await r.text();let d;
  try{d=JSON.parse(text)}catch(e){throw Error('需要 python server.py（静态服务无法写入源文件）')}
  if(!r.ok){const err=Error(d.error||r.statusText);err.status=r.status;throw err}
  return d;
}
function rows(){return catalog.commands||[]}
function renderList(){
  const box=$('#list');box.replaceChildren();
  const q=$('#search').value.trim().toLowerCase();
  const pip=$('#pip-filter').value;
  const art=$('#art-filter').value;
  const items=rows().filter(c=>{
    if(pip&&String(c.pips)!==pip)return false;
    if(art==='missing'&&c.image)return false;
    if(art==='ready'&&!c.image)return false;
    if(!q)return true;
    return [c.id,(c.name&&c.name.en)||'',(c.name&&c.name.zh)||'',c.owner||''].join(' ').toLowerCase().includes(q);
  });
  $('#counts').textContent=items.length+' / '+rows().length+' 张';
  for(const c of items){
    const b=mk('button');b.type='button';b.className='card-row'+(c.id===selected?' active':'')+(c.image?'':' no-art');
    if(c.image){const img=mk('img');img.className='card-row-art';img.src=c.image;img.alt='';img.loading='lazy';b.append(img)}
    else{const ph=mk('span');ph.className='card-row-art placeholder';ph.textContent='无图';b.append(ph)}
    const body=mk('span');body.className='card-row-body';
    const name=mk('strong',(c.name&&(c.name.zh||c.name.en))||c.id);
    const sub=mk('small','P'+c.pips+(c.slotPips&&c.slotPips!==c.pips?(' → P'+c.slotPips):'')+' · '+(c.owner||'通用'));
    body.append(name,sub);
    b.append(body);
    b.onclick=()=>select(c.id);
    box.append(b);
  }
}
function select(id){
  if(dirty&&!confirm('当前战术卡有未保存修改，确定放弃并切换？'))return;
  const card=rows().find(c=>c.id===id);if(!card)return;
  selected=id;creating=false;draft=JSON.parse(JSON.stringify(card));dirty=false;$('#dirty').textContent='';
  $('#raw-json').value=JSON.stringify(draft,null,2);
  renderForm();renderList();renderImage();
}
function renderImage(){
  const img=$('#card-image');
  if(draft&&draft.image){img.src=draft.image;img.hidden=false}else{img.removeAttribute('src');img.hidden=true}
}
function unitChipFor(unlock){
  const upId=String(unlock&&unlock.id||'');
  const unit=unitsById[upId];
  const chip=mk('span');chip.className='unit-chip';
  if(unit&&unit.assets&&unit.assets.portrait){const img=mk('img');img.src=unit.assets.portrait;img.alt='';chip.append(img)}
  else{const ph=mk('span');ph.className='unit-chip-ph';ph.textContent='?';chip.append(ph)}
  const name=unit?((unit.name&&(unit.name.zh||unit.name.en))||unit.id):('上游 '+upId);
  chip.append(mk('b',name),mk('small','units:'+upId));
  chip.title=name+' · units:'+upId;
  return chip;
}
function field(label,control){const row=mk('label');row.className='field';row.append(mk('span',label),control);return row}
function renderForm(){
  const box=$('#form');box.replaceChildren();
  if(!draft){box.append(mk('p','左侧选择一张战术卡'));return}
  const actions=mk('div');actions.className='row-actions card-actions';
  const swap=mk('button','修改 / 上传卡图');swap.type='button';
  swap.onclick=()=>{setTab('image');$('#image-file').click()};
  const view=mk('button','查看大图');view.type='button';
  view.onclick=()=>{setTab('image')};
  const add=mk('button','新建战术卡');add.type='button';add.onclick=newCard;
  actions.append(swap,view,add);
  box.append(actions);
  $('#title').textContent=(draft.name&&(draft.name.zh||draft.name.en))||draft.id;
  $('#subtitle').textContent=draft.id+' · '+(draft.owner||'通用');
  const idInput=mk('input');idInput.value=draft.id;idInput.disabled=true;box.append(field('固定 ID',idInput));
  for(const [key,label] of [['en','英文名'],['zh','中文名']]){
    const i=mk('input');i.value=(draft.name&&draft.name[key])||'';
    i.oninput=()=>{draft.name=draft.name||{};draft.name[key]=i.value;setDirty()};
    box.append(field(label,i));
  }
  const pips=mk('input');pips.type='number';pips.min='0';pips.max='9';pips.value=draft.pips??'';
  pips.oninput=()=>{draft.pips=pips.value===''?null:Number(pips.value);setDirty()};
  box.append(field('游戏点数 pips（卡面印刷，仅影响游戏进程）',pips));
  const slot=mk('input');slot.type='number';slot.min='1';slot.max='4';slot.value=draft.slotPips??'';
  slot.placeholder='留空 = 与 pips 相同';
  slot.oninput=()=>{draft.slotPips=slot.value===''?null:Number(slot.value);setDirty()};
  box.append(field('写表槽位点数 slotPips',slot));
  const owner=mk('input');owner.value=draft.owner||'';
  owner.oninput=()=>{draft.owner=owner.value;setDirty()};
  box.append(field('卡面归属（owner 文本）',owner));

  const facBox=mk('div');facBox.className='chips';
  const facs=new Set(draft.factions||[]);
  const facHint=mk('p','留空 = 不限制军队，只跟随解锁单位；点击标签开关。');facHint.className='hint';facBox.append(facHint);
  const clearBtn=mk('button','清空军队');clearBtn.type='button';clearBtn.className='minor';
  clearBtn.onclick=()=>{draft.factions=[];setDirty();renderForm()};
  facBox.append(clearBtn);
  const facRow=mk('div');facRow.className='chips-grid';facBox.append(facRow);
  for(const army of (defs&&defs.armies)||[]){
    const b=mk('button',army.name.zh||army.name.en);b.type='button';
    b.className='chip'+(facs.has(army.id)?' on':'');
    b.setAttribute('aria-pressed',String(facs.has(army.id)));
    b.onclick=()=>{if(facs.has(army.id))facs.delete(army.id);else facs.add(army.id);draft.factions=[...facs];setDirty();renderForm()};
    facRow.append(b);
  }
  box.append(field('可用军队/战斗部队（factions）',facBox));

  const unBox=mk('div');unBox.className='unit-chips';
  const unRow=mk('div');unRow.className='row-actions';
  const unBtn=mk('button','选择解锁单位（'+((draft.unlockedBy||[]).filter(u=>u.propertyName==='units').length)+'）');unBtn.type='button';
  unBtn.onclick=()=>{
    if(!window.UnitPicker){status('单位选择器未载入',true);return}
    const units=((defs&&defs.sourceUnits)||[]).map(s=>({id:s.id,name:s.name}));
    const selectedIds=(draft.unlockedBy||[]).filter(u=>u.propertyName==='units').map(u=>String(u.id));
    window.UnitPicker.openMulti(units,selectedIds,ids=>{
      draft.unlockedBy=ids.map(id=>({id:Number(id),propertyName:'units'}));
      setDirty();renderForm();
    });
  };
  const unClear=mk('button','清空单位');unClear.type='button';unClear.className='minor';
  unClear.onclick=()=>{draft.unlockedBy=[];setDirty();renderForm()};
  unRow.append(unBtn,unClear);
  unBox.append(unRow);
  for(const un of (draft.unlockedBy||[]).filter(u=>u.propertyName==='units'))unBox.append(unitChipFor(un));
  const unHint=mk('p','有解锁单位且军队留空 = 指挥卡只跟随这些单位，不受军队/战斗部队限制。');unHint.className='hint';unBox.append(unHint);
  box.append(field('解锁单位（unlockedBy）',unBox));

  for(const [key,label] of [['orders','指令文本'],['description','效果文本']]){
    for(const lang of ['en','zh']){
      const t=mk('textarea');t.value=((draft[key]||{})[lang])||'';
      t.oninput=()=>{draft[key]=draft[key]||{};draft[key][lang]=t.value;setDirty()};
      box.append(field(label+' · '+lang,t));
    }
  }
  const imgBox=mk('div');imgBox.className='form-image';
  if(draft.image){const img=mk('img');img.src=draft.image;img.alt='';imgBox.append(img)}
  else{const ph=mk('div');ph.className='form-image-ph';ph.textContent='暂无卡图';imgBox.append(ph)}
  const imgActions=mk('div');imgActions.className='row-actions';
  const upBtn=mk('button','上传 / 更换卡图');upBtn.type='button';
  upBtn.onclick=()=>{$('#image-file').click()};
  const path=mk('input');path.value=draft.image||'';path.placeholder='assets/command-cards/xxx.webp';
  path.oninput=()=>{draft.image=path.value;setDirty()};
  imgActions.append(upBtn,path);
  imgBox.append(imgActions);
  box.append(field('卡图',imgBox));
}
function setTab(name){
  tab=name;
  for(const t of ['form','image','json','history'])$('#'+t+'-pane').hidden=t!==name;
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===name)));
  if(name==='json')$('#raw-json').value=JSON.stringify(draft,null,2);
  if(name==='history')loadHistory();
}
async function loadHistory(){
  const box=$('#history');box.replaceChildren();
  try{
    for(const h of await call('/api/commands/history')){
      const row=mk('div');row.append(mk('code',h.file));
      const b=mk('button','恢复当前战术卡');b.type='button';
      b.onclick=async()=>{if(!confirm('用该备份覆盖当前战术卡？'))return;try{const r=await call('/api/commands/restore',{snapshot:h.file,id:selected,revision});revision=r.revision;draft=r.card;setDirty();renderForm();status('已恢复：'+h.file)}catch(e){status(e.message,true)}};
      row.append(b);box.append(row);
    }
  }catch(e){box.append(mk('p',e.message))}
}
function newCard(){
  if(dirty&&!confirm('有未保存修改，确定新建？'))return;
  const id='cmd-'+Date.now().toString(36);
  draft={id,name:{en:'New Command',zh:'新战术卡'},pips:1,slotPips:null,owner:'',factions:[],unlockedBy:[],orders:{en:'',zh:''},description:{en:'',zh:''},image:''};
  selected=id;creating=true;dirty=true;
  rows().push(JSON.parse(JSON.stringify(draft)));
  renderForm();renderList();renderImage();$('#dirty').textContent='新建（未保存）';
  status('已创建草稿：填写后点击保存');
}
let unitsById={};
async function reload(){
  if(dirty&&!confirm('放弃未保存修改并重新载入？'))return;
  try{
    const [res,unitsRes]=await Promise.all([call('/api/commands'),fetch('data/units.json').then(r=>r.json())]);
    catalog=res.catalog;revision=res.revision;
    defs=await fetch('data/catalog-definitions.json').then(r=>r.json());
    unitsById=Object.fromEntries((unitsRes.units||[]).map(u=>[String((u.upstream||{}).id||''),u]));
    dirty=false;$('#dirty').textContent='';
    const first=(catalog.commands||[])[0];
    renderList();
    if(first)select(first.id);
    status('');
  }catch(e){
    status(e.message,true);
    try{catalog=await fetch('data/catalog-definitions.json').then(r=>r.json());defs=catalog;unitsById={};renderList();}catch(err){}
  }
}
$('#save').onclick=async()=>{
  if(busy||!draft)return;
  busy=true;$('#save').disabled=true;
  try{
    const res=await call('/api/commands/save',{card:draft,revision,create:creating});
    revision=res.revision;draft=res.card;creating=false;
    const idx=rows().findIndex(c=>c.id===res.card.id);
    if(idx>=0)rows()[idx]=JSON.parse(JSON.stringify(res.card));
    dirty=false;$('#dirty').textContent='已保存';
    setTimeout(()=>{if($('#dirty').textContent==='已保存')$('#dirty').textContent=''},2000);
    renderForm();renderList();renderImage();
    status('已保存；备份 history/commands/'+(res.snapshot||''));
  }catch(e){
    if(window.SaveUI)SaveUI.fail(e,reload);else status(e.message,true);
  }finally{busy=false;$('#save').disabled=false}
};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
$('#new-card').onclick=newCard;
$('#reload').onclick=reload;
$('#apply-json').onclick=()=>{try{draft=JSON.parse($('#raw-json').value);setDirty();renderForm();status('JSON 已应用')}catch(e){status('JSON 无效：'+e.message,true)}};
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({commands:rows()},null,2)],{type:'application/json'});const a=mk('a');a.href=URL.createObjectURL(blob);a.download='commands.json';a.click()};
$('#image-upload').onclick=()=>$('#image-file').click();
$('#image-file').onchange=async()=>{
  const f=$('#image-file').files[0];if(!f||!draft)return;
  busy=true;$('#image-upload').disabled=true;
  try{
    const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('读取失败'));r.readAsDataURL(f)});
    const result=await call('/api/commands/image',{id:selected,revision,dataUrl});
    revision=result.revision;draft.image=result.image||draft.image;
    const row=rows().find(c=>c.id===selected);if(row)row.image=draft.image;
    dirty=false;$('#dirty').textContent='';renderForm();renderImage();renderList();
    status('卡图已更新：'+draft.image);
  }catch(e){if(window.SaveUI)SaveUI.fail(e,reload);else status(e.message,true)}
  finally{busy=false;$('#image-upload').disabled=false;$('#image-file').value=''}
};
for(const id of ['search','pip-filter','art-filter']){const n=$('#'+id);n.oninput=renderList;n.onchange=renderList}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
reload();
