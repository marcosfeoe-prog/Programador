// Subnível 0.1 — moradores da Estação Zênite: pessoas montadas com primitivas
// (rosto pintado em canvas, cabelo, uniforme), animação de respiração, olhar
// que acompanha o jogador, gestos ao conversar e uma etiqueta com o nome.
// Também o robô zelador Z-7, que patrulha o Átrio e a passarela.
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { dynMaterial } from './level0_1_build.js';
import { makeNameTag } from './level0_1_tex.js';
import { clamp, damp, angleDiff, TAU } from '../util.js';

// ------------------------------------------------------------ rosto
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}

// Rosto em projeção equirretangular para a esfera da cabeça (frente em u = 0,25).
function faceCanvas(s) {
  const W = 256;
  const H = 128;
  const cv = TEX.makeCanvas(W, H);
  const c = cv.getContext('2d');
  c.fillStyle = s.skin;
  c.fillRect(0, 0, W, H);
  const fx = W * 0.25;
  // sombreado suave nas laterais e queixo
  const g = c.createRadialGradient(fx, H * 0.5, 4, fx, H * 0.5, W * 0.22);
  g.addColorStop(0, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // bochechas
  c.fillStyle = 'rgba(200,80,70,0.12)';
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(fx + sx * W * 0.055, H * 0.58, W * 0.022, H * 0.04, 0, 0, TAU);
    c.fill();
  }
  // barba por fazer
  if (s.beard) {
    c.fillStyle = s.beard;
    c.beginPath();
    c.ellipse(fx, H * 0.7, W * 0.075, H * 0.11, 0, 0, Math.PI);
    c.fill();
    c.globalAlpha = 0.55;
    c.fillRect(fx - W * 0.075, H * 0.62, W * 0.15, H * 0.08);
    c.globalAlpha = 1;
  }
  // olhos
  for (const sx of [-1, 1]) {
    const ex = fx + sx * W * 0.042;
    const ey = H * 0.47;
    c.fillStyle = shade(s.skin, 0.78);
    c.beginPath();
    c.ellipse(ex, ey - H * 0.008, W * 0.019, H * 0.03, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#f4f1ea';
    c.beginPath();
    c.ellipse(ex, ey, W * 0.015, H * 0.02, 0, 0, TAU);
    c.fill();
    c.fillStyle = s.eyes || '#3b2618';
    c.beginPath();
    c.arc(ex, ey, H * 0.016, 0, TAU);
    c.fill();
    c.fillStyle = '#0b0705';
    c.beginPath();
    c.arc(ex, ey, H * 0.008, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(ex + 1, ey - 3, 2, 2);
    // sobrancelhas
    c.strokeStyle = s.brows || shade(s.hair, 0.9);
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(ex - sx * W * 0.018, H * 0.405);
    c.quadraticCurveTo(ex, H * 0.39 - (s.browUp || 0), ex + sx * W * 0.02, H * 0.41);
    c.stroke();
  }
  // óculos
  if (s.glasses) {
    c.strokeStyle = s.glasses;
    c.lineWidth = 2.5;
    for (const sx of [-1, 1]) c.strokeRect(fx + sx * W * 0.042 - 9, H * 0.47 - 7, 18, 14);
    c.beginPath();
    c.moveTo(fx - 4, H * 0.47);
    c.lineTo(fx + 4, H * 0.47);
    c.stroke();
  }
  // nariz
  c.strokeStyle = shade(s.skin, 0.72);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(fx + 1, H * 0.5);
  c.lineTo(fx + 3, H * 0.565);
  c.lineTo(fx - 3, H * 0.575);
  c.stroke();
  // boca
  c.strokeStyle = s.lips || shade(s.skin, 0.6);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(fx - W * 0.026, H * 0.635);
  c.quadraticCurveTo(fx, H * 0.635 + (s.smile || 3), fx + W * 0.026, H * 0.635);
  c.stroke();
  // cabelo: linha do cabelo sobe na frente e desce atrás
  if (s.hairStyle !== 'bald') {
    c.fillStyle = s.hair;
    for (let x = 0; x < W; x++) {
      let du = Math.abs(x / W - 0.25);
      du = Math.min(du, 1 - du);
      const t = clamp((du - 0.09) / 0.2, 0, 1);
      let hl = 0.34 + t * t * (3 - 2 * t) * (s.hairStyle === 'long' ? 0.5 : 0.28);
      if (s.hairStyle === 'shaved') hl = 0.3 + t * 0.12;
      c.fillRect(x, 0, 1, H * hl);
    }
    // franja
    if (s.fringe) {
      c.beginPath();
      c.moveTo(fx - W * 0.09, H * 0.33);
      c.quadraticCurveTo(fx - W * 0.02, H * 0.43, fx + W * 0.1, H * 0.34);
      c.lineTo(fx + W * 0.1, H * 0.3);
      c.lineTo(fx - W * 0.09, H * 0.3);
      c.fill();
    }
  }
  return cv;
}

// Retrato para a caixa de diálogo.
function portrait(s) {
  const S = 160;
  const cv = TEX.makeCanvas(S, S);
  const c = cv.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, '#1b2a3a');
  bg.addColorStop(1, '#0a1018');
  c.fillStyle = bg;
  c.fillRect(0, 0, S, S);
  if (s.robot) {
    c.fillStyle = '#c9d2da';
    c.beginPath();
    c.arc(S / 2, S * 0.62, S * 0.36, Math.PI, 0);
    c.fill();
    c.fillStyle = '#1b2026';
    c.fillRect(S * 0.2, S * 0.5, S * 0.6, S * 0.18);
    c.fillStyle = '#5fe0ff';
    c.beginPath();
    c.arc(S / 2, S * 0.59, S * 0.06, 0, TAU);
    c.fill();
    return cv.toDataURL();
  }
  // corpo
  c.fillStyle = s.suit;
  c.beginPath();
  c.ellipse(S / 2, S * 1.02, S * 0.42, S * 0.3, 0, 0, TAU);
  c.fill();
  c.fillStyle = s.accent;
  c.fillRect(S * 0.18, S * 0.86, S * 0.64, S * 0.03);
  // pescoço e rosto
  c.fillStyle = shade(s.skin, 0.85);
  c.fillRect(S * 0.42, S * 0.62, S * 0.16, S * 0.16);
  const face = faceCanvas(s);
  c.save();
  c.beginPath();
  c.ellipse(S / 2, S * 0.47, S * 0.2, S * 0.25, 0, 0, TAU);
  c.clip();
  // recorte central da textura (frente do rosto)
  c.drawImage(face, 256 * 0.25 - 40, 22, 80, 84, S * 0.3, S * 0.2, S * 0.4, S * 0.52);
  c.restore();
  if (s.hairStyle !== 'bald') {
    c.fillStyle = s.hair;
    c.beginPath();
    c.ellipse(S / 2, S * 0.3, S * 0.22, S * 0.12, 0, Math.PI, 0);
    c.fill();
    if (s.hairStyle === 'long' || s.hairStyle === 'curly') {
      c.fillRect(S * 0.27, S * 0.3, S * 0.07, S * (s.hairStyle === 'long' ? 0.4 : 0.22));
      c.fillRect(S * 0.66, S * 0.3, S * 0.07, S * (s.hairStyle === 'long' ? 0.4 : 0.22));
    }
    if (s.hairStyle === 'bun') {
      c.beginPath();
      c.arc(S / 2, S * 0.16, S * 0.08, 0, TAU);
      c.fill();
    }
  }
  return cv.toDataURL();
}

// ------------------------------------------------------------ modelos
const geoCache = {};
function G(key, make) {
  if (!geoCache[key]) geoCache[key] = make();
  return geoCache[key];
}

export class NPC {
  // def: { id, name, role, x, z, yaw, pose: 'stand'|'sit'|'lean', look: {...aparência}, h }
  constructor(lvl, def) {
    this.lvl = lvl;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.role = def.role;
    this.x = def.x;
    this.z = def.z;
    this.baseYaw = def.yaw || 0;
    this.yaw = this.baseYaw;
    this.headYaw = 0;
    this.headPitch = 0;
    this.talkT = 0;
    this.phase = Math.random() * 10;
    this.amb = { value: new THREE.Vector3(0.3, 0.3, 0.3) };
    this.portrait = portrait(def.look);
    this.build();
  }

  mat(o) {
    return dynMaterial(this.lvl.Q, o, this.amb);
  }

  build() {
    const s = this.def.look;
    const Q = this.lvl.Q;
    const root = new THREE.Group();
    const k = (this.def.h || 1.74) / 1.74;
    const body = new THREE.Group();
    body.scale.setScalar(k);
    root.add(body);
    const suit = this.mat({ color: s.suit, roughness: 0.75 });
    const accent = this.mat({ color: s.accent, roughness: 0.5 });
    const skin = this.mat({ color: s.skin, roughness: 0.65 });
    const boots = this.mat({ color: 0x1a1c20, roughness: 0.45, metalness: 0.2 });
    const hair = this.mat({ color: s.hair, roughness: 0.85 });
    const faceTex = TEX.toTex(faceCanvas(s), { repeat: false });
    const head = this.mat({ map: faceTex, roughness: 0.6 });
    this.mats = [suit, accent, skin, boots, hair, head];
    this.faceTex = faceTex;
    const sides = Q.id === 'low' ? 10 : 14;
    const sit = this.def.pose === 'sit';
    const hipY = sit ? 0.5 : 0.92;
    // pernas
    const thighG = G('thigh' + sides, () => new THREE.CylinderGeometry(0.085, 0.065, 0.46, sides).translate(0, -0.23, 0));
    const shinG = G('shin' + sides, () => new THREE.CylinderGeometry(0.06, 0.05, 0.44, sides).translate(0, -0.22, 0));
    const bootG = G('boot', () => new THREE.BoxGeometry(0.11, 0.08, 0.26).translate(0, -0.04, 0.05));
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.1, hipY, 0);
      const thigh = new THREE.Mesh(thighG, suit);
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.46;
      hip.add(knee);
      knee.add(new THREE.Mesh(shinG, suit));
      const ankle = new THREE.Group();
      ankle.position.y = -0.44;
      knee.add(ankle);
      ankle.add(new THREE.Mesh(bootG, boots));
      if (sit) {
        hip.rotation.x = -Math.PI / 2;
        knee.rotation.x = Math.PI / 2;
        ankle.rotation.x = 0;
      }
      body.add(hip);
      this.legs.push(hip);
    }
    // quadril e tronco
    const pelvis = new THREE.Mesh(G('pelvis' + sides, () => new THREE.CylinderGeometry(0.16, 0.15, 0.2, sides).scale(1, 1, 0.7)), suit);
    pelvis.position.y = hipY + 0.04;
    body.add(pelvis);
    const torso = new THREE.Group();
    torso.position.y = hipY + 0.1;
    body.add(torso);
    this.torso = torso;
    const chestG = G(
      'chest' + sides + (s.female ? 'f' : 'm'),
      () => {
        const pts = [
          [0.15, 0],
          [0.155, 0.12],
          [s.female ? 0.16 : 0.175, 0.3],
          [0.19, 0.44],
          [0.17, 0.52],
          [0.08, 0.58],
          [0.0, 0.585],
        ].map((p) => new THREE.Vector2(p[0], p[1]));
        return new THREE.LatheGeometry(pts, sides + 2).scale(1, 0.8, 0.66);
      },
    );
    const chest = new THREE.Mesh(chestG, suit);
    torso.add(chest);
    // cinto e detalhes do uniforme
    const belt = new THREE.Mesh(G('belt' + sides, () => new THREE.CylinderGeometry(0.157, 0.157, 0.05, sides + 2, 1, true).scale(1, 1, 0.68)), boots);
    belt.position.y = 0.03;
    torso.add(belt);
    const stripe = new THREE.Mesh(G('stripe', () => new THREE.BoxGeometry(0.36, 0.035, 0.24)), accent);
    stripe.position.set(0, 0.33, 0);
    torso.add(stripe);
    const patch = new THREE.Mesh(G('patch', () => new THREE.PlaneGeometry(0.07, 0.05)), accent);
    patch.position.set(0.09, 0.29, 0.123);
    torso.add(patch);
    if (s.apron) {
      const apron = new THREE.Mesh(G('apron', () => new THREE.PlaneGeometry(0.3, 0.62).translate(0, -0.26, 0)), this.mat({ color: s.apron, roughness: 0.9, side: THREE.DoubleSide }));
      apron.position.set(0, 0.3, 0.128);
      apron.rotation.x = -0.06;
      torso.add(apron);
    }
    // pescoço e cabeça
    const neck = new THREE.Mesh(G('neck', () => new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10)), skin);
    neck.position.y = 0.5;
    torso.add(neck);
    const headG = new THREE.Group();
    headG.position.y = 0.52;
    torso.add(headG);
    this.head = headG;
    const skull = new THREE.Mesh(G('skull', () => new THREE.SphereGeometry(0.105, 24, 16).scale(0.9, 1.12, 1.0)), head);
    skull.position.y = 0.11;
    headG.add(skull);
    // orelhas
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(G('ear', () => new THREE.SphereGeometry(0.025, 8, 6).scale(0.5, 1, 0.8)), skin);
      ear.position.set(sx * 0.094, 0.105, -0.005);
      headG.add(ear);
    }
    if (s.hairStyle !== 'bald' && s.hairStyle !== 'shaved') {
      const capG = G('hair-' + s.hairStyle, () => {
        const curly = s.hairStyle === 'curly';
        const g = new THREE.SphereGeometry(0.115, 20, 12, 0, TAU, 0, Math.PI * (curly ? 0.58 : 0.5));
        g.scale(curly ? 1.08 : 0.96, curly ? 1.18 : 1.12, curly ? 1.12 : 1.05);
        return g;
      });
      const cap = new THREE.Mesh(capG, hair);
      cap.position.set(0, 0.125, -0.008);
      cap.rotation.x = -0.32;
      headG.add(cap);
      if (s.hairStyle === 'bun') {
        const bun = new THREE.Mesh(G('bun', () => new THREE.SphereGeometry(0.05, 12, 8)), hair);
        bun.position.set(0, 0.2, -0.1);
        headG.add(bun);
      } else if (s.hairStyle === 'long') {
        const back = new THREE.Mesh(G('longhair', () => new THREE.BoxGeometry(0.2, 0.26, 0.06).translate(0, -0.13, 0)), hair);
        back.position.set(0, 0.16, -0.085);
        back.rotation.x = 0.12;
        headG.add(back);
      }
    }
    if (s.goggles) {
      const band = new THREE.Mesh(G('gband', () => new THREE.TorusGeometry(0.108, 0.012, 6, 24)), boots);
      band.position.y = 0.17;
      band.rotation.x = Math.PI / 2 - 0.25;
      headG.add(band);
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(G('lens', () => new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12).rotateX(Math.PI / 2)), accent);
        lens.position.set(sx * 0.04, 0.2, 0.085);
        lens.rotation.x = -0.4;
        headG.add(lens);
      }
    }
    if (s.cap) {
      const c = new THREE.Mesh(G('chefcap', () => new THREE.CylinderGeometry(0.1, 0.105, 0.14, 14)), this.mat({ color: 0xf2f2ee, roughness: 0.9 }));
      c.position.y = 0.25;
      headG.add(c);
    }
    // braços
    const upperG = G('upper' + sides, () => new THREE.CylinderGeometry(0.055, 0.047, 0.29, sides).translate(0, -0.145, 0));
    const foreG = G('fore' + sides, () => new THREE.CylinderGeometry(0.045, 0.038, 0.27, sides).translate(0, -0.135, 0));
    const handG = G('hand', () => new THREE.SphereGeometry(0.045, 10, 8).scale(0.8, 1.15, 0.55).translate(0, -0.05, 0));
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.2, 0.4, 0);
      torso.add(sh);
      sh.add(new THREE.Mesh(upperG, suit));
      const el = new THREE.Group();
      el.position.y = -0.29;
      sh.add(el);
      el.add(new THREE.Mesh(foreG, suit));
      const cuff = new THREE.Mesh(G('cuff', () => new THREE.CylinderGeometry(0.041, 0.041, 0.03, 10)), accent);
      cuff.position.y = -0.255;
      el.add(cuff);
      const hand = new THREE.Mesh(handG, skin);
      hand.position.y = -0.27;
      el.add(hand);
      sh.rotation.z = sx * 0.08;
      this.arms.push({ sh, el, sx, hand });
    }
    // objeto na mão (tablet, prancheta, xícara…)
    if (s.holds) {
      const a = this.arms[s.holds.hand === 'l' ? 0 : 1];
      const item = new THREE.Mesh(
        G('hold-' + s.holds.kind, () =>
          s.holds.kind === 'cup' ? new THREE.CylinderGeometry(0.035, 0.03, 0.09, 10) : new THREE.BoxGeometry(0.2, 0.012, 0.14),
        ),
        s.holds.kind === 'cup' ? this.mat({ color: 0xe8e2d6, roughness: 0.4 }) : this.mat({ color: 0x22262c, roughness: 0.3, metalness: 0.3 }),
      );
      item.position.set(0, -0.31, 0.05);
      a.el.add(item);
      this.heldArm = a;
    }
    // etiqueta com nome
    const tagMat = new THREE.SpriteMaterial({ map: makeNameTag(this.name, this.role), transparent: true, depthWrite: false, fog: false });
    tagMat.opacity = 0;
    this.tag = new THREE.Sprite(tagMat);
    this.tag.scale.set(0.62, 0.155, 1);
    this.tag.position.y = (sit ? 1.3 : 1.82) * k + 0.12;
    this.tag.renderOrder = 5;
    root.add(this.tag);
    root.position.set(this.x, 0, this.z);
    root.rotation.y = this.yaw;
    this.root = root;
    this.k = k;
    this.headY = (hipY + 0.1 + 0.52 + 0.1) * k;
    this.lvl.dynamic.add(root);
    this.pose();
  }

  // Pose base de cada personagem.
  pose() {
    const p = this.def.look.arms || 'down';
    const [L, R] = this.arms;
    if (p === 'crossed') {
      for (const a of this.arms) {
        a.sh.rotation.set(-0.45, 0, a.sx * 0.15);
        a.el.rotation.set(-1.75, 0, -a.sx * 1.05);
      }
    } else if (p === 'behind') {
      for (const a of this.arms) {
        a.sh.rotation.set(0.35, 0, a.sx * 0.12);
        a.el.rotation.set(0.15, 0, -a.sx * 0.5);
      }
    } else if (p === 'desk') {
      for (const a of this.arms) {
        a.sh.rotation.set(-0.75, 0, a.sx * 0.05);
        a.el.rotation.set(-0.85, 0, 0);
      }
    } else if (p === 'tablet') {
      L.sh.rotation.set(-0.3, 0, -0.1);
      L.el.rotation.set(-1.25, 0, 0.35);
      R.sh.rotation.set(0.05, 0, 0.1);
    }
    this.base = this.arms.map((a) => ({ sx: a.sh.rotation.x, sz: a.sh.rotation.z, ex: a.el.rotation.x, ez: a.el.rotation.z }));
  }

  update(dt, player, t, talking) {
    const p = player.pos;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const visible = d < 45;
    this.root.visible = visible;
    if (!visible) return;
    this.amb.value.copy(this.lvl.ambientAt(this.x, this.headY * 0.7, this.z));
    // respiração
    const br = Math.sin(t * 1.7 + this.phase);
    this.torso.scale.set(1 + br * 0.006, 1 + br * 0.01, 1 + br * 0.012);
    // virar o corpo para quem fala com ele
    const toP = Math.atan2(dx, dz);
    const sit = this.def.pose === 'sit';
    if (talking && !sit) this.yaw += angleDiff(toP, this.yaw) * Math.min(1, dt * 3);
    else if (!talking) this.yaw += angleDiff(this.baseYaw, this.yaw) * Math.min(1, dt * 0.8);
    this.root.rotation.y = this.yaw;
    // olhar
    let hy = Math.sin(t * 0.23 + this.phase) * 0.35;
    let hp = Math.sin(t * 0.17 + this.phase * 2) * 0.06;
    if (d < 7) {
      const rel = angleDiff(toP, this.yaw);
      if (Math.abs(rel) < 1.9) {
        hy = clamp(rel, -1.1, 1.1);
        const eyeY = p.y + 1.62;
        hp = clamp(-Math.atan2(eyeY - this.headY, d) * 0.8, -0.4, 0.4);
      }
    }
    this.headYaw = damp(this.headYaw, hy, 5, dt);
    this.headPitch = damp(this.headPitch, hp, 5, dt);
    this.head.rotation.set(this.headPitch + (talking ? Math.sin(t * 7) * 0.035 : 0), this.headYaw, 0);
    // braços: balanço ocioso e gestos ao falar
    this.talkT = damp(this.talkT, talking ? 1 : 0, 3, dt);
    this.arms.forEach((a, i) => {
      const b = this.base[i];
      const g = this.talkT * (a === this.heldArm ? 0.2 : 1) * (i === 1 ? 1 : 0.55);
      const w = Math.sin(t * 2.3 + i * 1.7 + this.phase);
      a.sh.rotation.x = b.sx + Math.sin(t * 0.9 + i + this.phase) * 0.03 - g * (0.35 + w * 0.12);
      a.el.rotation.x = b.ex - g * (0.7 + Math.sin(t * 3.1 + i) * 0.2);
      a.sh.rotation.z = b.sz;
    });
    // etiqueta
    const ta = clamp((8 - d) / 2, 0, 1);
    this.tag.material.opacity = ta;
    this.tag.visible = ta > 0.01;
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.faceTex.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

// Robô zelador: corpo cilíndrico, cúpula com um olho e um esfregão que balança.
export class Robot {
  constructor(lvl, def) {
    this.lvl = lvl;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.role = def.role;
    this.path = def.path;
    this.seg = 0;
    this.x = def.path[0][0];
    this.z = def.path[0][1];
    this.yaw = 0;
    this.wait = 0;
    this.amb = { value: new THREE.Vector3(0.3, 0.3, 0.3) };
    this.portrait = portrait({ robot: true });
    const Q = lvl.Q;
    const root = new THREE.Group();
    const white = dynMaterial(Q, { color: 0xd9dee3, roughness: 0.35, metalness: 0.1 }, this.amb);
    const dark = dynMaterial(Q, { color: 0x23272d, roughness: 0.5, metalness: 0.4 }, this.amb);
    const stripe = dynMaterial(Q, { color: 0xf0a020, roughness: 0.5 }, this.amb);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x66e6ff, fog: false });
    this.mats = [white, dark, stripe, this.eyeMat];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.75, 20), white);
    body.position.y = 0.55;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.302, 0.302, 0.07, 20), stripe);
    band.position.y = 0.42;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.16, 20), dark);
    skirt.position.y = 0.12;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 10, 0, TAU, 0, Math.PI / 2), white);
    dome.position.y = 0.93;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.1, 20, 1, true, -0.9, 1.8), dark);
    visor.position.y = 0.99;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), this.eyeMat);
    eye.position.set(0, 0.99, 0.235);
    this.head = new THREE.Group();
    this.head.add(dome, visor, eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 6), dark);
    ant.position.y = 1.28;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5040, fog: false }));
    tip.position.y = 1.41;
    this.tip = tip;
    this.head.add(ant, tip);
    // braço com esfregão
    const arm = new THREE.Group();
    arm.position.set(0.28, 0.62, 0.05);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6), dark);
    stick.position.y = -0.3;
    stick.rotation.x = 0.5;
    const mop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.1), stripe);
    mop.position.set(0, -0.68, 0.36);
    arm.add(stick, mop);
    this.arm = arm;
    root.add(body, band, skirt, this.head, arm);
    const tagMat = new THREE.SpriteMaterial({ map: makeNameTag(this.name, this.role), transparent: true, depthWrite: false, fog: false });
    this.tag = new THREE.Sprite(tagMat);
    this.tag.scale.set(0.62, 0.155, 1);
    this.tag.position.y = 1.65;
    this.tag.renderOrder = 5;
    root.add(this.tag);
    this.mats.push(tagMat, tip.material);
    this.root = root;
    lvl.dynamic.add(root);
    this.headY = 1;
  }

  update(dt, player, t, talking) {
    const p = player.pos;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    this.amb.value.copy(this.lvl.ambientAt(this.x, 0.8, this.z));
    let target = null;
    if (talking || d < 1.6) {
      target = Math.atan2(dx, dz);
    } else if (this.wait > 0) {
      this.wait -= dt;
    } else {
      const [tx, tz] = this.path[(this.seg + 1) % this.path.length];
      const ex = tx - this.x;
      const ez = tz - this.z;
      const e = Math.hypot(ex, ez);
      if (e < 0.15) {
        this.seg = (this.seg + 1) % this.path.length;
        this.wait = 1.5 + Math.random() * 3;
      } else {
        target = Math.atan2(ex, ez);
        const turn = Math.abs(angleDiff(target, this.yaw));
        const sp = 0.6 * clamp(1 - turn, 0, 1);
        this.x += (ex / e) * sp * dt;
        this.z += (ez / e) * sp * dt;
        this.arm.rotation.y = Math.sin(t * 3) * 0.4;
      }
    }
    if (target !== null) this.yaw += angleDiff(target, this.yaw) * Math.min(1, dt * 2.5);
    this.root.position.set(this.x, Math.abs(Math.sin(t * 9)) * 0.004, this.z);
    this.root.rotation.y = this.yaw;
    this.head.rotation.y = Math.sin(t * 0.7) * 0.3;
    this.tip.visible = Math.sin(t * 4) > 0;
    this.eyeMat.color.setHex(talking ? 0x9dffb0 : 0x66e6ff);
    const ta = clamp((8 - d) / 2, 0, 1);
    this.tag.material.opacity = ta;
    this.tag.visible = ta > 0.01;
  }

  dispose() {
    for (const m of this.mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  }
}
