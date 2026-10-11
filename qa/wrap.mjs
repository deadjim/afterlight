import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const base=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const report={geometry:{},crossings:{},rescue:{},combat:{},laps:{},errors:[]};
const config=[{name:'desktop',width:1440,height:900,mobile:false},{name:'portrait',width:390,height:844,mobile:true},{name:'landscape',width:844,height:390,mobile:true}];

async function opened(c) {
  const context=await browser.newContext({viewport:{width:c.width,height:c.height},isMobile:c.mobile,hasTouch:c.mobile,deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#startButton').click();await page.locator('#briefingButton').click();
  return {context,page,errors,snap:()=>page.evaluate(()=>window.__afterlightDebug.snapshot())};
}
function wrapped(x,w){return ((x%w)+w)%w;}
function screenX(s,c){const vh=c.width>c.height*1.7&&c.height<600?560:c.width<650?840:930;return c.width/2+(s.ship.x-s.camera.x)*(c.height/vh);}
async function settle(page,x,y,a){await page.evaluate(([x,y,a])=>window.__afterlightDebug.setShip(x,y,0,0,a),[x,y,a]);await page.waitForTimeout(1300);}
async function cross(page,snap,c,direction) {
  const w=(await snap()).worldWidth;
  const x=direction>0?w-45:45,a=direction*Math.PI/2;
  await settle(page,x,330,a);
  await page.evaluate(([x,a,vx])=>window.__afterlightDebug.setShip(x,330,vx,0,a),[x,a,direction*180]);
  const samples=[];
  await page.keyboard.down('ArrowUp');
  for(let i=0;i<12;i++){await page.waitForTimeout(50);const s=await snap();samples.push({x:s.ship.x,camera:s.camera.x,screenX:screenX(s,c),vx:s.ship.vx,entities:s.entities});}
  await page.keyboard.up('ArrowUp');
  const first=samples[0],last=samples.at(-1);
  assert.ok(direction>0?last.x>w:first.x>=0&&last.x<0,`${c.name} ${direction>0?'right':'left'} seam did not cross: ${first.x} → ${last.x}`);
  assert.ok(direction*last.vx>120,`${c.name} seam velocity lost`);
  const jumps=samples.slice(1).map((s,i)=>Math.abs(s.screenX-samples[i].screenX));
  assert.ok(Math.max(...jumps)<90,`${c.name} seam screen position jumped ${Math.max(...jumps)}px`);
  const cameraJumps=samples.slice(1).map((s,i)=>Math.abs(s.camera-samples[i].camera));
  assert.ok(Math.max(...cameraJumps)<100,`${c.name} seam camera jumped ${Math.max(...cameraJumps)} world units`);
  return {from:first.x,to:last.x,velocity:last.vx,maxScreenStep:Math.max(...jumps),maxCameraStep:Math.max(...cameraJumps)};
}
async function rebaseCross(page,snap,c,direction) {
  const w=(await snap()).worldWidth,boundary=direction>0?w*1.5:-w*.5;
  const x=boundary-direction*45,a=direction*Math.PI/2;
  await settle(page,x,330,a);
  await page.evaluate(([x,a,vx])=>window.__afterlightDebug.setShip(x,330,vx,0,a),[x,a,direction*180]);
  const samples=[];
  await page.keyboard.down('ArrowUp');
  for(let i=0;i<12;i++){await page.waitForTimeout(50);const s=await snap();samples.push({x:s.ship.x,camera:s.camera.x,screenX:screenX(s,c),vx:s.ship.vx});}
  await page.keyboard.up('ArrowUp');
  const pairs=samples.slice(1).map((s,i)=>({dx:s.x-samples[i].x,dc:s.camera-samples[i].camera,ds:s.screenX-samples[i].screenX}));
  const event=pairs.find(p=>Math.abs(p.dx)>w*.8);
  assert.ok(event,`${c.name} ${direction>0?'right':'left'} rebase not observed`);
  assert.ok(Math.abs(event.dc)>w*.8,'camera rebased with ship');
  assert.ok(Math.abs(event.dx-event.dc)<40,'ship and camera preserve relative position during rebase');
  assert.ok(Math.max(...pairs.map(p=>Math.abs(p.ds)))<90,'rebase has no screen jump');
  assert.ok(direction*samples.at(-1).vx>120,'rebase preserves flight velocity');
  return {shipShift:event.dx,cameraShift:event.dc,screenStep:event.ds,velocity:samples.at(-1).vx};
}

for(const c of config) {
  const {context,page,errors,snap}=await opened(c);
  const first=await snap(),w=first.worldWidth;
  assert.equal(w,6000,`${c.name} stage 1 width`);
  const geometry=await page.evaluate(w=>({at0:window.__afterlightDebug.ground(0),atWidth:window.__afterlightDebug.ground(w),left:window.__afterlightDebug.ground(-1),right:window.__afterlightDebug.ground(w-1),forward:window.__afterlightDebug.wrappedDx(20,w-20),back:window.__afterlightDebug.wrappedDx(w-20,20),docW:document.documentElement.scrollWidth,docH:document.documentElement.scrollHeight}),w);
  assert.ok(Math.abs(geometry.at0-geometry.atWidth)<1e-6,'terrain closes at seam');
  assert.ok(Math.abs(geometry.left-geometry.right)<1e-6,'terrain matches across seam');
  assert.equal(geometry.forward,40);assert.equal(geometry.back,-40);
  assert.equal(geometry.docW,c.width);assert.equal(geometry.docH,c.height);
  report.geometry[c.name]=geometry;
  report.crossings[c.name]={right:await cross(page,snap,c,1),left:await cross(page,snap,c,-1)};
  if(c.name==='desktop')report.crossings[c.name].rebase={right:await rebaseCross(page,snap,c,1),left:await rebaseCross(page,snap,c,-1)};
  await page.screenshot({path:path.join(out,`wrap-${c.name}-left.png`)});
  assert.equal(errors.length,0,`${c.name} browser errors: ${errors.join('; ')}`);
  report.errors.push(...errors.map(error=>({case:c.name,error})));
  await context.close();
}

{
  const {context,page,errors,snap}=await opened(config[0]);
  await page.waitForTimeout(1150);
  const s0=await snap(),w=s0.worldWidth,pad=s0.pads.at(-1);
  const gy=await page.evaluate(x=>window.__afterlightDebug.ground(x),pad.x);
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[pad.x-w,gy-14]);
  await page.waitForTimeout(120);
  const picked=await snap();
  assert.equal(picked.ship.cargo,1,'cross-seam pad pickup');
  assert.equal(picked.pads.find(p=>p.id===pad.id).occupied,false,'unique pad marked used');
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[pad.x+w,gy-14]);
  await page.waitForTimeout(120);
  const second=await snap();
  assert.equal(second.ship.cargo,1,'same crew cannot be duplicated on another lap');
  assert.equal(second.pads.filter(p=>!p.occupied).length,1,'only one unique pad used');
  await page.evaluate(w=>window.__afterlightDebug.setShip(260+w,425,0,0,0),w);
  await page.waitForTimeout(150);
  const docked=await snap();
  assert.equal(docked.delivered,1,'carrier docking on its wrapped image');
  assert.equal(docked.ship.cargo,0);
  report.rescue={padId:pad.id,pickupX:pad.x-w,dockedX:260+w,delivered:docked.delivered,uniquePadsUsed:docked.pads.filter(p=>!p.occupied).length};
  for(const remaining of docked.pads.filter(p=>p.occupied)) {
    const y=await page.evaluate(x=>window.__afterlightDebug.ground(x),remaining.x);
    await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,5,0),[remaining.x,y-14]);
    await page.waitForTimeout(100);
  }
  await page.evaluate(()=>window.__afterlightDebug.setShip(260,425,0,0,0));
  await page.waitForFunction(()=>window.__afterlightDebug.snapshot().mode==='result',null,{timeout:2500});
  const won=await snap();
  assert.equal(won.delivered,5,'all five stage-one crew delivered');
  assert.equal(await page.locator('#resultTitle').innerText(),'SECTOR CLEAR');
  report.rescue.stageCompletion={delivered:won.delivered,mode:won.mode};
  assert.equal(errors.length,0,`rescue browser errors: ${errors.join('; ')}`);
  await context.close();
}

