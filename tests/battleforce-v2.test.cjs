const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
global.window = global;
const v2 = require('../battleforce-v2.js');
for (const file of ['dice-enums', 'upgrade-faces', 'rules-core', 'mandalorian-rules',
  'builder-model', 'builder-library', 'builder-transfer']) require('../' + file + '.js');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, 'data', file + '.json'), 'utf8'));
const data = {pkg: read('slot-rules'), defs: read('catalog-definitions'), ttsNames: read('tts-names'),
  units: Object.fromEntries(read('units').units.map(u => [u.id, u])), upgrades: UpgradeFaces.index(read('upgrades').cards)};
RulesCore.prepareData(data);
data.nameIndex = RulesCore.buildNameIndex(data.upgrades, data.defs);

function force() {
  const source = structuredClone(data.pkg.battleForces[28]);
  const ruleGroups = source.options.map(o => ({id: o.id, name: {en: o.name, zh: o.nameZh}, textRulesZh: [o.text]}));
  return {...source, status:'draft', engineVersion: 2, v2: {common: {textRules: source.textRules, textRulesZh: source.textRulesZh},
    ruleGroups, selectionSchemes: [{id: 'clone-traits', name: {en: 'Clone traits', zh: '克隆人营特质'},
      groups: source.draftSpec.optionGroups.map(g => ({id: g.id, name: {en: g.id, zh: g.nameZh}, min: 1, max: 1,
        ruleGroupIds: source.options.filter(o => o.chooseOneKey === g.id).map(o => o.id)}))}]}};
}
const blank = () => ({armyId: 28, mode: 'standard', pointsLimit: 1000, units: [], commandIds: [], options: []});
function chosen() {
  const bf = force();
  let army = blank();
  for (const g of bf.v2.selectionSchemes[0].groups) army = v2.choose(army, bf, 'clone-traits', g.id, [g.ruleGroupIds[0]]);
  return army;
}
const scoped = bf => ({...data, pkg: {...data.pkg, battleForces: {...data.pkg.battleForces, 28: bf}}});

test('clone draft has three independent choices with 3/3/6 candidates, without changing source data', () => {
  const before = JSON.stringify(data);
  const bf = force(), config = bf.v2;
  assert.deepEqual(config.selectionSchemes[0].groups.map(g => g.ruleGroupIds.length), [3, 3, 6]);
  assert.deepEqual(v2.validateDefinition(bf), []);
  assert.deepEqual(v2.validatePackage(scoped(bf).pkg), []);
  assert.equal(JSON.stringify(data), before);
});

test('definition validator rejects dangling IDs, duplicates, invalid counts and unimplemented effects', () => {
  const mutations = [
    bf => bf.v2.ruleGroups.push(structuredClone(bf.v2.ruleGroups[0])),
    bf => bf.v2.selectionSchemes[0].groups[0].ruleGroupIds.push('missing-rule'),
    bf => bf.v2.selectionSchemes[0].groups[1].ruleGroupIds.push('ccb_assault'),
    bf => bf.v2.selectionSchemes[0].groups[0].ruleGroupIds.push('ccb_assault'),
    bf => bf.v2.selectionSchemes[0].groups[0].min = 2,
    bf => bf.v2.selectionSchemes[0].groups[0].min = -1,
    bf => bf.v2.selectionSchemes[0].groups[0].max = 4,
    bf => bf.v2.selectionSchemes[0].groups[0].max = 0.5,
    bf => bf.v2.ruleGroups[0].id = 42,
    bf => bf.v2.ruleGroups[0].id = 'constructor',
    bf => bf.v2.ruleGroups[0].name = {en: 'name'},
    bf => bf.v2.common.textRules = ['ok', null],
    bf => bf.v2.common.modifiers = [{field: 'points', op: 'set', value: 0}],
    bf => bf.status = 'active',
  ];
  for (const mutate of mutations) {
    const bf = force(); mutate(bf);
    assert(v2.validateDefinition(bf).length, String(mutate));
  }
  const optional = force(); optional.v2.selectionSchemes[0].groups[0].min = 0;
  assert.deepEqual(v2.validateDefinition(optional), []);
});

