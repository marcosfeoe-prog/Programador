// Nível 12 — "Matrix", área 3: o Branco. Não existe mais nada além de um
// branco interminável. Ao chegar, uma cena mostra pela primeira vez o próprio
// andarilho — o boneco do jogador — de fora. Depois de alguns minutos andando
// no nada, surge uma porta cheia de erros: ela leva ao próximo nível.
import * as THREE from 'three';
import { NPC } from './level0_1_npc.js';
import { clamp, damp, smoothstep, TAU } from '../util.js';
import { textCanvasTex } from '../textures.js';

const DOOR_AFTER = 120; // segundos até a porta aparecer
const CINE = 15; // duração da cena

// Textura da porta com erros: listras, blocos, códigos.
function errorTex() {
  return textCanvasTex(256, 512, (c, w, h) => {
    c.fillStyle = '#e8e8e8';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#b8b8b8';
    c.lineWidth = 6;
    c.strokeRect(28, 30, w - 56, h * 0.38);
    c.strokeRect(28, h * 0.5, w - 56, h * 0.44);
    c.fillStyle = '#8a8a8a';
    c.beginPath();
    c.arc(w - 46, h * 0.5, 9, 0, TAU);
    c.fill();
    const lines = ['ERRO 0x0000000C', 'NULL', '[NULL].mp4', 'PORTA NÃO ENCONTRADA', 'nível_13.exe', '??????', 'FALHA DE LEITURA', 'Ø Ø Ø'];
    c.font = 'bold 20px monospace';
    for (let i = 0; i < 14; i++) {
      c.fillStyle = ['#000', '#f0f', '#0f0', '#f00', '#00f'][i % 5];
      c.globalAlpha = 0.55 + (i % 3) * 0.15;
      c.fillText(lines[i % lines.length], (i * 37) % 120, 40 + i * 33);
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 18; i++) {
      c.fillStyle = ['#000', '#ff00ff', '#00ff66', '#00ccff', '#ffffff'][i % 5];
      c.fillRect((i * 71) % w, (i * 131) % h, 20 + ((i * 17) % 70), 6 + ((i * 7) % 18));
    }
  });
}

function errorMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: { value: 0 }, uGlitch: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime, uGlitch;
      float h( float n ) { return fract( sin( n ) * 43758.5453 ); }
      void main() {
        vUv = uv;
        vec3 p = position;
        float row = floor( p.y * 6.0 );
        p.x += ( h( row + floor( uTime * 12.0 ) ) - 0.5 ) * 0.25 * uGlitch * step( 0.7, h( row * 3.1 + floor( uTime * 7.0 ) ) );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float uTime, uGlitch;
      varying vec2 vUv;
      float h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main() {
        vec2 uv = vUv;
        float t = floor( uTime * 14.0 );
        float row = floor( uv.y * 40.0 );
        float g = step( 0.86 - uGlitch * 0.2, h( vec2( row, t ) ) );
        uv.x += ( h( vec2( row, t + 1.0 ) ) - 0.5 ) * 0.4 * g;
        float sh = 0.012 + 0.03 * g;
        float r = texture2D( map, uv + vec2( sh, 0.0 ) ).r;
        float gg = texture2D( map, uv ).g;
        float b = texture2D( map, uv - vec2( sh, 0.0 ) ).b;
        vec3 col = vec3( r, gg, b );
        // blocos que somem/viram ruído
        vec2 blk = floor( vUv * vec2( 6.0, 12.0 ) );
        float hb = h( blk + t * 0.37 );
        if ( hb > 0.94 ) col = vec3( h( vUv * 400.0 + t ) );
        if ( hb < 0.03 ) col = vec3( 1.0, 0.0, 1.0 ) * step( 0.5, h( blk + t ) );
        // linhas de varredura
        col *= 0.9 + 0.1 * sin( vUv.y * 600.0 + uTime * 30.0 );
        gl_FragColor = vec4( col, 1.0 );
      }`,
  });
}

export class Level12White {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 12;
    this.camFar = 600;
    this.walkSpeed = 2.0;
    this.flashIntensity = 0;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.time = 0;
    this.walkT = 0;
    this.look = {
      exposure: 1.0,
      tint: [1, 1, 1],
      sat: 0.9,
      contrast: 1.0,
      lift: [0, 0, 0],
      bloom: 0.15,
      bloomThreshold: 3,
      fog: [3, 3, 3],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level12_3',
      reverb: 3.5,
      sanityDrain: 0.04,
    };
    this.objectives = [{ id: 'wait', text: 'Ande pelo branco' }];
    document.getElementById('hud').classList.add('onwhite');
    this.spawn = { x: 0, z: 0, yaw: 0 };
    this.exit = null;
    // branco absoluto: fundo e chão acima de 1 (o tone mapping leva ao branco puro)
    this.scene.background = new THREE.Color(3, 3, 3);
    this.scene.fog = new THREE.Fog(new THREE.Color(3, 3, 3), 10, 80);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 2.2);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dir.position.set(2, 6, 3);
    this.scene.add(this.hemi, this.dir);
    const floorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    // sombra suave sob o boneco
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const c = sc.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    this.blobTex = new THREE.CanvasTexture(sc);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.01;
    this.scene.add(this.blob);
  }

  ambientAt() {
    return new THREE.Vector3(0.6, 0.6, 0.6);
  }

  async preload() {
    // o próprio andarilho
    this.me = new NPC(this, {
      id: 'eu',
      name: '',
      role: '',
      x: 0,
      z: 0,
      yaw: 0,
      h: 1.75,
      look: { skin: '#c8956c', hair: '#2a1c12', hairStyle: 'short', suit: '#3c4a3a', accent: '#d8c070', arms: 'down', eyes: '#2c1d12', beard: 'rgba(40,25,15,0.35)' },
    });
    this.me.tag.visible = false;
    this.me.amb.value.set(0.5, 0.5, 0.5);
    // o boneco olha para −z (para onde o jogador vai olhar depois)
    this.me.root.rotation.y = Math.PI;
    await new Promise((r) => setTimeout(r, 0));
  }

  // ------------------------------------------------------------ cena
  startCine() {
    const g = this.game;
    this.cine = 0;
    g.player.frozen = true;
    g.hud.show(false);
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div><div id="cine-skip">tocar / E para pular</div></div>';
    document.body.appendChild(bars);
    this.bars = bars;
    const skip = (e) => {
      e.preventDefault();
      this.cine = Math.max(this.cine, CINE - 1.2);
    };
    bars.addEventListener('touchend', skip, { passive: false });
    bars.addEventListener('click', skip);
    this.subs = [
      [0.8, 'Pela primeira vez, você se vê.'],
      [5, 'As mãos são suas. O rosto… você não lembra do rosto.'],
      [9.5, 'Ele olha de volta.'],
      [12.6, ''],
    ];
    this.subI = 0;
    g.audio.play('transition', { gain: 0.25, rate: 0.6 });
  }

  endCine() {
    const g = this.game;
    this.cine = null;
    if (this.bars) this.bars.remove();
    this.bars = null;
    g.hud.show(true);
    g.player.frozen = false;
    g.player.pos.set(0, 0, 0);
    g.player.yaw = 0;
    g.player.pitch = 0;
    this.me.root.visible = false;
    this.blob.visible = false;
    // clarão branco
    g.post.u.uFadeColor.value.setRGB(1, 1, 1);
    g.fade = 1;
    g.fadeTarget = 0;
    this.restoreFade = true;
    g.hud.objective('Ande pelo branco. Alguma coisa vai aparecer.', 6);
    this.walkT = 0;
  }

  updateCine(dt) {
    const g = this.game;
    this.cine += dt;
    const t = this.cine;
    const me = this.me;
    const cam = g.camera;
    if (g.input.pressed('interact')) this.cine = Math.max(this.cine, CINE - 1.2);
    while (this.subI < this.subs.length && t >= this.subs[this.subI][0]) {
      const el = document.getElementById('cine-sub');
      if (el) el.textContent = this.subs[this.subI][1];
      this.subI++;
    }
    // pose: respira, olha em volta, ergue as mãos, encara a câmera
    const br = Math.sin(t * 1.7);
    me.torso.scale.set(1 + br * 0.006, 1 + br * 0.01, 1 + br * 0.012);
    const [L, R] = me.arms;
    const hands = smoothstep(4.5, 6, t) * (1 - smoothstep(8.6, 9.6, t));
    for (const a of [L, R]) {
      a.sh.rotation.x = -1.25 * hands;
      a.el.rotation.x = -1.1 * hands;
      a.sh.rotation.z = a.sx * (0.08 + hands * -0.2);
    }
    const lookAround = t < 4.5 ? Math.sin(t * 1.1) * 0.6 : 0;
    const stare = smoothstep(9.5, 11, t);
    me.head.rotation.set(-0.35 * hands + Math.sin(t * 0.5) * 0.03, lookAround * (1 - hands), 0);
    // câmera (local do boneco: frente em −z, porque ele está girado em π)
    let pos;
    let look;
    if (t < 4.5) {
      const a = 2.4 + t * 0.18;
      const r = 7.5 - t * 0.5;
      pos = new THREE.Vector3(Math.sin(a) * r, 3.4 - t * 0.35, Math.cos(a) * r);
      look = new THREE.Vector3(0, 1.1, 0);
    } else if (t < 9.5) {
      const k = (t - 4.5) / 5;
      pos = new THREE.Vector3(1.2 - k * 0.6, 1.5, -2.6 + k * 0.4);
      look = new THREE.Vector3(0, 1.45, 0);
    } else {
      const k = smoothstep(11, CINE - 0.3, t);
      // encara a câmera e ela entra na cabeça dele
      pos = new THREE.Vector3(0.6 * (1 - k), 1.6 + 0.02 * k, -2.2 + 1.85 * k);
      look = new THREE.Vector3(0, 1.62, 0);
      me.head.rotation.y = damp(me.head.rotation.y, 0, 3, dt);
      me.head.rotation.x = damp(me.head.rotation.x, -0.05 * stare, 3, dt);
      g.glitch = Math.max(g.glitch, stare * 0.35 + (Math.random() < 0.05 ? 0.5 : 0));
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if (t >= CINE) this.endCine();
  }

  // ------------------------------------------------------------ porta
  showDoor() {
    const g = this.game;
    const p = g.player.pos;
    const fx = -Math.sin(g.player.yaw);
    const fz = -Math.cos(g.player.yaw);
    const x = p.x + fx * 16 + fz * 3;
    const z = p.z + fz * 16 - fx * 3;
    this.errTex = errorTex();
    this.errMat = errorMaterial(this.errTex);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xcfcfcf });
    this.frameMat = frameMat;
    const grp = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1, 1, 24), this.errMat);
    slab.position.y = 1.05;
    const back = slab.clone();
    back.rotation.y = Math.PI;
    grp.add(slab, back);
    for (const dx of [-0.56, 0.56]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.14), frameMat);
      b.position.set(dx, 1.1, 0);
      grp.add(b);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.1, 0.14), frameMat);
    top.position.y = 2.2;
    grp.add(top);
    // sombra no chão
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), this.blob.material.clone());
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.01;
    grp.add(sh);
    this.doorShadowMat = sh.material;
    grp.position.set(x, 0, z);
    grp.lookAt(p.x, 0, p.z);
    this.scene.add(grp);
    this.door = grp;
    this.exit = { x, z };
    this.staticSnd = g.audio.positional('tvstatic', x, 1.2, z, { gain: 0.6, ref: 3, rolloff: 1.4 });
    g.audio.play('tvstatic', { gain: 0.3 });
    g.audio.sting();
    g.glitch = 1;
    g.vibrate(120);
    g.setObjectiveText('wait', 'Uma porta apareceu');
    g.completeObjective('wait', 'Uma porta apareceu no branco. Ela está… errada.');
    this.objectiveDoor = true;
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    this.time += dt;
    if (this.cine === undefined) this.startCine();
    if (this.cine !== null) {
      this.updateCine(dt);
      return;
    }
    if (this.restoreFade && g.fade < 0.03) {
      this.restoreFade = false;
      g.post.u.uFadeColor.value.setRGB(0, 0, 0);
    }
    this.walkT += dt;
    const p = player.pos;
    // o chão acompanha (nunca há borda)
    this.floor.position.set(p.x, 0, p.z);
    const msgs = [
      [25, 'Você anda. Ou acha que anda. Nada muda.'],
      [60, 'O silêncio aqui tem um zumbido muito agudo.'],
      [95, 'Algo no canto do olho. Quando você olha, é só branco.'],
    ];
    for (const [t, m] of msgs) if (this.walkT >= t && this.walkT - dt < t) g.hud.message(m, 5);
    if (!this.door && this.walkT >= DOOR_AFTER) this.showDoor();
    if (this.door) {
      const u = this.errMat.uniforms;
      u.uTime.value = this.time;
      u.uGlitch.value = 0.4 + 0.6 * (Math.sin(this.time * 3.3) * 0.5 + 0.5);
      // a porta "tropeça" no espaço
      if (Math.random() < dt * 2) this.jit = 0.15;
      this.jit = Math.max(0, (this.jit || 0) - dt);
      this.door.position.y = this.jit > 0 ? (Math.random() - 0.5) * 0.08 : 0;
      this.door.scale.x = this.jit > 0 ? 1 + (Math.random() - 0.5) * 0.2 : 1;
      const d = Math.hypot(p.x - this.exit.x, p.z - this.exit.z);
      g.glitch = Math.max(g.glitch, clamp((6 - d) / 6, 0, 1) * 0.25);
    }
  }

  collide(p, r) {
    if (this.door) {
      // a porta é sólida pelas bordas
      const dx = p.x - this.exit.x;
      const dz = p.z - this.exit.z;
      const d = Math.hypot(dx, dz);
      if (d < r + 0.3 && d > 1e-4) {
        p.x = this.exit.x + (dx / d) * (r + 0.3);
        p.z = this.exit.z + (dz / d) * (r + 0.3);
      }
    }
    return p;
  }

  surfaceAt() {
    return 'tile';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable(player) {
    if (!this.door || this.going) return null;
    const p = player.pos;
    if (Math.hypot(p.x - this.exit.x, p.z - this.exit.z) < 1.9)
      return {
        label: 'Abrir a porta com erros',
        action: () => {
          this.going = true;
          const g = this.game;
          g.audio.play('tvstatic', { gain: 0.6 });
          g.glitch = 1;
          g.reachExit('door', 0.6);
        },
      };
    return null;
  }

  navTarget() {
    return this.exit;
  }

  exitEmitter() {
    return null;
  }

  dispose() {
    document.getElementById('hud').classList.remove('onwhite');
    const g = this.game;
    if (this.bars) this.bars.remove();
    g.post.u.uFadeColor.value.setRGB(0, 0, 0);
    if (this.me) this.me.dispose();
    this.dynamic.traverse((o) => o.geometry && o.geometry.dispose());
    if (this.door) {
      this.door.traverse((o) => o.geometry && o.geometry.dispose());
      this.errMat.dispose();
      this.errTex.dispose();
      this.frameMat.dispose();
      this.doorShadowMat.dispose();
      this.scene.remove(this.door);
    }
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.blob.geometry.dispose();
    this.blob.material.dispose();
    this.blobTex.dispose();
    this.scene.remove(this.dynamic, this.floor, this.blob, this.hemi, this.dir);
    this.scene.background = null;
  }
}
