// Itens coletáveis e entidades: Água de Amêndoa, bilhetes, bebedouros,
// Sorridentes (Nível 1) e o Observador que aparece ao longe.
import * as THREE from 'three';
import { bottleLabelTex, noteTex, smilerTex } from './textures.js';
import { NOTES } from './notes.js';
import { clamp, damp } from './util.js';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

// ------------------------------------------------------------ itens
export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
    // garrafa (perfil torneado)
    const prof = [
      [0, 0],
      [0.034, 0],
      [0.037, 0.01],
      [0.037, 0.15],
      [0.03, 0.18],
      [0.014, 0.205],
      [0.013, 0.225],
      [0, 0.225],
    ].map((p) => new THREE.Vector2(p[0], p[1]));
    this.bottleGeo = new THREE.LatheGeometry(prof, 14);
    this.labelGeo = new THREE.CylinderGeometry(0.0375, 0.0375, 0.07, 14, 1, true);
    this.capGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 10);
    this.noteGeo = new THREE.PlaneGeometry(0.21, 0.27);
    this.labelTex = bottleLabelTex();
    this.noteTex = noteTex();
    this.noteIdx = 0;
  }

  litMat(params, light) {
    const m = new THREE.MeshStandardMaterial(params);
    if (light !== undefined) {
      const k = clamp(light, 0, 2) * 0.55;
      m.emissive = m.color.clone().multiplyScalar(k);
      if (params.map) m.emissiveMap = params.map;
    }
    return m;
  }

  spawn(it, parent) {
    it.dead = false;
    this.list.push(it);
    if (it.noMesh) return;
    const y = it.y || 0;
    if (it.type === 'water') {
      const g = new THREE.Group();
      const body = new THREE.Mesh(this.bottleGeo, this.litMat({ color: 0xe9e1cf, roughness: 0.15, metalness: 0 }, it.light));
      const label = new THREE.Mesh(this.labelGeo, this.litMat({ map: this.labelTex, roughness: 0.6 }, it.light));
      label.position.y = 0.09;
      const cap = new THREE.Mesh(this.capGeo, this.litMat({ color: 0xf5f5f0, roughness: 0.4 }, it.light));
      cap.position.y = 0.232;
      g.add(body, label, cap);
      g.position.set(it.x, y, it.z);
      g.rotation.y = (it.x * 7.3 + it.z) % 6.28;
      it.mesh = g;
    } else if (it.type === 'note') {
      const m = new THREE.Mesh(this.noteGeo, this.litMat({ map: this.noteTex, roughness: 0.9 }, it.light));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = it.rot || 0;
      m.position.set(it.x, y + 0.004, it.z);
      it.mesh = m;
    }
    if (it.mesh) {
      it.mesh.traverse((o) => (o.castShadow = o.receiveShadow = false));
      parent.add(it.mesh);
    }
  }

  clear() {
    this.list = [];
  }

  // Item mais próximo ao alcance (e na direção do olhar).
  nearest(player) {
    this.list = this.list.filter((i) => !i.dead && !i.used);
    let best = null;
    let bd = 1e9;
    player.forward(_f);
    for (const it of this.list) {
      const dx = it.x - player.pos.x;
      const dz = it.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.7) continue;
      const dot = (dx * _f.x + dz * _f.z) / Math.max(d, 0.01) / Math.max(Math.hypot(_f.x, _f.z), 0.01);
      if (d > 0.9 && dot < 0.55) continue;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  label(it) {
    if (it.type === 'water') return 'Beber Água de Amêndoa';
    if (it.type === 'note') return 'Ler o bilhete';
    if (it.type === 'cooler') return 'Beber água do bebedouro';
    return 'Usar';
  }

  use(it) {
    const g = this.game;
    if (it.type === 'water') {
      g.addSanity(38);
      g.audio.drink();
      g.hud.message('Água de Amêndoa: a mente clareia. (+Sanidade)');
      this.remove(it);
    } else if (it.type === 'cooler') {
      g.addSanity(22);
      g.audio.drink();
      g.hud.message('A água é gelada e limpa. (+Sanidade)');
      it.used = true;
      g.level.taken.add(it.key);
    } else if (it.type === 'note') {
      const list = NOTES[g.levelInfo.num] || NOTES[0];
      const text = list[g.notesRead % list.length];
      g.notesRead++;
      g.audio.paper();
      g.hud.showNote(text);
      g.addSanity(4);
      this.remove(it);
    }
  }

  remove(it) {
    it.used = true;
    this.game.level.taken.add(it.key);
    if (it.mesh && it.mesh.parent) it.mesh.parent.remove(it.mesh);
  }
}

