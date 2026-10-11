import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const base = process.argv[2] || 'http://127.0.0.1:4173';
await fs.mkdir(root, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--no-sandbox'],
});
const cases = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'portrait', width: 390, height: 844, mobile: true },
  { name: 'landscape', width: 844, height: 390, mobile: true },
];
const report = [];
for (const config of cases) {
  const context = await browser.newContext({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1, isMobile: config.mobile, hasTouch: config.mobile, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(root, `smoke-${config.name}-title.png`), fullPage: true });
  const titleState = await inspect(page);
  await page.locator('#startButton').click();
  await page.waitForTimeout(100);
  const briefingState = await inspect(page);
  await page.screenshot({ path: path.join(root, `smoke-${config.name}-briefing.png`), fullPage: true });
  await page.locator('#briefingButton').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(root, `smoke-${config.name}-flight.png`), fullPage: true });
  const flightState = await inspect(page);
  if (config.mobile) {
    const left = await center(page, '[data-control="left"]');
    const thrust = await center(page, '[data-control="thrust"]');
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x, y: left.y, id: 1 }, { x: thrust.x, y: thrust.y, id: 2 }] });
    await page.waitForTimeout(600);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowUp');
    await page.keyboard.press('Space');
  }
  const afterControlState = await inspect(page);
  await page.locator('#pauseButton').click();
  await page.waitForTimeout(100);
  const pausedState = await inspect(page);
  await page.screenshot({ path: path.join(root, `smoke-${config.name}-pause.png`), fullPage: true });
  await page.locator('#resumeButton').click();
  await page.waitForTimeout(100);
  const resumedState = await inspect(page);
  assert.equal(flightState.snapshot.mode,'playing',`${config.name} flight starts`);
  assert.ok(Math.abs(afterControlState.snapshot.ship.x-flightState.snapshot.ship.x)>5,`${config.name} input moves ship`);
  assert.ok(Math.abs(afterControlState.snapshot.ship.a-flightState.snapshot.ship.a)>.5,`${config.name} input rotates ship`);
  assert.ok(afterControlState.snapshot.ship.fuel<flightState.snapshot.ship.fuel,`${config.name} thrust burns fuel`);
  assert.equal(flightState.elements.touchControls.visible,config.mobile,`${config.name} touch controls visibility`);
  assert.equal(pausedState.snapshot.mode,'paused');
  assert.equal(resumedState.snapshot.mode,'playing');
  assert.deepEqual(flightState.document,flightState.viewport,`${config.name} no viewport overflow`);
  assert.deepEqual(errors,[],`${config.name} browser errors`);
  report.push({ config, titleState, briefingState, flightState, afterControlState, pausedState, resumedState, errors });
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(root, 'smoke-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

async function center(page, selector) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Missing ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function inspect(page) {
  return page.evaluate(() => {
    const ids = ['titleScreen', 'briefingScreen', 'pauseScreen', 'resultScreen', 'touchControls', 'hudCrew', 'hudFuel', 'hudHull', 'hudObjective'];
    const elements = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      elements[id] = { visible: !el.hidden && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none', text: el.innerText?.trim().slice(0, 200), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    }
    return {
      viewport: { w: innerWidth, h: innerHeight },
      document: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
      elements,
      snapshot: window.__afterlightDebug?.snapshot?.() ?? null,
    };
  });
}
