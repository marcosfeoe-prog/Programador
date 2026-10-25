// Nível 47 — "Corredores Liminares": corredores limpos demais, paredes cor de
// creme, piso de lajotas claras e lâmpadas fortes que não deixam sombra.
// Bancos vazios, vasos de planta de plástico, placas de saída que não levam a
// lugar nenhum. Classe 2 — por causa de um único morador: o Ladrão de Peles.
// Saída: a porta dupla com a placa verde "SAÍDA" de verdade.
import * as THREE from 'three';
import { GridLevel, W, EH } from './grid.js';
import { getTex, indoorEnvTex, registerTexture, TEX, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import { SkinStealer } from './level47_stealer.js';

const mod = (a, n) => ((a % n) + n) % n;
const C = 3;

// Lajotas claras com rejunte.
registerTexture('l47Tile', (S) => {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const n = 4;
  const t = S / n;
  const r = mulberry32(4747);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const l = 82 + r() * 6;
      x.fillStyle = `hsl(38,${18 + r() * 8}%,${l}%)`;
      x.fillRect(i * t, j * t, t, t);
      for (let k = 0; k < 40; k++) {
        x.fillStyle = `rgba(120,100,80,${r() * 0.06})`;
        x.fillRect(i * t + r() * t, j * t + r() * t, 2 + r() * 6, 2 + r() * 6);
      }
    }
  x.fillStyle = '#8a8070';
  const g = Math.max(2, S / 160);
  for (let i = 0; i <= n; i++) {
    x.fillRect(i * t - g / 2, 0, g, S);
    x.fillRect(0, i * t - g / 2, S, g);
  }
  return { map: TEX.toTex(c), normalMap: null };
});

