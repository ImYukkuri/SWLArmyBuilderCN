/* Static list builder — one shared card browser: rank chip → unit cards, slot chip → upgrade cards. */
const $ = (s) => document.querySelector(s);
const el = (t, s) => {
  const n = document.createElement(t);
  if (s !== undefined) n.textContent = s;
  return n;
};
const uid = () => crypto.randomUUID();
const cardUsage = CardUsage.create();
const candidateSortModes = {units:'usage', upgrades:'usage', commands:'name'};
let data = null,
  army = null,
  browser = null;
const Q = new URLSearchParams(location.search),
  DATA_BASE = Q.get("base") || "";

const RANK_ORDER = [1, 6, 2, 3, 4, 5, 7];
const RANK_SHORT = { 1: "指挥", 6: "特工", 2: "核心", 3: "特种", 4: "支援", 5: "重型", 7: "飞机" };

let unitNameIndex = null;
const ORDER_GLYPH = {
  "rank-commander": "5",
  "rank-operative": "b",
  "rank-corps": "6",
  "rank-special-forces": "7",
  "rank-special": "7",
  "rank-support": "8",
  "rank-heavy": "9",
};
async function loadFile(path) {
  let resp;
  try {
    resp = await fetch(path);
  } catch (e) {
    throw Error(path + " 无法读取（" + e.message + "）");
  }
  if (!resp.ok) throw Error(path + " → HTTP " + resp.status);
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw Error(
      path +
        " 不是有效 JSON（开头是「" +
        text.trim().slice(0, 24).replace(String.fromCharCode(10), " ") +
        "」）。请用 Live Server 以 SWLArmyBuilderCN 目录为根启动，或运行 python server.py --port 8770",
    );
  }
}

async function load() {
  try {
    const [uj, gj, dj, pj, bj, tj] = await Promise.all([
      loadFile(DATA_BASE + "data/units.json"),
      loadFile(DATA_BASE + "data/upgrades.json"),
      loadFile(DATA_BASE + "data/catalog-definitions.json"),
      loadFile(DATA_BASE + "data/slot-rules.json"),
      loadFile(DATA_BASE + "data/battle-deck.json"),
      loadFile(DATA_BASE + "data/tts-names.json"),
    ]);
    data = {
      units: Object.fromEntries(uj.units.map((u) => [u.id, u])),
      unitIdAliases: uj.idAliases || {},
      upgrades: UpgradeFaces.index(gj.cards),
      defs: dj,
      pkg: pj,
      deckData: bj,
      ttsNames: tj,
    };
    RulesCore.prepareData(data);
    data.nameIndex = RulesCore.buildNameIndex(data.upgrades, data.defs);
    initializeLibrary();
    wireRosterActions();
    await navigateLibrary();
  } catch (error) {
    setStatus("数据载入失败：" + error.message, true);
  }
}

function rankOf(u, armyId) {
  return RulesCore.armyRank(u, armyId, data.pkg, data.defs, data.units);
}

function buildUnitNameIndex() {
  const idx = {};
  const add = (key, id) => {
    const k = String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/1/g, "i");
    if (k) {
      (idx[k] ||= new Set()).add(id);
    }
  };
  for (const u of Object.values(data.units)) {
    add(u.id, u.id);
    add((u.name && u.name.en) || "", u.id);
    add((u.name && u.name.zh) || "", u.id);
  }
  return idx;
}

function resolveUnitIdByName(name) {
  if (!unitNameIndex) unitNameIndex = buildUnitNameIndex();
  const k = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/1/g, "i");
  const hits = unitNameIndex[k] || new Set();
  return hits.size === 1 ? [...hits][0] : null;
}

function unitAvailability(u) {
  if (
    u.restrictions &&
    u.restrictions.condition &&
    RulesCore.restrictionConditionOk(u, u, data.pkg) === false
  )
    return { hidden: true, orphan: false };
  const limits = RulesCore.detachmentLimits(u, army.units, data.units, {...data, armyId: army.armyId});
  const count = army.units.filter(i => i.unitId === u.id).length;
  return {hidden: limits.caps.some(cap => count + 1 > cap),
    orphan: limits.caps.some(cap => count > cap)};
}

function isUnique(u) {
  return !!(u.rules && u.rules.unlimited === false);
}

function uniqueKey(u) {
  return String((u.name && u.name.en) || u.id).toLowerCase();
}

