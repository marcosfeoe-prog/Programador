// Estádio procedural: gramado, arquibancadas em 1 a 3 anéis (curvas nos
// cantos nos estádios grandes), cobertura, torres de iluminação, placas de
// LED animadas, gols com rede que deforma, bandeirinhas tremulando, bancos de
// reservas, telão e torcida instanciada que pula nos gols.
import * as THREE from 'three';
import { PITCH as P } from '../engine/constants.js';
import { pitchTextures, seatTexture, adTexture, goalAdTexture, netTexture, concreteTexture, GROUND_W, GROUND_H } from './textures.js';
import { RNG, luminance } from '../util.js';
import { crestImage } from '../ui/crest.js';

const CIVIL = ['#2b2f3a', '#e8e4dc', '#3a5a8c', '#7b2d2d', '#1e1e1e', '#556b2f', '#8c7a5b', '#b8b8b8', '#2f4f4f', '#d9c39a'];

function quad(a, b, c, d, uv = [0, 0, 1, 0, 1, 1, 0, 1]) {
  // a-b-c-d no sentido anti-horário visto pela frente
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]], 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ rede deformável

class GoalNet {
  constructor(s, tex) {
    this.s = s;
    this.planes = [];
    const zs = P.goalW / 2 + P.postR * 2;
    const x0 = s * P.HL;
    const xT = s * (P.HL + P.netTopDepth);
    const xB = s * (P.HL + P.netDepth);
    const h = P.goalH;
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, depthWrite: true });
    this.mat = mat;
    const dx = Math.abs(xB - xT);
    const nb = Math.hypot(h, dx);
    // cantos: p00, p10, p11, p01 (bilinear) + normal para fora
    this.add([xT, h, -zs], [xT, h, zs], [xB, 0, zs], [xB, 0, -zs], [(s * h) / nb, dx / nb, 0], 18, 8, mat);
    this.add([x0, h, -zs], [x0, h, zs], [xT, h, zs], [xT, h, -zs], [0, 1, 0], 18, 3, mat);
    for (const zz of [-1, 1]) {
      this.add([x0, 0, zz * zs], [xB, 0, zz * zs], [xT, h, zz * zs], [x0, h, zz * zs], [0, 0, zz], 6, 7, mat);
    }
  }

  add(p00, p10, p11, p01, n, nu, nv, mat) {
    const verts = [];
    const uvs = [];
    const idx = [];
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const v = j / nv;
        const x = (1 - v) * ((1 - u) * p00[0] + u * p10[0]) + v * ((1 - u) * p01[0] + u * p11[0]);
        const y = (1 - v) * ((1 - u) * p00[1] + u * p10[1]) + v * ((1 - u) * p01[1] + u * p11[1]);
        const z = (1 - v) * ((1 - u) * p00[2] + u * p10[2]) + v * ((1 - u) * p01[2] + u * p11[2]);
        verts.push(x, y, z);
        const lu = Math.hypot(p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]);
        const lv = Math.hypot(p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]);
        uvs.push((u * lu) / 0.12, (v * lv) / 0.12);
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = j * (nu + 1) + i;
        idx.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    const n0 = verts.length / 3;
    // bordas presas às traves (não se mexem)
    const pinned = new Uint8Array(n0);
    for (let j = 0; j <= nv; j++)
      for (let i = 0; i <= nu; i++) if (i === 0 || i === nu || j === 0 || j === nv) pinned[j * (nu + 1) + i] = 1;
    this.planes.push({ mesh: m, base: Float32Array.from(verts), n, disp: new Float32Array(n0), vel: new Float32Array(n0), pinned });
  }

  impulse(x, y, z, speed) {
    for (const pl of this.planes) {
      const b = pl.base;
      for (let i = 0; i < pl.disp.length; i++) {
        if (pl.pinned[i]) continue;
        const dx = b[i * 3] - x;
        const dy = b[i * 3 + 1] - y;
        const dz = b[i * 3 + 2] - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 2.5) continue;
        pl.vel[i] += Math.exp(-d2 / 0.35) * speed * 0.55;
      }
      pl.active = true;
    }
  }

  update(dt) {
    for (const pl of this.planes) {
      if (!pl.active) continue;
      const pos = pl.mesh.geometry.attributes.position.array;
      let energy = 0;
      for (let i = 0; i < pl.disp.length; i++) {
        if (pl.pinned[i]) continue;
        const a = -70 * pl.disp[i] - 7 * pl.vel[i];
        pl.vel[i] += a * dt;
        pl.disp[i] = Math.max(-0.6, Math.min(0.9, pl.disp[i] + pl.vel[i] * dt));
        energy += Math.abs(pl.disp[i]) + Math.abs(pl.vel[i]);
        pos[i * 3] = pl.base[i * 3] + pl.n[0] * pl.disp[i];
        pos[i * 3 + 1] = pl.base[i * 3 + 1] + pl.n[1] * pl.disp[i];
        pos[i * 3 + 2] = pl.base[i * 3 + 2] + pl.n[2] * pl.disp[i];
      }
      pl.mesh.geometry.attributes.position.needsUpdate = true;
      if (energy < 0.001) pl.active = false;
    }
  }
}

