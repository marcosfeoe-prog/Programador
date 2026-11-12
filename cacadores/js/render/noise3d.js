// Textura 3D de ruído (64³, repete sem emendas) usada pelas nuvens e pelo tornado.
// R = Perlin-Worley (cúmulos), G = Worley fbm (erosão), B = Perlin fbm (turbulência),
// A = Perlin fino (detalhe).

import * as THREE from 'three';
import { Noise, worley3, worleyPoints } from '../core/noise.js';
import { RNG } from '../core/rng.js';

export function buildNoise3D(size = 64) {
  const N = size;
  const data = new Uint8Array(N * N * N * 4);
  const perlin = new Noise(1234);
  const rng = new RNG(99);
  const w1 = worleyPoints(4, rng);
  const w2 = worleyPoints(8, rng);
  const w3 = worleyPoints(16, rng);
  const pfbm = (x, y, z, period, oct) => {
    let s = 0;
    let a = 1;
    let n = 0;
    let p = period;
    for (let o = 0; o < oct; o++) {
      s += a * perlin.n3(x * p, y * p, z * p, p);
      n += a;
      a *= 0.5;
      p *= 2;
    }
    return s / n;
  };
  let o = 0;
  for (let k = 0; k < N; k++) {
    const z = k / N;
    for (let j = 0; j < N; j++) {
      const y = j / N;
      for (let i = 0; i < N; i++) {
        const x = i / N;
        const pf = pfbm(x, y, z, 4, 4) * 0.5 + 0.5;
        const wa = 1 - worley3(x * 4, y * 4, z * 4, 4, w1);
        const wb = 1 - worley3(x * 8, y * 8, z * 8, 8, w2);
        const wc = 1 - worley3(x * 16, y * 16, z * 16, 16, w3);
        const wf = wa * 0.625 + wb * 0.25 + wc * 0.125;
        // Perlin-Worley: remapeia o Perlin pelo Worley (formas fofas de cúmulo).
        const pw = Math.min(1, Math.max(0, (pf - (1 - wf)) / (1 - (1 - wf) + 1e-4)));
        const turb = pfbm(x, y, z, 8, 3) * 0.5 + 0.5;
        const fine = pfbm(x, y, z, 16, 2) * 0.5 + 0.5;
        data[o++] = Math.max(0, Math.min(255, (pw * 0.7 + wf * 0.3) * 255));
        data[o++] = Math.max(0, Math.min(255, (wb * 0.6 + wc * 0.4) * 255));
        data[o++] = Math.max(0, Math.min(255, turb * 255));
        data[o++] = Math.max(0, Math.min(255, fine * 255));
      }
    }
  }
  const tex = new THREE.Data3DTexture(data, N, N, N);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
