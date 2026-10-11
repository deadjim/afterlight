import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=path.dirname(new URL(import.meta.url).pathname);
const base=process.argv.find(a=>a.startsWith('http'))||'http://127.0.0.1:4173';
const diagnostic=process.argv.includes('--diagnostic');
const report={diagnostic,cases:[],limitations:['Playwright WebKit simulates the engine and DPR; it does not reproduce physical iPhone browser chrome or pinch arbitration.']};

async function probe(page,label,filename){
  await page.waitForTimeout(130);
  const geometry=await page.evaluate(()=>{const c=document.querySelector('#gameCanvas'),r=c.getBoundingClientRect(),g=document.querySelector('#game').getBoundingClientRect();return {canvas:{width:c.width,height:c.height},css:{width:r.width,height:r.height},game:{width:g.width,height:g.height},inner:{width:innerWidth,height:innerHeight},visual:{width:visualViewport?.width,height:visualViewport?.height,scale:visualViewport?.scale},dpr:devicePixelRatio,resizeEvents:window.__qaResizeEvents||0}});
  // Stop the game's next RAF after one final frame, paint a circular marker in
  // backing pixels, and inspect its actual composited screenshot proportions.
  await page.evaluate(()=>{window.__qaOriginalRAF=window.requestAnimationFrame;window.__qaPendingRAF=null;window.requestAnimationFrame=cb=>{window.__qaPendingRAF=cb;return 0}});
  await page.waitForTimeout(55);
  await page.evaluate(()=>{const canvas=document.querySelector('#gameCanvas'),ctx=canvas.getContext('2d'),r=canvas.getBoundingClientRect(),perCss=canvas.width/r.width;canvas.style.zIndex='1000';ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#ff00ff';ctx.beginPath();ctx.arc(canvas.width*.5,canvas.height*.2,24*perCss,0,Math.PI*2);ctx.fill();ctx.restore()});
  const screenshot=await page.screenshot({path:path.join(root,filename)});
  await page.evaluate(()=>{document.querySelector('#gameCanvas').style.removeProperty('z-index');const original=window.__qaOriginalRAF,pending=window.__qaPendingRAF;window.requestAnimationFrame=original;if(pending)original(pending);window.__qaPendingRAF=null});
  const pixel=await page.evaluate(async base64=>{
    const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
    const data=x.getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=-1,bottom=-1,count=0;
    for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){const i=(y*c.width+xx)*4;if(data[i]>230&&data[i+1]<45&&data[i+2]>230&&data[i+3]>230){left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,y);bottom=Math.max(bottom,y);count++}}
    if(count<100)throw new Error(`magenta canvas probe missing: ${count} pixels`);
    return {width:right-left+1,height:bottom-top+1,aspect:(right-left+1)/(bottom-top+1),count};
  },screenshot.toString('base64'));
  const backingAspect=(geometry.canvas.width/geometry.canvas.height)/(geometry.css.width/geometry.css.height);
  const result={label,geometry,pixel,backingAspect};
  if(!diagnostic){
    assert.ok(Math.abs(backingAspect-1)<.015,`${label} canvas backing/CSS aspect mismatch ${backingAspect}`);
    assert.ok(Math.abs(pixel.aspect-1)<.08,`${label} actual canvas circle stretched ${pixel.aspect}`);
  }
  return result;
}

for(const engine of ['webkit','chromium']){
  const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'&&process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  for(const dpr of (engine==='webkit'?[2,3]:[3])){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});
    for(const mode of ['title','briefing','flight']){
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base,{waitUntil:'networkidle'});
      if(mode!=='title'){await page.locator('#startButton').tap();if(mode==='flight')await page.locator('#briefingButton').tap();}
      await page.evaluate(()=>{window.__qaResizeEvents=0;window.addEventListener('resize',()=>window.__qaResizeEvents++)});
      const prefix=`aspect-${engine}-dpr${dpr}-${mode}`;
      const initial=await probe(page,`${engine} dpr${dpr} ${mode} initial`,`${prefix}-initial.png`);
      await page.evaluate(()=>{document.querySelector('#game').style.height='1080px'});
      const changed=await probe(page,`${engine} dpr${dpr} ${mode} CSS-only height change`,`${prefix}-css-change.png`);
      assert.equal(changed.geometry.resizeEvents,0,`${engine} ${mode} CSS-only change must not dispatch window.resize`);
      if(diagnostic)assert.ok(Math.abs(changed.backingAspect-1)>.1&&Math.abs(changed.pixel.aspect-1)>.1,`${engine} ${mode} old code failed to reproduce CSS-only stretch`);
      await page.evaluate(()=>{document.querySelector('#game').style.removeProperty('height')});
      const restored=await probe(page,`${engine} dpr${dpr} ${mode} CSS restored`,`${prefix}-restored.png`);
      if(mode==='flight'){
        await page.setViewportSize({width:844,height:390});
        const landscape=await probe(page,`${engine} dpr${dpr} rotated landscape`,`${prefix}-landscape.png`);
        await page.setViewportSize({width:390,height:844});
        const portrait=await probe(page,`${engine} dpr${dpr} rotated portrait`,`${prefix}-portrait.png`);
        report.cases.push({engine,dpr,mode,initial,changed,restored,landscape,portrait,errors});
      }else report.cases.push({engine,dpr,mode,initial,changed,restored,errors});
      assert.deepEqual(errors,[],`${engine} dpr${dpr} ${mode} page exceptions`);
      await page.close();
    }
    // A real history navigation can restore from BFCache or reload, depending on the engine.
    const page=await context.newPage();await page.goto(base,{waitUntil:'networkidle'});await page.goto(`${base}/style.css`);await page.goBack({waitUntil:'domcontentloaded'});
    const history=await page.evaluate(()=>{const c=document.querySelector('#gameCanvas'),r=c.getBoundingClientRect();return {url:location.href,width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,visualScale:visualViewport?.scale||1}});
    if(!diagnostic){assert.ok(Math.abs((history.width/history.height)/(history.cssWidth/history.cssHeight)-1)<.015,`${engine} dpr${dpr} history return canvas aspect`);assert.equal(history.visualScale,1,`${engine} dpr${dpr} history return scale`)}
    report.cases.push({engine,dpr,mode:'history-return',history});await page.close();await context.close();
  }
  await browser.close();
}
await fs.writeFile(path.join(root,diagnostic?'aspect-baseline-report.json':'aspect-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({pass:true,diagnostic,cases:report.cases.map(c=>({engine:c.engine,dpr:c.dpr,mode:c.mode,initial:c.initial&&{backingAspect:c.initial.backingAspect,pixelAspect:c.initial.pixel.aspect},changed:c.changed&&{backingAspect:c.changed.backingAspect,pixelAspect:c.changed.pixel.aspect,resizeEvents:c.changed.geometry.resizeEvents},restored:c.restored&&{backingAspect:c.restored.backingAspect,pixelAspect:c.restored.pixel.aspect},landscape:c.landscape&&{backingAspect:c.landscape.backingAspect,pixelAspect:c.landscape.pixel.aspect},portrait:c.portrait&&{backingAspect:c.portrait.backingAspect,pixelAspect:c.portrait.pixel.aspect},history:c.history})),limitations:report.limitations},null,2));
