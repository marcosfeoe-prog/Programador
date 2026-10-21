// Nível 0 — O Saguão: labirinto amarelo infinito, carpete úmido e o zumbido
// das fluorescentes. Sem entidades: o perigo é se perder.
import * as THREE from 'three';
import { Grid, FLOOR, WALL, buildWalls, buildPlane, LampSystem } from '../grid.js';
import { wallpaperYellow, carpetMustard, ceilingTiles, lampPanel, glitch } from '../textures.js';
import { atmosphere, lampGeometry, byDistance, spreadCells, wallNeighbor, onWall } from './common.js';
import { audio } from '../audio.js';
import { clamp } from '../util.js';

export default {
  number: 0,
  name: 'O Saguão',
  subtitle: 'Carpete úmido. Zumbido eterno. Nenhuma saída à vista.',
  ambience: 'lobby',
  flashScale: 0.35,
  intro: 'Você caiu fora da realidade. Procure a fenda — siga o chiado de estática.',

  build(game) {
    const rng = game.rng;
    const W = 54;
    const H = 54;
    const cs = 1.6;
    const WH = 2.9;
    const grid = new Grid(W, H, cs, FLOOR);
    game.grid = grid;
    for (let i = 0; i < W; i++) {
      grid.set(i, 0, WALL);
      grid.set(i, H - 1, WALL);
      grid.set(0, i, WALL);
      grid.set(W - 1, i, WALL);
    }
    // Segmentos de parede soltos formam salas irregulares e corredores.
    for (let i = 0; i < 230; i++) {
      const x = rng.int(2, W - 3);
      const z = rng.int(2, H - 3);
      const len = rng.int(2, 9);
      const horiz = rng.chance(0.5);
      for (let k = 0; k < len; k++) grid.set(horiz ? x + k : x, horiz ? z : z + k, WALL);
      // Às vezes um "L".
      if (rng.chance(0.35)) {
        const l2 = rng.int(2, 5);
        for (let k = 0; k < l2; k++) grid.set(horiz ? x + len - 1 : x + k, horiz ? z + k : z + len - 1, WALL);
      }
    }
    // Pilares.
    for (let i = 0; i < 90; i++) grid.set(rng.int(2, W - 3), rng.int(2, H - 3), WALL);
    // Grandes salões vazios (a sensação de espaço aberto do nível 0).
    for (let i = 0; i < 4; i++) {
      const x = rng.int(3, W - 12);
      const z = rng.int(3, H - 12);
      grid.fillRect(x, z, x + rng.int(5, 8), z + rng.int(5, 8), FLOOR);
    }
    const sx = W >> 1;
    const sz = H >> 1;
    grid.fillRect(sx - 1, sz - 1, sx + 1, sz + 1, FLOOR);
    const dist = grid.sealUnreachable(sx, sz);

    atmosphere(game, { fog: 0x6f6233, near: 3, far: 34, sky: 0xfff1b8, ground: 0x7a6830, hemi: 1.15, vmColor: 0xfff0c0, vmIntensity: 1.8, exposure: 1.05 });

    const wallMat = new THREE.MeshLambertMaterial({ map: wallpaperYellow() });
    game.scene.add(buildWalls(grid, wallMat, { height: WH, texW: 1.6, texH: WH }));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: carpetMustard() }), 0, 1.8));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: ceilingTiles() }), WH, 1.2, false));

    const lamps = new LampSystem(game.scene, {
      color: 0xfff0c4,
      intensity: 4.5,
      range: 8,
      y: WH - 0.01,
      geometry: lampGeometry(0.55, 1.15),
      material: new THREE.MeshBasicMaterial({ map: lampPanel(), toneMapped: false }),
      pool: 6,
    });
    for (let z = 1; z < H; z += 2) {
      for (let x = 1; x < W; x += 2) {
        if (grid.get(x, z) !== FLOOR || (x + z) % 4 !== 0) continue;
        const r = rng.next();
        lamps.add((x + 0.5) * cs, (z + 0.5) * cs, r < 0.07 ? 'flicker' : r < 0.1 ? 'off' : 'on');
      }
    }
    lamps.finalize(() => 0);
    game.lamps = lamps;

    // A fenda de saída: longe do início, numa parede.
    const isWall = (v) => v === WALL;
    const cells = byDistance(dist, grid, (x, z) => wallNeighbor(grid, x, z, isWall));
    const maxD = cells[cells.length - 1][2];
    const far = cells.filter((c) => c[2] > maxD * 0.55 && c[2] < maxD * 0.8);
    const [ex, ez] = rng.pick(far.length ? far : cells.slice(-10));
    const [ox, oz] = wallNeighbor(grid, ex, ez, isWall);
    const tex = glitch();
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(cs * 0.7, 2.3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    const at = onWall(grid, ex, ez, ox, oz, 1.15, 0.015);
    crack.position.copy(at.pos);
    crack.rotation.y = at.rotY;
    game.scene.add(crack);
    const glow = new THREE.PointLight(0x9a7cff, 3, 6, 1.5);
    glow.position.copy(at.pos).add(new THREE.Vector3(-ox * 0.6, 0, -oz * 0.6));
    game.scene.add(glow);
    const exitPos = at.pos.clone();
    audio.loop('glitch', 'glitch');
    game.addExit({ pos: grid.center(ex, ez), radius: 0.95, onEnter: () => audio.loopSet('glitch', 0) });

    // Itens: algumas águas de amêndoas e pilhas pelo caminho.
    const mid = byDistance(dist, grid).filter((c) => c[2] > 6);
    for (const [x, z] of spreadCells(rng, mid, 4, 8)) game.addPickup('almond', grid.center(x, z, 0.9));
    for (const [x, z] of spreadCells(rng, mid, 2, 10)) game.addPickup('battery', grid.center(x, z, 0.9));

    game.setObjective('Encontre a fenda na realidade (siga o chiado de estática)');
    game.surface = 'carpet';

    let eventT = 20;
    return {
      start: { x: (sx + 0.5) * cs, z: (sz + 0.5) * cs, yaw: rng.float(0, Math.PI * 2) },
      update(dt) {
        const t = game.time;
        tex.offset.set(Math.random(), (t * 3) % 1);
        crack.scale.x = 1 + Math.sin(t * 23) * 0.05 + (Math.random() < 0.05 ? 0.3 : 0);
        glow.intensity = 2 + Math.random() * 2;
        const P = game.player;
        const d = exitPos.distanceTo(new THREE.Vector3(P.pos.x, 1.15, P.pos.z));
        const a = Math.atan2(exitPos.x - P.pos.x, exitPos.z - P.pos.z);
        const pan = -Math.sin(a - P.yaw - Math.PI) * 0.9;
        audio.loopSet('glitch', clamp(1 - d / 40, 0, 1) ** 1.6 * 0.5, pan);
        // Eventos: lâmpada estoura perto de você, passos distantes.
        eventT -= dt;
        if (eventT <= 0) {
          eventT = 18 + Math.random() * 25;
          if (Math.random() < 0.6) {
            const near = lamps.nearest(P.pos, 4).filter((l) => l.state !== 'off');
            const l = near[Math.floor(Math.random() * near.length)];
            if (l) {
              l.state = 'off';
              audio.lampBurst(Math.random() * 1.4 - 0.7);
              P.shake = 0.3;
            }
          } else audio.distantSteps(Math.random() * 2 - 1);
        }
      },
    };
  },
};
