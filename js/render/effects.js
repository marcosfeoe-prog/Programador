// Efeitos de sobreposição (chuva, detritos finos girando no tornado, clarões
// elétricos) e relâmpagos. Os efeitos de sobreposição testam a profundidade da
// cena manualmente, pois são desenhados depois da composição das nuvens.
import * as THREE from 'three';
import { RNG } from '../util/math.js';

const DEPTH_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
float sceneViewZ() {
  float d = texture2D(tDepth, gl_FragCoord.xy / uRes).x;
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
`;

function depthUniforms(shared) {
  return {
    tDepth: shared.tDepth,
    uRes: shared.uRes,
    uNear: shared.uNear,
    uFar: shared.uFar,
  };
}

function quadGeometry(count, attrs) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  for (const [name, size, fn] of attrs) {
    const a = new Float32Array(count * size);
    for (let i = 0; i < count; i++) fn(a, i * size, i);
    g.setAttribute(name, new THREE.InstancedBufferAttribute(a, size));
  }
  g.instanceCount = count;
  return g;
}

// ------------------------------------------------------------------ Chuva
export class Rain {
  constructor(scene, count, shared) {
    const rng = new RNG(3);
    const geo = quadGeometry(count, [['aSeed', 4, (a, o) => {
      a[o] = rng.next();
      a[o + 1] = rng.next();
      a[o + 2] = rng.next();
      a[o + 3] = rng.next();
    }]]);
    this.uniforms = {
      ...depthUniforms(shared),
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3() },
      uIntensity: { value: 0 },
      uBox: { value: 34 },
      uColor: { value: new THREE.Color(0.7, 0.72, 0.75) },
      uAlpha: { value: 0.3 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uWind;
        uniform float uIntensity;
        uniform float uBox;
        varying float vA;
        varying float vViewZ;
        varying float vX;
        void main() {
          if (aSeed.w > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float fall = 8.5 + aSeed.z * 3.5;
          vec3 vel = vec3(uWind.x, -fall, uWind.z);
          vec3 p = aSeed.xyz * uBox + vel * uTime;
          p = mod(p - cameraPosition + uBox * 0.5, uBox) + cameraPosition - uBox * 0.5;
          vec3 dir = normalize(vel);
          float len = length(vel) * 0.03;
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam)) * 0.014;
          vec3 wp = p + dir * (position.y - 0.5) * len + side * position.x * 2.0;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vViewZ = -mv.z;
          vX = position.x * 2.0;
          vA = smoothstep(uBox * 0.5, uBox * 0.15, length(p - cameraPosition)) * smoothstep(0.3, 1.2, vViewZ);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${DEPTH_GLSL}
        uniform vec3 uColor;
        uniform float uAlpha;
        varying float vA;
        varying float vViewZ;
        varying float vX;
        void main() {
          if (vViewZ > sceneViewZ()) discard;
          float a = vA * uAlpha * (1.0 - abs(vX));
          gl_FragColor = vec4(uColor, a);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(time, intensity, wind, light) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = intensity;
    u.uWind.value.copy(wind).multiplyScalar(0.7);
    const l = Math.min(1, 0.12 + light * 0.9);
    u.uColor.value.setRGB(0.68 * l, 0.7 * l, 0.74 * l);
    this.mesh.visible = intensity > 0.01;
  }
}

// ------------------------------------------------------------------ Detritos girando
export class DebrisSpecks {
  constructor(scene, count, shared) {
    const rng = new RNG(8);
    const geo = quadGeometry(count, [
      ['aSeed', 4, (a, o) => {
        a[o] = rng.next();
        a[o + 1] = rng.next();
        a[o + 2] = rng.next();
        a[o + 3] = rng.next();
      }],
      ['aSeed2', 4, (a, o) => {
        a[o] = rng.next();
        a[o + 1] = rng.next();
        a[o + 2] = rng.next();
        a[o + 3] = rng.next();
      }],
    ]);
    const axis = [];
    for (let i = 0; i < 6; i++) axis.push(new THREE.Vector2());
    this.uniforms = {
      ...depthUniforms(shared),
      uTime: { value: 0 },
      uBase: { value: new THREE.Vector3() },
      uAxis: { value: axis },
      uH: { value: 400 },
      uR: { value: 50 },
      uDebR: { value: 100 },
      uAmount: { value: 0 },
      uSpin: { value: 0 },
      uLight: { value: 0.5 },
      uFog: shared.uFog,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        attribute vec4 aSeed2;
        uniform float uTime;
        uniform vec3 uBase;
        uniform vec2 uAxis[6];
        uniform float uH;
        uniform float uR;
        uniform float uDebR;
        uniform float uAmount;
        uniform float uSpin;
        varying float vViewZ;
        varying vec2 vQ;
        varying float vShade;
        vec2 cr(vec2 p0, vec2 p1, vec2 p2, vec2 p3, float t) {
          float t2 = t * t, t3 = t2 * t;
          return 0.5 * ((2.0 * p1) + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3);
        }
        vec2 axisAt(float hn) {
          float t = clamp(hn, 0.0, 1.0) * 5.0;
          int i = int(min(floor(t), 4.0));
          float f = t - float(i);
          return cr(uAxis[max(i - 1, 0)], uAxis[i], uAxis[i + 1], uAxis[min(i + 2, 5)], f);
        }
        void main() {
          if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
          float speedUp = 0.025 + aSeed.z * 0.06;
          float h = fract(aSeed.y + uTime * speedUp);
          float maxH = uH * (0.06 + 0.55 * pow(aSeed.z, 2.0));
          float y = pow(h, 1.8) * maxH;
          float r = uDebR * (0.12 + 1.05 * pow(aSeed.x, 1.4)) * (0.8 + 0.6 * h);
          float w = (uR * 1.4) / max(r, uR * 0.6);
          float ang = aSeed2.x * 6.2831 + uSpin * w * (0.8 + 0.4 * aSeed2.w);
          vec2 ax = axisAt(y / uH);
          vec3 c = uBase + vec3(ax.x + cos(ang) * r, y, ax.y + sin(ang) * r);
          float size = mix(0.2, 2.2, pow(aSeed2.y, 3.0));
          float rot = uTime * (2.0 + aSeed2.z * 9.0) + aSeed2.x * 10.0;
          vec2 q = vec2(position.x, position.y - 0.5);
          q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * q * vec2(1.0, 0.25 + aSeed2.z);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += q * size;
          vViewZ = -mv.z;
          vQ = q;
          vShade = 0.6 + aSeed2.w * 0.6;
          // some quando o detrito ainda está no chão
          float fade = smoothstep(0.0, 0.05, h) * smoothstep(1.0, 0.85, h);
          gl_Position = projectionMatrix * mv;
          if (fade < 0.02) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        ${DEPTH_GLSL}
        uniform float uLight;
        uniform vec2 uFog;
        varying float vViewZ;
        varying vec2 vQ;
        varying float vShade;
        void main() {
          if (vViewZ > sceneViewZ()) discard;
          float a = exp(-vViewZ * uFog.x * 2.5);
          vec3 c = vec3(0.09, 0.075, 0.06) * vShade * uLight;
          gl_FragColor = vec4(c, a * 0.95);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(time, t, light) {
    const u = this.uniforms;
    u.uTime.value = time;
    if (!t || t.stage !== 'tornado') {
      u.uAmount.value = Math.max(0, u.uAmount.value - 0.01);
      this.mesh.visible = u.uAmount.value > 0.001;
      return;
    }
    u.uBase.value.copy(t.pos);
    for (let i = 0; i < 6; i++) u.uAxis.value[i].copy(t.axis[i]);
    u.uH.value = t.H;
    u.uR.value = t.rCore;
    u.uDebR.value = t.visual.debrisR * 1.3;
    u.uAmount.value = Math.min(1, t.visual.debris * 0.9);
    u.uSpin.value = t.spin * 0.6;
    u.uLight.value = light;
    this.mesh.visible = true;
  }
}

// ------------------------------------------------------------------ Clarões elétricos (cabos)
export class PowerFlashes {
  constructor(scene, shared) {
    this.uniforms = { ...depthUniforms(shared), uColor: { value: new THREE.Color() }, uI: { value: 0 } };
    this.sprites = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { ...depthUniforms(shared), uColor: { value: new THREE.Color() }, uI: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying float vViewZ;
          void main() {
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float s = length(modelMatrix[0].xyz);
            mv.xy += position.xy * s;
            vViewZ = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          ${DEPTH_GLSL}
          uniform vec3 uColor;
          uniform float uI;
          varying vec2 vUv;
          varying float vViewZ;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float g = exp(-d * d * 6.0) + exp(-d * 18.0) * 2.0;
            float occl = vViewZ - 3.0 > sceneViewZ() ? 0.25 : 1.0;
            gl_FragColor = vec4(uColor * g * uI * occl, 1.0);
          }`,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.visible = false;
      scene.add(m);
      this.sprites.push(m);
    }
  }

  update(flashes) {
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const f = flashes[i];
      if (!f) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.copy(f.pos);
      const flick = 0.5 + 0.5 * Math.sin(f.t * 60 + i) * Math.sin(f.t * 23);
      s.scale.setScalar(40 + f.strength * 110);
      s.material.uniforms.uColor.value.copy(f.color);
      s.material.uniforms.uI.value = flick * (1 - f.t / f.life) * 1.4;
    }
  }
}

