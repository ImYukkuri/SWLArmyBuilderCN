/* Shared roster, candidate and detail presentation. */
const node = (tag, cls, text) => {
  const n = el(tag, text);
  if (cls) n.className = cls;
  if (typeof text === "string" && /行动/.test(text)) n.replaceChildren(actionText(text));
  return n;
};
// Shared by plain labels, rule text and icon substitutions; longest label wins.
function actionText(text) {
  const out = document.createDocumentFragment();
  let pos = 0;
  for (const match of text.matchAll(/免费行动(?:\s*[：:]\s*横置)?|行动/g)) {
    out.append(document.createTextNode(text.slice(pos, match.index)));
    const mark = document.createElement("span");
    mark.className = "action-mark";
    mark.textContent = match[0].replace(/\s*[：:]\s*/, "：");
    mark.dataset.action = match[0].includes("横置") ? "free-exhaust" : match[0].startsWith("免费") ? "free" : "normal";
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
  candidateExpanded: new Set(),
  commandExpanded: new Set(),
  commandCollapsed: new Set(),
  explanations: false,
  tags: new Set(),
  applyAll: false,
  battleText: (() => { try { return localStorage.getItem("swl-battle-text") === "true"; } catch { return false; } })(),
};
const stateCache = new Map();
const modalStack = [];
let lastOpener = null,
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
  const ref = keywordRef(item.id);
  if (!ref)
    return { item, ref: null, label: String(item.label || item.raw || item.id || "") };
  let label = named(ref.name);
  if (item.value != null)
    label = label.includes("X")
      ? label.replaceAll("X", String(item.value))
      : label + " " + item.value;
  if (item.parameter) label = label.split(/[：:]/)[0] + "：" + item.parameter;
  return { item, ref, label };
}

