// Nível 2 — Sonhos de Canos: túneis estreitos e escuros forrados de canos
// enferrujados, jatos de vapor e o Pálido rondando.
// Objetivo: fechar 3 válvulas para destravar o portão de manutenção.
import * as THREE from 'three';
import { Grid, FLOOR, WALL, buildWalls, buildPlane, wallFaces, LampSystem } from '../grid.js';
import { darkPanels, rustMetal, dirtFloor, concrete } from '../textures.js';
import { atmosphere, byDistance, spreadCells, onWall, solidInstanced } from './common.js';
import { audio } from '../audio.js';
import { clamp } from '../util.js';

function maze(rng, n) {
  const W = n * 2 + 1;
  const grid = new Grid(W, W, 2.0, WALL);
  const seen = new Uint8Array(n * n);
  const stack = [[0, 0]];
  seen[0] = 1;
  grid.set(1, 1, FLOOR);
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oz]) => {
      const nx = cx + ox;
      const nz = cz + oz;
      return nx >= 0 && nz >= 0 && nx < n && nz < n && !seen[nz * n + nx];
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [ox, oz] = rng.pick(opts);
    const nx = cx + ox;
    const nz = cz + oz;
    seen[nz * n + nx] = 1;
    grid.set(cx * 2 + 1 + ox, cz * 2 + 1 + oz, FLOOR);
    grid.set(nx * 2 + 1, nz * 2 + 1, FLOOR);
    stack.push([nx, nz]);
  }
  return grid;
}

