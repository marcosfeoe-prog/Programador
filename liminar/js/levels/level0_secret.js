// Segredo do Nível 0: um rastro vermelho longo no carpete que serpenteia entre as
// salas até uma porta de madeira fora de lugar. Ela leva ao Subnível 0.1.
import * as THREE from 'three';
import { W, EH, EV } from './grid.js';
import { TEX } from '../textures.js';
import { clamp, hash3, TAU } from '../util.js';

// Faixa arrastada: vermelho escuro, bordas irregulares, gotas e marcas de dedos.
function smearTex() {
  const w = 64;
  const h = 512;
  const cv = TEX.makeCanvas(w, h);
  const c = cv.getContext('2d');
  const img = c.createImageData(w, h);
  const n = TEX.noiseField(w, h, 4, 16, 4, 77);
  const n2 = TEX.noiseField(w, h, 8, 64, 3, 91);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = Math.abs(x / (w - 1) - 0.5) * 2;
      const edge = 0.7 + (n[i] - 0.5) * 0.45;
      let a = clamp((edge - u) * 6, 0, 1);
      // listras do arrasto (dedos/tecido) e partes mais secas
      const streak = 0.5 + 0.5 * Math.sin(x * 0.85 + n2[i] * 4);
      a *= 0.72 + 0.28 * streak;
      a *= clamp(0.55 + n[(i + w * 97) % (w * h)] * 0.8, 0.45, 1);
      const d = 0.75 + n2[i] * 0.45 - streak * 0.15;
      const p = i * 4;
      img.data[p] = clamp(150 * d, 0, 255);
      img.data[p + 1] = clamp(14 * d, 0, 255);
      img.data[p + 2] = clamp(12 * d, 0, 255);
      img.data[p + 3] = clamp(a * 235, 0, 255);
    }
  }
  c.putImageData(img, 0, 0);
  const t = TEX.toTex(cv);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

// Respingos e gotas isoladas.
function dropTex() {
  const s = 128;
  const cv = TEX.makeCanvas(s, s);
  const c = cv.getContext('2d');
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  c.fillStyle = 'rgba(140,12,10,0.92)';
  c.beginPath();
  c.arc(s / 2, s / 2, s * 0.2, 0, TAU);
  c.fill();
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU;
    const d = s * (0.18 + r() * 0.26);
    c.globalAlpha = 0.5 + r() * 0.5;
    c.beginPath();
    c.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, 1 + r() * 5, 0, TAU);
    c.fill();
  }
  return TEX.toTex(cv, { repeat: false });
}

