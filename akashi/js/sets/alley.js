// Cenário: beco escuro entre prédios (monólogo do Akashi). Corre ao longo de Z
// (de +24 a -24), com 2.8 m de largura; letreiros de neon, aparelhos de ar,
// canos, fios, poças que refletem as cores e vapor saindo de um respiro.
import * as THREE from 'three';
import { toon, flat, mesh, canvasTexture } from '../toon.js';
import { B, ground, freeze, facadeTex, neonTex, brickTex, wires, concreteTex } from './common.js';
import { makeTrashBag, makeCrate, makeTrashCan } from '../props.js';
import { RNG } from '../util.js';

const NEONS = [
  ['RAMEN', '#ff3a6a', -1, 2.6, 18, false],
  ['BAR', '#3ae8ff', 1, 3.2, 13, false],
  ['KARAOKE', '#ffd23a', -1, 4.4, 8, true],
  ['24H', '#3aff8a', 1, 2.5, 4, false],
  ['ROSBIFE', '#ff7a2a', -1, 2.7, -2, false],
  ['HOTEL', '#e85aff', 1, 5.0, -7, true],
  ['SNACK', '#ff3a3a', -1, 3.5, -12, false],
  ['CAFÉ', '#3ab0ff', 1, 2.8, -17, false],
];
export const NEON_POS = NEONS.map(([text, , side, y, z]) => ({ text, x: side * 1.3, y, z }));