export class Level47 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: C,
      H: 2.9,
      T: 0.16,
      doorW: 1.1,
      doorH: 2.15,
      chunkCells: 8,
      seed: (game.seed ^ 0x4747) >>> 0,
      lightRadius: 9,
      lightEmitPow: 1,
      bounce: 0.7,
      ambient: 0.05,
      wallUV: [1.6, 1.6],
      floorUV: 1.5,
      ceilUV: 1.2,
    });
    this.num = 47;
    this.surface = 'tile';
    this.panelI = 8;
    this.flickerGap = 12;
    this.deadChance = 0.03;
    const S = this.Q.tex;
    const dw = getTex('drywall', S);
    const tl = getTex('l47Tile', S);
    const ce = getTex('ceiling', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#e8e2d4', '#c8c0b0', '#8a8478'], '#ffffff'));
    this.env = env;
    this.mats = {
      floor: { map: tl.map, roughness: 0.25, color: 0xffffff, dirtColor: new THREE.Color(0.6, 0.55, 0.48), dirtAmt: 0.25, wet: 0.5, envMap: env, envIntensity: 0.5 },
      wall: { map: dw.map, normalMap: dw.normalMap, normalScale: 0.4, roughness: 0.8, vertexColors: true, color: 0xf0e6d2, envMap: env, envIntensity: 0.12 },
      ceil: { map: ce.map, normalMap: ce.normalMap, roughness: 0.95, lmIntensity: 0.5, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.55, envMap: env, envIntensity: 0.4 },
    };
    this.panelMat = panelMaterial(pn.map, 0xfffaf0);
    this.look = {
      exposure: 1.08,
      tint: [1.02, 1.0, 0.96],
      sat: 0.9,
      contrast: 1.02,
      lift: [0.03, 0.028, 0.025],
      bloom: 0.3,
      bloomThreshold: 0.9,
      fog: [0.62, 0.58, 0.52],
      fogNear: 0.35,
      lightColor: [1.0, 0.98, 0.93],
      flashlight: false,
      ambience: 'level47',
      reverb: 2.4,
      sanityDrain: 0.06,
    };
    this.objectives = [{ id: 'saida', text: 'Encontre a porta com a placa verde de SAÍDA' }];
    this.route();
    this.stealer = new SkinStealer(this);
  }

  // Corredores longos (a cada 4 linhas e 6 colunas) e algumas salas de espera.
  corridor(ix, iz) {
    if (mod(iz, 4) === 0 && hash3(Math.floor(ix / 9), iz, this.seed + 1) < 0.9) return true;
    if (mod(ix, 6) === 0 && hash3(ix, Math.floor(iz / 7), this.seed + 2) < 0.75) return true;
    return false;
  }

  room(ix, iz) {
    if (this.corridor(ix, iz)) return false;
    return hash3(Math.floor(ix / 2), Math.floor(iz / 2), this.seed + 3) < 0.12;
  }

  open(ix, iz) {
    return this.corridor(ix, iz) || this.room(ix, iz);
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const a = this.open(ix, iz);
    const b = this.open(bx, bz);
    if (!a && !b) return W.NONE;
    if (a && b) {
      const ra = this.room(ix, iz);
      const rb = this.room(bx, bz);
      if (ra !== rb) return hash3(ix * 3 + kind, iz, this.seed + 9) < 0.6 ? W.DOOR : W.NONE;
      return W.NONE;
    }
    return W.FULL;
  }

  genLight(cx, cz) {
    const dc = this.doorCell;
    if (dc && cz === dc[1] && cx === dc[0]) return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: 0, len: 1.2, wid: 0.6, I: 9, group: 0 };
    if (!this.open(cx, cz) || mod(cx + cz, 2)) return null;
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (h < 0.06) group = 3;
    else if (h < 0.12) group = 1;
    return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: mod(cz, 2) ? 1 : 0, len: 1.2, wid: 0.6, I: 9, group };
  }

  dirt(x, z) {
    return clamp((fbm(x * 0.12, z * 0.12, 3, this.seed + 11) - 0.15) / 0.3, 0, 1);
  }

  // Bancos, vasos de planta falsa e bebedouros encostados nas paredes.
  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (!this.open(x, z) || Math.abs(x) + Math.abs(z) < 3) continue;
        const h = this.hashCell(x, z, 41);
        const px = x * C + 1.5;
        const pz = z * C + 1.5;
        // encosta no lado com parede
        const wallN = !this.open(x, z - 1);
        const wallW = !this.open(x - 1, z);
        if (!wallN && !wallW) continue;
        const ox = wallW ? -1.15 : 0;
        const oz = wallN ? -1.15 : 0;
        const rot = wallW && !wallN ? Math.PI / 2 : 0;
        if (h < 0.18) {
          // banco de espera
          const bx = px + ox * 0.95;
          const bz = pz + oz * 0.95;
          const sx = rot ? 0.5 : 1.6;
          const sz = rot ? 1.6 : 0.5;
          ch.colliders.push([bx - sx / 2, bx + sx / 2, bz - sz / 2, bz + sz / 2]);
          ch.props.push({
            ao: [bx - sx / 2, bx + sx / 2, bz - sz / 2, bz + sz / 2, 0],
            draw: (G) => {
              G.prop.box(bx, 0.45, bz, 1.6, 0.06, 0.45, [0.62, 0.48, 0.34], G.lm, { rot });
              G.prop.box(bx, 0.72, bz + (rot ? 0 : oz * 0.2), rot ? 0.06 : 1.6, 0.4, rot ? 1.6 : 0.06, [0.62, 0.48, 0.34], G.lm, { rot: 0 });
              for (const s of [-0.7, 0.7]) G.prop.box(bx + (rot ? 0 : s), 0.22, bz + (rot ? s : 0), 0.05, 0.44, 0.4, [0.3, 0.3, 0.32], G.lm, { rot });
            },
          });
        } else if (h < 0.3) {
          // vaso de planta de plástico
          const vx = px + ox;
          const vz = pz + oz;
          ch.colliders.push([vx - 0.25, vx + 0.25, vz - 0.25, vz + 0.25]);
          ch.props.push({
            draw: (G) => {
              G.prop.cylinder(vx, 0.25, vz, 0.22, 0.5, [0.85, 0.82, 0.76], G.lm, { sides: 10 });
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * TAU + h * 9;
                G.prop.box(vx + Math.cos(a) * 0.12, 0.85 + (k % 2) * 0.15, vz + Math.sin(a) * 0.12, 0.28, 0.5, 0.04, [0.26, 0.48, 0.24], G.lm, { rot: a, ao: 0 });
              }
            },
          });
        } else if (h < 0.34) {
          // bebedouro
          const wx = px + ox * 1.1;
          const wz = pz + oz * 1.1;
          ch.colliders.push([wx - 0.25, wx + 0.25, wz - 0.25, wz + 0.25]);
          ch.props.push({
            draw: (G) => {
              G.prop.box(wx, 0.5, wz, 0.45, 1.0, 0.4, [0.8, 0.8, 0.82], G.lm, { rot });
              G.prop.box(wx, 0.95, wz, 0.4, 0.06, 0.35, [0.6, 0.62, 0.66], G.lm, { rot, ao: 0 });
            },
          });
        }
        if (this.hashCell(x, z, 21) > 0.985) ch.items.push({ type: 'water', key: `47:${x}:${z}:w`, x: px + 0.3, z: pz + 0.3 });
        else if (this.hashCell(x, z, 22) > 0.988) ch.items.push({ type: 'note', key: `47:${x}:${z}:n`, x: px - 0.3, z: pz + 0.2, rot: h * 30 });
      }
  }

  route() {
    const rnd = mulberry32(this.seed * 3 + 7);
    this.clearCell(0, 0);
    const a = rnd() * TAU;
    let dx = Math.round(Math.cos(a) * 30);
    const dz = Math.round((Math.sin(a) * 30) / 4) * 4;
    dx = dx === 0 ? 1 : dx;
    this.clearCell(dx, dz);
    this.carve(0, 0, dx, dz, rnd);
    this.doorCell = [dx, dz];
    this.setEdge(EH, dx, dz, W.EXIT);
    this.door = { x: dx * C + 1.5, z: dz * C + this.T / 2 + 0.01 };
    this.exit = { x: this.door.x, z: this.door.z + 0.7 };
    this.spawn = { x: 1.5, z: 1.5, yaw: Math.atan2(-(this.exit.x - 1.5), -(this.exit.z - 1.5)) };
    this.makeDoor();
  }

  makeDoor() {
    const d = this.door;
    const g = new THREE.Group();
    const leafM = new THREE.MeshStandardMaterial({ color: 0x9aa6a8, roughness: 0.5, metalness: 0.3, emissive: 0x1a2020 });
    const frame = new THREE.MeshStandardMaterial({ color: 0x5a6466, roughness: 0.6 });
    this.leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.55, 0, 0.03);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.54, 2.12, 0.05), leafM);
      leaf.position.set(-s * 0.275, 1.06, 0);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.06), frame);
      bar.position.set(-s * 0.3, 1.0, 0.05);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.5) }));
      win.position.set(-s * 0.275, 1.55, 0.03);
      pivot.add(leaf, bar, win);
      g.add(pivot);
      this.leaves.push({ pivot, s });
    }
    this.signTex = textCanvasTex(256, 96, (c, w, h) => {
      c.fillStyle = '#0a8a3a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#eafff0';
      c.font = 'bold 50px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('SAÍDA', w / 2 + 18, h / 2 + 2);
      c.beginPath();
      c.moveTo(22, h / 2);
      c.lineTo(52, h / 2 - 22);
      c.lineTo(52, h / 2 + 22);
      c.fill();
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.08), [frame, frame, frame, frame, new THREE.MeshBasicMaterial({ map: this.signTex, color: new THREE.Color(1.5, 1.5, 1.5) }), frame]);
    sign.position.set(0, 2.45, 0.1);
    g.add(sign);
    g.position.set(d.x, 0, d.z);
    this.dynamic.add(g);
    this.doorGroup = g;
    this.signLight = new THREE.PointLight(0x40ff80, 2, 4, 2);
    this.signLight.position.set(d.x, 2.3, d.z + 0.6);
    this.dynamic.add(this.signLight);
  }

  tick(dt, player) {
    const g = this.game;
    this.time = (this.time || 0) + dt;
    this.stealer.update(dt, player);
    if (this.opening) {
      this.openK = Math.min(1, this.openK + dt * 1.2);
      for (const l of this.leaves) l.pivot.rotation.y = -l.s * this.openK * 1.5;
    }
    if (this.time > 5 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Corredores limpos demais. Nenhuma sombra. Dizem que aqui mora uma coisa que se veste de gente.', 6);
    }
    this.sanityExtra = this.chased ? 0.5 : 0;
  }

  interactable(player) {
    const p = player.pos;
    const d = this.door;
    if (!this.opening && Math.abs(p.x - d.x) < 1.0 && p.z - d.z > 0 && p.z - d.z < 1.7)
      return {
        label: 'Abrir a porta de SAÍDA',
        action: () => {
          const g = this.game;
          this.opening = true;
          this.openK = 0;
          g.completeObjective('saida', 'A porta dupla abre. Do outro lado, só névoa.');
          g.reachExit('door', 1.0);
        },
      };
    return null;
  }

  radarEntities() {
    const s = this.stealer;
    return s && s.active ? [{ x: s.x, z: s.z }] : [];
  }

  navTarget() {
    return this.exit;
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

  onCollapse() {
    this.stealer.hide();
  }

  groundY() {
    return 0;
  }

  exitEmitter() {
    return { x: this.door.x, y: 1.4, z: this.door.z, sound: 'hum', gain: 0.12 };
  }

  dispose() {
    this.stealer.dispose();
    this.doorGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) m.dispose();
    });
    this.signTex.dispose();
    this.panelMat.dispose();
    super.dispose();
  }
}
