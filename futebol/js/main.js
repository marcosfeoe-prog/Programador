// Gramado — futebol 3D no navegador. Orquestra menus, partidas, câmera,
// replay, áudio, HUD, controles e o modo carreira/torneios.
import * as THREE from 'three';
import { Match } from './engine/match.js';
import { makeEnv, randomWeather, randomTime, WEATHERS } from './engine/weather.js';
import { club } from './data/clubs.js';
import { MatchView } from './render/scene.js';
import { CAM_MODES } from './render/camera.js';
import { Input } from './input.js';
import { AudioEngine, Narrator } from './audio.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import * as C from './comp/career.js';
import { isMobileDevice, colorDist, luminance, RNG, clamp } from './util.js';

const QUALITY = {
  baixa: { pr: 0.8, aa: false, shadows: false, shadowSize: 1024, crowd: 2500, pitchRes: 2048, rain: 1500, buildings: 40 },
  media: { pr: 1, aa: false, shadows: true, shadowSize: 1024, crowd: 6000, pitchRes: 2048, rain: 3000, buildings: 70, shadowExt: 75 },
  alta: { pr: 1.5, aa: true, shadows: true, shadowSize: 2048, crowd: 11000, pitchRes: 4096, rain: 5000, buildings: 110, shadowExt: 80 },
  ultra: { pr: 2, aa: true, shadows: true, shadowSize: 4096, crowd: 18000, pitchRes: 4096, rain: 8000, buildings: 160, shadowExt: 85 },
};
const SETTINGS_KEY = 'gramado-config-v1';

function loadSettings(mobile) {
  const def = { quality: mobile ? 'baixa' : 'alta', camera: 'tv', volume: 0.8, narration: false, autoReplay: true, showFps: false, difficulty: 'profissional', halfMinutes: 4, touch: 'auto' };
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const out = { ...def, ...s };
    if (!QUALITY[out.quality]) out.quality = def.quality;
    const q = new URLSearchParams(location.search).get('quality');
    if (q && QUALITY[q]) out.quality = q;
    return out;
  } catch (e) {
    return def;
  }
}

