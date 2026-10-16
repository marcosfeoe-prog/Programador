// Nível 45 — "O Escritório Esquecido": corredores longos de um escritório
// abandonado, paredes de reboco cinza, carpete branco manchado, forro de placas
// e luminárias que ainda funcionam pela metade. Algumas alas antigas têm
// paredes de tijolo cinza. Salas com mesas, cadeiras, monitores apagados,
// arquivos e divisórias. Sem entidades.
// Saída: achar o cartão de acesso e abrir a porta de manutenção de metal.
// As texturas de parede, carpete e tijolo são fotos geradas pelo usuário no
// Higgsfield (com recuo para texturas desenhadas por código).
import * as THREE from 'three';
import { GridLevel, W, EH } from './grid.js';
import { getTex, indoorEnvTex, loadPhotoTex, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import './level3_tex.js';

const mod = (a, n) => ((a % n) + n) % n;
const C = 3;

export class Level45 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: C,
      H: 2.8,
      T: 0.16,
      doorW: 1.1,
      doorH: 2.15,
      chunkCells: 8,
      seed: (game.seed ^ 0x4545) >>> 0,
      lightRadius: 9,
      lightEmitPow: 1,
      bounce: 0.55,
      ambient: 0.02,
      wallUV: [1.6, 1.6],
      floorUV: 1.1,
      ceilUV: 1.2,
    });
    this.num = 45;
    this.surface = 'carpet';
    this.panelI = 7;
    this.flickerGap = 7;
    this.deadChance = 0.05;
    const S = this.Q.tex;
    const dw = getTex('drywall', S);
    const oc = getTex('officeCarpet', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const br = getTex('l3Brick', S);
    const env = game.makeEnv(indoorEnvTex(['#5a5c5e', '#3a3c3e', '#202224'], '#f4f8ff'));
    this.env = env;
    this.mats = {
      floor: { map: oc.map, normalMap: oc.normalMap, normalScale: 0.8, roughness: 0.95, color: 0xffffff, dirtColor: new THREE.Color(0.55, 0.5, 0.42), dirtAmt: 0.7, wet: 0.1 },
      wall: { map: dw.map, normalMap: dw.normalMap, normalScale: 0.6, roughness: 0.9, vertexColors: true, color: 0xb8bcc0, envMap: env, envIntensity: 0.1 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.4, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, envMap: env, envIntensity: 0.4 },
      extra: { map: br.map, normalMap: br.normalMap, roughness: 0.95, vertexColors: true, color: 0x6a6c70 },
    };
    this.panelMat = panelMaterial(pn.map, 0xf0f6ff);
    this.look = {
      exposure: 1.0,
      tint: [0.98, 1.0, 1.03],
      sat: 0.82,
      contrast: 1.06,
      lift: [0.012, 0.013, 0.016],
      bloom: 0.2,
      fog: [0.2, 0.21, 0.22],
      fogNear: 0.3,
      lightColor: [0.94, 0.97, 1.0],
      flashlight: false,
      ambience: 'level45',
      reverb: 2.0,
      sanityDrain: 0.1,
    };
    this.objectives = [
      { id: 'cartao', text: 'Encontre o cartão de acesso' },
      { id: 'porta', text: 'Abra a porta de manutenção de metal' },
    ];
    this.route();
  }

  // ------------------------------------------------------------ planta
  // Corredores longos (linhas a cada 4 células, colunas a cada 9) e salas de
  // escritório em blocos de 3×3 ao lado deles.
  corridor(ix, iz) {
    if (mod(iz, 4) === 0 && hash3(Math.floor(ix / 12), iz, this.seed + 1) < 0.9) return true;
    if (mod(ix, 9) === 0 && hash3(ix, Math.floor(iz / 8), this.seed + 2) < 0.75) return true;
    return false;
  }

  room(ix, iz) {
    if (this.corridor(ix, iz)) return false;
    const bx = Math.floor(ix / 3);
    const bz = Math.floor(iz / 3);
    return hash3(bx, bz, this.seed + 3) < 0.32;
  }

  open(ix, iz) {
    return this.corridor(ix, iz) || this.room(ix, iz);
  }

  oldWing(ix, iz) {
    return fbm(ix * 0.06 + 7, iz * 0.06, 2, this.seed + 5) > 0.18;
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const a = this.open(ix, iz);
    const b = this.open(bx, bz);
    if (!a && !b) return W.NONE;
    const ra = this.room(ix, iz);
    const rb = this.room(bx, bz);
    if (a && b) {
      // sala ↔ corredor: porta ou vidro; dentro da sala: aberto
      if (ra && rb) return Math.floor(ix / 3) === Math.floor(bx / 3) && Math.floor(iz / 3) === Math.floor(bz / 3) ? W.NONE : W.FULL;
      if (ra !== rb) {
        const h = hash3(ix * 3 + kind, iz, this.seed + 9);
        return h < 0.35 ? W.DOOR : h < 0.55 ? W.GLASS : W.FULL;
      }
      return W.NONE;
    }
    return W.FULL;
  }

  // Paredes de tijolo nas alas antigas.
  buildEdge(G, kind, ix, iz) {
    if (this.oldWing(ix, iz)) {
      const w = G.wall;
      G.wall = G.extra;
      super.buildEdge(G, kind, ix, iz);
      G.wall = w;
      return;
    }
    super.buildEdge(G, kind, ix, iz);
  }

  genLight(cx, cz) {
    // a porta de manutenção sempre fica sob uma lâmpada que funciona
    const dc = this.doorCell;
    if (dc && cz === dc[1] && Math.abs(cx - dc[0]) <= 2) {
      if (cx !== dc[0] && Math.abs(cx - dc[0]) !== 2) return null;
      return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: 0, len: 1.2, wid: 0.6, I: 8, group: 0 };
    }
    if (!this.open(cx, cz) || mod(cx + cz, 2)) return null;
    const h = this.hashCell(cx, cz, 3);
    const dim = fbm(cx * 0.08 + 13, cz * 0.08, 2, this.seed + 1) < -0.22;
    let group = 0;
    if (dim) group = h < 0.75 ? 3 : 1;
    else if (h < 0.18) group = 3;
    else if (h < 0.28) group = 1;
    else if (h < 0.35) group = 2;
    return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: mod(cz, 2) ? 1 : 0, len: 1.2, wid: 0.6, I: 8, group };
  }

  dirt(x, z) {
    const n = fbm(x * 0.17, z * 0.17, 3, this.seed + 11);
    return clamp((n - 0.02) / 0.3, 0, 1);
  }

  // Mesas, cadeiras, monitores, arquivos, divisórias e papéis no chão.
  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (Math.abs(x) + Math.abs(z) < 3) continue;
        const px = x * C + 1.5;
        const pz = z * C + 1.5;
        if (x === this.cardCell[0] && z === this.cardCell[1]) {
          // a mesa onde o cartão foi esquecido
          this.desk(ch, px, pz, 0, 0.3);
        } else if (this.room(x, z)) {
          const h = this.hashCell(x, z, 41);
          const rot = this.hashCell(x, z, 42) < 0.5 ? 0 : Math.PI / 2;
          if (h < 0.55) this.desk(ch, px, pz, rot, this.hashCell(x, z, 43));
          else if (h < 0.7) this.cabinet(ch, px + 0.9, pz - 0.9, rot);
          else if (h < 0.78) this.partition(ch, px, pz, rot);
        }
        if (this.open(x, z)) {
          const h = this.hashCell(x, z, 21);
          if (h > 0.992) ch.items.push({ type: 'water', key: `45:${x}:${z}:w`, x: px - 0.5, z: pz + 0.4 });
          else if (h > 0.982) ch.items.push({ type: 'note', key: `45:${x}:${z}:n`, x: px + 0.3, z: pz - 0.3, rot: h * 40 });
          else if (h > 0.976 && this.corridor(x, z)) ch.items.push({ type: 'cooler', key: `45:${x}:${z}:c`, x: px + 1.1, z: pz + 1.1 });
          // papéis espalhados
          if (this.hashCell(x, z, 25) < 0.35) {
            const n = 2 + Math.floor(this.hashCell(x, z, 26) * 5);
            ch.props.push({
              draw: (G) => {
                for (let k = 0; k < n; k++) {
                  const a = hash3(x * 7 + k, z, this.seed + 27) * TAU;
                  const r = hash3(x, z * 7 + k, this.seed + 28) * 1.2;
                  G.prop.box(px + Math.cos(a) * r, 0.004, pz + Math.sin(a) * r, 0.21, 0.004, 0.29, [0.86, 0.85, 0.8], G.lm, { rot: a, ao: 0 });
                }
              },
            });
          }
        }
      }
  }

  desk(ch, x, z, rot, r) {
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const P = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    const hx = rot ? 0.4 : 0.75;
    const hz = rot ? 0.75 : 0.4;
    ch.colliders.push([x - hx, x + hx, z - hz, z + hz]);
    ch.props.push({
      ao: [x - hx, x + hx, z - hz, z + hz, 0],
      draw: (G) => {
        const top = [0.62, 0.6, 0.56];
        const metal = [0.3, 0.31, 0.33];
        G.prop.box(x, 0.74, z, 1.5, 0.04, 0.8, top, G.lm, { rot });
        for (const [a, b] of [
          [-0.7, -0.35],
          [0.7, -0.35],
          [-0.7, 0.35],
          [0.7, 0.35],
        ]) {
          const [qx, qz] = P(a, b);
          G.prop.box(qx, 0.36, qz, 0.04, 0.72, 0.04, metal, G.lm, {});
        }
        // monitor apagado e teclado
        const [mx, mz] = P(0, -0.2);
        G.prop.box(mx, 1.0, mz, 0.5, 0.34, 0.04, [0.08, 0.08, 0.09], G.lm, { rot });
        G.prop.box(mx, 0.8, mz, 0.06, 0.12, 0.06, [0.15, 0.15, 0.16], G.lm, { rot });
        const [kx, kz] = P(0, 0.12);
        G.prop.box(kx, 0.765, kz, 0.42, 0.02, 0.14, [0.2, 0.2, 0.21], G.lm, { rot });
        // cadeira (às vezes caída)
        const [cx, cz] = P(0.1, 0.75);
        if (r < 0.75) {
          G.prop.box(cx, 0.46, cz, 0.46, 0.06, 0.46, [0.18, 0.2, 0.24], G.lm, { rot: rot + r });
          G.prop.box(cx, 0.75, cz + 0.2 * Math.cos(rot), 0.44, 0.5, 0.05, [0.18, 0.2, 0.24], G.lm, { rot: rot + r });
          G.prop.cylinder(cx, 0.22, cz, 0.03, 0.44, metal, G.lm, { sides: 6 });
        } else G.prop.box(cx, 0.24, cz, 0.46, 0.46, 0.5, [0.18, 0.2, 0.24], G.lm, { rot: rot + 1.3 });
        // pilha de papéis e caneca
        const [px, pz] = P(-0.45, 0.05);
        G.prop.box(px, 0.79, pz, 0.24, 0.06, 0.3, [0.85, 0.84, 0.8], G.lm, { rot: rot + 0.2 });
      },
    });
  }

  cabinet(ch, x, z, rot) {
    ch.colliders.push([x - 0.3, x + 0.3, z - 0.3, z + 0.3]);
    ch.props.push({
      ao: [x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0],
      draw: (G) => {
        G.prop.box(x, 0.66, z, 0.5, 1.32, 0.6, [0.5, 0.52, 0.54], G.lm, { rot });
        for (let k = 0; k < 4; k++) G.prop.box(x, 0.18 + k * 0.32, z + (rot ? 0 : 0.305), rot ? 0.02 : 0.16, 0.03, rot ? 0.16 : 0.02, [0.2, 0.2, 0.2], G.lm, { ao: 0 });
      },
    });
  }

  partition(ch, x, z, rot) {
    const hx = rot ? 0.04 : 1.2;
    const hz = rot ? 1.2 : 0.04;
    ch.colliders.push([x - hx, x + hx, z - hz, z + hz]);
    ch.props.push({
      ao: [x - hx, x + hx, z - hz, z + hz, 0],
      draw: (G) => {
        G.prop.box(x, 0.75, z, 2.4, 1.5, 0.06, [0.42, 0.46, 0.52], G.lm, { rot });
        G.prop.box(x, 1.52, z, 2.42, 0.04, 0.08, [0.3, 0.3, 0.32], G.lm, { rot, ao: 0 });
      },
    });
  }

  // ------------------------------------------------------------ rota
  route() {
    const rnd = mulberry32(this.seed * 5 + 2);
    this.clearCell(0, 0);
    // cartão numa sala (~20 células), porta de manutenção (~30) em outra direção
    const a = rnd() * TAU;
    const pickRoom = (ang, d) => {
      for (let t = 0; t < 60; t++) {
        const r = d + (t % 7) - 3;
        const aa = ang + (Math.floor(t / 7) - 4) * 0.12;
        const x = Math.round(Math.cos(aa) * r);
        const z = Math.round(Math.sin(aa) * r);
        if (this.room(x, z)) return [x, z];
      }
      return [Math.round(Math.cos(ang) * d), Math.round(Math.sin(ang) * d)];
    };
    const [kx, kz] = pickRoom(a, 20);
    this.clearCell(kx, kz);
    this.carve(0, 0, kx, kz, rnd);
    this.cardCell = [kx, kz];
    this.card = { x: kx * C + 1.5 + 0.4, z: kz * C + 1.5 - 0.15 };
    const da = a + Math.PI * (0.7 + rnd() * 0.6);
    let dx = Math.round(Math.cos(da) * 30);
    const dz = Math.round((Math.sin(da) * 30) / 4) * 4; // num corredor
    dx = dx === 0 ? 1 : dx;
    this.clearCell(dx, dz);
    this.carve(0, 0, dx, dz, rnd);
    this.doorCell = [dx, dz];
    // porta na parede norte da célula
    this.setEdge(EH, dx, dz, W.EXIT);
    this.door = { x: dx * C + 1.5, z: dz * C + this.T / 2 + 0.01 };
    this.exit = { x: this.door.x, z: this.door.z + 0.6 };
    this.spawn = { x: 1.5, z: 1.5, yaw: Math.atan2(-(this.card.x - 1.5), -(this.card.z - 1.5)) };
    this.makeDoor();
  }

  makeDoor() {
    const d = this.door;
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.35, emissive: 0x24282c, envMap: this.env });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.6, metalness: 0.5, emissive: 0x0a0c0e });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.15, 0.06), steel);
    slab.position.set(0, 1.075, 0.03);
    g.add(slab);
    this.doorSlab = slab;
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.25, 0.1), dark);
      f.position.set(s * 0.565, 1.125, 0.05);
      g.add(f);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.06), dark);
    bar.position.set(0, 1.0, 0.09);
    g.add(bar);
    // leitor de cartão com luz vermelha
    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.04), dark);
    reader.position.set(0.75, 1.25, 0.03);
    g.add(reader);
    this.readerLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.2, 0.1) });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.01), this.readerLamp);
    lamp.position.set(0.75, 1.31, 0.055);
    g.add(lamp);
    this.signTex = textCanvasTex(256, 96, (c, w, h) => {
      c.fillStyle = '#d8b418';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#111';
      for (let i = -2; i < 12; i++) {
        c.beginPath();
        c.moveTo(i * 28, 0);
        c.lineTo(i * 28 + 14, 0);
        c.lineTo(i * 28 - 10, h);
        c.lineTo(i * 28 - 24, h);
        c.fill();
      }
      c.fillStyle = '#eceae0';
      c.fillRect(14, 22, w - 28, h - 44);
      c.fillStyle = '#111';
      c.font = 'bold 32px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('MANUTENÇÃO', w / 2, h / 2 + 2);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), new THREE.MeshBasicMaterial({ map: this.signTex, color: new THREE.Color(0.85, 0.85, 0.85) }));
    sign.position.set(0, 1.65, 0.065);
    g.add(sign);
    g.position.set(d.x, 0, d.z);
    this.dynamic.add(g);
    this.doorGroup = g;
    this.doorMats = [steel, dark, this.readerLamp, sign.material];
  }

  // O cartão (criado com o bloco onde fica).
  onChunkBuilt(ch) {
    const k = this.card;
    if (this.cardSpawned || this.taken.has('45:cartao') || this.chunkAt(k.x, k.z) !== ch) return;
    this.cardSpawned = true;
    this.game.items.spawn(
      {
        type: 'x',
        key: '45:cartao',
        x: k.x,
        z: k.z,
        y: 0.765,
        label: 'Pegar o cartão de acesso',
        makeMesh: (it, items) => {
          const g = new THREE.Group();
          const m = items.litMat({ color: 0xe8ecf0, roughness: 0.4 }, 1.2);
          const s = items.litMat({ color: 0x1a5aa8, roughness: 0.4 }, 1.2);
          this.cardMats = [m, s];
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.004, 0.054), m);
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.005, 0.012), s);
          stripe.position.z = -0.015;
          g.add(body, stripe);
          this.cardGeos = [body.geometry, stripe.geometry];
          g.position.set(it.x, it.y, it.z);
          g.rotation.y = 0.4;
          g.scale.setScalar(2.2);
          return g;
        },
        onUse: (game) => {
          game.inventory.add('cartao45');
          game.audio.play('beep', { gain: 0.3, rate: 1.4 });
          game.completeObjective('cartao', 'Um cartão de acesso plastificado: “MANUTENÇÃO — ACESSO LIVRE”. A foto do dono foi arrancada.');
        },
      },
      this.dynamic,
    );
  }

  // ------------------------------------------------------------ fotos
  async preload(px, pz, progress) {
    if (!this.photoTried) {
      this.photoTried = true;
      const L = (n, srgb = true) => loadPhotoTex(`assets/tex/${n}.jpg`, { srgb });
      const [w, wn, f, fn, b, bn] = await Promise.all([L('l45_wall'), L('l45_wall_n', false), L('l45_carpet'), L('l45_carpet_n', false), L('l45_brick'), L('l45_brick_n', false)]);
      this.photos = [w, wn, f, fn, b, bn].filter(Boolean);
      const M = this.mats;
      if (w) {
        Object.assign(M.wall, { map: w, normalMap: wn || M.wall.normalMap, normalScale: 0.8, color: 0xffffff });
        this.wallUV = [1.6, 1.6];
      }
      if (f) Object.assign(M.floor, { map: f, normalMap: fn || M.floor.normalMap, normalScale: 1.0, color: 0xffffff });
      if (b) Object.assign(M.extra, { map: b, normalMap: bn || M.extra.normalMap, normalScale: 1.0, color: 0xffffff });
    }
    return super.preload(px, pz, progress);
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    this.time = (this.time || 0) + dt;
    if (this.opening && this.openK < 1) {
      this.openK = Math.min(1, this.openK + dt * 0.9);
      this.doorSlab.position.x = -this.openK * 1.0;
    }
    const p = player.pos;
    const inOld = this.oldWing(Math.floor(p.x / C), Math.floor(p.z / C));
    if (inOld && !this.toldOld) {
      this.toldOld = true;
      g.hud.message('Uma ala mais antiga: paredes de tijolo cinza, cheiro de pó e papel velho.', 4);
    }
    if (this.time > 6 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Um escritório abandonado. Carpete branco manchado, mesas vazias, monitores apagados. Ninguém trabalha aqui há muito tempo.', 6);
    }
  }

  interactable(player) {
    const g = this.game;
    const p = player.pos;
    const d = this.door;
    const dx = p.x - d.x;
    const dz = p.z - d.z;
    if (!this.opening && Math.abs(dx) < 1.0 && dz > 0 && dz < 1.6) {
      if (!g.inventory.has('cartao45'))
        return {
          label: 'Porta de manutenção (trancada)',
          action: () => {
            g.audio.play('beep', { gain: 0.3, rate: 0.5 });
            g.hud.message('O leitor pisca vermelho: ACESSO NEGADO. Precisa de um cartão de acesso — deve estar em alguma sala.', 4);
          },
        };
      return {
        label: 'Passar o cartão e abrir a porta',
        action: () => {
          g.inventory.remove('cartao45');
          this.readerLamp.color.setRGB(0.2, 2.6, 0.5);
          g.audio.play('beep', { gain: 0.35, rate: 1.5 });
          g.audio.door();
          this.opening = true;
          this.openK = 0;
          g.completeObjective('porta', 'Luz verde. A porta de metal desliza. Atrás dela, uma escada de serviço descendo.');
          g.reachExit('door', 1.3);
        },
      };
    }
    return null;
  }

  navTarget() {
    return this.game.objectiveDone('cartao') ? this.exit : this.card;
  }

  collide(p, r) {
    super.collide(p, r);
    if (!this.opening) {
      const d = this.door;
      const qx = clamp(p.x, d.x - 0.6, d.x + 0.6);
      const qz = clamp(p.z, d.z - 0.02, d.z + 0.1);
      const ddx = p.x - qx;
      const ddz = p.z - qz;
      const dd = Math.hypot(ddx, ddz);
      if (dd < r && dd > 1e-6) {
        p.x = qx + (ddx / dd) * r;
        p.z = qz + (ddz / dd) * r;
      }
    }
    return p;
  }

  groundY() {
    return 0;
  }

  exitEmitter() {
    return { x: this.door.x, y: 1.4, z: this.door.z, sound: 'hum', gain: 0.15 };
  }

  dispose() {
    if (this.photos) for (const t of this.photos) t.dispose();
    for (const m of this.doorMats) m.dispose();
    if (this.cardMats) for (const m of this.cardMats) m.dispose();
    if (this.cardGeos) for (const g of this.cardGeos) g.dispose();
    this.doorGroup.traverse((o) => o.geometry && o.geometry.dispose());
    this.signTex.dispose();
    this.panelMat.dispose();
    super.dispose();
  }
}

