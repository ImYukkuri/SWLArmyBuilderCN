/* Optional real-browser regression: npm run test:scroll (requires Playwright).
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE may point at an existing Chrome installation.
 * BUILDER_TEST_URL can target the real local server. Requests remain read-only;
 * browser storage is isolated and discarded.
 */
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const {readFile} = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
let server, browser, base;
const root = path.resolve(__dirname, '..');
before(async () => {
  // Also run against the real local server to catch missing runtime routes.
  if (process.env.BUILDER_TEST_URL) {
    base = process.env.BUILDER_TEST_URL.replace(/\/?$/, '/');
  } else {
    server = createServer(async (req, res) => {
      const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname).replace(/\/$/, '/index.html'));
      if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
      try {
        const body = await readFile(file);
        res.setHeader('Content-Type', {'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json',
          '.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf'}[path.extname(file)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');res.end(body);
      } catch {res.writeHead(404).end();}
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined});
});
after(async () => {await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));});

async function setup(t, mobile = true) {
  const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1440,height:1000},
    isMobile:mobile,hasTouch:mobile});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => {await context.close();assert.deepEqual(errors, []);});
  await page.goto(base);await page.waitForFunction(() => typeof data !== 'undefined' && data);
  await page.evaluate(() => {
    const record = BuilderLibrary.create(1, 'Scroll regression', data, uid, new Date().toISOString());
    record.army.units = Object.values(data.units).filter(u => !u.isCounterpart && u.usage !== 'counterpart' &&
      u.factionId === 1 && u.upgradeSlots?.length).slice(0,18).map(u => ({unitId:u.id,instanceId:uid(),upgrades:[]}));
    openRoster(record);
  });
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function frames(page) {await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));}
async function positionAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();await frames(page);
  const y = await page.evaluate(() => scrollY);assert(y > 600, 'probe must be well below the page header');return y;
}
async function samePosition(page, y) {
  await frames(page);
  assert(Math.abs(await page.evaluate(() => scrollY) - y) <= 2, `page should stay at ${y}`);
  assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), false);
}
const unit = page => page.locator('#army-units > .roster-unit').nth(10);

