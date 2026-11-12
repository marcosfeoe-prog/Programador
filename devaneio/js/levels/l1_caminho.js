// Nível I — o caminho rosa: campo infinito, uma calçada rosa até o horizonte,
// um poste aceso de dia, uma TV chiando na grama e um balanço que balança sozinho.
import * as THREE from 'three';
import { Level } from '../game/level.js';
import { Grass, makeMask } from '../engine/grass.js';
import { groundMaterial, std, blobMaterial } from '../engine/materials.js';
import { ground, box, boxUV } from '../engine/geo.js';
import * as TX from '../engine/textures.js';
import { lampPost, crtTV, swingSet } from './props.js';
import { injectAtmo } from '../engine/atmosphere.js';

export const META = {
  id: 'caminho',
  numeral: 'I',
  name: 'o caminho rosa',
  line: 'a grama sussurra o seu nome.',
};

export class Level1 extends Level {
  build() {
    const q = this.ctx.quality;
    this.spawn = { x: 0.1, z: 6, yaw: 0 };
    this.bounds = { x: 0, z: -60, r: 240 };

    this.env = {
      sky: {
        zenith: '#7aa0c4',
        horizon: '#b8c7d3',
        ground: '#6a6f52',
        horizonSun: '#f1d9d6',
        horizonSunAmt: 0.35,
        skyExp: 0.6,
        sunElev: 38,
        sunAzim: -35,
        sunColor: '#fff3ea',
        sunDisc: 0,
        sunGlow: 0.25,
        sunGlowPow: 10,
        cloudCover: 0.4,
        cloudSoft: 0.07,
        cloudScale: 2.3,
        cloudThick: 0.32,
        cloudShape: 0.3,
        cloudSteps: 7,
        cloudOpacity: 1,
        cloudLightK: 10,
        cloudBright: 1.2,
        cloudCurve: 0.09,
        cloudWind: [0.004, 0.0015],
        cloudLit: '#fff3f6',
        cloudLit2: '#fbeccd',
        cloudShade: '#7b829f',
        skyFog: 4000,
        skyHaze: 0.14,
      },
      atmo: {
        fogColor: '#d6d6dc',
        fogSunColor: '#f6dfe0',
        fogSunAmount: 0.35,
        fogBase: 0.0007,
        airFalloff: 1 / 320,
        fogGround: 0.0009,
        fogFalloff: 0.3,
        wind: [0.85, 0.5, 0.55],
      },
      sun: { color: '#fff1ea', intensity: 2.2 },
      hemi: { sky: '#c9d2e6', ground: '#6a6448', intensity: 0.35 },
      envIntensity: 0.9,
      exposure: 0.88,
      post: {
        bloom: 0.08,
        bloomTint: '#fff0f6',
        haze: 0.03,
        edgeBlur: 0.22,
        ca: 0.003,
        grain: 0.04,
        vignette: 0.3,
        vigColor: '#2a2030',
        sat: 0.96,
        contrast: 1.02,
        split: 0.06,
        tintShadow: '#3a2a55',
        tintHigh: '#ffe0ea',
        lift: '#0e0a12',
        gain: '#fffcff',
        leak: 0.07,
        leakColor: '#ffb3d1',
      },
      music: 'caminho',
    };

    // chão
    const gtex = TX.grassGround({ a: '#4a5830', b: '#5e5b35', c: '#8b8058', d: '#5b4d3b', seed: 11 });
    const gm = groundMaterial({
      map: gtex.map,
      normalMap: gtex.normalMap,
      normalScale: 0.8,
      roughness: 1,
      far: '#4b5430',
      farStart: 30,
      farEnd: 140,
      farMix: 0.8,
      macro: 0.2,
      macroScale: 0.02,
    });
    this.mesh(ground(6000, 6000, 5, 120, 120), gm, { cast: false });

    // calçada rosa até o horizonte
    const ctex = TX.concrete(3);
    const pathMat = new THREE.MeshStandardMaterial({
      color: '#f6bddc',
      map: ctex.map,
      normalMap: ctex.normalMap,
      roughness: 0.82,
      metalness: 0,
    });
    pathMat.onBeforeCompile = (sh) => {
      injectAtmo(sh);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  float jz = abs(fract(vPW.z / 3.0 + 0.5) - 0.5) * 3.0;
  float fw = max(fwidth(vPW.z), 0.002);
  float joint = 1.0 - smoothstep(0.004, 0.004 + fw * 1.5, jz);
  diffuseColor.rgb *= 1.0 - joint * 0.45 * (1.0 - smoothstep(30.0, 120.0, length(vPW.xz - cameraPosition.xz)));
  float edge = smoothstep(0.62, 0.9, abs(vPW.x));
  diffuseColor.rgb *= 1.0 - edge * 0.12;
  diffuseColor.rgb *= 0.94 + 0.12 * fract(sin(floor(vPW.z / 3.0) * 12.9898) * 43758.5453);`
        );
    };
    pathMat.customProgramCacheKey = () => 'path-l1';
    const PATH_LEN = 3000;
    const pathGeo = new THREE.BoxGeometry(1.8, 0.1, PATH_LEN, 1, 1, 300);
    boxUV(pathGeo, 2);
    const path = this.mesh(pathGeo, pathMat, { cast: false });
    path.position.set(0, 0.03, 20 - PATH_LEN / 2);

    // grama (sem crescer em cima da calçada)
    const mask = makeMask([-6, -3000, 12, 3100], (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(-0.98, -3000, 1.96, 3100);
    }, 512);
    const grass = new Grass({
      tile: 10,
      slots: q.grassSlots,
      density: 42 * q.grassDensity,
      height: [0.1, 0.21],
      width: [0.04, 0.075],
      base: '#202c10',
      tip: '#56692e',
      dry: '#7a7350',
      dryAmount: 0.4,
      ao: 0.45,
      sss: '#26300e',
      seed: 3,
      patch: 0.18,
    });
    grass.setMask(mask);
    this.grass.push(grass);
    this.add(grass.group);
    // tufos mais altos espalhados
    const tufts = new Grass({
      tile: 12,
      slots: Math.max(3, q.grassSlots - 2),
      density: 0.35 * q.grassDensity,
      height: [0.28, 0.55],
      width: [0.02, 0.04],
      base: '#2f3519',
      tip: '#78744a',
      dry: '#958863',
      dryAmount: 0.7,
      seed: 9,
      patch: 0.8,
      lean: 0.45,
    });
    tufts.setMask(mask);
    this.grass.push(tufts);
    this.add(tufts.group);

    // poste de luz
    const lamp = lampPost({ height: 7.6, arm: 1.6, glow: 4 });
    lamp.group.position.set(-2.4, 0, -46);
    this.add(lamp.group);
    this.circle(-2.4, -46, 0.25);
    this.lampPos = new THREE.Vector3(-2.4 + 1.8, 7.9, -46);
    const blob = TX.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), blobMaterial(blob, 0.45));
    lb.rotation.x = -Math.PI / 2;
    lb.position.set(-2.4, 0.02, -46);
    this.add(lb);

    // TV de tubo na grama
    const tv = crtTV();
    tv.group.position.set(-34, 0, -27);
    tv.group.rotation.y = 0.9;
    this.add(tv.group);
    this.rect(-34, -27, 0.7, 0.7, 0.9);
    this.tv = tv;
    const tb = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), blobMaterial(blob, 0.5));
    tb.rotation.x = -Math.PI / 2;
    tb.position.set(-34, 0.02, -27);
    this.add(tb);
    this.onUpdate((dt, t) => tv.update(dt, t));
    this.tvLight = new THREE.PointLight('#ffc6e0', 0.6, 5, 2);
    this.tvLight.position.set(-33.6, 0.5, -26.6);
    this.add(this.tvLight);

    // balanço sozinho
    const sw = swingSet();
    sw.group.position.set(31, 0, -63);
    sw.group.rotation.y = -0.4;
    this.add(sw.group);
    for (const [lx, lz] of [[-1.3, -0.7], [-1.3, 0.7], [1.3, -0.7], [1.3, 0.7]]) {
      const c = Math.cos(-0.4), s = Math.sin(-0.4);
      this.circle(31 + lx * c + lz * s, -63 - lx * s + lz * c, 0.08);
    }
    this.onUpdate((dt, t) => sw.update(dt, t));
    this.swingPos = new THREE.Vector3(31, 0, -63);

    // lembranças
    this.memoryDefs = [
      { x: -33.2, y: 1.25, z: -26.4, theme: 'tv', caption: 'sábado de manhã, 1998', line: 'o cheiro de cereal e o barulho da TV ligada.' },
      { x: 31.3, y: 1.3, z: -62.2, theme: 'swing', caption: 'o balanço do quintal', line: 'você ia tão alto que achava que dava para voar.' },
      { x: 0, y: 1.4, z: -98, theme: 'cake', caption: '7 anos', line: 'alguém cantou parabéns. você não lembra quem.' },
    ];
    this.door = { x: 0, z: -150, yaw: 0, frame: '#f6f0f3', leaf: '#f8f2f5' };

    // sons localizados
    this.sounds = [
      { type: 'hum', x: -0.6, y: 7.8, z: -46, gain: 0.5 },
      { type: 'static', x: -34, y: 0.4, z: -27, gain: 0.35 },
      { type: 'creak', x: 31, y: 1.5, z: -63, gain: 0.6, period: 2 * Math.PI / 1.15 },
    ];

    // frases que aparecem pelo caminho
    this.trigger(0, -30, 6, (g) => g.whisper('você já esteve aqui antes?'));
    this.trigger(0, -120, 8, (g) => g.whisper('o caminho continua mesmo quando você para.'));
  }

  surfaceAt(x) {
    return Math.abs(x) < 0.95 ? 'concrete' : 'grass';
  }
}