// ------------------------------------------------------------------ Relâmpagos
export class Lightning {
  constructor(scene) {
    this.scene = scene;
    this.bolts = [];
    this.rng = new RNG(99);
    this.flash = 0;
    this.flashPos = new THREE.Vector3();
    this.mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(9, 9, 12),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
  }

  strike(x, z, cg, groundY, cloudBase) {
    const r = this.rng;
    this.flashPos.set(x, cg ? cloudBase * 0.7 : cloudBase + r.float(800, 3000), z);
    this.flash = cg ? 1 : r.float(0.4, 0.8);
    this.flashT = 0;
    this.flashDur = r.float(0.25, 0.6);
    this.strokes = r.int(1, 4);
    if (!cg) return;
    const pos = [];
    const segs = [];
    const branch = (start, end, width, depth) => {
      const n = Math.max(6, Math.floor(start.distanceTo(end) / 25));
      let prev = start.clone();
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const p = start.clone().lerp(end, t);
        if (i < n) {
          const j = 28 * (1 - t * 0.6);
          p.x += r.float(-j, j);
          p.z += r.float(-j, j);
          p.y += r.float(-8, 8);
        }
        segs.push([prev.clone(), p.clone(), width]);
        if (depth < 2 && r.chance(0.12)) {
          const e = p.clone().add(new THREE.Vector3(r.float(-160, 160), -r.float(60, 260), r.float(-160, 160)));
          e.y = Math.max(e.y, groundY + 30);
          branch(p, e, width * 0.5, depth + 1);
        }
        prev = p;
      }
    };
    const top = new THREE.Vector3(x + r.float(-200, 200), cloudBase + 40, z + r.float(-200, 200));
    branch(top, new THREE.Vector3(x, groundY, z), 2.2, 0);
    for (const [a, b, w] of segs) {
      const d = b.clone().sub(a);
      const len = d.length();
      d.normalize();
      const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const s1 = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(w);
      const s2 = new THREE.Vector3().crossVectors(d, s1).normalize().multiplyScalar(w);
      for (const s of [s1, s2]) {
        const p0 = a.clone().sub(s);
        const p1 = a.clone().add(s);
        const p2 = b.clone().add(s);
        const p3 = b.clone().sub(s);
        pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
      }
      if (len < 0) break;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    const mesh = new THREE.Mesh(geo, this.mat.clone());
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.bolts.push({ mesh, t: 0, life: this.flashDur });
  }

  update(dt) {
    if (this.flash > 0) {
      this.flashT += dt;
      const k = this.flashT / this.flashDur;
      const strokes = Math.max(1, this.strokes);
      const pulse = Math.max(0, Math.sin(k * Math.PI * strokes * 2)) ** 0.6;
      this.intensity = this.flash * pulse * (1 - k);
      if (k >= 1) {
        this.flash = 0;
        this.intensity = 0;
      }
    } else this.intensity = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      const k = b.t / b.life;
      b.mesh.material.opacity = Math.max(0, 1 - k) * (0.4 + 0.6 * Math.abs(Math.sin(b.t * 45)));
      if (k >= 1) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        b.mesh.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }
}
