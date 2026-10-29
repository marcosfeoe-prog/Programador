'use strict';
// Efeitos sonoros sintetizados com WebAudio (sem arquivos).

const Sfx = (() => {
  let ac = null, master = null, muted = false;
  const last = {};
  function init() {
    if (ac) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0) {
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
  }
  function noise(dur, vol = 0.3, freq = 1200) {
    const t = ac.currentTime;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = freq;
    s.buffer = buf; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const sounds = {
    wood: () => { tone(320, 0.08, 'triangle', 0.35, 0.6); noise(0.05, 0.15, 900); },
    stone: () => { tone(900, 0.06, 'square', 0.12, 0.7); noise(0.06, 0.2, 3000); },
    swing: () => noise(0.08, 0.08, 2000),
    hit: () => tone(180, 0.08, 'sawtooth', 0.15, 0.5),
    shoot: () => tone(700, 0.07, 'triangle', 0.08, 0.5),
    cannon: () => { noise(0.18, 0.25, 500); tone(120, 0.15, 'sine', 0.3, 0.5); },
    boom: () => { noise(0.4, 0.35, 400); tone(70, 0.35, 'sine', 0.4, 0.4); },
    magic: () => tone(1100, 0.12, 'sine', 0.08, 1.6),
    punch: () => { noise(0.07, 0.2, 700); tone(110, 0.08, 'square', 0.12, 0.6); },
    build: () => { tone(500, 0.06, 'square', 0.12, 1.4); },
    upgrade: () => { tone(500, 0.08, 'triangle', 0.25, 1.5); setTimeout(() => ac && tone(800, 0.12, 'triangle', 0.25, 1.5), 80); },
    sell: () => tone(400, 0.12, 'triangle', 0.2, 0.5),
    hurt: () => tone(220, 0.15, 'sawtooth', 0.2, 0.4),
    die: () => tone(300, 0.6, 'sawtooth', 0.25, 0.2),
    destroy: () => { noise(0.25, 0.25, 800); },
    night: () => { tone(220, 0.6, 'sine', 0.3, 0.7); setTimeout(() => ac && tone(165, 0.9, 'sine', 0.3, 0.7), 350); },
    day: () => { tone(523, 0.2, 'triangle', 0.25); setTimeout(() => ac && tone(784, 0.35, 'triangle', 0.25), 150); },
    buy: () => { tone(880, 0.07, 'square', 0.12); setTimeout(() => ac && tone(1320, 0.1, 'square', 0.12), 70); },
    error: () => tone(150, 0.12, 'square', 0.12),
  };
  return {
    init,
    play(name) {
      if (!ac || muted || !sounds[name]) return;
      const now = performance.now();
      if (last[name] && now - last[name] < 45) return; // evita saturar
      last[name] = now;
      sounds[name]();
    },
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
