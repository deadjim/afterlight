import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const base=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const report={climbs:{},coastToOrbit:{},shield:{},impact:{},enemies:{},warnings:{},errors:[]};
const viewports=[{name:'desktop',width:1280,height:720,mobile:false},{name:'portrait',width:390,height:844,mobile:true},{name:'landscape',width:844,height:390,mobile:true}];
async function open(c) {
  const context=await browser.newContext({viewport:{width:c.width,height:c.height},isMobile:c.mobile,hasTouch:c.mobile,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(base,{waitUntil:'networkidle'});
  const dimensions=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));
  assert.deepEqual(dimensions,{w:c.width,h:c.height},`${c.name} title fits viewport`);
  await page.screenshot({path:path.join(out,`balance-${c.name}-title.png`)});
  await page.locator('#startButton').click();
  if(c.name==='landscape'){
    const panel=await page.locator('#briefingScreen .info-panel').boundingBox();
    assert.ok(panel&&panel.y>=8&&panel.y+panel.height<=c.height-8,`landscape briefing panel fits ${JSON.stringify(panel)}`);
    await page.screenshot({path:path.join(out,'balance-landscape-briefing.png')});
  }
  await page.locator('#briefingButton').click();
  if(c.mobile){
    await page.locator('#pauseButton').click();
    const panel=await page.locator('#pauseScreen .info-panel').boundingBox();
    assert.ok(panel&&panel.y>=8&&panel.y+panel.height<=c.height-8,`${c.name} pause panel fits ${JSON.stringify(panel)}`);
    await page.screenshot({path:path.join(out,`balance-${c.name}-pause.png`)});
    await page.locator('#resumeButton').click();
  }
  return {context,page,errors,snap:()=>page.evaluate(()=>window.__afterlightDebug.snapshot())};
}
function screenY(s,c){const vh=c.width>c.height*1.7&&c.height<600?560:c.width<650?840:930;return c.height/2+(s.ship.y-s.camera.y)*(c.height/vh);}
async function ground(page,x){return page.evaluate(x=>window.__afterlightDebug.ground(x),x)}
async function place(page,x,y,vx=0,vy=0,a=0){await page.evaluate(v=>window.__afterlightDebug.setShip(...v),[x,y,vx,vy,a]);}
async function resources(page,v){await page.evaluate(v=>window.__afterlightDebug.setResources(v),v);}
function checkErrors(errors,label){assert.deepEqual(errors,[],`${label} browser errors`);report.errors.push(...errors.map(error=>({label,error})));}

