// Helicóptero do exército: sobrevoa a cidade com holofote, luzes piscando e som de rotor.
import * as THREE from 'three';
import { mats } from './models.js';
import { BOX, CYL } from './rig.js';
import { mergeByMaterial } from './geo.js';
import { clamp, lerp } from './util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function buildModel() {
  const m = mats();
  const olive = new THREE.MeshStandardMaterial({ color: 0x3a4232, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.15, metalness: 0.6, emissive: 0x0a1418 });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.scale.set(sx, sy, sz);
    body.add(mesh);
    return mesh;
  };
  add(new THREE.SphereGeometry(1, 14, 10), olive, 0, 0, 0.3, 0, 0, 0, 1.25, 1.1, 2.4);
  add(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), glass, 0, 0.15, 1.6, Math.PI / 2.4, 0, 0, 0.95, 0.9, 0.8);
  add(CYL(0.28, 0.16, 5.2, 8), olive, 0, 0.35, -3.6, Math.PI / 2);
  add(BOX(0.12, 1.3, 0.9), olive, 0, 0.95, -6.0);
  add(BOX(1.8, 0.08, 0.5), olive, 0, 0.45, -5.7);
  for (const sx of [-1, 1]) {
    add(BOX(0.08, 0.08, 3.2), m.gunDark, sx * 0.95, -1.25, 0.2);
    add(BOX(0.06, 0.6, 0.06), m.gunDark, sx * 0.85, -0.95, 1.0, 0, 0, sx * 0.2);
    add(BOX(0.06, 0.6, 0.06), m.gunDark, sx * 0.85, -0.95, -0.6, 0, 0, sx * 0.2);
  }
  add(CYL(0.12, 0.12, 0.5, 8), m.gunDark, 0, 1.25, 0.2);
  mergeByMaterial(body);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.5, 0.2);
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(BOX(0.28, 0.04, 6.4), bladeMat);
    b.rotation.y = (i * Math.PI) / 2;
    b.position.set(0, 0, 0);
    b.translateZ(3.1);
    rotor.add(b);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6.3, 32), new THREE.MeshBasicMaterial({ color: 0x0c0d0f, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  rotor.add(disc);
  g.add(rotor);
  const tail = new THREE.Group();
  tail.position.set(0.12, 1.0, -6.0);
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(BOX(0.03, 1.5, 0.12), bladeMat);
    b.rotation.x = (i * Math.PI) / 2;
    tail.add(b);
  }
  g.add(tail);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false, fog: false }));
  red.position.set(-1.0, -0.2, 0.2);
  const green = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0x20ff40, toneMapped: false, fog: false }));
  green.position.set(1.0, -0.2, 0.2);
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false }));
  white.position.set(0, 1.35, -6.2);
  g.add(red, green, white);
  // cone visível do holofote
  const coneGeo = new THREE.ConeGeometry(4.5, 40, 24, 1, true);
  coneGeo.translate(0, -20, 0);
  // facho volumétrico: forte perto do holofote, some no chão e nas bordas
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0xdfe8ff) }, opacity: { value: 0.16 } },
    vertexShader:
      'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader:
      'uniform vec3 color; uniform float opacity; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = opacity * (0.12 + 0.88 * vH * vH) * edge; gl_FragColor = vec4(color * a, a); }',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(0, -0.8, 2.0);
  g.add(cone);
  g.traverse((o) => {
    if (o.isMesh && o !== cone && o !== disc) o.castShadow = true;
  });
  return { g, rotor, tail, cone, lights: [red, green, white] };
}

export class Helicopter {
  constructor(G) {
    this.G = G;
    const m = buildModel();
    this.group = m.g;
    this.rotor = m.rotor;
    this.tail = m.tail;
    this.cone = m.cone;
    this.navLights = m.lights;
    this.group.visible = false;
    G.scene.add(this.group);
    this.spot = new THREE.SpotLight(0xe8f0ff, 0, 70, 0.22, 0.5, 1.2);
    this.spot.castShadow = false;
    G.scene.add(this.spot);
    G.scene.add(this.spot.target);
    this.active = false;
    this.path = null;
    this.t = 0;
    this.auto = null;
    this.sound = null;
    this.vel = new THREE.Vector3();
  }

  reset() {
    this.active = false;
    this.group.visible = false;
    this.spot.intensity = 0;
    this.auto = null;
    this.path = null;
    this.hover = null;
    if (this.sound) {
      this.G.audio.stopHeli(this.sound);
      this.sound = null;
    }
  }

