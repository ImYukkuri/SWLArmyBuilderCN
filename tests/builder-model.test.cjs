const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
global.window = global;
require("../upgrade-faces.js");
require("../dice-enums.js");
require("../rules-core.js");
require("../builder-model.js");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, "data", name), "utf8"));
const data = {
  units: Object.fromEntries(read("units.json").units.map((u) => [u.id, u])),
  upgrades: Object.fromEntries(read("upgrades.json").cards.map((c) => [c.id, c])),
  defs: read("catalog-definitions.json"),
  pkg: read("slot-rules.json"),
};
data.nameIndex = RulesCore.buildNameIndex(data.upgrades, data.defs);

test('hidden commands remain identifiable but cannot fill a command hand', () => {
  const roster = {...armyOf(), commandIds: ['3086', '3086', '8']};
  const before = structuredClone(roster);
  const issues = RulesCore.validateArmy(roster, data).issues;
  assert.equal(issues.filter(i => i.code === 'command_hidden').length, 2);
  assert(issues.some(i => i.code === 'command_min' && i.message.startsWith('3 点')));
  assert.deepEqual(roster, before);
});

test('new bounty hunter training cards equip only on their named hosts and cannot be duplicated', () => {
  const pairs = [
    ['training-mechanical-carnage', 'mercenary-rogue-ig-11'],
    ['training-cold-blooded', 'mercenary-rogue-bossk'],
    ['training-focused-on-the-kill', 'mercenary-rogue-ig-88'],
    ['training-i-make-the-rules-now', 'mercenary-rogue-cad-bane'],
  ];
  for (const [id, hostId] of pairs) {
    const roster = armyOf(unit(hostId)), inst = roster.units[0], card = data.upgrades[id];
    for (const [, candidateId] of pairs)
      assert.equal(RulesCore.upgradeEligibility(card, data.units[candidateId], roster, data, []).ok,
        candidateId === hostId, id + ' / ' + candidateId);
    const slots = RulesCore.slotListFor(data.pkg, data.units[hostId], inst, data.upgrades, roster.armyId);
    const result = BuilderModel.equip(roster, data, {unitInstanceId: inst.instanceId,
      slotIndex: slots.findIndex(s => s.key === 'training'), slotKey: 'training'}, id, false, uid);
    assert(result.ok, result.reason);
    assert.equal(result.draft.units[0].upgrades[0].upgradeId, id);
    assert.equal(card.points, 0);
    const training = slots.map((s, i) => s.key === 'training' ? i : -1).filter(i => i >= 0);
    if (training.length > 1) {
      const duplicate = BuilderModel.equip(result.draft, data, {unitInstanceId: inst.instanceId,
        slotIndex: training[1], slotKey: 'training'}, id, false, uid);
      assert(!duplicate.ok, 'unique training must not occupy both slots');
    }
  }
});

test('exempt cards get independent exclusive slots and can all be equipped', () => {
  for (const [id, faction, cards] of [
    ['separatists-b1',5,['gear-binoculars','gear-portable']],
    ['rebels-mark-2-blaster',1,['hit-the-dirt','training-dug-in']],
  ]) {
    let roster = {...armyOf(unit(id)), armyId: faction};
    const host = data.units[id], inst = roster.units[0];
    const slots = RulesCore.slotListFor(data.pkg,host,inst,data.upgrades,faction);
    assert.deepEqual(slots.filter(s=>s.virtual).map(s=>s.key),cards.map(c=>'special:'+c));
    const first = slots.findIndex(s=>s.key==='special:'+cards[0]);
    const wrong = BuilderModel.equip(roster,data,{unitInstanceId:inst.instanceId,
      slotIndex:first,slotKey:slots[first].key},cards[1],false,uid);
    assert(!wrong.ok, 'a dedicated slot must reject every other special card');
    for(const card of cards) {
      const index=slots.findIndex(s=>s.key==='special:'+card);
      const result=BuilderModel.equip(roster,data,{unitInstanceId:inst.instanceId,
        slotIndex:index,slotKey:slots[index].key},card,false,uid);
      assert(result.ok,result.reason);roster=result.draft;
    }
    assert.equal(roster.units[0].upgrades.length,2);
    assert(!RulesCore.validateArmy(roster,data).issues.some(i=>i.code.startsWith('slot_')||i.code==='dedicated_grant_virtual'));
  }
});

test('ordinary slots suppress exempt slots even when occupied and keep special cards selectable', () => {
  const fixture=structuredClone(data),host=fixture.units['separatists-b1'];
  host.upgradeSlots.push(2);
  const roster={...armyOf(unit(host.id)),armyId:5},inst=roster.units[0];
  const slots=RulesCore.slotListFor(fixture.pkg,host,inst,fixture.upgrades,5);
  assert(!slots.some(s=>s.virtual));
  const index=slots.findIndex(s=>s.key==='gear');
  for(const id of ['gear-binoculars','gear-portable']) {
    assert(RulesCore.accessKeys(fixture.upgrades[id],fixture.pkg).includes('gear'));
    const result=BuilderModel.equip(roster,fixture,{unitInstanceId:inst.instanceId,
      slotIndex:index,slotKey:'gear'},id,false,uid);
    assert(result.ok,result.reason);
    assert(!RulesCore.slotListFor(fixture.pkg,host,result.draft.units[0],fixture.upgrades,5).some(s=>s.virtual));
  }
});

test('new units without upstream IDs can equip upgrades selected by their local host reference', () => {
  const fixture = structuredClone(data), host = structuredClone(fixture.units['empire-stormtroopers']);
  host.id = 'test-local-mudtroopers';delete host.upstream;fixture.units[host.id] = host;
  const card = fixture.upgrades['gear-binoculars'];
  card.rules.availableIn = [{kind: 'unit', id: host.id}];
  const roster = armyOf(unit(host.id)), inst = roster.units[0];
  const slots = RulesCore.slotListFor(fixture.pkg, host, inst, fixture.upgrades, 2);
  const result = BuilderModel.equip(roster, fixture, {unitInstanceId: inst.instanceId,
    slotIndex: slots.findIndex(s => s.key === 'gear'), slotKey: 'gear'}, card.id, false, uid);
  assert(result.ok, result.reason);
  assert.equal(result.draft.units[0].upgrades[0].upgradeId, card.id);
  const renamed = {...host, id: 'test-other-host'};
  assert(!RulesCore.upgradeEligibility(card, renamed, roster, fixture, []).ok);
});

test('Imperial March uses faction and rank for current and future local units, with normal or exclusive slots', () => {
  const fixture = structuredClone(data), card = fixture.upgrades['training-imperial-march'];
  const host = {...structuredClone(fixture.units['empire-stormtroopers']), id: 'test-future-corps'};
  delete host.upstream;fixture.units[host.id] = host;
  assert.equal(card.rules.slotGrants[0].holders, undefined);
  assert.deepEqual(card.rules.slotGrants[0].condition, card.restrictions.condition);
  for (const candidate of Object.values(fixture.units).filter(u => u.factionId === 2 && u.rankId === 2)) {
    assert(RulesCore.slotGrantsFor(fixture.pkg, candidate, {}, fixture.upgrades).qualify.some(g => g.upgradeId === card.id), candidate.id);
  }
  for (const hasTraining of [false, true]) {
    host.upgradeSlots = hasTraining ? [10] : [];
    const roster = armyOf(unit(host.id)), inst = roster.units[0];
    const slots = RulesCore.slotListFor(fixture.pkg, host, inst, fixture.upgrades, 2);
    const key = hasTraining ? 'training' : 'special:' + card.id;
    assert.equal(slots.some(s => s.key === 'special:' + card.id), !hasTraining);
    const result = BuilderModel.equip(roster, fixture, {unitInstanceId: inst.instanceId,
      slotIndex: slots.findIndex(s => s.key === key), slotKey: key}, card.id, false, uid);
    assert(result.ok, result.reason);
    const selected = result.draft.units[0].upgrades[0];
    assert(!RulesCore.validateArmy(result.draft, fixture).issues.some(i =>
      i.instanceId === selected.instanceId && i.status === 'invalid'));
  }
  for (const [factionId, rankId] of [[1, 2], [2, 4]]) {
    Object.assign(host, {factionId, rankId, upgradeSlots: []});
    assert(!RulesCore.slotListFor(fixture.pkg, host, {}, fixture.upgrades, 2).some(s => s.key === 'special:' + card.id));
    assert(!RulesCore.upgradeEligibility(card, host, {armyId: 2}, fixture, []).ok);
  }
  Object.assign(host, {factionId: 2, rankId: 2});
  fixture.pkg.armyOverrides['2'] = {slots: [{op: 'deny', slot: 'training'}]};
  assert(!RulesCore.slotListFor(fixture.pkg, host, {}, fixture.upgrades, 2).some(s => s.key === 'special:' + card.id));
});

