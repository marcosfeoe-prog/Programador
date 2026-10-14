// Nível 5 — "O Hóspede": figura alta, de terno escuro dos anos 1920 e chapéu,
// que surge no fim dos corredores. Só se move quando ninguém está olhando
// (anda pelos corredores em direção ao jogador); perto dele as luzes piscam.
// Se encostar, assusta, tira sanidade e some. Também some sozinho.
import * as THREE from 'three';
import { GeoBuilder, litMaterial } from '../materials.js';
import { textCanvasTex } from '../textures.js';
import { clamp } from '../util.js';

const _f = new THREE.Vector3();
const SPEED = 2.6; // m/s quando não é observado (um pouco mais que andar, bem menos que correr)

export class Guest {
  // L: o nível (precisa de cellKind, passable, los, lightLevel, cell, HALL)
  constructor(L, faceURL) {
    this.L = L;
    this.game = L.game;
    this.faceURL = faceURL;
    this.state = 0; // 0 = ausente, 1 = presente
    this.timer = 30;
    this.build();
  }

  build() {
    const Q = this.game.Q;
    // luz "local": textura 1×1 que o shader de lightmap lê; a intensidade vem do nível
    const d = new Uint8Array([128, 0, 0, 0]);
    this.lmTex = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.lmTex.colorSpace = THREE.NoColorSpace;
    this.lmTex.needsUpdate = true;
    const gb = new GeoBuilder();
    const suit = [0.035, 0.035, 0.042];
    const dark = [0.02, 0.02, 0.024];
    const shirt = [0.75, 0.72, 0.64];
    const skin = [0.62, 0.58, 0.52];
    const box = (x, y, z, sx, sy, sz, c, rot = 0) => gb.box(x, y, z, sx, sy, sz, c, null, { rot, ao: 0 });
    const m = new THREE.Matrix4();
    const cyl = (rt, rb, h, n, x, y, z, sz, c, rz = 0) => {
      m.makeRotationZ(rz).premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
      m.multiply(new THREE.Matrix4().makeScale(1, 1, sz));
      gb.addGeometry(new THREE.CylinderGeometry(rt, rb, h, n), m, c);
    };
    // pernas e sapatos
    for (const s of [-1, 1]) {
      cyl(0.075, 0.068, 1.02, 8, s * 0.1, 0.55, 0, 1, suit);
      box(s * 0.1, 0.04, 0.05, 0.12, 0.08, 0.3, dark);
    }
    // paletó comprido: abas, tronco afunilado e ombros largos
    cyl(0.25, 0.27, 0.36, 10, 0, 1.0, 0, 0.6, suit);
    cyl(0.32, 0.24, 0.62, 10, 0, 1.47, 0, 0.55, suit);
    box(0, 1.76, -0.005, 0.66, 0.08, 0.3, suit);
    // camisa, gravata e lenço de bolso
    box(0, 1.6, 0.165, 0.12, 0.26, 0.01, shirt);
    box(0, 1.52, 0.172, 0.045, 0.4, 0.01, [0.22, 0.02, 0.03]);
    box(0.17, 1.58, 0.15, 0.07, 0.03, 0.01, shirt, -0.3);
    // braços longos demais, mãos pálidas na altura dos joelhos
    for (const s of [-1, 1]) {
      cyl(0.065, 0.05, 0.92, 8, s * 0.34, 1.28, 0, 1, suit, s * 0.04);
      box(s * 0.36, 0.76, 0.01, 0.08, 0.16, 0.11, skin);
      box(s * 0.36, 0.64, 0.02, 0.06, 0.1, 0.08, skin);
    }
    // pescoço, cabeça e chapéu-coco
    gb.cylinder(0, 1.84, 0, 0.055, 0.14, skin, null, { sides: 8 });
    gb.addGeometry(new THREE.SphereGeometry(1, 12, 10), m.makeScale(0.105, 0.135, 0.12).setPosition(0, 2.0, 0), skin);
    gb.cylinder(0, 2.15, 0, 0.115, 0.1, dark, null, { sides: 14 });
    gb.addGeometry(
      new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      m.makeScale(0.115, 0.06, 0.115).setPosition(0, 2.2, 0),
      dark,
    );
    gb.cylinder(0, 2.1, 0, 0.2, 0.015, dark, null, { sides: 16 });
    gb.cylinder(0, 2.115, 0, 0.118, 0.025, [0.2, 0.04, 0.04], null, { sides: 14 });
    this.mat = litMaterial(Q, { vertexColors: true, roughness: 0.7, lightMap: this.lmTex });
    this.lmTex.channel = 0;
    const body = new THREE.Mesh(gb.build(), this.mat);
    // rosto: olhos fundos e sorriso largo demais
    this.faceTex = textCanvasTex(64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = 'rgba(10,8,8,0.92)';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(w / 2 + s * 12, 26, 7, 5, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(250,245,230,1)';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.arc(w / 2 + s * 12, 26, 1.3, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = 'rgba(12,6,6,0.95)';
      c.beginPath();
      c.moveTo(12, 42);
      c.quadraticCurveTo(w / 2, 62, w - 12, 42);
      c.quadraticCurveTo(w / 2, 50, 12, 42);
      c.fill();
      c.strokeStyle = 'rgba(230,222,205,0.9)';
      c.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        const x = 12 + ((w - 24) * i) / 10;
        c.beginPath();
        c.moveTo(x, 44 + Math.sin((i / 10) * Math.PI) * 4);
        c.lineTo(x, 46 + Math.sin((i / 10) * Math.PI) * 9);
        c.stroke();
      }
    });
    this.faceMat = litMaterial(Q, { map: this.faceTex, lightMap: this.lmTex });
    this.faceMat.transparent = true;
    this.faceMat.depthWrite = false;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.24), this.faceMat);
    face.position.set(0, 1.99, 0.118);
    face.renderOrder = 2;
    const g = new THREE.Group();
    g.add(body, face);
    g.scale.set(0.95, 1.08, 0.95);
    g.visible = false;
    this.mesh = g;
    this.L.dynamic.add(g);
  }

  reset() {
    this.hide();
    this.timer = 40;
  }

  hide() {
    this.state = 0;
    this.mesh.visible = false;
    this.path = null;
  }

  dispose() {
    this.L.dynamic.remove(this.mesh);
    this.mesh.traverse((o) => o.geometry && o.geometry.dispose());
    this.mat.dispose();
    this.faceMat.dispose();
    this.faceTex.dispose();
    this.lmTex.dispose();
  }

  // Procura um ponto no fim de um corredor reto, a 12–26 m, com linha de visão.
  trySpawn(P) {
    const L = this.L;
    const c = L.cell;
    const pcx = Math.floor(P.pos.x / c);
    const pcz = Math.floor(P.pos.z / c);
    P.forward(_f);
    const fl = Math.hypot(_f.x, _f.z) || 1;
    const cands = [];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      let x = pcx;
      let z = pcz;
      let best = null;
      for (let k = 1; k <= 10; k++) {
        if (!L.passable(x, z, x + dx, z + dz)) break;
        x += dx;
        z += dz;
        if (L.cellKind(x, z) !== L.HALL) break;
        const wx = x * c + c / 2;
        const wz = z * c + c / 2;
        const d = Math.hypot(wx - P.pos.x, wz - P.pos.z);
        if (d >= 12 && L.los(P.pos.x, P.pos.z, wx, wz, 1.6)) best = { x: wx, z: wz, d };
      }
      if (best) {
        // surge fora do campo de visão (o jogador o descobre ao virar); dentro
        // dele, só bem longe, onde a névoa esconde o aparecimento
        const dot = ((best.x - P.pos.x) * _f.x + (best.z - P.pos.z) * _f.z) / (best.d * fl);
        best.w = dot < 0.3 ? 2 : 1;
        if (best.w === 2 || best.d >= 20) cands.push(best);
      }
    }
    if (!cands.length) return false;
    cands.sort((a, b) => b.w - a.w || Math.random() - 0.5);
    const s = cands[0];
    this.mesh.position.set(s.x, 0, s.z);
    this.mesh.rotation.y = Math.atan2(P.pos.x - s.x, P.pos.z - s.z);
    this.mesh.visible = true;
    this.state = 1;
    this.life = 0;
    this.seenT = 0;
    this.stung = false;
    this.stepT = 0;
    this.pathT = 0;
    this.path = null;
    this.away = 0;
    return true;
  }

  // Caminho (BFS pelos corredores) até a célula do jogador.
  findPath(P) {
    const L = this.L;
    const c = L.cell;
    const sx = Math.floor(this.mesh.position.x / c);
    const sz = Math.floor(this.mesh.position.z / c);
    const tx = Math.floor(P.pos.x / c);
    const tz = Math.floor(P.pos.z / c);
    const key = (x, z) => (x + 4096) * 8192 + (z + 4096);
    const prev = new Map([[key(sx, sz), null]]);
    const q = [[sx, sz]];
    let found = null;
    for (let h = 0; h < q.length && h < 900; h++) {
      const [x, z] = q[h];
      if (x === tx && z === tz) {
        found = [x, z];
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const nz = z + dz;
        const k = key(nx, nz);
        if (prev.has(k)) continue;
        if (Math.abs(nx - sx) > 16 || Math.abs(nz - sz) > 16) continue;
        if (!L.passable(x, z, nx, nz)) continue;
        if (L.cellKind(nx, nz) !== L.HALL && !(nx === tx && nz === tz)) continue;
        prev.set(k, [x, z]);
        q.push([nx, nz]);
      }
    }
    if (!found) return null;
    const path = [];
    let cur = found;
    while (cur) {
      path.push(cur);
      cur = prev.get(key(cur[0], cur[1]));
    }
    path.reverse();
    return path;
  }

  // dt, jogador, permitido (o nível decide se ele pode aparecer agora)
  update(dt, P, allowed) {
    const g = this.game;
    const L = this.L;
    const m = this.mesh;
    if (this.state === 0) {
      this.timer -= dt;
      if (this.timer > 0) return null;
      this.timer = 4;
      if (allowed && this.trySpawn(P)) {
        g.audio.crackle(0.8);
        this.timer = 0;
      }
      return null;
    }
    this.life += dt;
    const dx = m.position.x - P.pos.x;
    const dz = m.position.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    P.forward(_f);
    const fl = Math.hypot(_f.x, _f.z) || 1;
    const dot = (dx * _f.x + dz * _f.z) / (Math.max(d, 0.01) * fl);
    const los = L.los(P.pos.x, P.pos.z, m.position.x, m.position.z, 1.6);
    const seen = los && dot > 0.32;
    // luz local (lightmap + piscadas)
    const lit = L.lightLevel(m.position.x, m.position.z) * g.power;
    this.mat.lightMapIntensity = 0.2 + lit * 0.8;
    this.faceMat.lightMapIntensity = 0.3 + lit * 1.0;
    if (seen) {
      this.seenT += dt;
      if (!this.stung && this.seenT > 0.2) {
        this.stung = true;
        g.audio.sting();
        g.addSanity(-3);
      }
    } else {
      // anda pelos corredores em direção ao jogador
      this.pathT -= dt;
      if (this.pathT <= 0 || !this.path) {
        this.pathT = 0.35;
        this.path = this.findPath(P);
      }
      let tx = P.pos.x;
      let tz = P.pos.z;
      if (this.path && this.path.length > 2 && !L.los(m.position.x, m.position.z, P.pos.x, P.pos.z, 1.0)) {
        const c = L.cell;
        tx = this.path[1][0] * c + c / 2;
        tz = this.path[1][1] * c + c / 2;
      }
      const ddx = tx - m.position.x;
      const ddz = tz - m.position.z;
      const dl = Math.hypot(ddx, ddz);
      if (dl > 0.01 && (this.path || d < 3)) {
        const step = Math.min(dl, SPEED * dt);
        const p = { x: m.position.x + (ddx / dl) * step, z: m.position.z + (ddz / dl) * step };
        L.collide(p, 0.28);
        m.position.x = p.x;
        m.position.z = p.z;
        m.rotation.y = Math.atan2(-dx, -dz);
        // passos abafados quando está perto
        this.stepT -= dt;
        if (this.stepT <= 0 && d < 15) {
          this.stepT = 0.62;
          const yaw = P.yaw;
          const pan = clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(d, 1), -1, 1);
          const st = g.audio.B && g.audio.B.step;
          if (st) g.audio.play(st.wood || st.carpet, { gain: 0.32 * (1 - d / 15), rate: 0.75, pan, wet: 0.6 });
        }
      }
    }
    // encostou: susto e some
    if (d < 0.8) {
      g.caught({ image: this.faceURL, text: 'O Hóspede pousou a mão fria no seu ombro. "Seu quarto está pronto."', sanity: 35 });
      this.hide();
      this.timer = 50 + Math.random() * 30;
      return null;
    }
    // some sozinho (nunca diante dos olhos do jogador)
    if (!allowed) this.away += dt;
    else this.away = 0;
    if (!seen && (this.life > 45 || d > 34 || this.away > 5)) {
      this.hide();
      this.timer = 35 + Math.random() * 40;
      return null;
    }
    return { d, x: m.position.x, z: m.position.z, seen };
  }
}
