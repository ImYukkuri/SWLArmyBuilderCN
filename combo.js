/* Searchable dropdown: trigger + popover panel with an inline search box. */
(() => {
  const SKIP = new Set(['search','faction','review-filter','slot-filter','match-filter','mode']);
  const seen = new WeakSet();
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
    panel.append(search, list);

    select.parentNode.insertBefore(wrap, select);
    wrap.append(trigger);
    document.body.append(panel);
    select.style.display = 'none';

    let items = [];
    const syncLabel = () => {
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
        li.textContent = it.text;
        if (it.value === select.value) li.classList.add('selected', 'active');
        if (it.disabled) li.classList.add('disabled');
        li.addEventListener('mousedown', e => { e.preventDefault(); choose(it); });
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
      if (select.value !== it.value) {
        select.value = it.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncLabel();
      close();
    };

    const position = () => {
      const r = trigger.getBoundingClientRect();
      panel.style.width = Math.max(r.width, 220) + 'px';
      panel.style.left = r.left + 'px';
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

    trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
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
    syncLabel();
  }

  function enhanceAll(root) {
    if (!root || root.nodeType !== 1) return;
    for (const s of root.querySelectorAll('select')) enhance(s);
  }

  document.addEventListener('DOMContentLoaded', () => {
    enhanceAll(document.body);
    new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'SELECT') enhance(n);
        else enhanceAll(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
