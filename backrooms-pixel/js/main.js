// BACKROOMS // PIXEL — laço principal, estados do jogo e regras.
import { clamp, wrap, wdelta, angleDiff, rgba } from './util.js';
import { buildLevel, LEVEL_DEFS, LM_Q } from './levels.js';
import { buildSprites } from './textures.js';
import { Renderer } from './renderer.js';
import { CamFX } from './camera.js';
import { Vagante, lineOfSight } from './entity.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Hud, C } from './hud.js';
import { wrapText } from './font.js';

const W = 320, H = 180;
const canvas = document.getElementById('game');
const dctx = canvas.getContext('2d');
const scene = document.createElement('canvas');
scene.width = W; scene.height = H;
const sctx = scene.getContext('2d');
const sImg = sctx.createImageData(W, H);
const hudC = document.createElement('canvas');
hudC.width = W; hudC.height = H;
const hctx = hudC.getContext('2d');
const hImg = hctx.createImageData(W, H);
const hud = new Hud(W, H, hImg.data.buffer);
const R = new Renderer(W, H);
const SPR = buildSprites();
const sound = new Sound();

let view = { x: 0, y: 0, w: W, h: H, scale: 1 };
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  const s = Math.min(canvas.width / W, canvas.height / H);
  view = { scale: s, w: W * s, h: H * s, x: (canvas.width - W * s) / 2, y: (canvas.height - H * s) / 2 };
}
addEventListener('resize', resize);
resize();

function toLogical(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const px = ((cx - r.left) * canvas.width) / r.width, py = ((cy - r.top) * canvas.height) / r.height;
  return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
}
const input = new Input(canvas, toLogical);

// ---------- configurações ----------
const settings = { shake: 1, sens: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('backrooms-pixel') || '{}')); } catch (_) { /* sem armazenamento */ }
const saveSettings = () => { try { localStorage.setItem('backrooms-pixel', JSON.stringify(settings)); } catch (_) { /* ignorado */ } };
const SHAKES = [0, 0.5, 1, 1.5, 2];
const SENS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const cycle = (arr, v, d) => arr[(arr.indexOf(v) + d + arr.length) % arr.length] ?? arr[2];

// ---------- estado ----------
let mode = 'title';
let modeT = 0;
let menuSel = 0;
let G = null;
let attract = null;
let time = 0;

function setMode(m) { mode = m; modeT = 0; menuSel = 0; }

function msg(text, col = C.white) { G.msgs.push({ text, t: 3.2, col }); if (G.msgs.length > 3) G.msgs.shift(); }

function newRun() {
  G = { stats: { time: 0, waters: 0, batteries: 0, catches: 0 }, sanity: 100, battery: 100 };
  loadLevel(0);
  setMode('intro');
}

function loadLevel(idx) {
  const L = buildLevel(idx, (Math.random() * 1e9) | 0);
  Object.assign(G, {
    idx, L,
    p: { x: L.spawn.x, y: L.spawn.y, a: L.spawn.a, pitch: 0, vx: 0, vy: 0, speed: 0, stamina: 1, tired: false, running: false, flashOn: true },
    cam: new CamFX(),
    entity: L.def.entity ? new Vagante(L, L.spawn.cell) : null,
    ghosts: [], puffs: [], msgs: [],
    power: 1, powerTarget: 1, outageT: 45 + Math.random() * 40, outageDur: 0,
    fear: 0, jump: 0, flashW: 0, levelT: 0, ghostT: 14, whisperT: 12, ambT: 3, ventT: 0,
    flick: 1, flickT: 0, handDip: 0, lightHere: 0, exitD: 99, trans: null, seeEntity: false,
    dust: Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 2 + 0.6, z: 0.5 + Math.random() })),
    prevA: L.spawn.a,
  });
  G.sanity = Math.min(100, Math.max(G.sanity, 40) + (idx > 0 ? 20 : 0));
  sound.setLevel(idx);
}

function buildAttract() {
  attract = { L: buildLevel(0, 1337), a: 0, cam: new CamFX() };
  attract.a = attract.L.spawn.a;
}

// ---------- utilidades de mundo ----------
function lightAtWorld(L, x, y, power) {
  const M = L.S * LM_Q;
  const ix = wrap(Math.floor(x * LM_Q), M), iy = wrap(Math.floor(y * LM_Q), M);
  const i = iy * M + ix, o = L.owner[i];
  return o < 0 ? 0 : L.lm[i] * L.lights[o].cur * power;
}

function tileAt(L, x, y) { return L.grid[wrap(Math.floor(y), L.S) * L.S + wrap(Math.floor(x), L.S)]; }

function panFor(dx, dy) { return clamp(Math.sin(angleDiff(Math.atan2(dy, dx), G.p.a)), -1, 1); }

function moveCollide(p, dx, dy) {
  const L = G.L, r = 0.22;
  const blocked = (x, y) => {
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const t = tileAt(L, x + ox, y + oy);
      if (t) return t;
    }
    return 0;
  };
  let hitExit = false;
  const tx = blocked(p.x + dx, p.y);
  if (!tx) p.x += dx; else { if (tx === 9) hitExit = true; p.vx *= 0.3; }
  const ty = blocked(p.x, p.y + dy);
  if (!ty) p.y += dy; else { if (ty === 9) hitExit = true; p.vy *= 0.3; }
  p.x = wrap(p.x, L.S);
  p.y = wrap(p.y, L.S);
  return hitExit;
}

