(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id);
  const audio = window.AfterlightAudio || {};
  const M = [
    { name: '01 / FIRST LIGHT', subtitle: 'The lost signal', crew: [540, 1040], turrets: [1330], tint: '#20ffd0', briefing: 'Two survivors are waiting on amber landing pads. Ease down to collect them, then fly back to the blue carrier. A soft landing needs a gentle approach and an upright ship.' },
    { name: '02 / DEEP SIGNAL', subtitle: 'Through the fire', crew: [500, 1120, 1790], turrets: [850, 1510], tint: '#38dfff', briefing: 'Three crew remain beyond active defenses. Shoot the red sentries or fly around their slow, visible fire. Your carrier refills fuel and repairs your hull.' },
    { name: '03 / LAST TRANSMISSION', subtitle: 'Bring them home', crew: [470, 960, 1530, 2060], turrets: [740, 1250, 1830], tint: '#a78cff', briefing: 'Four survivors. One final run. Watch your momentum near the ground; the carrier will accept a close, controlled approach.' },
  ];
  const WORLD_W = 2460, WORLD_H = 1130;
  const CARRIER = { x: 260, y: 425 };
  const keys = Object.create(null), touches = Object.create(null);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rand = (n) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  const TAU = Math.PI * 2;
  const starfield = Array.from({length: 180}, (_, i) => ({ x: rand(i + 2) * WORLD_W, y: rand(i + 638) * 850, r: .35 + rand(i + 1183) * 1.45, p: rand(i + 2222) * TAU }));
  const mountain = Array.from({length: 43}, (_,i) => ({x:i*61, y:655 + rand(i+111)*160}));
  const text = (id, value) => { const e=$(id); if(e) e.textContent=value; };
  const show = (id, yes) => { const e=$(id); if(e) e.classList.toggle('is-hidden', !yes); };
  const sound = (name,...args) => { if (typeof audio[name] === 'function') { try { audio[name](...args); } catch {} } };
  let scale=1, dpr=1, cw=0, ch=0, vw=0, vh=0, cam={x:0,y:0};
  let mode='title', levelIndex=0, game=null, clock=0, accumulator=0, last=performance.now(), renderClock=0;
  let best=0;
  try { best = Number(localStorage.getItem('afterlight-best') || 0) || 0; } catch {}

  function makeLevel(index) {
    const spec=M[index];
    const pads=spec.crew.map((x,i)=>({x, width: i===0&&index===0?154:132, occupied:true, blink:rand(i*16+index)}));
    const turrets=spec.turrets.map((x,i)=>({x, hp:index===0?2:3, cooldown:2.2 + i*.6, flash:0}));
    const s={
      level:index, pads, turrets, bullets:[], enemyBullets:[], particles:[], decals:[],
      ship:{x:index===0?540:390, y:index===0?690:480, vx:0, vy:0, a:0, fuel:100, hull:100, cargo:0, invuln:1.5, shotTime:0, shield:0},
      delivered:0, score:0, time:0, deaths:0, status:'', statusUntil:0, landingHint:'', objectiveX:pads[0].x,
      camera:{x:index===0?435:390,y:530}, ended:false, shake:0, pulse:0,
    };
    return s;
  }
  function ground(x, g=game) {
    let y=871 + 37*Math.sin(x*.0059 + .7) + 27*Math.sin(x*.0141 + 2.1) + 10*Math.sin(x*.041);
    if (!g) return y;
    for (const pad of g.pads) {
      const d=Math.abs(x-pad.x), half=pad.width*.5;
      if (d<half) return 854 + 15*Math.sin(pad.x*.0031);
      if (d<half+56) {
        const flat=854 + 15*Math.sin(pad.x*.0031);
        const t=(d-half)/56; const smooth=t*t*(3-2*t);
        y=mix(flat,y,smooth);
      }
    }
    return y;
  }
  function resize() {
    const r=canvas.getBoundingClientRect();
    cw=Math.max(1,r.width||innerWidth); ch=Math.max(1,r.height||innerHeight);
    dpr=Math.min(devicePixelRatio||1, innerWidth<700?1.65:2);
    canvas.width=Math.round(cw*dpr); canvas.height=Math.round(ch*dpr);
    const shortLandscape=cw>ch*1.7&&ch<600;
    vh=shortLandscape ? 560 : innerWidth<650 ? 840 : 930;
    scale=ch/vh; vw=cw/scale;
  }
  function toast(message, seconds=3) { if (!game) return; game.status=message; game.statusUntil=game.time+seconds; }
  function burst(x,y,color,count=20,power=95) {
    if(!game) return;
    for(let i=0;i<count;i++) {
      const a=rand(game.time*987+i*21)*TAU, v=power*(.25+rand(i*17+game.time*321)*.9);
      game.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.4+rand(i+game.time*11)*.7,max:1,color,size:1+rand(i+42)*2});
    }
    if(game.particles.length>350) game.particles.splice(0,game.particles.length-350);
  }
  function startLevel(index, showBrief=true) {
    levelIndex=index; game=makeLevel(index); cam={...game.camera};
    if(showBrief) {
      mode='briefing'; text('briefingTitle',M[index].name); text('briefingBody',M[index].briefing);
      show('titleScreen',false); show('pauseScreen',false); show('resultScreen',false); show('briefingScreen',true);
      sound('pause',true);
    } else enterPlay();
    updateHud();
  }
  function enterPlay() {
    if (!game) game=makeLevel(0);
    mode='playing'; ['titleScreen','briefingScreen','pauseScreen','resultScreen'].forEach(id=>show(id,false));
    cam.x=game.ship.x; cam.y=game.ship.y+(cw>ch*1.7&&ch<600?80:0);
    sound('start'); sound('pause',false);
    toast(levelIndex===0?'LAND ON THE AMBER PAD • COLLECT CREW':`RESCUE ${M[levelIndex].crew.length} CREW`,4.5);
    updateHud();
  }
  function setPause(yes) {
    if (yes && mode==='playing') { mode='paused'; Object.keys(keys).forEach(k=>keys[k]=false);Object.keys(touches).forEach(k=>touches[k]=false);show('pauseScreen',true); sound('engine',0);sound('pause',true); }
    else if (!yes && mode==='paused') { mode='playing'; show('pauseScreen',false); sound('pause',false); last=performance.now(); }
  }
  function retry() { startLevel(levelIndex,false); }
  function end(win, all=false) {
    mode='result'; game.ended=true; sound('pause',true);
    show('resultScreen',true);
    text('resultTitle', win ? (all?'ALL SIGNALS FOUND':'SECTOR CLEAR') : 'SIGNAL LOST');
    text('resultBody', win ? (all?`You brought everyone home. Final score ${totalScore().toLocaleString()}. The stars remember.`:`${game.delivered} crew safe. ${game.score.toLocaleString()} points earned in this sector.`) : `Your ship was lost. ${game.delivered} of ${game.pads.length} crew made it home. The signal is still out there.`);
    text('resultButton', win ? (all?'PLAY AGAIN':'NEXT SECTOR') : 'TRY AGAIN');
    const button=$('resultButton'); if(button) button.dataset.action=win?(all?'again':'next'):'retry';
    if(win) { const score=totalScore(); if(score>best){best=score;try{localStorage.setItem('afterlight-best',String(best));}catch{}} text('bestScore',String(best).padStart(6,'0')); }
  }
  let campaignScore=0;
  function totalScore() { return campaignScore+(game?.score||0); }
  function crash() {
    const s=game.ship;
    burst(s.x,s.y,'#ff795b',46,180); sound('explosion'); game.shake=13;
    game.deaths++; s.hull-=31;
    if(s.hull<=0 || game.deaths>=4) { end(false); return; }
    s.x=levelIndex===0?540:360; s.y=levelIndex===0?660:470;
    s.vx=s.vy=0; s.a=0; s.fuel=Math.max(55,s.fuel); s.invuln=2.8;
    toast('SHIP RECOVERED • APPROACH SLOWLY',3.5);
  }
  function pickPad(pad) {
    const s=game.ship;
    pad.occupied=false; s.cargo++;
    s.vx*=.25; s.vy=-38; s.y=ground(pad.x)-29; s.fuel=Math.max(s.fuel,75);
    game.score+=250; burst(pad.x,ground(pad.x)-18,'#ffcc82',30,110); sound('rescue');
    toast(s.cargo===1?'CREW ABOARD • RETURN TO BLUE CARRIER':`${s.cargo} CREW ABOARD • RETURN TO CARRIER`,4);
  }
  function dock() {
    const s=game.ship;
    if(s.cargo>0) {
      const n=s.cargo; s.cargo=0; game.delivered+=n; game.score+=n*500+Math.round(s.fuel*3);
      burst(CARRIER.x,CARRIER.y,'#8ffcff',38,100); sound('dock'); game.pulse=1.2;
      if(game.delivered>=game.pads.length) { end(true,levelIndex===M.length-1); return; }
      toast(`${n} CREW SAFE • ${game.pads.length-game.delivered} TO RESCUE`,4);
    } else toast('CARRIER REFUELED • FOLLOW AMBER BEACONS',2.5);
    s.fuel=100; s.hull=Math.min(100,s.hull+32); s.invuln=.8;
    s.vx*=.48; s.vy*=.48;
  }
  function input(name) { return !!(keys[name]||touches[name]); }
  function down(k) { return input(k); }
  function update(dt) {
    if(mode!=='playing'||!game) return;
    const g=game,s=g.ship; g.time+=dt; g.pulse=Math.max(0,g.pulse-dt); g.shake=Math.max(0,g.shake-dt*26);
    const left=down('left'),right=down('right'),thrust=down('thrust'),fire=down('fire'),shield=down('shield');
    const turn=(right?1:0)-(left?1:0);
    s.a+=turn*3.15*dt;
    if(s.a>Math.PI) s.a-=TAU; if(s.a< -Math.PI) s.a+=TAU;
    s.vy+=31*dt;
    if(thrust&&s.fuel>0) {
      const ax=Math.sin(s.a), ay=-Math.cos(s.a);
      s.vx+=ax*165*dt; s.vy+=ay*165*dt; s.fuel=Math.max(0,s.fuel-3.8*dt);
      if(rand(g.time*4321)>.28) g.particles.push({x:s.x-ax*15,y:s.y-ay*15,vx:s.vx-ax*(75+rand(g.time*600)*95),vy:s.vy-ay*(75+rand(g.time*500)*95),life:.3+rand(g.time*400)*.3,max:.6,color:rand(g.time*54)>.5?'#ffb36b':'#88f8eb',size:1.4+rand(g.time*63)*2.8});
    }
    sound('engine',thrust&&s.fuel>0?1:0);
    s.shield=Math.max(0,s.shield-dt*2);
    if(shield&&s.fuel>0) { s.shield=.18; s.fuel=Math.max(0,s.fuel-5*dt); }
    if(fire&&s.shotTime<=0) {
      const ax=Math.sin(s.a), ay=-Math.cos(s.a);
      g.bullets.push({x:s.x+ax*18,y:s.y+ay*18,vx:s.vx+ax*450,vy:s.vy+ay*450,life:1.35});
      s.shotTime=.19; sound('shot');
      burst(s.x+ax*17,s.y+ay*17,'#f8f5d6',3,32);
    }
    s.shotTime-=dt; s.invuln=Math.max(0,s.invuln-dt);
    const drag=Math.pow(.996,dt*60); s.vx*=drag; s.vy*=drag;
    const speed=Math.hypot(s.vx,s.vy); if(speed>310) {s.vx*=310/speed;s.vy*=310/speed;}
    s.x+=s.vx*dt; s.y+=s.vy*dt;
    if(s.x<25){s.x=25;s.vx=Math.abs(s.vx)*.3;} if(s.x>WORLD_W-25){s.x=WORLD_W-25;s.vx=-Math.abs(s.vx)*.3;}
    if(s.y<35){s.y=35;s.vy=Math.abs(s.vy)*.25;}
    const below=ground(s.x), bottom=s.y+14;
    if(bottom>=below) {
      const pad=g.pads.find(p=>Math.abs(s.x-p.x)<p.width*.5-8);
      const safe=Math.abs(s.vx)<115&&s.vy<132&&Math.abs(s.a)<.9;
      if(pad&&safe) {
        s.y=below-16; s.vy=Math.min(-13,-Math.abs(s.vy)*.22); s.vx*=.63;
        if(pad.occupied) pickPad(pad);
        else {s.fuel=Math.max(s.fuel,35);if(g.time>2 && g.statusUntil<g.time) toast('PAD STABLE • FUEL TOPPED UP',1.2);}
      } else if(s.invuln>0) { s.y=below-17; s.vy=-Math.abs(s.vy)*.58; s.vx*=.78; }
      else crash();
    }
    if(mode!=='playing') return;
    if(dist(s,CARRIER)<80&&Math.hypot(s.vx,s.vy)<190&&g.time>1) {
      if(!g.dockLatch) {g.dockLatch=true;dock();}
    } else g.dockLatch=false;
    updateBullets(dt);
    updateTurrets(dt);
    g.particles=g.particles.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.985;p.vy*=.985;p.life-=dt;return p.life>0;});
    if(g.particles.length>360)g.particles.splice(0,g.particles.length-360);
    const targetX=clamp(s.x, vw*.38, WORLD_W-vw*.38), targetY=clamp(s.y+(cw>ch*1.7&&ch<600?80:0), 370, 850);
    cam.x=mix(cam.x,targetX,1-Math.pow(.04,dt)); cam.y=mix(cam.y,targetY,1-Math.pow(.04,dt));
    if(Math.floor(g.time*10)!==Math.floor((g.time-dt)*10)) updateHud();
  }
  function updateBullets(dt) {
    const g=game,s=g.ship;
    g.bullets=g.bullets.filter(b=>{
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      if(b.life<=0||b.x<0||b.x>WORLD_W||b.y>ground(b.x))return false;
      for(const t of g.turrets) if(t.hp>0&&Math.hypot(b.x-t.x,b.y-(ground(t.x)-30))<31) {
        t.hp--;t.flash=.15;burst(b.x,b.y,t.hp?'#ff8d69':'#ff6a58',t.hp?8:35,t.hp?75:160);
        if(t.hp===0){g.score+=150;sound('explosion');toast('SENTRY DISABLED +150',2.1);}
        return false;
      }
      return true;
    });
    g.enemyBullets=g.enemyBullets.filter(b=>{
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      if(b.life<=0||b.y>ground(b.x)||b.x<0||b.x>WORLD_W)return false;
      if(dist(b,s)<20&&s.invuln<=0) {
        burst(b.x,b.y,s.shield>0?'#81f8e6':'#ff7770',12,80);
        if(s.shield<=0){s.hull-=12;s.invuln=.65;game.shake=4;if(s.hull<=0)crash();} else sound('shot');
        return false;
      }
      return true;
    });
  }
  function updateTurrets(dt) {
    const g=game,s=g.ship;
    for(const t of g.turrets) {
      if(t.hp<=0)continue;
      t.flash=Math.max(0,t.flash-dt);
      const d=Math.hypot(s.x-t.x,s.y-(ground(t.x)-32));
      if(d<520&&d>95) {
        t.cooldown-=dt;
        if(t.cooldown<=0) {
          const a=Math.atan2(s.y-(ground(t.x)-32),s.x-t.x);
          const vx=Math.cos(a)*126,vy=Math.sin(a)*126;
          g.enemyBullets.push({x:t.x+Math.cos(a)*22,y:ground(t.x)-32+Math.sin(a)*22,vx,vy,life:4});
          t.cooldown=2.6+rand(g.time+t.x)*.55;t.flash=.27;
        }
      } else t.cooldown=Math.min(t.cooldown,1.7);
    }
  }
  function nextObjective() {
    if(!game) return {x:540,y:ground(540)-15,label:'RESCUE'};
    if(game.ship.cargo>0) return {x:CARRIER.x,y:CARRIER.y,label:'CARRIER'};
    const s=game.ship;
    const pads=game.pads.filter(p=>p.occupied);
    if(!pads.length)return {x:CARRIER.x,y:CARRIER.y,label:'CARRIER'};
    const p=pads.sort((a,b)=>Math.abs(a.x-s.x)-Math.abs(b.x-s.x))[0];
    return {x:p.x,y:ground(p.x)-28,label:'CREW'};
  }
  function updateHud() {
    if(!game)return;
    const s=game.ship,o=nextObjective();
    text('hudMission',M[game.level].name);
    text('hudScore',String(totalScore()).padStart(6,'0'));
    text('bestScore',String(best).padStart(6,'0'));
    text('hudFuel',Math.round(s.fuel)+'%');
    text('hudHull',Math.max(0,Math.round(s.hull))+'%');
    text('hudCrew',`${game.delivered}/${game.pads.length}`);
    const range=Math.round(Math.hypot(o.x-s.x,o.y-s.y)/10)*10;
    let objective='';
    if(s.cargo) objective=`RETURN TO CARRIER  ·  ${range} M`;
    else if(Math.abs(s.x-o.x)<130&&Math.abs(s.y-o.y)<220) {
      if(Math.abs(s.a)>=.9) objective='LANDING · LEVEL SHIP';
      else if(s.vy>115) objective=`LANDING · SLOW DESCENT ${Math.round(s.vy)}`;
      else if(Math.abs(s.vx)>100) objective=`LANDING · BRAKE SIDEWAYS ${Math.round(Math.abs(s.vx))}`;
      else objective=`LANDING · DESCENT ${Math.max(0,Math.round(s.vy))} · READY`;
    }
    else objective=`FIND ${o.label} BEACON  ·  ${range} M`;
    text('hudObjective',objective);
    const t=$('hudFuel');if(t)t.classList.toggle('is-low',s.fuel<24);
    const h=$('hudHull');if(h)h.classList.toggle('is-low',s.hull<34);
  }
  function line(points,color,width=1,glow=0,closed=false) {
    if(points.length<2)return;
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);if(closed)ctx.closePath();
    ctx.strokeStyle=color;ctx.lineWidth=width;
    if(glow){ctx.shadowBlur=glow;ctx.shadowColor=color;}ctx.stroke();ctx.shadowBlur=0;
  }
  function circle(x,y,r,color,width=1,glow=0,fill=false) {
    ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(glow){ctx.shadowBlur=glow;ctx.shadowColor=color;}
    if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}ctx.shadowBlur=0;
  }
  function label(t,x,y,size=11,color='#a2b9ca',align='center') {
    ctx.font=`${size}px "Space Mono", "IBM Plex Mono", monospace`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(t,x,y);
  }
  function drawBackground() {
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const gradient=ctx.createLinearGradient(0,0,0,ch);gradient.addColorStop(0,'#050814');gradient.addColorStop(.62,'#090e1b');gradient.addColorStop(1,'#0b1120');ctx.fillStyle=gradient;ctx.fillRect(0,0,cw,ch);
    ctx.save();ctx.translate(cw*.83-(cam.x-530)*scale*.055,ch*.25-(cam.y-530)*scale*.025);
    const R=Math.max(75,Math.min(cw,ch)*.19), pg=ctx.createRadialGradient(-R*.3,-R*.28,R*.1,0,0,R*1.35);pg.addColorStop(0,'rgba(80,110,158,.30)');pg.addColorStop(.55,'rgba(36,56,99,.22)');pg.addColorStop(1,'rgba(24,43,74,0)');ctx.fillStyle=pg;ctx.beginPath();ctx.arc(0,0,R*1.5,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.fillStyle='#0e1a2d';ctx.fill();ctx.strokeStyle='rgba(95,220,227,.45)';ctx.lineWidth=1;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.clip();
    for(let i=0;i<6;i++){const yy=(-.72+i*.29)*R,span=Math.sqrt(Math.max(.02,1-(yy/R)**2))*R;ctx.beginPath();ctx.ellipse(0,yy,span,12+i*1.5,-.11,0,Math.PI);ctx.strokeStyle=`rgba(91,192,207,${.10+i*.012})`;ctx.lineWidth=1;ctx.stroke();}
    for(let i=0;i<12;i++){const yy=-R+i*R*.18,xx=Math.sin(i*1.4)*R*.4;line([[xx-R,yy],[xx+R,yy+R*.08]],`rgba(103,142,188,${.022+i*.004})`,1);}ctx.restore();
    ctx.save();ctx.rotate(-.29);ctx.scale(1,.28);circle(0,0,R*1.62,'rgba(108,169,197,.42)',2,15);circle(0,0,R*1.45,'rgba(118,181,213,.22)',1);ctx.restore();ctx.restore();
    for(const st of starfield){const x=(st.x-cam.x*.16)*scale+cw*.5,y=(st.y-cam.y*.14)*scale+ch*.5;if(x<0||x>cw||y<0||y>ch)continue;const alpha=.24+.35*(.5+.5*Math.sin(renderClock*1.7+st.p));ctx.fillStyle=`rgba(160,211,235,${alpha})`;ctx.fillRect(x,y,st.r,st.r);}
    ctx.strokeStyle='rgba(110,155,175,.025)';ctx.lineWidth=1;for(let y=(renderClock*4)%6;y<ch;y+=6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}
  }
  function worldTransform() {
    const shake=game?.shake||0;
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*(cw*.5-cam.x*scale+(rand(renderClock*40)-.5)*shake),dpr*(ch*.5-cam.y*scale+(rand(renderClock*50)-.5)*shake));
  }
  function drawRidge() {
    const g=game;
    ctx.beginPath();ctx.moveTo(-100,WORLD_H+300);for(const v of mountain)ctx.lineTo(v.x,v.y+130);ctx.lineTo(WORLD_W+100,WORLD_H+300);ctx.closePath();ctx.fillStyle='#0c1727';ctx.fill();
    const points=[];for(let x=0;x<=WORLD_W;x+=24)points.push([x,ground(x,g)]);
    ctx.beginPath();ctx.moveTo(-80,WORLD_H+300);for(const [x,y] of points)ctx.lineTo(x,y);ctx.lineTo(WORLD_W+80,WORLD_H+300);ctx.closePath();ctx.fillStyle='#0c1722';ctx.fill();
    for(let x=0;x<WORLD_W;x+=95) {
      const y=ground(x,g), y2=ground(x+95,g), y3=ground(x+47,g)+95+rand(x)*65;
      line([[x,y],[x+47,y3],[x+95,y2]],'rgba(76,150,160,.14)',1);
      if(x%190===0)line([[x+47,y3],[x+42,y3+140]],'rgba(76,150,160,.085)',1);
    }
    line(points,M[g.level].tint,2.15,16);
    line(points,'rgba(181,255,240,.25)',.65,0);
    for(let x=0;x<=WORLD_W;x+=42){const y=ground(x,g);circle(x,y,1.1,'rgba(126,255,230,.7)',1,0,true);}
    for(const pad of g.pads) drawPad(pad);
    for(const t of g.turrets) drawTurret(t);
  }
  function drawPad(p) {
    const y=ground(p.x),w=p.width*.5,live=p.occupied;
    ctx.fillStyle='rgba(232,153,69,.065)';ctx.fillRect(p.x-w,y-32,p.width,32);
    line([[p.x-w,y],[p.x+w,y]],live?'#ffbc60':'#778f9c',3.3,live?21:5);
    line([[p.x-w,y-10],[p.x-w,y+8],[p.x-w+16,y+8]],live?'#eeb97a':'#7c9ba2',1.7,live?8:0);
    line([[p.x+w,y-10],[p.x+w,y+8],[p.x+w-16,y+8]],live?'#eeb97a':'#7c9ba2',1.7,live?8:0);
    for(const dx of [-w+8,w-8]){circle(p.x+dx,y-10,2.4,live?'#ffd393':'#749cb1',1,live?9:0,true);}
    line([[p.x-w+19,y-5],[p.x+w-19,y-5]],'rgba(255,217,159,.3)',1);
    if(live) {
      const pulse=.5+.5*Math.sin(renderClock*3+p.blink*TAU);
      circle(p.x,y-40,8+pulse*8,`rgba(255,200,112,${.27+pulse*.23})`,1,8);
      line([[p.x,y-54-pulse*9],[p.x,y-72-pulse*9]],'rgba(255,208,142,.65)',1,6);
      label('SURVIVOR',p.x,y-82-pulse*9,10,'#e6b87e');
      const x=p.x,head=y-22;circle(x,head,3.3,'#ffd498',1.4,6);line([[x,head+4],[x,head+14],[x-4,head+21]],'#ffd498',1.2,5);line([[x,head+14],[x+4,head+21]],'#ffd498',1.2,5);line([[x-5,head+9],[x+5,head+9]],'#ffd498',1.1,4);
    }
  }
  function drawCarrier() {
    const {x,y}=CARRIER, pulse=game?.pulse||0;
    ctx.save();ctx.translate(x,y);const a=renderClock;
    circle(0,0,62+pulse*16,`rgba(36,223,247,${.35+pulse*.4})`,1.5,19);
    circle(0,0,79+Math.sin(a*2)*3,'rgba(116,215,236,.16)',1,8);
    line([[-98,0],[-63,0]],'#81e8ed',1,6);line([[63,0],[98,0]],'#81e8ed',1,6);
    line([[-68,-18],[-43,-28],[-19,-24],[-10,-36],[10,-36],[19,-24],[43,-28],[68,-18],[76,0],[68,18],[43,28],[19,24],[10,36],[-10,36],[-19,24],[-43,28],[-68,18],[-76,0]],'#20ccff',2.2,18,true);
    line([[-69,-17],[-32,-12],[-19,0],[-32,12],[-69,17]],'rgba(118,219,238,.75)',1.4,7);
    line([[69,-17],[32,-12],[19,0],[32,12],[69,17]],'rgba(118,219,238,.75)',1.4,7);
    line([[-27,-11],[-9,-19],[9,-19],[27,-11],[27,11],[9,19],[-9,19],[-27,11]],'#d9ffff',1.3,9,true);
    circle(0,0,8,'#a8f8ff',1.4,11);circle(0,0,3,'#d8ffff',1,9,true);
    for(const sign of [-1,1]){line([[sign*44,-25],[sign*47,-39],[sign*55,-39]],'#78b8c7',1.2,3);line([[sign*44,25],[sign*47,39],[sign*55,39]],'#78b8c7',1.2,3);}
    ctx.restore();label('CARRIER / EXTRACTION',x,y-106,10,'#9fe9ee');
  }
  function drawTurret(t) {
    const y=ground(t.x)-25;
    if(t.hp<=0){line([[t.x-19,y+25],[t.x-8,y+11],[t.x+9,y+17],[t.x+22,y+25]],'#a05d59',1.5,3);return;}
    const flash=t.flash>0;
    ctx.save();ctx.translate(t.x,y);
    line([[-21,25],[-15,4],[-7,-5],[7,-5],[15,4],[21,25]],flash?'#ffd2a7':'#ff826c',1.7,flash?17:9);
    line([[-15,7],[15,7]],'#ff8b75',1.2,8);line([[-8,-5],[-5,-18],[5,-18],[8,-5]],'#ff9277',1.4,8);
    circle(0,-2,5,flash?'#fff1d3':'#ff715f',1.3,12,true);
    for(const sx of [-1,1])line([[sx*18,14],[sx*28,21],[sx*28,25]],'#924e53',1);
    ctx.restore();
    if(dist(game.ship,{x:t.x,y})<500&&mode==='playing')label('SENTRY',t.x,y-45,9,'#bc7270');
  }
  function drawShip(s) {
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);
    if(s.invuln>0&&mode==='playing')ctx.globalAlpha=.72+.28*(.5+.5*Math.sin(renderClock*18));
    if(s.shield>0){circle(0,0,24,'rgba(137,248,255,.7)',1.7,12);circle(0,0,27,'rgba(137,248,255,.18)',1,5);}
    line([[0,-20],[14,12],[7,9],[3,15],[-3,15],[-7,9],[-14,12]],'#f0f8f6',2.2,12,true);
    line([[0,-14],[6,3],[0,7],[-6,3]],'#b8fcff',1.2,9,true);
    line([[-11,10],[-19,16],[-9,13]],'#8ad1d6',1.1,4);line([[11,10],[19,16],[9,13]],'#8ad1d6',1.1,4);
    line([[-4,13],[4,13]],'#ffa96d',2,8);
    if((down('thrust')||mode==='title')&&s.fuel>0){const f=10+rand(renderClock*83)*15;line([[-4,16],[0,16+f],[4,16]],'#ffb978',2,13);line([[0,17],[0,17+f*.68]],'#f4f3d5',1.4,6);}
    ctx.restore();
  }
  function drawParticles() {
    const g=game;if(!g)return;
    for(const p of g.particles){ctx.globalAlpha=clamp(p.life/(p.max||.6),0,1);circle(p.x,p.y,p.size,p.color,1,p.size*4,true);}ctx.globalAlpha=1;
    for(const b of g.bullets){line([[b.x-b.vx*.035,b.y-b.vy*.035],[b.x,b.y]],'#f8efc4',2,12);circle(b.x,b.y,2,'#fff8df',1,9,true);}
    for(const b of g.enemyBullets){circle(b.x,b.y,5,'#ff705e',1.5,13);circle(b.x,b.y,2,'#ffd2ae',1,6,true);}
  }
  function drawDirection() {
    if(mode!=='playing'||!game)return;
    const s=game.ship,o=nextObjective();
    const sx=(o.x-cam.x)*scale+cw*.5,sy=(o.y-cam.y)*scale+ch*.5;
    const on=sx>48&&sx<cw-48&&sy>74&&sy<ch-80;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!on) {
      const ox=sx-cw*.5,oy=sy-ch*.5,angle=Math.atan2(oy,ox);
      const radius=Math.min(cw*.38,ch*.39),x=clamp(cw*.5+Math.cos(angle)*radius,36,cw-36),y=clamp(ch*.5+Math.sin(angle)*radius,85,ch-75);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);
      line([[0,-13],[9,9],[0,4],[-9,9]],o.label==='CARRIER'?'#90f7f5':'#ffcc83',1.8,11,true);ctx.restore();
      label(o.label,x,y+31,10,o.label==='CARRIER'?'#9af9f4':'#e8b981');
    } else {
      const pulse=.5+.5*Math.sin(renderClock*2.8);
      circle(sx,sy,25+pulse*7,o.label==='CARRIER'?'rgba(134,242,247,.27)':'rgba(255,201,126,.28)',1,8);
    }
    if(game.statusUntil>game.time&&game.status) {
      ctx.font='11px "Space Mono", monospace';const width=ctx.measureText(game.status).width;
      const x=cw*.5,y=(cw>ch*1.7&&ch<600)?clamp(ch*.23,82,120):Math.min(ch*.77,ch-110);
      ctx.fillStyle='rgba(9,18,30,.80)';ctx.fillRect(x-width*.5-18,y-21,width+36,34);
      line([[x-width*.5-18,y+13],[x+width*.5+18,y+13]],'#90e6df',1,8);
      label(game.status,x,y,11,'#d4eee8');
    }
  }
  function drawTitleScene() {
    const g=game; const original={...g.ship};
    g.ship.x=535;g.ship.y=ground(535)-170+Math.sin(renderClock*1.4)*8;g.ship.a=Math.sin(renderClock*.7)*.14;g.ship.fuel=100;
    drawShip(g.ship);
    Object.assign(g.ship,original);
  }
  function render() {
    drawBackground();worldTransform();
    drawRidge();drawCarrier();drawParticles();
    if(game) { if(mode==='title'||mode==='briefing')drawTitleScene();else drawShip(game.ship); }
    drawDirection();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const vig=ctx.createRadialGradient(cw*.5,ch*.5,Math.min(cw,ch)*.15,cw*.5,ch*.5,Math.max(cw,ch)*.78);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(0,0,0,.36)');ctx.fillStyle=vig;ctx.fillRect(0,0,cw,ch);
  }
  function frame(now) {
    let dt=Math.min(.08,(now-last)/1000);last=now;
    renderClock+=dt;
    if(mode==='playing') {accumulator+=dt;let n=0;while(accumulator>=1/60&&n<5){update(1/60);accumulator-=1/60;n++;}if(n===5)accumulator=0;}
    else if(mode==='title'||mode==='briefing') {cam.x=mix(cam.x,mode==='title'?580:(game?.ship.x||540),.012);cam.y=mix(cam.y,mode==='title'?520:(game?.ship.y||530),.012);}
    render();requestAnimationFrame(frame);
  }
  function bindButton(id,fn){const b=$(id);if(b)b.addEventListener('click',e=>{e.preventDefault();sound('click');fn();});}
  function keyAction(e,pressed) {
    const k=e.code;
    const bind={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'thrust',KeyW:'thrust',Space:'fire',KeyJ:'fire',ShiftLeft:'shield',ShiftRight:'shield',KeyK:'shield'};
    if(bind[k]){if(mode==='playing'||!pressed)keys[bind[k]]=pressed;if(mode==='playing')e.preventDefault();return;}
    if(!pressed)return;
    if(k==='Escape'||k==='KeyP'){if(mode==='playing')setPause(true);else if(mode==='paused')setPause(false);e.preventDefault();}
    if(k==='KeyR'&&(mode==='playing'||mode==='paused'||mode==='result'))retry();
    if(k==='Enter'&&document.activeElement?.tagName!=='BUTTON'){if(mode==='title')startLevel(0,true);else if(mode==='briefing')enterPlay();else if(mode==='result')resultAction();}
  }
  function resultAction(){const action=$('resultButton')?.dataset.action;if(action==='next'){campaignScore+=game.score;startLevel(levelIndex+1,true);}else if(action==='again'){campaignScore=0;startLevel(0,true);}else retry();}
  function bindTouch() {
    document.querySelectorAll('[data-control]').forEach(el=>{
      const control=el.dataset.control;
      const press=e=>{e.preventDefault();touches[control]=true;el.classList.add('is-pressed');try{el.setPointerCapture(e.pointerId);}catch{}};
      const release=e=>{e.preventDefault();touches[control]=false;el.classList.remove('is-pressed');};
      el.addEventListener('pointerdown',press);el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
    });
  }
  bindButton('startButton',()=>startLevel(0,true));bindButton('briefingButton',enterPlay);
  bindButton('resumeButton',()=>setPause(false));bindButton('pauseButton',()=>setPause(mode==='playing'));
  bindButton('retryButton',retry);
  bindButton('resultButton',resultAction);
  bindButton('muteButton',()=>{const value=!(audio.muted??false);sound('setMuted',value);const b=$('muteButton');if(b){b.setAttribute('aria-label',value?'Unmute audio':'Mute audio');b.classList.toggle('is-muted',value);}});
  bindButton('fullscreenButton',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});});
  bindButton('helpButton',()=>{if(mode==='playing')setPause(true);});
  addEventListener('keydown',e=>keyAction(e,true));addEventListener('keyup',e=>keyAction(e,false));
  addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);Object.keys(touches).forEach(k=>touches[k]=false);if(mode==='playing')setPause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')setPause(true);});
  addEventListener('resize',resize);bindTouch();resize();
  game=makeLevel(0);cam={x:580,y:520};show('titleScreen',true);show('briefingScreen',false);show('pauseScreen',false);show('resultScreen',false);updateHud();
  if($('muteButton')){$('muteButton').classList.toggle('is-muted',!!audio.muted);$('muteButton').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');}
  window.__afterlightDebug={snapshot:()=>({mode,level:levelIndex+1,ship:{...game.ship},delivered:game.delivered,pads:game.pads.map(p=>({x:p.x,occupied:p.occupied})),turrets:game.turrets.map(t=>({x:t.x,hp:t.hp})),score:totalScore(),objective:nextObjective(),time:game.time}),start:(level=1)=>{campaignScore=0;startLevel(clamp(level-1,0,2),false);},setShip:(x,y,vx=0,vy=0,a=0)=>{Object.assign(game.ship,{x,y,vx,vy,a});},setMode:(value)=>{if(value==='playing')enterPlay();else if(value==='paused')setPause(true);}};
  requestAnimationFrame(frame);
})();
