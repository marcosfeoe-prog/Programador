// Nível 46 — "Deserto Árabe": dunas sem fim sob um sol branco, vento quente
// e algumas cabanas de madeira perdidas na areia. Sem entidades, mas o calor
// mata: fora da sombra a sanidade cai e a vista tremula. Depois de ~600 m de
// caminhada o andarilho é levado para o próximo nível.
// Eventos: tempestade de areia, miragem (um oásis que some) e onda de calor.
import * as THREE from 'three';
import { OutdoorLevel, makeSky } from './outdoor.js';
import { pushCircle } from './grid.js';
import { TEX } from '../textures.js';
import { clamp, damp, lerp, mulberry32, smoothstep, TAU } from '../util.js';
import { buildHouse, dotTex } from './level177_common.js';

const GOAL = 600;
const R_WALK = 900;

function groundH(x, z) {
  // dunas: cristas longas na direção do vento + ondulações menores
  const a = x * 0.8 + z * 0.6;
  const b = -x * 0.6 + z * 0.8;
  const ridge = Math.pow(Math.abs(Math.sin(a * 0.018 + Math.sin(b * 0.011) * 1.4)), 1.6) * 7;
  const big = 3.5 * Math.sin(x * 0.006 + 1) * Math.sin(z * 0.007);
  const small = 0.25 * Math.sin(a * 0.35 + Math.sin(b * 0.2)) + 0.15 * Math.sin(b * 0.5);
  const flat = smoothstep(4, 22, Math.hypot(x, z));
  return (ridge + big + small) * flat;
}

const E_MIR = (L) => L.event && L.event.id === 'mirage';

function sandTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#d6b07a';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(4646);
  const k = S / 512;
  // marcas de vento (ondinhas)
  for (let i = 0; i < 160; i++) {
    const y = r() * S;
    x.strokeStyle = r() < 0.5 ? 'rgba(150,105,60,0.18)' : 'rgba(250,225,180,0.2)';
    x.lineWidth = (1 + r() * 2) * k;
    x.beginPath();
    for (let px = -10; px <= S + 10; px += 8) x.lineTo(px, y + Math.sin(px * 0.03 + i) * 4 * k);
    x.stroke();
  }
  // grãos
  const n = Math.floor((S * S) / 18);
  for (let i = 0; i < n; i++) {
    const l = 55 + r() * 30;
    x.fillStyle = `hsl(${30 + r() * 14},${40 + r() * 25}%,${l}%)`;
    x.fillRect(r() * S, r() * S, k, k);
  }
  return TEX.toTex(c);
}