test('unfinished choices remain editable, replacements and cancellation remove the old choice', () => {
  const bf = force(), original = blank();
  assert.equal(v2.selectionState(original, bf).issues.filter(i => i.code === 'battle_force_selection_min').length, 3);
  let army = v2.choose(original, bf, 'clone-traits', 'ccb_battalion', ['ccb_assault']);
  assert.deepEqual(v2.selectionState(army, bf).activeRuleGroupIds, ['ccb_assault']);
  army = v2.choose(army, bf, 'clone-traits', 'ccb_battalion', ['ccb_scout']);
  assert.deepEqual(v2.selectionState(army, bf).activeRuleGroupIds, ['ccb_scout']);
  army = v2.choose(army, bf, 'clone-traits', 'ccb_battalion', []);
  assert.deepEqual(v2.selectionState(army, bf).activeRuleGroupIds, []);
  assert.deepEqual(original, blank());
  assert.deepEqual(v2.selectionState(chosen(), bf).issues, []);
});

test('invalid choices are rejected atomically and never become active rules', () => {
  const bf = force(), army = chosen(), snapshot = structuredClone(army);
  for (const [group, choices] of [['ccb_battalion', ['ccb_scout', 'ccb_assault']],
    ['ccb_battalion', ['ccb_wise']], ['ccb_battalion', ['ccb_scout', 'ccb_scout']],
    ['unknown', ['ccb_assault']], ['__proto__', ['ccb_assault']]]) {
    assert.throws(() => v2.choose(army, bf, 'clone-traits', group, choices));
    assert.deepEqual(army, snapshot);
  }
  const invalid = structuredClone(army);
  invalid.battleForceSelection.groups.ccb_battalion = ['ccb_scout', 'ccb_assault'];
  const state = v2.selectionState(invalid, bf);
  assert(state.issues.some(i => i.code === 'battle_force_selection_max'));
  assert(!state.activeRuleGroupIds.includes('ccb_scout'));
  invalid.battleForceSelection.battleForceId = 29;
  assert.deepEqual(v2.selectionState(invalid, bf).activeRuleGroupIds, []);
});

test('stable rule IDs survive renaming while deleted references remain visible as diagnostics', () => {
  const bf = force(), army = chosen();
  bf.v2.ruleGroups[0].name.zh = '修改显示名称';
  assert.deepEqual(v2.selectionState(army, bf).issues, []);
  const old = army.battleForceSelection.groups.ccb_battalion[0];
  bf.v2.ruleGroups = bf.v2.ruleGroups.filter(g => g.id !== old);
  bf.v2.selectionSchemes[0].groups[0].ruleGroupIds = bf.v2.selectionSchemes[0].groups[0].ruleGroupIds.filter(id => id !== old);
  assert(v2.selectionState(army, bf).issues.some(i => i.code === 'battle_force_selection'));
  assert.equal(army.battleForceSelection.groups.ccb_battalion[0], old);
});

test('local save, copy and native JSON retain rule choices and two BARC instance ranks independently', () => {
  const army = chosen(), bf = force(), fixture = scoped(bf);
  army.units = [1, 4].map((rankId, i) => ({instanceId: 'barc-' + i, unitId: 'republic-barc', rankId,
    upgrades: [{instanceId: 'gear-' + i, upgradeId: 'gear-binoculars', slotIndex: i}]}));
  const normalized = BuilderLibrary.normalize(army);
  const store = new Map(), storage = {getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v)};
  const record = {id: 'list', name: 'V2 草稿', factionId: 4, army: normalized};
  BuilderLibrary.writeRecord(storage, record);
  assert.deepEqual(BuilderLibrary.read(storage).records[0].army, normalized);
  let serial = 0; const uid = () => 'new-' + ++serial;
  const copy = BuilderLibrary.copy(record, uid, '2026-11-20');
  assert.deepEqual(copy.army.battleForceSelection, army.battleForceSelection);
  assert.deepEqual(copy.army.units.map(u => u.rankId), [1, 4]);
  assert.notEqual(copy.army.units[0].instanceId, army.units[0].instanceId);
  const imported = BuilderTransfer.readNative(JSON.parse(JSON.stringify(record)), fixture, uid, '2026-11-20');
  assert.deepEqual(imported.record.army, normalized);
  assert.equal(BuilderModel.groups(imported.record.army, fixture).length, 2);
  const tts = BuilderTransfer.exportTTS(record, fixture);
  assert(tts.warnings.some(message => message.includes('规则组选择及单位所选军阶')));
  assert(!('battleForceSelection' in tts.json));
  assert(tts.json.units.every(u => !('rankId' in u)));
});

