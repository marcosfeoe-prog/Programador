// Nível II — deserto infravermelho: areia azul-clara, arbustos magenta, céu rosa e
// placas de aviso que viram para você quando você não está olhando.
import * as THREE from 'three';
import { Level } from '../game/level.js';
import { Grass, makeHeightMap } from '../engine/grass.js';
import { groundMaterial, foliageMaterial, blobMaterial, std } from '../engine/materials.js';
import { ground } from '../engine/geo.js';
import * as TX from '../engine/textures.js';
import { fbm, rng, smooth } from '../engine/noise.js';
import { warningSign } from './props.js';
import { instanced, shrubGeometry, rockGeometry, acaciaGeometry, hillRing, heightfield } from './util.js';

export const META = {
  id: 'deserto',
  numeral: 'II',
  name: 'deserto infravermelho',
  line: 'o sol não se move aqui.',
};

const SIGNS = [
  [2.3, -5.8, 'não olhe para trás.'],
  [-28, -51, 'você já passou por aqui.'],
  [38, -73, 'está quente demais para lembrar.'],
  [-66, 8, 'volte antes que escureça.'],
  [24, 36, 'não há nada aqui. continue.'],
  [-12, -118, 'você está indo bem.'],
  [72, -18, 'cuidado onde pisa.'],
  [-90, -80, 'quem colocou essas placas?'],
];

export class Level2 extends Level {
  heightAt(x, z) {
    const d = Math.hypot(x, z);
    const fall = 1 - smooth(200, 275, d);
    const near = 0.35 + 0.65 * smooth(6, 50, d);
    const n = fbm(x * 0.011 + 3.1, z * 0.011 + 7.7, 4, 21);
    const r = Math.abs(Math.sin(x * 0.018 + z * 0.007 + fbm(x * 0.02, z * 0.02, 2, 5) * 4));
    return (Math.max(0, n - 0.3) * 6.5 + r * 0.6) * fall * near;
  }

  surfaceAt() {
    return 'sand';
  }

