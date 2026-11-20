const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
global.window = global;
for (const file of ['dice-enums','upgrade-faces','battleforce-v2','battleforce-runtime','rules-core',
  'mandalorian-rules','builder-model','builder-library','builder-transfer']) require('../'+file+'.js');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname,'../data',f+'.json'),'utf8'));
const data = {pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),deckData:read('battle-deck'),
  units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:UpgradeFaces.index(read('upgrades').cards)};
RulesCore.prepareData(data);
data.nameIndex = RulesCore.buildNameIndex(data.upgrades,data.defs);
let serial=0;
const uid=()=> 'test-'+ ++serial;
const blank=(armyId=28)=>({armyId,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]});
const choose=(army,group,choice,input=data)=>BattleForceV2.choose(army,input.pkg.battleForces[28],'clone-traits',group,choice?[choice]:[]);
function selected(veteran='ccb_reinforced',jedi='ccb_decisive',battalion='ccb_assault') {
  let army=blank();
  for(const [group,choice] of [['ccb_battalion',battalion],['ccb_jedi',jedi],['ccb_veteran',veteran]]) army=choose(army,group,choice);
  return army;
}
function add(army,id,rank,input=data) {
  const result=BuilderModel.addUnit(army,input,id,uid,rank);
  assert(result.ok,result.reason);return result.draft;
}
function slots(army,inst=army.units.at(-1),input=data) {
  const d=BattleForceRuntime.resolve(army,input);
  return RulesCore.slotListFor(d.pkg,RulesCore.unitFor(inst,army,d),inst,d.upgrades,army.armyId);
}
function equip(army,inst,id,key,ordinal=0,input=data) {
  const list=slots(army,inst,input),index=list.map((s,i)=>s.key===key?i:-1).filter(i=>i>=0)[ordinal];
  const result=BuilderModel.equip(army,input,{unitInstanceId:inst.instanceId,slotIndex:index,slotKey:key},id,false,uid);
  assert(result.ok,result.reason);return result.draft;
}
const keyword=(unit,id)=>unit.keywords?.find(k=>k.id===id);

test('V2 local upgrade exclusions work without source numbers in picker and final validation',()=>{
  const fixture=structuredClone(data);
  const first={id:'local-exclusion-one',name:{en:'Local A',zh:'本地甲'},points:0,slotIds:[1],rules:{},weapons:[]};
  const second={...structuredClone(first),id:'local-exclusion-two',name:{en:'Local B',zh:'本地乙'}};
  fixture.upgrades[first.id]=first;fixture.upgrades[second.id]=second;
  fixture.pkg.battleForces[28].v2.common.modifiers.push({id:'local-exclusion-test',card:'upgrade',upgradeId:first.id,
    field:'rules.unavailableWithIds',op:'set',value:[second.id]});
  const army=selected();army.units=[{instanceId:'host',unitId:'republic-clone-trooper',upgrades:[
    {instanceId:'a',upgradeId:first.id,slotIndex:0},{instanceId:'b',upgradeId:second.id,slotIndex:1}]}];
  const d=RulesCore.resolveArmyData(army,fixture),blocked=RulesCore.validateArmy(army,fixture);
  assert(blocked.issues.some(i=>i.code==='upgrade_conflict'));
  assert(RulesCore.unavailableSets(d.upgrades[first.id],d.nameIndex,d.defs).up.has(second.id));
  assert.deepEqual(fixture.upgrades[first.id].rules,{});
  const roster=selected();roster.units=[{instanceId:'one',unitId:'republic-clone-trooper',upgrades:[]},
    {instanceId:'two',unitId:'republic-clone-trooper',upgrades:[]}];
  const index=slots(roster,roster.units[0],fixture).findIndex(s=>s.key==='personnel');
  roster.units[0].upgrades=[{instanceId:'a',upgradeId:first.id,slotIndex:index}];
  const denied=BuilderModel.equip(roster,fixture,{unitInstanceId:'two',slotIndex:index,slotKey:'personnel'},second.id,false,uid);
  assert.equal(denied.ok,false);assert.match(denied.reason,/互斥/);
});

