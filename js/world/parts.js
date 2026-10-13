// Peças de construção instanciadas (paredes, telhados, janelas, destroços...).
// Cada peça é uma instância numa InstancedMesh por material; quando arrancada
// pelo vento, a mesma instância passa a ser movida pela física.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// Mapeamento UV por projeção de caixa em espaço de objeto escalonado (metros).
function boxUVPatch(material, texScale, key, extra = {}) {
  const uniforms = { uTexScale: { value: texScale }, ...extra.uniforms };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTexScale;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_INSTANCING
  vec3 bsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vec3 bsc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
#endif
  vec3 bps = position * bsc;
  vec3 ban = abs(normal);
  vec2 buv = ban.x > 0.5 ? bps.zy : (ban.y > 0.5 ? bps.xz : bps.xy);
  buv *= uTexScale;
#ifdef USE_MAP
  vMapUv = buv;
#endif
#ifdef USE_NORMALMAP
  vNormalMapUv = buv;
#endif
#ifdef USE_ROUGHNESSMAP
  vRoughnessMapUv = buv;
#endif
`,
      );
    if (extra.fragment) extra.fragment(shader);
  };
  material.customProgramCacheKey = () => 'boxuv-' + key;
}

export function makePrismGeometry() {
  // Triângulo no plano XY (base em y=-0.5, ápice em y=0.5), extrudado em Z.
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0, 0.5);
  shape.lineTo(-0.5, -0.5);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

export class PartPools {
  constructor(scene, T, quality) {
    this.scene = scene;
    this.pools = {};
    this.glowUniform = { value: 0 };
    const box = new THREE.BoxGeometry(1, 1, 1);
    const prism = makePrismGeometry();
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    const pyramid = new THREE.ConeGeometry(0.72, 1, 4, 1);
    pyramid.rotateY(Math.PI / 4);
    const shadows = quality.shadows;

    const mk = (opts, scale, key, extra) => {
      const m = new THREE.MeshStandardMaterial(opts);
      boxUVPatch(m, scale, key, extra);
      return m;
    };

    const siding = mk({ map: T.siding, normalMap: T.sidingN, roughness: 0.82, normalScale: new THREE.Vector2(0.8, 0.8) }, 1 / 1.6, 'siding');
    const brick = mk({ map: T.brick, normalMap: T.brickN, roughness: 0.9 }, 1 / 1.3, 'brick');
    const roof = mk({ map: T.shingle, normalMap: T.shingleN, roughness: 0.92 }, 1 / 2.2, 'roof');
    const metal = mk({ map: T.metal, normalMap: T.metalN, roughness: 0.45, metalness: 0.35 }, 1 / 3.2, 'metal');
    const wood = mk({ map: T.wood, roughness: 0.85 }, 1 / 1.8, 'wood');
    const concrete = mk({ map: T.concrete, roughness: 0.95 }, 1 / 4.0, 'concrete');
    const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const glass = mk({ map: T.window, color: 0x8a96a0, roughness: 0.12, metalness: 0.1, emissive: 0xffc27a }, 1 / 1.3, 'glass', {
      uniforms: { uGlow: this.glowUniform },
      fragment: (shader) => {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uGlow;')
          .replace('#include <color_fragment>', '')
          .replace(
            '#include <emissivemap_fragment>',
            `#if defined(USE_COLOR)
  totalEmissiveRadiance *= vColor.rgb * uGlow;
#else
  totalEmissiveRadiance *= 0.0;
#endif`,
          );
      },
    });

    this.materials = { siding, brick, roof, metal, wood, concrete, paint, glass };

    const def = (name, geo, mat, cap, cast = true) => {
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = shadows && cast;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      // força a criação de instanceColor
      mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
      this.pools[name] = { mesh, cap, used: 0, free: [], dirty: false, colorDirty: false };
    };
    def('siding', box, siding, 2600);
    def('brick', box, brick, 1400);
    def('roof', box, roof, 1500);
    def('metal', box, metal, 900);
    def('wood', box, wood, 2600);
    def('concrete', box, concrete, 700);
    def('paint', box, paint, 1600);
    def('glass', box, glass, 2200, false);
    def('gable', prism, siding, 300);
    def('cylinder', cyl, concrete, 120);
    def('metalCyl', cyl, metal, 200);
    def('woodCyl', cyl, wood, 500);
    def('spire', pyramid, roof, 10);
    def('chips', box, wood, quality.debrisMax * 2 + 300);
  }

  // Adiciona uma peça; retorna um "handle".
  add(name, pos, quat, size, color) {
    const p = this.pools[name];
    let index;
    if (p.free.length) index = p.free.pop();
    else {
      if (p.used >= p.cap) return null;
      index = p.used++;
      p.mesh.count = p.used;
    }
    _m.compose(pos, quat, size);
    p.mesh.setMatrixAt(index, _m);
    if (color) p.mesh.setColorAt(index, color);
    else p.mesh.setColorAt(index, _white);
    p.dirty = true;
    p.colorDirty = true;
    return { pool: name, index, pos: pos.clone(), quat: quat.clone(), size: size.clone(), alive: true };
  }

  setTransform(h, pos, quat, size = h.size) {
    const p = this.pools[h.pool];
    _m.compose(pos, quat, size);
    p.mesh.setMatrixAt(h.index, _m);
    p.dirty = true;
  }

  setColor(h, color) {
    const p = this.pools[h.pool];
    p.mesh.setColorAt(h.index, color);
    p.colorDirty = true;
  }

  hide(h) {
    if (!h) return;
    const p = this.pools[h.pool];
    p.mesh.setMatrixAt(h.index, ZERO);
    p.dirty = true;
    h.alive = false;
  }

  release(h) {
    this.hide(h);
    this.pools[h.pool].free.push(h.index);
  }

  available(name) {
    const p = this.pools[name];
    return p.free.length + (p.cap - p.used);
  }

  flush() {
    for (const k in this.pools) {
      const p = this.pools[k];
      if (p.dirty) {
        p.mesh.instanceMatrix.needsUpdate = true;
        p.dirty = false;
      }
      if (p.colorDirty) {
        p.mesh.instanceColor.needsUpdate = true;
        p.colorDirty = false;
      }
    }
  }
}

const _white = new THREE.Color(1, 1, 1);

// Junta várias geometrias (convertidas para não-indexadas) numa só,
// com cores por vértice. items: [{geo, color: THREE.Color, matrix?}]
export function mergeColored(items, uvRemap) {
  let total = 0;
  const prepared = items.map((it) => {
    let g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    if (it.matrix) g.applyMatrix4(it.matrix);
    total += g.attributes.position.count;
    return { g, color: it.color, uvr: it.uvr };
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const { g, color, uvr } of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    const uva = g.attributes.uv ? g.attributes.uv.array : null;
    for (let i = 0; i < n; i++) {
      col[(o + i) * 3] = color.r;
      col[(o + i) * 3 + 1] = color.g;
      col[(o + i) * 3 + 2] = color.b;
      if (uva) {
        let u = uva[i * 2];
        let v = uva[i * 2 + 1];
        if (uvr) {
          u = uvr[0] + u * uvr[2];
          v = uvr[1] + v * uvr[3];
        }
        uv[(o + i) * 2] = u;
        uv[(o + i) * 2 + 1] = v;
      }
    }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export { _s };
