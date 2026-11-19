const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
global.window = global;
require('../dice-enums.js');require('../upgrade-faces.js');require('../rules-core.js');require('../builder-library.js');
const root=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const data={pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),
  units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:Object.fromEntries(read('upgrades').cards.map(u=>[u.id,u]))};

test('draft battle forces stay editable in the catalog but do not become playable choices',()=>{
  for(const [id,parent] of [[27,2],[28,4],[29,1]]) {
    assert(data.defs.armies.some(a=>a.id===id));
    assert.equal(BuilderLibrary.factionOf(id,data),parent);
    assert(!BuilderLibrary.battleforces(parent,data).some(a=>a.id===id));
    for(const unit of Object.values(data.units))
      assert.equal(RulesCore.armyRank(unit,id,data.pkg,data.defs,data.units),null);
  }
  assert(BuilderLibrary.battleforces(4,data).some(a=>a.id===21));
  assert.equal(data.pkg.battleForces[21].name,'Wookiee Defenders');
  assert.equal(data.pkg.battleForces[21].pendingRevision.name,'Wookiee War Grove');
});

test('an imported draft is explicitly unimplemented in both rule engines',()=>{
  const armies=[27,28,29].map(armyId=>({armyId,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]}));
  const js=armies.map(a=>RulesCore.validateArmy(a,data).issues.filter(i=>i.code==='battle_force_draft'));
  const py=spawnSync('python',['-c',
    'import json,sys,rules; print(json.dumps([[i for i in rules.validate_army(a)["issues"] if i["code"] == "battle_force_draft"] for a in json.load(sys.stdin)],ensure_ascii=True))'],
    {cwd:root,input:JSON.stringify(armies),encoding:'utf8'});
  assert.equal(py.status,0,py.stderr);
  const python=JSON.parse(py.stdout);
  assert.deepEqual(python,js);
  for(const issues of js){assert.equal(issues.length,1);assert.equal(issues[0].status,'unknown');}
});
