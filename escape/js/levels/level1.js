// Nível 1 — Zona Habitável: armazém de concreto com caixas e poças.
// As luzes caem de tempos em tempos e os Sorridentes saem do escuro.
// Objetivo: achar 3 fusíveis, religar a energia e pegar o elevador.
import * as THREE from 'three';
import { Grid, FLOOR, WALL, SOLID, buildWalls, buildPlane, LampSystem } from '../grid.js';
import { concrete, concreteFloor, ceilingTiles, lampPanel, crate, panelTex } from '../textures.js';
import { atmosphere, lampGeometry, byDistance, spreadCells, onWall, solidInstanced } from './common.js';
import { audio } from '../audio.js';

export default {
  number: 1,
  name: 'Zona Habitável',
  subtitle: 'Concreto, caixas e o gotejar distante. A energia é instável.',
  ambience: 'warehouse',
  flashScale: 1,
  intro: 'Quando as luzes caírem, desligue a lanterna (F) — os Sorridentes são atraídos pela luz.',

  build(game) {
    const rng = game.rng;
    const W = 60;
    const H = 60;
    const cs = 1.25;
    const WH = 4.2;
    const grid = new Grid(W, H, cs, FLOOR);
    game.grid = grid;
    for (let i = 0; i < W; i++) {
      grid.set(i, 0, WALL);
      grid.set(i, H - 1, WALL);
      grid.set(0, i, WALL);
      grid.set(W - 1, i, WALL);
    }
    // Pilares regulares.
    for (let z = 4; z < H - 2; z += 7) for (let x = 4; x < W - 2; x += 7) grid.set(x, z, WALL);
    // Paredes internas com vãos.
    for (let i = 0; i < 16; i++) {
      const horiz = rng.chance(0.5);
      const len = rng.int(8, 20);
      const x = rng.int(2, W - 3 - (horiz ? len : 0));
      const z = rng.int(2, H - 3 - (horiz ? 0 : len));
      const gap = rng.int(2, len - 3);
      for (let k = 0; k < len; k++) {
        if (k === gap || k === gap + 1) continue;
        grid.set(horiz ? x + k : x, horiz ? z : z + k, WALL);
      }
    }
    // Pilhas de caixas.
    const crates = [];
    for (let i = 0; i < 70; i++) {
      const x = rng.int(2, W - 4);
      const z = rng.int(2, H - 4);
      const w = rng.int(1, 2);
      const d = rng.int(1, 3);
      for (let a = 0; a < w; a++) {
        for (let b = 0; b < d; b++) {
          if (grid.get(x + a, z + b) !== FLOOR) continue;
          grid.set(x + a, z + b, SOLID);
          crates.push([x + a, z + b, rng.int(1, 3)]);
        }
      }
    }
    const sx = 4;
    const sz = H - 4;
    grid.fillRect(sx - 2, sz - 2, sx + 2, sz + 1, FLOOR);
    // Elevador na parede norte, no lado oposto ao início.
    const elX = W - 8;
    const elZ = 1;
    grid.fillRect(elX - 3, elZ, elX + 3, elZ + 3, FLOOR);
    const dist = grid.sealUnreachable(sx, sz);
    for (const c of crates) if (grid.get(c[0], c[1]) !== SOLID) c[2] = 0;

    const hemi = atmosphere(game, { fog: 0x252522, near: 2, far: 36, sky: 0xdfe4e0, ground: 0x2a2826, hemi: 0.75, vmColor: 0xdde2e0, vmIntensity: 1.2 });

    game.scene.add(buildWalls(grid, new THREE.MeshLambertMaterial({ map: concrete() }), { height: WH, texW: 4, texH: 4 }));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: concreteFloor() }), 0, 5));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: ceilingTiles('#6d6b66', 'rgba(30,30,28,0.8)', 33) }), WH, 2.5, false));

    // Caixas (instanciadas).
    const crateGeo = new THREE.BoxGeometry(cs * 0.94, 1.15, cs * 0.94);
    crateGeo.translate(0, 0.575, 0);
    const mats = [];
    for (const [x, z, n] of crates) {
      for (let k = 0; k < n; k++) {
        const m = new THREE.Matrix4().compose(
          grid.center(x, z, k * 1.15),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.float(-0.12, 0.12)),
          new THREE.Vector3(1, 1, 1),
        );
        mats.push(m);
      }
    }
    solidInstanced(game.scene, crateGeo, new THREE.MeshLambertMaterial({ map: crate(71, 'NÍVEL 1') }), mats);

    // Poças d'água.
    const puddles = [];
    const pudMat = new THREE.MeshLambertMaterial({ color: 0x1c2228, transparent: true, opacity: 0.7, emissive: 0x0b0d10 });
    const free = byDistance(dist, grid).filter((c) => c[2] > 3);
    for (const [x, z] of spreadCells(rng, free, 22, 4)) {
      const r = rng.float(0.6, 1.4);
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), pudMat);
      p.rotation.x = -Math.PI / 2;
      p.scale.set(1, rng.float(0.5, 1), 1);
      p.position.copy(grid.center(x, z, 0.01));
      game.scene.add(p);
      puddles.push([p.position, r]);
    }

    const lamps = new LampSystem(game.scene, {
      color: 0xe6f0ff,
      intensity: 7,
      range: 12,
      y: WH - 0.3,
      geometry: lampGeometry(0.35, 1.6),
      material: new THREE.MeshBasicMaterial({ map: lampPanel([235, 245, 255]), toneMapped: false }),
      pool: 6,
    });
    for (let z = 3; z < H; z += 5) {
      for (let x = 3; x < W; x += 5) {
        if (grid.get(x, z) === WALL) continue;
        const r = rng.next();
        lamps.add((x + 0.5) * cs, (z + 0.5) * cs, r < 0.12 ? 'flicker' : r < 0.18 ? 'off' : 'on');
      }
    }
    lamps.finalize(() => 0);
    game.lamps = lamps;

    // ---- Elevador ----
    const elev = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x5b5e60 });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3, emissive: 0x111111 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.2), frameMat);
    top.position.y = 2.65;
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.2), frameMat);
    sideL.position.set(-1.18, 1.4, 0);
    const sideR = sideL.clone();
    sideR.position.x = 1.18;
    const dl = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.5, 0.06), doorMat);
    dl.position.set(-0.53, 1.25, 0.05);
    const dr = dl.clone();
    dr.position.x = 0.53;
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.5), new THREE.MeshBasicMaterial({ color: 0xfff6dd }));
    inside.position.set(0, 1.25, 0.01);
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), new THREE.MeshBasicMaterial({ color: 0x401010 }));
    ind.position.set(0, 2.95, 0.11);
    elev.add(top, sideL, sideR, dl, dr, inside, ind);
    const ea = onWall(grid, elX, elZ, 0, -1, 0, 0.0);
    elev.position.copy(ea.pos);
    elev.rotation.y = ea.rotY;
    game.scene.add(elev);

    // ---- Painel de energia ----
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.18), [
      frameMat, frameMat, frameMat, frameMat,
      new THREE.MeshLambertMaterial({ map: panelTex('ENERGIA') }), frameMat,
    ]);
    const pa = onWall(grid, elX + 3, elZ, 0, -1, 1.4, 0.09);
    panel.position.copy(pa.pos);
    panel.rotation.y = pa.rotY;
    game.scene.add(panel);
    const leds = [];
    for (let i = 0; i < 3; i++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x550000 }));
      led.position.set(-0.18 + i * 0.18, -0.15, 0.1);
      panel.add(led);
      leds.push(led);
    }

    // ---- Fusíveis ----
    let carried = 0;
    let installed = 0;
    let powered = false;
    const reach = byDistance(dist, grid).filter((c) => c[2] > 25);
    const fuseCells = spreadCells(rng, reach, 3, 14, [[elX, elZ]]);
    for (const [x, z] of fuseCells) {
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 10), new THREE.MeshLambertMaterial({ color: 0xe0a020, emissive: 0x3a2000 }));
      body.rotation.z = Math.PI / 2;
      const capA = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 10), new THREE.MeshLambertMaterial({ color: 0xcfcfcf }));
      capA.rotation.z = Math.PI / 2;
      capA.position.x = 0.11;
      const capB = capA.clone();
      capB.position.x = -0.11;
      mesh.add(body, capA, capB);
      game.addPickup('fuse', grid.center(x, z, 0.9), {
        mesh,
        glow: 0xffb040,
        label: 'Pegar fusível',
        onPick: () => {
          carried++;
          game.toast(`Fusível ${carried + installed}/3`);
        },
      });
    }
    game.addInteract({
      pos: panel.position,
      radius: 2.4,
      prompt: () => (carried ? `Instalar fusível (${installed}/3)` : `Painel de energia (${installed}/3 fusíveis)`),
      enabled: () => !powered,
      use: () => {
        if (!carried) {
          audio.locked();
          game.toast('Faltam fusíveis. Procure pelo armazém.');
          return;
        }
        while (carried > 0) {
          carried--;
          leds[installed].material.color.set(0x30ff60);
          installed++;
        }
        audio.clank(0.4);
        if (installed >= 3) {
          powered = true;
          blackout = false;
          lamps.master = 1;
          hemi.intensity = 0.75;
          audio.powerUp();
          setTimeout(() => audio.elevator(), 1200);
          ind.material.color.set(0x30ff60);
          game.toast('Energia restaurada! O elevador abriu.');
        }
      },
    });
    let doorOpen = 0;
    game.addExit({ pos: grid.center(elX, elZ), radius: 1.0, active: () => doorOpen > 0.8 });

    // Itens.
    const mid = byDistance(dist, grid).filter((c) => c[2] > 8);
    for (const [x, z] of spreadCells(rng, mid, 4, 12)) game.addPickup('almond', grid.center(x, z, 0.9));
    for (const [x, z] of spreadCells(rng, mid, 2, 12)) game.addPickup('battery', grid.center(x, z, 0.9));

    // ---- Sorridentes ----
    const smilers = [];
    const farCells = byDistance(dist, grid).filter((c) => c[2] > 20);
    for (const [x, z] of spreadCells(rng, farCells, 3, 12)) smilers.push(game.addEntity('smiler', x, z, { active: false }));
    const relocate = (e) => {
      const P = game.player;
      const opts = game.patrolCells.filter(([x, z]) => {
        const d = Math.hypot((x + 0.5) * cs - P.pos.x, (z + 0.5) * cs - P.pos.z);
        return d > 18 && d < 40;
      });
      const c = opts[Math.floor(Math.random() * opts.length)];
      if (c) e.pos.copy(grid.center(c[0], c[1]));
      e.state = 'patrol';
      e.target = null;
    };

    let blackout = false;
    let cycle = 22;
    let warned = false;
    game.setObjective('Encontre 3 fusíveis e religue a energia do elevador');
    game.surface = 'concrete';

    let dripT = 2;
    return {
      start: { x: (sx + 0.5) * cs, z: (sz + 0.5) * cs, yaw: Math.PI * 0.75 },
      update(dt) {
        const P = game.player;
        // Elevador.
        if (powered) {
          doorOpen = Math.min(1, doorOpen + dt * 0.6);
          dl.position.x = -0.53 - doorOpen * 0.95;
          dr.position.x = 0.53 + doorOpen * 0.95;
          game.setObjective('Entre no elevador');
        } else if (installed + carried > 0) game.setObjective(`Fusíveis: ${installed + carried}/3 — leve-os ao painel ao lado do elevador`);

        // Ciclo de apagões.
        if (!powered) {
          cycle -= dt;
          if (!blackout && cycle < 3 && !warned) {
            warned = true;
            lamps.lamps.forEach((l) => (l.prevState = l.state));
            lamps.lamps.forEach((l) => l.state !== 'off' && (l.state = 'flicker'));
            game.toast('As luzes estão falhando…', 2.5);
          }
          if (cycle <= 0) {
            blackout = !blackout;
            warned = false;
            if (blackout) {
              cycle = 16 + Math.random() * 6;
              lamps.master = 0;
              hemi.intensity = 0.04;
              audio.powerDown();
              for (const e of smilers) {
                relocate(e);
                e.active = true;
              }
              game.toast('APAGÃO — desligue a lanterna e fique longe dos sorrisos', 4);
            } else {
              cycle = 32 + Math.random() * 15;
              lamps.lamps.forEach((l) => (l.state = l.prevState || 'on'));
              lamps.master = 1;
              hemi.intensity = 0.75;
              audio.powerUp();
              for (const e of smilers) e.active = false;
            }
          }
        } else for (const e of smilers) e.active = false;
        // Os sorrisos se dissolvem perto da luz.
        for (const e of smilers) e.visibleAlpha = blackout ? 1 : 0;

        // Passos molhados nas poças.
        game.surface = puddles.some(([p, r]) => Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < r) ? 'wet' : 'concrete';
        dripT -= dt;
        if (dripT <= 0) {
          dripT = 0.6 + Math.random() * 3;
          audio.drip(Math.random() * 2 - 1);
        }
      },
    };
  },
};
