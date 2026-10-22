// Renderização: materiais dos blocos, malhas dos chunks, céu, nuvens, seleção e rachaduras.
import * as THREE from 'three';
import { CS, CH } from './consts.js';
import { buildChunkGeometry } from './mesher.js';
import { tileUV, Painter, canvasTexture } from './textures.js';
import { mulberry32, Perlin } from './noise.js';

const blockVert = /* glsl */ `
  attribute vec3 aLight;
  attribute vec3 aTint;
  varying vec2 vUv;
  varying vec3 vLight;
  varying vec3 vTint;
  varying float vDist;
  void main() {
    vUv = uv;
    vLight = aLight;
    vTint = aTint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const blockFrag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uSkyDarken;
  uniform vec3 uSkyColor;
  uniform float uGamma;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uAlphaTest;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vLight;
  varying vec3 vTint;
  varying float vDist;
  float lb(float L) {
    float f = 1.0 - L / 15.0;
    float b = (1.0 - f) / (f * 3.0 + 1.0);
    return mix(b, sqrt(b), uGamma);
  }
  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    if (tex.a < uAlphaTest) discard;
    float skyL = max(0.0, vLight.x * 15.0 - uSkyDarken);
    float bs = lb(skyL);
    float bb = lb(vLight.y * 15.0);
    vec3 light = max(bs * uSkyColor, bb * vec3(1.05, 0.9, 0.72));
    light = max(light, vec3(0.025));
    vec3 col = tex.rgb * vTint * light * vLight.z;
    float fog = smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(mix(col, uFogColor, fog), tex.a * uOpacity);
  }
`;

export class Renderer {
  constructor(canvas, atlas) {
    THREE.ColorManagement.enabled = false;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1200);
    this.atlas = atlas;
    this.uniforms = {
      uAtlas: { value: atlas },
      uSkyDarken: { value: 0 },
      uSkyColor: { value: new THREE.Color(1, 1, 1) },
      uGamma: { value: 0.35 },
      uFogColor: { value: new THREE.Color(0.7, 0.8, 1) },
      uFogNear: { value: 80 },
      uFogFar: { value: 120 },
    };
    const mk = (extra) =>
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uAlphaTest: { value: extra.alphaTest }, uOpacity: { value: 1 } },
        vertexShader: blockVert,
        fragmentShader: blockFrag,
        transparent: !!extra.transparent,
        depthWrite: extra.depthWrite ?? true,
        side: THREE.FrontSide,
      });
    this.solidMat = mk({ alphaTest: 0.5 });
    this.transMat = mk({ alphaTest: 0.01, transparent: true, depthWrite: false });
    this.chunkGroup = new THREE.Group();
    this.scene.add(this.chunkGroup);
    this.skyScene = new THREE.Scene();
    this.sky = new Sky(this.skyScene);
    this.clouds = new Clouds(this.scene);
    this.selection = this.makeSelection();
    this.crack = this.makeCrack();
    this.radius = 8;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Remonta as malhas pendentes (as próximas e as editadas primeiro).
  updateChunks(world, px, pz, budgetMs = 6) {
    const t0 = performance.now();
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const list = [];
    for (const c of world.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (c.meshes) {
        const vis = d <= this.radius;
        for (const m of c.meshes) if (m) m.visible = vis;
      }
      if (!c.dirty || d > this.radius) continue;
      list.push([c, (c.priority ? -1000 : 0) + dx * dx + dz * dz]);
    }
    list.sort((a, b) => a[1] - b[1]);
    let built = 0;
    for (const [c, p] of list) {
      if (p >= 0 && performance.now() - t0 > budgetMs && built > 0) break;
      if (!world.canMesh(c)) continue;
      this.buildChunk(world, c);
      built++;
    }
    return list.length - built;
  }

  buildChunk(world, c) {
    const { solid, trans } = buildChunkGeometry(world, c);
    this.disposeChunk(c);
    c.meshes = [];
    if (solid) {
      const m = new THREE.Mesh(solid, this.solidMat);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.chunkGroup.add(m);
      c.meshes.push(m);
    }
    if (trans) {
      const m = new THREE.Mesh(trans, this.transMat);
      m.position.set(c.cx * CS, 0, c.cz * CS);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = 1;
      this.chunkGroup.add(m);
      c.meshes.push(m);
    }
    c.dirty = false;
    c.priority = false;
  }

  disposeChunk(c) {
    if (!c.meshes) return;
    for (const m of c.meshes) {
      this.chunkGroup.remove(m);
      m.geometry.dispose();
    }
    c.meshes = null;
  }

  clearChunks(world) {
    for (const c of world.chunks.values()) this.disposeChunk(c);
  }

  makeSelection() {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    m.visible = false;
    this.scene.add(m);
    return m;
  }
  setSelection(hit, box) {
    if (!hit) {
      this.selection.visible = false;
      return;
    }
    const [x0, y0, z0, x1, y1, z1] = box;
    this.selection.visible = true;
    this.selection.scale.set(x1 - x0, y1 - y0, z1 - z0);
    this.selection.position.set(hit.x + (x0 + x1) / 2, hit.y + (y0 + y1) / 2, hit.z + (z0 + z1) / 2);
  }

  makeCrack() {
    const g = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const m = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ map: this.atlas, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    m.visible = false;
    m.renderOrder = 2;
    this.scene.add(m);
    this._crackStage = -1;
    return m;
  }
  setCrack(hit, stage) {
    if (!hit || stage < 0) {
      this.crack.visible = false;
      return;
    }
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    if (stage !== this._crackStage) {
      this._crackStage = stage;
      const [u0, v0, u1, v1] = tileUV('crack_' + stage);
      const uv = this.crack.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const k = i % 4;
        uv.setXY(i, k % 2 ? u1 : u0, k < 2 ? v1 : v0);
      }
      uv.needsUpdate = true;
    }
  }

  // Atualiza céu, neblina e luz conforme a hora.
  updateEnvironment(world, cam, opts) {
    const env = skyColors(world.time);
    const u = this.uniforms;
    u.uSkyDarken.value = (1 - env.daylight) * 11;
    u.uSkyColor.value.copy(env.lightColor);
    const far = this.radius * CS;
    if (opts.underwater) {
      u.uFogColor.value.setRGB(0.05 * env.daylight + 0.02, 0.12 * env.daylight + 0.03, 0.35 * env.daylight + 0.06);
      u.uFogNear.value = 1;
      u.uFogFar.value = 22;
    } else if (opts.inLava) {
      u.uFogColor.value.setRGB(0.6, 0.15, 0.02);
      u.uFogNear.value = 0;
      u.uFogFar.value = 3;
    } else {
      u.uFogColor.value.copy(env.fog);
      u.uFogNear.value = far * 0.62;
      u.uFogFar.value = far * 0.98;
    }
    this.sky.update(cam, env, world.time, opts.underwater);
    this.clouds.update(cam, env, opts.clouds && !opts.underwater && !opts.inLava, far);
    this.clearColor = opts.underwater ? u.uFogColor.value : env.fog;
    return env;
  }

  render(extraScene, extraCam) {
    const g = this.gl;
    g.setClearColor(this.clearColor || 0x87ceeb, 1);
    g.clear(true, true, true);
    g.render(this.skyScene, this.camera);
    g.render(this.scene, this.camera);
    if (extraScene) {
      g.clearDepth();
      g.render(extraScene, extraCam);
    }
  }
}

