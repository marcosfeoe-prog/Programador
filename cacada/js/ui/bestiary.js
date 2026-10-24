// Bestiário: mostra cada dinossauro importado dos arquivos STL, com as animações
// procedurais (parado, andar, trotar, correr, rugir, morder, saltar e morrer).
import * as THREE from 'three';
import { DinoModel } from '../dino/model.js';
import { SPECIES_LIST } from '../dino/species.js';

export class Bestiary {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2420);
    this.scene.fog = new THREE.Fog(0x1c2420, 40, 140);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a3020, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.8);
    sun.position.set(20, 30, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, far: 120 });
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b4a2c, roughness: 1 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.PolarGridHelper(120, 24, 24, 64, 0x55663f, 0x45553a);
    grid.position.y = 0.01;
    this.scene.add(grid);
    this.models = {};
    this.cur = null;
    this.mode = 'idle';
    this.angle = 0;
    this.orbit = 0.8;
    this.elev = 0.25;
    this.heading = 0;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dragging = false;
    this.flat = () => 0;
  }

  setAssets(assets) {
    this.assets = assets;
  }

  select(id) {
    if (!this.assets || !this.assets[id]) return null;
    if (this.cur) this.scene.remove(this.cur.group);
    if (!this.models[id]) this.models[id] = new DinoModel(this.assets[id], 'high');
    const m = this.models[id];
    this.cur = m;
    this.curId = id;
    this.scene.add(m.group);
    m.group.traverse((o) => (o.castShadow = true));
    this.pos.set(0, 0, 0);
    this.heading = 0;
    this.angle = 0;
    m.anim.dead = false;
    m.anim.deathT = 0;
    m.anim.action = null;
    m.group.position.set(0, 0, 0);
    m.group.rotation.set(0, 0, 0);
    m.group.updateMatrixWorld();
    m.anim.resetFeet(m.group, this.flat);
    this.setMode('idle');
    return m.asset;
  }

  setMode(mode) {
    const m = this.cur;
    if (!m) return;
    if (m.anim.dead && mode !== 'die') {
      // revive para mostrar outra animação
      m.anim.dead = false;
      m.anim.deathT = 0;
    }
    this.mode = mode;
    this.airT = 0;
    if (mode === 'roar') m.anim.play('roar');
    if (mode === 'bite') m.anim.play('bite');
    if (mode === 'die') m.anim.die(1);
  }

  speedFor(mode, sp) {
    return { walk: sp.velAndar, trot: sp.velTrote, run: sp.velCorrer }[mode] || 0;
  }

  update(dt, w, h) {
    const m = this.cur;
    if (!m) return;
    this.camera.aspect = w / h;
    // em telas largas, desloca a imagem para a direita (o painel de informações fica à esquerda)
    if (w > 760) this.camera.setViewOffset(w, h, -w * 0.14, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    const sp = m.asset.species;
    const speed = this.speedFor(this.mode, sp);
    // anda em um círculo grande
    const R = 30 + sp.scale * 200;
    let turn = 0;
    if (speed > 0) {
      turn = speed / R;
      this.heading += turn * dt;
    }
    this.vel.set(Math.sin(this.heading) * speed, 0, Math.cos(this.heading) * speed);
    this.pos.addScaledVector(this.vel, dt);
    // salto do raptor (demonstração)
    let y = 0;
    if (this.mode === 'jump') {
      this.airT += dt;
      const T = 0.7;
      const ph = this.airT % 2.2;
      if (ph < T) {
        y = 4 * 1.6 * (ph / T) * (1 - ph / T);
        m.anim.air = Math.min(1, ph * 8);
        this.pos.addScaledVector(new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)), 9 * dt);
        this.wasAir = true;
      } else {
        if (this.wasAir) {
          this.wasAir = false;
          m.anim.air = 0;
          m.group.position.y = 0;
          m.group.updateMatrixWorld();
          m.anim.resetFeet(m.group, this.flat);
        }
      }
    } else m.anim.air = 0;
    m.group.position.set(this.pos.x, y, this.pos.z);
    m.group.rotation.set(0, this.heading, 0);
    m.group.updateMatrixWorld();
    m.anim.setMotion(speed, turn);
    m.anim.lookAt(this.mode === 'idle' ? this.camera.position : null);
    m.anim.update(dt, m.group, this.flat, this.vel);
    // câmera orbitando
    if (!this.dragging) this.orbit += dt * 0.12;
    const size = m.asset.bbox.getSize(new THREE.Vector3());
    const dist = size.z * 1.35 + 2;
    const c = m.group.position;
    this.camera.position.set(c.x + Math.sin(this.orbit) * Math.cos(this.elev) * dist, size.y * 0.45 + Math.sin(this.elev) * dist, c.z + Math.cos(this.orbit) * Math.cos(this.elev) * dist);
    this.camera.lookAt(c.x, size.y * 0.42, c.z);
    this.sun.position.copy(c).add(new THREE.Vector3(20, 30, 12));
    this.sun.target.position.copy(c);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  static info(sp, asset) {
    const size = asset.bbox.getSize(new THREE.Vector3());
    return {
      nome: sp.nome,
      desc: sp.descricao,
      linhas: [
        ['Comprimento', size.z.toFixed(1) + ' m'],
        ['Altura', size.y.toFixed(1) + ' m'],
        ['Vida', sp.vida],
        ['Velocidade máx.', Math.round(sp.velCorrer * 3.6) + ' km/h'],
        ['Mordida', sp.dano + ' de dano'],
        ['Recompensa', sp.pontos + ' pts'],
        ['Malha (STL)', `${asset.vertices.toLocaleString('pt-BR')} vértices, ${asset.triangles.toLocaleString('pt-BR')} triângulos`],
        ['Esqueleto', `${asset.bones.length} ossos (rig automático)`],
      ],
    };
  }
}

export { SPECIES_LIST };