// ------------------------------------------------------------ torcida

const crowdVS = `
attribute vec3 iPos;
attribute vec3 iCol;
attribute float iPhase;
attribute float iTeam;
attribute float iRot;
uniform float uTime;
uniform float uExcite;
uniform float uCheer0;
uniform float uCheer1;
varying vec2 vUv;
varying vec3 vCol;
varying float vSeed;
varying float vArms;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vCol = iCol;
  vSeed = iPhase;
  float cheer = iTeam < 0.5 ? uCheer0 : uCheer1;
  float e = clamp(uExcite * 0.35 + cheer, 0.0, 1.6);
  float jump = max(0.0, sin(uTime * (6.5 + iPhase * 3.0) + iPhase * 40.0)) * 0.24 * e;
  vArms = step(0.55, cheer) * step(0.4, fract(iPhase * 13.7));
  float sway = sin(uTime * 1.3 + iPhase * 20.0) * 0.03;
  float c = cos(iRot);
  float s = sin(iRot);
  vec3 p = position;
  vec3 wp = iPos + vec3(p.x * c + sway, p.y + jump, -p.x * s);
  vec4 mvPosition = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const crowdFS = `
uniform vec3 uLight;
varying vec2 vUv;
varying vec3 vCol;
varying float vSeed;
varying float vArms;
#include <fog_pars_fragment>
void main() {
  vec2 u = vUv;
  vec2 hc = (u - vec2(0.5, 0.72)) * vec2(1.0, 0.75);
  float head = step(length(hc), 0.13);
  float torso = step(u.y, 0.62) * step(abs(u.x - 0.5), 0.3 - max(0.0, u.y - 0.5) * 0.6);
  float arms = vArms * step(0.5, u.y) * step(u.y, 0.98) * step(abs(abs(u.x - 0.5) - 0.33), 0.06);
  if (head + torso + arms < 0.5) discard;
  float sk = fract(vSeed * 91.7);
  vec3 skin = mix(vec3(0.95, 0.78, 0.62), vec3(0.36, 0.23, 0.15), sk);
  vec3 col = head > 0.5 ? skin : vCol;
  col *= 0.75 + 0.25 * fract(vSeed * 7.3);
  gl_FragColor = vec4(col * uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ------------------------------------------------------------ estádio

export class Stadium {
  constructor(scene, { club, away, env, quality, seed = 1 }) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.club = club;
    this.away = away;
    this.env = env;
    this.q = quality;
    this.rng = new RNG(seed + 17);
    this.disposables = [];
    this.night = env.time === 'noite';
    this.cap = club.capacity;
    this.tiers = this.cap > 45000 ? 3 : this.cap > 20000 ? 2 : 1;
    this.bowl = this.cap >= 30000;
    this.roof = this.cap >= 25000;
    this.lightSpots = [];
    this.crowdSlots = [];
    this.buildGround();
    this.buildStands();
    this.buildGoals();
    this.buildBoards();
    this.buildFlags();
    this.buildDugouts();
    this.buildLights();
    this.buildScreen();
    this.buildSurroundings();
    this.buildCrowd();
  }

  track(o) {
    this.disposables.push(o);
    return o;
  }

  mesh(geo, mat, shadow = false, recv = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = recv;
    this.group.add(m);
    this.track(geo);
    return m;
  }

  buildGround() {
    const env = this.env;
    const wear = 0.25 + (1 - (this.club.rating - 60) / 30) * 0.45;
    const res = this.q.pitchRes;
    const { map, rough } = pitchTextures({ env, seed: this.club.founded, wear, res, pattern: this.club.founded % 3 === 0 ? 'xadrez' : 'listras' });
    this.track(map);
    this.track(rough);
    const wet = env.rain > 0;
    const pitchMat = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0, envMapIntensity: wet ? 1.1 : 0.35 });
    this.pitchMat = pitchMat;
    // detalhe de grama de perto (ruído em coordenadas do mundo)
    pitchMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nfloat gh(vec2 p){return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453);}')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec2 gp = vWPos.xz * 22.0;
          float gn = gh(floor(gp)) * 0.6 + gh(floor(gp * 0.37 + 11.0)) * 0.4;
          diffuseColor.rgb *= 0.93 + gn * 0.14;`
        );
    };
    const pitch = this.mesh(new THREE.PlaneGeometry(GROUND_W, GROUND_H).rotateX(-Math.PI / 2), pitchMat, false, true);
    pitch.renderOrder = -1;
    // entorno do gramado (pista/concreto) até a arquibancada
    const conc = concreteTexture(this.club.founded);
    conc.repeat.set(30, 30);
    this.track(conc);
    const apron = new THREE.MeshStandardMaterial({ color: this.env.snow ? '#d9dee2' : '#4a5a3a', map: conc, roughness: 0.95 });
    const outer = new THREE.Shape();
    outer.moveTo(-160, -130);
    outer.lineTo(160, -130);
    outer.lineTo(160, 130);
    outer.lineTo(-160, 130);
    const hole = new THREE.Path();
    hole.moveTo(-GROUND_W / 2, -GROUND_H / 2);
    hole.lineTo(-GROUND_W / 2, GROUND_H / 2);
    hole.lineTo(GROUND_W / 2, GROUND_H / 2);
    hole.lineTo(GROUND_W / 2, -GROUND_H / 2);
    outer.holes.push(hole);
    const ag = new THREE.ShapeGeometry(outer).rotateX(-Math.PI / 2);
    // ShapeGeometry fica em XY; após girar, y vira -z — ajusta para o plano do chão
    const apronMesh = this.mesh(ag, apron, false, true);
    apronMesh.position.y = -0.005;
  }

  // Uma seção de arquibancada reta. dir: normal horizontal apontando para o campo.
  rake({ cx, cz, len, ax, az, nx, nz, front, depth, h0, h1, tex, rows, wall = true }) {
    // ax,az: eixo do comprimento; nx,nz: normal para dentro do campo
    const fx = cx - nx * front;
    const fz = cz - nz * front;
    const bx = cx - nx * (front + depth);
    const bz = cz - nz * (front + depth);
    const hl = len / 2;
    const A = [fx - ax * hl, h0, fz - az * hl];
    const B = [fx + ax * hl, h0, fz + az * hl];
    const C = [bx + ax * hl, h1, bz + az * hl];
    const D = [bx - ax * hl, h1, bz - az * hl];
    const slope = Math.hypot(depth, h1 - h0);
    const nrows = slope / 0.85;
    const reps = tex.userData.single ? 1 : len / 40;
    const geo = quad(A, B, C, D, [0, 0, reps, 0, reps, nrows / rows, 0, nrows / rows]);
    // vira para o campo
    const n = new THREE.Vector3().fromArray(B).sub(new THREE.Vector3().fromArray(A)).cross(new THREE.Vector3().fromArray(D).sub(new THREE.Vector3().fromArray(A)));
    if (n.x * nx + n.z * nz < 0) {
      const pos = geo.attributes.position.array;
      for (let i = 0; i < pos.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const t = pos[i + 3 + k];
          pos[i + 3 + k] = pos[i + 6 + k];
          pos[i + 6 + k] = t;
        }
      }
      const uv = geo.attributes.uv.array;
      for (let i = 0; i < uv.length; i += 6) {
        for (let k = 0; k < 2; k++) {
          const t = uv[i + 2 + k];
          uv[i + 2 + k] = uv[i + 4 + k];
          uv[i + 4 + k] = t;
        }
      }
      geo.computeVertexNormals();
    }
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    this.track(mat);
    this.mesh(geo, mat, true, true);
    // lugares para a torcida
    this.crowdSlots.push({ A, B, C, D, len, slope, rot: Math.atan2(nx, nz) });
    // muro frontal
    const wallM = new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.9, side: THREE.DoubleSide });
    this.track(wallM);
    if (wall && h0 > 0.2) this.mesh(quad([A[0], 0, A[2]], [B[0], 0, B[2]], B, A), wallM, true, true);
    return { A, B, C, D };
  }

  buildStands() {
    const c = this.club;
    const rng = this.rng;
    const dark = luminance(c.home.p) < 0.25;
    const seatP = dark ? c.home.s : c.home.p;
    const seatS = dark ? c.home.p : luminance(c.home.s) > 0.85 && luminance(c.home.p) > 0.7 ? '#222222' : c.home.s;
    const texMain = seatTexture(seatP, seatS, c.abbr, 40, 220);
    texMain.userData.single = true;
    const texPlain = seatTexture(seatP, seatP, null, 40, 60);
    texPlain.wrapS = THREE.RepeatWrapping;
    texPlain.wrapT = THREE.RepeatWrapping;
    texMain.wrapT = THREE.RepeatWrapping;
    this.track(texMain);
    this.track(texPlain);
    const sideFront = P.boardZ + 4; // 42,5
    const endFront = P.boardX + 5.5; // 62,5
    const sideLen = endFront * 2;
    const endLen = sideFront * 2;
    const tiers = this.tiers;
    const T = [];
    // perfis: [recuo do início, profundidade, altura inicial, altura final]
    T.push([0, 18, 1.4, 12]);
    if (tiers >= 2) T.push([12, 17, 15.5, 27]);
    if (tiers >= 3) T.push([25, 15, 30.5, 40]);
    this.standTop = T[T.length - 1][3];
    this.standBack = T[T.length - 1][0] + T[T.length - 1][1];
    const sides = [
      { cx: 0, cz: -1, len: sideLen, ax: 1, az: 0, nx: 0, nz: 1, front: sideFront, main: true },
      { cx: 0, cz: 1, len: sideLen, ax: 1, az: 0, nx: 0, nz: -1, front: sideFront },
      { cx: -1, cz: 0, len: endLen, ax: 0, az: 1, nx: 1, nz: 0, front: endFront },
      { cx: 1, cz: 0, len: endLen, ax: 0, az: 1, nx: -1, nz: 0, front: endFront },
    ];
    this.sideDefs = sides;
    for (const sd of sides) {
      // estádios pequenos: atrás do gol só um anel baixo
      const tierList = !sd.main && sd.nx !== 0 && tiers === 1 ? [[0, 10, 1.4, 7]] : T;
      for (let i = 0; i < tierList.length; i++) {
        const [off, depth, h0, h1] = tierList[i];
        this.rake({ cx: 0, cz: 0, len: sd.len, ax: sd.ax, az: sd.az, nx: sd.nx, nz: sd.nz, front: sd.front + off, depth, h0, h1, tex: sd.main && i === 0 ? texMain : texPlain, rows: 40, wall: i === 0 });
        if (i > 0) {
          // parte de baixo do anel superior (concreto)
          {
            const fx0 = -sd.nx * (sd.front + off);
            const fz0 = -sd.nz * (sd.front + off);
            const bx0 = -sd.nx * (sd.front + off + depth);
            const bz0 = -sd.nz * (sd.front + off + depth);
            const hl0 = sd.len / 2;
            const um = new THREE.MeshStandardMaterial({ color: '#2e3036', roughness: 0.95, side: THREE.DoubleSide });
            this.track(um);
            this.mesh(quad([fx0 - sd.ax * hl0, h0 - 2.4, fz0 - sd.az * hl0], [fx0 + sd.ax * hl0, h0 - 2.4, fz0 + sd.az * hl0], [bx0 + sd.ax * hl0, h1 - 2.4, bz0 + sd.az * hl0], [bx0 - sd.ax * hl0, h1 - 2.4, bz0 - sd.az * hl0]), um, false, false);
          }
          // fachada do anel superior com faixa de LED
          const fx = -sd.nx * (sd.front + off);
          const fz = -sd.nz * (sd.front + off);
          const hl = sd.len / 2;
          const led = adTexture(this.club.short, this.club.home);
          led.repeat.x = sd.len / 26;
          this.track(led);
          const lm = new THREE.MeshStandardMaterial({ map: led, emissive: '#ffffff', emissiveMap: led, emissiveIntensity: this.night ? 0.9 : 0.35, roughness: 0.6 });
          this.track(lm);
          this.ledMats = this.ledMats || [];
          this.ledMats.push(lm);
          const g = quad([fx - sd.ax * hl, h0 - 2.4, fz - sd.az * hl], [fx + sd.ax * hl, h0 - 2.4, fz + sd.az * hl], [fx + sd.ax * hl, h0, fz + sd.az * hl], [fx - sd.ax * hl, h0, fz - sd.az * hl]);
          const mm = this.mesh(g, lm, false, false);
          mm.material.side = THREE.DoubleSide;
        }
      }
      // parede de fundo
      const top = !sd.main && sd.nx !== 0 && tiers === 1 ? 7 : this.standTop;
      const back = !sd.main && sd.nx !== 0 && tiers === 1 ? 10 : this.standBack;
      const bx = -sd.nx * (sd.front + back);
      const bz = -sd.nz * (sd.front + back);
      const hl = sd.len / 2;
      const wm = new THREE.MeshStandardMaterial({ color: '#3c3f46', roughness: 0.95, side: THREE.DoubleSide });
      this.track(wm);
      this.mesh(quad([bx - sd.ax * hl, 0, bz - sd.az * hl], [bx + sd.ax * hl, 0, bz + sd.az * hl], [bx + sd.ax * hl, top + 2, bz + sd.az * hl], [bx - sd.ax * hl, top + 2, bz - sd.az * hl]), wm, true, false);
      // cobertura
      if (this.roof && (sd.main || this.bowl || sd.nz !== 0)) {
        const rm = new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
        this.track(rm);
        const rf = sd.front + 4;
        const rb = sd.front + back + 1;
        const ry0 = top + 6;
        const ry1 = top + 4;
        const g = quad(
          [-sd.nx * rf - sd.ax * hl, ry0, -sd.nz * rf - sd.az * hl],
          [-sd.nx * rf + sd.ax * hl, ry0, -sd.nz * rf + sd.az * hl],
          [-sd.nx * rb + sd.ax * hl, ry1, -sd.nz * rb + sd.az * hl],
          [-sd.nx * rb - sd.ax * hl, ry1, -sd.nz * rb - sd.az * hl]
        );
        this.mesh(g, rm, true, true);
        // refletores na borda da cobertura
        const lg = new THREE.BoxGeometry(sd.ax ? sd.len * 0.9 : 0.6, 0.35, sd.az ? sd.len * 0.9 : 0.6);
        const lmat = new THREE.MeshStandardMaterial({ color: '#dfe6ff', emissive: '#fff8e6', emissiveIntensity: this.night ? 3 : 0.2 });
        this.track(lmat);
        const lm = this.mesh(lg, lmat);
        lm.position.set(-sd.nx * (rf + 0.4), ry0 - 0.4, -sd.nz * (rf + 0.4));
        this.lightSpots.push({ x: -sd.nx * rf, y: ry0, z: -sd.nz * rf, strip: true, ax: sd.ax, az: sd.az, len: sd.len });
        // pilares de sustentação
        const pm = new THREE.MeshStandardMaterial({ color: '#8d9198', roughness: 0.7 });
        this.track(pm);
        const pg = new THREE.CylinderGeometry(0.35, 0.45, ry1, 8);
        this.track(pg);
        for (let k = -2; k <= 2; k++) {
          const pp = new THREE.Mesh(pg, pm);
          pp.position.set(-sd.nx * (rb - 0.5) + sd.ax * k * (hl / 2.2), ry1 / 2, -sd.nz * (rb - 0.5) + sd.az * k * (hl / 2.2));
          pp.castShadow = true;
          this.group.add(pp);
        }
      }
    }
    // cantos arredondados (estádios grandes)
    if (this.bowl) {
      for (const sxs of [-1, 1]) {
        for (const szs of [-1, 1]) {
          for (let i = 0; i < T.length; i++) this.cornerRake(sxs, szs, T[i], texPlain, endFront, sideFront);
        }
      }
    }
  }

  cornerRake(sxs, szs, [off, depth, h0, h1], tex, endFront, sideFront) {
    const cx = sxs * (endFront + off);
    const cz = szs * (sideFront + off);
    const n = 10;
    const pos = [];
    const uv = [];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * (Math.PI / 2);
      const a1 = ((i + 1) / n) * (Math.PI / 2);
      const p0 = [cx + sxs * Math.cos(a0) * depth, h1, cz + szs * Math.sin(a0) * depth];
      const p1 = [cx + sxs * Math.cos(a1) * depth, h1, cz + szs * Math.sin(a1) * depth];
      const reps = (depth * Math.PI) / 2 / 40;
      const nrows = Math.hypot(depth, h1 - h0) / 0.85 / 40;
      pos.push(cx, h0, cz, ...p0, ...p1);
      uv.push(((i + 0.5) / n) * reps, 0, (i / n) * reps, nrows, ((i + 1) / n) * reps, nrows);
      this.crowdSlots.push({ corner: true, c: [cx, h0, cz], p0, p1, rot: Math.atan2(-sxs * Math.cos((a0 + a1) / 2), -szs * Math.sin((a0 + a1) / 2)) });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
    this.track(mat);
    this.mesh(g, mat, true, true);
  }

  buildGoals() {
    const white = new THREE.MeshStandardMaterial({ color: '#f6f6f2', roughness: 0.35, metalness: 0.1 });
    const grey = new THREE.MeshStandardMaterial({ color: '#c8c8c8', roughness: 0.5 });
    this.track(white);
    this.track(grey);
    const pr = P.postR;
    const postG = new THREE.CylinderGeometry(pr, pr, P.goalH + pr, 12).translate(0, (P.goalH + pr) / 2, 0);
    const barG = new THREE.CylinderGeometry(pr, pr, P.goalW + pr * 4, 12).rotateX(Math.PI / 2);
    const thin = (len) => new THREE.CylinderGeometry(0.025, 0.025, len, 6);
    this.nets = [];
    const nt = netTexture();
    this.track(nt);
    for (const s of [-1, 1]) {
      const x = s * P.HL;
      const zp = P.goalW / 2 + pr;
      for (const zz of [-1, 1]) {
        const m = this.mesh(postG, white, true, false);
        m.position.set(x, 0, zz * zp);
      }
      const bar = this.mesh(barG, white, true, false);
      bar.position.set(x, P.goalH + pr, 0);
      // armação de trás
      const zs = P.goalW / 2 + pr * 2;
      const xT = s * (P.HL + P.netTopDepth);
      const xB = s * (P.HL + P.netDepth);
      const seg = (a, b) => {
        const va = new THREE.Vector3(...a);
        const vb = new THREE.Vector3(...b);
        const len = va.distanceTo(vb);
        const m = this.mesh(thin(len), grey, true, false);
        m.position.copy(va).add(vb).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      };
      for (const zz of [-1, 1]) {
        seg([x, P.goalH, zz * zs], [xT, P.goalH, zz * zs]);
        seg([xT, P.goalH, zz * zs], [xB, 0.02, zz * zs]);
        seg([x, 0.02, zz * zs], [xB, 0.02, zz * zs]);
      }
      seg([xB, 0.02, -zs], [xB, 0.02, zs]);
      seg([xT, P.goalH, -zs], [xT, P.goalH, zs]);
      const net = new GoalNet(s, nt);
      for (const pl of net.planes) {
        this.group.add(pl.mesh);
        this.track(pl.mesh.geometry);
      }
      this.track(net.mat);
      this.nets.push(net);
    }
  }

  buildBoards() {
    const tex = adTexture(this.club.short, this.club.home);
    this.track(tex);
    this.boardTex = [];
    const mk = (len, x, z, rotY) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.x = len / 22;
      this.track(t);
      const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: this.night ? 1.1 : 0.45, roughness: 0.5 });
      this.track(m);
      this.boardMats = this.boardMats || [];
      this.boardMats.push(m);
      const g = new THREE.BoxGeometry(len, P.boardH, 0.18);
      const back = new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.8 });
      this.track(back);
      const mesh = this.mesh(g, [back, back, back, back, m, back], true, true);
      mesh.position.set(x, P.boardH / 2, z);
      mesh.rotation.y = rotY;
      this.boardTex.push({ t, speed: 0.02 + this.rng.next() * 0.02 });
    };
    mk(112, 0, -P.boardZ, 0);
    mk(112, 0, P.boardZ, Math.PI);
    mk(58, -P.boardX, 0, Math.PI / 2);
    mk(58, P.boardX, 0, -Math.PI / 2);
    this.goalTex = goalAdTexture('GOL!', this.club.home.p, this.club.home.s);
    this.track(this.goalTex);
    this.goalFlash = 0;
  }

  buildFlags() {
    this.flags = [];
    const pole = new THREE.CylinderGeometry(0.02, 0.02, 1.55, 6).translate(0, 0.775, 0);
    const pm = new THREE.MeshStandardMaterial({ color: '#eeeeee', roughness: 0.5 });
    const fm = new THREE.MeshStandardMaterial({ color: this.club.home.s === '#ffffff' ? this.club.home.p : '#ffdd00', side: THREE.DoubleSide, roughness: 0.8 });
    this.track(pm);
    this.track(fm);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = this.mesh(pole, pm, true, false);
        p.position.set(sx * P.HL, 0, sz * P.HW);
        const g = new THREE.PlaneGeometry(0.45, 0.32, 6, 3).translate(0.225, 1.38, 0);
        const f = this.mesh(g, fm, true, false);
        f.position.set(sx * P.HL, 0, sz * P.HW);
        this.flags.push({ mesh: f, base: Float32Array.from(g.attributes.position.array), ph: Math.random() * 6 });
      }
    }
  }

  buildDugouts() {
    const shell = new THREE.MeshStandardMaterial({ color: '#bcd4e6', transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide });
    const seat = new THREE.MeshStandardMaterial({ color: this.club.home.p, roughness: 0.6 });
    this.track(shell);
    this.track(seat);
    for (const sx of [-1, 1]) {
      const g = new THREE.CylinderGeometry(1.25, 1.25, 7, 12, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2);
      const m = this.mesh(g, shell, false, false);
      m.position.set(sx * 11, 0.1, P.boardZ - 1.4);
      m.rotation.y = Math.PI / 2;
      m.rotation.set(0, 0, 0);
      m.position.y = 0;
      const b = this.mesh(new THREE.BoxGeometry(6.5, 0.45, 0.6), seat, true, true);
      b.position.set(sx * 11, 0.25, P.boardZ - 1.1);
    }
  }

  buildLights() {
    // torres nos cantos quando não há cobertura com refletores
    if (!this.roof || !this.bowl) {
      const tm = new THREE.MeshStandardMaterial({ color: '#5a5f66', roughness: 0.6, metalness: 0.4 });
      const lm = new THREE.MeshStandardMaterial({ color: '#f4f6ff', emissive: '#fffbe8', emissiveIntensity: this.night ? 4 : 0.25 });
      this.track(tm);
      this.track(lm);
      const H = 42;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = sx * (P.HL + 22);
          const z = sz * (P.HW + 26);
          const t = this.mesh(new THREE.CylinderGeometry(0.5, 1.1, H, 8).translate(0, H / 2, 0), tm, true, false);
          t.position.set(x, 0, z);
          const head = this.mesh(new THREE.BoxGeometry(7, 4, 0.6), lm, true, false);
          head.position.set(x, H + 1.5, z);
          head.lookAt(0, 0, 0);
          this.lightSpots.push({ x, y: H + 1.5, z });
        }
      }
    }
    // brilho dos refletores à noite
    this.glows = [];
    if (this.night) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,235,1)');
      gr.addColorStop(0.25, 'rgba(255,245,220,0.5)');
      gr.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      this.track(tex);
      const sm = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
      this.track(sm);
      for (const L of this.lightSpots) {
        if (L.strip) {
          for (let k = -3; k <= 3; k++) {
            const s = new THREE.Sprite(sm);
            s.position.set(L.x + L.ax * k * (L.len / 7.5), L.y - 0.4, L.z + L.az * k * (L.len / 7.5));
            s.scale.setScalar(9);
            this.group.add(s);
          }
        } else {
          const s = new THREE.Sprite(sm);
          s.position.set(L.x, L.y, L.z);
          s.scale.setScalar(22);
          this.group.add(s);
        }
      }
    }
  }

  buildScreen() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 200;
    this.screenCanvas = c;
    this.screenTex = new THREE.CanvasTexture(c);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.track(this.screenTex);
    const m = new THREE.MeshStandardMaterial({ map: this.screenTex, emissive: '#ffffff', emissiveMap: this.screenTex, emissiveIntensity: 1.1, roughness: 0.4 });
    this.track(m);
    const frame = new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.6 });
    this.track(frame);
    const g = new THREE.BoxGeometry(0.6, 6.4, 16.4);
    const mesh = this.mesh(g, [m, frame, frame, frame, frame, frame], true, false);
    const x = -(P.boardX + 5.5 + this.standBack - 1);
    mesh.position.set(x, (this.tiers === 1 ? 7 : this.standTop) + 5.5, 0);
    this.screenMesh = mesh;
  }

  drawScreen(home, away, hs, as, clock) {
    const c = this.screenCanvas;
    const g = c.getContext('2d');
    g.fillStyle = '#05070c';
    g.fillRect(0, 0, 512, 200);
    g.fillStyle = home.home.p;
    g.fillRect(0, 0, 256, 10);
    g.fillStyle = away.away ? away.home.p : '#888';
    g.fillRect(256, 0, 256, 10);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 54px Arial Black, Arial, sans-serif';
    g.fillText(home.abbr, 110, 78);
    g.fillText(away.abbr, 402, 78);
    g.font = 'bold 78px Arial Black, Arial, sans-serif';
    g.fillStyle = '#ffd400';
    g.fillText(`${hs}-${as}`, 256, 82);
    g.font = 'bold 40px Arial, sans-serif';
    g.fillStyle = '#9fe0ff';
    g.fillText(clock, 256, 160);
    this.screenTex.needsUpdate = true;
  }

  buildSurroundings() {
    // prédios e morros ao redor (aparecem pelos cantos e acima da cobertura)
    const rng = this.rng;
    const n = this.q.buildings;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.track(geo);
    const win = document.createElement('canvas');
    win.width = 64;
    win.height = 128;
    const wg = win.getContext('2d');
    wg.fillStyle = '#20232a';
    wg.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 128; y += 8) {
      for (let x = 4; x < 64; x += 8) {
        const on = rng.chance(this.night ? 0.45 : 0.15);
        wg.fillStyle = on ? (this.night ? '#ffd88a' : '#7d8794') : '#14161b';
        wg.fillRect(x, y, 5, 5);
      }
    }
    const wt = new THREE.CanvasTexture(win);
    wt.colorSpace = THREE.SRGBColorSpace;
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    this.track(wt);
    const mat = new THREE.MeshStandardMaterial({ map: wt, emissive: '#ffffff', emissiveMap: wt, emissiveIntensity: this.night ? 0.8 : 0.0, roughness: 0.9 });
    this.track(mat);
    const inst = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(190, 420);
      const h = rng.float(12, 70) * (this.club.climate === 'montanha' ? 0.5 : 1);
      const w = rng.float(14, 34);
      m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.float(0, 3)), new THREE.Vector3(w, h, rng.float(14, 30)));
      inst.setMatrixAt(i, m4);
    }
    this.group.add(inst);
    // montanhas no horizonte
    if (this.club.climate === 'montanha' || this.club.altitude > 900) {
      const mm = new THREE.MeshStandardMaterial({ color: this.env.snow ? '#dfe5ea' : '#4c5a4a', roughness: 1, flatShading: true });
      this.track(mm);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng.float(0, 0.4);
        const h = rng.float(120, 260);
        const g = new THREE.ConeGeometry(rng.float(160, 260), h, 7);
        const m = this.mesh(g, mm, false, false);
        m.position.set(Math.cos(a) * 700, h / 2 - 20, Math.sin(a) * 700);
      }
    }
  }

  buildCrowd() {
    const rng = this.rng;
    const att = Math.min(1, 0.45 + (this.club.rating - 58) / 40 + rng.float(-0.08, 0.1));
    this.attendance = att;
    const maxN = this.q.crowd;
    // estima o total de lugares para decidir a amostragem
    let total = 0;
    for (const s of this.crowdSlots) {
      if (s.corner) total += 60;
      else total += (s.len / 0.55) * (s.slope / 0.85);
    }
    const p = Math.min(1, (maxN / Math.max(1, total)) * 1.0) * att;
    const pos = [];
    const col = [];
    const ph = [];
    const team = [];
    const rot = [];
    const home = this.club.home;
    const away = this.away.home;
    const cold = this.env.temp < 10;
    const civ = (r) => (cold ? ['#1d1f26', '#333844', '#4b3b2b', '#22303f'][Math.floor(r * 4)] : CIVIL[Math.floor(r * CIVIL.length)]);
    const tmp = new THREE.Color();
    const push = (x, y, z, r, awaySec) => {
      if (pos.length / 3 >= maxN) return;
      pos.push(x, y, z);
      const k = rng.next();
      const kit = awaySec ? away : home;
      const c = k < 0.58 ? kit.p : k < 0.78 ? kit.s : civ(rng.next());
      tmp.set(c);
      col.push(tmp.r, tmp.g, tmp.b);
      ph.push(rng.next());
      team.push(awaySec ? 1 : 0);
      rot.push(r);
    };
    for (const s of this.crowdSlots) {
      if (s.corner) {
        for (let i = 0; i < 70; i++) {
          if (!rng.chance(p)) continue;
          const a = rng.next();
          const b = rng.next();
          const u = Math.sqrt(a);
          const x = s.c[0] + (s.p0[0] - s.c[0]) * u * (1 - b) + (s.p1[0] - s.c[0]) * u * b;
          const y = s.c[1] + (s.p0[1] - s.c[1]) * u;
          const z = s.c[2] + (s.p0[2] - s.c[2]) * u * (1 - b) + (s.p1[2] - s.c[2]) * u * b;
          push(x, y + 0.05, z, s.rot, false);
        }
        continue;
      }
      const rows = Math.floor(s.slope / 0.85);
      const seats = Math.floor(s.len / 0.55);
      for (let r = 0; r < rows; r++) {
        const v = (r + 0.5) / rows;
        for (let k = 0; k < seats; k++) {
          if (!rng.chance(p)) continue;
          const u = (k + 0.5 + rng.float(-0.2, 0.2)) / seats;
          const x = s.A[0] + (s.B[0] - s.A[0]) * u + (s.D[0] - s.A[0]) * v;
          const y = s.A[1] + (s.D[1] - s.A[1]) * v;
          const z = s.A[2] + (s.B[2] - s.A[2]) * u + (s.D[2] - s.A[2]) * v;
          // setor visitante: metade de uma cabeceira
          const awaySec = Math.abs(s.rot - Math.PI / 2) < 0.1 && z > -18 && z < 18;
          push(x, y + 0.05, z, s.rot, awaySec);
        }
      }
    }
    const n = pos.length / 3;
    const base = new THREE.PlaneGeometry(0.62, 1.0).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.uv = base.attributes.uv;
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(col), 3));
    g.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array(ph), 1));
    g.setAttribute('iTeam', new THREE.InstancedBufferAttribute(new Float32Array(team), 1));
    g.setAttribute('iRot', new THREE.InstancedBufferAttribute(new Float32Array(rot), 1));
    g.instanceCount = n;
    this.track(g);
    this.crowdUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uExcite: { value: 0.2 }, uCheer0: { value: 0 }, uCheer1: { value: 0 }, uLight: { value: new THREE.Color(1, 1, 1) } },
    ]);
    const mat = new THREE.ShaderMaterial({ vertexShader: crowdVS, fragmentShader: crowdFS, uniforms: this.crowdUniforms, fog: true, side: THREE.DoubleSide });
    this.track(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.crowd = mesh;
    this.crowdCount = n;
  }

  // Efeitos por quadro.
  update(dt, t, ctx) {
    for (const b of this.boardTex) b.t.offset.x = (b.t.offset.x + b.speed * dt) % 1;
    for (const net of this.nets) net.update(dt);
    // bandeirinhas
    const wind = 0.4 + Math.min(1.5, this.env.windSpeed / 8);
    for (const f of this.flags) {
      const pos = f.mesh.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 3) {
        const u = (f.base[i] - 0) / 0.45;
        pos[i + 2] = f.base[i + 2] + Math.sin(t * 6 * wind + f.ph + u * 4) * 0.09 * u * wind;
      }
      f.mesh.geometry.attributes.position.needsUpdate = true;
      f.mesh.rotation.y = -this.env.windDir;
    }
    const u = this.crowdUniforms;
    u.uTime.value = t;
    u.uExcite.value = ctx.excite;
    u.uCheer0.value += ((ctx.cheer[0] || 0) - u.uCheer0.value) * Math.min(1, dt * 3);
    u.uCheer1.value += ((ctx.cheer[1] || 0) - u.uCheer1.value) * Math.min(1, dt * 3);
    // placas mostram "GOL!" depois de um gol
    if (this.goalFlash > 0) {
      this.goalFlash -= dt;
      const on = this.goalFlash > 0;
      for (const m of this.boardMats) {
        m.map = on ? this.goalTex : m.userData.orig || m.map;
        m.emissiveMap = m.map;
      }
      this.goalTex.offset.x = (this.goalTex.offset.x + dt * 0.5) % 1;
    }
  }

  flashGoal() {
    for (const m of this.boardMats) if (!m.userData.orig) m.userData.orig = m.map;
    this.goalTex.repeat.x = 8;
    this.goalFlash = 6;
  }

  setLighting(lightCol) {
    this.crowdUniforms.uLight.value.copy(lightCol);
  }

  dispose() {
    this.scene.remove(this.group);
    for (const d of this.disposables) if (d && d.dispose) d.dispose();
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
