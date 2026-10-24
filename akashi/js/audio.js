// Áudio 100% sintetizado (Web Audio). A trilha e os efeitos do episódio são
// uma lista de eventos com tempo absoluto; um agendador toca os eventos que
// caem na janela à frente do relógio do áudio. Ao pausar ou pular, a "sessão"
// atual é silenciada e uma nova começa do ponto pedido (notas longas que já
// estavam soando recomeçam do meio).

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.events = [];
    this.playing = false;
    this.vol = { master: 0.9, music: 0.8, sfx: 0.9, voice: 0.6 };
    this.voiceMode = 'blips';
  }

  // ctx opcional: permite renderizar a trilha offline (OfflineAudioContext).
  init(given = null) {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !given) return;
    const ctx = (this.ctx = given || new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.gain.value = this.vol.master;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 10;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    if (ctx.createMediaStreamDestination) {
      this.recDest = ctx.createMediaStreamDestination();
      this.comp.connect(this.recDest);
    }
    // ruído compartilhado
    const n = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    // reverberação (resposta ao impulso gerada)
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    this.revOut = ctx.createGain();
    this.revOut.gain.value = 0.55;
    this.reverb.connect(this.revOut);
    this.revOut.connect(this.master);
    // eco (delay) para a guitarra solo
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.3;
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2800;
    this.delay.connect(dl);
    dl.connect(this.fb);
    this.fb.connect(this.delay);
    this.delayOut = ctx.createGain();
    this.delayOut.gain.value = 0.5;
    dl.connect(this.delayOut);
    this.delayOut.connect(this.master);
    // distorção
    const curve = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) {
      const x = (i / 2047) * 2 - 1;
      curve[i] = Math.tanh(x * 7) * 0.9;
    }
    this.distCurve = curve;
  }

  get ok() {
    return !!this.ctx;
  }

  setVolume(k, v) {
    this.vol[k] = v;
    if (!this.ctx) return;
    if (k === 'master') this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    if (this.sess) {
      const s = this.sess;
      if (k === 'music') s.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
      if (k === 'sfx') s.sfx.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
      if (k === 'voice') s.voice.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    }
  }

  setEvents(list) {
    this.events = list.sort((a, b) => a.t - b.t);
  }

  // ------------------------------------------------------------ transporte
  newSession() {
    const ctx = this.ctx;
    const s = { out: ctx.createGain() };
    s.out.connect(this.master);
    s.music = ctx.createGain();
    s.music.gain.value = this.vol.music;
    s.sfx = ctx.createGain();
    s.sfx.gain.value = this.vol.sfx;
    s.voice = ctx.createGain();
    s.voice.gain.value = this.vol.voice;
    for (const b of [s.music, s.sfx, s.voice]) b.connect(s.out);
    s.rev = ctx.createGain();
    s.rev.connect(this.reverb);
    s.dly = ctx.createGain();
    s.dly.connect(this.delay);
    return s;
  }

  killSession() {
    if (!this.sess) return;
    const s = this.sess;
    const now = this.ctx.currentTime;
    for (const g of [s.out, s.rev, s.dly]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 0.04);
    }
    setTimeout(() => {
      for (const g of [s.out, s.rev, s.dly]) g.disconnect();
    }, 200);
    this.sess = null;
  }

  async play(t0) {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* sem áudio */
      }
    }
    this.killSession();
    this.sess = this.newSession();
    this.t0 = t0;
    this.a0 = this.ctx.currentTime + 0.06;
    this.playing = true;
    // eventos sustentados que começaram antes e ainda soam
    let i = this.find(t0 - 30);
    this.idx = this.find(t0);
    for (; i < this.idx; i++) {
      const e = this.events[i];
      if (e.s && e.t + e.d > t0 + 0.1) this.schedule(e, this.a0, t0 - e.t);
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 30);
    this.pump();
  }

  pause() {
    this.playing = false;
    clearInterval(this.timer);
    if (this.ctx) this.killSession();
  }

  find(t) {
    let lo = 0;
    let hi = this.events.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.events[m].t < t) lo = m + 1;
      else hi = m;
    }
    return lo;
  }

  // Renderiza [t0, t0 + dur] num contexto offline (testes e exportação).
  renderRange(t0, dur) {
    this.sess = this.newSession();
    this.t0 = t0;
    this.a0 = 0.05;
    let i = this.find(t0 - 30);
    for (; i < this.events.length && this.events[i].t < t0 + dur; i++) {
      const e = this.events[i];
      if (e.t < t0) {
        if (e.s && e.t + e.d > t0 + 0.1) this.schedule(e, this.a0, t0 - e.t);
      } else this.schedule(e, this.a0 + (e.t - t0), 0);
    }
  }

  // Tempo do episódio segundo o relógio do áudio.
  time() {
    return this.t0 + (this.ctx.currentTime - this.a0);
  }

  pump() {
    if (!this.playing || !this.sess) return;
    const ahead = this.time() + 0.25;
    while (this.idx < this.events.length && this.events[this.idx].t < ahead) {
      const e = this.events[this.idx++];
      const when = this.a0 + (e.t - this.t0);
      if (when < this.ctx.currentTime - 0.05) continue;
      this.schedule(e, Math.max(when, this.ctx.currentTime), 0);
    }
  }

  schedule(e, when, off) {
    const fn = this[e.i];
    if (!fn) return;
    try {
      fn.call(this, when, e, off);
    } catch (err) {
      console.warn('áudio', e.i, err);
    }
  }

  // ------------------------------------------------------------ blocos
  bus(e) {
    const s = this.sess;
    return e.b === 'v' ? s.voice : e.b === 's' ? s.sfx : e.b === 'm' ? s.music : e.i in SFX_SET ? s.sfx : s.music;
  }

  out(node, e, when, end) {
    const ctx = this.ctx;
    let last = node;
    if (e.p) {
      const p = ctx.createStereoPanner();
      p.pan.value = e.p;
      node.connect(p);
      last = p;
    }
    last.connect(this.bus(e));
    if (e.r) {
      const r = ctx.createGain();
      r.gain.value = e.r;
      last.connect(r);
      r.connect(this.sess.rev);
    }
    if (e.dl) {
      const r = ctx.createGain();
      r.gain.value = e.dl;
      last.connect(r);
      r.connect(this.sess.dly);
    }
  }

  osc(type, f, when, end) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    o.start(when);
    o.stop(end + 0.05);
    return o;
  }

  noise(when, end, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(when, Math.random() * 1.5);
    s.stop(end + 0.05);
    return s;
  }

  filt(type, f, q = 0.7) {
    const b = this.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  }

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  // Envelope ADSR com nota de duração d (offset para notas recomeçadas).
  adsr(g, when, d, peak, a = 0.01, dec = 0.1, sus = 0.7, rel = 0.2, off = 0) {
    const gp = g.gain;
    if (off > 0) {
      gp.setValueAtTime(0, when);
      gp.linearRampToValueAtTime(peak * sus, when + 0.05);
    } else {
      gp.setValueAtTime(0, when);
      gp.linearRampToValueAtTime(peak, when + a);
      gp.setTargetAtTime(peak * sus, when + a, dec / 3);
    }
    const endT = when + Math.max(0.02, d - off);
    gp.setTargetAtTime(0, endT, rel / 4);
    return endT + rel;
  }

  decay(g, when, peak, tau, a = 0.002) {
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.setTargetAtTime(0, when + a, tau);
    return when + a + tau * 6;
  }

  // ------------------------------------------------------------ bateria
  kick(w, e) {
    const v = e.v ?? 1;
    const o = this.osc('sine', 150, w, w + 0.5);
    o.frequency.exponentialRampToValueAtTime(42, w + 0.12);
    const g = this.gain();
    this.decay(g, w, v * 1.1, 0.09);
    o.connect(g);
    this.out(g, e, w);
    const n = this.noise(w, w + 0.03);
    const f = this.filt('highpass', 3000);
    const g2 = this.gain();
    this.decay(g2, w, v * 0.25, 0.006);
    n.connect(f).connect(g2);
    this.out(g2, e, w);
  }

  snare(w, e) {
    const v = e.v ?? 1;
    const n = this.noise(w, w + 0.4);
    const f = this.filt('bandpass', 1900, 0.8);
    const g = this.gain();
    this.decay(g, w, v * 0.75, 0.06);
    n.connect(f).connect(g);
    this.out(g, { ...e, r: e.r ?? 0.15 }, w);
    const o = this.osc('triangle', 190, w, w + 0.2);
    o.frequency.exponentialRampToValueAtTime(140, w + 0.08);
    const g2 = this.gain();
    this.decay(g2, w, v * 0.5, 0.035);
    o.connect(g2);
    this.out(g2, e, w);
  }

  hat(w, e) {
    const v = e.v ?? 1;
    const open = e.n === 1;
    const n = this.noise(w, w + (open ? 0.5 : 0.1));
    const f = this.filt('highpass', 7500);
    const g = this.gain();
    this.decay(g, w, v * 0.22, open ? 0.09 : 0.018);
    n.connect(f).connect(g);
    this.out(g, e, w);
  }

  crash(w, e) {
    const v = e.v ?? 1;
    const n = this.noise(w, w + 3);
    const f = this.filt('highpass', 3800);
    const g = this.gain();
    this.decay(g, w, v * 0.42, 0.55);
    n.connect(f).connect(g);
    this.out(g, { ...e, r: 0.25 }, w);
  }

  tom(w, e) {
    const v = e.v ?? 1;
    const f0 = mtof(e.n ?? 45);
    const o = this.osc('sine', f0 * 1.4, w, w + 0.8);
    o.frequency.exponentialRampToValueAtTime(f0, w + 0.06);
    const g = this.gain();
    this.decay(g, w, v * 0.8, 0.12);
    o.connect(g);
    this.out(g, { ...e, r: 0.12 }, w);
  }

  taiko(w, e) {
    const v = e.v ?? 1;
    const f0 = mtof(e.n ?? 36);
    const o = this.osc('sine', f0 * 1.6, w, w + 1.6);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.85, w + 0.25);
    const g = this.gain();
    this.decay(g, w, v * 1.2, 0.25);
    o.connect(g);
    this.out(g, { ...e, r: 0.5 }, w);
    const n = this.noise(w, w + 0.3);
    const f = this.filt('lowpass', 500);
    const g2 = this.gain();
    this.decay(g2, w, v * 0.6, 0.04);
    n.connect(f).connect(g2);
    this.out(g2, { ...e, r: 0.4 }, w);
  }

  // ------------------------------------------------------------ instrumentos
  bass(w, e, off) {
    const v = e.v ?? 0.8;
    const f = mtof(e.n);
    const end = w + e.d - off + 0.2;
    const o1 = this.osc('sawtooth', f, w, end);
    const o2 = this.osc('square', f / 2, w, end);
    const lp = this.filt('lowpass', 900, 2);
    lp.frequency.setValueAtTime(e.mute ? 500 : 1400, w);
    lp.frequency.setTargetAtTime(380, w, 0.08);
    const g = this.gain();
    const g2 = this.gain(0.5);
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g);
    this.adsr(g, w, e.d, v * 0.5, 0.004, 0.12, e.mute ? 0.2 : 0.75, 0.05, off);
    this.out(g, e, w);
  }

  // Guitarra distorcida: acorde de quinta (power chord).
  gtr(w, e, off) {
    const v = e.v ?? 0.7;
    const end = w + e.d - off + 0.25;
    const sum = this.gain(0.32);
    const notes = e.c || [e.n, e.n + 7, e.n + 12];
    for (const n of notes)
      for (const det of [-7, 8]) {
        const o = this.osc('sawtooth', mtof(n), w, end);
        o.detune.value = det;
        o.connect(sum);
      }
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.distCurve;
    ws.oversample = '2x';
    const hp = this.filt('highpass', 90);
    const lp = this.filt('lowpass', e.mute ? 1100 : 3400, 0.9);
    const g = this.gain();
    sum.connect(ws).connect(hp).connect(lp).connect(g);
    if (e.mute) this.decay(g, w, v * 0.35, 0.05);
    else this.adsr(g, w, e.d, v * 0.3, 0.005, 0.3, 0.75, 0.12, off);
    this.out(g, e, w);
  }

  lead(w, e, off) {
    const v = e.v ?? 0.6;
    const f = mtof(e.n);
    const end = w + e.d - off + 0.3;
    const o1 = this.osc('sawtooth', f, w, end);
    const o2 = this.osc('square', f * 1.002, w, end);
    const lfo = this.osc('sine', 5.6, w, end);
    const lg = this.gain(0);
    lg.gain.setValueAtTime(0, w);
    lg.gain.linearRampToValueAtTime(f * 0.012, w + 0.35);
    lfo.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);
    const mix = this.gain(0.5);
    o1.connect(mix);
    o2.connect(mix);
    const ws = this.ctx.createWaveShaper();
    ws.curve = this.distCurve;
    const pre = this.gain(e.dist ? 0.5 : 0.08);
    const lp = this.filt('lowpass', e.dist ? 3800 : 3000, 1);
    const g = this.gain();
    mix.connect(pre).connect(ws).connect(lp).connect(g);
    this.adsr(g, w, e.d, v * (e.dist ? 0.18 : 0.3), 0.01, 0.2, 0.8, 0.15, off);
    this.out(g, { ...e, r: e.r ?? 0.2, dl: e.dl ?? 0.25 }, w);
  }

  pad(w, e, off) {
    const v = e.v ?? 0.4;
    const end = w + e.d - off + 1.2;
    const lp = this.filt('lowpass', e.cut ?? 1500, 0.5);
    const g = this.gain();
    for (const n of e.c || [e.n])
      for (const det of [-10, 10]) {
        const o = this.osc(e.wave || 'sawtooth', mtof(n), w, end);
        o.detune.value = det;
        o.connect(lp);
      }
    lp.connect(g);
    this.adsr(g, w, e.d, (v * 0.12) / Math.sqrt((e.c || [1]).length), e.a ?? 0.5, 0.5, 0.85, 0.9, off);
    this.out(g, { ...e, r: e.r ?? 0.35 }, w);
  }

  str(w, e, off) {
    const v = e.v ?? 0.5;
    const f = mtof(e.n);
    const end = w + e.d - off + 0.8;
    const lp = this.filt('lowpass', 2600, 0.6);
    const lfo = this.osc('sine', 5.2, w, end);
    const lg = this.gain(f * 0.006);
    lfo.connect(lg);
    for (const det of [-6, 6]) {
      const o = this.osc('sawtooth', f, w, end);
      o.detune.value = det;
      lg.connect(o.frequency);
      o.connect(lp);
    }
    const g = this.gain();
    lp.connect(g);
    this.adsr(g, w, e.d, v * 0.13, e.a ?? 0.2, 0.3, 0.9, 0.6, off);
    this.out(g, { ...e, r: e.r ?? 0.4 }, w);
  }

  piano(w, e, off) {
    if (off > 0) return;
    const v = e.v ?? 0.6;
    const f = mtof(e.n);
    const tau = Math.max(0.25, 1.4 - (e.n - 48) * 0.025);
    const end = w + Math.min(e.d + 0.4, tau * 5);
    const lp = this.filt('lowpass', 1800 + v * 3000, 0.5);
    const g = this.gain();
    for (const [mul, amp, type] of [
      [1, 1, 'sine'],
      [2, 0.28, 'triangle'],
      [3, 0.1, 'sine'],
      [4.01, 0.05, 'sine'],
    ]) {
      const o = this.osc(type, f * mul, w, end);
      const og = this.gain(amp);
      o.connect(og).connect(lp);
    }
    lp.connect(g);
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime(v * 0.28, w + 0.004);
    g.gain.setTargetAtTime(v * 0.12, w + 0.004, tau * 0.25);
    g.gain.setTargetAtTime(0, w + e.d, 0.12);
    this.out(g, { ...e, r: e.r ?? 0.3 }, w);
  }

  pluck(w, e) {
    const v = e.v ?? 0.6;
    const f = mtof(e.n);
    const o = this.osc('sawtooth', f, w, w + 1);
    const o2 = this.osc('triangle', f * 2, w, w + 1);
    const lp = this.filt('lowpass', 3500, 2);
    lp.frequency.setValueAtTime(4000, w);
    lp.frequency.setTargetAtTime(500, w, 0.06);
    const g = this.gain();
    this.decay(g, w, v * 0.25, 0.18);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    this.out(g, { ...e, r: e.r ?? 0.2 }, w);
  }

  bell(w, e) {
    const v = e.v ?? 0.5;
    const f = mtof(e.n);
    const tau = e.long ? 0.9 : 0.35;
    for (const [mul, amp, tt] of [
      [1, 1, 1],
      [2.76, 0.35, 0.5],
      [5.4, 0.12, 0.3],
      [2.0, 0.2, 0.8],
    ]) {
      const o = this.osc('sine', f * mul, w, w + tau * 7);
      const g = this.gain();
      this.decay(g, w, v * 0.2 * amp, tau * tt);
      o.connect(g);
      this.out(g, { ...e, r: e.r ?? 0.35 }, w);
    }
  }

  choir(w, e, off) {
    const v = e.v ?? 0.5;
    const end = w + e.d - off + 1.5;
    const sum = this.gain(1);
    for (const n of e.c || [e.n]) {
      const f = mtof(n);
      const lfo = this.osc('sine', 4.8 + Math.random(), w, end);
      const lg = this.gain(f * 0.008);
      lfo.connect(lg);
      for (const det of [-8, 9]) {
        const o = this.osc('sawtooth', f, w, end);
        o.detune.value = det;
        lg.connect(o.frequency);
        o.connect(sum);
      }
    }
    const g = this.gain();
    for (const [ff, q, a] of [
      [700, 5, 1],
      [1150, 6, 0.6],
      [2700, 8, 0.25],
    ]) {
      const bp = this.filt('bandpass', ff, q);
      const bg = this.gain(a);
      sum.connect(bp).connect(bg).connect(g);
    }
    const out = this.gain();
    g.connect(out);
    this.adsr(out, w, e.d, v * 0.5, 0.45, 0.4, 0.9, 1.2, off);
    this.out(out, { ...e, r: 0.6 }, w);
  }

  brass(w, e) {
    const v = e.v ?? 0.8;
    const end = w + e.d + 0.6;
    const lp = this.filt('lowpass', 300, 1.5);
    lp.frequency.setValueAtTime(300, w);
    lp.frequency.linearRampToValueAtTime(3200, w + 0.06);
    lp.frequency.setTargetAtTime(1200, w + 0.08, 0.3);
    for (const n of e.c || [e.n])
      for (const det of [-9, 0, 9]) {
        const o = this.osc('sawtooth', mtof(n), w, end);
        o.detune.value = det;
        o.connect(lp);
      }
    const g = this.gain();
    lp.connect(g);
    this.adsr(g, w, e.d, v * 0.16, 0.03, 0.4, 0.6, 0.5, 0);
    this.out(g, { ...e, r: 0.45 }, w);
  }

  // ------------------------------------------------------------ efeitos
  boom(w, e) {
    const v = e.v ?? 1;
    const o = this.osc('sine', 80, w, w + 3);
    o.frequency.exponentialRampToValueAtTime(26, w + 1.6);
    const g = this.gain();
    this.decay(g, w, v * 1.0, 0.6);
    o.connect(g);
    this.out(g, { ...e, r: 0.3 }, w);
    const n = this.noise(w, w + 1.5);
    const f = this.filt('lowpass', 300);
    const g2 = this.gain();
    this.decay(g2, w, v * 0.7, 0.2);
    n.connect(f).connect(g2);
    this.out(g2, { ...e, r: 0.5 }, w);
  }

  riser(w, e) {
    const v = e.v ?? 0.6;
    const end = w + e.d;
    const n = this.noise(w, end);
    const f = this.filt('bandpass', 300, 2.5);
    f.frequency.setValueAtTime(300, w);
    f.frequency.exponentialRampToValueAtTime(7000, end);
    const g = this.gain();
    g.gain.setValueAtTime(0.0001, w);
    g.gain.exponentialRampToValueAtTime(v * 0.6, end);
    g.gain.linearRampToValueAtTime(0, end + 0.05);
    n.connect(f).connect(g);
    this.out(g, { ...e, r: 0.3 }, w);
  }

  whoosh(w, e) {
    const v = e.v ?? 0.6;
    const d = e.d ?? 0.35;
    const n = this.noise(w, w + d + 0.1);
    const f = this.filt('bandpass', 500, 1.4);
    f.frequency.setValueAtTime(e.lo ?? 400, w);
    f.frequency.exponentialRampToValueAtTime(e.hi ?? 2600, w + d * 0.5);
    f.frequency.exponentialRampToValueAtTime(e.lo ?? 500, w + d);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime(v * 0.8, w + d * 0.45);
    g.gain.linearRampToValueAtTime(0, w + d);
    n.connect(f).connect(g);
    this.out(g, e, w);
  }

  punch(w, e) {
    const v = e.v ?? 1;
    const big = !!e.big;
    const o = this.osc('sine', big ? 140 : 120, w, w + 0.6);
    o.frequency.exponentialRampToValueAtTime(40, w + 0.18);
    const g = this.gain();
    this.decay(g, w, v * (big ? 1.2 : 0.9), big ? 0.12 : 0.07);
    o.connect(g);
    this.out(g, { ...e, r: big ? 0.35 : 0.1 }, w);
    const n = this.noise(w, w + 0.2);
    const f = this.filt('lowpass', big ? 2500 : 3500);
    const g2 = this.gain();
    this.decay(g2, w, v * 0.9, big ? 0.05 : 0.025);
    n.connect(f).connect(g2);
    this.out(g2, { ...e, r: big ? 0.3 : 0.05 }, w);
    const n2 = this.noise(w, w + 0.05);
    const f2 = this.filt('highpass', 2500);
    const g3 = this.gain();
    this.decay(g3, w, v * 0.5, 0.008);
    n2.connect(f2).connect(g3);
    this.out(g3, e, w);
    if (big) this.boom(w, { ...e, v: v * 0.6 });
  }

  clang(w, e) {
    const v = e.v ?? 0.8;
    for (const [fr, tau] of [
      [523, 1.1],
      [1311, 0.7],
      [2087, 0.5],
      [2960, 0.35],
      [3870, 0.25],
    ]) {
      const o = this.osc('sine', fr * (e.k ?? 1), w, w + tau * 6);
      const g = this.gain();
      this.decay(g, w, v * 0.12, tau * 0.5);
      o.connect(g);
      this.out(g, { ...e, r: 0.35 }, w);
    }
    this.punch(w, { ...e, v: v * 0.5 });
  }

  chain(w, e) {
    for (let i = 0; i < 9; i++) {
      const t = w + Math.random() * (e.d ?? 0.4);
      const n = this.noise(t, t + 0.05);
      const f = this.filt('bandpass', 3000 + Math.random() * 3000, 3);
      const g = this.gain();
      this.decay(g, t, (e.v ?? 0.6) * 0.5, 0.012);
      n.connect(f).connect(g);
      this.out(g, e, t);
    }
  }

  step(w, e) {
    const v = e.v ?? 0.5;
    const sf = e.n || 'hard';
    const n = this.noise(w, w + 0.15);
    const f = this.filt(sf === 'gravel' ? 'bandpass' : 'lowpass', sf === 'gravel' ? 2400 : sf === 'wet' ? 2800 : 900, sf === 'gravel' ? 0.8 : 0.7);
    const g = this.gain();
    this.decay(g, w, v * (sf === 'gravel' ? 0.5 : 0.6), sf === 'gravel' ? 0.04 : 0.025);
    n.connect(f).connect(g);
    this.out(g, { ...e, r: e.r ?? 0.08 }, w);
    const o = this.osc('sine', sf === 'heavy' ? 70 : 95, w, w + 0.2);
    o.frequency.exponentialRampToValueAtTime(45, w + 0.08);
    const g2 = this.gain();
    this.decay(g2, w, v * (sf === 'heavy' ? 1.1 : 0.4), sf === 'heavy' ? 0.09 : 0.03);
    o.connect(g2);
    this.out(g2, { ...e, r: sf === 'heavy' ? 0.4 : e.r ?? 0.05 }, w);
  }

  heart(w, e) {
    const v = e.v ?? 0.8;
    for (const [dt, a] of [
      [0, 1],
      [0.26, 0.7],
    ]) {
      const o = this.osc('sine', 62, w + dt, w + dt + 0.4);
      o.frequency.exponentialRampToValueAtTime(38, w + dt + 0.12);
      const g = this.gain();
      this.decay(g, w + dt, v * a, 0.06);
      o.connect(g);
      this.out(g, e, w);
    }
  }

  crowd(w, e, off) {
    const v = e.v ?? 0.3;
    const end = w + e.d - off;
    for (let k = 0; k < 3; k++) {
      const n = this.noise(w, end + 0.6, 0.9 + k * 0.1);
      const f = this.filt('bandpass', 500 + k * 350, 1.2);
      const am = this.gain(0);
      const lfo = this.osc('sine', 3 + k * 1.7 + Math.random(), w, end + 0.6);
      const lg = this.gain(0.5);
      lfo.connect(lg).connect(am.gain);
      const g = this.gain();
      n.connect(f).connect(am).connect(g);
      this.adsr(g, w, e.d, v * 0.5, 0.6, 0.2, 1, 0.6, off);
      this.out(g, { ...e, p: (k - 1) * 0.5 }, w);
    }
  }

  birds(w, e) {
    const v = e.v ?? 0.25;
    const n = e.n || 4;
    let t = w;
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = this.osc('sine', base, t, t + 0.12);
      o.frequency.linearRampToValueAtTime(base * 1.35, t + 0.04);
      o.frequency.linearRampToValueAtTime(base * 1.05, t + 0.09);
      const g = this.gain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.3, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + 0.09);
      o.connect(g);
      this.out(g, { ...e, r: 0.3 }, t);
      t += 0.1 + Math.random() * 0.12;
    }
  }

  crow(w, e) {
    for (let i = 0; i < (e.n || 2); i++) {
      const t = w + i * 0.45;
      const o = this.osc('sawtooth', 620, t, t + 0.35);
      o.frequency.linearRampToValueAtTime(420, t + 0.3);
      const f = this.filt('bandpass', 1300, 4);
      const g = this.gain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime((e.v ?? 0.3) * 0.5, t + 0.03);
      g.gain.linearRampToValueAtTime(0, t + 0.32);
      o.connect(f).connect(g);
      this.out(g, { ...e, r: 0.5 }, t);
    }
  }

  wind(w, e, off) {
    const v = e.v ?? 0.3;
    const end = w + e.d - off;
    const n = this.noise(w, end + 1, 0.5);
    const f = this.filt('lowpass', 500, 1.5);
    const lfo = this.osc('sine', 0.23, w, end + 1);
    const lg = this.gain(300);
    lfo.connect(lg).connect(f.frequency);
    const g = this.gain();
    n.connect(f).connect(g);
    this.adsr(g, w, e.d, v * 0.6, 1, 0.5, 1, 1, off);
    this.out(g, e, w);
  }

  rain(w, e, off) {
    const v = e.v ?? 0.3;
    const end = w + e.d - off;
    const n = this.noise(w, end + 1);
    const f = this.filt('highpass', 2200);
    const g = this.gain();
    n.connect(f).connect(g);
    this.adsr(g, w, e.d, v * 0.25, 1, 0.5, 1, 1, off);
    this.out(g, e, w);
  }

  drip(w, e) {
    const o = this.osc('sine', 1500, w, w + 0.12);
    o.frequency.exponentialRampToValueAtTime(700, w + 0.06);
    const g = this.gain();
    this.decay(g, w, (e.v ?? 0.3) * 0.4, 0.02);
    o.connect(g);
    this.out(g, { ...e, r: 0.6 }, w);
  }

  meow(w, e) {
    const o = this.osc('sawtooth', 500, w, w + 0.8);
    o.frequency.linearRampToValueAtTime(800, w + 0.15);
    o.frequency.linearRampToValueAtTime(460, w + 0.6);
    const f = this.filt('bandpass', 1000, 3);
    f.frequency.linearRampToValueAtTime(1700, w + 0.2);
    f.frequency.linearRampToValueAtTime(900, w + 0.6);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.5) * 0.6, w + 0.06);
    g.gain.linearRampToValueAtTime(0, w + 0.62);
    o.connect(f).connect(g);
    this.out(g, { ...e, r: 0.3 }, w);
  }

  // Sino da escola (carrilhão de Westminster).
  chime(w, e) {
    const seq = [64, 60, 62, 55, 55, 62, 64, 60];
    seq.forEach((n, i) => this.bell(w + i * 0.75, { ...e, n: n + 12, v: e.v ?? 0.5, long: true, r: 0.5 }));
  }

  growl(w, e) {
    const d = e.d ?? 1.4;
    const o = this.osc('sawtooth', 62, w, w + d + 0.2);
    const lfo = this.osc('sine', 6, w, w + d + 0.2);
    const lg = this.gain(18);
    lfo.connect(lg).connect(o.frequency);
    const lp = this.filt('lowpass', 260, 4);
    const am = this.gain(0.5);
    const lfo2 = this.osc('square', 17, w, w + d + 0.2);
    const lg2 = this.gain(0.5);
    lfo2.connect(lg2).connect(am.gain);
    const g = this.gain();
    o.connect(lp).connect(am).connect(g);
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.8) * 0.9, w + 0.1);
    g.gain.setValueAtTime((e.v ?? 0.8) * 0.9, w + d * 0.6);
    g.gain.linearRampToValueAtTime(0, w + d);
    this.out(g, e, w);
  }

  pop(w, e) {
    const o = this.osc('sine', 380, w, w + 0.2);
    o.frequency.exponentialRampToValueAtTime(1300, w + 0.06);
    const g = this.gain();
    this.decay(g, w, (e.v ?? 0.5) * 0.5, 0.04);
    o.connect(g);
    this.out(g, e, w);
  }

  boing(w, e) {
    const o = this.osc('sine', 180, w, w + 0.7);
    o.frequency.linearRampToValueAtTime(e.down ? 120 : 320, w + 0.5);
    const lfo = this.osc('sine', 13, w, w + 0.7);
    const lg = this.gain(35);
    lfo.connect(lg).connect(o.frequency);
    const g = this.gain();
    this.decay(g, w, (e.v ?? 0.5) * 0.5, 0.18);
    o.connect(g);
    this.out(g, e, w);
  }

  slide(w, e) {
    const d = e.d ?? 0.5;
    const o = this.osc('sine', e.down ? 1500 : 500, w, w + d);
    o.frequency.exponentialRampToValueAtTime(e.down ? 400 : 1600, w + d);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.4) * 0.4, w + 0.03);
    g.gain.linearRampToValueAtTime(0, w + d);
    o.connect(g);
    this.out(g, e, w);
  }

  door(w, e) {
    const d = e.d ?? 0.45;
    const n = this.noise(w, w + d + 0.2);
    const f = this.filt('bandpass', 700, 1.2);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.5) * 0.5, w + 0.05);
    g.gain.linearRampToValueAtTime(0, w + d);
    n.connect(f).connect(g);
    this.out(g, { ...e, r: 0.2 }, w);
    this.step(w + d, { ...e, n: 'hard', v: (e.v ?? 0.5) * 1.2 });
  }

  creak(w, e) {
    const d = e.d ?? 0.9;
    const o = this.osc('sawtooth', 160, w, w + d);
    o.frequency.linearRampToValueAtTime(240, w + d);
    const lfo = this.osc('square', 23, w, w + d);
    const lg = this.gain(30);
    lfo.connect(lg).connect(o.frequency);
    const f = this.filt('bandpass', 900, 6);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.4) * 0.35, w + 0.1);
    g.gain.linearRampToValueAtTime(0, w + d);
    o.connect(f).connect(g);
    this.out(g, { ...e, r: 0.4 }, w);
  }

  knuckle(w, e) {
    for (let i = 0; i < 4; i++) {
      const t = w + i * 0.11 + Math.random() * 0.03;
      const n = this.noise(t, t + 0.04);
      const f = this.filt('bandpass', 2000 + Math.random() * 1500, 2);
      const g = this.gain();
      this.decay(g, t, (e.v ?? 0.6) * 0.9, 0.006);
      n.connect(f).connect(g);
      this.out(g, e, t);
    }
  }

  thud(w, e) {
    const v = e.v ?? 0.8;
    const o = this.osc('sine', 75, w, w + 0.5);
    o.frequency.exponentialRampToValueAtTime(35, w + 0.25);
    const g = this.gain();
    this.decay(g, w, v, 0.1);
    o.connect(g);
    this.out(g, { ...e, r: 0.2 }, w);
    const n = this.noise(w, w + 0.3);
    const f = this.filt('lowpass', 600);
    const g2 = this.gain();
    this.decay(g2, w, v * 0.6, 0.05);
    n.connect(f).connect(g2);
    this.out(g2, e, w);
  }

  crashMetal(w, e) {
    // latas de lixo caindo
    for (let i = 0; i < 4; i++) this.clang(w + i * 0.09 + Math.random() * 0.04, { ...e, v: (e.v ?? 0.8) * (1 - i * 0.18), k: 0.5 + Math.random() * 0.3 });
    this.thud(w, e);
  }

  splash(w, e) {
    const v = e.v ?? 0.8;
    const n = this.noise(w, w + 1.2);
    const f = this.filt('lowpass', 5000);
    f.frequency.setValueAtTime(5000, w);
    f.frequency.exponentialRampToValueAtTime(500, w + 0.8);
    const g = this.gain();
    this.decay(g, w, v * 0.8, 0.18);
    n.connect(f).connect(g);
    this.out(g, { ...e, r: 0.3 }, w);
    for (let i = 0; i < 6; i++) this.drip(w + 0.2 + Math.random() * 0.6, { ...e, v: 0.3 });
  }

  hiss(w, e, off) {
    const end = w + e.d - off;
    const n = this.noise(w, end + 0.3);
    const f = this.filt('highpass', 4000);
    const g = this.gain();
    n.connect(f).connect(g);
    this.adsr(g, w, e.d, (e.v ?? 0.3) * 0.2, 0.2, 0.2, 1, 0.3, off);
    this.out(g, e, w);
  }

  buzz(w, e, off) {
    const end = w + e.d - off;
    const o = this.osc('sawtooth', 118, w, end + 0.2);
    const f = this.filt('lowpass', 500);
    const g = this.gain();
    o.connect(f).connect(g);
    this.adsr(g, w, e.d, (e.v ?? 0.3) * 0.05, 0.3, 0.2, 1, 0.3, off);
    this.out(g, e, w);
  }

  gulp(w, e) {
    const o = this.osc('sine', 320, w, w + 0.2);
    o.frequency.exponentialRampToValueAtTime(140, w + 0.1);
    const g = this.gain();
    this.decay(g, w, (e.v ?? 0.5) * 0.6, 0.04);
    o.connect(g);
    this.out(g, e, w);
  }

  chalk(w, e) {
    for (let i = 0; i < 6; i++) {
      const t = w + i * 0.13 + Math.random() * 0.04;
      const n = this.noise(t, t + 0.06);
      const f = this.filt('bandpass', 3500, 3);
      const g = this.gain();
      this.decay(g, t, (e.v ?? 0.3) * 0.3, 0.015);
      n.connect(f).connect(g);
      this.out(g, e, t);
    }
  }

  scratch(w, e) {
    const n = this.noise(w, w + 0.5);
    const f = this.filt('bandpass', 800, 4);
    f.frequency.setValueAtTime(400, w);
    f.frequency.exponentialRampToValueAtTime(3000, w + 0.15);
    f.frequency.exponentialRampToValueAtTime(300, w + 0.35);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.6) * 0.8, w + 0.02);
    g.gain.linearRampToValueAtTime(0, w + 0.38);
    n.connect(f).connect(g);
    this.out(g, e, w);
  }

  // Cortina de silêncio dramático: um tom agudo de "zumbido no ouvido".
  ring(w, e, off) {
    const end = w + e.d - off;
    const o = this.osc('sine', 3200, w, end + 0.5);
    const g = this.gain();
    this.adsr(g, w, e.d, (e.v ?? 0.3) * 0.06, 0.05, 0.3, 0.6, 0.4, off);
    o.connect(g);
    this.out(g, e, w);
  }

  // Bipe de voz (estilo "fala de jogo") — tom por personagem.
  blip(w, e) {
    const f = mtof(e.n);
    const o = this.osc(e.wave || 'square', f, w, w + 0.09);
    o.frequency.linearRampToValueAtTime(f * (e.up ? 1.06 : 0.94), w + 0.06);
    const lp = this.filt('lowpass', Math.min(5000, f * 5), 1);
    const g = this.gain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime((e.v ?? 0.4) * 0.22, w + 0.006);
    g.gain.linearRampToValueAtTime(0, w + 0.06);
    o.connect(lp).connect(g);
    this.out(g, { ...e, b: 'v' }, w);
  }
}

// Instrumentos que vão para o canal de efeitos (o resto é música).
const SFX_SET = {
  boom: 1,
  riser: 1,
  whoosh: 1,
  punch: 1,
  clang: 1,
  chain: 1,
  step: 1,
  heart: 1,
  crowd: 1,
  birds: 1,
  crow: 1,
  wind: 1,
  rain: 1,
  drip: 1,
  meow: 1,
  chime: 1,
  growl: 1,
  pop: 1,
  boing: 1,
  slide: 1,
  door: 1,
  creak: 1,
  knuckle: 1,
  thud: 1,
  crashMetal: 1,
  splash: 1,
  hiss: 1,
  buzz: 1,
  gulp: 1,
  chalk: 1,
  scratch: 1,
  ring: 1,
};