// ---------- céu ----------
const C = (r, g, b) => new THREE.Color(r / 255, g / 255, b / 255);
const DAY_TOP = C(120, 167, 255), DAY_HOR = C(190, 214, 255);
const NIGHT_TOP = C(2, 3, 10), NIGHT_HOR = C(12, 16, 34);
const SUNSET = C(255, 120, 50);

export function skyColors(time) {
  const a = (time / 24000) * Math.PI * 2;
  const sunH = Math.sin(a);
  const daylight = Math.max(0.0, Math.min(1, sunH * 2.5 + 0.55));
  const top = NIGHT_TOP.clone().lerp(DAY_TOP, daylight);
  const hor = NIGHT_HOR.clone().lerp(DAY_HOR, daylight);
  // brilho do nascer/pôr do sol perto do horizonte
  const glow = Math.max(0, 1 - Math.abs(sunH) / 0.35) * (Math.cos(a) !== 0 ? 1 : 0);
  const sunDir = new THREE.Vector3(Math.cos(a), sunH, 0.18).normalize();
  const fog = hor.clone().lerp(SUNSET, glow * 0.35 * (sunDir.x > 0 ? 1 : 1));
  const lightColor = new THREE.Color(1, 1, 1).lerp(C(170, 185, 255), 1 - daylight).lerp(C(255, 200, 160), glow * 0.35);
  return { daylight, top, hor, fog, glow, sunDir, lightColor };
}

class Sky {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() }, uGlow: { value: 0 }, uSunset: { value: SUNSET } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uHor, uSunset, uSun; uniform float uGlow; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.45, h));
          if (h < 0.0) col = mix(uHor, uHor * 0.35, smoothstep(0.0, -0.4, h));
          float s = max(dot(d, normalize(uSun)), 0.0);
          float band = pow(1.0 - min(abs(h), 1.0), 4.0);
          col = mix(col, uSunset, uGlow * band * (0.35 + 0.65 * pow(s, 3.0)));
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), this.domeMat);
    dome.renderOrder = -10;
    this.group.add(dome);

    this.sunTex = canvasTexture(paintSun());
    this.moonTex = canvasTexture(paintMoon());
    const quad = (tex, size) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }),
      );
      m.renderOrder = -9;
      this.group.add(m);
      return m;
    };
    this.sun = quad(this.sunTex, 70);
    this.moon = quad(this.moonTex, 46);

    const rnd = mulberry32(42);
    const pos = [];
    for (let i = 0; i < 1500; i++) {
      const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.push(r * Math.cos(t) * 450, u * 450, r * Math.sin(t) * 450);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9.5;
    this.group.add(this.stars);
  }
  update(cam, env, time, underwater) {
    this.group.position.copy(cam.position);
    this.group.visible = !underwater;
    this.domeMat.uniforms.uTop.value.copy(env.top);
    this.domeMat.uniforms.uHor.value.copy(env.hor);
    this.domeMat.uniforms.uSun.value.copy(env.sunDir);
    this.domeMat.uniforms.uGlow.value = env.glow;
    const d = env.sunDir;
    this.sun.position.set(d.x * 400, d.y * 400, d.z * 400);
    this.sun.lookAt(0, 0, 0);
    this.moon.position.set(-d.x * 400, -d.y * 400, -d.z * 400);
    this.moon.lookAt(0, 0, 0);
    this.starMat.opacity = Math.max(0, 1 - env.daylight * 1.6);
    this.stars.rotation.z = (time / 24000) * Math.PI * 2;
  }
}

