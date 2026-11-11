/* Expression condition editor for card.restrictions.condition.
 * Filterable datalist inputs (type to filter) that also accept custom values. */
window.ConditionEditor = (() => {
  const E = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  const FIELDS = [
    ['unit.unitTypeId', '单位类型'], ['unit.factionId', '阵营'], ['unit.affiliationIds', '组织'],
    ['unit.title', '称号（含匹配用 contains）'], ['unit.name', '单位名称'],
    ['unit.keywords', '关键词'], ['unit.rankId', '军阶'], ['unit.upstreamId', '上游单位 ID'],
    ['unit.defenseDie', '防御骰'], ['unit.divisions', '光暗标签'], ['unit.id', '单位内部 ID'],
  ];
  const OPS = [['eq', '等于'], ['in', '属于'], ['contains', '包含'], ['gte', '大于等于'], ['lte', '小于等于']];

  function tableFor(field, defs) {
    const d = defs || {};
    const pick = (list) => (list || []).map(x => [String(x.id), (x.name && (x.name.zh || x.name.en)) || '']);
    if (field === 'unit.unitTypeId') return pick(d.unitTypes);
    if (field === 'unit.factionId') return pick(d.factions);
    if (field === 'unit.affiliationIds') return pick(d.affiliations);
    if (field === 'unit.keywords') return pick(d.keywords);
    if (field === 'unit.rankId') return pick(d.ranks);
    if (field === 'unit.upstreamId') return pick(d.sourceUnits);
    if (field === 'unit.defenseDie') return [['white', '白'], ['red', '红']];
    if (field === 'unit.divisions') return [['Light', '光明'], ['Dark', '黑暗']];
    return [];
  }

  let seq = 0;
  function inputWithDatalist(className, value, options, placeholder) {
    const input = E('input');
    input.className = className || '';
    input.value = value == null ? '' : String(value);
    input.placeholder = placeholder || '';
    let dl = null;
    if (options && options.length) {
      const id = 'cond-dl-' + (++seq);
      dl = document.createElement('datalist');
      dl.id = id;
      for (const [v, label] of options) {
        const op = document.createElement('option');
        op.value = v;
        op.label = label ? v + ' · ' + label : v;
        op.textContent = label || v;
        dl.append(op);
      }
      input.setAttribute('list', id);
    }
    return { input, dl };
  }

  function parseValue(raw, op) {
    const toVal = (t) => {
      const s = String(t).trim();
      if (/^-?\d+$/.test(s)) return Number(s);
      if (s === 'true') return true;
      if (s === 'false') return false;
      return s;
    };
    if (op === 'in') return String(raw).split(',').map(s => s.trim()).filter(Boolean).map(toVal);
    return toVal(raw);
  }

  function renderNode(box, node, defs, onChange, rerender, removeSelf) {
    const item = E('div'); item.className = 'rule-item';
    if (node && typeof node === 'object' && ('all' in node || 'any' in node)) {
      const key = 'all' in node ? 'all' : 'any';
      const sel = E('select');
      for (const [v, t] of [['all', '全部满足 AND'], ['any', '任一满足 OR']]) { const op = E('option', t); op.value = v; sel.append(op); }
      sel.value = key;
      sel.onchange = () => { node[sel.value] = node[key]; if (sel.value !== key) delete node[key]; onChange(); rerender(); };
      item.append(sel);
      (node[key] || []).forEach((child, i) => {
        renderNode(item, child, defs, onChange, rerender, () => { node[key].splice(i, 1); onChange(); rerender(); });
      });
      const add = E('button', '＋ 条件'); add.type = 'button';
      add.onclick = () => { node[key].push({ field: 'unit.unitTypeId', op: 'eq', value: 1 }); onChange(); rerender(); };
      const addGroup = E('button', '＋ 分组'); addGroup.type = 'button';
      addGroup.onclick = () => { node[key].push({ all: [{ field: 'unit.unitTypeId', op: 'eq', value: 1 }] }); onChange(); rerender(); };
      const addNot = E('button', '＋ NOT'); addNot.type = 'button';
      addNot.onclick = () => { node[key].push({ not: { field: 'unit.unitTypeId', op: 'eq', value: 1 } }); onChange(); rerender(); };
      const addRef = E('button', '＋ 引用'); addRef.type = 'button';
      addRef.onclick = () => { node[key].push({ ref: 'trooperUnitType' }); onChange(); rerender(); };
      item.append(add, addGroup, addNot, addRef);
      if (removeSelf) { const del = E('button', '删除'); del.type = 'button'; del.className = 'minor'; del.onclick = removeSelf; item.append(del); }
      box.append(item);
      return;
    }
    if (node && typeof node === 'object' && 'not' in node) {
      const label = E('strong', 'NOT'); item.append(label);
      renderNode(item, node.not, defs, onChange, rerender, () => { delete node.not; onChange(); rerender(); });
      if (removeSelf) { const del = E('button', '删除'); del.type = 'button'; del.className = 'minor'; del.onclick = removeSelf; item.append(del); }
      box.append(item);
      return;
    }
    if (node && typeof node === 'object' && 'ref' in node) {
      const refs = Object.keys((defs && defs.slotRules && defs.slotRules.predicates) || {}).map(k => [k, '']);
      const { input, dl } = inputWithDatalist('cond-ref', node.ref, refs, '引用谓词');
      input.oninput = () => { node.ref = input.value; onChange(); };
      item.append(E('strong', '引用'), input);
      if (dl) item.append(dl);
      if (removeSelf) { const del = E('button', '删除'); del.type = 'button'; del.className = 'minor'; del.onclick = removeSelf; item.append(del); }
      box.append(item);
      return;
    }
    if (node && typeof node === 'object' && 'field' in node) {
      const f = { input: E('select'), dl: null };
      f.input.className = 'cond-field';
      for (const [v, label] of FIELDS) { const op = E('option', v + ' · ' + label); op.value = v; f.input.append(op); }
      if (!FIELDS.some(([v]) => v === node.field)) { const op = E('option', '待确认：' + node.field); op.value = node.field; f.input.append(op); }
      f.input.value = node.field;
      f.input.onchange = () => { node.field = f.input.value; onChange(); rerender(); };
      const o = { input: E('select'), dl: null };
      o.input.className = 'cond-op';
      for (const [v, label] of OPS) { const op = E('option', label + ' · ' + v); op.value = v; o.input.append(op); }
      if (!OPS.some(([v]) => v === node.op)) { const op = E('option', '待确认：' + node.op); op.value = node.op || ''; o.input.append(op); }
      o.input.value = node.op || 'eq';
      o.input.onchange = () => { node.op = o.input.value; onChange(); rerender(); };
      const v = inputWithDatalist('cond-value', Array.isArray(node.value) ? node.value.join(', ') : node.value, tableFor(node.field, defs), '值（in 用逗号分隔）');
      v.input.onchange = () => { node.value = parseValue(v.input.value, node.op || 'eq'); onChange(); };
      item.append(E('strong', '字段'), f.input, E('strong', '操作'), o.input, E('strong', '值'), v.input);
      if (f.dl) item.append(f.dl);
      if (o.dl) item.append(o.dl);
      if (v.dl) item.append(v.dl);
      const del = E('button', '删除'); del.type = 'button'; del.className = 'minor';
      del.onclick = () => { if (removeSelf) removeSelf(); else { delete node.field; delete node.op; delete node.value; onChange(); rerender(); } };
      item.append(del);
      box.append(item);
      return;
    }
    const raw = E('textarea'); raw.value = JSON.stringify(node, null, 1);
    raw.onchange = () => { try { const v = JSON.parse(raw.value); Object.keys(node).forEach(k => delete node[k]); Object.assign(node, v); onChange(); rerender(); } catch (e) {} };
    item.append(raw);
    if (removeSelf) { const del = E('button', '删除'); del.type = 'button'; del.className = 'minor'; del.onclick = removeSelf; item.append(del); }
    box.append(item);
  }

  function render(container, restrictions, defs, onChange, rerender) {
    container.replaceChildren();
    const field = E('fieldset'); field.className = 'restriction-section';
    field.append(E('legend', '卡面限制条件（表达式）'));
    const hint = E('p', '可过滤下拉：直接输入可在候选里筛选，也可输入自定义值。in 用逗号分隔多个值。');
    hint.className = 'hint';
    field.append(hint);
    if (!restrictions.condition) {
      field.append(E('p', '当前未设置条件。'));
      const add = E('button', '添加条件'); add.type = 'button';
      add.onclick = () => { restrictions.condition = { all: [{ field: 'unit.unitTypeId', op: 'eq', value: 1 }] }; onChange(); rerender(); };
      field.append(add);
    } else {
      renderNode(field, restrictions.condition, defs, onChange, rerender, () => { delete restrictions.condition; onChange(); rerender(); });
    }
    container.append(field);
  }

  return { render, FIELDS, OPS };
})();
