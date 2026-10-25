// Nível 48 — "Névoa Densa": um descampado plano engolido por uma névoa cinza
// tão espessa que não se enxerga a três metros. Classe misteriosa: ninguém
// sabe o que mais anda aqui. Silhuetas aparecem e somem, passos imitam os seus,
// um sino toca em algum lugar. A única referência é uma luz vermelha piscando
// ao longe — lá fica um batente de porta sozinho no meio do nada (a saída).
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { pushCircle } from './grid.js';
import { TEX } from '../textures.js';
import { damp, lerp, mulberry32, TAU } from '../util.js';
import { dotTex } from './level177_common.js';

const DOOR = { x: -60, z: -230 };
const R_WALK = 420;

function groundH(x, z) {
  return 0.25 * Math.sin(x * 0.05 + 1) * Math.sin(z * 0.04) + 0.12 * Math.sin(x * 0.13 - z * 0.11);
}

function groundTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#4a4c48';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(48);
  const k = S / 512;
  for (let i = 0; i < (S * S) / 30; i++) {
    const l = 22 + r() * 22;
    x.fillStyle = `hsl(${80 + r() * 40},${6 + r() * 10}%,${l}%)`;
    x.fillRect(r() * S, r() * S, (1 + r() * 2) * k, (1 + r() * 2) * k);
  }
  // capim seco e ralo
  for (let i = 0; i < 2500 * k * k; i++) {
    const px = r() * S;
    const py = r() * S;
    x.strokeStyle = `hsla(${60 + r() * 30},18%,${35 + r() * 20}%,0.6)`;
    x.lineWidth = k;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + (r() - 0.5) * 6 * k, py - (3 + r() * 6) * k);
    x.stroke();
  }
  return TEX.toTex(c);
}

export class Level48 extends OutdoorLevel {
  constructor(game) {
    super(game, { P: 100, walkSpeed: 2.1, camFar: 900 });
    this.num = 48;
    this.time = 0;
    this.colliders = [];
    this.circles = [];
    this.geos = [];
    this.mats = [];
    this.texs = [];
    this.blur = 0.12;
    this.look = {
      exposure: 0.95,
      tint: [0.96, 0.98, 1.0],
      sat: 0.35,
      contrast: 0.98,
      lift: [0.04, 0.042, 0.045],
      bloom: 0.35,
      bloomThreshold: 0.85,
      fog: [0.42, 0.44, 0.45],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level48',
      reverb: 2.8,
      sanityDrain: 0.07,
    };
    this.objectives = [{ id: 'luz', text: 'Siga a luz vermelha na névoa' }];
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 0.16);
    this.scene.background = fogC;
    this.hemi = new THREE.HemisphereLight(0xb8bcc0, 0x3a3c38, 1.5);
    this.scene.add(this.hemi);
    this.spawn = { x: 0, z: 0, yaw: Math.atan2(-DOOR.x, -DOOR.z) };
    this.exit = { x: DOOR.x, z: DOOR.z + 1 };
    this.events = { t: 20 };
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  async preload(px, pz, progress) {
    progress(0.3);
    this.makeGround();
    this.makeThings();
    this.makeDoor();
    this.makeShadows();
    this.makeMist();
    this.spawnItems();
    progress(1);
  }

  makeGround() {
    const geo = new THREE.PlaneGeometry(120, 120, 60, 60);
    geo.rotateX(-Math.PI / 2);
    this.geos.push(geo);
    this.groundGeo = geo;
    this.gx = Float32Array.from({ length: geo.attributes.position.count }, (_, i) => geo.attributes.position.getX(i));
    this.gz = Float32Array.from({ length: geo.attributes.position.count }, (_, i) => geo.attributes.position.getZ(i));
    const map = groundTex(Math.min(1024, this.Q.tex));
    map.repeat.set(24, 24);
    this.texs.push(map);
    this.ground = new THREE.Mesh(geo, this.mat(new THREE.MeshStandardMaterial({ map, roughness: 1 })));
    this.scene.add(this.ground);
    this.placeGround(0, 0);
  }