function alreadyInArmy(u) {
  if (!isUnique(u)) return false;
  const k = uniqueKey(u);
  return army.units.some((inst) => {
    const x = data.units[inst.unitId];
    return x && isUnique(x) && uniqueKey(x) === k;
  });
}

function setStatus(t, error) {
  const p = $("#status");
  if (!p) return;
  p.textContent = t;
  p.classList.toggle("error", !!error);
}

function slotDef(key) {
  return UnitCardView.slotDefinition(key, data);
}

function slotName(key) {
  return UnitCardView.slotName(key, data);
}

function unitSlotRecords(u, inst) {
  data = RulesCore.resolveArmyData(army,data);
  u = RulesCore.unitFor(inst,army,data) || u;
  return RulesCore.slotListFor(data.pkg, u, inst, data.upgrades, army.armyId);
}

function accessOf(card) {
  const rule =
    (data.pkg.upgradeRules || {})[String((card.upstream && card.upstream.id) || "")] || {};
  return RulesCore.accessKeys(card, data.pkg, rule);
}

function instUpstreamIds(inst) {
  const s = new Set();
  for (const ch of inst.upgrades || []) {
    const c = data.upgrades[ch.upgradeId];
    if (c && c.upstream) s.add(String(c.upstream.id));
  }
  return s;
}

function slotVisible(inst, rec, i) {
  if ((inst.upgrades || []).some((x) => x.slotIndex === i)) return false;
  if (rec.unlockedBy && !instUpstreamIds(inst).has(String(rec.unlockedBy))) return false;
  return true;
}

function nextEmptySlot(inst, records, after) {
  const order = BuilderModel.slotOrder(inst, records), start = order.indexOf(after);
  for (let k = 1; k <= order.length; k++) {
    const i = order[(start + k) % order.length];
    if (slotVisible(inst, records[i], i)) return i;
  }
  return -1;
}

function invalidMarks(report) {
  const units = new Set(),
    ranks = new Set();
  for (const i of (report && report.issues) || []) {
    if (i.status !== "invalid") continue;
    if (i.rank != null) ranks.add(Number(i.rank));
    for (const rank of i.ranks || []) ranks.add(Number(rank));
    const key = i.instanceId;
    if (!key) continue;
    if (army.units.some((u) => u.instanceId === key)) {
      units.add(key);
      continue;
    }
    for (const u of army.units) {
      if ((u.upgrades || []).some((x) => x.instanceId === key)) {
        units.add(u.instanceId);
        break;
      }
    }
  }
  return { units, ranks };
}

function wireRosterActions(){
  const ex=$('#roster-export'),im=$('#roster-import'),sh=$('#roster-share');
  if(!ex||!im||!sh)return;
  ex.onclick=()=>openTransferDialog('export');
  im.onclick=()=>openTransferDialog('import');
  $('#library-import').onclick=()=>openTransferDialog('import');
  sh.onclick=()=>openShareDialog();
  const play = $("#roster-play");
  if (play) play.onclick = () => {
    if (!activeRecord || !army) return;
    if (!saveActiveRoster()) return;
    const target = new URL("play.html", location.href);
    target.searchParams.set("roster", activeRecord.id);
    if (DATA_BASE) target.searchParams.set("base", DATA_BASE);
    location.assign(target);
  };
}
function renderFaction() {
  const base = BuilderLibrary.faction(activeRecord.factionId, data);
  document.documentElement.style.setProperty("--faction", base.color);
  $("#faction-label").textContent = base.name;
  $("#faction-en").textContent = base.en;
  if (document.activeElement !== $("#roster-name"))
    $("#roster-name").value = activeRecord.name;
  const select = $("#battleforce");
  select.replaceChildren(new Option(base.id === 8 ? "标准规则" : "无 · 基础规则", String(base.id)));
  for (const entry of BuilderLibrary.battleforces(base.id, data))
    select.append(new Option(named(entry.name), String(entry.id)));
  if (![...select.options].some((o) => Number(o.value) === army.armyId))
    select.append(
      new Option(
        named(data.defs.armies.find((a) => a.id === army.armyId)?.name) || "原军队配置",
        String(army.armyId),
      ),
    );
  select.value = army.armyId;
  select.onchange = () => {
    if (Number(select.value) === army.armyId) return;
    army = BuilderLibrary.switchBattleForce(army, Number(select.value));
    data=RulesCore.resolveArmyData(army,data);
    RulesCore.cleanupArmy(army,data);
    hideRule(false);
    browser = null;
    cardView.applyAll = false;
    cardView.expanded.clear();
    setStatus("已切换战斗部队，已清空单位及其升级。");
    render();
  };
  $("#battleforce-info").onclick = () => showBattleForceRules();
}