test('live definitions validate; selection grants are unioned and revoked without changing catalogs',()=>{
  assert.deepEqual(BattleForceV2.validatePackage(data.pkg),[]);
  const before=JSON.stringify(data),army=selected('ccb_superior_arc_training');
  const derived=BattleForceRuntime.resolve(army,data);
  assert(derived.units['republic-arc-troopers']._v2Allowed);
  const changed=choose(army,'ccb_battalion','ccb_scout');
  assert(BattleForceRuntime.resolve(changed,derived).units['republic-arc-troopers']._v2Allowed);
  const revoked=choose(changed,'ccb_veteran','ccb_reinforced');
  assert(!BattleForceRuntime.resolve(revoked,derived).units['republic-arc-troopers']._v2Allowed);
  assert(BattleForceRuntime.resolve(revoked,derived).units['republic-laat-gar']._v2Allowed);
  assert.strictEqual(BattleForceRuntime.resolve(army,data),derived);
  assert.strictEqual(BattleForceRuntime.resolve({...army,armyId:4},derived),data);
  assert.equal(JSON.stringify(data),before);
});

test('BARC chosen ranks count separately, never merge, and survive copy and native roundtrip',()=>{
  let army=add(selected(),'republic-barc',1);
  army=add(army,'republic-barc',4);
  assert.deepEqual(RulesCore.validateArmy(army,data).rankCounts,{1:1,4:1});
  assert.deepEqual(BuilderModel.groups(army,data).map(g=>g.unit.rankId),[1,4]);
  const copy=BuilderModel.duplicate(army,data,army.units[0].instanceId,uid);
  assert(copy.ok,copy.reason);
  assert.equal(copy.draft.units.at(-1).rankId,1);
  const record={id:'example',name:'example',factionId:4,army:copy.draft};
  const imported=BuilderTransfer.readNative(JSON.parse(JSON.stringify(record)),data,uid,'2026-11-20');
  assert.deepEqual(imported.record.army.units.map(i=>i.rankId),[1,4,1]);
  assert.deepEqual(RulesCore.validateArmy(imported.record.army,data).rankCounts,{1:2,4:1});
  assert(!BuilderModel.addUnit(army,data,'republic-barc',uid,2).ok);
});

test('general exactly one, reinforced rank caps and ordinary rank limits are enforced',()=>{
  let army=selected();
  assert(RulesCore.validateArmy(army,data).issues.some(i=>i.code==='battle_force_unit_min'));
  army=add(army,'republic-jedi-knight-general',1);
  assert(!RulesCore.validateArmy(army,data).issues.some(i=>i.code==='battle_force_unit_min'));
  assert(!BuilderModel.addUnit(army,data,'republic-jedi-knight-general',uid,1).ok);
  army=add(add(army,'republic-barc',1),'republic-barc',1);
  assert(!BuilderModel.addUnit(army,data,'republic-barc',uid,1).ok);
  const changed=choose(army,'ccb_veteran','ccb_forward_observers');
  assert(RulesCore.validateArmy(changed,data).issues.some(i=>i.code==='rank_max'&&i.rank===1));
});

test('revoking reinforced removes its occupied slot and preserves an ordinary personnel slot',()=>{
  let army=add(selected(),'republic-clone-trooper',2);
  army=equip(army,army.units[0],'clone-miniature','personnel',0);
  army=equip(army,army.units[0],'clone-specialist','personnel',1);
  const changed=choose(army,'ccb_veteran','ccb_armored_support');
  const result=BattleForceRuntime.reconfigure(army,changed,data);
  assert.equal(result.removed.length,1);
  assert.deepEqual(result.draft.units[0].upgrades.map(c=>c.upgradeId),['clone-miniature']);
  assert.equal(slots(result.draft).filter(s=>s.key==='personnel').length,1);
  assert(!RulesCore.validateArmy(result.draft,data).issues.some(i=>i.code.startsWith('slot_')));
});

test('slot removal recursively removes equipment-granted slots, without relocating their contents',()=>{
  const fixture=structuredClone(data);
  const parent=fixture.upgrades['clone-specialist'];
  parent.slotGrant={trigger:'equipped',slots:['gear']};
  let army=add(selected(),'republic-clone-trooper',2,fixture);
  army=equip(army,army.units[0],parent.id,'personnel',1,fixture);
  // Discover the grant rather than assuming its index or display order.
  const list=slots(army,army.units[0],fixture),index=list.findIndex(s=>s.addedBy===parent.id);
  assert(index>=0,'test fixture must create an equipment-granted slot');
  const result=BuilderModel.equip(army,fixture,{unitInstanceId:army.units[0].instanceId,
    slotIndex:index,slotKey:list[index].key},'gear-binoculars',false,uid);
  assert(result.ok,result.reason);army=result.draft;
  const next=BattleForceRuntime.reconfigure(army,choose(army,'ccb_veteran','ccb_armored_support',fixture),fixture);
  assert.equal(next.removed.length,2);
  assert.equal(next.draft.units[0].upgrades.length,0);
});

