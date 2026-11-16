const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.window=global;
for(const f of ['upgrade-faces','dice-enums','rules-core','builder-model','builder-library','builder-transfer'])require('../'+f+'.js');
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',n+'.json'),'utf8'));
const data={units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:UpgradeFaces.index(read('upgrades').cards),
 defs:read('catalog-definitions'),pkg:read('slot-rules'),deckData:read('battle-deck'),ttsNames:read('tts-names')};
data.nameIndex=RulesCore.buildNameIndex(data.upgrades,data.defs);
let seq=0;const uid=()=>`transfer-${++seq}`,now='2026-11-16T00:00:00Z';

test('native shared slots migrate once without losing choice identity or changing the imported source',()=>{
 const army={mode:'standard',armyId:1,pointsLimit:1000,commandIds:[],options:[],units:[
  {instanceId:'legacy-unit',unitId:'rebels-mark-2-blaster',upgrades:[
   {instanceId:'legacy-dug-in',upgradeId:'training-dug-in',slotIndex:1}]}]};
 const input=structuredClone(army),first=BuilderTransfer.readNative(input,data,uid,now).record;
 assert.deepEqual(input,army);
 assert.equal(first.army.units[0].upgrades[0].slotIndex,2);
 assert.equal(first.army.units[0].upgrades[0].instanceId,'legacy-dug-in');
 assert.equal(first.army.slotLayoutVersion,1);
 const second=BuilderTransfer.readNative(first,data,uid,now).record;
 assert.deepEqual(second.army,first.army);
});