function paintSun() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
    let a = 0, col = '255,250,210';
    if (d < 6) a = 1;
    else if (d < 7) { a = 1; col = '255,230,140'; }
    else a = Math.max(0, 0.45 - (d - 7) * 0.05);
    g.fillStyle = `rgba(${col},${a})`;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
function paintMoon() {
  const p = new Painter(77);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (x < 4 || x > 11 || y < 4 || y > 11) p.set(x, y, [0, 0, 0], 0);
    else {
      const crater = (x === 6 && y === 6) || (x === 9 && y === 8) || (x === 7 && y === 10) || (x === 10 && y === 5);
      p.set(x, y, crater ? [150, 150, 170] : [220, 225, 240], 255);
    }
  }
  return p.canvas();
}

// ---------- nuvens em blocos ----------
const CLOUD_CELL = 12, CLOUD_N = 48, CLOUD_Y = 140, CLOUD_H = 4;
class Clouds {
  constructor(scene) {
    const noise = new Perlin(1234);
    const on = (x, z) => {
      x = ((x % CLOUD_N) + CLOUD_N) % CLOUD_N;
      z = ((z % CLOUD_N) + CLOUD_N) % CLOUD_N;
      // ruído periódico: amostra num toro
      const a = (x / CLOUD_N) * Math.PI * 2, b = (z / CLOUD_N) * Math.PI * 2;
      const v = noise.noise3(Math.cos(a) * 3, Math.sin(a) * 3 + Math.cos(b) * 3, Math.sin(b) * 3) + noise.noise3(Math.cos(a) * 7, Math.sin(a) * 7 + Math.cos(b) * 7, Math.sin(b) * 7 + 9) * 0.4;
      return v > 0.12;
    };
    const pos = [], col = [];
    const quad = (pts, s) => {
      const [a, b, c, d] = pts;
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < 6; i++) col.push(s, s, s);
    };
    const S = CLOUD_CELL, H = CLOUD_H;
    for (let z = 0; z < CLOUD_N; z++) for (let x = 0; x < CLOUD_N; x++) {
      if (!on(x, z)) continue;
      const x0 = x * S, x1 = x0 + S, z0 = z * S, z1 = z0 + S;
      quad([[x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0]], 1);
      quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], 0.7);
      if (!on(x + 1, z)) quad([[x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1]], 0.85);
      if (!on(x - 1, z)) quad([[x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0]], 0.85);
      if (!on(x, z + 1)) quad([[x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1]], 0.92);
      if (!on(x, z - 1)) quad([[x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0]], 0.92);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uFog: { value: new THREE.Color() }, uFar: { value: 300 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `attribute vec3 color; varying vec3 vC; varying vec3 vW; void main(){ vC = color; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor, uFog, uCam; uniform float uFar; varying vec3 vC; varying vec3 vW;
        void main(){ float d = length(vW.xz - uCam.xz); float f = smoothstep(uFar*0.5, uFar, d);
          gl_FragColor = vec4(mix(vC * uColor, uFog, f), 0.8 * (1.0 - f)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.group = new THREE.Group();
    this.tiles = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(g, this.mat);
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
      this.tiles.push(m);
    }
    scene.add(this.group);
    this.drift = 0;
    this.last = performance.now();
  }
  update(cam, env, enabled, far) {
    this.group.visible = enabled;
    if (!enabled) return;
    const now = performance.now();
    this.drift += ((now - this.last) / 1000) * 1.2;
    this.last = now;
    const T = CLOUD_N * CLOUD_CELL;
    const ox = cam.position.x - this.drift, oz = cam.position.z;
    const bx = Math.floor(ox / T) * T + this.drift, bz = Math.floor(oz / T) * T;
    let k = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      this.tiles[k++].position.set(bx + dx * T, CLOUD_Y, bz + dz * T);
    }
    const day = env.daylight;
    this.mat.uniforms.uColor.value.setRGB(0.12 + 0.88 * day, 0.12 + 0.88 * day, 0.16 + 0.84 * day).lerp(new THREE.Color(1, 0.75, 0.6), env.glow * 0.3);
    this.mat.uniforms.uFog.value.copy(env.fog);
    this.mat.uniforms.uFar.value = Math.max(220, far * 1.6);
    this.mat.uniforms.uCam.value.copy(cam.position);
  }
}

export { CH };
