// A porta sozinha no meio do nada: aparece quando as lembranças são encontradas,
// abre derramando luz e leva ao próximo lugar quando o jogador passa por ela.
import * as THREE from 'three';
import { box, roundBox, cylinder } from '../engine/geo.js';
import { std, glow, additive } from '../engine/materials.js';
import * as TX from '../engine/textures.js';

export class Door {
  constructor(o = {}) {
    const P = (this.opts = {
      x: 0, z: 0, y: 0, yaw: 0,
      frame: '#f3eef0', leaf: '#f6f1f3', knob: '#d8c08a',
      light: '#fff6fb', lightIntensity: 7, beam: true, beamColor: '#ffd6ea',
      width: 0.92, height: 2.06,
      ...o,
    });
    const g = (this.group = new THREE.Group());
    g.position.set(P.x, P.y, P.z);
    g.rotation.y = P.yaw;
    const W = P.width, H = P.height, J = 0.09, T = 0.15;
    const frameMat = std(P.frame, { roughness: 0.55 });
    const leafMat = std(P.leaf, { roughness: 0.5, normalMap: TX.wood().normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
    this.root = new THREE.Group();
    g.add(this.root);
    const add = (geo, mat, x, y, z, parent = this.root) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add(roundBox(J, H + J, T, 0.015, 1), frameMat, -(W / 2 + J / 2), (H + J) / 2, 0);
    add(roundBox(J, H + J, T, 0.015, 1), frameMat, W / 2 + J / 2, (H + J) / 2, 0);
    add(roundBox(W + J * 2 + 0.06, J + 0.03, T + 0.02, 0.015, 1), frameMat, 0, H + J / 2, 0);
    add(box(W + J * 2, 0.03, T + 0.06), std('#bcb4b6', { roughness: 0.8 }), 0, 0.015, 0);
    // folha com almofadas
    this.hinge = new THREE.Group();
    this.hinge.position.set(-W / 2, 0, 0.02);
    this.root.add(this.hinge);
    const LW = W - 0.012;
    add(roundBox(LW, H - 0.012, 0.045, 0.01, 1), leafMat, LW / 2, H / 2, 0, this.hinge);
    const mold = std(P.leaf, { roughness: 0.45 });
    for (const zf of [-1, 1]) {
      for (const [py, ph] of [[0.55, 0.78], [1.45, 0.86]]) {
        for (const px of [0.25, 0.65]) {
          add(roundBox(0.3, ph, 0.012, 0.005, 1), mold, px * (LW / 0.9), py, zf * 0.027, this.hinge);
        }
      }
    }
    const knobMat = std(P.knob, { metalness: 1, roughness: 0.25 });
    for (const zf of [-1, 1]) add(new THREE.SphereGeometry(0.03, 12, 8), knobMat, LW - 0.08, 1.0, zf * 0.06, this.hinge);
    // luz do outro lado
    this.lightMat = glow(P.light, 0);
    const lp = add(new THREE.PlaneGeometry(W, H), this.lightMat, 0, H / 2, -0.01);
    lp.castShadow = false;
    // luz derramada no chão
    this.spillMat = additive(TX.radial('rgba(255,240,250,0.9)', 'rgba(255,240,250,0)', 128), P.light, 0);
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.8), this.spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(0.3, 0.03, 2.2);
    spill.renderOrder = 2;
    this.root.add(spill);
    this.point = new THREE.PointLight(P.light, 0, 10, 1.6);
    this.point.position.set(0, 1.2, 1.0);
    this.root.add(this.point);
    // coluna de luz visível de longe
    if (P.beam) {
      const c = TX.makeCanvas(64, 256);
      const ctx = c.getContext('2d');
      const gr = ctx.createLinearGradient(0, 256, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 256);
      const gx = ctx.getImageData(0, 0, 64, 256);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 64; x++) {
          const k = Math.sin((x / 63) * Math.PI);
          gx.data[(y * 64 + x) * 4 + 3] *= k * k;
        }
      }
      ctx.putImageData(gx, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.beamMat = additive(tex, P.beamColor, 0);
      this.beamMat.side = THREE.DoubleSide;
      this.beam = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 60), this.beamMat);
        b.position.y = 30;
        b.rotation.y = i * Math.PI * 0.5;
        this.beam.add(b);
      }
      this.beam.renderOrder = 3;
      g.add(this.beam);
    }
    this.state = 'hidden';
    this.root.visible = false;
    this.root.scale.set(1, 0.001, 1);
    this.k = 0;
    this.open = 0;
    this.prevLz = null;
    this.entered = false;
    this.onEnter = null;
    this._inv = new THREE.Matrix4();
    this._v = new THREE.Vector3();
  }

  show(instant = false) {
    if (this.state !== 'hidden') return;
    this.root.visible = true;
    this.state = instant ? 'open' : 'rising';
    if (instant) {
      this.k = 1;
      this.open = 1;
    }
  }

  // empurra o jogador para fora da madeira (batentes e, se fechada, a folha)
  collide(p, r) {
    if (this.state === 'hidden') return;
    this.group.updateMatrixWorld();
    this._inv.copy(this.group.matrixWorld).invert();
    const v = this._v.set(p.x, 0, p.z).applyMatrix4(this._inv);
    const W = this.opts.width;
    const pushCircle = (cx, cz, cr) => {
      const dx = v.x - cx, dz = v.z - cz;
      const d = Math.hypot(dx, dz), rr = cr + r;
      if (d < rr && d > 1e-6) {
        v.x = cx + (dx / d) * rr;
        v.z = cz + (dz / d) * rr;
      }
    };
    pushCircle(-(W / 2 + 0.05), 0, 0.1);
    pushCircle(W / 2 + 0.05, 0, 0.1);
    if (this.open < 0.5 && Math.abs(v.x) < W / 2 + 0.1 && Math.abs(v.z) < r + 0.05) v.z = Math.sign(v.z || 1) * (r + 0.05);
    v.applyMatrix4(this.group.matrixWorld);
    p.x = v.x;
    p.z = v.z;
  }

  update(dt, t, player) {
    if (this.state === 'hidden') return;
    if (this.state === 'rising') {
      this.k = Math.min(1, this.k + dt * 0.5);
      if (this.k >= 1) this.state = 'opening';
    } else if (this.state === 'opening') {
      this.open = Math.min(1, this.open + dt * 0.45);
      if (this.open >= 1) this.state = 'open';
    }
    const e = this.k * this.k * (3 - 2 * this.k);
    this.root.scale.set(1, Math.max(0.001, e), 1);
    const o = this.open * this.open * (3 - 2 * this.open);
    this.hinge.rotation.y = -o * 1.35;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);
    this.lightMat.emissiveIntensity = this.opts.lightIntensity * (0.15 + o * 0.85) * pulse * e;
    this.spillMat.opacity = o * 0.55 * pulse;
    this.point.intensity = o * 5 * pulse;
    if (this.beamMat) this.beamMat.opacity = e * (0.18 + 0.1 * Math.sin(t * 1.3)) * (0.4 + o * 0.6);
    // passagem pela abertura (da frente para trás)
    if (this.open > 0.6 && player && !this.entered) {
      this.group.updateMatrixWorld();
      this._inv.copy(this.group.matrixWorld).invert();
      const v = this._v.set(player.pos.x, 0, player.pos.z).applyMatrix4(this._inv);
      const inside = Math.abs(v.x) < this.opts.width / 2 + 0.05;
      if (this.prevLz !== null && inside && this.prevLz > 0 && v.z <= 0.02) {
        this.entered = true;
        if (this.onEnter) this.onEnter();
      }
      this.prevLz = v.z;
    }
  }

  get worldPos() {
    return this.group.position;
  }
}
