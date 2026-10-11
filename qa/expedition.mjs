import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out=path.dirname(new URL(import.meta.url).pathname);
const base=process.argv[2]||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(base,{waitUntil:'networkidle'});
await page.locator('#startButton').click();await page.locator('#briefingButton').click();
const snap=()=>page.evaluate(()=>window.__afterlightDebug.snapshot());
const report={route:[],first:{},revisit:{},outer:{},home:{},combat:{},resources:{},errors};
const initial=await snap(),a=initial.spaceBodies[0],b=initial.spaceBodies[1];
assert.equal(initial.ship.fuel,100,'fresh launch fuel');
assert.equal(initial.salvageCount,0);
assert.equal(initial.spaceBodies.length,2,'two optional outposts exist');
assert.ok(a.dockY<initial.ship.y-5000&&b.dockY<a.dockY-4000,'outposts are far above the home terrain');
let pressed={left:false,right:false,thrust:false};
async function controls(next){for(const key of ['left','right','thrust']){const wanted=!!next[key];if(wanted===pressed[key])continue;const code={left:'ArrowLeft',right:'ArrowRight',thrust:'ArrowUp'}[key];if(wanted)await page.keyboard.down(code);else await page.keyboard.up(code);pressed[key]=wanted;}}
const normalize=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
await controls({thrust:true});
await page.waitForFunction(()=>window.__afterlightDebug.snapshot().ship.preOrbitWarned,null,{timeout:15000});
await controls({});
const cue=await snap();
assert.ok(cue.ship.altitude>=4700&&cue.ship.fuel>45,'actual keyboard climb reached pre-orbit cue with fuel reserve');
report.cue={time:cue.time,position:{x:cue.ship.x,y:cue.ship.y},velocity:{vx:cue.ship.vx,vy:cue.ship.vy},fuel:cue.ship.fuel};
let minDockDistance=Infinity,minDockSpeed=Infinity;
for(let i=0;i<260;i++){
  const s=await snap();
  const dx=await page.evaluate(([x,origin])=>window.__afterlightDebug.wrappedDx(x,origin),[a.dockX,s.ship.x]);
  const dy=a.dockY-s.ship.y,dist=Math.hypot(dx,dy),speed=Math.hypot(s.ship.vx,s.ship.vy);
  if(dist<minDockDistance){minDockDistance=dist;minDockSpeed=speed;}
  if(i%5===0)report.route.push({time:s.time,x:s.ship.x,y:s.ship.y,vx:s.ship.vx,vy:s.ship.vy,fuel:s.ship.fuel,hull:s.ship.hull,a:s.ship.a,dist,speed,boost:s.ship.boostTier});
  if(s.spaceBodies[0].claimed){report.first.arrival={time:s.time,dist,speed,fuel:s.ship.fuel,hull:s.ship.hull};break;}
  if(s.mode!=='playing'||s.ship.fuel<=0)break;
  // Closed-loop keyboard pilot: aim toward the acceleration needed to stop at the dock.
  const desiredX=clamp(dx*.42,-220,220),desiredY=clamp(dy*.42,-460,460);
  const ax=clamp((desiredX-s.ship.vx)*2.2,-650,650);
  const ay=clamp((desiredY-s.ship.vy)*2.2-23,-650,650);
  const aim=Math.atan2(ax,-ay),error=normalize(aim-s.ship.a);
  await controls({left:error<-.11,right:error>.11,thrust:Math.hypot(ax,ay)>42&&Math.abs(error)<.48});
  await page.waitForTimeout(100);
}
await controls({});
const reached=await snap();
report.first={...report.first,claimed:reached.spaceBodies[0].claimed,minDockDistance,minDockSpeed,ship:{x:reached.ship.x,y:reached.ship.y,vx:reached.ship.vx,vy:reached.ship.vy,fuel:reached.ship.fuel,hull:reached.ship.hull},salvageCount:reached.salvageCount,score:reached.score,mode:reached.mode};
await page.screenshot({path:path.join(out,'expedition-first-outpost.png')});
await page.screenshot({path:path.join(out,'space-expedition.png')});
await fs.writeFile(path.join(out,'expedition-report.json'),JSON.stringify(report,null,2));
assert.equal(reached.spaceBodies[0].claimed,true,'fresh keyboard flight docks at first outpost');
assert.equal(reached.salvageCount,1,'first outpost yields one salvage');
assert.ok(reached.score>=750,'first outpost awards finite score bonus');
assert.equal(reached.ship.fuel,100,'first outpost refuels craft');
assert.ok(report.route.at(-2)?.fuel>20,'real approach keeps fuel reserve before docking');

