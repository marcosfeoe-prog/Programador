// Nível 3 — O Hotel: corredores acarpetados sob luzes vermelhas, dezenas de
// quartos e o Uivador. Objetivo: achar o cartão-chave e sair pela porta EXIT.
import * as THREE from 'three';
import { Grid, FLOOR, WALL, SOLID, buildWalls, buildPlane, LampSystem, makeDoor } from '../grid.js';
import { hotelWallpaper, hotelCarpet, ceilingTiles, lampPanel, woodDoor } from '../textures.js';
import { atmosphere, lampGeometry, exitSignMesh, onWall } from './common.js';
import { audio } from '../audio.js';

export default {
  number: 3,
  name: 'O Hotel',
  subtitle: 'Quartos sem hóspedes. Luzes de emergência. Alguém anda pelos corredores.',
  ambience: 'hotel',
  flashScale: 1,
  intro: 'Procure o cartão-chave nos quartos (E abre portas). Se o Uivador te vir, corra e quebre a linha de visão.',

  build(game) {
    const rng = game.rng;
    const W = 46;
    const H = 45;
    const cs = 2.0;
    const WH = 2.7;
    const grid = new Grid(W, H, cs, WALL);
    game.grid = grid;
    const rows = [2, 12, 22, 32, 42];
    const cols = [2, 22, 42];
    for (const z of rows) grid.fillRect(2, z, 42, z, FLOOR);
    for (const x of cols) grid.fillRect(x, 2, x, 42, FLOOR);

    // Quartos 3×3 acima e abaixo de cada corredor, com porta.
    const rooms = [];
    const roomX = [4, 8, 12, 16, 24, 28, 32, 36];
    for (const cz of rows) {
      for (const side of [-1, 1]) {
        const doorZ = cz + side;
        const z0 = side > 0 ? cz + 2 : cz - 4;
        if (z0 < 1 || z0 + 2 > H - 2) continue;
        for (const x0 of roomX) {
          grid.fillRect(x0, z0, x0 + 2, z0 + 2, FLOOR);
          rooms.push({ x0, z0, doorX: x0 + 1, doorZ: doorZ, side, locked: false });
        }
      }
    }
    rng.shuffle(rooms);
    rooms.forEach((r, i) => (r.locked = i % 3 === 0));

    atmosphere(game, { fog: 0x140404, near: 2, far: 26, sky: 0xff6a50, ground: 0x2a0806, hemi: 0.3, vmColor: 0xff8070, vmIntensity: 1.0, exposure: 1.1 });

    const wallMat = new THREE.MeshLambertMaterial({ map: hotelWallpaper() });
    game.scene.add(buildWalls(grid, wallMat, { height: WH, texW: 2.0, texH: WH }));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: hotelCarpet() }), 0, 2));
    game.scene.add(buildPlane(grid, new THREE.MeshLambertMaterial({ map: ceilingTiles('#4a4440', 'rgba(20,16,14,0.8)', 37) }), WH, 1.5, false));

    // Portas.
    const doorTexes = [woodDoor(131), woodDoor(137), woodDoor(139)];
    const doorMats = doorTexes.map((t) => new THREE.MeshLambertMaterial({ map: t }));
    const knobMat = new THREE.MeshLambertMaterial({ color: 0xc9b070, emissive: 0x201808 });
    const lintelMat = new THREE.MeshLambertMaterial({ map: hotelWallpaper(117) });
    for (const r of rooms) {
      const d = makeDoor(game.scene, grid, r.doorX, r.doorZ, {
        alongX: true,
        material: rng.pick(doorMats),
        knobMaterial: knobMat,
        lintelMaterial: lintelMat,
        wallHeight: WH,
        locked: r.locked,
      });
      r.door = d;
      game.addInteract({
        pos: d.pos.clone().setY(1.1),
        radius: 2.3,
        prompt: () => (d.locked ? 'Trancada' : d.open ? 'Fechar porta' : 'Abrir porta'),
        use: () => {
          if (d.locked) {
            audio.locked();
            return;
          }
          d.open = !d.open;
          audio.door();
        },
      });
    }

    // Móveis: cama + criado-mudo em cada quarto.
    const sheet = new THREE.MeshLambertMaterial({ color: 0xd9d2c4 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3820 });
    const bedGeo = new THREE.BoxGeometry(1.4, 0.55, 2.0);
    const pillowGeo = new THREE.BoxGeometry(1.1, 0.14, 0.35);
    const standGeo = new THREE.BoxGeometry(0.5, 0.6, 0.5);
    for (const r of rooms) {
      const bx = r.x0 + (rng.chance(0.5) ? 0 : 2);
      const bz = r.side > 0 ? r.z0 + 2 : r.z0;
      grid.set(bx, bz, SOLID);
      const bed = new THREE.Mesh(bedGeo, sheet);
      bed.position.copy(grid.center(bx, bz, 0.28));
      const pillow = new THREE.Mesh(pillowGeo, sheet);
      pillow.position.copy(bed.position).add(new THREE.Vector3(0, 0.33, r.side > 0 ? 0.7 : -0.7));
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 0.1), wood);
      head.position.copy(bed.position).add(new THREE.Vector3(0, 0.28, r.side > 0 ? 0.98 : -0.98));
      game.scene.add(bed, pillow, head);
      const sx = bx === r.x0 ? r.x0 + 1 : r.x0 + 1;
      const stand = new THREE.Mesh(standGeo, wood);
      stand.position.copy(grid.center(sx, bz, 0.3)).add(new THREE.Vector3(bx === r.x0 ? -0.6 : 0.6, 0, r.side > 0 ? 0.6 : -0.6));
      game.scene.add(stand);
      r.standPos = stand.position.clone().setY(0.85);
    }

    // Luzes vermelhas no teto dos corredores.
    const lamps = new LampSystem(game.scene, {
      color: 0xff2414,
      intensity: 7,
      range: 10,
      y: WH - 0.01,
      geometry: lampGeometry(0.5, 1.1),
      material: new THREE.MeshBasicMaterial({ map: lampPanel([255, 70, 50]), toneMapped: false }),
      pool: 6,
    });
    for (const z of rows) for (let x = 3; x <= 42; x += 3) lamps.add((x + 0.5) * cs, (z + 0.5) * cs, rng.chance(0.15) ? 'flicker' : rng.chance(0.2) ? 'pulse' : 'on');
    for (const x of cols) for (let z = 4; z <= 40; z += 3) if (!rows.includes(z)) lamps.add((x + 0.5) * cs, (z + 0.5) * cs, rng.chance(0.15) ? 'flicker' : 'on');
    lamps.finalize((l) => (cols.some((x) => Math.abs((x + 0.5) * cs - l.x) < 0.1) && !rows.some((z) => Math.abs((z + 0.5) * cs - l.z) < 0.1) ? 0 : Math.PI / 2));
    game.lamps = lamps;

    // ---- Porta de saída (leste do último corredor) ----
    grid.set(43, 42, FLOOR);
    grid.set(44, 42, FLOOR);
    const exitDoor = makeDoor(game.scene, grid, 43, 42, {
      alongX: false,
      material: new THREE.MeshLambertMaterial({ color: 0x8c8c86 }),
      knobMaterial: knobMat,
      lintelMaterial: lintelMat,
      wallHeight: WH,
      locked: true,
    });
    const sign = exitSignMesh('EXIT');
    const sa = onWall(grid, 42, 42, 1, 0, 2.35, 0.03);
    sign.position.copy(sa.pos);
    sign.rotation.y = sa.rotY;
    game.scene.add(sign);
    const signLight = new THREE.PointLight(0xff3020, 3, 6, 1.6);
    signLight.position.copy(sa.pos).add(new THREE.Vector3(-0.5, -0.2, 0));
    game.scene.add(signLight);
    const beyond = new THREE.PointLight(0xfff0e0, 0, 5, 1.5);
    beyond.position.copy(grid.center(44, 42, 1.8));
    game.scene.add(beyond);

    // ---- Cartão-chave ----
    let hasKey = false;
    const openRooms = rooms.filter((r) => !r.locked);
    // O cartão fica num quarto da metade sul/leste (longe do início).
    const candidates = openRooms.filter((r) => r.x0 + r.z0 > 36);
    const keyRoom = rng.pick(candidates.length ? candidates : openRooms);
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.14), new THREE.MeshBasicMaterial({ color: 0x3a8cff }));
    game.addPickup('key', keyRoom.standPos, {
      mesh: card,
      glow: 0x5aa0ff,
      label: 'Pegar cartão-chave',
      onPick: () => {
        hasKey = true;
        game.toast('Cartão-chave! Vá até a porta EXIT no canto sudeste.', 4);
        audio.growl(0.8, 0);
        // Ele sabe.
        for (const e of game.entities) {
          e.state = 'chase';
          e.lastSeen = game.player.pos.clone();
          e.searchT = 8;
        }
        lamps.lamps.forEach((l) => l.state !== 'off' && (l.state = 'pulse'));
        const far = game.patrolCells.filter(([x, z]) => Math.hypot((x + 0.5) * cs - game.player.pos.x, (z + 0.5) * cs - game.player.pos.z) > 25);
        const c = far[Math.floor(Math.random() * far.length)];
        if (c) game.addEntity('howler', c[0], c[1], { chaseSpeed: 4.5 });
      },
    });
    // Itens em outros quartos.
    const others = rng.shuffle(openRooms.filter((r) => r !== keyRoom));
    others.slice(0, 5).forEach((r) => game.addPickup('almond', r.standPos));
    others.slice(5, 8).forEach((r) => game.addPickup('battery', r.standPos));

    game.addInteract({
      pos: exitDoor.pos.clone().setY(1.1),
      radius: 2.4,
      prompt: () => (exitDoor.open ? 'Saída' : hasKey ? 'Usar cartão-chave' : 'Trancada — precisa de cartão-chave'),
      enabled: () => !exitDoor.open,
      use: () => {
        if (!hasKey) {
          audio.locked();
          return;
        }
        exitDoor.locked = false;
        exitDoor.open = true;
        audio.elevator();
        audio.door();
        beyond.intensity = 6;
      },
    });
    game.addExit({ pos: grid.center(44, 42), radius: 1.0, active: () => exitDoor.open });

    // O Uivador começa longe.
    game.addEntity('howler', 22, 32, { chaseSpeed: 4.3 });

    game.setObjective('Encontre o cartão-chave em um dos quartos');
    game.surface = 'carpet';
    return {
      start: { x: (2 + 0.5) * cs, z: (2 + 0.5) * cs, yaw: -Math.PI / 2 },
      update() {
        game.setObjective(hasKey ? 'Leve o cartão até a porta EXIT (canto sudeste)' : 'Encontre o cartão-chave em um dos quartos');
        signLight.intensity = 2.5 + Math.sin(game.time * 3) * 0.5;
      },
    };
  },
};
