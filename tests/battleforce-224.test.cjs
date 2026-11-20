const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
global.window=global;
for(const file of ['dice-enums','upgrade-faces','battleforce-v2','battleforce-runtime','rules-core',
  'mandalorian-rules','builder-model','builder-library','builder-transfer']) require('../'+file+'.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',f+'.json'),'utf8'));
const data={pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),deckData:read('battle-deck'),
  units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:UpgradeFaces.index(read('upgrades').cards)};
RulesCore.prepareData(data);data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
let serial=0;const uid=()=> '224-test-'+ ++serial;
const officer='empire-imperial-officer-ruthless-efficiency',agent='empire-imperial-agent-order-to-galaxy';
const blank=(mode='standard')=>({armyId:27,mode,pointsLimit:mode==='recon'?600:1000,units:[],commandIds:[],options:[]});
const add=(army,id)=>{const r=BuilderModel.addUnit(army,data,id,uid);assert(r.ok,r.reason);return r.draft;};
function slots(army,index=0){const d=BattleForceRuntime.resolve(army,data),inst=army.units[index];
  return RulesCore.slotListFor(d.pkg,RulesCore.unitFor(inst,army,d),inst,d.upgrades,army.armyId);}
function equip(army,index,cardId,key='doctrine',applyAll=false){
  const list=slots(army,index),slotIndex=list.findIndex(s=>s.key===key);
  assert(slotIndex>=0,'expected slot '+key);
  return BuilderModel.equip(army,data,{unitInstanceId:army.units[index].instanceId,
    groupIds:army.units.map(i=>i.instanceId),slotIndex,slotKey:key},cardId,applyAll,uid);
}
const report=army=>RulesCore.validateArmy(army,data);

test('224 enables exact local variants and all standard/recon rank quotas without changing base cards',()=>{
  assert.deepEqual(BattleForceV2.validatePackage(data.pkg),[]);
  assert(BuilderLibrary.battleforces(2,data).some(b=>b.id===27));
  const d=BattleForceRuntime.resolve(blank(),data);
  const expected={1:[officer],6:[agent],2:['empire-mudtroopers','empire-stormtroopers'],
    3:['empire-riot-squad-trench-buster'],4:['empire-e-web','empire-wet-weather-troopers'],
    5:['empire-at-st','empire-tx-225'],7:[]};
  for(const [rank,ids] of Object.entries(expected)) assert.deepEqual(Object.values(d.units).filter(u=>
    RulesCore.armyRank(u,27,d.pkg,d.defs,d.units)===Number(rank)).map(u=>u.id).sort(),ids.sort());
  assert.equal(data.units['empire-riot-squad-trench-buster'].rankId,2);
  assert.equal(d.units['empire-riot-squad-trench-buster'].rankId,3);
  for(const [mode,expectedQuotas,combined] of [
    ['standard',[[1,1,5],[6,0,4],[2,4,7],[3,0,3],[4,0,5],[5,0,2],[7,0,2]],5],
    ['recon',[[1,1,4],[6,0,3],[2,3,5],[3,0,2],[4,0,4],[5,0,1],[7,0,1]],4]]) {
    assert.deepEqual(d.pkg.battleForces[27].modes[mode].rankQuotas.map(q=>[q.rankId,q.min,q.max]),expectedQuotas);
    let army=add(blank(mode),officer);
    for(let n=1;n<combined;n++)army=add(army,agent);
    assert(!BuilderModel.addUnit(army,data,officer,uid).ok,'combined cap');
    assert(!report(army).issues.some(i=>['rank_max','rank_combined'].includes(i.code)));
    let corps=blank(mode);const min=mode==='recon'?3:4,max=mode==='recon'?5:7;
    for(let n=0;n<max;n++) {
      assert.equal(report(corps).issues.some(i=>i.code==='rank_min'&&i.rank===2),n<min);
      corps=add(corps,'empire-mudtroopers');
    }
    assert(!BuilderModel.addUnit(corps,data,'empire-mudtroopers',uid).ok);
  }
});

