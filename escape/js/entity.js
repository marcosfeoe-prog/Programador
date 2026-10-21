// Entidades: modelos montados com primitivas, animação procedural de
// caminhada/corrida e IA (patrulha → perseguição → busca) sobre a grade.
import * as THREE from 'three';
import { angleDiff, clamp, damp } from './util.js';
import { audio } from './audio.js';
import { smilerFace } from './textures.js';
import { LOW } from './grid.js';

let smilerTex = null;

function limb(len, r0, r1, mat) {
  // Segmento que pende para baixo a partir do pivô (articulação).
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry((r0 + r1) / 2, len - (r0 + r1), 4, 8), mat);
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

// Humanoide alto e magro (o "Uivador" do hotel, o "Pálido" dos canos…).
function buildHumanoid(o) {
  const skin = new THREE.MeshLambertMaterial({ color: o.color });
  const dark = new THREE.MeshLambertMaterial({ color: o.dark ?? 0x140d0a });
  const eyeMat = new THREE.MeshBasicMaterial({ color: o.eyes ?? 0xffffff });
  const root = new THREE.Group();
  const s = o.scale ?? 1;
  const legLen = 0.52 * s;
  const hips = new THREE.Group();
  hips.position.y = legLen * 2 * 0.98;
  root.add(hips);
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.16 * s, 0.18 * s), skin);
  hips.add(pelvis);
  const spine = new THREE.Group();
  hips.add(spine);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15 * s, 0.42 * s, 4, 8), skin);
  torso.scale.set(1.25, 1, 0.75);
  torso.position.y = 0.33 * s;
  spine.add(torso);
  // Costelas marcadas.
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15 * s, 0.012 * s, 4, 12, Math.PI), dark);
    rib.position.set(0, 0.3 * s + i * 0.07 * s, 0.035 * s);
    rib.rotation.set(Math.PI / 2, 0, 0);
    rib.scale.set(1.1, 0.6, 1);
    spine.add(rib);
  }
  const neck = new THREE.Group();
  neck.position.y = 0.68 * s;
  spine.add(neck);
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.06 * s, 0.16 * s, 8), skin);
  neckM.position.y = 0.06 * s;
  neck.add(neckM);
  const head = new THREE.Group();
  head.position.y = 0.16 * s;
  neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 12, 10), skin);
  skull.scale.set(0.9, 1.25, 1);
  skull.position.y = 0.1 * s;
  head.add(skull);
  const eyeGeo = new THREE.SphereGeometry(0.022 * s, 8, 6);
  const eyes = [];
  for (const x of [-0.045, 0.045]) {
    const sock = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 8, 6), dark);
    sock.position.set(x * s, 0.13 * s, 0.1 * s);
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(x * s, 0.13 * s, 0.125 * s);
    head.add(sock, e);
    eyes.push(e);
  }
  // Boca: abre ao perseguir e no susto.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.03 * s, 0.03 * s), new THREE.MeshBasicMaterial({ color: 0x1a0000 }));
  mouth.position.set(0, 0.0, 0.115 * s);
  head.add(mouth);
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.085 * s, 0.012 * s, 0.032 * s), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
  teeth.position.set(0, 0.012 * s, 0.117 * s);
  head.add(teeth);

  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.24 * s, 0.6 * s, 0);
    spine.add(sh);
    const upper = limb(0.42 * s * (o.armLen ?? 1), 0.055 * s, 0.045 * s, skin);
    sh.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.42 * s * (o.armLen ?? 1);
    upper.add(elbow);
    const fore = limb(0.44 * s * (o.armLen ?? 1), 0.045 * s, 0.035 * s, skin);
    elbow.add(fore);
    const handG = new THREE.Group();
    handG.position.y = -0.44 * s * (o.armLen ?? 1);
    fore.add(handG);
    // Dedos compridos.
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Mesh(new THREE.CapsuleGeometry(0.01 * s, 0.13 * s, 2, 4), skin);
      fg.position.set((f - 1.5) * 0.022 * s, -0.08 * s, 0.01 * s);
      fg.rotation.x = 0.2;
      handG.add(fg);
    }
    arms.push({ sh, elbow, side });
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11 * s, -0.04 * s, 0);
    hips.add(hip);
    const thigh = limb(legLen, 0.075 * s, 0.055 * s, skin);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -legLen;
    thigh.add(knee);
    const shin = limb(legLen * 0.98, 0.055 * s, 0.04 * s, skin);
    knee.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.05 * s, 0.22 * s), skin);
    foot.position.set(0, -legLen * 0.98, 0.06 * s);
    knee.add(foot);
    legs.push({ hip, knee, side });
  }
  root.traverse((m) => {
    if (m.isMesh) m.castShadow = false;
  });
  return { root, hips, spine, neck, head, arms, legs, eyes, eyeMat, mouth, teeth, hipsY: hips.position.y };
}