for(const mobile of [true,false]) test(`${mobile?'mobile':'desktop'} battle force group info preserves choices and keyword sources`,async t=>{
  const page=await setup(t,mobile);
  await page.evaluate(()=>openRoster(BuilderLibrary.create(4,'Rule group regression',data,uid,new Date().toISOString())));
  await page.selectOption('#battleforce','28');
  const choice=page.locator('.army-option-tag[data-option-id="ccb_decisive"]');
  const info=page.locator('.army-option-info[data-rule-group-id="ccb_decisive"]');
  const before=await page.evaluate(()=>JSON.stringify(army));
  await info.click();
  const dialog=page.locator('.battleforce-dialog');
  assert.equal(await dialog.isVisible(),true);
  assert.equal(await dialog.locator('h2').innerText(),'果决');
  assert((await dialog.innerText()).includes('绝地武士'));
  assert.equal(await page.evaluate(()=>JSON.stringify(army)),before,'reading a rule must not choose it');
  await page.keyboard.press('Escape');await frames(page);
  assert.equal(await info.evaluate(n=>n===document.activeElement),true);
  for(const id of ['ccb_assault','ccb_reinforced','ccb_decisive']) await page.locator(`.army-option-tag[data-option-id="${id}"]`).click();
  assert.equal(await choice.getAttribute('aria-pressed'),'true');
  await info.click();await dialog.getByRole('button',{name:'关闭战斗部队规则'}).click();
  assert.equal(await choice.getAttribute('aria-pressed'),'true','info must not deselect a rule');
  await page.locator('#rank-add-bar [data-rank="6"]').click();
  const candidate=page.locator('#card-grid [data-id="republic-jedi-knight"]');
  const local=candidate.locator('[data-rule-id="bf:28:ccb_decisive-rule"]');
  assert.equal(await local.locator('.rule-origin').innerText(),'来自 自定义克隆人战斗营');
  await candidate.locator('.bilingual-name').click();
  const roster=page.locator('#army-units > .roster-unit').first();
  await roster.locator('.expand-unit').click();
  await roster.locator('[data-rule-id="bf:28:ccb_decisive-rule"] .rule-tag-main').click();
  assert.equal(await page.locator('#keyword-popover .rule-origin').innerText(),'来自 自定义克隆人战斗营');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

for(const mobile of [true,false]) test(`${mobile?'mobile':'desktop'} irregular summaries show matching phases, sources and real symbols`,async t=>{
  const page=await setup(t,mobile);
  await page.evaluate(()=>openRoster(BuilderLibrary.create(1,'Irregulars regression',data,uid,new Date().toISOString())));
  await page.selectOption('#battleforce','29');
  await page.locator('#rank-add-bar [data-rank="6"]').click();
  const candidate=page.locator('#card-grid [data-id="rebels-cassian"]');
  assert.equal(await candidate.locator('[data-rule-id^="bf:29:"]').count(),2);
  assert.equal(await candidate.locator('[data-rule-id="field_commander"] .rule-origin').innerText(),'来自 非正规军');
  await candidate.locator('.bilingual-name').click();
  const roster=page.locator('#army-units > .roster-unit').first();
  await roster.locator('.expand-unit').click();
  assert.equal(await roster.locator('[data-phase="global"] [data-rule-id="bf:29:irregulars"]').count(),1);
  const operative=roster.locator('[data-phase="activation_start"] [data-rule-id="bf:29:undisciplined-operative"]');
  await operative.locator('.rule-tag-toggle').click();
  assert.equal(await operative.locator('[data-rule-icon="range-half"]').count(),3);
  assert.equal(await operative.locator('[data-rule-icon="hit"]').count(),1);
  assert.equal(await operative.locator('[data-rule-icon="critical"]').count(),1);
  await operative.locator('.rule-tag-main').click();
  assert.equal(await page.locator('#keyword-popover [role="tab"][aria-selected="true"]').innerText(),'简写');
  assert((await page.locator('#rule-text-panel').innerText()).includes('扔5颗黑攻击骰'));
  await page.getByRole('button',{name:'关闭词条',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

for(const mobile of [true,false]) test(`${mobile?'mobile':'desktop'} symbol drawer preserves selection, inserts real tokens and copies without changing text`,async t=>{
  const page=await setup(t,mobile);
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto(base+'keywords.html');await page.locator('#keyword-list button').first().click();
  const input=page.locator('#summary'),panel=page.locator('#editor-symbols');
  await input.fill('开头替换结尾');await input.evaluate(n=>{n.focus();n.setSelectionRange(2,4);});
  const pageY=await page.evaluate(()=>scrollY);
  await page.locator('#editor-symbols-toggle').click();
  assert.equal(await panel.getAttribute('aria-modal'),'false');
  await page.getByRole('searchbox',{name:'查找图标',exact:true}).fill('飞机');
  assert.equal(await panel.locator('[data-rule-icon="rank-flier"]').count(),1);
  await panel.locator('[data-symbol="rank-flier"]').click();
  assert.equal(await input.inputValue(),'开头{@icon.rank-flier}结尾');
  assert.equal(await page.locator('#preview-text [data-rule-icon="rank-flier"]').count(),1);
  assert((await page.locator('#dirty').innerText()).includes('未保存'));
  await page.getByRole('searchbox',{name:'查找图标',exact:true}).fill('range-half');
  await panel.locator('[data-symbol="range-half"]').click();
  const inserted='开头{@icon.rank-flier}{@icon.range-half}结尾';
  assert.equal(await input.inputValue(),inserted);
  assert.equal(await page.evaluate(()=>scrollY),pageY,'drawer must not scroll the page');
  await panel.getByRole('button',{name:'复制文本',exact:true}).click();
  await panel.locator('[data-symbol="range-half"]').click();
  await page.waitForFunction(()=>document.querySelector('.editor-symbols-feedback').textContent.startsWith('已复制'));
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'{@icon.range-half}');
  assert.equal(await input.inputValue(),inserted);
  await page.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);
  assert.equal(await input.evaluate(n=>document.activeElement===n),true);
  // Verify the normal save path receives the inserted text, without writing source files.
  let saved;
  await page.route('**/api/keywords/save',route=>{saved=route.request().postDataJSON();return route.fulfill({status:400,
    contentType:'application/json',body:JSON.stringify({error:'测试已截获保存，不写入源文件'})});});
  await Promise.all([page.waitForResponse('**/api/keywords/save'),page.locator('#save').click()]);
  assert.equal(saved.card.summary,inserted);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

test('symbol reference loads in every editor and refuses stale, search and numeric insertion targets',async t=>{
  const page=await setup(t,false);
  for(const file of ['units','upgrades','commands','armies','rules','keywords']){
    await page.goto(base+file+'.html');await page.locator('#editor-symbols-toggle').click();
    const panel=page.locator('#editor-symbols');
    await page.getByRole('combobox',{name:'图标类别',exact:true}).selectOption('军阶');
    assert.equal(await panel.locator('.editor-symbol-option').count(),7,file);
    assert.equal(await panel.locator('[data-rule-icon="rank-flier"]').count(),1,file);
    await page.getByRole('button',{name:'关闭图标参考',exact:true}).click();
  }
  await page.locator('#keyword-list button').first().click();
  await page.locator('#summary').focus();
  await page.locator('#keyword-list button').nth(1).click();
  const next=await page.locator('#summary').inputValue();
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('#editor-symbols-toggle').click();
  await page.getByRole('combobox',{name:'图标类别',exact:true}).selectOption('');
  await page.locator('#editor-symbols [data-symbol="hit"]').click();
  await page.waitForFunction(()=>document.querySelector('.editor-symbols-feedback').textContent.startsWith('已复制'));
  assert.equal(await page.locator('#summary').inputValue(),next,'switching cards must forget the old caret');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'{@icon.hit}');
  await page.getByRole('button',{name:'关闭图标参考',exact:true}).click();
  await page.goto(base+'upgrades.html');await page.locator('#list button').first().click();
  const points=page.getByRole('spinbutton',{name:'点数',exact:true}),value=await points.inputValue();
  await points.focus();await page.locator('#editor-symbols-toggle').click();
  await page.locator('#editor-symbols [data-symbol="hit"]').click();
  assert.equal(await points.inputValue(),value);
  // Clipboard rejection leaves the exact token selected for manual copying.
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}});
    document.execCommand=()=>false;
  });
  await page.locator('#editor-symbols [data-symbol="critical"]').click();
  assert.equal(await page.getByRole('textbox',{name:'手动复制图标标记',exact:true}).inputValue(),'{@icon.critical}');
  assert((await page.locator('.editor-symbols-feedback').innerText()).includes('复制未完成'));
});

test('224 placeholder cards load in both maintenance editors without missing metadata',async t=>{
  const page=await setup(t,false);
  await page.goto(base+'upgrades.html');await page.locator('#list button').first().waitFor();
  await page.locator('#search').fill('frontal-assault');
  await page.locator('#list button[data-id="frontal-assault"]').click();
  assert.equal(await page.locator('#title').innerText(),'正面突击');
  assert((await page.locator('#issues').innerText()).includes('缺少卡文'));
  await page.locator('[data-tab="rules"]').click();
  assert((await page.locator('#rule-editor').innerText()).includes('帝国军官'));
  await page.goto(base+'commands.html');await page.locator('#list button').first().waitFor();
  const commands=await page.evaluate(async()=> (await (await fetch('/data/catalog-definitions.json')).json()).commands);
  for(const id of ['over-the-top','in-the-trenches','creeping-barrage']) {
    await page.locator('#search').fill(id);await page.locator('#list button').first().click();
    assert.equal(await page.locator('#title').innerText(),commands.find(c=>c.id===id).name.zh);
  }
});

