const {test}=require('node:test'),assert=require('node:assert/strict');
const {engine,availableBaseline,dataset,plain,ids,blank,roster,slot}=require('./helpers/engine-versions.cjs');
const current=engine(),source=dataset(current);
const differential={skip:!availableBaseline()&&'Release b1a4af5 is unavailable; fetch it to run differential checks'};
const old=availableBaseline()?engine(true):null;
const selected=(veteran='ccb_reinforced',jedi='ccb_decisive',battalion='ccb_assault')=>{
  let army=blank(28);
  for(const [group,choice] of [['ccb_battalion',battalion],['ccb_jedi',jedi],['ccb_veteran',veteran]])
    army=current.BattleForceV2.choose(army,source.pkg.battleForces[28],'clone-traits',group,choice?[choice]:[]);
  return army;
};
const snapshot=d=>plain({units:d.units,upgrades:d.upgrades,pkg:d.pkg,
  nameIndex:Object.fromEntries(Object.entries(d.nameIndex||{}).map(([key,set])=>[key,[...set]]))});
function compareRuntime(army,data,label){
  assert.deepEqual(snapshot(current.RulesCore.resolveArmyData(army,data)),snapshot(old.RulesCore.resolveArmyData(army,data)),label);
  assert.deepEqual(plain(current.RulesCore.validateArmy(army,data)),plain(old.RulesCore.validateArmy(army,data)),label+' report');
}
function compareEquip(army,data,ctx,cardId,all=false,face='front'){
  const preview=current.BuilderModel.createEquipPreviewContext(army,data);
  const result=current.BuilderModel.equip(army,data,ctx,cardId,all,ids(),face,preview);
  assert.deepEqual(plain(result),plain(old.BuilderModel.equip(army,data,ctx,cardId,all,ids(),face)),cardId+' / '+all+' / '+face);
  if(result.ok){
    assert.deepEqual(plain(current.RulesCore.validateArmy(result.draft,data)),plain(old.RulesCore.validateArmy(result.draft,data)));
    const slots=e=>result.draft.units.map(inst=>{
      const d=e.RulesCore.resolveArmyData(result.draft,data);
      return e.RulesCore.slotListFor(d.pkg,e.RulesCore.unitFor(inst,result.draft,d),inst,d.upgrades,result.draft.armyId);
    });
    assert.deepEqual(plain(slots(current)),plain(slots(old)));
  }
  return result;
}

test('release parity: all 54 clone trait combinations, other active V2 forces and invalid selections',differential,()=>{
  const data=structuredClone(source),before=JSON.stringify(data);
  const groups=data.pkg.battleForces[28].v2.selectionSchemes[0].groups;
  for(const battalion of groups[0].ruleGroupIds)for(const jedi of groups[1].ruleGroupIds)for(const veteran of groups[2].ruleGroupIds){
    const army=selected(veteran,jedi,battalion);
    army.units=roster(['republic-jedi-knight-general','republic-clone-trooper','republic-clone-trooper'],28).units;
    army.units[1].upgrades=[{upgradeId:'clone-miniature',instanceId:'personnel',slotIndex:1}];
    compareRuntime(army,data,[battalion,jedi,veteran].join('/'));
  }
  for(const armyId of [21,27,29]){
    const army=blank(armyId),derived=current.RulesCore.resolveArmyData(army,data);
    army.units=roster(Object.values(derived.units).filter(u=>u._v2Allowed).slice(0,4).map(u=>u.id),armyId).units;
    compareRuntime(army,data,'force '+armyId);
  }
  for(const army of [blank(28),selected(null),{...selected(),battleForceSelection:{battleForceId:28,schemeId:'bad',groups:{}}},
    {...selected(),battleForceSelection:{battleForceId:28,schemeId:'clone-traits',groups:{ccb_battalion:['missing']}}}])compareRuntime(army,data,'invalid choice');
  assert.equal(JSON.stringify(data),before,'source catalog and definitions remain untouched');
});

