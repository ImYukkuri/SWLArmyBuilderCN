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

test('Flexible Response suppresses heavy-slot modifiers at their source, preserving other slots and stored positions', () => {
  const fixture = structuredClone(data), unit = fixture.units['rebels-guerilla-troopers'];
  const grant = {id: 'test-grant', rules: {slotGrants: [
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
    inst.upgrades = [{upgradeId: grant.id, slotIndex: 0}];
    fixture.pkg.armyOverrides['1'] = {slots: [
      {op: 'deny', slot: 'heavy_weapon'}, {op: 'add', slot: 'heavy_weapon'},
    ]};
    const after = slots(), heavy = after.filter(s => s.key === 'heavy_weapon');
    const grants = RulesCore.slotGrantsFor(fixture.pkg, unit, inst, fixture.upgrades);
    assert(![...grants.equipped, ...grants.qualify].some(s => s.key === 'heavy_weapon'));
    assert.equal(heavy.length, count);
    assert(heavy.every(s => s.required));
    assert.deepEqual(after.slice(0, before.length), before);
    assert.equal(after.at(-1).key, 'force');
    fixture.pkg.armyOverrides['1'].slots.pop();
    assert.deepEqual(slots(), after, 'deny alone cannot remove final mandatory slots');
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
});

test('Jyn on Guerilla Troopers never creates a third slot or changes an equipped training slot', () => {
  let seq = 0;
  const uid = () => `jyn-flex-${++seq}`, unit = data.units['rebels-guerilla-troopers'];
  let army = {armyId: 1, mode: 'standard', pointsLimit: 1000, units: [], commandIds: [], options: []};
  const added = BuilderModel.addUnit(army, data, unit.id, uid);
  assert(added.ok, added.reason); army = added.draft;
  const before = RulesCore.slotListFor(data.pkg, unit, army.units[0], data.upgrades, army.armyId);
  for (const [slotIndex, slotKey, cardId] of [[2,'training','training-offensive'],
    [0,'heavy_weapon','jyn-erso'], [1,'heavy_weapon','upstream-23948']]) {
    const result = BuilderModel.equip(army, data, {unitInstanceId: army.units[0].instanceId,
      slotIndex, slotKey}, cardId, false, uid);
    assert(result.ok, result.reason); army = result.draft;
    assert.deepEqual(RulesCore.slotListFor(data.pkg, unit, army.units[0], data.upgrades, army.armyId), before);
  }
  assert.equal(army.units[0].upgrades.find(c => c.upgradeId === 'training-offensive').slotIndex, 2);
  assert(!RulesCore.validateArmy(army, data).issues.some(i => i.code.startsWith('slot_') || i.code === 'required_slot'));
  army.units[0].upgrades = army.units[0].upgrades.filter(c => c.upgradeId !== 'jyn-erso');
  assert.deepEqual(RulesCore.slotListFor(data.pkg, unit, army.units[0], data.upgrades, army.armyId), before);
});

test('Flexible Response allows gradual and batch equipment, rejects a third heavy weapon and retains imported excess', () => {
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
  const failed = BuilderModel.equip(army, fixture, {unitInstanceId: army.units[0].instanceId,
    slotIndex: 4, slotKey: 'heavy_weapon'}, 'del-meeko', false, uid);
  assert.equal(failed.ok, false);
  assert.equal(JSON.stringify(army), before);
  army.units[0].upgrades.push({instanceId: uid(), upgradeId: 'del-meeko', slotIndex: 99});
  const imported = JSON.stringify(army);
  assert(report().issues.some(i => i.code === 'flexible_response_limit'));
  assert(report().issues.some(i => i.code === 'slot_missing'));
  assert.equal(JSON.stringify(army), imported);
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
  assert.deepEqual(inst.upgrades.map(c=>c.upgradeId).sort(),[...u.equipUpgradeIds].sort(),u.id);
  assert.equal(new Set(inst.upgrades.map(c=>c.slotIndex)).size,u.equipUpgradeIds.length);
  assert.equal(new Set(inst.upgrades.map(c=>c.instanceId)).size,u.equipUpgradeIds.length);
  assert(!RulesCore.validateArmy(result.draft,data).issues.some(i=>i.code==='required_child_missing'));
  if(u.id==='rebels-cassian') assert.equal(inst.upgrades[0].face,'front');
  const repeat=BuilderModel.equipDefaults(result.draft,data,inst.instanceId,()=>`repeat-${++seq}`);
  assert.deepEqual(repeat.draft,result.draft);
  const removed=structuredClone(result.draft);removed.units[0].upgrades.shift();
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
  const roster = armyOf(unit(), unit()),
    ctx = slotContext(roster, "heavy_weapon"),
    snapshot = JSON.stringify(roster);
  const failed = BuilderModel.equip(roster, data, ctx, "del-meeko", true, uid);
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /独特|互斥|上限/);
  assert.equal(JSON.stringify(roster), snapshot);
  const first = BuilderModel.equip(roster, data, ctx, "del-meeko", false, uid);
  assert.equal(first.ok, true, first.reason);
  const replacement = BuilderModel.equip(first.draft, data, ctx, "stormtrooper-dlt19", false, uid);
  assert.equal(replacement.ok, true, replacement.reason);
  assert.equal(replacement.draft.units[0].upgrades.length, 1);
  assert.equal(replacement.draft.units[0].upgrades[0].upgradeId, "stormtrooper-dlt19");
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