for(const mobile of [true,false]) test(`${mobile?'mobile':'desktop'} 224 rank entries, extra copies and editable cards`,async t=>{
  const page=await setup(t,mobile),officer='empire-imperial-officer-ruthless-efficiency';
  await page.evaluate(()=>openRoster(BuilderLibrary.create(2,'224 browser regression',data,uid,new Date().toISOString())));
  await page.selectOption('#battleforce','27');
  assert((await page.locator('#rank-add-bar [data-rank="2"]').innerText()).includes('/7'));
  await page.selectOption('#points-limit','600');
  assert((await page.locator('#rank-add-bar [data-rank="2"]').innerText()).includes('/5'));
  await page.selectOption('#points-limit','1000');
  const add=async(rank,id)=>{
    await page.locator(`#rank-add-bar [data-rank="${rank}"]`).click();
    await page.locator(`#card-grid [data-id="${id}"] .bilingual-name`).click();
  };
  await add(3,'empire-riot-squad-trench-buster');
  assert.equal(await page.evaluate(()=>RulesCore.validateArmy(army,data).rankCounts[3]),1);
  await add(1,officer);
  const commanders=()=>page.locator('#army-units > .roster-unit').filter({hasText:'Ruthless Efficiency'});
  await commanders().first().locator('[data-slot-index="0"] .slot-name').click();
  await page.locator('#card-grid [data-id="academy-trained"] .identity h3').click();
  await page.locator('#browser-close').click();
  await commanders().first().locator('.copy-unit').click();
  assert.deepEqual(await commanders().first().locator('.instance-controls>*').evaluateAll(ns=>ns.map(n=>n.className)),
    ['remove-unit','group-count','copy-unit']);
  assert.equal(await page.evaluate(()=>army.units.flatMap(i=>i.upgrades).filter(c=>c.upgradeId==='academy-trained').length),2);
  await add(1,officer);
  await commanders().last().locator('[data-slot-index="0"] .slot-name').click();
  await page.locator('#show-unavailable').check();
  assert.equal(await page.locator('#card-grid [data-id="academy-trained"]').getAttribute('data-state'),'blocked');
  const frontal=page.locator('#card-grid [data-id="frontal-assault"]');
  assert.equal(await frontal.getAttribute('data-state'),'available');assert((await frontal.innerText()).includes('Frontal Assault'));
  await frontal.locator('.identity h3').click();await page.locator('#browser-close').click();
  for(const id of ['over-the-top','in-the-trenches','creeping-barrage']) {
    const pips=await page.evaluate(id=>data.defs.commands.find(c=>c.id===id).pips,id);
    await page.locator('#deck-panel .empty-command').filter({hasText:pips+' 牌点指挥卡'}).first().click();
    await page.locator('#show-unavailable').uncheck();
    const candidate=page.locator(`#card-grid [data-id="${id}"]`);
    assert.equal(await candidate.getAttribute('data-state'),'available');
    assert((await candidate.innerText()).includes('命令对象'));
    await candidate.locator('.command-overlay').click();
    if(await page.evaluate(()=>!!browser)) await page.locator('#browser-close').click();
  }
  await page.evaluate(()=>saveActiveRoster());await page.reload();
  await page.waitForFunction(()=>typeof army!=='undefined'&&army?.armyId===27&&army.units.length===4);
  assert.equal(await page.locator('#deck-panel .command-chosen').count(),3);
  assert.equal(await page.evaluate(()=>army.units.flatMap(i=>i.upgrades).filter(c=>c.upgradeId==='academy-trained').length),2);
  await page.selectOption('#battleforce','2');
  assert.equal(await page.evaluate(()=>!!data.pkg._v2),false);
  assert.equal(await page.evaluate(()=>army.units.length),0);
  assert.equal(await page.locator('#army-units > .roster-unit').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

for (const mobile of [true,false]) test(`${mobile?'mobile':'desktop'} V2 choices, ranks, weapon effects and save/reopen work through builder controls`,async t=>{
  const page=await setup(t,mobile);
  await page.evaluate(()=>openRoster(BuilderLibrary.create(4,'V2 browser regression',data,uid,new Date().toISOString())));
  await page.selectOption('#battleforce','28');
  assert.deepEqual(await page.locator('.v2-trait-group .army-option-tags').evaluateAll(ns=>ns.map(n=>n.children.length)),[3,3,6]);
  for(const id of ['ccb_assault','ccb_decisive','ccb_reinforced']) await page.locator(`[data-option-id="${id}"]`).click();
  const add=async(rank,id)=>{
    await page.locator(`#rank-add-bar [data-rank="${rank}"]`).click();
    await page.locator(`#card-grid [data-id="${id}"] .bilingual-name`).click();
    if(mobile)assert.equal(await page.locator('html').evaluate(n=>n.classList.contains('page-overlay-open')),false);
  };
  await page.locator('#rank-add-bar [data-rank="1"]').click();
  assert.equal(await page.locator('#card-grid [data-id="republic-barc"]').count(),0);
  await page.locator('#browser-close').click();
  await add(1,'republic-clone-commander-leadership');await add(4,'republic-barc');await add(1,'republic-jedi-knight-general');
  assert.deepEqual(await page.evaluate(()=>army.units.map(i=>i.rankId)),[1,4,1]);
  const general=page.locator('#army-units .roster-unit').filter({hasText:'绝地武士将军'});
  await general.locator('[data-slot-index="5"] .slot-name').click();
  const lightsaber=page.locator('#card-grid [data-id="lightsaber"]');
  assert((await lightsaber.innerText()).includes('致命1'));
  await lightsaber.locator('.identity h3').click();
  await page.locator('#browser-close').click();
  await general.locator('.expand-unit').click();
  assert((await general.innerText()).includes('致命1'));
  await general.locator('[data-rule-id="bf:28:ccb_decisive-rule"] .rule-tag-main').click();
  assert((await page.locator('#keyword-popover').innerText()).includes('近战武器'));
  await page.keyboard.press('Escape');
  // Save uses normal builder storage; reloading keeps all three choices and the unit ranks.
  const choices=await page.evaluate(()=>{saveActiveRoster();return army.battleForceSelection;});
  await page.reload();await page.waitForFunction(()=>typeof army!=='undefined'&&army?.units?.length===3);
  assert.deepEqual(await page.evaluate(()=>army.battleForceSelection),choices);
  assert.deepEqual(await page.evaluate(()=>army.units.map(i=>i.rankId)),[1,4,1]);
  await page.locator('[data-option-id="ccb_wise"]').click();
  await general.locator('.expand-unit').click();
  assert(!(await general.innerText()).includes('致命1'));
  assert((await general.innerText()).includes('援助：克隆人士兵'));
  await page.selectOption('#battleforce','12');
  assert.equal(await page.locator('#army-options').isVisible(),false);
  assert.equal(await page.evaluate(()=>!!data.pkg._v2),false);
  assert.deepEqual(await page.evaluate(()=>army.units),[]);
  assert.equal(await page.locator('#army-units > .roster-unit').count(),0);
  assert.equal(await page.locator('#points b').innerText(),'0');
  assert.equal(await page.locator('#summary-activations').innerText(),'0');
  await page.evaluate(()=>saveActiveRoster());await page.reload();
  await page.waitForFunction(()=>typeof army!=='undefined'&&army?.armyId===12);
  assert.deepEqual(await page.evaluate(()=>army.units),[]);
  await page.locator('#rank-add-bar [data-rank="1"]').click();
  assert.equal(await page.locator('#card-grid [data-id="republic-barc"]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
});

for(const mobile of [true,false]) test(`${mobile?'mobile':'desktop'} switching base, legacy and V2 forces clears every unit and upgrade`,async t=>{
  const page=await setup(t,mobile);
  for(const [from,to] of [[4,28],[28,4],[28,21],[12,16],[16,28]]) {
    await page.evaluate(({from})=>{
      const record=BuilderLibrary.create(4,'切换部队验证',data,uid,new Date().toISOString());
      record.army.armyId=from;
      record.army.units=[{instanceId:uid(),unitId:'republic-clone-commander-leadership',upgrades:[
        {instanceId:uid(),upgradeId:'command-improvised',slotIndex:0}]}];
      openRoster(record);
    },{from});
    const commands=await page.evaluate(()=>army.commandIds);
    await page.selectOption('#battleforce',String(to));
    assert.equal(await page.evaluate(()=>army.armyId),to);
    assert.deepEqual(await page.evaluate(()=>army.units),[]);
    assert.deepEqual(await page.evaluate(()=>army.commandIds),commands);
    assert.equal(await page.locator('#army-units > .roster-unit').count(),0);
    assert.equal(await page.locator('#points b').innerText(),'0');
    assert.equal(await page.locator('#summary-activations').innerText(),'0');
  }
});

test('V2 trait cancellation removes equipped extra slots and irregulars has Imperial LAAT candidates',async t=>{
  const page=await setup(t,true);
  await page.evaluate(()=>openRoster(BuilderLibrary.create(4,'V2 slots',data,uid,new Date().toISOString())));
  await page.selectOption('#battleforce','28');
  await page.locator('[data-option-id="ccb_reinforced"]').click();
  await page.locator('#rank-add-bar [data-rank="2"]').click();
  await page.locator('#card-grid [data-id="republic-clone-trooper"] .bilingual-name').click();
  const index=await page.evaluate(()=>unitSlotRecords(data.units[army.units[0].unitId],army.units[0]).findIndex(s=>s.effectId==='reinforced-personnel'));
  assert(index>=0);
  await page.locator(`.compact-slot[data-slot-index="${index}"] .slot-name`).click();
  await page.locator('#card-grid [data-id="clone-specialist"] .identity h3').click();
  await page.locator('#browser-close').click();
  await page.locator('[data-option-id="ccb_armored_support"]').click();
  assert.equal(await page.evaluate(()=>army.units[0].upgrades.length),0);
  assert((await page.locator('#status').innerText()).includes('失效槽位'));
  await page.evaluate(()=>openRoster(BuilderLibrary.create(1,'Irregulars',data,uid,new Date().toISOString())));
  await page.selectOption('#battleforce','29');
  await page.locator('#rank-add-bar [data-rank="5"]').click();
  assert.equal(await page.locator('#card-grid [data-id="republic-laat-gar"]').count(),0);
  await page.locator('#card-grid [data-id="empire-laat-empire"] .bilingual-name').click();
  assert.equal(await page.evaluate(()=>RulesCore.unitFor(army.units[0],army,data).factionId),1);
  await page.locator('#rank-add-bar [data-rank="5"]').click();
  assert.equal(await page.locator('#card-grid [data-id="empire-laat-empire"]').count(),0);
  await page.locator('#browser-close').click();
  await page.locator('#battleforce-info').click();
  assert((await page.locator('.battleforce-dialog').innerText()).includes('隐秘破坏者'));
});

for (const width of [320, 390, 1440]) test(`Flier navigation and empty selection at ${width}px`, async t => {
  const page=await setup(t,width<760);
  await page.setViewportSize({width,height:900});
  const add=page.locator('#rank-add-bar [data-rank="7"]'), shortcut=page.locator('#rank-bar [data-rank="7"]');
  assert.equal(await page.locator('#rank-bar button').count(),7);
  assert((await add.innerText()).includes('飞机'));
  assert((await add.innerText()).includes('/2'));
  assert.equal(await shortcut.locator('svg[data-rule-icon="rank-flier"]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await shortcut.click();assert.equal(await shortcut.getAttribute('aria-pressed'),'true');
  assert.equal(await shortcut.locator('.rank-icon').innerText(),'+');
  await shortcut.click();
  assert.equal(await page.evaluate(()=>browser.rank),7);
  assert.equal(await page.locator('#card-grid .candidate').count(),0);
  assert((await page.locator('#card-grid').innerText()).includes('没有可选项目'));
  await page.locator('#browser-close').click();
  await page.evaluate(()=>scrollBy(0,250));await frames(page);
  assert.equal(await shortcut.getAttribute('aria-pressed'),'false');
  assert.equal(await shortcut.locator('svg').count(),1);
  await add.click();assert.equal(await page.evaluate(()=>browser.rank),7);
  await page.locator('#browser-close').click();
  await page.evaluate(()=>{army.pointsLimit=600;army.mode='recon';render();});
  assert((await add.innerText()).includes('/1'));
  await page.evaluate(()=>showBattleForceRules());
  const row=page.locator('.battleforce-quotas tbody tr').filter({hasText:'飞机'});
  assert.equal(await row.count(),1);assert.equal(await row.locator('td').last().innerText(),'1');
  assert.equal(await row.locator('svg[data-rule-icon="rank-flier"]').count(),1);
});

for (const mobile of [true, false]) test(`${mobile ? 'mobile' : 'desktop'} real card headers stick and are pushed away in both scroll directions`, async t => {
  const page = await setup(t, mobile);
  await page.evaluate(() => {for (const inst of army.units) cardView.expanded.add(inst.instanceId); renderUnits();});
  const totals = await page.locator('#roster-info').innerText();
  assert.equal(await page.locator('#current-unit-dock, #current-unit-summary').count(), 0);
  const show = async index => {
    await page.evaluate(index => {
      const card = document.querySelectorAll('#army-units > .roster-unit')[index];
      window.scrollTo({top: scrollY + card.getBoundingClientRect().top - document.querySelector('#roster-info').offsetHeight + 20, behavior: 'instant'});
    }, index);
    await frames(page);
    const card = page.locator('#army-units > .roster-unit').nth(index);
    const head = card.locator(':scope > .unit-brief');
    const bar = await page.locator('#roster-info').boundingBox();
    assert(Math.abs(bar.y) <= 1);
    assert(Math.abs((await head.boundingBox()).y - bar.height) <= 1, 'the original header sticks directly below totals');
    assert.equal(await card.locator('.unit-brief').count(), 1);
    assert.equal(await head.locator('.compact-slots').count(), 0);
    assert.equal(await card.locator(':scope > .compact-slots').count(), 1);
    assert.equal(await page.locator('#roster-info').innerText(), totals);
    const controls = await head.locator('.instance-controls').boundingBox();
    const cost = await head.locator('.brief-cost').boundingBox();
    assert(controls.x >= cost.x + cost.width, 'copy and delete controls follow points');
    if (!mobile) assert((await page.locator('#card-browser').boundingBox()).y >= bar.height);
  };
  for (const index of [0, 1, 2, 3, 9, 10, 9, 3, 2, 1]) await show(index);
  // At the boundary the previous header slides out, never stacking over the next one.
  await page.evaluate(() => {
    const cards = document.querySelectorAll('#army-units > .roster-unit');
    const height = cards[1].querySelector('.unit-brief').offsetHeight;
    scrollTo(0, scrollY + cards[2].getBoundingClientRect().top - document.querySelector('#roster-info').offsetHeight - height / 2);
  }); await frames(page);
  const previous = await page.locator('#army-units > .roster-unit').nth(1).locator(':scope > .unit-brief').boundingBox();
  const next = await page.locator('#army-units > .roster-unit').nth(2).locator(':scope > .unit-brief').boundingBox();
  assert(previous.y < (await page.locator('#roster-info').boundingBox()).height);
  assert(previous.y + previous.height <= next.y + 1, 'neighboring headers do not overlap');
  await show(3);
  const y = await page.evaluate(() => scrollY);
  await page.evaluate(() => renderUnits());await frames(page);
  assert.equal(await page.evaluate(() => scrollY), y);
  // Collapsed cards use the same header and leave only their upgrade slots below it.
  await page.evaluate(() => {cardView.expanded.clear();renderUnits();});
  await show(3);
  await page.evaluate(() => {
    const list = document.querySelector('#army-units');scrollTo(0, scrollY + list.getBoundingClientRect().bottom);
  });await frames(page);
  const last = await page.locator('#army-units > .roster-unit > .unit-brief').last().boundingBox();
  assert(last.y + last.height <= (await page.locator('#roster-info').boundingBox()).height);
  await page.evaluate(() => scrollTo(0,0));await frames(page);
  assert.equal(await page.locator('#roster-heading-tools').isVisible(), true);
  await page.evaluate(() => showLibrary());await frames(page);
  assert.equal(await page.locator('#roster-info').isVisible(), false);
});

for (const mobile of [true, false]) test(`${mobile ? 'mobile' : 'desktop'} rank shortcut jumps, adds on second click and resets on page scroll`, async t => {
  const page = await setup(t, mobile);
  const rank = await page.evaluate(() => Number([...document.querySelectorAll('#rank-bar button')].find(b => Number(b.dataset.count) > 0).dataset.rank));
  const button = page.locator(`#rank-bar [data-rank="${rank}"]`);
  assert(!/军表总分|剩余/.test(await page.locator('#roster-info').innerText()));
  assert.equal(await page.locator('#rank-bar button').count(), 7);
  await page.evaluate(() => scrollTo(0, document.querySelector('#army-units').offsetTop + 1000));await frames(page);
  await button.click();await frames(page);
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await button.locator('.rank-icon').innerText(), '+');
  const target = await page.locator(`#army-units > .roster-unit[data-rank="${rank}"]`).first().boundingBox();
  assert(Math.abs(target.y - (await page.locator('#roster-info').boundingBox()).height) <= 1);
  const y = await page.evaluate(() => scrollY);
  await button.click();await frames(page);
  assert.deepEqual(await page.evaluate(() => ({mode:browser.mode,rank:browser.rank})), {mode:'units',rank});
  await page.locator('#browser-close').click();await samePosition(page,y);
  assert.equal(await button.getAttribute('aria-pressed'), 'true', 'closing a panel is not user scrolling');
  await page.evaluate(() => scrollBy(0,80));await frames(page);
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
  assert.notEqual(await button.locator('.rank-icon').innerText(), '+');
  await button.click();await frames(page);
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => scrollBy(0,-60));await frames(page);
  assert.equal(await button.getAttribute('aria-pressed'), 'false');
});

test('rank counts include merged copies and empty ranks still open the correct add list', async t => {
  const page = await setup(t);
  await page.evaluate(() => {
    const record = BuilderLibrary.create(1, 'Rank counts', data, uid, new Date().toISOString());
    const trooper = Object.values(data.units).find(u => u.name.en === 'Rebel Troopers' && rankOf(u,1) === 2);
    record.army.units = [0,1,2].map(() => ({unitId:trooper.id,instanceId:uid(),upgrades:[]}));
    openRoster(record);
  });
  assert.equal(await page.locator('#army-units > .roster-unit').count(), 1);
  assert.equal(await page.locator('#rank-bar [data-rank="2"] .rank-badge').innerText(), '3');
  assert.equal(await page.locator('#rank-add-bar [data-rank="2"] .rank-total').innerText(), '3');
  assert.equal(await page.locator('#summary-activations').innerText(), '3');
  await page.locator('#army-units .copy-unit').click();
  assert.equal(await page.locator('#rank-bar [data-rank="2"] .rank-badge').innerText(), '4');
  assert.equal(await page.locator('#rank-add-bar [data-rank="2"] .rank-total').innerText(), '4');
  await page.locator('#army-units .remove-unit').click();
  assert.equal(await page.locator('#rank-bar [data-rank="2"] .rank-badge').innerText(), '3');
  assert.equal(await page.locator('#unit-detail-dialog').evaluate(n => n.open), false);
  const zero = page.locator('#rank-bar [data-rank="6"]');
  assert.equal(await zero.locator('.rank-badge').innerText(), '—');
  await zero.click();await frames(page);assert.equal(await zero.getAttribute('aria-pressed'), 'true');
  await zero.click();assert.equal(await page.evaluate(() => browser.rank), 6);
  await page.locator('#browser-close').click();
  await page.evaluate(() => showLibrary());
  await page.evaluate(() => createRoster(2));
  assert.equal(await page.locator('#rank-bar [aria-pressed="true"]').count(), 0);
});

for (const mobile of [true, false]) test(`${mobile ? 'mobile' : 'desktop'} list-top rank buttons open each rank with one click`, async t => {
  const page = await setup(t, mobile);
  const addBar = page.locator('#rank-add-bar');
  assert.equal(await addBar.locator('button').count(), 7);
  assert((await addBar.boundingBox()).y < (await page.locator('#army-units').boundingBox()).y);
  for (const rank of [1,6,2,3,4,5,7]) {
    const button = addBar.locator(`[data-rank="${rank}"]`);
    await button.scrollIntoViewIfNeeded();await frames(page);
    const y = await page.evaluate(() => scrollY);
    if (mobile) await button.tap(); else await button.click();
    assert.deepEqual(await page.evaluate(() => ({mode:browser?.mode,rank:browser?.rank})), {mode:'units',rank});
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.locator('#browser-close').click();await samePosition(page,y);
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
  }
});

test('compact slots omit face tabs while image and expanded upgrade controls still switch both faces', async t => {
  const page = await setup(t);
  const slotIndex = await page.evaluate(() => {
    const record = BuilderLibrary.create(4, 'Dual card controls', data, uid, new Date().toISOString());
    const added = BuilderModel.addUnit(record.army, data, 'republic-clone-commandos', uid);
    if (!added.ok) throw Error(added.reason);
    const inst = added.draft.units[0], unit = data.units[inst.unitId];
    const card = Object.values(data.upgrades).find(c => UpgradeFaces.isDual(c) && /DC-17m/i.test(c.name.en));
    const slots = unitSlotRecords(unit, inst);
    const slotIndex = slots.findIndex(s => RulesCore.accessKeys(card,data.pkg,data.pkg.upgradeRules?.[String(card.upstream?.id)]).includes(s.key));
    const equipped = BuilderModel.equip(added.draft, data, {unitInstanceId:inst.instanceId,slotIndex,slotKey:slots[slotIndex].key}, card.id, false, uid);
    if (!equipped.ok) throw Error(equipped.reason);
    record.army = equipped.draft;openRoster(record);return slotIndex;
  });
  const slots = page.locator('#army-units > .roster-unit > .compact-slots');
  assert.equal(await slots.locator('.face-control, .face-tabs').count(), 0);
  await slots.locator(`[data-slot-index="${slotIndex}"] .slot-art`).click();
  await page.locator('.image-dialog .face-tabs [data-face="both"]').click();
  await page.getByRole('button',{name:'关闭卡图',exact:true}).click();
  assert.equal(await slots.locator('.slot-back-line').count(), 1);
  assert.equal(await slots.locator('.face-control, .face-tabs').count(), 0);
  await page.locator('#army-units .expand-unit').click();
  await page.locator('#army-units .selected-upgrades .face-control [data-face="back"]').click();
  assert.equal(await slots.locator('.slot-back-line').count(), 0);
  assert.equal(await page.locator('#army-units .selected-upgrades .face-control [data-face="back"]').getAttribute('aria-pressed'), 'true');
});

test('mobile picker hides background sticky rows and keeps weapon data directly visible and interactive', async t => {
  const page = await setup(t);
  const slot = page.locator('#army-units > .roster-unit').nth(9).locator('.slot-name').last();
  const y = await positionAt(page, slot);await slot.tap();
  assert.equal(await page.locator('#roster-info').isVisible(), false);
  assert.equal(await page.locator('#army-units > .roster-unit > .unit-brief').first().isVisible(), false);
  const card = page.locator('#card-grid .upgrade-candidate').filter({has:page.locator('.weapon-card')}).first();
  await card.scrollIntoViewIfNeeded();
  assert.equal(await card.locator('.range-pill').first().isVisible(), true);
  assert.equal(await card.locator('.attack-pool').first().isVisible(), true);
  await card.locator('.weapon-inspect').tap();
  await page.getByRole('button',{name:'关闭武器属性',exact:true}).tap();
  assert.equal(await page.locator('#card-browser').isVisible(), true);
  assert.equal(await page.locator('#roster-info').isVisible(), false);
  await page.locator('#browser-close').tap();await samePosition(page, y);
  assert.equal(await page.locator('#roster-info').isVisible(), true);
});

test('mobile upgrade selector survives repeated close button, backdrop and Escape without jumping', async t => {
  const page = await setup(t);
  for (const method of ['button','backdrop','escape','button']) {
    const slot = unit(page).locator('.compact-slot .slot-name').last(), y = await positionAt(page, slot);
    await slot.tap();
    assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), true);
    await page.locator('#card-grid').evaluate(n => {n.scrollTop = 300;});
    if (method === 'button') await page.locator('#browser-close').tap();
    else if (method === 'backdrop') await page.touchscreen.tap(6, 6);
    else await page.keyboard.press('Escape');
    await samePosition(page, y);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'slot-name');
  }
});

test('mobile unit picker preserves its bottom-of-roster opener when adding a unit', async t => {
  const page = await setup(t), add = page.locator('#army-units > .add-unit');
  const y = await positionAt(page, add);await add.tap();
  await page.locator('#candidate-search').fill('Rebel Troopers');
  const choice = page.locator('#card-grid .candidate[data-state="available"]').first();
  await choice.locator('.brief-first').tap();await samePosition(page, y);
  assert.equal(await page.locator('#card-browser').evaluate(n => n.classList.contains('is-open')), false);
  assert.equal(await page.locator('#summary-activations').innerText(), '19');
});

test('nested upgrade weapons, automatic slot advance and final selection retain the original page position', async t => {
  const page = await setup(t);
  const slot = page.locator('#army-units > .roster-unit').nth(9).locator('.slot-name').last();
  const y = await positionAt(page, slot);await slot.tap();
  await page.locator('#card-grid .weapon-inspect').first().tap();
  await page.getByRole('button',{name:'关闭武器属性',exact:true}).tap();await frames(page);
  assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), true);
  await page.locator('#card-grid .candidate[data-state="available"] .identity h3').first().tap();
  assert.equal(await page.locator('#card-browser').evaluate(n => n.classList.contains('is-open')), true);
  await page.locator('#card-grid .candidate[data-state="available"] .identity h3').first().tap();
  assert.equal(await page.locator('#card-browser').evaluate(n => n.classList.contains('is-open')), false);
  await samePosition(page, y);
});

