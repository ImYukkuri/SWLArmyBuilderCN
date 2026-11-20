/* A non-modal symbol reference shared by every maintenance editor.
 * Keep the real input and selection, never a second copy of its draft data. */
document.addEventListener('DOMContentLoaded', () => {
  const actions=document.querySelector('.editor-global-actions');
  if(!actions || !window.RuleIcons) return;
  const el=(tag,text,className)=>{
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(className)node.className=className;
    return node;
  };
  const button=(text,className)=>{const b=el('button',text,className);b.type='button';return b;};
  const toggle=button('图标','editor-symbols-toggle');
  toggle.id='editor-symbols-toggle';toggle.setAttribute('aria-controls','editor-symbols');
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','展开图标参考');
  actions.append(toggle);

  const panel=el('aside',null,'editor-symbols');panel.id='editor-symbols';panel.hidden=true;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','editor-symbols-title');
  const head=el('div',null,'editor-symbols-head'),title=el('h2','图标参考');title.id='editor-symbols-title';
  const close=button('×');close.setAttribute('aria-label','关闭图标参考');head.append(title,close);
  const filters=el('div',null,'editor-symbols-filters'),search=el('input'),category=el('select');
  search.type='search';search.placeholder='查找图标或标记';search.setAttribute('aria-label','查找图标');
  category.dataset.noCombo='true';category.setAttribute('aria-label','图标类别');
  for(const name of ['全部',...RuleIcons.REFERENCE_GROUPS.map(([name])=>name)]) {
    const option=el('option',name);option.value=name==='全部'?'':name;category.append(option);
  }
  filters.append(search,category);
  const modes=el('div',null,'editor-symbols-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','图标点击操作');
  const insertMode=button('插入光标'),copyMode=button('复制文本');
  insertMode.setAttribute('aria-pressed','true');copyMode.setAttribute('aria-pressed','false');modes.append(insertMode,copyMode);
  const targetLabel=el('p',null,'editor-symbols-target'),list=el('div',null,'editor-symbols-list');
  const feedback=el('p',null,'editor-symbols-feedback');feedback.setAttribute('role','status');
  const manual=el('input');manual.readOnly=true;manual.hidden=true;manual.setAttribute('aria-label','手动复制图标标记');
  panel.append(head,filters,modes,targetLabel,list,feedback,manual);document.body.append(panel);
  let target=null,mode='insert';
  const editable=node=>node instanceof HTMLElement &&
    (node.matches('textarea') || node.matches('input') && node.type==='text') &&
    !node.matches(':disabled,[readonly]') && !node.closest('#editor-symbols,.combo,.catalog,.toolbar,.keyword-search') &&
    node.id!=='search' && typeof node.selectionStart==='number';
  const validTarget=()=>target && editable(target.node) && target.node.isConnected && target.node.getClientRects().length &&
    target.node.value===target.value;
  const fieldName=node=>node.getAttribute('aria-label') || node.labels?.[0]?.textContent.trim().split('\n')[0] || '文本框';
  function updateTarget(){
    const valid=validTarget();
    targetLabel.textContent=mode==='copy'?'点击图标复制标记':valid?'插入：'+fieldName(target.node):'先点选文本框；未点选时复制标记';
    targetLabel.title=targetLabel.textContent;
  }
  function remember(node){
    if(!editable(node))return;
    target={node,start:node.selectionStart,end:node.selectionEnd,value:node.value};updateTarget();
  }
  document.addEventListener('focusin',e=>{
    if(panel.contains(e.target)||e.target===toggle)return;
    if(editable(e.target))remember(e.target);else {target=null;updateTarget();}
  });
  // Also clear when a different card/tab reuses the same input element.
  document.addEventListener('pointerdown',e=>{
    if(panel.contains(e.target)||toggle.contains(e.target)){
      if(editable(document.activeElement))remember(document.activeElement);
      return;
    }
    if(editable(e.target))remember(e.target);else {target=null;updateTarget();}
  },true);
  for(const type of ['select','input','keyup','pointerup'])document.addEventListener(type,e=>{
    if(editable(e.target)&&e.target===document.activeElement)remember(e.target);
  });
  document.addEventListener('selectionchange',()=>{
    if(editable(document.activeElement))remember(document.activeElement);
  });
  function show(open){
    panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'收起图标参考':'展开图标参考');
    if(open){updateTarget();search.focus({preventScroll:true});}
    else (validTarget()?target.node:toggle).focus({preventScroll:true});
  }
  toggle.onclick=()=>show(panel.hidden);close.onclick=()=>show(false);
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!panel.hidden&&!document.querySelector('dialog[open]')){
      e.preventDefault();e.stopPropagation();show(false);
    }
  });
  function setMode(value){mode=value;insertMode.setAttribute('aria-pressed',String(value==='insert'));
    copyMode.setAttribute('aria-pressed',String(value==='copy'));updateTarget();}
  insertMode.onclick=()=>setMode('insert');copyMode.onclick=()=>setMode('copy');

  async function copy(token){
    try {
      if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(token);feedback.textContent='已复制 '+token;
    } catch {
      // Works on local/file previews too; leave selectable text if copying is denied.
      const focus=document.activeElement;manual.hidden=false;manual.value=token;manual.focus({preventScroll:true});manual.select();
      let copied=false;try {copied=document.execCommand('copy');}catch{}
      if(copied){manual.hidden=true;focus?.focus({preventScroll:true});feedback.textContent='已复制 '+token;}
      else feedback.textContent='复制未完成，请复制下方选中的标记。';
    }
  }
  async function use(key){
    const token='{@icon.'+key+'}';manual.hidden=true;
    if(mode==='copy'||!validTarget()){await copy(token);return;}
    const saved=target,node=saved.node,scroll=node.scrollTop;
    node.focus({preventScroll:true});node.setSelectionRange(saved.start,saved.end);
    let notified=false;const onInput=()=>{notified=true;};node.addEventListener('input',onInput);
    // Native editing preserves undo/redo; fallback still uses the editor's input handlers.
    let inserted=false;try {inserted=document.execCommand('insertText',false,token);}catch{}
    if(!inserted)node.setRangeText(token,saved.start,saved.end,'end');
    if(!notified)node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:token}));
    node.removeEventListener('input',onInput);node.scrollTop=scroll;
    node.dispatchEvent(new Event('change',{bubbles:true}));
    remember(node);feedback.textContent='已插入 '+RuleIcons.label(key);
  }
  function render(){
    list.replaceChildren();const query=search.value.trim().toLowerCase();let count=0;
    for(const [name,keys] of RuleIcons.REFERENCE_GROUPS){
      if(category.value&&category.value!==name)continue;
      const matches=keys.filter(key=>(key+' '+RuleIcons.label(key)+' '+name).toLowerCase().includes(query));
      if(!matches.length)continue;
      const group=el('section',null,'editor-symbols-group');group.append(el('h3',name));
      for(const key of matches){
        const label=RuleIcons.label(key),row=button(null,'editor-symbol-option');row.dataset.symbol=key;
        row.setAttribute('aria-label',label+'，'+key);
        const symbol=RuleIcons.icon(key,label),preview=el('span',null,'editor-symbol-preview');
        preview.append(symbol || el('span','文','editor-symbol-text'));
        const text=el('span',null,'editor-symbol-description');text.append(el('span',label),el('code','{@icon.'+key+'}'));
        if(!symbol)text.firstChild.append(el('small','文字标记'));
        row.append(preview,text);row.onclick=()=>use(key);group.append(row);count++;
      }
      list.append(group);
    }
    if(!count)list.append(el('p','没有匹配图标','editor-symbols-empty'));
  }
  search.oninput=render;category.onchange=render;render();updateTarget();
});
