import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.dirname(new URL(import.meta.url).pathname);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
await page.locator('#startButton').click();
await page.locator('#briefingButton').click();
const snap = () => page.evaluate(() => window.__afterlightDebug.snapshot());
const initial = await snap();
await page.waitForTimeout(4200);
const afterPassiveLanding = await snap();
assert.equal(afterPassiveLanding.ship.cargo,1,'first survivor collected by physical landing');
assert.equal(afterPassiveLanding.pads[0].occupied,false);
const trace = [];
let current = { left: false, right: false, thrust: false };
async function press(next) {
  for (const key of ['left', 'right', 'thrust']) {
    if (!!next[key] === current[key]) continue;
    const code = { left: 'ArrowLeft', right: 'ArrowRight', thrust: 'ArrowUp' }[key];
    if (next[key]) await page.keyboard.down(code); else await page.keyboard.up(code);
  }
  current = next;
}
function norm(a) { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; }
function clamp(x,a,b) { return Math.max(a, Math.min(b,x)); }
for (let i=0; i<340; i++) {
  const s=await snap();
  if (i%10===0) trace.push({ t: s.time.toFixed(1), x: Math.round(s.ship.x), y: Math.round(s.ship.y), vx: Math.round(s.ship.vx), vy: Math.round(s.ship.vy), a: s.ship.a.toFixed(2), fuel: Math.round(s.ship.fuel), cargo: s.ship.cargo, delivered: s.delivered, mode: s.mode });
  if (s.delivered>0 || s.mode!=='playing') break;
  const targetX=s.objective.x, targetY=s.objective.y;
  const desiredVx=clamp((targetX-s.ship.x)*.6,-112,112);
  const desiredVy=clamp((targetY-s.ship.y)*.6,-125,125);
  let ax=(desiredVx-s.ship.vx)*2.0, ay=(desiredVy-s.ship.vy)*2.0-31;
  if(s.ship.y>735) ay=Math.min(ay,-140);
  const aim=Math.atan2(ax,-ay), error=norm(aim-s.ship.a);
  const throttle=Math.hypot(ax,ay)>35 && Math.abs(error)<.42;
  await press({ left:error<-.13, right:error>.13, thrust:throttle });
  await page.waitForTimeout(100);
}
await press({ left:false,right:false,thrust:false });
const afterFlight=await snap();
assert.equal(afterFlight.delivered,1,'keyboard flight delivered first survivor');
assert.equal(afterFlight.ship.cargo,0);
assert.ok(afterFlight.ship.fuel>=99,'carrier refilled fuel (allow a frame of held thrust after docking)');
assert.deepEqual(errors,[],'no page exceptions');
await page.screenshot({ path: path.join(out,'playloop-after-real-flight.png') });
const report={ initial, afterPassiveLanding, afterFlight, trace, errors };
await fs.writeFile(path.join(out,'playloop-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({initial:{ship:initial.ship},afterPassiveLanding:{ship:afterPassiveLanding.ship,pads:afterPassiveLanding.pads},afterFlight:{ship:afterFlight.ship,delivered:afterFlight.delivered,pads:afterFlight.pads,mode:afterFlight.mode,time:afterFlight.time},trace,errors},null,2));
await browser.close();
