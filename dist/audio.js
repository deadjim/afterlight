/* AFTERLIGHT — original Web Audio effects; no external sound files. */
(() => {
  'use strict';
  let context, master, engineBus, engineNoise, engineBass, engineUpper;
  let whiteBuffer, pinkBuffer;
  let muted = false, paused = false, lastEngine = 0;
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
    const rumbleHigh = filter('highpass', 35, .5);
    const rumbleLow = filter('lowpass', 300, .6);
    const rumbleLevel = context.createGain();
    rumbleLevel.gain.value = .69;
    engineNoise.connect(rumbleHigh);
    rumbleHigh.connect(rumbleLow);
    rumbleLow.connect(rumbleLevel);
    rumbleLevel.connect(engineBus);
    // This middle band carries the rocket on phone speakers without a tonal buzz.
    const presence = filter('bandpass', 540, .58);
    const presenceLevel = context.createGain();
    presenceLevel.gain.value = .38;
    engineNoise.connect(presence);
    presence.connect(presenceLevel);
    presenceLevel.connect(engineBus);
    const airHigh = filter('highpass', 1500, .5);
    const airLow = filter('lowpass', 3400, .5);
    const airLevel = context.createGain();
    airLevel.gain.value = .07;
    engineNoise.connect(airHigh);
    airHigh.connect(airLow);
    airLow.connect(airLevel);
    airLevel.connect(engineBus);
    // Quiet harmonic sine body adds weight without sawtooth or pulse modulation.
    engineBass = context.createOscillator();
    engineBass.type = 'sine';
    engineBass.frequency.value = 68;
    const bassLevel = context.createGain();
    bassLevel.gain.value = .105;
    engineBass.connect(bassLevel);
    bassLevel.connect(engineBus);
    engineUpper = context.createOscillator();
    engineUpper.type = 'sine';
    engineUpper.frequency.value = 136;
    const upperLevel = context.createGain();
    upperLevel.gain.value = .035;
    engineUpper.connect(upperLevel);
    upperLevel.connect(engineBus);
    engineNoise.start();
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
    if (!context || !engineBus) return;
    const t = context.currentTime;
    engineBus.gain.cancelScheduledValues(t);
    engineBus.gain.setTargetAtTime(0, t, .026);
  }
  const api = {
    start,
    engine(amount) {
      if (!context || !engineBus) return;
      const level = paused || muted ? 0 : Math.max(0, Math.min(1, Number(amount) || 0));
      if (Math.abs(level - lastEngine) < .025) return;
      lastEngine = level;
      const t = context.currentTime;
      engineBus.gain.cancelScheduledValues(t);
      engineBus.gain.setTargetAtTime(level * .94, t, level > 0 ? .023 : .038);
      // Smooth color change with throttle; no pulse or periodic wobble.
      engineBass.frequency.setTargetAtTime(68 + level * 6, t, .08);
      engineUpper.frequency.setTargetAtTime(136 + level * 12, t, .08);
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
