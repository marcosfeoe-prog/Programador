// Junta malha + esqueleto + material + animador num objeto pronto para a cena.
import * as THREE from 'three';
import { DinoSkeleton } from './rig.js';
import { DinoAnimator } from './anim.js';
import { createDinoMaterial } from './material.js';

const _ident = new THREE.Matrix4();

export class DinoModel {
  constructor(asset, quality = 'high') {
    this.asset = asset;
    this.skel = new DinoSkeleton(asset);
    this.material = createDinoMaterial(asset, quality);
    const mesh = new THREE.SkinnedMesh(asset.geometry, this.material);
    for (const b of this.skel.bones) mesh.add(b);
    mesh.bind(this.skel.makeSkeleton(), _ident);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // a esfera de recorte precisa cobrir qualquer pose
    const size = asset.bbox.getSize(new THREE.Vector3());
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, size.y * 0.5, 0), size.length() * 0.6);
    this.mesh = mesh;
    this.group = new THREE.Group();
    this.group.add(mesh);
    this.anim = new DinoAnimator(asset, this.skel);
  }

  // posição de um ponto do pose de repouso no mundo, levado pelo osso i
  worldPoint(i, rest, out) {
    this.skel.pointOf(i, rest, out);
    return out.applyMatrix4(this.mesh.matrixWorld);
  }

  dispose() {
    this.material.dispose();
  }
}
