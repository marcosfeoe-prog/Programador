// Efeitos visuais: partículas (sangue, poeira, água, lascas de madeira, fumaça),
// manchas de sangue no chão (rastro para seguir a presa ferida), traçantes e virotes
// cravados no chão, nas árvores e nos dinossauros.
import * as THREE from 'three';
import { makeBoltMesh } from './player/gunmodels.js';

const MAX_P = 2500;
const MAX_DECALS = 500;

export class FX {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    // ---- partículas
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 4);
    this.pSize = new Float32Array(MAX_P);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 } }]),
      vertexShader: /* glsl */ `
        attribute vec4 color;
        attribute float size;
        uniform float uScale;
        varying vec4 vC;
        #include <fog_pars_vertex>
        void main() {
          vC = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * uScale / max(0.1, -mvPosition.z);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC;
        #include <fog_pars_fragment>
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.25, 0.12, r));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.parts = [];
    this.uScale = mat.uniforms.uScale;

    // ---- manchas no chão
    const dg = new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2);
    const dm = new THREE.MeshLambertMaterial({ color: 0x6a0c0a, transparent: true, opacity: 0.78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.decals = new THREE.InstancedMesh(dg, dm, MAX_DECALS);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    scene.add(this.decals);
    this.decalN = 0;
    this.decalList = [];

    // ---- traçantes
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.03, 0.03, 1);
    tg.translate(0, 0, -0.5);
    this.tracerGeo = tg;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

    // ---- virotes cravados
    this.stuck = [];
    this.boltProto = makeBoltMesh();
    this.boltProto.scale.setScalar(1.2);

    // luz do clarão do tiro no mundo
    this.flash = new THREE.PointLight(0xffb060, 0, 18, 1.8);
    scene.add(this.flash);
    this.flashT = 0;
  }

  spawn(p, v, color, alpha, size, life, grav = 9.8, drag = 1.5) {
    if (this.parts.length >= MAX_P) this.parts.shift();
    this.parts.push({ p: p.clone(), v: v.clone(), c: color, a: alpha, s: size, life, t: 0, g: grav, drag });
  }

  blood(point, dir, amount = 1) {
    const n = Math.round(14 * amount) + 4;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2).multiplyScalar(1.5 + Math.random() * 2.5);
      if (dir) v.addScaledVector(dir, 2 + Math.random() * 3);
      const dark = 0.35 + Math.random() * 0.4;
      this.spawn(point, v, [0.45 * dark, 0.02, 0.015], 0.95, 0.05 + Math.random() * 0.07 * amount, 0.5 + Math.random() * 0.6, 9.8, 1.2);
    }
    // névoa vermelha
    for (let i = 0; i < 4; i++) this.spawn(point, new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8), [0.35, 0.02, 0.02], 0.45, 0.35 + amount * 0.2, 0.6, -0.3, 2.5);
  }

  dust(point, color = [0.42, 0.36, 0.26], amount = 1) {
    for (let i = 0; i < 10 * amount; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 2.4, (Math.random() - 0.5) * 1.6);
      this.spawn(point, v, color, 0.85, 0.06 + Math.random() * 0.08, 0.4 + Math.random() * 0.4, 9.8, 1);
    }
    for (let i = 0; i < 3 * amount; i++) this.spawn(point, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6), color, 0.5, 0.35 + Math.random() * 0.3, 1.2, -0.2, 1.8);
  }

  splash(point) {
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 1.5);
      this.spawn(point, v, [0.75, 0.82, 0.85], 0.8, 0.05 + Math.random() * 0.06, 0.7, 9.8, 0.6);
    }
  }

  chips(point, dir) {
    for (let i = 0; i < 10; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2).addScaledVector(dir, -2);
      this.spawn(point, v, [0.45, 0.32, 0.2], 0.95, 0.04 + Math.random() * 0.04, 0.6, 9.8, 1);
    }
  }

  // poeira levantada pelos passos dos dinossauros grandes
  stomp(point, big) {
    for (let i = 0; i < (big ? 14 : 4); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 0.3 + Math.random() * 0.8, Math.sin(a) * (1 + Math.random() * 2));
      this.spawn(point, v, [0.48, 0.42, 0.32], 0.35, big ? 0.5 + Math.random() * 0.5 : 0.25, 1.2, -0.1, 2.2);
    }
  }

  muzzleSmoke(point, dir) {
    for (let i = 0; i < 5; i++) this.spawn(point, dir.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3(0, 0.4, 0)), [0.7, 0.7, 0.68], 0.25, 0.12 + Math.random() * 0.1, 0.9, -0.3, 2.5);
    this.flash.position.copy(point);
    this.flashT = 0.06;
  }

  bloodDrop(x, z, size = 0.18) {
    const y = this.world.height(x, z) + 0.03;
    const n = new THREE.Vector3();
    this.world.hf.normal(x, z, n);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28));
    const s = size * (0.6 + Math.random() * 0.8);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, 1, s * (0.6 + Math.random() * 0.5)));
    const i = this.decalN % MAX_DECALS;
    this.decals.setMatrixAt(i, m);
    this.decalN++;
    this.decals.count = Math.min(MAX_DECALS, this.decalN);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  tracer(from, vel) {
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    m.position.copy(from);
    m.lookAt(from.clone().add(vel));
    m.rotateY(Math.PI);
    m.scale.set(1, 1, 7);
    m.frustumCulled = false;
    this.scene.add(m);
    this.tracers.push({ m, v: vel.clone(), t: 0 });
  }

  // virote cravado (alvo: objeto 3D opcional para acompanhar, ex.: osso do dino)
  stick(point, dir, follow) {
    const b = this.boltProto.clone();
    b.position.copy(point).addScaledVector(dir, 0.18);
    b.lookAt(point.clone().add(dir));
    b.rotateY(Math.PI);
    this.scene.add(b);
    const rec = { m: b, t: 0, follow };
    if (follow) {
      // guarda a posição relativa ao osso
      rec.local = follow.toLocal(b.position.clone(), b.quaternion.clone());
    }
    this.stuck.push(rec);
    if (this.stuck.length > 40) {
      const o = this.stuck.shift();
      this.scene.remove(o.m);
    }
  }

  update(dt, camera) {
    // partículas
    const P = this.parts;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) {
        P.splice(i, 1);
        continue;
      }
      q.v.y -= q.g * dt;
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.g > 0) {
        const gy = this.world.height(q.p.x, q.p.z);
        if (q.p.y < gy) {
          q.p.y = gy + 0.01;
          q.v.set(0, 0, 0);
        }
      }
    }
    for (const q of P) {
      if (n >= MAX_P) break;
      const f = q.t / q.life;
      this.pPos[n * 3] = q.p.x;
      this.pPos[n * 3 + 1] = q.p.y;
      this.pPos[n * 3 + 2] = q.p.z;
      this.pCol[n * 4] = q.c[0];
      this.pCol[n * 4 + 1] = q.c[1];
      this.pCol[n * 4 + 2] = q.c[2];
      this.pCol[n * 4 + 3] = q.a * (1 - f * f);
      this.pSize[n] = q.s * (q.g < 0.5 ? 1 + f * 2.5 : 1);
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    if (camera) this.uScale.value = (window.innerHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    // traçantes
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      t.m.position.addScaledVector(t.v, dt);
      if (t.t > 0.35) {
        this.scene.remove(t.m);
        this.tracers.splice(i, 1);
      }
    }
    // virotes presos em ossos acompanham a animação
    for (const s of this.stuck) {
      s.t += dt;
      if (s.follow) {
        const r = s.follow.fromLocal(s.local);
        if (r) {
          s.m.position.copy(r.pos);
          s.m.quaternion.copy(r.quat);
        }
      }
    }
    this.flashT -= dt;
    this.flash.intensity = this.flashT > 0 ? 10 : 0;
  }

  removeFollowing(owner) {
    for (let i = this.stuck.length - 1; i >= 0; i--) {
      if (this.stuck[i].follow && this.stuck[i].follow.owner === owner) {
        this.scene.remove(this.stuck[i].m);
        this.stuck.splice(i, 1);
      }
    }
  }
}
