// Cenas com câmera roteirizada, falas legendadas e faixas pretas. Uma cena é uma lista de passos:
//   { cam: { pos:[x,y,z], look:[x,y,z], dur, from? } }   move a câmera (não bloqueia se async)
//   { say: ['Nome', 'Texto'], dur }                      legenda (bloqueia)
//   { wait: segundos }
//   { do: () => {...} }                                  ação instantânea (sempre roda, mesmo pulando)
//   { npc: 'id', walk: [[x,z],...], speed, async }       NPC caminha (bloqueia até chegar, se não async)
//   { fade: 1 | 0, dur }
import * as THREE from 'three';
import { clamp, easeInOut, lerp } from './util.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Cutscene {
  constructor(G) {
    this.G = G;
    this.steps = null;
    this.bg = [];
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camFrom = null;
    this.camTo = null;
    this.camT = 0;
    this.camDur = 1;
    this.yaw = 0;
    this.lb = document.getElementById('letterbox');
    this.sub = document.getElementById('subtitle');
    this.subWho = document.getElementById('sub-who');
    this.subText = document.getElementById('sub-text');
    this.skipEl = document.getElementById('sub-skip');
    this.onKey = (e) => {
      if (!this.steps || this.age < 0.8) return;
      if (e.type === 'keydown' && !['Enter', 'Escape', 'Space', 'KeyE'].includes(e.code)) return;
      if (e.type === 'keydown') e.preventDefault();
      this.skip();
    };
    window.addEventListener('keydown', this.onKey);
    if (this.lb) this.lb.addEventListener('pointerdown', this.onKey);
  }

  get active() {
    return !!this.steps;
  }

  play(steps, onEnd) {
    const G = this.G;
    this.steps = steps.slice();
    this.onEnd = onEnd || null;
    this.bg = [];
    this.cur = null;
    this.age = 0;
    this.camPos.copy(G.camera.position);
    G.camera.getWorldDirection(_a);
    this.camLook.copy(G.camera.position).addScaledVector(_a, 10);
    this.camTo = null;
    G.game.enterCutscene();
    G.ui.hideScreens();
    if (this.lb) this.lb.classList.add('on');
    if (this.skipEl) this.skipEl.hidden = false;
    this.next();
  }

  stop() {
    this.steps = null;
    this.cur = null;
    this.bg = [];
    if (this.lb) this.lb.classList.remove('on');
    this.hideSub();
    if (this.skipEl) this.skipEl.hidden = true;
  }

  hideSub() {
    if (this.sub) this.sub.hidden = true;
  }

  showSub(who, text) {
    if (!this.sub) return;
    this.sub.hidden = false;
    this.subWho.textContent = who || '';
    this.subWho.hidden = !who;
    this.subText.textContent = text;
  }

  startCam(c) {
    const G = this.G;
    const from = c.from ? { pos: new THREE.Vector3(...c.from.pos), look: new THREE.Vector3(...c.from.look) } : { pos: this.camPos.clone(), look: this.camLook.clone() };
    this.camFrom = from;
    this.camTo = { pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look) };
    this.camT = 0;
    this.camDur = Math.max(0.001, c.dur || 0.001);
    if (c.fov) this.fov = c.fov;
    void G;
  }

  // Avança para o próximo passo bloqueante, disparando os não bloqueantes no caminho.
  next() {
    const G = this.G;
    while (this.steps && this.steps.length) {
      const s = this.steps.shift();
      if (s.do) {
        s.do();
        continue;
      }
      if (s.cam) {
        this.startCam(s.cam);
        if (s.cam.async !== false) continue;
        this.cur = { kind: 'wait', t: 0, dur: s.cam.dur || 0 };
        return;
      }
      if (s.npc) {
        const n = G.npcs.get(s.npc);
        if (!n) continue;
        if (s.walk) {
          const st = { kind: 'npc', n, done: false };
          n.walk(s.walk, s.speed || 1.6, () => (st.done = true));
          if (s.async) continue;
          this.cur = st;
          return;
        }
        if (s.mode) n.setMode(s.mode);
        if (s.face) n.lookAt(s.face[0], s.face[1]);
        continue;
      }
      if (s.player) {
        const P = G.player,
          o = s.player;
        P.cine = P.cine || {};
        if (o.pose !== undefined) P.cine.pose = o.pose;
        if (o.face) P.cine.face = { x: o.face[0], z: o.face[1] };
        if (o.teleport) {
          P.pos.set(o.teleport[0], 0, o.teleport[1]);
          if (o.yaw !== undefined) P.yaw = o.yaw;
          P.vel.set(0, 0, 0);
        }
        if (o.walk) {
          const st = { kind: 'player', done: false, last: o.walk[o.walk.length - 1] };
          P.cine.path = o.walk.map((p) => ({ x: p[0], z: p[1] }));
          P.cine.speed = o.speed || 1.6;
          P.cine.onArrive = () => (st.done = true);
          if (s.async) continue;
          this.cur = st;
          return;
        }
        continue;
      }
      if (s.say) {
        this.showSub(s.say[0], s.say[1]);
        const n = G.npcs.list.find((k) => k.name === s.say[0]);
        if (n) n.talking = s.dur || 2.5;
        if (s.say[0] === 'Ryan') {
          G.player.cine = G.player.cine || {};
          G.player.cine.talkT = s.dur || 2.5;
        }
        this.cur = { kind: 'say', t: 0, dur: s.dur || Math.max(2.2, s.say[1].length * 0.055) };
        return;
      }
      if (s.fade !== undefined) {
        G.ui.fade(!!s.fade);
        this.cur = { kind: 'wait', t: 0, dur: s.dur ?? 0.8 };
        return;
      }
      if (s.wait !== undefined) {
        this.cur = { kind: 'wait', t: 0, dur: s.wait };
        return;
      }
    }
    this.finish();
  }

  finish() {
    if (!this.steps) return;
    const cb = this.onEnd;
    this.stop();
    this.G.player.endCinematic();
    if (cb) cb();
    else this.G.game.leaveCutscene();
  }

  // Pula a cena: roda as ações restantes e posiciona os NPCs no destino.
  skip() {
    const G = this.G;
    if (!this.steps) return;
    if (this.cur && this.cur.kind === 'npc' && this.cur.n.path) {
      const last = this.cur.n.path[this.cur.n.path.length - 1];
      this.cur.n.teleport(last.x, last.z);
      const cb = this.cur.n.onArrive;
      this.cur.n.onArrive = null;
      this.cur.n.mode = 'idle';
      if (cb) cb(this.cur.n);
    }
    const P = G.player;
    if (P.cine && P.cine.path && P.cine.path.length) {
      const last = P.cine.path[P.cine.path.length - 1];
      P.pos.set(last.x, 0, last.z);
      P.cine.path = null;
      P.cine.onArrive = null;
    }
    while (this.steps && this.steps.length) {
      const s = this.steps.shift();
      if (s.do) s.do();
      else if (s.player && s.player.walk) {
        const last = s.player.walk[s.player.walk.length - 1];
        P.pos.set(last[0], 0, last[1]);
      } else if (s.player && s.player.teleport) {
        P.pos.set(s.player.teleport[0], 0, s.player.teleport[1]);
        if (s.player.yaw !== undefined) P.yaw = s.player.yaw;
      } else if (s.npc) {
        const n = G.npcs.get(s.npc);
        if (!n) continue;
        if (s.walk) {
          const last = s.walk[s.walk.length - 1];
          n.teleport(last[0], last[1]);
          n.mode = 'idle';
        }
        if (s.mode) n.mode = s.mode;
        if (s.face) n.lookAt(s.face[0], s.face[1]);
      }
    }
    for (const n of G.npcs.list) {
      if (n.mode === 'walk' && n.path) {
        const last = n.path[n.path.length - 1];
        n.teleport(last.x, last.z);
        n.mode = 'idle';
      }
    }
    G.ui.fade(false);
    this.finish();
  }

  update(dt) {
    const G = this.G;
    if (!this.steps) return;
    this.age += dt;
    if (this.camTo) {
      this.camT += dt;
      const k = easeInOut(clamp(this.camT / this.camDur, 0, 1));
      this.camPos.lerpVectors(this.camFrom.pos, this.camTo.pos, k);
      this.camLook.lerpVectors(this.camFrom.look, this.camTo.look, k);
    }
    const cam = G.camera;
    cam.position.copy(this.camPos).add(G.fx.shakeOffset);
    cam.lookAt(this.camLook);
    if (this.fov && Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = lerp(cam.fov, this.fov, Math.min(1, dt * 3));
      cam.updateProjectionMatrix();
    }
    _b.copy(this.camLook).sub(this.camPos);
    this.yaw = Math.atan2(_b.x, _b.z);
    const c = this.cur;
    if (!c) return;
    if (c.kind === 'npc' || c.kind === 'player') {
      if (c.done) this.next();
      return;
    }
    c.t += dt;
    if (c.t >= c.dur) {
      if (c.kind === 'say') this.hideSub();
      this.next();
    }
  }

  listenerYaw() {
    return this.yaw;
  }
}