test('mobile detail, nested card image and keyword rules preserve page and parent dialog scroll', async t => {
  const page = await setup(t), summary = unit(page).locator('.brief-first'), y = await positionAt(page, summary);
  // Touch on iOS need not focus the tapped element; keep stale focus near the header.
  await page.locator('#rank-bar button').first().evaluate(n => n.focus({preventScroll:true}));
  await summary.tap();
  const detail = page.locator('#unit-detail-dialog');
  await detail.locator('.unit-art').tap();
  await page.getByRole('button',{name:'关闭卡图',exact:true}).tap();await frames(page);
  assert.equal(await detail.evaluate(n => n.open), true);
  assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), true);
  const keyword = detail.locator('.rule-tag-main').last();await keyword.scrollIntoViewIfNeeded();
  const inner = await detail.evaluate(n => n.scrollTop);assert(inner > 0);
  await keyword.tap();await page.getByRole('tab',{name:'完整规则',exact:true}).tap();
  await page.getByRole('button',{name:'关闭词条',exact:true}).tap();
  assert(Math.abs(await detail.evaluate(n => n.scrollTop) - inner) <= 2);
  await page.keyboard.press('Escape');await samePosition(page, y);
});

test('mobile candidate image returns to the scrolled selection list before returning to the roster', async t => {
  const page = await setup(t), add = page.locator('#army-units > .add-unit'), y = await positionAt(page, add);
  await add.tap();
  const art = page.locator('#card-grid .candidate-portrait').nth(2);await art.scrollIntoViewIfNeeded();
  const inner = await page.locator('#card-grid').evaluate(n => n.scrollTop);assert(inner > 0);
  await art.tap();await page.getByRole('button',{name:'关闭卡图',exact:true}).tap();await frames(page);
  assert(Math.abs(await page.locator('#card-grid').evaluate(n => n.scrollTop) - inner) <= 2);
  assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), true);
  await page.locator('#browser-close').tap();await samePosition(page, y);
});