// ---------- jogo em andamento ----------
function updatePlay(dt, frozen) {
  const L = G.L, p = G.p, def = L.def, S = L.S;
  G.levelT += dt;
  G.stats.time += dt;

  // olhar
  const lk = input.look();
  let ldx = lk.dx, ldy = lk.dy;
  if (input.down('ArrowLeft', 'KeyQ')) ldx -= 260 * dt;
  if (input.down('ArrowRight', 'KeyE')) ldx += 260 * dt;
  if (frozen) { ldx = 0; ldy = 0; }
  p.a += ldx * 0.0024 * settings.sens;
  p.pitch = clamp(p.pitch - ldy * 0.35 * settings.sens, -60, 60);
  G.cam.look(ldx, ldy);

  // mover
  const mv = frozen ? { x: 0, y: 0 } : input.move();
  const mag = Math.hypot(mv.x, mv.y);
  const wantRun = input.down('ShiftLeft', 'ShiftRight', 'T_run') && mv.y > 0.2;
  if (p.stamina <= 0.02) p.tired = true;
  if (p.tired && p.stamina > 0.35) p.tired = false;
  p.running = wantRun && !p.tired && mag > 0.1;
  const spd = (p.running ? 3.6 : 2.0) * mag;
  const fx = Math.cos(p.a), fy = Math.sin(p.a);
  const tvx = (fx * mv.y - fy * mv.x) * (mag ? spd / mag : 0);
  const tvy = (fy * mv.y + fx * mv.x) * (mag ? spd / mag : 0);
  const acc = Math.min(1, dt * 10);
  p.vx += (tvx - p.vx) * acc;
  p.vy += (tvy - p.vy) * acc;
  const hitExit = moveCollide(p, p.vx * dt, p.vy * dt);
  p.speed = Math.hypot(p.vx, p.vy);
  p.stamina = clamp(p.stamina + (p.running ? -dt / 5 : dt / (p.speed > 0.3 ? 8 : 4.5)), 0, 1);

  // lanterna
  if (!frozen && input.hit('KeyF', 'Mouse2', 'T_flash')) {
    if (G.battery > 0) { p.flashOn = !p.flashOn; sound.click(p.flashOn); G.handDip = 1; }
    else { sound.click(false); msg('SEM PILHA', C.red); }
  }
  if (p.flashOn) {
    G.battery = Math.max(0, G.battery - dt * 0.42);
    if (G.battery <= 0) { p.flashOn = false; msg('A LANTERNA APAGOU', C.red); sound.click(false); }
  }
  G.flickT -= dt;
  const entNear = G.entity && G.entity.dist < 6;
  if (G.flickT <= 0) {
    const unstable = G.battery < 15 || entNear || G.sanity < 20;
    G.flick = unstable && Math.random() < (entNear ? 0.5 : 0.3) ? 0.05 + Math.random() * 0.3 : 1;
    G.flickT = 0.04 + Math.random() * (unstable ? 0.25 : 1);
  }
  G.handDip = Math.max(0, G.handDip - dt * 4);

  // luzes do forro
  if (def.outages) {
    if (G.outageDur > 0) {
      G.outageDur -= dt;
      if (G.outageDur <= 0) { G.powerTarget = 1; sound.powerUp(); G.outageT = 45 + Math.random() * 45; }
    } else {
      G.outageT -= dt;
      if (G.outageT <= 0) { G.powerTarget = 0; G.outageDur = 5 + Math.random() * 5; sound.powerDown(); msg('QUEDA DE ENERGIA', C.orange); }
    }
  }
  const pt = G.powerTarget === 1 && G.power < 0.95 && Math.random() < 0.15 ? 0.1 : G.powerTarget;
  G.power += (pt - G.power) * Math.min(1, dt * (G.powerTarget ? 6 : 2));
  for (const li of L.lights) {
    if (li.type === 'dead') continue;
    let target = 1;
    if (li.type === 'flicker') {
      li.next -= dt;
      if (li.next <= 0) {
        li.off = !li.off;
        li.next = li.off ? 0.03 + Math.random() * 0.18 : 0.08 + Math.random() * (Math.random() < 0.3 ? 0.3 : 3.5);
        if (li.off) {
          const d = Math.hypot(wdelta(li.x + 0.5 - p.x, S), wdelta(li.y + 0.5 - p.y, S));
          if (d < 7) sound.flicker(1 - d / 7);
        }
      }
      if (li.off) target = 0.08;
    }
    if (G.entity) {
      const d = Math.hypot(wdelta(li.x + 0.5 - G.entity.x, S), wdelta(li.y + 0.5 - G.entity.y, S));
      if (d < 6 && Math.random() < dt * 9 * (1 - d / 6)) li.cur = 0.05;
    }
    li.cur += (target - li.cur) * Math.min(1, dt * 22);
  }

  // entidade
  G.fear = Math.max(0, G.fear - dt * 0.5);
  G.seeEntity = false;
  if (G.entity) {
    const e = G.entity;
    const step = e.update(frozen ? 0 : dt, {
      player: p, flashOn: p.flashOn, running: p.running,
      onSpotted: () => { sound.spotted(); G.cam.hit(0.35); G.fear = Math.max(G.fear, 0.8); },
      onCatch: () => {
        sound.jumpscare(); G.cam.hit(1); G.jump = 0.75; G.flashW = 0.6;
        G.sanity -= 38; G.stats.catches++;
        msg('ELE TE ALCANÇOU', C.red);
      },
    });
    const dx = wdelta(e.x - p.x, S), dy = wdelta(e.y - p.y, S);
    if (step) sound.entityStep(Math.pow(clamp(1 - e.dist / 16, 0, 1), 2) * (e.los ? 1 : 0.6), panFor(dx, dy));
    if (e.dist < 12) G.fear = Math.max(G.fear, (1 - e.dist / 12) * (e.state === 'chase' ? 1 : 0.55));
    const ad = Math.abs(angleDiff(Math.atan2(dy, dx), p.a));
    G.seeEntity = e.los && ad < 0.75 && e.dist < 13;
  }

  // alucinações
  if (G.sanity < 50) {
    G.ghostT -= dt;
    if (G.ghostT <= 0 && G.ghosts.length < 2) {
      G.ghostT = 6 + (G.sanity / 50) * 14 * Math.random();
      const a = p.a + (Math.random() - 0.5) * 1.5, d = 4 + Math.random() * 5;
      const gx = wrap(p.x + Math.cos(a) * d, S), gy = wrap(p.y + Math.sin(a) * d, S);
      if (!tileAt(L, gx, gy) && lineOfSight(L, p.x, p.y, wdelta(gx - p.x, S), wdelta(gy - p.y, S)))
        G.ghosts.push({ x: gx, y: gy, life: 3 + Math.random() * 3, alpha: 0, seen: 0, anim: Math.random() * 4 });
    }
  }
  for (const gh of G.ghosts) {
    gh.life -= dt;
    gh.anim += dt * 0.6;
    const dx = wdelta(gh.x - p.x, S), dy = wdelta(gh.y - p.y, S);
    const ad = Math.abs(angleDiff(Math.atan2(dy, dx), p.a));
    if (ad < 0.18 || Math.hypot(dx, dy) < 2.5) gh.seen += dt;
    if (gh.seen > 0.25 && !gh.gone) { gh.gone = true; gh.life = Math.min(gh.life, 0.3); sound.whisper(panFor(dx, dy)); G.sanity -= 2; }
    gh.alpha = Math.min(gh.alpha + dt * 1.5, clamp(gh.life / 0.3, 0, 1)) * 0.75;
  }
  G.ghosts = G.ghosts.filter((g) => g.life > 0);

  // sanidade
  const wasDead = G.sanity <= 0;
  const lh = lightAtWorld(L, p.x, p.y, G.power);
  G.lightHere += (lh - G.lightHere) * Math.min(1, dt * 4);
  const flashActive = p.flashOn && G.battery > 0;
  const dark = clamp(1 - G.lightHere / 0.4, 0, 1);
  let drain = def.drainBase + def.darkDrain * dark * (flashActive ? 0.25 : 1);
  if (G.seeEntity) drain += 4.5 * (1 - G.entity.dist / 13);
  if (G.entity && G.entity.state === 'chase') drain += 1.2;
  if (G.lightHere > 0.75 && G.fear < 0.1) drain -= 0.32;
  G.sanity = clamp(G.sanity - drain * dt * (frozen ? 0 : 1), 0, 100);
  G.lastDrain = drain;
  hud.glitch = G.sanity < 30 ? (30 - G.sanity) / 30 : 0;

  // itens
  for (const it of L.items) {
    if (it.taken) continue;
    if (Math.hypot(wdelta(it.x - p.x, S), wdelta(it.y - p.y, S)) < 0.55) {
      it.taken = true;
      G.handDip = 1;
      sound.pickup(it.type);
      if (it.type === 'water') { G.sanity = Math.min(100, G.sanity + 30); G.stats.waters++; msg('ÁGUA DE AMÊNDOA  +30 SANIDADE', C.cyan); }
      else { G.battery = Math.min(100, G.battery + 45); G.stats.batteries++; msg('PILHA  +45% LANTERNA', C.green); }
    }
  }

  // vapor (Nível 2)
  let steamNear = 0;
  for (const v of L.vents) {
    v.t -= dt;
    if (v.t <= 0) {
      v.on = !v.on;
      v.t = v.on ? 1.6 + Math.random() * 1.5 : 4 + Math.random() * 7;
      const d = Math.hypot(wdelta(v.x - p.x, S), wdelta(v.y - p.y, S));
      if (v.on && d < 10) sound.steamHiss(panFor(wdelta(v.x - p.x, S), wdelta(v.y - p.y, S)), 1 - d / 10);
    }
    const d = Math.hypot(wdelta(v.x - p.x, S), wdelta(v.y - p.y, S));
    if (v.on && d < 14) {
      if (Math.random() < dt * 14) G.puffs.push({ x: v.x + (Math.random() - 0.5) * 0.2, y: v.y + (Math.random() - 0.5) * 0.2, z: 0, vz: 0.35 + Math.random() * 0.2, life: 1.6, max: 1.6, dx: (Math.random() - 0.5) * 0.2, dy: (Math.random() - 0.5) * 0.2 });
      if (d < 1.3) { steamNear = 1; G.sanity -= dt * 3; G.cam.hit(dt * 0.4); }
    }
  }
  for (const pf of G.puffs) { pf.life -= dt; pf.z += pf.vz * dt; pf.x = wrap(pf.x + pf.dx * dt, S); pf.y = wrap(pf.y + pf.dy * dt, S); }
  G.puffs = G.puffs.filter((pf) => pf.life > 0 && pf.z < 1);

  // sons do ambiente
  G.ambT -= dt;
  if (G.ambT <= 0) {
    G.ambT = 2 + Math.random() * 6;
    const pan = Math.random() * 2 - 1;
    if (def.id === 1) Math.random() < 0.7 ? sound.drip(pan, 0.5 + Math.random() * 0.5) : sound.clank(pan, 0.3);
    else if (def.id === 2) sound.clank(pan, 0.25 + Math.random() * 0.5);
    else if (Math.random() < 0.3) sound.flicker(0.4);
  }
  if (G.sanity < 70) {
    G.whisperT -= dt;
    if (G.whisperT <= 0) { G.whisperT = 6 + (G.sanity / 70) * 20 * Math.random(); sound.whisper(Math.random() * 2 - 1); }
  }

  // saída
  const ex = L.exit;
  G.exitD = Math.hypot(wdelta(ex.x + 0.5 - p.x, S), wdelta(ex.y + 0.5 - p.y, S));

  // câmera
  const shakeMul = settings.shake * (1 + (G.sanity < 30 ? (30 - G.sanity) / 30 : 0));
  const step = G.cam.update(dt, p.speed, p.running, G.fear, shakeMul);
  if (step) sound.step(def.step, p.running);

  // poeira presa ao giro da câmera
  const dA = angleDiff(p.a, G.prevA);
  G.prevA = p.a;
  for (const d of G.dust) {
    d.x = wrap(d.x - dA * R.f * d.z + d.vx * dt - p.speed * 0.4 * dt * (d.x - W / 2) * 0.05, W);
    d.y = wrap(d.y + d.vy * dt, H);
  }

  for (const m of G.msgs) m.t -= dt;
  G.msgs = G.msgs.filter((m) => m.t > 0);
  G.jump = Math.max(0, G.jump - dt);
  G.flashW = Math.max(0, G.flashW - dt * 2);

  // áudio contínuo
  const ins = 1 - G.sanity / 100;
  let growl = 0, gpan = 0;
  if (G.entity) {
    const e = G.entity;
    growl = e.state === 'chase' ? 0.3 * clamp(1 - e.dist / 15, 0, 1) : 0.08 * clamp(1 - e.dist / 9, 0, 1);
    gpan = panFor(wdelta(e.x - p.x, S), wdelta(e.y - p.y, S));
  }
  sound.update(dt, {
    hum: def.id === 2 ? 0 : clamp(G.lightHere, 0, 1.2) * (def.id === 0 ? 0.06 : 0.035),
    drone: 0.035 + ins * 0.06,
    growl, growlPan: gpan,
    stat: (def.id === 0 && G.exitD < 9 ? 0.14 * (1 - G.exitD / 9) : 0) + (G.trans && G.trans.kind === 'noclip' ? 0.2 : 0),
    steam: steamNear * 0.12,
    rumble: def.id === 2 ? 0.16 : def.id === 1 ? 0.05 : 0.02,
    machines: def.id === 2 ? 0.2 : 0,
    heart: Math.max(G.sanity < 35 ? (35 - G.sanity) / 35 : 0, G.fear > 0.5 ? G.fear - 0.3 : 0),
  });

  if ((wasDead || G.sanity <= 0) && mode === 'play') {
    G.sanity = 0;
    sound.dead();
    setMode('dying');
  }
  if (hitExit && !G.trans && mode === 'play') startTransition();
}