export class Level46 extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.1, camFar: 2500 });
    this.num = 46;
    this.seed = (game.seed ^ 0x4646) >>> 0;
    this.time = 0;
    this.walked = 0;
    this.heat = 0;
    this.blur = 0;
    this.sanityExtra = 0;
    this.colliders = [];
    this.cabins = [];
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.event = null;
    this.eventT = 50; // primeiro evento
    this.k = { storm: 0, wave: 0 };
    this.base = { exposure: 1.08, tint: [1.08, 1.0, 0.88], sat: 0.95, contrast: 1.05, lift: [0.03, 0.02, 0.0], bloom: 0.3, bloomThreshold: 1.0 };
    this.look = {
      ...this.base,
      fog: [0.92, 0.8, 0.62],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level46',
      reverb: 0.5,
      sanityDrain: 0.02,
    };
    this.objectives = [{ id: 'andar', text: 'Atravesse o deserto (600 m)' }];
    this.fogBase = new THREE.Color(...this.look.fog);
    this.fogStorm = new THREE.Color(0.72, 0.52, 0.32);
    this.scene.fog = new THREE.FogExp2(this.fogBase.clone(), 0.0025);
    this.scene.background = this.fogBase.clone();
    this.sky = makeSky({
      zenith: [0.32, 0.5, 0.78],
      horizon: [0.95, 0.86, 0.7],
      ground: [0.7, 0.55, 0.38],
      fog: this.look.fog,
      sunDir: new THREE.Vector3(0.2, 0.85, -0.3),
      sunColor: [1.6, 1.4, 1.1],
      sunDisk: 2.5,
      cloudA: [0.85, 0.8, 0.72],
      cloudB: [1.0, 0.97, 0.9],
      cover: 0.82,
    });
    this.scene.add(this.sky);
    this.setupLights({
      sky: 0xfff0d8,
      ground: 0xb08850,
      hemi: 1.4,
      sunColor: 0xfff2d8,
      sun: 2.6,
      sunDir: new THREE.Vector3(0.25, 0.85, -0.3),
      shadowExtent: 40,
    });
    this.spawn = { x: 0, z: 0, yaw: 0 };
    // direção "certa" é qualquer uma: conta a distância do ponto de partida
    this.exit = { x: 0, z: -GOAL };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  async preload(px, pz, progress) {
    progress(0.2);
    this.makeGround();
    progress(0.5);
    await new Promise((r) => setTimeout(r, 0));
    this.makeCabins();
    this.makeRocks();
    this.makeMirage();
    this.makeDust();
    this.spawnItems();
    this.updateSun({ x: px, z: pz });
    progress(1);
  }

  makeGround() {
    const Q = this.Q;
    const S = 900;
    const n = Q.id === 'low' ? 150 : 240;
    const geo = new THREE.PlaneGeometry(S, S, n, n);
    geo.rotateX(-Math.PI / 2);
    this.geos.push(geo);
    this.groundGeo = geo;
    const map = sandTex(Math.min(1024, Q.tex));
    map.repeat.set(S / 6, S / 6);
    this.texs.push(map);
    this.ground = new THREE.Mesh(geo, this.mat(new THREE.MeshStandardMaterial({ map, roughness: 1 })));
    this.ground.receiveShadow = Q.shadows;
    this.scene.add(this.ground);
    this.placeGround(0, 0);
  }

  // O chão acompanha o jogador (a malha é refeita a cada 60 m).
  placeGround(px, pz) {
    const cx = Math.round(px / 60) * 60;
    const cz = Math.round(pz / 60) * 60;
    if (this.gc && this.gc[0] === cx && this.gc[1] === cz) return;
    this.gc = [cx, cz];
    const p = this.groundGeo.attributes.position;
    if (!this.gx) this.gx = Float32Array.from({ length: p.count }, (_, i) => p.getX(i));
    if (!this.gz) this.gz = Float32Array.from({ length: p.count }, (_, i) => p.getZ(i));
    for (let i = 0; i < p.count; i++) {
      const x = this.gx[i] + cx;
      const z = this.gz[i] + cz;
      p.setXYZ(i, x, groundH(x, z), z);
    }
    p.needsUpdate = true;
    this.groundGeo.computeVertexNormals();
    this.groundGeo.computeBoundingSphere();
  }

  // Cabanas perdidas: madeira desbotada, porta aberta, sombra lá dentro.
  makeCabins() {
    const r = mulberry32(this.seed + 9);
    const spots = [];
    for (let k = 0; k < 9; k++) {
      const a = r() * TAU;
      const d = 45 + k * 70 + r() * 30;
      spots.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    // uma sempre à vista do começo
    spots[0] = [14, -38];
    for (const [x, z] of spots) {
      let y = -Infinity;
      for (const [a, b] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ])
        y = Math.max(y, groundH(x + a, z + b));
      const h = buildHouse(
        { x, z, w: 4.4, d: 4.8, rot: Math.round(r() * 4) * (Math.PI / 2), y: y - 0.6, color: [0.78, 0.66, 0.5], roof: [0.55, 0.42, 0.3], lit: false, chimney: false, H: 2.4 },
        this.colliders,
        this.Q.tex,
      );
      h.mesh.castShadow = h.mesh.receiveShadow = this.Q.shadows;
      h.roofMesh.castShadow = this.Q.shadows;
      this.dynamic.add(h.group);
      this.cabins.push(h);
    }
  }

  inCabin(x, z, m = 0) {
    for (const h of this.cabins) if (h.inside(x, z, m)) return h;
    return null;
  }

  makeRocks() {
    const r = mulberry32(this.seed + 21);
    const rock = this.mat(new THREE.MeshStandardMaterial({ color: 0xa07850, roughness: 0.95, flatShading: true }));
    const bone = this.mat(new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 }));
    this.circles = [];
    for (let k = 0; k < 90; k++) {
      const a = r() * TAU;
      const d = 20 + r() * 700;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (this.inCabin(x, z, -4)) continue;
      const s = 0.5 + r() * 2.2;
      const geo = new THREE.DodecahedronGeometry(s, 0);
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, rock);
      m.position.set(x, groundH(x, z) + s * 0.2, z);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.scale.y = 0.55;
      m.castShadow = this.Q.shadows;
      this.dynamic.add(m);
      this.circles.push([x, z, s * 0.8]);
    }
    // ossos e um poste de madeira caído aqui e ali
    for (let k = 0; k < 25; k++) {
      const a = r() * TAU;
      const d = 15 + r() * 650;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const g = new THREE.CylinderGeometry(0.04, 0.05, 0.6 + r() * 0.5, 6);
      this.geos.push(g);
      const m = new THREE.Mesh(g, r() < 0.6 ? bone : rock);
      m.position.set(x, groundH(x, z) + 0.04, z);
      m.rotation.set(Math.PI / 2, 0, r() * 3);
      this.dynamic.add(m);
    }
  }

  // Evento "miragem": um oásis brilhante no horizonte que some ao se aproximar.
  makeMirage() {
    const g = new THREE.Group();
    const water = this.mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.7, 1.2), transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const palm = this.mat(new THREE.MeshBasicMaterial({ color: 0x1e4a1a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const trunk = this.mat(new THREE.MeshBasicMaterial({ color: 0x6a4a2a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 32), water);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.3;
    g.add(pool);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.4;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 7, 6), trunk);
      t.position.set(Math.cos(a) * 10, 3.5, Math.sin(a) * 10);
      t.rotation.z = Math.sin(a) * 0.15;
      const c = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 7), palm);
      c.position.set(Math.cos(a) * 10, 7.2, Math.sin(a) * 10);
      g.add(t, c);
    }
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    g.visible = false;
    this.scene.add(g);
    this.mirage = g;
    this.mirageMats = [water, palm, trunk];
  }

  // Poeira/areia voando (mais densa na tempestade).
  makeDust() {
    this.dot = dotTex();
    this.texs.push(this.dot);
    const n = this.Q.id === 'low' ? 500 : 1000;
    const p = new Float32Array(n * 3);
    const r = mulberry32(77);
    for (let i = 0; i < n; i++) p.set([(r() - 0.5) * 60, r() * 8, (r() - 0.5) * 60], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.geos.push(g);
    this.dustMat = this.mat(new THREE.PointsMaterial({ map: this.dot, color: 0xd8b888, size: 0.12, transparent: true, opacity: 0.25, depthWrite: false }));
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  spawnItems() {
    const g = this.game;
    const items = [];
    this.cabins.forEach((h, i) => {
      const [x, z] = h.toWorld(0.8, -0.8);
      items.push({ type: 'water', key: `46:w${i}`, x, z, y: h.floor + 0.02, light: 0.5 });
      if (i % 3 === 0) {
        const [nx, nz] = h.toWorld(-0.9, 0.2);
        items.push({ type: 'note', key: `46:n${i}`, x: nx, z: nz, y: h.floor + 0.02, rot: i, light: 0.5 });
      }
    });
    for (const it of items) if (!this.taken.has(it.key)) g.items.spawn(it, this.dynamic);
  }

  // ------------------------------------------------------------ eventos
  startEvent(force) {
    const g = this.game;
    const list = ['storm', 'mirage', 'wave'].filter((e) => e !== this.lastEvent);
    const id = force || list[Math.floor(Math.random() * list.length)];
    this.mirage.visible = false;
    this.k.storm = this.k.wave = 0;
    this.lastEvent = id;
    this.event = { id, t: 0, dur: id === 'storm' ? 40 : id === 'wave' ? 35 : 60 };
    if (id === 'storm') {
      g.hud.message('O horizonte escurece. Uma TEMPESTADE DE AREIA está chegando — procure uma cabana!', 6);
      g.audio.play('wind', { gain: 0.5, rate: 0.6 });
    } else if (id === 'wave') {
      g.hud.message('O ar começa a queimar. ONDA DE CALOR — fique na sombra ou beba água.', 6);
      g.audio.play('heart', { gain: 0.25 });
    } else {
      const P = g.player;
      const a = P.yaw + (Math.random() - 0.5) * 0.8;
      const d = 85;
      const x = P.pos.x - Math.sin(a) * d;
      const z = P.pos.z - Math.cos(a) * d;
      this.mirage.position.set(x, groundH(x, z), z);
      this.mirage.visible = true;
      this.event.fade = 0;
      g.hud.message('Ali, no horizonte… água? Palmeiras? Um OÁSIS.', 5);
    }
  }

  updateEvent(dt, player) {
    const g = this.game;
    const E = this.event;
    if (!E) {
      this.eventT -= dt;
      if (this.eventT <= 0) this.startEvent();
      return;
    }
    E.t += dt;
    const on = smoothstep(0, 6, E.t) * (1 - smoothstep(E.dur - 6, E.dur, E.t));
    if (E.id === 'storm') {
      this.k.storm = on;
      if (E.t > 8 && !E.hit && !this.inCabin(player.pos.x, player.pos.z) && Math.random() < dt * 0.3) {
        g.damage = Math.max(g.damage, 0.35);
        g.addSanity(-1.5);
      }
    } else if (E.id === 'wave') {
      this.k.wave = on;
    } else {
      // miragem: some com uma falha quando o andarilho chega perto
      const d = Math.hypot(player.pos.x - this.mirage.position.x, player.pos.z - this.mirage.position.z);
      const vanish = d < 40 || E.t > E.dur - 3;
      if (vanish && !E.gone) {
        E.gone = true;
        g.glitch = Math.max(g.glitch, 0.5);
        g.hud.message('A água tremula e some. Só areia. Era uma miragem.', 4);
        g.addSanity(-4);
      }
      E.fade = damp(E.fade, E.gone ? 0 : 1, E.gone ? 4 : 0.6, dt);
      const sh = Math.sin(this.time * 7) * 0.08;
      this.mirageMats[0].opacity = E.fade * (0.75 + sh);
      this.mirageMats[1].opacity = E.fade * (0.85 + sh);
      this.mirageMats[2].opacity = E.fade * (0.85 + sh);
      this.mirage.scale.set(1.8, 1.8 * (1 + Math.sin(this.time * 3) * 0.04), 1.8);
      if (E.gone && E.fade < 0.02) E.t = E.dur;
    }
    if (E.t >= E.dur) {
      if (E.id === 'storm') g.hud.message('A tempestade passa. O deserto está igual — como se nada tivesse acontecido.', 4);
      if (E.id === 'wave') g.hud.message('O calor diminui um pouco.', 3);
      this.mirage.visible = false;
      this.event = null;
      this.k.storm = this.k.wave = 0;
      this.eventT = 45 + Math.random() * 35;
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = t * (1 + this.k.storm * 6);
    this.updateSun(p);
    this.placeGround(p.x, p.z);
    this.updateEvent(dt, player);
    const K = this.k;
    // calor: aumenta fora da sombra, mais rápido na onda de calor
    const shade = !!this.inCabin(p.x, p.z);
    const target = shade ? 0.1 : 0.45 + 0.55 * K.wave;
    this.heat = damp(this.heat, target, shade ? 0.5 : 0.08, dt);
    this.sanityExtra = shade ? -0.5 : 0.15 + this.heat * 0.7 + K.wave * 0.9 + K.storm * 0.3;
    if (!shade && this.heat > 0.8 && Math.random() < dt * 0.25) {
      g.damage = Math.max(g.damage, 0.25);
      g.vibrate(40);
    }
    if (this.heat > 0.6 && !this.toldHeat) {
      this.toldHeat = true;
      g.hud.message('O calor é insuportável. A vista tremula. Procure a sombra das cabanas e beba água.', 6);
    }
    // efeitos de tela: tremor do calor e areia da tempestade
    this.blur = clamp(this.heat * 0.18 + Math.sin(t * 2.1) * 0.05 * this.heat + K.wave * 0.25 + K.storm * 0.35, 0, 0.9);
    const u = g.post.u;
    const B = this.base;
    u.uExposure.value = B.exposure + K.wave * 0.2 - K.storm * 0.15;
    u.uTint.value.setRGB(B.tint[0] + K.wave * 0.12, B.tint[1] - K.storm * 0.05, B.tint[2] - K.wave * 0.12 - K.storm * 0.15);
    u.uBloom.value = B.bloom + K.wave * 0.35;
    this.scene.fog.density = lerp(0.0025, 0.06, K.storm) * (E_MIR(this) ? 0.5 : 1);
    this.scene.fog.color.copy(this.fogBase).lerp(this.fogStorm, K.storm);
    this.scene.background.copy(this.scene.fog.color);
    this.dustMat.opacity = 0.2 + K.storm * 0.6;
    this.dustMat.size = 0.1 + K.storm * 0.12;
    if (g.audio.wind && g.audio.wind.gain) g.audio.wind.gain.gain.setTargetAtTime(g.audio.wind.base * (1 + K.storm * 3), g.audio.ctx.currentTime, 0.5);
    // areia voando com o vento
    const dp = this.dust.geometry.attributes.position;
    const wv = 3 + K.storm * 14;
    for (let i = 0; i < dp.count; i++) {
      let x = dp.getX(i) + wv * dt;
      let y = dp.getY(i) + Math.sin(t * 2 + i) * dt * 0.3;
      let z = dp.getZ(i) + wv * 0.4 * dt;
      if (x > cam.x + 30) x -= 60;
      if (x < cam.x - 30) x += 60;
      if (z > cam.z + 30) z -= 60;
      if (z < cam.z - 30) z += 60;
      if (y > cam.y + 6) y -= 8;
      if (y < cam.y - 2) y += 8;
      dp.setXYZ(i, x, y, z);
    }
    dp.needsUpdate = true;
    // distância percorrida
    this.walked = Math.max(this.walked, Math.hypot(p.x - this.spawn.x, p.z - this.spawn.z));
    if (this.walked > 300 && !this.toldHalf) {
      this.toldHalf = true;
      g.hud.message('Metade do caminho. Ou nenhum caminho. As dunas são todas iguais.', 4);
    }
    if (this.walked >= GOAL && !this.leaving) {
      this.leaving = true;
      g.completeObjective('andar', 'O chão some debaixo dos seus pés. A areia te engole.');
      g.reachExit('noclip', 0.6);
    }
  }

  // Indicador: aponta "para frente" a partir de onde o andarilho já está.
  navTarget() {
    const p = this.game.player.pos;
    const d = Math.hypot(p.x - this.spawn.x, p.z - this.spawn.z);
    if (d < 1) return this.exit;
    const k = (GOAL + 2) / d;
    return { x: this.spawn.x + (p.x - this.spawn.x) * k, z: this.spawn.z + (p.z - this.spawn.z) * k };
  }

  collide(p, r) {
    const d = Math.hypot(p.x, p.z);
    if (d > R_WALK) {
      p.x *= R_WALK / d;
      p.z *= R_WALK / d;
    }
    for (let it = 0; it < 2; it++) {
      for (const c of this.circles) {
        const dx = p.x - c[0];
        const dz = p.z - c[1];
        if (Math.abs(dx) > c[2] + 1 || Math.abs(dz) > c[2] + 1) continue;
        const dd = Math.hypot(dx, dz);
        const rr = r + c[2];
        if (dd < rr && dd > 1e-4) {
          p.x = c[0] + (dx / dd) * rr;
          p.z = c[1] + (dz / dd) * rr;
        }
      }
      for (const b of this.colliders) if (p.x > b[0] - 2 && p.x < b[1] + 2 && p.z > b[2] - 2 && p.z < b[3] + 2) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    }
    return p;
  }

  groundY(x, z) {
    const h = this.inCabin(x, z, -0.1);
    if (h) return h.floor;
    return groundH(x, z);
  }

  surfaceAt(x, z) {
    return this.inCabin(x, z, -0.1) ? 'wood' : 'dirt';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable() {
    return null;
  }

  dispose() {
    super.dispose();
    for (const h of this.cabins) h.dispose();
    for (const o of [this.sky, this.ground, this.mirage, this.dust]) this.scene.remove(o);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}
