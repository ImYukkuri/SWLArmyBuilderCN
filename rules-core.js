/* Semantic list-building rule engine (browser port of rules.py).
 * Upstream-free: all rules read from our own data files. Pure functions. */
window.RulesCore = (() => {
  const UNKNOWN = Symbol("unknown");
  const nameIndexSources = new WeakMap();

  function battleForceVersion(pkg, armyId) {
    const bf = pkg?.battleForces?.[armyId];
    if (!bf) return 1;
    if (Object.prototype.hasOwnProperty.call(bf, 'v2') && bf.engineVersion !== 2) return null;
    if (Object.prototype.hasOwnProperty.call(bf, 'engineVersion')) return bf.engineVersion;
    return 1;
  }
  function resolveArmyData(army,data) {return window.BattleForceRuntime ? BattleForceRuntime.resolve(army,data) : data;}
  function unitFor(instance,army,data) {
    const resolved=resolveArmyData(army,data);
    return resolved.pkg._v2?.instances[instance?.instanceId] || resolved.units[instance?.unitId];
  }

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
        if (op === "contains") {
          if (Array.isArray(actual)) return actual.some(x => String(x) === String(value));
          if (typeof actual === "string") return actual.toLowerCase().includes(String(value).toLowerCase());
          return null;
        }
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
    const keys = rule?.access ? rule.access.filter(a => a.slot).map(a => a.slot)
      : (card.slotIds || []).map(sid => slotKey(pkg, sid));
    const grants = (card.rules?.slotGrants || []).filter(g => g?.trigger === 'unitQualifies' && g.slot);
    if (grants.length) {
      const { byId } = slotRegistry(pkg);
      // A missing-slot exception also names the ordinary categories this card
      // belongs in. Use that relationship for candidates, equip and validation,
      // even when a legacy access list contains only its dedicated slot.
      for (const grant of grants) for (const key of grant.ifAbsentAny || []) {
        if (byId[key]?.kind === 'category') keys.push(key);
      }
      keys.push('special:' + card.id);
    }
    return [...new Set(keys)];
  }
  function hasEquip(unit, pkg = {}) {
    const children = pkg.unitRules?.[String(unit.upstream?.id)]?.requiredChildren ?? unit.rules?.requiredChildren ?? [];
    return !!(unit.equipUpgradeIds?.length || unit.equipSlotIds?.length ||
      unit.keywords?.some(k => k?.id === 'equip') ||
      children.some(c => c.elementPropertyName === 'upgrades'));
  }
  function unitContext(unit, pkg = {}) {
    return { unit: {
      id: unit.id,
      upstreamId: String(unit.upstream && unit.upstream.id || ""),
      unitTypeId: unit.unitTypeId,
      unitCategoryId: unit.unitCategoryId,
      unitSubtypeId: unit.unitSubtypeId,
      nameIdentityId: unit.nameIdentityId,
      defenseDie: (unit.stats || {}).defenseDie,
      factionId: unit.factionId,
      rankId: unit.rankId,
      affiliationIds: (unit.affiliationIds || []).map(String),
      keywords: (unit.keywords || []).map(k => k && k.id),
      hasEquip: hasEquip(unit,pkg),
      title: (((unit.title || {}).en || "") + " " + ((unit.title || {}).zh || "")).trim(),
      titleEn: ((unit.title || {}).en) || "",
      titleZh: ((unit.title || {}).zh) || "",
      name: (((unit.name || {}).en || "") + " " + ((unit.name || {}).zh || "")).trim(),
      nameEn: ((unit.name || {}).en) || "",
      nameZh: ((unit.name || {}).zh) || "",
    } };
  }
  function slotGrantsFor(pkg, unit, inst, upgrades) {
    const ctx = unitContext(unit, pkg);
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
        else ok = (grant.holders || []).some(ref => ref?.kind === 'unit' ? ref.id === unit.id
          : ref !== null && typeof ref !== 'object' && String(ref) === uid);
        if (ok) qualify.push({ key: grant.slot, ifAbsentAny: grant.ifAbsentAny || null, upgradeId: card.id });
      }
    }
    return { equipped, qualify };
  }
  function dedicatedSlotKeys(pkg, unit, upgrades) {
    return slotGrantsFor(pkg, unit, null, upgrades || {}).qualify;
  }
  function flexibleResponseCount(unit) {
    const value = (unit.keywords || []).find(k => k && k.id === "flexible_response")?.value;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  function equipSlotKeys(unit, pkg) {
    // The explicit list (including []) overrides historical Equip text.
    if (Array.isArray(unit.equipSlotIds)) return [...new Set(unit.equipSlotIds)];
    const slots = pkg.slots || [], keys = new Set();
    const norm = s => String(s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    for (const kw of unit.keywords || []) {
      if (kw?.id !== 'equip') continue;
      for (const ref of kw.parameterRefs || (kw.parameterRef ? [kw.parameterRef] : [])) {
        if (ref.kind !== 'slot') continue;
        const slot = slots.find(s => s.id === ref.id || s.sourceId === ref.id);
        if (slot) keys.add(slot.id);
      }
      const text = String(kw.parameter || '').replace(/^\s*equip\s*[:：]\s*/i, '');
      for (const part of text.split(/[,，、;/；]+/)) {
        const slot = slots.find(s => [s.id, s.name?.en, s.name?.zh].some(n => n && norm(n) === norm(part)));
        if (slot) keys.add(slot.id);
      }
      // Old catalogs stored generic Equip directly on the printed slot.
      for (const raw of unit.upgradeSlots || []) if (raw?.required) {
        const slot = slots.find(s => s.sourceId === raw.id);
        if (slot) keys.add(slot.id);
      }
    }
    return [...keys];
  }
  function slotListFor(pkg, unit, inst, upgrades, armyId, { legacyShared = false } = {}) {
    if (battleForceVersion(pkg, armyId) !== 1 && !pkg._v2) return [];
    unit = pkg._v2?.instances[inst?.instanceId] || unit;
    const { byId } = slotRegistry(pkg);
    const count = flexibleResponseCount(unit);
    const out = [];
    for (const s of (unit.upgradeSlots || [])) {
      const sid = (typeof s === "object") ? s.id : s;
      const key = slotKey(pkg, sid);
      if (byId[key] && byId[key].kind === "dedicated") continue; // derive per-card slots from current qualifying rules
      out.push({ key, required: !!(typeof s === "object" && s.required), ...(s?.effectId ? {effectId:s.effectId} : {}) });
    }
    // Reserve the minimum before grants to keep stored base-slot indices stable.
    // Printed extra slots and subsequent modifiers still apply normally.
    if (count !== null) for (let heavy = out.filter(s => s.key === "heavy_weapon").length; heavy < count; heavy++)
      out.push({ key: "heavy_weapon", required: false });
    const grants = slotGrantsFor(pkg, unit, inst, upgrades);
    for (const g of grants.equipped) out.push({ key: g.key, addedBy: g.addedBy });
    const ov = armyOverridesFor(pkg, armyId);
    if (legacyShared) for (const g of grants.qualify) {
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
    if (!legacyShared) for (const g of grants.qualify) {
      const card = upgrades[g.upgradeId], key = 'special:' + g.upgradeId;
      if (out.some(r => r.key === key)) continue;
      const normal = accessKeys(card, pkg, pkg.upgradeRules?.[String(card.upstream?.id)])
        .filter(k => byId[k] && byId[k].kind !== 'dedicated');
      if (out.some(r => !r.virtual && [...normal, ...(g.ifAbsentAny || [])].includes(r.key))) continue;
      if (card.deprecated || restrictionConditionOk(card, unit, pkg) === false) continue;
      if (armyId != null && card.rules?.factions && !card._v2ArmyGrant && !card.rules.factions.map(Number).some(id => [Number(armyId),pkg._v2?.parentFactionId].includes(id))) continue;
      if (armyId != null && card.rules?.requiresTier?.length) {
        const rank = armyRank(unit, armyId, pkg, {}, {});
        if (rank != null && !card.rules.requiresTier.map(Number).includes(rank)) continue;
      }
      if ((ov?.slots || []).some(r => r.op === 'deny' && [key, g.key, ...normal].includes(r.slot) && matchesTarget(unit, r.target))) continue;
      out.push({key, required: false, virtual: true, upgradeId: card.id});
    }
    if (count !== null) {
      // Any X occupied heavy slots satisfy the minimum, including granted slots.
      // Only mark the required subset; never make an extra slot mandatory.
      const occupied = new Set(((inst && inst.upgrades) || []).filter(ch => {
        const card = upgrades[ch.upgradeId];
        return card && accessKeys(card, pkg, pkg.upgradeRules?.[String(card.upstream?.id)]).includes("heavy_weapon");
      }).map(ch => ch.slotIndex));
      const heavy = out.map((slot, index) => ({slot, index})).filter(r => r.slot.key === "heavy_weapon");
      heavy.sort((a, b) => Number(occupied.has(b.index)) - Number(occupied.has(a.index))
        || Number(!!b.slot.required) - Number(!!a.slot.required));
      for (const {slot} of heavy.slice(0, count)) {
        if (!slot.required) {slot.required = true; slot.requiredBy = "flexible_response";}
      }
    }
    for (const key of equipSlotKeys(unit, pkg)) {
      const matches = out.map((slot, index) => ({slot, index})).filter(r => r.slot.key === key);
      // Any one legal selection in this category satisfies Equip. Prefer its
      // occupied slot; preserve stronger pre-existing mandatory requirements.
      const target = matches.find(r => (inst.upgrades || []).some(ch => {
        const card = upgrades[ch.upgradeId];
        return ch.slotIndex === r.index && card && accessKeys(card, pkg,
          pkg.upgradeRules?.[String(card.upstream?.id)]).includes(key);
      })) || matches.find(r => r.slot.required) || matches[0];
      if (target) {
        target.slot.equipRequired = true;
        if (!target.slot.required) {target.slot.required = true;target.slot.requiredBy = 'equip';}
      }
    }
    return out;
  }
  function unitDivisions(unit) {
    return (unit.divisions || []).map(String);
  }
  function hosts(rule, card) {
    const local = (card.rules || {}).availableIn;
    // Explicit local targets are editor-authored; legacy package host lists
    // must not override them. Numeric/string references retain source-ID semantics.
    if (local?.some(h => h?.kind === 'unit')) return local;
    if (rule?.host?.length) return rule.host;
    if (local?.length) return local;
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
    if (battleForceVersion(pkg, armyId) !== 1) return null;
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
    for (const ext of extensions(armyId,pkg)) {
      const cap = ext.cap?.(unit,armyId,pkg);
      if (cap !== undefined) return cap;
    }
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
    // Explicit OR references are authoritative; invalid references never fall
    // back to a similarly spelled display name.
    if (Array.isArray(kw?.parameterRefs)) return kw.parameterRefs.map(r => [r.kind, r.id]);
    const ref = kw && kw.parameterRef;
    if (ref && typeof ref === "object" && ref.id != null && ref.id !== "") {
      return [[ref.kind, ref.id]];
    }
    const name = kw && kw.parameter;
    if (!name) return [];
    const key = normalizeKey(name);
    return Object.values(units || {}).filter(u => normalizeKey((u.name && u.name.en) || "") === key).map(u => ["unit", u.id]);
  }
  function matchesKeywordTarget(unit, [kind, id], context = {}) {
    if (!unit || id == null || id === '') return false;
    if (kind === 'rank') return (context.pkg && context.armyId != null ? armyRank(unit, context.armyId, context.pkg, context.defs, context.units) : unit.rankId) === id;
    const field = {unit: 'id', unitType: 'unitTypeId', type: 'unitTypeId',
      unitCategory: 'unitCategoryId', unitSubtype: 'unitSubtypeId', nameIdentity: 'nameIdentityId'}[kind];
    return !!field && unit[field] === id;
  }
  function detachmentLimits(unit, armyUnits, units, context = {}) {
    const legacy = unit.rules?.quantityLimitedBy || [];
    const keywords = (unit.keywords || []).filter(k => k.id === 'detachment');
    const resolved = keywords.map(k => ({keyword: k, targets: keywordTargets(k, units)}));
    // Older records retain quantityLimitedBy. Structured targets replace its
    // duplicated parent constraint, so an OR does not accidentally become AND.
    const explicit = keywords.some(k => Array.isArray(k.parameterRefs) || k.parameterRef);
    if (explicit || (!legacy.length && resolved.some(k => k.targets.length))) {
      const targets = resolved.flatMap(k => k.targets);
      const cap = armyUnits.filter(i => i.unitId !== unit.id &&
        targets.some(t => matchesKeywordTarget(context.pkg?._v2?.instances[i.instanceId] || units[i.unitId], t, context))).length;
      return {caps: [cap], unresolved: !targets.length};
    }
    if (legacy.length) return {caps: legacy.map(q => (q.ratio || 1) * armyUnits.filter(i =>
      i.unitId !== unit.id && String(units[i.unitId]?.upstream?.id) === String(q.unit)).length), unresolved: false};
    return {caps: [], unresolved: keywords.length > 0};
  }
  function entourageExemptions(armyUnits, units, context = {}) {
    const budgets = [];
    for (const [source, inst] of armyUnits.entries()) {
      const u = context.pkg?._v2?.instances[inst.instanceId] || units[inst.unitId] || {};
      for (const kw of u.keywords || []) {
        if (!kw || kw.id !== "entourage") continue;
        budgets.push({source, targets: keywordTargets(kw, units)});
      }
    }
    // One entitlement per source keyword, not per OR alternative. Augmenting
    // paths let a narrow target keep its slot when another source is broader.
    const assignments = new Map();
    function assign(budgetIndex, seen) {
      const b = budgets[budgetIndex];
      for (const [i, inst] of armyUnits.entries()) {
        if (i === b.source || seen.has(i) || !b.targets.some(t => matchesKeywordTarget(context.pkg?._v2?.instances[inst.instanceId] || units[inst.unitId], t, context))) continue;
        seen.add(i);
        if (!assignments.has(i) || assign(assignments.get(i), seen)) {
          assignments.set(i, budgetIndex);
          return true;
        }
      }
      return false;
    }
    budgets.forEach((b, i) => assign(i, new Set()));
    const exempt = {};
    for (const i of assignments.keys()) {
      const id = armyUnits[i].unitId;
      exempt[id] = (exempt[id] || 0) + 1;
    }
    Object.defineProperty(exempt,'instances',{value:new Set([...assignments.keys()].map(i=>armyUnits[i].instanceId))});
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
      const uid = String((card.upstream && card.upstream.id) || card.id || "");
      if (!uid) continue;
      add(card.id, uid);
      add((card.name && card.name.en) || "", uid);
    }
    for (const u of (defs && defs.upgrades) || []) {
      add(u.id, u.name && u.name.en);
      add((u.name && u.name.en) || "", u.id);
    }
    nameIndexSources.set(idx, {upgrades,defs,definitions:defs?.upgrades});
    return idx;
  }
  function nameIndexFor(data) {
    const source = data.nameIndex && nameIndexSources.get(data.nameIndex);
    return Object.isFrozen(data.upgrades) && source?.upgrades === data.upgrades &&
      source.defs === data.defs && source.definitions === data.defs?.upgrades
      ? data.nameIndex : buildNameIndex(data.upgrades,data.defs);
  }
  function unavailableSets(card, idx, defs) {
    const up = new Set(), fac = new Set();
    const own = String((card.upstream && card.upstream.id) || card.id || "");
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
    return evaluate(cond, unitContext(unit, pkg), pkg.predicates || {});
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
    const ctx = unitContext(unit, data.pkg);
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
  // An explicit battle-force membership overrides its parent, even when it
  // has no pool flags (for example, native mercenaries in Bright Tree Village).
  function armyMembership(unit, armyId, pkg, defs) {
    let id = Number(armyId);const seen = new Set();
    while (!seen.has(id)) {
      seen.add(id);
      const membership = (unit.factions || []).find(f => f.id === id);
      if (membership) return membership;
      const parent = pkg.battleForces?.[id]?.v2?.parentFactionId ?? parentFactionId(id,pkg,defs);
      if (parent == null) break;
      id = Number(parent);
    }
    return null;
  }
  function armyRank(unit, armyId, pkg, defs, units) {
    if (pkg?._v2 && pkg._v2.armyId === Number(armyId)) return unit?._v2Allowed ? unit.rankId : null;
    if (battleForceVersion(pkg, armyId) !== 1) return null;
    for (const ext of extensions(armyId,pkg)) {
      const rank = ext.rank?.(unit,armyId,pkg);
      if (rank !== undefined) return rank;
    }
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
    if (battleForceVersion(data.pkg, army.armyId) !== 1 && !data.pkg._v2) return {ok: false, issues: [
      {status: 'invalid', code: 'battle_force_unavailable', message: '当前战斗部队规则尚未启用。'}]};
    const { defs, pkg, nameIndex } = data;
    if (card.deprecated) return { ok: false, issues: [{ status: "invalid", code: "deprecated_card", message: "该卡为废案，不参与组军" }] };
    if (equipped && equipped.length) unit = applyPropertyEffects(unit, equipped, defs);
    const idx = nameIndex || buildNameIndex(data.upgrades, defs);
    const rule = (pkg.upgradeRules || {})[String(card.upstream && card.upstream.id || "")] || {};
    const name = (card.name && card.name.en) || card.id;
    const hostRank = armyRank(unit, army.armyId, pkg, defs, data.units);
    const issues = [];
    const add = (status, code, message) => issues.push({ status, code, message });
    if (pkg._v2?.uniqueUpgradeIds && (card.rules?.unique || rule.armyUnique) && !pkg._v2.uniqueUpgradeIds.includes(card.id))
      add('invalid','battle_force_unique_upgrade','此战斗部队不允许独特升级「'+name+'」');
    if (!runtimeAvailable(card,army,pkg)) add('invalid','extension_card_unavailable','此卡需要启用对应的战斗部队规则');
    for (const ext of extensions(army.armyId,pkg)) issues.push(...(ext.eligibility?.(card,unit,army,data,api) || []));
    const h = hosts(rule, card);
    const aliasOk = hostAliasAllows(card, unit, army, data, rule);
    const printedCondition = (card.restrictions || {}).condition;
    const conditionGovernsHost = printedCondition != null && conditionIsHostOnly(printedCondition);
    const hostMatches = h?.some(ref => ref?.kind === 'unit' ? ref.id === unit.id
      : String(ref) === String(unit.upstream?.id || ''));
    const explicitHosts = h?.some(ref => ref?.kind === 'unit');
    if (h != null && !hostMatches && !aliasOk && (!conditionGovernsHost || explicitHosts)) {
      add("invalid", "host_restriction", "此升级仅限特定角色/版本");
    }
    const facs = (card.rules || {}).factions;
    const armyIds = [army.armyId,...(pkg._v2 ? [pkg._v2.parentFactionId] : []),...extensions(army.armyId,pkg).flatMap(e => e.inheritedArmyIds?.(army,pkg) || [])];
    if (facs && !card._v2ArmyGrant && !facs.map(Number).some(id => armyIds.includes(id))) {
      add("invalid", "upgrade_faction", `升级「${name}」不属于当前军队/战斗部队`);
    }
    if (!card._v2ArmyGrant && armyIds.some(id => unavailableSets(card, idx, defs).fac.has(id))) {
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

  // Character names are shared across unique unit/upgrade versions. A comma
  // suffix is a title only when the prefix is an existing unique unit name.
  // Required unique children reserve their characters even before equipping.
  function characterConflicts(army, data) {
    const { units, upgrades, pkg } = data;
    const uniqueUpgrade = c => c?.rules?.uniqueScope !== 'card' && (c?.rules?.unique === true ||
      pkg.upgradeRules?.[String(c?.upstream?.id)]?.armyUnique === true);
    const known = new Set(Object.values(units).filter(u => u.rules?.unlimited === false)
      .map(u => normalizeKey(u.name?.en || u.id)));
    const names = card => {
      const full = card.name?.en || card.id;
      const result = new Set([normalizeKey(full)]);
      const base = normalizeKey(full.split(",")[0]);
      if (known.has(base)) result.add(base);
      return result;
    };
    const seen = new Map(), conflicts = [], pairs = new Set();
    function claim(keys, owner, instanceId, label) {
      for (const key of keys) {
        const previous = seen.get(key);
        if (previous && previous.owner !== owner) {
          const pair = [previous.owner, owner].sort().join("|");
          if (!pairs.has(pair)) {
            pairs.add(pair);
            conflicts.push({ instanceId, message: "独特角色「" + label + "」与「" + previous.label + "」重复（包含组合单位的必带角色）。" });
          }
        } else if (!previous) seen.set(key, { owner, label });
      }
    }
    for (const inst of army.units || []) {
      const u = units[inst.unitId];
      if (!u) continue;
      const children = pkg.unitRules?.[String(u.upstream?.id)]?.requiredChildren ??
        u.rules?.requiredChildren ?? [];
      const required = new Set(children.filter(c => c.elementPropertyName === "upgrades")
        .map(c => String(c.id)));
      const reserved = new Set();
      const localRequired = new Set(u.equipUpgradeIds || []);
      for (const c of Object.values(upgrades)) {
        if ((localRequired.has(c.id) || required.has(String(c.upstream?.id))) && uniqueUpgrade(c)) {
          for (const key of names(c)) reserved.add(key);
        }
      }
      if (u.rules?.unlimited === false) for (const key of names(u)) reserved.add(key);
      claim(reserved, inst.instanceId, inst.instanceId, u.name?.zh || u.name?.en || u.id);
      for (const ch of inst.upgrades || []) {
        const c = upgrades[ch.upgradeId];
        if (!c || !uniqueUpgrade(c)) continue;
        const owner = localRequired.has(c.id) || required.has(String(c.upstream?.id)) ? inst.instanceId : ch.instanceId;
        claim(names(c), owner, ch.instanceId, c.name?.zh || c.name?.en || c.id);
      }
    }
    return conflicts;
  }

  // A manually named exclusion is independent of printed names and unique flags.
  // The broader scope wins symmetrically, so selection order cannot bypass it.
  function exclusionOf(card) {
    const value = card?.rules?.exclusion;
    const name = typeof value?.name === 'string' ? value.name.trim() : '';
    return name && ['unit', 'army'].includes(value.scope) ? {name, scope: value.scope} : null;
  }
  function exclusionEntries(army, data) {
    data = resolveArmyData(army, data);
    const entries = [];
    const add = (card, unitInstanceId, instanceId) => {
      const rule = exclusionOf(card);
      if (rule) entries.push({...rule, unitInstanceId, instanceId,
        label: card.name?.zh || card.name?.en || card.id});
    };
    for (const inst of army.units || []) {
      add(data.pkg._v2?.instances[inst.instanceId] || data.units[inst.unitId], inst.instanceId, inst.instanceId);
      for (const choice of inst.upgrades || [])
        add(data.upgrades[choice.upgradeId], inst.instanceId, choice.instanceId);
    }
    return entries;
  }
  function exclusionsMatch(a, b) {
    return a.name === b.name && (a.scope === 'army' || b.scope === 'army' ||
      (a.unitInstanceId != null && a.unitInstanceId === b.unitInstanceId));
  }
  function exclusionMessage(a, b) {
    const scope = a.scope === 'army' || b.scope === 'army' ? '同军表' : '同单位卡';
    return `互斥命名依据「${a.name}」在${scope}内只能选择一张卡，与「${b.label}」互斥。`;
  }
  function exclusionFailure(card, unitInstanceId, army, data) {
    const rule = exclusionOf(card);
    if (!rule) return null;
    const entry = {...rule, unitInstanceId};
    const other = exclusionEntries(army, data).find(item => exclusionsMatch(entry, item));
    return other ? exclusionMessage(entry, other) : null;
  }
  function exclusionConflicts(army, data) {
    const groups = new Map(), conflicts = new Map();
    for (const entry of exclusionEntries(army, data)) {
      const previous = groups.get(entry.name) || [];
      for (const other of previous) if (exclusionsMatch(entry, other)) {
        for (const [a, b] of [[entry, other], [other, entry]])
          if (!conflicts.has(a)) conflicts.set(a, {instanceId: a.instanceId,
            unitInstanceId: a.unitInstanceId, message: exclusionMessage(a, b)});
      }
      previous.push(entry);
      groups.set(entry.name, previous);
    }
    return [...conflicts.values()];
  }

  function validateArmy(army, data) {
    const source = data._source || data;
    if (battleForceVersion(source.pkg, army.armyId) === 2 && window.UpgradeFaces)
      army = UpgradeFaces.normalizeArmy(structuredClone(army), source);
    data = resolveArmyData(army,data);
    const version = battleForceVersion(data.pkg, army.armyId);
    if (version !== 1 && !data.pkg._v2) {
      if (version === 2 && window.BattleForceV2) return BattleForceV2.pendingReport(army, data);
      const basePoints = (army.units || []).reduce((sum, inst) => sum + (data.units[inst.unitId]?.points || 0) +
        (inst.upgrades || []).reduce((points, choice) => points + (data.upgrades[choice.upgradeId]?.points || 0), 0), 0);
      return {status: 'invalid', basePoints, effectivePoints: basePoints, rankCounts: {}, issues: [
        {status: 'invalid', code: 'battle_force_version', instanceId: null,
          message: '此战斗部队需要尚未载入或不支持的规则版本，当前仅显示原始费用。'}]};
    }
    const { units, upgrades, defs, pkg } = data;
    if (window.UpgradeFaces) army = UpgradeFaces.normalizeArmy(structuredClone(army), {...data, upgrades: UpgradeFaces.forCatalog(upgrades)});
    const issues = [...(data.pkg._v2?.issues || [])];
    const issue = (status, code, message, instanceId, extra) => issues.push({ status, code, message, instanceId, ...(extra || {}) });
    const nameIndex = nameIndexFor(data);

    let basePoints = 0;
    const seen = [], sel = [];

    let mode = (pkg.modes || {})[army.mode || "standard"] || {};
    const bf = (pkg.battleForces || {})[String(army.armyId)];
    if (bf) {
      mode = { ...mode, ...((bf.modes || {})[army.mode || "standard"] || {}) };
      if (bf.status === 'draft') issue('unknown', 'battle_force_draft', '此战斗部队为尚未启用的规则草案，不能据此确认军表合法性。', null);
      if ((bf.unparsedRules || []).length) issue("unknown", "battle_force_rules", "战斗部队仍有未机器化的规则文本：" + bf.unparsedRules.join(" / "), null);
    }
    const pointsLimit = army.pointsLimit || mode.points || 1000;

    for (const inst of army.units || []) {
      const key = inst.instanceId;
      const unit = pkg._v2?.instances[inst.instanceId] || units[inst.unitId];
      if (!unit) { issue("invalid", "missing_unit", "单位引用不存在", key); continue; }
      if (unit.usage === "counterpart" || unit.isCounterpart) {
        issue("invalid", "counterpart_as_unit", "伙伴卡需通过宿主单位的伙伴槽加入，不能作为独立单位", key);
      }
      basePoints += unit.points || 0;
      if (!runtimeAvailable(unit,army,pkg)) issue('invalid','extension_card_unavailable','此单位需要启用对应的战斗部队规则',key);
      const memberRank = armyRank(unit, army.armyId, pkg, defs, units);
      if (memberRank == null) { issue("invalid", "army_membership", "此单位未列入当前军队", key); continue; }
      const urc = (unit.restrictions || {}).condition;
      if (urc !== undefined && urc !== null) {
        const urcOk = evaluate(urc, unitContext(unit, pkg), pkg.predicates || {});
        if (urcOk === false) issue("invalid", "unit_restriction_condition", `单位「${(unit.name && unit.name.en) || unit.id}」不满足卡面限制条件`, key);
        else if (urcOk === null) issue("unknown", "unit_restriction_condition_unknown", `单位「${(unit.name && unit.name.en) || unit.id}」的卡面限制条件存在未覆盖语义`, key);
      }

      const slotList = slotListFor(pkg, unit, inst, upgrades, army.armyId);
      for (const slot of equipSlotKeys(unit, pkg)) if (!slotList.some(r => r.key === slot)) {
        const name = (pkg.slots || []).find(s => s.id === slot)?.name;
        issue('invalid', 'required_slot', `Equip：需要装备「${name?.zh || name?.en || slot}」升级，但当前没有可用的该类槽位`, key);
      }
      const heavyRequired = flexibleResponseCount(unit);
      if ((unit.keywords || []).some(k => k && k.id === "flexible_response") && heavyRequired === null)
        issue("unknown", "flexible_response_value", "灵活响应的数值 X 未设置或无效，请在单位编辑器填写非负整数", key);
      if (heavyRequired !== null && slotList.filter(s => s.key === "heavy_weapon").length < heavyRequired)
        issue("invalid", "required_slot", `灵活响应 ${heavyRequired}：至少需要 ${heavyRequired} 个重武器槽，当前可用槽位不足`, key);
      for (const rec of slotList) {
        if (rec.virtual && !rec.upgradeId) issue("unknown", "dedicated_grant_virtual", `该单位满足专用槽 ${rec.key} 的语义条件，但本地基础槽未包含；已按虚拟槽补入`, key);
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
        if (slotList[i].required && !(i in assigned)) issue("invalid", "required_slot",
          slotList[i].requiredBy === "flexible_response"
            ? `灵活响应 ${heavyRequired}：必选重武器槽尚未配置升级（须至少装备 ${heavyRequired} 张）`
            : slotList[i].equipRequired
              ? `Equip：必选「${(pkg.slots || []).find(s => s.id === slotList[i].key)?.name?.zh || slotList[i].key}」槽尚未配置升级`
            : `必选槽位 ${slotList[i].key} 尚未配置升级`, key);
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
      for (const id of unit.equipUpgradeIds || []) {
        if (!inst.upgrades.some(ch => ch.upgradeId === id))
          issue("invalid", "required_child_missing", "缺少必带升级「" + (upgrades[id]?.name?.zh || upgrades[id]?.name?.en || id) + "」", key);
      }
      if (!children) children = (unit.rules || {}).requiredChildren;
      if (children) {
        const locallyChecked = new Set((unit.equipUpgradeIds || [])
          .map(id => String(upgrades[id]?.upstream?.id || "")));
        const have = (inst.upgrades || []).map(u => upgrades[u.upgradeId]).filter(Boolean)
          .map(c => String(c.upstream && c.upstream.id || ""));
        for (const child of children) {
          if (extensions(army.armyId,pkg).some(e => e.requiredChildActive?.(child,army,pkg) === false)) continue;
          if (locallyChecked.has(String(child.id))) continue;
          if (!have.includes(String(child.id))) issue("invalid", "required_child_missing", `缺少必带升级（上游 ID ${child.id}）`, key);
        }
      }
    }

    for (const conflict of exclusionConflicts(army, data))
      issue('invalid', 'named_exclusion', conflict.message, conflict.instanceId,
        {unitInstanceId: conflict.unitInstanceId});

    // conflicts / uniqueness
    const byName = {}, conflictGroups = {}, selectedUpstream = new Set();
    for (const [upstreamId, cardId, ckey] of seen) {
      const card = upgrades[cardId] || {};
      const name = String((card.name && card.name.en) || cardId).toLowerCase();
      (byName[card.rules?.uniqueScope === 'card' ? cardId : name] ||= new Set()).add(cardId);
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
        if (ca.up.has(bu || bc) || cb.up.has(au || ac)) issue("invalid", "upgrade_conflict", "选择了互斥的升级", akey);
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

    for (const conflict of characterConflicts(army, {units, upgrades, pkg})) {
      issue("invalid", "character_duplicate", conflict.message, conflict.instanceId);
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
    const entourageExempt = entourageExemptions(army.units || [], units, {pkg, defs, units, armyId: army.armyId});
    for (const [unitId, copies] of Object.entries(pkg._v2 ? {} : unitIdCounts)) {
      const unit = units[unitId];
      let rank = armyRank(unit, army.armyId, pkg, defs, units);
      if (rank == null) continue;
      if (unitReplaceTier[unitId] != null) rank = unitReplaceTier[unitId];
      const tc = (unit.rules || {}).tierCounting || {};
      let ignoreMin = tc.ignoreMinimum === true;
      let ignoreMax = tc.ignoreMaximum === true;
      const ftc = armyMembership(unit,army.armyId,pkg,defs)?.tierCounting || {};
      if (ftc.ignoreMinimum === true) ignoreMin = true;
      if (ftc.ignoreMaximum === true) ignoreMax = true;
      if (extensions(army.armyId,pkg).some(e => e.countMercenaries)) ignoreMin = false;
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
      const entExempt = entourageExempt[unitId] || 0;
      maxCounts[rank] = (maxCounts[rank] || 0) + (ignoreMax ? 0 : Math.max(0, copies - exempt - entExempt));
    }
    if (pkg._v2) {
      for (const inst of army.units || []) {
        const unit=pkg._v2?.instances[inst.instanceId] || units[inst.unitId];if(!unit)continue;
        let rank=armyRank(unit,army.armyId,pkg,defs,units);if(rank==null)continue;
        for(const choice of inst.upgrades || []) if(upgrades[choice.upgradeId]?.rules?.replaceTier!=null)rank=upgrades[choice.upgradeId].rules.replaceTier;
        const tc=unit.rules?.tierCounting || {};
        const ftc=armyMembership(unit,army.armyId,pkg,defs)?.tierCounting || {};
        if(!tc.ignoreMinimum&&!ftc.ignoreMinimum)minCounts[rank]=(minCounts[rank]||0)+1;
        const exempt=entourageExempt.instances.has(inst.instanceId);
        maxCounts[rank]=(maxCounts[rank]||0)+(!tc.ignoreMaximum&&!ftc.ignoreMaximum&&!exempt?1:0);
      }
      for(const limit of pkg._v2.unitLimits) {
        const unit=units[limit.unitId],count=unitIdCounts[limit.unitId]||0;
        const title=unit?.title?.zh || unit?.title?.en;
        const name=(unit?.name?.zh || unit?.name?.en || limit.unitId)+(title?'（'+title+'）':'');
        if(count<(limit.min||0))issue('invalid','battle_force_unit_min',name+'至少需要 '+limit.min+' 个',null,{rank:unit?.rankId});
        if(count>limit.max)issue('invalid','battle_force_unit_max',name+'最多 '+limit.max+' 个',null,{rank:unit?.rankId});
      }
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
      if (total > combo.maximum) issue("invalid", "rank_combined", `军阶组合 ${combo.tiers} 合计超过上限 ${combo.maximum}`, null, { ranks: combo.tiers });
    }

    // command cards
    const commandChecks = (army.commandIds || []).some(Boolean) ? commandContext(army,data) : null;
    for (const cid of army.commandIds || []) {
      const cmd = (defs.commands || []).find(x => String(x.id) === String(cid));
      if (!cmd) { issue("invalid", "command_missing", `命令卡引用不存在：${cid}`, null); continue; }
      const name = (cmd.name && cmd.name.en) || cid;
      if (cmd.hidden) { issue("invalid", "command_hidden", `命令卡「${name}」已停用，请替换`, null); continue; }
      const result = commandEligibility(cmd,army,data,commandChecks);
      if (!result.ok) for (const check of result.requirements.filter(c=>!c.met))
        issue('invalid', check.code || 'command_unlock', `命令卡「${name}」${result.reason}`, null);
      if (!result.ok && !result.requirements.length) issue('invalid','command_unlock',`命令卡「${name}」${result.reason}`,null);
      if ((cmd.campaigns || []).length) issue('unknown','command_campaign',`命令卡「${name}」为战役卡，标准模式资格待核验`,null);
    }
    const hand = mode.commandHand;
    if (hand && (army.commandIds || []).length) {
      const pips = (army.commandIds || []).map(cid => {
        const c = (defs.commands || []).find(x => String(x.id) === String(cid));
        if (!c || c.hidden) return null;
        return commandSlotPips(c);
      }).filter(p => p != null);
      for (const rule of hand) {
        const n = pips.filter(p => p === rule.pips).length;
        if (n < (rule.min || 0)) issue("invalid", "command_min", `${rule.pips} 点命令卡不足 ${rule.min} 张`, null);
        if (n > (rule.max || 99)) issue("invalid", "command_max", `${rule.pips} 点命令卡超过 ${rule.max} 张`, null);
      }
    }

    // Each rank has its own allowance. Allies of Convenience supplies one
    // shared overflow across all ranks, regardless of how many sources grant it.
    const pool = (mode.pools || {}).mercenary;
    if (pool && !extensions(army.armyId,pkg).some(e => e.countMercenaries)) {
      const counts = new Map();
      let hasBonus = false;
      const grantsBonus = card => (card.keywords || []).some(k => k.id === 'allies_of_convenience') ||
        (card.rules?.poolBonuses || []).includes(pool.bonus?.when || 'extraMercenary');
      for (const inst of army.units || []) {
        const unit = pkg._v2?.instances[inst.instanceId] || units[inst.unitId];
        if (!unit || unit.isCounterpart || unit.usage === 'counterpart') continue;
        let rank = armyRank(unit,army.armyId,pkg,defs,units);
        if (rank == null) continue;
        const cards = (inst.upgrades || []).map(ch => upgrades[ch.upgradeId]).filter(Boolean);
        hasBonus ||= grantsBonus(applyPropertyEffects(unit,cards,defs)) || cards.some(grantsBonus);
        for (const card of cards) if (card.rules?.replaceTier != null) rank = Number(card.rules.replaceTier);
        const membership = armyMembership(unit,army.armyId,pkg,defs);
        if (membership?.tierPools?.includes('mercenary')) counts.set(rank,(counts.get(rank) || 0) + 1);
      }
      const exceeded = [...counts].sort(([a],[b]) => a-b).map(([rank,count]) =>
        ({rank,count,limit:pool.perTierMax?.[rank] ?? pool.max ?? 1})).filter(r => r.count > r.limit);
      const overflow = exceeded.reduce((sum,r) => sum + r.count - r.limit,0);
      const bonus = hasBonus ? (pool.bonus?.overflow ?? 1) : 0;
      if (overflow > bonus) {
        const ranks = exceeded.map(r => r.rank);
        const detail = exceeded.map(r => {
          const def = (defs.ranks || []).find(d => d.id === r.rank);
          return `${def?.name?.zh || def?.name?.en || '军阶 '+r.rank}雇佣兵 ${r.count} 个（通常上限 ${r.limit}）`;
        }).join('；');
        issue('invalid','mercenary_pool',`${detail}；超出名额共 ${overflow} 个，全军可用额外名额 ${bonus} 个`,null,
          ranks.length === 1 ? {rank:ranks[0]} : {ranks});
      }
    }

    // effects (local)
    let effectivePoints = basePoints;
    for (const selection of sel) {
      const card = upgrades[selection.cardId];
      effectivePoints += upgradePoints(card,units[selection.unitId],army,data) - (card.points || 0);
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
      const limits = detachmentLimits(unit, army.units || [], units, {pkg, defs, units, armyId: army.armyId});
      if (limits.caps.some(cap => copies > cap)) issue("invalid", "quantity_limited", `「${unit.name?.en || unitId}」数量受母单位限制`, null);
      if (limits.unresolved) issue("unknown", "detachment_target", `「${unit.name?.en || unitId}」附属目标未关联，暂不能校验母单位`, null);
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
    }
    for (const inst of army.units || []) {
      const u = units[inst.unitId];
      if (!u) continue;
      const cap = unitCapFor(u, pkg, army.armyId);
      if (cap == null) continue;
      const copies = (army.units || []).filter(x => x.unitId === inst.unitId).length;
      if (copies > cap) issue("invalid", "unit_limit_exceeded", `「${(u.name && u.name.en) || u.id}」最多 ${cap} 个（当前 ${copies}）`, null);
    }
    if (bf && version === 1) battleForceChecks(army, bf, units, upgrades, defs, issue);
    for (const ext of extensions(army.armyId,pkg)) ext.validate?.(army,data,api,issue);
    if (effectivePoints > pointsLimit) issue("invalid", "points_limit", `有效费用 ${effectivePoints} 超过上限 ${pointsLimit}`, null);

    const hasInvalid = issues.some(i => i.status === "invalid");
    const hasUnknown = issues.some(i => i.status === "unknown");
    issues.push({ status: "unknown", code: "coverage_note", message: "属性效果（addProperties/replaceProperties）已参与资格判断；卡面限制、费用修正、chooseOneKey、quantityLimitedBy、军阶豁免、军阶要求/替换军阶与互斥卡牌已执行。战斗部队规则未覆盖项仍标 unknown。", instanceId: null });
    return { status: hasInvalid ? "invalid" : (hasUnknown ? "unknown" : "valid"), basePoints, effectivePoints, rankCounts: maxCounts, issues };
  }

  // Groups are ANDed; alternate unit versions inside a group are ORed.
  // Counterpart upgrades are a separate namespace and cannot satisfy a unit ID.
  function commandUnitRequirements(command, army, units, defs) {
    if (command.requirements) return commandEligibility(command,army,{units,defs,pkg:{},upgrades:{}}).requirements;
    const present = new Set((army.units || []).map(i => units[i.unitId]).filter(u =>
      u && u.upstream?.collection === 'units').map(u => String(u.upstream.id)));
    return (command.requiredUnitGroups || []).map(unitIds => {
      const names = unitIds.map(id => {
        const unit = Object.values(units).find(u => u.upstream?.collection === 'units' && String(u.upstream.id) === String(id));
        const source = (defs.sourceUnits || []).find(u => String(u.id) === String(id));
        return unit?.name?.zh || unit?.name?.en || source?.name?.zh || source?.name?.en?.split(' · ')[0] || '单位 ' + id;
      });
      return { unitIds, label: [...new Set(names)].join(' / '), met: unitIds.some(id => present.has(String(id))) };
    });
  }

  // Printed pips determine play priority; hand construction may override them.
  const commandSlotPips = card => card?.slotPips ?? card?.pips ?? null;
  const commandFields = ['id','name','title','nameIdentityId','factionId','affiliationIds','rankId','unitTypeId','keywords'];
  const commandText = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  function commandRequirementErrors(requirements) {
    const errors = [], object = v => v && typeof v === 'object' && !Array.isArray(v);
    const keys = (v,allowed) => object(v) && Object.keys(v).every(k => allowed.includes(k));
    const values = (v,numeric=false) => Array.isArray(v) && v.length > 0 && v.length <= 256 &&
      v.every(x => numeric ? Number.isSafeInteger(x) && x > 0 : typeof x === 'string' && !!x.trim()) && new Set(v).size === v.length;
    if (!keys(requirements,['any']) || !Array.isArray(requirements.any) || requirements.any.length > 32) return ['使用条件需要 any 条件组数组'];
    for (const group of requirements.any) {
      if (!keys(group,['all']) || !Array.isArray(group.all) || !group.all.length || group.all.length > 32) {errors.push('条件组至少需要一个条件');continue;}
      for (const atom of group.all) {
        if (atom?.type === 'unit') {
          if (!keys(atom,['type','all']) || !Array.isArray(atom.all) || !atom.all.length || atom.all.length > 16) {errors.push('单位匹配至少需要一个筛选条件');continue;}
          for (const filter of atom.all) if (!keys(filter,['field','values']) || !commandFields.includes(filter.field) ||
            !values(filter.values,['factionId','rankId','unitTypeId'].includes(filter.field))) errors.push('单位匹配方式或取值无效');
        } else if (!keys(atom,['type','values']) || !['unitNames','armyFaction','battleForce','upgrade'].includes(atom.type) ||
          !values(atom.values,['armyFaction','battleForce'].includes(atom.type)) || atom.type === 'unitNames' && atom.values.length < 2)
          errors.push('匹配方式或取值无效；名称组合至少选择两个名称');
      }
    }
    return errors;
  }
  function commandArmyFaction(armyId,pkg,defs) {
    let id = Number(armyId);const seen = new Set();
    while (!seen.has(id)) {
      seen.add(id);
      const bf = pkg.battleForces?.[id];
      const parent = bf?.v2?.parentFactionId ?? (defs.armies || []).find(a => bf?.parentFaction &&
        [a.name?.en,a.name?.zh].includes(bf.parentFaction))?.id;
      if (parent == null) break;
      id = Number(parent);
    }
    return id;
  }
  function commandContext(army,input) {
    const data = resolveArmyData(army,input), indexes = Object.fromEntries(commandFields.map(f => [f,new Map()]));
    const upgrades = new Set(), legacyUnits = new Set(), legacyUpgrades = new Set(), effective = [];
    const add = (field,value,index) => {
      if (value == null || value === '') return;
      const key = ['name','title'].includes(field) ? commandText(value) : String(value);
      const map = indexes[field];if (!map.has(key)) map.set(key,new Set());map.get(key).add(index);
    };
    for (const [index,inst] of (army.units || []).entries()) {
      const unit = data.pkg._v2?.instances[inst.instanceId] || data.units[inst.unitId];if (!unit) continue;
      const cards = (inst.upgrades || []).map(ch => {
        const card = data.upgrades?.[ch.upgradeId];
        if (card) {upgrades.add(card.id);if (card.upstream?.id) legacyUpgrades.add(String(card.upstream.id));}
        return card;
      }).filter(Boolean);
      const value = applyPropertyEffects(unit,cards,data.defs);effective.push(value);
      if (unit.upstream?.collection === 'units') legacyUnits.add(String(unit.upstream.id));
      for (const field of commandFields) {
        const vals = ['name','title'].includes(field) ? [value[field]?.en,value[field]?.zh] :
          field === 'keywords' ? (value.keywords || []).map(k=>k.id) : field === 'affiliationIds' ? value[field] || [] : [value[field]];
        for (const v of vals) add(field,v,index);
      }
    }
    const labels=Object.fromEntries(commandFields.map(f=>[f,new Map()]));
    const named=row=>row?.name?.zh||row?.name?.en||'';
    for(const unit of Object.values(data.units)) {
      labels.id.set(unit.id,[named(unit),unit.title?.zh||unit.title?.en].filter(Boolean).join(' · '));
      if(unit.nameIdentityId&&!labels.nameIdentityId.has(unit.nameIdentityId))labels.nameIdentityId.set(unit.nameIdentityId,named(unit));
      for(const field of ['name','title'])for(const value of [unit[field]?.en,unit[field]?.zh])if(value)
        labels[field].set(commandText(value),unit[field]?.zh||unit[field]?.en);
    }
    for(const [field,table] of Object.entries({factionId:'factions',affiliationIds:'affiliations',rankId:'ranks',unitTypeId:'unitTypes',keywords:'keywords'}))
      for(const row of data.defs[table]||[])labels[field].set(String(row.id),named(row));
    return {data,army,indexes,labels,upgrades,legacyUnits,legacyUpgrades,effective,
      faction:commandArmyFaction(army.armyId,data.pkg,data.defs),results:new WeakMap()};
  }
  function commandEligibility(command,army,data,context) {
    const ctx = context || commandContext(army,data);
    if (ctx.results.has(command)) return ctx.results.get(command);
    const {defs,pkg} = ctx.data;
    const named = row => row?.name?.zh || row?.name?.en || '';
    const label = (field,value) => ctx.labels[field].get(['name','title'].includes(field)?commandText(value):String(value)) || String(value);
    const fieldName = {id:'单位',name:'单位名称',title:'称号',nameIdentityId:'名称标识',factionId:'单位阵营',affiliationIds:'组织',rankId:'军阶',unitTypeId:'单位类型',keywords:'词条'};
    const hits = filter => {
      const ids=new Set();for(const v of filter.values) for(const id of ctx.indexes[filter.field].get(['name','title'].includes(filter.field)?commandText(v):String(v)) || []) ids.add(id);
      return ids;
    };
    const check = atom => {
      if (atom.type === 'unit') {
        const sets=atom.all.map(hits),met=[...sets[0]].some(id=>sets.every(s=>s.has(id)));
        return {met,label:atom.all.map(f=>fieldName[f.field]+'：'+f.values.map(v=>label(f.field,v)).join(' / ')).join(' ＋ ')};
      }
      if (atom.type === 'unitNames') {
        const sets=atom.values.map(v=>hits({field:'name',values:[v]})),owners=new Map();
        const assign=(index,seen)=>{for(const id of sets[index]) if(!seen.has(id)) {seen.add(id);if(!owners.has(id)||assign(owners.get(id),seen)){owners.set(id,index);return true;}}return false;};
        return {code:'command_required_units',met:sets.every((_,i)=>assign(i,new Set())),label:'同时编入：'+atom.values.map(v=>label('name',v)).join(' ＋ ')};
      }
      if (atom.type === 'upgrade') return {met:atom.values.some(id=>ctx.upgrades.has(id)),label:'携带升级：'+atom.values.map(id=>named(ctx.data.upgrades[id])||id).join(' / ')};
      const force = atom.type === 'battleForce';
      return {code:'command_faction',met:atom.values.includes(force?Number(army.armyId):ctx.faction),label:(force?'战斗部队：':'军表阵营：')+atom.values.map(id=>{
        const bf=pkg.battleForces?.[id];return force ? bf?.nameZh || bf?.name || String(id) : named((defs.armies||[]).find(x=>x.id===id)) || String(id);
      }).join(' / ')};
    };
    let checks=[],ok=true,reason='';
    if (command.hidden) {ok=false;reason='此指挥卡已停用';}
    else if (Object.prototype.hasOwnProperty.call(command,'requirements')) {
      const errors=commandRequirementErrors(command.requirements);
      if(errors.length){ok=false;reason=errors.join('；');}
      else {
        const groups=command.requirements.any.map(g=>g.all.map(check));
        ok=!groups.length || groups.some(g=>g.every(c=>c.met));
        checks=groups.find(g=>g.every(c=>c.met)) || groups.sort((a,b)=>a.filter(c=>!c.met).length-b.filter(c=>!c.met).length)[0] || [];
        if(!ok)reason=(groups.length>1?'需满足任一条件组；尚缺：':'尚缺：')+checks.filter(c=>!c.met).map(c=>c.label).join('；');
      }
    } else {
      // Old histories remain readable; current cards use requirements exclusively.
      const facs=command.factions || [];
      if(facs.length)checks.push({met:facs.includes(Number(army.armyId))||facs.includes(ctx.faction),label:'适用军队'});
      const unlocks=(command.unlockedBy||[]).filter(x=>x.propertyName==='units');
      if(unlocks.length)checks.push({label:'解锁单位',met:unlocks.some(x=>x.id!=null?ctx.legacyUnits.has(String(x.id)):
        ctx.effective.some(u=>({faction:[u.factionId],affiliation:u.affiliationIds,rank:[u.rankId],unitType:[u.unitTypeId],keywords:(u.keywords||[]).map(k=>k.id)}[x.property]||[]).map(String).includes(String(x.value))))});
      for(const group of command.requiredUnitGroups||[])checks.push({label:'同时编入的角色',met:group.some(id=>ctx.legacyUnits.has(String(id)))});
      for(const x of command.unlockedBy||[])if(x.propertyName==='upgrades')checks.push({label:'解锁升级',met:ctx.legacyUpgrades.has(String(x.id))});
      if(command.titleMatch)checks.push({label:'称号：'+command.titleMatch,met:ctx.effective.some(u=>commandText(u.title?.en).includes(commandText(command.titleMatch)))});
      if(command.condition)checks.push({label:'单位条件',met:ctx.effective.some(u=>evaluate(command.condition,unitContext(u,pkg),pkg.predicates||{})===true)});
      if(command.mercenary)checks.push({label:'雇佣兵单位',met:ctx.effective.some(u=>(u.keywords||[]).some(k=>k.id==='mercenary')||(u.factions||[]).some(f=>f.tierPools?.includes('mercenary')))});
      ok=checks.every(c=>c.met);if(!ok)reason='尚缺：'+checks.filter(c=>!c.met).map(c=>c.label).join('；');
    }
    const result={ok,requirements:checks,reason};ctx.results.set(command,result);return result;
  }

  // Optional faction modules share this narrow contract; the base engine knows
  // nothing about clan IDs, special cards, or faction-specific option names.
  const allExtensions = () => window.ArmyRuleExtensions || [];
  const extensions = (armyId,pkg) => battleForceVersion(pkg,armyId) === 1 ? allExtensions().filter(e => e.applies(armyId,pkg)) : [];
  function prepareData(data) { for (const ext of allExtensions()) ext.prepareData?.(data); return data; }
  function runtimeAvailable(card,army,pkg) {
    if(pkg._v2)return card?._v2Allowed !== false && !card?.runtimeVariant;
    return battleForceVersion(pkg,army.armyId) === 1 && allExtensions().every(e => !e.available || e.available(card,army,pkg));
  }
  function upgradePoints(card,unit,army,data) {
    data = resolveArmyData(army,data);
    if (data.pkg._v2) card = data.upgrades[card.id] || card;
    let points = card.points || 0;
    if (data.pkg._v2 && globalThis.BattleForceRuntime) points = BattleForceRuntime.upgradePoints(card,unit,data);
    if (battleForceVersion(data.pkg,army.armyId) !== 1 && !data.pkg._v2) return points;
    const unitIds = new Set((army.units || []).map(i => String(data.units[i.unitId]?.upstream?.id)));
    for (const m of card.rules?.modifiedPointsWith || []) {
      if (allExtensions().some(e => e.ownsPointModifier?.(m))) continue;
      if ((m.property === 'units' && unitIds.has(String(m.id))) ||
          (m.property === 'options' && (army.options || []).map(String).includes(String(m.id)) && unitIds.has(String(m.in)))) points += m.modifier || 0;
    }
    for (const ext of extensions(army.armyId,data.pkg)) points += ext.adjustment?.(card,unit,army,data.pkg) || 0;
    return Math.max(0,points);
  }
  function defaultUpgradeIds(unit,instance,army,data) {
    return extensions(army.armyId,data.pkg).flatMap(e => e.defaultUpgrades?.(unit,instance,army,data,api) || []);
  }
  function cleanupArmy(army,data) { return allExtensions().flatMap(e => e.cleanup?.(army,data) || []); }
  function isTransitionalIssue(code,army,pkg) { return extensions(army.armyId,pkg).some(e => e.transitionalCodes?.includes(code)); }
  const api = { Dice, evaluate, validateArmy, unitContext, upgradeEligibility, keywordTargets, matchesKeywordTarget, detachmentLimits, entourageExemptions, armyRank, slotKey, accessKeys, slotGrantsFor, dedicatedSlotKeys, equipSlotKeys, slotListFor, restrictionConditionOk, requiredPropertiesOk, normRp, buildNameIndex, unavailableSets, unitCapFor, commandUnitRequirements,
    commandSlotPips,commandRequirementErrors,commandArmyFaction,commandContext,commandEligibility,
    applyPropertyEffects,prepareData,runtimeAvailable,upgradePoints,defaultUpgradeIds,cleanupArmy,isTransitionalIssue,battleForceVersion,resolveArmyData,unitFor,exclusionFailure,exclusionConflicts };
  return api;
})();