function startTransition() {
  const kind = G.idx === 0 ? 'noclip' : 'door';
  G.trans = { kind, t: 0, dur: kind === 'noclip' ? 3.2 : 2.0 };
  if (kind === 'noclip') sound.noclip();
  else { sound.clank(0, 0.6); sound.tone({ type: 'sawtooth', freq: 70, freqEnd: 45, dur: 1.2, gain: 0.08 }); }
  setMode('trans');
}

// ---------- desenho do jogo ----------
function viewFor(p, cam, extra = {}) {
  const o = cam.out;
  const ins = 1 - G.sanity / 100;
  const breathe = ins > 0.6 ? Math.sin(time * 0.9) * (ins - 0.6) * 8 : 0;
  const fpow = (G.p.flashOn && G.battery > 0 ? 1 : 0) * G.flick * (G.battery < 15 ? 0.6 + G.battery / 40 : 1);
  return {
    x: p.x, y: p.y, a: p.a + o.yaw + (extra.yaw || 0),
    pitch: p.pitch + o.dy + breathe + (extra.pitch || 0),
    eyeZ: clamp(0.5 + o.dz + (extra.eyeZ || 0), 0.05, 0.95),
    power: G.power, time,
    flash: { on: fpow > 0, pow: fpow, x: W / 2 + o.flX, y: H / 2 + o.flY },
  };
}

