/* Shared roster, candidate and detail presentation. */
const ACTION_LABEL = {action: '行动', 'double-action': '双行动',
  'free-action': '免费行动', 'free-exhaust': '免费行动：横置'};
const node = (tag, cls, text) => {
  const n = el(tag, text);
  if (cls) n.className = cls;
  if (typeof text === "string" && /行动|免费(?:行动|动)/.test(text)) n.replaceChildren(actionText(text));
  return n;
};
// Shared by plain labels, rule text and icon substitutions; longest label wins.
function actionText(text) {
  const out = document.createDocumentFragment();
  let pos = 0;
  for (const match of text.matchAll(/免费(?:行动|动)(?:(?:\s*[：:]\s*|并)横置)?|普通行动|双行动|行动/g)) {
    out.append(document.createTextNode(text.slice(pos, match.index)));
    const mark = document.createElement("span");
    mark.className = "action-mark";
    const type = match[0].includes('横置') ? 'free-exhaust' : match[0].startsWith('免费') ? 'free-action'
      : match[0] === '双行动' ? 'double-action' : 'action';
    mark.textContent = ACTION_LABEL[type];
    mark.dataset.action = type === 'free-action' ? 'free' : type === 'action' ? 'normal' : type;
    out.append(mark);
    pos = match.index + match[0].length;
  }
  out.append(document.createTextNode(text.slice(pos)));
  return out;
}
const named = (v) => (typeof v === "string" ? v : textParts(v?.zh).trim() ? v.zh : v?.en || "");
const textParts = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).join("\n");
const assetPath = (path) => (path ? DATA_BASE + path : "");
const cardView = {
  expanded: new Set(),
  candidateSummaries: { open: false, overrides: new Set() },
  commandExpanded: new Set(),
  commandCollapsed: new Set(),
  explanations: false,
  tags: new Set(),
  applyAll: false,
  battleText: (() => { try { return localStorage.getItem("swl-battle-text") === "true"; } catch { return false; } })(),
};
const stateCache = new Map();
let equipPreviewContext = null;
const modalStack = [];
const watchedDialogs = new WeakSet();
let browserReturn = null,
  priorContext = "",
  currentCandidates = [],
  invalidUnitIds = new Set();
const svgNS = "http://www.w3.org/2000/svg";
const imageDialog = node("dialog", "image-dialog");
imageDialog.id = "image-dialog";
const weaponDialog = node("dialog", "weapon-dialog");
weaponDialog.id = "weapon-dialog";
const unitDetail = node("dialog", "unit-detail-dialog");
unitDetail.id = "unit-detail-dialog";
const rulePop = node("section", "keyword-popover");
rulePop.id = "keyword-popover";
rulePop.setAttribute("role", "dialog");
rulePop.setAttribute("aria-label", "词条规则");
rulePop.hidden = true;
let ruleAnchor = null;
document.body.append(imageDialog, weaponDialog, unitDetail, rulePop);
function groupedUnits() {
  return BuilderModel.groups(army, data).sort((a, b) => {
    const position = (g) =>
      g.unit ? RANK_ORDER.indexOf(rankOf(g.unit, army.armyId)) : -1;
    const left = position(a),
      right = position(b);
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
  });
}
function canDuplicate(group) {
  return BuilderModel.copyable(group.instances[0], data);
}

function ruleInfo(k) {
  const item = typeof k === "string" ? { id: k } : k;
  if (item._actionUpgrade) {
    const c = item._actionUpgrade;
    return {item, label: named(c.name), ref: {name: c.name, timing: ['action'],
      summary: textParts(named(c.description))}};
  }
  const ref = item._entry || keywordRef(item.id);
  if (!ref)
    return { item, ref: null, label: String(item.label || item.raw || item.id || "") };
  let label = named(ref.name);
  if (item.value != null)
    label = label.includes("X")
      ? label.replaceAll("X", String(item.value))
      : label + " " + item.value;
  const targets = item.parameterRefs || (item.parameterRef ? [item.parameterRef] : []);
  const targetLabel = targets.map(ref => {
    if (ref.kind === 'unit') {
      const unit = data.units[ref.id];
      return unit ? [named(unit.name), named(unit.title)].filter(Boolean).join(' · ') : ref.id;
    }
    if (ref.kind === 'nameIdentity') return named(Object.values(data.units).find(u => u.nameIdentityId === ref.id)?.name) || ref.id;
    const table = {unitCategory: 'unitCategories', unitSubtype: 'unitSubtypes', unitType: 'unitTypes', rank: 'ranks'}[ref.kind];
    return named(data.defs[table]?.find(t => t.id === ref.id)?.name) || ref.id;
  }).join(' 或 ');
  if (targetLabel || item.parameter) label = label.split(/[：:]/)[0] + "：" + (targetLabel || item.parameter);
  return { item, ref, label };
}

// Resolve names against the live catalog, shared with the keyword editor preview.
function proseIconLabel(key) { return RuleIcons.label(key, data.defs); }
function proseNode(raw) {
  const box = node("span");
  const text = textParts(raw).replace(/\{@icon\.action\}\s*\{@icon\.action\}/g, '{@icon.double-action}');
  let pos = 0;
  for (const m of text.matchAll(/\{@icon\.([\w-]+)\}/g)) {
    box.append(actionText(text.slice(pos, m.index)));
    const token = node("span", "inline-token");
    const label=proseIconLabel(m[1]);
    token.append(RuleIcons.icon(m[1],label) || actionText(label));
    box.append(token);
    pos = m.index + m[0].length;
  }
  box.append(actionText(text.slice(pos)));
  return box;
}

function identity(c, { unit = false, points = c.points, command = false } = {}) {
  const head = node("div", "identity");
  if (unit) {
    const seal = node("div", "rank-seal");
    seal.append(rankIcon(rankOf(c, army.armyId)));
    head.append(seal);
  }
  const main = node("div", "identity-main");
  if (unit) {
    const rank = data.defs.ranks.find((r) => r.id === rankOf(c, army.armyId)),
      type = data.defs.unitTypes.find((r) => r.id === c.unitTypeId);
    main.append(
      node(
        "div",
        "unit-meta",
        [named(rank?.name), named(type?.name)]
          .filter(Boolean)
          .join(" / "),
      ),
    );
  }
  const h = node("h3", null, named(c.name));
  if (named(c.title)) h.append(node("span", "subtitle", named(c.title)));
  main.append(h);
  if (c.name?.zh && c.name?.en && c.name.en !== c.name.zh)
    main.append(node("p", "en-name", c.name.en));
  head.append(main);
  if (command) {
    const p = node("div", "card-pips", "◆".repeat(Math.max(0, c.pips || 0)));
    p.append(node("small", null, c.pips + " 牌点"));
    head.append(p);
  } else if (points != null) {
    const p = node("div", "item-points");
    p.append(node("b", null, points), node("small", null, "分"));
    head.append(p);
  }
  return head;
}

function heading(title) {
  return node("h4", "section-caption", title);
}
function commandBody(c, { keywords = true, collapse = null } = {}) {
  const out = node("div");
  const orders = named(c.orders);
  if (orders || collapse) {
    const band = node("div", "order-band");
    const b = node("b");
    b.append(proseNode(orders));
    band.append(node("span", null, "命令对象"), b);
    if (collapse) band.append(collapse);
    out.append(band);
  }
  const owner = ownerLabel(c);
  if (owner) {
    const line = node("div", "owner-line", "所属");
    const value = node("b");
    value.append(proseNode(owner));
    line.append(value);
    out.append(line);
  }
  const desc = textParts(named(c.description));
  if (desc) {
    const p = node("div", "effect");
    p.append(proseNode(desc));
    out.append(p);
  }
  const entries = keywords ? cardKeywords(c) : [];
  if (entries.length) out.append(ruleTags(entries));
  if (c.weapons?.length) out.append(heading("关联武器"), weaponRows(c.weapons));
  return out;
}

function selectContext(value, trigger) {
  if (!browser) browserReturn = BuilderOverlays.rememberFocus(trigger || document.activeElement);
  if (matchMedia("(max-width:760px)").matches)
    BuilderOverlays.open($("#card-browser"), browserReturn);
  hideRule(false);
  // Batch preference belongs to the open browser, not an individual slot.
  if (!browser) cardView.applyAll = false;
  browser = value;
  $("#candidate-search").value = "";
  $("#show-unavailable").checked = false;
  render();
  $("#card-grid").scrollTop = 0;
  if (matchMedia("(max-width:760px)").matches) BuilderOverlays.focus($("#browser-close"));
}

function closeBrowser() {
  hideRule(false);
  browser = null;
  render();
  BuilderOverlays.focus(browserReturn?.());
}

function filterCandidates() {
  if (browser?.mode === "commands") commandQuery = RulesCore.commandContext(army,data);
  const grid = $("#card-grid");
  grid.replaceChildren();
  grid.classList.toggle("command-grid", browser?.mode === "commands");
  const search = $("#candidate-search").value.trim().toLocaleLowerCase(),
    all = $("#show-unavailable").checked,
    sort = $("#candidate-sort").value;
  let list = currentCandidates.filter((c) => {
    const state = itemState(c);
    return (
      (all || state.ok || (c.dualSided && state.kind === "chosen")) &&
      (!search ||
        [
          named(c.name),
          c.name?.en,
          named(c.title),
          ...cardKeywords(c).map((k) => ruleInfo(k).label),
          ...(c.weapons || []).flatMap((w) => [named(w.name), w.name?.en]),
          textParts(named(c.description)),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search))
    );
  });
  // Reuse the engine's current-force membership, including parent inheritance
  // and explicit native overrides. Resolve once per candidate, never per pair.
  const mercenaries = new Set();
  if (browser?.mode === 'units' && [1,2,4,5].includes(BuilderLibrary.factionOf(army.armyId,data))) {
    for (const card of list)
      if (RulesCore.armyMembership(card,army.armyId,data.pkg,data.defs)?.tierPools?.includes('mercenary'))
        mercenaries.add(card.id);
  }
  list.sort((a, b) => Number(mercenaries.has(a.id)) - Number(mercenaries.has(b.id)) ||
    cardUsage.compare(browser?.mode, sort, a, b));
  $("#result-count").textContent =
    list.length +
    " 项" +
    (currentCandidates.some((c) => !itemState(c).ok) && !all ? " · 已隐藏不可选项" : "");
  for (const c of list) grid.append(candidate(c));
  if (!list.length)
    grid.append(
      node(
        "p",
        "empty-result",
        search ? "没有匹配的项目，请调整搜索或筛选。" : "当前槽位没有可选项目。",
      ),
    );
}

function renderBrowser() {
  BuilderModel.disposeEquipPreviewContext(equipPreviewContext);
  equipPreviewContext = null;
  const aside = $("#card-browser"),
    mobile = matchMedia("(max-width:760px)").matches;
  aside.classList.toggle("is-open", !!browser);
  aside.classList.toggle("upgrade-browser", browser?.mode === "upgrades");
  aside.classList.toggle("unit-browser", browser?.mode === "units");
  $("#candidate-explanations").closest("label").hidden = browser?.mode !== "units";
  $("#browser-backdrop").hidden = !browser || !mobile;
  document.body.classList.toggle("sheet-open", !!browser && mobile);
  if (mobile && browser) {
    aside.setAttribute("role", "dialog");
    aside.setAttribute("aria-modal", "true");
    $(".army-col").inert = true;
    $(".army-header").inert = true;
    $("#roster-info").inert = true;
    $(".masthead").inert = true;
  } else {
    aside.removeAttribute("role");
    aside.removeAttribute("aria-modal");
    $(".army-col").inert = false;
    $(".army-header").inert = false;
    $("#roster-info").inert = false;
    $(".masthead").inert = false;
  }
  if (browser && mobile) BuilderOverlays.open(aside, browserReturn);
  else BuilderOverlays.close(aside, {restoreFocus: !browser});
  if (!browser) {
    cardView.applyAll = false;
    $("#apply-all-units").checked = false;
    currentCandidates = [];
    $("#batch-apply").hidden = true;
    $("#candidate-search").disabled = true;
    $("#candidate-sort").disabled = true;
    $("#show-unavailable").disabled = true;
    $("#browser-title").textContent = "候选";
    $("#browser-context").textContent = "";
    $("#card-grid").replaceChildren(
      node("p", "empty-result", "选择军阶、升级槽或指挥卡"),
    );
    $("#browser-category").textContent = "编制对照";
    $("#result-count").textContent = "";
    return;
  }
  $("#candidate-search").disabled = false;
  $("#candidate-sort").disabled = false;
  $("#candidate-sort").value = candidateSortModes[browser.mode];
  for (const option of $("#candidate-sort").options)
    option.hidden = browser.mode === 'commands' && ['usage','recent','favorites'].includes(option.value);
  $("#show-unavailable").disabled = false;
  const key = JSON.stringify(browser);
  if (priorContext !== key) {
    $("#card-grid").scrollTop = 0;
    priorContext = key;
  }
  if (browser.mode === "units") {
    $("#browser-title").textContent =
      "选择" +
      (named(data.defs.ranks.find((r) => r.id === browser.rank)?.name) || "单位");
    $("#browser-context").textContent =
      named(data.defs.armies.find((a) => a.id === army.armyId)?.name) +
      " / " +
      (RANK_LABEL[browser.rank] || "");
    $("#browser-category").textContent = "单位资料库";
    currentCandidates = Object.values(data.units).filter(u => !data.pkg._v2 || u._v2Ranks?.includes(browser.rank))
      .map(u => data.pkg._v2 ? BattleForceRuntime.candidate(u,browser.rank) : u).filter(
      (u) =>
        u.usage !== "counterpart" &&
        !u.isCounterpart &&
        rankOf(u, army.armyId) === browser.rank && RulesCore.runtimeAvailable(u,army,data.pkg),
    );
  } else if (browser.mode === "upgrades") {
    const inst = army.units.find((i) => i.instanceId === browser.unitInstanceId),
      u = inst && RulesCore.unitFor(inst,army,data);
    if (!u || unitSlotRecords(u, inst)[browser.slotIndex]?.key !== browser.slotKey) {
      browser = null;
      renderBrowser();
      return;
    }
    const group = groupedUnits().find((g) =>
      g.instances.some((i) => i.instanceId === inst.instanceId),
    );
    browser.groupIds = group.instances.map((i) => i.instanceId);
    $("#browser-title").textContent = "选择" + slotName(browser.slotKey);
    $("#browser-category").textContent = "升级资料库";
    currentCandidates = Object.values(data.upgrades).map((c) => displayUpgrade(UpgradeFaces.view(c, 'front'), inst)).filter((c) =>
      accessOf(c).includes(browser.slotKey) && RulesCore.runtimeAvailable(c,army,data.pkg),
    );
  } else {
    const p = commandSlotPips()[browser.slotIndex] ?? slotPipOf(commandOf(army.commandIds[browser.slotIndex]));
    $("#browser-title").textContent = "选择战术卡";
    $("#browser-context").textContent =
      p + " 牌点 / 第 " + (browser.slotIndex + 1) + " 个战术卡槽位";
    $("#browser-category").textContent = "战术资料库";
    currentCandidates = data.defs.commands.filter((c) => !c.hidden && slotPipOf(c) === p);
  }
  stateCache.clear();
  updateBatchControl();
  if (browser.mode === 'upgrades') equipPreviewContext = BuilderModel.createEquipPreviewContext(army, data);
  filterCandidates();
}