test('224 per-unit caps and unique whitelist remain effective with existing upgrade-slot grants',()=>{
  for(const [id,max] of [['empire-stormtroopers',2],['empire-wet-weather-troopers',4]]) {
    let army=blank();for(let n=0;n<max;n++)army=add(army,id);
    assert(!BuilderModel.addUnit(army,data,id,uid).ok);
  }
  let army=add(blank(),'empire-mudtroopers');
  const before=slots(army).filter(s=>s.key==='heavy_weapon').length;
  const result=equip(army,0,'imperial-probe-droid','heavy_weapon');assert(result.ok,result.reason);army=result.draft;
  assert.equal(slots(army).filter(s=>s.key==='heavy_weapon').length,before+1);
  const d=BattleForceRuntime.resolve(army,data),host=RulesCore.unitFor(army.units[0],army,d);
  assert(RulesCore.upgradeEligibility(d.upgrades.kallus,host,army,d,[]).issues.some(i=>i.code==='battle_force_unique_upgrade'));
  BuilderModel.removeUpgrade(army,data,army.units[0].instanceId,army.units[0].upgrades[0].instanceId);
  assert.equal(slots(army).filter(s=>s.key==='heavy_weapon').length,before);
});

test('Gas Grenades matches the Trench Buster title across armies and future unit IDs',()=>{
  const id='new-upgrade-mwkggzem';
  for(const armyId of [2,27]) {
    for(const hostId of ['empire-riot-squad-trench-buster','empire-wet-weather-troopers']) {
      const army=add({...blank(),armyId},hostId),result=equip(army,0,id,'grenades');
      assert(result.ok,result.reason);
      const py=spawnSync('python',['-c','import json,sys,rules; print(json.dumps(rules.validate_army(json.load(sys.stdin)),ensure_ascii=True))'],
        {cwd:path.join(__dirname,'..'),input:JSON.stringify(result.draft),encoding:'utf8'});
      assert.equal(py.status,0,py.stderr);assert.deepEqual(JSON.parse(py.stdout),report(result.draft));
    }
    assert(!equip(add({...blank(),armyId},'empire-stormtroopers'),0,id,'grenades').ok);
  }
  const card=data.upgrades[id],host=structuredClone(data.units['empire-stormtroopers']),army={...blank(),armyId:2};
  host.id='another-title-bearing-unit';host.name={en:'Another Unit',zh:'另一个单位'};
  for(const title of [{en:'Trench Buster',zh:''},{en:'Trench Busters',zh:''},{en:'',zh:'战壕奇兵'}]) {
    host.title=title;assert(RulesCore.upgradeEligibility(card,host,army,data,[]).ok);
  }
  host.title={en:'',zh:''};host.name={en:'Trench Buster',zh:'战壕奇兵'};
  assert(!RulesCore.upgradeEligibility(card,host,army,data,[]).ok,'unit name alone is not a matching title');
});

for(const [id,host,other] of [['academy-trained',officer,agent],['defend-in-depth',officer,agent],
  ['platoon-commander',agent,officer],['tip-of-the-spear',agent,officer]])
test('224 allows exactly two paid copies of '+id+', including copying and apply-all',()=>{
  let army=add(blank(),host),first=equip(army,0,id);assert(first.ok,first.reason);army=first.draft;
  const points=report(army).effectivePoints;
  const copied=BuilderModel.duplicate(army,data,army.units[0].instanceId,uid);assert(copied.ok,copied.reason);army=copied.draft;
  assert.equal(report(army).effectivePoints,points*2);
  assert(!report(army).issues.some(i=>/unique|limit_exceeded|upgrade_conflict/.test(i.code)));
  assert(!BuilderModel.duplicate(army,data,army.units[0].instanceId,uid).ok);
  army=add(army,host);assert(!equip(army,2,id).ok,'third copy must fail');
  const forged=structuredClone(army);forged.units[2].upgrades=[{...forged.units[0].upgrades[0],instanceId:uid()}];
  assert(report(forged).issues.some(i=>i.code==='limit_exceeded'));
  const ordinary=BuilderLibrary.switchBattleForce(army,2);
  assert(report(ordinary).issues.some(i=>i.code==='unique_duplicate'));
  assert.equal(data.upgrades[id].rules.unique,true);assert.equal(data.upgrades[id].rules.limit,1);
  assert.equal(BattleForceRuntime.resolve(blank(),data).upgrades[id].rules.limit,2,'not accumulated across renders');
  let merged=add(add(blank(),host),host),all=equip(merged,0,id,'doctrine',true);
  assert(all.ok,all.reason);assert(all.draft.units.every(i=>i.upgrades.some(c=>c.upgradeId===id)));
  merged=add(merged,host);const rejected=equip(merged,0,id,'doctrine',true);
  assert(!rejected.ok,'three-unit apply-all must fail atomically');assert(merged.units.every(i=>!i.upgrades.length));
  const d=BattleForceRuntime.resolve(blank(),data);
  const allowed=['defend-in-depth','tip-of-the-spear'].includes(id);
  assert.equal(RulesCore.upgradeEligibility(d.upgrades[id],d.units[other],blank(),d,[]).ok,allowed,'host restrictions');
});

