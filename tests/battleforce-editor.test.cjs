/* Real browser form regression. Save requests are intercepted; catalogs are
 * never written. The separate Python suite verifies actual atomic persistence. */
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const {createServer}=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let browser,server,base,original;
before(async()=>{
  original=JSON.parse(await readFile(path.join(root,'data/slot-rules.json'),'utf8'));
  if(process.env.BUILDER_TEST_URL)base=process.env.BUILDER_TEST_URL.replace(/\/?$/,'/');
  else {
    server=createServer(async(req,res)=>{
      const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}
      catch{res.writeHead(404).end();}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}/`;
  }
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function setup(t,mobile=false){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[],state={rules:structuredClone(original),sent:[],conflict:false};
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/slot-rules',r=>r.fulfill({json:{rules:state.rules,revision:'rules-revision',definitionsRevision:'definitions-revision'}}));
  await page.route('**/api/slot-rules/save',async r=>{
    const body=r.request().postDataJSON();state.sent.push(body);
    if(state.conflict)return r.fulfill({status:409,json:{error:'规则文件已被修改'}});
    state.rules=structuredClone(body.rules);return r.fulfill({json:{rules:state.rules,revision:'saved-revision',definitionsRevision:'definitions-revision'}});
  });
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  await page.goto(base+'battleforce-editor.html#28');
  await page.waitForFunction(()=>document.querySelector('#force-list button')&& !document.querySelector('#save').disabled);
  assert.equal(await page.locator('#config-issues').innerText(),'');
  return {page,state};
}
async function pick(page,name,text,scope=page){
  await scope.getByRole('button',{name,exact:true}).click();
  const panel=page.locator('.combo-panel:not([hidden])');
  const option=panel.getByRole('option').filter({hasText:text}).first();
  await option.click();
}
const tab=(page,name)=>page.locator(`[data-section=${name}]`).click();
const mod=page=>page.locator('[data-modifier-id]').last();
async function addDiscount(page){
  await tab(page,'common');await page.getByRole('button',{name:'＋ 属性修改',exact:true}).click();
  await mod(page).locator('summary').click();
  await mod(page).getByRole('spinbutton',{name:'数值',exact:true}).fill('-5');
  await mod(page).getByRole('button',{name:'添加条件',exact:true}).click();
  await pick(page,'条件字段','unit.id',mod(page));
  await pick(page,'条件值 1','republic-barc',mod(page));
}
for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} V2 forces and tabs load without overflow or marking preview dirty`,async t=>{
  const {page}=await setup(t,mobile);
  for(const id of ['21','27','28','29']){
    await page.locator(`[data-force-id="${id}"]`).click();
    for(const section of ['base','common','groups','schemes','preview']){
      await tab(page,section);
      assert.equal(await page.locator('#status').innerText(),'');
      assert.equal(await page.locator('#config-issues').innerText(),'');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+'/'+section);
    }
  }
  assert.equal(await page.locator('#dirty').innerText(),'');
});
test('unsaved modifier previews real points and saves only that force with revision checks',async t=>{
  const {page,state}=await setup(t);await addDiscount(page);
  const currentId=await mod(page).getAttribute('data-modifier-id');
  await pick(page,'修改属性','升级槽位',mod(page));
  assert.equal(await mod(page).getAttribute('open'),'');
  await pick(page,'修改属性','费用',mod(page));
  await pick(page,'修改方式','增加',mod(page));
  await mod(page).getByRole('spinbutton',{name:'数值',exact:true}).fill('-5');
  await tab(page,'preview');await pick(page,'测试单位','BARC');
  const values=await page.locator('.bfv-table tr').nth(1).locator('td').allTextContents();
  assert.equal(parseInt(values[1]),parseInt(values[0])-5);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='已保存');
  assert.equal(state.sent.length,1);assert.equal(state.sent[0].revision,'rules-revision');
  assert.equal(state.sent[0].definitionsRevision,'definitions-revision');
  const effect=state.rules.battleForces['28'].v2.common.modifiers.find(m=>m.id===currentId);
  assert.equal(effect.value,-5);assert.equal(effect.target.all[0].value,'republic-barc');
  for(const [id,bf] of Object.entries(original.battleForces))if(id!=='28')assert.deepEqual(state.rules.battleForces[id],bf);
});
test('local entry dialog handles searchable conditions, cancel, and target deletion',async t=>{
  const {page,state}=await setup(t);await tab(page,'groups');await page.locator('[data-group-id=ccb_wise]').click();
  await page.getByRole('button',{name:'编辑词条',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('简写规则',{exact:true}).fill('取消的修改');
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'取消',exact:true}).click();
  assert.equal(await page.locator('#dirty').innerText(),'');
  await page.getByRole('button',{name:'编辑词条',exact:true}).click();dialog=page.getByRole('dialog');
  assert.notEqual(await dialog.getByLabel('简写规则',{exact:true}).inputValue(),'取消的修改');
  await dialog.getByLabel('简写规则',{exact:true}).fill('已校对简写');
  await pick(page,'条件字段','unit.unitSubtypeId',dialog);
  await pick(page,'条件值 1','克隆人士兵',dialog);
  await dialog.locator('fieldset > .rule-item > button').filter({hasText:/^删除$/}).click();
  await dialog.getByRole('button',{name:'应用词条',exact:true}).click();
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='已保存');
  const entry=state.rules.battleForces['28'].v2.ruleGroups.find(g=>g.id==='ccb_wise').entries[0];
  assert.equal(entry.summary,'已校对简写');assert.deepEqual(entry.target,{any:[]});
});