function renderRankBar(report) {
  const bar = $("#rank-bar"), addBar = $("#rank-add-bar");
  bar.replaceChildren();
  addBar.replaceChildren();
  const rules = BuilderLibrary.configuration(army, data).rules;
  for (const rank of RANK_ORDER) {
    const count = army.units.filter(
      (i) => RulesCore.unitFor(i,army,data) && rankOf(RulesCore.unitFor(i,army,data), army.armyId) === rank,
    ).length;
    const quota = (rules.rankQuotas || []).find((q) => q.rankId === rank);
    const b = node("button", "rank-shortcut");
    b.type = "button";
    b.dataset.count = count;
    const rankIssues = report.issues.filter((i) => i.status === "invalid" &&
      (Number(i.rank) === rank || (i.ranks || []).map(Number).includes(rank)));
    if (rankIssues.length)
      b.classList.add("invalid");
    b.dataset.rank = rank;
    b.classList.toggle("empty", count === 0);
    const limits = quota ? (quota.min ?? 0) + "–" + (quota.max ?? "不限") : "未设配额";
    const glyph = rankIcon(rank);
    glyph.setAttribute("aria-hidden", "true");
    b.append(glyph, node("span", "rank-badge", count || "—"));
    b.title = RANK_SHORT[rank] + "：" + count + " 个；允许数量 " + limits;
    if (rankIssues.length) b.title += "\n" + rankIssues.map(i => i.message).join("\n");
    b.onclick = () => BuilderSticky.selectRank(rank, b);
    bar.append(b);

    const add = node("button", "rank-chip");
    add.type = "button";
    add.dataset.rank = rank;
    add.classList.toggle("invalid", rankIssues.length > 0);
    add.classList.toggle("empty", count === 0);
    const active = browser?.mode === "units" && browser.rank === rank;
    add.classList.toggle("active", active);
    add.setAttribute("aria-pressed", String(active));
    add.setAttribute("aria-label", "添加" + RANK_SHORT[rank] + "单位");
    add.title = b.title;
    const total = node("span", "rank-count");
    total.append(node("strong", "rank-total", count || "—"),
      node("span", "rank-quota", "（/" + (quota?.max ?? "∞") + "）"));
    add.append(rankIcon(rank),
      node("span", "rank-name", RANK_SHORT[rank]), total, node("span", "rank-add", "+"));
    add.onclick = () => selectContext({mode: "units", rank}, add);
    addBar.append(add);
  }
  window.BuilderSticky?.refreshNavigation();
  const combined = (rules.combined || []).map(
    (c) =>
      (c.tiers || []).map((r) => RANK_SHORT[r] || r).join(" + ") + " 合计 ≤ " + c.maximum,
  );
  $("#composition-rules").textContent = combined.length
    ? "组合限制：" + combined.join("；")
    : "";
}
function renderDeck() {
  const deck = $("#deck-panel");
  deck.replaceChildren();
  const head = node("div", "column-head deck-heading");
  head.append(
    node("h2", null, "指挥卡"),
    node(
      "span",
      "count",
      army.commandIds.filter(id => commandOf(id)).length + " / " + commandSlots(),
    ),
  );
  deck.append(head);
  const list = node("div", "deck-list");
  const slots = commandSlotPips();
  Array.from({length: Math.max(slots.length, army.commandIds.length)}, (_, i) => i).forEach(index => {
    const p = slots[index], overflow = index >= slots.length;
    const c = commandOf(army.commandIds[index]);
    if (c && String(c.id) === "8" && !overflow && p === 4) {
      const standing = node("button", "standing-order-tag", named(c.name));
      standing.title = c.name.en;
      standing.setAttribute("aria-label", "查看" + named(c.name) + "原图");
      standing.onclick = () => showImage(c, standing);
      head.insertBefore(standing, head.lastChild);
      return;
    }
    if (c) {
      const valid = !overflow && commandAvailable(c) && slotPipOf(c) === p;
      list.append(
        commandCard(c, {
          slotIndex: index,
          state: {
            kind: valid ? "chosen" : "blocked",
            reason: valid ? "" : overflow ? "超出手牌数量" : "当前军表不满足此卡条件",
          },
        }),
      );
    } else if (army.commandIds[index] != null) {
      const missing = node('div', 'empty-command missing-command');
      missing.append(node('span', null, '找不到指挥卡：' + army.commandIds[index]));
      const remove = node('button', 'card-remove');
      remove.setAttribute('aria-label', '删除未知指挥卡 ' + army.commandIds[index]);
      remove.append(uiIcon('trash', '删除'));
      remove.onclick = () => {army.commandIds[index] = null; render();};
      missing.append(remove);list.append(missing);
    } else if (!overflow) {
      const b = node("button", "empty-command");
      b.append(
        node("span", "pip", "◆".repeat(p)),
        node("span", null, p + " 牌点指挥卡"),
        node("span", "slot-plus", "＋"),
      );
      b.onclick = () => selectContext({ mode: "commands", slotIndex: index }, b);
      list.append(b);
    }
  });
  deck.append(list);
  const missions = node("div", "mission-sections");
  const missionTools = node("div", "mission-tools");
  missionTools.append(node("h2", null, "任务与优势"), battleTextToggle());
  missions.append(missionTools);
  missions.classList.toggle("text-mode", cardView.battleText);
  const selections = BuilderLibrary.normalizeDeck(army.deck);
  for (const [kind, label] of [["primary", "主要任务"], ["secondary", "次要任务"], ["advantage", "优势"]]) {
    const selected = selections[kind];
    const section = node("section", "mission-section");
    section.dataset.kind = kind;
    const heading = node("div", "mission-heading");
    heading.append(node("h3", null, label), node("span", null, selected.length + " / 3"));
    const slots = node("div", "mission-slots");
    for (let index = 0; index < Math.max(3, selected.length); index++) {
      const card = deckCatalog(kind).find((x) => String(x.id) === selected[index]);
      const slot = node("div", "mission-slot" + (selected[index] ? " filled" : " empty"));
      const unavailable = card && ((card.modes?.length && !card.modes.includes(army.mode)) ||
        (card.armyIds?.length && !card.armyIds.includes(Number(army.armyId))));
      slot.classList.toggle("unavailable", !!unavailable);
      slot.dataset.index = index;
      const choose = node("button", "mission-card");
      choose.setAttribute("aria-label", `${selected[index] ? "替换" : "选择"}${label}第 ${index + 1} 张`);
      if (card) choose.append(battleCardArt(card), node("span", "battle-card-caption", named(card.name)));
      else choose.append(node("span", "mission-placeholder", selected[index] ? "卡牌资料不可用" : "＋"),
        node("span", "battle-card-caption", selected[index] || `选择第 ${index + 1} 张`));
      if (unavailable) choose.append(node("small", "mission-unavailable", "不适用当前配置 · 点击更换"));
      choose.disabled = index >= 3 || index > selected.length;
      choose.onclick = () => openDeckSlot(kind, label, index, choose);
      slot.append(choose);
      if (selected[index]) {
        const actions = node("div", "mission-card-actions");
        if (card?.image) {
          const preview = node("button", null, "查看");
          preview.setAttribute("aria-label", "查看" + named(card.name) + "大图");
          preview.onclick = () => showImage(card, preview);
          actions.append(preview);
        }
        const remove = node("button", "card-remove");
        remove.append(uiIcon("trash", "删除"));
        remove.setAttribute("aria-label", `移除${label}第 ${index + 1} 张`);
        remove.onclick = (e) => {
          e.stopPropagation();
          army.deck = BuilderLibrary.setDeckCard(army.deck, kind, index, null);
          render();
        };
        slot.append(remove);
        slot.append(actions);
      }
      slots.append(slot);
    }
    section.append(heading, slots);
    missions.append(section);
  }
  deck.append(missions);
}

function upgradeDisplayPoints(card, instance = null) {
  if (!card) return 0;
  instance ||= army.units.find(i => i.instanceId === card._unitId);
  return RulesCore.upgradePoints(card, data.units[instance?.unitId], army, data);
}

function renderArmyOptions() {
  const box = $('#army-options'), bf = data.pkg.battleForces?.[army.armyId];
  if (data.pkg._v2) {
    box.hidden=false;box.replaceChildren();
    const scheme=bf.v2.selectionSchemes.find(s=>s.id===army.battleForceSelection?.schemeId) || bf.v2.selectionSchemes[0];
    if(!scheme){box.hidden=true;return;}
    for(const group of scheme.groups) {
      const section=node('div','v2-trait-group');section.dataset.selectionGroup=group.id;
      section.append(node('span','v2-trait-label',named(group.name)));
      const tags=node('div','army-option-tags');
      for(const id of group.ruleGroupIds) {
        const rule=bf.v2.ruleGroups.find(g=>g.id===id),selected=army.battleForceSelection?.groups[group.id]?.includes(id);
        const button=node('button','army-option-tag',named(rule.name));button.type='button';
        button.dataset.optionId=id;button.setAttribute('aria-pressed',String(!!selected));
        button.title=(rule.textRulesZh || []).join('\n');
        button.onclick=()=>{
          try {
            const draft=BattleForceV2.choose(army,bf,scheme.id,group.id,selected?[]:[id]);
            const result=BattleForceRuntime.reconfigure(army,draft,data);army=result.draft;browser=null;
            setStatus(result.removed.length?'已移除失效槽位中的升级：'+result.removed.join('、'):'');render();
          }catch(error){setStatus(error.message,true);}
        };
        const choice=node('span','army-option-choice'),info=node('button','army-option-info','ⓘ');
        info.type='button';info.setAttribute('aria-label','查看'+named(rule.name)+'规则');
        info.setAttribute('aria-haspopup','dialog');info.dataset.ruleGroupId=id;
        info.onclick=e=>{e.stopPropagation();showBattleForceRuleGroup(rule,info);};
        choice.append(button,info);tags.append(choice);
      }
      section.append(tags);box.append(section);
    }
    return;
  }
  const options = bf?.options || [];
  box.hidden = !bf?.optionCount || !options.length;
  box.replaceChildren();
  if (box.hidden) return;
  const count = options.filter(o => army.options.includes(o.id)).length;
  const tags = node('div','army-option-tags');
  for (const option of options) {
    const selected = army.options.includes(option.id), b = node('button','army-option-tag',option.nameZh || option.name);
    b.type = 'button'; b.dataset.optionId = option.id; b.setAttribute('aria-pressed',String(selected));
    b.title = option.text || '';
    b.onclick = () => {
      if (!selected && count >= bf.optionCount) {setStatus('最多选择两条规则；请先取消其中一条。',true); return;}
      if (selected) army.options = army.options.filter(id => id !== option.id); else army.options.push(option.id);
      const before = new Map(army.units.map(inst => [inst.instanceId,unitSlotRecords(RulesCore.unitFor(inst,army,data),inst)]));
      const removed = RulesCore.cleanupArmy(army,data);
      for (const inst of army.units) BuilderModel.rebindSlots(inst,before.get(inst.instanceId),unitSlotRecords(RulesCore.unitFor(inst,army,data),inst),data,{allowOrphans:true});
      setStatus((selected ? '已取消：' : '已启用：') + (option.nameZh || option.name) + (removed.length ? '；已移除 '+removed.join('、') : ''));
      render();
    };
    tags.append(b);
  }
  box.append(tags);
}

let battleForceDialog;
function battleForceRulesDialog(title) {
  if (!battleForceDialog) {battleForceDialog = node('dialog','battleforce-dialog');battleForceDialog.setAttribute('aria-label','战斗部队规则');document.body.append(battleForceDialog);}
  const dialog = battleForceDialog;
  dialog.replaceChildren();
  const head = node('div','dialog-head'), close = node('button',null,'×');close.type='button';close.setAttribute('aria-label','关闭战斗部队规则');close.onclick=()=>dialog.close();
  head.append(node('h2',null,title),close);dialog.append(head);
  return dialog;
}

