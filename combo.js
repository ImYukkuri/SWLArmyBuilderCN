/* Add a filter box above each editor <select>; the dropdown itself stays native.
 * Typing filters the visible options; the current value is kept even when filtered out. */
(() => {
  const seen = new WeakSet();
  const SKIP = new Set(['search','faction','review-filter','slot-filter','match-filter','mode']);

  function enhance(select) {
    if (!select || seen.has(select)) return;
    if (select.multiple || select.dataset.noCombo) return;
    if (select.id && SKIP.has(select.id)) return;
    seen.add(select);

    const wrap = document.createElement('span');
    wrap.className = 'combo-wrap';
    const filter = document.createElement('input');
    filter.type = 'text';
    filter.className = 'combo-filter';
    filter.placeholder = select.dataset.placeholder || '输入筛选…';
    filter.setAttribute('aria-label', (select.getAttribute('aria-label') || '下拉') + ' 筛选');

    select.parentNode.insertBefore(wrap, select);
    wrap.append(filter, select);

    let all = [];
    let building = false;
    const snapshot = () => {
      all = [...select.options].map(o => ({ value: o.value, text: o.textContent, disabled: o.disabled }));
    };
    snapshot();

    const rebuild = q => {
      const query = String(q || '').trim().toLowerCase();
      const current = select.value;
      building = true;
      select.replaceChildren();
      let present = false;
      for (const o of all) {
        if (query && !(o.text.toLowerCase().includes(query) || String(o.value).toLowerCase().includes(query))) continue;
        const op = document.createElement('option');
        op.value = o.value;
        op.textContent = o.text;
        if (o.disabled) op.disabled = true;
        select.append(op);
        if (o.value === current) present = true;
      }
      if (!present) {
        const src = all.find(o => o.value === current);
        if (src) {
          const op = document.createElement('option');
          op.value = src.value;
          op.textContent = src.text;
          select.prepend(op);
        }
      }
      select.value = current;
      building = false;
    };

    filter.addEventListener('input', () => rebuild(filter.value));
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
