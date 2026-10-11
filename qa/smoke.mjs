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
  { name: 'small-portrait', width: 320, height: 568, mobile: true },
  { name: 'compact-portrait', width: 375, height: 667, mobile: true },
  { name: 'small-landscape', width: 568, height: 320, mobile: true },
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
  if(config.mobile)await assertOverlayFits(page,'#briefingScreen .info-panel',config,'briefing');
  await page.locator('#briefingButton').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(root, `smoke-${config.name}-flight.png`), fullPage: true });
  const flightState = await inspect(page);
  const mobileLayout = config.mobile ? await inspectMobileLayout(page) : null;
  if(mobileLayout){
    assert.deepEqual(mobileLayout.outOfBounds,[],`${config.name} touch buttons fully inside viewport`);
    assert.deepEqual(mobileLayout.overlaps,[],`${config.name} HUD readouts clear touch buttons`);
    assert.deepEqual(mobileLayout.legacy,[],`${config.name} retired mobile controls are absent`);
  }
  if (config.mobile) {
    const joystick = await center(page, '#flightJoystick');
    const fire = await center(page, '[data-control="fire"]');
    const joystickBox = await page.locator('#flightJoystick').boundingBox();
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joystick.x, y: joystick.y, id: 1 }, { x: fire.x, y: fire.y, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: joystick.x+joystickBox.width*.28, y: joystick.y-joystickBox.height*.28, id: 1 }, { x: fire.x, y: fire.y, id: 2 }] });
    await page.waitForTimeout(600);
    const active=await inspect(page);
    assert.ok(active.snapshot.entities.bullets>0,`${config.name} simultaneous joystick and Fire creates projectiles`);
    assert.ok(active.snapshot.joystick?.throttle>0&&Math.abs(active.snapshot.joystick?.turn)>0,`${config.name} diagonal joystick thrusts and steers`);
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
  if(config.mobile)await assertOverlayFits(page,'#pauseScreen .info-panel',config,'pause');
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
  if(config.name==='small-landscape'){
    await page.waitForTimeout(350);
    await page.evaluate(()=>{const d=window.__afterlightDebug;d.setResources({hull:1});d.setShip(800,d.ground(800)+50,0,350,0)});
    await page.waitForFunction(()=>window.__afterlightDebug.snapshot().mode==='result',null,{timeout:2000});
    await page.screenshot({path:path.join(root,'smoke-small-landscape-result.png')});
    await assertOverlayFits(page,'#resultScreen .info-panel',config,'result');
    await page.evaluate(()=>window.__afterlightDebug.start(3));
    await page.waitForTimeout(1100);
    const pads=(await inspect(page)).snapshot.pads;
    for(const pad of pads){
      await page.evaluate(x=>window.__afterlightDebug.setShip(x,window.__afterlightDebug.ground(x)-14,0,5,0),pad.x);
      await page.waitForFunction(id=>!window.__afterlightDebug.snapshot().pads.find(p=>p.id===id).occupied,pad.id,{timeout:1500});
    }
    await page.evaluate(()=>window.__afterlightDebug.setShip(260,425,0,0,0));
    await page.waitForFunction(()=>window.__afterlightDebug.snapshot().mode==='result',null,{timeout:2000});
    assert.equal(await page.locator('#resultTitle').innerText(),'ALL SIGNALS FOUND','small landscape final-result content');
    await page.screenshot({path:path.join(root,'smoke-small-landscape-final-result.png')});
    await assertOverlayFits(page,'#resultScreen .info-panel',config,'final result');
  }
  assert.deepEqual(flightState.document,flightState.viewport,`${config.name} no viewport overflow`);
  assert.deepEqual(errors,[],`${config.name} browser errors`);
  report.push({ config, titleState, briefingState, flightState, mobileLayout, afterControlState, pausedState, resumedState, errors });
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

async function assertOverlayFits(page,selector,config,label){
  const panel=await page.locator(selector).boundingBox();
  assert.ok(panel&&panel.y>=-1&&panel.y+panel.height<=config.height+1,`${config.name} ${label} panel fits viewport: ${JSON.stringify(panel)}`);
  for(const button of await page.locator(`${selector} button`).all()){
    const box=await button.boundingBox();
    assert.ok(box&&box.y>=-1&&box.y+box.height<=config.height+1,`${config.name} ${label} action button fully visible: ${JSON.stringify(box)}`);
  }
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

async function inspectMobileLayout(page){
  return page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}};
    const controls=[...document.querySelectorAll('.touch-controls [data-control], #flightJoystick')].map(el=>({id:el.dataset.control||el.id,...rect(el)}));
    const legacy=[...document.querySelectorAll('[data-control="left"], [data-control="right"], [data-control="thrust"], [data-control="shield"]')].filter(el=>rect(el).w>0).map(el=>el.dataset.control);
    const ids=['hudCrew','hudFuel','hudHull','hudShield','hudBoost','hudAltitude','hudScore','hudObjective'];
    const hud=ids.map(id=>({id,...rect(document.getElementById(id))})).filter(r=>r.w>0&&r.h>0);
    const outOfBounds=controls.filter(r=>r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5).map(r=>r.id);
    const overlaps=[];
    for(const a of controls)for(const b of hud){
      const w=Math.min(a.right,b.right)-Math.max(a.x,b.x),h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
      if(w>1&&h>1)overlaps.push({control:a.id,hud:b.id,w,h});
    }
    return {controls,hud,outOfBounds,overlaps,legacy};
  });
}