for(const c of viewports) {
  const {context,page,errors,snap}=await open(c);
  await place(page,260,(await ground(page,260))-180,0,0,0);
  await resources(page,{fuel:100,hull:100});
  await page.screenshot({path:path.join(out,`balance-${c.name}-ground.png`)});
  const initial=await snap();
  assert.equal(initial.ship.inSpace,false);
  await page.keyboard.down('ArrowUp');
  // Capture the first orbital rAF, since one 500 ms poll at 10× burn loses ~35% fuel.
  const climb=await page.evaluate(()=>new Promise(resolve=>{
    const start=window.__afterlightDebug.snapshot().time,samples=[];let next=.5;
    const row=s=>({time:s.time-start,altitude:s.ship.altitude,y:s.ship.y,vy:s.ship.vy,fuel:s.ship.fuel,hold:s.ship.thrustHold,tier:s.ship.boostTier,power:s.ship.power,inSpace:s.ship.inSpace,ship:{x:s.ship.x,y:s.ship.y},camera:s.camera});
    function tick(){const s=window.__afterlightDebug.snapshot(),elapsed=s.time-start;
      if(elapsed>=next){samples.push(row(s));next+=.5}
      if(s.ship.inSpace||elapsed>=18){resolve({entry:s.ship.inSpace?row(s):null,samples});return}
      requestAnimationFrame(tick);
    }tick();
  }));
  await page.keyboard.up('ArrowUp');
  const samples=climb.samples.map(s=>({...s,screenY:screenY({ship:s.ship,camera:s.camera},c)}));
  const entered=climb.entry;
  assert.ok(entered,`${c.name} did not reach orbit under continuous real keyboard thrust`);
  assert.ok(entered.time>=10,`${c.name} orbit arrived too early (${entered.time.toFixed(2)}s)`);
  assert.ok(entered.time<=17,`${c.name} orbit took too long (${entered.time.toFixed(2)}s)`);
  assert.ok(entered.fuel>=35,`${c.name} orbit entry needs useful fuel reserve, got ${entered.fuel.toFixed(1)}%`);
  const at1=samples.find(s=>s.time>=1.15),at2=samples.find(s=>s.time>=2.15),at3=samples.find(s=>s.time>=3.15);
  assert.ok(at1?.tier>=1&&at1.power>=1.5,`${c.name} first afterburner tier`);
  assert.ok(at2?.tier>=2&&at2.power>=1.75,`${c.name} second afterburner tier`);
  assert.ok(at3?.tier>=3&&at3.power>=2.05,`${c.name} third afterburner tier`);
  assert.ok(samples.filter(s=>s.time>=1).every(s=>s.screenY>45&&s.screenY<c.height-45),`${c.name} ship leaves viewport during climb`);
  const release=await snap();
  await page.waitForTimeout(450);
  const coast=await snap();
  assert.equal(coast.ship.boostTier,0,`${c.name} boost resets on release`);
  assert.equal(coast.ship.power,1,`${c.name} power resets on release`);
  assert.ok(Math.abs(coast.ship.fuel-release.ship.fuel)<.12,`${c.name} fuel stays stable while coasting`);
  assert.ok(Math.hypot(coast.ship.vx,coast.ship.vy)>.7*Math.hypot(release.ship.vx,release.ship.vy),`${c.name} momentum persists after boost release`);
  await page.screenshot({path:path.join(out,`balance-${c.name}-orbit.png`)});
  report.climbs[c.name]={orbitAt:entered.time,fuelAtOrbit:entered.fuel,altitude:entered.altitude,at1,at2,at3,releaseSpeed:Math.hypot(release.ship.vx,release.ship.vy),coastSpeed:Math.hypot(coast.ship.vx,coast.ship.vy),samples};
  if(c.name==='desktop') {
    // Compare equal tier-0 burns at ground and in orbit using real held input.
    await resources(page,{fuel:100});
    await place(page,260,300,0,0,Math.PI/2);
    await page.waitForTimeout(60);
    const g0=await snap();await page.keyboard.down('ArrowUp');await page.waitForTimeout(550);await page.keyboard.up('ArrowUp');const g1=await snap();
    const groundRate=(g0.ship.fuel-g1.ship.fuel)/(g1.time-g0.time);
    await resources(page,{fuel:100});
    await place(page,260,-5000,0,0,Math.PI/2);
    await page.waitForTimeout(60);
    const o0=await snap();assert.equal(o0.ship.inSpace,true,'assisted orbit position registers as space');
    await page.keyboard.down('ArrowUp');await page.waitForTimeout(550);await page.keyboard.up('ArrowUp');const o1=await snap();
    const orbitRate=(o0.ship.fuel-o1.ship.fuel)/(o1.time-o0.time);
    assert.ok(orbitRate/groundRate>1.8&&orbitRate/groundRate<2.2,`orbit fuel burn ratio ${orbitRate/groundRate}`);
    report.climbs.desktop.fuelRates={groundRate,orbitRate,ratio:orbitRate/groundRate};
    await place(page,260,(await ground(page,260))-200,0,0,0);
    await page.waitForTimeout(100);
    assert.equal((await snap()).ship.inSpace,false,'assisted return reenters atmosphere');
    await resources(page,{fuel:20.5});
    await page.evaluate(()=>{window.__warningCalls=0;const prior=window.AfterlightAudio.warning;window.AfterlightAudio.warning=function(...args){window.__warningCalls++;return prior.apply(this,args)}});
    await page.keyboard.down('ArrowUp');await page.waitForTimeout(220);await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(250);
    const low=await snap();
    const lowUI=await page.evaluate(()=>({fuelText:document.getElementById('hudFuel')?.textContent,isLow:document.getElementById('hudFuel')?.classList.contains('is-low'),warningCalls:window.__warningCalls}));
    assert.ok(low.ship.fuel<=20&&low.ship.fuelWarned,'20% warning triggers on crossing threshold');
    assert.equal(lowUI.isLow,true,'20% visual warning active');
    assert.equal(lowUI.warningCalls,1,'20% warning audio fires once and does not spam while low');
    report.warnings={fuel:low.ship.fuel,flag:low.ship.fuelWarned,...lowUI};
  }
  checkErrors(errors,c.name);
  await context.close();
}

