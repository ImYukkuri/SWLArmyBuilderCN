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

/* Multi-select unit picker dialog (shared by the rule editors). */
window.UnitPicker = (() => {
  function ensureStyle() {
    if (document.getElementById('unit-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'unit-picker-style';
    style.textContent =
      '.unit-picker-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:1000}' +
      '.unit-picker{background:#fff;border-radius:12px;width:min(460px,92vw);max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
      '.unit-picker-head{display:flex;gap:8px;padding:12px;border-bottom:1px solid #e5e7eb;align-items:center}' +
      '.unit-picker-head strong{white-space:nowrap}' +
      '.unit-picker-head input{flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px}' +
      '.unit-picker-close{border:0;background:transparent;font-size:20px;cursor:pointer;padding:4px 8px}' +
      '.unit-picker-list{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:4px}' +
      '.unit-picker-list .empty{padding:16px;color:#6b7280;text-align:center}' +
      '.unit-picker-item{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;cursor:pointer;text-align:left;font-size:14px}' +
      '.unit-picker-item:hover{background:#eef2ff;border-color:#c7d2fe}' +
      '.unit-picker-item.selected{background:#e0e7ff;border-color:#818cf8}' +
      '.unit-picker-item small{color:#6b7280}' +
      '.unit-picker-foot{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e5e7eb}' +
      '.unit-picker-foot button{padding:6px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer}' +
      '.unit-picker-foot .primary{background:#4f46e5;color:#fff;border-color:#4f46e5;margin-left:auto}';
    document.head.append(style);
  }

  function openMulti(units, selected, onConfirm) {
    ensureStyle();
    const overlay = document.createElement('div');
    overlay.className = 'unit-picker-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'unit-picker';
    const head = document.createElement('div');
    head.className = 'unit-picker-head';
    const title = document.createElement('strong');
    title.textContent = '选择单位（可多选）';
    const input = document.createElement('input');
    input.placeholder = '搜索 ID / 中文名 / 英文名';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'unit-picker-close';
    closeBtn.textContent = '×';
    head.append(title, input, closeBtn);
    const list = document.createElement('div');
    list.className = 'unit-picker-list';
    const foot = document.createElement('div');
    foot.className = 'unit-picker-foot';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '清空';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'primary';
    okBtn.textContent = '确定';
    foot.append(clearBtn, cancelBtn, okBtn);
    dialog.append(head, list, foot);
    overlay.append(dialog);

    const sel = new Set((selected || []).map(String));
    const items = units || [];

    function draw(filter) {
      list.replaceChildren();
      const f = String(filter || '').trim().toLowerCase();
      const rows = items.filter(it => {
        if (!f) return true;
        return String(it.id).toLowerCase().includes(f) ||
          ((it.name && it.name.zh) || '').toLowerCase().includes(f) ||
          ((it.name && it.name.en) || '').toLowerCase().includes(f);
      }).slice(0, 300);
      if (!rows.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = '无匹配单位';
        list.append(p);
        return;
      }
      for (const it of rows) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'unit-picker-item' + (sel.has(String(it.id)) ? ' selected' : '');
        const strong = document.createElement('strong');
        strong.textContent = (it.name && (it.name.zh || it.name.en)) || it.id;
        const small = document.createElement('small');
        small.textContent = ((it.name && it.name.en) || '') + ' · ' + it.id;
        b.append(strong, small);
        b.onclick = () => {
          const id = String(it.id);
          if (sel.has(id)) sel.delete(id); else sel.add(id);
          draw(input.value);
        };
        list.append(b);
      }
    }

    function close() { overlay.remove(); }
    closeBtn.onclick = close;
    cancelBtn.onclick = close;
    clearBtn.onclick = () => { sel.clear(); draw(input.value); };
    okBtn.onclick = () => { onConfirm([...sel]); close(); };
    input.addEventListener('input', () => draw(input.value));
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

    document.body.append(overlay);
    draw('');
    input.focus();
  }

  return { openMulti };
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
