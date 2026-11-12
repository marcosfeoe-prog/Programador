// Jogador: câmera por cima do ombro, mira com laser, tiros com zonas de acerto, faca,
// chute de contexto, recarga, troca de arma, granadas, cura, dano e morte.
import * as THREE from 'three';
import { Humanoid, BOX, CYL, charMat } from './rig.js';
import { makePistol, makeShotgun, makeKnife } from './models.js';
import { tex } from './textures.js';
import { clamp, lerp, damp, dampAngle, rand, noise1, easeInOut } from './util.js';
import { raycastAll } from './combat.js';
import { ARENA } from './world.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Pistola P-9', mag: 12, dmg: 34, rate: 0.24, reload: 1.35, pellets: 1, spread: 0, range: 90, recoil: 0.024, noise: 32, ammo: 'pistol', shake: 0.05 },
  shotgun: { id: 'shotgun', name: 'Escopeta', mag: 6, dmg: 16, rate: 0.95, reload: 0.55, pellets: 9, spread: 0.075, range: 34, recoil: 0.08, noise: 42, ammo: 'shotgun', shake: 0.22 },
};

const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const Q_NAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qHand = new THREE.Quaternion();
const _qAim = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _o = { x: 0, y: 0, z: 0 };
const _d = { x: 0, y: 0, z: 0 };
const _p = { x: 0, z: 0 };
const PART_ORDER = ['arm', 'leg', 'body', 'core', 'head'];

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(0, 0, -18);
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, 1);
    this.camDir = new THREE.Vector3(0, 0, 1);
    this.pivot = new THREE.Vector3();
    this.muzzlePos = new THREE.Vector3();
    this.laserPos = new THREE.Vector3();
    this.radius = 0.35;
    this.rig = new Humanoid({
      skin: 0xc49a82,
      shirt: 0x6a4a34,
      shirtKind: 'leather',
      pants: 0x3c4a60,
      shoes: 0x17130f,
      hair: 0x2a1e16,
      hairStyle: 'short',
      longSleeves: true,
    });
    const R = this.rig,
      j = R.j;
    const strap = charMat(0x1c1612, 'leather');
    R.part(j.spine, BOX(0.06, 0.62, 0.02), strap, 0.02, 0.33, 0.123, 0, 0, 0.62);
    R.part(j.spine, BOX(0.06, 0.62, 0.02), strap, 0.0, 0.33, -0.123, 0, 0, -0.62);
    R.part(j.spine, BOX(0.11, 0.16, 0.06), strap, -0.17, 0.12, 0.0, 0, 0, 0);
    R.part(j.spine, CYL(0.028, 0.028, 0.11, 8), charMat(0x151515, 'leather'), 0.11, 0.43, 0.15, Math.PI / 2);
    R.part(j.spine, CYL(0.024, 0.024, 0.01, 8), charMat(0xfff2d0, 'glow'), 0.11, 0.43, 0.206, Math.PI / 2).castShadow = false;
    R.part(j.hips, BOX(0.36, 0.06, 0.22), strap, 0, 0.06, 0);
    R.optimize();
    G.scene.add(R.root);

    this.guns = { pistol: makePistol(), shotgun: makeShotgun() };
    this.gunMount = new THREE.Group();
    R.mountR.add(this.gunMount);
    for (const k in this.guns) this.gunMount.add(this.guns[k]);
    this.knife = makeKnife();
    R.mountR.add(this.knife);
    this.knife.visible = false;

    const lg = new THREE.CylinderGeometry(0.0032, 0.0032, 1, 4, 1, true);
    lg.translate(0, 0.5, 0);
    this.laserMat = new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.laser = new THREE.Mesh(lg, this.laserMat);
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.laser.renderOrder = 6;
    G.scene.add(this.laser);
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('glow'), color: 0xff3a24, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    this.dot.visible = false;
    this.dot.renderOrder = 7;
    G.scene.add(this.dot);

    this.flash = new THREE.SpotLight(0xffeedd, 40, 34, 0.48, 0.55, 1.25);
    this.flash.shadow.camera.near = 0.6;
    this.flash.shadow.camera.far = 34;
    this.flash.shadow.bias = -0.0004;
    this.flash.shadow.mapSize.set(1024, 1024);
    G.scene.add(this.flash);
    G.scene.add(this.flash.target);
    // luz fraca atrás da câmera: deixa as costas do personagem legíveis no escuro
    this.fill = new THREE.PointLight(0xa8b8d8, 6, 8, 2);
    G.scene.add(this.fill);
    this.reset();
  }

  reset() {
    this.pos.set(0, 0, -18);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = -0.06;
    this.maxHp = 100;
    this.hp = 100;
    this.weapons = { pistol: { owned: true, mag: 12 }, shotgun: { owned: false, mag: 0 } };
    this.ammo = { pistol: 24, shotgun: 0 };
    this.items = { tonic: 1, medkit: 0, grenade: 0 };
    this.keys = {};
    this.notes = [];
    this.current = 'pistol';
    this.clearTransient();
  }

  clearTransient() {
    this.aimBlend = 0;
    this.aiming = false;
    this.action = null;
    this.fireCd = 0;
    this.fireBuffer = 0;
    this.invuln = 1;
    this.dead = false;
    this.deathT = 0;
    this.deathNotified = false;
    this.turnLeft = 0;
    this.phase = 0;
    this.lastStep = 0;
    this.running = false;
    this.t = 0;
    this.camDist = 2.6;
    this.fov = 62;
    this.recoil = 0;
    this.pendingEject = 0;
    this.autoReload = 0;
    this.burnSound = 0;
    this.kickTarget = null;
    this.hidden = false;
    this.rig.j.head.visible = true;
    this.rig.resetPose();
    this.rig.snap();
    this.updateGunVisibility();
    this.laser.visible = false;
    this.dot.visible = false;
  }

  serialize() {
    return {
      hp: Math.max(this.hp, 40),
      weapons: JSON.parse(JSON.stringify(this.weapons)),
      ammo: { ...this.ammo },
      items: { ...this.items },
      keys: { ...this.keys },
      notes: [...this.notes],
      current: this.current,
    };
  }

  restore(d, pos) {
    this.hp = clamp(d.hp, 1, this.maxHp);
    this.weapons = JSON.parse(JSON.stringify(d.weapons));
    this.ammo = { ...d.ammo };
    this.items = { ...d.items };
    this.keys = { ...d.keys };
    this.notes = [...d.notes];
    this.current = this.weapons[d.current] && this.weapons[d.current].owned ? d.current : 'pistol';
    this.pos.set(pos.x, 0, pos.z);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.yaw = this.camYaw = pos.yaw || 0;
    this.camPitch = -0.06;
    this.clearTransient();
  }

  get weapon() {
    return WEAPONS[this.current];
  }

  updateGunVisibility() {
    for (const k in this.guns) this.guns[k].visible = k === this.current && !(this.action && this.action.type === 'knife');
    this.knife.visible = !!(this.action && this.action.type === 'knife');
  }

  resolveWorld() {
    _p.x = this.pos.x;
    _p.z = this.pos.z;
    this.G.col.resolve(_p, this.radius, 0.1, 1.7);
    this.pos.x = _p.x;
    this.pos.z = _p.z;
  }

  startAction(type, dur, data = {}) {
    this.action = { type, t: 0, dur, fired: false, ...data };
    this.updateGunVisibility();
  }

  canAim() {
    const a = this.action;
    return !this.dead && (!a || a.type === 'reload' || a.type === 'reloadSG');
  }

  // ------------------------------------------------------------------ atualização
  update(dt) {
    const G = this.G,
      I = G.input,
      S = G.settings;
    this.t += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.fireBuffer > 0) this.fireBuffer -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.burnSound > 0) this.burnSound -= dt;
    if (this.autoReload > 0) {
      this.autoReload -= dt;
      if (this.autoReload <= 0 && !this.action && !this.dead) this.startReload();
    }

    if (this.dead) {
      this.deathT += dt;
      this.aimBlend = damp(this.aimBlend, 0, 8, dt);
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      this.animate(dt, 0);
      this.updateCamera(dt);
      this.laser.visible = this.dot.visible = false;
      this.updateFlashlight();
      if (this.deathT > 2.8 && !this.deathNotified) {
        this.deathNotified = true;
        G.game.onPlayerDeath();
      }
      return;
    }

    // ---- olhar
    const look = I.consumeLook(dt);
    const a = this.action;
    const stunned = a && a.type === 'knockdown';
    if (!stunned) {
      const sens = (I.touchMode ? 0.0034 : 0.0022) * (I.touchMode ? S.touchSens : S.sens) * (this.aimBlend > 0.5 ? 0.62 : 1);
      this.camYaw -= look.x * sens;
      this.camPitch -= look.y * sens * (S.invertY ? -1 : 1);
      const turn = (I.isHeld('turnL') ? 1 : 0) - (I.isHeld('turnR') ? 1 : 0);
      this.camYaw += turn * 2.3 * dt * (this.aimBlend > 0.5 ? 0.45 : 1);
    }
    const pmin = lerp(-0.55, -0.85, this.aimBlend),
      pmax = lerp(0.42, 0.72, this.aimBlend);
    this.camPitch = clamp(this.camPitch, pmin, pmax);
    if (this.recoil > 0) this.camPitch = Math.min(pmax, this.camPitch);

    // ---- giro rápido
    if (I.pressed('turn180') && !this.action && this.aimBlend < 0.3 && this.turnLeft <= 0) this.turnLeft = Math.PI;
    if (this.turnLeft > 0) {
      const step = Math.min(this.turnLeft, dt * 11);
      this.camYaw += step;
      this.yaw += step;
      this.turnLeft -= step;
    }

    // ---- mira
    this.aiming = I.isHeld('aim') && this.canAim();
    this.aimBlend = damp(this.aimBlend, this.aiming ? 1 : 0, 11, dt);
    if (I.touchMode && S.aimAssist && this.aimBlend > 0.6) this.aimAssist(dt);

    // ---- ações iniciadas pelo jogador
    this.kickTarget = !this.action && !this.dead ? G.enemies.findKickable(this) : null;
    if (I.pressed('fire')) this.fireBuffer = 0.28;
    if (!this.action) {
      if (this.kickTarget && I.pressed('act')) {
        I.consume('act');
        this.kick(this.kickTarget);
      } else if (I.pressed('knife') || (I.pressed('fire') && !this.aiming && this.aimBlend < 0.3)) {
        this.fireBuffer = 0;
        this.startKnife();
      } else if (I.pressed('reload')) this.startReload();
      else if (I.pressed('w1')) this.switchTo('pistol');
      else if (I.pressed('w2')) this.switchTo('shotgun');
      else if (I.wheel || I.pressed('wnext')) this.switchTo(this.current === 'pistol' ? 'shotgun' : 'pistol');
      else if (I.pressed('grenade')) this.startThrow();
      else if (I.pressed('heal')) this.useHeal(false);
    } else if (this.action.type === 'reloadSG' && I.pressed('reload')) {
      /* já recarregando */
    }

    this.progressAction(dt);

    // ---- movimento
    let ix = (I.isHeld('right') ? 1 : 0) - (I.isHeld('left') ? 1 : 0);
    let iz = (I.isHeld('fwd') ? 1 : 0) - (I.isHeld('back') ? 1 : 0);
    if (I.touchMode) {
      ix += I.joy.x;
      iz += I.joy.y;
    }
    const il = Math.hypot(ix, iz);
    if (il > 1) {
      ix /= il;
      iz /= il;
    }
    const fx = Math.sin(this.camYaw),
      fz = Math.cos(this.camYaw);
    const rx = -Math.cos(this.camYaw),
      rz = Math.sin(this.camYaw);
    const mx = fx * iz + rx * ix,
      mz = fz * iz + rz * ix;
    const moving = il > 0.08;
    const act = this.action ? this.action.type : null;
    const touchRun = I.touchMode && il > 0.97;
    this.running = (I.isHeld('run') || touchRun) && moving && this.aimBlend < 0.3 && iz > -0.2 && (!act || act === 'reload' || act === 'reloadSG');
    let speed = this.aimBlend > 0.5 ? 1.25 : this.running ? 5.0 : 3.0;
    if (act === 'reload' || act === 'reloadSG') speed *= this.running ? 0.75 : 0.9;
    else if (act === 'heal') speed *= 0.45;
    else if (act === 'knife' || act === 'throw' || act === 'switch') speed *= 0.5;
    else if (act === 'kick' || act === 'knockdown') speed = 0;
    else if (act === 'hurt') speed *= 0.35;
    if (this.hp < 25) speed *= 0.85;
    const k = Math.min(1, il);
    const tvx = moving ? mx * speed * k : 0,
      tvz = moving ? mz * speed * k : 0;
    this.vel.x = damp(this.vel.x, tvx, 12, dt);
    this.vel.z = damp(this.vel.z, tvz, 12, dt);
    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    const kd = Math.exp(-7 * dt);
    this.knock.multiplyScalar(kd);
    this.resolveWorld();

    // ---- para onde o corpo olha
    if (act === 'kick' && this.action.target) {
      const tg = this.action.target;
      this.yaw = dampAngle(this.yaw, Math.atan2(tg.pos.x - this.pos.x, tg.pos.z - this.pos.z), 14, dt);
    } else if (this.aimBlend > 0.25 || act === 'throw' || act === 'knife') {
      const ay = Math.atan2(this.aimPoint.x - this.pos.x, this.aimPoint.z - this.pos.z);
      const ok = Math.hypot(this.aimPoint.x - this.pos.x, this.aimPoint.z - this.pos.z) > 1.2;
      this.yaw = dampAngle(this.yaw, ok ? ay : this.camYaw, 16, dt);
    } else if (moving && speed > 0) {
      this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 10, dt);
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.animate(dt, hs);
    this.updateCamera(dt);
    this.computeAim(dt, moving);
    this.orientGun();
    this.updateLaser();
    this.updateFlashlight();

    // ---- disparo (depois da mira, para o tiro sair exatamente onde está o ponto vermelho)
    if (this.fireBuffer > 0 && this.aimBlend > 0.82 && this.fireCd <= 0) {
      const a2 = this.action;
      if (!a2 || (a2.type === 'reloadSG' && this.weapons.shotgun.mag > 0)) {
        this.fireBuffer = 0;
        if (a2) this.action = null;
        this.fire();
      } else if (a2.type === 'reload' && this.fireBuffer > 0.2) {
        /* espera a recarga terminar */
      }
    }
    if (this.pendingEject > 0) {
      this.pendingEject -= dt;
      if (this.pendingEject <= 0) this.ejectCasing(true);
    }
    this.footsteps(hs);
  }

  progressAction(dt) {
    const a = this.action;
    if (!a) return;
    const G = this.G;
    a.t += dt;
    switch (a.type) {
      case 'reload':
        if (a.t >= a.dur) {
          const w = WEAPONS.pistol,
            st = this.weapons.pistol;
          const n = Math.min(w.mag - st.mag, this.ammo.pistol);
          st.mag += n;
          this.ammo.pistol -= n;
          this.action = null;
        }
        break;
      case 'reloadSG':
        if (a.t >= a.dur) {
          const st = this.weapons.shotgun;
          if (this.ammo.shotgun > 0 && st.mag < WEAPONS.shotgun.mag) {
            st.mag++;
            this.ammo.shotgun--;
            G.audio.click(G.audio.ctx ? G.audio.ctx.currentTime : 0, 1400, 0.5);
          }
          if (st.mag < WEAPONS.shotgun.mag && this.ammo.shotgun > 0) {
            a.t = 0;
          } else {
            this.action = null;
            G.audio.pump();
          }
        }
        break;
      case 'switch':
        if (!a.fired && a.t >= a.dur * 0.5) {
          a.fired = true;
          this.current = a.to;
          this.updateGunVisibility();
          G.ui.weaponChanged();
        }
        if (a.t >= a.dur) this.action = null;
        break;
      case 'knife':
        if (!a.fired && a.t >= 0.14) {
          a.fired = true;
          const e = G.enemies.knifeArc(this, 26);
          if (e) {
            e.rig.j.spine.getWorldPosition(_v);
            G.fx.blood(_v, { x: Math.sin(this.yaw), y: 0, z: Math.cos(this.yaw) }, 8);
            G.audio.hit('flesh', e.pos);
            G.ui.hitMarker(false);
          }
          G.level.meleeAt(this.pos.x + Math.sin(this.yaw) * 1.0, this.pos.z + Math.cos(this.yaw) * 1.0, 1.0);
        }
        if (a.t >= a.dur) {
          this.action = null;
          this.updateGunVisibility();
        }
        break;
      case 'kick':
        this.invuln = Math.max(this.invuln, 0.1);
        if (!a.fired && a.t >= 0.3) {
          a.fired = true;
          const n = G.enemies.kickArc(this, 60);
          if (n) {
            G.audio.kick(this.pos);
            G.fx.shake(0.25);
          }
          G.level.meleeAt(this.pos.x + Math.sin(this.yaw) * 1.2, this.pos.z + Math.cos(this.yaw) * 1.2, 1.2);
        }
        if (a.t >= a.dur) this.action = null;
        break;
      case 'heal':
        if (!a.fired && a.t >= 0.7) {
          a.fired = true;
          this.applyHeal(a.item);
        }
        if (a.t >= a.dur) this.action = null;
        break;
      case 'throw':
        if (!a.fired && a.t >= 0.34) {
          a.fired = true;
          this.rig.j.rHand.getWorldPosition(_v);
          _v2.copy(this.camDir);
          _v2.y += 0.28;
          _v2.normalize().multiplyScalar(11.5);
          _v2.x += this.vel.x * 0.5;
          _v2.z += this.vel.z * 0.5;
          G.proj.spawnGrenade(_v, _v2);
          this.items.grenade = Math.max(0, this.items.grenade - 1);
          G.audio.whoosh(0.4);
        }
        if (a.t >= a.dur) this.action = null;
        break;
      case 'hurt':
      case 'knockdown':
        if (a.t >= a.dur) this.action = null;
        break;
      default:
        if (a.t >= a.dur) this.action = null;
    }
    if (!this.action) this.updateGunVisibility();
  }

  // ------------------------------------------------------------------ ações
  startReload() {
    const w = this.weapon,
      st = this.weapons[this.current];
    if (this.action || st.mag >= w.mag || this.ammo[w.ammo] <= 0) return false;
    if (w.id === 'pistol') {
      this.startAction('reload', w.reload);
      this.G.audio.reload('pistol');
    } else this.startAction('reloadSG', w.reload);
    return true;
  }

  switchTo(id) {
    if (id === this.current || !this.weapons[id] || !this.weapons[id].owned || this.action) return;
    this.startAction('switch', 0.4, { to: id });
    this.G.audio.click(this.G.audio.ctx ? this.G.audio.ctx.currentTime : 0, 900, 0.4);
  }

  startKnife() {
    if (this.action) return;
    this.startAction('knife', 0.45);
    this.G.audio.whoosh(0.45);
  }

  kick(target) {
    this.startAction('kick', 0.8, { target });
    this.G.audio.whoosh(0.6);
    this.G.input.setTouchAim(false);
  }

  startThrow() {
    if (this.action) return;
    if (this.items.grenade <= 0) {
      this.G.ui.msg('Você não tem granadas.');
      return;
    }
    this.startAction('throw', 0.75);
  }

  useHeal(instant) {
    const G = this.G;
    if (this.hp >= this.maxHp) {
      G.ui.msg('Sua vitalidade já está cheia.');
      return false;
    }
    let item = null;
    if (this.items.tonic > 0) item = 'tonic';
    else if (this.items.medkit > 0) item = 'medkit';
    if (!item) {
      G.ui.msg('Você não tem itens de cura.');
      return false;
    }
    if (instant) this.applyHeal(item);
    else if (!this.action) this.startAction('heal', 1.1, { item });
    return true;
  }

  useItem(item) {
    if (this.hp >= this.maxHp) {
      this.G.ui.msg('Sua vitalidade já está cheia.');
      return false;
    }
    if (!this.items[item]) return false;
    this.applyHeal(item);
    return true;
  }

  applyHeal(item) {
    const G = this.G;
    if (!this.items[item]) return;
    this.items[item]--;
    const amount = item === 'tonic' ? 45 : 100;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    G.audio.heal();
    G.ui.healFlash();
    G.ui.msg(item === 'tonic' ? 'Tônico usado: +45 de vitalidade.' : 'Kit de primeiros socorros usado.');
  }

  addItem(type, n = 1) {
    switch (type) {
      case 'ammo_pistol':
        this.ammo.pistol += n;
        return `+${n} Munição 9 mm`;
      case 'ammo_shotgun':
        this.ammo.shotgun += n;
        return `+${n} Cartuchos calibre 12`;
      case 'tonic':
      case 'medkit':
      case 'grenade':
        this.items[type] += n;
        return type === 'tonic' ? 'Tônico' : type === 'medkit' ? 'Kit de primeiros socorros' : n > 1 ? `${n} Granadas` : 'Granada';
      case 'key':
        this.keys.cemetery = true;
        return 'Chave do cemitério';
      case 'weapon_shotgun':
        if (this.weapons.shotgun.owned) {
          this.ammo.shotgun += 4;
          return '+4 Cartuchos calibre 12';
        }
        this.weapons.shotgun.owned = true;
        this.weapons.shotgun.mag = 4;
        if (!this.action) {
          this.current = 'shotgun';
          this.updateGunVisibility();
          this.G.ui.weaponChanged();
        }
        return 'Escopeta calibre 12 (tecla 2)';
      default:
        return '';
    }
  }

  // ------------------------------------------------------------------ tiro
  fire() {
    const G = this.G,
      w = this.weapon,
      st = this.weapons[this.current];
    if (st.mag <= 0) {
      G.audio.dry();
      this.fireCd = 0.3;
      if (this.ammo[w.ammo] > 0) this.startReload();
      else G.ui.msg('Sem munição para esta arma.');
      return;
    }
    st.mag--;
    this.fireCd = w.rate;
    G.stats.shots++;
    const m = this.muzzlePos;
    const hits = new Map();
    for (let i = 0; i < w.pellets; i++) {
      _v.copy(this.aimPoint).sub(m);
      const L = _v.length();
      if (L < 0.01) _v.copy(this.aimDir);
      _v.normalize();
      if (w.spread > 0) {
        _v.x += rand(-1, 1) * w.spread;
        _v.y += rand(-1, 1) * w.spread * 0.7;
        _v.z += rand(-1, 1) * w.spread;
        _v.normalize();
      }
      _o.x = m.x;
      _o.y = m.y;
      _o.z = m.z;
      _d.x = _v.x;
      _d.y = _v.y;
      _d.z = _v.z;
      const hit = raycastAll(G, _o, _d, w.range);
      if (!hit) continue;
      let dmg = w.dmg;
      if (w.id === 'shotgun') dmg *= clamp(1 - (hit.t - 5) / 18, 0.3, 1);
      if (hit.kind === 'enemy') {
        const e = hit.enemy;
        let r = hits.get(e);
        if (!r) {
          r = { parts: {}, n: 0, dist: hit.t, x: hit.x, y: hit.y, z: hit.z };
          hits.set(e, r);
        }
        r.parts[hit.part] = (r.parts[hit.part] || 0) + dmg;
        r.n++;
        G.fx.blood({ x: hit.x, y: hit.y, z: hit.z }, _d, w.pellets > 1 ? 4 : 10, hit.part === 'head');
      } else if (hit.kind === 'object') {
        G.fx.impact(hit, _d);
        if (hit.owner && hit.owner.onShot) hit.owner.onShot(dmg, _d);
      } else if (hit.kind === 'proj') {
        G.fx.sparks({ x: hit.x, y: hit.y, z: hit.z }, { x: -_d.x, y: -_d.y, z: -_d.z }, 6);
        G.proj.shot(hit.proj);
      } else {
        G.fx.impact(hit, _d);
        if (i % 3 === 0) G.audio.hit(hit.mat === 'metal' ? 'metal' : hit.mat === 'wood' ? 'wood' : hit.mat === 'water' ? 'water' : 'stone', hit);
      }
    }
    let headHit = false;
    for (const [e, r] of hits) {
      const dir = { x: e.pos.x - this.pos.x, y: 0, z: e.pos.z - this.pos.z };
      const dl = Math.hypot(dir.x, dir.z) || 1;
      dir.x /= dl;
      dir.z /= dl;
      const knock = w.id === 'shotgun' && r.n >= 4 && r.dist < 8;
      const order = PART_ORDER.filter((p) => r.parts[p] !== undefined);
      order.forEach((part, i) => {
        const last = i === order.length - 1;
        if (part === 'head') headHit = true;
        e.onHit({ dmg: r.parts[part], part, weapon: w.id, dir, knockdown: last && knock, push: w.id === 'shotgun' ? 3 : 0.9 });
      });
      G.audio.hit(r.parts.head ? 'head' : 'flesh', e.pos);
    }
    if (hits.size) {
      G.stats.hits++;
      G.ui.hitMarker(headHit);
    }
    G.fx.muzzle(m, this.aimDir, w.id === 'shotgun');
    G.audio.shot(w.id);
    G.fx.shake(w.shake);
    this.recoil = 1;
    this.camPitch += w.recoil;
    this.camYaw += rand(-1, 1) * w.recoil * 0.25;
    if (w.id === 'pistol') this.ejectCasing(false);
    else this.pendingEject = 0.42;
    G.enemies.noise(this.pos.x, this.pos.z, w.noise);
    if (st.mag === 0 && this.ammo[w.ammo] > 0) this.autoReload = 0.35;
  }

  ejectCasing(shell) {
    const g = this.guns[this.current];
    if (!g || !g.userData.eject) return;
    g.userData.eject.getWorldPosition(_v);
    _v2.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.G.fx.eject(_v, _v2, UP, shell);
  }

  aimAssist(dt) {
    const G = this.G;
    let best = null,
      bs = 0.1;
    for (const e of G.enemies.list) {
      if (!e.alive || !e.hittable) continue;
      const tx = e.pos.x,
        ty = e.pos.y + e.height * (e.kind === 'crawler' ? 0.6 : 0.72),
        tz = e.pos.z;
      const dx = tx - this.pivot.x,
        dy = ty - this.pivot.y,
        dz = tz - this.pivot.z;
      const hd = Math.hypot(dx, dz);
      if (hd > 28 || hd < 0.8) continue;
      const yaw = Math.atan2(dx, dz),
        pitch = Math.atan2(dy, hd);
      let dyaw = yaw - this.camYaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const dp = pitch - this.camPitch;
      const s = Math.hypot(dyaw, dp);
      if (s < bs) {
        bs = s;
        best = { dyaw, dp };
      }
    }
    if (best) {
      const k = Math.min(1, dt * 3.2);
      this.camYaw += best.dyaw * k;
      this.camPitch += best.dp * k;
    }
  }

  // ------------------------------------------------------------------ dano
  takeDamage(amount, from, opts = {}) {
    const G = this.G;
    if (this.dead || G.state !== 'play') return false;
    if (this.invuln > 0 || (this.action && this.action.type === 'kick')) return false;
    const dmg = opts.raw ? amount : amount * G.diff.dmg;
    this.hp = Math.max(0, this.hp - dmg);
    G.stats.damage += dmg;
    this.invuln = opts.knockdown ? 1.9 : 0.75;
    G.fx.shake(0.35 + (opts.knockdown ? 0.3 : 0));
    G.ui.damage(dmg);
    G.audio.hurt();
    this.rig.j.spine.getWorldPosition(_v);
    G.fx.blood(_v, { x: 0, y: 0, z: 0 }, 6);
    if (from) {
      let dx = this.pos.x - from.x,
        dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const kf = opts.knockdown ? 6 : 2.5;
      this.knock.set(dx * kf, 0, dz * kf);
      this.hitFromBack = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw) > 0;
    }
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    if (opts.knockdown) {
      this.startAction('knockdown', 1.75);
      G.input.setTouchAim(false);
    } else if (!this.action || ['reload', 'reloadSG', 'heal', 'switch', 'hurt', 'knife', 'throw'].includes(this.action.type)) {
      if (this.action && this.action.type === 'throw' && !this.action.fired) {
        /* granada cancelada, nada é gasto */
      }
      this.startAction('hurt', 0.38);
    }
    return true;
  }

  burn(amount) {
    if (this.dead || this.G.state !== 'play') return;
    if (this.action && this.action.type === 'kick') return;
    this.hp = Math.max(0, this.hp - amount);
    this.G.stats.damage += amount;
    if (this.burnSound <= 0) {
      this.burnSound = 0.7;
      this.G.audio.hurt();
      this.G.ui.damage(8);
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    const G = this.G;
    this.dead = true;
    this.hp = 0;
    this.action = null;
    this.aiming = false;
    this.deathT = 0;
    this.fallBack = !this.hitFromBack;
    G.audio.voice(null, 'playerDie');
    G.fx.shake(0.5);
    G.input.setTouchAim(false);
    this.updateGunVisibility();
  }

  // ------------------------------------------------------------------ animação
  animate(dt, hs) {
    const R = this.rig;
    R.resetPose();
    const a = this.action;
    const run = this.running ? clamp((hs - 3.2) / 1.6, 0, 1) : 0;
    this.phase += dt * hs * (run > 0.3 ? 3.4 : 4.3);
    const amt = clamp(hs / 2.8, 0, 1);
    if (this.dead) {
      R.bodyTilt = this.fallBack ? -1.5 : 1.45;
      R.bodyLift = 0.13;
      R.set('lSh', -0.3, 0, 1.1);
      R.set('rSh', -0.6, 0, -1.0);
      R.set('rHip', -0.4);
      R.set('rKnee', 0.6);
      R.set('neck', 0.2, 0.5, 0);
      R.apply(dt, 8, 7);
      this.syncRig();
      return;
    }
    const aim = easeInOut(this.aimBlend);
    R.gait(this.phase, amt * (1 - aim * 0.35), run);
    R.add('spine', Math.sin(this.t * 1.6) * 0.015);
    // arma baixa (pronta)
    if (this.current === 'pistol') {
      this.blend('rSh', -0.3, 0, 0.12, 1);
      this.blend('rEl', -0.6, 0, 0, 1);
    } else {
      this.blend('rSh', -0.45, 0, 0.25, 1);
      this.blend('rEl', -1.15, 0, 0, 1);
      this.blend('lSh', -0.75, 0, -0.45, 1);
      this.blend('lEl', -1.0, 0, 0, 1);
    }
    // mirando
    if (aim > 0.01) {
      const p = this.camPitch;
      if (this.current === 'pistol') {
        this.blend('rSh', -1.57 - p * 0.85, 0, 0.24, aim);
        this.blend('rEl', -0.08, 0, 0, aim);
        this.blend('lSh', -1.45 - p * 0.85, 0, -0.52, aim);
        this.blend('lEl', -0.5, 0, 0, aim);
        this.blend('spine', -p * 0.2, 0.16, 0, aim);
      } else {
        this.blend('rSh', -1.25 - p * 0.85, 0, 0.42, aim);
        this.blend('rEl', -0.85, 0, 0, aim);
        this.blend('lSh', -1.45 - p * 0.85, 0, -0.12, aim);
        this.blend('lEl', -0.2, 0, 0, aim);
        this.blend('spine', -p * 0.2, 0.28, 0, aim);
      }
      this.blend('neck', -p * 0.5, -0.12, 0, aim);
      if (this.recoil > 0) R.add('rSh', -this.recoil * (this.current === 'shotgun' ? 0.3 : 0.15));
    }
    if (a) {
      const k = clamp(a.t / a.dur, 0, 1);
      switch (a.type) {
        case 'reload': {
          const down = k > 0.3 && k < 0.65 ? 1 : 0;
          this.blend('rSh', -0.8, 0, 0.3, 0.8);
          this.blend('rEl', -0.9, 0, 0, 0.8);
          this.blend('lSh', -0.9 + down * 0.5, 0, -0.4, 1);
          this.blend('lEl', -1.4 + down * 0.6, 0, 0, 1);
          break;
        }
        case 'reloadSG': {
          const s = Math.sin(k * Math.PI);
          this.blend('rSh', -0.6, 0, 0.3, 0.8);
          this.blend('rEl', -1.2, 0, 0, 0.8);
          this.blend('lSh', -0.6 - s * 0.4, 0, -0.5, 1);
          this.blend('lEl', -1.4 + s * 0.3, 0, 0, 1);
          break;
        }
        case 'switch':
          this.blend('rSh', -0.2, 0, 0.1, Math.sin(k * Math.PI));
          this.blend('rEl', -1.5, 0, 0, Math.sin(k * Math.PI));
          break;
        case 'knife': {
          const sw = k < 0.3 ? 0 : clamp((k - 0.3) / 0.35, 0, 1);
          this.blend('rSh', -1.5, 0, lerp(-1.0, 0.8, sw), 1);
          this.blend('rEl', -0.25, 0, 0, 1);
          this.blend('spine', 0.1, lerp(-0.5, 0.5, sw), 0, 1);
          break;
        }
        case 'kick': {
          const ch = k < 0.3 ? k / 0.3 : 1;
          const ext = k < 0.3 ? 0 : k < 0.6 ? (k - 0.3) / 0.3 : 1 - (k - 0.6) / 0.4;
          this.blend('rHip', lerp(-1.3 * ch, -1.6, ext), 0, 0, 1);
          this.blend('rKnee', lerp(1.5 * ch, 0.05, ext), 0, 0, 1);
          this.blend('spine', -0.3 * ch, 0, 0, 1);
          this.blend('lSh', -0.6, 0, 0.7, 1);
          this.blend('rSh', -0.4, 0, -0.8, 1);
          this.blend('lKnee', 0.15, 0, 0, 1);
          break;
        }
        case 'heal':
          this.blend('lSh', -1.0, 0, -0.55, 1);
          this.blend('lEl', -2.3, 0, 0, 1);
          this.blend('neck', -0.3 * Math.sin(k * Math.PI), 0, 0, 1);
          break;
        case 'throw': {
          const back = k < 0.4 ? k / 0.4 : 0;
          const fwd = k < 0.4 ? 0 : clamp((k - 0.4) / 0.25, 0, 1);
          this.blend('rSh', lerp(0.6 * back, -2.2, fwd), 0, -0.3, 1);
          this.blend('rEl', -1.2 * (1 - fwd), 0, 0, 1);
          this.blend('spine', -0.2 * back + 0.3 * fwd, -0.4 * back + 0.3 * fwd, 0, 1);
          break;
        }
        case 'hurt':
          R.add('spine', -0.3 * Math.sin(k * Math.PI));
          R.add('neck', -0.25 * Math.sin(k * Math.PI));
          break;
        case 'knockdown': {
          const down = k < 0.65;
          R.bodyTilt = down ? -1.45 : 0;
          R.bodyLift = down ? 0.13 : 0;
          if (!down) {
            R.hipsY = -0.3;
            R.set('lHip', -1.4);
            R.set('lKnee', 1.4);
            R.set('rKnee', 1.4);
          } else {
            R.set('lSh', -0.3, 0, 0.9);
            R.set('rSh', -0.3, 0, -0.9);
          }
          break;
        }
      }
    }
    R.apply(dt, a && a.type === 'kick' ? 20 : 14, a && a.type === 'knockdown' ? 7 : 9);
    this.syncRig();
  }

  blend(name, x, y, z, w) {
    const t = this.rig.t[name];
    t[0] += (x - t[0]) * w;
    t[1] += (y - t[1]) * w;
    t[2] += (z - t[2]) * w;
  }

  syncRig() {
    const r = this.rig.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    r.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------ câmera
  updateCamera(dt) {
    const G = this.G,
      cam = G.camera;
    const a = easeInOut(this.aimBlend);
    const dead = this.dead;
    let dist = lerp(2.6, 1.15, a),
      side = lerp(0.55, 0.48, a),
      h = lerp(1.62, 1.56, a);
    if (dead) {
      dist = 3.4 + Math.min(1.5, this.deathT * 0.5);
      side = 0;
      h = 1.2;
    }
    if (this.action && this.action.type === 'knockdown') h = lerp(h, 1.1, 0.6);
    const fovT = lerp(62, 44, a) + (this.running ? 4 : 0);
    this.fov = damp(this.fov, fovT, 10, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    const yaw = this.camYaw,
      pitch = dead ? -0.45 : this.camPitch;
    const rx = -Math.cos(yaw),
      rz = Math.sin(yaw);
    const cp = Math.cos(pitch);
    this.camDir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    // pivô sobre o ombro direito (encurta se houver parede ao lado)
    const headX = this.pos.x,
      headY = this.pos.y + h,
      headZ = this.pos.z;
    _o.x = headX;
    _o.y = headY;
    _o.z = headZ;
    _d.x = rx;
    _d.y = 0;
    _d.z = rz;
    const sh = G.col.raycast(_o, _d, side + 0.25, 'camera', this._camHit || (this._camHit = {}));
    const s2 = sh ? Math.max(0, sh.t - 0.25) : side;
    this.pivot.set(headX + rx * s2, headY, headZ + rz * s2);
    _o.x = this.pivot.x;
    _o.y = this.pivot.y;
    _o.z = this.pivot.z;
    _d.x = -this.camDir.x;
    _d.y = -this.camDir.y;
    _d.z = -this.camDir.z;
    const bh = G.col.raycast(_o, _d, dist + 0.3, 'camera', this._camHit);
    const want = bh ? Math.max(0.2, bh.t - 0.3) : dist;
    this.camDist = want < this.camDist ? want : damp(this.camDist, want, 6, dt);
    const fx = G.fx;
    cam.position.set(this.pivot.x - this.camDir.x * this.camDist, this.pivot.y - this.camDir.y * this.camDist, this.pivot.z - this.camDir.z * this.camDist);
    const gy = G.col.groundY(cam.position.x, cam.position.z) + 0.2;
    if (cam.position.y < gy) cam.position.y = gy;
    _v.copy(cam.position).add(this.camDir);
    cam.position.add(fx.shakeOffset);
    _v.add(fx.shakeOffset);
    cam.lookAt(_v);
    if (fx.shakeRoll) cam.rotateZ(fx.shakeRoll);
    const hide = this.camDist < 0.45 && !dead;
    if (hide !== this.hidden) {
      this.hidden = hide;
      this.rig.root.visible = !hide;
    }
    this.fill.position.set(cam.position.x - this.camDir.x * 0.6, cam.position.y + 0.5, cam.position.z - this.camDir.z * 0.6);
    G.audio.setListener(cam.position.x, cam.position.z, yaw);
  }

  computeAim(dt, moving) {
    const G = this.G;
    const sw = this.aimBlend * (0.0032 + (moving ? 0.0045 : 0) + (this.hp < 25 ? 0.004 : 0));
    const yaw = this.camYaw + noise1(this.t * 0.9, 1) * sw * 1.4;
    const pitch = this.camPitch + noise1(this.t * 0.75, 7) * sw;
    const cp = Math.cos(pitch);
    this.aimDir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    _o.x = this.pivot.x;
    _o.y = this.pivot.y;
    _o.z = this.pivot.z;
    _d.x = this.aimDir.x;
    _d.y = this.aimDir.y;
    _d.z = this.aimDir.z;
    const hit = raycastAll(G, _o, _d, 120);
    if (hit && hit.t > 0.3) this.aimPoint.set(hit.x, hit.y, hit.z);
    else this.aimPoint.copy(this.pivot).addScaledVector(this.aimDir, 120);
    void dt;
  }

  orientGun() {
    const R = this.rig;
    R.mountR.getWorldQuaternion(_qHand);
    _q.copy(_qHand).multiply(Q_NAT);
    R.mountR.getWorldPosition(_v);
    _v2.copy(this.aimPoint).sub(_v);
    if (_v2.lengthSq() < 0.04) _v2.copy(this.aimDir);
    _v2.normalize();
    _m.lookAt(_v2, ZERO, UP);
    _qAim.setFromRotationMatrix(_m);
    const k = this.dead ? 0 : easeInOut(clamp((this.aimBlend - 0.1) / 0.8, 0, 1));
    _q.slerp(_qAim, k);
    this.gunMount.quaternion.copy(_qHand.invert()).multiply(_q);
    this.gunMount.updateMatrixWorld(true);
    const g = this.guns[this.current];
    g.userData.muzzle.getWorldPosition(this.muzzlePos);
    g.userData.laser.getWorldPosition(this.laserPos);
  }

  updateLaser() {
    const a = this.action;
    const show = this.aimBlend > 0.82 && !this.dead && (!a || a.type === 'reload' || a.type === 'reloadSG') && this.rig.root.visible;
    if (!show) {
      this.laser.visible = this.dot.visible = false;
      return;
    }
    const o = this.laserPos;
    _v.copy(this.aimPoint).sub(o);
    let L = _v.length();
    if (L < 0.05) {
      this.laser.visible = this.dot.visible = false;
      return;
    }
    _v.divideScalar(L);
    _o.x = o.x;
    _o.y = o.y;
    _o.z = o.z;
    _d.x = _v.x;
    _d.y = _v.y;
    _d.z = _v.z;
    const hit = raycastAll(this.G, _o, _d, L + 0.05);
    if (hit) L = hit.t;
    this.laser.position.copy(o);
    this.laser.quaternion.setFromUnitVectors(UP, _v);
    this.laser.scale.set(1, L, 1);
    this.laser.visible = true;
    this.dot.position.copy(o).addScaledVector(_v, Math.max(0, L - 0.03));
    const s = 0.05 + L * 0.0045;
    this.dot.scale.set(s, s, 1);
    this.dot.material.opacity = 0.85 + Math.sin(this.t * 40) * 0.15;
    this.dot.visible = L < 110;
  }

  updateFlashlight() {
    const R = this.rig;
    R.j.spine.localToWorld(_v.set(0.11, 0.45, 0.2));
    const f = this.flash;
    if (this.flashOn !== false) {
      const near = Math.min(this.aimPoint.distanceTo(this.pivot), this.camDist + 6);
      this.flashK = damp(this.flashK ?? 1, clamp((near - 0.8) / 5, 0.32, 1), 6, 1 / 60);
      f.intensity = 40 * this.flashK;
    }
    f.position.copy(_v);
    const dir = this.aimBlend > 0.5 ? this.aimDir : this.camDir;
    f.target.position.copy(_v).addScaledVector(dir, 8);
    f.target.updateMatrixWorld();
  }

  footsteps(hs) {
    if (hs < 0.4) return;
    const n = Math.floor(this.phase / Math.PI);
    if (n !== this.lastStep) {
      this.lastStep = n;
      const G = this.G;
      let surf = 'dirt';
      const x = this.pos.x,
        z = this.pos.z;
      if (G.world.isIndoor(x, z)) surf = 'wood';
      else if (z > 129.5 && z < 140.5) surf = 'wood';
      else if (Math.hypot(x, z - 32) < 12 || (Math.abs(x) < 2.6 && z > 43 && z < 72) || (z > 140 && (Math.abs(x) < 4 || Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r))) surf = 'stone';
      G.audio.step(null, surf, this.running ? 0.42 : 0.28);
      if (this.running) G.enemies.noise(x, z, 9);
    }
  }
}