test('specified slot-grant hosts accept local IDs and legacy IDs without confusing identical names', () => {
  const fixture = structuredClone(data), base = fixture.units['empire-stormtroopers'];
  const host = {...base, id: 'test-local-grant-host', upstream: undefined};
  const card = fixture.upgrades['training-imperial-march'], grant = card.rules.slotGrants[0];
  delete grant.condition;
  grant.holders = [{kind: 'unit', id: host.id}, base.upstream.id];
  const granted = u => RulesCore.slotGrantsFor(fixture.pkg, u, {}, fixture.upgrades).qualify.some(g => g.upgradeId === card.id);
  assert(granted(host));assert(granted(base));assert(!granted({...host, id: 'other-host'}));
  grant.condition = {field: 'unit.factionId', op: 'eq', value: 1};
  assert(!granted(host));
});

test('Dug In admits every emplacement or Prepared Position trooper through its real slot', () => {
  const card=data.upgrades['training-dug-in'];
  for (const host of Object.values(data.units)) {
    const expected=host.unitSubtypeId==='emplacement_trooper' ||
      (host.unitCategoryId==='trooper' && host.keywords.some(k=>k.id==='prepared_position'));
    const roster={...armyOf(unit(host.id)),armyId:host.factions[0]?.id || host.factionId};
    assert.equal(RulesCore.upgradeEligibility(card,host,roster,data,[]).ok,expected,host.id);
    const inst=roster.units[0],slots=RulesCore.slotListFor(data.pkg,host,inst,data.upgrades,roster.armyId);
    const training=slots.some(s=>s.key==='training');
    assert.equal(slots.some(s=>s.key==='special:'+card.id),expected && !training,host.id);
    if (!expected) continue;
    const index=slots.findIndex(s=>s.key===(training?'training':'special:'+card.id));
    const result=BuilderModel.equip(roster,data,{unitInstanceId:inst.instanceId,
      slotIndex:index,slotKey:slots[index].key},card.id,false,uid);
    assert(result.ok,host.id+': '+result.reason);
    assert(!RulesCore.validateArmy(result.draft,data).issues.some(i=>i.instanceId===
      result.draft.units[0].upgrades[0].instanceId && i.status==='invalid'),host.id);
  }
});

test('exempt upgrades remain selectable in their ordinary category when legacy access lists only special slots', () => {
  const exempt = Object.values(data.upgrades).filter(c => c.rules?.slotGrants?.some(g =>
    g.trigger === 'unitQualifies' && g.ifAbsentAny?.length));
  assert.equal(exempt.length, 7);
  for (const source of exempt) for (const override of [false, true]) {
    const fixture = structuredClone(data), card = fixture.upgrades[source.id];
    const category = card.rules.slotGrants.find(g => g.trigger === 'unitQualifies').ifAbsentAny[0];
    const slot = fixture.pkg.slots.find(s => s.id === category);
    const host = Object.values(fixture.units).find(u =>
      RulesCore.slotGrantsFor(fixture.pkg, u, {upgrades: []}, fixture.upgrades).qualify.some(g => g.upgradeId === card.id) &&
      RulesCore.upgradeEligibility(card, u, {armyId: u.factions[0]?.id}, fixture, []).ok);
    assert(host, source.id + ' needs a qualifying host');
    const roster = {...armyOf(unit(host.id)), armyId: host.factions[0].id}, inst = roster.units[0];
    if (!host.upgradeSlots.some(s => (s.id ?? s) === slot.sourceId)) host.upgradeSlots.push(slot.sourceId);
    // An imported/edited legacy access list can omit the ordinary category.
    card.slotIds = card.slotIds.filter(id => id !== slot.sourceId);
    if (override) fixture.pkg.upgradeRules[card.upstream.id] = {access: card.slotIds.map(id =>
      ({slot: RulesCore.slotKey(fixture.pkg, id)}))};
    const slots = RulesCore.slotListFor(fixture.pkg, host, inst, fixture.upgrades, roster.armyId);
    assert(!slots.some(s => s.key === 'special:' + card.id), card.id);
    const result = BuilderModel.equip(roster, fixture, {unitInstanceId: inst.instanceId,
      slotIndex: slots.findIndex(s => s.key === category), slotKey: category}, card.id, false, uid);
    assert(result.ok, card.id + ': ' + result.reason);
    assert(!RulesCore.validateArmy(result.draft, fixture).issues.some(i =>
      i.code === 'slot_mismatch' || i.code === 'slot_missing'), card.id);
  }
});

test('Prepared Position without training gets an exclusive Dug In slot; training suppresses it', () => {
  const fixture=structuredClone(data),host=fixture.units['rebels-rebel-veterans'];
  host.upgradeSlots=host.upgradeSlots.filter(s=>(s.id ?? s)!==10);
  const roster=armyOf(unit(host.id));roster.armyId=1;
  const inst=roster.units[0],slots=()=>RulesCore.slotListFor(fixture.pkg,host,inst,fixture.upgrades,1);
  const key='special:training-dug-in',index=slots().findIndex(s=>s.key===key);
  assert(index>=0,'qualifying troopers must get Dug In even without a training slot');
  const target={unitInstanceId:inst.instanceId,slotIndex:index,slotKey:key};
  assert(BuilderModel.equip(roster,fixture,target,'training-dug-in',false,uid).ok);
  assert(!BuilderModel.equip(roster,fixture,target,'hit-the-dirt',false,uid).ok);
  fixture.pkg.armyOverrides['1']={slots:[{op:'add',slot:'training'}]};
  assert(slots().some(s=>s.key==='training'));
  assert(!slots().some(s=>s.key===key));
  fixture.pkg.armyOverrides['1']={slots:[{op:'deny',slot:'training'}]};
  assert(!slots().some(s=>s.key===key),'a battle force ban still takes precedence');
  fixture.pkg.armyOverrides['1']={};
  host.keywords=host.keywords.filter(k=>k.id!=='prepared_position');
  assert(!slots().some(s=>s.key===key));
  assert(!RulesCore.upgradeEligibility(fixture.upgrades['training-dug-in'],host,roster,fixture,[]).ok);
});

test('dedicated slots obey qualifying conditions, card restrictions and battle force slot rules', () => {
  const fixture=structuredClone(data),host=fixture.units['separatists-b1'],inst={upgrades:[]};
  const slots=()=>RulesCore.slotListFor(fixture.pkg,host,inst,fixture.upgrades,5);
  fixture.upgrades['gear-binoculars'].restrictions.condition={field:'unit.factionId',value:1};
  assert.deepEqual(slots().filter(s=>s.virtual).map(s=>s.key),['special:gear-portable']);
  fixture.pkg.armyOverrides['5']={slots:[{op:'deny',slot:'gear'}]};
  assert(!slots().some(s=>s.virtual));
  fixture.pkg.armyOverrides['5']={slots:[{op:'add',slot:'gear'}]};
  assert(!slots().some(s=>s.virtual));
  assert(slots().some(s=>s.key==='gear'));
});

test('adding and removing a granting card preserves both equipped special cards and their IDs', () => {
  let roster={...armyOf(unit('separatists-b1')),armyId:5};
  const host=data.units['separatists-b1'];
  const equip=(key,id)=>{
    const inst=roster.units[0],slots=RulesCore.slotListFor(data.pkg,host,inst,data.upgrades,5);
    const result=BuilderModel.equip(roster,data,{unitInstanceId:inst.instanceId,
      slotIndex:slots.findIndex(s=>s.key===key),slotKey:key},id,false,uid);
    assert(result.ok,result.reason);roster=result.draft;
  };
  for(const id of ['gear-binoculars','gear-portable'])equip('special:'+id,id);
  const identities=roster.units[0].upgrades.map(c=>c.instanceId);
  equip('heavy_weapon','grievous-heavy');
  const inst=roster.units[0];
  assert.deepEqual(inst.upgrades.slice(0,2).map(c=>c.slotIndex),[4,5]);
  BuilderModel.removeUpgrade(roster,data,inst.instanceId,inst.upgrades.find(c=>c.upgradeId==='grievous-heavy').instanceId);
  assert.deepEqual(inst.upgrades.map(c=>c.slotIndex),[3,4]);
  assert.deepEqual(inst.upgrades.map(c=>c.instanceId),identities);
  assert(!RulesCore.validateArmy(roster,data).issues.some(i=>i.code.startsWith('slot_')));
});

