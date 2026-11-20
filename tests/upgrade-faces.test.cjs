const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = global;
require('../upgrade-faces.js');require('../dice-enums.js');require('../rules-core.js');
require('../builder-model.js');require('../builder-library.js');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
const cards=read('upgrades').cards;
const data={units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:UpgradeFaces.index(cards),defs:read('catalog-definitions'),pkg:read('slot-rules')};
data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
let seq=0;const uid=()=>`face-test-${++seq}`;
const roster=()=>({armyId:2,mode:'standard',pointsLimit:1000,commandIds:[],options:[],units:[{unitId:'empire-death-troopers',instanceId:'u',upgrades:[]}]});
const context=army=>{const inst=army.units[0];const slots=RulesCore.slotListFor(data.pkg,data.units[inst.unitId],inst,data.upgrades,army.armyId);const i=slots.findIndex(s=>RulesCore.accessKeys(data.upgrades['e-11d-focused-fire'],data.pkg,{}).includes(s.key));return{unitInstanceId:'u',groupIds:army.units.map(i=>i.instanceId),slotIndex:i,slotKey:slots[i].key}};

test('eight current physical cards expose two independent faces with one identity/cost',()=>{
 const before=JSON.stringify(cards),duals=cards.filter(UpgradeFaces.isDual);
 assert.equal(duals.length,8);
 for(const card of duals){
  const [front,back]=UpgradeFaces.variants(card);
  assert.equal(front.id,back.id);assert.equal(front.points,back.points);
  assert.equal(back.rules,front.rules);assert.equal(back.keywords,card.back.keywords);
  assert.notEqual(front.assets.front,back.assets.front);
  assert(!cards.some(c=>c.id===card.back.legacyId));
  assert.equal(data.upgrades[card.back.legacyId].id,card.id);
 }
 const stance=data.upgrades['training-stance-b'];
 assert.equal(stance.name.en,'Offensive Stance');assert.equal(stance.back.name.en,'Defensive Stance');
 assert.equal(stance.back.legacyId,'training-stance-a');
 assert.equal(Object.values(data.upgrades).length,cards.length);
 assert.equal(JSON.stringify(cards),before);
});

test('equipping either face occupies one slot, retains cost/constraints, copies and exports current orientation',()=>{
 const army=roster();assert(data.units[army.units[0].unitId]);
 const ctx=context(army);assert(ctx.slotIndex>=0);
 const selected=BuilderModel.equip(army,data,ctx,'e-11d-focused-fire',false,uid,'back');
 assert(selected.ok,selected.reason);assert.equal(army.units[0].upgrades.length,0);
 const ch=selected.draft.units[0].upgrades[0];assert.equal(ch.face,'back');assert.equal(ch.upgradeId,'e-11d-focused-fire');
 const before=RulesCore.validateArmy(selected.draft,data);
 ch.face='front';const after=RulesCore.validateArmy(selected.draft,data);
 assert.equal(before.basePoints,after.basePoints);assert.deepEqual(before.issues,after.issues);
 ch.face='back';const copied=BuilderModel.duplicate(selected.draft,data,'u',uid);assert(copied.ok,copied.reason);
 assert.equal(copied.draft.units[1].upgrades[0].face,'back');assert.notEqual(copied.draft.units[1].upgrades[0].instanceId,ch.instanceId);
 assert.equal(BuilderModel.groups(copied.draft,data).length,1);
 copied.draft.units[1].upgrades[0].face='front';assert.equal(BuilderModel.groups(copied.draft,data).length,2);
 assert.equal(BuilderLibrary.normalize(JSON.parse(JSON.stringify(selected.draft))).units[0].upgrades[0].face,'back');
});

test('action types belong to the printed face, including an unknown legacy back',()=>{
 const card=structuredClone(data.upgrades['e-11d-focused-fire']);
 card.actionTypes=['action'];card.back.actionTypes=['free-exhaust'];
 const [front,back]=UpgradeFaces.variants(card);
 assert.deepEqual(front.actionTypes,['action']);assert.deepEqual(back.actionTypes,['free-exhaust']);
 assert.deepEqual(UpgradeFaces.view(back,'front').actionTypes,['action']);
 assert.deepEqual(UpgradeFaces.index([card])[card.back.legacyId].actionTypes,['free-exhaust']);
 delete card.back.actionTypes;
 assert.equal(UpgradeFaces.view(card,'back').actionTypes,undefined);
});

test('both mode exposes each printed weapon and keyword without losing instance identity',()=>{
 for(const c of cards.filter(UpgradeFaces.isDual)){
  const card={...UpgradeFaces.view(c,'both'),_unitId:'host',_choiceId:'choice'};
  const [front,back]=UpgradeFaces.visible(card);
  assert.equal(front._choiceId,'choice');assert.equal(back._unitId,'host');
  assert.equal(front.weapons,c.weapons);assert.equal(back.weapons,c.back.weapons);
  assert.equal(front.keywords,c.keywords);assert.equal(back.keywords,c.back.keywords);
  if(c.id==='training-stance-b') {
   assert.deepEqual(front.weapons,[]);assert.deepEqual(back.weapons,[]);
  } else {assert(front.weapons.length>0,c.id);assert(back.weapons.length>0,c.id);}
  assert.equal(UpgradeFaces.visible(UpgradeFaces.view(card,'back')).length,1);
 }
});