function gatherSprites(L, p) {
  const S = L.S, list = [];
  for (const it of L.items) {
    if (it.taken) continue;
    const d = Math.hypot(wdelta(it.x - p.x, S), wdelta(it.y - p.y, S));
    if (d > 18) continue;
    const bottle = it.type === 'water';
    list.push({
      x: it.x, y: it.y, z: 0.03 + Math.sin(time * 2.2 + it.ph) * 0.025,
      w: bottle ? 0.13 : 0.1, h: bottle ? 0.26 : 0.18, tex: bottle ? SPR.bottle : SPR.battery,
      glow: 0.12 + Math.max(0, Math.sin(time * 3 + it.ph)) * 0.25,
    });
  }
  if (G.entity) {
    const e = G.entity;
    list.push({ x: e.x, y: e.y, z: 0, w: 0.5, h: 0.98, tex: SPR.entity[e.frame()] });
  }
  for (const gh of G.ghosts)
    list.push({ x: gh.x, y: gh.y, z: 0, w: 0.5, h: 0.98, tex: SPR.entity[Math.floor(gh.anim) & 3], alpha: gh.alpha, ghost: true });
  for (const pf of G.puffs) {
    const k = 1 - pf.life / pf.max;
    list.push({ x: pf.x, y: pf.y, z: pf.z, w: 0.25 + k * 0.5, h: 0.25 + k * 0.5, tex: SPR.puff, alpha: (1 - k) * 0.8, glow: 0.25 });
  }
  return list;
}

