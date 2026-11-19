/* Edits the same keyword records used by units, upgrades and command cards. */
(() => {
  const $ = s => document.querySelector(s);
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const timings = {
    global: '全局', army_building: '组军', setup: '设置', deployment: '部署', command: '命令阶段',
    activation_start: '激活开始', activation: '激活', activation_end: '激活结束',
    movement: '移动', attack: '攻击', defense: '防御', end_round: '回合结束',
  };
  let catalog, revision, draft, selected, units = [], upgrades = [];
  let dirty = false, creating = false, busy = false, previewTab = 'summary', writable = false;
  const name = item => item.name?.zh || item.name?.en || item.id;
  const timingText = item => (item.timing || []).map(t => timings[t] || t).join(' / ') || '未分类';
  function status(text, error = false) {
    $('#status').textContent = text;
    $('#status').classList.toggle('error', error);
  }
  async function api(url, body) {
    const response = await fetch(url, body === undefined ? {} : {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
    });
    let result;
    try { result = await response.json(); }
    catch { const error = Error('此服务不能保存词条，请使用本地数据维护服务。'); error.status = response.status; throw error; }
    if (!response.ok) { const error = Error(result.error || response.statusText); error.status = response.status; throw error; }
    return result;
  }
  function controls() {
    $('#keyword-fields').disabled = busy;
    $('#save').disabled = busy || !draft || !dirty || !writable;
    $('#new-keyword').disabled = busy || !catalog;
    $('#reload').disabled = busy;
    $('#export').disabled = busy || !draft;
    $('#load-history').disabled = busy || !writable || creating;
    $('#dirty').textContent = dirty ? '有未保存修改' : '';
  }
  function markDirty() {
    dirty = true;
    controls();
    $('#title').textContent = name(draft) || '新建词条';
    renderPreview();
  }
  function renderList() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    const timing = $('#timing-filter').value, content = $('#content-filter').value;
    const records = (catalog?.keywords || []).filter(k => {
      if (query && ![k.id, k.name?.zh, k.name?.en, k.summary, k.full].join(' ').toLocaleLowerCase().includes(query)) return false;
      if (timing === 'unclassified' ? k.timing?.length : timing && !k.timing?.includes(timing)) return false;
      if (content === 'incomplete' && k.summary?.trim() && k.full?.trim()) return false;
      if (content === 'reviewed' && k.status !== 'reviewed') return false;
      if (content === 'review' && !['needs_review', 'unresolved', 'english_only'].includes(k.status)) return false;
      return true;
    });
    $('#counts').textContent = records.length + ' / ' + (catalog?.keywords.length || 0) + ' 条';
    const list = $('#keyword-list'); list.replaceChildren();
    for (const keyword of records) {
      const button = node('button', null, 'keyword-row' + (keyword.id === selected ? ' active' : ''));
      button.type = 'button'; button.dataset.id = keyword.id;
      button.setAttribute('aria-pressed', String(keyword.id === selected));
      button.append(node('strong', name(keyword)), node('small', keyword.name?.en), node('small', keyword.id), node('span', timingText(keyword)));
      const missing = [!keyword.summary?.trim() && '缺简写', !keyword.full?.trim() && '缺完整规则'].filter(Boolean);
      if (missing.length) button.append(node('small', missing.join(' · '), 'keyword-missing'));
      button.onclick = () => select(keyword.id);
      list.append(button);
    }
    if (!records.length) list.append(node('p', '没有符合条件的词条。', 'hint'));
  }
  function canLeave() { return !busy && (!dirty || confirm('当前词条尚未保存，放弃修改并继续？')); }
  function select(id) {
    if (id === selected && !creating) return;
    if (!canLeave()) return;
    const record = catalog.keywords.find(k => k.id === id);
    if (!record) return;
    draft = copy(record); selected = id; creating = false; dirty = false; previewTab = 'summary';
    renderForm(); renderList();
    status(writable ? '' : '当前为只读浏览，可编辑并导出草稿；保存需要本地数据维护服务。');
  }
  function renderForm() {
    $('#empty-editor').hidden = !!draft;
    $('#keyword-form').hidden = !draft;
    $('#keyword-references').hidden = !draft;
    $('#keyword-history').hidden = !draft || creating || !writable;
    if (!draft) { controls(); return; }
    $('#title').textContent = name(draft) || '新建词条';
    $('#subtitle').textContent = creating ? '新词条 · 保存后可用于单位与卡牌' : draft.id;
    $('#name-zh').value = draft.name.zh;
    $('#name-en').value = draft.name.en;
    $('#keyword-id').value = draft.id;
    $('#keyword-id').readOnly = !creating;
    $('#id-hint').textContent = creating ? '小写字母、数字、下划线或连字符；保存后固定。' : 'ID 已固定，保留所有卡牌的词条关联。';
    $('#review-status').value = draft.status || '';
    $('#summary').value = draft.summary;
    $('#full').value = draft.full;
    for (const input of document.querySelectorAll('#timing-options input')) input.checked = draft.timing.includes(input.value);
    $('#history').replaceChildren();
    $('#keyword-history').open = false;
    renderPreview(); renderReferences(); controls();
  }
  function previewActions(text) {
    const fragment = document.createDocumentFragment(); let start = 0;
    for (const match of text.matchAll(/免费(?:行动|动)(?:(?:\s*[：:]\s*|并)横置)?|普通行动|双行动|行动/g)) {
      const label = match[0].includes('横置') ? '免费行动：横置' : match[0].startsWith('免费') ? '免费行动'
        : match[0] === '双行动' ? '双行动' : '行动';
      fragment.append(document.createTextNode(text.slice(start, match.index)), node('span', label, 'action-mark'));
      start = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(start))); return fragment;
  }
  function previewText(text) {
    const out=document.createDocumentFragment();let start=0;
    const source=String(text).replace(/\{@icon\.action\}\s*\{@icon\.action\}/g,'{@icon.double-action}');
    for(const match of source.matchAll(/\{@icon\.([\w-]+)\}/g)) {
      out.append(previewActions(source.slice(start,match.index)));
      const label=RuleIcons.label(match[1],catalog);
      out.append(RuleIcons.icon(match[1],label) || previewActions(label));
      start=match.index+match[0].length;
    }
    out.append(previewActions(source.slice(start)));return out;
  }
  function renderPreview() {
    if (!draft) return;
    $('#preview-name').textContent = name(draft) || '未命名词条';
    $('#preview-en').textContent = draft.name.en;
    $('#preview-timing').textContent = timingText(draft);
    $('#text-counts').textContent = '简写 ' + draft.summary.length + ' 字 · 完整规则 ' + draft.full.length + ' 字';
    for (const key of ['summary', 'full']) {
      const button = $('#preview-' + key), active = previewTab === key;
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    }
    $('#preview-text').setAttribute('aria-labelledby', 'preview-' + previewTab);
    $('#preview-text').replaceChildren(previewText(draft[previewTab] || (previewTab === 'summary' ? '暂无简写，可切换完整规则。' : '暂无完整规则。')));
  }
  function renderReferences() {
    const box = $('#references'); box.replaceChildren();
    const upstream = new Set((draft.upstreamIds || []).map(String));
    const matches = refs => (refs || []).some(ref => {
      const id = typeof ref === 'object' ? ref?.id : ref;
      return id === draft.id || upstream.has(String(id));
    });
    let count = 0;
    for (const [kind, cards] of [['单位', units], ['升级', upgrades], ['指挥卡', catalog.commands || []]]) {
      for (const card of cards) {
        const faces = card.dualSided && card.back ? [card, card.back] : [card];
        if (!faces.some(face => matches(face.keywords) || (face.weapons || []).some(w => matches(w.keywords)))) continue;
        const item = node('span', kind + ' · ' + name(card)); item.title = card.id;
        box.append(item); count++;
      }
    }
    $('#references-title').textContent = '引用此词条的卡牌 · ' + count;
    if (!count) box.append(node('p', '尚未在单位、升级卡或指挥卡的词条字段中引用。', 'hint'));
  }
  async function reload() {
    if (busy) return;
    busy = true; controls(); status('载入词条…');
    try {
      let result;
      try { result = await api('/api/keywords'); writable = true; }
      catch (error) {
        if (![404, 200].includes(error.status)) throw error;
        result = {catalog: await api('data/catalog-definitions.json'), revision: null}; writable = false;
      }
      const references = await Promise.allSettled([api('data/units.json'), api('data/upgrades.json')]);
      units = references[0].status === 'fulfilled' ? references[0].value.units : [];
      upgrades = references[1].status === 'fulfilled' ? references[1].value.cards : [];
      catalog = result.catalog; revision = result.revision;
      const target = catalog.keywords.find(k => k.id === selected) ||
        catalog.keywords.find(k => k.id === new URLSearchParams(location.search).get('id')) || catalog.keywords[0];
      draft = target ? copy(target) : null; selected = target?.id;
      creating = false; dirty = false; previewTab = 'summary';
      $('#save-banner')?.remove(); renderForm(); renderList();
      status(!writable ? '当前为只读浏览，可编辑并导出草稿；保存需要本地数据维护服务。'
        : references.some(r => r.status === 'rejected') ? '词条已载入；部分引用卡牌未能载入，可重新载入重试。' : '');
    } catch (error) { status(error.message, true); }
    finally { busy = false; controls(); }
  }
  function applySaved(result) {
    const index = catalog.keywords.findIndex(k => k.id === result.card.id);
    if (index < 0) catalog.keywords.push(copy(result.card)); else catalog.keywords[index] = copy(result.card);
    revision = result.revision; draft = copy(result.card); selected = draft.id;
    creating = false; dirty = false;
    $('#save-banner')?.remove(); renderForm(); renderList();
  }
  async function save() {
    if (busy || !draft || !writable || !dirty) return;
    if (!$('#keyword-form').reportValidity()) return;
    if (!draft.name.zh.trim() && !draft.name.en.trim()) { status('请填写至少一个词条名称。', true); $('#name-zh').focus(); return; }
    if (creating && catalog.keywords.some(k => k.id === draft.id)) { status('该词条 ID 已存在，请使用其他 ID。', true); $('#keyword-id').focus(); return; }
    busy = true; controls(); status('保存中…');
    try {
      applySaved(await api('/api/keywords/save', {card: draft, revision, create: creating}));
      status('词条已保存。重新载入写表器或卡牌编辑器后即可读取更新内容。');
    } catch (error) { SaveUI.fail(error, reload); }
    finally { busy = false; controls(); }
  }
  async function loadHistory() {
    if (busy || !draft || creating || !writable) return;
    busy = true; controls();
    try {
      const records = await api('/api/keywords/history'); const box = $('#history');box.replaceChildren();
      if (!records.length) box.append(node('p', '暂无保存历史。', 'hint'));
      for (const record of records) {
        const row = node('div', null, 'keyword-history-row');
        const restore = node('button', '恢复当前词条');restore.type = 'button';
        restore.onclick = async () => {
          if (busy || !confirm('恢复此快照中的当前词条？当前草稿将被替换，恢复前的文件会保留历史。')) return;
          busy = true;controls();
          try { applySaved(await api('/api/keywords/restore', {snapshot: record.file, id: selected, revision})); status('已恢复当前词条。'); }
          catch (error) { SaveUI.fail(error, reload); }
          finally { busy = false;controls(); }
        };
        const date = record.file.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
        const label = date ? new Date(`${date[1]}-${date[2]}-${date[3]}T${date[4]}:${date[5]}:${date[6]}Z`).toLocaleString('zh-CN') : record.file;
        row.append(node('span', label + ' · 保存前快照'), restore);box.append(row);
      }
    } catch (error) { status(error.message, true); }
    finally { busy = false; controls(); }
  }
  for (const [key, label] of Object.entries(timings)) {
    const option = node('option', label);option.value = key;$('#timing-filter').append(option);
    const row = node('label'), input = node('input');input.type = 'checkbox';input.value = key;
    input.onchange = () => {
      if (!draft || busy) return;
      draft.timing = input.checked ? [...draft.timing, key] : draft.timing.filter(t => t !== key);markDirty();
    };
    row.append(input, document.createTextNode(label));$('#timing-options').append(row);
  }
  for (const [id, update] of [
    ['name-zh', value => draft.name.zh = value], ['name-en', value => draft.name.en = value],
    ['keyword-id', value => { if (creating) draft.id = value.trim(); }],
    ['summary', value => draft.summary = value], ['full', value => draft.full = value],
  ]) $('#' + id).oninput = event => { if (!draft || busy) return;update(event.target.value);markDirty(); };
  $('#review-status').onchange = event => {
    if (!draft || busy) return;
    if (event.target.value) draft.status = event.target.value; else delete draft.status;
    markDirty();
  };
  for (const key of ['summary', 'full']) {
    const button = $('#preview-' + key);
    button.onclick = () => { previewTab = key; renderPreview(); };
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'summary' : event.key === 'End' ? 'full' : key === 'summary' ? 'full' : 'summary';
      $('#preview-' + next).click();$('#preview-' + next).focus();
    };
  }
  $('#new-keyword').onclick = () => {
    if (!canLeave()) return;
    draft = {id: '', name: {zh: '', en: ''}, summary: '', full: '', timing: [], status: 'needs_review'};
    selected = null;creating = true;dirty = true;previewTab = 'summary';
    renderForm();renderList();status('填写名称和唯一 ID 后保存；新词条会进入卡牌编辑器的词条选项。');$('#name-zh').focus();
  };
  $('#export').onclick = () => {
    if (!draft) return;
    const link = node('a');link.download = (draft.id || 'new-keyword') + '.json';
    link.href = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], {type: 'application/json'}));link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  $('#search').oninput = renderList;
  $('#timing-filter').onchange = $('#content-filter').onchange = renderList;
  $('#save').onclick = save;
  $('#keyword-form').onsubmit = event => { event.preventDefault(); save(); };
  $('#reload').onclick = () => { if (canLeave()) reload(); };
  $('#load-history').onclick = loadHistory;
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault();event.returnValue = ''; } });
  reload();
})();