test('mobile command and mission selections preserve position after their opener is recreated', async t => {
  const page = await setup(t);
  const command = page.locator('#deck-panel .empty-command').first(), y = await positionAt(page, command);
  await command.tap();await page.locator('#browser-close').tap();await samePosition(page, y);
  const mission = page.getByRole('button',{name:'选择主要任务第 1 张',exact:true});
  const missionY = await positionAt(page, mission);await mission.tap();
  await page.getByRole('button',{name:'关闭任务卡选择',exact:true}).tap();await samePosition(page, missionY);
  await mission.tap();await page.locator('#deck-picker .deck-pick-card').first().tap();await samePosition(page, missionY);
});

test('rapid dialog reopen and navigation do not unlock a live modal or restore an old page offset', async t => {
  const page = await setup(t), summary = unit(page).locator('.brief-first'), y = await positionAt(page, summary);
  await summary.tap();
  await page.evaluate(() => {unitDetail.close();showUnitDetail(groupedUnits()[10]);});await frames(page);
  assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), true);
  await page.getByRole('button',{name:'关闭单位详情',exact:true}).tap();await samePosition(page, y);
  await summary.tap();await page.evaluate(() => showLibrary());await frames(page);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.equal(await page.locator('html').evaluate(n => n.classList.contains('page-overlay-open')), false);
});