test('decisive affects both printed faces of upgrade weapons once, preserving parameters and ranged weapons',()=>{
  const army=selected(),d=BattleForceRuntime.resolve(army,data),host=d.units['republic-jedi-knight-general'];
  assert(keyword(host,'makashi_mastery'));
  const card=structuredClone(d.upgrades.lightsaber);
  card.dualSided=true;
  card.back={name:{zh:'反面'},weapons:[{range:{min:0,max:0},keywords:[{id:'lethal',value:1},{id:'pierce',value:1}]}]};
  card.weapons.push({range:{min:1,max:2},keywords:[]});
  const effective=BattleForceRuntime.upgradeFor(UpgradeFaces.view(card,'both'),host,d);
  assert.equal(effective._face,'both');
  assert.equal(keyword(effective.weapons[0],'lethal').value,1);
  assert(!keyword(effective.weapons[1],'lethal'));
  assert(!keyword(effective.back.weapons[0],'lethal'));
  assert.equal(keyword(effective.back.weapons[0],'pierce').value,2);
  assert.strictEqual(BattleForceRuntime.upgradeFor(effective,host,d),effective);
  assert(!keyword(card.weapons[0],'lethal'));
  const back=BattleForceRuntime.upgradeFor(UpgradeFaces.view(card,'back'),host,d);
  assert.equal(keyword(back.weapons[0],'pierce').value,2);
  assert.equal(keyword(BattleForceRuntime.upgradeFor(d.upgrades.lightsaber,host,d).weapons[0],'lethal').value,1);
});

test('wise target parameters, additive scout values and personnel-dependent mechanized infantry',()=>{
  let army=selected('ccb_forward_observers','ccb_wise');
  let d=BattleForceRuntime.resolve(army,data);
  assert.deepEqual(keyword(d.units['republic-jedi-knight-general'],'aid').parameterRefs,[{kind:'unitSubtype',id:'clone_trooper'}]);
  assert.equal(keyword(d.units['republic-arf-troopers'],'scout').value,keyword(data.units['republic-arf-troopers'],'scout').value+1);
  const entry=d.units['republic-jedi-knight-general'].keywords.find(k=>k._entry?.id==='ccb_wise-rule');
  assert(entry._entry.summary&&entry._entry.full);
  army=add(selected('ccb_armored_support'),'republic-clone-trooper',2);
  assert(!keyword(RulesCore.unitFor(army.units[0],army,data),'mechanized_infantry'));
  army=equip(army,army.units[0],'clone-miniature','personnel');
  assert(keyword(RulesCore.unitFor(army.units[0],army,data),'mechanized_infantry'));
  BuilderModel.removeUpgrade(army,data,army.units[0].instanceId,army.units[0].upgrades[0].instanceId);
  assert(!keyword(RulesCore.unitFor(army.units[0],army,data),'mechanized_infantry'));
});

test('local V2 keyword candidates are scoped and target constraints apply to both Jedi variants',()=>{
  const force=data.pkg.battleForces[28], entry=force.v2.ruleGroups.find(g=>g.id==='ccb_decisive').entries[0];
  const localId='bf:28:'+entry.id;
  const army=selected(),d=BattleForceRuntime.resolve(army,data);
  for(const id of ['republic-jedi-knight','republic-jedi-knight-general']) {
    const kw=d.units[id].keywords.find(k=>k.id===localId);
    assert(kw, id+' should receive the temporary keyword');
    assert.equal(kw._entry.name.zh,'果决');
  }
  assert(!BattleForceRuntime.resolve(selected('ccb_forward_observers','ccb_wise'),data).units['republic-jedi-knight'].keywords
    .some(k=>k.id===localId),'inactive rule group must not leak its local keyword');
  const fixture=structuredClone(data), group=fixture.pkg.battleForces[28].v2.ruleGroups.find(g=>g.id==='ccb_decisive');
  group.modifiers.push({id:'decisive-local-keyword',card:'unit',target:{field:'unit.id',op:'in',value:['republic-jedi-knight','republic-jedi-knight-general']},field:'keywords',op:'add',value:{id:localId}});
  assert.deepEqual(BattleForceV2.validatePackage(fixture.pkg),[]);
  const changed=BattleForceRuntime.resolve(selected(),fixture);
  assert(changed.units['republic-jedi-knight'].keywords.some(k=>k.id===localId&&k._entry));
});

test('hand picked exemption targets individual commander instances, including BARC',()=>{
  let army=add(selected('ccb_hand_picked'),'republic-clone-commandos',4);
  army=add(army,'republic-barc',4);
  army=add(add(add(army,'republic-barc',1),'republic-barc',1),'republic-barc',1);
  assert(!RulesCore.validateArmy(army,data).issues.some(i=>i.code==='rank_max'&&i.rank===1));
  assert(!BuilderModel.addUnit(army,data,'republic-barc',uid,1).ok);
});

