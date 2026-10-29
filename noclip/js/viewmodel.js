// Braço em primeira pessoa: manga de traje de proteção, luva de borracha
// segurando a lanterna. Animações procedurais (respiração, passos, corrida,
// atraso ao virar, clique, chacoalhar, pegar item, dano) e o feixe de luz.
import * as THREE from 'three';
import { sdfMesh, cone, ell } from './sdf.js';
import { gameMaterial, tex, setProbe } from './materials.js';
import { flashlightCookie } from './textures.js';
import { damp, clamp, noise1 } from './util.js';

const R = 0.0165; // raio do corpo da lanterna

function polar(r, deg, z) {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a) * r, Math.sin(a) * r, z];
}

// Mão segurando um cilindro no eixo z (lanterna apontando para -z).
function handGeometry() {
  const P = [];
  const fr = R + 0.0105;
  const fingers = [
    { z: -0.031, r: 0.0094, len: 1.0 },
    { z: -0.0105, r: 0.0098, len: 1.05 },
    { z: 0.0095, r: 0.0094, len: 1.0 },
    { z: 0.0275, r: 0.0082, len: 0.86 },
  ];
  for (const f of fingers) {
    const kn = polar(R + 0.021, 28, f.z);
    const j1 = polar(fr + 0.002, -32 * f.len, f.z + 0.002);
    const j2 = polar(fr, -105 * f.len, f.z + 0.003);
    const tip = polar(fr - 0.001, -160 * f.len, f.z + 0.004);
    P.push(cone(kn, j1, f.r * 1.08, f.r, { k: 0.008 }));
    P.push(cone(j1, j2, f.r, f.r * 0.92, { k: 0.006 }));
    P.push(cone(j2, tip, f.r * 0.92, f.r * 0.82, { k: 0.006 }));
  }
  // palma e dorso
  P.push(ell([0.031, 0.016, -0.001], [0.018, 0.024, 0.044], { k: 0.016 }));
  P.push(ell([0.036, 0.004, 0.012], [0.02, 0.022, 0.04], { k: 0.016 }));
  // polegar por cima, sobre o botão
  P.push(cone([0.03, -0.004, 0.028], [0.022, 0.02, 0.004], 0.013, 0.011, { k: 0.012 }));
  P.push(cone([0.022, 0.02, 0.004], [0.006, 0.026, -0.018], 0.011, 0.0095, { k: 0.008 }));
  P.push(cone([0.006, 0.026, -0.018], [-0.004, 0.023, -0.034], 0.0095, 0.0085, { k: 0.006 }));
  // punho
  P.push(cone([0.036, 0.004, 0.035], [0.05, -0.006, 0.105], 0.027, 0.029, { k: 0.02 }));
  return sdfMesh(P, { voxel: 0.0024, smooth: 2 });
}

function flashlightGeometry() {
  // perfil (raio, posição ao longo do eixo); o torno gira em Y e depois deitamos em -Z
  const prof = [
    [0, 0.078],
    [0.012, 0.078],
    [0.0168, 0.074],
    [0.0172, 0.066],
    [0.0165, 0.062],
    [0.0165, -0.055],
    [0.0175, -0.06],
    [0.0215, -0.085],
    [0.0242, -0.094],
    [0.0246, -0.104],
    [0.0228, -0.106],
    [0.0214, -0.104],
  ].map(([r, y]) => new THREE.Vector2(r, -y));
  const g = new THREE.LatheGeometry(prof, 28);
  g.rotateX(Math.PI / 2);
  return g;
}