// Porta de madeira: tábuas verticais com veios, almofadas e uma mão vermelha.
function doorTex() {
  const w = 256;
  const h = 512;
  const cv = TEX.makeCanvas(w, h);
  const c = cv.getContext('2d');
  const img = c.createImageData(w, h);
  const n = TEX.noiseField(w, h, 4, 64, 4, 13);
  const g = TEX.noiseField(w, h, 32, 4, 3, 29);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const plank = Math.floor(x / 64);
      const vein = Math.sin(x * 0.42 + g[i] * 9 + plank * 2.1) * 0.5 + 0.5;
      const k = 0.55 + vein * 0.25 + n[i] * 0.3 + (plank % 2) * 0.05;
      const gap = x % 64 < 2 ? 0.35 : 1;
      const p = i * 4;
      img.data[p] = clamp(118 * k * gap, 0, 255);
      img.data[p + 1] = clamp(72 * k * gap, 0, 255);
      img.data[p + 2] = clamp(40 * k * gap, 0, 255);
      img.data[p + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  // almofadas
  c.strokeStyle = 'rgba(30,16,8,0.55)';
  c.lineWidth = 6;
  c.strokeRect(36, 40, w - 72, h * 0.36);
  c.strokeRect(36, h * 0.5, w - 72, h * 0.42);
  c.strokeStyle = 'rgba(255,220,170,0.12)';
  c.lineWidth = 2;
  c.strokeRect(40, 44, w - 80, h * 0.36 - 8);
  c.strokeRect(40, h * 0.5 + 4, w - 80, h * 0.42 - 8);
  // mão arrastada perto da maçaneta
  c.fillStyle = 'rgba(110,10,8,0.85)';
  const hx = w * 0.72;
  const hy = h * 0.47;
  c.beginPath();
  c.ellipse(hx, hy, 18, 22, 0.2, 0, TAU);
  c.fill();
  for (let f = 0; f < 4; f++) {
    c.beginPath();
    c.ellipse(hx - 16 + f * 11, hy - 30 - (f === 1 || f === 2 ? 6 : 0), 4.5, 13, 0.1, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 0.5;
  c.fillRect(hx - 12, hy + 10, 20, 90);
  c.globalAlpha = 0.3;
  c.fillRect(hx - 6, hy + 90, 8, 60);
  return TEX.toTex(cv, { repeat: false });
}

// Caixa sem índices com sombreamento falso por face (iluminação vem do lightmap local).
function shadedBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const nor = g.attributes.normal;
  const col = new Float32Array(nor.count * 3);
  for (let i = 0; i < nor.count; i++) {
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const k = ny > 0.5 ? 0.9 : ny < -0.5 ? 0.45 : Math.abs(nx) > 0.5 ? 0.68 : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class SecretTrail {
  // L: o Level0; rnd: gerador; awayAng: direção oposta à fenda.
  constructor(L, rnd, awayAng) {
    this.L = L;
    const c = L.cell;
    const hT = L.T / 2;
    // direção principal (cardinal) e início do rastro a 7–9 células do início
    const ang = awayAng + (rnd() - 0.5) * 1.2;
    const dist = 7 + Math.floor(rnd() * 3);
    let x = Math.round(Math.cos(ang) * dist);
    let z = Math.round(Math.sin(ang) * dist);
    const main = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)) ? [Math.sign(Math.cos(ang)), 0] : [0, Math.sign(Math.sin(ang))];
    const perp = [main[1], main[0]];
    const cells = [[x, z]];
    const open = (kind, ix, iz) => {
      const t = L.edge(kind, ix, iz);
      if (t !== W.NONE && t !== W.DOOR && t !== W.EXIT) L.setEdge(kind, ix, iz, W.DOOR);
    };
    const step = (dx, dz) => {
      if (dx) open(EV, dx > 0 ? x + 1 : x, z);
      else open(EH, x, dz > 0 ? z + 1 : z);
      x += dx;
      z += dz;
      cells.push([x, z]);
    };
    L.clearCell(x, z);
    // segmentos alternados: em frente 2–4 células, de lado 1–3
    let total = 0;
    let side = rnd() < 0.5 ? 1 : -1;
    while (total < 20) {
      const a = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < a; i++) step(main[0], main[1]);
      total += a;
      if (total >= 20) break;
      const b = 1 + Math.floor(rnd() * 3);
      if (rnd() < 0.7) side = -side;
      for (let i = 0; i < b; i++) step(perp[0] * side, perp[1] * side);
      total += b;
    }
    // porta: parede adiante da última célula (ou numa lateral, se aquela já é passagem)
    const tryDirs = [main, perp, [-perp[0], -perp[1]]];
    let door = null;
    for (const d of tryDirs) {
      const kind = d[0] ? EV : EH;
      const ix = d[0] > 0 ? x + 1 : x;
      const iz = d[1] > 0 ? z + 1 : z;
      const k = L.key(ix, iz) * 2 + kind;
      if (L.overrides.has(k)) continue;
      door = { kind, ix, iz, dir: d };
      break;
    }
    if (!door) door = { kind: main[0] ? EV : EH, ix: main[0] > 0 ? x + 1 : x, iz: main[1] > 0 ? z + 1 : z, dir: main };
    L.setEdge(door.kind, door.ix, door.iz, W.EXIT);
    // lado do rastro (normal da porta aponta para dentro da última célula)
    const nx = -door.dir[0];
    const nz = -door.dir[1];
    const wx = door.kind === EV ? door.ix * c : door.ix * c + c / 2;
    const wz = door.kind === EH ? door.iz * c : door.iz * c + c / 2;
    this.door = { x: wx + nx * (hT + 0.005), z: wz + nz * (hT + 0.005), nx, nz };
    this.cells = cells;
    this.start = { x: cells[0][0] * c + c / 2, z: cells[0][1] * c + c / 2 };
    this.buildTrail(rnd);
    this.buildDoor();
    this.seen = false;
    this.creaked = false;
  }

  buildTrail(rnd) {
    const L = this.L;
    const c = L.cell;
    const pts = [];
    for (let i = 0; i < this.cells.length; i++) {
      const [cx, cz] = this.cells[i];
      const j = i === 0 || i === this.cells.length - 1 ? 0.08 : 0.32;
      pts.push(new THREE.Vector3(cx * c + c / 2 + (rnd() - 0.5) * j * 2, 0, cz * c + c / 2 + (rnd() - 0.5) * j * 2));
    }
    // termina rente à porta
    const d = this.door;
    pts.push(new THREE.Vector3(d.x + d.nx * 0.25, 0, d.z + d.nz * 0.25));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const N = Math.ceil(len / 0.2);
    const pos = [];
    const uv = [];
    const col = [];
    const idx = [];
    const seed = 41;
    const tan = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t);
      curve.getTangentAt(t, tan);
      const s = t * len;
      // largura que respira; mais fina no começo, borrada perto da porta
      let wdt = 0.26 + 0.14 * (Math.sin(s * 0.7 + 1) * 0.5 + 0.5) + hash3(Math.floor(s * 2), 3, seed) * 0.06;
      wdt *= clamp(s / 2, 0.55, 1);
      if (len - s < 3) wdt *= 1 + (3 - (len - s)) * 0.12;
      const ox = -tan.z * wdt;
      const oz = tan.x * wdt;
      const wob = (hash3(Math.floor(s * 3), 9, seed) - 0.5) * 0.04;
      pos.push(p.x + ox + wob, 0.009, p.z + oz, p.x - ox + wob, 0.009, p.z - oz);
      uv.push(0, s / 2.2, 1, s / 2.2);
      col.push(0.6, 0.6, 0.6, 0.6, 0.6, 0.6);
      if (i < N) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    // gotas espalhadas (algumas ao lado, mais perto da porta)
    const drops = Math.round(len * 0.9);
    for (let k = 0; k < drops; k++) {
      const t = Math.pow(rnd(), 0.6);
      const p = curve.getPointAt(t);
      const a = rnd() * TAU;
      const r = 0.25 + rnd() * 0.35;
      const sz = 0.05 + rnd() * 0.12;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const b = pos.length / 3;
      pos.push(x - sz, 0.01, z - sz, x + sz, 0.01, z - sz, x + sz, 0.01, z + sz, x - sz, 0.01, z + sz);
      uv.push(2, 0, 3, 0, 3, 1, 2, 1);
      col.push(0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.trailGeo = geo;
    // um único material: u<=1 = faixa, u em [2,3] = gota (shader escolhe a textura)
    const smear = smearTex();
    const drop = dropTex();
    const mat = new THREE.MeshBasicMaterial({
      map: smear,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      fog: true,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.dropMap = { value: drop };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\nuniform sampler2D dropMap;')
        .replace(
          '#include <map_fragment>',
          `vec4 sampledDiffuseColor = vMapUv.x > 1.5 ? texture2D( dropMap, vec2( vMapUv.x - 2.0, vMapUv.y ) ) : texture2D( map, vMapUv );
           diffuseColor *= sampledDiffuseColor;`,
        );
    };
    mat.customProgramCacheKey = () => 'liminar-trail';
    this.trailMat = mat;
    this.trail = new THREE.Mesh(geo, mat);
    this.trail.renderOrder = 2;
    this.trail.frustumCulled = false;
    L.dynamic.add(this.trail);
  }

  buildDoor() {
    const L = this.L;
    const d = this.door;
    const g = new THREE.Group();
    const wood = new THREE.MeshBasicMaterial({ map: doorTex(), vertexColors: true, fog: true });
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x3b2414, vertexColors: true, fog: true });
    const brass = new THREE.MeshBasicMaterial({ color: 0xb08a3a, vertexColors: true, fog: true });
    const DW = 0.96;
    const DH = 2.08;
    const slab = new THREE.Mesh(shadedBox(DW, DH, 0.05), wood);
    slab.position.set(0, DH / 2, 0.03);
    g.add(slab);
    const fw = 0.08;
    const left = new THREE.Mesh(shadedBox(fw, DH + fw, 0.1), frameMat);
    left.position.set(-DW / 2 - fw / 2, (DH + fw) / 2, 0.05);
    const right = left.clone();
    right.position.x = DW / 2 + fw / 2;
    const top = new THREE.Mesh(shadedBox(DW + fw * 2, fw, 0.1), frameMat);
    top.position.set(0, DH + fw / 2, 0.05);
    g.add(left, right, top);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), brass);
    const kc = new Float32Array(knob.geometry.attributes.position.count * 3).fill(1);
    knob.geometry.setAttribute('color', new THREE.BufferAttribute(kc, 3));
    knob.position.set(DW / 2 - 0.1, 1.0, 0.1);
    const plate = new THREE.Mesh(shadedBox(0.05, 0.16, 0.012), brass);
    plate.position.set(DW / 2 - 0.1, 0.98, 0.06);
    g.add(knob, plate);
    // fresta de luz quente sob a porta
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(DW - 0.04, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }),
    );
    glow.position.set(0, 0.008, 0.06);
    glow.rotation.x = -Math.PI / 2;
    const glow2 = new THREE.Mesh(
      new THREE.PlaneGeometry(DW - 0.06, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffd8a0, fog: true }),
    );
    glow2.position.set(0, 0.012, 0.057);
    g.add(glow, glow2);
    g.position.set(d.x, 0, d.z);
    g.rotation.y = Math.atan2(d.nx, d.nz);
    L.dynamic.add(g);
    this.doorGroup = g;
    this.doorMats = [wood, frameMat, brass];
    for (const m of this.doorMats) m.userData.base = m.color.clone();
    this.glow = glow;
  }

  // Escurece o rastro e a porta conforme a luz pré-calculada de cada bloco.
  onChunkBuilt(ch) {
    const L = this.L;
    const S = L.S;
    const pos = this.trailGeo.attributes.position;
    const col = this.trailGeo.attributes.color;
    let dirty = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (x < ch.x0 || x >= ch.x0 + S || z < ch.z0 || z >= ch.z0 + S) continue;
      const k = clamp(L.lightLevel(x, z) * 0.85 + 0.06, 0.05, 1.6);
      col.setXYZ(i, k, k * 0.96, k * 0.9);
      dirty = true;
    }
    if (dirty) col.needsUpdate = true;
    const d = this.door;
    if (L.chunkAt(d.x + d.nx * 0.6, d.z + d.nz * 0.6) === ch) {
      const k = clamp(L.lightLevel(d.x + d.nx * 0.6, d.z + d.nz * 0.6) * 0.9 + 0.1, 0.12, 1.5);
      for (const m of this.doorMats) m.color.copy(m.userData.base).multiplyScalar(k);
    }
  }

  tick(dt, player) {
    const p = player.pos;
    const g = this.L.game;
    if (!this.seen && Math.hypot(p.x - this.start.x, p.z - this.start.z) < 3.2) {
      this.seen = true;
      g.hud.message('Um rastro vermelho e comprido no carpete… alguém foi arrastado por aqui.', 4.5);
      g.audio.play('heart', { gain: 0.25 });
    }
    const d = this.door;
    const dd = Math.hypot(p.x - d.x, p.z - d.z);
    if (!this.creaked && dd < 6) {
      this.creaked = true;
      g.audio.play('creak', { gain: 0.35, wet: 0.8 });
      g.hud.message('Uma porta de madeira. Não deveria existir aqui.', 3.5);
    }
    this.glow.material.opacity = 0.7 + Math.sin(g.time * 2.3) * 0.1 + Math.sin(g.time * 7.1) * 0.05;
  }

  interactable(player) {
    const p = player.pos;
    const d = this.door;
    const ax = p.x - d.x;
    const az = p.z - d.z;
    const front = ax * d.nx + az * d.nz;
    const lat = Math.abs(ax * d.nz - az * d.nx);
    if (front > 0 && front < 1.5 && lat < 0.8) {
      return { label: 'Abrir a porta de madeira', action: () => this.L.game.enterLevel('0.1', 'door', 0.7) };
    }
    return null;
  }
}
