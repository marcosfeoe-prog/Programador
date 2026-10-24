// Armas do caçador: estados (sacar, atirar, ciclar ferrolho/telha, recarregar),
// mira (luneta, ponto vermelho), recuo, cápsulas ejetadas, clarão do disparo e as
// mãos acompanhando cada movimento. Os disparos viram projéteis em ballistics.js.
import * as THREE from 'three';
import { BUILDERS, Arm, makeShellMesh } from './gunmodels.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

export const WEAPONS = [
  {
    id: 'rifle',
    nome: 'Rifle .375 de Ferrolho',
    curto: 'Rifle .375',
    model: 'rifle',
    mag: 5,
    reserva: 30,
    dano: 165,
    pellets: 1,
    vel: 820,
    spreadHip: 0.03,
    spreadAds: 0.0003,
    cadencia: 0.15,
    action: 'bolt',
    actionTime: 0.95,
    reload: 'single',
    reloadStart: 0.5,
    reloadEach: 0.55,
    reloadEnd: 0.45,
    zoom: 4,
    scope: true,
    recoil: 0.065,
    barulho: 900,
    hip: [0.15, -0.17, -0.36],
    ads: 0.14,
    tracer: false,
    desc: 'Precisão de longe. Luneta 4x, 5 tiros. Segure Shift na mira para prender a respiração.',
  },
  {
    id: 'shotgun',
    nome: 'Espingarda Calibre 12',
    curto: 'Calibre 12',
    model: 'shotgun',
    mag: 6,
    reserva: 30,
    dano: 22,
    pellets: 9,
    vel: 390,
    spreadHip: 0.055,
    spreadAds: 0.042,
    cadencia: 0.15,
    action: 'pump',
    actionTime: 0.6,
    reload: 'single',
    reloadStart: 0.4,
    reloadEach: 0.48,
    reloadEnd: 0.3,
    zoom: 1.2,
    recoil: 0.1,
    barulho: 750,
    hip: [0.15, -0.165, -0.33],
    ads: 0.27,
    tracer: false,
    desc: 'Devastadora de perto. 9 bagos por cartucho; ótima contra raptores.',
  },
  {
    id: 'ar',
    nome: 'Fuzil de Assalto 7,62',
    curto: 'Fuzil 7,62',
    model: 'ar',
    mag: 30,
    reserva: 120,
    dano: 36,
    pellets: 1,
    vel: 850,
    spreadHip: 0.028,
    spreadAds: 0.0035,
    auto: true,
    cadencia: 60 / 560,
    reload: 'mag',
    reloadTime: 2.4,
    zoom: 1.6,
    recoil: 0.019,
    barulho: 800,
    hip: [0.14, -0.16, -0.32],
    ads: 0.26,
    tracer: true,
    desc: 'Automático, 30 tiros. Mira holográfica. Bom para segurar uma matilha.',
  },
  {
    id: 'crossbow',
    nome: 'Besta de Caça',
    curto: 'Besta',
    model: 'crossbow',
    mag: 1,
    reserva: 24,
    dano: 200,
    pellets: 1,
    vel: 95,
    gravity: true,
    bolt: true,
    spreadHip: 0.02,
    spreadAds: 0.0006,
    cadencia: 0.2,
    reload: 'crossbow',
    reloadTime: 2.0,
    zoom: 2.2,
    recoil: 0.025,
    barulho: 22,
    bleed: true,
    hip: [0.15, -0.16, -0.34],
    ads: 0.2,
    tracer: false,
    desc: 'Silenciosa: não espanta os dinossauros. O virote faz sangrar. A flecha cai com a distância.',
  },
];