// The remaining positions are assisted; dock, collision, enemy, and score changes
// still come from the real simulation rather than direct state edits.
const place=(x,y,vx=0,vy=0,a=0)=>page.evaluate(v=>window.__afterlightDebug.setShip(...v),[x,y,vx,vy,a]);
const resources=v=>page.evaluate(v=>window.__afterlightDebug.setResources(v),v);
await resources({fuel:20,hull:60});
await place(a.dockX+280,a.dockY,0,0,0);await page.waitForTimeout(130);
const beforeRevisit=await snap();
await place(a.dockX,a.dockY,0,0,0);
await page.waitForFunction(()=>window.__afterlightDebug.snapshot().spaceBodies[0].docks>=2,null,{timeout:1500});
const revisited=await snap();
assert.equal(revisited.salvageCount,1,'repeat dock cannot duplicate salvage');
assert.equal(revisited.score,beforeRevisit.score,'repeat dock cannot duplicate score bonus');
assert.equal(revisited.ship.fuel,100,'repeat dock refuels');
assert.equal(revisited.ship.hull,100,'repeat dock repairs');
await page.waitForTimeout(500);
assert.equal((await snap()).spaceBodies[0].docks,2,'holding inside docking ring does not farm dock events');
report.revisit={docks:revisited.spaceBodies[0].docks,salvageCount:revisited.salvageCount,score:revisited.score,fuel:revisited.ship.fuel,hull:revisited.ship.hull};

await resources({fuel:25,hull:40});
await place(b.dockX,b.dockY,0,0,0);
await page.waitForFunction(()=>window.__afterlightDebug.snapshot().spaceBodies[1].claimed,null,{timeout:1500});
const outer=await snap();
assert.equal(outer.salvageCount,2,'outer outpost yields second unique salvage');
assert.equal(outer.spaceBodies[1].docks,1);
assert.equal(outer.score,revisited.score+1200,'outer outpost awards one bonus');
assert.equal(outer.ship.fuel,100,'outer outpost refuels');
assert.ok(outer.ship.hull>=85,'outer outpost repairs hull');
report.outer={dock:{x:b.dockX,y:b.dockY},docks:outer.spaceBodies[1].docks,salvageCount:outer.salvageCount,score:outer.score,fuel:outer.ship.fuel,hull:outer.ship.hull};
await page.screenshot({path:path.join(out,'expedition-outer-outpost.png')});

const sentinel=outer.flyingEnemies.find(e=>e.space&&e.hp>0),width=outer.worldWidth;
assert.ok(sentinel&&sentinel.hp>=4,'space guardian is tougher than ground interceptor');
await page.keyboard.down('Space');
for(let i=0;i<27;i++){
  const e=(await snap()).flyingEnemies.find(e=>e.id===sentinel.id);
  await place(e.x-width,e.y+130,0,0,0);
  await page.waitForTimeout(100);
  if((await snap()).flyingEnemies.find(e=>e.id===sentinel.id).hp<=0)break;
}
await page.keyboard.up('Space');
const killed=await snap();
assert.equal(killed.flyingEnemies.find(e=>e.id===sentinel.id).hp,0,'actual Fire input destroys tough guardian through wrapped image');
assert.ok(killed.score>=outer.score+350,'guardian awards score on death');
const shooter=killed.flyingEnemies.find(e=>e.space&&e.hp>0);
let maxEnemyBullets=0;
for(let i=0;i<37;i++){
  const e=(await snap()).flyingEnemies.find(e=>e.id===shooter.id);
  await place(e.x-width+300,e.y,0,0,0);
  await page.waitForTimeout(100);
  maxEnemyBullets=Math.max(maxEnemyBullets,(await snap()).entities.enemyBullets);
}
const aimed=await snap();
assert.ok(aimed.flyingEnemies.find(e=>e.id===shooter.id).shotCount>0,'guardian aims across seam');
assert.ok(maxEnemyBullets>=3,'guardian launches spread of physical projectiles');
assert.ok(aimed.entities.flyingEnemies<=initial.entities.flyingEnemies,'guardian entity count stays bounded');
report.combat={initialGuardians:initial.flyingEnemies.filter(e=>e.space).length,killedId:sentinel.id,killedHp:killed.flyingEnemies.find(e=>e.id===sentinel.id).hp,scoreGain:killed.score-outer.score,shooterId:shooter.id,shots:aimed.flyingEnemies.find(e=>e.id===shooter.id).shotCount,maxEnemyBullets};

