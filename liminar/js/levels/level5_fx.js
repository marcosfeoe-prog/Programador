// Nível 5 — efeitos: vapor vazando das válvulas (partículas) e sons
// sintetizados (festa abafada do outro lado da parede, chiado de vapor).
import * as THREE from 'three';
import { DSP } from '../audio.js';
import { textCanvasTex } from '../textures.js';

// ------------------------------------------------------------ vapor
const PER = 26; // partículas por vazamento

export class Steam {
  // jets: [{ x, y, z, dx, dy, dz }] — origem e direção do jato
  constructor(scene, jets) {
    this.jets = jets.map((j) => ({ ...j, on: true }));
    const n = jets.length * PER;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.age[i] = Math.random() * 2;
      this.life[i] = 0.001;
      this.pos[i * 3 + 1] = -100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('age', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.tex = textCanvasTex(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { map: { value: this.tex }, uColor: { value: new THREE.Color(0.5, 0.48, 0.45) } },
      ]),
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float age;
        varying float vA;
        float aT;
        #include <fog_pars_vertex>
        void main() {
          vA = alpha;
          aT = age;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_PointSize = ( 0.3 + 1.6 * aT ) * 300.0 / max( 0.5, -mvPosition.z );
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uColor;
        varying float vA;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D( map, gl_PointCoord ).a * vA * 0.16;
          gl_FragColor = vec4( uColor, a );
          #include <fog_fragment>
        }`,
      fog: true,
      transparent: true,
      depthWrite: false,
    });
    this.mat.uniforms.map.value = this.tex; // merge() clonou a textura; usa a original (liberada no dispose)
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this.scene = scene;
  }

  setOn(i, on) {
    this.jets[i].on = on;
  }

  // light: brilho do ambiente (0..1) para o vapor não "acender" no escuro
  update(dt, light) {
    const a = this.points.geometry.attributes.alpha;
    const ag = this.points.geometry.attributes.age;
    const P = this.pos;
    const V = this.vel;
    for (let j = 0; j < this.jets.length; j++) {
      const J = this.jets[j];
      for (let k = 0; k < PER; k++) {
        const i = j * PER + k;
        this.age[i] += dt;
        if (this.age[i] >= this.life[i]) {
          if (!J.on) {
            a.array[i] = 0;
            continue;
          }
          // renasce no bico do vazamento
          this.age[i] = 0;
          this.life[i] = 0.9 + Math.random() * 1.1;
          P[i * 3] = J.x;
          P[i * 3 + 1] = J.y;
          P[i * 3 + 2] = J.z;
          const s = 2.2 + Math.random() * 1.6;
          V[i * 3] = J.dx * s + (Math.random() - 0.5) * 0.9;
          V[i * 3 + 1] = J.dy * s + (Math.random() - 0.2) * 0.8;
          V[i * 3 + 2] = J.dz * s + (Math.random() - 0.5) * 0.9;
        }
        // arrasto e empuxo (sobe devagar)
        const drag = Math.exp(-2.2 * dt);
        V[i * 3] *= drag;
        V[i * 3 + 1] = V[i * 3 + 1] * drag + 0.5 * dt;
        V[i * 3 + 2] *= drag;
        P[i * 3] += V[i * 3] * dt;
        P[i * 3 + 1] += V[i * 3 + 1] * dt;
        P[i * 3 + 2] += V[i * 3 + 2] * dt;
        const t = this.age[i] / this.life[i];
        a.array[i] = Math.max(0, Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * (1 - t));
        ag.array[i] = t;
      }
    }
    a.needsUpdate = true;
    ag.needsUpdate = true;
    this.points.geometry.attributes.position.needsUpdate = true;
    const k = 0.35 + Math.min(1, light) * 0.65;
    this.mat.uniforms.uColor.value.setRGB(0.62 * k, 0.6 * k, 0.56 * k);
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

// ------------------------------------------------------------ sons
// Festa abafada atrás da parede: murmúrio de muitas vozes (ruído em formantes
// com ritmo de sílabas), risadas, taças e um piano distante; tudo passado por
// um passa-baixas forte, como se viesse através da alvenaria.
export function makePartyBuffer() {
  const { SR, biquad, noise, normalize } = DSP;
  const n = Math.floor(SR * 11);
  const out = new Float32Array(n);
  for (let v = 0; v < 10; v++) {
    const f = 220 + Math.random() * 520;
    const src = biquad(noise(n), 'bp', f, 2.5);
    const src2 = biquad(noise(n), 'bp', f * (1.8 + Math.random() * 0.6), 3);
    let ph = Math.random() * 6;
    const rate = 3.2 + Math.random() * 2.4;
    // períodos de fala e de silêncio de cada voz
    let gate = Math.random() < 0.5 ? 1 : 0;
    let gt = Math.random() * 2;
    let g = gate;
    const amp = 0.4 + Math.random() * 0.6;
    for (let i = 0; i < n; i++) {
      ph += (2 * Math.PI * rate * (0.8 + 0.4 * Math.sin(i / SR + v))) / SR;
      gt -= 1 / SR;
      if (gt <= 0) {
        gate = gate ? 0 : 1;
        gt = gate ? 0.8 + Math.random() * 2.5 : 0.3 + Math.random() * 1.6;
      }
      g += (gate - g) * 0.0006;
      const syl = Math.pow(Math.max(0, Math.sin(ph)), 1.5);
      out[i] += (src[i] + src2[i] * 0.5) * syl * g * amp;
    }
  }
  // risadas: pulsos "ha-ha-ha" descendo de tom
  for (let k = 0; k < 4; k++) {
    const t0 = Math.floor((0.5 + Math.random() * 9.5) * SR);
    const f = 500 + Math.random() * 300;
    const len = Math.floor((0.7 + Math.random() * 0.6) * SR);
    const src = biquad(noise(len), 'bp', f, 4);
    for (let i = 0; i < len && t0 + i < n; i++) {
      const t = i / SR;
      const p = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 5.5)), 2);
      out[t0 + i] += src[i] * p * Math.exp(-t * 1.8) * 2.2;
    }
  }
  // taças tilintando
  for (let k = 0; k < 6; k++) {
    const t0 = Math.floor(Math.random() * 10.5 * SR);
    const f = 2200 + Math.random() * 1800;
    for (let i = 0; i < SR * 0.4 && t0 + i < n; i++) {
      const t = i / SR;
      out[t0 + i] += Math.sin(t * f * Math.PI * 2) * Math.exp(-t * 14) * 0.25;
    }
  }
  // piano: acordes graves, lentos
  const chords = [
    [146.8, 174.6, 220],
    [130.8, 164.8, 196],
    [123.5, 146.8, 185],
    [110, 138.6, 164.8],
  ];
  for (let b = 0; b < 8; b++) {
    const t0 = Math.floor(b * 1.35 * SR);
    for (const f of chords[b % 4]) {
      for (let i = 0; i < SR * 1.3 && t0 + i < n; i++) {
        const t = i / SR;
        out[t0 + i] += (Math.sin(t * f * Math.PI * 2) + 0.3 * Math.sin(t * f * 4 * Math.PI)) * Math.exp(-t * 2.2) * 0.12;
      }
    }
  }
  // através da parede
  let y = biquad(out, 'lp', 650, 0.7);
  y = biquad(y, 'lp', 900, 0.6);
  // entrada e saída suaves
  const fade = SR * 1.2;
  for (let i = 0; i < n; i++) y[i] *= Math.min(1, i / fade, (n - i) / fade);
  return normalize(y, 0.8);
}

// Chiado contínuo de vapor escapando (laço de 2 s).
export function makeSteamBuffer() {
  const { SR, biquad, noise, normalize } = DSP;
  const n = SR * 2;
  let y = biquad(noise(n), 'hp', 1400, 0.7);
  y = biquad(y, 'lp', 7000, 0.7);
  for (let i = 0; i < n; i++) y[i] *= 0.85 + 0.15 * Math.sin((i / SR) * Math.PI * 2 * 7.5);
  return normalize(y, 0.7);
}