function drawWorld(v) {
  const L = G.L, p = G.p;
  R.render(L, v, gatherSprites(L, p));
  // poeira iluminada pela lanterna
  const fl = v.flash;
  for (const d of G.dust) {
    const r = Math.hypot(d.x - fl.x, d.y - fl.y) / (W * 0.5);
    let s = (0.42 - r) / 0.26;
    s = s <= 0 ? 0 : s >= 1 ? 1 : s * s;
    const b = s * fl.pow * 70 * d.z + G.lightHere * 10;
    if (b > 4) R.addPixel(d.x, d.y, b, b * 0.95, b * 0.8);
  }
  // mão com a lanterna
  const o = G.cam.out;
  const amb = L.ambient, lc = L.lampColor, lh = G.lightHere + (v.flash.on ? 0.3 * v.flash.pow : 0);
  const light = [amb[0] + lc[0] * lh + 0.16, amb[1] + lc[1] * lh + 0.15, amb[2] + lc[2] * lh + 0.14];
  const dip = Math.sin(G.handDip * Math.PI) * 14;
  R.overlay(v.flash.on ? SPR.handOn : SPR.handOff, W - 94 + o.handX, H - 66 + o.handY + dip + Math.max(0, G.p.pitch) * 0.15, 1, light, v.flash.pow);
  // susto
  if (G.jump > 0) {
    const s = 5.4 + (0.75 - G.jump) * 3;
    R.overlay(SPR.face, W / 2 - 16 * s + (Math.random() - 0.5) * 10, H / 2 - 16 * s + (Math.random() - 0.5) * 10, s, [1, 1, 1], 1, Math.min(1, G.jump * 3));
  }
}

function postFx(extra = {}) {
  const ins = 1 - G.sanity / 100;
  const tr = G.cam.trauma;
  const L = G.L;
  return {
    time,
    wave: (ins > 0.55 ? (ins - 0.55) * 7 : 0) + (extra.wave || 0),
    ca: (ins > 0.5 ? (ins - 0.5) * 6 : 0) + tr * 4 + (extra.ca || 0),
    desat: clamp((ins - 0.4) * 1.1, 0, 0.75),
    vig: 0.35 + ins * 0.55 + G.fear * 0.35,
    grain: 7 + ins * 24,
    red: G.jump > 0 ? 1.2 : ins > 0.8 ? (ins - 0.8) * 4 * (0.6 + 0.4 * Math.sin(time * 6)) : 0,
    stat: (L.def.id === 0 && G.exitD < 6 ? 0.05 * (1 - G.exitD / 6) : 0) + (extra.stat || 0),
    flashW: G.flashW + (extra.flashW || 0),
    fade: extra.fade ?? 1,
  };
}

function drawHUD() {
  const p = G.p, L = G.L;
  // sanidade
  const s = G.sanity / 100;
  const scol = s > 0.6 ? C.yellow : s > 0.3 ? C.orange : C.red;
  const blink = s < 0.25 && Math.sin(time * 10) > 0;
  hud.text('SANIDADE', 6, 2, blink ? C.red : C.dim);
  hud.bar(6, 14, 64, 3, s, scol);
  // lanterna
  hud.frame(6, 21, 14, 7, C.dim);
  hud.rect(20, 23, 1, 3, C.dim);
  const segs = Math.ceil(G.battery / 25);
  const bcol = G.battery < 15 ? C.red : C.green;
  for (let i = 0; i < segs; i++) hud.rect(8 + i * 3, 23, 2, 3, bcol);
  hud.text(p.flashOn ? Math.ceil(G.battery) + '%' : 'DESL.', 24, 18, p.flashOn ? C.white : C.dark);
  // fôlego
  if (p.stamina < 0.99) hud.bar(6, 32, 40, 1, p.stamina, p.tired ? C.red : C.dim);
  // nível
  hud.text(L.def.name, input.touch ? W - 26 : W - 6, 2, C.dim, 1, 'right');
  // mira
  hud.rect(W / 2, H / 2, 1, 1, rgba(255, 255, 255, 90));
  // mensagens
  let my = H - 30;
  for (let i = G.msgs.length - 1; i >= 0; i--) {
    const m = G.msgs[i];
    if (m.t > 0 && (m.t > 0.5 || Math.sin(m.t * 40) > 0)) hud.text(m.text, W / 2, my, m.col, 1, 'center');
    my -= 11;
  }
  // título do nível ao chegar
  if (G.levelT < 6) {
    const a = G.levelT < 0.5 ? 0 : G.levelT > 5 ? Math.sin(G.levelT * 30) > 0 ? 1 : 0 : 1;
    if (a) {
      hud.text(L.def.name, W / 2, 40, C.white, 2, 'center');
      hud.text(L.def.title, W / 2, 64, C.yellow, 1, 'center');
      if (G.levelT > 1.5) hud.text(L.def.hint, W / 2, 80, C.dim, 1, 'center');
    }
  }
  if (!input.touch && !input.locked && mode === 'play') {
    hud.rect(0, H / 2 + 14, W, 13, C.panel);
    hud.text('CLIQUE PARA CONTROLAR A CÂMERA', W / 2, H / 2 + 15, C.white, 1, 'center');
  }
  // controles de toque
  input.buttons = [];
  if (input.touch) {
    const btn = (id, label, x, y, w, h, on) => {
      input.buttons.push({ id, x, y, w, h });
      hud.rect(x, y, w, h, on ? rgba(236, 208, 96, 110) : rgba(0, 0, 0, 110));
      hud.frame(x, y, w, h, C.dim);
      hud.text(label, x + w / 2, y + h / 2 - 6, C.white, 1, 'center');
    };
    btn('flash', 'LUZ', W - 46, H - 98, 40, 18, p.flashOn);
    btn('run', 'CORRER', W - 46, H - 76, 40, 18, input.held.has('T_run'));
    btn('pause', 'II', W - 22, 4, 16, 14, false);
    if (input.stick) {
      hud.ring(input.stick.ox, input.stick.oy, 22, C.dim);
      hud.ring(input.stick.x, input.stick.y, 6, C.white);
    } else hud.text('MOVER', 34, H - 18, C.dark, 1, 'center');
  }
}

