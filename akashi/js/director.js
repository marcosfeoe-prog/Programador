// Diretor: transforma o roteiro (cenas → tomadas, falas e efeitos sonoros)
// numa imagem para cada instante t. Nada guarda estado entre quadros: a cada
// quadro tudo é zerado e a tomada atual posiciona câmera, personagens,
// objetos, efeitos, legendas e pós-processamento a partir do tempo.
import * as THREE from 'three';
import { clamp, hash, noise1, kf, range, smooth } from './util.js';
import { VW, VH } from './overlay.js';
import { POSE_CLOCK } from './character.js';
import { makeBag, makeBento, makeBentoLid, makeChopsticks, makeSandwich, makeGiftBox, makeBread, makeBooks, makeBook, makePipe, makeBat, makeChain, makePhone, makeCat } from './props.js';

export const SPEAKERS = {
  akashi: { name: 'Akashi', color: '#ff6a5a', char: 'akashi', pitch: 45, wave: 'sawtooth' },
  hana: { name: 'Hana', color: '#ffa8c8', char: 'hana', pitch: 76 },
  kenta: { name: 'Kenta', color: '#8ac8ff', char: 'kenta', pitch: 62 },
  tanaka: { name: 'Prof. Tanaka', color: '#d8c890', char: 'tanaka', pitch: 55, wave: 'triangle' },
  ryuji: { name: 'Ryuji', color: '#ffd84a', char: 'ryuji', pitch: 52, wave: 'sawtooth' },
  goro: { name: 'Goro', color: '#d8a070', char: 'goro', pitch: 43, wave: 'sawtooth' },
  shin: { name: 'Shin', color: '#c09af0', char: 'shin', pitch: 60 },
  yuuto: { name: 'Yuuto', color: '#9ae89a', char: 'yuuto', pitch: 70 },
  narr: { name: '', color: '#ffffff', pitch: 0 },
  aluno: { name: 'Aluno', color: '#d0d0d0', pitch: 60 },
  aluna: { name: 'Aluna', color: '#e8d0d8', pitch: 72 },
  x1: { name: 'Bandido', color: '#b0b0b0', char: 'thug1', pitch: 50 },
  x2: { name: 'Bandido', color: '#b0b0b0', char: 'thug2', pitch: 48 },
  kid: { name: 'Valentão', color: '#c0c0c0', char: 'kidBully1', pitch: 64 },
  kidakashi: { name: 'Akashi (criança)', color: '#ff8a7a', char: 'kidAkashi', pitch: 68 },
};

export class Director {
  constructor(o) {
    Object.assign(this, o); // stage, cast, students, fx, ov, post, camera
    this.scenes = [];
    this.shots = [];
    this.lines = [];
    this.sfx = [];
    this.allChars = [...Object.values(this.cast), ...this.students];
    for (const c of this.allChars) this.stage.scene.add(c.root);
    this.makeProps();
    this.ctx = this.makeCtx();
  }

  // ------------------------------------------------------------ objetos
  makeProps() {
    const C = this.cast;
    const P = {};
    P.bag = C.akashi.attach(makeBag(), 'r', [0, 0.0, 0.0], [0, 0, 0], true);
    P.bag.children.forEach((ch) => (ch.position.y -= 0.05));
    P.bagHand = C.akashi.attach(makeBag(), 'r', [0, 0.04, 0], [0, 0, 0], true);
    P.bento = C.akashi.attach(makeBento(true), 'l', [0, -0.02, 0.06], [-Math.PI / 2, 0, 0]);
    P.chop = C.akashi.attach(makeChopsticks(), 'r', [0, -0.04, 0.04], [Math.PI / 2 + 0.3, 0, 0]);
    P.sandA = C.akashi.attach(makeSandwich(), 'r', [0, -0.03, 0.04], [Math.PI / 2, 0, 0]);
    P.boxA = C.akashi.attach(makeBentoLid(), 'r', [0, -0.03, 0.06], [-Math.PI / 2, 0, 0]);
    P.gift = C.hana.attach(makeGiftBox(), 'r', [0.04, -0.03, 0.06], [-Math.PI / 2, 0, 0]);
    P.sandH = C.hana.attach(makeSandwich(), 'r', [0.05, -0.02, 0.06], [-Math.PI / 2, 0, 0]);
    P.hanaBag = C.hana.attach(makeBag(0x3a2a24), 'r', [0, 0.02, 0.0], [0, 0, 0], true);
    P.bread = C.kenta.attach(makeBread(), 'r', [0, -0.03, 0.04], [0, 0, 0]);
    P.booksY = C.yuuto.attach(makeBooks(), 'l', [0.02, -0.02, 0.1], [-Math.PI / 2, 0, 0]);
    P.bookA = C.akashi.attach(makeBook(0x3a6ab0), 'r', [0, -0.05, 0.06], [-Math.PI / 2, 0, 0]);
    P.pipe = C.ryuji.attach(makePipe(), 'r', [0, 0.02, 0], [Math.PI, 0, 0]);
    P.pipeA = C.akashi.attach(makePipe(0.5), 'r', [0, 0.25, 0], [Math.PI, 0, 0]);
    P.bat = C.thug1.attach(makeBat(), 'r', [0, 0.02, 0], [Math.PI, 0, 0]);
    P.chain = C.shin.attach(makeChain(), 'r', [0, -0.02, 0], [0, 0, 0]);
    P.phone = C.ryuji.attach(makePhone(), 'l', [0, -0.05, 0.03], [-1.2, 0, 0]);
    P.phoneS = C.shin.attach(makePhone(), 'l', [0, -0.05, 0.03], [-1.2, 0, 0]);
    // objetos soltos no mundo
    const W = (this.world = new THREE.Group());
    this.stage.scene.add(W);
    const add = (name, obj) => {
      obj.visible = false;
      W.add(obj);
      P[name] = obj;
      return obj;
    };
    add('wBag', makeBag());
    add('wBento', makeBento(true));
    add('wLid', makeBentoLid());
    add('wBooks', makeBooks());
    add('wBook1', makeBook(0x3a6ab0));
    add('wBook2', makeBook(0xc04040));
    add('wBook3', makeBook(0x40a060));
    add('wPipe', makePipe(0.5));
    add('wBat', makeBat());
    add('wChain', makeChain());
    add('cat', makeCat());
    add('wBread', makeBread());
    add('wHanaBag', makeBag(0x3a2a24));
    this.props = P;
  }