export default {
  number: 2,
  name: 'Sonhos de Canos',
  subtitle: 'Túneis quentes e estreitos. Algo pálido se arrasta entre os canos.',
  ambience: 'pipes',
  flashScale: 1.1,
  intro: 'Feche as 3 válvulas (segure E). Cuidado com o vapor — e com o Pálido. Agachar (C) faz menos barulho.',

  build(game) {
    const rng = game.rng;
    const n = 12;
    const grid = maze(rng, n);
    game.grid = grid;
    const cs = grid.cs;
    const WH = 2.6;
    const W = grid.w;
    // Atalhos: remove algumas paredes internas para criar voltas (dá para despistar).
    for (let i = 0; i < 40; i++) {
      const x = rng.int(1, W - 2);
      const z = rng.int(1, W - 2);
      if (grid.get(x, z) !== WALL) continue;
      const hz = grid.get(x - 1, z) === FLOOR && grid.get(x + 1, z) === FLOOR;
      const vt = grid.get(x, z - 1) === FLOOR && grid.get(x, z + 1) === FLOOR;
      if (hz !== vt) grid.set(x, z, FLOOR);
    }
    // Duas salas de máquinas.
    for (let i = 0; i < 2; i++) {
      const x = rng.int(4, W - 8) | 1;
      const z = rng.int(4, W - 8) | 1;
      grid.fillRect(x, z, x + 2, z + 2, FLOOR);
    }
    const sx = 1;
    const sz = 1;
    const dist = grid.sealUnreachable(sx, sz);

    atmosphere(game, { fog: 0x0b0806, near: 1, far: 19, sky: 0xffc890, ground: 0x1a120a, hemi: 0.22, vmColor: 0xffc890, vmIntensity: 0.7, exposure: 1.1 });
    game.fill.intensity = 0.4;
    game.fill.color.set(0xffb070);

    game.scene.add(buildWalls(grid, new THREE.MeshLambertMaterial({ map: darkPanels() }), { height: WH, texW: 2.6, texH: 2.6 }));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: dirtFloor() }), 0, 4));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: concrete('#3b342c', 55, 256) }), WH, 3, false));

    // ---- Canos ao longo das paredes ----
    const rust = rustMetal();
    const pipeMat = new THREE.MeshLambertMaterial({ map: rust });
    const pipeGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    const flangeGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
    const pipes = [];
    const flanges = [];
    const up = new THREE.Vector3(0, 1, 0);
    const faces = wallFaces(grid);
    const heights = [0.3, 1.75, 2.15];
    const radii = [0.13, 0.08, 0.1];
    for (const f of faces) {
      const c = grid.center(f.fx, f.fz);
      // Ponto na face da parede.
      const px = c.x - f.nx * cs * 0.5;
      const pz = c.z - f.nz * cs * 0.5;
      const along = new THREE.Vector3(f.nz, 0, f.nx); // tangente à parede
      const q = new THREE.Quaternion().setFromUnitVectors(up, along.clone().normalize());
      heights.forEach((h, k) => {
        if (rng.chance(0.15)) return;
        const r = radii[k];
        const pos = new THREE.Vector3(px + f.nx * (r + 0.03), h, pz + f.nz * (r + 0.03));
        pipes.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(r, cs + 0.02, r)));
        if (rng.chance(0.4)) flanges.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(r * 1.35, 0.06, r * 1.35)));
      });
      // Cano vertical ocasional.
      if (rng.chance(0.12)) {
        const pos = new THREE.Vector3(px + f.nx * 0.12 + along.x * 0.4, WH / 2, pz + f.nz * 0.12 + along.z * 0.4);
        pipes.push(new THREE.Matrix4().compose(pos, new THREE.Quaternion(), new THREE.Vector3(0.07, WH, 0.07)));
      }
    }
    // Cano grosso no teto dos corredores.
    for (let z = 0; z < W; z++) {
      for (let x = 0; x < W; x++) {
        if (grid.get(x, z) !== FLOOR) continue;
        const horiz = grid.get(x - 1, z) === FLOOR || grid.get(x + 1, z) === FLOOR;
        const q = new THREE.Quaternion().setFromUnitVectors(up, horiz ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1));
        if ((x + z) % 3 === 0) pipes.push(new THREE.Matrix4().compose(grid.center(x, z, WH - 0.22), q, new THREE.Vector3(0.18, cs, 0.18)));
      }
    }
    solidInstanced(game.scene, pipeGeo, pipeMat, pipes);
    solidInstanced(game.scene, flangeGeo, new THREE.MeshLambertMaterial({ color: 0x5a3a1c }), flanges);

    // ---- Lâmpadas nuas com grade ----
    const bulbGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const lamps = new LampSystem(game.scene, {
      color: 0xffa860,
      intensity: 3.2,
      range: 7,
      y: WH - 0.45,
      geometry: bulbGeo,
      material: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
      pool: 5,
    });
    for (let z = 1; z < W; z += 2) {
      for (let x = 1; x < W; x += 2) {
        if (grid.get(x, z) !== FLOOR || rng.chance(0.62)) continue;
        const r = rng.next();
        lamps.add((x + 0.5) * cs, (z + 0.5) * cs, r < 0.25 ? 'flicker' : r < 0.35 ? 'off' : 'on');
      }
    }
    lamps.finalize(() => 0);
    game.lamps = lamps;

    // ---- Becos sem saída: válvulas e o portão ----
    const deadEnds = byDistance(dist, grid, (x, z) => {
      let open = 0;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid.get(x + ox, z + oz) === FLOOR) open++;
      return open === 1;
    }).filter((c) => c[2] > 8);
    const gateCell = deadEnds[deadEnds.length - 1];
    const valveCells = spreadCells(rng, deadEnds.slice(0, -1).filter((c) => c[2] > 12), 3, 7, [gateCell]);
    const wallDir = (x, z) => {
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // A parede do fundo do beco fica oposta à abertura.
        if (grid.get(x - ox, z - oz) === FLOOR) return [ox, oz];
      }
      return [1, 0];
    };

    let closed = 0;
    const valveMat = new THREE.MeshLambertMaterial({ color: 0xb02018 });
    for (const [x, z] of valveCells) {
      const [ox, oz] = wallDir(x, z);
      const at = onWall(grid, x, z, ox, oz, 1.2, 0.0);
      const g = new THREE.Group();
      const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), pipeMat);
      stub.rotation.x = Math.PI / 2;
      stub.position.z = 0.15;
      const wheel = new THREE.Group();
      wheel.position.z = 0.3;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 20), valveMat);
      wheel.add(rim);
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.03, 0.03), valveMat);
        sp.rotation.z = (k * Math.PI) / 3;
        wheel.add(sp);
      }
      g.add(stub, wheel);
      g.position.copy(at.pos);
      g.rotation.y = at.rotY;
      game.scene.add(g);
      const v = { done: false };
      game.addInteract({
        pos: at.pos.clone().add(new THREE.Vector3(-ox * 0.3, 0, -oz * 0.3)),
        radius: 2.2,
        hold: 2.4,
        prompt: 'Segure para fechar a válvula',
        enabled: () => !v.done,
        onHold: (dt) => {
          wheel.rotation.z += dt * 3;
          if (Math.random() < dt * 3) audio.valve();
        },
        use: () => {
          v.done = true;
          closed++;
          rim.material = new THREE.MeshLambertMaterial({ color: 0x3c6e2a });
          wheel.children.forEach((m) => (m.material = rim.material));
          audio.clank(0.6);
          game.toast(`Válvula fechada (${closed}/3)`);
          // Barulho atrai o Pálido.
          for (const e of game.entities) {
            e.state = 'chase';
            e.lastSeen = game.player.pos.clone();
            e.searchT = 4;
            e.chaseSpeed += 0.2;
          }
          if (closed === 2) {
            const far = game.patrolCells.filter(([cx, cz]) => Math.hypot((cx + 0.5) * cs - game.player.pos.x, (cz + 0.5) * cs - game.player.pos.z) > 22);
            const c = far[Math.floor(Math.random() * far.length)];
            if (c) game.addEntity('pale', c[0], c[1], { chaseSpeed: 4.2 });
            game.toast('Válvula fechada (2/3) — você ouve algo se arrastando em outro túnel…', 4);
          }
          if (closed === 3) {
            audio.powerUp();
            game.toast('O portão de manutenção destravou!', 4);
          }
        },
      });
    }

    // Portão com grades.
    const [gx, gz] = gateCell;
    const [gox, goz] = wallDir(gx, gz);
    const gate = new THREE.Group();
    const barMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    for (let k = 0; k < 9; k++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 6), barMat);
      b.position.set(-0.85 + k * 0.21, 1.15, 0);
      gate.add(b);
    }
    for (const y of [0.25, 1.15, 2.1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.05), barMat);
      h.position.y = y;
      gate.add(h);
    }
    const ga = onWall(grid, gx, gz, gox, goz, 0, 0.05);
    gate.position.copy(ga.pos);
    gate.rotation.y = ga.rotY;
    game.scene.add(gate);
    // Atrás do portão: luz verde de saída.
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.3), new THREE.MeshBasicMaterial({ color: 0x0c2a14 }));
    beyond.position.copy(ga.pos).add(new THREE.Vector3(gox * 0.04, 1.15, goz * 0.04));
    beyond.rotation.y = ga.rotY;
    game.scene.add(beyond);
    const exitLight = new THREE.PointLight(0x40ff80, 1.5, 6, 1.5);
    exitLight.position.copy(ga.pos).add(new THREE.Vector3(-gox * 0.5, 2.0, -goz * 0.5));
    game.scene.add(exitLight);
    let gateUp = 0;
    game.addInteract({
      pos: ga.pos.clone().setY(1.2),
      radius: 2.2,
      prompt: () => `Portão trancado (${closed}/3 válvulas)`,
      enabled: () => closed < 3,
      use: () => audio.locked(),
    });
    game.addExit({ pos: ga.pos.clone().add(new THREE.Vector3(-gox * 0.3, 0, -goz * 0.3)), radius: 0.9, active: () => gateUp > 0.85 });

    // ---- Jatos de vapor ----
    const vents = [];
    const steamTex = puffTexture();
    const ventCells = spreadCells(rng, byDistance(dist, grid).filter((c) => c[2] > 6), 7, 5);
    for (const [x, z] of ventCells) {
      const grate = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0x222222 }));
      grate.rotation.x = -Math.PI / 2;
      grate.position.copy(grid.center(x, z, 0.012));
      game.scene.add(grate);
      const puffs = [];
      for (let k = 0; k < 14; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false, color: 0xd8d2c8 }));
        game.scene.add(s);
        puffs.push({ s, t: Math.random() });
      }
      const id = `steam${x}_${z}`;
      audio.loop(id, 'steam');
      vents.push({ x, z, pos: grid.center(x, z), puffs, phase: rng.float(0, 6), id, on: false });
    }

    // ---- Itens e entidade ----
    const mid = byDistance(dist, grid).filter((c) => c[2] > 5);
    for (const [x, z] of spreadCells(rng, mid, 4, 6)) game.addPickup('almond', grid.center(x, z, 0.9));
    for (const [x, z] of spreadCells(rng, mid, 3, 6)) game.addPickup('battery', grid.center(x, z, 0.9));
    const far = byDistance(dist, grid).filter((c) => c[2] > 22);
    const sp = rng.pick(far.length ? far : mid);
    game.addEntity('pale', sp[0], sp[1], { chaseSpeed: 4.0 });

    game.setObjective('Feche as 3 válvulas vermelhas (0/3)');
    game.surface = 'concrete';
    let clankT = 4;
    let burnCd = 0;

    return {
      start: { x: (sx + 0.5) * cs, z: (sz + 0.5) * cs, yaw: grid.get(2, 1) === FLOOR ? -Math.PI / 2 : Math.PI },
      update(dt) {
        const P = game.player;
        const t = game.time;
        if (closed < 3) game.setObjective(`Feche as 3 válvulas vermelhas (${closed}/3)`);
        else {
          game.setObjective('Saia pelo portão de manutenção');
          gateUp = Math.min(1, gateUp + dt * 0.5);
          gate.position.y = gateUp * 2.2;
          exitLight.intensity = 3 + Math.sin(t * 4);
        }
        // Vapor.
        burnCd -= dt;
        for (const v of vents) {
          const cyc = (t + v.phase) % 6;
          v.on = cyc < 2.2;
          const d = Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z);
          const a = Math.atan2(v.pos.x - P.pos.x, v.pos.z - P.pos.z);
          audio.loopSet(v.id, v.on ? clamp(1 - d / 12, 0, 1) * 0.25 : 0, -Math.sin(a - P.yaw - Math.PI) * 0.9);
          for (const p of v.puffs) {
            p.t += dt * 0.9;
            if (p.t > 1) p.t -= 1;
            const k = p.t;
            p.s.position.set(v.pos.x + Math.sin(p.t * 20 + v.phase) * 0.15 * k, k * 2.6, v.pos.z + Math.cos(p.t * 17) * 0.15 * k);
            p.s.scale.setScalar(0.3 + k * 1.4);
            p.s.material.opacity = v.on ? (1 - k) * 0.5 : Math.max(0, p.s.material.opacity - dt);
          }
          if (v.on && d < 0.85 && burnCd <= 0) {
            burnCd = 1.2;
            P.slow = 1.5;
            P.shake = 0.6;
            game.flashDamage();
            game.toast('Vapor escaldante! Espere o jato parar.', 2);
          }
        }
        clankT -= dt;
        if (clankT <= 0) {
          clankT = 3 + Math.random() * 7;
          audio.clank(0.15 + Math.random() * 0.2, Math.random() * 2 - 1);
        }
      },
    };
  },
};

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