function buildSmiler() {
  if (!smilerTex) smilerTex = smilerFace();
  const root = new THREE.Group();
  const shade = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  shade.position.y = 1.5;
  shade.scale.set(1, 1.3, 1);
  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: smilerTex, transparent: true, depthWrite: false, fog: false }));
  face.scale.set(1.2, 1.2, 1);
  face.position.y = 1.6;
  face.renderOrder = 5;
  root.add(shade, face);
  return { root, face, shade };
}

export class Entity {
  // kind: 'howler' | 'pale' | 'smiler'
  constructor(game, kind, x, z, opts = {}) {
    this.game = game;
    this.kind = kind;
    this.grid = game.grid;
    this.opts = opts;
    if (kind === 'smiler') {
      this.model = buildSmiler();
      this.walkSpeed = 1.4;
      this.chaseSpeed = opts.chaseSpeed ?? 3.9;
      this.sight = 11;
      this.radius = 0.45;
    } else if (kind === 'pale') {
      this.model = buildHumanoid({ color: 0xb9b4a6, dark: 0x2a2420, eyes: 0x111111, scale: 0.95, armLen: 1.2 });
      this.walkSpeed = 1.6;
      this.chaseSpeed = opts.chaseSpeed ?? 4.4;
      this.sight = 14;
      this.radius = 0.35;
    } else {
      this.model = buildHumanoid({ color: 0x4a2a1c, dark: 0x120806, eyes: 0xffffff, scale: 1.1, armLen: 1.15 });
      this.walkSpeed = 1.8;
      this.chaseSpeed = opts.chaseSpeed ?? 4.7;
      this.sight = 16;
      this.radius = 0.35;
    }
    this.pos = this.grid.center(x, z);
    this.model.root.position.copy(this.pos);
    game.scene.add(this.model.root);
    this.yaw = Math.random() * Math.PI * 2;
    this.state = opts.state ?? 'patrol';
    this.target = null;
    this.lastSeen = null;
    this.searchT = 0;
    this.phase = Math.random() * 10;
    this.speed = 0;
    this.repath = 0;
    this.growlT = 3 + Math.random() * 5;
    this.active = opts.active ?? true;
    this.visibleAlpha = 1;
    this.id = `ent${Math.random().toString(36).slice(2, 7)}`;
    this.twitch = 0;
    audio.loop(this.id, 'breath');
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }

  // Escolhe uma célula alcançável qualquer para patrulhar.
  pickPatrol() {
    const cells = this.game.patrolCells;
    if (!cells || !cells.length) return null;
    for (let i = 0; i < 12; i++) {
      const c = cells[Math.floor(Math.random() * cells.length)];
      const d = Math.hypot(c[0] - this.pos.x / this.grid.cs, c[1] - this.pos.z / this.grid.cs);
      if (d > 4 && d < 30) return c;
    }
    return cells[Math.floor(Math.random() * cells.length)];
  }

  canSee(player) {
    const d = this.pos.distanceTo(player.pos);
    let range = this.sight;
    if (this.kind === 'smiler') range = player.light ? 16 : 8;
    if (player.crouching) range *= 0.65;
    if (d > range) return false;
    // Campo de visão de ~200°, mas sente quem está muito perto.
    if (this.kind !== 'smiler' && d > 3.5) {
      const a = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      if (Math.abs(angleDiff(this.yaw, a)) > 1.75) return false;
    }
    return this.grid.los(this.pos, player.pos);
  }

