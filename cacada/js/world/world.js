// Monta o mundo aberto: relevo, terreno, céu, água, vegetação, grama e construções.
import { Heightfield, WATER } from './heightfield.js';
import { Terrain, createTerrainMaterial } from './terrain.js';
import { makeTerrainTextures, makeWaterNormal } from './textures.js';
import { Sky } from './sky.js';
import { Water, makeHeightTexture } from './water.js';
import { Vegetation } from './vegetation.js';
import { Grass, makeMaskTexture } from './grass.js';
import { Structures } from './structures.js';

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
  }

  async init(onProgress) {
    const step = (p, msg) => onProgress && onProgress(p, msg);
    const tick = () => new Promise((r) => setTimeout(r, 0));
    this.hf = new Heightfield();
    await this.hf.generate((p) => step(p * 0.55, 'Erguendo montanhas e cavando lagos…'));
    step(0.56, 'Pintando o chão…');
    await tick();
    this.textures = makeTerrainTextures(this.quality === 'low' ? 256 : 512);
    this.terrainMat = createTerrainMaterial(this.textures, this.quality);
    this.terrain = new Terrain(this.hf, this.terrainMat, this.quality);
    this.scene.add(this.terrain.group);
    step(0.66, 'Acendendo o céu…');
    await tick();
    this.sky = new Sky(this.scene, this.quality);
    this.heightTex = makeHeightTexture(this.hf);
    this.water = new Water(this.scene, this.heightTex, makeWaterNormal(256), this.sky);
    step(0.72, 'Plantando florestas…');
    await tick();
    this.veg = new Vegetation(this.hf, this.scene, this.quality);
    step(0.88, 'Semeando os campos…');
    await tick();
    this.maskTex = makeMaskTexture(this.hf);
    this.grass = new Grass(this.scene, this.hf, this.heightTex, this.maskTex, this.sky, this.quality);
    this.structures = new Structures(this.scene, this.hf);
    step(0.95, 'Montando o acampamento…');
    await tick();
  }

  height(x, z) {
    return this.hf.height(x, z);
  }
  // altura do chão "pisável" (fundo do lago conta como chão)
  ground(x, z) {
    return this.hf.height(x, z);
  }
  isWater(x, z) {
    return this.hf.height(x, z) < WATER - 0.3;
  }

  update(dt, camera, playerPos, renderer) {
    this.sky.update(dt, camera.position, renderer);
    this.terrain.update(camera.position);
    this.water.update(dt);
    this.veg.update(dt, camera.position);
    this.grass.update(dt, camera.position, playerPos);
    this.structures.update(dt, this.sky.night);
  }
}
