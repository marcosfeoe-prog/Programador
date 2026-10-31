// Cena da partida: monta o estádio, a iluminação do horário e do clima,
// os modelos dos jogadores, a bola, a chuva/neve e desenha cada quadro (ao
// vivo, com interpolação, ou no replay).
import * as THREE from 'three';
import { Stadium } from './stadium.js';
import { PlayerModel, readPose, blobTexture } from './players3d.js';
import { Sky, Precip } from './weatherfx.js';
import { BroadcastCam } from './camera.js';
import { ballTexture, BALL_SKINS } from './textures.js';
import { POSE_SIZE, ST } from '../engine/player.js';
import { PITCH as P, BALL as B } from '../engine/constants.js';
import { clamp, lerp } from '../util.js';
import { crestImage } from '../ui/crest.js';

const LOOKS = {
  ref: { skin: '#c68e64', hair: '#1e1e1e', hairStyle: 3, beard: false },
};

export class MatchView {
  constructor(renderer, match, { quality, kits, camMode = 'tv', ballSkin = 'classica' }) {
    this.renderer = renderer;
    this.m = match;
    this.q = quality;
    this.kits = kits;
    const env = match.env;
    this.env = env;
    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.3, 3200);
    this.cam = new BroadcastCam(this.camera);
    this.cam.mode = camMode;
    this.ballSkin = ballSkin;
    this.night = env.time === 'noite';
    this.time = 0;

