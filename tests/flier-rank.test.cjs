const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {spawnSync} = require('node:child_process');
global.window = global;
for (const file of ['dice-enums','upgrade-faces','rules-core','builder-model','builder-library','builder-transfer']) require('../'+file+'.js');
const root = path.resolve(__dirname,'..');
const read = name => JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const source = {pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),deckData:read('battle-deck'),
  units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:UpgradeFaces.index(read('upgrades').cards)};
let serial=0;const uid=()=>`flier-test-${++serial}`;
const planeId='test-only-flier';
function fixture() {
  const data=structuredClone(source), plane=structuredClone(data.units['rebels-at-rt-rebel']);
  // Keep aircraft synthetic until real cards are available; do not depend on a future catalog entry.
  Object.assign(plane,{id:planeId,name:{en:'Test Flier',zh:'测试飞机'},title:{en:'',zh:''},nameIdentityId:planeId,
    rankId:7,factions:[{id:1,rankId:7},{id:14,rankId:7},{id:18,rankId:7}],points:50,
    keywords:[],rules:{unlimited:true},upgradeSlots:[10],equipUpgradeIds:[],equipSlotIds:[]});
  delete plane.upstream;delete plane.restrictions;delete plane.conditionalUpgradeSlots;
  data.units[planeId]=plane;
  data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
  return data;
}
const roster=(mode='standard',armyId=1,count=0)=>({armyId,mode,pointsLimit:mode==='recon'?600:1000,
  units:Array.from({length:count},()=>({unitId:planeId,instanceId:uid(),upgrades:[]})),commandIds:[],options:[]});
const rankIssues=(army,data)=>RulesCore.validateArmy(army,data).issues.filter(i=>i.rank===7);

test('every mode defines Flier explicitly, including forbidden battle forces',()=>{
  assert.equal(source.defs.ranks.find(r=>r.id===7).name.en,'Flier');
  for (const [id,modes] of [[1,source.pkg.modes],...Object.entries(source.pkg.battleForces).map(([id,bf])=>[Number(id),bf.modes])]) {
    for (const mode of ['standard','recon']) {
      const rows=modes[mode].rankQuotas.filter(q=>q.rankId===7);
      assert.equal(rows.length,1,`${id}/${mode}`);
      assert.deepEqual(rows[0],{rankId:7,min:0,max:[14,18].includes(id)?0:mode==='standard'?2:1});
    }
  }
});

test('adding and duplicating aircraft share the rank cap; failed operations are atomic',()=>{
  const data=fixture();
  for (const mode of ['standard','recon']) {
    const max=mode==='standard'?2:1;
    let army=roster(mode);
    for(let i=0;i<max;i++) {
      const result=BuilderModel.addUnit(army,data,planeId,uid);assert(result.ok,result.reason);army=result.draft;
    }
    assert.equal(RulesCore.validateArmy(army,data).rankCounts[7],max);
    assert.deepEqual(rankIssues(army,data),[]);
    const before=structuredClone(army);
    assert.equal(BuilderModel.addUnit(army,data,planeId,uid).ok,false);
    assert.equal(BuilderModel.duplicate(army,data,army.units[0].instanceId,uid).ok,false);
    assert.deepEqual(army,before);
    army.units.pop();assert(BuilderModel.addUnit(army,data,planeId,uid).ok);
  }
  for(const armyId of [14,18])assert.equal(BuilderModel.addUnit(roster('standard',armyId),data,planeId,uid).ok,false);
});

test('imported excess aircraft are retained and invalid, with identical JS and Python counts',()=>{
  const data=fixture(), armies=[roster('standard',1,2),roster('standard',1,3),roster('recon',1,2),roster('standard',14,1)];
  const project=report=>({rankCounts:report.rankCounts,issues:report.issues.filter(i=>i.rank===7)});
  const js=armies.map(a=>project(RulesCore.validateArmy(a,data)));
  assert.equal(js[0].issues.length,0);
  for(const report of js.slice(1))assert(report.issues.some(i=>i.code==='rank_max'));
  const py=spawnSync('python',['-c',[
    'import json,sys,rules', 'from unittest.mock import patch', 'd=json.load(sys.stdin.buffer)',
    'with patch("rules.load_cards",return_value=(d["data"]["units"],d["data"]["upgrades"],d["data"]["defs"])), patch("rules.load_package",return_value=d["data"]["pkg"]):',
    ' reports=[rules.validate_army(a) for a in d["armies"]]',
    'print(json.dumps([dict(rankCounts=r["rankCounts"],issues=[i for i in r["issues"] if i.get("rank")==7]) for r in reports],ensure_ascii=True))',
  ].join('\n')],{cwd:root,input:JSON.stringify({data,armies}),encoding:'utf8'});
  assert.equal(py.status,0,py.stderr);assert.deepEqual(JSON.parse(py.stdout),js);
  const imported=BuilderTransfer.readNative(armies[1],data,uid,new Date().toISOString()).record;
  assert.equal(imported.army.units.length,3);
  assert(rankIssues(imported.army,data).some(i=>i.code==='rank_max'));
});

test('rank conditions, battle force overrides, totals and TTS round trips recognize aircraft',()=>{
  const data=fixture(), plane=data.units[planeId];
  const card={id:'test-flier-training',name:{en:'Flier Training'},slotIds:[10],rules:{},
    restrictions:{condition:{field:'unit.rankId',op:'eq',value:7}}};
  assert(RulesCore.upgradeEligibility(card,plane,roster(),data,[]).ok);
  assert(!RulesCore.upgradeEligibility(card,data.units['rebels-at-rt-rebel'],roster(),data,[]).ok);
  data.pkg.battleForces[13].allowedUnits={'7':[plane.name.en]};
  assert.equal(RulesCore.armyRank(plane,13,data.pkg,data.defs,data.units),7);
  data.pkg.armyOverrides[13]={rankOverrides:[{unitNames:[plane.name.en],rankId:5}]};
  assert.equal(RulesCore.armyRank(plane,13,data.pkg,data.defs,data.units),5);
  const record=BuilderLibrary.create(1,'Aircraft test',data,uid,new Date().toISOString());record.army=roster('standard',1,2);
  const out=BuilderTransfer.exportTTS(record,data).json;
  assert.equal(out.numActivations,2);assert.equal(out.points,100);assert.equal(out.units.length,2);
  const imported=BuilderTransfer.importTTS(out,data,uid,new Date().toISOString()).record;
  assert.deepEqual(imported.army.units.map(u=>u.unitId),[planeId,planeId]);
});