{
  const {context,page,errors,snap}=await open(viewports[0]);
  await place(page,260,(await ground(page,260))-180,0,0,0);
  await resources(page,{fuel:100});
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.preOrbitWarned,null,{timeout:15000});
  await page.keyboard.up('ArrowUp');
  const atCue=await snap();
  assert.ok(atCue.ship.altitude>=4700&&atCue.ship.altitude<5500,'pre-orbit warning precedes orbital boundary');
  assert.ok(atCue.ship.fuel>45,'warning arrives with useful fuel reserve');
  await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.inSpace,null,{timeout:4000});
  const atOrbit=await snap();
  assert.ok(atOrbit.ship.orbitEntryFuel>=atCue.ship.fuel-.12,'releasing at warning coasts into orbit without fuel burn');
  assert.ok(atOrbit.ship.orbitEntryFuel>45,'coasted orbit entry preserves more than 45% fuel');
  assert.equal(atOrbit.ship.boostTier,0,'coasted orbit has no active afterburner');
  report.coastToOrbit={cueAltitude:atCue.ship.altitude,cueFuel:atCue.ship.fuel,entryAltitude:atOrbit.ship.altitude,entryFuel:atOrbit.ship.orbitEntryFuel,entryAt:atOrbit.ship.orbitEntryTime,boostTier:atOrbit.ship.boostTier};
  checkErrors(errors,'coastToOrbit');await context.close();
}

{
  const {context,page,errors,snap}=await open(viewports[0]);
  await place(page,260,260,0,0,0);
  await page.evaluate(()=>{window.__shieldEmptyCalls=0;const prior=window.AfterlightAudio.shieldEmpty;window.AfterlightAudio.shieldEmpty=function(...args){window.__shieldEmptyCalls++;return prior.apply(this,args)}});
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(2200);
  const drained=await snap();
  assert.ok(drained.ship.shieldCharge<1,'shield drains in about two seconds');
  assert.equal(drained.ship.shieldActive,false,'drained shield stops blocking');
  assert.equal(drained.ship.shieldArmed,false,'drained shield needs release');
  await page.waitForTimeout(450);
  const held=await snap();
  assert.ok(held.ship.shieldCharge<1,'shield stays empty while held');
  assert.equal(await page.evaluate(()=>window.__shieldEmptyCalls),1,'shield depleted audio fires once while held');
  await page.keyboard.up('ShiftLeft');
  const recharge=[];
  for(let i=0;i<17;i++){
    await place(page,260,260,0,0,0);
    await page.waitForTimeout(1000);
    const s=await snap();recharge.push({time:i+1,charge:s.ship.shieldCharge,armed:s.ship.shieldArmed,active:s.ship.shieldActive});
  }
  assert.ok(recharge[6].charge>20&&recharge[6].charge<80,'shield recharges gradually');
  assert.ok(recharge.at(-1).charge>=99,'shield full after recharge period');
  await page.keyboard.down('ShiftLeft');await page.waitForTimeout(120);const rearmed=await snap();await page.keyboard.up('ShiftLeft');
  assert.equal(rearmed.ship.shieldActive,true,'shield can activate after recharge');
  report.shield={drained:{charge:drained.ship.shieldCharge,active:drained.ship.shieldActive,armed:drained.ship.shieldArmed},heldCharge:held.ship.shieldCharge,recharge,rearmed:{charge:rearmed.ship.shieldCharge,active:rearmed.ship.shieldActive}};
  checkErrors(errors,'shield');await context.close();
}

