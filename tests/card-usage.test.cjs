const {test} = require('node:test');
const assert = require('node:assert/strict');
const Usage = require('../card-usage.js');
const a = {id:'old-unit',numericId:1,name:{zh:'甲'}}, b = {id:'upgrade',numericId:2,name:{zh:'乙'}};
function setup(saved = null) {
  const state = {reads:0,writes:0,timerSets:0,time:1000,fail:false,saved};
  const timers = new Map(), events = new Map(), document = {visibilityState:'visible',addEventListener:(name,fn)=>events.set(name,fn)};
  const store = Usage.create({getStorage:()=>({getItem(){state.reads++;return state.saved;},
    setItem(key,value){assert.equal(key,Usage.STORAGE_KEY);state.writes++;if(state.fail)throw Error('QuotaExceededError');state.saved=value;}}),
    now:()=>state.time,events:{addEventListener:(name,fn)=>events.set(name,fn)},document,
    setTimer:(fn,ms)=>{assert.equal(ms,800);const id=++state.timerSets;timers.set(id,fn);return id;},clearTimer:id=>timers.delete(id)});
  const tick = () => {for(const fn of [...timers.values()])fn();};
  return {store,state,timers,tick,events,document};
}
test('initializes exactly once; sorting/stats do not access storage; batches debounce one write',()=>{
  const {store,state,timers,tick}=setup();
  store.init();store.init();
  for(let i=0;i<40;i++) {
    [a,b].sort((a,b)=>store.compare('units','usage',a,b));store.stats('units',a);store.isFavorite('units',b);
  }
  assert.equal(state.reads,1);assert.equal(state.writes,0);assert.equal(timers.size,0);
  store.recordMany([{kind:'units',card:a},{kind:'upgrades',card:b,count:3}]);
  assert.equal(state.timerSets,1);assert.equal(store.stats('upgrades',b).count,3);
  store.recordMany([{kind:'units',card:a}]);store.toggleFavorite('upgrades',b);
  assert.equal(timers.size,1);assert.equal(state.writes,0);
  tick();assert.equal(state.writes,1);assert.equal(timers.size,0);
  const saved=JSON.parse(state.saved);assert.equal(saved.units['1'].count,2);
  assert.equal(saved.upgrades['2'].count,3);assert.deepEqual(saved.favorites,{units:[],upgrades:['2']});
  const next=setup(state.saved);assert.equal(next.store.stats('units',a).count,2);assert(next.store.isFavorite('upgrades',b));
  next.store.flush();assert.equal(next.state.writes,0);
});
test('sorting honors usage, recency, favorites and deterministic fallback without mutating records',()=>{
  const {store,state}=setup();
  store.recordMany([{kind:'units',card:a,count:3}]);state.time++;
  store.recordMany([{kind:'units',card:b,count:1}]);
  assert(store.compare('units','usage',a,b)<0);assert(store.compare('units','recent',a,b)>0);
  store.toggleFavorite('units',b);assert(store.compare('units','favorites',a,b)>0);
  assert.equal(store.stats('units',a).count,3);assert.equal(store.stats('units',b).count,1);
  assert(store.compare('units','points',{...a,points:2},{...b,points:1})>0);
  const front={...a,_face:'front'},back={...a,_face:'back'};
  assert(store.compare('upgrades','name',front,back)<0);
  assert(store.compare('units','name',{...a,name:{zh:'相同'}},{...b,name:{zh:'相同'}})<0);
});
test('numeric identity survives renames; types and generated variants are separate; faces share usage',()=>{
  const {store}=setup();
  const renamed={...a,id:'new-unit'},back={...a,_face:'back'},variant={...a,id:'variant',runtimeVariant:{sourceId:a.id}};
  store.recordMany([{kind:'units',card:a},{kind:'upgrades',card:back,count:2},{kind:'upgrades',card:variant}]);
  store.toggleFavorite('upgrades',back);
  assert.equal(store.stats('units',renamed).count,1);assert.equal(store.stats('upgrades',a).count,2);
  assert.equal(store.stats('upgrades',variant).count,1);assert(store.isFavorite('upgrades',a));
  assert.equal(store.isFavorite('units',a),false);assert.equal(store.isFavorite('upgrades',variant),false);
});
test('corrupt JSON and storage denial/quota never break the session; pending writes retry on lifecycle',()=>{
  const broken=setup('{broken');broken.store.recordMany([{kind:'units',card:a}]);broken.tick();
  assert.equal(JSON.parse(broken.state.saved).units['1'].count,1);
  const {store,state,events,document,timers}=setup();state.fail=true;
  store.recordMany([{kind:'units',card:a}]);assert.equal(store.flush(),false);
  assert.equal(store.stats('units',a).count,1);assert.equal(timers.size,0);
  state.fail=false;document.visibilityState='hidden';events.get('visibilitychange')();
  assert.equal(state.writes,2);events.get('pagehide')();events.get('beforeunload')();assert.equal(state.writes,2);
  const denied=Usage.create({getStorage(){throw Error('SecurityError');},events:null,document:null});
  denied.recordMany([{kind:'upgrades',card:b}]);assert.equal(denied.flush(),false);assert.equal(denied.stats('upgrades',b).count,1);
});
test('untrusted stored records and invalid increments are ignored; no dirty write for empty batch',()=>{
  const {store,state}=setup(JSON.stringify({version:1,units:{'1':{count:-1,lastUsedAt:0},'2':null},favorites:{units:'bad'}}));
  store.recordMany([{kind:'units',card:a,count:-1},{kind:'bogus',card:a},{kind:'upgrades',card:b,count:NaN}]);
  store.recordMany([]);store.flush();assert.equal(state.writes,0);assert.equal(store.stats('units',a).count,0);
  const unsupported=setup(JSON.stringify({version:2,units:{'1':{count:1,lastUsedAt:0}}}));
  assert.equal(unsupported.store.stats('units',a).count,0);
});