  placeGround(px, pz) {
    const cx = Math.round(px / 20) * 20;
    const cz = Math.round(pz / 20) * 20;
    if (this.gc && this.gc[0] === cx && this.gc[1] === cz) return;
    this.gc = [cx, cz];
    const p = this.groundGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = this.gx[i] + cx;
      const z = this.gz[i] + cz;
      p.setXYZ(i, x, groundH(x, z), z);
    }
    p.needsUpdate = true;
    this.groundGeo.computeVertexNormals();
    this.groundGeo.computeBoundingSphere();
  }

  // Coisas que surgem na névoa: postes de cerca, uma placa ilegível, uma
  // cadeira de escritório, um poste de luz apagado, um carrinho de mercado.
  makeThings() {
    const r = mulberry32(4848);
    const wood = this.mat(new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.95 }));
    const metal = this.mat(new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.5, metalness: 0.6 }));
    const add = (geo, m, x, y, z, ry = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, groundH(x, z) + y, z);
      o.rotation.y = ry;
      this.geos.push(geo);
      this.dynamic.add(o);
      return o;
    };
    // uma cerca velha que acompanha parte do caminho (uma pista, de leve)
    for (let k = 4; k < 60; k++) {
      if (r() < 0.25) continue;
      const t = k / 64;
      const x = lerp(0, DOOR.x, t) + 4 + Math.sin(k * 0.7) * 1.5;
      const z = lerp(0, DOOR.z, t);
      add(new THREE.BoxGeometry(0.12, 1.2, 0.12), wood, x, 0.6, z, r() * 0.3);
      this.circles.push([x, z, 0.12]);
    }
    for (let k = 0; k < 60; k++) {
      const a = r() * TAU;
      const d = 10 + r() * 330;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 100;
      const kind = Math.floor(r() * 4);
      if (kind === 0) {
        add(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), metal, x, 2.5, z);
        add(new THREE.BoxGeometry(0.9, 0.08, 0.08), metal, x - 0.4, 4.95, z);
        this.circles.push([x, z, 0.12]);
      } else if (kind === 1) {
        const s = add(new THREE.BoxGeometry(1.2, 0.8, 0.05), metal, x, 1.6, z, r() * TAU);
        add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), metal, x, 0.8, z);
        s.rotation.z = (r() - 0.5) * 0.3;
        this.circles.push([x, z, 0.1]);
      } else if (kind === 2) {
        add(new THREE.BoxGeometry(0.5, 0.08, 0.5), this.mat(new THREE.MeshStandardMaterial({ color: 0x1a1a1c })), x, 0.48, z);
        add(new THREE.BoxGeometry(0.5, 0.55, 0.08), this.mat(new THREE.MeshStandardMaterial({ color: 0x1a1a1c })), x, 0.8, z + 0.22);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), metal, x, 0.22, z);
        this.circles.push([x, z, 0.3]);
      } else {
        add(new THREE.BoxGeometry(0.15, 2.2, 0.15), wood, x, 1.1, z);
        add(new THREE.BoxGeometry(1.4, 0.15, 0.15), wood, x, 1.6, z);
        this.circles.push([x, z, 0.15]);
      }
    }
  }

  // A saída: um batente de porta sozinho, com uma luz vermelha em cima.
  makeDoor() {
    const g = new THREE.Group();
    const y = groundH(DOOR.x, DOOR.z);
    g.position.set(DOOR.x, y, DOOR.z);
    const frame = this.mat(new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.7 }));
    const dark = this.mat(new THREE.MeshBasicMaterial({ color: 0x050505, fog: false }));
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.18), frame);
      p.position.set(s * 0.6, 1.15, 0);
      g.add(p);
      this.colliders.push([DOOR.x + s * 0.6 - 0.08, DOOR.x + s * 0.6 + 0.08, DOOR.z - 0.1, DOOR.z + 0.1]);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.18), frame);
    top.position.y = 2.3;
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 2.24), dark);
    hole.position.set(0, 1.12, 0);
    g.add(top, hole);
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    this.dot = dotTex();
    this.texs.push(this.dot);
    this.beaconMat = this.mat(new THREE.SpriteMaterial({ map: this.dot, color: new THREE.Color(1.6, 0.08, 0.05), transparent: true, depthWrite: false, depthTest: false, fog: false }));
    this.beacon = new THREE.Sprite(this.beaconMat);
    this.beacon.renderOrder = 10;
    this.scene.add(this.beacon);
    this.beaconLight = new THREE.PointLight(0xff3020, 6, 12, 1.5);
    this.beaconLight.position.set(0, 2.8, 0.5);
    g.add(this.beaconLight);
    this.dynamic.add(g);
    this.doorG = g;
  }

  // Silhuetas na névoa: figuras paradas que somem quando você se aproxima.
  makeShadows() {
    const m = this.mat(new THREE.MeshBasicMaterial({ color: 0x18191a, transparent: true, opacity: 0, depthWrite: false }));
    this.shadeMat = m;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.5, 8), m);
    body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), m);
    head.position.y = 1.85;
    g.add(body, head);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 6), m);
      leg.position.set(s * 0.1, 0.3, 0);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), m);
      arm.position.set(s * 0.3, 1.2, 0);
      g.add(leg, arm);
    }
    g.traverse((o) => o.geometry && this.geos.push(o.geometry));
    g.visible = false;
    this.dynamic.add(g);
    this.shade = { g, on: false, a: 0 };
  }

  // Fiapos de névoa passando bem perto (sprites).
  makeMist() {
    const r = mulberry32(84);
    this.mist = [];
    for (let i = 0; i < 26; i++) {
      const m = this.mat(new THREE.SpriteMaterial({ map: this.dot, color: 0xb0b4b8, transparent: true, opacity: 0.18, depthWrite: false }));
      const s = new THREE.Sprite(m);
      const sz = 4 + r() * 6;
      s.scale.set(sz, sz * 0.5, 1);
      s.userData = { a: r() * TAU, d: 2 + r() * 9, y: 0.4 + r() * 2, v: 0.05 + r() * 0.12 };
      this.dynamic.add(s);
      this.mist.push(s);
    }
  }

  spawnItems() {
    const g = this.game;
    const items = [
      { type: 'note', key: '48:n1', x: 2, z: -6, rot: 0.4 },
      { type: 'water', key: '48:w1', x: lerp(0, DOOR.x, 0.5) + 2.5, z: lerp(0, DOOR.z, 0.5) },
      { type: 'note', key: '48:n2', x: lerp(0, DOOR.x, 0.8) + 3, z: lerp(0, DOOR.z, 0.8), rot: 1.4 },
    ];
    for (const it of items) {
      if (this.taken.has(it.key)) continue;
      it.y = groundH(it.x, it.z) + 0.03;
      it.light = 0.6;
      g.items.spawn(it, this.dynamic);
    }
  }

  // Eventos misteriosos.
  event(player) {
    const g = this.game;
    const p = player.pos;
    const r = Math.random();
    if (r < 0.4 && !this.shade.on) {
      // uma silhueta parada à frente, um pouco de lado
      const a = player.yaw + (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5);
      const d = 5.5 + Math.random() * 2.5;
      const x = p.x - Math.sin(a) * d;
      const z = p.z - Math.cos(a) * d;
      Object.assign(this.shade, { on: true, a: 0, t: 0 });
      this.shade.g.position.set(x, groundH(x, z), z);
      this.shade.g.visible = true;
      g.audio.play('whisper', { gain: 0.08, rate: 0.7, wet: 1.6 });
    } else if (r < 0.65) {
      // passos imitando os seus, atrás
      for (let i = 0; i < 6; i++) g.audio.play(g.audio.B && g.audio.B.step ? g.audio.B.step.grass || 'creak' : 'creak', { gain: 0.18, rate: 0.85, pan: 0, wet: 1.2, when: 0.4 + i * 0.55 });
      if (!this.toldSteps) {
        this.toldSteps = true;
        setTimeout(() => g.level === this && g.hud.message('Passos atrás de você. Quando você para, eles param também.', 4), 2500);
      }
    } else if (r < 0.85) {
      // um sino distante
      g.audio.play('ding', { gain: 0.3, rate: 0.45, wet: 2.5, pan: Math.random() * 2 - 1 });
      if (!this.toldBell) {
        this.toldBell = true;
        g.hud.message('Um sino tocou. Longe. Ou bem perto — na névoa não dá para saber.', 4);
      }
    } else {
      // uma voz chamando um nome que não é o seu
      g.audio.play('whisper', { gain: 0.25, rate: 0.55, wet: 2.2, pan: Math.random() * 2 - 1 });
      g.hud.message('Alguém chama um nome na névoa. Não é o seu. Ou é?', 4);
      g.addSanity(-3);
    }
  }

  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    const t = this.time;
    this.placeGround(p.x, p.z);
    // luz vermelha piscando (o único ponto de referência)
    const on = Math.sin(t * 3.2) > 0.1 ? 1 : 0.15;
    // o farol atravessa a névoa: desenhado a poucos metros da câmera, na direção
    // da luz de verdade (tamanho constante na tela)
    const cp = g.camera.position;
    const top = new THREE.Vector3(DOOR.x, groundH(DOOR.x, DOOR.z) + 3, DOOR.z);
    const dir = top.clone().sub(cp);
    const camD = dir.length();
    const near = Math.min(camD - 0.5, 12);
    this.beacon.position.copy(cp).addScaledVector(dir.normalize(), Math.max(0.5, near));
    this.beaconMat.opacity = on * 0.9;
    this.beacon.scale.setScalar(near * (0.12 + 0.05 * Math.min(1, 30 / camD)) * (0.8 + on * 0.5) + (camD < 12 ? 1.5 : 0));
    this.beaconLight.intensity = 6 * on;
    // névoa abre um pouco perto da porta
    const dd = Math.hypot(p.x - DOOR.x, p.z - DOOR.z);
    this.scene.fog.density = damp(this.scene.fog.density, dd < 25 ? 0.08 : 0.16, 1, dt);
    this.blur = 0.12 + Math.sin(t * 0.5) * 0.04;
    // fiapos de névoa
    for (const s of this.mist) {
      const u = s.userData;
      u.a += u.v * dt;
      s.position.set(p.x + Math.cos(u.a) * u.d, groundH(p.x, p.z) + u.y, p.z + Math.sin(u.a) * u.d);
    }
    // silhueta: some quando você chega perto ou olha demais
    const S = this.shade;
    if (S.on) {
      S.t += dt;
      const d = Math.hypot(p.x - S.g.position.x, p.z - S.g.position.z);
      const fade = d < 3.5 || S.t > 9;
      S.a = damp(S.a, fade ? 0 : 0.85, fade ? 5 : 0.8, dt);
      this.shadeMat.opacity = S.a;
      S.g.lookAt(p.x, S.g.position.y, p.z);
      if (fade && S.a < 0.02) {
        S.on = false;
        S.g.visible = false;
        if (d < 3.5) g.glitch = Math.max(g.glitch, 0.3);
      }
    }
    this.events.t -= dt;
    if (this.events.t <= 0) {
      this.events.t = 16 + Math.random() * 18;
      this.event(player);
    }
    if (t > 3 && !this.toldStart) {
      this.toldStart = true;
      g.hud.message('Névoa. Só névoa, em todas as direções. Lá longe, uma luz vermelha pisca.', 6);
    }
    if (dd < 12 && !this.toldDoor) {
      this.toldDoor = true;
      g.hud.message('Um batente de porta sozinho no descampado. Dentro dele, escuro total.', 5);
    }
    // atravessar o batente
    if (!this.leaving && Math.abs(p.x - DOOR.x) < 0.5 && Math.abs(p.z - DOOR.z) < 0.25) {
      this.leaving = true;
      g.completeObjective('luz', 'Você atravessa o batente. A névoa fica para trás.');
      g.reachExit('noclip', 0.2);
    }
  }

  collide(p, r) {
    const d = Math.hypot(p.x, p.z + 100);
    if (d > R_WALK) {
      p.x *= R_WALK / d;
      p.z = -100 + ((p.z + 100) * R_WALK) / d;
    }
    for (const c of this.circles) {
      const dx = p.x - c[0];
      const dz = p.z - c[1];
      if (Math.abs(dx) > c[2] + 1 || Math.abs(dz) > c[2] + 1) continue;
      const dd = Math.hypot(dx, dz);
      const rr = r + c[2];
      if (dd < rr && dd > 1e-4) {
        p.x = c[0] + (dx / dd) * rr;
        p.z = c[1] + (dz / dd) * rr;
      }
    }
    for (const b of this.colliders) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    return p;
  }

  groundY(x, z) {
    return groundH(x, z);
  }

  surfaceAt() {
    return 'grass';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 0.5;
  }

  interactable() {
    return null;
  }

  navTarget() {
    return this.exit;
  }

  exitEmitter() {
    return { x: DOOR.x, y: 1.5, z: DOOR.z, sound: 'wind', gain: 0.2 };
  }

  dispose() {
    super.dispose();
    this.scene.remove(this.ground, this.hemi, this.beacon);
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
  }
}
