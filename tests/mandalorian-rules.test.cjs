const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
global.window=global;
require('../dice-enums.js');require('../upgrade-faces.js');require('../rules-core.js');
require('../mandalorian-rules.js');require('../builder-model.js');require('../builder-library.js');require('../builder-transfer.js');
const root=path.resolve(__dirname,'..'),read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n+'.json'),'utf8'));
const data={units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:Object.fromEntries(read('upgrades').cards.map(c=>[c.id,c])),
  pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),deckData:read('battle-deck')};
const original=JSON.stringify([data.units,data.upgrades]);RulesCore.prepareData(data);data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
let serial=0;const uid=()=>String(++serial);
const army=(armyId=26,options=[])=>({armyId,options,mode:'standard',pointsLimit:1000,units:[],commandIds:[],slotLayoutVersion:1});
const warrior='mercenary-creedless-mandalorian-warriors-corps',leader='mercenary-creedless-mandalorian-leader',initiate='mercenary-creedless-mandalorian-initiates';
function add(a,id){const result=BuilderModel.addUnit(a,data,id,uid);assert(result.ok,result.reason);return result.draft;}
function equip(a,index,id){const inst=a.units[index],card=data.upgrades[id],u=data.units[inst.unitId],slots=RulesCore.slotListFor(data.pkg,u,inst,data.upgrades,a.armyId);
  const slotIndex=slots.findIndex((s,i)=>RulesCore.accessKeys(card,data.pkg,{}).includes(s.key)&&!inst.upgrades.some(c=>c.slotIndex===i));
  assert(slotIndex>=0,'missing slot for '+id);return BuilderModel.equip(a,data,{unitInstanceId:inst.instanceId,slotIndex,slotKey:slots[slotIndex].key},id,false,uid);}
const codes=a=>RulesCore.validateArmy(a,data).issues.map(i=>i.code);
const parity=[];