test('release parity: every training candidate on 12-unit ordinary and V2 lists, before and after equipment',differential,()=>{
  const data=structuredClone(source);
  const unitIds=['republic-jedi-knight-general',...Array(4).fill('republic-clone-trooper'),...Array(2).fill('republic-clone-commandos'),
    ...Array(2).fill('republic-barc'),'republic-saber-class','republic-clone-commander-leadership','republic-jedi-knight'];
  const candidates=Object.values(data.upgrades).filter(c=>current.RulesCore.accessKeys(c,data.pkg,{}).includes('training'));
  assert.equal(candidates.length,43,'same catalog as the browser benchmark');
  for(const armyId of [4,28]){
    let army={...(armyId===28?selected():blank(4)),units:roster(unitIds,armyId).units};
    for(const phase of ['empty','equipped']){
      const ctx=slot(current,army,data,'training',phase==='empty'?0:1),preview=current.BuilderModel.createEquipPreviewContext(army,data);
      for(const card of candidates){
        assert.deepEqual(plain(current.BuilderModel.equip(army,data,ctx,card.id,false,ids(),'front',preview)),
          plain(old.BuilderModel.equip(army,data,ctx,card.id,false,ids(),'front')),armyId+' '+phase+' '+card.id);
      }
      if(phase==='empty'){
        const result=compareEquip(army,data,ctx,'training-endurance');assert(result.ok,result.reason);army=result.draft;
      }
    }
  }
});

test('release parity: static and equippedSlot modifiers stack/conflict in the original order and honor instance rank',differential,()=>{
  const data=structuredClone(source),common=data.pkg.battleForces[28].v2.common;
  const host='republic-clone-trooper',target={field:'unit.id',op:'eq',value:host};
  common.modifiers.push(
    {id:'alternate-rank',card:'unit',target,field:'rankId',op:'add',value:4},
    {id:'static-set',card:'unit',target,field:'points',op:'set',value:70},
    {id:'conditional-set',card:'unit',target,when:{equippedSlot:'personnel'},field:'points',op:'set',value:75},
    {id:'static-add',card:'unit',target,field:'points',op:'add',value:2},
    {id:'conditional-add',card:'unit',target,when:{equippedSlot:'personnel'},field:'points',op:'add',value:3},
    {id:'conditional-keyword',card:'unit',target,when:{equippedSlot:'personnel'},field:'keywords',op:'add',value:{id:'scout',value:2}},
    {id:'support-gear',card:'unit',target:{field:'unit.rankId',op:'eq',value:4},field:'upgradeSlots',op:'add',value:1},
    {id:'remove-grenade',card:'unit',target,when:{equippedSlot:'personnel'},field:'upgradeSlots',op:'remove',value:4}
  );
  assert.deepEqual(plain(current.BattleForceV2.validateDefinition(data.pkg.battleForces[28])),[]);
  const army={...selected('ccb_armored_support'),units:roster([host,host,host],28).units};
  army.units[1].rankId=4;army.units[2].rankId=7;
  army.units[1].upgrades=[{instanceId:'p',upgradeId:'clone-miniature',slotIndex:1}];
  compareRuntime(army,data,'mixed equipped instances');
  const d=current.RulesCore.resolveArmyData(army,data);
  assert(d.pkg._v2.issues.some(i=>i.code==='battle_force_modifier_conflict'));
  assert(d.pkg._v2.issues.some(i=>i.code==='battle_force_rank'));
  assert(!d.pkg._v2.instances['unit-0'].keywords.some(k=>k.id==='mechanized_infantry'));
  assert(!d.pkg._v2.instances['unit-1'].keywords.some(k=>k.id==='mechanized_infantry'),'corps-only effect must not leak to support rank');
  assert.equal(d.pkg._v2.instances['unit-1'].keywords.find(k=>k.id==='scout').value,2);
  for(const unitIndex of [0,1])compareEquip(army,data,slot(current,army,data,'personnel',0,unitIndex),'clone-specialist');
  army.units[1].upgrades=[];compareRuntime(army,data,'removed equipment');
});