function appendBattleForceScopeRules(dialog,scope,withEntries=false) {
  const texts=scope?.textRulesZh?.length ? scope.textRulesZh : scope?.textRules || [];
  for (const text of texts) {const p=node('p');p.append(proseNode(text));dialog.append(p);}
  const normalize=text=>text.replace(/\s+/g,'');
  const printed=normalize(texts.join('\n'));
  for (const entry of texts.length && !withEntries ? [] : scope?.entries || []) {
    const text=entry.summary || entry.full;
    if (!text || printed.includes(normalize(text))) continue;
    const section=node('section','battleforce-entry');
    section.append(node('h4',null,named(entry.name)),timingMarkers(entry.timing));
    const p=node('p');p.append(proseNode(text));section.append(p);dialog.append(section);
  }
}

function showBattleForceRuleGroup(rule,opener) {
  const dialog=battleForceRulesDialog(named(rule.name));
  if (rule.name?.en) dialog.append(node('p','muted',rule.name.en));
  appendBattleForceScopeRules(dialog,rule);
  showDialog(dialog,opener);
}

function showBattleForceRules() {
  const bf = data.pkg.battleForces?.[army.armyId], config = BuilderLibrary.configuration(army,data).rules;
  const dialog=battleForceRulesDialog(bf?.nameZh || named(data.defs.armies.find(a => a.id === army.armyId)?.name));
  dialog.append(node('p','muted',army.pointsLimit+' 分 · '+(army.mode === 'recon' ? '侦察' : '标准')));
  const rankLabel = id => {
    const label = node('span','force-rank'), icon = rankIcon(id);
    icon.setAttribute('aria-hidden','true');label.append(icon,node('span',null,RANK_SHORT[id]));return label;
  };
  const table = node('table','battleforce-quotas'), heading = node('tr'), thead = node('thead'), tbody = node('tbody');
  for (const text of ['军阶','最低数量','最高数量']) {const th=node('th',null,text);th.scope='col';heading.append(th);}
  thead.append(heading);table.append(thead,tbody);
  for (const id of RANK_ORDER) {
    const quota = config.rankQuotas?.find(q => q.rankId === id);if (!quota) continue;
    const row=node('tr'), label=node('th','force-rank-cell');label.scope='row';label.append(rankLabel(id));row.append(label);
    for (const text of [quota.min ?? 0,quota.max ?? '—']) row.append(node('td',null,text));tbody.append(row);
  }
  dialog.append(table);
  for (const c of config.combined || []) {
    const cap=node('p','force-cap force-combined');
    (c.tiers || []).forEach((id,index)=>{if(index)cap.append(node('span',null,'+'));cap.append(rankLabel(id));});
    cap.append(node('span',null,'合计最多 '+c.maximum+' 个'));dialog.append(cap);
  }
  const caps = Object.values(data.units).filter(u => !u.runtimeVariant && rankOf(u,army.armyId)!=null)
    .map(u => ({u,cap:RulesCore.unitCapFor(u,data.pkg,army.armyId)})).filter(x => x.cap!=null);
  if (caps.length || bf?.unitLimitsText?.length) {
    dialog.append(node('h3',null,'单位数量限制'));
    for(const text of bf?.unitLimitsText || []) dialog.append(node('p','force-cap',text));
    if (!bf?.unitLimitsText?.length) for(const {u,cap} of caps) dialog.append(node('p','force-cap',named(u.name)+'：最多 '+cap+' 个'));
  }
  dialog.append(node('h3',null,'特殊规则'));
  const paragraph = text => {const p=node('p');p.append(proseNode(text));return p;};
  const common = bf?.engineVersion === 2 ? bf.v2.common : bf;
  appendBattleForceScopeRules(dialog,common || {textRulesZh:['使用当前势力的基础组军规则。']},true);
  if (bf?.engineVersion === 2) {
    for (const group of bf.v2.ruleGroups) {
      dialog.append(node('h4',null,named(group.name)));
      appendBattleForceScopeRules(dialog,group);
    }
  } else for (const o of bf?.options || []) if (o.text) {dialog.append(node('h4',null,o.nameZh || o.name),paragraph(o.text));}
  showDialog(dialog,$('#battleforce-info'));
}

function renderPoints(report) {
  const lim = army.pointsLimit || 1000;
  $("#points").replaceChildren(
    node("b", null, report.effectivePoints),
    node("span", "limit", "/ " + lim),
  );
  $("#points-fill").style.width = Math.min(100, (report.effectivePoints / lim) * 100) + "%";
  const progress = $('#roster-info .points-track');
  progress.setAttribute('aria-valuemax', String(lim));
  progress.setAttribute('aria-valuenow', String(Math.min(lim, report.effectivePoints)));
  progress.setAttribute('aria-valuetext', report.effectivePoints + ' / ' + lim + ' 分');
  $('#roster-info').classList.toggle('over-limit', report.effectivePoints > lim);
  $("#summary-activations").textContent = army.units.length;
  $("#summary-commands").replaceChildren(
    document.createTextNode(army.commandIds.filter(id => commandOf(id)).length),
    node("span", null, " / " + commandSlots()),
  );
}

function uiIcon(kind, label) {
  const glyphs = { surge: "a", "surge-block": "d", hit: "h", critical: "c", block: "s" };
  if (glyphs[kind]) {
    const icon = node("span", "ui-symbol legion-symbol", glyphs[kind]);
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", label || kind);
    return icon;
  }
  const svg = document.createElementNS(svgNS, "svg");
  svg.classList.add("ui-symbol");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label || kind);
  const shapes = {
    models:
      "M4 19v-6a4 4 0 0 1 8 0v6M7 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 12a4 4 0 0 1 4 4v3",
    wounds: "M12 20 3.7 11.7A5.2 5.2 0 0 1 12 5.5a5.2 5.2 0 0 1 8.3 6.2Z",
    courage: "m12 2 8 3v6c0 5-8 10-8 10S4 16 4 11V5Zm0 5v7m-3-3 3-4 3 4",
    speed: "m3 6 6 6-6 6m7-12 6 6-6 6m7-12 5 6-5 6",
    resilience: "m12 2 9 10-9 10-9-10Zm-5 10h10",
    trash: "M4 6h16M9 3h6l1 3M6 6l1 15h10l1-15M10 10v7m4-7v7",
    exhaust: "M5 7h14v12H5Zm3-4h11l3 3",
    expend: "M5 3h14v18H5Zm3 5 8 8m0-8-8 8",
  };
  if (shapes[kind]) {
    svg.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS(svgNS, "path");
    p.setAttribute("d", shapes[kind]);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.7");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.append(p);
  } else if (kind === "red-defense" || kind === "white-defense") {
    svg.setAttribute("viewBox", "0 0 24 24");
    const p = document.createElementNS(svgNS, "rect");
    p.setAttribute("x", "3");
    p.setAttribute("y", "3");
    p.setAttribute("width", "18");
    p.setAttribute("height", "18");
    p.setAttribute("rx", "2");
    p.setAttribute("fill", kind === "red-defense" ? "#b04448" : "white");
    p.setAttribute("stroke", kind === "red-defense" ? "#91373b" : "#74838c");
    svg.append(p);
    const dot = document.createElementNS(svgNS, "path");
    dot.setAttribute("d", "M8 8h8v6l-4 3-4-3Z");
    dot.setAttribute("fill", kind === "red-defense" ? "white" : "#344550");
    svg.append(dot);
  } else {
    svg.setAttribute("viewBox", "0 0 24 24");
  }
  return svg;
}

function statMatrix(u, { showModels = false, compactDefense = false } = {}) {
  const bar = node("dl", "attribute-band");
  const s = u.stats || {};
  const fields = [
    ...(showModels ? [["人数", "models", s.models]] : []),
    ["生命", "wounds", s.wounds ?? s.woundsSymbol],
    ...(!compactDefense ? [["防御", "defense", s.defenseDie]] : []),
    s.resilience != null || s.resilienceSymbol
      ? ["韧性", "resilience", s.resilience ?? s.resilienceSymbol]
      : ["勇气", "courage", s.courage ?? s.courageSymbol],
    ["速度", "speed", s.speed],
    ["攻转", "attack", s.attackSurge],
    ["防转", "defenseSurge", s.defenseSurge ?? (compactDefense && s.defenseDie ? "none" : null)],
  ];
  for (const [label, key, value] of fields) {
    if (value == null) continue;
    const cell = node("div", "attribute"),
      dd = node("dd");
    cell.title = label;
    cell.setAttribute("aria-label", label + "：" + value);
    if (compactDefense && key === "attack") cell.dataset.attack = value;
    if (compactDefense && key === "defenseSurge" && s.defenseDie) {
      cell.dataset.defense = s.defenseDie;
      cell.title = (s.defenseDie === "red" ? "红色防御骰" : "白色防御骰") +
        (value === "none" ? " · 无防御转换" : " · 激增转格挡");
      cell.setAttribute("aria-label", cell.title);
    }
    cell.append(node("dt", null, label));
    if (key === "defense")
      dd.append(
        uiIcon(value + "-defense", value === "red" ? "红色防御骰" : "白色防御骰"),
      );
    else if (key === "attack" || key === "defenseSurge") {
      dd.append(
        uiIcon(
          key === "attack" ? "surge" : "surge-block",
          key === "attack" ? "攻击激增" : "防御激增",
        ),
      );
      dd.append(node("span", "surge-arrow", "›"));
      if (value === "none") dd.append(node("span", "no-conversion", "—"));
      else
        dd.append(uiIcon(value, { hit: "命中", critical: "暴击", block: "格挡" }[value]));
    } else {
      dd.append(
        uiIcon(key, label + (key === "wounds" ? "（每模型）" : "")),
        node("b", null, value === "dash" ? "—" : value === "x" ? "X" : value),
      );
    }
    cell.append(dd);
    bar.append(cell);
  }
  return bar;
}

function perUnitPoints(inst) {
  return (
    (RulesCore.unitFor(inst,army,data)?.points || 0) +
    inst.upgrades.reduce((s, ch) => s + upgradeDisplayPoints(data.upgrades[ch.upgradeId],inst), 0)
  );
}

function displayUpgrade(c, inst = null, choice = null) {
  if (choice && c) {
    c = {...UpgradeFaces.view(c, choice.face), _unitId: inst.instanceId, _choiceId: choice.instanceId};
  }
  const host = data.units[inst?.unitId || army?.units.find((i) => i.instanceId === browser?.unitInstanceId)?.unitId];
  if (data.pkg._v2) c = BattleForceRuntime.upgradeFor(c, inst ? RulesCore.unitFor(inst,army,data) : host, data);
  return BuilderModel.upgradePresentation(c, data, host);
}

function faceLabel(c) { return {front: '正面', back: '反面', both: '双面'}[c._face || 'front']; }
function originLabel(c) { return named(c.name) + (UpgradeFaces.isDual(c) ? ' · ' + faceLabel(c) : ''); }
function printedUpgrades(c) { return UpgradeFaces.visible(c).map(side => displayUpgrade(side)); }
function liveUpgrade(c) {
  if (!c._choiceId) return c;
  const inst = army.units.find(i => i.instanceId === c._unitId);
  const choice = inst?.upgrades.find(ch => ch.instanceId === c._choiceId);
  return choice ? displayUpgrade(data.upgrades[choice.upgradeId], inst, choice) : c;
}
function switchUpgradeFace(c, face, anchor = null) {
  if (!UpgradeFaces.isDual(c)) return c;
  if (!c._choiceId) return UpgradeFaces.view(c, face);
  const inst = army.units.find(i => i.instanceId === c._unitId);
  const choice = inst?.upgrades.find(ch => ch.instanceId === c._choiceId);
  if (!choice) return c;
  face = UpgradeFaces.mode(face);
  if ((choice.face || 'front') === face) return liveUpgrade(c);
  const oldTop = anchor?.getBoundingClientRect().top;
  const sourceDialog = anchor?.closest('dialog');
  const context = anchor?.closest('.compact-slot') ? '.compact-slot' : '.selected-upgrades';
  const scrollHost = sourceDialog || (() => {
    for (let p = anchor?.parentElement; p; p = p.parentElement)
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
    return document.scrollingElement;
  })();
  const oldScroll = scrollHost.scrollTop;
  choice.face = face;
  hideRule(false);
  // A face changes presentation only. Keep unrelated units, selectors and deck DOM intact.
  renderUnits({changedInstanceId: inst.instanceId});
  if (unitDetail.open) {
    const group = groupedUnits().find(g => g.instances.some(i => i.instanceId === c._unitId));
    const current = unitDetail.querySelector('.roster-unit');
    if (group && current) {
      if (current.dataset.instances === JSON.stringify(group.instances.map(i => i.instanceId)))
        refreshUnitFaces(current, group, true);
      else current.replaceWith(rosterCard(group, {detail: true}));
    }
  }
  save();
  const root = sourceDialog || $('#army-units');
  const target = [...root.querySelectorAll(context + ' .face-control')]
    .find(el => el.dataset.choiceId === c._choiceId)?.querySelector(`[data-face="${face}"]`);
  if (target && oldTop != null) {
    scrollHost.scrollTop = oldScroll;
    scrollHost.scrollTop += target.getBoundingClientRect().top - oldTop;
    target.focus({preventScroll: true});
  }
  return liveUpgrade(c);
}
function faceControl(c, {tabs = false, onChange = null} = {}) {
  const wrap = node("span", tabs ? "face-tabs" : "face-control");
  if (!UpgradeFaces.isDual(c)) return wrap;
  wrap.setAttribute('role', 'group');
  wrap.setAttribute("aria-label", "双面升级卡显示状态");
  if (c._choiceId) wrap.dataset.choiceId = c._choiceId;
  const change = (face, anchor) => {
    const next = switchUpgradeFace(c, face, anchor);
    if (onChange) onChange(next);
  };
  if (tabs) wrap.append(node("strong", "face-indicator", "双面卡 · 当前" + faceLabel(c)));
  for (const face of ['front', 'back', 'both']) {
    const label = faceLabel({_face: face});
    const b = node("button", tabs ? 'face-tab' : 'flip-upgrade', label);
    b.type = "button";
    b.dataset.face = face;
    b.title = face === 'both' ? '同时查看正反面，仍占一个槽位' : '显示' + label;
    b.setAttribute('aria-pressed', String((c._face || 'front') === face));
    b.onclick = e => { e.stopPropagation(); change(face, b); };
    wrap.append(b);
  }
  return wrap;
}

