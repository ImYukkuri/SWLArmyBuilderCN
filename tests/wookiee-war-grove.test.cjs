const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
global.window=global;
for(const file of ['dice-enums','upgrade-faces','battleforce-v2','battleforce-runtime','rules-core',
  'mandalorian-rules','builder-model','builder-library','builder-transfer','editor-options'])require('../'+file+'.js');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',n+'.json'),'utf8'));
const data={pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),deckData:read('battle-deck'),
  units:Object.fromEntries(read('units').units.map(c=>[c.id,c])),upgrades:UpgradeFaces.index(read('upgrades').cards)};
RulesCore.prepareData(data);data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
const tree='republic-wookiee-treetop-defenders',guard='republic-wookiee-fearsome-guardians';
let serial=0;const uid=()=> 'wookiee-test-'+ ++serial;
const blank=(armyId=21,mode='standard')=>({armyId,mode,pointsLimit:mode==='recon'?600:1000,units:[],commandIds:[],options:[]});
const add=(army,id,d=data)=>{const r=BuilderModel.addUnit(army,d,id,uid);assert(r.ok,r.reason);return r.draft;};
function equip(army,index,id,key,d=data) {
  const resolved=RulesCore.resolveArmyData(army,d),inst=army.units[index];
  const slots=RulesCore.slotListFor(resolved.pkg,RulesCore.unitFor(inst,army,resolved),inst,resolved.upgrades,army.armyId);
  const slotIndex=slots.findIndex((s,i)=>s.key===key&&!inst.upgrades.some(c=>c.slotIndex===i));
  return BuilderModel.equip(army,d,{unitInstanceId:inst.instanceId,slotKey:key,slotIndex},id,false,uid);
}
const codes=(a,d=data)=>RulesCore.validateArmy(a,d).issues.map(i=>i.code);
function parity(army) {
  const py=spawnSync('python',['-c','import json,sys,rules; print(json.dumps(rules.validate_army(json.load(sys.stdin)),ensure_ascii=True))'],
    {cwd:path.join(__dirname,'..'),input:JSON.stringify(army),encoding:'utf8'});
  assert.equal(py.status,0,py.stderr);assert.deepEqual(JSON.parse(py.stdout),RulesCore.validateArmy(army,data));
}

test('War Grove has the new exact unit list, quotas and limits; base Republic keeps original variants',()=>{
  assert.deepEqual(BattleForceV2.validatePackage(data.pkg),[]);
  const d=RulesCore.resolveArmyData(blank(),data);
  const expected={1:['republic-yoda','republic-chewbacca-gar','republic-chieftain'],6:['republic-jedi-knight'],
    2:[tree,'republic-clone-trooper'],3:[guard],4:['republic-raddaugh','republic-raddaugh-gnasp','republic-barc'],
    5:['republic-isp','republic-saber-class'],7:[]};
  for(const [rank,ids] of Object.entries(expected))assert.deepEqual(Object.values(d.units)
    .filter(u=>RulesCore.armyRank(u,21,d.pkg,d.defs,d.units)===+rank).map(u=>u.id).sort(),ids.sort());
  for(const id of [tree,guard,'republic-raddaugh','republic-chieftain'])assert.equal(RulesCore.armyRank(data.units[id],4,data.pkg,data.defs,data.units),null);
  for(const id of ['republic-wookiee-noble','republic-wookiee-kashyyk'])assert.equal(RulesCore.armyRank(data.units[id],4,data.pkg,data.defs,data.units),3);
  assert.deepEqual(d.pkg.battleForces[21].modes.standard.rankQuotas.map(q=>[q.rankId,q.min,q.max]),
    [[1,1,2],[6,0,2],[2,3,6],[3,0,3],[4,0,3],[5,0,2],[7,0,2]]);
  assert.deepEqual(d.pkg.battleForces[21].modes.recon.rankQuotas.map(q=>[q.rankId,q.min,q.max]),
    [[1,1,2],[6,0,1],[2,2,4],[3,0,2],[4,0,2],[5,0,1],[7,0,1]]);
  for(const [id,max] of [['republic-clone-trooper',2],['republic-barc',1],['republic-isp',1],['republic-saber-class',1]]) {
    let a=blank();for(let i=0;i<max;i++)a=add(a,id);
    assert(!BuilderModel.addUnit(a,data,id,uid).ok,id);
  }
  let a=add(blank(),tree);assert(codes(a).includes('battle_force_unit_min'));
  a=add(a,tree);assert(!codes(a).includes('battle_force_unit_min'));assert(codes(a).includes('rank_min'));
  a=add(a,'republic-chieftain');a=add(a,'republic-clone-trooper');assert(!codes(a).some(c=>c==='rank_min'||c==='battle_force_unit_min'));
  parity(a);
});

