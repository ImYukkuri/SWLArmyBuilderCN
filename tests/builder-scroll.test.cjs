/* Optional real-browser regression: npm run test:scroll (requires Playwright).
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE may point at an existing Chrome installation.
 * All data is served read-only; browser storage is isolated and discarded.
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
  browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined});
});
after(async () => {await browser?.close(); await new Promise(resolve => server.close(resolve));});

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
  assert.equal(await page.locator('#rank-bar button').count(), 6);
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
  assert.equal(await page.locator('#summary-activations').innerText(), '3');
  await page.locator('#army-units .copy-unit').click();
  assert.equal(await page.locator('#rank-bar [data-rank="2"] .rank-badge').innerText(), '4');
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
