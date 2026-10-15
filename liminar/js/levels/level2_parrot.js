// Nível 2 — Jeffrey: um papagaio verde de bochecha vermelha que vive num
// poleiro de cano velho. Ele fala (e repete o que ouve), e sabe coisas sobre
// o Nível 2 e o Nível 3. Única presença viva do nível; inofensivo.
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { clamp, damp, TAU } from '../util.js';

function portrait() {
  const S = 160;
  const cv = TEX.makeCanvas(S, S);
  const c = cv.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, '#3a3024');
  bg.addColorStop(1, '#14100a');
  c.fillStyle = bg;
  c.fillRect(0, 0, S, S);
  // corpo e cabeça
  c.fillStyle = '#2f9a3a';
  c.beginPath();
  c.ellipse(80, 118, 42, 50, 0, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(80, 62, 34, 0, TAU);
  c.fill();
  c.fillStyle = '#e8d84a';
  c.beginPath();
  c.ellipse(80, 44, 22, 12, 0, 0, TAU);
  c.fill();
  // bochecha vermelha e olho
  c.fillStyle = '#d83a2a';
  c.beginPath();
  c.ellipse(96, 72, 12, 9, 0.3, 0, TAU);
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(92, 58, 8, 0, TAU);
  c.fill();
  c.fillStyle = '#000';
  c.beginPath();
  c.arc(94, 58, 4, 0, TAU);
  c.fill();
  // bico curvo
  c.fillStyle = '#d8d0b8';
  c.beginPath();
  c.moveTo(108, 60);
  c.quadraticCurveTo(132, 64, 120, 88);
  c.quadraticCurveTo(116, 74, 104, 76);
  c.fill();
  c.fillStyle = '#3a3a3a';
  c.beginPath();
  c.moveTo(106, 78);
  c.quadraticCurveTo(116, 82, 112, 90);
  c.lineTo(104, 84);
  c.fill();
  return cv.toDataURL();
}

