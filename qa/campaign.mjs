import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})});
const report=[];
for(const config of [{name:'landscape',width:844,height:390},{name:'portrait',width:390,height:844}]) {
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
  await page.locator('#startButton').click();await page.locator('#briefingButton').click();
  const snap=()=>page.evaluate(()=>window.__afterlightDebug.snapshot());
  const levels=[];
  for(let level=1;level<=3;level++) {
    await page.waitForTimeout(1150);
    const before=await snap();
    const pickups=[];
    for(const pad of before.pads) {
      const ground=854+15*Math.sin(pad.x*.0031);
      await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[pad.x,ground-14]);
      await page.waitForTimeout(90);
      pickups.push(await snap());
    }
    await page.evaluate(()=>window.__afterlightDebug.setShip(260,425,0,0,0));
    await page.waitForFunction(()=>window.__afterlightDebug.snapshot().mode==='result',null,{timeout:2500});
    const won=await snap();
    levels.push({level,beforePads:before.pads.length,pickups:pickups.map(p=>p.ship.cargo),winMode:won.mode,delivered:won.delivered,resultTitle:await page.locator('#resultTitle').innerText(),resultAction:await page.locator('#resultButton').innerText()});
    if(level===3) {
      await page.screenshot({path:path.join(out,`${config.name}-final-result.png`)});
      break;
    }
    await page.locator('#resultButton').click();
    if(level===2) await page.screenshot({path:path.join(out,`${config.name}-sector3-briefing.png`)});
    await page.locator('#briefingButton').click();
  }
  report.push({config,levels,errors});
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(out,'campaign-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
