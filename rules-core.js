/* Semantic list-building rule engine (browser port of rules.py).
 * Upstream-free: all rules read from our own data files. Pure functions. */
window.RulesCore = (() => {
  const UNKNOWN = Symbol("unknown");

  const Dice = window.SWLDice || Object.freeze({
    attackColors: Object.freeze({ RED: "red", BLACK: "black", WHITE: "white" }),
    defenseColors: Object.freeze({ RED: "red", WHITE: "white" }),
    attackFaces: Object.freeze({ BLANK: "blank", HIT: "hit", CRITICAL: "critical", SURGE: "surge" }),
    defenseFaces: Object.freeze({ BLANK: "blank", BLOCK: "block", SURGE: "surge", SURGE_BLOCK: "surge-block" }),
  });

  function resolve(ctx, field) {
    let node = ctx;
    for (const part of String(field).split(".")) {
      if (!node || typeof node !== "object" || !(part in node)) return UNKNOWN;
      node = node[part];
    }
    return node;
  }

  function evaluate(cond, ctx, predicates) {
    if (!cond || typeof cond !== "object") return null;
    if ("ref" in cond) {
      return predicates && cond.ref in predicates ? evaluate(predicates[cond.ref], ctx, predicates) : null;
    }
    if ("all" in cond) {
      let out = true;
      for (const c of cond.all) { const r = evaluate(c, ctx, predicates); if (r === false) return false; if (r === null) out = null; }
      return out;
    }
    if ("any" in cond) {
      let out = false;
      for (const c of cond.any) { const r = evaluate(c, ctx, predicates); if (r === true) return true; if (r === null) out = null; }
      return out;
    }
    if ("not" in cond) { const r = evaluate(cond.not, ctx, predicates); return r === null ? null : !r; }
    if ("field" in cond) {
      const actual = resolve(ctx, cond.field);
      if (actual === UNKNOWN) return null;
      const op = cond.op || "eq", value = cond.value;
      try {
        if (op === "eq") return actual === value;
        if (op === "in") return Array.isArray(value) && value.includes(actual);
        if (op === "contains") return Array.isArray(actual) ? actual.some(x => String(x) === String(value)) : null;
        if (op === "gte") return actual >= value;
        if (op === "lte") return actual <= value;
      } catch (e) { return null; }
      return null;
    }
    return null;
  }

  function slotRegistry(pkg) {
    const byId = {}, bySource = {};
    for (const s of pkg.slots || []) { byId[s.id] = s; bySource[String(s.sourceId)] = s; }
    return { byId, bySource };
  }
  function slotKey(pkg, sourceId) {
    const { bySource } = slotRegistry(pkg);
    const s = bySource[String(sourceId)];
    return s ? s.id : `unknown_source_slot_${sourceId}`;
  }
  function accessKeys(card, pkg, rule) {
    if (rule && rule.access) return rule.access.filter(a => a.slot).map(a => a.slot);
    return [...new Set((card.slotIds || []).map(sid => slotKey(pkg, sid)))];
  }
  function unitContext(unit) {
    return { unit: {
      id: unit.id,
      upstreamId: String(unit.upstream && unit.upstream.id || ""),
      unitTypeId: unit.unitTypeId,
      defenseDie: (unit.stats || {}).defenseDie,
      factionId: unit.factionId,
      rankId: unit.rankId,
      affiliationIds: (unit.affiliationIds || []).map(String),
      keywords: (unit.keywords || []).map(k => k && k.id),
    } };
  }
  function slotGrantsFor(pkg, unit, inst, upgrades) {
    const ctx = unitContext(unit);
    const predicates = pkg.predicates || {};
    const equipped = [];
    for (const sel of (inst && inst.upgrades) || []) {
      const card = upgrades[sel.upgradeId];
      if (!card) continue;
      for (const grant of (card.rules || {}).slotGrants || []) {
        if (!grant || grant.trigger !== "equipped" || !grant.slot) continue;
        if (grant.when && evaluate(grant.when, ctx, predicates) !== true) continue;
        equipped.push({ key: grant.slot, addedBy: card.id });
      }
    }
    const qualify = [];
    const uid = String((unit.upstream && unit.upstream.id) || "");
    for (const cardId of Object.keys(upgrades).sort()) {
      const card = upgrades[cardId];
      for (const grant of (card.rules || {}).slotGrants || []) {
        if (!grant || grant.trigger !== "unitQualifies" || !grant.slot) continue;
        let ok;
        if (grant.condition != null) ok = evaluate(grant.condition, ctx, predicates) === true;
        else ok = (grant.holders || []).map(String).includes(uid);
        if (ok) qualify.push({ key: grant.slot, ifAbsentAny: grant.ifAbsentAny || null });
      }
    }
    return { equipped, qualify };
  }
  function dedicatedSlotKeys(pkg, unit, upgrades) {
    return slotGrantsFor(pkg, unit, null, upgrades || {}).qualify;
  }
  function slotListFor(pkg, unit, inst, upgrades, armyId) {
    const { byId } = slotRegistry(pkg);
    const out = [];
    for (const s of (unit.upgradeSlots || [])) {
      const sid = (typeof s === "object") ? s.id : s;
      const key = slotKey(pkg, sid);
      if (byId[key] && byId[key].kind === "dedicated") continue; // printed dedicated slots are replaced by the shared exempt grants
      out.push({ key, required: !!(typeof s === "object" && s.required) });
    }
    const grants = slotGrantsFor(pkg, unit, inst, upgrades);
    for (const g of grants.equipped) out.push({ key: g.key, addedBy: g.addedBy });
    const ov = armyOverridesFor(pkg, armyId);
    for (const g of grants.qualify) {
      if (out.some(r => r.key === g.key)) continue;
      if (g.ifAbsentAny && out.some(r => g.ifAbsentAny.includes(r.key))) continue;
      out.push({ key: g.key, required: false, virtual: true });
    }
    if (ov) {
      const rules = ov.slots || [];
      for (const r of rules) if (r && r.op === "deny" && r.slot && matchesTarget(unit, r.target)) {
        for (let i = out.length - 1; i >= 0; i--) if (out[i].key === r.slot) out.splice(i, 1);
      }
      for (const r of rules) if (r && r.op === "add" && r.slot && matchesTarget(unit, r.target) && !out.some(x => x.key === r.slot)) {
        out.push({ key: r.slot, addedBy: "override" });
      }
    }
    return out;
  }
  function unitDivisions(unit) {
    return (unit.divisions || []).map(String);
  }
  function hosts(rule, card) {
    if (rule && rule.host) return rule.host.map(String);
    const local = (card.rules || {}).availableIn;
    if (local) return local.map(String);
    return null;
  }
  function matchesTarget(unit, target) {
    if (!target) return true;
    const name = normalizeKey((unit.name && unit.name.en) || "");
    if (target.unitNames && !target.unitNames.map(normalizeKey).includes(name)) return false;
    if (target.unitTypes && !target.unitTypes.includes(unit.unitTypeId)) return false;
    if (target.keywords && !target.keywords.some(k => (unit.keywords || []).some(x => x && x.id === k))) return false;
    return true;
  }
  function armyOverridesFor(pkg, armyId) {
    return ((pkg && pkg.armyOverrides) || {})[String(armyId)] || null;
  }
  function effectiveKeywords(unit, equipped, defs, pkg, armyId) {
    const eff = applyPropertyEffects(unit, equipped, defs);
    const ov = armyOverridesFor(pkg, armyId);
    let keywords = (eff.keywords || []).map(k => (k && k.id) || k);
    for (const rule of (ov && ov.keywords) || []) {
      if (rule && rule.op === "remove" && rule.keyword && matchesTarget(unit, rule.target)) {
        keywords = keywords.filter(k => k !== rule.keyword);
      }
    }
    return keywords;
  }
  function unitCapFor(unit, pkg, armyId) {
    const ov = armyOverridesFor(pkg, armyId);
    for (const cap of (ov && ov.unitCaps) || []) {
      if (cap && cap.unitName != null && matchesTarget(unit, { unitNames: [cap.unitName] })) return Number(cap.max);
    }
    const own = (unit.rules || {}).limit;
    return typeof own === "number" ? own : null;
  }
  function normalizeKey(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function keywordTargets(kw, units) {
    const ref = kw && kw.parameterRef;
    if (ref && typeof ref === "object" && ref.id != null && ref.id !== "") {
      if (ref.kind === "unit" && units[ref.id]) return [["unit", ref.id]];
      if (ref.kind === "unitType") return [["type", ref.id]];
    }
    const name = kw && kw.parameter;
    if (!name) return [];
    const key = normalizeKey(name);
    return Object.values(units || {}).filter(u => normalizeKey((u.name && u.name.en) || "") === key).map(u => ["unit", u.id]);
  }
  function entourageExemptions(armyUnits, units) {
    const budgets = {};
    for (const inst of armyUnits) {
      const u = units[inst.unitId] || {};
      for (const kw of u.keywords || []) {
        if (!kw || kw.id !== "entourage") continue;
        for (const [kind, id] of keywordTargets(kw, units)) {
          const key = kind + ":" + id;
          const slot = (budgets[key] ||= { n: 0, sources: new Set() });
          slot.n += 1;
          slot.sources.add(u.id);
        }
      }
    }
    const exempt = {};
    for (const inst of armyUnits) {
      const u = units[inst.unitId];
      if (!u) continue;
      for (const [kind, id] of [["unit", u.id], ["type", u.unitTypeId]]) {
        const key = kind + ":" + id;
        const slot = budgets[key];
        if (!slot || slot.n <= 0 || slot.sources.has(u.id)) continue;
        slot.n -= 1;
        const upstream = String((u.upstream && u.upstream.id) || "");
        exempt[upstream] = (exempt[upstream] || 0) + 1;
        break;
      }
    }
    return exempt;
  }
  function buildNameIndex(upgrades, defs) {
    const idx = {};
    const add = (key, uid) => {
      if (key == null || key === "") return;
      const k = normalizeKey(key);
      if (!k) return;
      (idx[k] ||= new Set()).add(String(uid));
    };
    for (const card of Object.values(upgrades || {})) {
      const uid = String((card.upstream && card.upstream.id) || "");
      if (!uid) continue;
      add(card.id, uid);
      add((card.name && card.name.en) || "", uid);
    }
    for (const u of (defs && defs.upgrades) || []) {
      add(u.id, u.name && u.name.en);
      add((u.name && u.name.en) || "", u.id);
    }
    return idx;
  }
  function unavailableSets(card, idx, defs) {
    const up = new Set(), fac = new Set();
    const own = String((card.upstream && card.upstream.id) || "");
    const ownAliases = new Set([normalizeKey(card.id), normalizeKey((card.name && card.name.en) || "")]);
    const du = (defs && defs.upgrades || []).find(x => String(x.id) === own);
    if (du && du.name) ownAliases.add(normalizeKey(du.name.en));
    for (const item of (card.rules || {}).unavailableWithIds || []) {
      if (item && typeof item === "object") {
        if (item.propertyName === "upgrades") up.add(String(item.id));
        else if (item.propertyName === "factions") fac.add(Number(item.id));
      } else if (typeof item === "string") {
        const k = normalizeKey(item);
        if (ownAliases.has(k)) continue; // self-name: already enforced via unique-by-name
        for (const id of ((idx || {})[k] || new Set())) if (id !== own) up.add(id);
      }
    }
    return { up, fac };
  }
  function normRp(rp) {
    if (!rp) return null;
    if (Array.isArray(rp) && rp.length && Array.isArray(rp[0])) return rp;
    return [rp];
  }
  function restrictionConditionOk(card, unit, pkg) {
    const cond = (card.restrictions || {}).condition;
    if (!cond) return null;
    return evaluate(cond, unitContext(unit), pkg.predicates || {});
  }
  function requiredPropertiesOk(unit, rp, defs) {
    const groups = normRp(rp);
    if (!groups) return true;
    const kwMap = {};
    for (const k of defs.keywords || []) for (const uid of k.upstreamIds || []) kwMap[String(uid)] = k.id;
    const utMap = {1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:"local:wookiee_trooper",9:9};
    const unitKw = new Set((unit.keywords || []).map(k => k && k.id));
    const aff = new Set((unit.affiliationIds || []).map(String));
    for (const group of groups) {
      let ok = true;
      for (const atom of group) {
        if (!atom || typeof atom !== "object") continue;
        const prop = atom.property, v = atom.value, vlist = Array.isArray(v) ? v : [v];
        if (prop === "faction") { if (!vlist.includes(unit.factionId)) ok = false; }
        else if (prop === "unitType") { const local = vlist.map(x => utMap[x] ?? x); if (!local.includes(unit.unitTypeId)) ok = false; }
        else if (prop === "affiliation") { if (!vlist.some(x => aff.has(String(x)))) ok = false; }
        else if (prop === "keywords") { const local = vlist.map(x => kwMap[String(x)]).filter(Boolean); if (!local.some(k => unitKw.has(k))) ok = false; }
      }
      if (ok) return true;
    }
    return false;
  }

  function keywordMap(defs) {
    const m = {};
    for (const k of defs.keywords || []) for (const uid of k.upstreamIds || []) m[String(uid)] = k.id;
    return m;
  }
  function applyPropertyEffects(unit, cards, defs) {
    if (!cards || !cards.length) return unit;
    const kwMap = keywordMap(defs);
    const keywords = new Set((unit.keywords || []).map(k => k && k.id));
    let affiliations = (unit.affiliationIds || []).map(String);
    for (const card of cards) {
      const r = (card && card.rules) || {};
      for (const group of (r.addProperties || [])) for (const atom of group) {
        if (!atom) continue;
        const vals = Array.isArray(atom.value) ? atom.value : [atom.value];
        if (atom.property === 'keywords') for (const v of vals) keywords.add(kwMap[String(v)] || String(v));
        else if (atom.property === 'affiliation') for (const v of vals) if (!affiliations.includes(String(v))) affiliations.push(String(v));
      }
      for (const group of (r.replaceProperties || [])) for (const atom of group) {
        if (!atom) continue;
        const vals = Array.isArray(atom.value) ? atom.value : [atom.value];
        if (atom.property === 'affiliation') affiliations = vals.map(String);
        else if (atom.property === 'keywords') { keywords.clear(); for (const v of vals) keywords.add(kwMap[String(v)] || String(v)); }
      }
    }
    return { ...unit, keywords: [...keywords].map(id => ({ id })), affiliationIds: affiliations };
  }
  function unitUpstreamIdsByName(name, data) {
    if (!data._nameToUpstream) {
      const map = {};
      for (const s of (data.defs && data.defs.sourceUnits) || []) {
        (map[String(s.id)] ||= []).push(String(s.id));
        const full = (s.name && s.name.en) || "";
        const key = normalizeKey(full);
        if (key) (map[key] ||= []).push(String(s.id));
        const identity = normalizeKey(full.split("·")[0]);
        if (identity && identity !== key) (map[identity] ||= []).push(String(s.id));
      }
      data._nameToUpstream = map;
    }
    return data._nameToUpstream[normalizeKey(name)] || [];
  }
  function sourceNameMatches(hostId, want, data) {
    const src = ((data.defs && data.defs.sourceUnits) || []).find(s => String(s.id) === String(hostId));
    if (!src) return false;
    const full = (src.name && src.name.en) || "";
    const target = String(want == null ? "" : want);
    if (target.includes("·")) return normalizeKey(full) === normalizeKey(target);
    if (full.includes("·")) return false;
    return normalizeKey(full) === normalizeKey(target);
  }
  function hostAliasAllows(card, unit, army, data, rule) {
    const ov = armyOverridesFor(data.pkg, army.armyId);
    const aliases = (ov && ov.slotHosts) || [];
    if (!aliases.length) return false;
    const access = accessKeys(card, data.pkg, rule);
    const ctx = unitContext(unit);
    const predicates = data.pkg.predicates || {};
    const cardHosts = (hosts(rule, card) || []).map(String);
    let allowed = false;
    for (const a of aliases) {
      if (!a || !a.slot || !access.includes(a.slot)) continue;
      if (!matchesTarget(unit, a.target)) continue;
      if (a.when && evaluate(a.when, ctx, predicates) !== true) continue;
      if (cardHosts.some(x => (a.exclude || []).some(n => sourceNameMatches(x, n, data)))) return false;
      if (cardHosts.some(x => (a.include || []).some(n => sourceNameMatches(x, n, data)))) allowed = true;
    }
    return allowed;
  }
  function parentFactionId(armyId, pkg, defs) {
    const bf = ((pkg && pkg.battleForces) || {})[String(armyId)];
    const name = bf && bf.parentFaction;
    if (!name) return null;
    const a = ((defs && defs.armies) || []).find(x => (x.name && x.name.en) === name);
    return a ? a.id : null;
  }
  function armyRank(unit, armyId, pkg, defs, units) {
    const ov = armyOverridesFor(pkg, armyId);
    const overrideName = normalizeKey((unit.name && unit.name.en) || "");
    for (const rule of (ov && ov.rankOverrides) || []) {
      if (rule && (rule.unitNames || []).some(n => normalizeKey(n) === overrideName)) return Number(rule.rankId);
    }
    const bf = ((pkg && pkg.battleForces) || {})[String(armyId)] || {};
    const allowed = bf.allowedUnits;
    if (allowed && typeof allowed === "object") {
      const name = normalizeKey((unit.name && unit.name.en) || "");
      const keys = Object.keys(allowed).sort((a, b) => Number(a) - Number(b));
      for (const key of keys) {
        if ((allowed[key] || []).some(n => normalizeKey(n) === name)) return Number(key);
      }
      return null;
    }
    const direct = (unit.factions || []).find(f => f.id === armyId);
    if (direct) return direct.rankId;
    const pid = parentFactionId(armyId, pkg, defs);
    if (pid == null) return null;
    const parentEntry = (unit.factions || []).find(f => f.id === pid);
    if (!parentEntry) return null;
    const name = (unit.name && unit.name.en) || "";
    for (const other of Object.values(units || {})) {
      if (((other.name && other.name.en) || "") !== name) continue;
      if ((other.factions || []).some(f => f.id === armyId && f.rankId === parentEntry.rankId)) return parentEntry.rankId;
    }
    return null;
  }
  function conditionIsHostOnly(cond) {
    let hostOnly = true;
    const walk = node => {
      if (!hostOnly || node == null) return;
      if (Array.isArray(node)) { for (const n of node) walk(n); return; }
      if (typeof node === "object") {
        if (typeof node.field === "string" && !node.field.startsWith("unit.")) hostOnly = false;
        for (const [k, v] of Object.entries(node)) { if (k === "field") continue; if (v && typeof v === "object") walk(v); }
      }
    };
    walk(cond);
    return hostOnly;
  }
  function upgradeEligibility(card, unit, army, data, equipped) {
    const { defs, pkg, nameIndex } = data;
    if (card.deprecated) return { ok: false, issues: [{ status: "invalid", code: "deprecated_card", message: "该卡为废案，不参与组军" }] };
    if (equipped && equipped.length) unit = applyPropertyEffects(unit, equipped, defs);
    const idx = nameIndex || buildNameIndex(data.upgrades, defs);
    const rule = (pkg.upgradeRules || {})[String(card.upstream && card.upstream.id || "")] || {};
    const name = (card.name && card.name.en) || card.id;
    const hostRank = armyRank(unit, army.armyId, pkg, defs, data.units);
    const issues = [];
    const add = (status, code, message) => issues.push({ status, code, message });
    const h = hosts(rule, card);
    const aliasOk = hostAliasAllows(card, unit, army, data, rule);
    if (h != null && !h.includes(String(unit.upstream && unit.upstream.id || "")) && !aliasOk) {
      add("invalid", "host_restriction", "此升级仅限特定角色/版本");
    }
    const facs = (card.rules || {}).factions;
    if (facs && !facs.map(Number).includes(army.armyId)) {
      add("invalid", "upgrade_faction", `升级「${name}」不属于当前军队/战斗部队`);
    }
    if (unavailableSets(card, idx, defs).fac.has(army.armyId)) {
      add("invalid", "unavailable_faction", `升级「${name}」无法加入当前军队/战斗部队`);
    }
    const rp = (card.rules || {}).requiredProperties;
    if (rp && !requiredPropertiesOk(unit, rp, defs)) {
      add("invalid", "required_properties", `升级「${name}」不满足适用条件（阵营/类型/词条）`);
    }
    const rc = restrictionConditionOk(card, unit, pkg);
    const cond = (card.restrictions || {}).condition;
    const condBypassed = aliasOk && rc === false && conditionIsHostOnly(cond);
    if (rc === false && !condBypassed) add("invalid", "restriction_condition", `升级「${name}」不满足卡面限制条件`);
    else if (rc === null && (card.restrictions || {}).condition) add("unknown", "restriction_condition_unknown", `升级「${name}」的卡面限制条件存在未覆盖语义`);
    const divs = (card.rules || {}).requiredDivisions;
    if (divs) {
      const ud = unitDivisions(unit);
      if (ud.length && !ud.some(d => divs.includes(d))) add("invalid", "division_restriction", `升级「${name}」仅限${divs.join("/")}阵营`);
    }
    const reqTier = (card.rules || {}).requiresTier;
    if (reqTier && reqTier.length) {
      if (hostRank == null || !reqTier.map(Number).includes(Number(hostRank))) {
        add("invalid", "requires_tier", `升级「${name}」要求母单位军阶为 ${reqTier.join("/")}，当前为 ${hostRank == null ? "无" : hostRank}`);
      }
    }
    return { ok: issues.every(i => i.status !== "invalid"), issues };
  }
  function battleForceChecks(army, bf, units, upgrades, defs, issue) {
    const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const rules = (bf && bf.machineRules) || [];
    for (const rule of rules) {
      if (!rule || !rule.type) continue;
      if (rule.type === "banKeyword" && rule.keyword) {
        for (const inst of army.units || []) {
          const u = units[inst.unitId];
          if (!u) continue;
          const equipped = (inst.upgrades || []).map(x => upgrades[x.upgradeId]).filter(Boolean);
          const eff = applyPropertyEffects(u, equipped, defs);
          if ((eff.keywords || []).some(k => k && k.id === rule.keyword)) {
            issue("invalid", "battle_force_keyword_banned", `战斗部队禁用关键词「${rule.keyword}」`, inst.instanceId);
          }
        }
      } else if (rule.type === "unitCap" && rule.unitName != null && rule.max != null) {
        const target = norm(rule.unitName);
        const copies = (army.units || []).filter(inst => norm((units[inst.unitId] || {}).name && units[inst.unitId].name.en) === target).length;
        if (copies > Number(rule.max)) {
          issue("invalid", "battle_force_unit_cap", `战斗部队限制「${rule.unitName}」最多 ${rule.max} 个（当前 ${copies}）`, null);
        }
      } else if (rule.type === "uniqueUpgrades" && Array.isArray(rule.allow)) {
        const allowed = new Set(rule.allow.map(norm));
        for (const inst of army.units || []) {
          for (const sel of inst.upgrades || []) {
            const card = upgrades[sel.upgradeId];
            if (!card || !(card.rules || {}).unique) continue;
            if (!allowed.has(norm((card.name && card.name.en) || card.id))) {
              issue("invalid", "battle_force_unique_upgrade", `战斗部队不允许独特升级「${(card.name && card.name.en) || card.id}」`, sel.instanceId);
            }
          }
        }
      }
    }
  }
  function validateArmy(army, data) {
    const { units, upgrades, defs, pkg } = data;
    const issues = [];
    const issue = (status, code, message, instanceId, extra) => issues.push({ status, code, message, instanceId, ...(extra || {}) });
    const nameIndex = buildNameIndex(upgrades, defs);

    let basePoints = 0;
    const seen = [], sel = [];

    let mode = (pkg.modes || {})[army.mode || "standard"] || {};
    const bf = (pkg.battleForces || {})[String(army.armyId)];
    if (bf) {
      mode = { ...mode, ...((bf.modes || {})[army.mode || "standard"] || {}) };
      if ((bf.unparsedRules || []).length) issue("unknown", "battle_force_rules", "战斗部队仍有未机器化的规则文本：" + bf.unparsedRules.join(" / "), null);
    }
    const pointsLimit = army.pointsLimit || mode.points || 1000;

    for (const inst of army.units || []) {
      const key = inst.instanceId;
      const unit = units[inst.unitId];
      if (!unit) { issue("invalid", "missing_unit", "单位引用不存在", key); continue; }
      if (unit.usage === "counterpart" || unit.isCounterpart) {
        issue("invalid", "counterpart_as_unit", "伙伴卡需通过宿主单位的伙伴槽加入，不能作为独立单位", key);
      }
      basePoints += unit.points || 0;
      const memberRank = armyRank(unit, army.armyId, pkg, defs, units);
      if (memberRank == null) { issue("invalid", "army_membership", "此单位未列入当前军队", key); continue; }
      const urc = (unit.restrictions || {}).condition;
      if (urc !== undefined && urc !== null) {
        const urcOk = evaluate(urc, unitContext(unit), pkg.predicates || {});
        if (urcOk === false) issue("invalid", "unit_restriction_condition", `单位「${(unit.name && unit.name.en) || unit.id}」不满足卡面限制条件`, key);
        else if (urcOk === null) issue("unknown", "unit_restriction_condition_unknown", `单位「${(unit.name && unit.name.en) || unit.id}」的卡面限制条件存在未覆盖语义`, key);
      }

      const slotList = slotListFor(pkg, unit, inst, upgrades, army.armyId);
      for (const rec of slotList) {
        if (rec.virtual) issue("unknown", "dedicated_grant_virtual", `该单位满足专用槽 ${rec.key} 的语义条件，但本地基础槽未包含；已按虚拟槽补入`, key);
      }

      const assigned = {};
      const equippedCards = (inst.upgrades || []).map(x => upgrades[x.upgradeId]).filter(Boolean);
      for (const selected of inst.upgrades || []) {
        const ckey = selected.instanceId;
        const card = upgrades[selected.upgradeId];
        if (!card) { issue("invalid", "missing_upgrade", "升级引用不存在", ckey); continue; }
        basePoints += card.points || 0;
        const rule = (pkg.upgradeRules || {})[String(card.upstream && card.upstream.id || "")] || {};
        seen.push([String(card.upstream && card.upstream.id || ""), card.id, ckey]);
        sel.push({ upstreamId: String(card.upstream && card.upstream.id || ""), cardId: card.id, ckey, unitId: unit.id, unitKey: key, unitUpstreamId: String(unit.upstream && unit.upstream.id || "") });

        const index = selected.slotIndex;
        if (!Number.isInteger(index)) { issue("invalid", "slot_missing", "升级未指定槽位", ckey); continue; }
        if (index < 0 || index >= slotList.length) { issue("invalid", "slot_missing", "对应槽不存在；已保留选择", ckey); continue; }
        const slotRec = slotList[index];
        const allowed = accessKeys(card, pkg, rule);
        if (!allowed.includes(slotRec.key)) {
          issue("invalid", "slot_mismatch", `升级可匹配槽位 [${allowed.join(", ")}]，不包含当前槽 ${slotRec.key}`, ckey);
        }
        if (index in assigned) { issue("invalid", "slot_occupied", "该槽已被另一张升级占用", ckey); }
        else assigned[index] = ckey;

        const elig = upgradeEligibility(card, unit, army, { units, upgrades, defs, pkg, nameIndex }, equippedCards);
        for (const e of elig.issues) issue(e.status, e.code, e.message, ckey);
      }
      for (let i = 0; i < slotList.length; i++) {
        if (slotList[i].required && !(i in assigned)) issue("invalid", "required_slot", `必选槽位 ${slotList[i].key} 尚未配置升级`, key);
      }
      const seenLocal = {}, seenLocalNames = {};
      for (const selected of inst.upgrades || []) {
        const cid = selected.upgradeId;
        if (cid && cid in seenLocal) issue("invalid", "local_duplicate", "同一单位重复装备同组升级", selected.instanceId);
        seenLocal[cid] = true;
        const card = upgrades[cid] || {};
        const nm = String((card.name && card.name.en) || cid || "").toLowerCase();
        if (seenLocalNames[nm]) issue("invalid", "local_duplicate_name", `同一单位不能装备多张同名升级「${(card.name && (card.name.zh || card.name.en)) || nm}」`, selected.instanceId);
        seenLocalNames[nm] = true;
      }
      let children = ((pkg.unitRules || {})[String(unit.upstream && unit.upstream.id || "")] || {}).requiredChildren;
      if (!children) children = (unit.rules || {}).requiredChildren;
      if (children) {
        const have = (inst.upgrades || []).map(u => upgrades[u.upgradeId]).filter(Boolean)
          .map(c => String(c.upstream && c.upstream.id || ""));
        for (const child of children) {
          if (!have.includes(String(child.id))) issue("invalid", "required_child_missing", `缺少必带升级（上游 ID ${child.id}）`, key);
        }
      }
    }

    // conflicts / uniqueness
    const byName = {}, conflictGroups = {}, selectedUpstream = new Set();
    for (const [upstreamId, cardId, ckey] of seen) {
      const card = upgrades[cardId] || {};
      const name = String((card.name && card.name.en) || cardId).toLowerCase();
      (byName[name] ||= new Set()).add(cardId);
      const rule = (pkg.upgradeRules || {})[upstreamId] || {};
      if (rule.conflictGroup) (conflictGroups[rule.conflictGroup] ||= new Set()).add(upstreamId);
      selectedUpstream.add(upstreamId);
    }
    for (const [name, ids] of Object.entries(byName)) {
      if (ids.size > 1 && [...ids].some(cid => ((upgrades[cid] || {}).rules || {}).unique === true)) {
        issue("invalid", "unique_duplicate", `独特升级「${name}」跨版本只能携带一次`, null);
      }
    }
    const cardCounts = {};
    for (const [, cardId] of seen) cardCounts[cardId] = (cardCounts[cardId] || 0) + 1;
    for (const [cardId, n] of Object.entries(cardCounts)) {
      const card = upgrades[cardId] || {};
      const rule = (pkg.upgradeRules || {})[String((card.upstream && card.upstream.id) || "")] || {};
      if (((card.rules || {}).unique === true || rule.armyUnique) && n > 1) {
        issue("invalid", "unique_duplicate", `独特升级「${(card.name && card.name.en) || cardId}」整军只能携带一次`, null);
      }
    }
    for (const [group, ids] of Object.entries(conflictGroups)) if (ids.size > 1) issue("invalid", "conflict_group", `互斥组 ${group} 中选择了多个互斥升级`, null);
    const conflictSets = new Map();
    for (const [upstreamId, cardId, ckey] of seen) {
      conflictSets.set(cardId, unavailableSets(upgrades[cardId] || {}, nameIndex, defs));
    }
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        const [au, ac, akey] = seen[i];
        const [bu, bc, bkey] = seen[j];
        const ra = (pkg.upgradeRules || {})[au] || {};
        const rb = (pkg.upgradeRules || {})[bu] || {};
        if (ra.conflictGroup && rb.conflictGroup && ra.conflictGroup === rb.conflictGroup) continue; // already reported
        const ca = conflictSets.get(ac) || { up: new Set() };
        const cb = conflictSets.get(bc) || { up: new Set() };
        if (ca.up.has(bu) || cb.up.has(au)) issue("invalid", "upgrade_conflict", "选择了互斥的升级", akey);
      }
    }

    const upgradeCounts = {};
    for (const [upstreamId, cardId, ckey] of seen) upgradeCounts[cardId] = (upgradeCounts[cardId] || 0) + 1;
    for (const [cardId, n] of Object.entries(upgradeCounts)) {
      const card = upgrades[cardId] || {}; const r = card.rules || {};
      const rule = (pkg.upgradeRules || {})[String(card.upstream && card.upstream.id || "")] || {};
      const name = (card.name && card.name.en) || cardId;
      if ((r.unique === true || rule.armyUnique) && n > 1) issue("invalid", "unique_duplicate", `独特升级「${name}」整军只能携带一次`, null);
      if (Number.isInteger(r.limit) && n > r.limit) issue("invalid", "limit_exceeded", `升级「${name}」超过数量上限 ${r.limit}`, null);
    }

    const uniqueUnitCounts = {};
    for (const inst of army.units || []) {
      const unit = units[inst.unitId]; if (!unit) continue;
      const r = unit.rules || {};
      if (r.unlimited === false) {
        const key = String((unit.name && unit.name.en) || unit.id).toLowerCase();
        uniqueUnitCounts[key] = (uniqueUnitCounts[key] || 0) + 1;
      }
    }
    for (const [key, n] of Object.entries(uniqueUnitCounts)) if (n > 1) issue("invalid", "unit_unique_duplicate", `独特单位「${key}」整军只能携带一次`, null);
    const uniqueUnitKeys = new Set(Object.keys(uniqueUnitCounts).map(normalizeKey));
    if (uniqueUnitKeys.size) {
      for (const [upstreamId, cardId, ckey] of seen) {
        const card = upgrades[cardId] || {};
        const r = card.rules || {};
        const rule = (pkg.upgradeRules || {})[String((card.upstream && card.upstream.id) || "")] || {};
        if (!(r.unique === true || rule.armyUnique)) continue;
        const key = normalizeKey((card.name && card.name.en) || cardId);
        if (uniqueUnitKeys.has(key)) issue("invalid", "cross_type_duplicate", `独特卡「${(card.name && card.name.en) || cardId}」与同名单位在同一军表`, ckey);
      }
    }

    // rank counting with exemptions (local)
    const armyUnitUpstream = new Set();
    const armyUnitUpstreamCounts = {};
    const unitIdCounts = {};
    for (const inst of army.units || []) {
      const u = units[inst.unitId]; if (!u) continue;
      unitIdCounts[u.id] = (unitIdCounts[u.id] || 0) + 1;
      if (u.upstream) {
        const uid = String(u.upstream.id);
        armyUnitUpstream.add(uid);
        armyUnitUpstreamCounts[uid] = (armyUnitUpstreamCounts[uid] || 0) + 1;
      }
    }
    const unitNameIndex = {};
    for (const u of Object.values(units || {})) {
      const key = normalizeKey((u.name && u.name.en) || "");
      if (!key) continue;
      (unitNameIndex[key] ||= new Set()).add(String((u.upstream && u.upstream.id) || ""));
    }
    for (const inst of army.units || []) {
      const u = units[inst.unitId];
      if (!u) continue;
      const own = String((u.upstream && u.upstream.id) || "");
      const ownKey = normalizeKey((u.name && u.name.en) || "");
      for (const item of (u.rules || {}).unavailableWith || []) {
        const ids = new Set();
        if (item && typeof item === "object") {
          if (item.propertyName === "units") ids.add(String(item.id));
        } else if (typeof item === "string") {
          const key = normalizeKey(item);
          if (key && key !== ownKey) for (const id of unitNameIndex[key] || []) ids.add(id);
        }
        ids.delete(own);
        if ([...ids].some(id => armyUnitUpstream.has(id))) {
          issue("invalid", "unit_conflict", `「${(u.name && u.name.en) || u.id}」与军表中的互斥单位同时出现`, inst.instanceId);
        }
      }
    }
    const minCounts = {}, maxCounts = {}, waivedTiers = new Set();
    const unitReplaceTier = {};
    for (const inst of army.units || []) {
      for (const su of inst.upgrades || []) {
        const card = upgrades[su.upgradeId];
        const rt = card && (card.rules || {}).replaceTier;
        if (rt != null) unitReplaceTier[inst.unitId] = Number(rt);
      }
    }
    const entourageExempt = entourageExemptions(army.units || [], units);
    for (const [unitId, copies] of Object.entries(unitIdCounts)) {
      const unit = units[unitId];
      let rank = armyRank(unit, army.armyId, pkg, defs, units);
      if (rank == null) continue;
      if (unitReplaceTier[unitId] != null) rank = unitReplaceTier[unitId];
      const tc = (unit.rules || {}).tierCounting || {};
      let ignoreMin = tc.ignoreMinimum === true;
      let ignoreMax = tc.ignoreMaximum === true;
      for (const f of unit.factions || []) {
        if (f.id === army.armyId) {
          const ftc = f.tierCounting || {};
          if (ftc.ignoreMinimum === true) ignoreMin = true;
          if (ftc.ignoreMaximum === true) ignoreMax = true;
        }
      }
      let exempt = 0;
      const ex = tc.exempt || tc.ignoreMaximumWhenArmyIncludes;
      if (ex) {
        let whens = ex.whenArmyIncludes;
        if (!Array.isArray(whens)) whens = [whens];
        const per = ex.perSourceUnit || 1;
        const src = whens.filter(w => armyUnitUpstream.has(String(w))).length;
        if (src) exempt = Math.min(per * src, copies);
      }
      if (tc.waivesMinimum) for (const t of tc.waivesMinimum.tiers || []) waivedTiers.add(t);
      if (!ignoreMin) minCounts[rank] = (minCounts[rank] || 0) + copies;
      const entExempt = entourageExempt[String((unit.upstream && unit.upstream.id) || "")] || 0;
      maxCounts[rank] = (maxCounts[rank] || 0) + copies - exempt - entExempt;
    }
    const quotas = {};
    for (const q of mode.rankQuotas || []) quotas[q.rankId] = q;
    for (const [rankId, count] of Object.entries(maxCounts)) {
      const q = quotas[rankId];
      if (q && count > (q.max ?? 99)) issue("invalid", "rank_max", `军阶 ${rankId} 超过上限 ${q.max}`, null, { rank: Number(rankId) });
    }
    for (const [rankId, q] of Object.entries(quotas)) {
      if (waivedTiers.has(rankId)) continue;
      if ((minCounts[rankId] || 0) < (q.min ?? 0)) issue("invalid", "rank_min", `军阶 ${rankId} 未满最低要求 ${q.min}`, null, { rank: Number(rankId) });
    }
    for (const combo of mode.combined || []) {
      let total = 0;
      for (const t of combo.tiers || []) total += maxCounts[t] || 0;
      if (total > combo.maximum) issue("invalid", "rank_combined", `军阶组合 ${combo.tiers} 合计超过上限 ${combo.maximum}`, null);
    }

    // command cards
    const selectedUpgradeUpstream = new Set(sel.map(x => x.upstreamId));
    for (const cid of army.commandIds || []) {
      const cmd = (defs.commands || []).find(x => String(x.id) === String(cid));
      if (!cmd) { issue("invalid", "command_missing", `命令卡引用不存在：${cid}`, null); continue; }
      const name = (cmd.name && cmd.name.en) || cid;
      const facs = cmd.factions || [];
      if (facs.length && !facs.includes(army.armyId)) issue("invalid", "command_faction", `命令卡「${name}」不属于当前军队`, null);
      if ((cmd.campaigns || []).length) issue("unknown", "command_campaign", `命令卡「${name}」为战役卡，标准模式资格待核验`, null);
      for (const un of cmd.unlockedBy || []) {
        const target = String(un.id), prop = un.propertyName;
        if (prop === "units" && !armyUnitUpstream.has(target)) issue("invalid", "command_unlock", `命令卡「${name}」需要包含解锁单位（上游 ${target}）`, null);
        else if (prop === "upgrades" && !selectedUpgradeUpstream.has(target)) issue("invalid", "command_unlock", `命令卡「${name}」需要包含解锁升级（上游 ${target}）`, null);
      }
    }
    const hand = mode.commandHand;
    if (hand && (army.commandIds || []).length) {
      const pips = (army.commandIds || []).map(cid => {
        const c = (defs.commands || []).find(x => String(x.id) === String(cid));
        if (!c) return null;
        const slotPips = c.slotPips != null ? c.slotPips : c.pips;
        return slotPips != null ? slotPips : null;
      }).filter(p => p != null);
      for (const rule of hand) {
        const n = pips.filter(p => p === rule.pips).length;
        if (n < (rule.min || 0)) issue("invalid", "command_min", `${rule.pips} 点命令卡不足 ${rule.min} 张`, null);
        if (n > (rule.max || 99)) issue("invalid", "command_max", `${rule.pips} 点命令卡超过 ${rule.max} 张`, null);
      }
    }

    // mercenary pool (local)
    const pool = (mode.pools || {}).mercenary;
    if (pool) {
      let bonus = 0;
      for (const x of sel) {
        const card = upgrades[x.cardId] || {};
        if (((card.rules || {}).poolBonuses || []).includes("extraMercenary")) bonus += 1;
      }
      let merc = 0;
      for (const inst of army.units || []) {
        const unit = units[inst.unitId]; if (!unit) continue;
        for (const f of unit.factions || []) {
          if ((f.tierPools || []).includes("mercenary") && f.id === army.armyId) { merc += 1; break; }
        }
      }
      const limit = (pool.max || 1) + bonus;
      if (merc > limit) issue("invalid", "mercenary_pool", `雇佣兵数量 ${merc} 超过上限 ${limit}`, null);
      if (bonus) issue("unknown", "mercenary_pool_semantics", "雇佣兵池额外名额叠加语义仍需核验", null);
    }

    // effects (local)
    let effectivePoints = basePoints;
    for (const x of sel) {
      const card = upgrades[x.cardId] || {};
      for (const m of (card.rules || {}).modifiedPointsWith || []) {
        const prop = m.property, mid = String(m.id), mod = m.modifier || 0;
        let applies = false;
        if (prop === "options") {
          if ((army.options || []).some(o => String(o) === mid) && armyUnitUpstream.has(String(m.in))) applies = true;
        } else if (prop === "units") {
          if (armyUnitUpstream.has(mid)) applies = true;
        }
        if (applies) effectivePoints += mod;
      }
    }
    const chooseGroups = {};
    for (const x of sel) {
      const card = upgrades[x.cardId] || {};
      const ck = (card.rules || {}).chooseOneKey;
      if (ck) {
        (chooseGroups[x.unitKey] ||= {})[ck] ||= new Set();
        chooseGroups[x.unitKey][ck].add(x.upstreamId);
      }
    }
    for (const [unitKey, groups] of Object.entries(chooseGroups)) {
      for (const [ck, ids] of Object.entries(groups)) if (ids.size > 1) issue("invalid", "choose_one", `单位内互斥选择组「${ck}」只能选择其一`, unitKey);
    }
    for (const [unitId, copies] of Object.entries(unitIdCounts)) {
      const unit = units[unitId];
      for (const q of (unit.rules || {}).quantityLimitedBy || []) {
        const srcId = String(q.unit), ratio = q.ratio || 1;
        const srcCopies = armyUnitUpstreamCounts[srcId] || 0;
        if (copies > ratio * srcCopies) issue("invalid", "quantity_limited", `「${(unit.name && unit.name.en) || unitId}」数量受母单位限制`, null);
      }
    }

    const ov = armyOverridesFor(pkg, army.armyId);
    if (ov) {
      for (const rule of ov.keywords || []) {
        if (!rule || rule.op !== "ban" || !rule.keyword) continue;
        for (const inst of army.units || []) {
          const u = units[inst.unitId];
          if (!u) continue;
          const equipped = (inst.upgrades || []).map(x => upgrades[x.upgradeId]).filter(Boolean);
          if (effectiveKeywords(u, equipped, defs, pkg, army.armyId).includes(rule.keyword)) {
            issue("invalid", "army_keyword_banned", `本军表禁用关键词「${rule.keyword}」`, inst.instanceId);
          }
        }
      }
      for (const inst of army.units || []) {
        const u = units[inst.unitId];
        if (!u) continue;
        const cap = unitCapFor(u, pkg, army.armyId);
        if (cap == null) continue;
        const copies = (army.units || []).filter(x => x.unitId === inst.unitId).length;
        if (copies > cap) issue("invalid", "unit_limit_exceeded", `「${(u.name && u.name.en) || u.id}」最多 ${cap} 个（当前 ${copies}）`, null);
      }
    }
    if (bf) battleForceChecks(army, bf, units, upgrades, defs, issue);
    if (effectivePoints > pointsLimit) issue("invalid", "points_limit", `有效费用 ${effectivePoints} 超过上限 ${pointsLimit}`, null);

    const hasInvalid = issues.some(i => i.status === "invalid");
    const hasUnknown = issues.some(i => i.status === "unknown");
    issues.push({ status: "unknown", code: "coverage_note", message: "属性效果（addProperties/replaceProperties）已参与资格判断；卡面限制、费用修正、chooseOneKey、quantityLimitedBy、军阶豁免、军阶要求/替换军阶与互斥卡牌已执行。战斗部队规则未覆盖项仍标 unknown。", instanceId: null });
    return { status: hasInvalid ? "invalid" : (hasUnknown ? "unknown" : "valid"), basePoints, effectivePoints, rankCounts: maxCounts, issues };
  }

  return { Dice, evaluate, validateArmy, upgradeEligibility, entourageExemptions, armyRank, slotKey, accessKeys, slotGrantsFor, dedicatedSlotKeys, slotListFor, restrictionConditionOk, requiredPropertiesOk, normRp, buildNameIndex, unavailableSets };
})();
