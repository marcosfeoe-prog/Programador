// Monta o mundo de um país: relevo, estradas, cidades, fazendas, uso do solo,
// vegetação e objetos. Também responde às consultas do jogo (altura, superfície...).

import * as THREE from 'three';
import { COUNTRIES } from './countries.js';
import { Terrain } from './terrain.js';
import { RoadNetwork } from './roads.js';
import { LandUse, terrainMaterial, skirtMaterial } from './landuse.js';
import { layoutSettlements, buildSettlementMeshes } from './city.js';
import { Vegetation } from './vegetation.js';
import { Props } from './props.js';
import { StructureRegistry } from './structures.js';
import { patchWorld } from '../render/materials.js';
import { hashStr } from '../core/rng.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor(countryId, textures, quality) {
    this.country = COUNTRIES[countryId];
    this.textures = textures;
    this.q = quality;
    this.seed = hashStr('cacadores-' + countryId);
    this.group = new THREE.Group();
    this.group.name = 'world-' + countryId;
    this.registry = new StructureRegistry();
  }

  async build(progress = () => {}) {
    const c = this.country;
    progress(0.05, 'Modelando o relevo');
    await tick();
    this.terrain = new Terrain(c, this.seed, this.q.terrainSegs).build();
    progress(0.15, 'Traçando as estradas');
    await tick();
    this.roads = new RoadNetwork(c, this.terrain, this.seed + 1).generate();
    progress(0.25, 'Construindo as cidades');
    await tick();
    this.settlements = layoutSettlements(c, this.terrain, this.roads, this.seed + 2);
    this.cities = this.settlements.cities;
    progress(0.35, 'Dividindo lavouras e pastos');
    await tick();
    this.land = new LandUse(c, this.terrain, this.roads, this.cities, this.seed + 3);
    this.land.build(this.q.landuse);
    progress(0.55, 'Pavimentando');
    await tick();
    this.group.add(this.roads.buildMeshes(this.textures, this.q));
    const tm = terrainMaterial(this.land, this.textures, patchWorld);
    this.terrainMesh = this.terrain.mesh(tm);
    this.group.add(this.terrainMesh);
    this.skirt = this.terrain.skirtMesh(skirtMaterial(c, this.textures, patchWorld));
    this.group.add(this.skirt);
    progress(0.65, 'Erguendo casas, galpões e silos');
    await tick();
    this.group.add(buildSettlementMeshes(c, this.terrain, this.settlements, this.textures, this.registry, this.seed + 4));
    progress(0.78, 'Plantando árvores');
    await tick();
    this.vegetation = new Vegetation(c, this.terrain, this.textures, this.seed + 5, this.q.trees);
    this.vegetation.populate(this.land, this.roads, this.cities, this.settlements.farms);
    this.group.add(this.vegetation.build(this.registry));
    progress(0.88, 'Postes, moinhos e rios');
    await tick();
    this.props = new Props(this, this.seed + 6);
    this.group.add(this.props.build(this.registry, this.textures));
    progress(0.95, 'Pronto');
    return this;
  }

  heightAt(x, z) {
    return this.terrain.heightAt(x, z);
  }

  // Altura onde o carro roda (pontes incluídas).
  groundAt(x, z) {
    return this.roads.surfaceHeight(x, z);
  }

  // O que existe debaixo do ponto (estrada, lavoura, cidade, água).
  surfaceAt(x, z) {
    const q = this.roads.query(x, z, 10);
    if (q && q.on) return { kind: 'road', road: q.road, surface: q.road.def.surface, grip: q.road.def.surface === 'asphalt' ? 1 : q.road.def.surface === 'gravel' ? 0.78 : 0.68, q };
    const s = this.land.surfaceAt(x, z);
    return { ...s, surface: s.kind, grip: s.kind === 'water' ? 0.2 : s.kind === 'urban' ? 0.8 : 0.55 };
  }

  nearestCity(x, z) {
    let best = null;
    for (const c of this.cities) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (!best || d < best.d) best = { city: c, d };
    }
    return best;
  }

  update(t, wind) {
    this.props.update(t, wind);
  }
}
