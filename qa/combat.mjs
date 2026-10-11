import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const source=await fs.readFile(path.join(out,'../dist/game.js'),'utf8');
const instrumented=source.replace('window.__afterlightDebug={','window.__afterlightDebug={setFuel:(n)=>{game.ship.fuel=n},setHull:(n)=>{game.ship.hull=n},setInvuln:(n)=>{game.ship.invuln=n},');
if(instrumented===source)throw Error('Unable to add test-only state setters');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})});
const report={};
async function makePage() {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:instrumented}));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#startButton').click();await page.locator('#briefingButton').click();
  return {context,page,errors,snap:()=>page.evaluate(()=>window.__afterlightDebug.snapshot())};
}
{
  const {context,page,errors,snap}=await makePage();
  const x=(await snap()).turrets[0].x,y=await page.evaluate(x=>window.__afterlightDebug.ground(x),x);
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y-205,0,0,Math.PI),[x,y]);
  const before=await snap();
  await page.keyboard.down('Space');await page.waitForTimeout(1200);await page.keyboard.up('Space');
  const after=await snap();
  report.fire={before:{hp:before.turrets[0].hp,score:before.score},after:{hp:after.turrets[0].hp,score:after.score},errors};
  assert.equal(after.turrets[0].hp,0,'actual Fire key destroys sentry');
  assert.ok(after.score>=before.score+150,'sentry awards score');
  await context.close();
}
async function hitScenario(shield) {
  const {context,page,errors,snap}=await makePage();
  const x=(await snap()).turrets[0].x,y=(await page.evaluate(x=>window.__afterlightDebug.ground(x),x))-25-130;
  const trace=[];
  for(let i=0;i<38;i++) {
    // The sentry launches at ~2.2 s; use the finite shield around impact,
    // rather than exhausting it by holding from mission start.
    if(shield&&i===20)await page.keyboard.down('ShiftLeft');
    await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,0,0),[x,y]);
    await page.waitForTimeout(100);
    const s=await snap();trace.push({time:s.time,hull:s.ship.hull,shield:s.ship.shieldActive,charge:s.ship.shieldCharge,bullets:s.entities.enemyBullets});
  }
  if(shield) await page.keyboard.up('ShiftLeft');
  const state=await snap();
  await context.close();
  return {hull:state.ship.hull,fuel:state.ship.fuel,trace,errors};
}
report.unshielded=await hitScenario(false);
report.shielded=await hitScenario(true);
assert.ok(report.unshielded.hull<100,'unshielded ship takes sentry damage');
assert.equal(report.shielded.hull,100,'shield blocks sentry damage');
{
  const {context,page,errors,snap}=await makePage();
  await page.evaluate(()=>window.__afterlightDebug.setFuel(0));
  const x=(await snap()).pads[0].x;
  await page.evaluate(x=>window.__afterlightDebug.setShip(x,window.__afterlightDebug.ground(x)-14,0,5,0),x);
  await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.cargo===1,null,{timeout:4000});
  const collected=await snap();
  await page.evaluate(()=>window.__afterlightDebug.setFuel(0));
  await page.evaluate(x=>window.__afterlightDebug.setShip(x,window.__afterlightDebug.ground(x)-14,0,5,0),x);
  await page.waitForTimeout(160);
  report.emptyPadFuel={before:0,after:(await snap()).ship.fuel,padOccupied:(await snap()).pads[0].occupied,firstPickupFuel:collected.ship.fuel};
  assert.equal(report.emptyPadFuel.after,75,'empty pad refills fuel');
  assert.equal(report.emptyPadFuel.padOccupied,false);
  await page.evaluate(()=>window.__afterlightDebug.setHull(20));
  await page.evaluate(()=>window.__afterlightDebug.setInvuln(0));
  await page.evaluate(()=>window.__afterlightDebug.setShip(800,window.__afterlightDebug.ground(800)+50,0,350,0));
  await page.waitForTimeout(180);
  const lost=await snap();
  report.lost={mode:lost.mode,resultTitle:await page.locator('#resultTitle').innerText(),resultAction:await page.locator('#resultButton').innerText()};
  assert.equal(report.lost.mode,'result');
  assert.equal(report.lost.resultTitle,'SIGNAL LOST');
  await page.locator('#resultButton').click();
  const retried=await snap();
  report.retry={mode:retried.mode,hull:retried.ship.hull,pads:retried.pads.map(p=>p.occupied)};
  assert.equal(report.retry.mode,'playing');
  assert.equal(report.retry.hull,100);
  assert.ok(report.retry.pads.every(Boolean));
  report.endErrors=errors;
  await context.close();
}
{
  const {context,page,errors,snap}=await makePage();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  report.syntheticVisibility={mode:(await snap()).mode,errors};
  assert.equal(report.syntheticVisibility.mode,'paused');
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(out,'combat-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