test('224 frontal assault occupies doctrine, costs five, caps at two and is exclusive',()=>{
  let army=add(add(blank(),officer),officer);
  const result=equip(army,0,'frontal-assault','doctrine',true);assert(result.ok,result.reason);army=result.draft;
  assert.equal(report(army).effectivePoints,2*(data.units[officer].points+5));
  army=add(army,officer);assert(!equip(army,2,'frontal-assault').ok);
  assert(!equip(add(blank(),agent),0,'frontal-assault').ok);
  assert(report(BuilderLibrary.switchBattleForce(army,2)).issues.some(i=>i.code==='upgrade_faction'));
  const c=data.upgrades['frontal-assault'];assert(c.description.zh.join('').length>0);
  assert.equal(c.review.status,'needs_review');assert.equal(c.upstream,undefined);
  // Other unique cards remain limited to one.
  let ordinaryUnique=add(add(blank(),officer),officer);
  const first=equip(ordinaryUnique,0,'fire-control','command');assert(first.ok,first.reason);
  assert(!equip(first.draft,1,'fire-control','command').ok);
});

test('224 commands, native/TTS roundtrips and Python validation use the same identities and limits',()=>{
  let army=add(add(blank(),officer),officer);
  army=equip(army,0,'academy-trained','doctrine',true).draft;
  army=add(army,'empire-riot-squad-trench-buster');
  army.commandIds=['over-the-top','in-the-trenches','creeping-barrage'];
  for(const [index,id] of army.commandIds.entries()) {
    const c=data.defs.commands.find(c=>c.id===id);
    assert.equal(c.pips,index+1);assert.deepEqual(c.factions,[27]);assert(!c.hidden);
    assert(c.description.zh.length>0);
  }
  assert(!report(army).issues.some(i=>i.code==='command_faction'));
  assert.equal(report(BuilderLibrary.switchBattleForce(army,2)).issues.filter(i=>i.code==='command_faction').length,3);
  const record={id:'224-roundtrip',name:'224',factionId:2,army};
  const native=BuilderTransfer.readNative(JSON.parse(JSON.stringify(record)),data,uid,'2026-11-20');
  assert.deepEqual(report(native.record.army).rankCounts,report(army).rankCounts);
  const exported=BuilderTransfer.exportTTS(record,data);assert.deepEqual(exported.issues,[]);
  assert.equal(exported.json.battleForce,'224th Armored Division');
  assert.equal(exported.json.armyFaction,'empire');assert.equal(exported.json.listlink,'');
  const imported=BuilderTransfer.importTTS(exported.json,data,uid,'2026-11-20');assert.deepEqual(imported.issues,[]);
  assert.equal(imported.record.army.armyId,27);
  assert.equal(report(imported.record.army).effectivePoints,report(army).effectivePoints);
  assert.deepEqual(report(imported.record.army).rankCounts,report(army).rankCounts);
  assert(!report(imported.record.army).issues.some(i=>/unique|limit_exceeded/.test(i.code)));
  const py=spawnSync('python',['-c','import json,sys,rules; print(json.dumps(rules.validate_army(json.load(sys.stdin)),ensure_ascii=True))'],
    {cwd:path.join(__dirname,'..'),input:JSON.stringify(army),encoding:'utf8'});
  assert.equal(py.status,0,py.stderr);assert.deepEqual(JSON.parse(py.stdout),report(army));
});