// ---------- menus ----------
function menu(items, y, spacing = 13) {
  if (input.hit('ArrowUp', 'KeyW')) { menuSel = (menuSel + items.length - 1) % items.length; sound.ui(false); }
  if (input.hit('ArrowDown', 'KeyS')) { menuSel = (menuSel + 1) % items.length; sound.ui(false); }
  const it = items[menuSel];
  if (it && it.adj && input.hit('ArrowLeft', 'KeyA')) { it.adj(-1); sound.ui(false); }
  if (it && it.adj && input.hit('ArrowRight', 'KeyD')) { it.adj(1); sound.ui(false); }
  let act = null;
  if (input.hit('Enter', 'Space')) act = it;
  items.forEach((m, i) => {
    const label = typeof m.label === 'function' ? m.label() : m.label;
    const w = hud.width(label) + 16, x = W / 2 - w / 2, yy = y + i * spacing;
    const inside = (q) => q.x >= x && q.x < x + w && q.y >= yy - 1 && q.y < yy + 11;
    if (input.pointer.moved && inside(input.pointer) && menuSel !== i) { menuSel = i; sound.ui(false); }
    for (const c of input.clicks) if (inside(c)) { menuSel = i; act = m; }
    const sel = i === menuSel;
    if (sel) {
      hud.text('>', x - 2 + Math.round(Math.sin(time * 6)), yy, C.yellow);
      hud.text('<', x + w - 4 - Math.round(Math.sin(time * 6)), yy, C.yellow);
    }
    hud.text(label, W / 2, yy, sel ? C.yellow : C.dim, 1, 'center');
  });
  if (act) { sound.ui(true); (act.act || (() => act.adj && act.adj(1)))(); }
}

const settingItems = () => [
  { label: () => 'TREMOR DA CÂMERA: ' + Math.round(settings.shake * 100) + '%', adj: (d) => { settings.shake = cycle(SHAKES, settings.shake, d); saveSettings(); } },
  { label: () => 'SENSIBILIDADE: ' + Math.round(settings.sens * 100) + '%', adj: (d) => { settings.sens = cycle(SENS, settings.sens, d); saveSettings(); } },
];

function toggleFullscreen() {
  const d = document;
  if (!d.fullscreenElement) {
    const r = d.documentElement.requestFullscreen && d.documentElement.requestFullscreen();
    if (r && r.then) r.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (_) { /* ignorado */ } }).catch(() => {});
  } else if (d.exitFullscreen) d.exitFullscreen();
}

function typeLines(lines, t, y, cps = 28, col = C.white, gap = 13) {
  let budget = t * cps;
  lines.forEach((ln, i) => {
    if (budget <= 0) return;
    const shown = ln.slice(0, Math.floor(budget));
    budget -= ln.length + 8;
    hud.text(shown, W / 2 - hud.width(ln) / 2, y + i * gap, typeof col === 'function' ? col(i) : col);
  });
  return budget > 0;
}

// ---------- telas ----------
function titleFrame(dt) {
  if (!attract) buildAttract();
  const A = attract, L = A.L;
  A.a += dt * 0.12;
  for (const li of L.lights) {
    if (li.type === 'flicker') { li.next -= dt; if (li.next <= 0) { li.off = !li.off; li.next = li.off ? 0.05 : 0.2 + Math.random() * 3; } li.cur = li.off ? 0.1 : 1; }
  }
  A.cam.look(Math.sin(time * 0.7) * 2, 0);
  A.cam.update(dt, 0, false, 0.1, settings.shake);
  const o = A.cam.out;
  R.render(L, {
    x: L.spawn.x, y: L.spawn.y, a: A.a + o.yaw, pitch: o.dy - 4, eyeZ: 0.5,
    power: 1, time, flash: { on: false, pow: 0, x: W / 2, y: H / 2 },
  }, []);
  R.post(sImg.data, { time, vig: 0.9, grain: 22, desat: 0.15, wave: 0, fade: Math.min(1, modeT) });

  if (mode === 'controls') return controlsOverlay();
  // título com aberração
  const gx = Math.random() < 0.08 ? (Math.random() - 0.5) * 6 : 0;
  hud.text('BACKROOMS', W / 2 - 2 + gx, 22, rgba(220, 40, 40, 160), 3, 'center', 0);
  hud.text('BACKROOMS', W / 2 + 2 - gx, 22, rgba(40, 200, 220, 160), 3, 'center', 0);
  hud.text('BACKROOMS', W / 2, 22, C.white, 3, 'center');
  hud.text('// PIXEL', W / 2, 52, C.yellow, 1, 'center');
  hud.text('NÍVEL 0 · NÍVEL 1 · NÍVEL 2', W / 2, 64, C.dim, 1, 'center');
  menu([
    { label: 'JOGAR', act: () => { sound.init(); newRun(); } },
    { label: 'CONTROLES', act: () => { sound.init(); setMode('controls'); } },
    ...settingItems(),
    { label: 'TELA CHEIA', act: toggleFullscreen },
  ], 88);
  hud.text('FEITO DO ZERO, PIXEL POR PIXEL', W / 2, H - 13, C.dark, 1, 'center');
}

