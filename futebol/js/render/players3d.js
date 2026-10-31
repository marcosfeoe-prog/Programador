// Modelo 3D procedural dos jogadores (e árbitros) com animação por pose:
// corrida com passada proporcional à velocidade, chute, carrinho, desarme,
// queda, mergulho do goleiro, cabeceio, comemoração, arremesso lateral.
import * as THREE from 'three';
import { ST } from '../engine/player.js';
import { shirtTexture } from './textures.js';
import { clamp, lerp } from '../util.js';

let G = null;
function geos() {
  if (G) return G;
  const top = (g, len) => {
    g.translate(0, -len / 2, 0);
    return g;
  };
  G = {
    torso: new THREE.BoxGeometry(0.38, 0.5, 0.22, 1, 1, 1).translate(0, 0.25, 0),
    chest: new THREE.CylinderGeometry(0.2, 0.17, 0.5, 10, 1).translate(0, 0.25, 0),
    shorts: new THREE.BoxGeometry(0.37, 0.22, 0.24).translate(0, -0.06, 0),
    neck: new THREE.CylinderGeometry(0.05, 0.056, 0.1, 8).translate(0, 0.55, 0),
    head: new THREE.SphereGeometry(0.108, 16, 12),
    hair0: new THREE.SphereGeometry(0.114, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hair1: new THREE.SphereGeometry(0.136, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hair2: new THREE.SphereGeometry(0.117, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.7),
    beard: new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.32),
    upperArm: top(new THREE.CapsuleGeometry(0.05, 0.2, 3, 8), 0.29),
    forearm: top(new THREE.CapsuleGeometry(0.043, 0.19, 3, 8), 0.27),
    hand: new THREE.SphereGeometry(0.048, 8, 6).translate(0, -0.29, 0),
    glove: new THREE.SphereGeometry(0.065, 8, 6).scale(1, 1.2, 0.7).translate(0, -0.3, 0),
    thigh: top(new THREE.CapsuleGeometry(0.078, 0.3, 3, 8), 0.45),
    shin: top(new THREE.CapsuleGeometry(0.06, 0.3, 3, 8), 0.43),
    boot: new THREE.BoxGeometry(0.105, 0.075, 0.27).translate(0, -0.47, 0.055),
    flag: new THREE.PlaneGeometry(0.42, 0.3).translate(0.21, -0.15, 0),
    flagPole: new THREE.CylinderGeometry(0.008, 0.008, 0.55, 5).translate(0, -0.15, 0),
    ring: new THREE.RingGeometry(0.42, 0.55, 32).rotateX(-Math.PI / 2),
    arrow: new THREE.ConeGeometry(0.16, 0.28, 3).rotateX(Math.PI),
    blob: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  };
  return G;
}

const matCache = new Map();
function mat(color, rough = 0.8) {
  const k = color + rough;
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  matCache.set(k, m);
  return m;
}

let blobTex = null;
export function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

// kit: {p, s, pattern, shorts, socks}, look: {skin, hair, hairStyle, beard}
export class PlayerModel {
  constructor({ kit, look, number, name, height = 1.8, gk = false, crest = null, ref = false, flag = false, shadows = true, blobs = 0 }) {
    const g = geos();
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.93;
    this.root.add(this.body);
    const sc = height / 1.78;
    this.root.scale.setScalar(sc);
    this.scale = sc;

    const front = shirtTexture(kit, { number, crest });
    const back = shirtTexture(kit, { number, name, back: true });
    const side = shirtTexture(kit, {});
    const shirtM = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
    const mSide = shirtM(side);
    // ordem do BoxGeometry: +x, -x, +y, -y, +z (frente), -z (costas)
    const torsoMats = [mSide, mSide, mSide, mSide, shirtM(front), shirtM(back)];
    this.textures = [front, back, side];
    this.mats = torsoMats;
    const skin = mat(look.skin, 0.65);
    const sleeveColor = kit.pattern === 'mangas' ? kit.s : kit.p;
    const sleeve = mat(sleeveColor, 0.75);
    const shorts = mat(kit.shorts || '#ffffff', 0.7);
    const socks = mat(kit.socks || kit.p, 0.8);
    const bootM = mat(gk ? '#111111' : look.boot || '#111111', 0.4);
    const cast = (m) => {
      m.castShadow = shadows;
      return m;
    };

    this.hips = new THREE.Group();
    this.body.add(this.hips);
    this.hips.add(cast(new THREE.Mesh(g.shorts, shorts)));
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const torsoMesh = cast(new THREE.Mesh(g.torso, torsoMats));
    this.torso.add(torsoMesh);
    this.torso.add(cast(new THREE.Mesh(g.neck, skin)));
    this.head = new THREE.Group();
    this.head.position.y = 0.66;
    this.torso.add(this.head);
    this.head.add(cast(new THREE.Mesh(g.head, skin)));
    const hairM = mat(look.hair, 0.9);
    const hs = look.hairStyle | 0;
    if (hs !== 3) {
      const hg = hs === 1 ? g.hair1 : hs === 2 ? g.hair2 : g.hair0;
      const hair = new THREE.Mesh(hg, hairM);
      hair.position.y = hs === 1 ? 0.0 : 0.01;
      hair.rotation.x = hs === 2 ? 0.25 : 0;
      this.head.add(hair);
    }
    if (look.beard) {
      const b = new THREE.Mesh(g.beard, hairM);
      b.rotation.x = -0.25;
      this.head.add(b);
    }

    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.225, 0.46, 0);
      this.torso.add(sh);
      sh.add(cast(new THREE.Mesh(g.upperArm, sleeve)));
      const el = new THREE.Group();
      el.position.y = -0.29;
      sh.add(el);
      el.add(cast(new THREE.Mesh(g.forearm, gk ? sleeve : skin)));
      el.add(new THREE.Mesh(gk ? g.glove : g.hand, gk ? mat(kit.gloves || '#e8e8e8', 0.6) : skin));
      return { sh, el };
    };
    // lado direito do modelo é -x (o modelo olha para +z)
    this.armR = arm(-1);
    this.armL = arm(1);
    const leg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, 0, 0);
      this.hips.add(hip);
      hip.add(cast(new THREE.Mesh(g.thigh, gk && kit.longPants ? shorts : skin)));
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);
      knee.add(cast(new THREE.Mesh(g.shin, socks)));
      knee.add(cast(new THREE.Mesh(g.boot, bootM)));
      return { hip, knee };
    };
    this.legR = leg(-1);
    this.legL = leg(1);

    if (flag) {
      // bandeira do assistente na mão direita
      const f = new THREE.Group();
      f.position.y = -0.3;
      this.armR.el.add(f);
      f.add(new THREE.Mesh(g.flagPole, mat('#333333', 0.5)));
      const fm = new THREE.MeshStandardMaterial({ color: '#ffd400', side: THREE.DoubleSide, roughness: 0.7 });
      const fl = new THREE.Mesh(g.flag, fm);
      fl.position.y = -0.38;
      fl.rotation.y = Math.PI / 2;
      f.add(fl);
      this.flag = f;
    }
    this.blobs = [];
    for (let i = 0; i < blobs; i++) {
      const b = new THREE.Mesh(g.blob, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
      b.renderOrder = 1;
      this.blobs.push(b);
    }
    this.gk = gk;
    this.ref = ref;
  }

  dispose() {
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
  }

  // P: pose lida do motor (ver PlayerEnt.writePose).
  apply(P, t, ballY) {
    const r = this.root;
    const vis = P.active > 0.5;
    r.visible = vis;
    for (const b of this.blobs) b.visible = vis;
    if (!vis) return;
    r.position.set(P.x, P.y > 0 && P.state !== ST.DIVE ? P.y : 0, P.z);
    r.rotation.set(0, Math.PI / 2 - P.face, 0);
    const sp = P.speed;
    const A = clamp(sp / 8.5, 0, 1);
    const ph = P.phase;
    const body = this.body;
    body.position.set(0, 0.93, 0);
    body.rotation.set(0, 0, 0);
    const hips = this.hips;
    hips.rotation.set(0, 0, 0);
    hips.position.set(0, 0, 0);
    const torso = this.torso;
    torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    const lr = this.legR;
    const ll = this.legL;
    const ar = this.armR;
    const al = this.armL;
    for (const o of [lr.hip, lr.knee, ll.hip, ll.knee, ar.sh, ar.el, al.sh, al.el]) o.rotation.set(0, 0, 0);

    // corrida/caminhada base
    const amp = sp < 0.15 ? 0 : 0.18 + A * 0.75;
    const sw = Math.sin(ph);
    lr.hip.rotation.x = -sw * amp;
    ll.hip.rotation.x = sw * amp;
    lr.knee.rotation.x = Math.max(0, Math.sin(ph - 1.3)) * amp * 1.7 + 0.06;
    ll.knee.rotation.x = Math.max(0, Math.sin(ph + Math.PI - 1.3)) * amp * 1.7 + 0.06;
    ar.sh.rotation.x = sw * amp * 0.9;
    al.sh.rotation.x = -sw * amp * 0.9;
    ar.sh.rotation.z = -0.12;
    al.sh.rotation.z = 0.12;
    ar.el.rotation.x = -(0.25 + A * 1.15);
    al.el.rotation.x = -(0.25 + A * 1.15);
    body.position.y = 0.93 + Math.abs(Math.cos(ph)) * 0.05 * A - 0.025 * A;
    torso.rotation.x = P.lean + 0.04;
    if (sp < 0.15) {
      // parado: respiração leve
      torso.rotation.x = 0.03 + Math.sin(t * 2.2 + P.x) * 0.012;
      ar.sh.rotation.z = -0.1;
      al.sh.rotation.z = 0.1;
      ar.el.rotation.x = -0.15;
      al.el.rotation.x = -0.15;
    }
    // goleiro pronto (agachado, braços abertos)
    if (this.gk && P.state === ST.RUN && sp < 2.5 && !P.holding) {
      lr.hip.rotation.x += -0.35;
      ll.hip.rotation.x += -0.35;
      lr.knee.rotation.x += 0.6;
      ll.knee.rotation.x += 0.6;
      body.position.y -= 0.1;
      torso.rotation.x = 0.3;
      ar.sh.rotation.set(-0.5, 0, -0.55);
      al.sh.rotation.set(-0.5, 0, 0.55);
      ar.el.rotation.x = -0.6;
      al.el.rotation.x = -0.6;
    }

    const s = P.stateT;
    switch (P.state | 0) {
      case ST.KICK: {
        const k = P.kickT;
        const leg = P.kickSide >= 0 ? lr : ll;
        const other = P.kickSide >= 0 ? ll : lr;
        // recua, golpeia e acompanha
        let th;
        let kn;
        if (k < 0.45) {
          const q = k / 0.45;
          th = lerp(0, 0.85, q);
          kn = lerp(0.2, 1.5, q);
        } else if (k < 0.62) {
          const q = (k - 0.45) / 0.17;
          th = lerp(0.85, -1.15, q);
          kn = lerp(1.5, 0.05, q);
        } else {
          const q = (k - 0.62) / 0.38;
          th = lerp(-1.15, -0.5, q);
          kn = lerp(0.05, 0.4, q);
        }
        leg.hip.rotation.set(th, 0, 0);
        leg.knee.rotation.x = kn;
        other.hip.rotation.set(-0.15, 0, 0);
        other.knee.rotation.x = 0.35;
        const sideArm = P.kickSide >= 0 ? al : ar;
        const kArm = P.kickSide >= 0 ? ar : al;
        sideArm.sh.rotation.set(-0.3, 0, P.kickSide >= 0 ? 1.0 : -1.0);
        kArm.sh.rotation.set(0.5, 0, P.kickSide >= 0 ? -0.6 : 0.6);
        torso.rotation.x = 0.1 - Math.sin(k * Math.PI) * 0.25;
        torso.rotation.y = -P.kickSide * Math.sin(k * Math.PI) * 0.3;
        body.position.y = 0.9;
        break;
      }
      case ST.SLIDE: {
        body.position.y = 0.32;
        body.rotation.x = -1.0;
        const lead = P.aux1 >= 0 ? lr : ll;
        const back = P.aux1 >= 0 ? ll : lr;
        lead.hip.rotation.x = -0.5;
        lead.knee.rotation.x = 0.05;
        back.hip.rotation.x = 0.3;
        back.knee.rotation.x = 1.7;
        ar.sh.rotation.set(0.9, 0, -0.5);
        al.sh.rotation.set(0.9, 0, 0.5);
        torso.rotation.x = 0.35;
        break;
      }
      case ST.TACKLE: {
        const q = Math.sin(clamp(s / 0.35, 0, 1) * Math.PI);
        lr.hip.rotation.x = -1.1 * q;
        lr.knee.rotation.x = 0.15;
        ll.hip.rotation.x = 0.2;
        ll.knee.rotation.x = 0.6 * q;
        body.position.y = 0.93 - 0.18 * q;
        torso.rotation.x = 0.35 * q;
        ar.sh.rotation.z = -0.7 * q;
        al.sh.rotation.z = 0.7 * q;
        break;
      }
      case ST.FALLEN: {
        // deitado (levanta no fim)
        const up = clamp((s - 0.4) / 0.6, 0, 1);
        const lie = P.aux2 > 0.5 ? 1 : -1;
        body.position.y = lerp(0.16, 0.93, up * up);
        body.rotation.x = lerp(lie * 1.5, 0, up);
        lr.hip.rotation.x = 0.1;
        ll.hip.rotation.x = -0.2;
        lr.knee.rotation.x = 0.3;
        ll.knee.rotation.x = 0.5;
        ar.sh.rotation.set(-0.4, 0, -1.2);
        al.sh.rotation.set(-0.4, 0, 1.2);
        break;
      }
      case ST.STUMBLE: {
        torso.rotation.x = 0.45;
        ar.sh.rotation.set(-0.6, 0, -0.9);
        al.sh.rotation.set(-0.6, 0, 0.9);
        break;
      }
      case ST.DIVE: {
        // mergulho lateral: o corpo gira em torno do eixo da frente
        const side = P.aux1 >= 0 ? 1 : -1;
        const q = clamp(s / 0.28, 0, 1);
        body.position.y = 0.6 + P.y;
        body.rotation.z = side * q * (1.25 - P.aux2 * 0.25);
        ar.sh.rotation.set(0, 0, -2.75 * q);
        al.sh.rotation.set(0, 0, 2.75 * q);
        ar.el.rotation.x = -0.1;
        al.el.rotation.x = -0.1;
        lr.hip.rotation.x = -0.2;
        ll.hip.rotation.x = 0.15;
        lr.knee.rotation.x = 0.4;
        ll.knee.rotation.x = 0.2;
        torso.rotation.x = 0.1;
        break;
      }
      case ST.HEADER:
      case ST.JUMP: {
        const q = Math.sin(clamp(s / 0.45, 0, 1) * Math.PI);
        ar.sh.rotation.set(-0.7 * q, 0, -0.8 * q);
        al.sh.rotation.set(-0.7 * q, 0, 0.8 * q);
        lr.knee.rotation.x = 0.7 * q;
        ll.knee.rotation.x = 0.4 * q;
        torso.rotation.x = P.state === ST.HEADER ? -0.25 + q * 0.5 : -0.1;
        this.head.rotation.x = P.state === ST.HEADER ? 0.4 * q : 0;
        if (this.gk) {
          ar.sh.rotation.set(-2.9 * q, 0, -0.2);
          al.sh.rotation.set(-2.9 * q, 0, 0.2);
        }
        break;
      }
      case ST.CELEB: {
        const ct = P.celebType | 0;
        if (ct === 2 && sp < 2) {
          // joelhada
          body.position.y = 0.45;
          lr.hip.rotation.x = 0.1;
          ll.hip.rotation.x = 0.1;
          lr.knee.rotation.x = 1.6;
          ll.knee.rotation.x = 1.6;
          torso.rotation.x = -0.35;
          ar.sh.rotation.set(-2.6, 0, -0.3);
          al.sh.rotation.set(-2.6, 0, 0.3);
        } else if (ct === 3) {
          // aviãozinho
          ar.sh.rotation.set(0, 0, -1.45);
          al.sh.rotation.set(0, 0, 1.45);
          ar.el.rotation.x = 0;
          al.el.rotation.x = 0;
          body.rotation.z = Math.sin(t * 2) * 0.25;
        } else {
          const j = Math.abs(Math.sin(t * 6 + P.x));
          ar.sh.rotation.set(-2.7 + j * 0.2, 0, -0.3);
          al.sh.rotation.set(-2.7 + j * 0.2, 0, 0.3);
          ar.el.rotation.x = -0.3;
          al.el.rotation.x = -0.3;
          if (sp < 1) body.position.y = 0.93 + j * 0.12;
        }
        break;
      }
      case ST.THROW: {
        const q = clamp(s / 0.35, 0, 1);
        const back = q < 0.7 ? q / 0.7 : 1 - (q - 0.7) / 0.3;
        ar.sh.rotation.set(-2.7 - back * 0.5, 0, -0.15);
        al.sh.rotation.set(-2.7 - back * 0.5, 0, 0.15);
        ar.el.rotation.x = -0.6 * back;
        al.el.rotation.x = -0.6 * back;
        torso.rotation.x = -0.25 * back;
        break;
      }
      case ST.FEINT: {
        const t = clamp(P.aux2, 0, 1);
        const code = P.aux1 | 0;
        ar.sh.rotation.set(-0.3, 0, -0.75);
        al.sh.rotation.set(-0.3, 0, 0.75);
        body.position.y = 0.88;
        if (code === 1) {
          // dois toques: pé direito e esquerdo empurram a bola para o lado
          const k = Math.sin(t * Math.PI * 2);
          lr.hip.rotation.set(-0.2, 0, -0.45 * Math.max(0, k));
          ll.hip.rotation.set(-0.2, 0, 0.45 * Math.max(0, -k));
          lr.knee.rotation.x = 0.4;
          ll.knee.rotation.x = 0.4;
          body.rotation.z = Math.sin(t * Math.PI) * 0.28;
          torso.rotation.x = 0.25;
        } else if (code === 2) {
          // pedalada: as pernas passam por cima da bola, o corpo balança
          const k = Math.min(1, t / 0.65);
          const leg = k < 0.5 ? lr : ll;
          const q = Math.sin((k < 0.5 ? k * 2 : (k - 0.5) * 2) * Math.PI);
          leg.hip.rotation.set(-0.7 * q, 0, (leg === lr ? -1 : 1) * 0.9 * q);
          leg.knee.rotation.x = 0.9 * q;
          const other = leg === lr ? ll : lr;
          other.knee.rotation.x = 0.35;
          body.rotation.z = Math.sin(k * Math.PI * 2) * 0.3;
          torso.rotation.x = 0.2;
        } else if (code === 3) {
          // giro: agachado, sola na bola enquanto o corpo roda
          lr.hip.rotation.x = -0.6;
          lr.knee.rotation.x = 0.5;
          ll.hip.rotation.x = 0.2;
          ll.knee.rotation.x = 0.7;
          body.position.y = 0.84;
          torso.rotation.x = 0.3;
          ar.sh.rotation.set(-0.2, 0, -1.1);
          al.sh.rotation.set(-0.2, 0, 1.1);
        } else {
          // corte seco: corpo inclinado para dentro da curva, perna de apoio esticada
          const q = Math.sin(Math.min(1, t * 1.4) * Math.PI);
          body.rotation.z = 0.45 * q;
          lr.hip.rotation.set(-0.3, 0, -0.6 * q);
          lr.knee.rotation.x = 0.2;
          ll.hip.rotation.x = 0.4;
          ll.knee.rotation.x = 0.9 * q;
          torso.rotation.x = 0.35;
        }
        break;
      }
      case ST.OFF:
        r.visible = false;
        break;
    }
    // segurando a bola (goleiro ou lateral parado)
    if (P.holding > 0.5 && P.state !== ST.THROW && P.state !== ST.DIVE) {
      if (this.gk) {
        ar.sh.rotation.set(-1.15, 0, 0.25);
        al.sh.rotation.set(-1.15, 0, -0.25);
        ar.el.rotation.x = -0.9;
        al.el.rotation.x = -0.9;
      } else {
        ar.sh.rotation.set(-2.9, 0, -0.15);
        al.sh.rotation.set(-2.9, 0, 0.15);
        ar.el.rotation.x = -0.7;
        al.el.rotation.x = -0.7;
      }
    }
    // assistente com a bandeira levantada
    if (this.flag) {
      if (P.aux1 > 0.5) {
        ar.sh.rotation.set(-2.9, 0, 0);
        ar.el.rotation.x = 0;
      } else {
        ar.sh.rotation.set(0.1, 0, -0.15);
        ar.el.rotation.x = -0.1;
      }
    }
  }

  placeBlobs(P, lights) {
    if (!this.blobs.length) return;
    for (let i = 0; i < this.blobs.length; i++) {
      const b = this.blobs[i];
      const L = lights[i % lights.length];
      // sombra esticada na direção oposta à luz
      const len = 0.5 + 1.2 * L.stretch;
      b.position.set(P.x - L.dx * len * 0.5, 0.02 + i * 0.001, P.z - L.dz * len * 0.5);
      b.rotation.y = -Math.atan2(L.dz, L.dx);
      b.scale.set(0.9 + len, 1, 0.75);
      b.material.opacity = L.opacity;
    }
  }
}

// Leitura da pose de um array (ao vivo ou replay) com interpolação.
export function readPose(a, o, b, ob, f, out) {
  const L = (i) => (b ? a[o + i] + (b[ob + i] - a[o + i]) * f : a[o + i]);
  out.x = L(0);
  out.y = L(1);
  out.z = L(2);
  let fa = a[o + 3];
  if (b) {
    let d = b[ob + 3] - fa;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    fa += d * f;
  }
  out.face = fa;
  out.speed = L(4);
  out.phase = b && Math.abs(b[ob + 5] - a[o + 5]) < 3 ? L(5) : a[o + 5];
  out.state = (b && f > 0.5 ? b[ob + 6] : a[o + 6]) | 0;
  out.stateT = b && out.state === (b[ob + 6] | 0) && out.state === (a[o + 6] | 0) ? L(7) : b && f > 0.5 ? b[ob + 7] : a[o + 7];
  out.kickT = L(8);
  out.kickSide = a[o + 9];
  out.aux1 = a[o + 10];
  out.aux2 = L(11);
  out.lean = L(12);
  out.holding = a[o + 13];
  out.celebType = a[o + 14];
  out.active = a[o + 15];
  return out;
}