// Local preview uses no-store responses. Retain these small face images
// for this page session instead of fetching them again on every face change.
const faceImageCache = new Map();
function cachedFaceImage(path) {
  const src = assetPath(path);
  if (!faceImageCache.has(src)) faceImageCache.set(src, fetch(src).then(r => {
    if (!r.ok) throw Error('卡图载入失败');
    return r.blob();
  }).then(blob => URL.createObjectURL(blob)).catch(() => {faceImageCache.delete(src); return src;}));
  return faceImageCache.get(src);
}
function setCardImage(image, path, card, {preview = false} = {}) {
  if (!path) return;
  image.dataset.source = assetPath(path);
  if (!UpgradeFaces.isDual(card)) {image.src = assetPath(path); return;}
  for (const side of UpgradeFaces.variants(card)) {
    const other = preview ? side.assets?.thumbnail : side.assets?.front;
    if (other) cachedFaceImage(other);
  }
  cachedFaceImage(path).then(src => {image.src = src;});
}

function battleCardArt(card, {full = false} = {}) {
  const frame = node("span", "battle-card-art");
  const src = full ? card.image : card.thumbnail || card.image;
  function artImage(alt) {
    const im = node('img');im.src = assetPath(src);im.alt = alt;im.loading = 'lazy';
    im.onerror = () => {im.onerror = null;if (src !== card.image) im.src = assetPath(card.image);};
    return im;
  }
  const rules = textParts(named(card.rules)).trim();
  if (!rules) {
    if (card.image) {
      const im = artImage(named(card.name) + "卡图");
      frame.append(im);
    } else frame.append(node("span", "missing-card-art", named(card.name) + " · 暂无卡图或规则文本"));
    return frame;
  }
  const kind = card.image?.includes("/primary/") ? "primary" : card.image?.includes("/advantage/") ? "advantage" : "secondary";
  frame.dataset.kind = kind;
  const face = node("span", "battle-card-face");
  const title = node("span", "battle-face-title");
  title.append(node("strong", null, named(card.name)), node("small", null, card.name?.en));
  face.append(title);
  if (kind === "advantage" && card.image) {
    // Keep the printed illustration; its lower edge differs by card layout.
    const shortArt = {"Ordnance": 60, "Strafing Run": 56, "Scrambled Orders": 84,
      "No Time to Lose": 84, "Black Ops": 84, "Extreme Discipline": 84,
      "Coordinated Strike": 84, "Command Override": 84};
    const art = node("span", "battle-illustration");
    art.style.setProperty("--art-height", (shortArt[card.name.en] || 107) - 11 + "cqw");
    const im = artImage(named(card.name) + "卡图");
    art.append(im);face.append(art);
  }
  const paper = node("span", "battle-card-paper");
  for (const line of rules.split(/\n+/)) {
    const p = node("span", "battle-rule-line");
    const match = line.match(/^(部署|计分|特殊规则|计分格|任意领地|友方领地|争夺领地|敌方领地|敌方单位恐慌|所有敌方单位受压制)：(.*)$/);
    if (match) p.append(node("b", null, match[1] + "："), proseNode(match[2]));
    else p.append(proseNode(line));
    paper.append(p);
  }
  face.append(paper);
  if (kind === "primary" && card.image) {
    const map = node("span", "battle-card-map");
    const im = artImage(named(card.name) + "部署地图");
    map.append(im);face.append(map);
  }
  frame.append(face);
  return frame;
}

function battleTextToggle() {
  const label = node("label", "battle-text-toggle");
  const input = node("input");input.type = "checkbox";input.checked = cardView.battleText;
  input.onchange = () => {
    cardView.battleText = input.checked;
    try { localStorage.setItem("swl-battle-text", String(input.checked)); } catch {}
    document.querySelectorAll(".mission-sections,.deck-picker-dialog").forEach(n => n.classList.toggle("text-mode", input.checked));
    document.querySelectorAll(".battle-text-toggle input").forEach(n => n.checked = input.checked);
  };
  label.append(input, document.createTextNode("文字版"));
  return label;
}

function artButton(c, cls = "unit-art") {
  c = displayUpgrade(c);
  const b = node("button", cls);
  b.classList.toggle("has-portrait", !!c.assets?.portrait);
  b.setAttribute("aria-label", "查看" + named(c.name) + "完整卡图");
  b.title = "查看完整卡图";
  const slotCrop = cls.split(' ').includes('slot-art');
  const topHalf = cls.split(' ').includes('candidate-art');
  const full = c.assets?.front || c.image;
  const preview = c.assets?.thumbnail || c.thumbnail || full;
  const src = slotCrop || topHalf ? preview || c.assets?.portrait : c.assets?.portrait || preview;
  if (!src) {
    b.append(node("span", null, "暂无卡图"));
    b.disabled = true;
    return b;
  }
  const im = node("img");
  im.alt = named(c.name) + "卡图";
  im.loading = "lazy";
  if (slotCrop) {
    // Fit a square inside the top 40% of the full art, centred horizontally.
    // Percent dimensions avoid canvas work and preserve lazy loading.
    im.onload = () => {
      const size = Math.min(im.naturalWidth, im.naturalHeight * .4);
      im.style.width = im.naturalWidth / size * 100 + '%';
      im.style.height = im.naturalHeight / size * 100 + '%';
      im.style.left = -(im.naturalWidth - size) / 2 / size * 100 + '%';
    };
  } else if (topHalf) {
    // Match the window to half this face's actual height, without stretching
    // landscape cards or using a counterpart's already-cropped unit portrait.
    im.onload = () => b.style.setProperty('--upgrade-preview-ratio', `${im.naturalWidth} / ${im.naturalHeight / 2}`);
  }
  im.onerror = () => {
    if (full && im.dataset.source !== assetPath(full)) {
      setCardImage(im, full, c, {preview: true});
      return;
    }
    im.remove();
    b.append(node("span", null, "卡图暂不可用"));
  };
  setCardImage(im, src, c, {preview: true});
  b.append(im);
  b.onclick = (e) => {
    e.stopPropagation();
    showImage(c, b);
  };
  return b;
}

function showImage(c, opener) {
  c = liveUpgrade(displayUpgrade(c));
  if (UpgradeFaces.isDual(c)) return showDualImage(c, opener);
  delete imageDialog.dataset.cardKey;
  imageDialog.replaceChildren();
  const h = node("div", "dialog-head");
  h.append(node("h2", null, named(c.name)));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭卡图");
  close.onclick = () => imageDialog.close();
  h.append(close);
  const battle = c.image?.startsWith("assets/battle-deck/");
  const im = battle ? battleCardArt(c, {full: true}) : node("img", "full-card-image");
  if (!battle) {
    im.src = assetPath(c.assets?.front || c.image);
    im.alt = named(c.name) + "完整卡图";
  }
  imageDialog.append(h);
  if (UpgradeFaces.isDual(c)) imageDialog.append(faceControl(c, {tabs: true, onChange: next => showImage(next)}));
  imageDialog.append(im);
  const effect = upgradeEffect(c);
  const rules = textParts(named(c.rules));
  if (!battle && (effect.childNodes.length || rules)) {
    const section = node("section", "image-card-effect");
    section.append(node("h3", null, "卡牌效果"));
    if (effect.childNodes.length) section.append(effect);
    else section.append(proseNode(rules));
    imageDialog.append(section);
  }
  if (cardKeywords(c).length) imageDialog.append(ruleTags(cardKeywords(c).map((k) =>
    ({ ...(typeof k === "string" ? { id: k } : k), origins: c.counterpart ? [c] : [] }))));
  if (c.weapons?.length) imageDialog.append(weaponRows(c.weapons));
  showDialog(imageDialog, opener);
}

function showDualImage(c, opener) {
  const key = [c.id, c._unitId, c._choiceId].join(':');
  const scroll = imageDialog.scrollTop;
  const restoreTabFocus = imageDialog.contains(document.activeElement) && document.activeElement.matches('.face-tab');
  if (imageDialog.dataset.cardKey !== key) {
    imageDialog.replaceChildren();
    imageDialog.dataset.cardKey = key;
    const h = node('div', 'dialog-head');
    h.append(node('h2'));
    const close = node('button', null, '×');
    close.setAttribute('aria-label', '关闭卡图');close.onclick = () => imageDialog.close();
    h.append(close);imageDialog.append(h, node('span', 'face-tabs'));
    for (const side of UpgradeFaces.variants(c)) {
      const section = node('section', 'image-face');section.dataset.face = side._face;
      section.append(node('h3', 'image-face-title', faceLabel(side) + ' · ' + named(side.name)));
      const im = node('img', 'full-card-image');
      im.alt = faceLabel(side) + ' · ' + named(side.name) + '完整卡图';
      setCardImage(im, side.assets?.front, side);section.append(im);
      const effect = upgradeEffect(side);
      if (effect.childNodes.length) {
        const details = node('section', 'image-card-effect');
        details.append(node('h3', null, '卡牌效果'), effect);
        section.append(details);
      }
      if (cardKeywords(side).length) section.append(ruleTags(cardKeywords(side)));
      if (side.weapons?.length) section.append(weaponRows(side.weapons));
      imageDialog.append(section);
    }
  }
  imageDialog.querySelector('h2').textContent = named(c.name);
  imageDialog.querySelector('.face-tabs').replaceWith(faceControl(c, {tabs: true, onChange: showDualImage}));
  for (const section of imageDialog.querySelectorAll('.image-face'))
    section.hidden = c._face !== 'both' && section.dataset.face !== c._face;
  showDialog(imageDialog, opener);
  imageDialog.scrollTop = scroll;
  if (restoreTabFocus) imageDialog.querySelector(`.face-tab[data-face="${c._face}"]`)?.focus({preventScroll: true});
}

function upgradeEffect(c) {
  const effect = node("div", "upgrade-effect");
  const description = textParts(named(c.description));
  if (description) effect.append(proseNode(description));
  if (c.counterpart) {
    const heading = node("p", "counterpart-heading", "伙伴单位 · " + named(c.counterpart.name));
    const stats = c.counterpart.stats;
    if (stats?.wounds != null) heading.append(node("span", null, "生命 " + stats.wounds));
    effect.append(heading);
    for (const k of uniqueRules(cardKeywords(c.counterpart))) {
      const { ref, label } = ruleInfo(k);
      const text = ref?.summary || ref?.full;
      if (!text) continue;
      const row = node("p", "counterpart-effect-rule");
      row.append(node("strong", null, label + "："), proseNode(text));
      effect.append(row);
    }
  }
  return effect;
}

function usageBadges(c) {
  const wrap = node("span", "usage-flags");
  const raw = textParts(c.description?.en),
    zh = textParts(c.description?.zh);
  const one =
    /\{@icon\.expend\}\s*this\s*card/i.test(raw) ||
    (!raw && /\{@icon\.expend\}\s*(?:此卡|这张卡)/.test(zh));
  const exhaust =
    /\{@icon\.exhaust\}\s*this\s*card/i.test(raw) ||
    (!raw && /\{@icon\.exhaust\}\s*(?:此卡|这张卡)/.test(zh)) ||
    /\{@icon\.free-exhaust\}/.test(raw);
  if (one) {
    const b = node("span", "usage-flag", "一次性");
    b.prepend(uiIcon("expend", "一次性消耗"));
    wrap.append(b);
  } else if (exhaust) {
    const b = node("span", "usage-flag", "可横置");
    b.prepend(uiIcon("exhaust", "横置使用"));
    wrap.append(b);
  }
  return wrap;
}

function keywordKey(k) {
  return JSON.stringify([
    String(k.id || k.ruleId || k.raw || ""),
    k.value ?? null,
    k.parameter ?? null,
    k.parameterRefs || k.parameterRef || null,
    k.action ?? null,
    !!k.weaponSources?.length,
  ]);
}

