/* V2 effective catalogs. All effects start from the source catalog; no in-place
 * edits, generated card identities, or per-battle-force executable branches. */
(function (root) {
  const cache = new WeakMap();
  const clone = value => structuredClone(value);
  const keyOf = k => JSON.stringify([k.id, k.parameterRefs || k.parameterRef || k.parameter || null, k.action || null]);
  const match = (unit, target, data) => !target || RulesCore.evaluate(target, RulesCore.unitContext(unit,data.pkg), data.pkg.predicates || {}) === true;
  const active = (army, data) => data.pkg.battleForces?.[army.armyId]?.engineVersion === 2 &&
    ['active', 'preview'].includes(data.pkg.battleForces[army.armyId].status);

  function keywords(list, effect) {
    const values = Array.isArray(effect.value) ? effect.value : [effect.value];
    for (const value of values) {
      const index = list.findIndex(k => keyOf(k) === keyOf(value));
      if (effect.op === 'remove') {if (index >= 0) list.splice(index, 1); continue;}
      if (index < 0) list.push(clone(value));
      else if (effect.op === 'set') list[index] = clone(value);
      else if (typeof value.value === 'number') list[index].value = (list[index].value || 0) + value.value;
      if (effect._battleForceSource) {
        const current = index < 0 ? list.at(-1) : list[index];
        const sources = current._battleForceSources ||= [];
        if (!sources.some(s => s.id === effect._battleForceSource.id)) sources.push(clone(effect._battleForceSource));
      }
    }
  }
  function weaponMatches(weapon, filter) {
    if (!filter) return true;
    if (filter.range === 'melee' && weapon.range?.min !== 0) return false;
    if (filter.range === 'ranged' && !(weapon.range?.max > 0)) return false;
    const has = k => weapon.keywords?.some(v => v.id === k.id && (k.value == null || v.value === k.value));
    return (!filter.hasKeyword || has(filter.hasKeyword)) && (!filter.notKeyword || !has(filter.notKeyword));
  }
  function apply(card, effects, issues) {
    const original = clone(card), sets = new Map(), conflicts = new Set();
    const setKey = e => e.field + ':' + (e.field.includes('keywords') ? keyOf(e.value) : '') + ':' + JSON.stringify(e.weaponFilter || null);
    for (const effect of effects.filter(e => e.op === 'set')) {
      const key = setKey(effect), value = JSON.stringify(effect.value);
      if (sets.has(key) && sets.get(key) !== value) conflicts.add(key);
      sets.set(key, value);
    }
    for (const key of conflicts) issues.push({status:'invalid',code:'battle_force_modifier_conflict',instanceId:null,
      message:(card.name?.zh || card.id)+'的 '+key.split(':')[0]+' 存在冲突的“设为”效果。'});
    // Conditions see the input, never another effect's partially modified output.
    const ordered = [...effects].sort((a,b) => ({set:0,remove:1,add:2}[a.op] - {set:0,remove:1,add:2}[b.op]));
    for (const effect of ordered) {
      const {field, op, value} = effect;
      if (op === 'set' && conflicts.has(setKey(effect))) continue;
      if (field === 'weapons.keywords') {
        (card.weapons || []).forEach((weapon, i) => {
          if (weaponMatches(original.weapons[i], effect.weaponFilter)) keywords(weapon.keywords ||= [], effect);
        });
      } else if (field === 'keywords') keywords(card.keywords ||= [], effect);
      else if (field === 'rankId' && op === 'add') {
        card._v2Ranks = [...new Set([...(card._v2Ranks || [card.rankId]), value])];
      } else if (field === 'upgradeSlots') {
        const slots = card.upgradeSlots ||= [];
        if (op === 'add') for (let i=0; i<(effect.count ?? 1); i++) slots.push({id:value, effectId:effect.id});
        else if (op === 'remove') card.upgradeSlots = slots.filter(s => (s?.id ?? s) !== value);
      } else {
        const parts = field.split('.'), property = parts.pop();
        let owner = card;
        for (const part of parts) owner = owner[part] ||= {};
        owner[property] = op === 'add' ? (owner[property] || 0) + value : clone(value);
        if (field === 'rankId') card._v2Ranks = [value];
      }
    }
    if (typeof card.points === 'number') card.points = Math.max(0, card.points);
    return card;
  }

  function resolve(army, input) {
    const source = input._source || input;
    if (!active(army, source)) return source;
    // Catalog objects are reloaded after maintenance. Cache bounded roster snapshots;
    // different candidate simulations get separate keys and never contaminate the UI.
    const key = JSON.stringify(army), previous = cache.get(source);
    if (previous?.has(key)) return previous.get(key);
    const bf = source.pkg.battleForces[army.armyId], state = BattleForceV2.selectionState(army, bf);
    // Malformed definitions stay on the diagnostic path; never partially execute them.
    if (BattleForceV2.validateDefinition(bf).length) return source;
    const scopes = [bf.v2.common, ...bf.v2.ruleGroups.filter(g => state.activeRuleGroupIds.includes(g.id))];
    const issues = [...state.issues];
    const battleForceSource = {id:army.armyId, name:bf.nameZh || bf.name};
    const modifiers = scopes.flatMap(g => g.modifiers || []).map(m =>
      ['keywords','weapons.keywords'].includes(m.field) && m.op !== 'remove'
        ? {...m, _battleForceSource:battleForceSource} : m);
    const entries = scopes.flatMap(g => g.entries || []);
    const localEntries = new Map(entries.filter(e => e?.id).map(e =>
      [`bf:${army.armyId}:${e.id}`, e]));
    const unitIds = new Set(scopes.flatMap(g => (g.unitGrants || []).map(r => r.unitId)));
    const upgradeIds = new Set(scopes.flatMap(g => (g.upgradeGrants || []).map(r => r.upgradeId)));
    const pkg = {...source.pkg, battleForces:{...source.pkg.battleForces, [army.armyId]:clone(bf)}};
    const context = {armyId:army.armyId, parentFactionId:bf.v2.parentFactionId, issues, instances:{},
      modifiers, entries, unitLimits:scopes.flatMap(g => g.unitLimits || []),
      uniqueUpgradeIds:scopes.some(g => g.uniqueUpgradeIds) ? scopes.flatMap(g => g.uniqueUpgradeIds || []) : null};
    pkg._v2 = context;
    const data = {...source, pkg, units:{}, upgrades:{}};
    Object.defineProperty(data, '_source', {value:source});
    const checkRef = (id, table, what) => {
      if (!table[id]) issues.push({status:'invalid',code:'battle_force_reference',instanceId:null,message:what+'不存在：'+id});
    };
    for (const id of unitIds) checkRef(id, source.units, '单位');
    for (const id of upgradeIds) checkRef(id, source.upgrades, '升级卡');
    for (const id of context.uniqueUpgradeIds || []) checkRef(id, source.upgrades, '独特升级卡');
    for (const m of modifiers) if (m.card === 'upgrade') checkRef(m.upgradeId, source.upgrades, '升级卡');
    for (const [id, raw] of Object.entries(source.upgrades)) {
      const card = apply(clone(raw), modifiers.filter(m => m.card === 'upgrade' && m.upgradeId === id && !m.target), issues);
      card._v2ArmyGrant = upgradeIds.has(id);
      data.upgrades[id] = card;
    }
    if (root.UpgradeFaces) data.upgrades = UpgradeFaces.index(Object.values(data.upgrades));
    function makeUnit(raw, inst) {
      const card = clone(raw);
      card._v2Allowed = unitIds.has(raw.id);
      const effects = modifiers.filter(m => m.card === 'unit' && !m.when && match(raw,m.target,data));
      // Identity/rank modifiers are applied before rank-dependent restrictions.
      const identity = effects.filter(m => ['rankId','factionId','affiliationIds'].includes(m.field));
      apply(card,identity,issues);
      card._v2Ranks ||= [card.rankId];
      if (inst?.rankId != null) card.rankId = inst.rankId;
      if (inst && !card._v2Ranks.includes(card.rankId)) issues.push({status:'invalid',code:'battle_force_rank',
        instanceId:inst.instanceId,rank:inst.rankId,message:'此单位不能使用所选军阶，请移除后从有效军阶重新加入。'});
      const remaining = modifiers.filter(m => m.card === 'unit' && !identity.includes(m) &&
        !['rankId','factionId','affiliationIds'].includes(m.field) && match(card,m.target,data) &&
        (!m.when || (inst?.upgrades || []).some(ch => {
          const upgrade = data.upgrades[ch.upgradeId];
          return upgrade && RulesCore.accessKeys(upgrade,pkg,{}).includes(m.when.equippedSlot);
        })));
      const effectiveRemaining = remaining.map(effect => {
        if (effect.field !== 'keywords') return effect;
        const convert = value => {
          if (!value || typeof value !== 'object') return value;
          const entry = localEntries.get(value.id);
          return entry ? {...value, id:value.id, _entry:clone(entry)} : value;
        };
        return {...effect, value:Array.isArray(effect.value)
          ? effect.value.map(convert) : convert(effect.value)};
      });
      apply(card,effectiveRemaining,issues);
      card._v2WeaponEffects = effectiveRemaining.filter(m => m.field === 'weapons.keywords');
      for (const entry of entries) if (match(card,entry.target,data)) {
        const id='bf:'+army.armyId+':'+entry.id;
        const current=(card.keywords ||= []).find(k => k.id===id);
        if (current) {
          current._entry ||= clone(entry);
          current._battleForceSources ||= [clone(battleForceSource)];
        }
        else card.keywords.push({id,_entry:clone(entry),_battleForceSources:[clone(battleForceSource)]});
      }
      if (inst) card._v2InstanceId = inst.instanceId;
      return card;
    }
    for (const [id, raw] of Object.entries(source.units)) data.units[id] = makeUnit(raw);
    for (const inst of army.units || []) if (source.units[inst.unitId]) context.instances[inst.instanceId] = makeUnit(source.units[inst.unitId],inst);
    for (const mode of Object.values(pkg.battleForces[army.armyId].modes || {})) {
      for (const effect of scopes.flatMap(s => s.rankModifiers || [])) {
        const quota = mode.rankQuotas?.find(q => q.rankId === effect.rankId);
        if (quota) for (const field of ['min','max']) if (effect[field] != null)
          quota[field] = effect.op === 'set' ? effect[field] : quota[field] + effect[field];
      }
    }
    data.nameIndex = RulesCore.buildNameIndex(data.upgrades,data.defs);
    const results = previous || new Map(); results.set(key,data);
    if (results.size > 8) results.delete(results.keys().next().value);
    cache.set(source,results);
    return data;
  }

  function unitFor(instance, army, input) {
    const data = resolve(army,input);
    return data.pkg._v2?.instances[instance?.instanceId] || data.units[instance?.unitId];
  }
  function candidate(unit, rankId) {return unit._v2Ranks ? {...unit,rankId} : unit;}
  function upgradePoints(card, host, data) {
    const effects = (data.pkg._v2?.modifiers || []).filter(m => m.card === 'upgrade' &&
      m.upgradeId === card.id && m.field === 'points' && (!m.target || host && match(host,m.target,data)));
    if (!effects.some(m => m.target)) return card.points || 0;
    const source = data._source?.upgrades[card.id] || card;
    return apply({points:source.points || 0},effects,[]).points;
  }
  function upgradeFor(card, host, data) {
    if (!card || !host || !data.pkg._v2 || card._v2WeaponsApplied) return card;
    const effects = host._v2WeaponEffects || [];
    if (!effects.length) return card;
    const result = clone(card._base || card), issues = [];
    apply(result,effects,issues);
    if (result.back) apply(result.back,effects,issues);
    result._v2WeaponsApplied = true;
    if(card._choiceId){result._choiceId=card._choiceId;result._unitId=card._unitId;}
    return root.UpgradeFaces ? UpgradeFaces.view(result,card._face || 'front') : result;
  }

  // Keep slot identity by source and ordinal. A removed slot loses its equipment;
  // that equipment's grants disappear on the next pass. No reassignment to spare slots.
  function reconfigure(before, after, input) {
    const oldData = resolve(before,input), draft = clone(after), removed = [];
    const slots = (inst, army, data) => RulesCore.slotListFor(data.pkg,unitFor(inst,army,data),inst,data.upgrades,army.armyId);
    const identities = list => {
      const seen = new Map();return list.map(s => {
        const key=JSON.stringify([s.key,s.effectId || null,s.addedBy || null]);
        const n=seen.get(key)||0;seen.set(key,n+1);return key+':'+n;
      });
    };
    for (const inst of draft.units) {
      const old = before.units.find(i=>i.instanceId===inst.instanceId);
      if (!old) continue;
      let prior = identities(slots(old,before,oldData));
      for (;;) {
        const data = resolve(draft,input), next = identities(slots(inst,draft,data));
        let changed = false;
        inst.upgrades = inst.upgrades.filter(ch => {
          const index=next.indexOf(prior[ch.slotIndex]);
          if(index<0){removed.push(data.upgrades[ch.upgradeId]?.name?.zh || ch.upgradeId);changed=true;return false;}
          ch.slotIndex=index;return true;
        });
        prior=next;if(!changed)break;
      }
    }
    return {draft,removed};
  }
  root.BattleForceRuntime = {active,resolve,unitFor,candidate,upgradeFor,upgradePoints,reconfigure,apply,match};
  if (typeof module === 'object' && module.exports) module.exports = root.BattleForceRuntime;
})(globalThis);
