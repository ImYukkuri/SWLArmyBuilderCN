/* Presentation groups and atomic roster edits. Stored units remain independent. */
window.BuilderModel = (() => {
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .filter((k) => k !== "instanceId")
          .map((k) => [k, canonical(value[k])]),
      );
    return value;
  }

  function signature(instance) {
    const value = canonical(instance);
    value.upgrades = [...(value.upgrades || [])].sort(
      (a, b) =>
        a.slotIndex - b.slotIndex || JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
    return JSON.stringify(value);
  }

  function groups(army, data) {
    const result = new Map();
    for (const instance of army.units) {
      const key = signature(instance);
      if (!result.has(key))
        result.set(key, { key, unit: data.units[instance.unitId], instances: [] });
      result.get(key).instances.push(instance);
    }
    return [...result.values()];
  }

  // Keep stored slot indices intact; display grants immediately after their
  // granting upgrade, including upgrades equipped in another granted slot.
  function slotOrder(instance, records) {
    const parents = new Map(), children = new Map();
    records.forEach((record, index) => {
      if (!record.addedBy || record.addedBy === 'override') return;
      const owner = (instance.upgrades || []).find(choice => choice.upgradeId === record.addedBy);
      const parent = owner?.slotIndex;
      if (!Number.isInteger(parent) || !records[parent] || parent === index) return;
      parents.set(index, parent);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(index);
    });
    const order = [], seen = new Set();
    const visit = index => {
      if (seen.has(index)) return;
      seen.add(index);
      order.push(index);
      for (const child of children.get(index) || []) visit(child);
    };
    records.forEach((_, index) => { if (!parents.has(index)) visit(index); });
    // Malformed legacy links must not hide slots or create an infinite loop.
    records.forEach((_, index) => visit(index));
    return order;
  }

  // Slot indices are persisted. Match logical slots before changing those
  // indices so grants/removals cannot silently move an existing card elsewhere.
  function rebindSlots(instance, before, after, data, {allowOrphans = false} = {}) {
    const identities = records => {
      const counts = new Map();
      return records.map(r => {
        const key = JSON.stringify([r.key, r.addedBy || null]);
        const n = counts.get(key) || 0;
        counts.set(key, n + 1);
        return key + ':' + n;
      });
    };
    const oldIds = identities(before), newIds = identities(after), used = new Set();
    const entries = (instance.upgrades || []).map(choice => {
      const card = data.upgrades[choice.upgradeId];
      const allowed = card ? RulesCore.accessKeys(card, data.pkg,
        data.pkg.upgradeRules?.[String(card.upstream?.id)]) : [];
      return {choice, allowed, index: -1};
    });
    const reserve = (entry, index) => {
      if (index < 0 || used.has(index) || !entry.allowed.includes(after[index].key)) return false;
      entry.index = index;
      used.add(index);
      return true;
    };
    // Preserve occupied ordinary slots before moving former exempt selections.
    for (const e of entries) if (oldIds[e.choice.slotIndex] != null)
      reserve(e, newIds.indexOf(oldIds[e.choice.slotIndex]));
    for (const e of entries.filter(e => e.index < 0).sort((a,b) => a.allowed.length - b.allowed.length)) {
      const special = after.findIndex(r => r.key === 'special:' + e.choice.upgradeId);
      if (!reserve(e, special)) reserve(e, after.findIndex((r,i) => !used.has(i) && e.allowed.includes(r.key)));
    }
    const unresolved = entries.filter(e => e.index < 0).map(e => e.choice.upgradeId);
    if (unresolved.length && !allowOrphans) return {ok: false, unresolved};
    let orphanIndex = after.length;
    for (const e of entries) e.choice.slotIndex = e.index < 0 ? orphanIndex++ : e.index;
    return {ok: unresolved.length === 0, unresolved};
  }

  function migrateSlots(army, data) {
    if (army.slotLayoutVersion >= 1) return army;
    for (const inst of army.units || []) {
      const unit = data.units[inst.unitId];
      if (!unit) continue;
      const old = RulesCore.slotListFor(data.pkg, unit, inst, data.upgrades, army.armyId, {legacyShared: true});
      const current = RulesCore.slotListFor(data.pkg, unit, inst, data.upgrades, army.armyId);
      if (JSON.stringify(old) !== JSON.stringify(current))
        rebindSlots(inst, old, current, data, {allowOrphans: true});
    }
    army.slotLayoutVersion = 1;
    return army;
  }

  function removeUpgrade(army, data, instanceId, choiceId) {
    const inst = army.units.find(i => i.instanceId === instanceId);
    if (!inst) return;
    const unit = data.units[inst.unitId];
    const records = () => unit ? RulesCore.slotListFor(data.pkg, unit, inst, data.upgrades, army.armyId) : [];
    const before = records();
    inst.upgrades = inst.upgrades.filter(ch => ch.instanceId !== choiceId);
    rebindSlots(inst, before, records(), data, {allowOrphans: true});
  }

  function uniqueUpgrade(card, data) {
    return (
      card?.rules?.unique === true ||
      data.pkg.upgradeRules?.[String(card?.upstream?.id)]?.armyUnique === true
    );
  }

  function copyable(instance, data) {
    const unit = data.units[instance.unitId];
    return (
      !!unit &&
      unit.rules?.unlimited !== false &&
      !(instance.upgrades || []).some((ch) => uniqueUpgrade(data.upgrades[ch.upgradeId], data))
    );
  }

  // Explicit checks also catch worsening an already-invalid global count,
  // whose report message may be identical before and after the operation.
  function selectionFailure(card, instance, army, data) {
    if (!card) return "升级资料已不存在。";
    const name = (c) => String(c.name?.en || c.id).toLowerCase();
    const rule = (c) => data.pkg.upgradeRules?.[String(c.upstream?.id)] || {};
    const selected = army.units.flatMap((i) =>
      i.upgrades.map((ch) => data.upgrades[ch.upgradeId]).filter(Boolean),
    );
    if (
      instance.upgrades.some(
        (ch) =>
          data.upgrades[ch.upgradeId] && name(data.upgrades[ch.upgradeId]) === name(card),
      )
    )
      return "同一单位不能重复装备同名升级。";
    if (
      selected.some(
        (c) => (c.rules?.uniqueScope === 'card' || card.rules?.uniqueScope === 'card' ? c.id === card.id : name(c) === name(card)) && (uniqueUpgrade(c, data) || uniqueUpgrade(card, data)),
      )
    )
      return "独特升级整军只能携带一张。";
    if (
      Number.isInteger(card.rules?.limit) &&
      selected.filter((c) => c.id === card.id).length >= card.rules.limit
    )
      return "已达到此升级的整军数量上限。";
    const mine = RulesCore.unavailableSets(card, data.nameIndex, data.defs).up;
    for (const other of selected) {
      if (
        rule(card).conflictGroup &&
        rule(card).conflictGroup === rule(other).conflictGroup &&
        String(card.upstream?.id) !== String(other.upstream?.id)
      )
        return "与当前军表的升级处于同一互斥组。";
      if (
        mine.has(String(other.upstream?.id)) ||
        RulesCore.unavailableSets(other, data.nameIndex, data.defs).up.has(
          String(card.upstream?.id),
        )
      )
        return "与当前军表中已选升级互斥。";
    }
    return null;
  }

  // An unfinished roster may exceed its budget or still need mandatory slots.
  // These stay visible in the report; equipment legality must hold at commit.
  const transitional = new Set(["points_limit", "required_slot", "required_child_missing"]);
  function issueKey(issue, army) {
    let owner = issue.instanceId || null;
    for (const unit of army.units) {
      const choice = (unit.upgrades || []).find((ch) => ch.instanceId === owner);
      if (choice) {
        owner = [unit.instanceId, choice.slotIndex, choice.upgradeId];
        break;
      }
    }
    return JSON.stringify([issue.code, issue.message, owner]);
  }
  function newErrors(before, after, data) {
    const counts = new Map();
    const beforeReport = RulesCore.validateArmy(before, data),
      afterReport = RulesCore.validateArmy(after, data);
    const blocking = (i) =>
      i.status === "invalid" && !transitional.has(i.code) && !RulesCore.isTransitionalIssue(i.code,after,data.pkg) && !/^rank_/.test(i.code);
    for (const issue of beforeReport.issues.filter(blocking)) {
      const key = issueKey(issue, before);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const errors = afterReport.issues.filter(blocking).filter((issue) => {
      const key = issueKey(issue, after),
        count = counts.get(key) || 0;
      if (count) {
        counts.set(key, count - 1);
        return false;
      }
      return true;
    });

    const mode = {
      ...(data.pkg.modes?.[after.mode] || {}),
      ...(data.pkg.battleForces?.[String(after.armyId)]?.modes?.[after.mode] || {}),
    };
    const count = (report, tiers) =>
      tiers.reduce((n, t) => n + (report.rankCounts[t] || 0), 0);
    for (const issue of afterReport.issues.filter((i) => i.status === "invalid")) {
      if (
        issue.code === "rank_max" &&
        count(afterReport, [issue.rank]) > count(beforeReport, [issue.rank])
      )
        errors.push(issue);
      if (
        issue.code === "rank_combined" &&
        (mode.combined || []).some(
          (combo) =>
            count(afterReport, combo.tiers) > combo.maximum &&
            count(afterReport, combo.tiers) > count(beforeReport, combo.tiers),
        )
      )
        errors.push(issue);
    }
    return errors;
  }

  function unitAdditionFailure(unit, army, data) {
    if (!RulesCore.runtimeAvailable(unit,army,data.pkg)) return '此单位需要启用对应的战斗部队规则。';
    const count = army.units.filter((i) => i.unitId === unit.id).length;
    const cap = RulesCore.unitCapFor(unit, data.pkg, army.armyId);
    if (cap != null && count >= cap) return "已达到此单位的数量上限（" + cap + "）。";
    const limits = RulesCore.detachmentLimits(unit, army.units, data.units, {...data, armyId: army.armyId});
    if (limits.caps.some(cap => count + 1 > cap))
      return "需先加入符合任一条件的母单位，且不能超过其数量限制。";
    return null;
  }
  function addUnit(army, data, unitId, makeId) {
    const unit = data.units[unitId];
    if (!unit) return { ok: false, reason: "单位资料已不存在。" };
    const reason = unitAdditionFailure(unit, army, data);
    if (reason) return { ok: false, reason };
    const draft = structuredClone(army),
      instance = { instanceId: makeId(), unitId, upgrades: [] };
    draft.units.push(instance);
    const errors = newErrors(army, draft, data);
    if (errors.length)
      return { ok: false, reason: [...new Set(errors.map((i) => i.message))].join("；") };
    const equipped = equipDefaults(draft, data, instance.instanceId, makeId);
    return { ok: true, ...equipped, instanceId: instance.instanceId };
  }

  function equipDefaults(army, data, instanceId, makeId) {
    let draft = army;
    const unit = data.units[draft.units.find(i => i.instanceId === instanceId).unitId];
    const instance = draft.units.find(i => i.instanceId === instanceId);
    const wanted = [...new Set([...(unit.equipUpgradeIds || []),...RulesCore.defaultUpgradeIds(unit,instance,army,data)])];
    const failures = new Map(), warnings = [];
    // Refresh after each real selection: a mandatory upgrade may grant additional slots.
    // A complete pass is required even after a match; retry earlier slots if grants changed.
    let progress;
    do {
      progress = false;
      for (let index = 0; ; index++) {
        const inst = draft.units.find(i => i.instanceId === instanceId);
        const slots = RulesCore.slotListFor(data.pkg, unit, inst, data.upgrades, draft.armyId);
        if (index >= slots.length) break;
        if (inst.upgrades.some(ch => ch.slotIndex === index)) continue;
        for (const id of wanted) {
          if (inst.upgrades.some(ch => ch.upgradeId === id)) continue;
          const card = data.upgrades[id];
          if (!card) { failures.set(id, '升级资料不存在'); continue; }
          const rule = data.pkg.upgradeRules?.[String(card.upstream?.id)] || {};
          if (!RulesCore.accessKeys(card, data.pkg, rule).includes(slots[index].key)) continue;
          const result = equip(draft, data, {unitInstanceId: instanceId,
            slotIndex: index, slotKey: slots[index].key}, id, false, makeId, 'front');
          if (!result.ok) { failures.set(id, result.reason); continue; }
          draft = result.draft; progress = true;
          warnings.push(...result.warnings);
          break; // Only this occupied slot is finished; continue scanning the remaining slots.
        }
      }
    } while (progress);
    const inst = draft.units.find(i => i.instanceId === instanceId);
    for (const id of wanted) if (!inst.upgrades.some(ch => ch.upgradeId === id)) {
      const card = data.upgrades[id];
      warnings.push('未能自动装备 ' + (card?.name?.zh || card?.name?.en || id) + '：' +
        (failures.get(id) || '没有可用的匹配槽位'));
    }
    return {draft, warnings: [...new Set(warnings)]};
  }

  const actionTypes = ['action', 'double-action', 'free-action', 'free-exhaust'];
  function keywordActionTypes(keyword, defs) {
    const item = typeof keyword === 'string' ? {id: keyword} : keyword;
    if (actionTypes.includes(item.action)) return [item.action];
    const types = item.actionTypes ?? defs.keywords.find(k => String(k.id) === String(item.id))?.actionTypes;
    return (types || []).filter(t => actionTypes.includes(t));
  }

  function duplicate(army, data, instanceId, makeId) {
    const instance = army.units.find((i) => i.instanceId === instanceId);
    if (!instance || !copyable(instance, data))
      return { ok: false, reason: "独特单位或带有独特升级的单位不能复制。" };
    const reason = unitAdditionFailure(data.units[instance.unitId], army, data);
    if (reason) return { ok: false, reason };
    const draft = structuredClone(army),
      copy = structuredClone(instance);
    copy.instanceId = makeId();
    copy.upgrades = [];
    draft.units.push(copy);
    for (const choice of instance.upgrades || []) {
      const reason = selectionFailure(data.upgrades[choice.upgradeId], copy, draft, data);
      if (reason) return { ok: false, reason };
      copy.upgrades.push({ ...structuredClone(choice), instanceId: makeId() });
    }
    const errors = newErrors(army, draft, data);
    if (errors.length)
      return { ok: false, reason: [...new Set(errors.map((i) => i.message))].join("；") };
    return { ok: true, draft, instanceId: copy.instanceId };
  }

  function equip(army, data, context, cardId, applyAll, makeId, face = "front") {
    const card = data.upgrades[cardId];
    const first = army.units.find((i) => i.instanceId === context.unitInstanceId);
    if (!first || !card) return { ok: false, reason: "所选单位或升级已不存在。" };
    const ids = applyAll
      ? [...new Set(context.groupIds || [first.instanceId])]
      : [first.instanceId];
    const targets = ids.map((id) => army.units.find((i) => i.instanceId === id));
    if (
      !ids.length ||
      !ids.includes(first.instanceId) ||
      targets.some((i) => !i || signature(i) !== signature(first))
    ) {
      return { ok: false, reason: "合并组已变化，请重新选择槽位。" };
    }
    const draft = structuredClone(army),
      warnings = [];
    const rule = data.pkg.upgradeRules?.[String(card.upstream?.id)] || {};
    const allowed = RulesCore.accessKeys(card, data.pkg, rule);
    const originalSlots = new Map(targets.map(inst => [inst.instanceId,
      data.units[inst.unitId] ? RulesCore.slotListFor(data.pkg, data.units[inst.unitId], inst,
        data.upgrades, army.armyId) : []]));
    const chosenIds = [];
    // Remove all replaced choices before checking mutual exclusion. No draft
    // state is exposed unless every target can receive the replacement.
    for (const instance of draft.units) {
      if (ids.includes(instance.instanceId))
        instance.upgrades = instance.upgrades.filter(
          (ch) => ch.slotIndex !== context.slotIndex,
        );
    }
    for (const id of ids) {
      const instance = draft.units.find((i) => i.instanceId === id),
        unit = data.units[instance.unitId];
      if (!unit) return { ok: false, reason: "单位资料已不存在。" };
      const records = originalSlots.get(id);
      const record = records[context.slotIndex];
      if (!record || record.key !== context.slotKey || !allowed.includes(record.key)) {
        return { ok: false, reason: "升级变化导致槽位不再匹配。" };
      }
      const equipped = instance.upgrades
        .map((ch) => data.upgrades[ch.upgradeId])
        .filter(Boolean);
      if (
        record.unlockedBy &&
        !equipped.some((c) => String(c.upstream?.id) === String(record.unlockedBy))
      ) {
        return { ok: false, reason: "此槽位尚未解锁。" };
      }
      const eligibility = RulesCore.upgradeEligibility(card, unit, draft, data, equipped);
      if (!eligibility.ok)
        return {
          ok: false,
          reason: eligibility.issues
            .filter((i) => i.status === "invalid")
            .map((i) => i.message)
            .join("；"),
        };
      warnings.push(
        ...eligibility.issues.filter((i) => i.status === "unknown").map((i) => i.message),
      );
      const reason = selectionFailure(card, instance, draft, data);
      if (reason) return { ok: false, reason };
      const choiceId = makeId();
      chosenIds.push(choiceId);
      instance.upgrades.push({
        instanceId: choiceId,
        upgradeId: card.id,
        slotIndex: context.slotIndex,
        ...(card.dualSided ? {face: UpgradeFaces.mode(face)} : {}),
      });
      const after = RulesCore.slotListFor(data.pkg, unit, instance, data.upgrades, draft.armyId);
      const rebound = rebindSlots(instance, records, after, data);
      if (!rebound.ok) return {ok: false, reason: '槽位变化后无法容纳已选升级，请先移除：' +
        rebound.unresolved.map(id => data.upgrades[id]?.name?.zh || data.upgrades[id]?.name?.en || id).join('、')};
    }
    const errors = newErrors(army, draft, data);
    if (errors.length)
      return { ok: false, reason: [...new Set(errors.map((i) => i.message))].join("；") };
    return { ok: true, draft, count: ids.length, ids, chosenIds, warnings: [...new Set(warnings)] };
  }
  // Join presentation only. Eligibility, cost and stored upgrade IDs keep using the upgrade.
  function upgradePresentation(card, data, host = null) {
    if (!card || card.counterpart || card.usage !== "counterpart") return card;
    const sourceId = String(card.upstream?.id || "");
    const units = Object.values(data.units).filter((u) =>
      (u.isCounterpart || u.usage === "counterpart") && u.upstream?.collection === "upgrades");
    let matches = units.filter((u) => sourceId && String(u.upstream.id) === sourceId);
    if (!matches.length) {
      const variants = new Set((card.rules?.unavailableWith || []).filter((v) =>
        v && typeof v === "object" && v.propertyName === "upgrades").map((v) => String(v.id)));
      matches = units.filter((u) => variants.has(String(u.upstream.id)) && u.name?.en === card.name?.en);
    }
    const unit = matches.find((u) => u.factionId === host?.factionId) || matches[0];
    if (!unit) return card;
    const combine = (a = [], b = []) => [...new Map([...a, ...b].map((v) =>
      [JSON.stringify(canonical(v)), v])).values()];
    return {
      ...card,
      name: { en: card.name?.en || unit.name?.en, zh: card.name?.zh || unit.name?.zh },
      assets: { ...card.assets, front: card.assets?.front || unit.assets?.front,
        portrait: card.assets?.portrait || unit.assets?.portrait },
      keywords: combine(card.keywords, unit.keywords),
      weapons: combine(card.weapons, unit.weapons),
      counterpart: unit,
    };
  }
  return { signature, groups, slotOrder, rebindSlots, migrateSlots, removeUpgrade, uniqueUpgrade, copyable, addUnit, duplicate, equip, equipDefaults, keywordActionTypes, upgradePresentation };
})();