test('switching armies clears units and V2 selection, leaving original records untouched', () => {
  const army = chosen();
  army.units.push({unitId: 'republic-barc', instanceId: 'one', rankId: 1, upgrades: []});
  army.options = ['legacy-option'];
  assert.deepEqual(BuilderLibrary.switchBattleForce(army, 28), army);
  const switched = BuilderLibrary.switchBattleForce(army, 4);
  assert.equal(switched.armyId, 4);
  assert(!('battleForceSelection' in switched));
  assert.deepEqual(switched.units, []);
  assert.deepEqual(switched.options, ['legacy-option']);
  assert(army.battleForceSelection);
  assert.equal(army.units[0].rankId, 1);
});

test('unsupported versions and unflagged V2 data cannot silently run legacy rules', () => {
  for (const version of [1, 3, '2', null, false]) {
    const bf = {...force(), engineVersion: version}, fixture = scoped(bf);
    assert(v2.validatePackage(fixture.pkg).length);
    assert(RulesCore.validateArmy(blank(), fixture).issues.some(i => i.code === 'battle_force_version'));
    assert(!BuilderLibrary.battleforces(4, fixture).some(f => f.id === 28));
  }
  const bf = force(); delete bf.engineVersion;
  assert(v2.validatePackage(scoped(bf).pkg).length);
  assert.equal(RulesCore.validateArmy(blank(), scoped(bf)).status, 'invalid');
});

test('V2 drafts never enter legacy rank, slot or equipment logic and remain visibly unfinished', () => {
  const fixture = scoped(force()), army = chosen(), unit = data.units['republic-barc'];
  army.units.push({unitId: unit.id, instanceId: 'one', rankId: 1, upgrades: []});
  const report = RulesCore.validateArmy(army, fixture);
  assert.equal(report.status, 'unknown');
  assert.equal(report.basePoints, unit.points);
  assert(report.issues.some(i => i.code === 'battle_force_draft'));
  assert(!report.issues.some(i => i.code === 'army_membership'));
  assert.equal(RulesCore.armyRank(unit, 28, fixture.pkg, fixture.defs, fixture.units), null);
  assert.deepEqual(RulesCore.slotListFor(fixture.pkg, unit, army.units[0], fixture.upgrades, 28), []);
  assert.equal(RulesCore.runtimeAvailable(unit, army, fixture.pkg), false);
  assert.equal(RulesCore.upgradeEligibility(data.upgrades['gear-binoculars'], unit, army, fixture).ok, false);
  assert.equal(BuilderModel.addUnit(army, fixture, unit.id, () => 'new').ok, false);
  const modified = {...data.upgrades['gear-binoculars'], rules: {modifiedPointsWith: [
    {property: 'units', id: unit.upstream.id, modifier: -10}]}};
  assert.equal(RulesCore.upgradePoints(modified, unit, army, fixture), modified.points);
});

test('legacy reports, ranks and quotas are identical with V2 attached or removed', () => {
  const armyIds = [1, 2, 4, 5, 7, 12, 17, 21, 22, 26].filter(id=>data.pkg.battleForces[id]?.engineVersion!==2);
  const armies = armyIds.map(armyId => ({...blank(), armyId, options: armyId === 26 ? ['veterans', 'toolsOfTrade'] : []}));
  const before = armies.map(a => RulesCore.validateArmy(a, data));
  delete global.BattleForceV2;
  try {
    assert.deepEqual(armies.map(a => RulesCore.validateArmy(a, data)), before);
    assert.equal(RulesCore.validateArmy(chosen(), scoped(force())).status, 'invalid');
  } finally {global.BattleForceV2 = v2;}
  const explicit = structuredClone(data);
  for (const bf of Object.values(explicit.pkg.battleForces)) if (!bf.v2) bf.engineVersion = 1;
  assert.deepEqual(armies.map(a => RulesCore.validateArmy(a, explicit)), before);
});

test('Node bridge executes the identical browser validation without separate rule definitions', () => {
  const army = chosen(), fixture = scoped(force());
  const result = spawnSync(process.execPath, [path.join(root, 'tools/battleforce-node.cjs')], {
    input: JSON.stringify({action: 'validateArmy', army, data: fixture}), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).result, RulesCore.validateArmy(army, fixture));
});
