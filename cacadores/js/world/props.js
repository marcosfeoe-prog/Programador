// Objetos do campo: postes e fios de energia, cavalos-de-pau de petróleo, moinhos de vento,
// turbinas eólicas, pivôs centrais, silos-bolsa, placas de cidade e a água (rios e mar).

import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { WORLD } from '../config.js';
import { patchWorld } from '../render/materials.js';
import { signTexture } from '../render/textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function mat(params, key) {
  return patchWorld(new THREE.MeshStandardMaterial({ roughness: 0.8, ...params }), { key });
}

export class Props {
  constructor(world, seed) {
    this.world = world;
    this.rng = new RNG(seed);
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.animated = [];
    this.poles = [];
  }

  build(registry, textures) {
    const w = this.world;
    const c = w.country;
    this.powerLines(registry);
    if (c.props.pumpjack) this.pumpjacks(c.props.pumpjack, registry);
    if (c.props.windmills) this.windmills(c.props.windmills, registry);
    if (c.props.windfarm) this.windfarm(c.props.windfarm, registry);
    if (c.props.pivot) this.pivots(c.props.pivot, registry);
    if (c.props.siloBags) this.siloBags();
    this.signs(textures);
    this.water();
    return this.group;
  }

  // ---------------------------------------------------------------- energia
  powerLines(registry) {
    const w = this.world;
    const rng = this.rng.fork('power');
    const spans = [];
    for (const r of w.roads.roads) {
      const main = r.type === 'highway' || r.type === 'paved' || (r.type === 'gravel' && rng.chance(0.12)) || (r.type === 'street' && rng.chance(0.4));
      if (!main) continue;
      const side = rng.sign() * (r.def.width / 2 + (r.type === 'street' ? 3 : 10));
      let acc = 0;
      let last = null;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i];
        const b = r.pts[i + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        acc += L;
        const spacing = r.type === 'street' ? 40 : 70;
        if (acc < spacing) continue;
        acc = 0;
        const dx = (b[0] - a[0]) / L;
        const dz = (b[1] - a[1]) / L;
        const x = b[0] - dz * side;
        const z = b[1] + dx * side;
        if (w.terrain.waterAt(x, z) || Math.abs(x) > WORLD.half - 20 || Math.abs(z) > WORLD.half - 20) {
          last = null;
          continue;
        }
        const pole = { x, z, y: w.terrain.heightAt(x, z), ang: Math.atan2(dx, dz), h: 10.5, lean: 0, leanDir: 0, state: 0 };
        this.poles.push(pole);
        if (last) spans.push([last, pole]);
        last = pole;
      }
    }
    // Postes instanciados.
    const poleGeo = new THREE.CylinderGeometry(0.13, 0.17, 1, 6);
    poleGeo.translate(0, 0.5, 0);
    const armGeo = new THREE.BoxGeometry(2.4, 0.12, 0.12);
    const wood = mat({ color: '#5a4636' }, 'pole');
    const N = this.poles.length;
    this.poleMesh = new THREE.InstancedMesh(poleGeo, wood, Math.max(1, N));
    this.armMesh = new THREE.InstancedMesh(armGeo, wood, Math.max(1, N));
    this.poleMesh.castShadow = true;
    this.poles.forEach((p, i) => {
      p.idx = i;
      this.updatePole(p);
      p.struct = registry.add({ kind: 'pole', di: 'pole', x: p.x, z: p.z, y: p.y, r: 1, h: p.h, pole: p, minor: true });
    });
    this.poleMesh.count = this.armMesh.count = N;
    this.group.add(this.poleMesh, this.armMesh);
    // Fios: 3 condutores com catenária.
    const SEG = 6;
    const pos = new Float32Array(spans.length * 3 * SEG * 2 * 3);
    this.spans = spans;
    let o = 0;
    for (const [a, b] of spans) {
      a.spans = a.spans || [];
      b.spans = b.spans || [];
      a.spans.push(o);
      b.spans.push(o);
      o += 3 * SEG * 2 * 3;
    }
    this.wirePos = pos;
    this.wireGeo = new THREE.BufferGeometry();
    this.wireGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    spans.forEach((s, k) => this.writeSpan(k));
    this.wireGeo.computeBoundingSphere();
    // Fios somem com a distância (uma linha de 1 px seria forte demais ao longe).
    const wireMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uCol: { value: new THREE.Color(0.02, 0.02, 0.02) } },
      vertexShader: 'varying float vD; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; varying float vD; void main() { float a = clamp(1.0 - (vD - 60.0) / 260.0, 0.0, 1.0) * 0.8; if (a < 0.01) discard; gl_FragColor = vec4(uCol, a); }',
    });
    const wire = new THREE.LineSegments(this.wireGeo, wireMat);
    this.wires = wire;
    this.group.add(wire);
  }

  updatePole(p) {
    _e.set(0, p.ang, 0);
    _q.setFromEuler(_e);
    if (p.lean) {
      const ql = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(p.leanDir), 0, -Math.sin(p.leanDir)), p.lean);
      _q.premultiply(ql);
    }
    const h = p.state >= 2 ? p.h * 0.3 : p.h;
    _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, h, 1));
    this.poleMesh.setMatrixAt(p.idx, _m);
    if (p.state >= 2) _m.makeScale(0, 0, 0);
    else {
      const top = new THREE.Vector3(0, h - 0.6, 0).applyQuaternion(_q);
      _m.compose(_p.set(p.x + top.x, p.y + top.y, p.z + top.z), _q, _s.set(1, 1, 1));
    }
    this.armMesh.setMatrixAt(p.idx, _m);
    this.poleMesh.instanceMatrix.needsUpdate = true;
    this.armMesh.instanceMatrix.needsUpdate = true;
  }

  writeSpan(k) {
    const [a, b] = this.spans[k];
    const SEG = 6;
    let o = k * 3 * SEG * 2 * 3;
    const down = a.state >= 1 || b.state >= 1;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L;
    const nz = dx / L;
    for (let w = 0; w < 3; w++) {
      const off = (w - 1) * 1.0;
      const ya = a.state >= 2 ? a.y + 0.3 : a.y + a.h - 0.5;
      const yb = b.state >= 2 ? b.y + 0.3 : b.y + b.h - 0.5;
      for (let s = 0; s < SEG; s++) {
        for (const t of [s / SEG, (s + 1) / SEG]) {
          const x = a.x + dx * t + nx * off;
          const z = a.z + dz * t + nz * off;
          let y = ya + (yb - ya) * t - Math.sin(Math.PI * t) * (down ? 7 : 1.2);
          if (down) y = Math.max(this.world.terrain.heightAt(x, z) + 0.1, y);
          this.wirePos[o++] = x;
          this.wirePos[o++] = y;
          this.wirePos[o++] = z;
        }
      }
    }
  }

  // Poste danificado: inclina (1) ou quebra (2); fios caem.
  damagePole(p, state, windDir) {
    if (state <= p.state) return false;
    p.state = state;
    p.lean = state === 1 ? 0.35 : 1.2;
    p.leanDir = windDir;
    this.updatePole(p);
    for (let k = 0; k < this.spans.length; k++) {
      const [a, b] = this.spans[k];
      if (a === p || b === p) this.writeSpan(k);
    }
    this.wireGeo.attributes.position.needsUpdate = true;
    return true;
  }

  // ---------------------------------------------------------------- petróleo
  pumpjacks(n, registry) {
    const w = this.world;
    const rng = this.rng.fork('pump');
    const steel = mat({ color: '#3a3e44', metalness: 0.5, roughness: 0.5 }, 'pj');
    const yellow = mat({ color: '#c89a2a', metalness: 0.3, roughness: 0.6 }, 'pj2');
    for (let k = 0; k < n; k++) {
      const x = rng.range(-WORLD.half + 400, WORLD.half - 400);
      const z = rng.range(-WORLD.half + 400, WORLD.half - 400);
      if (!w.land.isOpenField(x, z) || w.roads.query(x, z, 30)) continue;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 7), steel);
      base.position.y = 0.3;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.5, 0.5), steel);
      post.position.set(0, 2.6, 0);
      const beam = new THREE.Group();
      beam.position.set(0, 5, 0);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 7.5), yellow);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 12, 1, false, 0, Math.PI), yellow);
      head.rotation.z = Math.PI / 2;
      head.rotation.y = Math.PI / 2;
      head.position.z = 3.8;
      beam.add(bar, head);
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 1.2), steel);
      crank.position.set(0, 1.8, -3.2);
      g.add(base, post, beam, crank);
      g.position.set(x, w.terrain.heightAt(x, z), z);
      g.rotation.y = rng.range(0, Math.PI * 2);
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      const phase = rng.range(0, 10);
      this.animated.push((t) => {
        beam.rotation.x = Math.sin(t * 1.1 + phase) * 0.28;
        crank.rotation.x = t * 1.1 + phase;
      });
      registry.add({ kind: 'pumpjack', di: 'pivot', x, z, y: g.position.y, r: 4, h: 6, object: g, minor: true });
    }
  }

  // ---------------------------------------------------------------- moinhos (molinos)
  windmills(n, registry) {
    const w = this.world;
    const rng = this.rng.fork('mill');
    const steel = mat({ color: '#9aa0a6', metalness: 0.6, roughness: 0.45 }, 'mill');
    const tankMat = mat({ color: '#8a8e92', metalness: 0.5, roughness: 0.5 }, 'tank');
    for (let k = 0; k < n; k++) {
      const x = rng.range(-WORLD.half + 300, WORLD.half - 300);
      const z = rng.range(-WORLD.half + 300, WORLD.half - 300);
      const s = w.land.surfaceAt(x, z);
      if (s.kind !== 'field' || s.info.forest || w.roads.query(x, z, 25)) continue;
      const g = new THREE.Group();
      const H = 10;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, H + 0.2, 4), steel);
        leg.position.set(Math.cos(a) * 0.9, H / 2, Math.sin(a) * 0.9);
        leg.rotation.z = -Math.cos(a) * 0.08;
        leg.rotation.x = Math.sin(a) * 0.08;
        g.add(leg);
      }
      const rotor = new THREE.Group();
      rotor.position.set(0, H + 0.3, 0.4);
      for (let i = 0; i < 18; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.5, 0.02), steel);
        blade.position.y = 1.0;
        const holder = new THREE.Group();
        holder.rotation.z = (i / 18) * Math.PI * 2;
        blade.rotation.y = 0.4;
        holder.add(blade);
        rotor.add(holder);
      }
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 1.6), steel);
      tail.position.set(0, H + 0.3, -1.4);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 18, 1, true), tankMat);
      tank.position.set(4, 0.8, 1);
      g.add(rotor, tail, tank);
      g.position.set(x, w.terrain.heightAt(x, z), z);
      const yaw = rng.range(0, Math.PI * 2);
      g.rotation.y = yaw;
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      const spd = rng.range(1.5, 3);
      this.animated.push((t, wind) => {
        rotor.rotation.z = t * spd * (0.3 + Math.min(1.5, wind / 8));
      });
      registry.add({ kind: 'windmill', di: 'pivot', x, z, y: g.position.y, r: 3, h: H, object: g, minor: true });
    }
  }

  windfarm(def, registry) {
    const w = this.world;
    const rng = this.rng.fork('farm');
    const white = mat({ color: '#e8eaec', roughness: 0.5 }, 'wt');
    this.turbines = [];
    for (let k = 0; k < def.n; k++) {
      const x = def.x + (k % 4) * 520 + rng.range(-80, 80) - 780;
      const z = def.z + Math.floor(k / 4) * 600 + rng.range(-80, 80) - 600;
      if (w.roads.query(x, z, 40) || w.terrain.waterAt(x, z)) continue;
      const g = new THREE.Group();
      const H = 80;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, H, 12), white);
      tower.position.y = H / 2;
      const nac = new THREE.Mesh(new THREE.BoxGeometry(3, 3.2, 10), white);
      nac.position.set(0, H + 1.5, -1.5);
      const rotor = new THREE.Group();
      rotor.position.set(0, H + 1.5, 3.8);
      const hub = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), white);
      rotor.add(hub);
      for (let i = 0; i < 3; i++) {
        const holder = new THREE.Group();
        holder.rotation.z = (i / 3) * Math.PI * 2;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.2, 44, 0.35), white);
        blade.geometry.translate(0, 22, 0);
        blade.scale.x = 0.7;
        holder.add(blade);
        rotor.add(holder);
      }
      g.add(tower, nac, rotor);
      g.position.set(x, w.terrain.heightAt(x, z), z);
      g.rotation.y = rng.range(-0.2, 0.2) + Math.PI;
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      const ph = rng.range(0, 6);
      const t = { g, rotor, broken: false };
      this.turbines.push(t);
      this.animated.push((time, wind) => {
        if (!t.broken) rotor.rotation.z = ph + time * Math.min(1.6, 0.25 + wind * 0.06);
      });
      registry.add({ kind: 'turbine', di: 'turbine', x, z, y: g.position.y, r: 6, h: H + 45, object: g, turbine: t });
    }
  }

  pivots(n, registry) {
    const w = this.world;
    const rng = this.rng.fork('pivot');
    const steel = mat({ color: '#b8bcc0', metalness: 0.6, roughness: 0.4 }, 'piv');
    for (let k = 0; k < n * 3; k++) {
      const x = rng.range(-WORLD.half + 800, WORLD.half - 800);
      const z = rng.range(-WORLD.half + 800, WORLD.half - 800);
      if (!w.land.isOpenField(x, z) || w.roads.query(x, z, 200)) continue;
      const g = new THREE.Group();
      const L = 360;
      const center = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 8), steel);
      center.position.y = 2.5;
      g.add(center);
      const arm = new THREE.Group();
      g.add(arm);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, L, 6), steel);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(L / 2, 4.2, 0);
      arm.add(pipe);
      for (let t = 50; t <= L; t += 52) {
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 4), steel);
        a.position.set(t, 2.2, 0);
        const wh1 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 10), steel);
        wh1.rotation.x = Math.PI / 2;
        wh1.position.set(t, 0.7, 0);
        arm.add(a, wh1);
      }
      g.position.set(x, w.terrain.heightAt(x, z), z);
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
      const sp = rng.range(0.004, 0.01);
      const ph = rng.range(0, 6);
      this.animated.push((t) => (arm.rotation.y = ph + t * sp));
      registry.add({ kind: 'pivot', di: 'pivot', x, z, y: g.position.y, r: 30, h: 5, object: g, minor: true });
      if (--n <= 0) break;
    }
  }

  siloBags() {
    const w = this.world;
    const rng = this.rng.fork('bags');
    const geo = new THREE.CylinderGeometry(1.4, 1.4, 1, 14, 1);
    geo.rotateZ(Math.PI / 2);
    geo.scale(1, 0.8, 1);
    const m = mat({ color: '#eceeed', roughness: 0.35 }, 'bag');
    const items = [];
    for (const farm of w.settlements.farms) {
      if (rng.next() > 0.6) continue;
      const n = rng.int(1, 4);
      const ang = rng.range(0, Math.PI);
      for (let k = 0; k < n; k++) {
        const x = farm.x + Math.cos(ang + Math.PI / 2) * (60 + k * 4.5) + rng.range(-3, 3);
        const z = farm.z + Math.sin(ang + Math.PI / 2) * (60 + k * 4.5);
        if (!w.land.isOpenField(x, z)) continue;
        items.push([x, z, ang, rng.range(50, 80)]);
      }
    }
    const inst = new THREE.InstancedMesh(geo, m, Math.max(1, items.length));
    items.forEach(([x, z, a, L], i) => {
      _e.set(0, a, 0);
      _q.setFromEuler(_e);
      _m.compose(_p.set(x, w.terrain.heightAt(x, z) + 0.9, z), _q, _s.set(L, 1, 1));
      inst.setMatrixAt(i, _m);
    });
    inst.count = items.length;
    inst.castShadow = true;
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  signs(textures) {
    const w = this.world;
    const list = w.roads.citySigns(w.settlements.cities);
    const postMat = mat({ color: '#8a8e92', metalness: 0.5 }, 'post');
    const cache = new Map();
    for (const s of list) {
      let m = cache.get(s.city.name);
      if (!m) {
        const tex = signTexture(w.country.welcome(s.city.name), w.country.signStyle);
        m = patchWorld(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }), { key: 'sign' });
        cache.set(s.city.name, m);
      }
      const g = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 0.08), [postMat, postMat, postMat, postMat, m, postMat]);
      panel.position.y = 2.6;
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), postMat);
      p1.position.set(-1.2, 1.3, -0.06);
      const p2 = p1.clone();
      p2.position.x = 1.2;
      g.add(panel, p1, p2);
      g.position.set(s.x, w.terrain.heightAt(s.x, s.z), s.z);
      g.rotation.y = s.faceAng;
      g.traverse((o) => (o.castShadow = true));
      this.group.add(g);
    }
  }

  // ---------------------------------------------------------------- água
  water() {
    const w = this.world;
    const mat = waterMaterial();
    this.waterMat = mat;
    for (const rv of w.terrain.rivers) {
      const pts = rv.water;
      if (!pts || pts.length < 2) continue;
      const pos = [];
      const idx = [];
      const W = rv.width * 0.5 + 6;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const tx = b[0] - a[0];
        const tz = b[2] - a[2];
        const tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl;
        const nz = tx / tl;
        pos.push(pts[i][0] + nx * W, pts[i][1], pts[i][2] + nz * W, pts[i][0] - nx * W, pts[i][1], pts[i][2] - nz * W);
        if (i < pts.length - 1) {
          const o = i * 2;
          idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.name = 'river';
      this.group.add(m);
    }
    if (w.terrain.cfg.ocean !== undefined) {
      const g = new THREE.PlaneGeometry(90000, 160000, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set(w.terrain.cfg.ocean - 45000 + 3000, 0, 0);
      m.name = 'ocean';
      this.group.add(m);
    }
  }

  update(t, wind) {
    for (const f of this.animated) f(t, wind);
    if (this.waterMat) this.waterMat.uniforms.uTime.value = t;
  }
}

export function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSkyZ: { value: new THREE.Color(0.2, 0.3, 0.45) },
      uSkyH: { value: new THREE.Color(0.5, 0.55, 0.6) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uDeep: { value: new THREE.Color(0.02, 0.035, 0.035) },
      uRain: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSkyZ, uSkyH, uSunDir, uSunCol, uDeep;
      uniform float uRain;
      varying vec3 vW;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      float wave(vec2 p) {
        return n(p * 0.08 + uTime * 0.05) * 0.6 + n(p * 0.31 - uTime * 0.11) * 0.3 + n(p * 1.3 + uTime * 0.3) * 0.1 * (1.0 + uRain * 3.0);
      }
      void main() {
        vec2 p = vW.xz;
        float e = 0.6;
        float c = wave(p);
        vec3 nrm = normalize(vec3(-(wave(p + vec2(e, 0)) - c) * 3.0, 1.0, -(wave(p + vec2(0, e)) - c) * 3.0));
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, nrm);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, nrm), 0.0), 5.0);
        vec3 sky = mix(uSkyH, uSkyZ, clamp(R.y * 1.6, 0.0, 1.0));
        float spec = pow(max(dot(R, uSunDir), 0.0), 380.0) * 30.0;
        vec3 col = mix(uDeep, sky, fres) + uSunCol * spec;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