export class WeaponSystem {
  constructor(vmScene, vmCamera, audio, opts = {}) {
    this.vmScene = vmScene;
    this.vmCamera = vmCamera;
    this.audio = audio;
    this.root = new THREE.Group(); // segue a câmera do viewmodel
    vmCamera.add(this.root);
    vmScene.add(vmCamera);
    this.slots = WEAPONS.map((def) => {
      const model = BUILDERS[def.model]();
      model.visible = false;
      model.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          o.castShadow = false;
        }
      });
      const holder = new THREE.Group();
      holder.add(model);
      this.root.add(holder);
      return { def, model, holder, ammo: def.mag, reserve: def.reserva, chambered: true, state: 'idle' };
    });
    this.armR = new Arm(this.root, false);
    this.armL = new Arm(this.root, true);
    this.cur = 0;
    this.prev = 0;
    this.state = 'equip';
    this.t = 0;
    this.cool = 0;
    this.ads = 0;
    this.sprint = 0;
    this.lower = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.kickV = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.lastLook = { x: 0, y: 0 };
    this.reloadCount = 0;
    this.shells = [];
    this.flash = this.makeFlash();
    this.flashT = 0;
    this.fireFn = opts.onFire || null;
    this.binoculars = false;
    this.holdBreath = 0;
    this.breath = 100;
    this.time = 0;
    this.slots[0].model.visible = true;
    this.setStringNock(this.slots[3], 1);
    this.boltVisible(this.slots[3], true);
  }

  get slot() {
    return this.slots[this.cur];
  }
  get def() {
    return this.slot.def;
  }

  makeFlash() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.25, 'rgba(255,190,80,0.9)');
    g.addColorStop(0.6, 'rgba(255,110,20,0.35)');
    g.addColorStop(1, 'rgba(255,80,0,0)');
    x.fillStyle = g;
    x.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const r = k % 2 ? 14 : 32;
      x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    x.fill();
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(m);
    s.scale.set(0.16, 0.16, 1);
    s.visible = false;
    s.frustumCulled = false;
    this.root.add(s);
    const l = new THREE.PointLight(0xffb060, 0, 3);
    this.root.add(l);
    s.userData.light = l;
    return s;
  }

  setStringNock(slot, cocked) {
    const ud = slot.model.userData;
    if (!ud.string) return;
    const a = ud.string.geometry.attributes.position.array;
    const [l, r] = ud.tips;
    const nz = lerp(l.z + 0.005, -0.06, cocked);
    a.set([l.x, l.y, l.z, 0, ud.by + 0.006, nz, r.x, r.y, r.z]);
    ud.string.geometry.attributes.position.needsUpdate = true;
  }
  boltVisible(slot, v) {
    if (slot.model.userData.bolt && slot.def.id === 'crossbow') slot.model.userData.bolt.visible = v;
  }

  switchTo(i) {
    if (i === this.cur || i < 0 || i >= this.slots.length) return;
    if (this.state === 'unequip') return;
    this.binoculars = false;
    this.next = i;
    this.state = 'unequip';
    this.t = 0;
  }

  canFire() {
    return this.state === 'idle' && this.cool <= 0 && this.slot.ammo > 0 && this.slot.chambered && this.sprint < 0.3 && this.lower < 0.3 && !this.binoculars;
  }

  addAmmo(fraction = 1) {
    for (const s of this.slots) s.reserve = Math.max(s.reserve, Math.round(s.def.reserva * fraction));
  }

  startReload() {
    const s = this.slot;
    if (this.state !== 'idle' || s.reserve <= 0 || s.ammo >= s.def.mag) return false;
    this.state = 'reload';
    this.t = 0;
    this.reloadCount = 0;
    this.reloadPhase = 'start';
    this.audio && this.audio.mech('reloadStart', s.def.id);
    return true;
  }

  // dt, input, player (para sprint/estado), mira pedida
  update(dt, input, player, ctx) {
    this.time += dt;
    const s = this.slot;
    const d = s.def;
    this.cool -= dt;
    this.t += dt;
    const wantAds = (input.isHeld('aim') || ctx.forceAim) && !player.sprinting && player.alive && !player.swim && (this.state === 'idle' || this.state === 'cycle' || (this.state === 'fire' && this.t > 0.05));
    this.ads = damp(this.ads, wantAds && !this.binoculars ? 1 : 0, wantAds ? 11 : 13, dt);
    this.sprint = damp(this.sprint, player.sprinting ? 1 : 0, 7, dt);
    this.lower = damp(this.lower, player.swim || !player.alive ? 1 : 0, 6, dt);

    // troca de arma
    for (let i = 0; i < 4; i++) if (input.pressed('w' + (i + 1))) this.switchTo(i);
    if (input.pressed('lastWeapon')) this.switchTo(this.prev);
    const wh = input.consumeWheel();
    if (wh) this.switchTo((this.cur + (wh > 0 ? 1 : 3)) % 4);
    if (input.pressed('binoculars') && this.state === 'idle') this.binoculars = !this.binoculars;
    if (this.binoculars && (input.pressed('fire') || player.sprinting)) this.binoculars = false;

    // prender a respiração com a luneta
    const scoped = d.scope && this.ads > 0.9;
    this.holdBreath = scoped && input.sprint && this.breath > 0 ? 1 : 0;
    if (this.holdBreath) this.breath -= 22 * dt;
    else this.breath = Math.min(100, this.breath + 14 * dt);

    let fired = false;
    switch (this.state) {
      case 'equip':
        if (this.t > 0.45) this.state = 'idle';
        break;
      case 'unequip':
        if (this.t > 0.28) {
          s.model.visible = false;
          this.prev = this.cur;
          this.cur = this.next;
          this.slot.model.visible = true;
          this.state = 'equip';
          this.t = 0;
          this.audio && this.audio.mech('equip', this.def.id);
        }
        break;
      case 'fire':
        if (this.t > 0.12) {
          if (d.action && s.ammo > 0) {
            this.state = 'cycle';
            this.t = 0;
            this.audio && this.audio.mech(d.action, d.id);
          } else if (d.id === 'crossbow') {
            this.state = s.reserve > 0 ? 'idle' : 'idle';
          } else this.state = 'idle';
        }
        break;
      case 'cycle': {
        const at = d.actionTime;
        if (!s.ejected && this.t > at * 0.45) {
          s.ejected = true;
          this.ejectShell(d);
        }
        if (this.t >= at) {
          s.chambered = true;
          s.ejected = false;
          this.state = 'idle';
        }
        break;
      }
      case 'reload':
        this.updateReload(dt, s, d, input);
        break;
      default:
        break;
    }

    // disparo
    const trig = d.auto ? input.isHeld('fire') : input.pressed('fire');
    if (trig && player.alive) {
      if (this.state === 'reload' && d.reload === 'single' && s.ammo > 0 && this.reloadPhase === 'each') {
        this.reloadPhase = 'end';
        this.t = 0;
      } else if (this.canFire()) {
        this.fire(s, d, player, ctx);
        fired = true;
      } else if (this.state === 'idle' && s.ammo <= 0) {
        if (s.reserve > 0) this.startReload();
        else if (this.cool <= 0) {
          this.audio && this.audio.mech('empty', d.id);
          this.cool = 0.3;
        }
      }
    }
    if (input.pressed('reload')) this.startReload();
    // recarrega sozinho quando esvazia (menos a besta, que já faz isso no disparo)
    if (this.state === 'idle' && s.ammo === 0 && s.reserve > 0 && this.cool <= -0.25) this.startReload();

    this.updatePose(dt, s, d, player, ctx);
    this.updateShells(dt);
    // clarão
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flash.userData.light.intensity = this.flashT > 0 ? 6 : 0;
    return fired;
  }

  updateReload(dt, s, d, input) {
    if (d.reload === 'mag') {
      if (this.t > d.reloadTime * 0.42 && this.reloadCount === 0) {
        this.reloadCount = 1;
        this.audio && this.audio.mech('magIn', d.id);
      }
      if (this.t >= d.reloadTime) {
        const need = d.mag - s.ammo;
        const take = Math.min(need, s.reserve);
        s.ammo += take;
        s.reserve -= take;
        s.chambered = true;
        this.state = 'idle';
        this.audio && this.audio.mech('charge', d.id);
      }
      return;
    }
    if (d.reload === 'crossbow') {
      if (this.t > d.reloadTime * 0.55 && this.reloadCount === 0) {
        this.reloadCount = 1;
        this.audio && this.audio.mech('cock', d.id);
      }
      if (this.t >= d.reloadTime) {
        s.ammo = 1;
        s.reserve -= 1;
        s.chambered = true;
        this.boltVisible(s, true);
        this.setStringNock(s, 1);
        this.state = 'idle';
      }
      return;
    }
    // um cartucho por vez
    if (this.reloadPhase === 'start' && this.t >= d.reloadStart) {
      this.reloadPhase = 'each';
      this.t = 0;
    } else if (this.reloadPhase === 'each' && this.t >= d.reloadEach) {
      this.t = 0;
      s.ammo += 1;
      s.reserve -= 1;
      this.audio && this.audio.mech('shellIn', d.id);
      if (s.ammo >= d.mag || s.reserve <= 0) this.reloadPhase = 'end';
    } else if (this.reloadPhase === 'end' && this.t >= d.reloadEnd) {
      this.state = 'idle';
      if (!s.chambered && s.ammo > 0) {
        this.state = 'cycle';
        this.t = 0;
        this.audio && this.audio.mech(d.action, d.id);
      }
    }
    void input;
  }

  fire(s, d, player, ctx) {
    s.ammo -= 1;
    this.cool = d.cadencia;
    this.state = 'fire';
    this.t = 0;
    if (d.action) s.chambered = false;
    if (d.id === 'crossbow') {
      s.chambered = false;
      this.boltVisible(s, false);
      this.setStringNock(s, 0);
    }
    // recuo
    const k = d.recoil * (1 - this.ads * 0.35) * (player.crouch ? 0.75 : 1);
    player.recoil.pitch += k * (0.8 + Math.random() * 0.4);
    player.recoil.yaw += (Math.random() - 0.5) * k * 0.6;
    player.trauma = Math.min(1, player.trauma + k * 2.2);
    this.kickV += d.id === 'ar' ? 0.6 : d.id === 'crossbow' ? 0.4 : 1.6;
    if (d.id !== 'crossbow') {
      this.flashT = 0.05;
      this.flash.material.rotation = Math.random() * Math.PI;
      const sc = d.id === 'shotgun' ? 0.22 : 0.16;
      this.flash.scale.set(sc, sc, 1);
    }
    if (d.id === 'ar') this.ejectShell(d);
    const spread = lerp(d.spreadHip, d.spreadAds, this.ads) * (player.moving > 1 ? 1.6 : 1) * (this.holdBreath ? 0.5 : 1);
    this.fireFn && this.fireFn(d, spread, this.ads);
    this.audio && this.audio.shot(d.id);
  }

  ejectShell(d) {
    if (d.id === 'crossbow') return;
    const m = makeShellMesh(d.id === 'shotgun' ? 'shotgun' : d.id === 'rifle' ? 'rifle' : 'ar');
    const ud = this.slot.model.userData;
    const p = (ud.port || ud.boltKnob || new THREE.Vector3(0.02, ud.by, 0)).clone();
    this.slot.holder.localToWorld(p);
    this.root.worldToLocal(p);
    m.position.copy(p);
    m.traverse((o) => (o.frustumCulled = false));
    this.root.add(m);
    this.shells.push({ m, v: new THREE.Vector3(0.7 + Math.random() * 0.4, 0.9 + Math.random() * 0.5, 0.2), w: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), t: 0 });
    this.audio && this.audio.shellDrop(d.id === 'shotgun');
  }

  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      s.v.y -= 6 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt;
      s.m.rotation.y += s.w.y * dt;
      if (s.t > 0.7) {
        this.root.remove(s.m);
        this.shells.splice(i, 1);
      }
    }
  }

  // pose do viewmodel: quadril, mira, corrida, balanço, recuo e as animações das peças
  updatePose(dt, s, d, player, ctx) {
    const h = s.holder;
    const ud = s.model.userData;
    const look = ctx.look || { x: 0, y: 0 };
    // balanço da arma ao virar a câmera
    this.swayX = damp(this.swayX, clamp(-look.x * 1.6, -0.06, 0.06), 9, dt);
    this.swayY = damp(this.swayY, clamp(look.y * 1.6, -0.05, 0.05), 9, dt);
    // mola do recuo
    this.kickV += (-this.kick * 220 - this.kickV * 22) * dt;
    this.kick += this.kickV * dt * 0.08;
    const ads = smooth(this.ads);
    const t = this.time;
    const breathe = Math.sin(t * 1.6) * 0.003 * (1 - ads * 0.8);
    const bob = player.bobAmt;
    const bx = Math.sin(player.bob * 0.5) * 0.012 * bob * (1 - ads * 0.85);
    const byy = -Math.abs(Math.sin(player.bob)) * 0.012 * bob * (1 - ads * 0.85);
    const hip = d.hip;
    const adsPos = [0, -ud.sightY, -d.ads];
    let px = lerp(hip[0], adsPos[0], ads) + bx + this.swayX * (1 - ads * 0.7);
    let py = lerp(hip[1], adsPos[1], ads) + byy + breathe + this.swayY * (1 - ads * 0.7);
    let pz = lerp(hip[2], adsPos[2], ads) + this.kick * 0.9;
    let rx = this.kick * 2.2 * (1 - ads * 0.5) + this.swayY * 0.6;
    let ry = this.swayX * 0.8 + (1 - ads) * 0.04;
    let rz = (1 - ads) * 0.02 + bx * 0.8;
    // correr: arma cruzada no peito
    const sp = smooth(this.sprint);
    px = lerp(px, 0.06, sp);
    py = lerp(py, -0.2 + Math.abs(Math.sin(player.bob)) * 0.02, sp);
    pz = lerp(pz, -0.3, sp);
    rx = lerp(rx, -0.35, sp);
    ry = lerp(ry, 0.75, sp);
    rz = lerp(rz, 0.3, sp);
    // abaixada (nadando, morto)
    py -= this.lower * 0.35;
    // sacar / guardar
    let eq = 0;
    if (this.state === 'equip') eq = 1 - smooth(this.t / 0.45);
    if (this.state === 'unequip') eq = smooth(this.t / 0.28);
    if (this.binoculars) eq = Math.max(eq, 1);
    this.eqK = damp(this.eqK ?? 0, eq, this.binoculars ? 10 : 30, dt);
    const eqv = this.state === 'equip' || this.state === 'unequip' ? eq : this.eqK;
    py -= eqv * 0.3;
    rx -= eqv * 0.6;

    // animações específicas
    let leftOff = null; // deslocamento extra da mão esquerda
    let rightToBolt = 0;
    const st = this.state;
    if (ud.bolt && d.id === 'rifle') {
      const arm = ud.bolt.userData.arm;
      let up = 0;
      let back = 0;
      if (st === 'cycle' || (st === 'reload' && this.reloadPhase !== 'each')) {
        const tt = st === 'cycle' ? this.t / d.actionTime : this.reloadPhase === 'start' ? Math.min(1, this.t / d.reloadStart) * 0.5 : 0.5 + Math.min(1, this.t / d.reloadEnd) * 0.5;
        up = smooth((tt - 0.05) / 0.2) * (1 - smooth((tt - 0.75) / 0.2));
        back = smooth((tt - 0.25) / 0.2) * (1 - smooth((tt - 0.5) / 0.2));
        if (st === 'reload') {
          back = this.reloadPhase === 'start' ? smooth(this.t / d.reloadStart) : this.reloadPhase === 'end' ? 1 - smooth(this.t / d.reloadEnd) : 1;
          up = Math.max(up, back);
        }
        rightToBolt = Math.max(up, back) ;
        rz -= up * 0.15;
        px -= up * 0.02;
      } else if (st === 'reload') {
        up = 1;
        back = 1;
        rightToBolt = 0.6;
      }
      arm.rotation.z = up * 1.35;
      ud.bolt.position.z = back * 0.075;
    }
    if (ud.pump) {
      let pb = 0;
      if (st === 'cycle') pb = bump(this.t / d.actionTime, 0.05, 0.85);
      ud.pump.position.z = -0.33 + pb * 0.085;
      leftOff = new THREE.Vector3(0, 0, pb * 0.085);
    }
    if (st === 'reload') {
      const k = d.reload === 'mag' ? bump(this.t / d.reloadTime, 0, 1) : d.reload === 'crossbow' ? bump(this.t / d.reloadTime, 0, 1) : this.reloadPhase === 'start' ? smooth(this.t / d.reloadStart) : this.reloadPhase === 'end' ? 1 - smooth(this.t / d.reloadEnd) : 1;
      // inclina para mostrar a janela de carga
      rz += k * (d.id === 'shotgun' ? 0.7 : 0.35);
      rx += k * (d.id === 'crossbow' ? -0.6 : 0.12);
      py -= k * 0.03;
      px -= k * 0.03;
      if (d.reload === 'single' && this.reloadPhase === 'each') {
        const e = this.t / d.reloadEach;
        const push = bump(e, 0.1, 0.9);
        leftOff = new THREE.Vector3(0.02, -0.06 + push * 0.04, 0.1 - push * 0.05);
        if (d.id === 'rifle') leftOff.set(0.04, 0.06 * push, 0.28);
      }
      if (d.reload === 'mag' && ud.mag) {
        const e = this.t / d.reloadTime;
        const out = smooth((e - 0.08) / 0.15) * (1 - smooth((e - 0.38) / 0.12));
        ud.mag.position.y = ud.by - 0.06 - out * 0.22;
        ud.mag.rotation.x = -out * 0.4;
        ud.mag.visible = !(e > 0.25 && e < 0.32);
        leftOff = new THREE.Vector3(0, -0.04 - out * 0.15, 0.24);
        if (e > 0.75) {
          const ch = bump(e, 0.76, 0.98);
          leftOff = new THREE.Vector3(0.01, 0.07 * ch, 0.28 + ch * 0.06);
        }
      }
      if (d.reload === 'crossbow') {
        const e = this.t / d.reloadTime;
        const pull = smooth((e - 0.15) / 0.4);
        this.setStringNock(s, pull);
        leftOff = new THREE.Vector3(0, 0.05 * bump(e, 0.1, 0.6), lerp(-0.25, 0.25, pull) * bump(e, 0.05, 0.7) + 0.25 * smooth((e - 0.7) / 0.2));
        if (e > 0.62) {
          this.boltVisible(s, true);
          ud.bolt.position.y = ud.by + 0.008 + (1 - smooth((e - 0.62) / 0.3)) * 0.06;
        }
      }
    } else if (ud.mag) {
      ud.mag.position.y = ud.by - 0.06;
      ud.mag.rotation.x = 0;
      ud.mag.visible = true;
    }
    if (d.id === 'crossbow' && st !== 'reload' && ud.bolt) ud.bolt.position.y = ud.by + 0.008;

    h.position.set(px, py, pz);
    h.rotation.set(rx, ry, rz, 'YXZ');
    // luneta: esconde a arma quando a mira cobre a tela
    const scopedView = d.scope && this.ads > 0.93;
    s.model.visible = !scopedView;
    this.scoped = scopedView;
    // mãos
    h.updateMatrix();
    const gp = ud.grip.clone();
    if (rightToBolt > 0 && ud.boltKnob) gp.lerp(ud.boltKnob.clone().add(new THREE.Vector3(0.01, -0.015, ud.bolt.position.z)), rightToBolt);
    const fp = ud.fore.clone();
    if (leftOff) fp.add(leftOff);
    const wR = gp.applyMatrix4(h.matrix);
    const wL = fp.applyMatrix4(h.matrix);
    const elbowR = _eR.set(0.3, -0.42, 0.1);
    const elbowL = _eL.set(-0.12, -0.55, -0.12);
    if (sp > 0.5) elbowL.set(-0.05, -0.5, 0.0);
    _q.setFromEuler(_eu.set(rx + 0.2, ry, rz - 0.3, 'YXZ'));
    this.armR.place(wR, elbowR, _q);
    _q2.setFromEuler(_eu.set(rx - 0.3, ry, rz + 0.9, 'YXZ'));
    this.armL.place(wL, elbowL, _q2);
    const showArms = !scopedView && this.eqK < 0.9;
    this.armR.group.visible = showArms;
    this.armL.group.visible = showArms;
    // clarão na boca do cano
    const m = ud.muzzle.clone().applyMatrix4(h.matrix);
    this.flash.position.copy(m);
    this.flash.userData.light.position.copy(m);
    this.muzzleLocal = m;
  }
}
const _eR = new THREE.Vector3();
const _eL = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _eu = new THREE.Euler();
