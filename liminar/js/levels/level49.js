// Nível 49 — "Estou Sozinho?" (Classe 3): um subsolo esverdeado de blocos de
// concreto pintados, piso de lajota marrom-escura, teto de concreto em
// caixotões com canos e tubos fluorescentes. Salões com pilares grossos,
// muretas baixas, máquinas de venda apagadas e corrimões; corredores longos
// demais ligando tudo. Mora aqui A Figura. A saída fica no fim de um túnel de
// concreto: uma parede que brilha.
import * as THREE from 'three';
import { GridLevel, W, EH, EV } from './grid.js';
import { getTex, indoorEnvTex, registerTexture, TEX } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import { TheFigure } from './level49_figure.js';

const mod = (a, n) => ((a % n) + n) % n;
const C = 3;

// Blocos de concreto pintados (tinta clara e grossa, rejunte fundo).
registerTexture('l49Block', (S) => {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#d6d8c4';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(4949);
  const rows = 8;
  const cols = 4;
  const bh = S / rows;
  const bw = S / cols;
  for (let j = 0; j < rows; j++) {
    const off = j % 2 ? bw / 2 : 0;
    for (let i = -1; i <= cols; i++) {
      const l = 80 + r() * 6;
      x.fillStyle = `hsl(${62 + r() * 10},${14 + r() * 6}%,${l}%)`;
      x.fillRect(i * bw + off + 2, j * bh + 2, bw - 4, bh - 4);
      for (let k = 0; k < 30; k++) {
        x.fillStyle = `rgba(90,95,70,${r() * 0.12})`;
        x.beginPath();
        x.arc(i * bw + off + r() * bw, j * bh + r() * bh, 0.5 + r() * 2.2, 0, TAU);
        x.fill();
      }
    }
  }
  x.strokeStyle = 'rgba(70,72,58,0.55)';
  x.lineWidth = Math.max(2, S / 180);
  for (let j = 0; j <= rows; j++) {
    x.beginPath();
    x.moveTo(0, j * bh);
    x.lineTo(S, j * bh);
    x.stroke();
    const off = j % 2 ? bw / 2 : 0;
    for (let i = 0; i <= cols; i++) {
      x.beginPath();
      x.moveTo(i * bw + off, j * bh);
      x.lineTo(i * bw + off, (j + 1) * bh);
      x.stroke();
    }
  }
  return { map: TEX.toTex(c), normalMap: null };
});

// Lajotas marrom-escuras, quadradas, com rejunte claro.
registerTexture('l49Floor', (S) => {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const n = 6;
  const t = S / n;
  const r = mulberry32(494);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.fillStyle = `hsl(${20 + r() * 8},${22 + r() * 8}%,${17 + r() * 6}%)`;
      x.fillRect(i * t, j * t, t, t);
      for (let k = 0; k < 25; k++) {
        x.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
        x.fillRect(i * t + r() * t, j * t + r() * t, 3 + r() * 8, 2 + r() * 5);
      }
    }
  x.fillStyle = '#5a5246';
  const g = Math.max(2, S / 200);
  for (let i = 0; i <= n; i++) {
    x.fillRect(i * t - g / 2, 0, g, S);
    x.fillRect(0, i * t - g / 2, S, g);
  }
  return { map: TEX.toTex(c), normalMap: null };
});

