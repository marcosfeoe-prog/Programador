// Monta o carro 3D a partir da especificação: carroceria, estufa, peças, rodas,
// interior e materiais (pintura com verniz, vidro, carbono, cromados).
import * as THREE from 'three';
import { CarBody } from './body.js';
import { wheelGeos, buildDetails, lightTex, meshTex, ventTex, plateTex, tireTex } from './parts.js';
import { Interior } from './interior.js';
import { merge } from '../geom.js';

let carbonTexC = null;
function carbonTex() {
  if (carbonTexC) return carbonTexC;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const k = (x + y) % 2;
      const g = ctx.createLinearGradient(x * 8, y * 8, x * 8 + (k ? 8 : 0), y * 8 + (k ? 0 : 8));
      g.addColorStop(0, '#1a1b1e');
      g.addColorStop(0.5, '#34363b');
      g.addColorStop(1, '#141517');
      ctx.fillStyle = g;
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  carbonTexC = new THREE.CanvasTexture(c);
  carbonTexC.wrapS = carbonTexC.wrapT = THREE.RepeatWrapping;
  carbonTexC.repeat.set(30, 30);
  carbonTexC.colorSpace = THREE.SRGBColorSpace;
  return carbonTexC;
}

const shared = {};
function sharedMats() {
  if (shared.black) return shared;
  shared.black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.55, metalness: 0.05 });
  shared.well = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95, metalness: 0 });
  shared.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTex(), roughness: 0.4, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  shared.chrome = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.12 });
  shared.glass = new THREE.MeshPhysicalMaterial({ color: 0x080a0d, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.58, side: THREE.FrontSide, depthWrite: false, envMapIntensity: 1.6, clearcoat: 1 });
  shared.mirrorGlass = new THREE.MeshStandardMaterial({ color: 0xd8dce0, metalness: 1, roughness: 0.03 });
  shared.tire = new THREE.MeshStandardMaterial({ map: tireTex(), roughness: 0.9, metalness: 0 });
  shared.disc = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.38 });
  shared.caliper = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.35 });
  shared.vent = new THREE.MeshStandardMaterial({ map: ventTex(), roughness: 0.7 });
  shared.wiper = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.6 });
  shared.amber = new THREE.MeshStandardMaterial({ color: 0xf0a020, emissive: 0xff9a20, emissiveIntensity: 0.2, roughness: 0.1 });
  return shared;
}

