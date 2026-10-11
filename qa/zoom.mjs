import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.dirname(new URL(import.meta.url).pathname),base=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const report={cases:[],limitation:'CDP page scale reproduces browser zoom in Chromium after a QA-only viewport-meta relaxation. Physical Safari pinch and nonzero visualViewport panning cannot be asserted by this emulator.'};
for(const factor of [1.5,2]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // The shipped meta clamps zoom to 1; relax only this QA response to emulate
  // Safari/browser state where native zoom occurred despite that safeguard.
  await page.route('**/',async route=>{const response=await route.fetch(),html=(await response.text()).replace('maximum-scale=1, user-scalable=no','maximum-scale=10, user-scalable=yes');await route.fulfill({response,body:html})});
  await page.goto(base,{waitUntil:'networkidle'});
  assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'),/maximum-scale=10/,'QA-only viewport meta relaxation applied');
  const session=await context.newCDPSession(page),send=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  const baseline=await page.locator('#flightJoystick').evaluate(e=>parseFloat(getComputedStyle(e).width));
  assert.ok(baseline>80,'joystick CSS base size measured before zoom');
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:factor});
  await page.waitForFunction(value=>Math.abs(visualViewport.scale-value)<.01,factor);
  await page.waitForTimeout(150);
  const inspect=async(ids,label)=>{
    const state=await page.evaluate(ids=>{const vv=visualViewport,canvas=document.querySelector('#gameCanvas');return {vv:{width:vv.width,height:vv.height,scale:vv.scale,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop},canvas:{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight},items:ids.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,display:getComputedStyle(e).display}})}},ids);
    for(const item of state.items)assert.ok(item.display!=='none'&&item.width>0&&item.height>0&&item.x>=state.vv.offsetLeft-.6&&item.y>=state.vv.offsetTop-.6&&item.right<=state.vv.offsetLeft+state.vv.width+.6&&item.bottom<=state.vv.offsetTop+state.vv.height+.6,`${factor}× ${label} ${item.selector} escapes visible viewport: ${JSON.stringify(item)} / ${JSON.stringify(state.vv)}`);
    const ratio=(state.canvas.width/state.canvas.height)/(state.canvas.clientWidth/state.canvas.clientHeight);
    assert.ok(Math.abs(ratio-1)<.015,`${factor}× ${label} canvas bitmap aspect ${ratio}`);
    return state;
  };
  const title=await inspect(['#game','#gameCanvas','#startButton','#pauseButton'],'title');
  await page.screenshot({path:path.join(root,`zoom-${factor}-title.png`)});
  await page.locator('#startButton').tap();
  const briefing=await inspect(['#briefingScreen .info-panel','#briefingButton'],'briefing');
  await page.locator('#briefingButton').tap();
  await page.evaluate(()=>window.__afterlightDebug.setShip(540,-1200,0,0,0));
  const flight=await inspect(['#game','#gameCanvas','#flightJoystick','[data-control="fire"]','[data-control="shield"]','#hudCrew','#hudFuel','#hudHull','#pauseButton'],'flight');
  const stick=flight.items.find(x=>x.selector==='#flightJoystick'),fire=flight.items.find(x=>x.selector==='[data-control="fire"]'),shield=flight.items.find(x=>x.selector==='[data-control="shield"]'),pause=flight.items.find(x=>x.selector==='#pauseButton');
  assert.ok(Math.abs(stick.width*factor-baseline)<2,`${factor}× apparent joystick size preserved (${stick.width*factor} vs ${baseline})`);
  const pt=(x,id)=>({x:x.x+x.width/2,y:x.y+x.height/2,id});
  const stickPt=pt(stick,1),firePt=pt(fire,2),shieldPt=pt(shield,3),pausePt=pt(pause,4);
  const diagonal={x:stickPt.x+stick.width*.24,y:stickPt.y-stick.height*.24,id:1};
  await send('touchStart',[stickPt]);await send('touchMove',[diagonal]);
  await send('touchStart',[diagonal,firePt,shieldPt]);await page.waitForTimeout(220);
  const active=await page.evaluate(()=>window.__afterlightDebug.snapshot());
  assert.ok(active.joystick.throttle>.1&&Math.abs(active.joystick.turn)>.1&&active.entities.bullets>0&&active.ship.shieldActive,`${factor}× actual zoomed joystick, Fire, Shield inputs work`);
  await page.evaluate(()=>visualViewport.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(50);
  const afterNoop=await page.evaluate(()=>window.__afterlightDebug.snapshot());
  assert.ok(afterNoop.joystick.pointerId!==null&&afterNoop.joystick.throttle>.1,`${factor}× no-op visualViewport event preserves held joystick`);
  await page.screenshot({path:path.join(root,`zoom-${factor}-flight.png`)});
  await send('touchStart',[diagonal,firePt,shieldPt,pausePt]);await send('touchEnd',[pausePt]);await page.waitForTimeout(80);
  const paused=await page.evaluate(()=>window.__afterlightDebug.snapshot());
  assert.equal(paused.mode,'paused',`${factor}× second-thumb Pause works under native page scale`);
  assert.equal(paused.joystick.pointerId,null,`${factor}× Pause clears zoomed joystick`);
  await send('touchCancel',[]);
  const pausePanel=await inspect(['#pauseScreen .info-panel','#resumeButton'],'pause');
  await page.locator('#resumeButton').tap();
  assert.equal((await page.evaluate(()=>window.__afterlightDebug.snapshot())).mode,'playing',`${factor}× zoomed Resume works`);
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await page.waitForFunction(()=>Math.abs(visualViewport.scale-1)<.01);await page.waitForTimeout(150);
  const restored=await inspect(['#game','#gameCanvas','#flightJoystick','[data-control="fire"]','[data-control="shield"]','#pauseButton'],'restored');
  assert.ok(Math.abs(restored.items.find(x=>x.selector==='#flightJoystick').width-baseline)<2,`${factor}× root fit clears at scale 1`);
  assert.deepEqual(errors,[],`${factor}× no page errors`);
  report.cases.push({factor,title:{visual:title.vv,game:title.items[0]},briefing:{visual:briefing.vv},flight:{visual:flight.vv,joystickCssWidth:stick.width,joystickApparentWidth:stick.width*factor},active:{throttle:active.joystick.throttle,turn:active.joystick.turn,bullets:active.entities.bullets,shield:active.ship.shieldActive},noOpPreserved:true,paused:true,pausePanel:{visual:pausePanel.vv},restored:{visual:restored.vv},errors});
  await context.close();
}
await browser.close();await fs.writeFile(path.join(root,'zoom-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,...report},null,2));
