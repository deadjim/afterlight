/* AFTERLIGHT — original Web Audio effects; no external sound files. */
(() => {
  'use strict';
  let context, master, engineBus, engineNoise, engineRumble, engineBass, engineUpper;
  let whiteBuffer, pinkBuffer, brownBuffer;
  let rumbleLow, rumbleLevel, presence, presenceLevel, airLevel, bassLevel, upperLevel;
  let muted = false, paused = false, lastEngine = 0, lastPower = 1, lastSpace = false, lastBoostTier = 0;
  let lastWarningTime = -100, lastShieldEmptyTime = -100;
  const MASTER_LEVEL = 0.42;
  try { muted = localStorage.getItem('afterlight-muted') === 'true'; } catch (_) {}

  function makeBuffer(seconds, pink = false) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    if (!pink) {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }
    // Pink noise gives the exhaust a broad, warm spectrum without a motor pitch.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = .99886 * b0 + white * .0555179;
      b1 = .99332 * b1 + white * .0750759;
      b2 = .96900 * b2 + white * .1538520;
      b3 = .86650 * b3 + white * .3104856;
      b4 = .55000 * b4 + white * .5329522;
      b5 = -.7616 * b5 - white * .0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11;
      b6 = white * .115926;
    }
    return buffer;
  }
  function makeBrownBuffer(seconds) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    let state = 0;
    for (let i = 0; i < data.length; i++) {
      state = state * .996 + (Math.random() * 2 - 1) * .035;
      data[i] = state;
    }
    // Close the loop without a discontinuity; the high-pass stage removes this drift.
    const first = data[0], delta = data[data.length - 1] - first;
    for (let i = 0; i < data.length; i++) data[i] -= first + delta * i / (data.length - 1);
    return buffer;
  }
  function filter(type, frequency, q = .7) {
    const node = context.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }
  function makeEngine() {
    engineBus = context.createGain();
    engineBus.gain.value = 0;
    engineBus.connect(master);
    engineNoise = context.createBufferSource();
    engineNoise.buffer = pinkBuffer;
    engineNoise.loop = true;
    engineRumble = context.createBufferSource();
    engineRumble.buffer = brownBuffer;
    engineRumble.loop = true;
    const rumbleHigh = filter('highpass', 24, .5);
    rumbleLow = filter('lowpass', 245, .6);
    rumbleLevel = context.createGain();
    rumbleLevel.gain.value = .94;
    engineRumble.connect(rumbleHigh);
    rumbleHigh.connect(rumbleLow);
    rumbleLow.connect(rumbleLevel);
    rumbleLevel.connect(engineBus);
    // This middle band carries the rocket on phone speakers without a tonal buzz.
    presence = filter('bandpass', 510, .55);
    presenceLevel = context.createGain();
    presenceLevel.gain.value = .53;
    engineNoise.connect(presence);
    presence.connect(presenceLevel);
    presenceLevel.connect(engineBus);
    const airHigh = filter('highpass', 1500, .5);
    const airLow = filter('lowpass', 3400, .5);
    airLevel = context.createGain();
    airLevel.gain.value = .055;
    engineNoise.connect(airHigh);
    airHigh.connect(airLow);
    airLow.connect(airLevel);
    airLevel.connect(engineBus);
    // Quiet harmonic sine body adds weight without sawtooth or pulse modulation.
    engineBass = context.createOscillator();
    engineBass.type = 'sine';
    engineBass.frequency.value = 61;
    bassLevel = context.createGain();
    bassLevel.gain.value = .145;
    engineBass.connect(bassLevel);
    bassLevel.connect(engineBus);
    engineUpper = context.createOscillator();
    engineUpper.type = 'sine';
    engineUpper.frequency.value = 122;
    upperLevel = context.createGain();
    upperLevel.gain.value = .038;
    engineUpper.connect(upperLevel);
    upperLevel.connect(engineBus);
    engineNoise.start();
    engineRumble.start();
    engineBass.start();
    engineUpper.start();
  }
  function start() {
    try {
      if (!context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        master = context.createGain();
        master.gain.value = muted ? 0 : MASTER_LEVEL;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -9;
        limiter.knee.value = 8;
        limiter.ratio.value = 8;
        limiter.attack.value = .003;
        limiter.release.value = .2;
        master.connect(limiter);
        limiter.connect(context.destination);
        whiteBuffer = makeBuffer(2);
        pinkBuffer = makeBuffer(4, true);
        brownBuffer = makeBrownBuffer(8);
        makeEngine();
      }
      if (context.state === 'suspended' || context.state === 'interrupted') context.resume().catch(() => {});
    } catch (_) {
      // Audio is optional; gameplay continues if Web Audio is unavailable.
    }
  }
  function ready() { return context && master && !paused && !muted; }
  function cleanup(source, ...nodes) {
    source.onended = () => {
      try { source.disconnect(); } catch (_) {}
      for (const node of nodes) try { node.disconnect(); } catch (_) {}
    };
  }
  function tone(frequency, endFrequency, duration, level, delay = 0) {
    if (!ready()) return;
    const t = context.currentTime + delay;
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(20, frequency), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level), t + Math.min(.012, duration * .16));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    cleanup(osc, gain);
    osc.start(t);
    osc.stop(t + duration + .025);
  }
  function burst(duration, level, type, cutoff, delay = 0, endCutoff = cutoff) {
    if (!ready()) return;
    const t = context.currentTime + delay;
    const source = context.createBufferSource();
    const shape = filter(type, cutoff, .62), gain = context.createGain();
    source.buffer = whiteBuffer;
    shape.frequency.setValueAtTime(cutoff, t);
    shape.frequency.exponentialRampToValueAtTime(Math.max(35, endCutoff), t + duration);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level), t + Math.min(.012, duration * .1));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(shape);
    shape.connect(gain);
    gain.connect(master);
    cleanup(source, shape, gain);
    source.start(t);
    source.stop(t + duration + .025);
  }
  function stopEngine() {
    lastEngine = 0;
    lastBoostTier = 0;
    if (!context || !engineBus) return;
    const t = context.currentTime;
    engineBus.gain.cancelScheduledValues(t);
    engineBus.gain.setTargetAtTime(0, t, .026);
  }
  const api = {
    start,
    engine(amount, power = 1, space = false) {
      if (!context || !engineBus) return;
      const level = paused || muted ? 0 : Math.max(0, Math.min(1, Number(amount) || 0));
      // Ignore boost values while coasting so per-frame calls do not schedule automation.
      const p = level ? Math.max(1, Math.min(6.25, Number(power) || 1)) : lastPower;
      const orbit = level ? !!space : lastSpace;
      if (Math.abs(level - lastEngine) < .025 && Math.abs(p - lastPower) < .012 && orbit === lastSpace) return;
      lastEngine = level;
      lastPower = p;
      lastSpace = orbit;
      if (!level) lastBoostTier = 0;
      const boost = (p - 1) / 5.25;
      const t = context.currentTime;
      engineBus.gain.cancelScheduledValues(t);
      engineBus.gain.setTargetAtTime(level * (.79 + boost * .38 + (orbit ? .08 : 0)), t, level > 0 ? .025 : .042);
      // Boost adds low rumble and phone-band presence; all changes are smooth, never pulsed.
      rumbleLow.frequency.setTargetAtTime(245 + boost * 85 + (orbit ? 25 : 0), t, .11);
      rumbleLevel.gain.setTargetAtTime(.94 + boost * .28 + (orbit ? .08 : 0), t, .11);
      presence.frequency.setTargetAtTime(510 + boost * 250 + (orbit ? 75 : 0), t, .11);
      presenceLevel.gain.setTargetAtTime(.53 + boost * .1 + (orbit ? .04 : 0), t, .11);
      airLevel.gain.setTargetAtTime(.055 + boost * .025, t, .11);
      const bassHz = 61 - boost * 10;
      engineBass.frequency.setTargetAtTime(bassHz, t, .13);
      engineUpper.frequency.setTargetAtTime(bassHz * 2, t, .13);
      bassLevel.gain.setTargetAtTime(.145 + boost * .045, t, .11);
      upperLevel.gain.setTargetAtTime(.038 + boost * .009, t, .11);
    },
    boost(tier) {
      const n = Math.max(0, Math.min(10, Math.round(Number(tier) || 0)));
      if (!n) { lastBoostTier = 0; return; }
      if (n <= lastBoostTier) return;
      lastBoostTier = n;
      if (!ready()) return;
      const intensity = n / 10;
      burst(.11 + intensity * .05, .06 + intensity * .035, 'lowpass', 670 + intensity * 260, 0, 200);
      if (n === 1 || n === 4 || n === 7 || n === 10) tone(88 - intensity * 24, 57 - intensity * 10, .16, .045 + intensity * .018);
    },
    orbit() {
      if (!ready()) return;
      burst(.36, .13, 'bandpass', 740, 0, 220);
      tone(190, 280, .31, .12);
      tone(380, 475, .32, .065, .12);
    },
    shieldEmpty() {
      if (!ready() || context.currentTime - lastShieldEmptyTime < .8) return;
      lastShieldEmptyTime = context.currentTime;
      tone(570, 330, .15, .11);
      tone(340, 210, .19, .095, .1);
    },
    warning() {
      if (!ready() || context.currentTime - lastWarningTime < 2) return;
      lastWarningTime = context.currentTime;
      // Two short upper-mid pips stay legible over the bass-heavy max-thrust bed.
      tone(850, 720, .13, .18);
      tone(740, 610, .15, .16, .18);
    },
    impact(strength = 1) {
      const force = Math.max(0, Math.min(1, Number(strength) || 0));
      burst(.12 + force * .18, .11 + force * .29, 'lowpass', 850 + force * 300, 0, 160);
      tone(100, 43, .18 + force * .12, .10 + force * .21);
    },
    shot() {
      tone(690, 230, .12, .22);
      burst(.055, .16, 'bandpass', 1800, 0, 900);
    },
    explosion() {
      burst(.52, .62, 'lowpass', 1100, 0, 165);
      burst(.12, .16, 'highpass', 1100);
      tone(105, 35, .47, .3);
    },
    rescue() {
      tone(440, 440, .2, .17);
      tone(660, 660, .25, .16, .105);
      tone(880, 880, .29, .085, .2);
    },
    dock() {
      [330, 440, 550, 660].forEach((f, i) => tone(f, f, .3, .09, i * .095));
      burst(.26, .12, 'lowpass', 580, .015, 230);
    },
    click() {
      if (!context) start();
      tone(560, 430, .055, .08);
    },
    pause(value) {
      paused = !!value;
      if (paused) stopEngine();
      else if (context) start();
    },
    setMuted(value) {
      muted = !!value;
      if (muted) stopEngine();
      else if (context && !paused) start();
      if (context && master) master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, context.currentTime, .025);
      try { localStorage.setItem('afterlight-muted', String(muted)); } catch (_) {}
    },
    get muted() { return muted; }
  };
  window.addEventListener('blur', stopEngine);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopEngine(); });
  window.AfterlightAudio = api;
})();