test('V2 keyword modifiers offer scoped temporary entries and preserve the local keyword ID',async t=>{
  const {page,state}=await setup(t);await tab(page,'groups');await page.locator('[data-group-id=ccb_decisive]').click();
  await page.getByRole('button',{name:'＋ 属性修改',exact:true}).click();
  const modifier=page.locator('[data-modifier-id]').last();await modifier.locator('summary').click();
  await pick(page,'修改属性','单位／升级词条',modifier);
  await pick(page,'词条','临时词条 · 果决',modifier);
  assert.equal(await page.locator('.combo-panel:not([hidden])').count(),0);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='已保存');
  const effect=state.rules.battleForces['28'].v2.ruleGroups.find(g=>g.id==='ccb_decisive').modifiers.at(-1);
  assert.equal(effect.field,'keywords');assert.equal(effect.value.id,'bf:28:ccb_decisive-rule');
});

for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} local entries default to no automatic assignment and can clear all-unit or conditional distribution`,async t=>{
  const {page,state}=await setup(t,mobile);await tab(page,'groups');await page.locator('[data-group-id=ccb_superior_arc_training]').click();
  await page.getByRole('button',{name:'＋ 局部词条',exact:true}).click();
  let dialog=page.getByRole('dialog');
  assert.equal(await dialog.getByRole('button',{name:'分配给单位',exact:true}).locator('.combo-label').innerText(),'不自动分配');
  await dialog.getByLabel('词条中文名称',{exact:true}).fill('测试局部词条');
  await dialog.getByRole('button',{name:'应用词条',exact:true}).click();
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='已保存');
  const group=()=>state.rules.battleForces[28].v2.ruleGroups.find(g=>g.id==='ccb_superior_arc_training');
  const entryId=group().entries.at(-1).id;assert.deepEqual(group().entries.at(-1).target,{any:[]});
  const edit=async()=>{await page.getByRole('button',{name:'编辑词条',exact:true}).last().click();return page.getByRole('dialog');};
  const applySave=async()=>{await dialog.getByRole('button',{name:'应用词条',exact:true}).click();await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='已保存');};
  dialog=await edit();await pick(page,'分配给单位','所有单位',dialog);await applySave();assert.deepEqual(group().entries.at(-1).target,{all:[]});
  dialog=await edit();await pick(page,'分配给单位','不自动分配',dialog);await applySave();assert.deepEqual(group().entries.at(-1).target,{any:[]});
  dialog=await edit();await pick(page,'分配给单位','按条件分配',dialog);
  await pick(page,'条件字段','unit.id',dialog);await pick(page,'条件值 1',/republic-arc-troopers$/,dialog);
  await applySave();assert.equal(group().entries.at(-1).target.all[0].value,'republic-arc-troopers');
  dialog=await edit();await dialog.locator('.condition-leaf > button').filter({hasText:/^删除$/}).click();
  assert.equal(await dialog.getByRole('button',{name:'分配给单位',exact:true}).locator('.combo-label').innerText(),'不自动分配');
  if(process.env.BUILDER_QA_SCREENSHOTS)await page.screenshot({path:path.join(process.env.BUILDER_QA_SCREENSHOTS,`local-entry-${mobile?'mobile':'desktop'}-editor.png`)});
  await applySave();assert.deepEqual(group().entries.at(-1).target,{any:[]});
  assert.equal(group().entries.at(-1).id,entryId);assert.deepEqual(group().modifiers,original.battleForces[28].v2.ruleGroups.find(g=>g.id===group().id).modifiers);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
});

test('keyword picker excludes temporary entries owned by another V2 force',async t=>{
  const {page}=await setup(t);await tab(page,'groups');await page.locator('[data-group-id=ccb_decisive]').click();
  await page.getByRole('button',{name:'＋ 属性修改',exact:true}).click();
  const modifier=page.locator('[data-modifier-id]').last();await modifier.locator('summary').click();
  await pick(page,'修改属性','单位／升级词条',modifier);await modifier.getByRole('button',{name:'词条',exact:true}).click();
  const options=page.locator('.combo-panel:not([hidden]) .combo-option');
  assert.equal(await options.filter({hasText:'临时词条 · 果决'}).count(),1);
  assert.equal(await options.filter({hasText:/临时词条.*非正规军/}).count(),0);
});
test('selection counts block invalid saves; copied groups get new IDs and deleted references are removed',async t=>{
  const {page,state}=await setup(t);await tab(page,'schemes');
  await page.getByRole('spinbutton',{name:'最多选择',exact:true}).first().fill('99');await page.locator('#save').click();
  assert.equal(state.sent.length,0);assert.match(await page.locator('#config-issues').innerText(),/选择数量/);
  await page.getByRole('spinbutton',{name:'最多选择',exact:true}).first().fill('1');
  await tab(page,'groups');await page.locator('[data-group-id=ccb_reinforced]').click();
  await page.getByRole('button',{name:'复制规则组',exact:true}).click();
  const copied=await page.locator('.bfv-group-nav button[aria-pressed=true]').getAttribute('data-group-id');
  await page.locator('[data-group-id=ccb_scout]').click();page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'删除规则组',exact:true}).click();
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='已保存');
  const v2=state.rules.battleForces['28'].v2;
  assert(!v2.ruleGroups.some(g=>g.id==='ccb_scout'));
  assert(!v2.selectionSchemes.some(s=>s.groups.some(g=>g.ruleGroupIds.includes('ccb_scout'))));
  const clone=v2.ruleGroups.find(g=>g.id===copied),old=v2.ruleGroups.find(g=>g.id==='ccb_reinforced');
  assert(clone);assert.notEqual(clone.modifiers[0].id,old.modifiers[0].id);assert.notEqual(clone.entries[0].id,old.entries[0].id);
});
test('conflicts and fresh catalogs preserve draft; new local card appears without reloading rules',async t=>{
  const {page,state}=await setup(t);state.conflict=true;
  await page.getByLabel('部队中文名称',{exact:true}).fill('保留此草稿');await page.locator('#save').click();
  await page.locator('#save-banner').waitFor();assert.match(await page.locator('#save-banner').innerText(),/草稿仍在/);
  const units=JSON.parse(await readFile(path.join(root,'data/units.json'),'utf8'));
  units.units.push({...structuredClone(units.units[0]),id:'new-local-editor-test',name:{en:'New Editor Card',zh:'新加入的测试卡'}});
  await page.route('**/data/units.json',r=>r.fulfill({json:units}));
  await page.locator('#refresh-catalogs').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已刷新'));
  assert.equal(await page.getByLabel('部队中文名称',{exact:true}).inputValue(),'保留此草稿');
  await tab(page,'common');await page.getByRole('button',{name:'选择许可单位',exact:true}).click();
  assert(await page.getByText('新加入的测试卡',{exact:false}).count());
  assert.equal(await page.locator('#dirty').innerText(),'未保存');
});
test('preview equipment activates and removes the same conditional keyword as the builder without saving',async t=>{
  const {page,state}=await setup(t);await tab(page,'preview');
  for(const label of ['突击','果决','装甲支援'])await page.getByRole('button',{name:label,exact:true}).click();
  const unit=JSON.parse(await readFile(path.join(root,'data/units.json'),'utf8')).units.find(u=>u.id==='republic-clone-trooper');
  const upgrade=JSON.parse(await readFile(path.join(root,'data/upgrades.json'),'utf8')).cards.find(c=>c.id==='clone-miniature');
  await pick(page,'测试单位',new RegExp('^'+unit.name.zh+'$'));
  let names=await page.locator('select').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
  const personnel=names.find(n=>/^人员 /.test(n));assert(personnel);
  assert(!await page.locator('.bfv-table').innerText().then(t=>t.includes('机械化步兵')));
  await pick(page,personnel,upgrade.name.zh+' · ');
  assert.match(await page.locator('.bfv-table').innerText(),/机械化步兵/);
  await pick(page,personnel,'不装备');
  assert(!await page.locator('.bfv-table').innerText().then(t=>t.includes('机械化步兵')));
  assert.equal(await page.locator('#dirty').innerText(),'');assert.equal(state.sent.length,0);
});
