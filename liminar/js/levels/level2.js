// Nível 2 — "Salões de Utilidades Abandonados": túneis de manutenção estreitos
// de concreto sujo e esbranquiçado, cobertos de canos, fiação e máquinas. Os
// canos marcados com faixa vermelha estão quentes demais: ficar encostado
// neles queima e corrói a sanidade. Lâmpadas nuas, algumas zonas apagam.
// Sem entidades hostis. Só o Jeffrey, um papagaio que fala.
// Objetivo: achar a chave dourada e abrir a porta de manutenção trancada (→ Nível 3).
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import { standardWake } from './wake.js';
import { Parrot } from './level2_parrot.js';

const mod = (a, n) => ((a % n) + n) % n;

export class Level2 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 2.4,
      H: 2.7,
      T: 0.22,
      doorW: 0.95,
      doorH: 2.05,
      chunkCells: 8,
      seed: (game.seed ^ 0x2222) >>> 0,
      lightRadius: 9,
      lightEmitPow: 0.4,
      bounce: 0.6,
      ambient: 0.02,
      wallUV: [2.4, 2.4],
      floorUV: 2.4,
      ceilUV: 2.4,
    });
    this.num = 2;
    this.surface = 'concrete';
    this.panelI = 9;
    this.flickerGap = 6;
    const S = this.Q.tex;
    const cw = getTex('concrete', S);
    const cf = getTex('concreteFloor', S);
    const sl = getTex('slab', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#4a4236', '#2c2620', '#1a1612'], '#fff0c8', 4));
    this.mats = {
      floor: { map: cf.map, normalMap: cf.normalMap, roughnessMap: cf.roughnessMap, roughness: 1, dirtColor: new THREE.Color(0.5, 0.45, 0.38), dirtAmt: 0.7, wet: 0.5, envMap: env, envIntensity: 0.6 },
      wall: { map: cw.map, normalMap: cw.normalMap, roughness: 0.95, vertexColors: true, color: 0xe8e0d0, envMap: env, envIntensity: 0.15 },
      ceil: { map: sl.map, roughness: 1, lmIntensity: 0.32, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.55, metalness: 0.35, envMap: env, envIntensity: 0.6 },
    };
    this.panelMat = panelMaterial(pn.map, 0xffd28a);
    this.look = {
      exposure: 1.0,
      tint: [1.06, 1.0, 0.88],
      sat: 0.85,
      contrast: 1.1,
      lift: [0.012, 0.009, 0.004],
      bloom: 0.24,
      fog: [0.09, 0.075, 0.055],
      fogNear: 0.15,
      lightColor: [1.0, 0.86, 0.62],
      flashlight: false,
      ambience: 'level2',
      reverb: 1.8,
      sanityDrain: 0.14,
    };
    this.objectives = [
      { id: 'key', text: 'Encontre a chave dourada' },
      { id: 'door', text: 'Abra a porta de manutenção trancada' },
    ];
    this.heat = 0;
    this.route();
  }

  // ------------------------------------------------------------ planta
  // Túneis: linhas horizontais a cada 5 células e verticais a cada 6, com trechos
  // interrompidos, e salinhas de utilidades 2×2 aqui e ali.
  corridor(ix, iz) {
    if (mod(iz, 5) === 0 && hash3(Math.floor(ix / 7), iz, this.seed + 1) < 0.82) return true;
    if (mod(ix, 6) === 0 && hash3(ix, Math.floor(iz / 6), this.seed + 2) < 0.78) return true;
    return hash3(Math.floor(ix / 2), Math.floor(iz / 2), this.seed + 3) < 0.07;
  }

  genEdge(kind, ix, iz) {
    const a = this.corridor(ix, iz);
    const b = kind === EH ? this.corridor(ix, iz - 1) : this.corridor(ix - 1, iz);
    if (a && b) return hash3(ix * 3 + kind, iz, this.seed + 9) < 0.03 ? W.DOOR : W.NONE;
    if (a || b) return hash3(ix * 2 + kind, iz, this.seed + 11) < 0.06 ? W.DOOR : W.FULL;
    return W.NONE;
  }

  dark(cx, cz) {
    if (Math.abs(cx) + Math.abs(cz) < 10) return false;
    return fbm(cx * 0.08 + 20, cz * 0.08, 3, this.seed + 8) < -0.2;
  }

  genLight(cx, cz) {
    if (!this.corridor(cx, cz) || mod(cx + cz, 2)) return null;
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (this.dark(cx, cz)) group = h < 0.85 ? 3 : 1;
    else if (h < 0.08) group = 3;
    else if (h < 0.16) group = 1;
    else if (h < 0.22) group = 2;
    return { x: cx * this.cell + 1.2, z: cz * this.cell + 1.2, y: this.H - 0.18, ax: 0, len: 0.25, wid: 0.25, I: 13, group };
  }

  // Lâmpada nua numa grade de proteção, pendurada num fio.
  buildLight(G, L) {
    const y = L.y;
    G.prop.box(L.x, (y + this.H) / 2 + 0.08, L.z, 0.02, this.H - y - 0.16, 0.02, [0.12, 0.12, 0.12], G.lm, { ao: 0 });
    G.prop.cylinder(L.x, y + 0.12, L.z, 0.06, 0.06, [0.3, 0.28, 0.25], G.lm, { sides: 8 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU;
      G.prop.box(L.x + Math.cos(a) * 0.09, y, L.z + Math.sin(a) * 0.09, 0.012, 0.2, 0.012, [0.2, 0.2, 0.2], G.lm, { ao: 0 });
    }
    G.panel.cylinder(L.x, y - 0.02, L.z, 0.05, 0.12, [1, 1, 1], null, { sides: 8, group: L.group });
  }

  dirt(x, z) {
    const n = fbm(x * 0.15, z * 0.15, 3, this.seed + 11);
    return clamp((n + 0.05) / 0.3, 0, 1);
  }

  // Canos de um lado da parede: null ou { hot, n } (n = quantos canos).
  pipes(kind, ix, iz) {
    if (this.edge(kind, ix, iz) !== W.FULL) return null;
    const h = hash3(ix * 5 + kind, iz * 3, this.seed + 21);
    if (h > 0.62) return null;
    return { hot: h < 0.26, n: 2 + Math.floor(hash3(ix, iz + kind, this.seed + 22) * 3) };
  }

  decorateEdge(G, kind, ix, iz, t) {
    if (t !== W.FULL) return;
    const P = this.pipes(kind, ix, iz);
    if (!P) return;
    const c = this.cell;
    const hT = this.T / 2;
    const sides = [];
    if (kind === EH) {
      if (this.corridor(ix, iz)) sides.push(1);
      if (this.corridor(ix, iz - 1)) sides.push(-1);
    } else {
      if (this.corridor(ix, iz)) sides.push(1);
      if (this.corridor(ix - 1, iz)) sides.push(-1);
    }
    const hot = P.hot;
    for (const s of sides) {
      for (let k = 0; k < P.n; k++) {
        const r = k === 0 ? 0.11 : 0.05 + hash3(ix, iz, k + 30) * 0.04;
        const y = k === 0 ? 2.15 : 0.35 + k * 0.42;
        const off = hT + r + 0.03;
        const col = hot && k === 0 ? [0.42, 0.26, 0.16] : [0.36, 0.36, 0.33];
        if (kind === EH) G.prop.cylinder(ix * c + c / 2, y, iz * c + s * off, r, c + 0.02, col, G.lm, { axis: 'x', sides: 8, caps: false });
        else G.prop.cylinder(ix * c + s * off, y, iz * c + c / 2, r, c + 0.02, col, G.lm, { axis: 'z', sides: 8, caps: false });
      }
      // faixa vermelha de aviso e suportes
      if (hot) {
        const y = 2.15;
        if (kind === EH) G.prop.cylinder(ix * c + c / 2, y, iz * c + s * (hT + 0.14), 0.118, 0.12, [0.7, 0.06, 0.04], G.lm, { axis: 'x', sides: 8, caps: false });
        else G.prop.cylinder(ix * c + s * (hT + 0.14), y, iz * c + c / 2, 0.118, 0.12, [0.7, 0.06, 0.04], G.lm, { axis: 'z', sides: 8, caps: false });
      }
      for (const a of [0.3, c - 0.3]) {
        if (kind === EH) G.prop.box(ix * c + a, 1.3, iz * c + s * (hT + 0.06), 0.05, 2.0, 0.1, [0.25, 0.25, 0.24], G.lm, { ao: 0 });
        else G.prop.box(ix * c + s * (hT + 0.06), 1.3, iz * c + a, 0.1, 2.0, 0.05, [0.25, 0.25, 0.24], G.lm, { ao: 0 });
      }
    }
  }

  // Máquinas paradas nas salinhas e caixas de fiação.
  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    const c = this.cell;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (Math.abs(x) + Math.abs(z) < 3) continue;
        const room = !(mod(z, 5) === 0 || mod(x, 6) === 0) && this.corridor(x, z);
        const h = this.hashCell(x, z, 41);
        if (room && h < 0.45) {
          const px = x * c + c / 2;
          const pz = z * c + c / 2;
          const w = 0.9 + this.hashCell(x, z, 42) * 0.6;
          const hh = 1.2 + this.hashCell(x, z, 43) * 1.0;
          ch.props.push({
            ao: [px - w / 2, px + w / 2, pz - 0.45, pz + 0.45, 0],
            draw: (G) => {
              G.prop.box(px, hh / 2, pz, w, hh, 0.9, [0.32, 0.34, 0.3], G.lm, {});
              G.prop.box(px, hh + 0.05, pz, w * 0.7, 0.1, 0.6, [0.25, 0.25, 0.24], G.lm, {});
              G.prop.cylinder(px + w / 2 - 0.15, hh + 0.4, pz, 0.08, 0.8, [0.4, 0.4, 0.38], G.lm, { sides: 8 });
              G.prop.box(px, hh * 0.6, pz + 0.46, w * 0.5, 0.25, 0.02, [0.55, 0.5, 0.3], G.lm, { ao: 0 });
            },
          });
          ch.colliders.push([px - w / 2, px + w / 2, pz - 0.45, pz + 0.45]);
        }
        if (this.corridor(x, z) && h > 0.985) ch.items.push({ type: 'water', key: `2:${x}:${z}:w`, x: x * c + 1.2, z: z * c + 1.2 });
        if (this.corridor(x, z) && h > 0.97 && h <= 0.985) ch.items.push({ type: 'note', key: `2:${x}:${z}:n`, x: x * c + 1.2, z: z * c + 1.0, rot: h * 40 });
      }
  }

  // ------------------------------------------------------------ rota
  route() {
    const rnd = mulberry32(this.seed * 3 + 7);
    const c = this.cell;
    this.clearCell(0, 0);
    // chave: ~20 células; porta: ~28 células, em outra direção
    const ka = rnd() * TAU;
    const kx = Math.round(Math.cos(ka) * 20);
    const kz = Math.round(Math.sin(ka) * 20);
    const da = ka + Math.PI * (0.6 + rnd() * 0.8);
    const dx = Math.round(Math.cos(da) * 28);
    const dz = Math.round(Math.sin(da) * 28);
    this.clearCell(kx, kz);
    this.clearCell(dx, dz);
    this.carve(0, 0, kx, kz, rnd);
    this.carve(0, 0, dx, dz, rnd);
    // Jeffrey: num poleiro a 3 células
    this.clearCell(3, 0);
    this.carve(0, 0, 3, 0, rnd);
    this.keyP = { x: kx * c + c / 2, z: kz * c + c / 2 };
    // porta de manutenção na parede norte da célula da porta
    this.setEdge(EH, dx, dz, W.EXIT);
    this.setEdge(EH, dx, dz + 1, this.edge(EH, dx, dz + 1) === W.FULL ? W.DOOR : this.edge(EH, dx, dz + 1));
    this.door = { x: dx * c + c / 2, z: dz * c + this.T / 2 + 0.01 };
    this.exit = { x: this.door.x, z: this.door.z + 0.6 };
    this.spawn = { x: c / 2, z: c / 2, yaw: -Math.PI / 2 };
    this.makeDoor();
    this.parrot = new Parrot(this, 3 * c + c / 2, c / 2);
  }

  makeDoor() {
    const g = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0x8a8678, emissive: 0x1a1812 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3630, emissive: 0x0a0806 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.05, 0.06), steel);
    slab.position.set(0, 1.025, 0.03);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.05), dark);
    frame.position.set(0, 1.1, 0.01);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), dark);
    handle.position.set(0.36, 1.0, 0.08);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), new THREE.MeshLambertMaterial({ color: 0xc8a030, emissive: 0x302008 }));
    lock.position.set(0.36, 1.18, 0.08);
    this.signTex = textCanvasTex(256, 96, (c, w, h) => {
      c.fillStyle = '#d8c020';
      c.fillRect(0, 0, w, h);
      for (let i = -2; i < 12; i++) {
        c.fillStyle = '#111';
        c.beginPath();
        c.moveTo(i * 28, 0);
        c.lineTo(i * 28 + 14, 0);
        c.lineTo(i * 28 - 10, h);
        c.lineTo(i * 28 - 24, h);
        c.fill();
      }
      c.fillStyle = '#f2ecd8';
      c.fillRect(14, 22, w - 28, h - 44);
      c.fillStyle = '#111';
      c.font = 'bold 34px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('MANUTENÇÃO', w / 2, h / 2 + 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), new THREE.MeshLambertMaterial({ map: this.signTex, emissive: 0x202020 }));
    sign.position.set(0, 1.6, 0.065);
    g.add(frame, slab, handle, lock, sign);
    g.position.set(this.door.x, 0, this.door.z);
    this.dynamic.add(g);
    this.doorMats = [steel, dark, lock.material, sign.material];
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    if (this.wake === undefined)
      this.wake = standardWake(
        this,
        this.spawn.x,
        this.spawn.z,
        this.spawn.yaw,
        [
          [1.0, 'Calor. Cheiro de óleo queimado e poeira.'],
          [4.2, 'Canos por todo lado, chiando baixinho.'],
          [7.3, 'Alguma coisa assobiou. Parecia uma palavra.'],
          [10.2, ''],
        ],
        { sound: 'hiss', done: () => g.hud.objective('Nível 2: túneis de utilidades. Não encoste nos canos com faixa vermelha.', 7) },
      );
    this.parrot.update(dt, player);
    if (this.wake.active) {
      this.wake.update(dt);
      return;
    }
    this.updateHeat(dt, player);
  }

  // Calor dos canos com faixa vermelha.
  updateHeat(dt, player) {
    const g = this.game;
    const c = this.cell;
    const hT = this.T / 2;
    const p = player.pos;
    const cx = Math.floor(p.x / c);
    const cz = Math.floor(p.z / c);
    let k = 0;
    const test = (kind, ix, iz, d) => {
      const P = this.pipes(kind, ix, iz);
      if (P && P.hot) k = Math.max(k, clamp((0.95 - d) / 0.6, 0, 1));
    };
    test(EH, cx, cz, p.z - cz * c - hT);
    test(EH, cx, cz + 1, (cz + 1) * c - hT - p.z);
    test(EV, cx, cz, p.x - cx * c - hT);
    test(EV, cx + 1, cz, (cx + 1) * c - hT - p.x);
    this.heat = k;
    this.sanityExtra = k * 4.5;
    g.st.fear = Math.max(g.st.fear, k * 0.5);
    if (k > 0.2) {
      g.damage = Math.max(g.damage, k * 0.35);
      this.hissT = (this.hissT || 0) - dt;
      if (this.hissT <= 0) {
        this.hissT = 1.4;
        g.audio.play('steam', { gain: 0.15 + k * 0.25, rate: 0.9 + Math.random() * 0.3 });
      }
      if (!this.toldHeat) {
        this.toldHeat = true;
        g.hud.message('Os canos com faixa vermelha queimam! O calor esmaga a cabeça. Afaste-se deles.', 4.5);
        g.vibrate(80);
      }
    }
  }

  interactable(player) {
    const p = player.pos;
    const g = this.game;
    if (Math.hypot(p.x - this.door.x, p.z - (this.door.z + 0.5)) < 1.3) {
      if (!g.inventory.has('chaveOuro'))
        return {
          label: 'Porta de manutenção (trancada)',
          action: () => {
            g.audio.play('knock', { gain: 0.3, rate: 0.8 });
            g.hud.message('Trancada. A fechadura é dourada, antiga. Precisa de uma chave dourada.', 3.5);
          },
        };
      return {
        label: 'Destrancar com a chave dourada',
        action: () => {
          g.inventory.remove('chaveOuro');
          g.completeObjective('door', 'A chave gira com um estalo. Atrás da porta, uma escada de serviço desce para o escuro.');
          g.reachExit('door', 1.0);
        },
      };
    }
    return this.parrot.interactable(player);
  }

  navTarget() {
    return this.game.inventory.has('chaveOuro') || this.game.objectiveDone('key') ? this.exit : this.keyP;
  }

  exitEmitter() {
    return { x: this.door.x, y: 1.4, z: this.door.z, sound: 'machine', gain: 0.4 };
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    this.parrot.dispose();
    for (const m of this.doorMats) m.dispose();
    this.signTex.dispose();
    super.dispose();
  }
}