// Teto de concreto em caixotões.
registerTexture('l49Ceil', (S) => {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#b8bcae';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(4994);
  for (let k = 0; k < 400; k++) {
    x.fillStyle = `rgba(80,85,70,${r() * 0.1})`;
    x.fillRect(r() * S, r() * S, 2 + r() * 10, 2 + r() * 10);
  }
  const m = S * 0.12;
  const gr = x.createLinearGradient(0, 0, 0, m);
  gr.addColorStop(0, 'rgba(40,44,36,0.55)');
  gr.addColorStop(1, 'rgba(40,44,36,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, S, m);
  x.fillStyle = 'rgba(40,44,36,0.4)';
  x.fillRect(0, 0, m * 0.5, S);
  x.strokeStyle = 'rgba(230,232,220,0.5)';
  x.lineWidth = S / 60;
  x.strokeRect(m * 0.6, m * 0.6, S - m * 1.2, S - m * 1.2);
  return { map: TEX.toTex(c), normalMap: null };
});

export class Level49 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: C,
      H: 3.3,
      T: 0.24,
      doorW: 1.2,
      doorH: 2.3,
      chunkCells: 8,
      seed: (game.seed ^ 0x4949) >>> 0,
      lightRadius: 9,
      lightEmitPow: 1,
      bounce: 0.5,
      ambient: 0.02,
      wallUV: [1.6, 1.6],
      floorUV: 1.8,
      ceilUV: 3,
    });
    this.num = 49;
    this.surface = 'tile';
    this.panelI = 7;
    this.flickerGap = 8;
    this.deadChance = 0.12;
    const S = this.Q.tex;
    const bl = getTex('l49Block', S);
    const fl = getTex('l49Floor', S);
    const ce = getTex('l49Ceil', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const co = getTex('concrete', S);
    const env = game.makeEnv(indoorEnvTex(['#7a8a6a', '#4a5440', '#1a2018'], '#e8f4e0'));
    this.env = env;
    this.mats = {
      floor: { map: fl.map, roughness: 0.45, color: 0xffffff, dirtColor: new THREE.Color(0.12, 0.1, 0.08), dirtAmt: 0.5, wet: 0.35, envMap: env, envIntensity: 0.4 },
      wall: { map: bl.map, roughness: 0.9, vertexColors: true, color: 0xffffff, envMap: env, envIntensity: 0.08 },
      ceil: { map: ce.map, roughness: 0.95, lmIntensity: 0.45, vertexColors: true },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.6, envMap: env, envIntensity: 0.35 },
      extra: { map: co.map, normalMap: co.normalMap, roughness: 0.95, vertexColors: true, color: 0x8a8e80 },
    };
    this.panelMat = panelMaterial(pn.map, 0xeaffe0);
    this.look = {
      exposure: 0.92,
      tint: [0.88, 1.06, 0.84],
      sat: 0.75,
      contrast: 1.12,
      lift: [0.008, 0.018, 0.006],
      bloom: 0.3,
      bloomThreshold: 0.9,
      fog: [0.05, 0.07, 0.045],
      fogNear: 0.2,
      lightColor: [0.86, 1.0, 0.82],
      flashlight: true,
      ambience: 'level49',
      reverb: 2.6,
      sanityDrain: 0.12,
    };
    this.objectives = [
      { id: 'tunel', text: 'Encontre a entrada dos túneis' },
      { id: 'parede', text: 'Siga o túnel até a parede que brilha' },
    ];
    this.route();
    this.figure = new TheFigure(this);
  }

  // ------------------------------------------------------------ planta
  // Corredores longos (a cada 5 linhas / 7 colunas) e salões de 3x3 com pilares.
  corridor(ix, iz) {
    if (mod(iz, 5) === 0 && hash3(Math.floor(ix / 11), iz, this.seed + 1) < 0.85) return true;
    if (mod(ix, 7) === 0 && hash3(ix, Math.floor(iz / 9), this.seed + 2) < 0.7) return true;
    return false;
  }

  hall(ix, iz) {
    return hash3(Math.floor(ix / 4), Math.floor(iz / 4), this.seed + 3) < 0.2;
  }

  inTunnel(ix, iz) {
    const T = this.tunnel;
    return !!T && iz === T.z && ix >= Math.min(T.x0, T.x1) && ix <= Math.max(T.x0, T.x1);
  }

  open(ix, iz) {
    return this.inTunnel(ix, iz) || this.corridor(ix, iz) || this.hall(ix, iz);
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const ta = this.inTunnel(ix, iz);
    const tb = this.inTunnel(bx, bz);
    if (ta || tb) {
      if (ta && tb) return W.NONE;
      // a boca do túnel
      const T = this.tunnel;
      if (kind === EV && iz === T.z && ((ta && ix === T.x0 && bx === T.x0 - T.dir) || (tb && bx === T.x0 && ix === T.x0 - T.dir))) return W.NONE;
      return W.FULL;
    }
    const a = this.open(ix, iz);
    const b = this.open(bx, bz);
    if (!a && !b) return W.NONE;
    if (a && b) {
      const ha = this.hall(ix, iz) && !this.corridor(ix, iz);
      const hb = this.hall(bx, bz) && !this.corridor(bx, bz);
      if (ha !== hb && hash3(ix * 3 + kind, iz, this.seed + 9) < 0.25) return W.HALF_A;
      return W.NONE;
    }
    return W.FULL;
  }

  // Paredes do túnel em concreto cru.
  buildEdge(G, kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    if (this.inTunnel(ix, iz) || this.inTunnel(bx, bz)) {
      const w = G.wall;
      G.wall = G.extra;
      super.buildEdge(G, kind, ix, iz);
      G.wall = w;
      return;
    }
    super.buildEdge(G, kind, ix, iz);
  }

  // Pilares grossos dentro dos salões.
  pillar(gx, gz) {
    if (mod(gx, 2) || mod(gz, 2)) return 0;
    for (const [a, b] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ])
      if (!this.hall(gx + a, gz + b) || this.inTunnel(gx + a, gz + b)) return 0;
    return 0.7;
  }

  genLight(cx, cz) {
    if (!this.open(cx, cz) || mod(cx + cz, 2)) return null;
    const tun = this.inTunnel(cx, cz);
    const h = this.hashCell(cx, cz, 3);
    let group = 0;
    if (tun) group = h < 0.35 ? 3 : 0;
    else if (h < 0.14) group = 3;
    else if (h < 0.26) group = 1;
    else if (h < 0.32) group = 2;
    return { x: cx * C + 1.5, z: cz * C + 1.5, y: this.H - 0.02, ax: mod(cz, 2) ? 1 : 0, len: 1.25, wid: 0.22, I: tun ? 4 : 7.5, group };
  }

  dirt(x, z) {
    return clamp((fbm(x * 0.13, z * 0.13, 3, this.seed + 11) + 0.05) / 0.35, 0, 1);
  }

  // Muretas, máquinas de venda, extintores, corrimões e canos no teto.
  genProps(ch, cx0, cz0) {
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (!this.open(x, z) || this.inTunnel(x, z) || Math.abs(x) + Math.abs(z) < 3) continue;
        const px = x * C + 1.5;
        const pz = z * C + 1.5;
        const h = this.hashCell(x, z, 41);
        const isHall = this.hall(x, z) && !this.corridor(x, z);
        // canos ao longo do teto (sempre, na direção do corredor)
        if (this.hashCell(x, z, 50) < 0.6) {
          const along = this.open(x + 1, z) || this.open(x - 1, z);
          ch.props.push({
            draw: (G) => {
              const y = this.H - 0.18;
              const o = 0.9;
              if (along) {
                G.prop.cylinder(px, y, pz - o, 0.04, C, [0.55, 0.58, 0.52], null, { axis: 'x', sides: 8 });
                G.prop.cylinder(px, y - 0.1, pz - o + 0.14, 0.025, C, [0.35, 0.4, 0.34], null, { axis: 'x', sides: 6 });
              } else {
                G.prop.cylinder(px - o, y, pz, 0.04, C, [0.55, 0.58, 0.52], null, { axis: 'z', sides: 8 });
                G.prop.cylinder(px - o + 0.14, y - 0.1, pz, 0.025, C, [0.35, 0.4, 0.34], null, { axis: 'z', sides: 6 });
              }
            },
          });
        }
        if (isHall && h < 0.22) {
          // mureta baixa de blocos (como na foto)
          const rot = this.hashCell(x, z, 42) < 0.5;
          const sx = rot ? 0.28 : 2.4;
          const sz = rot ? 2.4 : 0.28;
          ch.colliders.push([px - sx / 2, px + sx / 2, pz - sz / 2, pz + sz / 2]);
          ch.props.push({
            ao: [px - sx / 2, px + sx / 2, pz - sz / 2, pz + sz / 2, 0],
            draw: (G) => {
              G.prop.box(px, 0.6, pz, sx, 1.2, sz, [0.82, 0.84, 0.72], G.lm, {});
              G.prop.box(px, 1.22, pz, sx + 0.04, 0.05, sz + 0.04, [0.74, 0.76, 0.66], G.lm, { ao: 0 });
            },
          });
        } else if (h < 0.3) {
          // máquina de venda apagada (ou quase)
          const wallN = !this.open(x, z - 1);
          const wallW = !this.open(x - 1, z);
          if (!wallN && !wallW) continue;
          const vx = px + (wallW ? -1.05 : 0.6);
          const vz = pz + (wallN ? -1.05 : 0.6);
          const rot = wallW && !wallN ? Math.PI / 2 : 0;
          ch.colliders.push([vx - 0.45, vx + 0.45, vz - 0.45, vz + 0.45]);
          const lit = this.hashCell(x, z, 43) < 0.4;
          ch.props.push({
            draw: (G) => {
              G.prop.box(vx, 0.95, vz, 0.85, 1.9, 0.8, [0.08, 0.08, 0.09], G.lm, { rot });
              const fx = rot ? 0.41 : 0;
              const fz = rot ? 0 : 0.41;
              G.prop.box(vx + fx - 0.12 * (rot ? 0 : 1), 1.15, vz + fz + 0.12 * (rot ? 1 : 0), rot ? 0.02 : 0.5, 1.1, rot ? 0.5 : 0.02, lit ? [0.7, 0.75, 0.8] : [0.12, 0.14, 0.16], G.lm, { ao: 0 });
              G.prop.box(vx + fx + 0.26 * (rot ? 0 : 1), 1.25, vz + fz - 0.26 * (rot ? 1 : 0), rot ? 0.02 : 0.14, 0.3, rot ? 0.14 : 0.02, [0.5, 0.12, 0.1], G.lm, { ao: 0 });
            },
          });
        } else if (h < 0.36) {
          // extintor / caixa de alarme vermelha na parede
          const wallN = !this.open(x, z - 1);
          if (!wallN) continue;
          ch.props.push({
            draw: (G) => {
              G.prop.box(px + 0.8, 1.35, z * C + this.T / 2 + 0.06, 0.3, 0.45, 0.1, [0.45, 0.06, 0.06], G.lm, {});
              G.prop.box(px + 0.8, 1.35, z * C + this.T / 2 + 0.11, 0.22, 0.34, 0.01, [0.2, 0.03, 0.03], G.lm, { ao: 0 });
            },
          });
        } else if (h < 0.42) {
          // corrimão escuro preso na parede
          const wallN = !this.open(x, z - 1);
          if (!wallN) continue;
          const wz = z * C + this.T / 2 + 0.08;
          ch.props.push({
            draw: (G) => {
              G.prop.cylinder(px, 0.9, wz, 0.025, 2.6, [0.12, 0.2, 0.18], null, { axis: 'x', sides: 6 });
              for (const s of [-1, 0, 1]) G.prop.box(px + s * 1.1, 0.88, wz - 0.04, 0.03, 0.03, 0.08, [0.12, 0.2, 0.18], null, { ao: 0 });
            },
          });
        }
        if (this.hashCell(x, z, 21) > 0.985) ch.items.push({ type: 'water', key: `49:${x}:${z}:w`, x: px + 0.3, z: pz + 0.3 });
        else if (this.hashCell(x, z, 22) > 0.986) ch.items.push({ type: 'note', key: `49:${x}:${z}:n`, x: px - 0.3, z: pz + 0.2, rot: h * 30 });
        else if (this.hashCell(x, z, 23) > 0.992) ch.items.push({ type: 'battery', key: `49:${x}:${z}:b`, x: px, z: pz - 0.4 });
      }
  }

  // ------------------------------------------------------------ rota
  route() {
    const rnd = mulberry32(this.seed * 5 + 9);
    this.clearCell(0, 0);
    const a = rnd() * TAU;
    let ex = Math.round(Math.cos(a) * 26);
    const ez = Math.round((Math.sin(a) * 26) / 5) * 5; // numa linha de corredor
    ex = ex === 0 ? 1 : ex;
    const dir = ex >= 0 ? 1 : -1;
    // o túnel começa uma célula depois da entrada e segue para longe (12 células)
    this.tunnel = { x0: ex + dir, x1: ex + dir * 12, z: ez, dir };
    this.clearCell(ex, ez);
    this.carve(0, 0, ex, ez, rnd);
    this.entrance = { x: ex * C + 1.5 + dir * 1.5, z: ez * C + 1.5 };
    // a parede que brilha, no fim
    const endX = this.tunnel.x1 + (dir > 0 ? 1 : 0);
    this.setEdge(EV, endX, ez, W.EXIT);
    this.glowWall = { x: endX * C - dir * (this.T / 2 + 0.01), z: ez * C + 1.5 };
    this.exit = { x: this.glowWall.x - dir * 0.8, z: this.glowWall.z };
    this.spawn = { x: 1.5, z: 1.5, yaw: Math.atan2(-(this.entrance.x - 1.5), -(this.entrance.z - 1.5)) };
    this.makeGlow();
  }

  makeGlow() {
    const G = this.glowWall;
    const dir = this.tunnel.dir;
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main() {
          float r = length( ( vUv - 0.5 ) * vec2( 1.0, 1.1 ) );
          float w = 0.5 + 0.5 * sin( r * 30.0 - uTime * 2.0 );
          vec3 c = vec3( 1.6, 1.75, 1.5 ) * ( 1.2 - r * 0.6 ) + vec3( 0.2, 0.25, 0.18 ) * w;
          gl_FragColor = vec4( c, 1.0 );
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(C - this.T, this.H), this.glowMat);
    m.position.set(G.x, this.H / 2, G.z);
    m.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.dynamic.add(m);
    this.glowMesh = m;
    this.glowLight = new THREE.PointLight(0xe8ffe0, 10, 14, 1.4);
    this.glowLight.position.set(G.x - dir * 1.2, 1.6, G.z);
    this.dynamic.add(this.glowLight);
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    this.time = (this.time || 0) + dt;
    this.figure.update(dt, player);
    this.glowMat.uniforms.uTime.value = this.time;
    this.glowLight.intensity = 9 + Math.sin(this.time * 2.2) * 2;
    const p = player.pos;
    const ci = Math.floor(p.x / C);
    const cj = Math.floor(p.z / C);
    if (this.inTunnel(ci, cj) && !g.objectiveDone('tunel')) {
      g.completeObjective('tunel', 'Um túnel de concreto cru, frio e úmido. Lá no fundo, uma luz.');
    }
    const G = this.glowWall;
    if (!this.leaving && Math.hypot(p.x - G.x, p.z - G.z) < 0.75) {
      this.leaving = true;
      g.completeObjective('parede', 'Você encosta na parede que brilha. Ela não é sólida.');
      g.reachExit('noclip', 0.3);
    }
    if (this.time > 5 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Um subsolo. Silêncio demais. Você tem a sensação de que não está sozinho.', 6);
    }
    this.sanityExtra = this.chased ? 0.6 : 0;
  }

  interactable() {
    return null;
  }

  radarEntities() {
    const f = this.figure;
    return f && f.active ? [{ x: f.x, z: f.z }] : [];
  }

  navTarget() {
    return this.game.objectiveDone('tunel') ? this.exit : this.entrance;
  }

  onCollapse() {
    this.figure.hide(30);
  }

  groundY() {
    return 0;
  }

  exitEmitter() {
    return { x: this.glowWall.x, y: 1.6, z: this.glowWall.z, sound: 'hum', gain: 0.25 };
  }

  dispose() {
    this.figure.dispose();
    this.glowMesh.geometry.dispose();
    this.glowMat.dispose();
    this.panelMat.dispose();
    super.dispose();
  }
}
