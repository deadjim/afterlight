(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id);
  const audio = window.AfterlightAudio || {};
  const M = [
    { name: '01 / FIRST LIGHT', width: 6000, subtitle: 'The lost signal', crew: [540, 1040, 2200, 3650, 5200], turrets: [1700, 3050, 5650], drones:[1400,2800,4700], tint: '#20ffd0', briefing: 'Five survivors circle the moon. Fly left or right; the horizon loops. Land gently on amber pads and return everyone to the blue carrier. Hold thrust to build afterburner; braking burns fuel. Beyond orbit, thrust costs 2× fuel; optional outposts offer salvage and repairs.' },
    { name: '02 / DEEP SIGNAL', width: 7800, subtitle: 'Through the fire', crew: [500, 1430, 2540, 3790, 5180, 7100], turrets: [1020, 2070, 3260, 4640, 6310, 7430], drones:[1230,2320,4110,5680,6990], tint: '#38dfff', briefing: 'Six crew remain across a wider orbital ring. Choose either direction and follow the nearest beacon. Red sentries and flying interceptors patrol the sky. Their aim lines warn before they fire; evade the line or shoot back. Pads and the carrier replenish fuel.' },
    { name: '03 / LAST TRANSMISSION', width: 9600, subtitle: 'Bring them home', crew: [470, 1260, 2410, 3580, 4740, 5900, 7240, 8900], turrets: [900, 1920, 3070, 4220, 5410, 6610, 8130, 9220], drones:[1110,2260,3500,4800,6140,7570,8710], tint: '#a78cff', briefing: 'Eight survivors around one final world. The terrain wraps in both directions; there is no edge. Watch your momentum near each pad and bring everyone to the carrier to complete the campaign.' },
  ];
  const WORLD_H = 1130;
  const CARRIER = { x: 260, y: 425 };
  const BOOST=[1,1.5,1.75,2.05,2.4,2.8,3.25,3.8,4.5,5.3,6.25];
  const ORBIT_ENTER=5500, ORBIT_EXIT=5250;
  const keys = Object.create(null), touches = Object.create(null);
  const joystick={pointerId:null,dx:0,dy:0,turn:0,throttle:0};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const wrap = (x, w) => ((x % w) + w) % w;
  const deltaX = (target, origin, w=game?.width||M[0].width) => wrap(target-origin+w*.5,w)-w*.5;
  const nearX = (x, reference, w=game?.width||M[0].width) => reference+deltaX(x,reference,w);
  const wrappedDistance = (a,b,w=game?.width||M[0].width) => Math.hypot(deltaX(a.x,b.x,w),a.y-b.y);
  const rand = (n) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  const TAU = Math.PI * 2;
  const text = (id, value) => { const e=$(id); if(e) e.textContent=value; };
  const show = (id, yes) => { const e=$(id); if(e) e.classList.toggle('is-hidden', !yes); };
  const sound = (name,...args) => { if (typeof audio[name] === 'function') { try { audio[name](...args); } catch {} } };
  let scale=1, dpr=1, cw=0, ch=0, vw=0, vh=0, cam={x:0,y:0};
  let mode='title', levelIndex=0, game=null, clock=0, accumulator=0, last=performance.now(), renderClock=0;
  let best=0;
  try { best = Number(localStorage.getItem('afterlight-best') || 0) || 0; } catch {}

  function makeLevel(index) {
    const spec=M[index];
    const pads=spec.crew.map((x,i)=>({id:i+1,x, width: i===0&&index===0?154:132, occupied:true, blink:rand(i*16+index)}));
    const turrets=spec.turrets.map((x,i)=>({x, hp:index===0?2:3, cooldown:2.2 + i*.6, flash:0}));
    const drones=spec.drones.map((x,i)=>({id:i+1,home:x,x,y:630,hp:index===0?2:3,cooldown:2.6+i*.43,flash:0,phase:rand(i*13+index)*TAU,shotCount:0,space:false}));
    const spaceBodies=[{id:1,name:'EMBER RELAY',x:980,y:-7000,radius:91,claimed:false,docks:0},{id:2,name:'AZURE VAULT',x:2450,y:-13000,radius:112,claimed:false,docks:0}];
    for(const body of spaceBodies){body.dockX=body.x;body.dockY=body.y+body.radius+52;}
    for(const [i,x,y] of [[0,spaceBodies[0].x-235,spaceBodies[0].y-100],[1,spaceBodies[0].x+305,spaceBodies[0].y+145],[2,spaceBodies[1].x-290,spaceBodies[1].y-120],[3,spaceBodies[1].x+320,spaceBodies[1].y+125]]){
      drones.push({id:100+i,home:x,homeY:y,x,y,hp:4,cooldown:2.4+i*.45,flash:0,phase:rand(i*19+index+90)*TAU,shotCount:0,space:true});
    }
    const s={
      level:index, width:spec.width, pads, turrets, drones, spaceBodies, salvageCount:0, bullets:[], enemyBullets:[], particles:[], decals:[],
      ship:{x:index===0?540:390, y:index===0?690:480, vx:0, vy:0, a:0, fuel:100, hull:100, cargo:0, invuln:1.5, shotTime:0, shield:0,shieldCharge:100,shieldActive:false,shieldArmed:true,shieldDelay:0,thrustHold:0,boostTier:0,boostFlash:0,power:1,speedLimit:400,altitude:0,inSpace:false,preOrbitWarned:false,orbitEntryTime:null,orbitEntryFuel:null,fuelWarned:false},
      delivered:0, score:0, time:0, deaths:0, status:'', statusUntil:0, landingHint:'', objectiveX:pads[0].x,
      camera:{x:index===0?435:390,y:530}, ended:false, shake:0, pulse:0, outpostLatch:null,outpostImpactUntil:0,
    };
    if(index===0)s.ship.y=ground(s.ship.x,s)-65;
    return s;
  }
  function groundBase(x,w) {
    const a=TAU*wrap(x,w)/w;
    return 863+44*Math.sin(a*3+.8)+36*Math.sin(a*8+2.1)+20*Math.sin(a*19-.5)+9*Math.sin(a*41+1.7);
  }
  function ground(x, g=game) {
    const w=g?.width||M[0].width;
    let y=groundBase(x,w);
    if (!g) return y;
    for (const pad of g.pads) {
      const d=Math.abs(deltaX(x,pad.x,w)), half=pad.width*.5;
      const flat=groundBase(pad.x,w);
      if (d<half) return flat;
      if (d<half+56) {
        const t=(d-half)/56; const smooth=t*t*(3-2*t);
        y=mix(flat,y,smooth);
      }
    }
    return y;
  }
  function ridge(x,w) {
    const a=TAU*wrap(x,w)/w;
    return 740+62*Math.sin(a*2+.4)+45*Math.sin(a*9+2.1)+28*Math.sin(a*23-.7);
  }
  function forVisibleCopies(x,margin,draw) {
    const w=game.width,first=Math.floor((cam.x-vw*.5-margin-x)/w),last=Math.ceil((cam.x+vw*.5+margin-x)/w);
    for(let lap=first;lap<=last;lap++) {const image=x+lap*w;if(image>=cam.x-vw*.5-margin&&image<=cam.x+vw*.5+margin)draw(image);}
  }
  function rebase() {
    const w=game.width,s=game.ship;
    let shift=0;
    if(s.x>w*1.5)shift=w; else if(s.x< -w*.5)shift=-w;
    if(!shift)return;
    s.x-=shift;if(Number.isFinite(s.prevX))s.prevX-=shift;cam.x-=shift;
    for(const list of [game.bullets,game.enemyBullets,game.particles])for(const item of list)item.x-=shift;
  }
  function resize() {
    const r=canvas.getBoundingClientRect();
    cw=Math.max(1,r.width||innerWidth); ch=Math.max(1,r.height||innerHeight);
    dpr=Math.min(devicePixelRatio||1, innerWidth<700?1.65:2);
    canvas.width=Math.round(cw*dpr); canvas.height=Math.round(ch*dpr);
    const shortLandscape=cw>ch*1.7&&ch<600;
    vh=shortLandscape ? 560 : innerWidth<650 ? 840 : 930;
    scale=ch/vh; vw=cw/scale;
    clearJoystick();
    Object.keys(touches).forEach(k=>touches[k]=false);clearTouchVisuals();
  }
  function clearJoystick() {
    joystick.pointerId=null;joystick.dx=0;joystick.dy=0;joystick.turn=0;joystick.throttle=0;
    const el=$('flightJoystick');if(el){el.style.setProperty('--stick-x','0px');el.style.setProperty('--stick-y','0px');el.classList.remove('is-active');}
  }
  function clearTouchVisuals(){document.querySelectorAll('[data-control].is-pressed').forEach(el=>el.classList.remove('is-pressed'));}
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
    clearJoystick();Object.keys(touches).forEach(k=>touches[k]=false);clearTouchVisuals();
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
    if (yes && mode==='playing') { mode='paused'; Object.keys(keys).forEach(k=>keys[k]=false);Object.keys(touches).forEach(k=>touches[k]=false);clearJoystick();clearTouchVisuals();show('pauseScreen',true); sound('engine',0);sound('pause',true); }
    else if (!yes && mode==='paused') { mode='playing'; show('pauseScreen',false); sound('pause',false); last=performance.now(); }
  }
  function retry() { startLevel(levelIndex,false); }
  function end(win, all=false) {
    mode='result'; game.ended=true;clearJoystick();Object.keys(touches).forEach(k=>touches[k]=false);clearTouchVisuals();sound('pause',true);
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
    s.vx=s.vy=0; s.a=0; s.speedLimit=400;s.thrustHold=0;s.boostTier=0;s.boostFlash=0;s.power=1;s.fuel=Math.max(55,s.fuel); s.invuln=2.8;
    cam.x=s.x;cam.y=s.y+(cw>ch*1.7&&ch<600?80:0);
    toast('SHIP RECOVERED • APPROACH SLOWLY',3.5);
  }
  function pickPad(pad) {
    const s=game.ship;
    pad.occupied=false; s.cargo++;
    s.vx*=.25; s.vy=-38; s.y=ground(pad.x)-29; s.fuel=Math.max(s.fuel,75);
    game.score+=250; burst(nearX(pad.x,s.x),ground(pad.x)-18,'#ffcc82',30,110); sound('rescue');
    toast(s.cargo===1?'CREW ABOARD • RETURN TO BLUE CARRIER':`${s.cargo} CREW ABOARD • RETURN TO CARRIER`,4);
  }
  function dock() {
    const s=game.ship;
    if(s.cargo>0) {
      const n=s.cargo; s.cargo=0; game.delivered+=n; game.score+=n*500+Math.round(s.fuel*3);
      burst(nearX(CARRIER.x,s.x),CARRIER.y,'#8ffcff',38,100); sound('dock'); game.pulse=1.2;
      if(game.delivered>=game.pads.length) { end(true,levelIndex===M.length-1); return; }
      toast(`${n} CREW SAFE • ${game.pads.length-game.delivered} TO RESCUE`,4);
    } else toast('CARRIER REFUELED • FOLLOW AMBER BEACONS',2.5);
    s.fuel=100; s.hull=Math.min(100,s.hull+32); s.invuln=.8;
    s.speedLimit=400;
    s.vx*=.48; s.vy*=.48;
  }
  function dockOutpost(body) {
    const s=game.ship,first=!body.claimed;
    body.docks++;body.claimed=true;game.outpostLatch=body.id;
    s.fuel=100;s.hull=Math.min(100,s.hull+45);s.invuln=1.1;
    s.vx*=.35;s.vy*=.35;
    if(first){game.salvageCount++;game.score+=body.id===1?750:1200;}
    burst(nearX(body.dockX,s.x),body.dockY,body.id===1?'#ffbc79':'#8ce8ff',36,110);
    sound('dock');game.pulse=1.2;
    toast(first?`${body.name} • SALVAGE SECURED +${body.id===1?750:1200}`:`${body.name} • REFUELED / HULL REPAIRED`,4);
  }
  function input(name) { return !!(keys[name]||touches[name]); }
  function down(k) { return input(k); }
  function updateShield(dt,held) {
    const s=game.ship;
    if(!held) {
      s.shieldActive=false;s.shieldArmed=true;
      s.shieldDelay=Math.max(0,s.shieldDelay-dt);
      if(s.shieldDelay===0)s.shieldCharge=Math.min(100,s.shieldCharge+100*dt/14);
    } else if(s.shieldArmed&&s.shieldCharge>0) {
      s.shieldActive=true;s.shieldDelay=1.25;
      s.shieldCharge=Math.max(0,s.shieldCharge-50*dt);
      if(s.shieldCharge===0){s.shieldActive=false;s.shieldArmed=false;sound('shieldEmpty');toast('SHIELD EMPTY • RELEASE TO REARM',2.4);}
    } else s.shieldActive=false;
    s.shield=s.shieldActive?.18:0;
  }
  function terrainImpact(pad,below) {
    const g=game,s=g.ship;
    const damage=clamp(8+Math.max(0,Math.abs(s.vy)-55)*.17+Math.max(0,Math.abs(s.vx)-40)*.11+Math.max(0,Math.abs(s.a)-.24)*22,8,70);
    s.y=below-17;s.vy=-clamp(Math.abs(s.vy)*.42+28,40,230);s.vx*=.65;
    if(g.time<(s.landingImpactUntil||0))return;
    s.landingImpactUntil=g.time+.48;
    s.hull=Math.max(0,s.hull-damage);g.shake=Math.max(g.shake,clamp(damage*.25,2,12));
    burst(s.x,below-12,pad?'#ffbd78':'#78f9df',Math.round(clamp(damage*.5,8,28)),90+damage*1.4);
    sound('impact',clamp(damage/55,0,1));
    toast(`HARD LANDING • -${Math.round(damage)} HULL`,2.3);
    if(s.hull<=0)crash();
  }
  function update(dt) {
    if(mode!=='playing'||!game) return;
    const g=game,s=g.ship; g.time+=dt; g.pulse=Math.max(0,g.pulse-dt); g.shake=Math.max(0,g.shake-dt*26);s.boostFlash=Math.max(0,s.boostFlash-dt);
    const left=down('left'),right=down('right'),fire=down('fire'),shield=down('shield');
    const thrust=down('thrust')?1:joystick.throttle;
    const turn=clamp((right?1:0)-(left?1:0)+joystick.turn,-1,1);
    s.a+=turn*3.15*dt;
    if(s.a>Math.PI) s.a-=TAU; if(s.a< -Math.PI) s.a+=TAU;
    s.vy+=(31-11*clamp((s.altitude-ORBIT_ENTER)/8500,0,1))*dt;
    if(thrust&&s.fuel>0) {
      s.thrustHold+=dt*thrust;
      const tier=Math.min(10,Math.floor(s.thrustHold));
      if(tier>s.boostTier){sound('boost',tier);s.boostFlash=.22;burst(s.x,s.y,tier>=5?'#72f4e5':'#ffbd84',7,36+tier*4);}
      s.boostTier=tier;s.power=BOOST[tier];
      s.speedLimit=Math.max(s.speedLimit,300+s.power*100);
      const ax=Math.sin(s.a), ay=-Math.cos(s.a);
      s.vx+=ax*165*s.power*thrust*dt; s.vy+=ay*165*s.power*thrust*dt;
      const fuelRate=3.8*(1+.22*(s.power-1))*(s.inSpace?2:1)*thrust;
      s.fuel=Math.max(0,s.fuel-fuelRate*dt);
      if(rand(g.time*4321)>.18)g.particles.push({x:s.x-ax*15,y:s.y-ay*15,vx:s.vx-ax*(80+rand(g.time*600)*100)*Math.sqrt(s.power),vy:s.vy-ay*(80+rand(g.time*500)*100)*Math.sqrt(s.power),life:.28+rand(g.time*400)*.35,max:.63,color:rand(g.time*54)>.5?'#ffb36b':'#88f8eb',size:1.4+rand(g.time*63)*2.8});
    } else {s.thrustHold=0;s.boostTier=0;s.power=1;}
    sound('engine',thrust&&s.fuel>0?thrust:0,s.power,s.inSpace);
    updateShield(dt,shield);
    if(s.fuel<=20&&!s.fuelWarned){s.fuelWarned=true;sound('warning');toast('FUEL CRITICAL • 20%',3);}
    if(s.fuel>25)s.fuelWarned=false;
    if(fire&&s.shotTime<=0) {
      const ax=Math.sin(s.a), ay=-Math.cos(s.a);
      g.bullets.push({x:s.x+ax*18,y:s.y+ay*18,vx:s.vx+ax*450,vy:s.vy+ay*450,life:1.35});
      s.shotTime=.19; sound('shot');
      burst(s.x+ax*17,s.y+ay*17,'#f8f5d6',3,32);
    }
    s.shotTime-=dt; s.invuln=Math.max(0,s.invuln-dt);
    const drag=Math.pow(.999,dt*60); s.vx*=drag; s.vy*=drag;
    const cap=s.speedLimit,speed=Math.hypot(s.vx,s.vy); if(speed>cap){s.vx*=cap/speed;s.vy*=cap/speed;}
    s.prevX=s.x;s.prevY=s.y;
    const steps=Math.min(16,Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy)*dt/9)));
    for(let i=0;i<steps;i++) {
      s.x+=s.vx*dt/steps;s.y+=s.vy*dt/steps;rebase();
      const below=ground(s.x);
      if(s.y+14>=below){
        const pad=g.pads.find(p=>Math.abs(deltaX(s.x,p.x,g.width))<p.width*.5-8);
        const safe=!!pad&&Math.abs(s.vx)<45&&s.vy>=-22&&s.vy<60&&Math.abs(s.a)<.24;
        if(safe){
          s.y=below-16;s.vy=Math.min(-13,-Math.abs(s.vy)*.22);s.vx*=.63;
          if(pad.occupied)pickPad(pad);
          else{s.fuel=Math.max(s.fuel,75);if(g.time>2&&g.statusUntil<g.time)toast('PAD STABLE • FUEL TOPPED UP',1.2);}
        } else terrainImpact(pad,below);
      }
      for(const body of g.spaceBodies){
        const bx=nearX(body.x,s.x,g.width),dx=s.x-bx,dy=s.y-body.y,d=Math.hypot(dx,dy);
        if(d<body.radius+15){
          const nx=d>1?dx/d:0,ny=d>1?dy/d:-1,impact=Math.hypot(s.vx,s.vy);
          s.x=bx+nx*(body.radius+16);s.y=body.y+ny*(body.radius+16);
          if(ny>.65&&impact<150&&Math.abs(s.a)<.24&&g.outpostLatch!==body.id&&g.time>g.outpostImpactUntil){
            s.y=body.dockY;dockOutpost(body);continue;
          }
          const toward=s.vx*nx+s.vy*ny;
          if(toward<0){s.vx-=1.45*toward*nx;s.vy-=1.45*toward*ny;}
          g.outpostImpactUntil=g.time+1;
          if(g.time>=(s.landingImpactUntil||0)){const damage=clamp(8+impact*.065+Math.max(0,Math.abs(s.a)-.24)*14,8,70);s.hull=Math.max(0,s.hull-damage);s.landingImpactUntil=g.time+.48;g.shake=Math.max(g.shake,8);burst(s.x,s.y,'#ffad79',22,110);sound('impact',Math.min(1,damage/55));toast('PLANETOID IMPACT • HULL DAMAGED',2.6);if(s.hull<=0)crash();}
        }
      }
      if(mode!=='playing')return;
      for(const enemy of g.drones)if(enemy.hp>0&&s.invuln<=0&&wrappedDistance(s,enemy,g.width)<23){
        burst(s.x,s.y,'#ff806d',14,90);s.hull=Math.max(0,s.hull-18);s.invuln=.7;g.shake=6;s.vx*= -.35;s.vy*= -.35;
        if(s.hull<=0)crash();break;
      }
      if(mode!=='playing')return;
    }
    s.altitude=Math.max(0,ground(s.x)-s.y);
    if(!s.inSpace&&s.altitude>=4700&&!s.preOrbitWarned){s.preOrbitWarned=true;toast('ORBIT AHEAD • RELEASE THRUST TO COAST',3.2);}
    if(!s.inSpace&&s.altitude<4300)s.preOrbitWarned=false;
    if(!s.inSpace&&s.altitude>=ORBIT_ENTER){s.inSpace=true;s.orbitEntryTime=g.time;s.orbitEntryFuel=s.fuel;sound('orbit');toast('ORBIT REACHED • THRUST USES 2× FUEL',4);}
    else if(s.inSpace&&s.altitude<=ORBIT_EXIT){s.inSpace=false;toast('ATMOSPHERE REENTRY',2.5);}
    if(wrappedDistance(s,CARRIER,g.width)<80&&Math.hypot(s.vx,s.vy)<190&&g.time>1) {
      if(!g.dockLatch) {g.dockLatch=true;dock();}
    } else g.dockLatch=false;
    let dockedOutpost=false;
    for(const body of g.spaceBodies){
      const dist=Math.hypot(deltaX(s.x,body.dockX,g.width),s.y-body.dockY);
      if(dist<108&&s.y>body.y+body.radius-8){
        dockedOutpost=true;
        if(g.outpostLatch!==body.id&&g.time>g.outpostImpactUntil&&Math.hypot(s.vx,s.vy)<330) dockOutpost(body);
        break;
      }
    }
    if(!dockedOutpost)g.outpostLatch=null;
    updateDrones(dt);
    updateBullets(dt);
    updateTurrets(dt);
    g.particles=g.particles.filter(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.985;p.vy*=.985;p.life-=dt;return p.life>0;});
    if(g.particles.length>360)g.particles.splice(0,g.particles.length-360);
    const targetX=s.x, targetY=Math.min(850,s.y+(cw>ch*1.7&&ch<600?80:0));
    cam.x=mix(cam.x,targetX,1-Math.pow(.04,dt)); cam.y=mix(cam.y,targetY,1-Math.pow(.04,dt));
    cam.x=clamp(cam.x,s.x-vw*.27,s.x+vw*.27);cam.y=clamp(cam.y,s.y-vh*.27,s.y+vh*.27);
    if(Math.floor(g.time*10)!==Math.floor((g.time-dt)*10)) updateHud();
  }
  function updateBullets(dt) {
    const g=game,s=g.ship;
    g.bullets=g.bullets.filter(b=>{
      b.life-=dt;if(b.life<=0)return false;
      const steps=Math.min(12,Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*dt/10)));
      for(let i=0;i<steps;i++){
        b.x+=b.vx*dt/steps;b.y+=b.vy*dt/steps;
        if(b.y>ground(b.x))return false;
        for(const t of g.turrets)if(t.hp>0&&Math.hypot(deltaX(b.x,t.x,g.width),b.y-(ground(t.x)-30))<31){
          t.hp--;t.flash=.15;burst(b.x,b.y,t.hp?'#ff8d69':'#ff6a58',t.hp?8:35,t.hp?75:160);
          if(t.hp===0){g.score+=150;sound('explosion');toast('SENTRY DISABLED +150',2.1);}return false;
        }
        for(const e of g.drones)if(e.hp>0&&Math.hypot(deltaX(b.x,e.x,g.width),b.y-e.y)<24){
          e.hp--;e.flash=.2;burst(b.x,b.y,e.hp?'#ff9c79':'#ff6b6b',e.hp?9:30,e.hp?65:140);
          if(e.hp===0){g.score+=e.space?350:200;sound('explosion');toast(e.space?'ORBITAL GUARDIAN DOWN +350':'INTERCEPTOR DOWN +200',2.1);}return false;
        }
      }
      return true;
    });
    g.enemyBullets=g.enemyBullets.filter(b=>{
      b.life-=dt;if(b.life<=0)return false;
      const startX=b.x,startY=b.y,steps=Math.min(8,Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*dt/10)));
      for(let i=0;i<steps;i++){
        b.x+=b.vx*dt/steps;b.y+=b.vy*dt/steps;
        if(b.y>ground(b.x))return false;
        const t=(i+1)/steps,shipX=mix(s.prevX??s.x,s.x,t),shipY=mix(s.prevY??s.y,s.y,t);
        if(Math.hypot(deltaX(b.x,shipX,g.width),b.y-shipY)<20&&s.invuln<=0){
          burst(b.x,b.y,s.shieldActive?'#81f8e6':'#ff7770',12,80);
          if(!s.shieldActive){s.hull=Math.max(0,s.hull-12);s.invuln=.65;g.shake=4;if(s.hull<=0)crash();}else sound('shot');
          return false;
        }
      }
      return true;
    });
  }
  function updateDrones(dt) {
    const g=game,s=g.ship;
    for(const e of g.drones){
      if(e.hp<=0)continue;
      e.x=wrap(e.home+Math.sin(g.time*(e.space?.39:.67)+e.phase)*(e.space?72:165),g.width);
      e.y=e.space?e.homeY+Math.sin(g.time*.83+e.phase)*68:ground(e.home)-250+Math.sin(g.time*1.3+e.phase)*48;
      e.flash=Math.max(0,e.flash-dt);
      const dx=deltaX(s.x,e.x,g.width),dy=s.y-e.y,d=Math.hypot(dx,dy);
      if(d<(e.space?690:550)&&d>85){
        e.cooldown-=dt;
        if(e.cooldown<=0){
          const a=Math.atan2(dy,dx),origin=nearX(e.x,s.x,g.width);
          const angles=e.space?[a-.105,a,a+.105]:[a];
          for(const aim of angles)g.enemyBullets.push({x:origin+Math.cos(aim)*21,y:e.y+Math.sin(aim)*21,vx:Math.cos(aim)*(e.space?215:185),vy:Math.sin(aim)*(e.space?215:185),life:e.space?4.2:3.7});
          e.shotCount++;e.cooldown=(e.space?3.55:3.15)+rand(g.time+e.home)*.65;e.flash=.26;
        }
      }else e.cooldown=Math.min(e.cooldown,e.space?2.5:2.1);
    }
  }
  function updateTurrets(dt) {
    const g=game,s=g.ship;
    for(const t of g.turrets) {
      if(t.hp<=0)continue;
      t.flash=Math.max(0,t.flash-dt);
      const dx=deltaX(s.x,t.x,g.width),d=Math.hypot(dx,s.y-(ground(t.x)-32));
      if(d<520&&d>95) {
        t.cooldown-=dt;
        if(t.cooldown<=0) {
          const a=Math.atan2(s.y-(ground(t.x)-32),dx);
          const vx=Math.cos(a)*126,vy=Math.sin(a)*126;
          g.enemyBullets.push({x:nearX(t.x,s.x,g.width)+Math.cos(a)*22,y:ground(t.x)-32+Math.sin(a)*22,vx,vy,life:4});
          t.cooldown=2.6+rand(g.time+t.x)*.55;t.flash=.27;
        }
      } else t.cooldown=Math.min(t.cooldown,1.7);
    }
  }
  function nextObjective() {
    if(!game) return {x:540,y:ground(540)-15,label:'RESCUE'};
    if(game.ship.cargo>0) return {x:nearX(CARRIER.x,game.ship.x),y:CARRIER.y,label:'CARRIER'};
    const s=game.ship;
    if(s.inSpace){
      const open=game.spaceBodies.filter(b=>!b.claimed).sort((a,b)=>wrappedDistance(s,{x:a.dockX,y:a.dockY},game.width)-wrappedDistance(s,{x:b.dockX,y:b.dockY},game.width));
      if(open.length){const b=open[0];return {x:nearX(b.dockX,s.x),y:b.dockY,label:'OUTPOST',kind:'outpost',bodyId:b.id};}
    }
    const pads=game.pads.filter(p=>p.occupied);
    if(!pads.length)return {x:nearX(CARRIER.x,s.x),y:CARRIER.y,label:'CARRIER'};
    const p=pads.sort((a,b)=>Math.abs(deltaX(a.x,s.x,game.width))-Math.abs(deltaX(b.x,s.x,game.width)))[0];
    return {x:nearX(p.x,s.x),y:ground(p.x)-28,label:'CREW',padId:p.id};
  }
  function updateHud() {
    if(!game)return;
    const s=game.ship,o=nextObjective();
    text('hudMission',M[game.level].name);
    text('hudScore',String(totalScore()).padStart(6,'0'));
    text('bestScore',String(best).padStart(6,'0'));
    text('hudFuel',Math.round(s.fuel)+'%');
    text('hudHull',Math.max(0,Math.round(s.hull))+'%');
    text('hudShield',Math.round(s.shieldCharge)+'%');
    text('hudBoost',`${s.power}×`);
    text('hudAltitude',s.inSpace?'ORBIT':`${(s.altitude/1000).toFixed(1)} KM`);
    text('hudCrew',`${game.delivered}/${game.pads.length}`);
    const range=Math.round(Math.hypot(o.x-s.x,o.y-s.y)/10)*10;
    let objective='';
    if(s.inSpace&&o.kind==='outpost') {
      const name=game.spaceBodies.find(b=>b.id===o.bodyId).name;
      objective=range<600?(Math.hypot(s.vx,s.vy)>=330?`${name} · BRAKE TO DOCK`:`${name} · ENTER DOCKING RING`):`${name} · ${range} M`;
    }
    else if(s.inSpace) objective=`ORBIT · ${s.cargo?'CARRIER':'CREW'} BELOW · ${range} M`;
    else if(s.cargo) objective=`RETURN TO CARRIER  ·  ${range} M`;
    else if(Math.abs(s.x-o.x)<130&&Math.abs(s.y-o.y)<220) {
      if(Math.abs(s.a)>=.24) objective='LANDING · LEVEL SHIP';
      else if(s.vy>=60) objective=`LANDING · SLOW DESCENT ${Math.round(s.vy)}`;
      else if(Math.abs(s.vx)>=45) objective=`LANDING · BRAKE SIDEWAYS ${Math.round(Math.abs(s.vx))}`;
      else objective=`LANDING · DESCENT ${Math.max(0,Math.round(s.vy))} · READY`;
    }
    else objective=`FIND ${o.label} BEACON  ·  ${range} M`;
    text('hudObjective',objective);
    const t=$('hudFuel');if(t)t.classList.toggle('is-low',s.fuel<=20);
    const h=$('hudHull');if(h)h.classList.toggle('is-low',s.hull<34);
    const shieldReadout=$('hudShield');if(shieldReadout)shieldReadout.classList.toggle('is-low',s.shieldCharge<=20);
    const a=$('hudAltitude');if(a)a.classList.toggle('is-space',s.inSpace);
    const b=$('hudBoost');if(b)b.dataset.tier=String(s.boostTier);
    const shieldButton=document.querySelector('[data-control="shield"]');
    if(shieldButton){shieldButton.style.setProperty('--shield-charge',`${s.shieldCharge}%`);shieldButton.classList.toggle('is-active',s.shieldActive);shieldButton.classList.toggle('is-depleted',s.shieldCharge<=0);shieldButton.setAttribute('aria-pressed',s.shieldActive?'true':'false');shieldButton.setAttribute('aria-label',s.shieldCharge<=0?(down('shield')?'Shield depleted; release to recharge':'Shield recharging'):s.shieldActive?'Shield active':'Activate shield');}
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
  function homePlanetVisual(altitude) {
    const reveal=clamp((altitude-1700)/3800,0,1),departure=Math.max(0,altitude-4000);
    const distance=clamp(departure/8000,0,1),far=clamp((altitude-20000)/20000,0,1);
    const orbitCenter=ch<600&&cw>ch ? .58 : .82;
    // Perspective recession starts before orbit; the center stops moving at entry.
    // The full disk clears the bottom edge by 7.5 km instead of retaining a horizon.
    return {radiusPx:ch*.68/Math.pow(1+departure/1600,1.25),centerYPx:ch*(1.64-reveal*(1.64-orbitCenter)),opacity:reveal*(1-far),distance,far};
  }
  function drawBackground() {
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const gradient=ctx.createLinearGradient(0,0,0,ch);gradient.addColorStop(0,'#050814');gradient.addColorStop(.62,'#090e1b');gradient.addColorStop(1,'#0b1120');ctx.fillStyle=gradient;ctx.fillRect(0,0,cw,ch);
    const altitude=game?.ship.altitude||0,reveal=clamp((altitude-1700)/3800,0,1);
    const planetPhase=TAU*wrap(cam.x,game?.width||M[0].width)/(game?.width||M[0].width);
    if(reveal<1){ctx.save();ctx.globalAlpha=1-reveal;ctx.translate(cw*.79+Math.sin(planetPhase+.35)*Math.min(cw*.11,125),ch*.25-(cam.y-530)*scale*.025);
    const R=Math.max(75,Math.min(cw,ch)*.19), pg=ctx.createRadialGradient(-R*.3,-R*.28,R*.1,0,0,R*1.35);pg.addColorStop(0,'rgba(80,110,158,.30)');pg.addColorStop(.55,'rgba(36,56,99,.22)');pg.addColorStop(1,'rgba(24,43,74,0)');ctx.fillStyle=pg;ctx.beginPath();ctx.arc(0,0,R*1.5,0,TAU);ctx.fill();
    ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.fillStyle='#0e1a2d';ctx.fill();ctx.strokeStyle='rgba(95,220,227,.45)';ctx.lineWidth=1;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(0,0,R,0,TAU);ctx.clip();
    for(let i=0;i<6;i++){const yy=(-.72+i*.29)*R,span=Math.sqrt(Math.max(.02,1-(yy/R)**2))*R;ctx.beginPath();ctx.ellipse(0,yy,span,12+i*1.5,-.11,0,Math.PI);ctx.strokeStyle=`rgba(91,192,207,${.10+i*.012})`;ctx.lineWidth=1;ctx.stroke();}
    for(let i=0;i<12;i++){const yy=-R+i*R*.18,xx=Math.sin(i*1.4)*R*.4;line([[xx-R,yy],[xx+R,yy+R*.08]],`rgba(103,142,188,${.022+i*.004})`,1);}ctx.restore();
    ctx.save();ctx.rotate(-.29);ctx.scale(1,.28);circle(0,0,R*1.62,'rgba(108,169,197,.42)',2,15);circle(0,0,R*1.45,'rgba(118,181,213,.22)',1);ctx.restore();ctx.restore();}
    if(reveal>0&&altitude<40000){
      const {distance,radiusPx:pr,centerYPx:py,opacity:planetOpacity}=homePlanetVisual(altitude);
      const px=cw*.48-Math.sin(planetPhase)*Math.min(cw*.055,65);
      ctx.save();ctx.globalAlpha=planetOpacity;
      const aura=ctx.createRadialGradient(px,py,pr*.72,px,py,pr*1.22);aura.addColorStop(0,'rgba(28,172,171,0)');aura.addColorStop(.72,'rgba(32,188,180,.07)');aura.addColorStop(1,'rgba(42,193,211,0)');ctx.fillStyle=aura;ctx.beginPath();ctx.arc(px,py,pr*1.22,0,TAU);ctx.fill();
      const sphere=ctx.createRadialGradient(px-pr*.38,py-pr*.45,pr*.1,px,py,pr);sphere.addColorStop(0,'#163c50');sphere.addColorStop(.48,'#0a2b3d');sphere.addColorStop(1,'#061923');
      ctx.beginPath();ctx.arc(px,py,pr,0,TAU);ctx.fillStyle=sphere;ctx.fill();circle(px,py,pr,'rgba(65,240,219,.66)',1.5,21);
      ctx.beginPath();ctx.arc(px,py,pr-2,0,TAU);ctx.clip();
      const lines=Math.max(5,Math.round(12-distance*7));
      for(let i=0;i<lines;i++){
        const yy=py-pr*.9+i*pr*1.8/Math.max(1,lines-1),span=Math.sqrt(Math.max(0,pr*pr-(yy-py)*(yy-py)));
        ctx.beginPath();ctx.ellipse(px,yy,span,pr*.055,-.08,0,Math.PI);ctx.strokeStyle=`rgba(75,215,207,${.06+i*.009})`;ctx.lineWidth=1;ctx.stroke();
      }
      ctx.restore();
      if(reveal>.5&&distance<.075){ctx.save();ctx.globalAlpha=planetOpacity;label('THE WORLD BELOW',px,Math.max(45,py-pr-22),10,'rgba(130,243,229,.66)');ctx.restore();}
    }
    const w=game?.width||M[0].width,cell=60,cellCount=w/cell,parallax=.35,skyPeriod=Math.max(1500,vh*1.55);
    const first=Math.floor((cam.x-vw/(2*parallax)-80)/cell),last=Math.ceil((cam.x+vw/(2*parallax)+80)/cell);
    for(let i=first;i<=last;i++){
      const id=wrap(i,cellCount),x=(i*cell+rand(id+2)*cell-cam.x)*scale*parallax+cw*.5;
      const yWorld=wrap(rand(id+638)*skyPeriod-cam.y*.14+skyPeriod*.5,skyPeriod)-skyPeriod*.5;
      const y=yWorld*scale+ch*.5;
      if(x<0||x>cw||y<0||y>ch)continue;
      const r=.35+rand(id+1183)*1.45,alpha=.24+.35*(.5+.5*Math.sin(renderClock*1.7+rand(id+2222)*TAU));
      ctx.fillStyle=`rgba(160,211,235,${alpha})`;ctx.fillRect(x,y,r,r);
      const vx=game?.ship.vx||0,vy=game?.ship.vy||0,streak=clamp(Math.hypot(vx,vy)/550,0,1.5);
      if(streak>.12){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+clamp(vx*scale*.012,-18,18),y+clamp(vy*scale*.012,-18,18));ctx.strokeStyle=`rgba(153,224,243,${alpha*.48*streak})`;ctx.lineWidth=Math.max(.5,r*.65);ctx.stroke();}
    }
    ctx.strokeStyle='rgba(110,155,175,.025)';ctx.lineWidth=1;for(let y=(renderClock*4)%6;y<ch;y+=6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}
  }
  function worldTransform() {
    const shake=game?.shake||0;
    ctx.setTransform(dpr*scale,0,0,dpr*scale,dpr*(cw*.5-cam.x*scale+(rand(renderClock*40)-.5)*shake),dpr*(ch*.5-cam.y*scale+(rand(renderClock*50)-.5)*shake));
  }
  function drawRidge() {
    const g=game,left=cam.x-vw*.5-120,right=cam.x+vw*.5+120;
    ctx.beginPath();ctx.moveTo(left,WORLD_H+300);for(let x=Math.floor(left/60)*60;x<=right+60;x+=60)ctx.lineTo(x,ridge(x,g.width)+130);ctx.lineTo(right,WORLD_H+300);ctx.closePath();ctx.fillStyle='#0c1727';ctx.fill();
    const points=[];for(let x=Math.floor(left/24)*24;x<=right+24;x+=24)points.push([x,ground(x,g)]);
    ctx.beginPath();ctx.moveTo(points[0][0],WORLD_H+300);for(const [x,y] of points)ctx.lineTo(x,y);ctx.lineTo(points.at(-1)[0],WORLD_H+300);ctx.closePath();ctx.fillStyle='#0c1722';ctx.fill();
    for(let x=Math.floor(left/100)*100;x<=right+100;x+=100) {
      const y=ground(x,g), y2=ground(x+100,g), y3=ground(x+50,g)+110+25*Math.sin(TAU*wrap(x,g.width)*13/g.width);
      line([[x,y],[x+50,y3],[x+100,y2]],'rgba(76,150,160,.14)',1);
      if(Math.round(x/100)%2===0)line([[x+50,y3],[x+45,y3+140]],'rgba(76,150,160,.085)',1);
    }
    line(points,M[g.level].tint,2.15,16);
    line(points,'rgba(181,255,240,.25)',.65,0);
    for(let x=Math.floor(left/40)*40;x<=right+40;x+=40){const y=ground(x,g);circle(x,y,1.1,'rgba(126,255,230,.7)',1,0,true);}
    for(const pad of g.pads)forVisibleCopies(pad.x,pad.width*.5+100,x=>drawPad(pad,x));
    for(const t of g.turrets)forVisibleCopies(t.x,95,x=>drawTurret(t,x));
  }
  function drawPad(p,x=p.x) {
    const y=ground(x),w=p.width*.5,live=p.occupied;
    ctx.fillStyle='rgba(232,153,69,.065)';ctx.fillRect(x-w,y-32,p.width,32);
    line([[x-w,y],[x+w,y]],live?'#ffbc60':'#778f9c',3.3,live?21:5);
    line([[x-w,y-10],[x-w,y+8],[x-w+16,y+8]],live?'#eeb97a':'#7c9ba2',1.7,live?8:0);
    line([[x+w,y-10],[x+w,y+8],[x+w-16,y+8]],live?'#eeb97a':'#7c9ba2',1.7,live?8:0);
    for(const dx of [-w+8,w-8]){circle(x+dx,y-10,2.4,live?'#ffd393':'#749cb1',1,live?9:0,true);}
    line([[x-w+19,y-5],[x+w-19,y-5]],'rgba(255,217,159,.3)',1);
    if(live) {
      const pulse=.5+.5*Math.sin(renderClock*3+p.blink*TAU);
      circle(x,y-40,8+pulse*8,`rgba(255,200,112,${.27+pulse*.23})`,1,8);
      line([[x,y-54-pulse*9],[x,y-72-pulse*9]],'rgba(255,208,142,.65)',1,6);
      label('SURVIVOR',x,y-82-pulse*9,10,'#e6b87e');
      const head=y-22;circle(x,head,3.3,'#ffd498',1.4,6);line([[x,head+4],[x,head+14],[x-4,head+21]],'#ffd498',1.2,5);line([[x,head+14],[x+4,head+21]],'#ffd498',1.2,5);line([[x-5,head+9],[x+5,head+9]],'#ffd498',1.1,4);
    }
  }
  function drawCarrier(x=CARRIER.x) {
    const {y}=CARRIER, pulse=game?.pulse||0;
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
  function drawSpaceBody(body,x=body.x) {
    const {y,radius:r}=body,amber=body.id===1,core=amber?'#ffbd7b':'#8be9ff',rim=amber?'rgba(255,173,105,.85)':'rgba(104,217,255,.85)';
    ctx.save();ctx.translate(x,y);
    circle(0,0,r+17,amber?'rgba(255,146,88,.15)':'rgba(75,190,255,.17)',1,24);
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fillStyle=amber?'#251a29':'#102334';ctx.fill();circle(0,0,r,rim,2,21);
    ctx.save();ctx.beginPath();ctx.arc(0,0,r-2,0,TAU);ctx.clip();
    for(let i=-3;i<=3;i++){const yy=i*r*.27,span=Math.sqrt(Math.max(0,r*r-yy*yy));line([[-span,yy],[span,yy]],amber?'rgba(255,181,119,.25)':'rgba(122,218,245,.25)',1,3);}
    for(const a of [-.55,0,.55]){ctx.beginPath();ctx.ellipse(a*r*.28,0,r*.37,r*.96,a*.22,0,TAU);ctx.strokeStyle=amber?'rgba(255,165,108,.18)':'rgba(115,220,247,.18)';ctx.lineWidth=1;ctx.stroke();}
    ctx.restore();
    line([[-r*.72,r*.45],[-r*.22,r*.12],[r*.2,r*.35],[r*.68,r*.14]],amber?'rgba(255,142,95,.45)':'rgba(110,213,243,.49)',1.2,6);
    if(amber){
      ctx.save();ctx.rotate(-.24);ctx.scale(1,.42);
      for(const [start,end] of [[.16,2.6],[2.95,5.12],[5.48,TAU+.03]]){ctx.beginPath();ctx.arc(0,0,r*1.35,start,end);ctx.strokeStyle='#ffae73';ctx.lineWidth=2.2;ctx.shadowBlur=13;ctx.shadowColor='#ff9364';ctx.stroke();}
      ctx.restore();
    }else{
      for(let i=0;i<8;i++){const a=i*TAU/8+Math.PI/8,b=(i+1)*TAU/8+Math.PI/8;line([[Math.cos(a)*r*1.2,Math.sin(a)*r*1.2],[Math.cos(b)*r*1.2,Math.sin(b)*r*1.2]],i%2?'rgba(106,218,255,.67)':'rgba(149,238,255,.93)',1.5,10);}
      for(const a of [0,Math.PI*.5,Math.PI,Math.PI*1.5]){const v=a+Math.PI/8;line([[Math.cos(v)*r,Math.sin(v)*r],[Math.cos(v)*r*1.2,Math.sin(v)*r*1.2]],'#9cecff',1,7);}
    }
    ctx.restore();
    const dockY=body.dockY,pulse=.5+.5*Math.sin(renderClock*2.9+body.id);
    line([[x,dockY-14],[x,y+r-4]],rim,1.4,9);
    circle(x,dockY,42+pulse*5,body.claimed?'rgba(139,244,224,.42)':rim,1.5,13);
    circle(x,dockY,19,core,2,15);
    line([[x-15,dockY],[x+15,dockY]],core,1.5,8);
    line([[x,dockY-15],[x,dockY+15]],core,1.5,8);
    const notch=body.claimed?'RESUPPLY':'SALVAGE AVAILABLE';
    label(body.name,x+58,dockY+1,10,core,'left');
    label(notch,x+58,dockY+18,9,body.claimed?'#96cabf':core,'left');
  }
  function drawTurret(t,x=t.x) {
    const y=ground(x)-25;
    if(t.hp<=0){line([[x-19,y+25],[x-8,y+11],[x+9,y+17],[x+22,y+25]],'#a05d59',1.5,3);return;}
    const flash=t.flash>0;
    ctx.save();ctx.translate(x,y);
    line([[-21,25],[-15,4],[-7,-5],[7,-5],[15,4],[21,25]],flash?'#ffd2a7':'#ff826c',1.7,flash?17:9);
    line([[-15,7],[15,7]],'#ff8b75',1.2,8);line([[-8,-5],[-5,-18],[5,-18],[8,-5]],'#ff9277',1.4,8);
    circle(0,-2,5,flash?'#fff1d3':'#ff715f',1.3,12,true);
    for(const sx of [-1,1])line([[sx*18,14],[sx*28,21],[sx*28,25]],'#924e53',1);
    ctx.restore();
    if(wrappedDistance(game.ship,{x:t.x,y})<500&&mode==='playing')label('SENTRY',x,y-45,9,'#bc7270');
  }
  function drawDrone(e,x=e.x) {
    if(e.hp<=0){line([[x-14,e.y+3],[x+2,e.y-5],[x+17,e.y+9]],'rgba(255,119,106,.45)',1.2,5);return;}
    const fireSoon=e.cooldown<.7&&mode==='playing';
    if(fireSoon&&wrappedDistance(game.ship,e,game.width)<(e.space?700:560)){
      const tx=nearX(game.ship.x,x,game.width);
      ctx.save();ctx.setLineDash([4,8]);line([[x,e.y],[tx,game.ship.y]],`rgba(255,104,91,${.16+.34*(1-e.cooldown/.7)})`,1,5);ctx.restore();
      circle(x,e.y,29+(1-e.cooldown/.7)*10,'rgba(255,95,78,.5)',1,8);
    }
    ctx.save();ctx.translate(x,e.y);
    if(e.space){circle(0,0,38,'rgba(255,99,123,.64)',1.4,12);for(let i=0;i<4;i++){const a=renderClock*.38+i*TAU/4;line([[Math.cos(a)*34,Math.sin(a)*34],[Math.cos(a)*46,Math.sin(a)*46]],'#ff776f',1.3,9);}}
    const glow=e.flash>0?'#fff0d7':'#ff685f';
    line([[-23,1],[-10,-10],[0,-16],[10,-10],[23,1],[10,8],[0,12],[-10,8]],glow,1.8,13,true);
    line([[-23,1],[-33,10],[-15,8]],'#ff7867',1.25,8);
    line([[23,1],[33,10],[15,8]],'#ff7867',1.25,8);
    line([[-10,-10],[0,2],[10,-10]],'#ffad83',1.1,5);
    circle(0,0,4,e.flash>0?'#fff3db':'#ff6b5c',1,10,true);
    line([[-7,10],[-4,17],[4,17],[7,10]],'rgba(255,129,99,.8)',1,5);
    ctx.restore();
    if(wrappedDistance(game.ship,e,game.width)<(e.space?620:520)&&mode==='playing')label(e.space?'ORBITAL GUARDIAN':'INTERCEPTOR',x,e.y-(e.space?56:31),9,'#d78a7e');
  }
  function drawShip(s) {
    if(s.boostTier>=3&&Math.hypot(s.vx,s.vy)>300){
      const tail=clamp(Math.hypot(s.vx,s.vy)*.11,34,105);
      const len=Math.hypot(s.vx,s.vy)||1;
      line([[s.x-s.vx/len*tail,s.y-s.vy/len*tail],[s.x,s.y]],`rgba(83,245,224,${.12+Math.min(.2,s.boostTier*.025)})`,1.4,8);
    }
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);
    if(s.invuln>0&&mode==='playing')ctx.globalAlpha=.72+.28*(.5+.5*Math.sin(renderClock*18));
    if(s.boostFlash>0){const t=1-s.boostFlash/.22;circle(0,0,24+t*37,`rgba(121,249,226,${(1-t)*.7})`,1.7,15);for(let i=0;i<8;i++){const a=i*TAU/8;line([[Math.cos(a)*(28+t*18),Math.sin(a)*(28+t*18)],[Math.cos(a)*(36+t*27),Math.sin(a)*(36+t*27)]],`rgba(149,255,227,${(1-t)*.55})`,1,8);}}
    if(s.shield>0){circle(0,0,24,'rgba(137,248,255,.7)',1.7,12);circle(0,0,27,'rgba(137,248,255,.18)',1,5);}
    line([[0,-20],[14,12],[7,9],[3,15],[-3,15],[-7,9],[-14,12]],'#f0f8f6',2.2,12,true);
    line([[0,-14],[6,3],[0,7],[-6,3]],'#b8fcff',1.2,9,true);
    line([[-11,10],[-19,16],[-9,13]],'#8ad1d6',1.1,4);line([[11,10],[19,16],[9,13]],'#8ad1d6',1.1,4);
    line([[-4,13],[4,13]],'#ffa96d',2,8);
    if((down('thrust')||joystick.throttle>0||mode==='title')&&s.fuel>0){
      const f=clamp((12+rand(renderClock*83)*17)*(1+(s.power-1)*.58)*(mode==='title'?1:down('thrust')?1:joystick.throttle),7,108);
      line([[-4,16],[0,16+f],[4,16]],s.boostTier>=4?'#ff7668':'#ffb978',2+s.boostTier*.08,13+s.boostTier);
      line([[0,17],[0,17+f*.72]],s.boostTier>=3?'#ffffff':'#f4f3d5',1.4+s.boostTier*.05,7+s.boostTier);
      if(s.boostTier>=5)line([[-2,19],[0,16+f*1.13],[2,19]],'#70f9e2',1.1,17);
    }
    ctx.restore();
  }
  function drawParticles() {
    const g=game;if(!g)return;
    for(const p of g.particles)if(Math.abs(p.y-cam.y)<vh*.5+50)forVisibleCopies(p.x,30,x=>{ctx.globalAlpha=clamp(p.life/(p.max||.6),0,1);circle(x,p.y,p.size,p.color,1,p.size*4,true);});ctx.globalAlpha=1;
    for(const b of g.bullets)if(Math.abs(b.y-cam.y)<vh*.5+70)forVisibleCopies(b.x,50,x=>{line([[x-b.vx*.035,b.y-b.vy*.035],[x,b.y]],'#f8efc4',2,12);circle(x,b.y,2,'#fff8df',1,9,true);});
    for(const b of g.enemyBullets)if(Math.abs(b.y-cam.y)<vh*.5+50)forVisibleCopies(b.x,30,x=>{circle(x,b.y,5,'#ff705e',1.5,13);circle(x,b.y,2,'#ffd2ae',1,6,true);});
  }
  function drawDirection() {
    if(mode!=='playing'||!game)return;
    const s=game.ship,o=nextObjective();
    const tinyLandscape=cw<=640&&ch<=450&&cw>ch;
    const tinyPortrait=cw<=650&&ch<730&&ch>cw;
    const sx=(o.x-cam.x)*scale+cw*.5,sy=(o.y-cam.y)*scale+ch*.5;
    const on=sx>48&&sx<cw-48&&sy>74&&sy<ch-80;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!on) {
      const ox=sx-cw*.5,oy=sy-ch*.5,angle=Math.atan2(oy,ox);
      const radius=o.kind==='outpost'&&ch>cw?Math.min(ch*.34,cw*.55):Math.min(cw*.38,ch*.39),x=clamp(cw*.5+Math.cos(angle)*radius,36,cw-36);
      const bottomLimit=tinyLandscape?ch-104:tinyPortrait?ch-210:ch-75;
      const y=clamp(ch*.5+Math.sin(angle)*radius,85,bottomLimit);
      ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);
      line([[0,-13],[9,9],[0,4],[-9,9]],o.label==='CARRIER'?'#90f7f5':'#ffcc83',1.8,11,true);ctx.restore();
      label(o.label,x,y+31,10,o.label==='CARRIER'?'#9af9f4':'#e8b981');
    } else {
      const pulse=.5+.5*Math.sin(renderClock*2.8);
      circle(sx,sy,25+pulse*7,o.label==='CARRIER'?'rgba(134,242,247,.27)':'rgba(255,201,126,.28)',1,8);
    }
    if(game.statusUntil>game.time&&game.status) {
      const compact=tinyLandscape||tinyPortrait,fontSize=tinyLandscape?8:tinyPortrait?9:11;
      ctx.font=`${fontSize}px "Space Mono", monospace`;const width=ctx.measureText(game.status).width;
      const shortLandscape=cw>ch*1.7&&ch<600;
      const x=tinyLandscape?width*.5+28:shortLandscape?width*.5+40:cw*.5;
      const y=tinyLandscape?125:tinyPortrait?ch-243:shortLandscape?clamp(ch*.23,82,120):Math.min(ch*.77,ch-110);
      const pad=compact?10:18,top=compact?17:21,height=compact?27:34,rule=compact?10:13;
      ctx.fillStyle='rgba(9,18,30,.84)';ctx.fillRect(x-width*.5-pad,y-top,width+pad*2,height);
      line([[x-width*.5-pad,y+rule],[x+width*.5+pad,y+rule]],'#90e6df',1,8);
      label(game.status,x,y,fontSize,'#d4eee8');
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
    if(cam.y+vh*.5>600)drawRidge();
    for(const body of game.spaceBodies)if(Math.abs(body.y-cam.y)<vh*.5+body.radius+180)forVisibleCopies(body.x,body.radius+130,x=>drawSpaceBody(body,x));
    for(const e of game.drones)if(Math.abs(e.y-cam.y)<vh*.5+100)forVisibleCopies(e.x,90,x=>drawDrone(e,x));
    if(Math.abs(CARRIER.y-cam.y)<vh*.5+130)forVisibleCopies(CARRIER.x,120,drawCarrier);
    drawParticles();
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
  function bindButton(id,fn) {
    const b=$(id);if(!b)return;
    let touchPointer=null,lastTouchAction=-Infinity;
    const act=()=>{sound('click');fn();};
    b.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')touchPointer=e.pointerId;});
    b.addEventListener('pointerup',e=>{
      if(e.pointerType!=='touch'||e.pointerId!==touchPointer)return;
      touchPointer=null;
      const r=b.getBoundingClientRect();
      if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)return;
      e.preventDefault();lastTouchAction=performance.now();act();
    });
    for(const type of ['pointercancel','lostpointercapture'])b.addEventListener(type,e=>{if(e.pointerId===touchPointer)touchPointer=null;});
    b.addEventListener('click',e=>{e.preventDefault();if(e.detail>0&&performance.now()-lastTouchAction<750)return;act();});
  }
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
      let owner=null;
      const press=e=>{if(mode!=='playing'||(owner!==null&&touches[control]))return;e.preventDefault();owner=e.pointerId;touches[control]=true;el.classList.add('is-pressed');try{el.setPointerCapture(e.pointerId);}catch{}};
      const release=e=>{if(e.pointerId!==owner)return;e.preventDefault();owner=null;touches[control]=false;el.classList.remove('is-pressed');};
      el.addEventListener('pointerdown',press);el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
    });
  }
  function bindFlightGestures() {
    const surface=$('game');
    const hasFlightTouch=()=>joystick.pointerId!==null||Object.values(touches).some(Boolean);
    const blockTouch=e=>{
      if(e.target.closest?.('button:not([data-control])'))return;
      const control=e.target.closest?.('#flightJoystick,[data-control],#gameCanvas');
      if((control||hasFlightTouch()||(e.touches?.length||0)>1)&&e.cancelable)e.preventDefault();
    };
    // Safari gesture zoom needs cancellation in addition to pointer capture/CSS.
    // Cancel control touches, while preserving ordinary taps on menu buttons.
    for(const type of ['touchstart','touchmove','touchend'])surface.addEventListener(type,blockTouch,{passive:false});
    const blockGesture=e=>{if((matchMedia('(pointer: coarse)').matches||hasFlightTouch())&&e.cancelable)e.preventDefault();};
    for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,blockGesture,{passive:false});
    surface.addEventListener('dblclick',e=>{if(matchMedia('(pointer: coarse)').matches)e.preventDefault();});
  }
  function bindJoystick() {
    const el=$('flightJoystick');if(!el)return;
    const updateStick=e=>{
      const rect=el.getBoundingClientRect(),knob=el.querySelector('.joystick-knob');
      const travel=Math.max(12,(Math.min(rect.width,rect.height)-(knob?.getBoundingClientRect().width||48))*.5);
      const rawX=(e.clientX-(rect.left+rect.width*.5))/travel,rawY=(e.clientY-(rect.top+rect.height*.5))/travel;
      const length=Math.max(1,Math.hypot(rawX,rawY)),dx=rawX/length,dy=rawY/length;
      joystick.dx=dx;joystick.dy=dy;
      joystick.turn=Math.sign(dx)*clamp((Math.abs(dx)-.14)/.86,0,1);
      joystick.throttle=clamp((-dy-.14)/.86,0,1);
      el.style.setProperty('--stick-x',`${Math.round(dx*travel)}px`);
      el.style.setProperty('--stick-y',`${Math.round(dy*travel)}px`);
    };
    el.addEventListener('pointerdown',e=>{if(mode!=='playing'||joystick.pointerId!==null)return;e.preventDefault();joystick.pointerId=e.pointerId;el.classList.add('is-active');try{el.setPointerCapture(e.pointerId);}catch{}updateStick(e);});
    el.addEventListener('pointermove',e=>{if(e.pointerId!==joystick.pointerId)return;e.preventDefault();updateStick(e);});
    const release=e=>{if(e.pointerId!==joystick.pointerId)return;e.preventDefault();clearJoystick();};
    el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);
  }
  bindButton('startButton',()=>startLevel(0,true));bindButton('briefingButton',enterPlay);
  bindButton('resumeButton',()=>setPause(false));bindButton('pauseButton',()=>setPause(mode==='playing'));
  bindButton('retryButton',retry);
  bindButton('resultButton',resultAction);
  bindButton('muteButton',()=>{const value=!(audio.muted??false);sound('setMuted',value);const b=$('muteButton');if(b){b.setAttribute('aria-label',value?'Unmute audio':'Mute audio');b.classList.toggle('is-muted',value);}});
  bindButton('fullscreenButton',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});});
  bindButton('helpButton',()=>{if(mode==='playing')setPause(true);});
  addEventListener('keydown',e=>keyAction(e,true));addEventListener('keyup',e=>keyAction(e,false));
  addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);Object.keys(touches).forEach(k=>touches[k]=false);clearJoystick();clearTouchVisuals();if(mode==='playing')setPause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')setPause(true);});
  addEventListener('resize',resize);bindFlightGestures();bindTouch();bindJoystick();resize();
  game=makeLevel(0);cam={x:580,y:520};show('titleScreen',true);show('briefingScreen',false);show('pauseScreen',false);show('resultScreen',false);updateHud();
  if($('muteButton')){$('muteButton').classList.toggle('is-muted',!!audio.muted);$('muteButton').setAttribute('aria-label',audio.muted?'Unmute audio':'Mute audio');}
  window.__afterlightDebug={snapshot:()=>({mode,level:levelIndex+1,worldWidth:game.width,camera:{...cam},orbit:{enter:ORBIT_ENTER,exit:ORBIT_EXIT,spaceFuelMultiplier:2},homePlanet:homePlanetVisual(game.ship.altitude),joystick:{...joystick},ship:{...game.ship},delivered:game.delivered,salvageCount:game.salvageCount,spaceBodies:game.spaceBodies.map(b=>({...b})),pads:game.pads.map(p=>({id:p.id,x:p.x,occupied:p.occupied})),turrets:game.turrets.map(t=>({x:t.x,hp:t.hp})),flyingEnemies:game.drones.map(e=>({id:e.id,x:e.x,y:e.y,hp:e.hp,space:e.space,shotCount:e.shotCount,cooldown:e.cooldown})),entities:{particles:game.particles.length,bullets:game.bullets.length,enemyBullets:game.enemyBullets.length,flyingEnemies:game.drones.filter(e=>e.hp>0).length},score:totalScore(),objective:nextObjective(),time:game.time}),ground:(x)=>ground(x),wrappedDx:(target,origin)=>deltaX(target,origin,game.width),start:(level=1)=>{campaignScore=0;startLevel(clamp(level-1,0,2),false);},setShip:(x,y,vx=0,vy=0,a=0)=>{Object.assign(game.ship,{x,y,vx,vy,a});cam.x=x;cam.y=y+(cw>ch*1.7&&ch<600?80:0);},setResources:({fuel,hull,shieldCharge}={})=>{const s=game.ship;if(Number.isFinite(fuel))s.fuel=clamp(fuel,0,100);if(Number.isFinite(hull))s.hull=clamp(hull,0,100);if(Number.isFinite(shieldCharge))s.shieldCharge=clamp(shieldCharge,0,100);updateHud();},setMode:(value)=>{if(value==='playing')enterPlay();else if(value==='paused')setPause(true);}};
  requestAnimationFrame(frame);
})();