  // ------------------------------------------------------------ roteiro
  load(scenes) {
    this.scenes = scenes;
    this.shots = [];
    this.lines = [];
    this.sfx = [];
    for (const sc of scenes) {
      for (const sh of sc.shots) {
        const s = { ...sh, start: sc.start + sh.at, scene: sc };
        this.shots.push(s);
      }
      for (const [t, dur, who, text, o = {}] of sc.lines || []) {
        this.lines.push({ t: sc.start + t, dur, who, text, ...o, scene: sc });
      }
      for (const [t, i, o = {}] of sc.sfx || []) this.sfx.push({ t: sc.start + t, i, b: 's', ...o });
    }
    this.shots.sort((a, b) => a.start - b.start);
    for (let i = 0; i < this.shots.length; i++) {
      const s = this.shots[i];
      const next = this.shots[i + 1];
      s.end = s.dur !== undefined ? s.start + s.dur : next ? next.start : s.scene.start + s.scene.dur;
      s.dur = s.end - s.start;
    }
    this.lines.sort((a, b) => a.t - b.t);
  }

  // Bipes de "voz" para cada fala (para o AudioEngine).
  voiceEvents() {
    const out = [];
    for (const l of this.lines) {
      const sp = SPEAKERS[l.who];
      if (!sp || !sp.pitch || l.thought || l.noVoice) continue;
      const reveal = Math.min(l.dur * 0.8, l.text.length * 0.045);
      let k = 0;
      const chars = [...l.text];
      const step = reveal / Math.max(1, chars.length);
      let last = -1;
      chars.forEach((ch, i) => {
        if (!/[a-záéíóúâêôãõçà]/i.test(ch)) return;
        const t = l.t + i * step;
        if (t - last < 0.075) return;
        last = t;
        const up = l.text.trim().endsWith('?');
        out.push({ i: 'blip', t, n: sp.pitch + Math.round((hash(i * 3.7 + l.t) - 0.5) * 5), v: l.shout ? 0.7 : 0.45, wave: sp.wave, up, b: 'v' });
        k++;
      });
    }
    return out;
  }

