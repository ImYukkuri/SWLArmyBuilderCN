const {test}=require('node:test'),assert=require('node:assert/strict');
const {engine,dataset,roster,blank,ids,slot,plain}=require('./helpers/engine-versions.cjs');
const e=engine(),source=dataset(e),R=e.RulesCore,B=e.BuilderModel;
const poolIssues=(a,d)=>R.validateArmy(a,d).issues.filter(i=>i.code==='mercenary_pool');
function fixture() {
  const d=structuredClone(source);
  d.units={};d.upgrades={};
  for(const rank of [1,2,3,4,5,6,7]) {
    const template=source.units['empire-stormtroopers'];
    d.units['merc-'+rank]={...structuredClone(template),id:'merc-'+rank,name:{en:'Merc '+rank,zh:'佣兵'+rank},
      rankId:rank,factions:[{id:2,rankId:rank,tierPools:['mercenary'],tierCounting:{ignoreMinimum:true}}],
      unique:false,upstream:null,rules:{},restrictions:{},keywords:[],upgradeSlots:[],points:1};
    d.pkg.modes.standard.rankQuotas.find(q=>q.rankId===rank).max=10;
  }
  d.units.native={...structuredClone(d.units['merc-1']),id:'native',name:{en:'Native'},
    factions:[{id:2,rankId:1}],keywords:[]};
  return d;
}
test('each rank has its own mercenary limit; Corps get two and Flier gets one',()=>{
  const d=fixture(),a=roster(['merc-1','merc-2','merc-2','merc-3','merc-4','merc-5','merc-6','merc-7']);
  for(const mode of ['standard','recon']) {
    a.mode=mode;assert.equal(poolIssues(a,d).length,0);
    for(const rank of [1,2,3,4,5,6,7]) {
      const extra=structuredClone(a);extra.units.push({unitId:'merc-'+rank,instanceId:'extra',upgrades:[]});
      const issue=poolIssues(extra,d);assert.equal(issue.length,1);assert.equal(issue[0].rank,rank);
    }
  }
  d.pkg.modes.standard.pools.mercenary.perTierMax['7']=0;
  assert.equal(poolIssues({...a,mode:'standard'},d)[0].rank,7,'a configured zero is not replaced by a default');
});
test('Allies allows one shared overflow, never one per rank or per source',()=>{
  const d=fixture();d.units.native.keywords=[{id:'allies_of_convenience'}];
  d.units.native.rules.poolBonuses=['extraMercenary'];
  const a=roster(['native','native','merc-2','merc-2','merc-2','merc-6']);
  assert.equal(poolIssues(a,d).length,0);
  a.units.push({unitId:'merc-6',instanceId:'extra',upgrades:[]});
  assert.deepEqual(plain(poolIssues(a,d)[0].ranks),[2,6]);
  a.units.at(-1).unitId='merc-2';
  assert.equal(poolIssues(a,d)[0].rank,2,'four Corps still exceed the shared one-unit allowance');
  assert(!R.validateArmy(a,d).issues.some(i=>i.code==='mercenary_pool_semantics'));
});
test('unit, equipped keyword, property grant and legacy bonus sources all work, and removal takes effect',()=>{
  const a=roster(['native','merc-6','merc-6']);
  const variants=[
    ['unit-keyword',{keywords:[{id:'allies_of_convenience'}]}],
    ['unit-bonus',{rules:{poolBonuses:['extraMercenary']}}],
    ['upgrade-keyword',{keywords:[{id:'allies_of_convenience'}]}],
    ['upgrade-property',{rules:{addProperties:[[{property:'keywords',value:[118]}]]}}],
    ['upgrade-bonus',{rules:{poolBonuses:['extraMercenary']}}],
  ];
  for(const [kind,value] of variants) {
    const d=fixture(),army=structuredClone(a);
    if(kind.startsWith('unit-'))Object.assign(d.units.native,value);
    else {d.upgrades.bonus={id:'bonus',points:0,slotIds:[],...value};army.units[0].upgrades=[{upgradeId:'bonus',instanceId:'upgrade',slotIndex:0}];}
    assert.equal(poolIssues(army,d).length,0,kind);
    army.units.shift();assert.equal(poolIssues(army,d).length,1,kind+' removal');
  }
});
test('Allies does not waive the normal rank maximum or count mercenaries toward minimums',()=>{
  const d=fixture(),a=roster(['native','merc-1','merc-1']);
  d.units.native.keywords=[{id:'allies_of_convenience'}];
  d.pkg.modes.standard.rankQuotas.find(q=>q.rankId===1).max=2;
  const issues=R.validateArmy(a,d).issues;
  assert(!issues.some(i=>i.code==='mercenary_pool'));
  assert(issues.some(i=>i.code==='rank_max'&&i.rank===1));
  d.units['merc-1'].keywords=[{id:'allies_of_convenience'}];a.units.shift();
  assert(R.validateArmy(a,d).issues.some(i=>i.code==='rank_min'&&i.rank===1));
});
test('pool membership is specific to the army, inherits only without an explicit force entry, and uses the effective rank',()=>{
  const d=fixture(),a=roster(['merc-6','merc-6']);
  d.units['merc-6'].factions.push({id:1,rankId:6});
  assert.equal(poolIssues({...a,armyId:1},d).length,0);
  d.pkg.battleForces['7'].allowedUnits={'6':['Merc 6']};
  assert.equal(poolIssues({...a,armyId:7},d).length,1);
  d.units['merc-6'].factions.push({id:7,rankId:6});
  assert.equal(poolIssues({...a,armyId:7},d).length,0,'native force entry overrides parent mercenary flag');
  d.upgrades.change={id:'change',points:0,slotIds:[],rules:{replaceTier:2}};
  a.units[0].upgrades=[{upgradeId:'change',slotIndex:0}];
  assert.equal(poolIssues(a,d).length,0,'only the equipped instance changes rank');
  a.units.push({unitId:'merc-6',instanceId:'third',upgrades:[]});
  assert.equal(poolIssues(a,d)[0].rank,6);
});
test('real army selectors admit different ranks, enforce same-rank caps, and react to Underworld Connections',()=>{
  const d=structuredClone(source),uid=ids();
  let a=blank(2);
  for(const id of ['empire-veers','mercenary-pyke-syndicate-pyke-syndicate-footsoldier',
    'mercenary-black-sun-black-sun-enforcers','mercenary-rogue-bossk']) {
    const result=B.addUnit(a,d,id,uid);assert(result.ok,result.reason);a=result.draft;
  }
  assert(!B.addUnit(a,d,'mercenary-rogue-cad-bane',uid).ok);
  const ctx=slot(e,a,d,'command',0,0),equipped=B.equip(a,d,ctx,'command-underworld',false,uid);
  assert(equipped.ok,equipped.reason);a=equipped.draft;
  const second=B.addUnit(a,d,'mercenary-rogue-cad-bane',uid);assert(second.ok,second.reason);a=second.draft;
  assert(!B.addUnit(a,d,'mercenary-pyke-syndicate-pyke-syndicate-footsoldier',uid).ok,'the shared bonus is already used by Operatives');
  const removed=structuredClone(a);
  B.removeUpgrade(removed,d,removed.units[0].instanceId,removed.units[0].upgrades.find(c=>c.upgradeId==='command-underworld').instanceId);
  assert.equal(poolIssues(removed,d).length,1,'removing Underworld immediately marks an existing roster invalid');
  for(const [host,armyId,merc] of [['rebels-lando',1,'mercenary-clan-wren-clan-wren-veterans'],
    ['republic-shaak-ti',4,'mercenary-clan-kryze-clan-kryze-veterans']]) {
    const army=roster([host,merc,merc],armyId);
    assert.equal(poolIssues(army,d).length,0,host+' innate Allies');
  }
});
test('V2 keyword modifiers grant Allies and per-instance rank assignments drive mercenary counts',()=>{
  const d=structuredClone(source),force=d.pkg.battleForces[28];
  const merc='mercenary-clan-kryze-clan-kryze-veterans',host='republic-clone-commander-leadership';
  force.v2.common.unitGrants.push({unitId:merc});
  force.v2.common.modifiers.push({id:'qa-allies',card:'unit',target:{all:[{field:'unit.id',op:'eq',value:host}]},field:'keywords',op:'add',value:{id:'allies_of_convenience'}});
  let a=roster([host,merc,merc],28);
  assert.equal(poolIssues(a,d).length,0);
  a.units.shift();assert.equal(poolIssues(a,d).length,1);
  const base=structuredClone(source);base.pkg.battleForces[28].v2.common.unitGrants.push({unitId:merc});
  base.pkg.battleForces[28].v2.common.modifiers.push({id:'qa-rank',card:'unit',target:{all:[{field:'unit.id',op:'eq',value:merc}]},field:'rankId',op:'add',value:4});
  a.units[0].rankId=4;assert.equal(poolIssues(a,base).length,0);
});
test('mercenary armies and Bright Tree direct membership retain their exceptions',()=>{
  for(const [armyId,unitId] of [[8,'mercenary-creedless-mandalorian-warriors-corps'],
    [9,'mercenary-pyke-syndicate-pyke-syndicate-footsoldier'],[14,'mercenary-raiders-weequay-pirate'],
    [18,'mercenary-ewoks-ewok-skirmishers']])assert.equal(poolIssues(roster(Array(3).fill(unitId),armyId),source).length,0);
});