test('Tenacity is free only for Treetop Defenders in War Grove, including totals and transfer',()=>{
  let a=add(add(blank(),tree),guard);
  const first=equip(a,0,'training-tenacity','training');assert(first.ok,first.reason);a=first.draft;
  const second=equip(a,1,'training-tenacity','training');assert(second.ok,second.reason);a=second.draft;
  const d=RulesCore.resolveArmyData(a,data);
  assert.equal(RulesCore.upgradePoints(d.upgrades['training-tenacity'],d.units[tree],a,d),0);
  assert.equal(RulesCore.upgradePoints(d.upgrades['training-tenacity'],d.units[guard],a,d),6);
  assert.equal(data.upgrades['training-tenacity'].points,6);
  assert.equal(RulesCore.validateArmy(a,data).effectivePoints,69+72+6);
  const ordinary=add(blank(4),'republic-wookiee-noble');
  assert.equal(RulesCore.upgradePoints(data.upgrades['training-tenacity'],data.units['republic-wookiee-noble'],ordinary,data),6);
  const exported=BuilderTransfer.exportTTS({id:'grove',name:'伍基人林地战团',factionId:4,army:a},data);
  assert.equal(exported.json.points,147);assert.equal(exported.json.battleForce,'Wookiee War Grove');assert.equal(exported.json.listlink,'');
  const imported=BuilderTransfer.importTTS(exported.json,data,uid,'2026-11-20');assert.deepEqual(imported.issues,[]);
  assert.equal(imported.record.army.armyId,21);assert.equal(RulesCore.validateArmy(imported.record.army,data).effectivePoints,147);
  const old=BuilderTransfer.importTTS({...exported.json,battleForce:'Wookiee Defenders'},data,uid,'2026-11-20');
  assert.equal(old.record.army.armyId,21);parity(a);
});

test('Fluttercraft gets Transport, mandatory crew and the supplied slot/weapon data',()=>{
  for(const id of ['republic-raddaugh','republic-raddaugh-gnasp']) {
    const a=add(blank(),id),d=RulesCore.resolveArmyData(a,data);
    assert.equal(d.units[id].keywords.filter(k=>k.id==='transport').length,1);
    assert(!data.units[id].keywords.some(k=>k.id==='transport'));
  }
  let a=add(blank(),'republic-raddaugh');
  assert(codes(a).includes('required_slot'));assert.equal(a.units[0].upgrades.length,0,'multiple crew choices remain manual');
  const r=equip(a,0,'war-grove-gnasp-gunner','crew');assert(r.ok,r.reason);a=r.draft;
  assert(!codes(a).includes('required_slot'));assert.equal(RulesCore.validateArmy(a,data).effectivePoints,77);
  assert.deepEqual(data.units['republic-raddaugh'].upgradeSlots,[13,6]);
  assert.equal(data.units['republic-raddaugh'].stats.speed,3);
  assert.deepEqual(data.upgrades['war-grove-gnasp-gunner'].weapons[0].dice,{red:2,black:2,white:0});
  assert.equal(data.upgrades['war-grove-gnasp-gunner'].weapons[0].keywords.find(k=>k.id==='impact').value,2);
  assert.equal(data.upgrades['gnasp-bomber'].weapons[0].range.min,-1);parity(a);
});

test('exclusive upgrades and all three commands stay in War Grove',()=>{
  const upgrades=['war-grove-battle-shield-wookiee','war-grove-bowcaster-wookiee','war-grove-long-gun-wookiee'];
  for(const id of upgrades) {
    const a=add(blank(),tree),r=equip(a,0,id,'heavy_weapon');assert(r.ok,r.reason);
    const outside=add(blank(4),'republic-wookiee-noble');assert(!equip(outside,0,id,'heavy_weapon').ok);
  }
  assert(equip(add(blank(),'republic-chieftain'),0,'wookiee-battle-cries','command').ok);
  assert(!equip(add(blank(),'republic-yoda'),0,'wookiee-battle-cries','command').ok);
  const a=blank();a.commandIds=['crashing-counterattack','ferocious-leadership','relentless-resistance'];
  assert(!codes(a).includes('command_faction'));assert.equal(RulesCore.validateArmy({...a,armyId:4},data).issues.filter(i=>i.code==='command_faction').length,3);
  a.commandIds.forEach((id,i)=>{const c=data.defs.commands.find(c=>c.id===id);assert.equal(c.slotPips,i+1);assert(fs.existsSync(path.join(__dirname,'..',c.image)));});
});