{
  const {context,page,errors,snap}=await opened(config[0]);
  const s0=await snap(),w=s0.worldWidth,t=s0.turrets.at(-1);
  const ground=await page.evaluate(x=>window.__afterlightDebug.ground(x),t.x);
  await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,0,Math.PI),[t.x-w,ground-205]);
  await page.keyboard.down('Space');await page.waitForTimeout(1250);await page.keyboard.up('Space');
  const fired=await snap();
  assert.equal(fired.turrets.find(v=>v.x===t.x).hp,0,'cross-seam bullet hit turret');
  assert.ok(fired.score>=150,'turret destruction awarded score');
  const aimTurret=s0.turrets[0];
  const aimGround=await page.evaluate(x=>window.__afterlightDebug.ground(x),aimTurret.x);
  let maxEnemy=0;
  for(let i=0;i<34;i++){
    await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,0,0),[aimTurret.x-w+200,aimGround-230]);
    await page.waitForTimeout(100);
    maxEnemy=Math.max(maxEnemy,(await snap()).entities.enemyBullets);
  }
  assert.ok(maxEnemy>0,'turret acquires ship across seam and fires');
  report.combat={turretX:t.x,imageX:t.x-w,hpAfter:fired.turrets.find(v=>v.x===t.x).hp,score:fired.score,maxEnemyBullets:maxEnemy};
  assert.equal(errors.length,0,`combat browser errors: ${errors.join('; ')}`);
  await context.close();
}

