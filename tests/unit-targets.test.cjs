const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
global.window = global;
require('../upgrade-faces.js');
require('../rules-core.js');
require('../builder-model.js');
require('../editor-options.js');
const root = path.resolve(__dirname, '..');
const read = n => JSON.parse(fs.readFileSync(path.join(root, 'data', n + '.json'), 'utf8'));
const data = {units: Object.fromEntries(read('units').units.map(u => [u.id,u])),
  upgrades: Object.fromEntries(read('upgrades').cards.map(u => [u.id,u])),
  defs: read('catalog-definitions'), pkg: read('slot-rules')};
data.nameIndex = RulesCore.buildNameIndex(data.upgrades, data.defs);
const ref = (kind,id) => ({kind,id});
const kw = (...refs) => ({id:'entourage',parameter:'Display text deliberately differs',parameterRefs:refs});
const instance = (id,i) => ({unitId:id,instanceId:'i'+i,upgrades:[]});
const roster = ids => ({armyId:1,mode:'standard',pointsLimit:1000,commandIds:[],options:[],units:ids.map(instance)});

test('the complete catalog has coherent broad types, subtypes and stable shared identities', () => {
  for (const u of Object.values(data.units)) {
    assert(['trooper','vehicle'].includes(u.unitCategoryId),u.id);
    assert.match(u.nameIdentityId,/^[a-z0-9][a-z0-9_-]*$/);
    const sub = data.defs.unitSubtypes.find(s => s.id === u.unitSubtypeId);
    if (sub) {
      assert.equal(sub.categoryId,u.unitCategoryId,u.id);
      assert.equal(sub.legacyTypeId,u.unitTypeId,u.id);
    } else {assert.equal(u.unitSubtypeId,null);assert.equal(u.unitTypeId,1);}
  }
  for (const [a,b] of [['separatists-magna','separatists-magnaguard-prototype'],
    ['empire-stormtroopers','empire-stormtroopers-hwu']]) {
    const one = data.units[a],two = data.units[b];
    assert.equal(one.nameIdentityId,two.nameIdentityId);
    assert(RulesCore.matchesKeywordTarget(two,['nameIdentity',one.nameIdentityId]));
    assert(!RulesCore.matchesKeywordTarget(two,['unit',one.id]));
  }
  assert.notEqual(data.units['mercenary-rogue-han-and-chewie'].nameIdentityId,data.units['rebels-solo'].nameIdentityId);
});

test('every new target kind and legacy type reference match independently of display text', () => {
  const u = data.units['separatists-magna'];
  for (const [kind,id] of [['unit',u.id],['unitCategory','trooper'],['unitSubtype','droid_trooper'],['nameIdentity',u.nameIdentityId],['unitType',6]]) {
    assert(RulesCore.matchesKeywordTarget(u,RulesCore.keywordTargets(kw(ref(kind,id)),data.units)[0]));
  }
  assert(!RulesCore.matchesKeywordTarget(u,['unitType','6']));
  assert(!RulesCore.matchesKeywordTarget(u,['unitCategory','vehicle']));
  assert.deepEqual(RulesCore.keywordTargets({parameterRef:ref('unitType',6)},data.units),[['unitType',6]]);
  const options = EditorOptions.create(data.defs,Object.values(data.units),Object.values(data.upgrades),data.pkg,read('rule-fields'));
  for (const field of ['unit.unitCategoryId','unit.unitSubtypeId','unit.nameIdentityId']) assert(options.condition(field).length);
  const k = kw(ref('unit',u.id));EditorOptions.setKeywordParameter(k,'自由填写');assert(!k.parameterRefs);
});

test('OR alternatives share one entourage entitlement and do not exempt the source itself', () => {
  const units = {source:{id:'source',unitCategoryId:'trooper',keywords:[kw(ref('unitCategory','trooper'),ref('unit','a'))]},
    a:{id:'a',unitCategoryId:'trooper'},b:{id:'b',unitCategoryId:'trooper'}};
  assert.deepEqual(RulesCore.entourageExemptions(roster(['source']).units,units),{});
  assert.deepEqual(RulesCore.entourageExemptions(roster(['source','a','b']).units,units),{a:1});
});

test('overlapping entourage choices find a complete assignment and keep local identities distinct', () => {
  const units = {wide:{id:'wide',keywords:[kw(ref('unit','a'),ref('unit','b'))]},
    narrow:{id:'narrow',keywords:[kw(ref('unit','a'))]},a:{id:'a',upstream:{id:7}},b:{id:'b',upstream:{id:7}}};
  assert.deepEqual(RulesCore.entourageExemptions(roster(['wide','narrow','a','b']).units,units),{a:1,b:1});
});