  shotAt(t) {
    let lo = 0;
    let hi = this.shots.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (this.shots[m].start <= t) lo = m;
      else hi = m - 1;
    }
    return this.shots[lo];
  }

  linesAt(t) {
    return this.lines.filter((l) => t >= l.t && t < l.t + l.dur);
  }

  // ------------------------------------------------------------ contexto
  makeCtx() {
    const d = this;
    const cam = this.camera;
    const C = this.cast;
    const tmp = new THREE.Vector3();
    const tgt = new THREE.Vector3();
    const ctx = {
      d,
      cast: C,
      A: C.akashi,
      H: C.hana,
      K: C.kenta,
      T: C.tanaka,
      R: C.ryuji,
      G: C.goro,
      S: C.shin,
      Y: C.yuuto,
      X1: C.thug1,
      X2: C.thug2,
      st: this.students,
      props: this.props,
      fx: this.fx,
      ov: this.ov,
      post: this.post,
      stage: this.stage,
      camera: cam,
      target: tgt,
      roll: 0,
      // câmera direta
      cam(pos, target, fov = 40, roll = 0) {
        cam.position.set(pos[0], pos[1], pos[2]);
        tgt.set(target[0], target[1], target[2]);
        if (cam.fov !== fov) {
          cam.fov = fov;
          cam.updateProjectionMatrix();
        }
        this.roll = roll;
      },
      // câmera por quadros-chave: [[t, pos, target, fov, roll?], ...]
      camKF(lt, keys) {
        const p = kf(
          lt,
          keys.map((k) => [k[0], k[1], k[4]]),
        );
        const q = kf(
          lt,
          keys.map((k) => [k[0], k[2], k[4]]),
        );
        const f = kf(
          lt,
          keys.map((k) => [k[0], k[3] ?? 40, k[4]]),
        );
        const r = kf(
          lt,
          keys.map((k) => [k[0], k[5] ?? 0, k[4]]),
        );
        this.cam(p, q, f, r);
      },
      // Enquadra o rosto de um personagem: dist, yaw em graus (0 = de frente),
      // altura da câmera e do alvo em relação à cabeça, deslocamento lateral.
      face(ch, o = {}) {
        const { dist = 0.9, yaw = 0, h = 0, th = -0.03, fov = 30, side = 0, roll = 0 } = o;
        ch.headWorld(tmp);
        const f = ch.root.rotation.y + (yaw * Math.PI) / 180;
        const sx = Math.cos(f);
        const sz = -Math.sin(f);
        this.cam(
          [tmp.x + Math.sin(f) * dist + sx * side, tmp.y + h, tmp.z + Math.cos(f) * dist + sz * side],
          [tmp.x + sx * side * 0.6, tmp.y + th, tmp.z + sz * side * 0.6],
          fov,
          roll,
        );
      },
      // Por cima do ombro de "from" olhando para "to".
      ots(from, to, o = {}) {
        const { back = 0.7, side = 0.32, h = 0.08, fov = 34, th = -0.02 } = o;
        const a = from.headWorld(new THREE.Vector3());
        const b = to.headWorld(new THREE.Vector3());
        const dir = b.clone().sub(a).setY(0).normalize();
        const right = new THREE.Vector3(dir.z, 0, -dir.x);
        const p = a.clone().addScaledVector(dir, -back).addScaledVector(right, side);
        p.y += h;
        this.cam([p.x, p.y, p.z], [b.x, b.y + th, b.z], fov);
      },
      shake(k, f = 22, seed = 0) {
        if (k <= 0) return;
        const t = this.t;
        cam.position.x += noise1(t * f, 1 + seed) * k;
        cam.position.y += noise1(t * f, 2 + seed) * k;
        cam.position.z += noise1(t * f, 3 + seed) * k * 0.5;
        tgt.x += noise1(t * f, 4 + seed) * k * 0.6;
        tgt.y += noise1(t * f, 5 + seed) * k * 0.6;
      },
      handheld(k = 0.02) {
        this.shake(k, 0.9, 9);
      },
      // Posição na tela (coordenadas da camada 2D) de um ponto 3D.
      toScreen(v) {
        cam.updateMatrixWorld();
        const p = v.clone().project(cam);
        return { x: (p.x * 0.5 + 0.5) * VW, y: (-p.y * 0.5 + 0.5) * VH, z: p.z };
      },
      show(name) {
        const p = d.props[name];
        p.visible = true;
        return p;
      },
      set: null,
    };
    return ctx;
  }

  // ------------------------------------------------------------ quadro
  frame(t, dtPose = 0) {
    const shot = this.shotAt(t);
    const c = this.ctx;
    for (const ch of this.allChars) ch.reset();
    for (const o of this.world.children) o.visible = false;
    this.fx.begin(this.camera);
    this.ov.begin();
    this.post.reset();
    c.roll = 0;
    c.set = this.stage.use(shot.set, shot.env || {});
    c.set.reset?.();
    c.t = t;
    c.lt = t - shot.start;
    c.u = clamp(c.lt / shot.dur);
    c.st0 = t - shot.scene.start;
    c.shot = shot;
    // animação "em dois" (12 poses por segundo), como no anime
    POSE_CLOCK.t = t;
    POSE_CLOCK.shot = shot.start;
    POSE_CLOCK.twos = !!dtPose;
    c.lb = 0;
    c.noSubs = false;
    shot.run(c, c.lt, c.u);
    // falas
    const act = this.linesAt(t);
    let sub = null;
    for (const l of act) {
      const sp = SPEAKERS[l.who] || SPEAKERS.narr;
      const ch = sp.char && this.cast[l.char || sp.char];
      if (ch && !l.thought && l.mouth !== false && ch.root.visible) ch.st.talk = true;
      const age = t - l.t;
      const reveal = Math.min(l.dur * 0.8, l.text.length * 0.045);
      sub = { name: l.name ?? sp.name, color: sp.color, text: l.text, thought: !!l.thought, age, dur: l.dur, shown: clamp(age / Math.max(0.01, reveal)) };
    }
    this.camera.lookAt(c.target);
    if (c.roll) this.camera.rotateZ(c.roll);
    for (const ch of this.allChars) ch.update(t);
    this.fx.end();
    this.stage.update(t, this.camera, c);
    this.sub = c.noSubs ? null : sub;
    this.lb = c.lb;
    this.shot = shot;
    return shot;
  }
}
