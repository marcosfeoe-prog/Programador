// Construções do mapa: o acampamento dos caçadores (barracas, fogueira, caixotes,
// jipe, caixa de munição) e as torres de observação de madeira com escada.
import * as THREE from 'three';
import { CAMP, TOWERS } from './heightfield.js';
import { makeWoodTexture } from './textures.js';

function box(w, h, d, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(r1, r2, h, mat, x, y, z, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Structures {
  constructor(scene, hf) {
    this.group = new THREE.Group();
    this.group.name = 'construcoes';
    scene.add(this.group);
    this.colliders = []; // {x, z, r}
    this.interact = []; // {x, y, z, r, tipo, label, data}
    this.lights = [];
    const woodTex = makeWoodTexture(256);
    woodTex.repeat.set(1, 1);
    this.mats = {
      wood: new THREE.MeshLambertMaterial({ map: woodTex, color: 0xb08a60 }),
      darkWood: new THREE.MeshLambertMaterial({ map: woodTex, color: 0x6a4a30 }),
      canvas: new THREE.MeshLambertMaterial({ color: 0x6b6a3e, side: THREE.DoubleSide }),
      canvas2: new THREE.MeshLambertMaterial({ color: 0x8a7a52, side: THREE.DoubleSide }),
      metal: new THREE.MeshStandardMaterial({ color: 0x3c4a3a, roughness: 0.6, metalness: 0.4 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
      stone: new THREE.MeshLambertMaterial({ color: 0x6a6660 }),
      ammo: new THREE.MeshLambertMaterial({ color: 0x3f5a2e }),
      yellow: new THREE.MeshLambertMaterial({ color: 0xd8a822 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.5 }),
      fire: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.buildCamp(hf);
    for (const t of TOWERS) this.buildTower(hf, t);
    this.time = 0;
  }

  buildCamp(hf) {
    const g = new THREE.Group();
    const y0 = hf.height(CAMP.x, CAMP.z);
    g.position.set(CAMP.x, y0, CAMP.z);
    this.group.add(g);
    const M = this.mats;
    const add = (o, colR) => {
      g.add(o);
      if (colR) this.colliders.push({ x: CAMP.x + o.position.x, z: CAMP.z + o.position.z, r: colR });
      return o;
    };
    // barracas (prisma triangular de lona)
    const tents = [
      [-12, -6, 0.4],
      [-3, -14, -0.2],
      [9, -11, -0.7],
    ];
    for (const [x, z, ry] of tents) {
      const t = new THREE.Group();
      t.position.set(x, 0, z);
      t.rotation.y = ry;
      const shape = new THREE.Shape();
      shape.moveTo(-2, 0);
      shape.lineTo(2, 0);
      shape.lineTo(0, 2.3);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.2, bevelEnabled: false });
      geo.translate(0, 0, -2.1);
      const tm = new THREE.Mesh(geo, M.canvas);
      tm.castShadow = tm.receiveShadow = true;
      t.add(tm);
      t.add(box(0.08, 2.4, 0.08, M.darkWood, 0, 1.2, 2.15));
      t.add(box(0.08, 2.4, 0.08, M.darkWood, 0, 1.2, -2.15));
      // esteira e mochila dentro
      t.add(box(1.2, 0.08, 2.6, M.canvas2, 0, 0.05, 0));
      g.add(t);
      this.colliders.push({ x: CAMP.x + x, z: CAMP.z + z, r: 2.3 });
    }
    this.interact.push({ x: CAMP.x - 12, y: y0 + 1, z: CAMP.z - 6, r: 3.2, tipo: 'dormir', label: 'Dormir na barraca (passa 6 h)' });
    // fogueira
    const fire = new THREE.Group();
    fire.position.set(0, 0, 0);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), M.stone);
      s.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75);
      s.castShadow = true;
      fire.add(s);
    }
    for (let k = 0; k < 4; k++) {
      const l = cyl(0.07, 0.08, 1.1, M.darkWood, 0, 0.2, 0, 6);
      l.rotation.z = Math.PI / 2 - 0.35;
      l.rotation.y = (k / 4) * Math.PI;
      fire.add(l);
    }
    this.flames = [];
    for (let k = 0; k < 5; k++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 - k * 0.02, 0.9, 6, 1, true), M.fire);
      f.position.set((Math.random() - 0.5) * 0.3, 0.45, (Math.random() - 0.5) * 0.3);
      fire.add(f);
      this.flames.push(f);
    }
    const light = new THREE.PointLight(0xff9a40, 18, 26, 1.6);
    light.position.set(0, 1.2, 0);
    fire.add(light);
    this.fireLight = light;
    add(fire, 1);
    // troncos para sentar
    for (const [x, z, r] of [
      [2.4, 0.5, 0.2],
      [-2.2, 1.2, -0.4],
      [0.3, -2.5, 1.4],
    ]) {
      const l = cyl(0.25, 0.25, 1.8, M.darkWood, x, 0.25, z, 8);
      l.rotation.z = Math.PI / 2;
      l.rotation.y = r;
      add(l);
    }
    // caixotes e caixa de munição
    for (const [x, z, s, r] of [
      [6, 4, 0.9, 0.3],
      [6.8, 5.2, 0.7, 0.9],
      [5.6, 5.4, 0.6, 0.1],
      [-7, 6, 0.9, -0.3],
    ])
      add(box(s, s, s, M.wood, x, s / 2, z, r), s * 0.8);
    const ammo = add(box(1.4, 0.6, 0.7, M.ammo, -4, 0.3, 4.5, 0.2), 1);
    const lid = box(1.42, 0.08, 0.72, M.yellow, -4, 0.63, 4.5, 0.2);
    g.add(lid);
    void ammo;
    this.interact.push({ x: CAMP.x - 4, y: y0 + 0.6, z: CAMP.z + 4.5, r: 2.5, tipo: 'municao', label: 'Pegar munição' });
    // mesa com mapa
    add(box(2, 0.08, 1, M.wood, 3, 0.85, -4, 0.2), 1.1);
    for (const [dx, dz] of [
      [-0.9, -0.4],
      [0.9, -0.4],
      [-0.9, 0.4],
      [0.9, 0.4],
    ])
      g.add(box(0.08, 0.85, 0.08, M.darkWood, 3 + dx, 0.42, -4 + dz, 0.2));
    // jipe
    const jeep = new THREE.Group();
    jeep.position.set(15, 0, 6);
    jeep.rotation.y = -0.6;
    jeep.add(box(2, 0.9, 4.2, M.metal, 0, 0.95, 0));
    jeep.add(box(1.9, 0.7, 1.9, M.metal, 0, 1.75, -0.4));
    jeep.add(box(1.8, 0.5, 0.06, M.glass, 0, 1.75, 0.56));
    jeep.add(box(1.8, 0.35, 1.3, M.metal, 0, 1.2, 1.4));
    for (const [x, z] of [
      [-1, -1.3],
      [1, -1.3],
      [-1, 1.4],
      [1, 1.4],
    ]) {
      const w = cyl(0.42, 0.42, 0.32, M.tire, x * 1.02, 0.42, z, 14);
      w.rotation.z = Math.PI / 2;
      jeep.add(w);
    }
    const spare = cyl(0.42, 0.42, 0.3, M.tire, 0, 1.2, -2.2, 14);
    spare.rotation.x = Math.PI / 2;
    jeep.add(spare);
    jeep.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.add(jeep);
    this.colliders.push({ x: CAMP.x + 15, z: CAMP.z + 6, r: 2.3 });
    this.colliders.push({ x: CAMP.x + 15 + Math.sin(-0.6) * 1.6, z: CAMP.z + 6 + Math.cos(-0.6) * 1.6, r: 1.4 });
    this.colliders.push({ x: CAMP.x + 15 - Math.sin(-0.6) * 1.6, z: CAMP.z + 6 - Math.cos(-0.6) * 1.6, r: 1.4 });
    // cerca de estacas em volta
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 0.5) < 0.18) continue; // entrada
      const r = 28;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const yy = hf.height(CAMP.x + x, CAMP.z + z) - y0;
      const p = cyl(0.09, 0.12, 1.6, M.darkWood, x, yy + 0.7, z, 5);
      p.rotation.z = Math.cos(a) * 0.15;
      p.rotation.x = -Math.sin(a) * 0.15;
      g.add(p);
    }
    // lampião
    const lamp = new THREE.PointLight(0xffd090, 6, 18, 1.8);
    lamp.position.set(3, 2.2, -4);
    g.add(lamp);
    g.add(cyl(0.05, 0.05, 2.2, M.darkWood, 3.4, 1.1, -4.6, 5));
    this.lamp = lamp;
    this.campY = y0;
  }

  buildTower(hf, t) {
    const g = new THREE.Group();
    const y0 = t.h ?? hf.height(t.x, t.z);
    g.position.set(t.x, y0, t.z);
    g.rotation.y = Math.atan2(t.x, t.z);
    this.group.add(g);
    const M = this.mats;
    const H = 9;
    const W = 3.2;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const leg = box(0.25, H + 1.2, 0.25, M.darkWood, (sx * W) / 2, (H + 1.2) / 2, (sz * W) / 2);
      g.add(leg);
    }
    // travessas em X
    for (let lvl = 0; lvl < 3; lvl++) {
      const y = 1.5 + lvl * 2.8;
      for (const [rx, rz, ry] of [
        [0, -W / 2, 0],
        [0, W / 2, 0],
        [-W / 2, 0, Math.PI / 2],
        [W / 2, 0, Math.PI / 2],
      ]) {
        const b = box(W * 1.32, 0.12, 0.12, M.wood, rx, y + 1.2, rz, ry);
        b.rotation.z = 0.7;
        g.add(b);
        const b2 = box(W * 1.32, 0.12, 0.12, M.wood, rx, y + 1.2, rz, ry);
        b2.rotation.z = -0.7;
        g.add(b2);
      }
    }
    // plataforma, parapeito e telhado
    g.add(box(W + 0.8, 0.2, W + 0.8, M.wood, 0, H, 0));
    for (const [rx, rz, w, d] of [
      [0, -(W + 0.7) / 2, W + 0.8, 0.1],
      [0, (W + 0.7) / 2, W + 0.8, 0.1],
      [-(W + 0.7) / 2, 0, 0.1, W + 0.8],
      [(W + 0.7) / 2, 0, 0.1, W + 0.8],
    ]) {
      g.add(box(w, 0.1, d, M.wood, rx, H + 1.05, rz));
      g.add(box(w, 0.1, d, M.wood, rx, H + 0.55, rz));
    }
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      g.add(box(0.15, 2.4, 0.15, M.darkWood, (sx * (W + 0.6)) / 2, H + 1.2, (sz * (W + 0.6)) / 2));
    const roof = new THREE.Mesh(new THREE.ConeGeometry((W + 1.6) * 0.75, 1.6, 4), M.canvas);
    roof.position.y = H + 3.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    // escada
    const lz = W / 2 + 0.35;
    g.add(box(0.08, H + 0.4, 0.08, M.darkWood, -0.35, (H + 0.4) / 2, lz));
    g.add(box(0.08, H + 0.4, 0.08, M.darkWood, 0.35, (H + 0.4) / 2, lz));
    for (let y = 0.4; y < H; y += 0.4) g.add(box(0.7, 0.05, 0.05, M.wood, 0, y, lz));
    // caixa de munição no pé da torre
    g.add(box(1.2, 0.55, 0.6, M.ammo, 1.8, 0.28, lz + 0.6, 0.3));
    g.add(box(1.22, 0.07, 0.62, M.yellow, 1.8, 0.58, lz + 0.6, 0.3));
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    g.updateMatrixWorld(true);
    const wp = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const p = wp((sx * W) / 2, 0, (sz * W) / 2);
      this.colliders.push({ x: p.x, z: p.z, r: 0.35 });
    }
    const ladder = wp(0, 0, lz + 0.5);
    const top = wp(0, H + 0.1, 0);
    const ammoP = wp(1.8, 0.5, lz + 0.6);
    t.top = top;
    t.base = ladder;
    t.platform = { x: top.x, z: top.z, y: y0 + H + 0.1, half: (W + 0.5) / 2, rot: g.rotation.y };
    this.interact.push({ x: ladder.x, y: y0 + 1, z: ladder.z, r: 2, tipo: 'subir', label: 'Subir na torre', data: t });
    this.interact.push({ x: top.x, y: y0 + H + 1, z: top.z, r: 2.6, tipo: 'descer', label: 'Descer da torre', data: t });
    this.interact.push({ x: ammoP.x, y: ammoP.y, z: ammoP.z, r: 2.2, tipo: 'municao', label: 'Pegar munição' });
  }

  update(dt, night) {
    this.time += dt;
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const s = 0.8 + 0.35 * Math.sin(this.time * (9 + i * 2.3) + i) + 0.15 * Math.sin(this.time * 23 + i * 5);
      f.scale.set(1, s, 1);
      f.rotation.y = this.time * (1 + i * 0.3);
    }
    this.fireLight.intensity = (12 + 6 * Math.sin(this.time * 13) * Math.sin(this.time * 7.3)) * (0.4 + 0.6 * night);
    this.lamp.intensity = 6 * night;
  }

  collide(pos, r) {
    for (const c of this.colliders) {
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = r + c.r;
      if (d < min && d > 1e-4) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }
}
