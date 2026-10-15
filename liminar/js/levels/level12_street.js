// Nível 12 — "Matrix", área 2: uma rua deserta e reta no meio do nada, sob uma
// lua vermelha enorme e um brilho vermelho intenso. Casas e lojas vazias,
// postes apagados, carros abandonados, areia cobrindo o asfalto. Em algum lugar
// fora da rua há uma porta branca aberta, brilhando — ela leva à área 3.
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { GeoBuilder, litMaterial } from '../materials.js';
import { getTex } from '../textures.js';
import { SKY_GLSL } from './outdoor.js';
import { clamp, mulberry32, TAU } from '../util.js';

const MOON = new THREE.Vector3(0.12, 0.2, -1).normalize();
const ROAD_W = 4.2; // meia largura do asfalto
const WALK = 2.6; // largura da calçada
const Z0 = 24;
const Z1 = -420;

function uvScale(g, sx, sy) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return g;
}

export class Level12Street {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 12;
    this.camFar = 2000;
    this.walkSpeed = 2.4;
    this.flashIntensity = 10;
    this.taken = new Set();
    this.colliders = [];
    this.circles = [];
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.time = 0;
    this.look = {
      exposure: 1.0,
      tint: [1.08, 0.94, 0.92],
      sat: 1.1,
      contrast: 1.1,
      lift: [0.02, 0.0, 0.0],
      bloom: 0.45,
      bloomThreshold: 0.9,
      fog: [0.2, 0.025, 0.02],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level12_2',
      reverb: 2.4,
      sanityDrain: 0.07,
    };
    this.objectives = [{ id: 'white', text: 'Encontre a porta branca aberta' }];
    const rnd = mulberry32((game.seed ^ 0x122) >>> 0);
    const side = rnd() < 0.5 ? -1 : 1;
    this.doorP = { x: side * (38 + rnd() * 18), z: -240 - rnd() * 60 };
    this.exit = this.doorP;
    this.spawn = { x: 1.8, z: 14, yaw: 0 };
    this.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.012);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(...this.look.fog);
    this.hemi = new THREE.HemisphereLight(0x8a2418, 0x200604, 1.3);
    this.moonL = new THREE.DirectionalLight(0xff5038, 1.6);
    this.scene.add(this.hemi, this.moonL, this.moonL.target);
    if (this.Q.shadows) {
      const L = this.moonL;
      L.castShadow = true;
      L.shadow.mapSize.set(this.Q.shadowSize, this.Q.shadowSize);
      const c = L.shadow.camera;
      c.left = c.bottom = -50;
      c.right = c.top = 50;
      c.near = 1;
      c.far = 300;
      L.shadow.bias = -0.0005;
      L.shadow.normalBias = 0.05;
    }
    this.makeSky();
  }

  makeSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMoon: { value: MOON.clone() }, uTime: { value: 0 }, uFog: { value: new THREE.Color(...this.look.fog) } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uMoon, uFog;
        uniform float uTime;
        varying vec3 vDir;
        ${SKY_GLSL}
        float h31( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.yzx + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }
        void main() {
          vec3 d = normalize( vDir );
          float h = d.y;
          vec3 col = mix( vec3( 0.2, 0.015, 0.01 ), vec3( 0.02, 0.0, 0.003 ), smoothstep( 0.0, 0.6, h ) );
          // a lua: disco enorme com crateras e um halo vermelho intenso
          float md = dot( d, uMoon );
          float r = acos( clamp( md, -1.0, 1.0 ) );
          float R = 0.15;
          vec3 up = normalize( cross( cross( uMoon, vec3( 0.0, 1.0, 0.0 ) ), uMoon ) );
          vec3 rt = normalize( cross( uMoon, vec3( 0.0, 1.0, 0.0 ) ) );
          vec2 mp = vec2( dot( d, rt ), dot( d, up ) ) / R;
          float disk = smoothstep( R, R - 0.004, r );
          float n = sFbm( mp * 3.0 + 4.0 );
          float cr = sFbm( mp * 9.0 - 2.0 );
          vec3 moon = vec3( 1.7, 0.12, 0.05 ) * ( 0.7 + n * 0.6 - smoothstep( 0.55, 0.7, cr ) * 0.35 );
          moon *= 0.65 + 0.35 * sqrt( max( 0.0, 1.0 - dot( mp, mp ) ) );
          col += vec3( 0.7, 0.03, 0.01 ) * exp( -max( r - R, 0.0 ) * 7.0 ) * 0.6;
          col += vec3( 0.4, 0.02, 0.01 ) * exp( -max( r - R, 0.0 ) * 1.5 ) * 0.35;
          col = mix( col, moon, disk );
          // nuvens finas atravessando
          vec2 cp = d.xz / max( h + 0.1, 0.05 ) * 0.4 + vec2( uTime * 0.003, 0.0 );
          float cl = smoothstep( 0.5, 0.85, sFbm( cp * 1.5 ) );
          col = mix( col, vec3( 0.12, 0.01, 0.01 ), cl * 0.6 * ( 1.0 - disk * 0.5 ) );
          // estrelas fracas
          vec3 sp = d * 260.0;
          float st = step( 0.992, h31( floor( sp ) ) ) * smoothstep( 0.12, 0.0, length( fract( sp ) - 0.5 ) );
          col += vec3( 0.6, 0.4, 0.4 ) * st * smoothstep( 0.1, 0.5, h ) * ( 1.0 - disk );
          col = mix( uFog, col, smoothstep( -0.02, 0.18, h ) );
          gl_FragColor = vec4( col, 1.0 );
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  async preload(px, pz, progress) {
    const Q = this.Q;
    const S = Q.tex;
    const tick = async (f) => {
      if (progress) progress(f);
      await new Promise((r) => setTimeout(r, 0));
    };
    const asph = getTex('asphalt', S);
    const side = getTex('sidewalk', S);
    const soil = getTex('soil', S);
    const fac = getTex('facadeConcrete', S);
    const brick = getTex('facadeBrick', S);
    const roof = getTex('roof', S);
    this.M = {
      road: litMaterial(Q, { map: asph.map, normalMap: asph.normalMap, roughness: 0.75, color: 0x9a8a86 }),
      walk: litMaterial(Q, { map: side.map, normalMap: side.normalMap, roughness: 0.9, color: 0xb0a09a }),
      sand: litMaterial(Q, { map: soil.map, normalMap: soil.normalMap, roughness: 1, color: 0xd8b49a }),
      fac: litMaterial(Q, { map: fac.map, normalMap: fac.normalMap, vertexColors: true, roughness: 0.9 }),
      brick: litMaterial(Q, { map: brick.map, normalMap: brick.normalMap, vertexColors: true, roughness: 0.9 }),
      roof: litMaterial(Q, { map: roof.map, vertexColors: true, roughness: 0.9 }),
      misc: litMaterial(Q, { vertexColors: true, roughness: 0.7, metalness: 0.2 }),
    };
    const M = this.M;
    const add = (geo, mat, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast && Q.shadows;
      m.receiveShadow = Q.shadows;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.dynamic.add(m);
      return m;
    };
    // chão: areia, calçadas, asfalto
    const L = Z0 - Z1;
    const zc = (Z0 + Z1) / 2;
    const sand = uvScale(new THREE.PlaneGeometry(320, L + 160, 1, 1), 320 / 6, (L + 160) / 6).rotateX(-Math.PI / 2).translate(0, -0.02, zc);
    add(sand, M.sand, false);
    const road = uvScale(new THREE.PlaneGeometry(ROAD_W * 2, L, 1, 1), 1.2, L / 6).rotateX(-Math.PI / 2).translate(0, 0.0, zc);
    add(road, M.road, false);
    for (const s of [-1, 1]) {
      const w = new GeoBuilder();
      w.box(s * (ROAD_W + WALK / 2), 0.07, zc, WALK, 0.14, L, [1, 1, 1], null, { uvScale: 0.5 });
      add(w.build(), M.walk, false);
    }
    await tick(0.2);
    // faixas da estrada (amarelas, apagadas)
    const lines = new GeoBuilder();
    for (let z = Z0 - 2; z > Z1; z -= 6) lines.box(0, 0.005, z, 0.14, 0.01, 3, [0.55, 0.45, 0.15], null, {});
    add(lines.build(), M.misc, false);
    // construções dos dois lados, com vãos e terrenos vazios
    const rnd = mulberry32(1212);
    const fb = new GeoBuilder();
    const bb = new GeoBuilder();
    const rb = new GeoBuilder();
    const mb = new GeoBuilder();
    this.windowsLit = [];
    for (const s of [-1, 1]) {
      let z = Z0 - 6;
      while (z > Z1 + 20) {
        const w = 8 + rnd() * 10;
        if (rnd() < 0.3) {
          z -= w + rnd() * 20; // terreno vazio
          continue;
        }
        const d = 8 + rnd() * 6;
        const h = 3.4 + (rnd() < 0.35 ? 3.4 : 0) + rnd() * 0.6;
        const x = s * (ROAD_W + WALK + 1 + d / 2 + rnd() * 2);
        const cz = z - w / 2;
        const shade = 0.55 + rnd() * 0.35;
        const col = [shade, shade * 0.95, shade * 0.9];
        (rnd() < 0.5 ? fb : bb).box(x, h / 2, cz, d, h, w, col, null, { uvScale: 0.25 });
        rb.box(x, h + 0.15, cz, d + 0.4, 0.3, w + 0.4, [0.5, 0.45, 0.42], null, { uvScale: 0.3 });
        this.colliders.push([x - d / 2 - 0.1, x + d / 2 + 0.1, cz - w / 2 - 0.1, cz + w / 2 + 0.1]);
        // janelas e porta na fachada da rua (escuras; uma ou outra com brilho vermelho)
        const fx = x - (s * d) / 2 - s * 0.02;
        const floors = h > 6 ? 2 : 1;
        for (let f = 0; f < floors; f++) {
          for (let k = 0; k < Math.floor(w / 3); k++) {
            const wz = z - 1.6 - k * 3;
            const wy = 1.6 + f * 3.4;
            if (f === 0 && k === 1) {
              mb.box(fx, 1.1, wz, 0.06, 2.2, 1.1, [0.05, 0.03, 0.03], null, {});
              continue;
            }
            const lit = rnd() < 0.06;
            mb.box(fx, wy, wz, 0.06, 1.3, 1.5, lit ? [1.4, 0.25, 0.12] : [0.04, 0.03, 0.03], null, {});
          }
        }
        // placa de loja apagada
        if (rnd() < 0.4) mb.box(fx - s * 0.1, 3.0, cz, 0.12, 0.7, w * 0.7, [0.25, 0.08, 0.06], null, {});
        z -= w + rnd() * 3;
      }
    }
    add(fb.build(), M.fac);
    add(bb.build(), M.brick);
    add(rb.build(), M.roof);
    await tick(0.45);
    // postes apagados com fios, carros abandonados, arbustos secos, placas
    for (let z = Z0 - 10; z > Z1 + 10; z -= 26) {
      for (const s of [-1, 1]) {
        if (rnd() < 0.15) continue;
        const x = s * (ROAD_W + 0.6);
        const lean = (rnd() - 0.5) * 0.08;
        mb.addGeometry(new THREE.CylinderGeometry(0.08, 0.11, 8, 7), new THREE.Matrix4().makeRotationZ(lean).setPosition(x, 4, z), [0.35, 0.3, 0.28]);
        mb.addGeometry(new THREE.BoxGeometry(0.1, 0.1, 1.6), new THREE.Matrix4().makeTranslation(x - s * 0.2, 7.6, z), [0.35, 0.3, 0.28]);
        mb.addGeometry(new THREE.BoxGeometry(0.5, 0.15, 0.25), new THREE.Matrix4().makeTranslation(x - s * 1.1, 7.6, z), [0.25, 0.22, 0.2]);
        this.circles.push([x, z, 0.25]);
      }
    }
    // fios entre postes (catenárias)
    for (const s of [-1, 1]) {
      for (let z = Z0 - 10; z > Z1 + 36; z -= 26) {
        const x = s * (ROAD_W + 0.6);
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          pts.push(new THREE.Vector3(x, 7.4 - Math.sin(t * Math.PI) * 1.1, z - t * 26));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        mb.addGeometry(new THREE.TubeGeometry(curve, 10, 0.015, 3, false), new THREE.Matrix4(), [0.05, 0.04, 0.04]);
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = (rnd() < 0.5 ? -1 : 1) * (1 + rnd() * 2.5);
      const z = Z0 - 30 - rnd() * (L - 60);
      const a = (rnd() - 0.5) * 0.6 + (rnd() < 0.5 ? 0 : Math.PI);
      this.car(mb, x, z, a, [0.3 + rnd() * 0.4, 0.2 + rnd() * 0.2, 0.18 + rnd() * 0.2]);
    }
    for (let i = 0; i < 160; i++) {
      const x = (rnd() < 0.5 ? -1 : 1) * (ROAD_W + 4 + rnd() * 120);
      const z = Z0 - rnd() * (L + 40);
      const r = 0.25 + rnd() * 0.5;
      mb.addGeometry(new THREE.IcosahedronGeometry(r, 0), new THREE.Matrix4().makeScale(1.3, 0.7, 1.3).setPosition(x, r * 0.4, z), [0.28, 0.18, 0.12]);
    }
    // mesas (morros de topo plano) no horizonte
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + rnd() * 0.3;
      const R = 360 + rnd() * 120;
      const w = 40 + rnd() * 80;
      const h = 20 + rnd() * 40;
      mb.addGeometry(new THREE.CylinderGeometry(w * 0.6, w, h, 7), new THREE.Matrix4().setPosition(Math.cos(a) * R, h / 2 - 2, -200 + Math.sin(a) * R), [0.16, 0.05, 0.04]);
    }
    add(mb.build(), M.misc);
    await tick(0.7);
    this.makeDoor();
    this.makeManhole();
    await tick(0.95);
  }

  car(gb, x, z, a, col) {
    const m = (dx, dy, dz) => new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz)).setPosition(
      x + Math.cos(a) * dx + Math.sin(a) * dz,
      dy,
      z - Math.sin(a) * dx + Math.cos(a) * dz,
    );
    gb.addGeometry(new THREE.BoxGeometry(1.8, 0.7, 4.3), m(0, 0.65, 0), col);
    gb.addGeometry(new THREE.BoxGeometry(1.6, 0.55, 2.2), m(0, 1.25, -0.2), [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
    gb.addGeometry(new THREE.BoxGeometry(1.62, 0.4, 2.0), m(0, 1.27, -0.2), [0.04, 0.03, 0.03]);
    for (const [wx, wz] of [
      [-0.85, 1.35],
      [0.85, 1.35],
      [-0.85, -1.35],
      [0.85, -1.35],
    ])
      gb.addGeometry(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2), m(wx, 0.33, wz), [0.06, 0.05, 0.05]);
    this.circles.push([x + Math.sin(a) * 1.2, z + Math.cos(a) * 1.2, 1.05], [x - Math.sin(a) * 1.2, z - Math.cos(a) * 1.2, 1.05]);
  }

  // A porta branca, aberta, sozinha na areia.
  makeDoor() {
    const { x, z } = this.doorP;
    const g = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2, emissive: 0x7a7070 });
    const light = new THREE.MeshBasicMaterial({ color: 0xffffff });
    light.color.multiplyScalar(4);
    const frameW = 1.1;
    const frameH = 2.2;
    for (const dx of [-frameW / 2 - 0.06, frameW / 2 + 0.06]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, frameH + 0.12, 0.18), white);
      b.position.set(dx, (frameH + 0.12) / 2, 0);
      g.add(b);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(frameW + 0.24, 0.12, 0.18), white);
    top.position.y = frameH + 0.06;
    g.add(top);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(frameW, frameH), light);
    portal.position.y = frameH / 2;
    g.add(portal);
    const back = portal.clone();
    back.rotation.y = Math.PI;
    g.add(back);
    // folha aberta
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(frameW - 0.04, frameH - 0.04, 0.05), white);
    const pivot = new THREE.Group();
    pivot.position.set(-frameW / 2, 0, 0);
    leaf.position.set(frameW / 2, frameH / 2, 0);
    pivot.add(leaf);
    pivot.rotation.y = 1.9;
    g.add(pivot);
    // brilho no chão e halo
    const tex = (() => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 128;
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(cv);
    })();
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.set(7, 7, 1);
    halo.position.y = 1.2;
    g.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.02, 1.2);
    g.add(pool);
    const pl = new THREE.PointLight(0xffffff, 18, 18, 1.7);
    pl.position.set(0, 1.4, 1.0);
    g.add(pl);
    // virada para a rua
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-x, 0) ;
    this.dynamic.add(g);
    this.door = g;
    this.doorHalo = halo;
    this.doorMats = [white, light, halo.material, pool.material];
    this.doorTex = tex;
    this.doorN = { x: Math.sin(g.rotation.y), z: Math.cos(g.rotation.y) };
    this.circles.push([x + this.doorN.z * 0.6, z - this.doorN.x * 0.6, 0.15], [x - this.doorN.z * 0.6, z + this.doorN.x * 0.6, 0.15]);
  }

  // Bueiro aberto de onde o jogador sai.
  makeManhole() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 20), new THREE.MeshBasicMaterial({ color: 0x050202 }));
    m.position.set(1.8, 0.012, 16);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20), new THREE.MeshLambertMaterial({ color: 0x3a3230 }));
    lid.position.set(2.9, 0.03, 16.6);
    this.dynamic.add(m, lid);
    this.manMats = [m.material, lid.material];
  }

  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const cam = g.camera.position;
    this.sky.position.copy(cam);
    this.sky.material.uniforms.uTime.value = this.time;
    const L = this.moonL;
    L.target.position.set(p.x, 0, p.z);
    L.position.set(p.x + MOON.x * 150, MOON.y * 150, p.z + MOON.z * 150);
    L.target.updateMatrixWorld();
    // a porta pulsa
    const k = 1 + Math.sin(this.time * 2.1) * 0.1 + (Math.random() < 0.02 ? 0.4 : 0);
    this.doorHalo.scale.set(7 * k, 7 * k, 1);
    const dd = Math.hypot(p.x - this.doorP.x, p.z - this.doorP.z);
    if (dd < 70 && !this.toldDoor) {
      this.toldDoor = true;
      g.hud.message('Uma luz branca no meio do vermelho. Uma porta, aberta, sozinha na areia.', 5);
    }
    if (this.time > 2 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Você sobe por um bueiro. O céu inteiro é vermelho.', 4.5);
    }
    // atravessar o vão da porta
    const lx = (p.x - this.doorP.x) * this.doorN.z - (p.z - this.doorP.z) * this.doorN.x;
    const lz = (p.x - this.doorP.x) * this.doorN.x + (p.z - this.doorP.z) * this.doorN.z;
    if (Math.abs(lx) < 0.5 && Math.abs(lz) < 0.15) this.enter();
  }

  enter() {
    if (this.entering) return;
    this.entering = true;
    const g = this.game;
    g.completeObjective('white', 'Você atravessa a porta branca.');
    g.post.u.uFadeColor.value.setRGB(1, 1, 1);
    g.reachExit('noclip', 0.3);
  }

  collide(p, r) {
    p.x = clamp(p.x, -140, 140);
    p.z = clamp(p.z, Z1 + 5, Z0 - 2);
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) pushCircle(p, r, b[0], b[1], b[2], b[3]);
      for (const c of this.circles) {
        const dx = p.x - c[0];
        const dz = p.z - c[1];
        if (Math.abs(dx) > c[2] + 1 || Math.abs(dz) > c[2] + 1) continue;
        const d = Math.hypot(dx, dz);
        const rr = r + c[2];
        if (d < rr && d > 1e-4) {
          p.x = c[0] + (dx / d) * rr;
          p.z = c[1] + (dz / d) * rr;
        }
      }
    }
    return p;
  }

  groundY(x) {
    const a = Math.abs(x);
    return a > ROAD_W && a < ROAD_W + WALK ? 0.14 : 0;
  }

  surfaceAt(x) {
    const a = Math.abs(x);
    return a < ROAD_W ? 'asphalt' : a < ROAD_W + WALK ? 'concrete' : 'dirt';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 0.7;
  }

  interactable(player) {
    const p = player.pos;
    if (Math.hypot(p.x - this.doorP.x, p.z - this.doorP.z) < 2) return { label: 'Atravessar a porta branca', action: () => this.enter() };
    return null;
  }

  navTarget() {
    return this.doorP;
  }

  exitEmitter() {
    return { x: this.doorP.x, y: 1.2, z: this.doorP.z, sound: 'hum', gain: 0.5 };
  }

  dispose() {
    this.dynamic.traverse((o) => o.geometry && o.geometry.dispose());
    for (const k in this.M) this.M[k].dispose();
    for (const m of [...this.doorMats, ...this.manMats]) m.dispose();
    this.doorTex.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.scene.remove(this.dynamic, this.sky, this.hemi, this.moonL, this.moonL.target);
  }
}