test('a newly granted ordinary category absorbs special selections atomically and removal restores them', () => {
  const fixture=structuredClone(data),host=fixture.units['separatists-b1'];
  fixture.upgrades['grievous-heavy'].rules.slotGrants=[{trigger:'equipped',slot:'gear'}];
  let roster={...armyOf(unit(host.id)),armyId:5};
  const equip=(key,id)=>{
    const inst=roster.units[0],slots=RulesCore.slotListFor(fixture.pkg,host,inst,fixture.upgrades,5);
    return BuilderModel.equip(roster,fixture,{unitInstanceId:inst.instanceId,
      slotIndex:slots.findIndex(s=>s.key===key),slotKey:key},id,false,uid);
  };
  for(const id of ['gear-binoculars','gear-portable']) {
    const result=equip('special:'+id,id);assert(result.ok,result.reason);roster=result.draft;
  }
  const before=JSON.stringify(roster),blocked=equip('heavy_weapon','grievous-heavy');
  assert(!blocked.ok,'one ordinary slot cannot absorb two equipped cards');
  assert.equal(JSON.stringify(roster),before,'rejection cannot remove either card');
  const inst=roster.units[0];
  BuilderModel.removeUpgrade(roster,fixture,inst.instanceId,inst.upgrades.find(c=>c.upgradeId==='gear-binoculars').instanceId);
  const added=equip('heavy_weapon','grievous-heavy');assert(added.ok,added.reason);roster=added.draft;
  const current=roster.units[0],scanner=current.upgrades.find(c=>c.upgradeId==='gear-portable');
  assert.equal(scanner.slotIndex,3);
  assert(!RulesCore.slotListFor(fixture.pkg,host,current,fixture.upgrades,5).some(s=>s.virtual));
  BuilderModel.removeUpgrade(roster,fixture,current.instanceId,current.upgrades.find(c=>c.upgradeId==='grievous-heavy').instanceId);
  assert.equal(scanner.slotIndex,4);
  assert(!RulesCore.validateArmy(roster,fixture).issues.some(i=>i.code.startsWith('slot_')));
});

test('apply-all equips per-card special slots independently across merged units', () => {
  let roster={...armyOf(unit('separatists-b1'),unit('separatists-b1')),armyId:5};
  for(const id of ['gear-binoculars','gear-portable']) {
    const inst=roster.units[0],key='special:'+id;
    const slots=RulesCore.slotListFor(data.pkg,data.units[inst.unitId],inst,data.upgrades,5);
    const result=BuilderModel.equip(roster,data,{unitInstanceId:inst.instanceId,
      groupIds:roster.units.map(i=>i.instanceId),slotIndex:slots.findIndex(s=>s.key===key),slotKey:key},id,true,uid);
    assert(result.ok,result.reason);roster=result.draft;
  }
  assert.equal(BuilderModel.groups(roster,data).length,1);
  assert.equal(new Set(roster.units.flatMap(i=>i.upgrades.map(c=>c.instanceId))).size,4);
});

test('legacy shared slots migrate by card identity including ordinary battle force slots that follow', () => {
  const fixture=structuredClone(data),host=fixture.units['rebels-mark-2-blaster'];
  fixture.pkg.armyOverrides['1']={slots:[{op:'add',slot:'gear'}]};
  const roster={...armyOf(unit(host.id)),armyId:1},inst=roster.units[0];
  inst.upgrades=[{instanceId:uid(),upgradeId:'training-dug-in',slotIndex:1},
    {instanceId:uid(),upgradeId:'gear-binoculars',slotIndex:2}];
  BuilderModel.migrateSlots(roster,fixture);
  assert.deepEqual(inst.upgrades.map(c=>c.slotIndex),[3,1]);
  const snapshot=structuredClone(roster);BuilderModel.migrateSlots(roster,fixture);
  assert.deepEqual(roster,snapshot);
  assert(!RulesCore.validateArmy(roster,fixture).issues.some(i=>i.code.startsWith('slot_')));
});

test('Flexible Response sets a minimum, preserving printed slots and ordinary slot modifiers', () => {
  const fixture = structuredClone(data), unit = fixture.units['rebels-guerilla-troopers'];
  const grant = {id: 'test-grant', slotIds: [4], rules: {slotTypes: [4], slotGrants: [
    {trigger: 'equipped', slot: 'heavy_weapon'}, {trigger: 'equipped', slot: 'heavy_weapon'},
    {trigger: 'equipped', slot: 'force'},
    {trigger: 'unitQualifies', slot: 'heavy_weapon', condition: {field: 'unit.id', value: unit.id}},
  ]}};
  fixture.upgrades[grant.id] = grant;
  const inst = {unitId: unit.id, instanceId: 'flex', upgrades: []};
  const slots = () => RulesCore.slotListFor(fixture.pkg, unit, inst, fixture.upgrades, 1);
  for (const [count, base] of [[0,[4,4,2]], [1,[4,4,2]], [2,[2]], [2,[4,10,4,2,4]], [3,[4,2]]]) {
    unit.keywords = [{id: 'flexible_response', value: count}];
    unit.upgradeSlots = base;
    inst.upgrades = [];
    fixture.pkg.armyOverrides['1'] = {};
    const before = slots();
    assert.equal(before.filter(s => s.key === 'heavy_weapon').length, Math.max(count, base.filter(id => id === 4).length));
    assert.equal(before.filter(s => s.required).length, count);
    inst.upgrades = [{upgradeId: grant.id, slotIndex: 0}];
    const after = slots(), heavy = after.filter(s => s.key === 'heavy_weapon');
    const grants = RulesCore.slotGrantsFor(fixture.pkg, unit, inst, fixture.upgrades);
    assert.equal(grants.equipped.filter(s => s.key === 'heavy_weapon').length, 2);
    assert.equal(grants.qualify.filter(s => s.key === 'heavy_weapon').length, 1);
    assert.equal(heavy.length, before.filter(s => s.key === 'heavy_weapon').length + 2);
    assert.equal(heavy.filter(s => s.required).length, count);
    assert.deepEqual(after.slice(0, before.length), before);
    assert.equal(after.at(-1).key, 'force');
    fixture.pkg.armyOverrides['1'] = {slots: [
      {op: 'deny', slot: 'heavy_weapon'}, {op: 'add', slot: 'heavy_weapon'},
    ]};
    assert.equal(slots().filter(s => s.key === 'heavy_weapon').length, 1, 'battle force modifiers still apply');
    fixture.pkg.armyOverrides['1'].slots.pop();
    assert(!slots().some(s => s.key === 'heavy_weapon'));
  }
  for (const id of ['empire-stormtroopers-hwu', 'rebels-guerilla-troopers']) {
    const real = data.units[id];
    const heavy = RulesCore.slotListFor(data.pkg, real, {upgrades: []}, data.upgrades, real.factions[0].id)
      .filter(s => s.key === 'heavy_weapon');
    assert.equal(heavy.length, 2);
    assert(heavy.every(s => s.required));
  }
  unit.keywords = [];
  const ordinary = RulesCore.slotGrantsFor(fixture.pkg, unit, inst, fixture.upgrades);
  assert.equal(ordinary.equipped.filter(s => s.key === 'heavy_weapon').length, 2);
  assert.equal(ordinary.qualify.filter(s => s.key === 'heavy_weapon').length, 1);
  assert.deepEqual(data.defs.keywords.find(k => k.id === 'flexible_response').timing, ['army_building']);
});

test('Jyn on Guerilla Troopers adds a usable third slot without moving training, and any two heavy slots suffice', () => {
  let seq = 0;
  const uid = () => `jyn-flex-${++seq}`, unit = data.units['rebels-guerilla-troopers'];
  let army = {armyId: 1, mode: 'standard', pointsLimit: 1000, units: [], commandIds: [], options: []};
  const added = BuilderModel.addUnit(army, data, unit.id, uid);
  assert(added.ok, added.reason); army = added.draft;
  const before = RulesCore.slotListFor(data.pkg, unit, army.units[0], data.upgrades, army.armyId);
  for (const [slotIndex, slotKey, cardId] of [[2,'training','training-offensive'],
    [0,'heavy_weapon','jyn-erso'], [before.length,'heavy_weapon','upstream-23948']]) {
    const result = BuilderModel.equip(army, data, {unitInstanceId: army.units[0].instanceId,
      slotIndex, slotKey}, cardId, false, uid);
    assert(result.ok, result.reason); army = result.draft;
  }
  const records = RulesCore.slotListFor(data.pkg, unit, army.units[0], data.upgrades, army.armyId);
  assert.equal(records.length, before.length + 1);
  assert.equal(records.at(-1).addedBy, 'jyn-erso');
  assert.equal(records[1].required, false, 'second printed slot is optional when the granted one is filled');
  assert.equal(BuilderModel.slotOrder(army.units[0], records)[1], before.length);
  assert.equal(army.units[0].upgrades.find(c => c.upgradeId === 'training-offensive').slotIndex, 2);
  assert(!RulesCore.validateArmy(army, data).issues.some(i => i.code.startsWith('slot_') || i.code === 'required_slot'));
  BuilderModel.removeUpgrade(army, data, army.units[0].instanceId,
    army.units[0].upgrades.find(c => c.upgradeId === 'jyn-erso').instanceId);
  assert.deepEqual(RulesCore.slotListFor(data.pkg, unit, army.units[0], data.upgrades, army.armyId), before);
  assert.equal(army.units[0].upgrades.find(c => c.upgradeId === 'upstream-23948').slotIndex, 0);
  assert.equal(army.units[0].upgrades.find(c => c.upgradeId === 'training-offensive').slotIndex, 2);
  assert.equal(RulesCore.validateArmy(army, data).issues.filter(i => i.code === 'required_slot').length, 1);
});