function keywordEntries(inst) {
  const u = RulesCore.unitFor(inst,army,data),
    map = new Map();
  const add = (k, origin, weaponName) => {
    if (!k) return;
    const item = typeof k === "string" ? { id: k } : { ...k };
    if (weaponName) item.weaponSources = [weaponName];
    const key = keywordKey(item);
    if (!map.has(key)) map.set(key, { ...item, origins: [] });
    const current = map.get(key);
    if (weaponName && !current.weaponSources.includes(weaponName))
      current.weaponSources.push(weaponName);
    if (item._battleForceSources?.length) {
      const sources=new Map([...(current._battleForceSources || []),...item._battleForceSources].map(s=>[JSON.stringify([s.id,s.ruleGroupId]),s]));
      current._battleForceSources=[...sources.values()];
    }
    if (origin && !current.origins.some((x) => x.id === origin.id && x._face === origin._face))
      current.origins.push(origin);
  };
  for (const k of cardKeywords(u)) add(k, null);
  for (const choice of inst.upgrades) {
    const card = displayUpgrade(data.upgrades[choice.upgradeId], inst, choice);
    for (const c of card ? printedUpgrades(card) : []) {
      for (const k of cardKeywords(c)) add(k, c);
      for (const weapon of c.weapons || []) {
        const name = named(weapon.name) || "未命名武器";
        for (const k of weapon.keywords || []) add(k, null, name);
      }
      if (c.actionTypes?.length) map.set('upgrade:' + choice.instanceId + ':' + c._face, {
        id: 'upgrade-action:' + choice.instanceId + ':' + c._face, actionTypes: c.actionTypes, _actionUpgrade: c,
      });
    }
  }
  return [...map.values()];
}

function cardKeywords(card) {
  if (!card) return [];
  const keywords = card.keywords || [];
  const equip = keywords.filter(k => (typeof k === 'string' ? k : k?.id) === 'equip');
  if (!equip.length && !card.equipUpgradeIds?.length && !card.equipSlotIds?.length) return keywords;
  const labels = [];
  const add = name => {if (name && !labels.includes(name)) labels.push(name);};
  for (const id of card.equipUpgradeIds || []) {
    const target = data.upgrades[id];
    add(target ? named(BuilderModel.upgradePresentation(target, data, card).name) : id);
  }
  for (const id of RulesCore.equipSlotKeys(card, data.pkg)) add(slotName(id));
  const linked = Array.isArray(card.equipUpgradeIds) || Array.isArray(card.equipSlotIds);
  if (!linked) for (const keyword of equip) {
    const refs = keyword.parameterRefs || (keyword.parameterRef ? [keyword.parameterRef] : []);
    for (const ref of refs) {
      if (ref.kind === 'unit') add(named(data.units[ref.id]?.name) || ref.id);
      if (ref.kind === 'upgrade') add(named(data.upgrades[ref.id]?.name) || ref.id);
    }
    if (refs.length || labels.length) continue;
    // Legacy text is only translated through exact catalog names. Canonical
    // Equip IDs above take precedence over stale or incomplete OCR parameters.
    const norm = value => String(value || '').trim().toLocaleLowerCase();
    for (const part of String(keyword.parameter || '').split(/[,，、;；]+/).filter(s => s.trim())) {
      const target = [...Object.values(data.upgrades), ...Object.values(data.units)]
        .find(c => [c.id, c.name?.en, c.name?.zh].some(n => n && norm(n) === norm(part)));
      add(target ? named(target.name) : part.trim());
    }
  }
  const other = keywords.filter(k => (typeof k === 'string' ? k : k?.id) !== 'equip');
  if (labels.length || equip.length) other.push({id: 'equip', parameter: labels.join('、') || null});
  return other;
}