{
  const {context,page,errors,snap}=await opened(config[0]);
  const before=await frameTimes(page,90),w=(await snap()).worldWidth;
  let maxima={particles:0,bullets:0,enemyBullets:0};
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowUp');
  for(let lap=-8;lap<=8;lap++){
    await page.evaluate(([x,y])=>window.__afterlightDebug.setShip(x,y,0,0,0),[540+lap*w,430]);
    await page.waitForTimeout(65);
    const s=await snap();
    for(const key of Object.keys(maxima))maxima[key]=Math.max(maxima[key],s.entities[key]);
    assert.equal(s.mode,'playing',`lap ${lap} remains playable`);
  }
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowUp');
  const after=await frameTimes(page,90);
  assert.ok(maxima.particles>0&&maxima.bullets>0,'repeated laps exercised particle and bullet lists');
  assert.ok(maxima.particles<=360,'particle cap');
  assert.ok(maxima.bullets<100&&maxima.enemyBullets<100,'projectiles bounded across laps');
  assert.ok(after.p95<100,'render remains responsive after repeated laps');
  assert.equal(errors.length,0,`lap browser errors: ${errors.join('; ')}`);
  report.laps={count:17,maxima,before,after};
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(out,'wrap-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,crossings:report.crossings,rescue:report.rescue,combat:report.combat,laps:report.laps,errors:report.errors},null,2));

async function frameTimes(page,count){return page.evaluate(n=>new Promise(resolve=>{const arr=[];let last=0;function tick(t){if(last)arr.push(t-last);last=t;if(arr.length<n)requestAnimationFrame(tick);else{arr.sort((a,b)=>a-b);resolve({median:arr[Math.floor(arr.length*.5)],p95:arr[Math.floor(arr.length*.95)],max:arr.at(-1)});}}requestAnimationFrame(tick);}),count);}