export class Parrot {
  constructor(L, x, z) {
    this.L = L;
    this.game = L.game;
    this.x = x;
    this.z = z;
    this.portrait = portrait();
    const g = new THREE.Group();
    const lam = (color, emissive = 0x000000) => new THREE.MeshLambertMaterial({ color, emissive });
    const green = lam(0x2f9a3a, 0x0a2a0c);
    const dgreen = lam(0x1f6a28, 0x061a08);
    const yellow = lam(0xe8d84a, 0x2a2408);
    const red = lam(0xd83a2a, 0x300808);
    const blue = lam(0x2a5ad8, 0x080c30);
    const beak = lam(0xd8d0b8, 0x2a2824);
    const black = lam(0x080808);
    const metal = lam(0x5a5650, 0x141210);
    this.mats = [green, dgreen, yellow, red, blue, beak, black, metal];
    // poleiro: cano horizontal sobre um suporte com uma caixa de ferramentas
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 8), metal);
    stand.position.y = 0.65;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), metal);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 1.3;
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), metal);
    base.position.y = 0.03;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.24), red);
    box.position.set(0.32, 0.11, 0.12);
    const seeds = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.05, 10), yellow);
    seeds.position.set(-0.3, 1.34, 0);
    g.add(stand, bar, base, box, seeds);
    // pássaro
    const bird = new THREE.Group();
    bird.position.set(0.05, 1.33, 0);
    g.add(bird);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), green);
    body.scale.set(0.85, 1.25, 0.9);
    body.position.y = 0.12;
    body.rotation.x = -0.25;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), yellow);
    belly.scale.set(0.8, 1.1, 0.6);
    belly.position.set(0, 0.09, 0.05);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.02), blue);
    tail.position.set(0, -0.06, -0.08);
    tail.rotation.x = 0.5;
    const tail2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.015), red);
    tail2.position.set(0, -0.05, -0.095);
    tail2.rotation.x = 0.55;
    bird.add(body, belly, tail, tail2);
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.08, 0.2, -0.01);
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6), dgreen);
      w.scale.set(0.25, 1.4, 0.7);
      w.position.set(s * 0.01, -0.08, -0.01);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.05), blue);
      tip.position.set(s * 0.01, -0.18, -0.03);
      pivot.add(w, tip);
      bird.add(pivot);
      wings.push({ pivot, s });
    }
    this.wings = wings;
    const head = new THREE.Group();
    head.position.set(0, 0.26, 0.02);
    bird.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), green);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), yellow);
    crown.position.set(0, 0.04, 0.01);
    crown.scale.set(1, 0.6, 1.1);
    head.add(skull, crown);
    for (const s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), red);
      cheek.position.set(s * 0.05, -0.015, 0.03);
      cheek.scale.set(0.5, 0.8, 1);
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), lam(0xffffff, 0x404040));
      eyeW.position.set(s * 0.055, 0.015, 0.025);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), black);
      eye.position.set(s * 0.065, 0.015, 0.03);
      head.add(cheek, eyeW, eye);
      this.mats.push(eyeW.material);
    }
    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), beak);
    upper.rotation.x = Math.PI / 2 + 0.6;
    upper.position.set(0, -0.01, 0.08);
    const lower = new THREE.Group();
    lower.position.set(0, -0.03, 0.06);
    const lowerM = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.04, 6), black);
    lowerM.rotation.x = Math.PI / 2;
    lowerM.position.z = 0.015;
    lower.add(lowerM);
    head.add(upper, lower);
    // patinhas
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.05), black);
      f.position.set(s * 0.035, -0.015, 0.02);
      bird.add(f);
    }
    this.bird = bird;
    this.head = head;
    this.beak = lower;
    g.position.set(x, 0, z);
    L.dynamic.add(g);
    this.root = g;
    this.t = 0;
    this.talkT = 0;
    this.flap = 0;
    this.chirpT = 3;
    this.yaw = 0;
  }

  chirp(rate = 1.8, gain = 0.12) {
    this.game.audio.play('beep', { gain, rate: rate + Math.random() * 0.6, wet: 0.5 });
  }

  update(dt, player) {
    this.t += dt;
    // luz local (o nível não tem luzes dinâmicas): tinge o emissivo
    this.lightT = (this.lightT || 0) - dt;
    if (this.lightT <= 0) {
      this.lightT = 0.5;
      const k = clamp(this.L.lightLevel(this.x, this.z) * 0.45 + 0.08, 0.08, 0.9);
      for (const m of this.mats) if (m.emissive) m.emissive.copy(m.color).multiplyScalar(k);
    }
    const p = player.pos;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const talking = this.game.hud.dialogOpen && this.talking;
    if (!this.game.hud.dialogOpen) this.talking = false;
    // vira o corpo para o jogador quando ele está perto
    const want = d < 8 ? Math.atan2(dx, dz) : Math.sin(this.t * 0.3) * 1.2;
    this.yaw += clamp(((want - this.yaw + Math.PI * 3) % TAU) - Math.PI, -dt * 3, dt * 3);
    this.bird.rotation.y = this.yaw;
    // cabeça: inclinações rápidas e curiosas
    this.headT = (this.headT || 0) - dt;
    if (this.headT <= 0) {
      this.headT = 0.4 + Math.random() * 1.5;
      this.headTarget = [(Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.9];
    }
    const ht = this.headTarget || [0, 0];
    this.head.rotation.z = damp(this.head.rotation.z, ht[0], 14, dt);
    this.head.rotation.y = damp(this.head.rotation.y, ht[1], 14, dt);
    // bico abre ao falar
    this.talkT = damp(this.talkT, talking ? 1 : 0, 6, dt);
    this.beak.rotation.x = this.talkT * (0.2 + 0.25 * Math.max(0, Math.sin(this.t * 18)));
    this.bird.position.y = 1.33 + Math.abs(Math.sin(this.t * (talking ? 6 : 1.5))) * (talking ? 0.02 : 0.005);
    // bate as asas de vez em quando (e ao ver o jogador chegar)
    if (d < 4 && !this.near) {
      this.near = true;
      this.flap = 1.2;
      this.chirp(2.2, 0.18);
    } else if (d > 7) this.near = false;
    this.flapT = (this.flapT || 6) - dt;
    if (this.flapT <= 0) {
      this.flapT = 5 + Math.random() * 10;
      this.flap = 0.8;
    }
    this.flap = Math.max(0, this.flap - dt);
    for (const w of this.wings) w.pivot.rotation.z = w.s * (this.flap > 0 ? 0.6 + Math.sin(this.t * 40) * 0.6 : 0.05);
    // assobios e palavras soltas pelo túnel
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = 6 + Math.random() * 10;
      if (d < 25) {
        this.chirp(1.6, 0.14 * clamp(1 - d / 25, 0.1, 1));
        if (d < 14 && Math.random() < 0.5) {
          const lines = ['“Jeffrey! Jeffrey!”', '“Cano quente! Cano quente!”', '“Chave dourada! Brilha!”', '“Ôôô de casa!”', '“Cuidado com o cão!”'];
          this.game.hud.message(lines[Math.floor(Math.random() * lines.length)] + ' — grita uma voz aguda pelo túnel.', 3);
        }
      }
    }
  }

  interactable(player) {
    if (this.talking) return null;
    const p = player.pos;
    if (Math.hypot(p.x - this.x, p.z - this.z) < 1.9) return { label: 'Falar com Jeffrey (o papagaio)', action: () => this.talk() };
    return null;
  }

  say(text, choices) {
    const hud = this.game.hud;
    this._said = true;
    const wrapped = (choices && choices.length ? choices : [{ text: 'Tchau, Jeffrey.' }]).map((c) => ({
      text: c.text,
      fn: () => {
        this._said = false;
        if (c.fn) c.fn();
        if (!this._said) {
          hud.closeDialog();
          this.talking = false;
        }
      },
    }));
    hud.dialog('Jeffrey · Papagaio', text, wrapped, this.portrait);
    this.chirp(1.9, 0.1);
    this.flap = 0.5;
  }

  talk() {
    this.talking = true;
    const g = this.game;
    const back = { text: 'Outra pergunta…', fn: () => this.menu() };
    if (!this.met) {
      this.met = true;
      this.say('“RRRÁ! Gente nova! Gente nova! Eu sou o Jeffrey! JEFFREY! Quer saber das coisas? O Jeffrey sabe das coisas!”', [{ text: 'Você… fala?', fn: () => this.say('“Falo, repito, invento! Fiquei sozinho muito tempo. Os canos não respondem. Pergunta! Pergunta!”', [back]) }, back]);
      return;
    }
    this.menu();
    void g;
  }

  menu() {
    const g = this.game;
    const has = g.inventory.has('chaveOuro');
    const back = { text: 'Outra pergunta…', fn: () => this.menu() };
    this.say(has ? '“Chave brilhante! Brilhante! Agora a porta, a porta!”' : '“Pergunta! Pergunta! O Jeffrey sabe!”', [
      {
        text: 'Que lugar é este?',
        fn: () =>
          this.say(
            '“Nível Dois! Túneis, túneis, túneis! Alguém construiu pra cuidar de máquinas que ninguém liga mais. Os corredores dobram, dobram, mas sempre voltam. As luzes apagam em pedaços: quando apaga, fica parado e conta até dez!”',
            [back],
          ),
      },
      {
        text: 'Os canos são perigosos?',
        fn: () =>
          this.say(
            '“QUENTE! QUENTE! Os de faixa vermelha fervem por dentro! Encostou, a cabeça cozinha, os pensamentos derretem. Passa pelo meio do corredor, igual o Jeffrey voa: pelo meio!”',
            [back],
          ),
      },
      {
        text: 'Como eu saio daqui?',
        fn: () =>
          this.say(
            has
              ? '“A porta amarela e preta! MANUTENÇÃO! A chave dourada abre. Do outro lado, escada pra baixo, pro Nível Três. Siga a bússola, a bússola!”'
              : '“Chave dourada! Alguém deixou cair longe, longe, num corredor sem saída. Ela abre a porta de MANUTENÇÃO, a amarela e preta. Atrás da porta: Nível Três!”',
            [back],
          ),
      },
      {
        text: 'O que tem no Nível 3?',
        fn: () =>
          this.say(
            '“Tijolos! Tijolos e choques! E o CÃO! Cão grande, magro, de quatro patas. Não é rápido, não, mas não desiste nunca! Ouve você correr. Fica longe, longe! E lá tem dois andares: a saída é lá em cima, trancada.”',
            [{ text: 'Trancada? Como abre?', fn: () => this.level3() }, back],
          ),
      },
      { text: 'Você está sozinho aqui?', fn: () => this.say('“Sozinho não! Tem o Jeffrey. E o eco do Jeffrey. E às vezes passos lá longe… mas é o eco. É o eco. Né?”', [back]) },
      { text: 'Tchau, Jeffrey.' },
    ]);
  }

  level3() {
    const back = { text: 'Outra pergunta…', fn: () => this.menu() };
    this.say(
      '“Segredo! Segredo! Tem um PORTÃO enorme, trancado. Chave BRANCA abre. Atrás do portão… robôs! Robôs mandam lá agora, bip-bop! Tem um computador. Aperta ENTER, ENTER! Aí a porta de cima destranca. O Jeffrey viu! O Jeffrey sabe!”',
      [back],
    );
  }

  dispose() {
    this.root.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of this.mats) m.dispose();
  }
}
