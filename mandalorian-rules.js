/* Optional faction module. Remove this script to detach all Mandalorian hooks.
 * Catalog variants are derived in memory; source unit/upgrade records stay intact.
 * Keep the calculation contract in sync with mandalorian_rules.py.
 */
window.MandalorianRules = (() => {
  const generic = '1084', initiates = 'mercenary-creedless-mandalorian-initiates';
  const tools = ['flame-projector', 'mandalorian-rockets-clan', 'whipcord-launcher'];
  const vehicles = ['mercenary-raiders-aa5-speeder-truck', 'empire-tx-225', 'mercenary-raiders-wlo5-speeder-tank'];
  const optionIds = ['veterans', 'toolsOfTrade', 'rapidDeployment', 'gunsForHire', 'featsOfValor'];
  const config = (armyId, pkg) => pkg.battleForces?.[armyId]?.mandalorian || null;
  const applies = (armyId, pkg) => !!config(armyId, pkg);
  const selected = (army, pkg, option) => config(army.armyId, pkg)?.custom === true && (army.options || []).includes(option);
  const affiliations = unit => (unit.affiliationIds || []).map(String);
  const variantId = (kind, id) => 'mc-' + kind + '-' + id;
  function prepareData(data) {
    const {units, upgrades, pkg} = data;
    const custom = Object.keys(pkg.battleForces || {}).filter(id => config(id,pkg)?.custom).map(Number);
    if (!custom.length) return;
    for (const sourceId of tools) {
      const id = variantId('tools',sourceId), source = upgrades[sourceId];
      if (!source || upgrades[id]) continue;
      const card = structuredClone(source);
      card.id = id; card.points = 0;
      card.runtimeVariant = {sourceId, option: 'toolsOfTrade', kind:'upgrade'};
      card.variantLabel = '看家装备 · 免费独特副本';
      // These are extra physical copies, unique among themselves, independent
      // of the paid copy's army limit. Their name still prevents local duplicates.
      card.upstream = {collection:'local', id}; card.selectionGroup = id;
      card.rules = {unique:true, uniqueScope:'card', limit:1, locallyUnique:true,
        slotTypes:[...card.slotIds], factions:custom};
      card.restrictions = {text:{zh:['仅限曼达洛人士兵；正常占用升级槽。'], en:['Mandalorian Trooper only.']},
        condition:{field:'unit.unitSubtypeId',op:'eq',value:'mandalorian_trooper'}};
      if (sourceId === 'whipcord-launcher') for (const language of ['en','zh']) {
        const text = card.description[language].join(' '), start = text.indexOf('{@icon.action}');
        if (start >= 0) card.description[language] = [text.slice(start)];
      }
      upgrades[id] = card;
    }
    for (const sourceId of vehicles) {
      const id = variantId('hired',sourceId), source = units[sourceId];
      if (!source || units[id]) continue;
      const unit = structuredClone(source);
      unit.id = id; unit.runtimeVariant = {sourceId,option:'gunsForHire',kind:'unit'};
      unit.variantLabel = '雇佣火力 · 全军三选一';
      unit.affiliationIds = [generic];
      unit.factions = custom.map(id => ({id,rankId:5}));
      unit.keywords = [...unit.keywords,
        {id:'coordinate',parameter:'曼达洛战士',parameterRefs:[{kind:'nameIdentity',id:'mandalorian-warriors'}]},
        {id:'independent',parameter:'激增 1'}];
      units[id] = unit;
    }
  }
  function available(card, army, pkg) {
    const variant = card?.runtimeVariant;
    return !variant || selected(army,pkg,variant.option);
  }
  function rank(unit, armyId, pkg) {
    const cfg = config(armyId,pkg);
    if (!cfg) return undefined;
    if (unit.runtimeVariant?.kind === 'unit') return cfg.custom ? 5 : null;
    const base = (unit.factions || []).find(f => f.id === 8);
    if (!base || !affiliations(unit).some(a => (cfg.allowedAffiliations || []).includes(a))) return null;
    return base.rankId;
  }
  function cap(unit, armyId, pkg) {
    if (!applies(armyId,pkg) || unit.id !== initiates) return undefined;
    return config(armyId,pkg).clanAffiliation === '965' ? null : 2;
  }
  function eligibility(card, unit, army, data, core) {
    if (!applies(army.armyId,data.pkg)) return [];
    const cfg = config(army.armyId,data.pkg);
    if ((card.slotIds || []).includes(1)) {
      // Some imported conditions retained only "Mandalorian Trooper" and lost
      // the printed clan icons. Read the existing restriction, preserving OR
      // (notably Tristan Wren's Clan Saxon OR Clan Wren).
      const icons = {covert:'965',kryze:'1081',wren:'1082',saxon:'1083'};
      const text = (card.restrictions?.text?.en || []).join(' ');
      const required = [...text.matchAll(/\{@icon\.clan-(covert|kryze|wren|saxon)\}/g)].map(m => icons[m[1]]);
      if (required.length && !required.some(id => affiliations(unit).includes(id)))
        return [{status:'invalid',code:'clan_personnel',message:'此人员升级需要对应氏族组织；先配置符合要求的头盔'}];
    }
    // Helmets are choices of allegiance, so clan and custom lists cannot equip
    // a helmet which would move the host into another clan.
    if ((card.slotIds || []).includes(25) && cfg.clanAffiliation) {
      const target = affiliations(core.applyPropertyEffects(unit,[card],data.defs));
      if (!target.includes(cfg.clanAffiliation)) return [{status:'invalid',code:'clan_helmet',message:'此头盔不属于当前选择的氏族'}];
    }
    if ((card.slotIds || []).includes(25) && cfg.custom) {
      if (!affiliations(core.applyPropertyEffects(unit,[card],data.defs)).includes(generic))
        return [{status:'invalid',code:'clan_helmet',message:'自定义氏族须保留曼达洛人组织'}];
    }
    return [];
  }
  function adjustment(card, unit, army, pkg) {
    const cfg = config(army.armyId,pkg);
    if (!cfg) return 0;
    if (cfg.clanAffiliation === '965' && unit?.id === initiates && card.rules?.unique && (card.slotIds || []).includes(1)) return -5;
    if (selected(army,pkg,'veterans') && card.id === 'galaar-15-carbines' && unit?.nameIdentityId === 'mandalorian-warriors') return -5;
    return 0;
  }
  function defaultUpgrades(unit, instance, army, data, core) {
    const clan = config(army.armyId,data.pkg)?.clanAffiliation;
    if (!clan || !affiliations(unit).includes(generic)) return [];
    const slots = core.slotListFor(data.pkg,unit,instance,data.upgrades,army.armyId);
    if (!slots.some(s => s.key === 'helmet')) return [];
    const equipped = instance.upgrades.map(ch => data.upgrades[ch.upgradeId]).filter(Boolean);
    const candidates = Object.values(data.upgrades).filter(c => (c.slotIds || []).includes(25) &&
      affiliations(core.applyPropertyEffects(unit,[c],data.defs)).includes(clan) &&
      core.upgradeEligibility(c,unit,army,data,equipped).ok);
    return candidates.length === 1 ? [candidates[0].id] : [];
  }
  function validate(army, data, core, issue) {
    if (!applies(army.armyId,data.pkg)) return;
    const effective = army.units.map(inst => {
      const unit = data.units[inst.unitId];
      return unit && {inst,unit:core.applyPropertyEffects(unit,inst.upgrades.map(ch => data.upgrades[ch.upgradeId]).filter(Boolean),data.defs),
        rank:core.armyRank(unit,army.armyId,data.pkg,data.defs,data.units)};
    }).filter(Boolean);
    const leaders = effective.filter(x => x.rank === 1 || x.rank === 6);
    if (!effective.some(x => x.rank === 1) && effective.some(x => x.unit.rules?.tierCounting?.waivesMinimum?.tiers?.includes(1)))
      issue('invalid','rank_min','曼达洛军表须包含至少 1 个指挥官',null,{rank:1});
    for (const {inst,unit,rank} of effective) if (!leaders.some(l => affiliations(l.unit).some(a => affiliations(unit).includes(a)))) {
      issue('invalid','battle_force_affiliation','需要至少一个具有相同组织的指挥官或特工（按已装备升级后的组织判断）',inst.instanceId,{rank});
    }
    if (config(army.armyId,data.pkg).custom) {
      const options = [...new Set(army.options || [])].filter(o => optionIds.includes(o));
      if (options.length !== 2) issue('invalid','battle_force_options','自定义氏族须选择 2 条规则，当前已选择 '+options.length+' 条',null);
    }
    const hired = army.units.filter(i => data.units[i.unitId]?.runtimeVariant?.option === 'gunsForHire');
    if (hired.length > 1) for (const inst of hired) issue('invalid','clan_hired_limit','雇佣火力：三种载具全军合计最多 1 辆',inst.instanceId,{rank:5});
  }
  function cleanup(army,data) {
    const removed = [];
    for (const inst of army.units) {
      inst.upgrades = inst.upgrades.filter(ch => {
        const c = data.upgrades[ch.upgradeId], keep = available(c,army,data.pkg);
        if (!keep) removed.push(c.name.zh || c.name.en);
        return keep;
      });
    }
    army.units = army.units.filter(inst => {
      const u = data.units[inst.unitId], keep = available(u,army,data.pkg);
      if (!keep) removed.push(u.name.zh || u.name.en);
      return keep;
    });
    if (!config(army.armyId,data.pkg)?.custom) army.options = (army.options || []).filter(id => !optionIds.includes(id));
    return removed;
  }
  const extension = {id:'mandalorian',applies,prepareData,available,rank,cap,eligibility,adjustment,defaultUpgrades,validate,cleanup,
    ownsPointModifier:m => m.property === 'options' && ['veterans','Children of the Watch'].includes(m.id),
    inheritedArmyIds:() => [8], countMercenaries:true,
    requiredChildActive:(child,army,pkg) => !child.with ||
      ({'Children of the Watch':'965','Clan Kryze':'1081','Clan Wren':'1082','Clan Saxon':'1083'})[child.with] === config(army.armyId,pkg)?.clanAffiliation,
    transitionalCodes:['battle_force_affiliation','battle_force_options']};
  (window.ArmyRuleExtensions ||= []).push(extension);
  return {config,selected,optionIds,variantId};
})();