{
  const {context,page,errors,snap}=await open(viewports[0]);
  const pad=(await snap()).pads[1],y=await ground(page,pad.x);
  await resources(page,{hull:100});
  await page.waitForTimeout(1750);
  await place(page,pad.x,y-54,0,180,0);
  await page.waitForTimeout(350);
  const hard=await snap();
  assert.ok(hard.ship.hull<100,'hard impact costs hull');
  assert.equal(hard.pads.find(p=>p.id===pad.id).occupied,true,'hard impact does not collect crew');
  await place(page,pad.x,y-14,0,5,0);
  await page.waitForFunction(id=>!window.__afterlightDebug.snapshot().pads.find(p=>p.id===id).occupied,pad.id,{timeout:4000});
  const gentle=await snap();
  assert.equal(gentle.ship.cargo,1,'gentle follow-up landing collects crew');
  report.impact={padId:pad.id,hardHull:hard.ship.hull,gentleCargo:gentle.ship.cargo};
  checkErrors(errors,'impact');await context.close();
}

{
  const {context,page,errors,snap}=await open(viewports[0]);
  const start=await snap(),width=start.worldWidth,first=start.flyingEnemies[0];
  const initialGround=start.flyingEnemies.filter(e=>!e.space&&e.hp>0).length;
  const initialSpace=start.flyingEnemies.filter(e=>e.space&&e.hp>0).length;
  assert.equal(initialGround,3,'stage one starts with three ground interceptors');
  assert.equal(initialSpace,4,'stage one starts with four orbital guardians');
  assert.equal(start.entities.flyingEnemies,7,'active enemy count includes both bounded groups');
  // Position on a wrapped image, but use actual Fire input and simulated bullets.
  await page.keyboard.down('Space');
  for(let i=0;i<15;i++){
    const enemy=(await snap()).flyingEnemies.find(e=>e.id===first.id);
    await place(page,enemy.x-width,enemy.y+125,0,0,0);
    await page.waitForTimeout(100);
    if((await snap()).flyingEnemies.find(e=>e.id===first.id).hp<=0)break;
  }
  await page.keyboard.up('Space');
  const destroyed=await snap(),target=destroyed.flyingEnemies.find(e=>e.id===first.id);
  assert.equal(target.hp,0,'actual Fire input destroys interceptor across wrapped image');
  assert.ok(destroyed.score>=start.score+200,'interceptor kill awards score');
  assert.equal(destroyed.entities.flyingEnemies,6,'interceptor kill reduces active enemy count');
  const second=destroyed.flyingEnemies.find(e=>e.hp>0);
  let maxEnemyBullets=0;
  for(let i=0;i<34;i++){
    const enemy=(await snap()).flyingEnemies.find(e=>e.id===second.id);
    await place(page,enemy.x-width+210,enemy.y,0,0,0);
    await page.waitForTimeout(100);
    maxEnemyBullets=Math.max(maxEnemyBullets,(await snap()).entities.enemyBullets);
  }
  const aimed=await snap();
  assert.ok(aimed.flyingEnemies.find(e=>e.id===second.id).shotCount>0,'interceptor acquires ship across world seam');
  assert.ok(maxEnemyBullets>0,'interceptor fired physical projectiles');
  report.enemies={initial:{ground:initialGround,space:initialSpace,total:start.entities.flyingEnemies},destroyed:{id:target.id,hp:target.hp,score:destroyed.score,remaining:destroyed.entities.flyingEnemies},aimed:{id:second.id,shots:aimed.flyingEnemies.find(e=>e.id===second.id).shotCount,maxEnemyBullets}};
  checkErrors(errors,'enemies');await context.close();
}

await browser.close();
await fs.writeFile(path.join(out,'balance-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,climbs:Object.fromEntries(Object.entries(report.climbs).map(([name,c])=>[name,{orbitAt:c.orbitAt,fuelAtOrbit:c.fuelAtOrbit,releaseSpeed:c.releaseSpeed,coastSpeed:c.coastSpeed,fuelRates:c.fuelRates}])),coastToOrbit:report.coastToOrbit,shield:{drained:report.shield.drained,rearmed:report.shield.rearmed},impact:report.impact,warnings:report.warnings,enemies:report.enemies,errors:report.errors},null,2));
