// Sorridente (Nível 1): só existe no escuro. Dois olhos e um sorriso que
// brilham, sobre uma sombra que respira. Pisca, alarga o sorriso, treme e se
// aproxima devagar; luz forte da lanterna o faz recuar e sumir.
import * as THREE from 'three';
import { smilerFace } from '../textures.js';
import { clamp, damp, lerp, smoothstep, noise1, rng } from '../util.js';

let FACE = null, SHADOW = null;
function shadowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,0.95)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export class Smiler {
  constructor(level, seed = 1) {
    this.level = level;
    this.game = level.game;
    this.r = rng(seed);
    this.pos = new THREE.Vector3();
    this.active = false;
    this.threat = 0;
    this.chasing = false;
    if (!FACE) {
      FACE = smilerFace();
      SHADOW = shadowTex();
    }
    this.group = new THREE.Group();
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), new THREE.MeshBasicMaterial({ map: SHADOW, transparent: true, depthWrite: false, fog: false }));
    this.shadow.position.z = -0.05;
    // olhos e boca em quads separados (piscar e esticar o sorriso)
    const mk = (u0, v0, u1, v1, w, h) => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(v0, v1, uv.getY(i)));
      return new THREE.Mesh(g, this.faceMat);
    };
    this.faceMat = new THREE.MeshBasicMaterial({ map: FACE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(3, 3, 2.8), fog: false });
    this.eyes = mk(0, 0.55, 1, 1, 0.9, 0.2);
    this.eyes.position.y = 0.2;
    this.mouth = mk(0, 0, 1, 0.55, 0.9, 0.25);
    this.mouth.position.y = -0.04;
    this.eyes.material = this.mouth.material = this.faceMat;
    this.face = new THREE.Group();
    this.face.add(this.shadow, this.eyes, this.mouth);
    this.group.add(this.face);
    this.group.visible = false;
    this.lightT = 0;
    this.fade = 0;
    this.blinkT = 2;
    this.voice = null;
  }

  get object() {
    return this.group;
  }

  spawn(x, z) {
    this.pos.set(x, 1.55 + this.r.range(-0.15, 0.15), z);
    this.active = true;
    this.dying = 0;
    this.fade = 0;
    this.lightT = 0;
    this.group.visible = true;
    this.t = 0;
    if (!this.voice) this.voice = this.game.audio.voice('smiler');
    this.game.audio.whisper(x, 1.6, z, 1);
  }

  vanish(scream) {
    if (!this.active || this.dying) return;
    this.dying = 0.001;
    if (scream) this.game.audio.whisper(this.pos.x, this.pos.y, this.pos.z, 2);
  }

  update(dt) {
    if (!this.active) {
      this.chasing = false;
      this.threat = 0;
      return;
    }
    const pl = this.game.player, cam = this.game.camera;
    this.t += dt;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.threat = this.dying ? 0 : 1;
    this.chasing = !this.dying && d < 8;
    this.chaseLevel = clamp(1 - d / 10, 0, 1);
    if (this.dying) {
      this.dying += dt;
      this.fade = Math.max(0, 1 - this.dying / 0.6);
      if (this.dying > 0.6) {
        this.active = false;
        this.group.visible = false;
        if (this.voice) this.voice.set(this.pos.x, this.pos.y, this.pos.z, 0);
        return;
      }
    } else {
      this.fade = Math.min(1, this.fade + dt * 0.8);
      // aproxima pelo caminho livre; acelera quando o jogador está no escuro
      const L = this.level;
      const darkHere = L.lightLevel(pl.pos.x, pl.pos.z) < 0.12;
      const sp = (darkHere ? 1.1 : 0.55) * (d > 9 ? 1.6 : 1);
      if (d > 0.9) {
        const nav = L.nav;
        let mx = dx / d, mz = dz / d;
        if (nav && !L.grid.visible(this.pos.x, 1.5, this.pos.z, pl.pos.x, 1.5, pl.pos.z)) {
          const f = nav.field(pl.pos.x, pl.pos.z, 'smiler', 0.5, L.time);
          const g = nav.descend(f, this.pos.x, this.pos.z);
          if (g) {
            mx = g.x;
            mz = g.z;
          }
        }
        this.pos.x += mx * sp * dt;
        this.pos.z += mz * sp * dt;
      }
      // luz da lanterna no rosto
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const tx = this.pos.x - cam.position.x, ty = this.pos.y - cam.position.y, tz = this.pos.z - cam.position.z;
      const tl = Math.hypot(tx, ty, tz);
      const inBeam = this.game.vm.flicker > 0.5 && (tx * fwd.x + ty * fwd.y + tz * fwd.z) / tl > Math.cos(0.42) && tl < 14 && L.grid.visible(cam.position.x, cam.position.y, cam.position.z, this.pos.x, this.pos.y, this.pos.z);
      this.lightT = inBeam ? this.lightT + dt : Math.max(0, this.lightT - dt * 0.5);
      if (this.lightT > 0.7) this.vanish(true);
      // área iluminada: some
      if (L.lightLevel(this.pos.x, this.pos.z) > 0.25) this.vanish(false);
      // pega o jogador
      if (d < 1.0 && pl.alive) {
        this.game.audio.jumpscare();
        this.game.onHurt(45, this.pos);
        if (!pl.alive) L.killer = this;
        this.game.ui.flash('#fff', 0.8, 400);
        this.vanish(false);
      }
    }
    // animação: tremor, piscar, sorriso que estica, reação à luz
    const t = this.t;
    const jit = (noise1(t * 13, 1) - 0.5) * 0.03 + (this.lightT > 0 ? (Math.random() - 0.5) * 0.08 : 0);
    this.group.position.set(this.pos.x + jit, this.pos.y + Math.sin(t * 1.3) * 0.04 + jit, this.pos.z);
    this.group.quaternion.copy(cam.quaternion);
    this.blinkT -= dt;
    if (this.blinkT <= 0) this.blinkT = this.r.range(1.5, 5);
    const blink = this.blinkT < 0.15 ? Math.abs(this.blinkT - 0.075) / 0.075 : 1;
    this.eyes.scale.set(1 + this.lightT * 0.3, Math.max(0.08, blink) * (1 - this.lightT * 0.5), 1);
    const grin = 1 + Math.sin(t * 0.9) * 0.08 + smoothstep(6, 1.5, d) * 0.35;
    this.mouth.scale.set(grin, 1 + (grin - 1) * 0.6, 1);
    const flick = this.lightT > 0 ? (Math.random() < 0.3 ? 0.2 : 1) : 1;
    this.faceMat.opacity = this.fade * flick;
    this.shadow.material.opacity = this.fade * 0.85;
    const s = 1 - (this.dying ? smoothstep(0, 0.6, this.dying) * 0.6 : 0);
    this.face.scale.setScalar(s);
    if (this.voice) this.voice.set(this.pos.x, this.pos.y, this.pos.z, this.fade * clamp(1.2 - d / 12, 0, 1) * 0.6);
  }

  dispose() {
    if (this.voice) this.voice.stop();
  }
}
