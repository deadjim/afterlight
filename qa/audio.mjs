import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.dirname(new URL(import.meta.url).pathname);
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const context=await browser.newContext({viewport:{width:900,height:700}});
await context.addInitScript(()=>{
  const Native=window.AudioContext||window.webkitAudioContext;
  if(!Native)return;
  const audioSpy={contexts:0,gains:[],oscillators:0,buffers:0,filters:0};
  class ObservedContext extends Native {
    constructor(...args){super(...args);audioSpy.contexts++;audioSpy.context=this;}
    createGain(){const node=super.createGain();audioSpy.gains.push(node);return node;}
    createOscillator(){audioSpy.oscillators++;return super.createOscillator();}
    createBufferSource(){audioSpy.buffers++;return super.createBufferSource();}
    createBiquadFilter(){audioSpy.filters++;return super.createBiquadFilter();}
  }
  window.AudioContext=ObservedContext;
  window.__audioSpy=audioSpy;
});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
const inspect=()=>page.evaluate(()=>({contexts:window.__audioSpy.contexts,state:window.__audioSpy.context?.state??null,nodes:{gains:window.__audioSpy.gains.length,oscillators:window.__audioSpy.oscillators,buffers:window.__audioSpy.buffers,filters:window.__audioSpy.filters},masterGain:window.__audioSpy.gains[0]?.gain.value??null,engineGain:window.__audioSpy.gains[1]?.gain.value??null,muted:window.AfterlightAudio?.muted??null,mode:window.__afterlightDebug?.snapshot().mode??null}));
const before=await inspect();
assert.equal(before.contexts,0,'audio context starts only after user gesture');
await page.locator('#startButton').click();
await page.locator('#briefingButton').click();
await page.waitForTimeout(120);
const started=await inspect();
assert.equal(started.contexts,1,'one audio context created after click');
assert.equal(started.state,'running','user gesture resumes audio context');
assert.ok(started.nodes.gains>=2 && started.nodes.oscillators>=2 && started.nodes.buffers>=1,'persistent engine graph exists');
await page.keyboard.down('ArrowUp');
await page.evaluate(()=>{for(let i=0;i<120;i++)window.AfterlightAudio.engine(1)});
await page.waitForTimeout(180);
const engineOn=await inspect();
assert.ok(engineOn.engineGain>.4,'engine reaches audible gain');
assert.deepEqual(engineOn.nodes,started.nodes,'steady engine calls create no nodes');
await page.evaluate(()=>{for(let i=0;i<240;i++)window.AfterlightAudio.engine(1,6.25,true)});
const highBoost=await inspect();
assert.deepEqual(highBoost.nodes,started.nodes,'sustained full boost in orbit creates no new audio nodes');
await page.keyboard.up('ArrowUp');
await page.evaluate(()=>window.AfterlightAudio.engine(0));
await page.waitForTimeout(250);
const engineOff=await inspect();
assert.ok(engineOff.engineGain<.04,'engine(0) decays to silence');
await page.evaluate(()=>{window.AfterlightAudio.engine(1);window.AfterlightAudio.pause(true)});
await page.waitForTimeout(180);
const paused=await inspect();
assert.ok(paused.engineGain<.04,'pause stops engine');
await page.evaluate(()=>{window.AfterlightAudio.pause(false);window.AfterlightAudio.engine(1);window.AfterlightAudio.setMuted(true)});
await page.waitForTimeout(180);
const muted=await inspect();
assert.equal(muted.muted,true);
assert.ok(muted.engineGain<.04 && muted.masterGain<.04,'mute silences engine and master');
await page.keyboard.down('ArrowUp');
await page.evaluate(()=>{window.AfterlightAudio.setMuted(false);window.AfterlightAudio.engine(1)});
await page.waitForTimeout(120);
const unmuted=await inspect();
assert.ok(unmuted.engineGain>.4 && unmuted.masterGain>.25,'unmute allows engine to restart');
await page.evaluate(()=>window.__audioSpy.context.suspend());
const suspended=await inspect();
assert.equal(suspended.state,'suspended','test context really suspended');
await page.locator('#pauseButton').click();
await page.locator('#resumeButton').click();
await page.waitForFunction(()=>window.__audioSpy.context.state==='running',null,{timeout:2000});
const resumed=await inspect();
assert.equal(resumed.contexts,1,'resume uses existing context');
await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
await page.waitForTimeout(160);
const blurred=await inspect();
assert.ok(blurred.engineGain<.04,'blur stops engine');
await page.locator('#resumeButton').click();
await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowUp');
await page.evaluate(()=>window.AfterlightAudio.engine(1));
await page.waitForTimeout(100);
await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
await page.waitForTimeout(170);
const hidden=await inspect();
assert.ok(hidden.engineGain<.04,'visibilitychange to hidden stops engine');
assert.equal(hidden.contexts,1,'lifecycle retains one audio context');
assert.equal(errors.length,0,'no page exceptions');
const report={before,started,engineOn,highBoost,engineOff,paused,muted,unmuted,suspended,resumed,blurred,hidden,errors};
await fs.writeFile(path.join(root,'audio-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,started,engineOn,highBoost,engineOff,paused,muted,suspended,resumed,blurred,hidden,errors},null,2));
await browser.close();