test('release parity: named unit/army scopes, distinct upstream conflicts, replacement, uniqueness, faces and grouped batch',differential,()=>{
  for(const scope of ['unit','army'])for(const armyId of [2,28]){
    const data=structuredClone(source),host=data.units[armyId===28?'republic-clone-trooper':'empire-stormtroopers'];host.upgradeSlots=[10,10];
    for(const id of ['training-tenacity','training-endurance'])data.upgrades[id].rules.exclusion={name:'comparison',scope};
    const army={...(armyId===28?selected():blank(2)),units:roster([host.id,host.id],armyId).units},ctx=slot(current,army,data,'training');
    const result=compareEquip(army,data,ctx,'training-tenacity',true);assert.equal(result.ok,scope==='unit');
    const first=compareEquip(army,data,ctx,'training-tenacity');assert(first.ok,first.reason);
    for(const unitIndex of [0,1])for(const ordinal of [0,1])for(const all of [false,true])
      compareEquip(first.draft,data,slot(current,first.draft,data,'training',ordinal,unitIndex),'training-endurance',all);
    // Maintenance reload supplies a new source, not an in-place edit while a
    // synchronous preview is running. Both engines start from this identity.
    const changed=structuredClone(data);changed.upgrades['training-tenacity'].rules.unique=true;
    compareEquip(first.draft,changed,slot(current,first.draft,changed,'training',0,1),'training-tenacity');
  }
  const data=structuredClone(source);data.units['empire-stormtroopers'].upgradeSlots=[10,10];
  const a=data.upgrades['training-tenacity'],b=data.upgrades['training-endurance'];
  a.rules.unavailableWithIds=[{propertyName:'upgrades',id:b.upstream.id}];
  assert.notEqual(a.upstream.id,b.upstream.id);
  let army=roster(['empire-stormtroopers','empire-stormtroopers']);
  army=compareEquip(army,data,slot(current,army,data,'training'),a.id).draft;
  for(const index of [0,1])compareEquip(army,data,slot(current,army,data,'training',0,index),b.id);
  const faces=roster(['republic-anakin'],4),target=slot(current,faces,data,'training');
  for(const face of ['front','back','both']){
    const result=compareEquip(faces,data,target,'training-stance-b',false,face);assert(result.ok,result.reason);
    compareRuntime(result.draft,data,'stance '+face);
    const alias=structuredClone(result.draft);
    // Use the recorded legacy ID instead of inventing a spelling.
    alias.units[0].upgrades[0].upgradeId=data.upgrades['training-stance-b'].back.legacyId;
    compareRuntime(alias,data,'legacy back alias');
  }
});

test('index reuse requires matching catalog and definitions; mutable and unrecognized catalogs rebuild aliases',differential,()=>{
  const data=structuredClone(source),host=data.units['empire-stormtroopers'];host.upgradeSlots=[10,10];
  data.upgrades['local-alpha']={id:'local-alpha',name:{en:'Alpha'},points:0,slotIds:[10],upstream:{id:999998},rules:{unavailableWithIds:['New Alias']}};
  data.upgrades['local-beta']={id:'local-beta',name:{en:'Beta'},points:0,slotIds:[10],upstream:{id:999999},rules:{}};
  data.upgrades=current.UpgradeFaces.index(Object.values(data.upgrades));
  data.nameIndex=current.RulesCore.buildNameIndex(data.upgrades,data.defs);
  Object.freeze(data.upgrades);
  const army=roster([host.id]);army.units[0].upgrades=[{upgradeId:'local-alpha',instanceId:'a',slotIndex:0},{upgradeId:'local-beta',instanceId:'b',slotIndex:1}];
  assert(!current.RulesCore.validateArmy(army,data).issues.some(i=>i.code==='upgrade_conflict'));
  data.defs={...data.defs,upgrades:[...data.defs.upgrades,{id:999999,name:{en:'New Alias'}}]};
  assert(current.RulesCore.validateArmy(army,data).issues.some(i=>i.code==='upgrade_conflict'));
  compareRuntime(army,data,'different defs with old nameIndex');
  data.nameIndex=current.RulesCore.buildNameIndex(data.upgrades,data.defs);
  data.defs.upgrades=data.defs.upgrades.filter(d=>d.id!==999999);
  assert(!current.RulesCore.validateArmy(army,data).issues.some(i=>i.code==='upgrade_conflict'));
  compareRuntime(army,data,'replaced defs upgrade list');
  const mutable=current.UpgradeFaces.index(Object.values(data.upgrades));
  assert.notStrictEqual(current.UpgradeFaces.forCatalog(mutable),mutable);
  mutable['training-stance-b']=structuredClone(mutable['training-stance-b']);
  mutable['training-stance-b'].back.legacyId='changed-back';
  assert.equal(current.UpgradeFaces.forCatalog(mutable)['changed-back'].id,'training-stance-b');
  const unknown=Object.freeze({...mutable});
  assert.notStrictEqual(current.UpgradeFaces.forCatalog(unknown),unknown,'freezing a bare map does not create a recognized index');
  assert(current.UpgradeFaces.forCatalog(unknown)['changed-back']);
});