test('Yoda uses identity or Republic Wookiee subtype, and is permitted in War Grove',()=>{
  const card=data.upgrades['yoda-heavy'];
  assert.equal(card.points,20);assert.deepEqual(card.slotIds,[4]);
  assert(card.keywords.some(k=>k.id==='noncombatant'));
  assert(data.pkg.battleForces[21].v2.common.uniqueUpgradeIds.includes(card.id));
  assert(fs.existsSync(path.join(__dirname,'..',card.assets.front)));
  const allow=(host,armyId=21)=>{const a=blank(armyId),d=RulesCore.resolveArmyData(a,data);return RulesCore.upgradeEligibility(d.upgrades[card.id],host,a,d,[]).ok;};
  for(const id of ['republic-clone-trooper',tree,guard,'republic-wookiee-noble'])assert(allow(data.units[id]),id);
  assert(allow({...data.units['republic-clone-trooper'],id:'different-local-id',name:{en:'Other name'},title:{en:'New variant'}}));
  for(const id of ['republic-arf-troopers','rebels-wookiee-freedom','empire-stormtroopers'])assert(!allow(data.units[id]),id);
  assert(allow(data.units['republic-wookiee-noble'],4),'the card is not printed as War Grove exclusive');
});

test('Yoda grants an adjacent heavy slot, remains unique, and removal cleans up its equipment',()=>{
  let a=add(blank(),tree),r=equip(a,0,'yoda-heavy','heavy_weapon');assert(r.ok,r.reason);a=r.draft;
  let d=RulesCore.resolveArmyData(a,data),inst=a.units[0];
  const slots=RulesCore.slotListFor(d.pkg,RulesCore.unitFor(inst,a,d),inst,d.upgrades,a.armyId);
  const parent=inst.upgrades.find(c=>c.upgradeId==='yoda-heavy');
  const order=BuilderModel.slotOrder(inst,slots);
  assert.equal(slots[order[order.indexOf(parent.slotIndex)+1]].key,'heavy_weapon');
  assert.equal(slots.filter(s=>s.key==='heavy_weapon').length,2);
  assert.equal(RulesCore.validateArmy(a,data).effectivePoints,89);
  assert(!equip(a,0,'yoda-heavy','heavy_weapon').ok,'no self-repeating slot grant');
  a=add(a,tree);assert(!equip(a,1,'yoda-heavy','heavy_weapon').ok,'army unique');
  r=equip(a,0,'war-grove-bowcaster-wookiee','heavy_weapon');assert(r.ok,r.reason);a=r.draft;
  const exported=BuilderTransfer.exportTTS({id:'grove',name:'Yoda test',factionId:4,army:a},data);
  assert(exported.json.units[0].upgrades.includes('Yoda'));
  const imported=BuilderTransfer.importTTS(exported.json,data,uid,'2026-11-20');assert.deepEqual(imported.issues,[]);
  assert(imported.record.army.units[0].upgrades.some(c=>c.upgradeId==='yoda-heavy'));
  parity(a);
  BuilderModel.removeUpgrade(a,data,a.units[0].instanceId,parent.instanceId);
  assert(!a.units[0].upgrades.some(c=>['yoda-heavy','war-grove-bowcaster-wookiee'].includes(c.upgradeId)));
  const commander=add(add(blank(),tree),'republic-yoda');
  assert(!equip(commander,0,'yoda-heavy','heavy_weapon').ok,'unit and upgrade share Yoda uniqueness');
});

