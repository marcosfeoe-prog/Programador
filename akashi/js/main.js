// AKASHI — Episódio 1: animação 3D estilo anime feita em código.
// Monta renderizador, palco, elenco, efeitos e áudio; o "player" controla o
// relógio do episódio (9:50) e cada quadro é desenhado a partir do tempo.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { makeCast, makeStudents } from './character.js';
import { FX } from './fx.js';
import { Post } from './post.js';
import { Overlay, VW, VH } from './overlay.js';
import { Director, SPEAKERS } from './director.js';
import { AudioEngine } from './audio.js';
import { buildMusic } from './music.js';
import { EPISODE, DURATION, CHAPTERS } from './episode.js';
import { isMobileDevice, fmtTime, clamp } from './util.js';
import { OUTLINE } from './toon.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mobile = isMobileDevice();

const QUALITY = {
  low: { name: 'Baixa', pr: 0.75, shadows: false, shadowSize: 1024, bloom: false, msaa: false, crowdOutline: 0, petals: 220 },
  medium: { name: 'Média', pr: 1, shadows: true, shadowSize: 1024, bloom: true, msaa: true, crowdOutline: 1, petals: 380 },
  high: { name: 'Alta', pr: 1.5, shadows: true, shadowSize: 2048, bloom: true, msaa: true, crowdOutline: 1, petals: 600 },
};

const SETTINGS_KEY = 'akashi-ep1';
function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento */
  }
}

const settings = { quality: mobile ? 'low' : 'medium', subs: true, voice: 'blips', volume: 0.9, twos: true, ...loadSettings() };
if (params.get('q') && QUALITY[params.get('q')]) settings.quality = params.get('q');
const Q = QUALITY[settings.quality];

// ------------------------------------------------------------ renderizador
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = true;
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 1500);
const post = new Post(renderer, Q);
const ov = new Overlay($('ov'));

let W = 0;
let H = 0;
function resize() {
  const box = $('screen');
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  let w = ww;
  let h = Math.round((ww * 9) / 16);
  if (h > wh) {
    h = wh;
    w = Math.round((wh * 16) / 9);
  }
  box.style.width = w + 'px';
  box.style.height = h + 'px';
  const pr = Math.min(window.devicePixelRatio || 1, Q.pr);
  W = Math.max(320, Math.round(w * pr));
  H = Math.max(180, Math.round(h * pr));
  if (params.has('shot')) {
    W = +params.get('w') || 1280;
    H = Math.round((W * 9) / 16);
  }
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  post.setSize(W, H);
  ov.resize(W, H);
  camera.aspect = 16 / 9;
  camera.updateProjectionMatrix();
  OUTLINE.uOutline.value = 0.0026 * (1080 / Math.max(540, H)) * 0.9 + 0.0006;
}

// ------------------------------------------------------------ montagem
const stage = new Stage(Q);
const cast = makeCast();
const students = makeStudents(26, Q.crowdOutline);
const fx = new FX(stage.scene, Q);
fx.petalBudget = Q.petals;
const director = new Director({ stage, cast, students, fx, ov, post, camera });
director.load(EPISODE);
const audio = new AudioEngine();
audio.vol.master = settings.volume;
audio.voiceMode = settings.voice;

function audioEvents() {
  const ev = [...buildMusic(), ...director.sfx];
  if (settings.voice === 'blips') ev.push(...director.voiceEvents());
  return ev;
}

