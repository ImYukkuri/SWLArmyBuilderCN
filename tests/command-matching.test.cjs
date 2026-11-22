const {test}=require('node:test'),assert=require('node:assert/strict');
const {engine,dataset,plain,roster}=require('./helpers/engine-versions.cjs');
const e=engine(),data=dataset(e),R=e.RulesCore;
const atom=(field,...values)=>({type:'unit',all:[{field,values}]});
const card=(...all)=>({requirements:{any:[{all}]}});
const evaluate=(c,a,d=data)=>R.commandEligibility(c,a,d);
const command=id=>data.defs.commands.find(c=>c.id===id);

test('all 235 active commands have valid local conditions; 18 hidden cards remain unchanged',()=>{
  assert.equal(data.defs.commands.filter(c=>!c.hidden).length,235);
  for(const c of data.defs.commands){
    if(c.hidden){assert(!c.requirements);continue;}
    assert.deepEqual(plain(R.commandRequirementErrors(c.requirements)),[],c.id);
    for(const key of ['unlockedBy','requiredUnitGroups','factions','titleMatch'])assert(!(key in c),c.id+' '+key);
    for(const a of c.requirements.any.flatMap(g=>g.all)){
      if(a.type==='unit')for(const f of a.all)if(f.field==='id')for(const id of f.values)assert(data.units[id],c.id+': '+id);
      if(a.type==='battleForce')for(const id of a.values)assert(data.pkg.battleForces[id]);
    }
  }
});
test('Obi-Wan mounted and ordinary forms unlock exactly their shared and exclusive cards',()=>{
  for(const unitId of ['republic-obiwan','new-unit-mw9obgc9']){
    const a=roster([unitId],4),mounted=unitId==='new-unit-mw9obgc9';
    for(const id of ['49','51','54'])assert(evaluate(command(id),a).ok,id);
    for(const id of ['20052','20053'])assert.equal(evaluate(command(id),a).ok,mounted,id);
    for(const id of ['49','51','54','20052','20053']) {
      const result=R.validateArmy({...a,commandIds:[id]},data);
      assert.equal(result.issues.some(i=>i.code.startsWith('command_')&&!['command_min','command_max'].includes(i.code)),!evaluate(command(id),a).ok);
    }
  }
  assert(!evaluate(command('20052'),roster(['republic-anakin-barc'],4)).ok);
  assert(evaluate(command('20053'),roster(['republic-anakin-barc'],4)).ok);
});
test('matching modes, alternatives and correlated unit filters work across V1/V2 armies',()=>{
  const a=roster(['republic-obiwan','republic-anakin-barc'],4);
  for(const [field,value] of [['name','Obi-Wan Kenobi'],['title','Mounted Jedi General'],['nameIdentityId','obi-wan-kenobi'],['factionId',4]])assert(evaluate(card(atom(field,value)),a).ok);
  assert(!evaluate(card(atom('name','Obi-Wan')),a).ok);
  const combined={type:'unit',all:[{field:'nameIdentityId',values:['obi-wan-kenobi']},{field:'title',values:['Mounted Jedi General']}]};
  assert(!evaluate(card(combined),a).ok,'different units cannot combine their properties');
  assert(evaluate({requirements:{any:[{all:[combined]},{all:[atom('id','republic-obiwan')]}]}},a).ok);
  assert(evaluate(card({type:'armyFaction',values:[4]}),a).ok);
  assert(!evaluate(card({type:'battleForce',values:[28]}),a).ok);
  assert(evaluate(card({type:'battleForce',values:[28]},{type:'armyFaction',values:[4]}),{...a,armyId:28}).ok);
});
test('name combinations require distinct units and do not split combined-character cards or counterparts',()=>{
  const c=command('18903');
  assert(!evaluate(c,roster(['rebels-solo'],1)).ok);
  assert(evaluate(c,roster(['rebels-solo','rebels-luke-skywalker-jedi'],1)).ok);
  assert(!evaluate(c,roster(['mercenary-rogue-han-and-chewie','rebels-luke-skywalker-jedi'],1)).ok);
  const fixture=structuredClone(data);fixture.units['rebels-solo'].name.zh='Luke Skywalker';
  assert(!evaluate(c,roster(['rebels-solo'],1),fixture).ok,'one instance cannot satisfy two names');
  const a=roster(['rebels-solo'],1);a.units[0].upgrades=[{upgradeId:'cassian-andor',instanceId:'c',slotIndex:0}];
  assert(!evaluate(card(atom('name','Cassian Andor')),a).ok);
  assert(evaluate(card({type:'upgrade',values:['cassian-andor']}),a).ok);
});
test('organization matches equipped changes on the correct unit, and updates after removal',()=>{
  const fixture=structuredClone(data),a=roster(['republic-obiwan','republic-anakin'],4);
  fixture.upgrades.test={id:'test',rules:{replaceProperties:[[{property:'affiliation',value:[965]}]]}};
  const c=card({type:'unit',all:[{field:'nameIdentityId',values:['obi-wan-kenobi']},{field:'affiliationIds',values:['965']}]});
  assert(!evaluate(c,a,fixture).ok);
  a.units[1].upgrades=[{upgradeId:'test'}];assert(!evaluate(c,a,fixture).ok);
  a.units[0].upgrades=[{upgradeId:'test'}];assert(evaluate(c,a,fixture).ok);
  a.units[0].upgrades=[];assert(!evaluate(c,a,fixture).ok);
  assert(evaluate(card({type:'armyFaction',values:[8]}),roster([],22)).ok);
});
test('malformed and incomplete conditions block selection; explicit unrestricted and legacy rules work',()=>{
  for(const requirements of [null,{}, {any:[{all:[]}]},{any:[{all:[{type:'unitNames',values:['Han Solo']}]}]},
    {any:[{all:[atom('name')]}]},{any:[{all:[{type:'unknown',values:['x']}]}]}])assert(R.commandRequirementErrors(requirements).length);
  assert(evaluate({requirements:{any:[]}},roster([])).ok);
  assert(!evaluate(card(atom('id')),roster([])).ok);
  assert(!evaluate({...command('8'),hidden:true},roster([])).ok);
  const legacy={unlockedBy:[{propertyName:'units',id:41}],factions:[4]};
  assert(evaluate(legacy,roster(['republic-obiwan'],4)).ok);
  assert(!evaluate(legacy,roster(['republic-anakin'],4)).ok);
});