test('release parity: Equip defaults, Kallus slot grants, Dug In, Imperial March, Mandalorian options and invalid rosters',differential,()=>{
  const data=structuredClone(source);
  for(const [armyId,id,options] of [[4,'republic-clone-commandos',[]],[4,'republic-bad-batch-gar',[]],
    [22,'mercenary-creedless-mandalorian-warriors-corps',[]],[26,'mercenary-creedless-mandalorian-warriors-corps',['veterans','toolsOfTrade']]]){
    assert(data.units[id],id);const army={...blank(armyId),options};
    const result=current.BuilderModel.addUnit(army,data,id,ids());
    assert.deepEqual(plain(result),plain(old.BuilderModel.addUnit(army,data,id,ids())));assert(result.ok,result.reason);
    compareRuntime(result.draft,data,'defaults '+id);
  }
  const counterpartData=structuredClone(data);
  counterpartData.units['rebels-r2d2-hero'].equipUpgradeIds=['upstream-131'];
  const companion=current.BuilderModel.addUnit(blank(1),counterpartData,'rebels-r2d2-hero',ids());
  assert.deepEqual(plain(companion),plain(old.BuilderModel.addUnit(blank(1),counterpartData,'rebels-r2d2-hero',ids())));
  assert(companion.ok,companion.reason);assert.equal(companion.draft.units[0].upgrades[0].upgradeId,'upstream-131');
  compareRuntime(companion.draft,counterpartData,'Equip counterpart');
  for(const [id,armyId,cardId,key] of [['empire-stormtroopers',2,'kallus','heavy_weapon'],
    ['rebels-mark-2-blaster',1,'training-dug-in','special:training-dug-in'],
    ['empire-stormtroopers',2,'training-imperial-march','training']]){
    const army=roster([id],armyId);assert(data.units[id],id);
    const ctx=slot(current,army,data,key);
    if(ctx.slotIndex===undefined){const d=current.RulesCore.resolveArmyData(army,data);ctx.slotKey='special:'+cardId;
      ctx.slotIndex=current.RulesCore.slotListFor(d.pkg,d.units[id],army.units[0],d.upgrades,armyId).findIndex(s=>s.key===ctx.slotKey);}
    assert(ctx.slotIndex>=0,id+' target slot');
    const result=compareEquip(army,data,ctx,cardId);assert(result.ok,result.reason);
    const x=structuredClone(result.draft),y=structuredClone(result.draft),choice=result.draft.units[0].upgrades[0];
    assert.deepEqual(plain(current.BuilderModel.removeUpgrade(x,data,x.units[0].instanceId,choice.instanceId)),
      plain(old.BuilderModel.removeUpgrade(y,data,y.units[0].instanceId,choice.instanceId)));assert.deepEqual(x,y);
  }
  const invalid=roster(['empire-stormtroopers','missing-unit']);invalid.pointsLimit=1;
  invalid.units[0].upgrades=[{instanceId:'missing',upgradeId:'missing-card',slotIndex:100}];
  compareRuntime(invalid,data,'pre-existing failures');
  compareEquip(invalid,data,slot(current,invalid,data,'gear'),'gear-binoculars');
});

test('release parity: rule revocation removes dependent granted slots and re-equipment sees new groups',differential,()=>{
  const data=structuredClone(source);data.upgrades['clone-specialist'].slotGrant={trigger:'equipped',slots:['gear']};
  let army={...selected(),units:roster(['republic-clone-trooper'],28).units};
  let result=compareEquip(army,data,slot(current,army,data,'personnel',1),'clone-specialist');assert(result.ok,result.reason);army=result.draft;
  const d=current.RulesCore.resolveArmyData(army,data),inst=army.units[0];
  const list=current.RulesCore.slotListFor(d.pkg,current.RulesCore.unitFor(inst,army,d),inst,d.upgrades,28),index=list.findIndex(s=>s.addedBy==='clone-specialist');
  assert(index>=0);
  result=compareEquip(army,data,{unitInstanceId:inst.instanceId,slotIndex:index,slotKey:list[index].key},'gear-binoculars');assert(result.ok,result.reason);army=result.draft;
  for(const choice of [null,'ccb_armored_support']){
    const changed=current.BattleForceV2.choose(army,data.pkg.battleForces[28],'clone-traits','ccb_veteran',choice?[choice]:[]);
    const next=current.BattleForceRuntime.reconfigure(army,changed,data);
    assert.deepEqual(plain(next),plain(old.BattleForceRuntime.reconfigure(army,changed,data)));assert.equal(next.removed.length,2);
    compareRuntime(next.draft,data,'revoked '+choice);
    compareEquip(next.draft,data,slot(current,next.draft,data,'personnel'),'clone-miniature');
  }
});