function controlsOverlay() {
  hud.rect(20, 10, W - 40, H - 20, rgba(0, 0, 0, 200));
  hud.text('CONTROLES', W / 2, 16, C.yellow, 1, 'center');
  const rows = [
    ['WASD / SETAS', 'ANDAR'], ['MOUSE', 'OLHAR'], ['SHIFT', 'CORRER'], ['F / BOTÃO DIREITO', 'LANTERNA'],
    ['Q / E', 'GIRAR SEM MOUSE'], ['ESC', 'PAUSAR'], ['CELULAR', 'ANALÓGICO + ARRASTAR'],
  ];
  rows.forEach(([k, v], i) => { hud.text(k, 34, 32 + i * 12, C.white); hud.text(v, W - 34, 32 + i * 12, C.dim, 1, 'right'); });
  const tips = wrapText('SUA SANIDADE CAI NO ESCURO E PERTO DA ENTIDADE. BEBA ÁGUA DE AMÊNDOA. GUARDE PILHAS. SETAS NO CHÃO APONTAM A SAÍDA.', W - 70);
  tips.forEach((t, i) => hud.text(t, W / 2, 120 + i * 11, C.cyan, 1, 'center'));
  menu([{ label: 'VOLTAR', act: () => setMode('title') }], H - 24);
}

const INTRO = ['VOCÊ ESTAVA VOLTANDO PARA CASA.', 'O CHÃO CEDEU DE UM JEITO ERRADO.', 'VOCÊ CAIU ATRAVÉS DA REALIDADE.', '', 'O AR CHEIRA A CARPETE MOLHADO.'];

function introFrame() {
  R.fillRGB(0, 0, 0);
  R.post(sImg.data, { time, grain: 10, vig: 0 });
  const done = typeLines(INTRO, modeT, 50);
  if (done && Math.sin(time * 4) > 0) hud.text('CLIQUE PARA CONTINUAR', W / 2, H - 24, C.dim, 1, 'center');
  if (input.clicks.length || input.hit('Enter', 'Space')) {
    if (done) setMode('card'); else modeT = 99;
  }
}

function cardFrame() {
  const L = G.L;
  R.fillRGB(0, 0, 0);
  R.post(sImg.data, { time, grain: 14, vig: 0, stat: modeT < 0.4 ? 0.5 * (1 - modeT / 0.4) : 0 });
  hud.text(L.def.name, W / 2, 34, C.white, 3, 'center');
  hud.text(L.def.title, W / 2, 68, C.yellow, 1, 'center');
  wrapText(L.def.intro, W - 60).forEach((t, i) => hud.text(t, W / 2, 88 + i * 11, C.dim, 1, 'center'));
  if (modeT > 1 && Math.sin(time * 4) > 0) hud.text(input.touch ? 'TOQUE PARA ENTRAR' : 'CLIQUE PARA ENTRAR', W / 2, H - 22, C.white, 1, 'center');
  if (modeT > 1 && (input.clicks.length || input.hit('Enter', 'Space'))) {
    input.requestLock();
    G.levelT = 0;
    setMode('play');
  }
}

function playFrame(dt) {
  updatePlay(dt, false);
  drawWorld(viewFor(G.p, G.cam));
  R.post(sImg.data, postFx());
  drawHUD();
  if (!input.touch && !input.locked && input.clicks.length) input.requestLock();
  if (input.hit('KeyP', 'T_pause', 'Escape')) { input.releaseLock(); setMode('pause'); }
}

function transFrame(dt) {
  const T = G.trans;
  T.t += dt;
  const k = T.t / T.dur;
  updatePlay(dt, true);
  if (T.kind === 'noclip') {
    G.cam.hit(dt * 2);
    drawWorld(viewFor(G.p, G.cam, { yaw: k * k * 6, pitch: -k * k * 120, eyeZ: -k * 0.5 }));
    R.post(sImg.data, postFx({ wave: k * 14, ca: k * 8, stat: k * 0.8, fade: 1 - Math.max(0, (k - 0.75) * 4) }));
  } else {
    drawWorld(viewFor(G.p, G.cam, { pitch: k * 10 }));
    R.post(sImg.data, postFx({ fade: 1 - k }));
  }
  if (T.t >= T.dur) {
    G.trans = null;
    if (G.idx < 2) { loadLevel(G.idx + 1); setMode('card'); }
    else { input.releaseLock(); setMode('end'); }
  }
}

function pauseFrame() {
  drawWorld(viewFor(G.p, G.cam));
  R.post(sImg.data, { ...postFx(), desat: 0.7, fade: 0.45 });
  hud.text('PAUSADO', W / 2, 30, C.white, 2, 'center');
  menu([
    { label: 'CONTINUAR', act: () => { input.requestLock(); setMode('play'); } },
    ...settingItems(),
    { label: 'TELA CHEIA', act: toggleFullscreen },
    { label: 'MENU PRINCIPAL', act: () => setMode('title') },
  ], 70);
}