export class CarModel {
  constructor(spec, opt = {}) {
    this.spec = spec;
    const lod = opt.lod || 0;
    this.lod = lod;
    const S = sharedMats();
    this.root = new THREE.Group();
    const body = new CarBody(spec, lod ? 1 : 0);
    this.body = body;
    // materiais próprios
    const paintCol = opt.paint || spec.paint;
    const metal = opt.metal ?? spec.metal ?? 0.4;
    this.paintMat = opt.paintMat || new THREE.MeshPhysicalMaterial({ color: paintCol, metalness: metal, roughness: 0.38 - metal * 0.12, clearcoat: lod ? 0.6 : 1, clearcoatRoughness: 0.035 });
    this.paint2Mat = spec.paint2 ? new THREE.MeshPhysicalMaterial({ color: opt.paint2 || spec.paint2, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }) : this.paintMat;
    const pillarMat = spec.cabin.blackPillars ? S.black : spec.cabin.paint2Pillars ? this.paint2Mat : this.paintMat;
    const shell = body.buildShell();
    const gh = body.buildGreenhouse();
    const add = (geo, mat, cast = true, parent = this.root) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast && !lod;
      m.receiveShadow = !lod;
      parent.add(m);
      return m;
    };
    add(shell.paint, this.paintMat);
    add(shell.paint2, this.paint2Mat);
    add(shell.black, S.black);
    add(shell.well, S.well, false);
    add(shell.carbon, lod ? S.black : S.carbon);
    add(gh.glass, S.glass, false);
    add(gh.roof, spec.twoTone ? this.paint2Mat : this.paintMat);
    add(gh.pillar, pillarMat);
    add(gh.seal, S.black);
    // luzes
    const L = spec.lights || {};
    const hs = lightTex((L.head && L.head.style) || 'quad', false);
    const ts = lightTex((L.tail && L.tail.style) || 'bar', true);
    this.headMat = new THREE.MeshPhysicalMaterial({ map: hs.map, emissiveMap: hs.em, emissive: 0xfff4e0, emissiveIntensity: 0.25, roughness: 0.05, metalness: 0.1, clearcoat: 1 });
    this.tailMat = new THREE.MeshPhysicalMaterial({ map: ts.map, emissiveMap: ts.em, emissive: 0xff2a1a, emissiveIntensity: 0.15, roughness: 0.08, clearcoat: 1 });
    const D = buildDetails(body, spec, lod ? (lod > 1 ? 2 : 1) : 0);
    if (D.headLens.length) add(merge(D.headLens), this.headMat, false);
    if (D.tailLens.length) add(merge(D.tailLens), this.tailMat, false);
    if (D.grille.length) add(merge(D.grille), new THREE.MeshStandardMaterial({ map: meshTex(D.grilleStyle, null), roughness: 0.6, metalness: 0.3 }), false);
    if (D.amber.length) add(merge(D.amber), S.amber, false);
    if (!lod) {
      if (D.vents.length) add(merge(D.vents), S.vent, false);
      if (D.black.length) add(merge(D.black), S.black, false);
      if (D.chrome.length) add(merge(D.chrome), S.chrome);
      if (D.paint.length) add(merge(D.paint), this.paintMat);
      if (D.carbon.length) add(merge(D.carbon), S.carbon);
      if (D.mirrorGlass.length) add(merge(D.mirrorGlass), S.mirrorGlass, false);
      if (D.board && D.board.length) add(merge(D.board), new THREE.MeshPhysicalMaterial({ color: 0xf4e8c8, roughness: 0.3, clearcoat: 1 }));
      if (D.accent.length) add(merge(D.accent), new THREE.MeshStandardMaterial({ color: spec.accent || spec.paint, roughness: 0.4 }), false);
      if (D.plates.length) {
        const plate = new THREE.MeshStandardMaterial({ map: plateTex(opt.plate || 'RS·2026', true), roughness: 0.4 });
        add(merge(D.plates), plate, false);
      }
      this.wipers = D.wipers;
      for (const w of this.wipers) {
        w.arm.material = S.wiper;
        this.root.add(w.pivot);
      }
    }
    // rodas
    this.wheels = [];
    const W = spec.wheel;
    const front = wheelGeos(W, lod, false);
    const rear = W.rR ? wheelGeos(W, lod, true) : front;
    const rimMetal = W.rimMetal ?? (W.style === 'six' || W.style === 'hubcap' || W.style === 'steel' ? 0.35 : 0.85);
    this.rimMat = opt.rimMat || new THREE.MeshStandardMaterial({ vertexColors: true, metalness: rimMetal, roughness: rimMetal > 0.5 ? 0.22 : 0.35 });
    const tw = spec.dims.track / 2;
    for (const [fz, isFront] of [
      [spec.dims.zF, true],
      [spec.dims.zR, false],
    ]) {
      const G = isFront ? front : rear;
      for (const sx of [1, -1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * tw, G.r, fz);
        const spin = new THREE.Group();
        pivot.add(spin);
        const parts = new THREE.Group();
        parts.scale.x = sx;
        const tire = new THREE.Mesh(G.tire, S.tire);
        const rim = new THREE.Mesh(G.rim, this.rimMat);
        parts.add(tire, rim);
        if (!lod) parts.add(new THREE.Mesh(G.disc, S.disc));
        tire.castShadow = !lod;
        spin.add(parts);
        if (!lod) {
          const cal = new THREE.Mesh(G.caliper, S.caliper);
          cal.scale.x = sx;
          pivot.add(cal);
        }
        this.root.add(pivot);
        this.wheels.push({ pivot, spin, front: isFront, side: sx, x: sx * tw, z: fz, r: G.r, spinA: 0 });
      }
    }
    // interior
    if (opt.interior && !lod) {
      const I = spec.interior;
      const ic = new THREE.Color(I.color);
      const M = {
        dash: new THREE.MeshStandardMaterial({ color: ic.clone().multiplyScalar(0.55), roughness: 0.75 }),
        soft: new THREE.MeshStandardMaterial({ color: ic.clone().multiplyScalar(0.7), roughness: 1 }),
        leather: new THREE.MeshStandardMaterial({ color: ic, roughness: 0.55 }),
        metal: new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.25 }),
        black: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.2, metalness: 0.2 }),
        carpet: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 1 }),
        accent: new THREE.MeshStandardMaterial({ color: I.accent, roughness: 0.5 }),
        wood: new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.6 }),
        wheel: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }),
      };
      const liner = new THREE.MeshStandardMaterial({ color: I.sport ? 0x202022 : 0xbab4aa, roughness: 1 });
      add(gh.liner, liner, false);
      add(shell.inner, M.dash, false);
      this.interior = new Interior(body, spec, M);
      this.root.add(this.interior.group);
    }
    // centro de massa no referencial do carro
    const P = spec.phys || {};
    const wd = P.wd ?? 0.5;
    this.com = new THREE.Vector3(0, (P.cg ?? 0.5), spec.dims.zR + wd * (spec.dims.zF - spec.dims.zR));
    this.brake = 0;
    this.lightsOn = false;
    this.root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = true;
    });
  }

  setPaint(hex, metal) {
    this.paintMat.color.set(hex);
    if (metal !== undefined) {
      this.paintMat.metalness = metal;
      this.paintMat.roughness = 0.38 - metal * 0.12;
    }
  }

  setLights(on, brake, night) {
    this.headMat.emissiveIntensity = on ? 3.2 : 0.35;
    this.tailMat.emissiveIntensity = brake > 0.1 ? 3.5 : on ? 1.1 : 0.12;
  }

  // posiciona a partir da física (ou do controlador do trânsito)
  // susp[i] = altura do cubo da roda relativa ao repouso; steer em rad; spin em rad/s
  pose(pos, quat, wheels, steer, dt) {
    this.root.quaternion.copy(quat);
    // pos é o centro de massa
    const off = this.com.clone().applyQuaternion(quat);
    this.root.position.copy(pos).sub(off);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const s = wheels ? wheels[i] : null;
      if (s) {
        w.pivot.position.y = s.hubY;
        w.spinA += s.omega * dt;
      }
      w.spin.rotation.x = w.spinA;
      w.pivot.rotation.y = w.front ? steer : 0;
    }
  }

  animateWipers(t, on) {
    if (!this.wipers) return;
    const a = on ? (Math.sin(t * 3.2) * 0.5 + 0.5) * 1.55 : 0;
    for (const w of this.wipers) w.swing.rotation.z = -a;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
      }
    });
    if (this.interior) this.interior.mirrorRT.dispose();
  }
}
