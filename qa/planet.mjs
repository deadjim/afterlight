import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.dirname(new URL(import.meta.url).pathname),base=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const report={cases:[]};
for(const config of [{name:'desktop',width:1440,height:900,mobile:false},{name:'portrait',width:390,height:844,mobile:true},{name:'landscape',width:844,height:390,mobile:true},{name:'browser-landscape',width:568,height:280,mobile:true}]){
  const context=await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:config.mobile,hasTouch:config.mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});await page.locator('#startButton').click();await page.locator('#briefingButton').click();
  const sample=async altitude=>{await page.evaluate(({altitude})=>{const d=window.__afterlightDebug,x=540;d.setShip(x,d.ground(x)-altitude,0,0,0)}, {altitude});await page.waitForTimeout(50);return page.evaluate(()=>window.__afterlightDebug.snapshot())};
  const near=await sample(5500),middle=await sample(7500);
  const hudTop=await page.locator('.hud-bottom').evaluate(e=>e.getBoundingClientRect().top);
  await page.screenshot({path:path.join(root,`planet-${config.name}-7500.png`)});
  const far=await sample(12000);
  assert.ok(near.homePlanet.radiusPx>middle.homePlanet.radiusPx*1.45,`${config.name} globe radius drops >31% by 7500m`);
  assert.ok(middle.homePlanet.radiusPx>far.homePlanet.radiusPx*1.6,`${config.name} globe continues shrinking by 12000m`);
  assert.ok(middle.homePlanet.centerYPx+middle.homePlanet.radiusPx<config.height*.995,`${config.name} full globe on screen at 7500m`);
  assert.ok(Math.abs(near.homePlanet.centerYPx-middle.homePlanet.centerYPx)<1&&Math.abs(middle.homePlanet.centerYPx-far.homePlanet.centerYPx)<1,`${config.name} globe center stops chasing camera after orbit`);
  if(config.name.includes('landscape'))for(const [label,s] of [['7500m',middle],['12000m',far]])assert.ok(s.homePlanet.centerYPx+s.homePlanet.radiusPx+3<hudTop,`${config.name} ${label} complete globe clears bottom HUD by ${Math.round(hudTop-s.homePlanet.centerYPx-s.homePlanet.radiusPx)}px`);
  await page.screenshot({path:path.join(root,`planet-${config.name}-far.png`)});
  // Assisted placement at orbit entry, then ten seconds of real unpowered flight.
  await page.evaluate(()=>{const d=window.__afterlightDebug,x=540;d.setShip(x,d.ground(x)-5500,0,-500,0)});
  await page.waitForTimeout(80);const coastStart=await page.evaluate(()=>window.__afterlightDebug.snapshot());
  await page.waitForTimeout(10100);const coastEnd=await page.evaluate(()=>window.__afterlightDebug.snapshot());
  assert.equal(coastEnd.mode,'playing',`${config.name} unpowered orbit coast remains playable`);
  assert.ok(coastEnd.ship.altitude>coastStart.ship.altitude+1200,`${config.name} coast travels upward for ten seconds`);
  assert.ok(coastEnd.homePlanet.radiusPx<coastStart.homePlanet.radiusPx*.75,`${config.name} globe recedes during ten-second coast`);
  assert.ok(Math.abs(coastEnd.homePlanet.centerYPx-coastStart.homePlanet.centerYPx)<1,`${config.name} globe center does not chase ship during coast`);
  assert.deepEqual(errors,[],`${config.name} no browser errors`);
  report.cases.push({config,samples:[near,middle,far].map(s=>({altitude:s.ship.altitude,...s.homePlanet})),hudClearanceAt7500:config.name.includes('landscape')?hudTop-middle.homePlanet.centerYPx-middle.homePlanet.radiusPx:null,coast:{startAltitude:coastStart.ship.altitude,endAltitude:coastEnd.ship.altitude,startRadius:coastStart.homePlanet.radiusPx,endRadius:coastEnd.homePlanet.radiusPx,centerDrift:coastEnd.homePlanet.centerYPx-coastStart.homePlanet.centerYPx},errors});
  await context.close();
}
await browser.close();await fs.writeFile(path.join(root,'planet-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,...report},null,2));