function renderMode() {
  const config = BuilderLibrary.configuration(army, data);
  army.mode = config.mode;
  const input = $("#points-limit");
  input.querySelector('[data-legacy]')?.remove();
  // Preserve older/imported custom budgets until the player chooses a preset.
  if (![...input.options].some(o => Number(o.value) === army.pointsLimit)) {
    const legacy = new Option(army.pointsLimit + '（已存分数）', String(army.pointsLimit));
    legacy.disabled = true; legacy.dataset.legacy = 'true'; input.append(legacy);
  }
  input.value = army.pointsLimit;
  input.onchange = () => {
    const points = Number(input.value);
    if (![600, 800, 1000, 1200].includes(points)) return;
    army.pointsLimit = points;
    army.mode = BuilderLibrary.modeForPoints(points);
    setStatus("分数上限已更新为 " + points + "，编制限制已重新计算。");
    render();
  };
}

function commandOf(id) {
  return (data.defs.commands || []).find((c) => !c.hidden && String(c.id) === String(id)) || null;
}

function commandName(cmd) {
  return (cmd.name && (cmd.name.zh || cmd.name.en)) || String(cmd.id);
}

function unitMatchesUnlock(entry, u) {
  if (!entry || !u) return false;
  if (entry.id != null) return String(entry.id) === String((u.upstream || {}).id || "\0");
  const prop = entry.property,
    val = entry.value;
  if (prop === "faction") return Number(u.factionId) === Number(val);
  if (prop === "affiliation")
    return (u.affiliationIds || []).map(String).includes(String(val));
  if (prop === "unitType") return Number(u.unitTypeId) === Number(val);
  if (prop === "rank") return Number(u.rankId) === Number(val);
  if (prop === "keywords")
    return (u.keywords || []).some((k) => k && String(k.id) === String(val));
  return false;
}

function isMercenaryUnit(u) {
  if (!u) return false;
  if ((u.keywords || []).some((k) => k && k.id === "mercenary")) return true;
  return (u.factions || []).some((f) => f && (f.tierPools || []).includes("mercenary"));
}

let commandQuery = null;
function commandResult(cmd) {
  return RulesCore.commandEligibility(cmd,army,data,commandQuery || undefined);
}
function commandAvailable(cmd) { return !!cmd && commandResult(cmd).ok; }

function commandSlotPips() {
  return BuilderLibrary.commandSlots(army, data);
}

function commandSlots() {
  return commandSlotPips().length;
}

function slotPipOf(cmd) {
  return RulesCore.commandSlotPips(cmd);
}

function ownerLabel(cmd) {
  if (cmd.owner && String(cmd.owner).toLowerCase() === "generic") return "通用";
  if (cmd.owner) return cmd.owner;
  const armies = (data.defs.armies || []).map((a) => a.id);
  const facs = cmd.requirements ? [...new Set(cmd.requirements.any.flatMap(g=>g.all.filter(c=>["armyFaction","battleForce"].includes(c.type)).flatMap(c=>c.values)))] : cmd.factions || [];
  if (armies.length && armies.every((id) => facs.includes(id))) return "通用";
  const names = facs.map((id) => {
    const a = (data.defs.armies || []).find((x) => x.id === id);
    return a ? (a.name && (a.name.zh || a.name.en)) || String(id) : String(id);
  });
  if (!names.length) return "通用";
  return names.length > 3 ? names.slice(0, 3).join(" / ") + " …" : names.join(" / ");
}

