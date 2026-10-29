// Nível 57 — "O Gigante": uma figura de 3,5 m, totalmente negra, que fica
// parada no escuro só olhando. Dela só se veem os olhos, dois pontos vermelhos.
// Não ataca: se o andarilho chega perto (ou aponta a lanterna), ela recua
// devagar, de costas, como se tivesse medo, e some no escuro.
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { clamp, damp } from '../util.js';

function glowTex() {
  const c = TEX.makeCanvas(64, 64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,240,1)');
  g.addColorStop(0.2, 'rgba(255,40,30,0.9)');
  g.addColorStop(1, 'rgba(255,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return TEX.toTex(c, { repeat: false });
}

export class Giant {
  // spots: [{x, z, y}] lugares escuros onde ele pode aparecer
  constructor(L, spots) {
    this.L = L;
    this.game = L.game;
    this.spots = spots;
    this.state = 'off';
    this.t = 0;
    this.cool = 25;
    this.k = 0;
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.mats = [black];
    this.geos = [];
    const g = new THREE.Group();
    const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => {
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, black);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      parent.add(m);
      return m;
    };
    // corpo comprido, ombros caídos, braços que quase tocam o chão
    add(new THREE.CapsuleGeometry(0.32, 1.3, 6, 12), 0, 2.15, 0, 1.2, 1, 0.75);
    add(new THREE.CapsuleGeometry(0.2, 0.9, 6, 10), 0, 1.15, 0, 1.1, 1, 0.8);
    for (const s of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.1, 1.4, 4, 8), s * 0.16, 0.7, 0);
      const arm = add(new THREE.CapsuleGeometry(0.075, 1.9, 4, 8), s * 0.52, 1.75, 0);
      arm.rotation.z = s * 0.08;
    }
    const head = new THREE.Group();
    head.position.set(0, 3.15, 0);
    g.add(head);
    add(new THREE.SphereGeometry(0.24, 14, 12), 0, 0, 0, 0.9, 1.25, 0.95, head);
    // olhos: pequenos, vermelhos e brilhantes (o resto não se vê)
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.2), fog: false });
    const gt = glowTex();
    this.tex = gt;
    const glowM = new THREE.SpriteMaterial({ map: gt, color: 0xff3020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.mats.push(eyeM, glowM);
    this.eyes = [];
    const eg = new THREE.SphereGeometry(0.035, 8, 6);
    this.geos.push(eg);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(eg, eyeM);
      e.position.set(s * 0.085, 0.04, 0.21);
      head.add(e);
      const sp = new THREE.Sprite(glowM);
      sp.position.copy(e.position);
      sp.scale.set(0.32, 0.32, 1);
      head.add(sp);
      this.eyes.push(e, sp);
    }
    this.eyeM = eyeM;
    this.glowM = glowM;
    this.head = head;
    this.g = g;
    g.visible = false;
    L.dynamic.add(g);
  }

  // aparece num lugar escuro, de onde dá para ver o andarilho
  appear(player, near = false) {
    const P = player.pos;
    const L = this.L;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const cand = this.spots.filter((s) => {
      if (Math.abs((s.y || 0) - P.y) > 2) return false;
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      if (d < (near ? 9 : 12) || d > (near ? 22 : 38)) return false;
      if (!L.M.clear(P.x, P.z, s.x, s.z, 0.1)) return false;
      if (!L.dark(s.x, s.z)) return false;
      // de preferência na frente, mas não exatamente no centro da tela
      const dot = ((s.x - P.x) * fx + (s.z - P.z) * fz) / d;
      return dot > -0.2;
    });
    if (!cand.length) return false;
    const s = cand[Math.floor(Math.random() * cand.length)];
    this.x = s.x;
    this.z = s.z;
    this.y = s.y || 0;
    this.state = 'watch';
    this.t = 0;
    this.k = 0;
    this.g.visible = true;
    return true;
  }

  hide() {
    this.state = 'off';
    this.g.visible = false;
    this.cool = 30 + Math.random() * 40;
  }

  update(dt, player, blackout) {
    const g = this.game;
    const P = player.pos;
    this.t += dt;
    if (this.state === 'off') {
      this.cool -= dt * (blackout ? 4 : 1);
      if (this.cool <= 0) {
        if (!this.appear(player, blackout)) this.cool = 6;
      }
      return;
    }
    const dx = P.x - this.x;
    const dz = P.z - this.z;
    const d = Math.hypot(dx, dz);
    // sempre virado para o andarilho, o olhar fixo
    const yaw = Math.atan2(dx, dz);
    this.g.rotation.y = yaw;
    this.head.rotation.x = clamp(Math.atan2(3.15 + this.y - (P.y + 1.6), d), -0.3, 0.5) * 0.6;
    // a lanterna em cima dele também o espanta
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const lit = player.flashOn && d < 18 && (-dx * fx + -dz * fz) / Math.max(d, 0.01) > 0.93;
    if (this.state === 'watch') {
      this.k = damp(this.k, 1, 1.5, dt);
      if (d < 8 || lit) {
        this.state = 'flee';
        this.t = 0;
        g.audio.play('creak', { gain: 0.12, rate: 0.45, wet: 1.4 });
        if (this.L.onGiantFlee) this.L.onGiantFlee();
      } else if (this.t > 45 && !this.onScreen(player)) this.hide();
      else if (!this.L.dark(this.x, this.z)) this.hide();
      if (this.L.onGiantWatch) this.L.onGiantWatch(d);
      g.st.fear = Math.max(g.st.fear || 0, clamp(1 - d / 30, 0.15, 0.55));
    } else if (this.state === 'flee') {
      // recua de costas, devagar, sem tirar os olhos
      const ux = -dx / Math.max(d, 0.01);
      const uz = -dz / Math.max(d, 0.01);
      const sp = 1.3 + this.t * 0.4;
      const nx = this.x + ux * sp * dt;
      const nz = this.z + uz * sp * dt;
      if (this.L.M.sdf(nx, nz) < -0.6) {
        this.x = nx;
        this.z = nz;
      }
      this.k = damp(this.k, this.t > 2.2 ? 0 : 1, 2.5, dt);
      if (this.t > 4) this.hide();
    }
    this.g.position.set(this.x, this.y, this.z);
    this.eyeM.color.setRGB(3 * this.k, 0.25 * this.k, 0.2 * this.k);
    this.glowM.opacity = 0.85 * this.k;
  }

  onScreen(player) {
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const dx = this.x - player.pos.x;
    const dz = this.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    return (dx * fx + dz * fz) / Math.max(d, 0.01) > 0.6;
  }

  radar() {
    return this.state !== 'off' ? [{ x: this.x, z: this.z }] : [];
  }

  dispose() {
    this.g.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}