test('Kallus opens a usable heavy slot after himself on currently eligible hosts', () => {
  for (const id of ['empire-riot-squad', 'empire-stormtroopers']) {
    let roster = armyOf(unit(id));
    const host = data.units[id], context = slotContext(roster, 'heavy_weapon');
    const before = RulesCore.slotListFor(data.pkg, host, roster.units[0], data.upgrades, 2);
    const added = BuilderModel.equip(roster, data, context, 'kallus', false, uid);
    assert.equal(added.ok, true, added.reason);
    roster = added.draft;
    const records = RulesCore.slotListFor(data.pkg, host, roster.units[0], data.upgrades, 2);
    assert.equal(records.length, before.length + 1);
    const extra = records.findIndex(r => r.addedBy === 'kallus');
    assert.equal(records[extra].key, 'heavy_weapon');
    const order = BuilderModel.slotOrder(roster.units[0], records);
    assert.equal(order[order.indexOf(context.slotIndex) + 1], extra);
    const weaponId = id === 'empire-riot-squad' ? 'riot-squad-marksman' : 'stormtrooper-dlt19';
    const armed = BuilderModel.equip(roster, data, {...context, slotIndex: extra}, weaponId, false, uid);
    assert.equal(armed.ok, true, armed.reason);
    assert.ok(!RulesCore.validateArmy(armed.draft, data).issues.some(i => i.code.startsWith('slot_')));
    roster.units[0].upgrades = [];
    assert.deepEqual(RulesCore.slotListFor(data.pkg, host, roster.units[0], data.upgrades, 2), before);
  }
  const flexible = Object.values(data.units).find(u => u.factionId === 2 &&
    u.keywords?.some(k => k.id === 'flexible_response'));
  const roster = {...armyOf(unit(flexible.id)), armyId: flexible.factions[0].id};
  const before = RulesCore.slotListFor(data.pkg, flexible, roster.units[0], data.upgrades, roster.armyId);
  // Slot generation accepts the grant. Battle force eligibility stays independent.
  roster.units[0].upgrades = [{instanceId: uid(), upgradeId: 'kallus', slotIndex: 0}];
  const after = RulesCore.slotListFor(data.pkg, flexible, roster.units[0], data.upgrades, roster.armyId);
  assert.deepEqual(after.filter(s => s.addedBy !== 'kallus'), before);
  assert.deepEqual(after.find(s => s.addedBy === 'kallus'), {key: 'heavy_weapon', addedBy: 'kallus'});
});

test('Flexible Response allows gradual and batch equipment and a third heavy weapon, retaining invalid imports', () => {
  const fixture = structuredClone(data), unit = fixture.units['empire-stormtroopers'];
  unit.keywords.push({id: 'flexible_response', value: 2});
  unit.upgradeSlots = [4, 4, 1, 2];
  const grant = fixture.upgrades['stormtrooper-squad'];
  grant.rules.slotGrants = [{trigger: 'equipped', slot: 'heavy_weapon'}];
  let seq = 0;
  const uid = () => `flex-${++seq}`;
  let army = {armyId: 2, mode: 'standard', pointsLimit: 1000, units: [], commandIds: [], options: []};
  for (let i = 0; i < 2; i++) {
    const added = BuilderModel.addUnit(army, fixture, unit.id, uid);
    assert(added.ok, added.reason); army = added.draft;
  }
  const report = () => RulesCore.validateArmy(army, fixture);
  assert.equal(report().issues.filter(i => i.code === 'required_slot').length, 4);
  for (const [slotIndex, cardId] of [[0,'stormtrooper-dlt19'], [1,'stormtrooper-hh12'], [2,grant.id]]) {
    const context = {unitInstanceId: army.units[0].instanceId, groupIds: army.units.map(u => u.instanceId),
      slotIndex, slotKey: slotIndex === 2 ? 'personnel' : 'heavy_weapon'};
    const equipped = BuilderModel.equip(army, fixture, context, cardId, true, uid);
    assert(equipped.ok, equipped.reason); army = equipped.draft;
    assert.equal(report().issues.filter(i => i.code === 'required_slot').length, slotIndex === 0 ? 2 : 0);
  }
  assert.equal(report().issues.some(i => /slot_|flexible_response/.test(i.code)), false);
  const before = JSON.stringify(army);
  const third = BuilderModel.equip(army, fixture, {unitInstanceId: army.units[0].instanceId,
    slotIndex: 4, slotKey: 'heavy_weapon'}, 'stormtrooper-rt97c', false, uid);
  assert.equal(third.ok, true, third.reason);
  assert.equal(JSON.stringify(army), before);
  army = third.draft;
  assert.equal(report().issues.some(i => /slot_|flexible_response/.test(i.code)), false);
  army.units[0].upgrades.find(c => c.upgradeId === 'stormtrooper-rt97c').slotIndex = 99;
  const imported = JSON.stringify(army);
  assert(!report().issues.some(i => i.code === 'flexible_response_limit'));
  assert(report().issues.some(i => i.code === 'slot_missing'));
  assert.equal(JSON.stringify(army), imported);
  fixture.pkg.armyOverrides['2'] = {slots: [{op: 'deny', slot: 'heavy_weapon'}]};
  assert(report().issues.some(i => i.code === 'required_slot' && i.message.includes('可用槽位不足')));
  // Missing X must not silently mean zero or fall back to a hardcoded two.
  delete unit.keywords.at(-1).value;
  assert(report().issues.some(i => i.code === 'flexible_response_value'));
});

test('every named Equip loads all required cards through real slots with independent choices',()=>{
 let seq=0;
 for(const u of Object.values(data.units).filter(u=>u.equipUpgradeIds?.length)){
  const faction=u.factions.find(f=>[1,2,3,4,5,6,7].includes(f.id))||u.factions[0];
  const army={armyId:faction.id,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]};
  const before=JSON.stringify(army);
  const result=BuilderModel.addUnit(army,data,u.id,()=>`auto-${++seq}`);
  assert(result.ok,result.reason);assert.deepEqual(result.warnings,[],u.id);
  assert.equal(JSON.stringify(army),before);
  const inst=result.draft.units[0];
  assert(u.equipUpgradeIds.every(id=>inst.upgrades.some(c=>c.upgradeId===id)),u.id);
  for(const c of inst.upgrades.filter(c=>!u.equipUpgradeIds.includes(c.upgradeId)))
    assert.equal(RulesCore.upgradePoints(data.upgrades[c.upgradeId],u,result.draft,data),0,'optional automatic upgrade is free');
  assert.equal(new Set(inst.upgrades.map(c=>c.slotIndex)).size,inst.upgrades.length);
  assert.equal(new Set(inst.upgrades.map(c=>c.instanceId)).size,inst.upgrades.length);
  assert(!RulesCore.validateArmy(result.draft,data).issues.some(i=>i.code==='required_child_missing'));
  if(u.id==='rebels-cassian') assert.equal(inst.upgrades[0].face,'front');
  const repeat=BuilderModel.equipDefaults(result.draft,data,inst.instanceId,()=>`repeat-${++seq}`);
  assert.deepEqual(repeat.draft,result.draft);
  const removed=structuredClone(result.draft);removed.units[0].upgrades=removed.units[0].upgrades.filter(c=>c.upgradeId!==u.equipUpgradeIds[0]);
  assert.equal(RulesCore.validateArmy(removed,data).issues.filter(i=>i.code==='required_child_missing').length,1,u.id);
 }
});

test('Equip continues past blocked cards and visits slots granted by prior selections',()=>{
 const fixture=structuredClone(data),u=fixture.units['empire-stormtroopers'];
 u.upgradeSlots=[2];u.equipUpgradeIds=['training-hunter','force-push','gear-binoculars'];
 // A local synthetic grant exercises a new slot appended during the pass.
 fixture.upgrades['gear-binoculars'].rules.slotGrants=[{trigger:'equipped',slot:'force'}];
 fixture.upgrades['force-push'].restrictions={};fixture.upgrades['force-push'].rules={slotTypes:[5]};
 fixture.pkg.upgradeRules[String(fixture.upgrades['force-push'].upstream.id)]={};
 let n=0;const army={armyId:2,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]};
 const result=BuilderModel.addUnit(army,fixture,u.id,()=>`grant-${++n}`);
 assert(result.ok,result.reason);
 assert.deepEqual(result.draft.units[0].upgrades.map(c=>c.upgradeId),['gear-binoculars','force-push']);
 assert(result.warnings.some(s=>s.includes('没有可用的匹配槽位')||s.includes('升级资料不存在')));
 assert.equal(army.units.length,0);
});