// ------------------------------------------------------------ relógio
// O relógio segue o áudio quando ele está tocando de verdade (sincronia
// labial e música); se o áudio travar ou não existir, segue o relógio do
// sistema e o áudio é reiniciado no ponto certo.
const clock = { playing: false, t: 0, base: 0, resync: 0 };
function now() {
  if (!clock.playing) return clock.t;
  const pn = performance.now();
  const perfT = clock.t + (pn - clock.base) / 1000;
  if (audio.ok && audio.sess && audio.ctx.state === 'running' && audio.ctx.currentTime > audio.a0) {
    const at = audio.time();
    const diff = at - perfT;
    if (Math.abs(diff) < 0.35) {
      // puxa o relógio do sistema devagar na direção do áudio (sem travar junto)
      clock.t += diff * 0.02;
      return at;
    }
    if (pn - clock.resync > 2000) {
      clock.resync = pn;
      audio.play(perfT);
    }
  }
  return perfT;
}
async function play() {
  if (clock.playing) return;
  if (clock.t >= DURATION - 0.05) clock.t = 0;
  clock.playing = true;
  clock.base = performance.now();
  clock.resync = performance.now();
  audio.init();
  if (audio.ok) {
    if (!audio.events.length || audio.voiceKey !== settings.voice) {
      audio.setEvents(audioEvents());
      audio.voiceKey = settings.voice;
    }
    await audio.play(now());
  }
  lastLineT = clock.t;
  updateUI(true);
}
function pause() {
  if (!clock.playing) return;
  clock.t = now();
  clock.playing = false;
  audio.pause();
  speech.cancel();
  updateUI(true);
}
function seek(t) {
  const was = clock.playing;
  if (was) pause();
  clock.t = clamp(t, 0, DURATION);
  lastLineT = clock.t;
  if (was) play();
  else renderFrame(clock.t);
  updateUI(true);
}

// ------------------------------------------------------------ voz sintetizada (opcional)
const speech = {
  voice: null,
  ready: false,
  init() {
    if (!('speechSynthesis' in window)) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /pt[-_]BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null;
      this.ready = true;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  },
  say(l) {
    if (!('speechSynthesis' in window) || l.thought && l.who !== 'akashi' && l.who !== 'hana' && l.who !== 'kenta') return;
    const sp = SPEAKERS[l.who] || {};
    const u = new SpeechSynthesisUtterance(l.text.replace(/\.\.\./g, '…'));
    if (this.voice) u.voice = this.voice;
    u.lang = 'pt-BR';
    const pitch = { akashi: 0.55, hana: 1.6, kenta: 1.15, tanaka: 0.9, ryuji: 0.75, goro: 0.45, shin: 1.3, yuuto: 1.45, kidakashi: 1.6, kid: 1.4 }[l.who] ?? 1;
    u.pitch = pitch;
    u.rate = clamp(l.text.length / (l.dur * 13), 0.95, 1.6);
    u.volume = l.thought ? 0.6 : 1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  },
  cancel() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
};
speech.init();
let lastLineT = 0;
function speakLines(t) {
  if (settings.voice !== 'tts' || !clock.playing) {
    lastLineT = t;
    return;
  }
  for (const l of director.lines) if (l.t > lastLineT && l.t <= t) speech.say(l);
  lastLineT = t;
}

// ------------------------------------------------------------ desenho
let lastShot = null;
function renderFrame(t) {
  const shot = director.frame(t, settings.twos);
  const lift = !recorder.on && !params.has('shot') && !document.body.classList.contains('idle') ? 1 : 0;
  if (settings.subs) ov.subtitle(director.sub, director.lb, lift);
  post.render(stage.scene, camera, t);
  if (recorder.on) recorder.composite();
  lastShot = shot;
}

