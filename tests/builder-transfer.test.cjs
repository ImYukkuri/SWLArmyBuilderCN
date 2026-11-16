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
const example212={author:'Legion HQ',listname:'212带新',points:999,numActivations:9,armyFaction:'republic',
 battleForce:'212th Attack Battalion',commandCards:['Bring It Down!','Sneak Attack','Have I Ever Let You Down?',
 'Recon Division','Combined Arms','Flexible Strategy','Standing Orders'],contingencies:[],units:[
 unit('Clone Commander Cody Leader of the 212th'),
 unit('Clone Trooper Infantry','Mortar Clone Trooper','Clone Trooper Infantry'),
 unit('Clone Trooper Infantry','Mortar Clone Trooper','Clone Trooper Infantry'),
 unit('ARF Troopers','Obi-Wan Kenobi','RPS-6 ARF Trooper','ARF Trooper Duo'),
 unit('AT-RT','AT-RT Flamethrower'),unit('AT-RT','AT-RT Flamethrower'),
 unit('Saber-Class Tank','Clone Shock Trooper Pilot','Beam Turret','Linked Targeting Array'),
 unit('Saber-Class Tank','Clone Shock Trooper Pilot','Beam Turret','Linked Targeting Array'),
 unit('Infantry Support Platform','327th Star Corps Elite Armor Pilots','Twin Beam Cannons')],
 battlefieldDeck:{conditions:['Coordinated Strike','Rapid Deployment','Advanced Intel'],
 deployment:['Close the Pocket','Payload','Outflank'],objective:['Marked Targets','Recon Mission','Sweep and Clear'],scenario:'standard'},listlink:''};

test('212th example imports its battle force, all nine units and every upgrade, then exports the HQ name',()=>{
 const r=BuilderTransfer.importTTS(example212,data,uid,now);
 assert.deepEqual(r.issues,[]);assert.equal(r.record.army.armyId,12);assert.equal(r.record.factionId,4);
 const out=BuilderTransfer.exportTTS(r.record,data);assert.deepEqual(out.issues,[]);
 assert.equal(out.json.battleForce,example212.battleForce);assert.equal(out.json.numActivations,9);
 assert.deepEqual(out.json.units.map(u=>({...u,upgrades:u.upgrades.toSorted()})),example212.units.map(u=>({...u,upgrades:u.upgrades.toSorted()})));
 assert.deepEqual(out.json.commandCards,example212.commandCards);assert.deepEqual(out.json.battlefieldDeck,example212.battlefieldDeck);
 assert.equal(out.json.listlink,'');
});

test('all 20 local battle forces import and export canonical names independently of renamed labels',()=>{
 const factions={1:'rebel',2:'empire',4:'republic',5:'separatist',8:'mandalorian',9:'mercenary'};
 assert.equal(Object.keys(data.ttsNames.battleForces).length,20);
 for(const [id,ref] of Object.entries(data.ttsNames.battleForces)) {
  const input={armyFaction:factions[ref.factionId],battleForce:ref.name,units:[],commandCards:[]};
  const r=BuilderTransfer.importTTS(input,data,uid,now);assert.deepEqual(r.issues,[],ref.name);
  assert.equal(r.record.army.armyId,Number(id));assert.equal(r.record.factionId,ref.factionId);
  assert.equal(BuilderTransfer.exportTTS(r.record,data).json.battleForce,ref.name);
  const fixture=structuredClone(data);fixture.defs.armies.find(a=>String(a.id)===id).name.en='Renamed '+id;
  fixture.pkg.battleForces[id].name='Renamed '+id;
  const renamed=BuilderTransfer.importTTS(input,fixture,uid,now);assert.deepEqual(renamed.issues,[],ref.name);
  assert.equal(BuilderTransfer.exportTTS(renamed.record,fixture).json.battleForce,ref.name);
 }
 const empty={armyFaction:'',battleForce:'The Ohnaka Gang',units:[],commandCards:[]};
 const gang=BuilderTransfer.importTTS(empty,data,uid,now);assert.deepEqual(gang.issues,[]);
 assert.equal(BuilderTransfer.exportTTS(gang.record,data).json.armyFaction,'mercenary');
 assert(BuilderLibrary.battleforces(9,data).some(a=>a.id===14));
});

test('battle force aliases, unknown names, duplicate names and wrong factions never silently pick another army',()=>{
 const source={armyFaction:'republic',battleForce:'212 Attack Battalion',units:[],commandCards:[]};
 assert.equal(BuilderTransfer.importTTS(source,data,uid,now).record.army.armyId,12);
 const unknown={...source,battleForce:'Unrecognized force'};
 assert.equal(BuilderTransfer.importTTS(unknown,data,uid,now).issues[0].kind,'battleForce');
 const fixed=BuilderTransfer.importTTS(unknown,data,uid,now,{resolutions:{battleForce:'12'}});
 assert.deepEqual(fixed.issues,[]);assert.equal(fixed.record.army.armyId,12);
 const wrong=BuilderTransfer.importTTS({...source,armyFaction:'rebel'},data,uid,now);
 assert(wrong.issues.some(i=>i.kind==='battleForce'));assert.equal(wrong.record.army.armyId,1);
 const fixture=structuredClone(data);fixture.pkg.battleForces['16'].nameAliases=['212 Attack Battalion'];
 const ambiguous=BuilderTransfer.importTTS(source,fixture,uid,now);
 assert(ambiguous.issues.some(i=>i.kind==='battleForce'&&i.candidates.length===2));
 assert.throws(()=>BuilderTransfer.importTTS({...source,battleForce:12},data,uid,now));
});

test('renamed unit IDs preserve native imports, equipped faces, points and TTS references',()=>{
 const fixture=structuredClone(data),old='rebels-solo',next='rebels-han-renamed';
 fixture.units[next]={...fixture.units[old],id:next};delete fixture.units[old];
 fixture.unitIdAliases={[old]:next,'very-old-han':old};
 fixture.ttsNames.units[next]=fixture.ttsNames.units[old];delete fixture.ttsNames.units[old];
 const source={armyId:1,mode:'standard',pointsLimit:1000,slotLayoutVersion:1,units:[
  {unitId:'very-old-han',instanceId:'same-instance',upgrades:[]}],commandIds:[],options:[]};
 const before=structuredClone(source),record=BuilderTransfer.readNative(source,fixture,uid,now).record;
 assert.deepEqual(source,before);assert.equal(record.army.units[0].unitId,next);
 assert.equal(record.army.units[0].instanceId,'same-instance');
 assert(!RulesCore.validateArmy(source,fixture).issues.some(i=>i.code==='missing_unit'));
 const out=BuilderTransfer.exportTTS(record,fixture);assert.equal(out.json.units[0].name,data.ttsNames.units[old].name);
 const again=BuilderTransfer.importTTS(out.json,fixture,uid,now);assert.deepEqual(again.issues,[]);
 assert.equal(again.record.army.units[0].unitId,next);
});
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
module.exports={data,examples,example212};