test('action classification respects printed actions and all four metadata types',()=>{
 assert.deepEqual(BuilderModel.keywordActionTypes({id:'jump',action:'free-action'},data.defs),['free-action']);
 assert.deepEqual(BuilderModel.keywordActionTypes({id:'jump'},data.defs),['action','free-action']);
 assert.deepEqual(BuilderModel.keywordActionTypes({id:'noncombatant'},data.defs),[]);
 assert.deepEqual(BuilderModel.keywordActionTypes({id:'synthetic',actionTypes:['double-action','free-exhaust']},data.defs),['double-action','free-exhaust']);
});

test('Equip accepts counterpart IDs, and generic category Equip stays a player choice',()=>{
 const fixture=structuredClone(data),r2=fixture.units['rebels-r2d2-hero'];
 r2.equipUpgradeIds=['upstream-131'];let n=0;
 const army={armyId:1,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]};
 const added=BuilderModel.addUnit(army,fixture,r2.id,()=>`buddy-${++n}`);
 assert(added.ok,added.reason);assert.deepEqual(added.warnings,[]);
 assert.equal(added.draft.units[0].upgrades[0].upgradeId,'upstream-131');
 const generic=BuilderModel.addUnit({...army,armyId:2},data,'empire-imperial-agent-order-to-galaxy',()=>`generic-${++n}`);
 assert(generic.ok,generic.reason);assert.deepEqual(generic.draft.units[0].upgrades,[]);
 assert(RulesCore.validateArmy(generic.draft,data).issues.some(i=>i.code==='required_slot'));
});

test('Equip slot targets require one choice per category, including a later identical slot', () => {
 const fixture=structuredClone(data),unit=fixture.units['empire-stormtroopers'];
 unit.upgradeSlots=[2,2,10];unit.equipSlotIds=['gear','training'];unit.equipUpgradeIds=[];
 const army={armyId:2,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]};let n=0;
 const added=BuilderModel.addUnit(army,fixture,unit.id,()=>`slot-equip-${++n}`);
 assert(added.ok,added.reason);assert.deepEqual(added.draft.units[0].upgrades,[]);
 const missing=a=>RulesCore.validateArmy(a,fixture).issues.filter(i=>i.code==='required_slot');
 assert.equal(missing(added.draft).length,2);
 const gear=BuilderModel.equip(added.draft,fixture,{unitInstanceId:added.instanceId,slotKey:'gear',slotIndex:1},'gear-binoculars',false,()=>`g-${++n}`);
 assert(gear.ok,gear.reason);assert.equal(missing(gear.draft).length,1);
 const slots=RulesCore.slotListFor(fixture.pkg,unit,gear.draft.units[0],fixture.upgrades,2);
 assert(!slots[0].required);assert(slots[1].equipRequired);
 const trained=BuilderModel.equip(gear.draft,fixture,{unitInstanceId:added.instanceId,slotKey:'training',slotIndex:2},'training-tenacity',false,()=>`t-${++n}`);
 assert(trained.ok,trained.reason);assert.equal(missing(trained.draft).length,0);
 trained.draft.units[0].upgrades=[];assert.equal(missing(trained.draft).length,2);
 assert.equal(unit.upgradeSlots.length,3,'Equip never adds slots');
});

test('Equip supports named cards, counterpart auto-equipment, granted slots and missing categories together',()=>{
 const fixture=structuredClone(data),unit=fixture.units['empire-stormtroopers'];
 unit.upgradeSlots=[2];unit.equipUpgradeIds=['gear-binoculars'];unit.equipSlotIds=['gear','training'];
 fixture.upgrades['gear-binoculars'].rules.slotGrants=[{trigger:'equipped',slot:'training'}];
 const army={armyId:2,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]};let n=0;
 const added=BuilderModel.addUnit(army,fixture,unit.id,()=>`auto-slot-${++n}`);
 assert(added.ok,added.reason);assert.deepEqual(added.draft.units[0].upgrades.map(c=>c.upgradeId),['gear-binoculars']);
 const slots=RulesCore.slotListFor(fixture.pkg,unit,added.draft.units[0],fixture.upgrades,2);
 assert.equal(slots[1].key,'training');assert(slots[1].required);
 fixture.pkg.armyOverrides['2']={slots:[{op:'deny',slot:'training'}]};
 assert.equal(RulesCore.slotListFor(fixture.pkg,unit,added.draft.units[0],fixture.upgrades,2).length,1);
 assert(RulesCore.validateArmy(added.draft,fixture).issues.some(i=>i.code==='required_slot'&&i.message.includes('没有可用')));
});

test('Equip legacy text and slot refs resolve conservatively, and explicit empty targets remove fallback',()=>{
 for(const parameter of ['Equip: Doctrine，Armament','学说、武装','doctrine; armament'])
  assert.deepEqual(RulesCore.equipSlotKeys({keywords:[{id:'equip',parameter}]},data.pkg),['doctrine','armament']);
 assert.deepEqual(RulesCore.equipSlotKeys({keywords:[{id:'equip',parameter:'Katarn Pattern Armor'}]},data.pkg),[]);
 assert.deepEqual(RulesCore.equipSlotKeys({keywords:[{id:'equip',parameterRef:{kind:'slot',id:24}}]},data.pkg),['doctrine']);
 assert.deepEqual(RulesCore.equipSlotKeys({equipSlotIds:[],keywords:[{id:'equip',parameter:'Doctrine'}]},data.pkg),[]);
 const unit=structuredClone(data.units['rebels-guerilla-troopers']);unit.equipSlotIds=['heavy_weapon'];
 const slots=RulesCore.slotListFor(data.pkg,unit,{upgrades:[]},data.upgrades,1);
 assert.equal(slots.filter(s=>s.key==='heavy_weapon').length,2);
 assert(slots.filter(s=>s.key==='heavy_weapon').every(s=>s.required&&s.requiredBy==='flexible_response'));
});