test('static catalogs survive more than eight equipment states; dynamic instances and issues remain independent',()=>{
  const data=structuredClone(source),before=JSON.stringify(data),army={...selected('ccb_armored_support'),units:roster(['republic-clone-trooper'],28).units};
  const base=current.BattleForceRuntime.resolve(army,data),original=snapshot(base);
  assert(Object.isFrozen(base.units));assert(Object.isFrozen(base.upgrades));assert(Object.isFrozen(base.pkg.battleForces[28]));
  assert(Object.isFrozen(base.units['republic-clone-trooper'].keywords));
  const names=current.RulesCore.buildNameIndex;let builds=0;
  current.RulesCore.buildNameIndex=(...args)=>{builds++;return names(...args)};
  try{for(let i=0;i<12;i++){
    const changed=structuredClone(army);changed.units[0].upgrades=[{upgradeId:'clone-miniature',instanceId:'p-'+i,slotIndex:1}];
    const next=current.BattleForceRuntime.resolve(changed,data);
    assert.strictEqual(next.units,base.units);assert.strictEqual(next.upgrades,base.upgrades);assert.strictEqual(next.nameIndex,base.nameIndex);
    assert.notStrictEqual(next.pkg._v2.instances,base.pkg._v2.instances);assert.notStrictEqual(next.pkg._v2.issues,base.pkg._v2.issues);
    assert(next.pkg._v2.instances['unit-0'].keywords.some(k=>k.id==='mechanized_infantry'));
    next.pkg._v2.instances['unit-0'].points=-500;next.pkg._v2.issues.push({code:'mutation'});
  }}finally{current.RulesCore.buildNameIndex=names;}
  assert.equal(builds,0,'candidate cache eviction never rebuilds static indexes');
  assert.deepEqual(snapshot(current.BattleForceRuntime.resolve(army,data)),original);
  assert.equal(JSON.stringify(data),before);assert(!Object.isFrozen(data.units));
  const changed={...selected(),units:army.units};assert.notStrictEqual(current.BattleForceRuntime.resolve(changed,data).units,base.units);
});

test('replaced definitions/catalogs and explicit in-place invalidation cannot return stale static or dynamic results',()=>{
  for(const change of ['units','upgrades','defs','pkg','force-table','force','v2','invalidate']){
    const data=structuredClone(source),army=selected(),base=current.BattleForceRuntime.resolve(army,data);
    if(['units','upgrades','defs','pkg'].includes(change))data[change]=structuredClone(data[change]);
    if(change==='force-table')data.pkg.battleForces={...data.pkg.battleForces};
    if(change==='force')data.pkg.battleForces[28]=structuredClone(data.pkg.battleForces[28]);
    if(change==='v2')data.pkg.battleForces[28].v2=structuredClone(data.pkg.battleForces[28].v2);
    data.pkg.battleForces[28].v2.common.modifiers.push({id:'cache-test',card:'unit',target:{field:'unit.id',op:'eq',value:'republic-clone-trooper'},field:'points',op:'set',value:123});
    if(change==='invalidate')current.BattleForceRuntime.invalidate(data);
    const next=current.BattleForceRuntime.resolve(army,data);
    assert.notStrictEqual(next,base,change);assert.equal(next.units['republic-clone-trooper'].points,123,change);
    data.pkg.battleForces[28]={...data.pkg.battleForces[28],v2:{}};
    assert.strictEqual(current.BattleForceRuntime.resolve(army,data),data,'invalid definitions return to diagnostics');
    data.pkg.battleForces[28]={...source.pkg.battleForces[28],status:'draft'};
    assert.strictEqual(current.BattleForceRuntime.resolve(army,data),data,'disabled force stays on legacy diagnostic path');
  }
});
