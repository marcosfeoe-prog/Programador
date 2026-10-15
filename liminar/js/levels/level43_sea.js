// Nível 43 — área secreta: O Mar. Atrás de uma porta molhada no fundo do
// Grande Tanque há um mar aberto e infinito, no meio do nada: só uma
// plataforma de madeira, água até o horizonte em todas as direções, céu
// limpo e vento. Nada vive aqui. A porta continua de pé na plataforma.
import * as THREE from 'three';
import { clamp } from '../util.js';

export const SEA = { x: 30000, z: 0 };
const HALF = 2.8; // meia largura da plataforma

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float y = max(d.y, -0.2);
    vec3 zen = vec3(0.12, 0.32, 0.72);
    vec3 hor = vec3(0.72, 0.84, 0.92);
    vec3 c = mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.55));
    float s = max(dot(d, uSun), 0.0);
    c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.35);
    if (d.y < 0.0) c = mix(hor, vec3(0.1, 0.25, 0.35), clamp(-d.y * 5.0, 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
  }`;

const SEA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  float wave(vec2 p, vec2 dir, float f, float a, float s, out vec2 g) {
    float ph = dot(p, dir) * f + uTime * s;
    g = dir * f * a * cos(ph);
    return a * sin(ph);
  }
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 p = w.xz;
    vec2 g;
    vec2 gs = vec2(0.0);
    float h = 0.0;
    h += wave(p, normalize(vec2(1.0, 0.3)), 0.12, 0.35, 1.1, g); gs += g;
    h += wave(p, normalize(vec2(-0.4, 1.0)), 0.21, 0.18, 1.6, g); gs += g;
    h += wave(p, normalize(vec2(0.7, -0.8)), 0.43, 0.08, 2.3, g); gs += g;
    h += wave(p, normalize(vec2(-0.9, -0.2)), 0.9, 0.035, 3.1, g); gs += g;
    w.y += h;
    vW = w.xyz;
    vN = normalize(vec3(-gs.x, 1.0, -gs.y));
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SEA_FRAG = /* glsl */ `
  uniform vec3 uSun;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    vec3 n = normalize(vN);
    float fr = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 deep = vec3(0.0, 0.07, 0.13);
    vec3 r = reflect(-v, n);
    vec3 sky = mix(vec3(0.72, 0.84, 0.92), vec3(0.12, 0.32, 0.72), pow(clamp(r.y, 0.0, 1.0), 0.55));
    vec3 c = mix(deep + vec3(0.0, 0.08, 0.09) * max(n.y - 0.9, 0.0) * 10.0, sky, fr);
    c += vec3(1.0, 0.9, 0.7) * pow(max(dot(r, uSun), 0.0), 220.0) * 3.0;
    float d = distance(cameraPosition.xz, vW.xz);
    c = mix(c, vec3(0.72, 0.84, 0.92), smoothstep(250.0, 1400.0, d));
    gl_FragColor = vec4(c, 1.0);
  }`;

// Caixa com sombreamento falso por face (sem luzes na cena).
function shadedBox(w, h, d, col) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const nor = g.attributes.normal;
  const c = new Float32Array(nor.count * 3);
  for (let i = 0; i < nor.count; i++) {
    const k = nor.getY(i) > 0.5 ? 1 : nor.getY(i) < -0.5 ? 0.35 : Math.abs(nor.getX(i)) > 0.5 ? 0.62 : 0.8;
    c[i * 3] = col[0] * k;
    c[i * 3 + 1] = col[1] * k;
    c[i * 3 + 2] = col[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

export class SeaArea {
  constructor(level) {
    this.L = level;
    this.game = level.game;
    const g = new THREE.Group();
    g.position.set(SEA.x, 0, SEA.z);
    this.group = g;
    this.geos = [];
    this.mats = [];
    const sun = new THREE.Vector3(0.4, 0.35, -0.85).normalize();
    this.uTime = { value: 0 };
    const skyMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
    const skyGeo = new THREE.SphereGeometry(1800, 32, 16);
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    const seaMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun }, uTime: this.uTime }, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: false });
    const seaGeo = new THREE.PlaneGeometry(3200, 3200, 200, 200);
    seaGeo.rotateX(-Math.PI / 2);
    this.sea = new THREE.Mesh(seaGeo, seaMat);
    this.sea.position.y = -0.9;
    this.sea.frustumCulled = false;
    g.add(this.sky, this.sea);
    this.geos.push(skyGeo, seaGeo);
    this.mats.push(skyMat, seaMat);
    // plataforma de madeira sobre estacas
    const wood = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.mats.push(wood);
    const add = (geo, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(geo, wood);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      g.add(m);
      this.geos.push(geo);
    };
    for (let k = 0; k < 9; k++) {
      const t = 0.55 + ((k * 37) % 10) / 60;
      add(shadedBox(HALF * 2 + 0.2, 0.08, 0.6, [0.55 * t * 1.4, 0.4 * t * 1.4, 0.26 * t * 1.4]), 0, -0.04, -HALF + 0.3 + k * 0.64);
    }
    for (const [x, z] of [
      [-HALF, -HALF],
      [HALF, -HALF],
      [-HALF, HALF],
      [HALF, HALF],
      [0, -HALF],
      [0, HALF],
    ])
      add(shadedBox(0.22, 3.2, 0.22, [0.32, 0.24, 0.16]), x, -1.6, z);
    // corrimão em três lados
    for (const s of [-1, 1]) {
      add(shadedBox(HALF * 2, 0.07, 0.07, [0.45, 0.33, 0.2]), 0, 1.0, s * HALF);
      add(shadedBox(0.07, 0.07, HALF * 2, [0.45, 0.33, 0.2]), s * HALF, 1.0, 0);
      for (let k = -2; k <= 2; k++) {
        add(shadedBox(0.07, 1.0, 0.07, [0.4, 0.3, 0.18]), (k * HALF) / 2, 0.5, s * HALF);
        add(shadedBox(0.07, 1.0, 0.07, [0.4, 0.3, 0.18]), s * HALF, 0.5, (k * HALF) / 2);
      }
    }
    // a porta de volta, sozinha no meio da plataforma, ainda pingando
    add(shadedBox(1.0, 2.1, 0.06, [0.62, 0.66, 0.68]), 0, 1.05, HALF - 0.6);
    for (const s of [-1, 1]) add(shadedBox(0.1, 2.25, 0.14, [0.4, 0.42, 0.44]), s * 0.56, 1.12, HALF - 0.6);
    add(shadedBox(1.22, 0.1, 0.14, [0.4, 0.42, 0.44]), 0, 2.25, HALF - 0.6);
    add(shadedBox(0.08, 0.04, 0.05, [0.85, 0.75, 0.4]), 0.36, 1.0, HALF - 0.66);
    // uma boia vermelha ao longe
    const buoy = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.4, 12), new THREE.MeshBasicMaterial({ color: 0xc8301e, fog: false }));
    buoy.position.set(-38, -0.4, -60);
    g.add(buoy);
    this.buoy = buoy;
    this.geos.push(buoy.geometry);
    this.mats.push(buoy.material);
    g.visible = false;
    level.scene.add(g);
    this.entry = { x: SEA.x, z: SEA.z + HALF - 1.5, yaw: 0 };
    this.back = { x: SEA.x, z: SEA.z + HALF - 0.9 };
  }

  enter() {
    const g = this.game;
    this.group.visible = true;
    const sc = this.L.scene;
    this.saved = { fog: sc.fog, bg: sc.background, far: g.camera.far };
    sc.fog = null;
    sc.background = new THREE.Color(0.72, 0.84, 0.92);
    g.camera.far = 4000;
    g.camera.updateProjectionMatrix();
    this.waves = g.audio.positional('water', SEA.x, -0.5, SEA.z, { gain: 0.7, rate: 0.5, ref: 3, rolloff: 0.4, wet: 0.2 });
    this.wind = g.audio.positional('wind', SEA.x, 3, SEA.z - 20, { gain: 0.5, rate: 0.6, ref: 10, rolloff: 0.3, wet: 0.1 });
  }

  leave() {
    const g = this.game;
    this.group.visible = false;
    const sc = this.L.scene;
    if (this.saved) {
      sc.fog = this.saved.fog;
      sc.background = this.saved.bg;
      g.camera.far = this.saved.far;
      g.camera.updateProjectionMatrix();
    }
    for (const s of [this.waves, this.wind]) if (s) s.stop();
    this.waves = this.wind = null;
  }

  update(dt, player, time) {
    this.uTime.value = time;
    // céu e mar acompanham o andarilho (o mar nunca acaba)
    this.sky.position.set(player.pos.x - SEA.x, 0, player.pos.z - SEA.z);
    this.buoy.position.y = -0.5 + Math.sin(time * 1.1) * 0.25;
    this.buoy.rotation.z = Math.sin(time * 0.9) * 0.15;
    this.L.sanityExtra = -1.2;
  }

  collide(p, r) {
    const m = HALF - 0.1 - r;
    p.x = clamp(p.x, SEA.x - m, SEA.x + m);
    p.z = clamp(p.z, SEA.z - m, SEA.z + HALF - 0.75 - r);
    return p;
  }

  dispose() {
    this.leave();
    this.L.scene.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