// A chave dourada (criada junto com o bloco onde fica).
Level2.prototype.onChunkBuilt = function (ch) {
  const k = this.keyP;
  if (this.keySpawned || this.taken.has('2:key')) return;
  if (this.chunkAt(k.x, k.z) !== ch) return;
  this.keySpawned = true;
  this.game.items.spawn(
    {
      type: 'key',
      key: '2:key',
      x: k.x,
      z: k.z,
      y: 0.02,
      label: 'Pegar a chave dourada',
      makeMesh: (it) => keyMesh(this, it, 0xd8b040, 0x6a4a08),
      onUse: (game) => {
        game.inventory.add('chaveOuro');
        game.audio.play('ding', { gain: 0.4, rate: 1.4 });
        game.completeObjective('key', 'Uma chave dourada, pesada, com a etiqueta “MANUT.”. Agora ache a porta.');
      },
    },
    this.dynamic,
  );
};

// Malha de chave antiga (anel, haste, dentes) com brilho.
export function keyMesh(L, it, color, emissive) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.3, emissive });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 8, 16), m);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-0.07, 0.01, 0);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.012), m);
  shaft.position.set(0.02, 0.01, 0);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.035), m);
  bit.position.set(0.065, 0.01, 0.018);
  g.add(ring, shaft, bit);
  if (!keyMesh.tex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    keyMesh.tex = new THREE.CanvasTexture(cv);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: keyMesh.tex, color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(0.5);
  glow.position.y = 0.05;
  g.add(glow);
  g.scale.setScalar(1.8);
  g.position.set(it.x, it.y || 0.02, it.z);
  g.rotation.y = 0.7;
  L.dynamic.add(g);
  return g;
}