export function buildAlley(q) {
  const g = new THREE.Group();
  const rng = new RNG(17);
  ground(g, 200, 200, toon(0x202228), 0, 0, -0.03);
  const floorTex = concreteTex('#3a3c44', 'alley');
  B(g, 2.9, 0.03, 52, 0xffffff, 0, -0.02, 0, { map: floorTex, uv: 1 / 2 });
  // prédios dos dois lados
  for (const s of [1, -1]) {
    for (let z = -26; z < 26; ) {
      const len = rng.float(5, 9);
      const h = rng.float(9, 20);
      const brick = rng.chance(0.5);
      const tex = brick ? brickTex(rng.pick(['#5a4040', '#4a4a52', '#5a5048']), 'a' + Math.round(z)) : facadeTex({ cols: 3, rows: 2, night: true, lit: 0.35, wall: '#2a2c36', key: 'al' + Math.round(z) });
      const m = B(g, 6, h, len, 0xffffff, s * (1.45 + 3), 0, z + len / 2, { map: tex, uv: brick ? 1 / 3 : [1 / 6, 1 / 7], cast: true });
      if (!brick) {
        m.material = toon(0xffffff, { map: tex, emissive: 0xffffff, ei: 0.4, unique: true });
        m.material.emissiveMap = tex;
      } else m.material = toon(0x9a9aa4, { map: tex });
      z += len;
    }
  }
  // letreiros de neon
  const signs = [];
  for (const [text, color, side, y, z, vertical] of NEONS) {
    const tex = neonTex(text, color, vertical ? { w: 160, h: 512, vertical: true, font: 'bold 84px "Arial Black", Impact, sans-serif' } : {});
    const w = vertical ? 0.55 : Math.min(2.4, 0.38 * text.length + 0.4);
    const h = vertical ? 1.8 : 0.62;
    const m = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.12 : 0.08, h, vertical ? w : w), [
      flat(0x111111),
      flat(0x111111),
      flat(0x111111),
      flat(0x111111),
      flat(0xffffff, { map: tex, fog: false }),
      flat(0xffffff, { map: tex, fog: false }),
    ]);
    if (vertical) {
      // placa perpendicular à parede (lida pelos dois lados)
      m.geometry = new THREE.BoxGeometry(w, h, 0.1);
      m.material = [flat(0x111111), flat(0x111111), flat(0x111111), flat(0x111111), flat(0xffffff, { map: tex, fog: false }), flat(0xffffff, { map: tex, fog: false })];
      m.rotation.y = Math.PI / 2;
      m.position.set(side * 1.1, y, z);
    } else {
      m.geometry = new THREE.BoxGeometry(w, h, 0.08);
      m.material = [flat(0x111111), flat(0x111111), flat(0x111111), flat(0x111111), flat(0xffffff, { map: tex, fog: false }), flat(0xffffff, { map: tex, fog: false })];
      m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      m.position.set(side * 1.42, y, z);
    }
    m.userData.dynamic = true;
    m.userData.color = color;
    g.add(m);
    signs.push(m);
    // reflexo na poça logo abaixo
    const refl = new THREE.Mesh(
      new THREE.PlaneGeometry(vertical ? 0.4 : w * 0.8, 1.6),
      new THREE.MeshBasicMaterial({
        map: puddleStreak(color),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(side * 0.75, 0.015, z);
    refl.renderOrder = 2;
    g.add(refl);
  }
  // poças (manchas escuras brilhantes)
  const pud = new THREE.MeshBasicMaterial({ color: 0x0a0c14, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 10; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(rng.float(0.4, 0.9), 16), pud);
    p.rotation.x = -Math.PI / 2;
    p.scale.set(1, rng.float(1.2, 2.2), 1);
    p.position.set(rng.float(-0.8, 0.8), 0.008, rng.float(-22, 22));
    p.renderOrder = 1;
    g.add(p);
  }
  // aparelhos de ar, canos, fios, lixo
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1;
    const z = -22 + i * 3.3 + rng.float(-0.5, 0.5);
    const y = rng.float(2.2, 7);
    B(g, 0.45, 0.6, 0.8, 0x9aa0a8, s * 1.25, y, z, { outline: 0.4 });
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), toon(0x3a3e44));
    fan.position.set(s * 1.02, y + 0.3, z);
    fan.rotation.y = -s * Math.PI / 2;
    g.add(fan);
  }
  for (const [x, z] of [
    [1.38, 10],
    [-1.38, 1],
    [1.38, -9],
    [-1.38, -19],
  ]) {
    const p = mesh(new THREE.CylinderGeometry(0.07, 0.07, 14, 8), toon(0x6a6e74), 0.4);
    p.position.set(x, 7, z);
    g.add(p);
  }
  for (let z = -20; z <= 20; z += 6) wires(g, [[-1.45, rng.float(5, 8), z], [1.45, rng.float(5, 8), z + rng.float(-2, 2)]], 0.5, 0x101014);
  for (const [x, z, k] of [
    [-1.05, 15, 0],
    [1.1, 6, 1],
    [-1.0, -4, 2],
    [1.05, -14, 0],
    [-1.05, -20, 1],
  ]) {
    if (k === 0) {
      const b = makeTrashBag(0x1a1c20);
      b.position.set(x, 0, z);
      g.add(b);
      const b2 = makeTrashBag(0x2a3a2a);
      b2.position.set(x, 0, z + 0.6);
      b2.scale.setScalar(0.8);
      g.add(b2);
    } else if (k === 1) {
      const c = makeCrate(0x8a6a3a);
      c.position.set(x, 0.22, z);
      g.add(c);
      const c2 = makeCrate(0x3a6a9a);
      c2.position.set(x, 0.67, z + 0.1);
      c2.rotation.y = 0.3;
      g.add(c2);
    } else {
      const t = makeTrashCan(0x4a4e54);
      t.position.set(x, 0, z);
      g.add(t);
    }
  }
  // porta dos fundos com lâmpada
  B(g, 0.06, 2.1, 1.1, 0x5a4a3a, 1.43, 0, -0.5, { outline: 0.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), flat(0xffe0a0, { fog: false }));
  bulb.position.set(1.3, 2.6, -0.5);
  bulb.userData.dynamic = true;
  g.add(bulb);
  const bulbLight = new THREE.PointLight(0xffc880, 6, 7, 1.5);
  bulbLight.position.set(1.0, 2.5, -0.5);
  bulbLight.userData.dynamic = true;
  g.add(bulbLight);
  // luzes coloridas dos neons
  const neonLights = [];
  for (const [i, c] of [
    [0, 0xff3a6a],
    [2, 0xffd23a],
    [5, 0xe85aff],
    [7, 0x3ab0ff],
  ]) {
    const n = NEONS[i];
    const l = new THREE.PointLight(c, 5, 7, 1.4);
    l.position.set(n[2] * 0.8, n[3], n[4]);
    g.add(l);
    neonLights.push(l);
  }
  // saída do beco: rua iluminada pelo pôr do sol
  B(g, 30, 0.04, 8, 0x6a5a5a, 0, -0.01, -29);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 10), flat(0xffa060, { transparent: true, opacity: 0.35, fog: false }));
  glow.position.set(0, 5, -30);
  g.add(glow);
  freeze(g);
  return {
    group: g,
    signs,
    bulb,
    bulbLight,
    neonLights,
    env: {
      sky: 'dusk',
      hemi: { sky: 0x3a3a6a, ground: 0x1a1420, int: 0.9 },
      sun: { color: 0xff8a5a, int: 0.5, dir: [0.2, 0.9, -0.4], box: 12, center: [0, 0, 0], shadow: false },
      fog: { color: 0x1a1828, near: 8, far: 60 },
      rim: 0x2a3a6a,
    },
    update(t) {
      // neons tremulando
      signs.forEach((s, i) => {
        const fl = i === 4 ? (Math.sin(t * 31) > 0.6 || Math.sin(t * 7.3) > 0.85 ? 0.3 : 1) : 1;
        s.material[4].color.setScalar(fl);
        s.material[5].color.setScalar(fl);
      });
      const fb = Math.sin(t * 23) > 0.92 || Math.sin(t * 5.1 + 1) > 0.97 ? 0.2 : 1;
      bulbLight.intensity = 6 * fb;
      bulb.material.color.setScalar(fb);
    },
  };
}

const STREAK = new Map();
function puddleStreak(color) {
  if (STREAK.has(color)) return STREAK.get(color);
  const t = canvasTexture(64, 128, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (let i = 0; i < 9; i++) g.fillRect(4 + i * 6.5, 0, 3, H);
  });
  STREAK.set(color, t);
  return t;
}