test('irregulars converts only its selected Imperial vehicles and limits each to one',()=>{
  const d=BattleForceRuntime.resolve(blank(29),data);
  assert.equal(d.units['empire-laat-empire'].factionId,1);
  assert(!d.units['republic-laat-gar']._v2Allowed);
  for(const id of ['empire-laat-empire','empire-tx-225','mercenary-raiders-wlo5-speeder-tank']) {
    const army=add(blank(29),id,5);
    assert(!BuilderModel.addUnit(army,data,id,uid,5).ok,id);
  }
  const army=add(blank(29),'rebels-cassian',6);
  assert(keyword(RulesCore.unitFor(army.units[0],army,data),'field_commander'));
  assert.equal(data.units['empire-laat-empire'].factionId,2);
});

test('irregulars allows multiple saboteurs on legal hosts, keeps host restrictions and unique whitelist',()=>{
  let army=add(add(blank(29),'rebels-rebel-agent-defender-democracy',6),'rebels-rebel-agent-defender-democracy',6);
  for(const inst of army.units) army=equip(army,inst,'unseen-saboteur','doctrine');
  assert.equal(army.units.flatMap(i=>i.upgrades).length,2);
  assert(!RulesCore.validateArmy(army,data).issues.some(i=>/unique|unavailable/.test(i.code)));
  const d=BattleForceRuntime.resolve(army,data);
  assert(!RulesCore.upgradeEligibility(d.upgrades['unseen-saboteur'],d.units['rebels-cassian'],army,d,[]).ok);
  const unauthorized={...d.upgrades['unseen-saboteur'],id:'unlisted',rules:{unique:true}};
  assert(RulesCore.upgradeEligibility(unauthorized,d.units['rebels-rebel-agent-defender-democracy'],army,d,[]).issues.some(i=>i.code==='battle_force_unique_upgrade'));
  assert.equal(data.upgrades['unseen-saboteur'].rules.unique,true);
});

test('irregulars assigns only the global and matching rank summary, using the effective rank',()=>{
  const army=blank(29),d=BattleForceRuntime.resolve(army,data);
  const suffix={2:'corps',3:'special-support',4:'special-support',5:'heavy-flier',6:'operative',7:'heavy-flier'};
  for(const unit of Object.values(d.units).filter(u=>u._v2Allowed)) {
    const local=unit.keywords.filter(k=>k._entry);
    assert.deepEqual(local.map(k=>k._entry.id),['irregulars','undisciplined-'+suffix[unit.rankId]],unit.id);
    assert.deepEqual(local[0]._entry.timing,['global']);
    assert.deepEqual(local[1]._entry.timing,['activation_start']);
    for(const k of local) {
      assert.equal(k._entry.full,'');
      assert.deepEqual(k._battleForceSources,[{id:29,name:'非正规军'}]);
    }
  }
  // No flier cards exist yet. Simulate both a future flier and an alternate-rank instance.
  const fixture=structuredClone(data),common=fixture.pkg.battleForces[29].v2.common;
  common.modifiers.push({id:'future-flier',card:'unit',target:{field:'unit.id',op:'eq',value:'rebels-at-rt-rebel'},field:'rankId',op:'add',value:7});
  army.units=[{unitId:'rebels-at-rt-rebel',instanceId:'flier',rankId:7,upgrades:[]}];
  const unit=RulesCore.unitFor(army.units[0],army,fixture);
  assert(keyword(unit,'bf:29:undisciplined-heavy-flier'));
  assert(!keyword(unit,'bf:29:undisciplined-special-support'));
  assert(!BattleForceRuntime.resolve(blank(1),d).units['rebels-cassian'].keywords.some(k=>k._entry||k._battleForceSources));
});

test('battle force sources survive additive unit and weapon modifiers without touching source cards',()=>{
  const source={id:28,name:'自定义克隆人战斗营'},d=BattleForceRuntime.resolve(selected('ccb_forward_observers','ccb_wise'),data);
  const scout=keyword(d.units['republic-arf-troopers'],'scout');
  assert.deepEqual(scout._battleForceSources,[source]);
  assert.equal(keyword(data.units['republic-arf-troopers'],'scout')._battleForceSources,undefined);
  const decisive=BattleForceRuntime.resolve(selected(),data),host=decisive.units['republic-jedi-knight-general'];
  const weapon=BattleForceRuntime.upgradeFor(decisive.upgrades.lightsaber,host,decisive).weapons[0];
  assert.deepEqual(keyword(weapon,'lethal')._battleForceSources,[source]);
  assert.deepEqual(keyword(host,'bf:28:ccb_decisive-rule')._battleForceSources,[source]);
  assert.deepEqual(keyword(BattleForceRuntime.resolve(blank(29),data).units['rebels-cassian'],'field_commander')._battleForceSources,
    [{id:29,name:'非正规军'}]);
});