  hears(player) {
    if (!player.running) return false;
    return this.pos.distanceTo(player.pos) < 9;
  }

  update(dt, player) {
    const m = this.model;
    const g = this.grid;
    const toPlayer = this.pos.distanceTo(player.pos);

    if (!this.active) {
      m.root.visible = false;
      audio.loopSet(this.id, 0);
      return;
    }
    m.root.visible = true;

    // ---- decisão ----
    const sees = player.alive && this.canSee(player);
    if (this.opts.relentless) this.state = 'chase';
    else if (sees || (this.hears(player) && this.state !== 'chase')) {
      if (this.state !== 'chase') {
        audio.screech(clamp(1 - toPlayer / 25, 0.15, 1), this.panTo(player));
        this.game.onSpotted(this);
      }
      this.state = 'chase';
      this.lastSeen = player.pos.clone();
      this.searchT = 6;
    } else if (this.state === 'chase') {
      this.searchT -= dt;
      if (this.searchT <= 0) {
        this.state = 'patrol';
        this.target = null;
      }
    }

    // ---- destino ----
    let goal = null;
    let speed = this.walkSpeed;
    if (this.state === 'chase') {
      speed = this.chaseSpeed * (this.opts.speedScale ? this.opts.speedScale(toPlayer) : 1);
      if (sees && toPlayer < 6) goal = player.pos.clone();
      else {
        // Segue o campo de distâncias até o jogador (ou até onde foi visto).
        this.repath -= dt;
        const field = this.game.playerField;
        const [cx, cz] = g.cellOf(this.pos);
        const useField = this.opts.relentless || sees || (this.lastSeen && this.lastSeen.distanceTo(player.pos) < 4);
        if (useField && field) {
          const nxt = g.stepToward(field, cx, cz);
          goal = nxt ? g.center(nxt[0], nxt[1]) : player.pos.clone();
        } else if (this.lastSeen) {
          if (this.repath <= 0 || !this.searchField) {
            const [lx, lz] = g.cellOf(this.lastSeen);
            this.searchField = g.bfs(lx, lz, (x, z) => g.walkableForEntity(x, z));
            this.repath = 1;
          }
          const nxt = g.stepToward(this.searchField, cx, cz);
          goal = nxt ? g.center(nxt[0], nxt[1]) : this.lastSeen.clone();
        }
      }
    } else {
      if (!this.target || this.pos.distanceTo(this.targetPos) < 0.6) {
        this.target = this.pickPatrol();
        if (this.target) {
          this.targetPos = g.center(this.target[0], this.target[1]);
          this.patrolField = g.bfs(this.target[0], this.target[1], (x, z) => g.walkableForEntity(x, z));
        }
      }
      if (this.target) {
        const [cx, cz] = g.cellOf(this.pos);
        const nxt = g.stepToward(this.patrolField, cx, cz);
        goal = nxt ? g.center(nxt[0], nxt[1]) : this.targetPos;
        if (!nxt && g.cellOf(this.targetPos).join() === `${cx},${cz}`) goal = this.targetPos;
      }
      // Smilers só existem no escuro.
      if (this.kind === 'smiler') speed = this.walkSpeed;
    }

    // ---- movimento ----
    // Sob as vigas baixas a entidade precisa se curvar.
    const [mx, mz] = g.cellOf(this.pos);
    if (g.get(mx, mz) === LOW) speed *= 0.6;
    if (goal) {
      const dx = goal.x - this.pos.x;
      const dz = goal.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const want = Math.atan2(dx, dz);
        this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * 8);
        this.speed = damp(this.speed, speed, 4, dt);
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      } else this.speed = damp(this.speed, 0, 6, dt);
    } else this.speed = damp(this.speed, 0, 6, dt);
    g.collide(this.pos, this.radius * 0.8, true, true);

    // Abre portas no caminho.
    const [ex, ez] = g.cellOf(this.pos);
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const door = g.doorAt(ex + ox, ez + oz);
      if (door && !door.open && !door.locked && this.speed > 0.3) {
        door.open = true;
        audio.door();
      }
    }

    // ---- som ----
    this.growlT -= dt;
    if (this.growlT <= 0 && toPlayer < 30) {
      this.growlT = this.state === 'chase' ? 2.5 + Math.random() * 2 : 6 + Math.random() * 8;
      const v = clamp(1 - toPlayer / 30, 0, 1);
      if (this.kind === 'smiler') audio.screech(v * 0.5, this.panTo(player));
      else audio.growl(v, this.panTo(player));
    }
    audio.loopSet(this.id, clamp(1 - toPlayer / 14, 0, 1) * 0.35, this.panTo(player));

    // ---- matar ----
    if (player.alive && toPlayer < (this.kind === 'smiler' ? 1.1 : 1.0) + this.radius * 0.5) {
      this.game.onCaught(this);
    }

    this.animate(dt);
  }

  panTo(player) {
    const a = Math.atan2(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    // Direita do jogador = yaw - 90°.
    return Math.sin(angleDiff(player.yaw + Math.PI, a)) * -1 * 0.9;
  }

  animate(dt) {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    const t = performance.now() / 1000;
    if (this.kind === 'smiler') {
      m.root.position.y = Math.sin(t * 1.3 + this.phase) * 0.12;
      m.face.material.rotation = Math.sin(t * 7) * 0.03;
      const flick = Math.random() < 0.03 ? 0.3 : 1;
      m.face.material.opacity = this.visibleAlpha * flick;
      m.shade.material.opacity = 0.75 * this.visibleAlpha;
      return;
    }
    const sp = this.speed;
    const run = clamp((sp - 2) / 2.5, 0, 1);
    this.phase += dt * (sp * 1.6 + 0.0001);
    const p = this.phase;
    const amp = clamp(sp / 2, 0, 1) * (0.55 + run * 0.35);
    for (const L of m.legs) {
      const s = Math.sin(p + (L.side > 0 ? 0 : Math.PI));
      L.hip.rotation.x = -s * amp;
      L.knee.rotation.x = Math.max(0, Math.cos(p + (L.side > 0 ? 0 : Math.PI))) * amp * 1.4;
    }
    m.hips.position.y = m.hipsY - Math.abs(Math.sin(p)) * 0.06 * amp - run * 0.12;
    // Corrida: tronco inclinado e braços estendidos para frente (agarrar).
    const hunch = this.kind === 'pale' ? 0.35 : 0.1;
    m.spine.rotation.x = damp(m.spine.rotation.x, hunch + run * 0.45, 5, dt);
    m.spine.rotation.z = Math.sin(p) * 0.05 * amp;
    for (const A of m.arms) {
      const s = Math.sin(p + (A.side > 0 ? Math.PI : 0));
      const swing = s * amp * 0.8;
      const reach = run * (-1.35 + Math.sin(t * 13 + A.side) * 0.12);
      A.sh.rotation.x = damp(A.sh.rotation.x, swing * (1 - run) + reach, 10, dt);
      A.sh.rotation.z = A.side * (0.12 + run * 0.1) + Math.sin(t * 0.8 + A.side) * 0.03;
      A.elbow.rotation.x = -0.25 - run * 0.2 - Math.max(0, s) * 0.4 * amp * (1 - run);
    }
    // Cabeça com espasmos.
    this.twitch -= dt;
    if (this.twitch <= 0) {
      this.twitch = 0.2 + Math.random() * (this.state === 'chase' ? 0.6 : 2.5);
      this.twitchTarget = [(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.9];
    }
    const tt = this.twitchTarget || [0, 0];
    m.neck.rotation.x = damp(m.neck.rotation.x, -run * 0.5 + tt[0] * 0.4, 20, dt);
    m.head.rotation.z = damp(m.head.rotation.z, tt[1], 18, dt);
    m.eyeMat.color.setScalar(this.state === 'chase' ? 1 : 0.75);
    const open = this.mouthOpen ?? (this.state === 'chase' ? 2.2 + Math.sin(t * 9) * 0.8 : 1);
    m.mouth.scale.y = damp(m.mouth.scale.y, open, 12, dt);
    m.mouth.position.y = -0.015 * (m.mouth.scale.y - 1) * 0.5;
  }
}
