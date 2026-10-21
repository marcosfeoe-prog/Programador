// Nível 4 — "Corra pela sua vida!": corredor em serpentina sob luzes
// vermelhas piscando. A entidade não para de perseguir. Agache sob as vigas,
// desvie dos destroços e chegue à saída.
import * as THREE from 'three';
import { Grid, FLOOR, WALL, SOLID, LOW, buildWalls, buildPlane, LampSystem } from '../grid.js';
import { tiles, concreteFloor, concrete, lampPanel, hazardStripes, crate } from '../textures.js';
import { atmosphere, lampGeometry, exitSignMesh, onWall, solidInstanced } from './common.js';
import { audio } from '../audio.js';

export default {
  number: 4,
  name: 'Corra Pela Sua Vida',
  subtitle: 'Não pare. Não olhe para trás. A saída está no fim do corredor.',
  ambience: 'run',
  flashScale: 0.8,
  intro: 'CORRA (Shift)! Agache (C) sob as vigas listradas e beba água de amêndoas (Q) quando o fôlego acabar.',

  build(game) {
    const rng = game.rng;
    const L = 30;
    const R = 4;
    const W = L + 6;
    const H = R * 4 + 3;
    const cs = 2.0;
    const WH = 3.2;
    const grid = new Grid(W, H, cs, WALL);
    game.grid = grid;
    const path = [];
    for (let r = 0; r < R; r++) {
      const z0 = 2 + r * 4;
      grid.fillRect(2, z0, 2 + L - 1, z0 + 1, FLOOR);
      // Ligação para a próxima fileira (alterna os lados).
      if (r < R - 1) {
        const x0 = r % 2 === 0 ? L : 2;
        grid.fillRect(x0, z0 + 2, x0 + 1, z0 + 3, FLOOR);
      }
      path.push(z0);
    }
    // Obstáculos ao longo de cada fileira.
    const beams = [];
    const debris = [];
    for (let r = 0; r < R; r++) {
      const z0 = path[r];
      const leftToRight = r % 2 === 0;
      for (let k = 6; k < L - 4; k += rng.int(5, 8)) {
        const x = leftToRight ? 2 + k : 2 + L - 1 - k;
        const type = rng.next();
        if (type < 0.4) {
          grid.set(x, z0, LOW);
          grid.set(x, z0 + 1, LOW);
          beams.push([x, z0]);
        } else {
          const lane = rng.int(0, 1);
          grid.set(x, z0 + lane, SOLID);
          debris.push([x, z0 + lane]);
        }
      }
    }
    const lastZ = path[R - 1];
    const endX = (R - 1) % 2 === 0 ? 2 + L : 1;
    grid.set(endX, lastZ, FLOOR);
    grid.set(endX, lastZ + 1, FLOOR);

    atmosphere(game, { fog: 0x120303, near: 2, far: 30, sky: 0xff4a3a, ground: 0x1a0505, hemi: 0.4, vmColor: 0xff7a6a, vmIntensity: 1.1, exposure: 1.1 });

    game.scene.add(buildWalls(grid, new THREE.MeshLambertMaterial({ map: tiles() }), { height: WH, texW: 2, texH: 2 }));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: concreteFloor('#4a4440', 67) }), 0, 4));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: concrete('#403a36', 57, 256) }), WH, 4, false));

    // Vigas listradas (agache) e entulho.
    const stripe = hazardStripes();
    const beamMat = new THREE.MeshLambertMaterial({ map: stripe });
    const beamGeo = new THREE.BoxGeometry(0.35, 0.5, cs * 2);
    const bm = beams.map(([x, z]) => new THREE.Matrix4().compose(new THREE.Vector3((x + 0.5) * cs, 1.45, (z + 1) * cs), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
    solidInstanced(game.scene, beamGeo, beamMat, bm);
    const dropGeo = new THREE.BoxGeometry(0.35, WH - 1.7, 0.35);
    const dm = [];
    for (const [x, z] of beams) {
      for (const zz of [z * cs + 0.18, (z + 2) * cs - 0.18]) dm.push(new THREE.Matrix4().makeTranslation((x + 0.5) * cs, 1.7 + (WH - 1.7) / 2, zz));
    }
    solidInstanced(game.scene, dropGeo, new THREE.MeshLambertMaterial({ color: 0x3a3a3a }), dm);
    const crateGeo = new THREE.BoxGeometry(cs * 0.9, 1.6, cs * 0.9);
    crateGeo.translate(0, 0.8, 0);
    const cm = debris.map(([x, z]) =>
      new THREE.Matrix4().compose(grid.center(x, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.float(-0.3, 0.3)), new THREE.Vector3(1, rng.float(0.8, 1.3), 1)),
    );
    solidInstanced(game.scene, crateGeo, new THREE.MeshLambertMaterial({ map: crate(77) }), cm);

    // Luzes vermelhas piscando.
    const lamps = new LampSystem(game.scene, {
      color: 0xff2010,
      intensity: 9,
      range: 11,
      y: WH - 0.01,
      geometry: lampGeometry(0.5, 1.2),
      material: new THREE.MeshBasicMaterial({ map: lampPanel([255, 60, 40]), toneMapped: false }),
      pool: 6,
    });
    for (const z0 of path) for (let x = 3; x < 2 + L; x += 3) lamps.add((x + 0.5) * cs, (z0 + 1) * cs, rng.chance(0.3) ? 'flicker' : 'pulse');
    lamps.finalize(() => Math.PI / 2);
    game.lamps = lamps;

    // Saída no fim.
    const exitDoorFrame = new THREE.Group();
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, toneMapped: false });
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(cs * 2 - 0.2, 2.6), glowMat);
    opening.position.y = 1.3;
    exitDoorFrame.add(opening);
    const exitDir = (R - 1) % 2 === 0 ? 1 : -1;
    const ea = onWall(grid, endX, lastZ, exitDir, 0, 0, 0.02);
    exitDoorFrame.position.set(ea.pos.x, 0, (lastZ + 1) * cs);
    exitDoorFrame.rotation.y = ea.rotY;
    game.scene.add(exitDoorFrame);
    const sign = exitSignMesh('EXIT');
    sign.position.set(ea.pos.x - exitDir * 0.03, 2.85, (lastZ + 1) * cs);
    sign.rotation.y = ea.rotY;
    game.scene.add(sign);
    const exitLight = new THREE.PointLight(0xfff0d0, 8, 14, 1.4);
    exitLight.position.set(ea.pos.x - exitDir * 1.0, 1.6, (lastZ + 1) * cs);
    game.scene.add(exitLight);
    game.addExit({ pos: new THREE.Vector3((endX + 0.5) * cs, 0, (lastZ + 1) * cs), radius: 1.6 });

    // Água de amêndoas no caminho (uma por fileira) e uma garrafa garantida.
    for (let r = 0; r < R; r++) {
      const z0 = path[r];
      const x = r % 2 === 0 ? 2 + Math.floor(L * 0.55) : 2 + L - 1 - Math.floor(L * 0.55);
      let lane = 0;
      if (grid.get(x, z0) !== FLOOR) lane = 1;
      if (grid.get(x, z0 + lane) === FLOOR) game.addPickup('almond', grid.center(x, z0 + lane, 0.9));
    }
    game.almond = Math.max(game.almond, 1);
    game.updateInv();

    // A entidade: começa parada no início e dispara após a contagem.
    const hunter = game.addEntity('howler', 2, path[0], {
      relentless: true,
      active: false,
      chaseSpeed: 4.15,
      // Elástico: alcança quem se afasta demais, alivia quando está colado.
      speedScale: (d) => (d > 22 ? 1.35 : d < 6 ? 0.93 : 1),
    });
    let countdown = 5;
    let started = false;
    game.setObjective('Prepare-se…');
    game.surface = 'concrete';

    return {
      start: { x: 5.5 * cs, z: (path[0] + 1) * cs, yaw: -Math.PI / 2 },
      update(dt) {
        if (!started) {
          countdown -= dt;
          const n = Math.ceil(countdown);
          game.setObjective(n > 0 ? `Ele está vindo… ${n}` : 'CORRA!');
          if (countdown <= 0) {
            started = true;
            hunter.active = true;
            hunter.state = 'chase';
            audio.screech(1, 0);
            audio.growl(1, 0);
            game.player.shake = 0.8;
            game.setObjective('CORRA ATÉ A SAÍDA!');
          }
        }
        exitLight.intensity = 7 + Math.sin(game.time * 6) * 1.5;
      },
    };
  },
};
