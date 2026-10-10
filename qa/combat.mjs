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
const flat=x=>854+15*Math.sin(x*.0031);
{
  const {context,page,errors,snap}=await makePage();
  const x=1330,y=871+37*Math.sin(x*.0059+.7)+27*Math.sin(x*.0141+2.1)+10*Math.sin(x*.041);
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y-205,0,0,Math.PI),[x,y]);
  const before=await snap();
  await page.keyboard.down('Space');await page.waitForTimeout(1200);await page.keyboard.up('Space');
  const after=await snap();
  report.fire={before:{hp:before.turrets[0].hp,score:before.score},after:{hp:after.turrets[0].hp,score:after.score},errors};
  await context.close();
}
async function hitScenario(shield) {
  const {context,page,errors,snap}=await makePage();
  const x=1330,y=871+37*Math.sin(x*.0059+.7)+27*Math.sin(x*.0141+2.1)+10*Math.sin(x*.041)-25-130;
  if(shield) await page.keyboard.down('ShiftLeft');
  for(let i=0;i<55;i++) {
    await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,0,0),[x,y]);
    await page.waitForTimeout(100);
  }
  if(shield) await page.keyboard.up('ShiftLeft');
  const state=await snap();
  await context.close();
  return {hull:state.ship.hull,fuel:state.ship.fuel,errors};
}
report.unshielded=await hitScenario(false);
report.shielded=await hitScenario(true);
{
  const {context,page,errors,snap}=await makePage();
  await page.evaluate(()=>window.__afterlightDebug.setFuel(0));
  const x=540;
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[x,flat(x)-14]);
  await page.waitForTimeout(150);
  const collected=await snap();
  await page.evaluate(()=>window.__afterlightDebug.setFuel(0));
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[x,flat(x)-14]);
  await page.waitForTimeout(160);
  report.emptyPadFuel={before:0,after:(await snap()).ship.fuel,padOccupied:(await snap()).pads[0].occupied,firstPickupFuel:collected.ship.fuel};
  await page.evaluate(()=>window.__afterlightDebug.setHull(20));
  await page.evaluate(()=>window.__afterlightDebug.setInvuln(0));
  await page.evaluate(()=>window.__afterlightDebug.setShip(800,1000,0,120,0));
  await page.waitForTimeout(180);
  const lost=await snap();
  report.lost={mode:lost.mode,resultTitle:await page.locator('#resultTitle').innerText(),resultAction:await page.locator('#resultButton').innerText()};
  await page.locator('#resultButton').click();
  const retried=await snap();
  report.retry={mode:retried.mode,hull:retried.ship.hull,pads:retried.pads.map(p=>p.occupied)};
  report.endErrors=errors;
  await context.close();
}
{
  const {context,page,errors,snap}=await makePage();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  report.syntheticVisibility={mode:(await snap()).mode,errors};
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(out,'combat-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