function deckCatalog(kind) {
  return (kind === "primary" ? data.deckData.primary || data.deckData.deployments
    : kind === "secondary" ? data.deckData.secondary || data.deckData.objectives
      : data.deckData.conditions) || [];
}
function openDeckSlot(kind, label, index, opener) {
  document.getElementById("deck-picker")?.close();
  const dialog = node("dialog", "deck-picker-dialog");
  dialog.id = "deck-picker";
  dialog.classList.toggle("text-mode", cardView.battleText);
  dialog.setAttribute("aria-labelledby", "deck-picker-title");
  const head = node("div", "dialog-head");
  const heading = node("div");
  const title = node("h2", null, "选择" + label);
  title.id = "deck-picker-title";
  const context = node("p", "deck-picker-context");
  context.setAttribute("aria-live", "polite");
  heading.append(title, context);
  const close = node("button", null, "×");
  close.setAttribute("aria-label", "关闭任务卡选择");
  close.onclick = () => dialog.close();
  head.append(heading, battleTextToggle(), close);
  const grid = node("div", "deck-pick-grid");

  function draw() {
    const selected = new Set(BuilderLibrary.normalizeDeck(army.deck)[kind]);
    context.textContent = `第 ${index + 1} 张 · 已选 ${selected.size} / ${BuilderLibrary.DECK_LIMIT}`;
    const buttons = [];
    for (const card of deckCatalog(kind)) {
      if (selected.has(String(card.id))) continue;
      if (!BuilderLibrary.deckCardAvailable(card, army, data)) continue;
      const button = node("button", "deck-pick-card");
      button.dataset.id = card.id;
      button.setAttribute("aria-label", "选择" + named(card.name));
      button.append(battleCardArt(card), node("span", "battle-card-caption", named(card.name)));
      button.onclick = () => {
        army.deck = BuilderLibrary.setDeckCard(army.deck, kind, index, card.id);
        render();
        index = army.deck[kind].length;
        if (index >= BuilderLibrary.DECK_LIMIT) {
          dialog.close();
          return;
        }
        draw();
        dialog.scrollTop = 0;
        BuilderOverlays.focus(close);
      };
      buttons.push(button);
    }
    grid.replaceChildren(...buttons);
    if (!buttons.length) grid.append(node("p", "empty-result", "没有可选的" + label + "卡。"));
  }
  draw();
  dialog.append(head, grid);
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  showDialog(dialog, opener);
}