test('Equip batch choices satisfy every instance independently and retain source data',()=>{
 const fixture=structuredClone(data),unit=fixture.units['empire-stormtroopers'];
 unit.upgradeSlots=[2];unit.equipSlotIds=['gear'];unit.equipUpgradeIds=[];
 const army={armyId:2,mode:'standard',pointsLimit:1000,units:[
  {unitId:unit.id,instanceId:'a',upgrades:[]},{unitId:unit.id,instanceId:'b',upgrades:[]}],commandIds:[],options:[]};
 let n=0;const result=BuilderModel.equip(army,fixture,{unitInstanceId:'a',groupIds:['a','b'],slotKey:'gear',slotIndex:0},'gear-binoculars',true,()=>`batch-${++n}`);
 assert(result.ok,result.reason);assert(!RulesCore.validateArmy(result.draft,fixture).issues.some(i=>i.code==='required_slot'));
 assert(army.units.every(i=>!i.upgrades.length));
 result.draft.units[1].upgrades=[];
 assert.deepEqual(RulesCore.validateArmy(result.draft,fixture).issues.filter(i=>i.code==='required_slot').map(i=>i.instanceId),['b']);
});
test("Not Out of it Yet requires both character groups, allowing each printed unit version", () => {
  const cmd = data.defs.commands.find(c=>c.id==='18903');
  const hans=['rebels-solo','rebels-han-solo-tauntaun'];
  const lukes=['rebels-luke-skywalker-hero','rebels-luke-skywalker-jedi','rebels-luke-tauntaun'];
  const check=(ids,expected)=>{
    const army={armyId:1,mode:'standard',pointsLimit:1000,units:ids.map((unitId,i)=>({unitId,instanceId:'req-'+i,upgrades:[]})),commandIds:[cmd.id],options:[]};
    const before=JSON.stringify(army);
    assert.equal(RulesCore.commandUnitRequirements(cmd,army,data.units,data.defs).every(g=>g.met),expected);
    assert.equal(!RulesCore.validateArmy(army,data).issues.some(i=>i.code==='command_required_units'),expected);
    assert.equal(JSON.stringify(army),before);
  };
  check([],false);
  for(const han of hans){check([han],false);for(const luke of lukes)check([han,luke],true);}
  for(const luke of lukes)check([luke],false);
  check([hans[0],hans[0]],false);
});
test("ordinary command alternatives still unlock with one version; counterpart namespaces do not satisfy unit groups",()=>{
  const army={armyId:1,mode:'standard',pointsLimit:1000,units:[{unitId:'rebels-luke-skywalker-hero',instanceId:'a',upgrades:[]}],commandIds:['11'],options:[]};
  assert(!RulesCore.validateArmy(army,data).issues.some(i=>i.code==='command_unlock'));
  const fake={id:'counterpart-test',upstream:{collection:'upgrades',id:'15'}};
  assert.equal(RulesCore.commandUnitRequirements({requiredUnitGroups:[[15]]},{units:[{unitId:fake.id}]},{[fake.id]:fake},data.defs)[0].met,false);
});
test("every counterpart has persisted art, effects, and resolved summaries/full rules", () => {
  const cards = Object.values(data.upgrades).filter(c=>c.usage === 'counterpart');
  assert.equal(cards.length, 5);
  for (const card of cards) {
    assert(card.name.zh, card.id);
    assert(card.description.zh.join('').length > 20, card.id);
    assert(fs.existsSync(path.join(root,card.assets.front)), card.id);
    assert(fs.existsSync(path.join(root,card.assets.portrait)), card.id);
    for (const host of [{factionId:1},{factionId:4}]) {
      const view=BuilderModel.upgradePresentation(card,data,host);
      assert.equal(view.keywords.length, new Set(view.keywords.map(k=>JSON.stringify(k))).size);
      for (const k of view.keywords) {
        const ref=data.defs.keywords.find(d=>d.id===k.id);
        assert(ref?.name.zh && ref.summary && ref.full, card.id+' / '+k.id);
      }
    }
  }
});
test("counterpart upgrades display existing unit art and abilities while retaining upgrade identity and rules", () => {
  const before = JSON.stringify(data);
  for (const id of ["upstream-167", "upstream-131", "upstream-15628", "upstream-22586", "upstream-3649"]) {
    const raw = data.upgrades[id];
    const view = BuilderModel.upgradePresentation(raw, data, { factionId: 1 });
    assert.equal(view.id, raw.id);
    assert.equal(view.points, raw.points);
    assert.deepEqual(view.rules, raw.rules);
    assert(view.assets.front);
    assert(view.keywords.length > 0);
    assert(view.counterpart);
  }
  const rebel = BuilderModel.upgradePresentation(data.upgrades['upstream-131'], data, { factionId: 1 });
  assert.equal(rebel.counterpart.id, 'rebels-c-3po-cyborg');
  const empire = BuilderModel.upgradePresentation(data.upgrades['upstream-167'], data);
  assert.equal(empire.weapons[0].range.min, 0);
  assert.equal(JSON.stringify(data), before);
});
test("counterpart presentation keeps explicit upgrade content and never links an unreferenced namesake", () => {
  const raw = data.upgrades['upstream-167'];
  const card = {...raw, description:{zh:['Original effect']}, assets:{front:'original.webp'}, keywords:[{id:'shielded',value:1}]};
  const view = BuilderModel.upgradePresentation(card, data);
  assert.deepEqual(view.description, card.description);
  assert.equal(view.assets.front,'original.webp');
  assert.equal(view.keywords.filter(k=>k.id==='shielded').length,1);
  const unknown = {...raw, upstream:{collection:'upgrades',id:'unmatched'}};
  assert.equal(BuilderModel.upgradePresentation(unknown,data),unknown);
});
let sequence = 0;
const uid = () => `instance-${++sequence}`;
const unit = (id = "empire-stormtroopers") => ({ instanceId: uid(), unitId: id, upgrades: [] });
const armyOf = (...units) => ({
  armyId: 2,
  mode: "standard",
  pointsLimit: 1000,
  units,
  commandIds: [],
  options: [],
});
const slotContext = (army, key) => ({
  unitInstanceId: army.units[0].instanceId,
  slotIndex: RulesCore.slotListFor(
    data.pkg,
    data.units[army.units[0].unitId],
    army.units[0],
    data.upgrades,
    army.armyId,
  ).findIndex((s) => s.key === key),
  slotKey: key,
  groupIds: army.units.map((i) => i.instanceId),
});

test('named exclusions enforce scopes, replacement and atomic batch equipment without changing existing cards', () => {
  const host = {...structuredClone(data.units['empire-stormtroopers']), upgradeSlots:[10,10]};
  const a = {id:'named-a',name:{en:'Named A',zh:'卡甲'},points:5,slotIds:[10],rules:{exclusion:{name:'姿态',scope:'unit'}}};
  const b = {...structuredClone(a),id:'named-b',name:{en:'Named B',zh:'卡乙'}};
  const d = {...data,units:{...data.units,[host.id]:host},upgrades:{...data.upgrades,[a.id]:a,[b.id]:b}};
  const empty = armyOf(unit(host.id),unit(host.id));
  const context = (roster, index, slot=0) => ({unitInstanceId:roster.units[index].instanceId,slotIndex:slot,
    slotKey:'training',groupIds:roster.units.map(i=>i.instanceId)});
  const equip = (roster,index,slot,id,all=false) => BuilderModel.equip(roster,d,context(roster,index,slot),id,all,uid);
  const first=equip(empty,0,0,a.id);assert(first.ok,first.reason);
  assert.match(equip(first.draft,0,1,b.id).reason,/互斥命名依据.*同单位卡/);
  assert(equip(first.draft,1,0,b.id).ok,'local exclusions permit another unit to take a different member');
  assert(equip(first.draft,0,0,b.id).ok,'replacement releases the old choice before testing');
  assert(BuilderModel.duplicate(first.draft,d,first.draft.units[0].instanceId,uid).ok);
  const batch=equip(empty,0,0,a.id,true);assert(batch.ok,batch.reason);
  assert(equip(batch.draft,0,0,b.id,true).ok,'replacing every local copy is allowed');
  a.rules.exclusion.scope='army';
  const snapshot=JSON.stringify(empty);
  const denied=equip(empty,0,0,a.id,true);assert.equal(denied.ok,false);
  assert.equal(JSON.stringify(empty),snapshot,'failed batch must not equip even one target');
  assert.match(equip(first.draft,1,0,b.id).reason,/同军表/,'broader existing scope blocks narrower candidate');
  const other=equip(empty,1,0,b.id);assert(other.ok,other.reason);
  assert.match(equip(other.draft,0,0,a.id).reason,/同军表/,'broader candidate scope also blocks');
  assert.equal(BuilderModel.duplicate(first.draft,d,first.draft.units[0].instanceId,uid).ok,false);
  for(const value of [undefined,null,{name:'   ',scope:'army'}]) {
    a.rules.exclusion=value;
    assert(equip(other.draft,0,0,a.id).ok,'no configured name means no named restriction');
  }
  a.rules.exclusion={name:'另一个名称',scope:'army'};
  assert(equip(other.draft,0,0,a.id).ok);
  a.rules.exclusion={name:' 姿态 ',scope:'army'};
  assert.equal(equip(other.draft,0,0,a.id).ok,false,'trim surrounding whitespace');
});

test('named exclusions cover unit cards, upgrades, saved invalid lists and both faces only once', () => {
  const host={...structuredClone(data.units['empire-stormtroopers']),upgradeSlots:[10,10]};
  const upgrade={id:'named-face',name:{en:'Face',zh:'双面卡'},points:5,slotIds:[10],
    dualSided:true,back:{name:{en:'Other face',zh:'背面'}},rules:{exclusion:{name:'军团标识',scope:'unit'}}};
  const d={...data,units:{...data.units,[host.id]:host},upgrades:{...data.upgrades,[upgrade.id]:upgrade}};
  const empty=armyOf(unit(host.id)), inst=empty.units[0];
  const equipped={...empty,units:[{...inst,upgrades:[{upgradeId:upgrade.id,instanceId:'face',slotIndex:0,face:'both'}]}]};
  assert.deepEqual(RulesCore.exclusionConflicts(equipped,d),[],'one two-sided card is one selection');
  host.rules.exclusion={name:'军团标识',scope:'unit'};
  const conflict=RulesCore.validateArmy(equipped,d).issues.filter(i=>i.code==='named_exclusion');
  assert.equal(conflict.length,2);assert(conflict.every(i=>i.unitInstanceId===inst.instanceId));
  assert.equal(BuilderModel.equip(empty,d,{unitInstanceId:inst.instanceId,slotIndex:0,slotKey:'training'},upgrade.id,false,uid).ok,false);
  assert(BuilderModel.addUnit(equipped,d,host.id,uid).ok,'unit scope does not block another host');
  host.rules.exclusion.scope='army';
  assert.equal(BuilderModel.addUnit(empty,d,host.id,uid).ok,false);
  const invalid=structuredClone(equipped);invalid.units.push(unit(host.id));
  assert.equal(RulesCore.exclusionConflicts(invalid,d).length,3);
  assert.equal(BuilderModel.addUnit(invalid,d,host.id,uid).ok,false,'already-invalid lists cannot evade the limit');
  delete host.rules.exclusion;
  assert.deepEqual(RulesCore.exclusionConflicts(equipped,d),[]);
});