test('requested upgrade presets and every restricted Force card start one point higher without storage writes',()=>{
  const {readFileSync}=require('node:fs');
  const cards=JSON.parse(readFileSync(require('node:path').join(__dirname,'../data/upgrades.json'),'utf8')).cards;
  const named=[
    'Into the Fray','Tenacity','Up Close and Personal','Superior Equipment','Prepared Supplies','Targeting Scopes',
    'Linked Targeting Array','Onboard Comms Channel','Hacked Comms Unit','Comms Jammer','Squadron Leader',
    'Burst of Speed','Force Guidance','Battlemind','Force Reflexes','Fire Control','Improvised Orders','Vigilance','Underworld Connections',
  ];
  const expected=new Set(named.map(name=>{
    const matches=cards.filter(c=>c.name.en.replace(/^[•\s]+/,'')===name);
    assert.equal(matches.length,1,name);return matches[0].id;
  }));
  for(const card of cards)if(card.slotIds.includes(5)&&card.rules?.requiredDivisions?.some(v=>['Light','Dark'].includes(v)))expected.add(card.id);
  assert.equal(expected.size,32);
  const {store,state}=setup(),ordinary=cards.find(c=>c.id==='gear-datapad');
  for(const card of cards){
    assert.equal(Usage.initialWeight('upgrades',card),Number(expected.has(card.id)),card.id);
    assert.equal(Usage.initialWeight('units',card),0);
    if(expected.has(card.id))assert(store.compare('upgrades','usage',card,ordinary)<0,card.id);
  }
  store.flush();assert.deepEqual({reads:state.reads,writes:state.writes},{reads:1,writes:0});
  const preferred=cards.find(c=>c.id==='gear-scopes');
  assert.equal(store.stats('upgrades',preferred).count,0,'preset is not a fake successful use');
  store.recordMany([{kind:'upgrades',card:ordinary,count:2}]);
  assert(store.compare('upgrades','usage',ordinary,preferred)<0,'personal use overtakes initial weight');
  store.recordMany([{kind:'upgrades',card:preferred,count:2}]);
  assert(store.compare('upgrades','usage',preferred,ordinary)<0,'weight adds to actual count');
  store.flush();const loaded=setup(state.saved);
  assert.equal(loaded.store.stats('upgrades',preferred).count,2);
  assert(loaded.store.compare('upgrades','usage',preferred,ordinary)<0);
  loaded.store.flush();assert.equal(loaded.state.writes,0,'reload neither seeds nor increments again');
  assert.equal(Usage.initialWeight('upgrades',{id:'new-force-card',slotIds:[5],rules:{requiredDivisions:['Light']}}),1);
  assert.equal(Usage.initialWeight('upgrades',{id:'new-training-card',slotIds:[10],rules:{requiredDivisions:['Dark']}}),0);
});
