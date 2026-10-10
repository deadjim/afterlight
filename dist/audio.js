/* AFTERLIGHT: original procedural sound, no downloaded assets. */
(() => {
  let context, master, engineGain, engineOsc, engineFilter, noiseBuffer;
  let muted = false, paused = false, started = false;
  try { muted = localStorage.getItem('afterlight-muted') === 'true'; } catch (_) {}
  function start() {
    try {
      if (!context) {
        context = new (window.AudioContext || window.webkitAudioContext)();
        master = context.createGain(); master.gain.value = muted ? 0 : 0.24; master.connect(context.destination);
        noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
        const n = noiseBuffer.getChannelData(0);
        for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
        engineOsc = context.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 42;
        engineFilter = context.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 210;
        engineGain = context.createGain(); engineGain.gain.value = 0;
        engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(master); engineOsc.start();
      }
      context.resume().catch(() => {}); started = true;
    } catch (_) { /* The game remains playable when audio is unavailable. */ }
  }
  function tone(freq, duration, type = 'sine', volume = 0.3, endFreq = freq, delay = 0) {
    if (!started || !context || paused) return;
    const t = context.currentTime + delay, o = context.createOscillator(), g = context.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(volume, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + duration + 0.02);
  }
  function noise(duration, volume, cutoff) {
    if (!started || !context || paused) return;
    const t = context.currentTime, source = context.createBufferSource(), filter = context.createBiquadFilter(), g = context.createGain();
    source.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter); filter.connect(g); g.connect(master); source.start(t); source.stop(t + duration);
  }
  window.AfterlightAudio = {
    start,
    engine(amount) { if (context && engineGain) { const a = paused ? 0 : Math.max(0, Math.min(1, amount)); engineGain.gain.setTargetAtTime(a * 0.19, context.currentTime, 0.055); engineOsc.frequency.setTargetAtTime(42 + a * 17, context.currentTime, 0.04); } },
    shot() { tone(790, 0.085, 'triangle', 0.20, 175); },
    explosion() { noise(0.55, 0.65, 850); tone(95, 0.38, 'sine', 0.4, 25); },
    rescue() { tone(440, 0.18, 'sine', 0.28); tone(660, 0.23, 'sine', 0.24, 660, 0.11); },
    dock() { [330, 440, 660, 880].forEach((f, i) => tone(f, 0.34, 'triangle', 0.15, f, i * 0.12)); },
    click() { tone(520, 0.09, 'triangle', 0.16, 620); },
    pause(value) { paused = !!value; if (engineGain) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.03); },
    setMuted(value) { muted = !!value; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.24, context.currentTime, 0.03); try { localStorage.setItem('afterlight-muted', String(muted)); } catch (_) {} },
    get muted() { return muted; }
  };
})();