function uniqueRules(ks) {
  const seen = new Set();
  return (ks || []).filter((k) => {
    const key = keywordKey(typeof k === "string" ? { id: k } : k);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function battleForceSourceLabel(source) {
  return source.ruleGroupName || source.name;
}

function setTagSummary(tag, toggle, body, expanded) {
  body.hidden = !expanded;
  tag.classList.toggle("open", expanded);
  toggle.textContent = expanded ? "−" : "＋";
  toggle.setAttribute("aria-label", (expanded ? "收起" : "展开") + toggle.dataset.ruleLabel + "释义");
  toggle.setAttribute("aria-expanded", String(expanded));
}

function tag(k, {
  forceOpen = false, timing = false, showOrigin = true, showBattleForceOrigin = true, summaryView = null,
} = {}) {
  const info = ruleInfo(k);
  const key = JSON.stringify([keywordKey(info.item), (k.origins || []).map((c) => c.id), k.weaponSources || []]);
  const outer = node("span", "rule-tag");
  outer.dataset.ruleId = info.item.id;
  outer.dataset.ruleKey = key;
  const main = node("button", "rule-tag-main");
  main.type = "button";
  const actions = BuilderModel.keywordActionTypes(info.item, data.defs);
  if (timing) main.append(timingMarkers(ruleTimings(k)));
  // A generic keyword may have several printed variants. Show only a known
  // per-card type here, never imply that one ability has several costs.
  const sourceTypes = [...new Set((k.origins || []).flatMap(c => c.actionTypes || []))];
  const printedTypes = ACTION_LABEL[info.item.action] || info.item.actionTypes ? actions
    : sourceTypes.length === 1 && actions.length ? sourceTypes : actions.length === 1 ? actions : [];
  if (printedTypes.length) {
    const badge = node('span', 'rule-action');
    badge.textContent = printedTypes.map(t => ACTION_LABEL[t]).join(' / ');
    main.append(badge);
  }
  main.append(actionText(info.label));
  const origins = [
    ...(showOrigin ? (k.origins || []).map(originLabel) : []),
    ...(showOrigin ? k.weaponSources || [] : []),
    ...(showBattleForceOrigin ? (k._battleForceSources || []).map(battleForceSourceLabel) : []),
  ];
  if (origins.length)
    main.append(
      node(
        "small",
        "rule-origin",
        [...new Set(origins)].map(name=>"来自 " + name).join(" / "),
      ),
    );
  main.setAttribute("aria-haspopup", "dialog");
  main.onclick = (e) => {
    e.stopPropagation();
    openRule(k, main);
  };
  outer.append(main);
  const summary = info.ref?.summary || "";
  if (summary) {
    const toggle = node("button", "rule-tag-toggle");
    toggle.type = "button";
    toggle.dataset.ruleLabel = info.label;
    const expanded = summaryView
      ? summaryView.open !== summaryView.overrides.has(key)
      : forceOpen || cardView.explanations || cardView.tags.has(key);
    const body = node("span", "tag-summary");
    body.append(proseNode(summary));
    setTagSummary(outer, toggle, body, expanded);
    toggle.onclick = (e) => {
      e.stopPropagation();
      const next = body.hidden;
      setTagSummary(outer, toggle, body, next);
      const overrides = summaryView ? summaryView.overrides : cardView.tags;
      if (next !== (summaryView?.open ?? false)) overrides.add(key);
      else overrides.delete(key);
    };
    outer.append(toggle, body);
  }
  return outer;
}

function ruleTimings(k) {
  return BuilderModel.keywordActionTypes(k, data.defs).length ? ['action'] : ruleInfo(k).ref?.timing || [];
}
function phaseRules(ks, forceOpen = false, { hideArmyBuilding = false } = {}) {
  const list = node("div", "phase-rules");
  const order = Object.keys(TIMING_LABEL),
    groups = new Map();
  for (const k of uniqueRules(ks)) {
    const timings = [...new Set(ruleTimings(k).filter(Boolean))];
    for (const timing of timings.length ? timings : ['unclassified']) {
      if (!groups.has(timing)) groups.set(timing, []);
      groups.get(timing).push(k);
    }
  }
  for (const [key, entries] of [...groups].sort(
    (a, b) => order.indexOf(a[0]) - order.indexOf(b[0]),
  )) {
    if (hideArmyBuilding && key === 'army_building') continue;
    const row = node("div", "phase-row");
    row.dataset.phase = key;
    const label = node("div", "phase-title");
    label.append(node("span", "phase-name", TIMING_LABEL[key] || key));
    const tags = node("div", "phase-tags");
    for (const k of entries) tags.append(tag(k, { forceOpen }));
    row.append(label, tags);
    list.append(row);
  }
  return list;
}

function keywordGroups(ks, options = {}) {
  return phaseRules(ks, !!options.forceOpen);
}

function ruleButton(k) {
  const button = node("button", "rule-name", ruleInfo(k).label);
  button.onclick = (e) => {
    e.stopPropagation();
    openRule(k, button);
  };
  return button;
}

function dicePool(d) {
  const box = node("span", "attack-pool");
  for (const color of ["red", "black", "white"]) {
    const v = d?.[color];
    if (v == null || v === 0) continue;
    const part = node("span", "die-value");
    const label =
      (v < 0 ? "X" : v) + { red: "红", black: "黑", white: "白" }[color] + "骰";
    part.setAttribute("aria-label", label);
    part.append(node("i", "die " + color), node("b", null, v < 0 ? "X" : v));
    box.append(part);
  }
  return box;
}

function weaponBlock(w, origin, { forceOpen = false, timing = false, summaryView = null } = {}) {
  const card = node("div", "weapon-card"),
    head = node("div", "weapon-card-head");
  const name = node("div", "weapon-title");
  name.append(node("b", null, named(w.name)));
  if (w.name?.zh && w.name?.en && w.name.zh !== w.name.en)
    name.append(node("span", "weapon-english", w.name.en));
  if (origin) name.append(node("small", "weapon-origin", "来自 " + originLabel(origin)));
  if (origin?._face) card.dataset.face = origin._face;
  head.append(name);
  const r = w.range;
  if (r?.min != null) {
    const kind = r.min < 0 ? "overrun" : r.min === 0 ? (r.max === 0 ? "melee" : "mixed") : "ranged";
    const range = node("span", "range-pill " + kind);
    range.append(
      node(
        "small",
        null,
        kind === "overrun" ? "碾压" : kind === "melee" ? "近战" : kind === "mixed" ? "近 / 远" : "远程",
      ),
      node("b", null, kind === "overrun" ? "" : r.max == null || r.min === r.max ? r.min : r.min + "–" + r.max),
    );
    head.append(range);
  }
  head.append(dicePool(w.dice));
  card.append(head);
  if (w.keywords?.length) {
    const ks = node("div", "weapon-tags");
    for (const k of uniqueRules(w.keywords))
      ks.append(tag(k, { forceOpen, timing, summaryView, showOrigin: false, showBattleForceOrigin: false }));
    card.append(ks);
  }
  if (Object.values(w.dice || {}).some((v) => v < 0) && origin) {
    const p = node("p", "variable-dice-note");
    p.append(proseNode(textParts(named(origin.description))));
    card.append(p);
  }
  return card;
}

function unitWeapons(inst, options = {}) {
  const u = RulesCore.unitFor(inst,army,data),
    list = [
      ...(u?.weapons || []).map((w) => ({ w, origin: null })),
      ...inst.upgrades.flatMap((ch) => {
        const c = displayUpgrade(data.upgrades[ch.upgradeId], inst, ch);
        return (c ? printedUpgrades(c) : []).flatMap(side => (side.weapons || []).map(w => ({w, origin: side})));
      }),
    ];
  const out = node("div", "weapon-groups");
  for (const [key, label, test] of [
    ["melee", "近战可用武器", (w) => w.range?.min === 0],
    ["ranged", "远程武器", (w) => w.range?.min > 0],
    ["overrun", "碾压武器", (w) => w.range?.min < 0],
    ["unknown", "射程待确认", (w) => w.range?.min == null],
  ]) {
    const found = list.filter((x) => test(x.w));
    if (!found.length) continue;
    const group = node("section", "weapon-group " + key);
    group.append(node("h4", null, label));
    for (const { w, origin } of found)
      group.append(weaponBlock(w, origin, options));
    out.append(group);
  }
  return out;
}

function weaponRows(ws) {
  const wrap = node("div", "weapon-groups");
  for (const w of ws || []) wrap.append(weaponBlock(w, null));
  return wrap;
}

function upgradeDetail(c, { forceOpen = false, compact = false, removable = false, facePart = false } = {}) {
  c = displayUpgrade(c);
  if (UpgradeFaces.isDual(c) && c._face === 'both') {
    const box = node('article', 'upgrade-detail dual-upgrade');
    box.dataset.choiceId = c._choiceId || '';
    for (const [index, side] of printedUpgrades(c).entries()) {
      const part = upgradeDetail(side, {forceOpen, compact, facePart: true});
      part.classList.add('upgrade-face-part');part.dataset.face = side._face;
      const line = part.querySelector('.upgrade-line');
      if (!index) {
        line.append(faceControl(c));
        line.append(upgradeEntryActions(c, removable));
      }
      box.append(part);
    }
    return box;
  }
  const box = node("article", "upgrade-detail");
  if (c._choiceId) box.dataset.choiceId = c._choiceId;
  const body = node("div", "upgrade-body");
  const art = artButton(c, "upgrade-art");
  box.classList.toggle("has-upgrade-art", !art.disabled);
  const h = node("div", "upgrade-line");
  h.append(node("b", null, named(c.name)));
  if (c.name?.zh && c.name.en && c.name.zh !== c.name.en)
    h.append(node("span", "upgrade-english", c.name.en));
  h.append(usageBadges(c));
  if (facePart) h.append(node('span', 'face-badge', faceLabel(c)));
  else if (UpgradeFaces.isDual(c)) h.append(faceControl(c));
  if (!facePart) h.append(upgradeEntryActions(c, removable));
  body.append(h);
  const effect = upgradeEffect(c);
  if (effect.childNodes.length) body.append(effect);
  if (!compact) {
    const req = textParts(
      c.restrictions?.text?.zh || c.requirementsText || c.restrictions?.text?.en,
    );
    if (req) {
      const p = node("div", "upgrade-requirements", "使用要求：");
      p.append(proseNode(req));
      body.append(p);
    }
  }
  const footer = node("div", "upgrade-tags");
  for (const k of uniqueRules(cardKeywords(c)))
    footer.append(
      tag({ ...(typeof k === "string" ? { id: k } : k), origins: [c] }, { forceOpen, showOrigin: false }),
    );
  if (c.weapons?.length) {
    const b = node(
      "button",
      "weapon-inspect",
      "查看武器属性 · " + c.weapons.map((w) => named(w.name)).join(" / "),
    );
    b.onclick = (e) => {
      e.stopPropagation();
      showWeapons(c, b);
    };
    body.append(b);
  }
  box.append(body, art);
  if (footer.children.length) box.append(footer);
  return box;
}

function upgradeEntryActions(c, removable) {
  const actions = node('span', 'upgrade-entry-actions');
  if (c.points != null) actions.append(node('span', 'upgrade-cost', upgradeDisplayPoints(c) + ' 分'));
  if (removable && c._choiceId) actions.append(upgradeRemoveButton(c));
  return actions;
}

function upgradeRemoveButton(c) {
  const remove = node('button', 'upgrade-remove');
  remove.append(uiIcon('trash', '删除'));
  remove.setAttribute('aria-label', '移除' + named(c.name));
  remove.onclick = e => {e.stopPropagation(); removeUpgrade(c);};
  return remove;
}

function showWeapons(c, opener) {
  weaponDialog.replaceChildren();
  const h = node("div", "dialog-head");
  h.append(node("h2", null, named(c.name) + " · 武器"));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭武器属性");
  close.onclick = () => weaponDialog.close();
  h.append(close);
  weaponDialog.append(h);
  for (const w of c.weapons || []) weaponDialog.append(weaponBlock(w, c, { forceOpen: true }));
  showDialog(weaponDialog, opener);
}

function hideRule(restoreFocus = true) {
  rulePop.hidden = true;
  if (restoreFocus) BuilderOverlays.focus(ruleAnchor);
}

function removeUpgrade(c) {
  const inst = army.units.find(i => i.instanceId === c._unitId);
  if (!inst) return;
  BuilderModel.removeUpgrade(army, data, inst.instanceId, c._choiceId);
  hideRule(false);
  setStatus('已从 1 个单位移除 ' + named(c.name));
  render();
  if (unitDetail.open) {
    const group = groupedUnits().find(g => g.instances.some(i => i.instanceId === c._unitId));
    if (group) showUnitDetail(group);
  }
}

function presentRulePopover(anchor, close) {
  ruleAnchor = anchor;
  const parent = anchor?.closest('dialog') || modalStack.filter(d => d.open).at(-1);
  (parent || document.body).append(rulePop);
  rulePop.hidden = false;
  positionRulePopover(anchor);
  BuilderOverlays.focus(close);
}

function openUpgradeRule(card, anchor) {
  const c = liveUpgrade(card);
  rulePop.replaceChildren();
  rulePop.setAttribute('aria-label', '升级卡效果');
  const header = node('div', 'popover-heading');
  const title = node('div');
  title.append(node('h3', null, named(c.name)), node('span', 'popover-english', c.name.en));
  const close = node('button', null, '×');
  close.setAttribute('aria-label', '关闭升级卡效果');
  close.onclick = () => hideRule();
  header.append(title, close);
  rulePop.append(header, node('p', 'popover-timing', (c.actionTypes || []).map(t => ACTION_LABEL[t]).join(' / ')),
    upgradeDetail(c));
  presentRulePopover(anchor, close);
}

function openRule(k, anchor) {
  if (typeof k === "string") k = { id: k };
  if (k._actionUpgrade) return openUpgradeRule(k._actionUpgrade, anchor);
  const { ref, label } = ruleInfo(k);
  ruleAnchor = anchor;
  rulePop.replaceChildren();
  rulePop.setAttribute('aria-label', '词条规则');
  const header = node("div", "popover-heading");
  const title = node("div");
  title.append(node("h3", null, label));
  if (ref?.name?.en) title.append(node("span", "popover-english", ref.name.en));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭词条");
  close.onclick = hideRule;
  header.append(title, close);
  rulePop.append(
    header,
    node(
      "p",
      "popover-timing",
      ruleTimings(k).map((t) => TIMING_LABEL[t] || t).join(" / "),
    ),
  );
  for (const weapon of k.weaponSources || [])
    rulePop.append(node("p", "rule-origin", "来自 " + weapon));
  for (const source of k._battleForceSources || []) rulePop.append(node('p','rule-origin','来自 '+battleForceSourceLabel(source)));
  const tabs = node("div", "rule-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "词条说明长度");
  const panel = node("section", "popover-rule");
  panel.id = "rule-text-panel";
  panel.setAttribute("role", "tabpanel");
  panel.tabIndex = 0;
  const content = node("div");
  panel.append(content);
  const buttons = [];
  for (const [key, title, text] of [["summary", "简写", ref?.summary], ["full", "完整规则", ref?.full]]) {
    const button = node("button", null, title);
    button.id = "rule-tab-" + key;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panel.id);
    button.onclick = () => {
      for (const tab of buttons) {
        tab.setAttribute("aria-selected", String(tab === button));
        tab.tabIndex = tab === button ? 0 : -1;
      }
      panel.setAttribute("aria-labelledby", button.id);
      content.replaceChildren(proseNode(text || (key === "summary" && ref?.full
        ? "暂无简写，可切换完整规则。" : "现有资料没有关联释义。")));
      if (!rulePop.hidden) positionRulePopover(anchor);
    };
    button.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === "Home" ? buttons[0] : e.key === "End" ? buttons[1] : buttons.find((b) => b !== button);
      next.click(); next.focus();
    };
    buttons.push(button);
    tabs.append(button);
  }
  buttons[0].click();
  rulePop.append(tabs, panel);
  for (const c of k.origins || []) {
    const src = node("section", "popover-source");
    src.append(
      node("h4", null, "来自 " + originLabel(c)),
      upgradeDetail(c, { compact: false }),
    );
    rulePop.append(src);
  }
  presentRulePopover(anchor, close);
}

function positionRulePopover(anchor) {
  const r = anchor?.getBoundingClientRect() || {
    left: 20,
    top: 100,
    bottom: 150,
    right: 60,
  };
  const width = Math.min(470, innerWidth - 24);
  rulePop.style.width = width + "px";
  rulePop.style.maxHeight = innerHeight - 32 + "px";
  const height = Math.min(rulePop.scrollHeight, innerHeight - 32);
  rulePop.style.left = Math.min(Math.max(12, r.left), innerWidth - width - 12) + "px";
  rulePop.style.top =
    Math.max(12, Math.min(r.bottom + 9, innerHeight - height - 12)) + "px";
}

function selectGroupSlot(group, index, key, trigger) {
  selectContext(
    {
      mode: "upgrades",
      unitInstanceId: group.instances[0].instanceId,
      slotIndex: index,
      slotKey: key,
      groupIds: group.instances.map((i) => i.instanceId),
    },
    trigger,
  );
}

function expandedContents(inst, { forceOpen = false, detail = false } = {}) {
  const u = RulesCore.unitFor(inst,army,data),
    out = node("div", "unit-expanded");
  const rules = keywordEntries(inst);
  const phases = phaseRules(rules, forceOpen, { hideArmyBuilding: !detail });
  if (phases.childElementCount) out.append(phases);
  out.append(unitWeapons(inst, { forceOpen }));
  if (inst.upgrades.length) {
    const section = node("section", "selected-upgrades");
    section.append(node("h4", "compact-section-title", "升级卡"));
    const order = BuilderModel.slotOrder(inst, unitSlotRecords(u, inst));
    const position = ch => {const i = order.indexOf(ch.slotIndex);return i < 0 ? order.length : i;};
    for (const ch of [...inst.upgrades].sort((a, b) => position(a) - position(b))) {
      const c = displayUpgrade(data.upgrades[ch.upgradeId], inst, ch);
      if (c) section.append(upgradeDetail(c, { forceOpen, compact: true, removable: true }));
    }
    out.append(section);
  }
  return out;
}

function rosterCard(group, { detail = false } = {}) {
  const { unit: u, instances } = group,
    inst = instances[0];
  if (!u) return missingUnit(group);
  const isOpen = detail || instances.some((i) => cardView.expanded.has(i.instanceId));
  const card = node(
    "article",
    "roster-unit" +
      (isOpen ? " expanded" : "") +
      (browser?.unitInstanceId &&
      instances.some((i) => i.instanceId === browser.unitInstanceId)
        ? " context"
        : ""),
  );
  if (instances.some((i) => invalidUnitIds.has(i.instanceId))) {
    card.classList.add("invalid");
    card.title = "此单位存在规则问题，请查看军表校验";
  }
  card.dataset.unitId = u.id;
  card.dataset.rank = rankOf(u, army.armyId);
  card.dataset.count = instances.length;
  card.dataset.instance = inst.instanceId;
  card.dataset.groupKey = group.key;
  card.dataset.instances = JSON.stringify(instances.map(i => i.instanceId));
  const h = briefHeader(u, inst, group, { detail });
  const toggle = unitExpandButton(u, isOpen);
  toggle.onclick = (e) => {
    e.stopPropagation();
    for (const i of instances)
      if (isOpen) cardView.expanded.delete(i.instanceId);
      else cardView.expanded.add(i.instanceId);
    renderUnits();
    [...$("#army-units").children]
      .find((n) => n.dataset.instance === inst.instanceId)
      ?.querySelector(".expand-unit")
      ?.focus({ preventScroll: true });
  };
  if (!detail) h.append(toggle);
  card.append(h, slotStrip(group, {readonly: detail}));
  if (!detail) {
    const summary = h.querySelector(".brief-first");
    summary.setAttribute("tabindex", "0");
    summary.setAttribute("role", "button");
    summary.setAttribute("aria-label", "查看" + named(u.name) + "完整详情");
    h.onclick = (e) => {
      if (!e.target.closest("button,.compact-slots")) showUnitDetail(group, summary);
    };
    h.onkeydown = (e) => {
      if (e.target === summary && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        showUnitDetail(group, summary);
      }
    };
  }
  if (isOpen) card.append(expandedContents(inst, { forceOpen: detail, detail }));
  return card;
}

function showUnitDetail(group, opener) {
  unitDetail.replaceChildren();
  const h = node("div", "dialog-head");
  h.append(node("h2", null, "单位完整详情"));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭单位详情");
  close.onclick = () => unitDetail.close();
  h.append(close);
  unitDetail.append(h, rosterCard(group, { detail: true }));
  showDialog(unitDetail, opener);
}

function refreshUnitFaces(card, group, detail = false) {
  card.dataset.groupKey = group.key;
  card.querySelector('.compact-slots')?.replaceWith(slotStrip(group, {readonly: detail}));
  card.querySelector('.unit-expanded')?.replaceWith(expandedContents(group.instances[0], {forceOpen: detail, detail}));
  return card;
}
function renderUnits({changedInstanceId = null} = {}) {
  const list = $("#army-units");
  list.classList.add("grouped-army-list");
  if (!changedInstanceId) list.replaceChildren();
  const existing = new Map([...list.querySelectorAll(':scope > .roster-unit')].map(n => [n.dataset.groupKey, n]));
  const byMembers = new Map([...existing.values()].map(n => [n.dataset.instances, n]));
  const wanted = groupedUnits().map(g => {
    const members = JSON.stringify(g.instances.map(i => i.instanceId));
    if (changedInstanceId && g.instances.some(i => i.instanceId === changedInstanceId) && byMembers.has(members))
      return refreshUnitFaces(byMembers.get(members), g);
    const current = existing.get(g.key);
    const sameMembers = current?.dataset.instances === members;
    return sameMembers && !g.instances.some(i => i.instanceId === changedInstanceId) ? current : rosterCard(g);
  });
  const b = list.querySelector(':scope > .add-unit') || node("button", "add-unit", "＋ 添加单位");
  b.onclick = () => selectContext({ mode: "units", rank: 2 }, b);wanted.push(b);
  // Reconcile in place: never detach unaffected unit nodes or their loaded images.
  let cursor = list.firstChild;
  for (const child of wanted) {
    if (child === cursor) cursor = cursor.nextSibling;
    else list.insertBefore(child, cursor);
  }
  for (const child of [...list.children]) if (!wanted.includes(child)) child.remove();
  window.BuilderSticky?.refresh();
}

function timingMarkers(timings) {
  const markers = node("span", "timing-markers");
  const list = [...new Set(timings?.length ? timings : ["unclassified"])];
  markers.title = list.map((t) => TIMING_LABEL[t] || t).join(" / ");
  markers.setAttribute("aria-label", "时机：" + markers.title);
  for (const t of list) {
    const mark = node("span", "timing-mark", TIMING_LABEL[t] || t);
    mark.textContent = TIMING_LABEL[t] || t;
    mark.dataset.timing = t;
    markers.append(mark);
  }
  return markers;
}
function ruleTags(keywords, options = {}) {
  const tags = node("div", "candidate-tags");
  const entries = uniqueRules(keywords);
  if (options.timing) entries.sort((a,b) => Number(ruleTimings(b).includes('action')) - Number(ruleTimings(a).includes('action')));
  for (const k of entries) tags.append(tag(k, options));
  return tags;
}
function selectableCandidate(element, card, state) {
  element.tabIndex = 0;
  element.setAttribute(
    "aria-label",
    named(card.name) + "，" + state.label + (state.ok ? "，按回车选择" : ""),
  );
  // Keep nested rule/image controls accessible, including on unavailable cards.
  element.setAttribute("role", "group");
  element.classList.add("selectable-candidate");
  element.onclick = (e) => {
    if (e.target.closest("button,input,select,textarea,summary,a,.rule-tag")) return;
    if (state.ok && !window.getSelection()?.toString()) choose(card);
  };
  element.onkeydown = (e) => {
    if (e.target !== element || !["Enter", " "].includes(e.key)) return;
    e.preventDefault();
    if (state.ok) choose(card);
  };
  return element;
}
function candidateStatus(state) {
  const footer = node("div", "candidate-footer");
  footer.append(node("span", "candidate-state", state.label));
  if (state.reason) footer.append(node("span", "eligibility-note", state.reason));
  return footer;
}

function favoriteButton(c) {
  const kind = browser.mode, selected = cardUsage.isFavorite(kind,c);
  const button = node('button', 'favorite-card', selected ? '★' : '☆');
  button.type = 'button';
  button.setAttribute('aria-pressed',String(selected));
  button.setAttribute('aria-label',(selected ? '取消收藏' : '收藏') + named(c.name));
  button.title = (selected ? '取消收藏' : '收藏') + ' · 已使用 ' + cardUsage.stats(kind,c).count + ' 次';
  button.onclick = e => {
    e.stopPropagation();
    cardUsage.toggleFavorite(kind,c);
    filterCandidates();
    [...$('#card-grid').children].find(n => n.dataset.id === c.id &&
      (!n.dataset.face || n.dataset.face === (c._face || 'front')))?.querySelector('.favorite-card')?.focus({preventScroll:true});
  };
  return button;
}

function upgradeCandidate(c) {
  c = displayUpgrade(c);
  const state = itemState(c),
    item = node("article", "candidate upgrade-candidate " + state.kind);
  item.dataset.id = c.id;
  item.dataset.state = state.kind;
  item.dataset.face = c._face || "front";
  const host = army.units.find(i => i.instanceId === browser?.unitInstanceId);
  const head = identity(c, {points: upgradeDisplayPoints(c,host)});
  const main = head.querySelector(".identity-main");
  const row = node("div", "upgrade-candidate-title-row");
  const names = node("div", "upgrade-candidate-names");
  const name = main.querySelector("h3");
  name.title = named(c.name);
  names.append(name);
  const english = main.querySelector(".en-name");
  if (english) {
    english.title = c.name.en;
    names.append(english);
  }
  row.append(names);
  const usage = usageBadges(c);
  if (usage.childElementCount) row.append(usage);
  const points = head.querySelector(".item-points");
  if (points) row.append(points);
  row.append(favoriteButton(c));
  main.prepend(row);
  head.prepend(artButton(c, "upgrade-art candidate-art"));
  if (c.variantLabel) main.append(node('span','variant-label',c.variantLabel));
  if (UpgradeFaces.isDual(c)) main.append(node("span", "face-badge", "双面卡 · " + faceLabel(c)));
  const req = textParts(
    c.restrictions?.text?.zh || c.requirementsText || c.restrictions?.text?.en,
  );
  if (req) {
    const p = node("div", "requirements");
    p.setAttribute('aria-label', '使用要求');
    p.append(proseNode(req));
    main.append(p);
  }
  if (!state.ok) main.append(node('span', 'candidate-state', state.label));
  if (state.reason) main.append(node('div', 'eligibility-note', state.reason));
  item.append(head);
  const effect = upgradeEffect(c);
  if (effect.childNodes.length) item.append(effect);
  const tags = node("div", "upgrade-tags");
  for (const k of uniqueRules(cardKeywords(c)))
    tags.append(tag({ ...(typeof k === "string" ? { id: k } : k), origins: [c] }, { showOrigin: false }));
  if (tags.children.length) item.append(tags);
  if (c.weapons?.length) item.append(weaponRows(c.weapons));
  return selectableCandidate(item, c, state);
}

const UNIT_FACTION_TONES = { 1: "rebel", 2: "empire", 4: "republic", 5: "separatist" };
const UNIT_AFFILIATION_TONES = {
  1: "pyke-black-sun", 2: "pyke-black-sun", 3: "pirate", 5: "maul", 6: "mercenary", 7: "ewok",
  965: "mandalorian", 1081: "mandalorian", 1082: "mandalorian", 1083: "mandalorian", 1084: "mandalorian",
};

function unitExpandButton(unit, expanded) {
  const label = expanded ? "收起" : "展开";
  const button = node("button", "expand-unit", label);
  button.type = "button";
  button.setAttribute("aria-label", label + named(unit.name));
  button.setAttribute("aria-expanded", String(expanded));
  return button;
}

function unitCandidateHeader(unit, group) {
  const head = node("div", "candidate-unit-head");
  const body = node("div", "candidate-unit-overview");
  const first = node("div", "candidate-unit-name-row");
  const name = node("div", "candidate-unit-name");
  const tone = UNIT_FACTION_TONES[unit.factionId] ||
    (unit.affiliationIds || []).map(id => UNIT_AFFILIATION_TONES[id]).find(Boolean) ||
    "mercenary";
  name.style.setProperty("--unit-bg", "var(--card-" + tone + "-bg)");
  name.style.setProperty("--unit-fg", "var(--card-" + tone + "-fg)");
  name.append(node("b", null, named(unit.name)));
  if (unit.name?.zh && unit.name.en && unit.name.zh !== unit.name.en)
    name.append(node("span", null, unit.name.en));
  name.title = [unit.name?.zh, unit.name?.en].filter(Boolean).join(" / ");
  const points = node("span", "candidate-unit-points");
  points.append(node("b", null, unit.points ?? "—"), node("small", null, "分"));
  first.append(name, points, favoriteButton(unit));

  const second = node("div", "candidate-unit-meta-row");
  const title = node("div", "candidate-unit-title");
  if (named(unit.title)) title.append(node("span", null, named(unit.title)));
  if (unit.title?.zh && unit.title.en && unit.title.en !== unit.title.zh)
    title.append(node("span", "english", unit.title.en));
  title.title = [unit.title?.zh, unit.title?.en].filter(Boolean).join(" / ");
  const rankId = rankOf(unit, army.armyId);
  const type = named(data.defs.unitTypes.find(t => t.id === unit.unitTypeId)?.name);
  const rank = node("span", "candidate-unit-rank");
  rank.append(rankIcon(rankId));
  if (unit.stats?.models != null) {
    const models = node("span", "candidate-unit-models", unit.stats.models);
    models.title = "单位人数";
    models.setAttribute("aria-label", "单位人数 " + unit.stats.models);
    rank.append(models);
  }
  rank.append(node("span", null, named(data.defs.ranks.find(r => r.id === rankId)?.name)));
  const meta = node("div", "candidate-unit-meta");
  const typeLabel = node("span", "candidate-unit-type", type);
  typeLabel.title = type;
  meta.append(rank, typeLabel);
  second.append(title, meta);

  const slots = slotStrip(group, { readonly: true, candidateLayout: true });
  const stats = node("div", "candidate-unit-stats");
  stats.append(statMatrix(unit, { compactDefense: true }));
  body.append(first, second, stats);
  if (slots.childElementCount) body.append(slots);
  head.append(artButton(unit, "unit-art candidate-portrait"), body);
  return head;
}

function candidate(c) {
  if (browser.mode === "upgrades") return upgradeCandidate(c);
  if (browser.mode !== "units") return commandCandidate(c);
  const inst = { unitId: c.id, instanceId: "candidate-" + c.id, upgrades: [] };
  const group = { unit: c, instances: [inst] },
    state = itemState(c);
  const card = node("article", "candidate unit-candidate " + state.kind);
  card.dataset.id = c.id;
  card.dataset.state = state.kind;
  const content = node("div", "unit-candidate-content");
  const options = { timing: true, summaryView: cardView.candidateSummaries };
  const tags = ruleTags(cardKeywords(c), options);
  const weapons = unitWeapons(inst, options);
  if (tags.childElementCount) content.append(tags);
  if (weapons.childElementCount) content.append(weapons);
  if (!state.ok) content.append(candidateStatus(state));
  card.append(unitCandidateHeader(c, group));
  if (content.childElementCount) card.append(content);
  return selectableCandidate(card, c, state);
}

function showDialog(dialog, opener = document.activeElement) {
  hideRule(false);
  if (dialog.open) return;
  BuilderOverlays.open(dialog, opener);
  dialog.showModal();
  if (!modalStack.includes(dialog)) modalStack.push(dialog);
  if (!watchedDialogs.has(dialog)) {
    watchedDialogs.add(dialog);
    dialog.addEventListener("close", () => {
      // A reusable dialog can reopen before the queued close event arrives.
      if (dialog.open) return;
      const index = modalStack.lastIndexOf(dialog);
      if (index >= 0) modalStack.splice(index, 1);
      BuilderOverlays.close(dialog);
    });
  }
}
function briefHeader(unit, instance, group, { detail = false } = {}) {
  const header = node("div", detail ? "unit-brief detail-brief" : "unit-brief");
  let controls;
  if (!detail) {
    controls = node("div", "instance-controls");
    if (canDuplicate(group)) {
      const plus = node("button", "copy-unit", "＋"),
        minus = node("button", "remove-unit", "−");
      plus.setAttribute("aria-label", "复制" + named(unit.name) + "及全部升级");
      minus.setAttribute("aria-label", "移除1个" + named(unit.name));
      plus.onclick = (e) => {
        e.stopPropagation();
        duplicateGroup(group);
      };
      minus.onclick = (e) => {
        e.stopPropagation();
        removeOne(group);
      };
      controls.append(
        minus,
        node("span", "group-count", "×" + group.instances.length),
        plus,
      );
    } else {
      const remove = node("button", "delete-unit");
      remove.setAttribute("aria-label", "删除" + named(unit.name));
      remove.title = "单位或所选升级具有独特性";
      remove.append(uiIcon("trash", "删除"));
      remove.onclick = (e) => {
        e.stopPropagation();
        removeOne(group);
      };
      controls.append(remove);
      if (group.instances.length > 1)
        controls.append(node("span", "group-count", "×" + group.instances.length));
    }
  }
  header.append(artButton(unit));
  const body = node("div", "brief-body"),
    first = node("div", "brief-first"),
    name = node("div", "bilingual-name");
  name.append(node("b", null, named(unit.name)));
  if (unit.name?.zh && unit.name.en && unit.name.en !== unit.name.zh)
    name.append(node("span", null, unit.name.en));
  first.append(name, statMatrix(unit, { showModels: !detail }));
  const second = node("div", "brief-meta");
  second.append(rankIcon(rankOf(unit, army.armyId)));
  second.append(
    node(
      "span",
      "rank-label-inline",
      [
        named(data.defs.ranks.find((r) => r.id === rankOf(unit, army.armyId))?.name),
        named(data.defs.unitTypes.find((t) => t.id === unit.unitTypeId)?.name),
      ]
        .filter(Boolean)
        .join(" / "),
    ),
  );
  if (named(unit.title)) {
    const title = node("span", "bilingual-title", named(unit.title));
    if (unit.title.zh && unit.title.en && unit.title.en !== unit.title.zh)
      title.append(node("span", null, unit.title.en));
    second.append(title);
  }
  body.append(first, second);
  header.append(body);
  const cost = node("div", "brief-cost"),
    single = perUnitPoints(instance),
    quantity = detail ? 1 : group.instances.length;
  if (single != null) {
    cost.append(node("b", null, single * quantity), node("small", null, "分"));
    if (quantity > 1) cost.append(node("span", null, single + " × " + quantity));
  }
  if (controls) {
    const end = node("div", "brief-end");
    end.append(cost, controls);
    first.append(end);
  } else first.append(cost);
  return header;
}
function slotStrip(group, { readonly = false, candidateLayout = false } = {}) {
  const inst = group.instances[0],
    u = group.unit,
    strip = node("div", candidateLayout ? "compact-slots candidate-unit-slots" : "compact-slots");
  if (candidateLayout) {
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "升级槽位");
  }
  const records = unitSlotRecords(u, inst),
    displayed = new Set();
  function slot(rec, index, chosen, orphan = false) {
    const c = chosen && displayUpgrade(data.upgrades[chosen.upgradeId], inst, chosen);
    const name = chosen
      ? c
        ? named(c.name)
        : "失效升级 " + chosen.upgradeId
      : slotName(rec.key);
    const row = node(
      "span",
      "compact-slot" + (chosen ? " filled" : "") + (orphan ? " orphan" : ""),
    );
    const locked =
      !chosen && rec.unlockedBy && !instUpstreamIds(inst).has(String(rec.unlockedBy));
    row.dataset.slotIndex = index;
    if (c?._face === 'both') row.classList.add('both-faces');
    if (c) row.append(artButton(c, "slot-art"));
    const label = node(readonly || orphan ? "span" : "button", "slot-name");
    label.append(node("span", "slot-glyph", rec ? slotDef(rec.key)?.iconGlyph || "+" : "!"));
    if (candidateLayout) {
      label.title = name;
      label.append(node("span", "candidate-slot-text", name));
    } else {
      label.append(document.createTextNode(name));
    }
    if (c?.points != null) label.append(node("span", "slot-cost", upgradeDisplayPoints(c,inst) + "分"));
    if (c?._face === 'both') label.append(node('span', 'face-badge', '正面'));
    if (rec?.required && !chosen) label.append(node("small", "required-slot", "必选"));
    if (orphan) label.title = "当前配置无匹配槽位；已保留，可移除";
    else if (!readonly) {
      label.disabled = !!locked;
      label.title = locked ? "此槽位尚未解锁" : "选择或更换" + slotName(rec.key);
      label.onclick = (e) => {
        e.stopPropagation();
        selectGroupSlot(group, index, rec.key, label);
      };
    }
    row.append(label);
    if (chosen && !readonly) {
      const remove = node("button", "slot-remove", "×");
      remove.setAttribute("aria-label", "从其中1个单位移除" + name);
      remove.onclick = (e) => {
        e.stopPropagation();
        if (c) removeUpgrade(c);
        else {BuilderModel.removeUpgrade(army, data, inst.instanceId, chosen.instanceId); render();}
      };
      row.append(remove);
    }
    if (c?._face === 'both') {
      const back = UpgradeFaces.view(c, 'back'), line = node('span', 'upgrade-line slot-back-line');
      line.append(artButton(back, 'slot-art'), node('span', 'slot-back-name', named(back.name)),
        node('span', 'face-badge', '反面'));
      row.append(line);
    }
    strip.append(row);
    if (chosen) displayed.add(chosen);
  }
  for (const index of BuilderModel.slotOrder(inst, records)) {
    const rec = records[index];
    const choices = inst.upgrades.filter((ch) => ch.slotIndex === index);
    if (!choices.length) slot(rec, index, null);
    else
      choices.forEach((ch) =>
        slot(
          rec,
          index,
          ch,
          !data.upgrades[ch.upgradeId] ||
            !accessOf(data.upgrades[ch.upgradeId]).includes(rec.key),
        ),
      );
  }
  for (const ch of inst.upgrades)
    if (!displayed.has(ch)) slot(null, ch.slotIndex, ch, true);
  return strip;
}
function missingUnit(group) {
  const card = node("article", "missing-unit"),
    remove = node("button", null, "移除");
  card.append(node("b", null, "失效单位：" + group.instances[0].unitId));
  remove.onclick = () => removeOne(group);
  card.append(remove);
  return card;
}
function commandCandidate(card) {
  return commandCard(card, { state: itemState(card) });
}
function commandCard(card, { state, slotIndex = null }) {
  const roster = slotIndex !== null;
  const key = (roster ? "roster:" + slotIndex : "candidate") + ":" + card.id;
  const item = node(
    "article",
    "command-card-tile " +
      (roster ? "command-chosen " : "candidate command-candidate ") +
      state.kind,
  );
  item.dataset.id = card.id;
  item.dataset.state = state.kind;
  if (roster) item.dataset.slotIndex = slotIndex;
  const face = node("div", "command-face");
  const src = card.assets?.front || card.image;
  if (src) {
    const image = node("img", "command-face-image");
    const preview = card.assets?.thumbnail || card.thumbnail || src;
    image.src = assetPath(preview);
    image.alt = named(card.name) + "卡图";
    image.loading = "lazy";
    image.onerror = () => {
      if (image.getAttribute('src') !== assetPath(src)) {image.src = assetPath(src);return;}
      image.hidden = true;
      face.classList.add("missing-art");
    };
    face.append(image);
  } else face.classList.add("missing-art");
  const wrap = node("div", "command-mask-wrap");
  wrap.id = "command-mask-" + key.replace(/[^a-z0-9-]/gi, "-");
  const title = node("div", "command-title-mask");
  title.append(identity(card, { command: true }));
  if (roster) {
    const remove = node("button", "command-remove card-remove");
    remove.append(uiIcon('trash', '删除'));
    remove.setAttribute("aria-label", "移除" + named(card.name));
    remove.onclick = (e) => {
      e.stopPropagation();
      army.commandIds[slotIndex] = null;
      render();
    };
    face.append(remove);
  }
  const collapse = node("button", "command-collapse", "⌄");
  collapse.setAttribute("aria-label", "收起" + named(card.name) + "卡文");
  collapse.setAttribute("aria-controls", wrap.id);
  const expand = node("button", "command-expand", "展开");
  expand.setAttribute("aria-label", "展开" + named(card.name) + "卡文");
  expand.setAttribute("aria-controls", wrap.id);
  function fold(collapsed, focus = false) {
    if (collapsed) cardView.commandCollapsed.add(key);
    else cardView.commandCollapsed.delete(key);
    wrap.hidden = collapsed;
    expand.hidden = !collapsed;
    face.classList.toggle("mask-collapsed", collapsed);
    collapse.setAttribute("aria-expanded", String(!collapsed));
    expand.setAttribute("aria-expanded", String(!collapsed));
    if (focus) (collapsed ? expand : collapse).focus({ preventScroll: true });
  }
  collapse.onclick = () => fold(true, true);
  expand.onclick = () => fold(false, true);
  const overlay = node("div", "command-overlay");
  overlay.append(commandBody(card, { keywords: false, collapse }));
  const requirements = commandResult(card).requirements;
  if (requirements.length) {
    const line = node("div", "command-unit-requirements");
    line.append(node("span", null, "使用要求"));
    for (const group of requirements) {
      const item = node("span", group.met ? "met" : "missing", (group.met ? "✓ " : "○ ") + group.label);
      item.title = group.met ? "已满足" : "尚未编入：本组任选一个版本";
      line.append(item);
    }
    overlay.append(line);
  }
  if (card.slotPips != null && card.slotPips !== card.pips)
    overlay.append(
      node("p", "eligibility-note", "组军占用 " + card.slotPips + " 牌点槽位"),
    );
  if (state.kind === "blocked")
    overlay.append(node("p", "eligibility-note", state.reason || state.label));
  else if (!roster && state.kind === "chosen")
    title.append(node("span", "command-selected-mark", "已选"));
  wrap.append(title, overlay);
  face.append(wrap, expand);
  fold(cardView.commandCollapsed.has(key));
  item.append(face);
  if (roster) {
    item.tabIndex = 0;
    item.setAttribute("role", "group");
    item.setAttribute("aria-label", named(card.name) + "，按回车替换");
    item.onclick = (e) => {
      if (
        e.target.closest("button,a,input,summary,.rule-tag,.command-keywords") ||
        window.getSelection()?.toString()
      )
        return;
      if (e.target.closest(".command-mask-wrap") || !src)
        selectContext({ mode: "commands", slotIndex }, item);
      else showImage(card, item);
    };
    item.onkeydown = (e) => {
      if (e.target === item && ["Enter", " "].includes(e.key)) {
        e.preventDefault();
        selectContext({ mode: "commands", slotIndex }, item);
      }
    };
  } else {
    item.tabIndex = 0;
    item.setAttribute(
      "aria-label",
      named(card.name) + "，" + state.label + (state.ok ? "，点击卡文选择，点击卡图查看原图" : ""),
    );
    item.setAttribute("role", "group");
    item.classList.add("selectable-candidate");
    item.onclick = (e) => {
      if (e.target.closest("button,input,select,textarea,summary,a,.rule-tag,.command-keywords")) return;
      if (!state.ok || window.getSelection()?.toString()) return;
      if (e.target.closest(".command-mask-wrap")) choose(card);
      else if (src) showImage(card, item);
    };
    item.onkeydown = (e) => {
      if (e.target !== item || !["Enter", " "].includes(e.key)) return;
      e.preventDefault();
      if (state.ok) choose(card);
    };
  }
  if (card.keywords?.length) {
    const drawer = node("div", "command-keywords");
    const toggle = node("button", "command-keywords-toggle");
    const tags = ruleTags(card.keywords);
    function update(expanded) {
      tags.hidden = !expanded;
      toggle.textContent =
        (expanded ? "收起词条" : "展开词条") + " · " + uniqueRules(card.keywords).length;
      toggle.setAttribute("aria-expanded", String(expanded));
    }
    toggle.onclick = () => {
      const next = tags.hidden;
      if (next) cardView.commandExpanded.add(key);
      else cardView.commandExpanded.delete(key);
      update(next);
    };
    update(cardView.commandExpanded.has(key));
    drawer.append(toggle, tags);
    item.append(drawer);
  }
  return item;
}
function updateBatchControl() {
  const n = browser?.mode === "upgrades" ? browser.groupIds?.length || 1 : 0;
  $("#batch-apply").hidden = n < 2;
  $("#apply-all-units").checked = cardView.applyAll;
  $("#batch-label").textContent = "应用到全部单位（" + n + " 个相同配置）";
  if (browser?.mode === "upgrades") {
    const inst = army.units.find(i => i.instanceId === browser.unitInstanceId);
    $("#browser-context").textContent =
      named(data.units[inst?.unitId]?.name) + " / " + slotName(browser.slotKey) + "槽位 / " +
      (n > 1 ? "合并组 " + n + " 个，" + (cardView.applyAll ? "全部应用" : "仅修改 1 个") : "仅当前单位");
  }
}
function renderIssues(report) {
  const box = $("#issues");
  box.replaceChildren();
  box.append(
    node(
      "p",
      "issue " + report.status,
      report.status === "invalid"
        ? "存在明确问题"
        : report.status === "valid"
          ? "现有规则范围内通过"
          : "规则覆盖待确认",
    ),
  );
  for (const issue of report.issues) {
    const inst = army.units.find(
      (i) =>
        i.instanceId === issue.instanceId ||
        i.upgrades.some((ch) => ch.instanceId === issue.instanceId),
    );
    box.append(
      node(
        "p",
        "issue " + issue.status,
        (inst ? named(RulesCore.unitFor(inst,army,data)?.name) + "：" : "") + issue.message,
      ),
    );
  }
}
function deckPicker(title, items, onPick) {
  const dialog = node("dialog", "mission-dialog"),
    header = node("div", "dialog-head"),
    input = node("input"),
    close = node("button", null, "×"),
    list = node("div", "mission-options");
  header.append(node("h2", null, title), close);
  close.setAttribute("aria-label", "关闭" + title);
  close.onclick = () => dialog.close();
  input.type = "search";
  input.placeholder = "搜索名称";
  input.setAttribute("aria-label", "搜索任务卡");
  function draw() {
    list.replaceChildren();
    const key = input.value.trim().toLocaleLowerCase();
    for (const item of items) {
      if (key && ![item.label, item.sub].join(" ").toLocaleLowerCase().includes(key))
        continue;
      const button = node("button", "mission-option");
      button.append(node("b", null, item.label), node("span", null, item.sub));
      button.onclick = () => {
        onPick(item);
        dialog.close();
      };
      list.append(button);
    }
    if (!list.children.length)
      list.append(node("p", "empty-result", "没有匹配的任务卡。"));
  }
  input.oninput = draw;
  dialog.append(header, input, list);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  draw();
  showDialog(dialog);
  BuilderOverlays.focus(input);
}
function wireEditor() {
  $("#browser-close").onclick = closeBrowser;
  $("#browser-backdrop").onclick = closeBrowser;
  $("#candidate-search").oninput = filterCandidates;
  $("#candidate-sort").onchange = () => {
    if (browser) candidateSortModes[browser.mode] = $("#candidate-sort").value;
    filterCandidates();
  };
  $("#show-unavailable").onchange = filterCandidates;
  $("#candidate-explanations").onchange = ({ target }) => {
    const view = cardView.candidateSummaries;
    view.open = target.checked;
    view.overrides.clear();
    for (const toggle of $("#card-grid").querySelectorAll(".unit-candidate .rule-tag-toggle")) {
      const tag = toggle.parentElement;
      setTagSummary(tag, toggle, tag.querySelector(".tag-summary"), view.open);
    }
  };
  $("#apply-all-units").onchange = () => {
    cardView.applyAll = $("#apply-all-units").checked;
    updateBatchControl();
    stateCache.clear();
    BuilderModel.disposeEquipPreviewContext(equipPreviewContext);
    equipPreviewContext = browser?.mode === 'upgrades' ? BuilderModel.createEquipPreviewContext(army, data) : null;
    filterCandidates();
  };
  $("#open-explanations").onchange = () => {
    cardView.explanations = $("#open-explanations").checked;
    if (!data || !army) return;
    renderUnits();
    if (browser) filterCandidates();
  };
  $("#view-toggle").onclick = () => {
    if (!data || !army) return;
    const all = army.units.every((i) => cardView.expanded.has(i.instanceId));
    cardView.expanded.clear();
    if (!all) for (const i of army.units) cardView.expanded.add(i.instanceId);
    $("#view-toggle").textContent = all ? "全部展开" : "全部收起";
    renderUnits();
  };
  $("#info").onclick = () => showDialog($("#issues-panel"));
  $("#issues-close").onclick = () => $("#issues-panel").close();
  for (const dialog of [imageDialog, unitDetail, weaponDialog, $("#issues-panel")]) {
    dialog.addEventListener("close", () => hideRule(false));
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        dialog.close();
    });
  }
  document.addEventListener("pointerdown", (e) => {
    if (
      !rulePop.hidden &&
      !rulePop.contains(e.target) &&
      !e.target.closest(".rule-tag,.rule-name")
    )
      hideRule(false);
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && !rulePop.hidden) {
        e.preventDefault();
        e.stopImmediatePropagation();
        hideRule();
        return;
      }
      const popup = !rulePop.hidden ? rulePop : modalStack.filter((dialog) => dialog.open).at(-1);
      const panel =
        popup ||
        (document.body.classList.contains("sheet-open") ? $("#card-browser") : null);
      if (e.key === "Escape" && !popup && panel) {
        e.preventDefault();
        closeBrowser();
        return;
      }
      if (e.key === "Tab" && panel) {
        const focusable = [
          ...panel.querySelectorAll(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]',
          ),
        ].filter((n) => n.getClientRects().length);
        const first = focusable[0],
          last = focusable.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first || !panel.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || !panel.contains(document.activeElement))
        ) {
          e.preventDefault();
          first?.focus();
        }
      }
    },
    true,
  );
  matchMedia("(max-width:760px)").addEventListener("change", () => {
    hideRule(false);
    if (data) renderBrowser();
  });
  window.addEventListener("resize", () => hideRule(false));
}