function sleeveGeometry() {
  // cilindro do pulso até o cotovelo com dobras (ruído nos vértices)
  const len = 0.4;
  const g = new THREE.CylinderGeometry(0.044, 0.062, len, 28, 24, true);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const t = v.y / len + 0.5;
    const fold = Math.sin(t * 34 + Math.sin(a * 3) * 1.6) * 0.0035 + Math.sin(a * 5 + t * 9) * 0.0022;
    const k = 1 + fold / 0.05 + (t < 0.08 ? (0.08 - t) * 0.6 : 0);
    v.x *= k;
    v.z *= k;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class ViewModel {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 5);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.arm = new THREE.Group();
    this.root.add(this.arm);
    // materiais com sonda (recebem a luz do lugar)
    this.mGlove = gameMaterial({ color: 0x262626, roughness: 0.38, probe: true, forcePBR: true });
    this.mMetal = gameMaterial({ color: 0x3a3a3e, roughness: 0.3, metalness: 0.55, probe: true, forcePBR: true });
    this.mSleeve = gameMaterial({ color: 0x8c874c, roughness: 0.72, normalMap: tex('cloth_n.jpg', { srgb: false }), normalScale: 0.6, probe: true, forcePBR: true });
    this.mCuff = gameMaterial({ color: 0x1b1b19, roughness: 0.8, probe: true, forcePBR: true });
    this.mLens = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
    this.mats = [this.mGlove, this.mMetal, this.mSleeve, this.mCuff];

    const fl = new THREE.Mesh(flashlightGeometry(), this.mMetal);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0213, 24), this.mLens);
    lens.position.z = -0.1045;
    lens.rotation.y = Math.PI;
    this.lens = lens;
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.005, 0.012), this.mCuff);
    btn.position.set(0, 0.0175, -0.03);
    for (const z of [0.02, 0.035, 0.05]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0167, 0.0012, 6, 24), this.mCuff);
      ring.position.z = z;
      fl.add(ring);
    }
    fl.add(lens, btn);
    this.hand = new THREE.Mesh(handGeometry(), this.mGlove);
    const sleeve = new THREE.Mesh(sleeveGeometry(), this.mSleeve);
    // manga alinhada do punho (0.05,-0.006,0.105) para trás/baixo
    const wrist = new THREE.Vector3(0.05, -0.006, 0.105);
    const elbow = new THREE.Vector3(0.12, -0.13, 0.48);
    const dir = elbow.clone().sub(wrist).normalize();
    sleeve.position.copy(wrist).addScaledVector(dir, 0.2 + 0.01);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.03, 24), this.mCuff);
    cuff.position.copy(wrist).addScaledVector(dir, 0.012);
    cuff.quaternion.copy(sleeve.quaternion);
    this.arm.add(fl, this.hand, sleeve, cuff);
    this.flash = fl;
    // posição de repouso (espaço da câmera)
    this.base = new THREE.Vector3(0.14, -0.14, -0.29);
    this.baseRot = new THREE.Euler(0.14, 0.42, -0.14);
    this.arm.position.copy(this.base);
    this.arm.rotation.copy(this.baseRot);

    // feixe (na cena principal, preso à câmera)
    this.spot = new THREE.SpotLight(0xfff1dc, 30, 32, 0.52, 0.45, 2);
    this.spot.map = flashlightCookie();
    this.spotTarget = new THREE.Object3D();
    this.spot.target = this.spotTarget;
    this.spot.shadow.camera.near = 0.15;
    this.spot.shadow.camera.far = 30;
    this.spot.shadow.bias = -0.0004;
    this.spot.shadow.normalBias = 0.03;

    this.t = 0;
    this.lagYaw = 0;
    this.lagPitch = 0;
    this.click = 0;
    this.shake = 0;
    this.reach = 0;
    this.hurt = 0;
    this.sprintK = 0;
    this.lowered = 0;
    this.flicker = 1;
    this._probe = new Float32Array(18);
  }

  setEnv(env) {
    for (const m of this.mats) {
      m.envMap = env;
      m.needsUpdate = true;
    }
  }

  attach(camera) {
    camera.add(this.spot);
    camera.add(this.spotTarget);
  }

  setShadows(size) {
    this.spot.castShadow = size > 0;
    if (size > 0) {
      this.spot.shadow.mapSize.set(size, size);
      if (this.spot.shadow.map) {
        this.spot.shadow.map.dispose();
        this.spot.shadow.map = null;
      }
    }
  }

  setAspect(a, fov) {
    this.camera.aspect = a;
    this.camera.fov = fov * 0.82;
    this.camera.updateProjectionMatrix();
  }

  doClick() {
    this.click = 1;
  }
  doShake() {
    this.shake = 1;
  }
  doReach() {
    this.reach = 1;
  }
  doHurt() {
    this.hurt = 1;
  }

  update(dt, player, level) {
    this.t += dt;
    const t = this.t;
    // atraso ao girar a câmera
    const dyaw = player.yawVel || 0, dpitch = player.pitchVel || 0;
    this.lagYaw = damp(this.lagYaw, clamp(-dyaw * 0.045, -0.12, 0.12), 8, dt);
    this.lagPitch = damp(this.lagPitch, clamp(-dpitch * 0.04, -0.1, 0.1), 8, dt);
    this.sprintK = damp(this.sprintK, player.sprinting ? 1 : 0, 6, dt);
    this.lowered = damp(this.lowered, player.busy ? 1 : 0, 6, dt);
    const sp = player.speedK || 0;
    const ph = player.bobPhase || 0;
    const breath = Math.sin(t * 1.4) * 0.004;
    const bobX = Math.cos(ph) * 0.012 * sp * (1 + this.sprintK * 1.4);
    const bobY = Math.abs(Math.sin(ph)) * -0.012 * sp * (1 + this.sprintK);
    this.click = Math.max(0, this.click - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.reach = Math.max(0, this.reach - dt * 2.2);
    this.hurt = Math.max(0, this.hurt - dt * 3);
    const reachK = Math.sin(this.reach * Math.PI);
    const sh = this.shake > 0 ? Math.sin(t * 38) * this.shake : 0;
    const crouch = player.crouchK || 0;
    const a = this.arm;
    a.position.set(
      this.base.x + bobX + this.lagYaw * 0.35 - reachK * 0.05 + sh * 0.012,
      this.base.y + breath + bobY + this.lagPitch * 0.3 - this.sprintK * 0.06 - this.lowered * 0.25 - reachK * 0.04 - crouch * 0.01 + this.hurt * 0.03,
      this.base.z - reachK * 0.12 + this.sprintK * 0.03 + this.click * 0.01
    );
    a.rotation.set(
      this.baseRot.x + breath * 2 + this.lagPitch + this.sprintK * (-0.35 + Math.sin(ph) * 0.12) - this.click * 0.06 + sh * 0.2 - this.hurt * 0.25,
      this.baseRot.y + this.lagYaw + this.sprintK * 0.25 + Math.cos(ph) * 0.015 * sp,
      this.baseRot.z + Math.cos(ph) * 0.03 * sp * (1 + this.sprintK) + sh * 0.35
    );
    // luz do lugar no braço (sonda difusa + reflexo do ambiente proporcional ao brilho local)
    if (level && level.probes) {
      level.probes.sample(player.pos.x, player.pos.z, this._probe);
      let lum = 0;
      for (let i = 0; i < 18; i++) lum += this._probe[i];
      lum = (lum / 18) * (level.powerOverride ?? level.power);
      for (const m of this.mats) {
        setProbe(m, this._probe, 1);
        m.envMapIntensity = Math.min(1.2, lum * 0.9);
      }
    }
    // feixe acompanha a mão
    const on = player.flashOn && player.battery > 0;
    let f = 1;
    if (player.battery < 0.15) {
      const n = noise1(t * 14, 3);
      f = n > 0.35 + player.battery * 2 ? 1 : n * 0.4;
      if (this.shake > 0) f = 1;
    }
    this.flicker = on ? f : 0;
    this.spot.intensity = 30 * this.flicker * (0.75 + 0.25 * Math.min(1, player.battery * 3));
    this.spot.visible = this.flicker > 0.01;
    this.mLens.color.setScalar(on ? 0.4 + this.flicker * 6 : 0.04);
    // posição/direção no espaço da câmera, com o mesmo atraso do braço
    this.spot.position.set(a.position.x - 0.03, a.position.y + 0.04, a.position.z - 0.08);
    const dir = new THREE.Vector3(0, 0, -1).applyEuler(a.rotation);
    dir.x -= 0.06;
    dir.y += 0.07;
    this.spotTarget.position.copy(this.spot.position).addScaledVector(dir, 10);
  }
}