test('set then add is deterministic; conflicting replacements report an error and neither wins',()=>{
  const effects=[{field:'points',op:'add',value:4},{field:'points',op:'set',value:10},{field:'points',op:'add',value:6}];
  assert.equal(BattleForceRuntime.apply({points:50},effects,[]).points,20);
  effects.push({field:'points',op:'set',value:30});
  for(const list of [effects,effects.toReversed()]) {
    const issues=[];
    assert.equal(BattleForceRuntime.apply({points:50},list,issues).points,60);
    assert.equal(issues[0].code,'battle_force_modifier_conflict');
  }
  const card={keywords:[{id:'scout',value:1},{id:'aid',parameterRefs:[{kind:'rank',id:1}]}]};
  BattleForceRuntime.apply(card,[{field:'keywords',op:'add',value:{id:'scout',value:2}},
    {field:'keywords',op:'add',value:{id:'aid',parameterRefs:[{kind:'rank',id:2}]}}],[]);
  assert.equal(keyword(card,'scout').value,3);assert.equal(card.keywords.length,3);
});

test('invalid configurations fail safely and do not execute partial effects',()=>{
  const fixture=structuredClone(data);fixture.pkg.battleForces[28].v2.ruleGroups=null;
  const report=RulesCore.validateArmy(blank(),fixture);
  assert.equal(report.status,'invalid');assert(report.issues.some(i=>i.code==='battle_force_config'));
});

test('V2 TTS import matches normal equipment but warns that trait and alternate-rank choices are absent',()=>{
  let army=add(blank(29),'rebels-rebel-agent-defender-democracy',6);
  army=equip(army,army.units[0],'unseen-saboteur','doctrine');
  const exported=BuilderTransfer.exportTTS({name:'Irregulars',army},data);
  assert.deepEqual(exported.issues,[]);
  const imported=BuilderTransfer.importTTS(exported.json,data,uid,'2026-11-20');
  assert.deepEqual(imported.issues,[]);
  assert.equal(imported.record.army.armyId,29);
  assert.equal(imported.record.army.units[0].upgrades[0].upgradeId,'unseen-saboteur');
  army=add(selected(),'republic-jedi-knight-general',1);
  army=equip(army,army.units[0],'lightsaber','armament');
  const cloneExport=BuilderTransfer.exportTTS({name:'Clone',army},data);
  const cloneImport=BuilderTransfer.importTTS(cloneExport.json,data,uid,'2026-11-20');
  assert.deepEqual(cloneImport.issues,[]);
  assert(cloneImport.warnings.some(w=>w.includes('不包含特质选择')));
  assert.equal(cloneImport.record.army.units[0].upgrades[0].upgradeId,'lightsaber');
  assert(RulesCore.validateArmy(cloneImport.record.army,data).issues.some(i=>i.code==='battle_force_selection_min'));
});

test('legacy calculation stays identical when the runtime module is removed',()=>{
  const runtime=global.BattleForceRuntime;
  const armies=[1,4,12,21,22,26].filter(id=>data.pkg.battleForces[id]?.engineVersion!==2)
    .map(armyId=>({...blank(armyId),options:armyId===26?['veterans','toolsOfTrade']:[]}));
  const expected=armies.map(a=>RulesCore.validateArmy(a,data));
  delete global.BattleForceRuntime;
  try {assert.deepEqual(armies.map(a=>RulesCore.validateArmy(a,data)),expected);}
  finally {global.BattleForceRuntime=runtime;}
});

test('Python bridge and browser runtime share effective quotas, choices and points',()=>{
  const army=add(add(selected(),'republic-barc',1),'republic-clone-trooper',2);
  const expected=RulesCore.validateArmy(army,data);
  const call=spawnSync(process.execPath,[path.join(__dirname,'../tools/battleforce-node.cjs')],
    {input:JSON.stringify({action:'validateArmy',army,data}),encoding:'utf8',maxBuffer:20*1024*1024});
  assert.equal(call.status,0,call.stdout||call.stderr);
  assert.deepEqual(JSON.parse(call.stdout).result,expected);
});
