const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),baseline='b1a4af5';
const files=['dice-enums','upgrade-faces','battleforce-v2','battleforce-runtime','rules-core','mandalorian-rules','builder-model'];
const oldFiles=new Set(['builder-model','battleforce-runtime','rules-core','upgrade-faces']);
const code=new Map();
function engine(legacy=false){
  const context=vm.createContext({structuredClone,queueMicrotask,console,performance,Set,Map,WeakMap});
  context.window=context;context.globalThis=context;
  for(const file of files){const key=(legacy&&oldFiles.has(file)?baseline:'current')+':'+file;
    if(!code.has(key))code.set(key,key.startsWith(baseline)?execFileSync('git',['show',baseline+':'+file+'.js'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}):fs.readFileSync(path.join(root,file+'.js'),'utf8'));
    vm.runInContext(code.get(key),context,{filename:file+'.js'});
  }
  return context;
}
function availableBaseline(){try{execFileSync('git',['cat-file','-e',baseline+':builder-model.js'],{cwd:root,stdio:'ignore'});return true}catch{return false}}
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
function dataset(e){const data={units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:e.UpgradeFaces.index(read('upgrades').cards),defs:read('catalog-definitions'),pkg:read('slot-rules')};e.RulesCore.prepareData(data);data.nameIndex=e.RulesCore.buildNameIndex(data.upgrades,data.defs);return data;}
const plain=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const ids=()=>{let n=0;return()=>`comparison-${++n}`;};
const blank=(armyId=2)=>({armyId,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]});
function roster(unitIds,armyId=2){return{...blank(armyId),units:unitIds.map((unitId,i)=>({unitId,instanceId:'unit-'+i,upgrades:[]}))};}
function slot(e,army,data,key,ordinal=0,index=0){const inst=army.units[index],d=e.RulesCore.resolveArmyData(army,data),unit=e.RulesCore.unitFor(inst,army,d);return{unitInstanceId:inst.instanceId,groupIds:army.units.map(i=>i.instanceId),slotKey:key,slotIndex:e.RulesCore.slotListFor(d.pkg,unit,inst,d.upgrades,army.armyId).map((s,i)=>s.key===key?i:-1).filter(i=>i>=0)[ordinal]};}
module.exports={engine,availableBaseline,dataset,plain,ids,blank,roster,slot};