test("groups ignore instance IDs and selection order but preserve configuration and unit version", () => {
  const a = unit(),
    b = unit();
  a.upgrades = [
    { instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 },
    { instanceId: uid(), upgradeId: "test", slotIndex: 2 },
  ];
  b.upgrades = a.upgrades.toReversed().map((ch) => ({ ...ch, instanceId: uid() }));
  const roster = armyOf(a, b),
    snapshot = JSON.stringify(roster);
  assert.equal(BuilderModel.groups(roster, data).length, 1);
  assert.equal(JSON.stringify(roster), snapshot);
  b.upgrades[0].slotIndex = 3;
  assert.equal(BuilderModel.groups(roster, data).length, 2);
  b.upgrades = structuredClone(a.upgrades);
  b.unitId = "empire-scout-troopers";
  assert.equal(BuilderModel.groups(roster, data).length, 2);
});

test('granted slots follow their source in each batch unit without changing stored selections', () => {
  let roster = {...armyOf(unit('rebels-rebel-troopers'), unit('rebels-rebel-troopers')), armyId: 1};
  const gear = BuilderModel.equip(roster, data, slotContext(roster, 'gear'), 'gear-binoculars', true, uid);
  assert.equal(gear.ok, true, gear.reason);
  roster = gear.draft;
  const before = JSON.stringify(roster);
  const result = BuilderModel.equip(roster, data, slotContext(roster, 'personnel'), 'rebel-captain', true, uid);
  assert.equal(result.ok, true, result.reason);
  assert.equal(JSON.stringify(roster), before);
  for (const instance of result.draft.units) {
    const records = RulesCore.slotListFor(data.pkg, data.units[instance.unitId], instance, data.upgrades, 1);
    const snapshot = JSON.stringify([instance, records]);
    const order = BuilderModel.slotOrder(instance, records);
    const parent = instance.upgrades.find(c => c.upgradeId === 'rebel-captain').slotIndex;
    const child = records.findIndex(s => s.addedBy === 'rebel-captain');
    assert.equal(order[order.indexOf(parent) + 1], child);
    assert.deepEqual(instance.upgrades.find(c => c.upgradeId === 'gear-binoculars'),
      roster.units.find(u => u.instanceId === instance.instanceId).upgrades[0]);
    assert.equal(JSON.stringify([instance, records]), snapshot);
    assert.deepEqual(BuilderModel.slotOrder(JSON.parse(JSON.stringify(instance)), records), order);
  }
  const first = result.draft.units[0];
  const records = RulesCore.slotListFor(data.pkg, data.units[first.unitId], first, data.upgrades, 1);
  const child = records.findIndex(s => s.addedBy === 'rebel-captain');
  const trained = BuilderModel.equip(result.draft, data, {unitInstanceId: first.instanceId,
    groupIds: result.ids, slotIndex: child, slotKey: 'training'}, 'training-tenacity', true, uid);
  assert.equal(trained.ok, true, trained.reason);
  assert.equal(BuilderModel.groups(trained.draft, data).length, 1);
  assert.ok(trained.draft.units.every(u => u.upgrades.find(c => c.upgradeId === 'training-tenacity').slotIndex === child));
});

test('multiple and chained grants are adjacent in printed order, independent of equipment selection order', () => {
  const records = [{key:'personnel'}, {key:'gear'}, {key:'training',addedBy:'parent'},
    {key:'comms',addedBy:'parent'}, {key:'force',addedBy:'child'}, {key:'protocol',virtual:true}];
  const instance = {upgrades: [{upgradeId:'child',slotIndex:2}, {upgradeId:'parent',slotIndex:0}]};
  assert.deepEqual(BuilderModel.slotOrder(instance, records), [0,2,4,3,1,5]);
  assert.deepEqual(BuilderModel.slotOrder({upgrades:instance.upgrades.toReversed()}, records), [0,2,4,3,1,5]);
  assert.deepEqual(BuilderModel.slotOrder({upgrades:[]}, records.slice(0,2)), [0,1]);
});

test('invalid legacy grant links preserve every slot once and cannot loop', () => {
  const records = [{key:'gear',addedBy:'b'}, {key:'training',addedBy:'a'},
    {key:'comms',addedBy:'missing'}, {key:'command',addedBy:'override'}, {key:'force',addedBy:'self'}];
  const instance = {upgrades:[{upgradeId:'a',slotIndex:0}, {upgradeId:'b',slotIndex:1},
    {upgradeId:'self',slotIndex:4}, {upgradeId:'override',slotIndex:0}]};
  const order = BuilderModel.slotOrder(instance, records);
  assert.deepEqual(order, [2,3,4,0,1]);
  assert.equal(new Set(order).size, records.length);
  assert.deepEqual(BuilderModel.slotOrder(instance, []), []);
});
test("copy duplicates all upgrades with independent IDs and leaves the input untouched", () => {
  const roster = armyOf(unit());
  roster.units[0].upgrades = [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }];
  const snapshot = JSON.stringify(roster),
    result = BuilderModel.duplicate(roster, data, roster.units[0].instanceId, uid);
  assert.equal(result.ok, true, result.reason);
  assert.equal(JSON.stringify(roster), snapshot);
  assert.equal(BuilderModel.groups(result.draft, data).length, 1);
  assert.notEqual(result.draft.units[0].instanceId, result.draft.units[1].instanceId);
  assert.notEqual(
    result.draft.units[0].upgrades[0].instanceId,
    result.draft.units[1].upgrades[0].instanceId,
  );
  result.draft.units[1].upgrades.length = 0;
  assert.equal(result.draft.units[0].upgrades.length, 1);
});
test("unique unit or equipped unique upgrade prevents copying", () => {
  assert.equal(BuilderModel.copyable(unit("empire-darth-vader-lord"), data), false);
  const u = unit();
  u.upgrades = [{ instanceId: uid(), upgradeId: "del-meeko", slotIndex: 0 }];
  const roster = armyOf(u);
  assert.equal(BuilderModel.duplicate(roster, data, u.instanceId, uid).ok, false);
  assert.equal(roster.units.length, 1);
});
test("default equipment affects one group member and splits the presentation", () => {
  const roster = armyOf(unit(), unit()),
    snapshot = JSON.stringify(roster);
  const result = BuilderModel.equip(
    roster,
    data,
    slotContext(roster, "heavy_weapon"),
    "stormtrooper-dlt19",
    false,
    uid,
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.count, 1);
  assert.equal(JSON.stringify(roster), snapshot);
  assert.equal(result.draft.units[1].upgrades.length, 0);
  assert.equal(BuilderModel.groups(result.draft, data).length, 2);
});
test("batch equipment commits independent selections for every merged unit", () => {
  const roster = armyOf(unit(), unit());
  const result = BuilderModel.equip(
    roster,
    data,
    slotContext(roster, "heavy_weapon"),
    "stormtrooper-dlt19",
    true,
    uid,
  );
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.count, 2);
  assert.equal(BuilderModel.groups(result.draft, data).length, 1);
  assert.equal(
    new Set(result.draft.units.flatMap((u) => u.upgrades.map((c) => c.instanceId))).size,
    2,
  );
  assert.equal(RulesCore.validateArmy(result.draft, data).basePoints, 124);
});
test("unique batch failure is atomic; replacing a slot ignores its removed selection", () => {
  const roster = armyOf(unit('empire-shoretroopers'), unit('empire-shoretroopers')),
    ctx = slotContext(roster, "heavy_weapon"),
    snapshot = JSON.stringify(roster);
  const failed = BuilderModel.equip(roster, data, ctx, "del-meeko", true, uid);
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /独特|互斥|上限/);
  assert.equal(JSON.stringify(roster), snapshot);
  const first = BuilderModel.equip(roster, data, ctx, "del-meeko", false, uid);
  assert.equal(first.ok, true, first.reason);
  const replacement = BuilderModel.equip(first.draft, data, ctx, "shore-t21b", false, uid);
  assert.equal(replacement.ok, true, replacement.reason);
  assert.equal(replacement.draft.units[0].upgrades.length, 1);
  assert.equal(replacement.draft.units[0].upgrades[0].upgradeId, "shore-t21b");
});
test("stale or mismatched targets and wrong slots never mutate a roster", () => {
  const roster = armyOf(unit(), unit()),
    ctx = slotContext(roster, "heavy_weapon");
  roster.units[1].upgrades.push({
    instanceId: uid(),
    upgradeId: "stormtrooper-dlt19",
    slotIndex: 0,
  });
  const snapshot = JSON.stringify(roster);
  assert.equal(BuilderModel.equip(roster, data, ctx, "stormtrooper-dlt19", true, uid).ok, false);
  assert.equal(
    BuilderModel.equip(roster, data, { ...ctx, slotIndex: 99 }, "stormtrooper-dlt19", false, uid)
      .ok,
    false,
  );
  assert.equal(BuilderModel.equip(roster, data, ctx, "force-saber", false, uid).ok, false);
  assert.equal(JSON.stringify(roster), snapshot);
});
test("new local duplicate equipment is rejected even when the roster is unfinished", () => {
  const roster = armyOf(unit("empire-darth-vader-lord"));
  const ctx = slotContext(roster, "force");
  const first = BuilderModel.equip(roster, data, ctx, "force-saber", false, uid);
  assert.equal(first.ok, true, first.reason);
  const second = BuilderModel.equip(
    first.draft,
    data,
    { ...ctx, slotIndex: ctx.slotIndex + 1 },
    "force-saber",
    false,
    uid,
  );
  assert.equal(second.ok, false);
  assert.match(second.reason, /重复|同名/);
});

