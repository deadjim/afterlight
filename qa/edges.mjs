import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const report = {};
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.locator('#startButton').click();
await page.locator('#briefingButton').click();
const snap = () => page.evaluate(()=>window.__afterlightDebug.snapshot());
await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.cargo===1,null,{timeout:7000});
report.pickedFirst = await snap();
assert.equal(report.pickedFirst.ship.cargo,1,'first pad pickup');
// State-assisted crash: move the actual ship onto bare terrain, then let game collision handle it.
await page.evaluate(()=>window.__afterlightDebug.setShip(800,window.__afterlightDebug.ground(800)+50,0,120,0));
await page.waitForTimeout(180);
report.afterCrash = await snap();
assert.equal(report.afterCrash.ship.cargo,1,'recoverable crash keeps cargo');
assert.ok(report.afterCrash.ship.hull<report.pickedFirst.ship.hull);
// State-assisted second pickup and dock use real simulation triggers, not direct score/cargo mutation.
await page.evaluate(()=>window.__afterlightDebug.setShip(1040,window.__afterlightDebug.ground(1040)-14,0,5,0));
await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.cargo===2,null,{timeout:4000});
report.pickedSecond = await snap();
assert.equal(report.pickedSecond.pads[1].occupied,false);
for(const pad of report.pickedSecond.pads.filter(p=>p.occupied)) {
  await page.evaluate(x=>window.__afterlightDebug.setShip(x,window.__afterlightDebug.ground(x)-14,0,5,0),pad.x);
  await page.waitForFunction(id=>!window.__afterlightDebug.snapshot().pads.find(p=>p.id===id).occupied,pad.id,{timeout:4000});
}
await page.evaluate(()=>window.__afterlightDebug.setShip(260,425,0,0,0));
await page.waitForFunction(()=>window.__afterlightDebug.snapshot().mode==='result',null,{timeout:2000});
report.win = await snap();
assert.equal(report.win.delivered,5,'all stage-one crew delivered');
report.result = await page.locator('#resultScreen').innerText();
await page.screenshot({ path: path.join(out,'edges-desktop-sector-clear.png') });
await page.locator('#resultButton').click();
report.nextSector = await snap();
assert.equal(report.nextSector.level,2);
assert.equal(report.nextSector.mode,'briefing');
report.nextBriefing = await page.locator('#briefingScreen').innerText();
report.errors = errors;
await context.close();

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const mp = await mobile.newPage();
await mp.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await mp.locator('#startButton').click();
await mp.locator('#briefingButton').click();
const msnap = () => mp.evaluate(()=>window.__afterlightDebug.snapshot());
const button=mp.locator('#flightJoystick');
const box=await button.boundingBox();
const session=await mobile.newCDPSession(mp);
const point={ x:box.x+box.width/2, y:box.y+box.height/2, id:1 };
const tilted={x:point.x+box.width*.2,y:point.y-box.height*.3,id:1};
const fuelStart=(await msnap()).ship.fuel;
await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[tilted]});
await mp.waitForTimeout(450);
const during={fuel:(await msnap()).ship.fuel,joystick:(await msnap()).joystick};
await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
await mp.waitForTimeout(450);
const after={fuel:(await msnap()).ship.fuel,joystick:(await msnap()).joystick};
report.pointerCancel={fuelStart,during,after};
assert.ok(during.fuel<fuelStart&&during.joystick.throttle>0,'dragging joystick up burns fuel');
assert.ok(after.joystick.pointerId===null&&after.joystick.throttle===0&&after.joystick.turn===0,'touch cancel clears joystick');
assert.ok(Math.abs(after.fuel-during.fuel)<.2,'touch cancel stops fuel burn');
await mp.locator('#pauseButton').click();
report.mobilePause=(await msnap()).mode;
await mp.locator('#retryButton').click();
report.mobileRetry=await msnap();
report.mobileFrameMs=await frameTimes(mp);
await mobile.close();

const perfContext=await browser.newContext({viewport:{width:1440,height:900}});
const pp=await perfContext.newPage();
await pp.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
await pp.locator('#startButton').click(); await pp.locator('#briefingButton').click();
report.desktopFrameMs=await frameTimes(pp);
const second=await perfContext.newPage();
await second.goto('about:blank'); await second.bringToFront();
await pp.waitForTimeout(150);
report.visibility={hidden:await pp.evaluate(()=>document.hidden),mode:await pp.evaluate(()=>window.__afterlightDebug.snapshot().mode)};
await perfContext.close();

const storage=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await storage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('storage unavailable')};Storage.prototype.setItem=()=>{throw Error('storage unavailable')};});
const sp=await storage.newPage();const storageErrors=[];sp.on('pageerror',e=>storageErrors.push(e.message));
await sp.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
await sp.locator('#startButton').click();await sp.locator('#briefingButton').click();
report.storageFallback={mode:await sp.evaluate(()=>window.__afterlightDebug.snapshot().mode),errors:storageErrors};
await storage.close();
await browser.close();
await fs.writeFile(path.join(out,'edges-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pickedFirst:{cargo:report.pickedFirst.ship.cargo},afterCrash:{cargo:report.afterCrash.ship.cargo,hull:report.afterCrash.ship.hull},pickedSecond:{cargo:report.pickedSecond.ship.cargo,pads:report.pickedSecond.pads},win:{mode:report.win.mode,delivered:report.win.delivered},nextSector:{mode:report.nextSector.mode,level:report.nextSector.level},pointerCancel:report.pointerCancel,mobilePause:report.mobilePause,mobileRetry:{mode:report.mobileRetry.mode,fuel:report.mobileRetry.ship.fuel},mobileFrameMs:report.mobileFrameMs,desktopFrameMs:report.desktopFrameMs,visibility:report.visibility,storageFallback:report.storageFallback,errors:report.errors},null,2));

async function frameTimes(p) {
  return p.evaluate(()=>new Promise(resolve=>{const arr=[];let last=0;function tick(t){if(last)arr.push(t-last);last=t;if(arr.length<180)requestAnimationFrame(tick);else {arr.sort((a,b)=>a-b);resolve({median:arr[90],p95:arr[171],max:arr[179]});}}requestAnimationFrame(tick);}));
}
