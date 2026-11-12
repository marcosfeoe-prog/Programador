// Nível V — o último posto: um posto de gasolina no meio do campo ao anoitecer,
// cobertura com neon, bombas acesas, postes com fios e uma nuvem enorme pegando fogo.
import * as THREE from 'three';
import { Level } from '../game/level.js';
import { Grass, makeMask } from '../engine/grass.js';
import { groundMaterial, std, glow, additive, blobMaterial } from '../engine/materials.js';
import { ground, box, roundBox, merge, paint, tf, cylinder, tube, boxUV, wire } from '../engine/geo.js';
import * as TX from '../engine/textures.js';
import { rng } from '../engine/noise.js';
import { utilityPole, roundTreeGeo } from './props.js';
import { instanced } from './util.js';

export const META = {
  id: 'posto',
  numeral: 'V',
  name: 'o último posto',
  line: 'a última parada antes de acordar.',
};

function pumpScreen(lines, bg = '#9fd8ff', fg = '#1a2a5a') {
  const c = TX.makeCanvas(128, 96);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = fg;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, 64, 30 + i * 22));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Level5 extends Level {
  heightAt(x, z) {
    return this.onPad(x, z) ? 0.08 : 0;
  }
  onPad(x, z) {
    return Math.abs(x) < 16 && z > -19 && z < 9;
  }
  surfaceAt(x, z) {
    if (z < -19.5 && z > -28.5) return 'asphalt';
    if (this.onPad(x, z)) return 'concrete';
    return 'grass';
  }

  build() {
    const q = this.ctx.quality;
    const rand = rng(505);
    this.spawn = { x: -8.5, z: 17, yaw: -0.38 };
    this.bounds = { x: 0, z: -10, r: 190 };
    this.titleCam = { from: [-9.5, 1.5, 19], to: [-7.5, 1.6, 15], yaw: -0.36, pitch: 0.1, dur: 80 };
    this.env = {
      sky: {
        zenith: '#3c60c8',
        horizon: '#b4b2dc',
        ground: '#6a5a50',
        horizonSun: '#ffb08c',
        horizonSunAmt: 0.5,
        skyExp: 0.42,
        sunElev: -4,
        sunAzim: 62,
        sunColor: '#ff9a7a',
        sunGlow: 0.28,
        sunGlowPow: 5,
        cloudCover: 0.16,
        cloudSoft: 0.07,
        cloudScale: 2.2,
        cloudThick: 0.3,
        cloudShape: 0.3,
        cloudSteps: 6,
        cloudOpacity: 0.7,
        cloudLightK: 8,
        cloudBright: 0.9,
        cloudLit: '#ff9ec2',
        cloudLit2: '#ffc0a0',
        cloudShade: '#7a6ab8',
        band: [25, 7, 14, 1],
        bandSpan: 1.15,
        bandGlow: 1.7,
        bandLit: '#ffa63d',
        bandLit2: '#ff5c98',
        bandShade: '#9a6ab8',
        skyFog: 3000,
        skyHaze: 0.22,
      },
      atmo: {
        fogColor: '#a8a8da',
        fogSunColor: '#ffb090',
        fogSunAmount: 0.35,
        fogBase: 0.0016,
        airFalloff: 1 / 220,
        fogGround: 0.0012,
        fogFalloff: 0.3,
        wind: [0.7, 0.5, 0.55],
      },
      sun: { color: '#ff9c90', intensity: 1.1, elev: 5, azim: 62 },
      hemi: { sky: '#7e92e0', ground: '#6a5a3a', intensity: 0.5 },
      envIntensity: 0.95,
      exposure: 1.05,
      shadowExtent: 38,
      memoryColor: '#ffe0f0',
      post: {
        bloom: 0.1,
        bloomTint: '#ffe2ee',
        haze: 0.03,
        edgeBlur: 0.24,
        ca: 0.0038,
        grain: 0.045,
        vignette: 0.32,
        vigColor: '#1a1030',
        sat: 1.14,
        contrast: 1.03,
        split: 0.04,
        tintShadow: '#22309a',
        tintHigh: '#ffe0d8',
        lift: '#120c22',
        gain: '#fff8ff',
        leak: 0.05,
        leakColor: '#ffb0d0',
      },
      music: 'posto',
    };

    // campo e chão
    const ftex = TX.grassGround({ a: '#8a8450', b: '#a8945e', c: '#c8ae78', d: '#6a5a40', seed: 55 });
    const field = groundMaterial({ map: ftex.map, normalMap: ftex.normalMap, roughness: 1, far: '#b09868', farStart: 30, farEnd: 120, farMix: 0.65 });
    this.mesh(ground(5000, 5000, 4, 110, 110), field, { cast: false });
    const at = TX.asphalt(6);
    const asphaltMat = groundMaterial({ map: at.map, normalMap: at.normalMap, roughness: 0.9, color: '#c8c4d8', macro: 0.12, second: 0.5 });
    const roadG = new THREE.BoxGeometry(2000, 0.06, 9, 200, 1, 2);
    boxUV(roadG, 5);
    this.mesh(roadG, asphaltMat, { cast: false }).position.set(0, 0, -24);
    const lineG = [];
    for (let x = -1000; x < 1000; x += 10) lineG.push(tf(box(5, 0.01, 0.13), [x, 0.035, -24]));
    this.mesh(merge(lineG), std('#e8d8a8', { roughness: 0.8 }), { cast: false });
    const ct = TX.concrete(7);
    const conc = groundMaterial({ map: ct.map, normalMap: ct.normalMap, roughness: 0.88, color: '#d8d0d8', macro: 0.1, second: 0.5 });
    const padG = new THREE.BoxGeometry(32, 0.16, 28, 8, 1, 7);
    boxUV(padG, 3);
    this.mesh(padG, conc, { cast: false }).position.set(0, 0, -5);
    const gv = TX.gravel({ a: '#7a7068', b: '#958c80' });
    const gravelMat = groundMaterial({ map: gv.map, normalMap: gv.normalMap, roughness: 1, macro: 0.15 });
    const shoulder = new THREE.BoxGeometry(2000, 0.04, 3, 200, 1, 1);
    boxUV(shoulder, 3);
    this.mesh(shoulder, gravelMat, { cast: false }).position.set(0, 0, -18.4);
    const sh2 = new THREE.BoxGeometry(2000, 0.04, 2.5, 200, 1, 1);
    boxUV(sh2, 3);
    this.mesh(sh2, gravelMat, { cast: false }).position.set(0, 0, -29.6);

    // cobertura do posto
    const CW = 15, CD = 9.5, CY = 4.7, CH = 0.95, cz = -3;
    const white = std('#dcdae4', { roughness: 0.45 });
    const fascia = new THREE.Mesh(roundBox(CW, CH, CD, 0.06, 2), white);
    fascia.position.set(0, CY + CH / 2, cz);
    fascia.castShadow = true;
    this.add(fascia);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.2, CD - 0.2), std('#e8e6ee', { roughness: 0.6 }));
    under.rotation.x = Math.PI / 2;
    under.position.set(0, CY - 0.01, cz);
    this.add(under);
    // neon nas bordas (laranja com halo rosa)
    const neonCore = glow('#ff9a2a', 9);
    const neonPink = glow('#ff58c0', 6);
    const strips = [];
    const pinkStrips = [];
    for (const y of [CY + 0.06, CY + CH - 0.06]) {
      for (const s of [-1, 1]) {
        strips.push(tf(box(CW + 0.06, 0.09, 0.06), [0, y, cz + s * (CD / 2 + 0.02)]));
        strips.push(tf(box(0.06, 0.09, CD + 0.06), [s * (CW / 2 + 0.02), y, cz]));
      }
    }
    for (const s of [-1, 1]) {
      pinkStrips.push(tf(box(CW + 0.03, 0.12, 0.03), [0, CY + CH / 2, cz + s * (CD / 2 + 0.005)]));
      pinkStrips.push(tf(box(0.03, 0.12, CD + 0.03), [s * (CW / 2 + 0.005), CY + CH / 2, cz]));
    }
    this.mesh(merge(strips), neonCore, { cast: false });
    this.mesh(merge(pinkStrips), neonPink, { cast: false });
    // painéis de luz embaixo
    const panelMat = glow('#f4f8ff', 5.5);
    const panels = [];
    for (let i = -2; i <= 2; i++) for (const zz of [-2.2, 2.2]) panels.push(tf(box(1.6, 0.04, 0.9), [i * 2.8, CY - 0.03, cz + zz]));
    this.mesh(merge(panels), panelMat, { cast: false });
    this.neon = { core: neonCore, pink: neonPink, panel: panelMat };
    // pilares e ilhas
    const islands = [];
    const pillars = [];
    for (const iz of [cz - 2.3, cz + 2.3]) {
      islands.push(tf(roundBox(8, 0.22, 1.3, 0.05, 1), [0, 0.11 + 0.08, iz]));
      for (const px of [-3.6, 3.6]) {
        pillars.push(tf(roundBox(0.38, CY, 0.38, 0.03, 1), [px, CY / 2, iz]));
        this.rect(px, iz, 0.45, 0.45);
      }
      this.rect(0, iz, 8, 1.3);
    }
    this.mesh(merge(islands), std('#c8c0c4', { roughness: 0.8, map: ct.map }), {});
    this.mesh(merge(pillars), white, {});
    // bombas
    const pumpBody = std('#f6f4f6', { roughness: 0.35 });
    const pumpRed = std('#e0476c', { roughness: 0.4 });
    const pumpDark = std('#2c2a32', { roughness: 0.5 });
    const hoseMat = std('#1e1e22', { roughness: 0.7 });
    const msgs = [['GASOLINA', 'R$ 0,00'], ['OLÁ', 'DE NOVO'], ['VOCÊ', 'VOLTOU'], ['ALCOOL', '--,--']];
    this.screens = [];
    let pi = 0;
    for (const iz of [cz - 2.3, cz + 2.3]) {
      for (const px of [-1.7, 1.7]) {
        const g = new THREE.Group();
        g.position.set(px, 0.3, iz);
        const body = new THREE.Mesh(roundBox(1.0, 1.85, 0.6, 0.06, 2), pumpBody);
        body.position.y = 0.93;
        body.castShadow = true;
        g.add(body);
        for (const s of [-1, 1]) {
          const red = new THREE.Mesh(roundBox(1.02, 0.5, 0.05, 0.02, 1), pumpRed);
          red.position.set(0, 0.45, s * 0.3);
          g.add(red);
          const scr = pumpScreen(msgs[pi % msgs.length]);
          const sm = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffffff', emissiveMap: scr, emissiveIntensity: 2.2, roughness: 0.2 });
          const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), sm);
          screen.position.set(0, 1.42, s * 0.305);
          if (s < 0) screen.rotation.y = Math.PI;
          g.add(screen);
          this.screens.push(sm);
          const top = new THREE.Mesh(roundBox(1.04, 0.34, 0.66, 0.05, 2), pumpRed);
          top.position.y = 2.0;
          g.add(top);
          const hose = new THREE.Mesh(tube([[0.42, 1.2, s * 0.32], [0.62, 0.7, s * 0.5], [0.55, 0.25, s * 0.45], [0.48, 0.9, s * 0.36]], 0.025, 20, 6), hoseMat);
          g.add(hose);
          const noz = new THREE.Mesh(roundBox(0.08, 0.22, 0.12, 0.02, 1), pumpDark);
          noz.position.set(0.45, 1.05, s * 0.35);
          g.add(noz);
        }
        this.add(g);
        pi++;
      }
    }
    // luzes da cobertura
    for (const sx of [-3.5, 3.5]) {
      const sp = new THREE.SpotLight('#f2f4ff', 70, 18, 1.1, 0.9, 1.3);
      sp.position.set(sx, CY - 0.1, cz);
      sp.target.position.set(sx, 0, cz);
      this.add(sp, sp.target);
    }
    const pinkGlow = new THREE.PointLight('#ff6ac0', 6, 16, 1.6);
    pinkGlow.position.set(0, CY + 0.4, cz + CD / 2 + 0.6);
    this.add(pinkGlow);
    this.pinkGlow = pinkGlow;

    // postes e fios
    const poles = [];
    const addPole = (x, z, ry, h = 11) => {
      const p = utilityPole({ height: h });
      p.group.position.set(x, 0, z);
      p.group.rotation.y = ry;
      this.add(p.group);
      this.circle(x, z, 0.2);
      const tips = p.tips.map((t) => t.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ry).add(new THREE.Vector3(x, 0, z)));
      poles.push(tips);
      return tips;
    };
    const wireMat = std('#1c1a20', { roughness: 0.6 });
    const wires = [];
    let prev = null;
    for (let x = -360; x <= 360; x += 48) {
      const tips = addPole(x, -31.5, 0, 11 + rand() * 0.6);
      if (prev) for (let i = 0; i < 3; i++) wires.push(wire(prev[i].toArray(), tips[i].toArray(), 1.1 + rand() * 0.3, 0.014));
      prev = tips;
    }
    // poste perto do início (como na foto) ligado à linha da estrada
    const near = addPole(-9.8, 7, Math.PI / 2, 11.5);
    const roadPole = addPole(-9.8, -31.5, Math.PI / 2, 11.2);
    for (let i = 0; i < 3; i++) wires.push(wire(near[i].toArray(), roadPole[i].toArray(), 1.5, 0.014));
    wires.push(wire(near[3].toArray(), [-3, 5.1, -7.5], 1.0, 0.012));
    const far = addPole(-9.8, 52, Math.PI / 2, 11.5);
    for (let i = 0; i < 3; i++) wires.push(wire(near[i].toArray(), far[i].toArray(), 1.6, 0.014));
    this.mesh(merge(wires), wireMat, { cast: false });

    // arbustos e árvores atrás do posto
    const bushGeo = roundTreeGeo(2.4, 1.6, rand, '#2e3f2a');
    const treeGeo = roundTreeGeo(7, 3, rand, '#34472e');
    const vegMat = std('#ffffff', { vertexColors: true, roughness: 0.92 });
    const bushes = [];
    for (let i = 0; i < 22; i++) bushes.push({ x: -20 + i * 1.9 + (rand() - 0.5), z: -16.5 - rand() * 2.5, s: 0.7 + rand() * 0.6, ry: rand() * 6, sy: 0.6 + rand() * 0.4 });
    for (let i = 0; i < 30; i++) {
      const x = -120 + rand() * 240, z = -40 - rand() * 160;
      bushes.push({ x, z, s: 0.8 + rand() * 1.2, ry: rand() * 6 });
    }
    this.add(instanced(bushGeo, vegMat, bushes));
    const trees = [];
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2, r = 70 + rand() * 260;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 10;
      if (z < -16 && z > -34) continue;
      trees.push({ x, z, s: 0.7 + rand() * 0.8, ry: rand() * 6 });
    }
    this.add(instanced(treeGeo, vegMat, trees));

    // capim alto dourado e flores cor-de-rosa
    const mask = makeMask([-90, -70, 180, 160], (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(-16.6, -20.5, 33.2, 30.2);
      ctx.fillRect(-1000, -31.2, 2000, 13.4);
    }, 1024);
    const wheat = new Grass({
      profile: 'wheat',
      tile: 10,
      slots: q.grassSlots,
      density: 20 * q.grassDensity,
      height: [0.45, 0.95],
      width: [0.03, 0.05],
      base: '#5a5236',
      tip: '#c9b07a',
      dry: '#d8c48e',
      head: '#b89a66',
      dryAmount: 0.6,
      ao: 0.4,
      lean: 0.35,
      patch: 0.4,
      seed: 15,
      sss: '#ffb080',
    });
    wheat.setMask(mask);
    this.grass.push(wheat);
    this.add(wheat.group);
    const flowers = new Grass({
      profile: 'flower',
      cross: true,
      tile: 10,
      slots: Math.max(3, q.grassSlots - 2),
      density: 2 * q.grassDensity,
      height: [0.5, 0.95],
      width: [0.03, 0.045],
      base: '#3a4a2a',
      tip: '#6a8a4a',
      dry: '#6a8a4a',
      head: '#f2849c',
      head2: '#ffa6b8',
      dryAmount: 0,
      ao: 0.5,
      lean: 0.2,
      patch: 0.3,
      clump: 0.74,
      clumpScale: 0.22,
      seed: 25,
      sss: '#ff80b0',
    });
    flowers.setMask(mask);
    this.grass.push(flowers);
    this.add(flowers.group);
    // tufo denso de flores bem na frente (composição da foto)
    const front = [];
    for (let i = 0; i < 110; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 3.0;
      front.push([-5.6 + Math.cos(a) * r * 1.5, 12.6 + Math.sin(a) * r]);
    }
    const fg = [];
    for (const [x, z] of front) {
      const h = 0.6 + rand() * 0.55;
      const stem = paint(new THREE.CylinderGeometry(0.008, 0.012, h * 0.55, 4), '#4a6a3a');
      tf(stem, [x, h * 0.275, z]);
      fg.push(stem);
      // espiga fofa: bolinhas empilhadas que afinam para cima
      const col = rand() < 0.5 ? '#f2849c' : '#ffa6b8';
      const nb = 7;
      for (let k = 0; k < nb; k++) {
        const t = k / nb;
        const r = 0.035 * (1 - t * 0.7) * (0.8 + rand() * 0.4);
        const bl = paint(new THREE.IcosahedronGeometry(r, 0), col, 0.12, rand);
        tf(bl, [x + (rand() - 0.5) * 0.03, h * 0.55 + t * h * 0.42, z + (rand() - 0.5) * 0.03], [rand() * 3, rand() * 3, 0], [1, 1.5, 1]);
        fg.push(bl);
      }
    }
    const fgMesh = this.mesh(merge(fg), std('#ffffff', { vertexColors: true, roughness: 0.7 }), { cast: false });
    this.flowerPatch = fgMesh;

    this.memoryDefs = [
      { x: -1.7, y: 1.5, z: -3, theme: 'sunset', caption: 'fim de tarde', line: 'o céu ficava dessa cor e ninguém dizia nada.' },
      { x: -24, y: 1.2, z: 22, theme: 'flowers', caption: 'flores do caminho', line: 'você colhia para alguém que nem lembra mais.' },
      { x: 48, y: 1.3, z: -30, theme: 'family', caption: 'todos juntos', line: 'a foto saiu tremida. mas era o melhor dia.' },
    ];
    // um canteiro de flores em volta da segunda lembrança
    for (let i = 0; i < 120; i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * 2.5;
      front.push([-24 + Math.cos(a) * r, 22 + Math.sin(a) * r]);
    }
    this.door = { x: 0, z: -400, yaw: 0, beam: false };
    this.sounds = [
      { type: 'neon', x: 0, y: CY + 0.5, z: cz, gain: 0.7 },
      { type: 'crickets', x: -20, y: 0.4, z: 20, gain: 0.55 },
      { type: 'crickets', x: 25, y: 0.4, z: 10, gain: 0.45 },
      { type: 'crickets', x: -10, y: 0.4, z: -40, gain: 0.35 },
      { type: 'hum', x: -12.5, y: 10.5, z: 9, gain: 0.25 },
    ];
    this.trigger(-4, 6, 4, (g) => g.whisper('o posto está aberto. não tem ninguém.'));
    this.endReady = false;
    this.endT = 0;
    this.onUpdate((dt, t, game) => {
      const k = this.endReady ? 1 + Math.min(this.endT, 3) * 1.2 : 1;
      const flick = 0.92 + 0.08 * Math.sin(t * 60) * Math.sin(t * 3.1);
      this.neon.core.emissiveIntensity = 9 * k * flick;
      this.neon.pink.emissiveIntensity = 6 * k * (0.9 + 0.1 * Math.sin(t * 2));
      this.neon.panel.emissiveIntensity = 5.5 * (this.endReady ? 1 + this.endT * 1.5 : 1);
      this.pinkGlow.intensity = 6 * k;
      for (const s of this.screens) s.emissiveIntensity = 2.2 * (0.95 + 0.05 * Math.sin(t * 7));
      if (!this.endReady || game.state !== 'play') return;
      const p = game.player.pos;
      const inside = Math.abs(p.x) < 5.5 && Math.abs(p.z - cz) < 3.8;
      if (inside) this.endT += dt;
      else this.endT = Math.max(0, this.endT - dt * 0.5);
      game.wobble = Math.min(1, this.endT / 2.5) * 0.6;
      if (this.endT > 2.8 && !this.ended) {
        this.ended = true;
        game.nextLevel();
      }
    });
  }

  onAllCollected(game) {
    this.endReady = true;
    game.whisper('fique debaixo da luz.');
    if (game.audio) game.audio.doorAppear({ worldPos: new THREE.Vector3(0, 3, -3) });
  }
}