  // Sobrevoo por uma lista de pontos [x,y,z] a uma velocidade (m/s).
  flyover(points, speed = 24, opts = {}) {
    this.path = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.lens = [];
    let total = 0;
    for (let i = 1; i < this.path.length; i++) {
      const l = this.path[i].distanceTo(this.path[i - 1]);
      this.lens.push(l);
      total += l;
    }
    this.total = total;
    this.dist = 0;
    this.speed = speed;
    this.active = true;
    this.hover = null;
    this.searchTarget = opts.searchTarget || null;
    this.group.visible = true;
    this.spot.intensity = opts.spot === false ? 0 : 260;
    this.cone.visible = opts.spot !== false;
    this.onDone = opts.onDone || null;
    if (!this.sound) this.sound = this.G.audio.startHeli();
    this.pointAt(0);
  }

  // Fica parado no ar (cenas finais).
  hoverAt(x, y, z, yaw = 0) {
    this.active = true;
    this.path = null;
    this.hover = { x, y, z, yaw };
    this.group.visible = true;
    this.spot.intensity = 220;
    this.cone.visible = true;
    if (!this.sound) this.sound = this.G.audio.startHeli();
  }

  // Sobrevoos automáticos de tempos em tempos (cidade abandonada).
  setAuto(routes, every = [80, 140]) {
    this.auto = { routes, every, t: lerp(every[0], every[1], Math.random()) * 0.5 };
  }

  pointAt(d) {
    let rest = d;
    for (let i = 0; i < this.lens.length; i++) {
      if (rest <= this.lens[i] || i === this.lens.length - 1) {
        const k = clamp(rest / this.lens[i], 0, 1);
        _v.lerpVectors(this.path[i], this.path[i + 1], k);
        _w.subVectors(this.path[i + 1], this.path[i]).normalize();
        return;
      }
      rest -= this.lens[i];
    }
  }

  update(dt) {
    const G = this.G;
    if (!this.active && this.auto) {
      this.auto.t -= dt;
      if (this.auto.t <= 0) {
        const a = this.auto;
        a.t = lerp(a.every[0], a.every[1], Math.random());
        const r = a.routes[Math.floor(Math.random() * a.routes.length)];
        this.flyover(r, 22 + Math.random() * 6);
      }
    }
    if (!this.active) return;
    this.t += dt;
    let yaw;
    if (this.hover) {
      const h = this.hover;
      this.group.position.set(h.x + Math.sin(this.t * 0.7) * 0.6, h.y + Math.sin(this.t * 1.1) * 0.4, h.z);
      yaw = h.yaw;
      this.group.rotation.set(Math.sin(this.t * 0.9) * 0.03, yaw, Math.sin(this.t * 0.6) * 0.03);
    } else {
      this.dist += this.speed * dt;
      if (this.dist >= this.total) {
        this.active = false;
        this.group.visible = false;
        this.spot.intensity = 0;
        if (this.sound) {
          G.audio.stopHeli(this.sound);
          this.sound = null;
        }
        const cb = this.onDone;
        this.onDone = null;
        if (cb) cb();
        return;
      }
      this.pointAt(this.dist);
      this.group.position.copy(_v);
      yaw = Math.atan2(_w.x, _w.z);
      this.group.rotation.set(0.12, yaw, Math.sin(this.t * 0.5) * 0.08);
    }
    this.rotor.rotation.y += dt * 38;
    this.tail.rotation.x += dt * 60;
    const blink = Math.sin(this.t * 6) > 0.6;
    for (const l of this.navLights) l.visible = blink;
    // holofote varrendo o chão à frente
    const p = this.group.position;
    const sx = this.searchTarget ? this.searchTarget.x : p.x + Math.sin(yaw) * 14 + Math.sin(this.t * 0.9) * 10;
    const sz = this.searchTarget ? this.searchTarget.z : p.z + Math.cos(yaw) * 14 + Math.cos(this.t * 0.7) * 10;
    this.spot.position.set(p.x, p.y - 1, p.z);
    this.spot.target.position.set(sx, 0, sz);
    this.spot.target.updateMatrixWorld();
    // orienta o cone visível na direção do holofote
    _v.set(sx - p.x, -p.y, sz - p.z).normalize();
    this.cone.parent.updateMatrixWorld(true);
    const inv = new THREE.Quaternion();
    this.group.getWorldQuaternion(inv).invert();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), _v);
    this.cone.quaternion.copy(inv.multiply(q));
    if (this.sound) G.audio.setHeli(this.sound, p);
  }
}