// Uniformes sem confusão de cores; goleiros e árbitro com cores próprias.
export function chooseKits(hc, ac) {
  const home = { ...hc.home };
  const alts = [ac.away, ac.home, { p: '#f4f4f2', s: ac.home.p, pattern: 'solido', shorts: '#f4f4f2', socks: '#f4f4f2' }, { p: '#161616', s: ac.home.p, pattern: 'solido', shorts: '#161616', socks: '#161616' }];
  const score = (k) => colorDist(home.p, k.p) * 1 + colorDist(home.s, k.p) * 0.35 + colorDist(home.shorts, k.shorts) * 0.25;
  const away = { ...(alts.find((k) => colorDist(home.p, k.p) >= 230) || alts.slice().sort((a, b) => score(b) - score(a))[0]) };
  const GK = ['#2ecc40', '#ff851b', '#8e2de2', '#ffdc00', '#1c1c1c', '#ff4fa3', '#22c1c3', '#e8e8e8'];
  const pickGK = (avoid) => GK.find((c) => avoid.every((a) => colorDist(c, a) > 210)) || GK[0];
  const g0 = pickGK([home.p, away.p]);
  const g1 = pickGK([home.p, away.p, g0]);
  const gk = (c) => ({ p: c, s: luminance(c) > 0.5 ? '#222222' : '#dddddd', pattern: 'solido', shorts: luminance(c) > 0.5 ? '#222222' : c, socks: c, gloves: '#f0f0f0', numberColor: luminance(c) > 0.5 ? '#111' : '#fff' });
  const REF = ['#111111', '#ffdc00', '#ff4fa3', '#22c1c3'];
  const refC = REF.find((c) => [home.p, away.p, g0, g1].every((a) => colorDist(c, a) > 180)) || '#111111';
  const ref = { p: refC, s: '#ffffff', pattern: 'solido', shorts: '#111111', socks: '#111111' };
  return { team: [home, away], gk: [gk(g0), gk(g1)], ref };
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class App {
  constructor() {
    this.mobile = isMobileDevice();
    this.settings = loadSettings(this.mobile);
    this.input = new Input();
    if (this.mobile) this.input.lastDevice = 'toque';
    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume);
    this.narrator = new Narrator();
    this.narrator.enabled = this.settings.narration;
    this.hud = new HUD();
    this.menu = new Menu(this);
    this.mode = 'menu';
    this.createRenderer();
    this.input.setupTouch(document.getElementById('touch'));
    this.input.onFinesseOff = () => document.querySelector('[data-act="finesse"]').classList.remove('lit');
    window.addEventListener('resize', () => this.resize());
    document.getElementById('b-pause').addEventListener('click', () => this.pauseGame());
    const unlock = () => this.audio.start();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'match' && !this.paused) this.pauseGame();
    });
    this.menu.main();
    this.last = performance.now();
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fps = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  createRenderer() {
    const q = QUALITY[this.settings.quality];
    let canvas = document.getElementById('game');
    if (this.renderer) {
      this.renderer.dispose();
      const nc = canvas.cloneNode(false);
      canvas.replaceWith(nc);
      canvas = nc;
    }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !!q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#0b1410');
    this.aa = q.aa;
    this.resize();
  }

  resize() {
    const q = QUALITY[this.settings.quality];
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    this.renderer.setSize(w, h);
    if (this.view) this.view.resize(w, h);
  }

  setSetting(k, v) {
    this.settings[k] = v;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      /* ignorado */
    }
    if (k === 'volume') this.audio.setVolume(v);
    if (k === 'narration') this.narrator.enabled = v;
    if (k === 'quality' && !this.match) {
      if (QUALITY[v].aa !== this.aa) this.createRenderer();
      else this.resize();
    }
  }

  touchOn() {
    const t = this.settings.touch;
    return t === 'on' || (t === 'auto' && (this.mobile || 'ontouchstart' in window));
  }

  // ------------------------------------------------------------ partidas

  startQuick(q) {
    const hc = club(q.home);
    const rng = new RNG((Math.random() * 1e9) | 0);
    const month = new Date().getMonth();
    const weather = q.weather === 'aleatorio' ? randomWeather(hc.climate, month, rng, { windy: hc.windy, stormy: hc.stormy }) : q.weather;
    const time = q.time === 'aleatorio' ? randomTime(rng) : q.time;
    this.launch({
      home: q.home,
      away: q.away,
      userSide: q.userSide,
      weather,
      time,
      halfMinutes: q.halfMinutes,
      difficulty: q.difficulty,
      knockout: false,
      compLabel: 'Amistoso',
      onEnd: () => this.menu.quick(),
      onQuit: () => this.menu.quick(),
    });
  }

  startCareerMatch(car, fx) {
    const userSide = fx.h === car.userClub ? 0 : 1;
    this.launch({
      home: fx.h,
      away: fx.a,
      userSide,
      weather: fx.weather,
      time: fx.time,
      halfMinutes: car.halfMinutes,
      difficulty: car.difficulty,
      knockout: !!fx.knockout,
      seed: fx.seed,
      compLabel: `${C.compLabel(car, fx.comp)} · ${this.menu.roundLabel(car, fx)}`,
      onEnd: (res) => {
        C.recordResult(car, fx, res);
        C.closeDay(car);
        C.saveCareer(car);
        this.menu.hub(car);
      },
      onQuit: () => {
        C.simulateFixture(car, fx);
        C.closeDay(car);
        C.saveCareer(car);
        this.menu.hub(car);
      },
    });
  }

  async launch(o) {
    this.audio.start();
    this.menu.clear();
    const ld = document.getElementById('loading');
    ld.classList.remove('hidden');
    document.getElementById('loading-txt').textContent = `Preparando ${club(o.home).stadium}…`;
    await nextFrame();
    await nextFrame();
    const hc = club(o.home);
    const ac = club(o.away);
    const seed = o.seed || ((Math.random() * 1e9) | 0);
    const env = makeEnv({ weather: o.weather, time: o.time, altitude: hc.altitude, seed });
    const kits = chooseKits(hc, ac);
    const match = new Match({ home: hc, away: ac, homeKit: kits.team[0], awayKit: kits.team[1], env, halfMinutes: o.halfMinutes, difficulty: o.difficulty, userSide: o.userSide, knockout: o.knockout, seed });
    const q = QUALITY[this.settings.quality];
    this.view = new MatchView(this.renderer, match, { quality: q, kits, camMode: this.settings.camera });
    this.view.onLightning = (d) => this.audio.thunder(d);
    this.match = match;
    this.kits = kits;
    this.opts = o;
    this.userSide = o.userSide;
    this.paused = false;
    this.replay = null;
    this.endT = null;
    this.goalReplayDone = false;
    match.on((e) => this.onMatchEvent(e));
    this.resize();
    try {
      this.renderer.compile(this.view.scene, this.view.camera);
    } catch (e) {
      /* ignorado */
    }
    this.hud.begin(match, kits, o.compLabel);
    this.audio.beginMatch(env, clamp(0.45 + hc.capacity / 90000, 0.5, 1.1) * this.view.stadium.attendance);
    document.getElementById('touch').classList.toggle('hidden', !this.touchOn() || o.userSide < 0);
    ld.classList.add('hidden');
    this.input.clear();
    this.mode = 'match';
    this.hud.showBanner(`${hc.abbr} × ${ac.abbr}`, `${WEATHERS[env.weather].icon} ${WEATHERS[env.weather].name} · ${Math.round(env.temp)}°C`, 2.5);
  }

  endMatch(withResult) {
    const o = this.opts;
    const res = this.match ? this.match.result : null;
    this.mode = 'menu';
    this.audio.endMatch();
    this.hud.hide();
    document.getElementById('touch').classList.add('hidden');
    if (this.view) this.view.dispose();
    this.view = null;
    this.match = null;
    this.renderer.setClearColor('#0b1410');
    this.renderer.clear();
    if (withResult && res) o.onEnd(res);
    else o.onQuit();
  }

  pauseGame() {
    if (this.mode !== 'match' || this.paused || !this.match) return;
    if (this.match.state === 'over') return;
    this.paused = true;
    this.input.clear();
    this.menu.pause(this.match, {
      userSide: this.userSide,
      onResume: () => {
        this.paused = false;
        this.input.clear();
      },
      onQuit: () => {
        this.paused = false;
        this.endMatch(false);
      },
      onCamera: () => {
        this.cycleCamera();
        if (this.pauseDlg) this.pauseDlg.remove();
        this.paused = false;
        this.pauseGame();
      },
      onReplay: () => {
        this.paused = false;
        this.startReplay('manual');
      },
    });
    this.pauseDlg = this.menu.root.lastChild;
  }

  cycleCamera() {
    if (!this.view) return;
    const i = CAM_MODES.indexOf(this.view.cam.mode);
    this.view.cam.mode = CAM_MODES[(i + 1) % CAM_MODES.length];
    this.setSetting('camera', this.view.cam.mode);
  }

  onMatchEvent(e) {
    const m = this.match;
    if (!m) return;
    this.view && this.view.onEvent(e);
    const camDist = () => (this.view ? this.view.camera.position.distanceTo({ x: m.ball.p.x, y: m.ball.p.y, z: m.ball.p.z }) : 40);
    switch (e.type) {
      case 'msg':
        this.hud.addFeed(m.minute(), e.text);
        if (e.important && e.kind !== 'goal' && e.kind !== 'period') {
          const k = e.kind === 'card' ? (/vermelho|expulso/i.test(e.text) ? 'red' : 'card') : e.kind === 'offside' ? 'offside' : '';
          this.hud.toast(e.text, k);
        }
        if (e.kind === 'card' || e.kind === 'offside' || /Pênalti/.test(e.text)) this.narrator.say(e.text);
        break;
      case 'whistle':
        this.audio.whistle(e.kind);
        break;
      case 'kick': {
        const pan = this.view ? clamp((m.ball.p.x - this.view.camera.position.x) / 40, -1, 1) : 0;
        this.audio.kick(e.power, pan, camDist());
        break;
      }
      case 'post':
        this.audio.post();
        break;
      case 'net':
        this.audio.net(e.speed);
        break;
      case 'bounce':
        if (e.speed > 4) this.audio.bounce(e.speed);
        break;
      case 'save':
      case 'miss':
      case 'block':
        this.audio.oohSwell(e.type === 'save' ? 0.8 : 0.6);
        break;
      case 'goal': {
        const t = e.team;
        const name = e.scorer ? e.scorer.name : '';
        this.hud.showBanner('GOOOL!', e.own ? `Gol contra · ${t.club.short}` : `${name} · ${t.club.short} ${e.goal.min}'`, 3.2);
        this.audio.goal(t.side === 0);
        this.audio.whistle('short');
        this.narrator.say(`Gooool! ${e.own ? 'Gol contra.' : name + ' marca para o ' + t.club.short + '!'}`, true);
        this.goalReplayDone = false;
        break;
      }
      case 'pen-goal':
        this.audio.goal(e.team === 0);
        break;
      case 'pen-miss':
        this.audio.oohSwell(1);
        break;
      case 'half': {
        m.holdForBreak = true;
        const lbl = m.breakKind === 'intervalo' ? 'Intervalo' : m.breakKind === 'prorrogacao' ? 'Fim do tempo normal — prorrogação' : m.breakKind === 'penaltis' ? 'Empate — disputa de pênaltis' : 'Intervalo da prorrogação';
        this.hud.showBanner(lbl.split(' — ')[0].toUpperCase(), '', 2);
        setTimeout(() => {
          if (this.match !== m) return;
          this.paused = true;
          this.menu.halftime(m, lbl, () => {
            m.holdForBreak = false;
            this.paused = false;
            this.input.clear();
          });
        }, 1600);
        break;
      }
      case 'end':
        this.hud.showBanner('FIM DE JOGO', `${m.teams[0].club.abbr} ${m.teams[0].score} × ${m.teams[1].score} ${m.teams[1].club.abbr}`, 3);
        this.narrator.say(`Fim de jogo. ${m.teams[0].club.short} ${m.teams[0].score}, ${m.teams[1].club.short} ${m.teams[1].score}.`, true);
        this.endT = 2.8;
        break;
      case 'sub':
        this.hud.toast(`🔁 ${e.team.club.abbr}: ${e.out.name} ⟶ ${e.inn.name}`);
        break;
    }
  }

  // ------------------------------------------------------------ replay

  startReplay(kind) {
    const m = this.match;
    if (!m || m.recCount < 40) return;
    const n = m.recCount;
    const stride = m.recStride;
    const frames = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      const src = ((m.recHead - n + i + m.recN * 2) % m.recN) * stride;
      frames.set(m.rec.subarray(src, src + stride), i * stride);
    }
    let start;
    let end;
    if (kind === 'goal') {
      const ago = m.stateT;
      end = Math.max(2, n - 1 - Math.floor((ago - 1.0) * 30));
      start = Math.max(0, end - 30 * 6.5);
    } else {
      end = n - 1;
      start = Math.max(0, n - 30 * 9);
    }
    const gx = m.goalTeam ? m.goalTeam.oppGoalX : Math.sign(m.ball.p.x || 1) * 52.5;
    this.replay = { frames, stride, start, end, pos: start, speed: kind === 'goal' ? 0.6 : 0.8, goalX: gx, kind };
    this.hud.replayTag(true);
    this.view.cam.snap();
    this.view.replayVariant++;
  }

  endReplay() {
    const r = this.replay;
    this.replay = null;
    this.hud.replayTag(false);
    if (this.view) this.view.cam.snap();
    if (r && r.kind === 'goal' && this.match && this.match.state === 'goal') this.match.stateT = Math.max(this.match.stateT, 3.9);
    this.input.clear();
  }

  // ------------------------------------------------------------ quadro

  frame(t) {
    const dt = Math.min(0.05, Math.max(0.001, (t - this.last) / 1000));
    this.last = t;
    if (this.mode === 'match' && this.view) {
      const m = this.match;
      const inp = this.input.frame();
      if (inp.pressed.has('pause')) this.pauseGame();
      if (inp.pressed.has('camera')) this.cycleCamera();
      let rf = null;
      if (this.replay) {
        const anyAct = ['pass', 'shoot', 'lob', 'through', 'pause', 'switch', 'knock', 'confirm'].some((a) => inp.pressed.has(a));
        const r = this.replay;
        r.pos += dt * 30 * r.speed;
        if (anyAct || r.pos >= r.end - 1) this.endReplay();
        else {
          const i = Math.floor(r.pos);
          rf = { a: r.frames, oa: i * r.stride, b: r.frames, ob: Math.min(r.end, i + 1) * r.stride, f: r.pos - i, goalX: r.goalX, speed: r.speed };
        }
      } else if (!this.paused) {
        if (inp.pressed.has('replay') && m.state !== 'over') this.startReplay('manual');
        const B = this.view.cam.basis();
        if (this.userSide >= 0) {
          m.setInput(this.userSide, {
            mx: inp.x * B.rx + inp.y * B.fx,
            mz: inp.x * B.rz + inp.y * B.fz,
            sprint: inp.sprint,
            pressed: inp.pressed,
            released: inp.released,
            held: inp.held,
          });
        }
        m.update(dt);
        // replay do gol durante a comemoração
        if (m.state === 'goal' && !this.goalReplayDone && m.stateT > 2.4) {
          this.goalReplayDone = true;
          if (this.settings.autoReplay) this.startReplay('goal');
        }
        if (this.endT != null) {
          this.endT -= dt;
          if (this.endT <= 0) {
            this.endT = null;
            this.paused = true;
            this.menu.fulltime(m, () => this.endMatch(true));
          }
        }
      }
      if (this.view) {
        this.view.render(rf ? dt * rf.speed : dt, { replay: rf, userTeam: this.userSide >= 0 ? this.userSide : null });
        const charge = this.userSide >= 0 ? this.input.charge() : null;
        this.fpsAcc += dt;
        this.fpsN++;
        if (this.fpsAcc > 0.5) {
          this.fps = Math.round(this.fpsN / this.fpsAcc);
          this.fpsAcc = 0;
          this.fpsN = 0;
        }
        this.hud.update(dt, { charge, userTeam: this.userSide >= 0 ? this.userSide : null, view: this.view, w: window.innerWidth, h: window.innerHeight, fps: this.settings.showFps ? this.fps : null, device: this.input.lastDevice });
        this.audio.update(dt, m.excitement, this.paused || !!rf);
        // botões de toque: ataque ou defesa
        if (this.userSide >= 0) {
          const ut = m.teams[this.userSide];
          const att = (m.possessor && m.possessor.team === ut) || (m.passInfo && m.passInfo.team === ut) || m.ball.held === ut.ctrlMark || (m.sp && m.sp.team === ut);
          document.getElementById('touch').classList.toggle('def', !att);
        }
      }
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.app = new App();
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:16px sans-serif;padding:20px;text-align:center">Não foi possível iniciar o jogo (WebGL 2 é necessário).<br>${String(e.message || e)}</div>`);
  }
});