await place(260,-21000,0,0,0);await page.waitForTimeout(150);
const far=await snap();
assert.ok(far.homePlanet.radiusPx<reached.homePlanet.radiusPx*.25,'home world recedes at far orbit');
assert.ok(far.homePlanet.opacity<reached.homePlanet.opacity,'home world fades with distance');
await page.screenshot({path:path.join(out,'expedition-far-home.png')});
report.resources={nearPlanet:reached.homePlanet,farPlanet:far.homePlanet,spaceBodies:far.spaceBodies.length,activeEnemies:far.entities.flyingEnemies,particleCount:far.entities.particles,bulletCount:far.entities.bullets};
const frameTimes=()=>page.evaluate(()=>new Promise(resolve=>{const arr=[];let last=0;function tick(t){if(last)arr.push(t-last);last=t;if(arr.length<90)requestAnimationFrame(tick);else{arr.sort((a,b)=>a-b);resolve({median:arr[45],p95:arr[85],max:arr[89]})}}requestAnimationFrame(tick)}));
const beforeStress=await frameTimes(),maxima={particles:0,bullets:0,enemyBullets:0};
await page.keyboard.down('Space');await page.keyboard.down('ArrowUp');
for(let lap=-8;lap<=8;lap++){
  await place(540+lap*width,-9000,0,0,0);await page.waitForTimeout(65);
  const s=await snap();
  assert.equal(s.spaceBodies.length,2,`space lap ${lap} retains two outposts`);
  assert.equal(s.flyingEnemies.length,7,`space lap ${lap} does not duplicate guardians`);
  for(const key of Object.keys(maxima))maxima[key]=Math.max(maxima[key],s.entities[key]);
}
await page.keyboard.up('Space');await page.keyboard.up('ArrowUp');
const afterStress=await frameTimes();
assert.ok(maxima.particles>0&&maxima.bullets>0,'space laps exercise bounded particles and projectiles');
assert.ok(maxima.particles<=360&&maxima.bullets<100&&maxima.enemyBullets<100,'space entity lists remain bounded');
assert.ok(afterStress.p95<100,'space rendering remains responsive after repeated laps');
report.resources.spaceLaps={count:17,maxima,beforeStress,afterStress};

// Return-home trigger after the real outward flight; this leg is position-assisted.
await place(260,425,0,0,0);await page.waitForTimeout(180);
const home=await snap();
assert.equal(home.mode,'playing','home carrier remains playable after expedition');
assert.equal(home.salvageCount,2,'home return preserves both salvages');
assert.equal(home.ship.fuel,100,'home carrier refuels after expedition');
report.home={mode:home.mode,position:{x:home.ship.x,y:home.ship.y},fuel:home.ship.fuel,salvageCount:home.salvageCount,score:home.score};

// Fresh unclaimed planetoid: impact damage without an accidental high-speed dock.
await page.evaluate(()=>window.__afterlightDebug.start(1));
await place(200,-4000,0,0,0);await page.waitForTimeout(1700);
await place(a.x,a.y+a.radius+180,0,-570,0);
await page.waitForTimeout(500);
const impacted=await snap();
assert.ok(impacted.ship.hull<100,'hard planetoid collision damages hull');
assert.equal(impacted.salvageCount,0,'hard collision awards no salvage');
assert.equal(impacted.spaceBodies[0].claimed,false,'hard collision does not count as docking');
report.hardImpact={hull:impacted.ship.hull,salvageCount:impacted.salvageCount,claimed:impacted.spaceBodies[0].claimed};
assert.deepEqual(errors,[],'expedition browser errors');
await fs.writeFile(path.join(out,'expedition-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,cue:report.cue,first:report.first,revisit:report.revisit,outer:report.outer,combat:report.combat,home:report.home,hardImpact:report.hardImpact,resources:report.resources,errors},null,2));
await browser.close();
