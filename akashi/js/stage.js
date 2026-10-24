// Palco: cena, céu, luzes e cenários. Cada cenário é construído na primeira
// vez que aparece e fica guardado; só o cenário da tomada atual fica visível.
// O "ambiente" (céu, luz do sol, luz ambiente, neblina, contorno) é aplicado
// a cada quadro a partir do cenário e de ajustes da tomada.
import * as THREE from 'three';
import { Sky, SKIES } from './sky.js';
import { TOON } from './toon.js';
import { buildSchool } from './sets/school.js';
import { buildHallway } from './sets/hallway.js';
import { buildClassroom } from './sets/classroom.js';
import { buildRooftop } from './sets/rooftop.js';
import { buildGym } from './sets/gym.js';
import { buildStreet } from './sets/street.js';
import { buildAlley } from './sets/alley.js';
import { buildRiver } from './sets/river.js';
import { buildVoid } from './sets/void.js';

const BUILDERS = {
  school: buildSchool,
  hallway: buildHallway,
  classroom: buildClassroom,
  rooftop: buildRooftop,
  gym: buildGym,
  street: buildStreet,
  alley: buildAlley,
  river: buildRiver,
  void: buildVoid,
};

export class Stage {
  constructor(quality) {
    this.q = quality;
    this.scene = new THREE.Scene();
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = !!quality.shadows;
    if (quality.shadows) {
      this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.fog = new THREE.Fog(0xffffff, 50, 600);
    this.scene.fog = this.fog;
    this.sets = {};
    this.current = null;
    this._dir = new THREE.Vector3();
  }

  get(name) {
    if (!this.sets[name]) {
      const s = BUILDERS[name](this.q);
      s.name = name;
      s.group.visible = false;
      this.scene.add(s.group);
      this.sets[name] = s;
    }
    return this.sets[name];
  }

  // Pré-constrói todos os cenários (durante o carregamento).
  async prebuild(onProgress) {
    const names = Object.keys(BUILDERS);
    for (let i = 0; i < names.length; i++) {
      this.get(names[i]);
      onProgress?.((i + 1) / names.length, names[i]);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  use(name, over = {}) {
    const s = this.get(name);
    if (this.current !== s) {
      if (this.current) this.current.group.visible = false;
      s.group.visible = true;
      this.current = s;
    }
    const env = { ...s.env, ...over };
    if (over.sun && s.env.sun) env.sun = { ...s.env.sun, ...over.sun };
    if (over.hemi && s.env.hemi) env.hemi = { ...s.env.hemi, ...over.hemi };
    if (over.fog && s.env.fog) env.fog = { ...s.env.fog, ...over.fog };
    this.applyEnv(env);
    this.env = env;
    return s;
  }

  applyEnv(e) {
    const sk = typeof e.sky === 'string' ? SKIES[e.sky] : e.sky;
    this.sky.set({ ...sk, ...(e.skyOver || {}) });
    this.sky.mesh.visible = e.showSky !== false;
    const h = e.hemi || {};
    this.hemi.color.set(h.sky ?? 0xffffff);
    this.hemi.groundColor.set(h.ground ?? 0x888888);
    this.hemi.intensity = h.int ?? 1.2;
    const su = e.sun || {};
    this.sun.color.set(su.color ?? 0xffffff);
    this.sun.intensity = su.int ?? 2.4;
    const d = this._dir.set(...(su.dir || sk?.sunDir || [0.4, 0.8, 0.4])).normalize();
    const c = su.center || [0, 0, 0];
    this.sun.target.position.set(c[0], c[1], c[2]);
    this.sun.position.set(c[0] + d.x * 60, c[1] + d.y * 60, c[2] + d.z * 60);
    this.sun.target.updateMatrixWorld();
    if (this.q.shadows) {
      const sh = su.shadow !== false;
      this.sun.castShadow = sh;
      if (sh) {
        const r = su.box ?? 25;
        const cam = this.sun.shadow.camera;
        if (cam.right !== r) {
          cam.left = -r;
          cam.right = r;
          cam.top = r;
          cam.bottom = -r;
          cam.near = 1;
          cam.far = 160;
          cam.updateProjectionMatrix();
        }
      }
    }
    const f = e.fog || {};
    this.fog.color.set(f.color ?? 0xcfd8e8);
    this.fog.near = f.near ?? 60;
    this.fog.far = f.far ?? 700;
    TOON.uRim.value.set(e.rim ?? 0x000000);
    TOON.uToonThr.value = e.toonThr ?? 0.02;
  }

  update(t, camera, ctx) {
    this.sky.update(camera, t);
    if (this.current?.update) this.current.update(t, ctx, camera);
  }
}
