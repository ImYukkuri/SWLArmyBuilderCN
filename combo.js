/* Turn editor <select> controls into filterable comboboxes (input + datalist).
 * Keeps the original <select> as the value holder so existing change handlers keep working. */
(() => {
  let seq = 0;
  const seen = new WeakSet();
  const SKIP = new Set(['search','faction','review-filter','slot-filter','match-filter','mode','bf-faction']);

  function optionsOf(select) {
    return [...select.options].filter(o => !o.disabled || o.value);
  }

  function enhance(select) {
    if (!select || seen.has(select)) return;
    if (select.multiple || select.dataset.noCombo) return;
    if (select.id && SKIP.has(select.id)) return;
    seen.add(select);
    const dl = document.createElement('datalist');
    dl.id = 'combo-' + (++seq);
    const sync = () => {
      dl.replaceChildren();
      for (const op of optionsOf(select)) {
        const o = document.createElement('option');
        o.value = (op.textContent || '').trim();
        o.label = op.value;
        dl.append(o);
      }
    };
    sync();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'combo-input';
    input.setAttribute('list', dl.id);
    input.placeholder = select.dataset.placeholder || '输入筛选…';
    input.setAttribute('aria-label', select.getAttribute('aria-label') || '筛选选择');
    const show = () => {
      const op = select.selectedOptions && select.selectedOptions[0];
      input.value = op ? (op.textContent || '').trim() : '';
    };
    show();
    input.addEventListener('change', () => {
      const text = input.value.trim();
      const op = optionsOf(select).find(o => (o.textContent || '').trim() === text);
      if (op) {
        if (select.value !== op.value) {
          select.value = op.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        show();
      }
    });
    input.addEventListener('input', () => {
      if (input.value !== '') return;
      const first = optionsOf(select)[0];
      if (first && select.value !== first.value) {
        select.value = first.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    select.style.display = 'none';
    select.parentNode.insertBefore(input, select);
    select.parentNode.insertBefore(dl, select);
    select.addEventListener('change', show);
    new MutationObserver(sync).observe(select, { childList: true });
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
        else if (n.tagName === 'OPTION' && n.closest('select')) enhance(n.closest('select'));
        else enhanceAll(n);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