test('detachment OR counts a matching parent once and supersedes duplicated legacy limits', () => {
  const fixture = structuredClone(data), child = fixture.units['rebels-mark-2-blaster'];
  child.rules.quantityLimitedBy = [{unit: fixture.units['rebels-rebel-veterans'].upstream.id, ratio:1}];
  child.keywords = [{...kw(ref('nameIdentity','rebel-troopers'),ref('unitCategory','vehicle'),ref('unit','rebels-rebel-troopers')),id:'detachment'}];
  const army = roster(['rebels-rebel-troopers']);
  assert.deepEqual(RulesCore.detachmentLimits(child,army.units,fixture.units),{caps:[1],unresolved:false});
  const added = BuilderModel.addUnit(army,fixture,child.id,()=> 'child');
  assert.equal(added.ok,true,added.reason);
  assert.equal(BuilderModel.addUnit(added.draft,fixture,child.id,()=> 'child2').ok,false);
  const orphan = roster([child.id]);
  assert(RulesCore.validateArmy(orphan,fixture).issues.some(i=>i.code==='quantity_limited'));
  assert(!RulesCore.validateArmy(added.draft,fixture).issues.some(i=>i.code==='quantity_limited'));
  assert.deepEqual(RulesCore.detachmentLimits(child,roster([child.id]).units,fixture.units).caps,[0]);
  child.keywords=[];
  assert.deepEqual(RulesCore.detachmentLimits(child,army.units,fixture.units).caps,[0]);
  assert.deepEqual(RulesCore.detachmentLimits(child,roster(['rebels-rebel-veterans']).units,fixture.units).caps,[1]);
});

test('Python and browser agree on every catalog target plus OR allocation and detachment', () => {
  const scenarios = [];
  for (const unit of Object.values(data.units)) {
    if (!(unit.keywords||[]).some(k=>['entourage','detachment'].includes(k.id))) continue;
    scenarios.push({units:data.units,child:unit.id,army:roster([unit.id,...Object.keys(data.units)])});
  }
  const units={a:{id:'a',unitCategoryId:'trooper',unitSubtypeId:'droid_trooper',nameIdentityId:'a'},
    b:{id:'b',unitCategoryId:'vehicle'},wide:{id:'wide',keywords:[kw(ref('unit','a'),ref('unit','b'))]},
    narrow:{id:'narrow',keywords:[kw(ref('unit','a'))]},child:{id:'child',keywords:[{id:'detachment',parameterRefs:[ref('unitCategory','trooper'),ref('unit','a')]}]}};
  scenarios.push({units,child:'child',army:roster(['a','b','wide','narrow','child'])});
  const expected=scenarios.map(s=>({exempt:RulesCore.entourageExemptions(s.army.units,s.units),limits:RulesCore.detachmentLimits(s.units[s.child],s.army.units,s.units)}));
  const result=spawnSync('python',['-c',`import json,sys,rules
s=json.load(sys.stdin)
print(json.dumps([dict(exempt=rules.entourage_exemptions(x['army']['units'],x['units']),limits=rules.detachment_limits(x['units'][x['child']],x['army']['units'],x['units'])) for x in s]))`],{cwd:root,input:JSON.stringify(scenarios),encoding:'utf8',maxBuffer:12e6});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),expected);
});

test('rank detachment uses the current army rank and a probe never enables another copy of itself', () => {
  const probe = data.units['empire-imperial-probe-droid'];
  const fixture = structuredClone(data);
  const army = {...roster(['empire-scout']),armyId:2};
  const context = {...fixture,armyId:2};
  assert.deepEqual(RulesCore.detachmentLimits(probe,army.units,fixture.units,context).caps,[1]);
  const added=BuilderModel.addUnit(army,fixture,probe.id,()=> 'probe');assert(added.ok,added.reason);
  assert.equal(BuilderModel.addUnit(added.draft,fixture,probe.id,()=> 'probe2').ok,false);
  fixture.units['empire-scout'].factions.find(f=>f.id===2).rankId=2;
  assert.deepEqual(RulesCore.detachmentLimits(probe,army.units,fixture.units,context).caps,[0]);
  assert(RulesCore.validateArmy(added.draft,fixture).issues.some(i=>i.code==='quantity_limited'));
});