function proseNode(raw) {
  const box = node("span");
  const text = textParts(raw);
  const labels = {
    "rank-commander": "指挥官",
    "rank-operative": "特工",
    "rank-corps": "核心",
    "rank-special-forces": "特种部队",
    "rank-support": "支援",
    "rank-heavy": "重型",
    action: "行动",
    "free-action": "免费行动",
    hit: "命中",
    critical: "暴击",
    block: "格挡",
    surge: "攻击激增",
    "surge-block": "防御激增",
    exhaust: "横置",
    expend: "消耗",
    "free-exhaust": "免费行动：横置",
    "faction-empire": named(data.defs.factions.find((f) => f.id === 2)?.name),
    "faction-ewoks": "伊沃克",
    "faction-rebel": named(data.defs.factions.find((f) => f.id === 1)?.name),
    "faction-republic": named(data.defs.factions.find((f) => f.id === 4)?.name),
    "faction-separatist": named(data.defs.factions.find((f) => f.id === 5)?.name),
    "slot-heavy": named(data.defs.upgradeSlots.find((s) => s.id === 4)?.name),
  };
  let pos = 0;
  for (const m of text.matchAll(/\{@icon\.([\w-]+)\}/g)) {
    box.append(actionText(text.slice(pos, m.index)));
    const token = node("span", "inline-token");
    if (ORDER_GLYPH[m[1]]) {
      token.append(
        node("span", "rank-icon", ORDER_GLYPH[m[1]]),
        document.createTextNode(labels[m[1]] || m[1]),
      );
    } else
      token.append(actionText(labels[m[1]] || (/^range-/.test(m[1]) ? "距离 " + m[1].slice(6) : m[1])));
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
    seal.append(node("span", "rank-icon", RANK_GLYPH[rankOf(c, army.armyId)] || ""));
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
        [named(rank?.name), named(type?.name), isUnique(c) ? "独特单位" : ""]
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
  if (keywords && c.keywords?.length) out.append(ruleTags(c.keywords));
  if (c.weapons?.length) out.append(heading("关联武器"), weaponRows(c.weapons));
  return out;
}

function selectContext(value, trigger) {
  lastOpener = trigger || document.activeElement;
  hideRule(false);
  browser = value;
  cardView.applyAll = false;
  $("#candidate-search").value = "";
  $("#show-unavailable").checked = false;
  render();
  $("#card-grid").scrollTop = 0;
  if (matchMedia("(max-width:760px)").matches) $("#browser-close").focus();
}

function closeBrowser() {
  browser = null;
  render();
  const target = lastOpener?.isConnected ? lastOpener : $("#rank-bar button");
  target?.focus();
}

function filterCandidates() {
  const grid = $("#card-grid");
  grid.replaceChildren();
  grid.classList.toggle("command-grid", browser?.mode === "commands");
  const search = $("#candidate-search").value.trim().toLocaleLowerCase(),
    all = $("#show-unavailable").checked,
    sort = $("#candidate-sort").value;
  let list = currentCandidates.filter((c) => {
    const state = itemState(c);
    return (
      (all || state.ok) &&
      (!search ||
        [
          named(c.name),
          c.name?.en,
          named(c.title),
          ...(c.keywords || []).map((k) => ruleInfo(k).label),
          ...(c.weapons || []).flatMap((w) => [named(w.name), w.name?.en]),
          textParts(named(c.description)),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(search))
    );
  });
  list.sort((a, b) =>
    sort === "points"
      ? (a.points ?? a.pips ?? Infinity) - (b.points ?? b.pips ?? Infinity)
      : named(a.name).localeCompare(named(b.name), "zh"),
  );
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
  const aside = $("#card-browser"),
    mobile = matchMedia("(max-width:760px)").matches;
  aside.classList.toggle("is-open", !!browser);
  $("#browser-backdrop").hidden = !browser || !mobile;
  document.body.classList.toggle("sheet-open", !!browser && mobile);
  if (mobile && browser) {
    aside.setAttribute("role", "dialog");
    aside.setAttribute("aria-modal", "true");
    $(".army-col").inert = true;
    $(".army-header").inert = true;
    $(".rank-nav").inert = true;
    $(".masthead").inert = true;
  } else {
    aside.removeAttribute("role");
    aside.removeAttribute("aria-modal");
    $(".army-col").inert = false;
    $(".army-header").inert = false;
    $(".rank-nav").inert = false;
    $(".masthead").inert = false;
  }
  if (!browser) {
    currentCandidates = [];
    $("#batch-apply").hidden = true;
    $("#candidate-search").disabled = true;
    $("#candidate-sort").disabled = true;
    $("#show-unavailable").disabled = true;
    $("#browser-title").textContent = "候选资料库";
    $("#browser-context").textContent = "选择军阶、升级槽位或战术卡槽位开始配置。";
    $("#card-grid").replaceChildren(
      node("p", "empty-result", "左侧保留你的当前编制，候选规则将在这里显示。"),
    );
    $("#browser-category").textContent = "编制对照";
    $("#result-count").textContent = "";
    return;
  }
  $("#candidate-search").disabled = false;
  $("#candidate-sort").disabled = false;
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
    currentCandidates = Object.values(data.units).filter(
      (u) =>
        u.usage !== "counterpart" &&
        !u.isCounterpart &&
        rankOf(u, army.armyId) === browser.rank,
    );
  } else if (browser.mode === "upgrades") {
    const inst = army.units.find((i) => i.instanceId === browser.unitInstanceId),
      u = inst && data.units[inst.unitId];
    if (!u || unitSlotRecords(u, inst)[browser.slotIndex]?.key !== browser.slotKey) {
      browser = null;
      renderBrowser();
      return;
    }
    const group = groupedUnits().find((g) =>
      g.instances.some((i) => i.instanceId === inst.instanceId),
    );
    const groupIds = group.instances.map((i) => i.instanceId);
    if (JSON.stringify(browser.groupIds) !== JSON.stringify(groupIds))
      cardView.applyAll = false;
    browser.groupIds = groupIds;
    $("#browser-title").textContent = "选择" + slotName(browser.slotKey);
    $("#browser-context").textContent =
      named(u.name) + " / " + slotName(browser.slotKey) + "槽位";
    $("#browser-category").textContent = "升级资料库";
    currentCandidates = Object.values(data.upgrades).map((c) => displayUpgrade(c, inst)).filter((c) =>
      accessOf(c).includes(browser.slotKey),
    );
  } else {
    const p = commandSlotPips()[browser.slotIndex];
    $("#browser-title").textContent = "选择战术卡";
    $("#browser-context").textContent =
      p + " 牌点 / 第 " + (browser.slotIndex + 1) + " 个战术卡槽位";
    $("#browser-category").textContent = "战术资料库";
    currentCandidates = data.defs.commands.filter((c) => !c.hidden && slotPipOf(c) === p);
  }
  stateCache.clear();
  updateBatchControl();
  filterCandidates();
}

function renderRankBar(report) {
  const bar = $("#rank-bar");
  bar.replaceChildren();
  const rules = BuilderLibrary.configuration(army, data).rules;
  for (const rank of RANK_ORDER) {
    const count = army.units.filter(
      (i) => data.units[i.unitId] && rankOf(data.units[i.unitId], army.armyId) === rank,
    ).length;
    const quota = (rules.rankQuotas || []).find((q) => q.rankId === rank);
    const b = node(
      "button",
      "rank-chip" + (browser?.mode === "units" && browser.rank === rank ? " active" : ""),
    );
    b.setAttribute("aria-label", "添加" + RANK_SHORT[rank] + "单位");
    b.setAttribute(
      "aria-pressed",
      String(browser?.mode === "units" && browser.rank === rank),
    );
    const rankIssues = report.issues.filter((i) => i.status === "invalid" &&
      (Number(i.rank) === rank || (i.ranks || []).map(Number).includes(rank)));
    if (rankIssues.length)
      b.classList.add("invalid");
    b.dataset.rank = rank;
    b.classList.toggle("empty", count === 0);
    const text = node("span", "rank-name", RANK_SHORT[rank]);
    const limits = quota ? (quota.min ?? 0) + "–" + (quota.max ?? "不限") : "未设配额";
    const total = node("span", "rank-count");
    const countDisplay = node("strong", "rank-total", count || "—");
    countDisplay.setAttribute("aria-label", "当前 " + count + " 个单位");
    total.append(countDisplay, node("span", "rank-quota", "（/" + (quota?.max ?? "∞") + "）"));
    b.append(node("span", "rank-icon", RANK_GLYPH[rank]), text, total, node("span", "rank-add", "+"));
    b.title = "当前 " + count + " 个" + RANK_SHORT[rank] + "单位；允许数量 " + limits + "；点击添加";
    if (rankIssues.length) b.title += "\n" + rankIssues.map(i => i.message).join("\n");
    b.onclick = () => selectContext({ mode: "units", rank }, b);
    bar.append(b);
  }
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
      army.commandIds.filter(Boolean).length + " / " + commandSlots(),
    ),
  );
  deck.append(head);
  const list = node("div", "deck-list");
  commandSlotPips().forEach((p, index) => {
    const c = commandOf(army.commandIds[index]);
    if (c && String(c.id) === "8") {
      const standing = node("button", "standing-order-tag", named(c.name));
      standing.title = c.name.en;
      standing.setAttribute("aria-label", "查看" + named(c.name) + "原图");
      standing.onclick = () => showImage(c);
      head.insertBefore(standing, head.lastChild);
      return;
    }
    if (c) {
      const valid = commandAvailable(c) && slotPipOf(c) === p;
      list.append(
        commandCard(c, {
          slotIndex: index,
          state: {
            kind: valid ? "chosen" : "blocked",
            reason: valid ? "" : "当前军表不满足此卡条件",
          },
        }),
      );
    } else {
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
      choose.onclick = () => openDeckSlot(kind, label, index);
      slot.append(choose);
      if (selected[index]) {
        const actions = node("div", "mission-card-actions");
        if (card?.image) {
          const preview = node("button", null, "查看");
          preview.setAttribute("aria-label", "查看" + named(card.name) + "大图");
          preview.onclick = () => showImage(card);
          actions.append(preview);
        }
        const remove = node("button", null, "×");
        remove.setAttribute("aria-label", `移除${label}第 ${index + 1} 张`);
        remove.onclick = () => {
          army.deck = BuilderLibrary.setDeckCard(army.deck, kind, index, null);
          render();
        };
        actions.append(remove);
        slot.append(actions);
      }
      slots.append(slot);
    }
    section.append(heading, slots);
    missions.append(section);
  }
  deck.append(missions);
}