test('derived cards preserve all source records and preparation is idempotent',()=>{
  const withoutDerived=o=>Object.fromEntries(Object.entries(o).filter(([,c])=>!c.runtimeVariant));
  assert.equal(JSON.stringify([withoutDerived(data.units),withoutDerived(data.upgrades)]),original);
  const before=JSON.stringify(data);RulesCore.prepareData(data);assert.equal(JSON.stringify(data),before);
});
test('each clan includes its own units and generic Mandalorians, custom excludes other clans',()=>{
  for(const id of [8,22,23,24,25,26]) {
    assert.equal(RulesCore.armyRank(data.units[warrior],id,data.pkg,data.defs,data.units),2);
    const expected=id===8||id===23?1:null;
    assert.equal(RulesCore.armyRank(data.units['mercenary-clan-kryze-bo-katan-kryze'],id,data.pkg,data.defs,data.units),expected);
  }
  assert.equal(RulesCore.armyRank(data.units['empire-tx-225'],8,data.pkg,data.defs,data.units),null);
});
test('automatic helmet uses actual equipment; ambiguous Watch helmets remain a choice',()=>{
  for(const [id,helmet] of [[22,'children-of-the-watch'],[23,'clan-kryze'],[24,'clan-wren'],[25,'clan-saxon']]) {
    const a=add(army(id),warrior);assert.deepEqual(a.units[0].upgrades.map(c=>c.upgradeId),[helmet]);parity.push(a);
  }
  assert.equal(add(army(22),leader).units[0].upgrades.length,0);
  assert.equal(add(army(26),warrior).units[0].upgrades.length,0);
});
test('affiliation errors are non-blocking, identify the unit and rank, and clear with an effective matching leader',()=>{
  let a=add(army(23),warrior);
  const issue=RulesCore.validateArmy(a,data).issues.find(i=>i.code==='battle_force_affiliation');assert.equal(issue.rank,2);assert.equal(issue.instanceId,a.units[0].instanceId);
  a=add(a,leader);assert(!codes(a).includes('battle_force_affiliation'));parity.push(a);
  const selected=a.units[1].upgrades[0];BuilderModel.removeUpgrade(a,data,a.units[1].instanceId,selected.instanceId);
  assert(codes(a).includes('battle_force_affiliation'));parity.push(a);
});
test('two Initiates normally, more allowed for Watch within corps quota',()=>{
  let a=add(add(army(26),initiate),initiate);assert(!BuilderModel.addUnit(a,data,initiate,uid).ok);
  const excess=structuredClone(a);excess.units.push({...structuredClone(a.units[0]),instanceId:uid()});assert(codes(excess).includes('unit_limit_exceeded'));parity.push(excess);
  let b=add(add(add(army(22),initiate),initiate),initiate);assert.equal(b.units.length,3);parity.push(a,b);
});
test('discounts apply per eligible host and cannot leak to a different faction',()=>{
  let a=add(army(26,['veterans','rapidDeployment']),warrior);
  const e=equip(a,0,'galaar-15-carbines');assert(e.ok,e.reason);a=e.draft;
  assert.equal(RulesCore.upgradePoints(data.upgrades['galaar-15-carbines'],data.units[warrior],a,data),0);
  assert.equal(RulesCore.validateArmy(a,data).basePoints-RulesCore.validateArmy(a,data).effectivePoints,5);parity.push(a);
  let b=add(army(22),initiate);const personnel=equip(b,0,'the-armorer');assert(personnel.ok,personnel.reason);b=personnel.draft;
  assert.equal(RulesCore.validateArmy(b,data).basePoints-RulesCore.validateArmy(b,data).effectivePoints,5);parity.push(b);
  assert.equal(RulesCore.upgradePoints(data.upgrades['the-armorer'],data.units[warrior],b,data),data.upgrades['the-armorer'].points);
  assert.equal(RulesCore.upgradePoints(data.upgrades['galaar-15-carbines'],data.units[warrior],{...a,armyId:1},data),5);
  assert(!equip(add(army(22),initiate),0,'bo-katan-kryze').ok,'Kryze personnel require a Kryze host');
  for(const clan of [24,25]) {const tristan=equip(add(army(clan),initiate),0,'tristan-wren-clan');assert(tristan.ok,tristan.reason);parity.push(tristan.draft);}
});
test('Tools free copies use real slots and allow ordinary Mandalorian troops',()=>{
  for(const id of ['flame-projector','mandalorian-rockets-clan','whipcord-launcher']) {
    const special='mc-tools-'+id;let a=add(army(26,['toolsOfTrade','rapidDeployment']),warrior);
    const result=equip(a,0,special);assert(result.ok,result.reason);a=result.draft;
    assert.equal(RulesCore.validateArmy(a,data).effectivePoints,data.units[warrior].points);parity.push(a);
    a=add(a,warrior);assert(!equip(a,1,special).ok,'free copy unique across army');
    const paid=equip(a,1,id);if(id!=='whipcord-launcher'){assert(paid.ok,paid.reason);parity.push(paid.draft);}
    a.options=[];assert(RulesCore.cleanupArmy(a,data).length===1);assert.equal(a.units[0].upgrades.length,0);
  }
});
test('free and paid versions cannot repeat on one host, and free slots are not invented',()=>{
  let a=add(army(26,['toolsOfTrade','veterans']),warrior),r=equip(a,0,'mc-tools-flame-projector');assert(r.ok,r.reason);a=r.draft;
  const duplicate=structuredClone(a);duplicate.units[0].upgrades.push({upgradeId:'flame-projector',instanceId:uid(),slotIndex:99});assert(codes(duplicate).includes('local_duplicate_name'));
  const empty=structuredClone(data.units[warrior]);empty.upgradeSlots=[];assert(!RulesCore.slotListFor(data.pkg,empty,{upgrades:[]},data.upgrades,26).some(s=>s.key==='gear'));
  const c=data.upgrades['mc-tools-whipcord-launcher'];
  assert(!RulesCore.upgradeEligibility(c,data.units['rebels-rebel-troopers'],a,data).ok);
  a.armyId=23;RulesCore.cleanupArmy(a,data);assert.equal(a.units[0].upgrades.length,0);assert.deepEqual(a.options,[]);
});
test('Guns for Hire has exactly three source-linked vehicles, one total, with added rules',()=>{
  let a=army(26,['gunsForHire','veterans']);const candidates=Object.values(data.units).filter(u=>u.runtimeVariant?.kind==='unit');assert.equal(candidates.length,3);
  for(const u of candidates) {assert.deepEqual(u.affiliationIds,['1084']);assert(u.keywords.some(k=>k.id==='coordinate'));assert(u.keywords.some(k=>k.id==='independent'));}
  a=add(a,candidates[0].id);assert(!BuilderModel.addUnit(a,data,candidates[1].id,uid).ok);assert(!BuilderModel.duplicate(a,data,a.units[0].instanceId,uid).ok);parity.push(a);
  a.options=[];RulesCore.cleanupArmy(a,data);assert.equal(a.units.length,0);
});
test('empty-faction TTS resolves every clan and exports canonical battle force names',()=>{
  for(const id of [22,23,24,25,26]) {
    const name=data.ttsNames.battleForces[id].name;
    const imported=BuilderTransfer.importTTS({armyFaction:'',battleForce:name,units:[],commandCards:[]},data,uid,'2026-11-17');
    assert.equal(imported.record.army.armyId,id);assert.equal(imported.issues.length,0);
    const exported=BuilderTransfer.exportTTS(imported.record,data);assert.equal(exported.json.armyFaction,'');assert.equal(exported.json.battleForce,name);
  }
});
test('base-faction calculations are unchanged when the optional module is detached',()=>{
  for(const id of [1,2,4,5,9,7,12,17]) {
    const a=army(id),plugins=global.ArmyRuleExtensions;const enabled=RulesCore.validateArmy(a,data);
    global.ArmyRuleExtensions=[];try{assert.deepEqual(RulesCore.validateArmy(a,data),enabled);}finally{global.ArmyRuleExtensions=plugins;}
  }
});
test('JS and Python agree on clan costs, ranks, availability and validation failures',()=>{
  const script=`import json,sys,rules\na=json.load(sys.stdin)\nprint(json.dumps([rules.validate_army(x) for x in a],ensure_ascii=False))`;
  const result=spawnSync('python',['-X','utf8','-c',script],{cwd:root,input:JSON.stringify(parity),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const py=JSON.parse(result.stdout);
  const normalized=r=>({base:r.basePoints,points:r.effectivePoints,ranks:r.rankCounts,codes:[...new Set(r.issues.filter(i=>i.status==='invalid').map(i=>i.code))].sort()});
  parity.forEach((a,i)=>assert.deepEqual(normalized(RulesCore.validateArmy(a,data)),normalized(py[i]),'army '+i));
});
