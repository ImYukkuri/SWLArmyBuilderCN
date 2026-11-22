const test = require('node:test'), assert = require('node:assert/strict');
const {deflateRawSync, deflateSync} = require('node:zlib');
global.window = global;
require('../builder-share.js');
const share = BuilderShare;
const record = {
  id:'local-roster',name:'自定义克隆人营：中文 & + / % 🛡',factionId:4,
  createdAt:'2026-11-23T00:00:00Z',updatedAt:'2026-11-23T01:00:00Z',
  army:{armyId:28,pointsLimit:1200,mode:'standard',slotLayoutVersion:1,
    battleForceSelection:{version:1,groups:{battalion:['ccb_scout'],jedi:['ccb_decisive'],veteran:['ccb_reinforced']}},
    options:['custom-option'],commandIds:['8',null,'1'],contingencies:['3'],
    deck:{primary:['a','b','c'],secondary:['d','e','f'],advantage:['g','h','i']},
    units:Array.from({length:13},(_,i)=>({unitId:'republic-clone-troopers',instanceId:'unit-'+i,rankId:2,
      upgrades:[{instanceId:'upgrade-'+i,upgradeId:'training-stance-b',slotIndex:3,slotKey:'training',face:['front','back','both'][i%3]}]})),
    extraSettings:{notes:'Keep unknown native fields',enabled:false,number:0}}
};

test('versioned sharing losslessly preserves every native field and compresses realistic repeated units',async()=>{
  const original = structuredClone(record), code = await share.encode(record);
  assert.match(code,/^1\.[\w-]+$/);
  assert(code.length < Buffer.byteLength(JSON.stringify(record)) * .55);
  assert.deepEqual(await share.decode(code),record);
  assert.deepEqual(record,original);
});

test('current deployment path is kept while routing and sharing remove stale payloads',async()=>{
  const code = await share.encode(record);
  for(const base of ['http://127.0.0.1:8770/','https://example.com/SWLArmyBuilderCN/',
    'https://another.example/nested/site/index.html']) {
    const url = share.link(base+'?roster=old&base=debug#army/local',code);
    assert.equal(new URL(url).origin+new URL(url).pathname,base.replace(/\/$/,'/') );
    assert.equal(new URL(url).search,'');
    assert.deepEqual(await share.readRequest(share.request(url)),record);
    const route = share.route(url,share.rosterRoute(record));
    assert.equal(route,new URL(base).pathname+'#faction/4/army/local-roster');
    assert.deepEqual(share.navigation(new URL(route,base).hash),{id:record.id});
  }
  assert.deepEqual(share.navigation('#army/old%20local'),{id:'old local'});
  assert.deepEqual(share.navigation('#faction/8'),{factionId:8});
  assert.equal(share.request('https://example.com/#home'),null);
});

test('legacy query links support the first parameter, literal plus, escaped base64 and Unicode JSON',async()=>{
  const json = JSON.stringify(record), raw = 'z:'+deflateRawSync(json).toString('base64');
  assert(raw.includes('+'),'fixture includes plus to catch URLSearchParams space conversion');
  for(const query of ['roster='+raw,'extra=yes&roster='+encodeURIComponent(raw),
    'roster=j:'+encodeURIComponent(json),'roster='+encodeURIComponent(json)]) {
    assert.deepEqual(await share.readRequest(share.request('https://example.com/?'+query)),record);
  }
});

test('invalid, truncated and overlarge shares are rejected before a roster can be saved',async()=>{
  for(const code of ['', '2.abc','1.','1.a','1.ab+/', '1.'+'a'.repeat(256*1024)])
    await assert.rejects(share.decode(code));
  const code = await share.encode(record);
  await assert.rejects(share.decode(code.slice(0,-8)));
  const zip = text => '1.'+deflateSync(text).toString('base64url');
  await assert.rejects(share.decode(zip('not json')), /JSON/);
  await assert.rejects(share.decode(zip('{"name":"not an army"}')), /军表/);
  await assert.rejects(share.decode(zip(' '.repeat(1024*1024+1))), /过大/);
  await assert.rejects(share.encode({...record,name:'x'.repeat(1024*1024)}), /过大/);
});

test('unsupported compression reports an actionable error rather than silently generating raw JSON links',async()=>{
  const original=global.CompressionStream;
  try {global.CompressionStream=undefined;await assert.rejects(share.encode(record),/浏览器.*JSON/);}
  finally {global.CompressionStream=original;}
});