function save() {
  return saveActiveRoster();
}
function restore() {
  initializeLibrary();
}
function render() {
  if (!data || !army || !activeRecord) return;
  BuilderOverlays.preserveScroll(renderEditor);
}
function renderEditor() {
  data = RulesCore.resolveArmyData(army,data);
  UpgradeFaces.normalizeArmy(army, data);
  army.mode = BuilderLibrary.modeForPoints(army.pointsLimit);
  BuilderLibrary.normalizeCommandSlots(army, data);
  commandQuery = RulesCore.commandContext(army,data);
  const report = RulesCore.validateArmy(army, data);
  invalidUnitIds = invalidMarks(report).units;
  renderFaction();
  renderMode();
  renderPoints(report);
  renderRankBar(report);
  updateUnitList();
  renderDeck();
  renderArmyOptions();
  renderBrowser();
  renderIssues(report);
  const bad = report.issues.filter((i) => i.status === "invalid").length;
  const unknown = report.issues.filter((i) => i.status === "unknown").length;
  $("#issue-count").textContent = bad
    ? bad + " 项待调整"
    : unknown
      ? "规则待核对"
      : "校验通过";
  $("#view-toggle").textContent =
    army.units.length && army.units.every((i) => cardView.expanded.has(i.instanceId))
      ? "全部收起"
      : "全部展开";
  save();
}
function duplicateGroup(group) {
  const result = BuilderModel.duplicate(army, data, group.instances[0].instanceId, uid);
  if (!result.ok) {
    setStatus(result.reason, true);
    return;
  }
  army = result.draft;
  const copy = army.units.find(i => i.instanceId === result.instanceId);
  cardUsage.recordMany([{kind:'units',card:data.units[copy.unitId]},
    ...copy.upgrades.map(ch => ({kind:'upgrades',card:data.upgrades[ch.upgradeId]}))]);
  setStatus("已复制完整单位及其升级，合并显示为 " + (group.instances.length + 1) + " 个。");
  render();
}
function removeOne(group) {
  const id = group.instances.at(-1).instanceId;
  army.units = army.units.filter((i) => i.instanceId !== id);
  cardView.expanded.delete(id);
  if (browser?.unitInstanceId === id) browser = null;
  setStatus("已移除 1 个" + (named(group.unit?.name) || "单位") + "。");
  render();
}
function prepareUpgrade(card, previewContext = null) {
  return BuilderModel.equip(army, data, browser, card.id, cardView.applyAll, uid, card._face, previewContext);
}
function itemState(card) {
  const key = card.id + ":" + (card._face || "front");
  if (stateCache.has(key)) return stateCache.get(key);
  const state = computeItemState(card);
  stateCache.set(key, state);
  return state;
}
function computeItemState(card) {
  if (browser.mode === "units") {
    if (alreadyInArmy(card))
      return { kind: "chosen", label: "已加入军表", ok: false };
    if (unitAvailability(card).hidden)
      return {
        kind: "blocked",
        label: "不满足要求",
        reason: "需先加入对应的母单位，且不能超过其数量限制。",
        ok: false,
      };
    const result = BuilderModel.addUnit(army, data, card.id, uid, browser.rank);
    return result.ok
      ? { kind: "available", label: "点击加入军表", ok: true }
      : { kind: "blocked", label: "不可选择", reason: result.reason, ok: false };
  }
  if (browser.mode === "upgrades") {
    const first = army.units.find((i) => i.instanceId === browser.unitInstanceId);
    if (
      first?.upgrades.some((ch) => ch.slotIndex === browser.slotIndex && ch.upgradeId === card.id)
    )
      return { kind: "chosen", label: "已选入当前槽位", ok: false };
    const result = prepareUpgrade(card, equipPreviewContext);
    return result.ok
      ? {
          kind: "available",
          label:
            (cardView.applyAll
              ? "可应用到 " + result.count + " 个单位"
              : "可选择 · 仅应用到 1 个单位") +
            (result.warnings.length ? " · 条件待核对" : ""),
          reason: result.warnings.join("；"),
          ok: true,
        }
      : { kind: "blocked", label: "不满足要求", reason: result.reason, ok: false };
  }
  const chosen = String(army.commandIds[browser.slotIndex]) === String(card.id);
  const taken = army.commandIds.map(String).includes(String(card.id));
  return !commandAvailable(card)
      ? {
          kind: "blocked",
          label: "不满足要求",
          reason: commandResult(card).reason,
          ok: false,
        }
      : chosen
        ? { kind: "chosen", label: "已选择", ok: false }
      : taken
        ? {
            kind: "blocked",
            label: "不可选择",
            reason: "已配置在另一个战术卡槽位。",
            ok: false,
          }
        : { kind: "available", label: "可选择", ok: true };
}
function choose(card) {
  // Re-check current state, rather than trusting a previously rendered button.
  stateCache.clear();
  commandQuery = null;
  if (browser.mode !== 'upgrades' && !computeItemState(card).ok) return;
  if (browser.mode === "units") {
    const result = BuilderModel.addUnit(army, data, card.id, uid, browser.rank);
    if (!result.ok) {
      setStatus(result.reason, true);
      return;
    }
    army = result.draft;
    cardUsage.recordMany([{kind:'units',card}]);
    setStatus("已加入 " + named(card.name) + (result.warnings?.length ? "；" + result.warnings.join("；") : ""));
    closeBrowser();
    return;
  }
  if (browser.mode === "upgrades") {
    const result = prepareUpgrade(card);
    if (!result.ok) {
      setStatus(result.reason, true);
      return;
    }
    army = result.draft;
    cardUsage.recordMany([{kind:'upgrades',card,count:result.count}]);
    const first = army.units.find((i) => i.instanceId === result.ids[0]);
    const slot = first.upgrades.find(ch => ch.instanceId === result.chosenIds[0]).slotIndex;
    const records = unitSlotRecords(data.units[first.unitId], first);
    const next = nextEmptySlot(first, records, slot);
    $("#candidate-search").value = "";
    setStatus("已为 " + result.count + " 个单位装备 " + named(card.name) + "。");
    if (next < 0) {
      closeBrowser();
      return;
    }
    const group = groupedUnits().find((g) =>
      g.instances.some((i) => i.instanceId === first.instanceId),
    );
    const grid = $("#card-grid"), scrollTop = grid.scrollTop;
    browser = {
      mode: "upgrades",
      unitInstanceId: first.instanceId,
      slotIndex: next,
      slotKey: records[next].key,
      groupIds: group.instances.map((i) => i.instanceId),
    };
    render();
    grid.scrollTop = scrollTop;
    return;
  }
  const index = browser.slotIndex;
  army.commandIds[index] = String(card.id);
  let next = commandSlotPips().findIndex((_, i) => i > index && !army.commandIds[i]);
  if (next < 0) next = commandSlotPips().findIndex((_, i) => !army.commandIds[i]);
  browser = next >= 0 ? { mode: "commands", slotIndex: next } : null;
  $("#candidate-search").value = "";
  setStatus("已选择 " + named(card.name));
  render();
}