// ------------------------------------------------------------ Sorridentes
export class Smilers {
  constructor(game) {
    this.game = game;
    this.tex = smilerTex();
    this.pool = [];
    this.timer = 12;
    this.cool = 0;
  }

  make() {
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      color: new THREE.Color(3, 3, 3),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(1.1, 1.1, 1);
    this.game.scene.add(s);
    return { sprite: s, x: 0, z: 0, active: false, lit: 0, alpha: 0, flee: 0, stuck: 0 };
  }

  reset() {
    for (const s of this.pool) {
      s.active = false;
      s.sprite.visible = false;
    }
    this.timer = 14;
  }

  dispose() {
    for (const s of this.pool) {
      this.game.scene.remove(s.sprite);
      s.sprite.material.dispose();
    }
    this.pool = [];
  }

  update(dt, player, level, st) {
    const g = this.game;
    const dark = (x, z) => level.lightLevel(x, z) * g.power;
    // tenta surgir quando o jogador está perto do escuro ou sem energia
    this.timer -= dt;
    const active = this.pool.filter((s) => s.active);
    const here = dark(player.pos.x, player.pos.z);
    if (this.timer <= 0 && active.length < (g.power < 0.5 ? 2 : 1)) {
      this.timer = 6 + Math.random() * 10;
      if (here < 0.45 || g.power < 0.5) this.trySpawn(player, level, dark);
    }
    let closest = null;
    let cd = 1e9;
    player.forward(_f);
    const fl = Math.hypot(_f.x, _f.z) || 1;
    for (const s of this.pool) {
      if (!s.active) continue;
      const dx = s.x - player.pos.x;
      const dz = s.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      // iluminado pela lanterna?
      const dot = (-dx * player.flashDir.x - dz * player.flashDir.z) / Math.max(d, 0.01) / Math.max(Math.hypot(player.flashDir.x, player.flashDir.z), 0.01);
      const inBeam = player.flashLevel > 0.5 && d < 17 && -dot > Math.cos(0.5) && level.los(player.pos.x, player.pos.z, s.x, s.z, 1.5);
      const lightHere = dark(s.x, s.z);
      s.lit = inBeam ? s.lit + dt : Math.max(0, s.lit - dt * 0.5);
      if (s.lit > 0.5 && !s.flee) {
        s.flee = 1;
        g.audio.hiss();
      }
      if (s.flee) {
        // recua e some
        const k = 2.4 * dt;
        s.x += (dx / d) * k;
        s.z += (dz / d) * k;
        s.alpha = damp(s.alpha, 0, 3, dt);
        if (s.alpha < 0.03) this.despawn(s);
      } else {
        const sp = (g.power < 0.5 ? 2.3 : 1.25) * (inBeam ? 0.15 : 1);
        const nx = s.x - (dx / d) * sp * dt;
        const nz = s.z - (dz / d) * sp * dt;
        // não entra em áreas iluminadas
        if (dark(nx, nz) < 0.32 || g.power < 0.5) {
          const p = { x: nx, z: nz };
          level.collide(p, 0.3);
          const movedd = Math.hypot(p.x - s.x, p.z - s.z);
          s.stuck = movedd < sp * dt * 0.3 ? s.stuck + dt : 0;
          s.x = p.x;
          s.z = p.z;
        } else s.stuck += dt;
        if (s.stuck > 6) this.despawn(s);
        const vis = clamp(1 - lightHere * 2.2, 0.08, 1);
        s.alpha = damp(s.alpha, vis, 2, dt);
        if (d < 1.15) {
          this.despawn(s);
          g.caught();
          continue;
        }
      }
      s.sprite.position.set(s.x, 1.62 + Math.sin(g.time * 1.3 + s.x) * 0.03, s.z);
      s.sprite.material.opacity = s.alpha;
      const facing = (dx * _f.x + dz * _f.z) / Math.max(d, 0.01) / fl;
      if (facing > 0.8 && s.alpha > 0.3 && d < 22 && !s.seen) {
        s.seen = true;
        g.addSanity(-6);
        g.audio.sting();
        g.vibrate(60);
      }
      if (d < cd) {
        cd = d;
        closest = s;
      }
    }
    if (closest && !closest.flee) {
      st.growl = { x: closest.x, z: closest.z, v: clamp(1 - cd / 18, 0, 1) * 0.6 };
      st.fear = clamp(1 - cd / 14, 0, 1);
      g.sanityDrainExtra = st.fear * 0.8;
    } else {
      st.growl = null;
      st.fear = 0;
      g.sanityDrainExtra = 0;
    }
  }