  build() {
    const q = this.ctx.quality;
    const rand = rng(202);
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.bounds = { x: 0, z: -30, r: 230 };
    this.titleCam = { from: [0.5, 1.7, 3], to: [0.8, 1.7, -9], yaw: -0.05, pitch: 0.02, dur: 80 };
    this.env = {
      sky: {
        zenith: '#ffbdf0',
        horizon: '#ffb4c6',
        ground: '#8fb6e8',
        horizonSun: '#ffa486',
        horizonSunAmt: 0.8,
        skyExp: 0.55,
        sunElev: 46,
        sunAzim: -62,
        sunColor: '#fff0f4',
        sunDisc: 0,
        sunGlow: 0.35,
        sunGlowPow: 8,
        cloudOpacity: 0,
        skyFog: 4000,
        skyHaze: 0.12,
      },
      atmo: {
        fogColor: '#f9c4dc',
        fogSunColor: '#ffc8b0',
        fogSunAmount: 0.3,
        fogBase: 0.0005,
        airFalloff: 1 / 260,
        fogGround: 0.0003,
        fogFalloff: 0.35,
        wind: [0.9, 0.4, 0.5],
      },
      sun: { color: '#fffafc', intensity: 3.1 },
      hemi: { sky: '#d8d0f4', ground: '#70b0f0', intensity: 0.5 },
      envIntensity: 0.55,
      exposure: 1.02,
      shadowExtent: 34,
      wobble: 0.12,
      memoryColor: '#ffe0f0',
      post: {
        bloom: 0.07,
        bloomTint: '#ffe8f2',
        haze: 0.04,
        edgeBlur: 0.25,
        ca: 0.004,
        grain: 0.045,
        vignette: 0.16,
        vigColor: '#4a2848',
        sat: 1.28,
        contrast: 1.04,
        split: 0.08,
        tintShadow: '#2a3a8a',
        tintHigh: '#ffd2e4',
        lift: '#0a0a1a',
        gain: '#fffaff',
        leak: 0.1,
        leakColor: '#ff9ec0',
      },
      music: 'deserto',
    };

    // dunas e chão distante
    const stex = TX.sand({ a: '#5a9cdc', b: '#88c0ee', c: '#3e7ccc', seed: 21 });
    const gm = groundMaterial({
      map: stex.map,
      normalMap: stex.normalMap,
      normalScale: 1.1,
      roughness: 0.96,
      far: '#84d0dc',
      farStart: 50,
      farEnd: 240,
      farMix: 0.55,
      macro: 0.12,
      macroScale: 0.015,
    });
    const hf = heightfield(560, 170, (x, z) => this.heightAt(x, z), 4);
    this.mesh(hf, gm, { cast: false });
    const far = ground(9000, 9000, 4, 140, 140);
    far.translate(0, -0.3, 0);
    this.mesh(far, gm, { cast: false });

    // morros distantes, cor de pêssego no ar quente
    const hills = hillRing((a, b) => fbm(a, b, 3, 7), { inner: 750, outer: 1600, height: 90, color: '#e9b8b4', seed: 3 });
    this.mesh(hills, std('#ffffff', { vertexColors: true, roughness: 1 }), { cast: false, receive: false });

    // arbustos magenta (cartões de folhagem instanciados)
    const fol = TX.foliageCard({ cols: ['#7c1c48', '#5c1236', '#922656', '#480c2a', '#8a2a5a', '#a8406e'], twig: '#3a1020', seed: 101, dense: 1.5 });
    const shrubMat = foliageMaterial(fol, { sway: 0.05 });
    const shrubGeos = [shrubGeometry(rand, 10, 1.3, 1.0), shrubGeometry(rand, 8, 1.0, 0.8)];
    const pal = ['#d8b8c8', '#c49aac', '#e0b8cc', '#b890a8', '#f0c8d8'];
    const items = [[], []];
    const N = Math.round(320 * (0.5 + q.grassDensity * 0.5));
    const blob = TX.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    const blobItems = [];
    for (let i = 0; i < N; i++) {
      let x, z, tries = 0;
      do {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 230;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r - 30;
        tries++;
      } while ((Math.hypot(x, z) < 4 || fbm(x * 0.03, z * 0.03, 2, 9) < 0.42) && tries < 20);
      const s = 0.55 + Math.pow(rand(), 1.6) * 1.3;
      const y = this.heightAt(x, z);
      items[i % 2].push({ x, y: y - 0.05, z, ry: rand() * 6.28, s, sx: s * (1 + rand() * 0.4), sy: s * (0.6 + rand() * 0.3), color: pal[Math.floor(rand() * pal.length)] });
      blobItems.push({ x, y: y + 0.03, z, s: s * 1.5, ry: rand() * 6.28 });
    }
    // um arbusto bem na frente, como na foto
    items[0].push({ x: -0.6, y: this.heightAt(-0.6, -8) - 0.05, z: -8, ry: 1.2, s: 1.45, color: '#ffffff' });
    items[1].push({ x: -4.5, y: this.heightAt(-4.5, -12) - 0.05, z: -12, ry: 0.4, s: 1.0, color: '#f0d0e0' });
    items[1].push({ x: 4.2, y: this.heightAt(4.2, -9) - 0.05, z: -9, ry: 2.4, s: 0.7, color: '#ffb0d0' });
    items.forEach((it, k) => this.add(instanced(shrubGeos[k], shrubMat, it)));
    const bm = blobMaterial(blob, 0.28);
    const bg = new THREE.PlaneGeometry(1, 1);
    bg.rotateX(-Math.PI / 2);
    this.add(instanced(bg, bm, blobItems, { cast: false, receive: false }));

    // capim seco claro em tufos
    const grass = new Grass({
      tile: 10,
      slots: q.grassSlots,
      density: 30 * q.grassDensity,
      height: [0.15, 0.48],
      width: [0.01, 0.02],
      clump: 0.6,
      clumpScale: 0.35,
      base: '#7aa8b4',
      tip: '#e6f6e8',
      dry: '#f4e8f4',
      dryAmount: 0.3,
      ao: 0.6,
      lean: 0.5,
      patch: 0.95,
      seed: 12,
      sss: '#ffffff',
    });
    this.grass.push(grass);
    this.add(grass.group);
    // o capim acompanha o relevo das dunas
    this.hmap = makeHeightMap((x, z) => this.heightAt(x, z), [-280, -280, 560, 560], 341);
    grass.setHeightMap(this.hmap);

    // pedrinhas e seixos
    const rockG = rockGeometry(rand, 0);
    const rockMat = std('#ffffff', { roughness: 0.75 });
    const rocks = [];
    const rpal = ['#f3f1f8', '#c9d3e8', '#a8c8c0', '#e8d0dc', '#8fb0c2', '#ffffff', '#b0e0d0'];
    for (let i = 0; i < 1400; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 140;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 20;
      const s = 0.03 + Math.pow(rand(), 3) * 0.22;
      rocks.push({ x, y: this.heightAt(x, z) + s * 0.2, z, s, ry: rand() * 6, rx: rand() * 0.5, color: rpal[Math.floor(rand() * rpal.length)] });
    }
    this.add(instanced(rockG, rockMat, rocks, { cast: false }));

    // acácias no horizonte
    const treeGeos = [acaciaGeometry(rand), acaciaGeometry(rand), acaciaGeometry(rand)];
    const treeMat = std('#ffffff', { vertexColors: true, roughness: 0.95 });
    const trees = [[], [], []];
    for (let i = 0; i < 140; i++) {
      const a = rand() * Math.PI * 2;
      const r = 150 + rand() * 300;
      const cl = fbm(Math.cos(a) * 4, Math.sin(a) * 4, 2, 3);
      if (cl < 0.4) continue;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 30;
      trees[i % 3].push({ x, y: this.heightAt(x, z) - 0.2, z, ry: rand() * 6, s: 0.8 + rand() * 0.6 });
    }
    trees.forEach((t, k) => t.length && this.add(instanced(treeGeos[k], treeMat, t, { cast: false })));

    // tufos cor-de-rosa (plantas que no infravermelho ficam rosa-choque)
    const pink = new Grass({
      tile: 10,
      slots: q.grassSlots,
      density: 40 * q.grassDensity,
      height: [0.14, 0.34],
      width: [0.012, 0.022],
      base: '#b03872',
      tip: '#ff8cc8',
      dry: '#ffb0dc',
      dryAmount: 0.4,
      ao: 0.5,
      lean: 0.6,
      patch: 0.3,
      clump: 0.66,
      clumpScale: 0.45,
      seed: 31,
    });
    pink.setHeightMap(this.hmap);
    this.grass.push(pink);
    this.add(pink.group);

    // placas de aviso
    this.signs = [];
    SIGNS.forEach(([x, z, msg], i) => {
      const s = warningSign({});
      const y = this.heightAt(x, z);
      s.group.position.set(x, y - 0.1, z);
      s.group.rotation.y = Math.atan2(-x, -z) + (rand() - 0.5) * 0.6;
      this.add(s.group);
      this.circle(x, z, 0.12);
      this.signs.push({ g: s.group, x, z, msg, seen: false });
      this.trigger(x, z, 5, (game) => game.whisper(msg));
    });
    // placas viram para o jogador quando ele não está olhando
    const frustum = new THREE.Frustum();
    const pm = new THREE.Matrix4();
    const sp = new THREE.Sphere(new THREE.Vector3(), 1.5);
    this.onUpdate((dt, t, game) => {
      if (game.state !== 'play') return;
      const cam = game.camera;
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pm);
      const p = game.player.pos;
      for (const s of this.signs) {
        sp.center.copy(s.g.position);
        sp.center.y += 1.8;
        const vis = frustum.intersectsSphere(sp);
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (!vis && d < 60 && d > 3) s.g.rotation.y = Math.atan2(p.x - s.x, p.z - s.z);
      }
    });

    this.memoryDefs = [
      { x: -26.5, z: -53.5, theme: 'beach', caption: 'praia, verão de 2001', line: 'a areia queimava os pés. você ria mesmo assim.' },
      { x: 40, z: -75.5, theme: 'car', caption: 'viagem longa', line: 'você dormia no banco de trás e acordava em outro lugar.' },
      { x: -68.5, z: 10.5, theme: 'icecream', caption: 'sorvete de morango', line: 'derretia mais rápido do que você conseguia comer.' },
    ];
    for (const m of this.memoryDefs) m.y = this.heightAt(m.x, m.z) + 1.3;
    const dz = -150;
    this.door = { x: 0, z: dz, y: this.heightAt(0, dz) - 0.08, yaw: 0, frame: '#a9c6e0', leaf: '#c4dbee', knob: '#e8d4a0', beamColor: '#ffd0e6' };
    this.doorLine = 'longe, uma porta azul brilha na areia.';
    this.sounds = SIGNS.slice(0, 5).map(([x, z]) => ({ type: 'creak', x, y: 2.2, z, gain: 0.25, period: 7 + rand() * 5 }));
    this.trigger(0, -40, 8, (g) => g.whisper('o calor faz o ar tremer. ou é você?'));
  }
}