test('Eyes and Ears and Veteran Operators match identities and cap at two; every Equip representation excludes Veterans',()=>{
  for(const [id,host,armyId] of [['eyes-and-ears','republic-arf-troopers',4],['veteran-operators','empire-special-forces',2]]) {
    let a=blank(armyId);
    for(let i=0;i<3;i++)a=add(a,host);
    for(let i=0;i<2;i++){const r=equip(a,i,id,'training');assert(r.ok,r.reason);a=r.draft;}
    assert(!equip(a,2,id,'training').ok);parity(a);
  }
  const card=data.upgrades['veteran-operators'],a=blank(2),host=data.units['empire-special-forces'];
  assert(RulesCore.upgradeEligibility(card,host,a,data,[]).ok);
  assert(!RulesCore.upgradeEligibility(card,data.units['empire-inferno-squad'],a,data,[]).ok);
  for(const extra of [{keywords:[{id:'equip'}]},{equipUpgradeIds:['del-meeko']},{equipSlotIds:['heavy_weapon']},
    {rules:{requiredChildren:[{elementPropertyName:'upgrades',id:170}]}}]) {
    assert(!RulesCore.upgradeEligibility(card,{...host,...extra},a,data,[]).ok,JSON.stringify(extra));
  }
  const fixture=structuredClone(data),u=fixture.units[host.id];
  fixture.pkg.unitRules[String(u.upstream.id)]={requiredChildren:[{elementPropertyName:'upgrades',id:170}]};
  assert(!RulesCore.upgradeEligibility(card,u,a,fixture,[]).ok,'legacy package requirements');
  assert(!RulesCore.upgradeEligibility(data.upgrades['eyes-and-ears'],data.units['republic-clone-trooper'],blank(4),data,[]).ok);
  const options=EditorOptions.create(data.defs,Object.values(data.units),Object.values(data.upgrades),data.pkg,read('rule-fields'));
  assert.deepEqual(options.condition('unit.hasEquip').map(x=>x.value),[true,false]);
});

test('auto equipment counts all legal candidates, keeps mandatory paid Equip, traverses granted slots',()=>{
  function fixture(cards) {
    const d=structuredClone(data),u=d.units['empire-stormtroopers'];
    u.upgradeSlots=[10];u.keywords=[];u.equipUpgradeIds=[];u.equipSlotIds=[];u.rules={unlimited:true};
    delete d.pkg.unitRules[String(u.upstream.id)];d.pkg.upgradeRules={};
    d.upgrades=Object.fromEntries(cards.map(([id,points,slot=10])=>[id,{id,name:{en:id,zh:id},points,slotIds:[slot],
      rules:{slotTypes:[slot]},restrictions:{},keywords:[],weapons:[]}]));
    d.nameIndex=RulesCore.buildNameIndex(d.upgrades,d.defs);return d;
  }
  const host='empire-stormtroopers',get=d=>add(blank(2),host,d).units[0].upgrades.map(c=>c.upgradeId);
  assert.deepEqual(get(fixture([['free',0]])),['free']);
  assert.deepEqual(get(fixture([['paid',5]])),[]);
  assert.deepEqual(get(fixture([['free',0],['paid',5]])),[]);
  assert.deepEqual(get(fixture([['free',0],['other-free',0]])),[]);
  let d=fixture([['free',0],['wrong-host',5]]);d.upgrades['wrong-host'].restrictions.condition={field:'unit.id',op:'eq',value:'elsewhere'};
  assert.deepEqual(get(d),['free']);
  d=fixture([['mandatory-paid',8],['optional',0]]);d.units[host].equipUpgradeIds=['mandatory-paid'];assert.deepEqual(get(d),['mandatory-paid']);
  d=fixture([['mandatory-paid',8]]);d.units[host].equipSlotIds=['training'];assert.deepEqual(get(d),['mandatory-paid']);
  d=fixture([['optional-first',0,2],['mandatory-last',8]]);d.units[host].upgradeSlots=[2,10];
  d.units[host].equipUpgradeIds=['mandatory-last'];d.upgrades['optional-first'].name.en=d.upgrades['mandatory-last'].name.en;
  assert.deepEqual(get(d),['mandatory-last'],'later mandatory equipment takes precedence over optional defaults');
  d=fixture([['free',0],['nested-free',0,2]]);d.upgrades.free.rules.slotGrants=[{trigger:'equipped',slot:'gear'}];
  assert.deepEqual(get(d),['free','nested-free']);
  d=fixture([['free',0]]);d.upgrades.free.rules.unique=true;
  const a=add(add(blank(2),host,d),host,d);assert.equal(a.units[0].upgrades.length,1);assert.equal(a.units[1].upgrades.length,0);
});