test('desktop detail and side selector keep the current viewport', async t => {
  const page = await setup(t, false), summary = unit(page).locator('.brief-first'), y = await positionAt(page, summary);
  await summary.click();await page.getByRole('button',{name:'关闭单位详情',exact:true}).click();await samePosition(page, y);
  const slot = unit(page).locator('.slot-name').last();await slot.scrollIntoViewIfNeeded();
  await slot.click();
  const current = await page.evaluate(() => scrollY);
  await page.locator('#browser-close').evaluate(n => n.click());await samePosition(page, current);
});

for (const mobile of [true, false]) test(`${mobile ? 'mobile' : 'desktop'} upgrade picker offers Dug In in ordinary and missing-slot categories`, async t => {
  const page = await setup(t, mobile);
  const hosts = await page.evaluate(() => Object.values(data.units).filter(u =>
    u.unitTypeId === 4 || (u.unitCategoryId === 'trooper' && u.keywords.some(k => k.id === 'prepared_position'))).map(u => u.id));
  assert(hosts.includes('rebels-rebel-veterans') && hosts.includes('rebels-mark-2-blaster'),
    'exercise both Prepared Position and emplacement hosts, including newly added units');
  for (const id of hosts) {
    const target = await page.evaluate(id => {
      const u = data.units[id], record = BuilderLibrary.create(u.factions[0].id, 'Upgrade slot regression', data, uid, new Date().toISOString());
      record.army.units = [{unitId: id, instanceId: uid(), upgrades: []}];openRoster(record);
      const slots = unitSlotRecords(u, army.units[0]), normal = slots.some(s => s.key === 'training');
      if (normal && slots.some(s => s.key === 'special:training-dug-in')) throw Error('Duplicate special slot');
      return {index: slots.findIndex(s => s.key === (normal ? 'training' : 'special:training-dug-in'))};
    }, id);
    await page.locator(`.compact-slot[data-slot-index="${target.index}"] .slot-name`).click();
    const candidate = page.locator('#card-grid .candidate[data-id="training-dug-in"]');
    assert.equal(await candidate.getAttribute('data-state'), 'available', id);
    await candidate.locator('.identity h3').click();
    assert.deepEqual(await page.evaluate(() => army.units[0].upgrades.map(c => [c.upgradeId, c.slotIndex])),
      [['training-dug-in', target.index]], id);
  }
  // Reproduce a dedicated-only legacy access list, then replace an occupied
  // ordinary slot in a merged group through the same controls the user uses.
  const index = await page.evaluate(() => {
    data.upgrades['training-dug-in'].slotIds = [23, 27];
    data.pkg.upgradeRules['19830'] = {access: [{slot: 'training_exempt'}]};
    const record = BuilderLibrary.create(1, 'Legacy access regression', data, uid, new Date().toISOString());
    record.army.units = [0, 1].map(() => ({unitId: 'rebels-rebel-veterans', instanceId: uid(), upgrades: []}));
    const slots = RulesCore.slotListFor(data.pkg, data.units['rebels-rebel-veterans'], record.army.units[0], data.upgrades, 1);
    const index = slots.findIndex(s => s.key === 'training');
    for (const inst of record.army.units) inst.upgrades = [{upgradeId: 'training-offensive', instanceId: uid(), slotIndex: index}];
    openRoster(record);return index;
  });
  await page.locator(`.compact-slot[data-slot-index="${index}"] .slot-name`).click();
  await page.locator('#apply-all-units').check();
  const candidate = page.locator('#card-grid .candidate[data-id="training-dug-in"]');
  assert.equal(await candidate.getAttribute('data-state'), 'available');
  await candidate.locator('.identity h3').click();
  assert.deepEqual(await page.evaluate(() => army.units.map(i => i.upgrades.map(c => [c.upgradeId, c.slotIndex]))),
    [[['training-dug-in', index]], [['training-dug-in', index]]]);
  assert.equal(await page.locator('#apply-all-units').isChecked(), true);
});