test('both mode still occupies one slot and survives save, copy, import and normalization',()=>{
 const army=roster();const selected=BuilderModel.equip(army,data,context(army),'e-11d-focused-fire',false,uid,'both');
 assert(selected.ok,selected.reason);
 const inst=selected.draft.units[0];assert.equal(inst.upgrades.length,1);assert.equal(inst.upgrades[0].face,'both');
 const report=RulesCore.validateArmy(selected.draft,data);
 const restored=UpgradeFaces.normalizeArmy(BuilderLibrary.normalize(JSON.parse(JSON.stringify(selected.draft))),data);
 assert.equal(restored.units[0].upgrades[0].face,'both');
 restored.units[0].upgrades[0].face='front';
 assert.deepEqual(RulesCore.validateArmy(restored,data),report);
 const copy=BuilderModel.duplicate(selected.draft,data,'u',uid);assert(copy.ok,copy.reason);
 assert.equal(copy.draft.units[1].upgrades[0].face,'both');assert.equal(BuilderModel.groups(copy.draft,data).length,1);
 copy.draft.units[0].upgrades[0].face='back';assert.equal(BuilderModel.groups(copy.draft,data).length,2);
});

test('batch equipment applies the selected face atomically and a second slot cannot equip its other face',()=>{
 const army=roster();army.units.push({...structuredClone(army.units[0]),instanceId:'u2'});
 const result=BuilderModel.equip(army,data,context(army),'e-11d-focused-fire',true,uid,'back');
 assert(result.ok,result.reason);assert(result.draft.units.every(i=>i.upgrades.length===1&&i.upgrades[0].face==='back'));
 const fixture=structuredClone(data);fixture.upgrades['e-11d-focused-fire'].slotIds.push(2);
 fixture.upgrades['e-11d-focused-fire'].rules.slotTypes.push(2);
 const inst=result.draft.units[0];const slots=RulesCore.slotListFor(fixture.pkg,fixture.units[inst.unitId],inst,fixture.upgrades,2);
 const gear=slots.findIndex(s=>s.key==='gear');assert(gear>=0);
 const duplicate=BuilderModel.equip(result.draft,fixture,{unitInstanceId:'u',groupIds:['u'],slotIndex:gear,slotKey:'gear'},'e-11d-focused-fire',false,uid,'front');
 assert(!duplicate.ok);assert.match(duplicate.reason,/同名|重复/);
});

test('old back IDs migrate without data loss; DC-17m gets a free Configuration slot and unknown references survive',()=>{
 const army={units:[{unitId:'republic-clone-commandos',instanceId:'u',upgrades:[{upgradeId:'commandos-sniper-b',instanceId:'old',slotIndex:2},{upgradeId:'unknown',instanceId:'x',slotIndex:8}]}]};
 UpgradeFaces.normalizeArmy(army,data);
 const ch=army.units[0].upgrades[0];assert.equal(ch.instanceId,'old');assert.equal(ch.upgradeId,'commandos-sniper-a');assert.equal(ch.face,'back');assert.equal(ch.slotIndex,3);
 assert.equal(army.units[0].upgrades[1].upgradeId,'unknown');
 const again=JSON.stringify(army);UpgradeFaces.normalizeArmy(army,data);assert.equal(JSON.stringify(army),again);
});

test('stance faces share one training slot and cost; saved Defensive Stance migrates without losing its slot or identity',()=>{
 const card=data.upgrades['training-stance-b'],army={armyId:4,mode:'standard',pointsLimit:1000,commandIds:[],options:[],
  units:[{unitId:'republic-anakin',instanceId:'anakin',upgrades:[]}]};
 const slots=RulesCore.slotListFor(data.pkg,data.units['republic-anakin'],army.units[0],data.upgrades,4);
 const training=slots.map((s,i)=>s.key==='training'?i:-1).filter(i=>i>=0);assert.equal(training.length,2);
 const ctx={unitInstanceId:'anakin',slotIndex:training[0],slotKey:'training'};
 const baseline=RulesCore.validateArmy(army,data).effectivePoints;
 for(const face of ['front','back','both']) {
  const selected=BuilderModel.equip(army,data,ctx,card.id,false,uid,face);assert(selected.ok,selected.reason);
  assert.equal(selected.draft.units[0].upgrades.length,1);
  assert.equal(selected.draft.units[0].upgrades[0].face,face);
  assert.equal(RulesCore.validateArmy(selected.draft,data).effectivePoints,baseline+5);
  assert(!BuilderModel.equip(selected.draft,data,{...ctx,slotIndex:training[1]},card.id,false,uid,'back').ok);
 }
 const old=structuredClone(army);old.units[0].upgrades=[{upgradeId:'training-stance-a',instanceId:'saved-defense',slotIndex:training[1]}];
 UpgradeFaces.normalizeArmy(old,data);
 assert.deepEqual(old.units[0].upgrades,[{upgradeId:card.id,instanceId:'saved-defense',slotIndex:training[1],face:'back'}]);
 assert.equal(RulesCore.validateArmy(old,data).effectivePoints,baseline+5);
 assert(UpgradeFaces.view(card,'front').description.zh.join('').includes('获得2个瞄准'));
 assert(UpgradeFaces.view(card,'back').description.zh.join('').includes('获得2个闪避'));
});
