const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
global.window = global;
require('../battleforce-v2.js');require('../battleforce-runtime.js');require('../dice-enums.js');require('../upgrade-faces.js');require('../rules-core.js');require('../builder-library.js');
const root=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8'));
const data={pkg:read('slot-rules'),defs:read('catalog-definitions'),ttsNames:read('tts-names'),
  units:Object.fromEntries(read('units').units.map(u=>[u.id,u])),upgrades:Object.fromEntries(read('upgrades').cards.map(u=>[u.id,u]))};
// Exercise draft isolation independently of which live definitions have shipped.
data.pkg.battleForces[27].status='draft';

test('draft battle forces stay editable in the catalog but do not become playable choices',()=>{
  for(const [id,parent] of [[27,2]]) {
    assert(data.defs.armies.some(a=>a.id===id));
    assert.equal(BuilderLibrary.factionOf(id,data),parent);
    assert(!BuilderLibrary.battleforces(parent,data).some(a=>a.id===id));
    for(const unit of Object.values(data.units))
      assert.equal(RulesCore.armyRank(unit,id,data.pkg,data.defs,data.units),null);
  }
  assert(BuilderLibrary.battleforces(4,data).some(a=>a.id===21));
  assert.equal(data.pkg.battleForces[21].name,'Wookiee War Grove');
  assert.equal(data.pkg.battleForces[21].engineVersion,2);
});

test('an imported draft is explicitly unimplemented in both rule engines',()=>{
  const armies=[27].map(armyId=>({armyId,mode:'standard',pointsLimit:1000,units:[],commandIds:[],options:[]}));
  const js=armies.map(a=>RulesCore.validateArmy(a,data).issues.filter(i=>i.code==='battle_force_draft'));
  const py=spawnSync('python',['-X','utf8','-c',
    'import json,sys,rules; from unittest.mock import patch; payload=json.load(sys.stdin); p=patch.object(rules,"load_package",return_value=payload["pkg"]); p.start(); print(json.dumps([[i for i in rules.validate_army(a)["issues"] if i["code"] == "battle_force_draft"] for a in payload["armies"]],ensure_ascii=True)); p.stop()'],
    {cwd:root,input:JSON.stringify({armies,pkg:data.pkg}),encoding:'utf8'});
  assert.equal(py.status,0,py.stderr);
  const python=JSON.parse(py.stdout);
  assert.deepEqual(python,js);
  for(const issues of js){assert.equal(issues.length,1);assert.equal(issues[0].status,'unknown');}
});
