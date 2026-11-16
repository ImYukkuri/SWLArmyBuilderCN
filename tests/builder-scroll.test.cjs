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
