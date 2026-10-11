import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const base=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
const snap=()=>page.evaluate(()=>window.__afterlightDebug.snapshot());

try{
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#startButton').click();
  await page.locator('#briefingButton').click();
  const first=(await snap()).pads[0];

  // This opening pickup uses the real passive descent from the fresh mission spawn.
  await page.waitForFunction(id=>window.__afterlightDebug.snapshot().ship.boardingPadId===id,first.id,{timeout:4500});
  const walking=await snap();
  assert.equal(walking.ship.landedPadId,first.id,'ship is parked on the rescue pad');
  assert.equal(walking.ship.cargo,0,'touchdown does not instantly put a child aboard');
  assert.equal(walking.pads[0].occupied,true,'child stays on pad during walking animation');
  await page.waitForTimeout(500);
  const mid=await snap();
  assert.ok(mid.ship.boardingProgress>.25&&mid.ship.boardingProgress<1.6,`boarding progresses over time: ${mid.ship.boardingProgress}`);
  assert.equal(mid.ship.cargo,0,'mid-walk cargo remains zero');
  assert.equal(mid.pads[0].occupied,true,'mid-walk pad remains occupied');
  assert.ok(Math.abs(mid.ship.x-walking.ship.x)<1&&Math.abs(mid.ship.y-walking.ship.y)<1,'ship remains parked while the child walks');
  await page.screenshot({path:path.join(out,'boarding-walk.png')});

  await page.keyboard.press('Escape');
  const paused=await snap();
  assert.equal(paused.mode,'paused','Escape pauses mid-boarding');
  await page.waitForTimeout(350);
  const frozen=await snap();
  assert.equal(frozen.ship.boardingProgress,paused.ship.boardingProgress,'paused boarding progress freezes exactly');
  assert.equal(frozen.ship.cargo,0,'pause does not silently complete boarding');
  await page.locator('#resumeButton').click();
  await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.cargo===1,null,{timeout:3000});
  const completed=await snap();
  assert.equal(completed.ship.boardingPadId,null,'boarding state clears on completion');
  assert.equal(completed.pads[0].occupied,false,'pad clears only after boarding completion');
  assert.equal(completed.delivered,0,'boarding is distinct from delivery to carrier');
  await page.waitForFunction(()=>document.querySelector('#hudCrew')?.textContent?.trim()==='1',null,{timeout:500});
  const hud=await page.locator('#hudCrew').innerText();
  assert.ok(hud.startsWith('1'),`HUD shows actual child aboard: ${hud}`);
  await page.screenshot({path:path.join(out,'boarding-aboard.png')});
  await page.waitForTimeout(500);
  assert.equal((await snap()).ship.cargo,1,'staying parked cannot duplicate crew');

  // Restart, abort with real thrust, then safely return to the same child.
  await page.evaluate(()=>window.__afterlightDebug.start(1));
  await page.waitForFunction(id=>window.__afterlightDebug.snapshot().ship.boardingPadId===id,first.id,{timeout:4500});
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowUp');
  const aborted=await snap();
  assert.equal(aborted.ship.boardingPadId,null,'thrusting away cancels boarding');
  assert.equal(aborted.ship.landedPadId,null,'takeoff releases pad lock');
  assert.equal(aborted.ship.cargo,0,'aborted boarding leaves cargo empty');
  assert.equal(aborted.pads[0].occupied,true,'aborted boarding leaves the child available');
  const ground=await page.evaluate(x=>window.__afterlightDebug.ground(x),first.x);
  await page.evaluate(({x,y})=>window.__afterlightDebug.setShip(x,y,0,5,0),{x:first.x,y:ground-14});
  await page.waitForFunction(id=>window.__afterlightDebug.snapshot().ship.boardingPadId===id,first.id,{timeout:1800});
  const relanded=await snap();
  assert.equal(relanded.ship.cargo,0,'re-landing begins a fresh timed walk');
  await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.cargo===1,null,{timeout:3000});
  const rescued=await snap();
  assert.equal(rescued.pads[0].occupied,false,'the same child is rescued on second attempt');
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(100);await page.keyboard.up('ArrowUp');
  await page.evaluate(({x,y})=>window.__afterlightDebug.setShip(x,y,0,5,0),{x:first.x,y:ground-14});
  await page.waitForTimeout(1900);
  const repeated=await snap();
  assert.equal(repeated.ship.cargo,1,'an emptied pad cannot award crew again');
  assert.deepEqual(errors,[],'no browser errors');
  const report={pass:true,actualPassiveLanding:{start:walking.time,mid:mid.time,progress:mid.ship.boardingProgress,completion:completed.time,hud},pause:{progress:paused.ship.boardingProgress,frozen:frozen.ship.boardingProgress},realThrustAbort:{cargo:aborted.ship.cargo,padOccupied:aborted.pads[0].occupied},assistedRelanding:{cargo:rescued.ship.cargo,padOccupied:rescued.pads[0].occupied,duplicateCargo:repeated.ship.cargo},errors};
  await fs.writeFile(path.join(out,'boarding-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