function dyingFrame(dt) {
  const k = Math.min(1, modeT / 2.6);
  updatePlay(dt, true);
  drawWorld(viewFor(G.p, G.cam, { pitch: k * 50, eyeZ: -k * 0.4, yaw: Math.sin(modeT * 3) * k * 0.2 }));
  R.post(sImg.data, { ...postFx({ wave: k * 10, stat: k * 0.3 }), desat: 1, fade: 1 - k, red: k * 2 });
  if (modeT > 2.8) { input.releaseLock(); setMode('dead'); }
}

function statsLines() {
  const s = G.stats, m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
  return [
    'TEMPO: ' + m + ':' + String(sec).padStart(2, '0'),
    'ÁGUAS BEBIDAS: ' + s.waters + '   PILHAS: ' + s.batteries,
    'ENCONTROS COM O VAGANTE: ' + s.catches,
  ];
}

function deadFrame() {
  R.fillRGB(14, 2, 2);
  R.post(sImg.data, { time, grain: 30, vig: 1, wave: 2, stat: 0.08 });
  hud.text('VOCÊ SE PERDEU', W / 2, 26, C.red, 2, 'center');
  hud.text('PARA SEMPRE NO ' + G.L.def.name, W / 2, 50, C.dim, 1, 'center');
  statsLines().forEach((t, i) => hud.text(t, W / 2, 70 + i * 11, C.white, 1, 'center'));
  if (modeT > 1)
    menu([
      { label: 'TENTAR DE NOVO', act: () => { G.sanity = 70; G.battery = Math.max(G.battery, 50); loadLevel(G.idx); setMode('card'); } },
      { label: 'MENU PRINCIPAL', act: () => setMode('title') },
    ], 120);
}

const ENDING = ['A PORTA SE ABRE.', 'LUZ DO SOL. GRAMA. CARROS AO LONGE.', 'VOCÊ ESTÁ EM CASA.', '', '...', '', 'O ZUMBIDO VOLTOU.'];

function endFrame() {
  const k = modeT;
  if (k < 9) {
    const c = Math.min(1, k / 3);
    R.fillRGB(40 + c * 140, 60 + c * 150, 80 + c * 160);
  } else {
    R.fillRGB(120, 104, 40);
  }
  const glitch = k > 8.4 && k < 9.4;
  R.post(sImg.data, { time, grain: 16, vig: 0.6, stat: glitch ? 0.6 : 0, wave: k > 9 ? 1.5 : 0, fade: k > 9 ? 0.7 : 1 });
  typeLines(ENDING, k, 30, 18, (i) => (i === 6 ? C.yellow : C.black), 12);
  if (k > 11) {
    hud.rect(40, 116, W - 80, 36, C.panel);
    statsLines().forEach((t, i) => hud.text(t, W / 2, 118 + i * 11, C.white, 1, 'center'));
  }
  if (k > 12) menu([{ label: 'VOLTAR AO NÍVEL 0', act: newRun }, { label: 'MENU PRINCIPAL', act: () => setMode('title') }], H - 26, 12);
}

// ---------- composição final ----------
function composite() {
  sctx.putImageData(sImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  dctx.fillStyle = '#000';
  dctx.fillRect(0, 0, canvas.width, canvas.height);
  dctx.imageSmoothingEnabled = false;
  const inGame = G && ['play', 'trans', 'dying', 'pause'].includes(mode);
  const o = inGame ? G.cam.out : mode === 'title' && attract ? attract.cam.out : null;
  dctx.save();
  dctx.beginPath();
  dctx.rect(view.x, view.y, view.w, view.h);
  dctx.clip();
  let roll = 0, sx = 0, sy = 0;
  if (o) {
    roll = o.roll;
    sx = clamp(o.shiftX, -14, 14);
    sy = clamp(o.shiftY, -8, 8);
    if (mode === 'trans' && G.trans && G.trans.kind === 'noclip') roll += Math.pow(G.trans.t / G.trans.dur, 2) * 2.4;
  }
  const z = o ? 1.1 + Math.abs(roll) * 0.65 : 1;
  dctx.translate(view.x + view.w / 2 + sx * view.scale, view.y + view.h / 2 + sy * view.scale);
  dctx.rotate(roll);
  dctx.drawImage(scene, (-view.w * z) / 2, (-view.h * z) / 2, view.w * z, view.h * z);
  dctx.restore();
  dctx.drawImage(hudC, view.x, view.y, view.w, view.h);
}

input.onUnlock = () => { if (mode === 'play') setMode('pause'); };
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') { input.releaseLock(); setMode('pause'); } });

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  modeT += dt;
  hud.clear();
  hud.glitch = 0;
  if (input.clicks.length || input.pressed.size) sound.init();
  switch (mode) {
    case 'title': case 'controls': titleFrame(dt); break;
    case 'intro': introFrame(); break;
    case 'card': cardFrame(); break;
    case 'play': playFrame(dt); break;
    case 'trans': transFrame(dt); break;
    case 'pause': pauseFrame(); break;
    case 'dying': dyingFrame(dt); break;
    case 'dead': deadFrame(); break;
    case 'end': endFrame(); break;
  }
  composite();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// para depuração no console
window.__game = { input, get G() { return G; }, get mode() { return mode; }, LEVEL_DEFS, setMode, newRun, loadLevel };