test('TTS imports both independent special upgrades, including when a later card shifts their slots',()=>{
 for(const upgrades of [['Electrobinoculars','Portable Scanner'],
  ['Electrobinoculars','Portable Scanner',data.upgrades['grievous-heavy'].name.en]]) {
  const source={armyFaction:'separatist',units:[{name:'B1 Battle Droids',upgrades}],commandCards:[]};
  const result=BuilderTransfer.importTTS(source,data,uid,now);
  assert.deepEqual(result.issues,[]);
  const army=result.record.army,inst=army.units[0];
  assert.equal(inst.upgrades.length,upgrades.length);
  assert(!RulesCore.validateArmy(army,data).issues.some(i=>i.code.startsWith('slot_')));
  assert.deepEqual(BuilderTransfer.exportTTS(result.record,data).json.units[0].upgrades.sort(),[...upgrades].sort());
  const native=BuilderTransfer.readNative(result.record,data,uid,now);
  assert.deepEqual(native.record.army,army);
 }
});
const unit=(name,...upgrades)=>({name,upgrades});
const examples=[{
 author:'Legion HQ',listname:'Untitled',points:1000,numActivations:13,armyFaction:'rebel',
 commandCards:['See You in Hell','Corellian Spike','Reckless Diversion','Ace Up His Sleeve','Change of Plans',"Idiot's Array",'Standing Orders'],contingencies:[],
 units:[unit('Lando Calrissian Canny General','Fire Control'),unit('Rebel Officer Fighting for Freedom','Proven Tactician','Heavy Blaster Pistol (Rebel)','Thermal Detonator'),unit('Han Solo Reluctant Hero'),
 unit('Rebel Veterans','CM-0/93 Trooper','Rebel Veteran Squad','Cassian Andor'),unit('Rebel Troopers'),unit('Rebel Troopers'),unit('Rebel Commandos','Proton Charge Saboteur'),unit('Rebel Commandos','Proton Charge Saboteur'),
 unit('Wookiee Warriors Freedom Fighters','Chewbacca','Prepared Supplies'),unit('Rebel Commandos Strike Team','DH-447 Sniper'),unit('Rebel Commandos Strike Team','DH-447 Sniper'),
 unit('X-34 Landspeeder','A-300 Rifle Gunner','Unstable Astromech','M-45 Ion Blaster'),unit('X-34 Landspeeder','A-300 Rifle Gunner','Unstable Astromech','M-45 Ion Blaster')],
 battlefieldDeck:{conditions:['Advanced Intel','No Time to Lose','Scrambled Orders'],deployment:['Payload','Contact, Contact!','Cauldron'],objective:['Failed Negotiations','Surface Scan','Retrieve the Data'],scenario:'standard'},listlink:''
},{author:'Legion HQ',listname:'Untitled',points:983,numActivations:10,armyFaction:'republic',
 commandCards:['Synchronized Offensive','You Underestimate My Power','Out of the Shadows','General Skywalker','Attack of the Clones','Standing Orders'],contingencies:[],
 units:[unit('Anakin Skywalker The Chosen One'),unit('The Bad Batch Clone Force 99','Crosshair','Echo, Clone Force 99','Hunter','Tech','Wrecker'),unit('Mandalorian Hunter','Champion of the Watch','Deadeye','Dual Armaments'),
 unit('Clone Trooper Infantry'),unit('Clone Trooper Infantry'),unit('Clone Trooper Infantry'),unit('Wookiee Warriors Noble Fighters','Chewbacca'),
 unit('Clone Commandos Delta Squad','Katarn Pattern Armor','DC-17m ICWS Config'),unit('Clone Commandos','Katarn Pattern Armor','DC-17m ICWS Config'),unit('Clone Commandos','Katarn Pattern Armor','DC-17m ICWS Config')],
 battlefieldDeck:{conditions:['Advanced Intel','Rapid Deployment','Coordinated Strike'],deployment:['Breakthrough','Bunker Assault','Close the Pocket'],objective:['Bring Them to Heel','Align the Relay','Failed Negotiations'],scenario:'standard'},listlink:'https://legionhq2.com/list/example'
}];
const input=n=>BuilderTransfer.importTTS(structuredClone(examples[n]),data,uid,now);
const normalizedUnits=rows=>rows.map(r=>({name:r.name,upgrades:[...r.upgrades].sort()}));
test('both supplied TTS examples resolve all names, preserve duplicates and every slot',()=>{
 for(let i=0;i<examples.length;i++){
  const before=JSON.stringify(examples[i]),result=input(i);assert.deepEqual(result.issues,[],JSON.stringify(result.issues));
  const {army}=result.record;assert.equal(army.units.length,examples[i].numActivations);assert.equal(army.pointsLimit,1000);
  for(const inst of army.units)assert.equal(new Set(inst.upgrades.map(c=>c.slotIndex)).size,inst.upgrades.length);
  const out=BuilderTransfer.exportTTS(result.record,data);assert.deepEqual(out.issues,[]);
  assert.deepEqual(normalizedUnits(out.json.units),normalizedUnits(examples[i].units));
  assert.deepEqual(out.json.battlefieldDeck,examples[i].battlefieldDeck);
  assert.deepEqual([...out.json.commandCards].sort(),[...examples[i].commandCards].sort());
  assert.equal(out.json.listlink,'');assert.equal(out.json.author,'SWLArmyBuilderCN');
  assert.equal(out.json.points,RulesCore.validateArmy(army,data).effectivePoints);
  assert.equal(JSON.stringify(examples[i]),before);
 }
});
test('dual modes export one canonical TTS name and native format keeps exact modes',()=>{
 const result=input(1);assert.deepEqual(result.issues,[]);
 for(const inst of result.record.army.units)for(const c of inst.upgrades)if(data.upgrades[c.upgradeId].dualSided)c.face='both';
 const out=BuilderTransfer.exportTTS(result.record,data);assert.equal(out.json.units.flatMap(u=>u.upgrades).filter(n=>n==='DC-17m ICWS Config').length,3);
 assert(!out.json.units.flatMap(u=>u.upgrades).some(n=>/Sniper Configuration|Anti-Armor Configuration/.test(n)));
 const restored=BuilderTransfer.readNative(JSON.parse(JSON.stringify(result.record)),data,uid,now);
 assert.deepEqual(restored.record.army,result.record.army);assert.notEqual(restored.record.id,result.record.id);
 const tts=BuilderTransfer.importTTS(out.json,data,uid,now);assert.deepEqual(tts.issues,[]);
 assert(tts.record.army.units.flatMap(u=>u.upgrades).filter(c=>data.upgrades[c.upgradeId].dualSided).every(c=>c.face==='front'));
});
test('unknown names are never silently dropped and explicit resolution fixes them',()=>{
 const obj=structuredClone(examples[0]);obj.units[0].name='Unrecognized General';
 const unresolved=BuilderTransfer.importTTS(obj,data,uid,now);assert.equal(unresolved.issues[0].key,'units.0');
 const fixed=BuilderTransfer.importTTS(obj,data,uid,now,{resolutions:{'units.0':'rebels-lando'}});assert.deepEqual(fixed.issues,[]);
 assert.equal(fixed.record.army.units.length,13);
});
test('ambiguous same-name variants need a choice and safe normalization never treats zero as O',()=>{
 const fixture=structuredClone(data);fixture.units['copy']={...structuredClone(fixture.units['rebels-solo']),id:'copy'};
 fixture.ttsNames.units.copy=fixture.ttsNames.units['rebels-solo'];
 assert.equal(BuilderTransfer.resolve('units','Han Solo Unorthodox General',fixture).length,2);
 assert.notEqual(BuilderTransfer.normalizeName('CM-O/93'),BuilderTransfer.normalizeName('CM-0/93'));
 assert.equal(BuilderTransfer.normalizeName('Padmé Amidala'),BuilderTransfer.normalizeName('Padme Amidala'));
});
test('counterpart TTS names depend on the host faction',()=>{
 const card=data.upgrades['upstream-131'];
 assert.equal(BuilderTransfer.reference('upgrades',card,data,data.units['republic-r2d2-gar']).name,'C-3PO Human Cyborg Relations (GAR)');
 assert.equal(BuilderTransfer.reference('upgrades',card,data,data.units['rebels-r2d2-hero']).name,'C-3PO Human-Cyborg Relations');
});
test('slot assignment retries upgrades that become available after grants and rejects impossible sets intact',()=>{
 const fixture=structuredClone(data),host=fixture.units['empire-stormtroopers'];host.upgradeSlots=[2];
 const gear=fixture.upgrades['gear-binoculars'],force=fixture.upgrades['force-push'];
 gear.rules={slotTypes:[2],slotGrants:[{trigger:'equipped',slot:'force'}]};
 force.rules={slotTypes:[5]};
 fixture.pkg.upgradeRules[String(gear.upstream.id)]={};fixture.pkg.upgradeRules[String(force.upstream.id)]={};
 const inst={unitId:host.id,instanceId:'slot-test',upgrades:[]},army={armyId:2,units:[inst]};
 const before=JSON.stringify(inst),assigned=BuilderTransfer.assignSlots(inst,[force,gear],army,fixture);
 assert.equal(assigned.length,2);assert.equal(assigned.find(c=>c.upgradeId===force.id).slotIndex,1);
 assert.equal(JSON.stringify(inst),before);
 assert.equal(BuilderTransfer.assignSlots(inst,[force],army,fixture),null);
});
test('native copies and bad slot sets do not mutate their source record',()=>{
 const r=input(0),before=JSON.stringify(r.record);BuilderTransfer.readNative(r.record,data,uid,now);assert.equal(JSON.stringify(r.record),before);
 const obj=structuredClone(examples[0]);obj.units=[unit('Han Solo Reluctant Hero','Force Push')];
 const result=BuilderTransfer.importTTS(obj,data,uid,now);assert(result.issues.some(i=>i.kind==='slots'));
 assert.equal(result.record.army.units[0].upgrades.length,0);
});
test('contingencies and loadout survive TTS import/export',()=>{
 const obj=structuredClone(examples[0]);obj.contingencies=['Ambush'];obj.units[0].loadout=['Prepared Supplies'];
 const r=BuilderTransfer.importTTS(obj,data,uid,now);assert.deepEqual(r.issues,[]);
 const out=BuilderTransfer.exportTTS(r.record,data);assert.deepEqual(out.json.contingencies,['Ambush']);assert.deepEqual(out.json.units[0].loadout,['Prepared Supplies']);
});
test('standard 983 points stays a 1000 budget; recon deck names resolve by mode',()=>{
 const r=input(1);assert.equal(r.record.army.pointsLimit,1000);
 const obj={...examples[0],units:[],commandCards:[],points:0,numActivations:0,battlefieldDeck:{scenario:'recon',conditions:['Advanced Intel'],deployment:['Bunker Assault'],objective:['Bring Them to Heel']}};
 const recon=BuilderTransfer.importTTS(obj,data,uid,now);assert.deepEqual(recon.issues,[]);assert.equal(recon.record.army.pointsLimit,600);
 for(const id of Object.values(recon.record.army.deck).flat())assert(BuilderTransfer.catalogs(data).battle.find(c=>c.id===id).modes.includes('recon'));
});
test('native raw armies remain supported; malformed input never becomes an empty success',()=>{
 const army=input(0).record.army;assert.deepEqual(BuilderTransfer.readNative(army,data,uid,now).record.army,army);
 for(const bad of [null,{}, {army:{units:[]}}, {army:{armyId:1,units:[{}]}}])assert.throws(()=>BuilderTransfer.readNative(bad,data,uid,now));
 assert.throws(()=>BuilderTransfer.importTTS({...examples[0],units:[{name:'Han Solo Reluctant Hero',upgrades:'x'}]},data,uid,now));
});
test('JSON parser accepts copied chat escaping without altering valid JSON strings',()=>{
 const raw=JSON.stringify(examples[0],null,2);assert.deepEqual(BuilderTransfer.parse(raw),examples[0]);
 const escaped=raw.replace(/\n/g,'\\\n').replace(/    /g,'&#x20;   ');assert.deepEqual(BuilderTransfer.parse(escaped),examples[0]);
 const value={test:'literal &#x20; and \\n'};assert.deepEqual(BuilderTransfer.parse(JSON.stringify(value)),value);
});
test('uncalibrated exports contain an explicit name warning and reference maps contain names only',()=>{
 const r=input(0),fixture=structuredClone(data);delete fixture.ttsNames.units['rebels-lando'];
 assert(BuilderTransfer.exportTTS(r.record,fixture).warnings.some(n=>n.includes('Lando Calrissian Canny General')));
 for(const kind of ['units','upgrades','commands','battle'])for(const [id,ref]of Object.entries(data.ttsNames[kind])) {
  assert(BuilderTransfer.catalogs(data)[kind].some(c=>String(c.id)===id)||kind==='units'&&data.units[id]);
  assert.equal(typeof ref.name,'string');assert.deepEqual(Object.keys(ref).sort(),['hqIds','name']);
 }
});
module.exports={data,examples};
