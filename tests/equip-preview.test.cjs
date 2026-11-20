const {test}=require('node:test'),assert=require('node:assert/strict');
const {engine,availableBaseline,dataset,plain,ids,roster,slot}=require('./helpers/engine-versions.cjs');
const e=engine(),source=dataset(e);
const fixture=()=>{const data=structuredClone(source);data.units['empire-stormtroopers'].upgradeSlots=[10,10];return data;};
const choices=['training-tenacity','training-endurance','training-duck'];

test('one synchronous preview pass shares the before report but validates every successful candidate draft',()=>{
  const data=fixture(),army=roster(['empire-stormtroopers']),ctx=slot(e,army,data,'training');
  const validate=e.RulesCore.validateArmy,reports=[];
  e.RulesCore.validateArmy=(army,data)=>{reports.push(structuredClone(army));return validate(army,data)};
  try{
    const preview=e.BuilderModel.createEquipPreviewContext(army,data);
    for(const id of choices){const result=e.BuilderModel.equip(army,data,ctx,id,false,ids(),'front',preview);assert(result.ok,result.reason);}
    assert.equal(reports.length,1+choices.length);
    assert.deepEqual(reports[0],army);
    assert.deepEqual(reports.slice(1).map(a=>a.units[0].upgrades[0].upgradeId),choices);
    e.BuilderModel.equip(army,data,ctx,choices[0],false,ids());
    assert.equal(reports.length,choices.length+3,'formal equipment recomputes both complete reports');
  }finally{e.RulesCore.validateArmy=validate;}
});

test('preview invalidates on army edits, source replacement, configuration replacement, disposal and next task',async()=>{
  for(const change of ['army','choice','source','pkg','defs','units','upgrades','forces','force','dispose','next-task']){
    let data=fixture();const army=roster(['empire-stormtroopers']),ctx=slot(e,army,data,'training');
    const preview=e.BuilderModel.createEquipPreviewContext(army,data);
    if(change==='army')army.pointsLimit=800;
    if(change==='choice')army.options.push('changed');
    if(change==='source')data={...data};
    if(['pkg','defs','units','upgrades'].includes(change))data[change]=structuredClone(data[change]);
    if(change==='forces')data.pkg.battleForces={...data.pkg.battleForces};
    if(change==='force')data.pkg.battleForces[army.armyId]={...data.pkg.battleForces[army.armyId]};
    if(change==='dispose')e.BuilderModel.disposeEquipPreviewContext(preview);
    if(change==='next-task')await Promise.resolve();
    const validate=e.RulesCore.validateArmy;let count=0;
    e.RulesCore.validateArmy=(...args)=>{count++;return validate(...args)};
    try{const optimized=e.BuilderModel.equip(army,data,ctx,choices[0],false,ids(),'front',preview);
      assert.equal(count,2,change);assert.deepEqual(plain(optimized),plain(e.BuilderModel.equip(army,data,ctx,choices[0],false,ids())));
    }finally{e.RulesCore.validateArmy=validate;}
  }
});

test('preview and complete paths agree for replacement, exclusions, both faces and grouped batch targets',()=>{
  const data=fixture();for(const id of choices.slice(0,2))data.upgrades[id].rules.exclusion={name:'test',scope:'unit'};
  const armies=[roster(['empire-stormtroopers','empire-stormtroopers']),roster(['republic-anakin'],4)];
  for(const army of armies)for(const all of [false,true])for(const index of [0,1]){
    const ctx=slot(e,army,data,'training',index),preview=e.BuilderModel.createEquipPreviewContext(army,data);
    for(const id of [...choices,'training-stance-b'])for(const face of ['front','back','both']){
      const base=e.BuilderModel.equip(army,data,ctx,id,all,ids(),face),fast=e.BuilderModel.equip(army,data,ctx,id,all,ids(),face,preview);
      assert.deepEqual(plain(fast),plain(base));
    }
  }
  const army=armies[0],ctx=slot(e,army,data,'training');
  let equipped=e.BuilderModel.equip(army,data,ctx,choices[0],true,ids()).draft;
  for(const scope of ['unit','army']){
    data.upgrades[choices[0]].rules.exclusion.scope=scope;
    const preview=e.BuilderModel.createEquipPreviewContext(equipped,data);
    for(const all of [false,true])for(const ordinal of [0,1]){
      const target=slot(e,equipped,data,'training',ordinal);
      assert.deepEqual(plain(e.BuilderModel.equip(equipped,data,target,choices[1],all,ids(),'front',preview)),
        plain(e.BuilderModel.equip(equipped,data,target,choices[1],all,ids())));
    }
  }
});

test('first-round changes agree with release 0.18.0 for ordinary candidate results', {skip:!availableBaseline()&&'Baseline commit unavailable in shallow clone'},()=>{
  const old=engine(true),data=fixture(),army=roster(['empire-stormtroopers','empire-stormtroopers']);
  const ctx=slot(e,army,data,'training'),preview=e.BuilderModel.createEquipPreviewContext(army,data);
  for(const id of choices)for(const all of [false,true])assert.deepEqual(
    plain(e.BuilderModel.equip(army,data,ctx,id,all,ids(),'front',preview)),
    plain(old.BuilderModel.equip(army,data,ctx,id,all,ids(),'front')));
});