  trySpawn(player, level, dark) {
    for (let i = 0; i < 14; i++) {
      const a = player.yaw + Math.PI + (Math.random() - 0.5) * 3.6;
      const r = 9 + Math.random() * 8;
      const x = player.pos.x - Math.sin(a) * r;
      const z = player.pos.z - Math.cos(a) * r;
      if (dark(x, z) > 0.12) continue;
      const p = { x, z };
      level.collide(p, 0.35);
      if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
      let s = this.pool.find((q) => !q.active);
      if (!s) {
        s = this.make();
        this.pool.push(s);
      }
      Object.assign(s, { x, z, active: true, lit: 0, alpha: 0, flee: 0, stuck: 0, seen: false });
      s.sprite.visible = true;
      return true;
    }
    return false;
  }

  despawn(s) {
    s.active = false;
    s.sprite.visible = false;
    s.sprite.material.opacity = 0;
  }
}

// ------------------------------------------------------------ Observador
export class Watcher {
  constructor(game, opts = {}) {
    this.game = game;
    this.near = opts.near || 14;
    this.far = opts.far || 26;
    this.timer = opts.first || 40;
    this.gap = opts.gap || 50;
    const mat = new THREE.MeshBasicMaterial({ color: 0x050505, fog: true });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.05, 4, 8), mat);
    body.position.y = 1.0;
    body.scale.z = 0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mat);
    head.position.y = 1.78;
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.82, 3, 6), mat);
    armL.position.set(-0.22, 1.08, 0);
    armL.rotation.z = 0.06;
    const armR = armL.clone();
    armR.position.x = 0.22;
    armR.rotation.z = -0.06;
    g.add(body, head, armL, armR);
    g.visible = false;
    game.scene.add(g);
    this.mesh = g;
    this.state = 0;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
  }

  update(dt, player, level) {
    const g = this.game;
    const m = this.mesh;
    player.forward(_f);
    if (this.state === 0) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 6;
      // aparece à frente, no limite da visão
      for (let i = 0; i < 10; i++) {
        const a = player.yaw + (Math.random() - 0.5) * 1.1;
        const r = this.near + Math.random() * (this.far - this.near);
        const x = player.pos.x - Math.sin(a) * r;
        const z = player.pos.z - Math.cos(a) * r;
        const p = { x, z };
        level.collide(p, 0.4);
        if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
        if (!level.los(player.pos.x, player.pos.z, x, z, 1.5)) continue;
        if (level.lightLevel && level.lightLevel(x, z) < 0.15) continue;
        m.position.set(x, level.groundY ? level.groundY(x, z) : 0, z);
        m.lookAt(player.pos.x, m.position.y, player.pos.z);
        m.visible = true;
        this.state = 1;
        this.seenT = 0;
        this.life = 0;
        return;
      }
    } else {
      this.life += dt;
      const dx = m.position.x - player.pos.x;
      const dz = m.position.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      const dot = (dx * _f.x + dz * _f.z) / Math.max(d, 0.01) / (Math.hypot(_f.x, _f.z) || 1);
      const inView = dot > 0.82;
      if (inView) {
        this.seenT += dt;
        if (this.seenT > 0.6 && !this.stung) {
          this.stung = true;
          g.audio.sting();
          g.addSanity(-4);
        }
      }
      m.lookAt(player.pos.x, m.position.y, player.pos.z);
      // some quando o jogador se aproxima ou desvia o olhar depois de vê-lo
      if (d < this.near * 0.55 || (this.seenT > 1.2 && !inView) || this.life > 30) {
        m.visible = false;
        this.state = 0;
        this.stung = false;
        this.timer = this.gap * (0.6 + Math.random() * 0.8);
      }
    }
  }
}