// ------------------------------------------------------------ gravação (WebM)
const recorder = {
  on: false,
  start() {
    const comp = (this.canvas = document.createElement('canvas'));
    comp.width = W;
    comp.height = H;
    this.g = comp.getContext('2d');
    const stream = comp.captureStream(30);
    if (audio.ok) for (const tr of audio.recDest.stream.getAudioTracks()) stream.addTrack(tr);
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    const type = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!type) {
      alert('Este navegador não suporta gravação de vídeo (MediaRecorder).');
      return false;
    }
    this.chunks = [];
    this.type = type;
    this.mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 10_000_000 });
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mr.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.type.split(';')[0] });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `akashi-episodio-1.${this.type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      $('rec-badge').classList.add('hidden');
    };
    this.mr.start(1000);
    this.on = true;
    $('rec-badge').classList.remove('hidden');
    return true;
  },
  composite() {
    const g = this.g;
    g.drawImage(canvas, 0, 0, W, H);
    g.drawImage(ov.c, 0, 0, W, H);
  },
  stop() {
    if (!this.on) return;
    this.on = false;
    this.mr.stop();
  },
};

// ------------------------------------------------------------ interface
const ui = {
  bar: $('controls'),
  seek: $('seek'),
  time: $('time'),
  playBtn: $('play'),
};

function chapterAt(t) {
  let c = CHAPTERS[0];
  for (const ch of CHAPTERS) if (t >= ch.t) c = ch;
  return c;
}

let uiT = -1;
function updateUI(force = false) {
  const t = now();
  if (!force && Math.abs(t - uiT) < 0.2) return;
  uiT = t;
  ui.time.textContent = `${fmtTime(t)} / ${fmtTime(DURATION)}`;
  if (!seeking) ui.seek.value = String((t / DURATION) * 1000);
  ui.playBtn.textContent = clock.playing ? '❚❚' : '▶';
  ui.playBtn.setAttribute('aria-label', clock.playing ? 'Pausar' : 'Reproduzir');
  $('chapter').textContent = chapterAt(t).name;
  $('seek-fill').style.width = `${(t / DURATION) * 100}%`;
}

let seeking = false;
function buildUI() {
  const ticks = $('ticks');
  for (const ch of CHAPTERS) {
    const d = document.createElement('div');
    d.className = 'tick';
    d.style.left = `${(ch.t / DURATION) * 100}%`;
    d.title = ch.name;
    ticks.appendChild(d);
    const li = document.createElement('button');
    li.className = 'chap';
    li.innerHTML = `<span>${fmtTime(ch.t)}</span>${ch.name}`;
    li.onclick = () => {
      seek(ch.t);
      $('chapters').classList.add('hidden');
      if (!clock.playing) play();
    };
    $('chap-list').appendChild(li);
  }
  ui.playBtn.onclick = () => (clock.playing ? pause() : play());
  ui.seek.oninput = () => {
    seeking = true;
    const t = (+ui.seek.value / 1000) * DURATION;
    ui.time.textContent = `${fmtTime(t)} / ${fmtTime(DURATION)}`;
    $('seek-fill').style.width = `${(t / DURATION) * 100}%`;
    if (!clock.playing) {
      clock.t = t;
      renderFrame(t);
    }
  };
  ui.seek.onchange = () => {
    seeking = false;
    seek((+ui.seek.value / 1000) * DURATION);
  };
  $('back').onclick = () => seek(now() - 10);
  $('fwd').onclick = () => seek(now() + 10);
  $('cc').onclick = () => {
    settings.subs = !settings.subs;
    saveSettings(settings);
    syncToggles();
  };
  $('fs').onclick = toggleFS;
  $('chap-btn').onclick = () => $('chapters').classList.toggle('hidden');
  $('chap-close').onclick = () => $('chapters').classList.add('hidden');
  $('vol').value = String(settings.volume * 100);
  $('vol').oninput = () => {
    settings.volume = +$('vol').value / 100;
    audio.setVolume('master', settings.volume);
    saveSettings(settings);
  };
  $('cfg-btn').onclick = () => $('settings').classList.toggle('hidden');
  $('cfg-close').onclick = () => $('settings').classList.add('hidden');
  for (const k of ['low', 'medium', 'high']) {
    const b = $('q-' + k);
    b.onclick = () => {
      settings.quality = k;
      saveSettings(settings);
      const u = new URL(location.href);
      u.searchParams.set('q', k);
      u.searchParams.set('t', String(Math.floor(now())));
      location.href = u.toString();
    };
  }
  for (const k of ['blips', 'tts', 'off']) {
    $('v-' + k).onclick = () => {
      settings.voice = k;
      saveSettings(settings);
      syncToggles();
      if (clock.playing) {
        pause();
        play();
      }
    };
  }
  $('twos').onclick = () => {
    settings.twos = !settings.twos;
    saveSettings(settings);
    syncToggles();
  };
  $('rec').onclick = async () => {
    $('settings').classList.add('hidden');
    if (recorder.on) return;
    pause();
    clock.t = 0;
    audio.init();
    if (recorder.start()) play();
  };
  $('replay').onclick = () => {
    $('end').classList.add('hidden');
    seek(0);
    play();
  };
  syncToggles();

  // esconder os controles quando parado o mouse
  let hideTimer = 0;
  const wake = () => {
    document.body.classList.remove('idle');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => clock.playing && document.body.classList.add('idle'), 2600);
  };
  let wasIdle = false;
  window.addEventListener('pointermove', wake);
  window.addEventListener(
    'pointerdown',
    () => {
      // o primeiro toque com os controles escondidos só os mostra
      wasIdle = document.body.classList.contains('idle');
      wake();
    },
    true,
  );
  $('screen').addEventListener('click', (e) => {
    if (wasIdle) return;
    if (e.target.closest('button, input, #controls, .panel, #start, #end')) return;
    if (!$('start').classList.contains('hidden')) return;
    clock.playing ? pause() : play();
  });
  window.addEventListener('keydown', (e) => {
    if ($('start').classList.contains('hidden') === false) return;
    if (e.code === 'Space' || e.key === 'k') {
      e.preventDefault();
      clock.playing ? pause() : play();
    } else if (e.key === 'ArrowRight') seek(now() + 5);
    else if (e.key === 'ArrowLeft') seek(now() - 5);
    else if (e.key === 'l') seek(now() + 10);
    else if (e.key === 'j') seek(now() - 10);
    else if (e.key === 'f') toggleFS();
    else if (e.key === 'c') $('cc').click();
    else if (e.key === 'm') {
      settings.volume = settings.volume > 0 ? 0 : 0.9;
      $('vol').value = String(settings.volume * 100);
      audio.setVolume('master', settings.volume);
    } else if (/^[0-9]$/.test(e.key)) seek((+e.key / 10) * DURATION);
    wake();
  });
}

function syncToggles() {
  $('cc').classList.toggle('on', settings.subs);
  for (const k of ['low', 'medium', 'high']) $('q-' + k).classList.toggle('on', settings.quality === k);
  for (const k of ['blips', 'tts', 'off']) $('v-' + k).classList.toggle('on', settings.voice === k);
  $('twos').classList.toggle('on', settings.twos);
  $('twos').textContent = settings.twos ? 'Ligado' : 'Desligado';
}

function toggleFS() {
  const el = document.documentElement;
  if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

// ------------------------------------------------------------ laço
let frames = 0;
let fpsT = performance.now();
function loop() {
  requestAnimationFrame(loop);
  let t = now();
  if (clock.playing && t >= DURATION) {
    t = DURATION;
    pause();
    clock.t = DURATION;
    recorder.stop();
    $('end').classList.remove('hidden');
  }
  speakLines(t);
  renderFrame(Math.min(t, DURATION - 0.001));
  updateUI();
  frames++;
  const n = performance.now();
  if (n - fpsT > 1000) {
    $('fps').textContent = `${frames} fps`;
    frames = 0;
    fpsT = n;
  }
}

// ------------------------------------------------------------ início
async function boot() {
  resize();
  window.addEventListener('resize', resize);
  buildUI();
  const bar = $('load-bar');
  await stage.prebuild((k, name) => {
    bar.style.width = `${Math.round(k * 100)}%`;
  });
  // compila os shaders desenhando alguns quadros de cenas diferentes
  for (const t of [1, 40, 120, 170, 230, 290, 350, 400, 470, 570]) {
    renderFrame(t);
    await new Promise((r) => setTimeout(r, 0));
  }
  clock.t = clamp(+(params.get('t') || 0), 0, DURATION);
  $('loading').classList.add('hidden');
  $('start-btn').disabled = false;

  if (params.has('shot')) {
    // modo de captura: desenha o instante pedido e avisa
    Object.assign(window.__ep, {
      stats() {
        return { calls: post.sceneCalls, tris: post.sceneTris };
      },
      renderAt(t) {
        renderFrame(t);
        return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(director.shot?.scene?.name))));
      },
    });
    $('start').classList.add('hidden');
    document.body.classList.add('shot');
    renderFrame(clock.t);
    window.__done = true;
    return;
  }
  renderFrame(clock.t);
  updateUI(true);
  $('start-btn').onclick = (e) => {
    e.stopPropagation();
    $('start').classList.add('hidden');
    play();
  };
  if (params.get('autoplay') === '1') $('start-btn').click();
  loop();
}

window.__ep = { director, stage, cast, seek, play, pause, now, audio, clock };
boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = 'Erro ao carregar: ' + e.message;
});
