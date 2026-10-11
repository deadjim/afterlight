import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const base=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const report=[];
for(const config of [{name:'landscape',width:844,height:390},{name:'portrait',width:390,height:844}]) {
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#startButton').click();await page.locator('#briefingButton').click();
  const snap=()=>page.evaluate(()=>window.__afterlightDebug.snapshot());
  const levels=[];
  for(let level=1;level<=3;level++) {
    await page.waitForTimeout(1150);
    const before=await snap();
    assert.equal(before.mode,'playing');
    assert.equal(before.level,level);
    assert.equal(before.worldWidth,[6000,7800,9600][level-1]);
    assert.equal(before.pads.length,[5,6,8][level-1]);
    const pickups=[];
    for(const pad of before.pads) {
      const ground=await page.evaluate(x=>window.__afterlightDebug.ground(x),pad.x);
      await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[pad.x,ground-14]);
      await page.waitForFunction(id=>window.__afterlightDebug.snapshot().pads.find(p=>p.id===id).occupied===false,pad.id,{timeout:2000});
      const state=await snap();
      assert.equal(state.ship.cargo,pickups.length+1,`sector ${level} pad ${pad.id} increments cargo`);
      pickups.push({id:pad.id,cargo:state.ship.cargo});
    }
    await page.evaluate(()=>window.__afterlightDebug.setShip(260,425,0,0,0));
    await page.waitForFunction(()=>window.__afterlightDebug.snapshot().mode==='result',null,{timeout:2500});
    const won=await snap();
    assert.equal(won.delivered,before.pads.length,`sector ${level} all crew delivered`);
    assert.equal(won.ship.cargo,0);
    const title=await page.locator('#resultTitle').innerText();
    assert.equal(title,level===3?'ALL SIGNALS FOUND':'SECTOR CLEAR');
    const action=await page.locator('#resultButton').innerText();
    assert.equal(action,level===3?'PLAY AGAIN':'NEXT SECTOR');
    levels.push({level,worldWidth:before.worldWidth,pads:before.pads.length,pickups,delivered:won.delivered,resultTitle:title,resultAction:action});
    if(level===3) {
      await page.screenshot({path:path.join(out,`campaign-${config.name}-final-result.png`)});
      break;
    }
    await page.locator('#resultButton').click();
    if(level===2)await page.screenshot({path:path.join(out,`campaign-${config.name}-sector3-briefing.png`)});
    await page.locator('#briefingButton').click();
  }
  assert.deepEqual(errors,[],`${config.name} browser errors`);
  report.push({config,levels,errors});
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(out,'campaign-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,report},null,2));