    this.sky = new Sky(scene);
    this.setupLighting();
    this.stadium = new Stadium(scene, { club: match.teams[0].club, away: match.teams[1].club, env, quality, seed: match.seed });
    this.buildEnvMap();
    this.buildPlayers();
    this.buildBall();
    this.buildMarkers();
    if (env.rain > 0) this.precip = new Precip(scene, 'rain', Math.round(quality.rain * (0.5 + env.rain * 0.7)), env);
    if (env.snow > 0) this.precip = new Precip(scene, 'snow', Math.round(quality.rain * 0.8), env);
    this.flash = 0;
    this.nextLightning = 6 + Math.random() * 10;
    this.cheer = [0, 0];
    this.replayVariant = 0;
    this.tmpPose = {};
    this.screenT = 0;
  }

  setupLighting() {
    const env = this.env;
    const s = this.scene;
    const time = env.time;
    const cloud = env.cloud;
    const u = this.sky.uniforms;
    const hemi = new THREE.HemisphereLight('#bcd7f0', '#3c4a2c', 0.6);
    s.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight('#fff2dd', 2.6);
    this.sun = sun;
    s.add(sun);
    s.add(sun.target);
    let elev;
    let azim;
    let zen;
    let hor;
    let sunCol;
    let sunI;
    let exposure = 1;
    if (time === 'entardecer') {
      elev = 0.12;
      azim = -2.3;
      zen = '#34508f';
      hor = '#f2a35e';
      sunCol = '#ffae6a';
      sunI = 2.0;
      hemi.color.set('#e0b08a');
      hemi.groundColor.set('#3a3424');
      hemi.intensity = 0.55;
    } else if (time === 'noite') {
      elev = 0.6;
      azim = 1.2;
      zen = '#03060d';
      hor = '#1b2433';
      sunCol = '#9fb4d8';
      sunI = 0;
      hemi.color.set('#30405a');
      hemi.groundColor.set('#141812');
      hemi.intensity = 0.35;
      exposure = 1.05;
    } else {
      elev = 0.68;
      azim = -2.0;
      zen = '#2d6db8';
      hor = '#a8c8e6';
      sunCol = '#fff3e0';
      sunI = 2.7;
    }
    // nuvens e clima
    const grey = cloud * (env.rain > 0 ? 1 : 0.8);
    const cz = new THREE.Color(zen).lerp(new THREE.Color(time === 'noite' ? '#0c0f14' : env.rain > 0 ? '#5c636d' : '#8b949e'), grey);
    const ch = new THREE.Color(hor).lerp(new THREE.Color(time === 'noite' ? '#1d232c' : env.snow > 0 ? '#d5dbe2' : '#a3abb4'), grey);
    if (env.fog > 0.5 && time !== 'noite') {
      cz.lerp(new THREE.Color('#c3c8cc'), 0.6);
      ch.set('#ccd1d5');
    }
    u.uZenith.value.copy(cz);
    u.uHorizon.value.copy(ch);
    u.uGround.value.set(time === 'noite' ? '#0a0c0e' : '#3a3f36');
    u.uCloud.value = cloud;
    u.uNight.value = time === 'noite' ? 1 : 0;
    u.uSunCol.value.set(sunCol);
    u.uCloudLit.value.set(time === 'entardecer' ? '#ffc79a' : time === 'noite' ? '#2a3240' : '#f4f6f8');
    u.uCloudDark.value.set(time === 'noite' ? '#0b0e13' : env.rain > 0 ? '#4d535c' : '#8f97a2');
    const dir = new THREE.Vector3(Math.cos(azim) * Math.cos(elev), Math.sin(elev), Math.sin(azim) * Math.cos(elev));
    u.uSunDir.value.copy(dir);
    sun.color.set(sunCol);
    sun.intensity = sunI * (1 - cloud * 0.78);
    sun.position.copy(dir).multiplyScalar(160);
    hemi.intensity *= 1 + cloud * 0.6;
    if (cloud > 0.7) hemi.color.lerp(new THREE.Color('#c9ced4'), 0.5);
    this.sunDir = dir;

    // refletores (noite): quatro luzes direcionais dos cantos
    this.flood = [];
    if (time === 'noite' || (time === 'entardecer' && cloud > 0.6)) {
      const fi = time === 'noite' ? 1.05 : 0.45;
      const spots = [
        [-P.HL - 20, 42, -P.HW - 24],
        [P.HL + 20, 42, -P.HW - 24],
        [-P.HL - 20, 42, P.HW + 24],
        [P.HL + 20, 42, P.HW + 24],
      ];
      spots.forEach((sp, i) => {
        const l = new THREE.DirectionalLight('#fff6e6', fi);
        l.position.set(...sp);
        l.target.position.set(-sp[0] * 0.15, 0, -sp[2] * 0.15);
        s.add(l);
        s.add(l.target);
        this.flood.push(l);
      });
      if (time === 'noite') {
        // a luz principal com sombra vem de um dos refletores
        this.sun.position.set(-P.HL - 20, 42, P.HW + 24);
        this.sun.color.set('#fff6e6');
        this.sun.intensity = 0.0;
      }
    }
    const shadowLight = time === 'noite' ? this.flood[0] : sun;
    if (this.q.shadows && shadowLight) {
      shadowLight.castShadow = true;
      const sc = shadowLight.shadow.camera;
      const ext = this.q.shadowExt || 80;
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext * 0.75;
      sc.bottom = -ext * 0.75;
      sc.near = 1;
      sc.far = 420;
      shadowLight.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
      shadowLight.shadow.bias = -0.0004;
      shadowLight.shadow.normalBias = 0.03;
      if (time !== 'noite') {
        // posiciona a luz para cobrir o estádio
        shadowLight.position.copy(dir).multiplyScalar(200);
        shadowLight.target.position.set(0, 0, 0);
      }
    }
    this.shadowLight = shadowLight;
    // sombras borradas (blob) para os outros refletores ou qualidade baixa
    this.blobLights = [];
    if (time === 'noite') {
      for (const l of this.flood) {
        const d = new THREE.Vector3().copy(l.position).setY(0).normalize();
        this.blobLights.push({ dx: -d.x, dz: -d.z, stretch: 0.4, opacity: 0.22 });
      }
    } else if (!this.q.shadows) {
      this.blobLights.push({ dx: -dir.x, dz: -dir.z, stretch: clamp(1 / Math.tan(elev) * 0.3, 0.2, 2), opacity: 0.45 * (1 - cloud * 0.6) });
    }
    // névoa
    const fogCol = ch.clone();
    let dens = 0.0011;
    if (env.fog > 0.5) dens = 0.0095;
    else if (env.snow > 0) dens = 0.0055;
    else if (env.rain > 0) dens = 0.0025 + env.rain * 0.0025;
    if (env.weather === 'calor') dens = 0.0016;
    this.scene.fog = new THREE.FogExp2(fogCol, dens);
    this.exposure = exposure * (time === 'noite' ? 1 : 1 - cloud * 0.08);
    this.baseHemi = hemi.intensity;
    this.lightCol = new THREE.Color(1, 1, 1).multiplyScalar(time === 'noite' ? 0.62 : time === 'entardecer' ? 0.75 : 0.95 - cloud * 0.3);
  }

  buildEnvMap() {
    // reflexos (gramado molhado, traves): ambiente gerado a partir do céu
    const pm = new THREE.PMREMGenerator(this.renderer);
    const sc = new THREE.Scene();
    const sky2 = new Sky(sc);
    Object.assign(sky2.uniforms, {});
    for (const k in this.sky.uniforms) sky2.uniforms[k].value = this.sky.uniforms[k].value;
    const rt = pm.fromScene(sc, 0.02);
    this.scene.environment = rt.texture;
    this.envRT = rt;
    sky2.dispose();
    pm.dispose();
    this.stadium.setLighting(this.lightCol);
  }

  buildPlayers() {
    const m = this.m;
    this.models = [];
    this.slotIds = [];
    const list = m.recList();
    for (let i = 0; i < list.length; i++) this.models.push(this.makeModel(list[i], i));
  }

  makeModel(p, i) {
    const m = this.m;
    const shadows = !!this.q.shadows;
    const nBlob = this.blobLights.length;
    let model;
    if (p.isRef) {
      const k = this.kits.ref;
      model = new PlayerModel({ kit: k, look: LOOKS.ref, number: null, height: 1.8, ref: true, flag: i > 22, shadows, blobs: nBlob });
    } else {
      const ti = i < 11 ? 0 : 1;
      const team = m.teams[ti];
      const k = p.isGK ? this.kits.gk[ti] : this.kits.team[ti];
      model = new PlayerModel({ kit: k, look: { ...p.data.look, boot: ['#111111', '#f2f2f2', '#e8402a', '#2a7de8', '#f0d020'][p.data.num % 5] }, number: p.data.num, name: p.data.shirt, height: p.height, gk: p.isGK, crest: crestImage(team.club), shadows, blobs: nBlob });
    }
    this.scene.add(model.root);
    for (const b of model.blobs) this.scene.add(b);
    this.slotIds[i] = p.uid;
    return model;
  }

  buildBall() {
    const skin = BALL_SKINS[this.ballSkin] ? this.ballSkin : 'classica';
    // na neve a bola padrão vira laranja (como nos jogos de verdade)
    const tex = ballTexture(skin === 'classica' && this.env.ballColor === 'laranja' ? 'laranja' : skin);
    this.ballTex = tex;
    const S = BALL_SKINS[skin];
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: this.env.rain > 0 ? Math.min(0.25, S.rough) : S.rough, metalness: S.metal });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(B.r, 24, 16), mat);
    this.ball.castShadow = !!this.q.shadows;
    this.scene.add(this.ball);
    this.ballQ = new THREE.Quaternion();
    const sm = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.6 });
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2), sm);
    this.ballShadow.renderOrder = 2;
    this.scene.add(this.ballShadow);
  }

  buildMarkers() {
    const ringM = new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0.9, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32).rotateX(-Math.PI / 2), ringM);
    this.ring.renderOrder = 3;
    this.scene.add(this.ring);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 3).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#ffe14d', fog: false }));
    this.scene.add(this.arrow);
    const tgtM = new THREE.MeshBasicMaterial({ color: '#7cf2ff', transparent: true, opacity: 0.55, depthWrite: false });
    this.passMark = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), tgtM);
    this.passMark.renderOrder = 3;
    this.scene.add(this.passMark);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ eventos visuais

  onEvent(e) {
    if (e.type === 'net') {
      const net = this.stadium.nets[e.side > 0 ? 1 : 0];
      net.impulse(e.x, e.y, e.z, Math.min(e.speed, 25) * (e.inside ? 1 : -0.6));
    } else if (e.type === 'goal') {
      this.stadium.flashGoal();
      this.cheer[e.team.side] = 1.3;
    } else if (e.type === 'miss' || e.type === 'save') {
      this.cheer[0] = Math.max(this.cheer[0], 0.25);
      this.cheer[1] = Math.max(this.cheer[1], 0.25);
    }
  }

  // ------------------------------------------------------------ quadro

  render(dt, { replay = null, userTeam = null } = {}) {
    const m = this.m;
    this.time += dt;
    const t = this.time;
    // modelos (trocas de jogador)
    const list = m.recList();
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].uid !== this.slotIds[i]) {
        const old = this.models[i];
        this.scene.remove(old.root);
        for (const b of old.blobs) this.scene.remove(b);
        old.dispose();
        this.models[i] = this.makeModel(list[i], i);
      }
    }
    const P0 = this.tmpPose;
    let bx;
    let by;
    let bz;
    let wx;
    let wy;
    let wz;
    if (replay) {
      const { a, oa, b, ob, f } = replay;
      for (let i = 0; i < this.models.length; i++) {
        readPose(a, oa + i * POSE_SIZE, b, ob + i * POSE_SIZE, f, P0);
        this.models[i].apply(P0, t, 0);
        this.models[i].placeBlobs(P0, this.blobLights);
      }
      const ka = oa + 27 * POSE_SIZE;
      const kb = ob + 27 * POSE_SIZE;
      bx = lerp(a[ka], b[kb], f);
      by = lerp(a[ka + 1], b[kb + 1], f);
      bz = lerp(a[ka + 2], b[kb + 2], f);
      wx = a[ka + 3];
      wy = a[ka + 4];
      wz = a[ka + 5];
      this.ring.visible = this.arrow.visible = this.passMark.visible = false;
    } else {
      const al = m.alpha || 0;
      const arr = (this.liveArr = this.liveArr || new Float32Array(POSE_SIZE));
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p) continue;
        p.writePose(arr, 0);
        // interpola a posição entre passos fixos
        arr[0] = lerp(p.px, p.x, al);
        arr[2] = lerp(p.pz, p.z, al);
        readPose(arr, 0, null, 0, 0, P0);
        this.models[i].apply(P0, t, m.ball.p.y);
        this.models[i].placeBlobs(P0, this.blobLights);
      }
      const bb = m.ball;
      bx = lerp(bb.prev.x, bb.p.x, al);
      by = lerp(bb.prev.y, bb.p.y, al);
      bz = lerp(bb.prev.z, bb.p.z, al);
      wx = bb.w.x;
      wy = bb.w.y;
      wz = bb.w.z;
      // marcador do jogador controlado
      const ut = userTeam != null ? m.teams[userTeam] : null;
      const c = ut && ut.ctrlMark;
      const showMark = c && c.active && !c.sentOff && m.state !== 'over';
      this.ring.visible = this.arrow.visible = !!showMark;
      if (showMark) {
        const x = lerp(c.px, c.x, al);
        const z = lerp(c.pz, c.z, al);
        this.ring.position.set(x, 0.03, z);
        this.arrow.position.set(x, c.height + 0.55 + c.y + Math.sin(t * 5) * 0.05, z);
        this.ring.material.color.set(c.pending ? '#ff7a3d' : '#ffe14d');
      }
      // destino do passe
      const pi = m.passInfo;
      this.passMark.visible = !!(pi && pi.to && ut && pi.team === ut);
      if (this.passMark.visible) this.passMark.position.set(pi.to.x, 0.03, pi.to.z);
    }
    // bola (rotação integrada da velocidade angular)
    this.ball.position.set(bx, by, bz);
    const wm = Math.hypot(wx, wy, wz);
    if (wm > 1e-3) {
      const ax = new THREE.Vector3(wx / wm, wy / wm, wz / wm);
      const dq = new THREE.Quaternion().setFromAxisAngle(ax, wm * dt * (replay ? replay.speed : 1));
      this.ballQ.premultiply(dq);
      this.ball.quaternion.copy(this.ballQ);
    }
    const held = !replay && m.ball.held;
    this.ballShadow.visible = !held || true;
    this.ballShadow.position.set(bx + (this.blobLights[0] ? 0 : 0), 0.025, bz);
    const hs = 1 + by * 0.35;
    this.ballShadow.scale.set(hs, 1, hs);
    this.ballShadow.material.opacity = clamp(0.6 - by * 0.06, 0.12, 0.6);

    // câmera
    if (replay) this.cam.replay(dt, { x: bx, y: by, z: bz }, this.replayVariant, replay.goalX, t);
    else {
      const ut = userTeam != null ? m.teams[userTeam] : m.teams[0];
      let focus = null;
      if (m.state === 'goal' && m.scorerEnt) focus = { x: m.scorerEnt.x, z: m.scorerEnt.z };
      this.cam.update(dt, {
        ball: { x: bx, y: by, z: bz },
        vx: m.ball.v.x,
        vz: m.ball.v.z,
        attackDir: ut.dir,
        state: m.state,
        sp: m.sp,
        focus,
        player: ut.ctrlMark && ut.ctrlMark.active ? ut.ctrlMark : m.possessor || null,
        aspect: this.camera.aspect,
      });
    }
    // torcida, placas, rede, bandeiras
    this.cheer[0] = Math.max(0, this.cheer[0] - dt * 0.12);
    this.cheer[1] = Math.max(0, this.cheer[1] - dt * 0.12);
    this.stadium.update(dt, t, { excite: m.excitement, cheer: this.cheer });
    this.screenT -= dt;
    if (this.screenT <= 0) {
      this.screenT = 1;
      this.stadium.drawScreen(m.teams[0].club, m.teams[1].club, m.teams[0].score, m.teams[1].score, m.minute() + "'");
    }
    // chuva/neve e relâmpagos
    this.sky.uniforms.uTime.value = t;
    if (this.precip) {
      const c = this.camera.position;
      const f = new THREE.Vector3();
      this.camera.getWorldDirection(f);
      this.precip.update(t, new THREE.Vector3(c.x + f.x * 30, c.y + f.y * 30, c.z + f.z * 30));
    }
    if (this.env.lightning) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = 7 + Math.random() * 16;
        this.flash = 1;
        this.flashT = 0;
        this.onLightning && this.onLightning(0.4 + Math.random() * 2.5);
      }
    }
    if (this.flash > 0) {
      this.flashT += dt;
      const f = this.flashT < 0.08 ? 1 : this.flashT < 0.14 ? 0.2 : this.flashT < 0.22 ? 0.8 : Math.max(0, 1 - (this.flashT - 0.22) * 5);
      this.sky.uniforms.uFlash.value = f * 0.8;
      this.hemi.intensity = this.baseHemi + f * 2.2;
      if (this.flashT > 0.5) {
        this.flash = 0;
        this.sky.uniforms.uFlash.value = 0;
        this.hemi.intensity = this.baseHemi;
      }
    }
    // sombra acompanha o jogo (resolução melhor perto da bola)
    if (this.shadowLight && this.q.shadows && this.env.time !== 'noite') {
      const L = this.shadowLight;
      L.target.position.set(clamp(bx, -30, 30), 0, 0);
      L.position.copy(this.sunDir).multiplyScalar(200).add(L.target.position);
    }
    this.renderer.toneMappingExposure = this.exposure;
    this.renderer.render(this.scene, this.camera);
  }

  // Projeta um ponto do mundo para a tela (para rótulos no HUD).
  project(x, y, z, w, h) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis: v.z < 1 && v.z > -1 };
  }

  dispose() {
    this.stadium.dispose();
    for (const md of this.models) {
      this.scene.remove(md.root);
      md.dispose();
    }
    this.sky.dispose();
    if (this.precip) this.precip.dispose();
    this.ballTex.dispose();
    this.ball.geometry.dispose();
    if (this.envRT) this.envRT.dispose();
    this.scene.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
    });
  }
}