function renderPoints(report) {
  const lim = army.pointsLimit || 1000;
  $("#points").replaceChildren(
    node("b", null, report.basePoints),
    node("span", "limit", "/ " + lim),
    node("span", "remaining", "剩余 " + (lim - report.basePoints) + " 分"),
  );
  $("#points-fill").style.width = Math.min(100, (report.basePoints / lim) * 100) + "%";
  $("#summary-units").textContent = army.units.length;
  $("#summary-commands").replaceChildren(
    document.createTextNode(army.commandIds.filter(Boolean).length),
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

function statMatrix(u) {
  const bar = node("dl", "attribute-band");
  const s = u.stats || {};
  const fields = [
    ["模型", "models", s.models],
    ["生命", "wounds", s.wounds ?? s.woundsSymbol],
    ["防御", "defense", s.defenseDie],
    s.resilience != null || s.resilienceSymbol
      ? ["韧性", "resilience", s.resilience ?? s.resilienceSymbol]
      : ["勇气", "courage", s.courage ?? s.courageSymbol],
    ["速度", "speed", s.speed],
    ["攻增", "attack", s.attackSurge],
    ["防增", "defenseSurge", s.defenseSurge],
  ];
  for (const [label, key, value] of fields) {
    if (value == null) continue;
    const cell = node("div", "attribute"),
      dd = node("dd");
    cell.title = label;
    cell.setAttribute("aria-label", label + "：" + value);
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
    (data.units[inst.unitId]?.points || 0) +
    inst.upgrades.reduce((s, ch) => s + (data.upgrades[ch.upgradeId]?.points || 0), 0)
  );
}

function displayUpgrade(c, inst = null) {
  const host = data.units[inst?.unitId || army?.units.find((i) => i.instanceId === browser?.unitInstanceId)?.unitId];
  return BuilderModel.upgradePresentation(c, data, host);
}

function battleCardArt(card) {
  const frame = node("span", "battle-card-art");
  const rules = textParts(named(card.rules)).trim();
  if (!rules) {
    if (card.image) {
      const im = node("img"); im.src = assetPath(card.image); im.alt = named(card.name) + "卡图"; im.loading = "lazy";
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
    const im = node("img");im.src = assetPath(card.image);im.alt = named(card.name) + "卡图";im.loading = "lazy";
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
    const im = node("img"); im.src = assetPath(card.image); im.alt = named(card.name) + "部署地图";im.loading = "lazy";
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
  const src = c.assets?.portrait || c.assets?.front || c.image;
  if (!src) {
    b.append(node("span", null, "暂无卡图"));
    b.disabled = true;
    return b;
  }
  const im = node("img");
  im.src = assetPath(src);
  im.alt = named(c.name) + "卡图";
  im.loading = "lazy";
  im.onerror = () => {
    im.remove();
    b.append(node("span", null, "卡图暂不可用"));
  };
  b.append(im);
  b.onclick = (e) => {
    e.stopPropagation();
    showImage(c);
  };
  return b;
}

function showImage(c) {
  c = displayUpgrade(c);
  imageDialog.replaceChildren();
  const h = node("div", "dialog-head");
  h.append(node("h2", null, named(c.name)));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭卡图");
  close.onclick = () => imageDialog.close();
  h.append(close);
  const battle = c.image?.startsWith("assets/battle-deck/");
  const im = battle ? battleCardArt(c) : node("img", "full-card-image");
  if (!battle) {
    im.src = assetPath(c.assets?.front || c.image);
    im.alt = named(c.name) + "完整卡图";
  }
  imageDialog.append(h, im);
  const effect = upgradeEffect(c);
  const rules = textParts(named(c.rules));
  if (!battle && (effect.childNodes.length || rules)) {
    const section = node("section", "image-card-effect");
    section.append(node("h3", null, "卡牌效果"));
    if (effect.childNodes.length) section.append(effect);
    else section.append(proseNode(rules));
    imageDialog.append(section);
  }
  if (c.keywords?.length) imageDialog.append(ruleTags(c.keywords.map((k) =>
    ({ ...(typeof k === "string" ? { id: k } : k), origins: c.counterpart ? [c] : [] }))));
  showDialog(imageDialog);
}

function upgradeEffect(c) {
  const effect = node("div", "upgrade-effect");
  const description = textParts(named(c.description));
  if (description) effect.append(proseNode(description));
  if (c.counterpart) {
    const heading = node("p", "counterpart-heading", "伙伴单位 · " + named(c.counterpart.name));
    const stats = c.counterpart.stats;
    if (stats?.models != null) heading.append(node("span", null, "模型 " + stats.models));
    if (stats?.wounds != null) heading.append(node("span", null, "生命 " + stats.wounds));
    effect.append(heading);
    for (const k of uniqueRules(c.counterpart.keywords)) {
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
    k.action ?? null,
  ]);
}

function keywordEntries(inst) {
  const u = data.units[inst.unitId],
    map = new Map();
  const add = (k, origin) => {
    const item = typeof k === "string" ? { id: k } : k;
    if (!item) return;
    const key = keywordKey(item);
    if (!map.has(key)) map.set(key, { ...item, origins: [] });
    const current = map.get(key);
    if (origin && !current.origins.some((x) => x.id === origin.id))
      current.origins.push(origin);
  };
  for (const k of u?.keywords || []) add(k, null);
  for (const choice of inst.upgrades) {
    const c = displayUpgrade(data.upgrades[choice.upgradeId], inst);
    for (const k of c?.keywords || []) add(k, c);
  }
  return [...map.values()];
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

function tag(k, { forceOpen = false, timing = false } = {}) {
  const info = ruleInfo(k);
  const key = JSON.stringify([keywordKey(info.item), (k.origins || []).map((c) => c.id)]);
  const outer = node("span", "rule-tag");
  outer.dataset.ruleId = info.item.id;
  outer.dataset.ruleKey = key;
  const main = node("button", "rule-tag-main");
  main.type = "button";
  if (timing) main.append(timingMarkers(info.ref?.timing));
  if (info.item.action && info.item.action !== "none")
    main.append(
      node(
        "span",
        "rule-action",
        info.item.action === "free-action" ? "免费行动" : "行动",
      ),
    );
  main.append(actionText(info.label));
  if (k.origins?.length)
    main.append(
      node(
        "small",
        "rule-origin",
        k.origins.map((c) => "来自 " + named(c.name)).join(" / "),
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
    const expanded = forceOpen || cardView.explanations || cardView.tags.has(key);
    toggle.textContent = expanded ? "−" : "＋";
    toggle.setAttribute("aria-label", (expanded ? "收起" : "展开") + info.label + "释义");
    toggle.setAttribute("aria-expanded", String(expanded));
    const body = node("span", "tag-summary");
    body.append(proseNode(summary));
    body.hidden = !expanded;
    outer.classList.toggle("open", expanded);
    toggle.onclick = (e) => {
      e.stopPropagation();
      const next = body.hidden;
      body.hidden = !next;
      outer.classList.toggle("open", next);
      toggle.textContent = next ? "−" : "＋";
      toggle.setAttribute("aria-expanded", String(next));
      if (next) cardView.tags.add(key);
      else cardView.tags.delete(key);
    };
    outer.append(toggle, body);
  }
  return outer;
}

function phaseRules(ks, forceOpen = false) {
  const list = node("div", "phase-rules");
  const order = Object.keys(TIMING_LABEL),
    groups = new Map();
  for (const k of uniqueRules(ks)) {
    const ts = (ruleInfo(k).ref?.timing || []).filter(Boolean);
    const key = ts.length
      ? [...new Set(ts)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join("|")
      : "unclassified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  }
  for (const [key, entries] of [...groups].sort(
    (a, b) => order.indexOf(a[0].split("|")[0]) - order.indexOf(b[0].split("|")[0]),
  )) {
    const row = node("div", "phase-row");
    row.dataset.phase = key.split("|")[0];
    const label = node(
      "div",
      "phase-title",
      key
        .split("|")
        .map((t) => TIMING_LABEL[t] || t)
        .join(" / "),
    );
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

function weaponBlock(w, origin, forceOpen = false, timing = false) {
  const card = node("div", "weapon-card"),
    head = node("div", "weapon-card-head");
  const name = node("div", "weapon-title");
  name.append(node("b", null, named(w.name)));
  if (w.name?.zh && w.name?.en && w.name.zh !== w.name.en)
    name.append(node("span", "weapon-english", w.name.en));
  if (origin) name.append(node("small", "weapon-origin", "来自 " + named(origin.name)));
  head.append(name);
  const r = w.range;
  if (r?.min != null) {
    const kind = r.min === 0 ? (r.max === 0 ? "melee" : "mixed") : "ranged";
    const range = node("span", "range-pill " + kind);
    range.append(
      node(
        "small",
        null,
        kind === "melee" ? "近战" : kind === "mixed" ? "近 / 远" : "远程",
      ),
      node("b", null, r.max == null || r.min === r.max ? r.min : r.min + "–" + r.max),
    );
    head.append(range);
  }
  head.append(dicePool(w.dice));
  card.append(head);
  if (w.keywords?.length) {
    const ks = node("div", "weapon-tags");
    for (const k of uniqueRules(w.keywords))
      ks.append(
        tag(
          { ...(typeof k === "string" ? { id: k } : k), origins: origin ? [origin] : [] },
          { forceOpen, timing },
        ),
      );
    card.append(ks);
  }
  if (Object.values(w.dice || {}).some((v) => v < 0) && origin) {
    const p = node("p", "variable-dice-note");
    p.append(proseNode(textParts(named(origin.description))));
    card.append(p);
  }
  return card;
}

function unitWeapons(inst, forceOpen = false, timing = false) {
  const u = data.units[inst.unitId],
    list = [
      ...(u?.weapons || []).map((w) => ({ w, origin: null })),
      ...inst.upgrades.flatMap((ch) => {
        const c = displayUpgrade(data.upgrades[ch.upgradeId], inst);
        return (c?.weapons || []).map((w) => ({ w, origin: c }));
      }),
    ];
  const out = node("div", "weapon-groups");
  for (const [key, label, test] of [
    ["melee", "近战可用武器", (w) => w.range?.min === 0],
    ["ranged", "远程武器", (w) => w.range?.min > 0],
    ["unknown", "射程待确认", (w) => w.range?.min == null],
  ]) {
    const found = list.filter((x) => test(x.w));
    if (!found.length) continue;
    const group = node("section", "weapon-group " + key);
    group.append(node("h4", null, label));
    for (const { w, origin } of found)
      group.append(weaponBlock(w, origin, forceOpen, timing));
    out.append(group);
  }
  return out;
}

function weaponRows(ws) {
  const wrap = node("div", "weapon-groups");
  for (const w of ws || []) wrap.append(weaponBlock(w, null));
  return wrap;
}

function upgradeDetail(c, { forceOpen = false, compact = false } = {}) {
  c = displayUpgrade(c);
  const box = node("article", "upgrade-detail");
  const h = node("div", "upgrade-line");
  h.append(artButton(c, "upgrade-art"), node("b", null, named(c.name)));
  if (c.name?.zh && c.name.en && c.name.zh !== c.name.en)
    h.append(node("span", "upgrade-english", c.name.en));
  h.append(usageBadges(c));
  if (c.points != null) h.append(node("span", "upgrade-cost", c.points + " 分"));
  box.append(h);
  const effect = upgradeEffect(c);
  if (effect.childNodes.length) box.append(effect);
  if (!compact) {
    const req = textParts(
      c.restrictions?.text?.zh || c.requirementsText || c.restrictions?.text?.en,
    );
    if (req) {
      const p = node("div", "upgrade-requirements", "使用要求：");
      p.append(proseNode(req));
      box.append(p);
    }
  }
  const footer = node("div", "upgrade-tags");
  for (const k of uniqueRules(c.keywords))
    footer.append(
      tag({ ...(typeof k === "string" ? { id: k } : k), origins: [c] }, { forceOpen }),
    );
  if (c.weapons?.length) {
    const b = node(
      "button",
      "weapon-inspect",
      "查看武器属性 · " + c.weapons.map((w) => named(w.name)).join(" / "),
    );
    b.onclick = (e) => {
      e.stopPropagation();
      showWeapons(c);
    };
    footer.append(b);
  }
  if (footer.children.length) box.append(footer);
  return box;
}

function showWeapons(c) {
  weaponDialog.replaceChildren();
  const h = node("div", "dialog-head");
  h.append(node("h2", null, named(c.name) + " · 武器"));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭武器属性");
  close.onclick = () => weaponDialog.close();
  h.append(close);
  weaponDialog.append(h);
  for (const w of c.weapons || []) weaponDialog.append(weaponBlock(w, c, true));
  showDialog(weaponDialog);
}

function hideRule(restoreFocus = true) {
  rulePop.hidden = true;
  if (restoreFocus) ruleAnchor?.focus?.();
}

function openRule(k, anchor) {
  if (typeof k === "string") k = { id: k };
  const { ref, label } = ruleInfo(k);
  ruleAnchor = anchor;
  rulePop.replaceChildren();
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
      (ref?.timing || []).map((t) => TIMING_LABEL[t] || t).join(" / "),
    ),
  );
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
      node("h4", null, "来自 " + named(c.name)),
      upgradeDetail(c, { compact: false }),
    );
    rulePop.append(src);
  }
  const parent = anchor?.closest("dialog") || modalStack.filter((dialog) => dialog.open).at(-1);
  (parent || document.body).append(rulePop);
  rulePop.hidden = false;
  positionRulePopover(anchor);
  close.focus();
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
  cardView.applyAll = false;
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

function expandedContents(inst, { forceOpen = false } = {}) {
  const u = data.units[inst.unitId],
    out = node("div", "unit-expanded");
  const rules = keywordEntries(inst);
  if (rules.length) out.append(phaseRules(rules, forceOpen));
  out.append(unitWeapons(inst, forceOpen));
  if (inst.upgrades.length) {
    const section = node("section", "selected-upgrades");
    section.append(node("h4", "compact-section-title", "升级卡"));
    for (const ch of inst.upgrades) {
      const c = displayUpgrade(data.upgrades[ch.upgradeId], inst);
      if (c) section.append(upgradeDetail(c, { forceOpen, compact: true }));
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
  card.dataset.count = instances.length;
  card.dataset.instance = inst.instanceId;
  const h = briefHeader(u, inst, group, { detail });
  const toggle = node("button", "expand-unit", isOpen ? "⌃" : "⌄");
  toggle.setAttribute("aria-label", (isOpen ? "收起" : "展开") + named(u.name));
  toggle.setAttribute("aria-expanded", String(isOpen));
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
  card.append(h);
  if (!detail) {
    const summary = h.querySelector(".brief-first");
    summary.setAttribute("tabindex", "0");
    summary.setAttribute("role", "button");
    summary.setAttribute("aria-label", "查看" + named(u.name) + "完整详情");
    h.onclick = (e) => {
      if (!e.target.closest("button,.compact-slots")) showUnitDetail(group);
    };
    h.onkeydown = (e) => {
      if (e.target === summary && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        showUnitDetail(group);
      }
    };
  }
  if (isOpen) card.append(expandedContents(inst, { forceOpen: detail }));
  return card;
}

function showUnitDetail(group) {
  unitDetail.replaceChildren();
  const h = node("div", "dialog-head");
  h.append(node("h2", null, "单位完整详情"));
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭单位详情");
  close.onclick = () => unitDetail.close();
  h.append(close);
  unitDetail.append(h, rosterCard(group, { detail: true }));
  showDialog(unitDetail);
}

function renderUnits() {
  const list = $("#army-units");
  list.classList.add("grouped-army-list");
  list.replaceChildren();
  for (const g of groupedUnits()) list.append(rosterCard(g));
  const b = node("button", "add-unit", "＋ 添加单位");
  b.onclick = () => selectContext({ mode: "units", rank: 2 }, b);
  list.append(b);
}

function timingMarkers(timings) {
  const markers = node("span", "timing-markers");
  const list = [...new Set(timings?.length ? timings : ["unclassified"])];
  markers.title = list.map((t) => TIMING_LABEL[t] || t).join(" / ");
  markers.setAttribute("aria-label", "时机：" + markers.title);
  for (const t of list) {
    const mark = node("span", "timing-mark", TIMING_LABEL[t] || t);
    mark.dataset.timing = t;
    markers.append(mark);
  }
  return markers;
}
function ruleTags(keywords, options = {}) {
  const tags = node("div", "candidate-tags");
  for (const k of uniqueRules(keywords)) tags.append(tag(k, options));
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

function upgradeCandidate(c) {
  c = displayUpgrade(c);
  const state = itemState(c),
    item = node("article", "candidate upgrade-candidate " + state.kind);
  item.dataset.id = c.id;
  item.dataset.state = state.kind;
  const head = identity(c);
  head.prepend(artButton(c, "upgrade-art candidate-art"));
  head.querySelector(".identity-main").append(usageBadges(c));
  item.append(head);
  const req = textParts(
    c.restrictions?.text?.zh || c.requirementsText || c.restrictions?.text?.en,
  );
  if (req) {
    const p = node("div", "requirements");
    p.append(node("b", null, "使用要求"), proseNode(req));
    item.append(p);
  }
  const effect = upgradeEffect(c);
  if (effect.childNodes.length) item.append(effect);
  const tags = node("div", "upgrade-tags");
  for (const k of uniqueRules(c.keywords))
    tags.append(tag({ ...(typeof k === "string" ? { id: k } : k), origins: [c] }));
  if (tags.children.length) item.append(tags);
  if (c.weapons?.length) {
    const b = node(
      "button",
      "weapon-inspect candidate-weapon-link",
      "查看武器属性 · " + c.weapons.map((w) => named(w.name)).join(" / "),
    );
    b.onclick = () => showWeapons(c);
    item.append(b);
  }
  item.append(candidateStatus(state));
  return selectableCandidate(item, c, state);
}

function candidate(c) {
  if (browser.mode === "upgrades") return upgradeCandidate(c);
  if (browser.mode !== "units") return commandCandidate(c);
  const inst = { unitId: c.id, instanceId: "candidate-" + c.id, upgrades: [] };
  const group = { unit: c, instances: [inst] },
    state = itemState(c);
  const open = cardView.candidateExpanded.has(c.id);
  const card = node(
    "article",
    "candidate unit-candidate " + state.kind + (open ? " expanded" : ""),
  );
  card.dataset.id = c.id;
  card.dataset.state = state.kind;
  const art = artButton(c, "unit-art candidate-portrait");
  const content = node("div", "unit-candidate-content");
  const head = briefHeader(c, inst, group, { candidateMode: true });
  const toggle = node("button", "expand-unit", open ? "⌃" : "⌄");
  toggle.setAttribute("aria-label", (open ? "收起" : "展开") + named(c.name) + "候选");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.onclick = (e) => {
    e.stopPropagation();
    if (open) cardView.candidateExpanded.delete(c.id);
    else cardView.candidateExpanded.add(c.id);
    filterCandidates();
    [...$("#card-grid").children]
      .find((n) => n.dataset.id === c.id)
      ?.querySelector(".expand-unit")
      ?.focus({ preventScroll: true });
  };
  head.append(toggle);
  content.append(
    head,
    ruleTags(c.keywords, { forceOpen: open, timing: true }),
    unitWeapons(inst, open, true),
    candidateStatus(state),
  );
  card.append(art, content);
  return selectableCandidate(card, c, state);
}

function showDialog(dialog) {
  hideRule(false);
  if (dialog.open) return;
  dialog.showModal();
  modalStack.push(dialog);
  dialog.addEventListener(
    "close",
    () => {
      const index = modalStack.lastIndexOf(dialog);
      if (index >= 0) modalStack.splice(index, 1);
    },
    { once: true },
  );
}
function briefHeader(
  unit,
  instance,
  group,
  { candidateMode = false, detail = false } = {},
) {
  const header = node(
    "div",
    "unit-brief" +
      (candidateMode ? " candidate-brief" : "") +
      (detail ? " detail-brief" : ""),
  );
  if (!candidateMode && !detail) {
    const controls = node("div", "instance-controls");
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
        plus,
        node("span", "group-count", "×" + group.instances.length),
        minus,
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
    header.append(controls);
  }
  if (!candidateMode) header.append(artButton(unit));
  const body = node("div", "brief-body"),
    first = node("div", "brief-first"),
    name = node("div", "bilingual-name");
  name.append(node("b", null, named(unit.name)));
  if (unit.name?.zh && unit.name.en && unit.name.en !== unit.name.zh)
    name.append(node("span", null, unit.name.en));
  first.append(name, statMatrix(unit));
  const second = node("div", "brief-meta");
  second.append(node("span", "rank-icon", RANK_GLYPH[rankOf(unit, army.armyId)] || ""));
  second.append(
    node(
      "span",
      "rank-label-inline",
      [
        named(data.defs.ranks.find((r) => r.id === rankOf(unit, army.armyId))?.name),
        named(data.defs.unitTypes.find((t) => t.id === unit.unitTypeId)?.name),
        isUnique(unit) ? "独特" : "",
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
  body.append(first, second, slotStrip(group, { readonly: candidateMode || detail }));
  header.append(body);
  const cost = node("div", "brief-cost"),
    single = candidateMode ? unit.points : perUnitPoints(instance),
    quantity = candidateMode || detail ? 1 : group.instances.length;
  if (single != null) {
    cost.append(node("b", null, single * quantity), node("small", null, "分"));
    if (quantity > 1) cost.append(node("span", null, single + " × " + quantity));
  }
  first.append(cost);
  return header;
}
function slotStrip(group, { readonly = false } = {}) {
  const inst = group.instances[0],
    u = group.unit,
    strip = node("div", "compact-slots");
  const records = unitSlotRecords(u, inst),
    displayed = new Set();
  function slot(rec, index, chosen, orphan = false) {
    const c = chosen && displayUpgrade(data.upgrades[chosen.upgradeId], inst);
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
    if (c) row.append(artButton(c, "slot-art"));
    const label = node(readonly || orphan ? "span" : "button", "slot-name");
    label.append(
      node("span", "slot-glyph", rec ? slotDef(rec.key)?.iconGlyph || "+" : "!"),
      document.createTextNode(name),
    );
    if (c?.points != null) label.append(node("span", "slot-cost", c.points + "分"));
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
        inst.upgrades = inst.upgrades.filter((ch) => ch !== chosen);
        setStatus("已从 1 个单位移除 " + name);
        render();
      };
      row.append(remove);
    }
    strip.append(row);
    if (chosen) displayed.add(chosen);
  }
  records.forEach((rec, index) => {
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
  });
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
    image.src = assetPath(src);
    image.alt = named(card.name) + "卡图";
    image.loading = "lazy";
    image.onerror = () => {
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
    const remove = node("button", "command-remove", "×");
    remove.setAttribute("aria-label", "移除" + named(card.name));
    remove.onclick = () => {
      army.commandIds[slotIndex] = null;
      render();
    };
    title.append(remove);
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
  const requirements = RulesCore.commandUnitRequirements(card, army, data.units, data.defs);
  if (requirements.length) {
    const line = node("div", "command-unit-requirements");
    line.append(node("span", null, "同时编入"));
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
      else showImage(card);
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
      else if (src) showImage(card);
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
  if (browser?.mode === "upgrades")
    $("#browser-context").textContent +=
      " / " + (n > 1 ? "合并组 " + n + " 个，默认只改 1 个" : "仅当前单位");
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
        (inst ? named(data.units[inst.unitId]?.name) + "：" : "") + issue.message,
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
  input.focus();
}
function wireEditor() {
  $("#browser-close").onclick = closeBrowser;
  $("#browser-backdrop").onclick = closeBrowser;
  $("#candidate-search").oninput = filterCandidates;
  $("#candidate-sort").onchange = filterCandidates;
  $("#show-unavailable").onchange = filterCandidates;
  $("#apply-all-units").onchange = () => {
    cardView.applyAll = $("#apply-all-units").checked;
    stateCache.clear();
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
