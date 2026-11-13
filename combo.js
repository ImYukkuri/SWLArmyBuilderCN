/* Searchable dropdown: trigger + popover panel with an inline search box. */
(() => {
  const SKIP = new Set(['search','faction','review-filter','slot-filter','match-filter','mode']);
  const seen = new WeakSet();
  const entries = new Map();
  let sequence = 0;
  let current = null;

  function enhance(select) {
    if (!select || seen.has(select) || select.multiple || select.dataset.noCombo) return;
    if (select.id && SKIP.has(select.id)) return;
    seen.add(select);

    const wrap = document.createElement('div');
    wrap.className = 'combo';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'combo-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '选择项目');
    const label = document.createElement('span');
    label.className = 'combo-label';
    const caret = document.createElement('span');
    caret.className = 'combo-caret';
    caret.textContent = '▾';
    trigger.append(label, caret);

    const panel = document.createElement('div');
    panel.className = 'combo-panel';
    panel.hidden = true;
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'combo-search';
    search.placeholder = '搜索…';
    const list = document.createElement('ul');
    list.className = 'combo-list';
    list.setAttribute('role', 'listbox');
    list.id = 'combo-list-' + (++sequence);
    trigger.setAttribute('aria-controls',list.id);
    search.setAttribute('aria-label','搜索'+(select.getAttribute('aria-label')||'项目'));
    panel.append(search, list);

    select.parentNode.insertBefore(wrap, select);
    wrap.append(trigger);
    document.body.append(panel);
    select.style.display = 'none';

    let items = [];
    const syncLabel = () => {
      trigger.disabled=select.disabled;
      const op = select.selectedOptions && select.selectedOptions[0];
      label.textContent = op ? (op.textContent || '').trim() : '';
    };

    const render = q => {
      const query = String(q || '').trim().toLowerCase();
      list.replaceChildren();
      const filtered = items.filter(i => !query || i.text.toLowerCase().includes(query) || String(i.value).toLowerCase().includes(query));
      for (const it of filtered) {
        const li = document.createElement('li');
        li.className = 'combo-option';
        li.setAttribute('role', 'option');
        li.dataset.value = it.value;
        li.setAttribute('aria-selected',String(it.value===select.value));
        li.textContent = it.text;
        if (it.value === select.value) li.classList.add('selected', 'active');
        if (it.disabled) li.classList.add('disabled');
        li.addEventListener('click', e => { e.preventDefault(); choose(it); });
        list.append(li);
      }
      if (!filtered.length) {
        const empty = document.createElement('li');
        empty.className = 'combo-empty';
        empty.textContent = '无匹配项';
        list.append(empty);
      }
    };

    const choose = it => {
      if (!it || it.disabled) return;
      close();
      trigger.focus();
      if (select.value !== it.value) {
        select.value = it.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncLabel();
      close();
    };

    const position = () => {
      const r = trigger.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, 220), window.innerWidth - 16);
      panel.style.width = width + 'px';
      panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + 'px';
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow > 240 || spaceBelow > r.top) {
        panel.style.top = (r.bottom + 4) + 'px';
        panel.style.bottom = '';
      } else {
        panel.style.top = '';
        panel.style.bottom = (window.innerHeight - r.top + 4) + 'px';
      }
    };

    function onDocDown(e) { if (!panel.contains(e.target) && !wrap.contains(e.target)) close(); }
    const api = { close: () => close() };

    function open() {
      if(select.disabled || !select.isConnected)return;
      if (current && current !== api) current.close();
      items = [...select.options].map(o => ({ value: o.value, text: (o.textContent || '').trim(), disabled: o.disabled }));
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      search.value = '';
      render('');
      position();
      search.focus();
      current = api;
      document.addEventListener('mousedown', onDocDown, true);
      window.addEventListener('scroll', position, true);
      window.addEventListener('resize', position);
    }
    function close() {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (current === api) current = null;
      document.removeEventListener('mousedown', onDocDown, true);
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };

    trigger.addEventListener('click', e => { e.preventDefault(); panel.hidden ? open() : close(); });
    search.addEventListener('input', () => render(search.value));
    search.addEventListener('keydown', e => {
      const opts = [...list.querySelectorAll('.combo-option:not(.disabled)')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!opts.length) return;
        const cur = opts.findIndex(o => o.classList.contains('active'));
        let next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
        if (next < 0) next = opts.length - 1;
        if (next >= opts.length) next = 0;
        opts.forEach(o => o.classList.remove('active'));
        opts[next].classList.add('active');
        opts[next].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cur = list.querySelector('.combo-option.active') || list.querySelector('.combo-option');
        if (cur) choose({ value: cur.dataset.value, text: cur.textContent, disabled: cur.classList.contains('disabled') });
      } else if (e.key === 'Escape') {
        close();
        trigger.focus();
      }
    });

    select.addEventListener('change', syncLabel);
    const watcher=new MutationObserver(syncLabel);watcher.observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','label','selected']});
    entries.set(select,()=>{close();panel.remove();watcher.disconnect();entries.delete(select);});
    syncLabel();
  }

  function enhanceAll(root) {
    if (!root || root.nodeType !== 1) return;
    for (const s of root.querySelectorAll('select')) enhance(s);
  }

  document.addEventListener('DOMContentLoaded', () => {
    enhanceAll(document.body);
    new MutationObserver(muts => {
      for(const [select,destroy]of entries)if(!select.isConnected)destroy();
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'SELECT') enhance(n);
        else enhanceAll(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();

/* Search and selection are shared by command conditions and rule editors. */
window.UnitPicker = (() => {
  let current = null;
  const node = (tag, cls, text) => {
    const n = document.createElement(tag); if (cls) n.className = cls;
    if (text != null) n.textContent = text; return n;
  };
  function openMulti(units, selected, onConfirm, options = {}) {
    current?.close();
    const opener = document.activeElement;
    const dialog = node('dialog', 'unit-picker'); current = dialog;
    dialog.setAttribute('aria-label', options.title || '选择单位版本');
    const head = node('div', 'unit-picker-head');
    const title = node('div'); title.append(node('h2', null, options.title || '选择单位版本'),
      node('p', null, options.hint || '可多选；搜索名称、称号、军阶或 ID。'));
    const close = node('button', 'unit-picker-close', '×'); close.type = 'button';
    close.setAttribute('aria-label','关闭单位选择'); close.onclick=()=>dialog.close(); head.append(title,close);
    const search = node('input', 'unit-picker-search');search.type='search';
    search.placeholder='搜索中文 / 英文 / 称号 / ID';search.setAttribute('aria-label','搜索单位版本');
    const selectedArea = node('div', 'unit-picker-selected'); selectedArea.setAttribute('aria-label','已选单位版本');
    const tools=node('div','unit-picker-tools'), result=node('span');
    const onlyLabel=node('label'), only=node('input');only.type='checkbox';onlyLabel.append(only,document.createTextNode('只看已选'));
    tools.append(result,onlyLabel);
    const list = node('div', 'unit-picker-list');
    const foot=node('div','unit-picker-foot'), count=node('span');count.setAttribute('role','status');
    const clear=node('button',null,'清空'),cancel=node('button',null,'取消'),confirm=node('button','primary','确认选择');
    for(const button of [clear,cancel,confirm])button.type='button';
    foot.append(count,clear,cancel,confirm);dialog.append(head,search,selectedArea,tools,list,foot);
    const sel=new Set((selected||[]).map(String));
    const items=[...new Map((units||[]).map(u=>[String(u.id),u])).values()];
    const byId=new Map(items.map(u=>[String(u.id),u]));
    const label = u => u?.name?.zh || u?.name?.en || String(u?.id || '');
    function updateSelection() {
      selectedArea.replaceChildren();
      for(const id of sel){
        const u=byId.get(id), name=label(u)||'单位 '+id;
        const version=u?.title?.zh||u?.title?.en||'';
        const chip=node('button',null,name+(version?' · '+version:'')+' ×');chip.type='button';chip.title=version||id;
        chip.setAttribute('aria-label','移除 '+name+' '+id);
        chip.onclick=()=>{sel.delete(id);draw();search.focus();};selectedArea.append(chip);
      }
      selectedArea.hidden=!sel.size;count.textContent='已选 '+sel.size+' 个版本';
      for(const row of list.querySelectorAll('.unit-picker-item')){
        const chosen=sel.has(row.dataset.id);row.classList.toggle('selected',chosen);
        row.setAttribute('aria-pressed',String(chosen));row.querySelector('.unit-picker-check').textContent=chosen?'✓':'＋';
      }
    }
    function draw() {
      list.replaceChildren();const q=search.value.trim().toLocaleLowerCase();
      const rows=items.filter(u=>(!only.checked||sel.has(String(u.id)))&&(!q||
        [u.id,u.name?.zh,u.name?.en,u.title?.zh,u.title?.en,u.context].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)));
      result.textContent=rows.length+' 个可选版本';
      if(!rows.length)list.append(node('p','empty','没有匹配的单位版本。'));
      for(const u of rows){
        const row=node('button','unit-picker-item');row.type='button';row.dataset.id=String(u.id);
        if(u.assets?.portrait){const img=node('img');img.src=u.assets.portrait;img.alt='';img.loading='lazy';row.append(img);}
        else row.append(node('span','unit-picker-art-placeholder','◇'));
        const body=node('span','unit-picker-body');body.append(node('strong',null,label(u)));
        if(u.name?.en)body.append(node('span','unit-picker-english',u.name.en));
        const subtitle=[u.title?.zh||u.title?.en,u.context].filter(Boolean).join(' · ');
        if(subtitle)body.append(node('small',null,subtitle));
        body.append(node('small','unit-picker-id','ID '+u.id));
        row.append(body,node('span','unit-picker-check'));
        row.onclick=()=>{const id=String(u.id);if(sel.has(id))sel.delete(id);else sel.add(id);if(only.checked)draw();else updateSelection();};
        list.append(row);
      }
      updateSelection();
    }
    search.oninput=draw;only.onchange=draw;clear.onclick=()=>{sel.clear();draw();};cancel.onclick=()=>dialog.close();
    confirm.onclick=()=>{const ids=[...sel];dialog.close();onConfirm(ids);};
    dialog.addEventListener('close',()=>{dialog.remove();if(current===dialog)current=null;if(opener?.isConnected)opener.focus();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    document.body.append(dialog);draw();dialog.showModal();search.focus();
  }
  return {openMulti};
})();

/* Save feedback: distinguish "saved" from "save refused because the file moved on". */
window.SaveUI = {
  flashSaved() {
    const d = document.getElementById('dirty');
    if (!d) return;
    d.textContent = '已保存';
    d.style.color = '#59d18d';
    setTimeout(() => {
      if (d.textContent === '已保存') {
        d.textContent = '';
        d.style.color = '';
      }
    }, 2500);
  },
  fail(e, onReload) {
    const message = (e && e.message) || '未知错误';
    const conflict = (e && e.status === 409) || /已发生修改|已被修改|已修改/.test(message);
    const anchor = document.getElementById('status') || document.body;
    let box = document.getElementById('save-banner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'save-banner';
      box.className = 'draft-banner bad';
      anchor.after(box);
    }
    box.replaceChildren();
    const msg = document.createElement('span');
    msg.textContent = conflict
      ? '保存未完成：源文件已被其他窗口或脚本修改，你的草稿仍在（没有覆盖任何内容）。'
      : '保存失败：' + message;
    box.append(msg);
    if (conflict && onReload) {
      const reload = document.createElement('button');
      reload.type = 'button';
      reload.className = 'primary';
      reload.textContent = '重新载入（丢弃草稿）';
      reload.onclick = () => {
        if (confirm('重新载入会丢弃当前草稿，确定？')) { box.remove(); onReload(); }
      };
      box.append(reload);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'minor';
    close.textContent = conflict ? '保留草稿继续编辑' : '关闭';
    close.onclick = () => box.remove();
    box.append(close);
    box.hidden = false;
    const st = document.getElementById('status');
    if (st) { st.textContent = conflict ? '保存未完成：源文件已被修改，需要重新载入' : '保存失败：' + message; st.classList.add('error'); }
  }
};