test("copy cannot worsen an existing upgrade limit violation", () => {
  const limitedData = {
    ...data,
    upgrades: {
      ...data.upgrades,
      "stormtrooper-dlt19": {
        ...data.upgrades["stormtrooper-dlt19"],
        rules: { ...data.upgrades["stormtrooper-dlt19"].rules, limit: 1 },
      },
    },
  };
  const roster = armyOf(unit(), unit());
  for (const u of roster.units)
    u.upgrades = [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }];
  const result = BuilderModel.duplicate(roster, limitedData, roster.units[0].instanceId, uid);
  assert.equal(result.ok, false);
  assert.match(result.reason, /上限/);
  assert.equal(roster.units.length, 2);
});
test("batch replacements remove all old conflicting choices before checking the new configuration", () => {
  const replacement = {
    ...data.upgrades["stormtrooper-dlt19"],
    id: "test-replacement",
    name: { en: "Replacement" },
    upstream: { id: "test-replacement" },
    rules: { slotTypes: [4], locallyUnique: true },
  };
  const scoped = {
    ...data,
    upgrades: { ...data.upgrades, [replacement.id]: replacement },
    pkg: {
      ...data.pkg,
      upgradeRules: {
        ...data.pkg.upgradeRules,
        [String(data.upgrades["stormtrooper-dlt19"].upstream.id)]: {
          ...data.pkg.upgradeRules[String(data.upgrades["stormtrooper-dlt19"].upstream.id)],
          conflictGroup: "test-group",
        },
        "test-replacement": { conflictGroup: "test-group" },
      },
    },
  };
  scoped.nameIndex = RulesCore.buildNameIndex(scoped.upgrades, scoped.defs);
  const roster = armyOf(unit(), unit());
  for (const u of roster.units)
    u.upgrades = [{ instanceId: uid(), upgradeId: "stormtrooper-dlt19", slotIndex: 0 }];
  const result = BuilderModel.equip(
    roster,
    scoped,
    slotContext(roster, "heavy_weapon"),
    replacement.id,
    true,
    uid,
  );
  assert.equal(result.ok, true, result.reason);
  assert.ok(result.draft.units.every((u) => u.upgrades[0].upgradeId === replacement.id));
  assert.ok(roster.units.every((u) => u.upgrades[0].upgradeId === "stormtrooper-dlt19"));
});
test("unit selection rejects unique name variants and does not mutate the input", () => {
  const roster = { ...armyOf(unit("rebels-solo")), armyId: 1 };
  const snapshot = JSON.stringify(roster);
  for (const id of ["rebels-solo", "rebels-han-solo-tauntaun"]) {
    const result = BuilderModel.addUnit(roster, data, id, uid);
    assert.equal(result.ok, false);
    assert.match(result.reason, /独特|互斥/);
  }
  assert.equal(JSON.stringify(roster), snapshot);
});
test("combined Han and Chewie reserves both characters in either selection order", () => {
  for (const id of ["rebels-solo", "rebels-han-solo-tauntaun", "rebels-chewbacca-rebel"]) {
    for (const [first, next] of [
      [id, "mercenary-rogue-han-and-chewie"],
      ["mercenary-rogue-han-and-chewie", id],
    ]) {
      const roster = { ...armyOf(unit(first)), armyId: 1 };
      const result = BuilderModel.addUnit(roster, data, next, uid);
      assert.equal(result.ok, false, first + " + " + next);
      assert.match(result.reason, /独特角色/);
      const imported = { ...roster, units: [...roster.units, unit(next)] };
      assert.ok(
        RulesCore.validateArmy(imported, data).issues.some(
          (i) => i.code === "character_duplicate",
        ),
      );
    }
  }
});
test("combined character can equip its own mandatory unique children", () => {
  let roster = { ...armyOf(unit("mercenary-rogue-han-and-chewie")), armyId: 1 };
  const context = slotContext(roster, "personnel");
  for (const [slotIndex, card] of [
    [0, "upstream-23420"],
    [1, "upstream-23419"],
  ]) {
    const result = BuilderModel.equip(
      roster,
      data,
      { ...context, slotIndex },
      card,
      false,
      uid,
    );
    assert.equal(result.ok, true, result.reason);
    roster = result.draft;
  }
  assert.equal(roster.units[0].upgrades.length, 2);
  assert.ok(
    !RulesCore.validateArmy(roster, data).issues.some((i) => i.code === "character_duplicate"),
  );
});
test("unique upgrade and character unit conflict in both directions", () => {
  const host = unit("rebels-rebel-veterans");
  // The existing eligibility data for this host allows the Chewbacca heavy upgrade.
  const allowedHost = Object.values(data.units).find((u) => String(u.upstream?.id) === "1563");
  host.unitId = allowedHost.id;
  const base = { ...armyOf(host), armyId: 1 };
  const equipped = BuilderModel.equip(
    base,
    data,
    slotContext(base, "heavy_weapon"),
    "chewbacca-heavy",
    false,
    uid,
  );
  assert.equal(equipped.ok, true, equipped.reason);
  assert.equal(
    BuilderModel.addUnit(equipped.draft, data, "rebels-chewbacca-rebel", uid).ok,
    false,
  );
  assert.equal(
    BuilderModel.addUnit(equipped.draft, data, "mercenary-rogue-han-and-chewie", uid).ok,
    false,
  );
  const withUnit = { ...base, units: [host, unit("rebels-chewbacca-rebel")] };
  const result = BuilderModel.equip(
    withUnit,
    data,
    slotContext(withUnit, "heavy_weapon"),
    "chewbacca-heavy",
    false,
    uid,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /独特/);
});
test("unrelated unique characters remain available", () => {
  const roster = { ...armyOf(unit("rebels-solo")), armyId: 1 };
  const result = BuilderModel.addUnit(roster, data, "rebels-chewbacca-rebel", uid);
  assert.equal(result.ok, true, result.reason);
});
test("rank maximum blocks new additions and copies even if the army was already over cap", () => {
  const id = "empire-imperial-officer-ruthless-efficiency";
  for (const n of [2, 3]) {
    const roster = armyOf(...Array.from({ length: n }, () => unit(id)));
    assert.equal(BuilderModel.addUnit(roster, data, id, uid).ok, false);
    assert.equal(
      BuilderModel.duplicate(roster, data, roster.units[0].instanceId, uid).ok,
      false,
    );
    assert.equal(roster.units.length, n);
  }
  assert.equal(BuilderModel.addUnit(armyOf(), data, id, uid).ok, true);
});
test("unit limits apply to base armies and cannot worsen existing violations", () => {
  const scoped = {
    ...data,
    units: {
      ...data.units,
      "empire-stormtroopers": {
        ...data.units["empire-stormtroopers"],
        rules: { ...data.units["empire-stormtroopers"].rules, limit: 1 },
      },
    },
  };
  const roster = armyOf(unit(), unit());
  assert.ok(
    RulesCore.validateArmy(roster, scoped).issues.some(
      (i) => i.code === "unit_limit_exceeded",
    ),
  );
  assert.equal(BuilderModel.addUnit(roster, scoped, "empire-stormtroopers", uid).ok, false);
  assert.equal(
    BuilderModel.duplicate(roster, scoped, roster.units[0].instanceId, uid).ok,
    false,
  );
});
test("existing explicit unit mutual exclusion still blocks adding a differently named unit", () => {
  const a = data.units["empire-stormtroopers"];
  const b = Object.values(data.units).find((u) => u.id === "empire-imperial-officer-ruthless-efficiency");
  const scoped = {
    ...data,
    units: {
      ...data.units,
      [a.id]: {
        ...a,
        rules: {
          ...a.rules,
          unavailableWith: [{ propertyName: "units", id: b.upstream.id }],
        },
      },
    },
  };
  for (const [first, next] of [
    [a.id, b.id],
    [b.id, a.id],
  ]) {
    const result = BuilderModel.addUnit(armyOf(unit(first)), scoped, next, uid);
    assert.equal(result.ok, false);
    assert.match(result.reason, /互斥/);
  }
});
