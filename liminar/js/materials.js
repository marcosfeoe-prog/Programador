// Materiais com iluminação pré-calculada (lightmap) e utilitário de geometria.
//
// O lightmap guarda, em raiz quadrada (para precisão nas sombras):
//   R = luz fixa (direta + rebatida), G = lâmpadas do grupo A (piscam),
//   B = lâmpadas do grupo B, A = máscara de sujeira/umidade do piso.
// O shader recompõe a irradiância com os multiplicadores de cada grupo,
// então as salas escurecem e clareiam junto com as lâmpadas que piscam.
import * as THREE from 'three';

export const LM_UNIFORMS = {
  uLightColor: { value: new THREE.Color(1, 1, 1) },
  uLMScale: { value: new THREE.Vector3(1, 1, 1) },
};

const LM_PARS = /* glsl */ `
uniform vec3 uLightColor;
uniform vec3 uLMScale;
uniform vec3 uDirtColor;
uniform float uDirtAmt;
uniform float uWet;
`;

function patchLightmap(shader, mat) {
  shader.uniforms.uLightColor = LM_UNIFORMS.uLightColor;
  shader.uniforms.uLMScale = LM_UNIFORMS.uLMScale;
  shader.uniforms.uDirtColor = { value: mat.userData.dirtColor };
  shader.uniforms.uDirtAmt = { value: mat.userData.dirtAmt };
  shader.uniforms.uWet = { value: mat.userData.wet };
  let fs = shader.fragmentShader;
  fs = fs.replace('#include <common>', '#include <common>\n' + LM_PARS);
  fs = fs.replace(
    '#include <map_fragment>',
    `#include <map_fragment>
#ifdef USE_LIGHTMAP
  vec4 lmS = texture2D( lightMap, vLightMapUv );
  diffuseColor.rgb *= mix( vec3( 1.0 ), uDirtColor, lmS.a * uDirtAmt );
  diffuseColor.rgb *= 1.0 - lmS.a * uWet * 0.35;
#endif`,
  );
  if (mat.isMeshStandardMaterial) {
    fs = fs.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
#ifdef USE_LIGHTMAP
  roughnessFactor = mix( roughnessFactor, 0.06, clamp( lmS.a * uWet * 1.6 - 0.25, 0.0, 1.0 ) );
#endif`,
    );
  }
  // os #include só são expandidos depois, então substituímos o trecho inteiro
  const maps = THREE.ShaderChunk.lights_fragment_maps.replace(
    'vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;',
    `vec3 lmv = lightMapTexel.rgb * lightMapTexel.rgb * 4.0;
    vec3 lightMapIrradiance = uLightColor * dot( lmv, uLMScale ) * lightMapIntensity * PI;`,
  );
  fs = fs.replace('#include <lights_fragment_maps>', maps);
  shader.fragmentShader = fs;
}

// Cria um material iluminado. Em qualidade baixa usa Lambert (mais barato).
//   o: { map, normalMap, normalScale, roughness, metalness, roughnessMap,
//        lightMap, lmIntensity, dirtColor, dirtAmt, wet, vertexColors, color,
//        envMap, envIntensity, emissive, emissiveMap, emissiveIntensity, side,
//        transparent, opacity }
export function litMaterial(Q, o = {}) {
  const lambert = Q.lambert;
  const p = {
    color: o.color !== undefined ? o.color : 0xffffff,
    vertexColors: !!o.vertexColors,
  };
  if (o.map) p.map = o.map;
  if (o.side !== undefined) p.side = o.side;
  if (o.transparent) {
    p.transparent = true;
    p.opacity = o.opacity !== undefined ? o.opacity : 1;
    p.depthWrite = !!o.depthWrite;
  }
  if (Q.normalMaps && o.normalMap) {
    p.normalMap = o.normalMap;
    const s = o.normalScale || 1;
    p.normalScale = new THREE.Vector2(s, s);
  }
  if (o.emissive !== undefined) p.emissive = o.emissive;
  if (o.emissiveMap) p.emissiveMap = o.emissiveMap;
  if (o.emissiveIntensity !== undefined) p.emissiveIntensity = o.emissiveIntensity;
  if (!lambert) {
    p.roughness = o.roughness !== undefined ? o.roughness : 0.9;
    p.metalness = o.metalness || 0;
    if (o.roughnessMap) p.roughnessMap = o.roughnessMap;
    if (o.envMap && Q.envMap) {
      p.envMap = o.envMap;
      p.envMapIntensity = o.envIntensity !== undefined ? o.envIntensity : 1;
    }
  } else if (o.envMap && o.lambertEnv) {
    p.envMap = o.envMap;
    p.reflectivity = o.lambertEnv;
  }
  if (o.lightMap) {
    p.lightMap = o.lightMap;
    p.lightMapIntensity = o.lmIntensity !== undefined ? o.lmIntensity : 1;
  }
  const m = lambert ? new THREE.MeshLambertMaterial(p) : new THREE.MeshStandardMaterial(p);
  if (o.lightMap) {
    m.userData.dirtColor = o.dirtColor || new THREE.Color(1, 1, 1);
    m.userData.dirtAmt = o.dirtAmt || 0;
    m.userData.wet = o.wet || 0;
    m.onBeforeCompile = (shader) => patchLightmap(shader, m);
    m.customProgramCacheKey = () => 'liminar-lm';
  }
  return m;
}

// Material das lentes das luminárias: brilho por grupo (fixo, A, B, apagada).
export function panelMaterial(map, color) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        map: { value: map },
        uColor: { value: new THREE.Color(color) },
        uGroupI: { value: new THREE.Vector4(1, 1, 1, 0.04) },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float aGroup;
      varying vec2 vUv;
      varying float vGroup;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vGroup = aGroup;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uColor;
      uniform vec4 uGroupI;
      varying vec2 vUv;
      varying float vGroup;
      #include <fog_pars_fragment>
      void main() {
        float gi = vGroup < 0.5 ? uGroupI.x : vGroup < 1.5 ? uGroupI.y : vGroup < 2.5 ? uGroupI.z : uGroupI.w;
        vec3 t = texture2D( map, vUv ).rgb;
        vec3 c = t * uColor * gi + t * 0.06;
        gl_FragColor = vec4( c, 1.0 );
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

// ------------------------------------------------------------------ geometria
// Acumula quads com posição, normal, uv, uv1 (lightmap), cor e grupo.
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.uv1 = [];
    this.col = [];
    this.grp = [];
    this.idx = [];
    this.n = 0;
  }

  get empty() {
    return this.n === 0;
  }

  vert(x, y, z, nx, ny, nz, u, v, u1, v1, c, g) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.uv1.push(u1, v1);
    this.col.push(c[0], c[1], c[2]);
    this.grp.push(g);
    return this.n++;
  }

  // p: array de 4 vértices [x,y,z] em ordem anti-horária vista pela frente.
  quad(p, n, uvs, lm, cols, g = 0) {
    const W = [1, 1, 1];
    const a = this.vert(p[0][0], p[0][1], p[0][2], n[0], n[1], n[2], uvs[0], uvs[1], lm ? lm[0] : 0, lm ? lm[1] : 0, cols ? cols[0] : W, g);
    const b = this.vert(p[1][0], p[1][1], p[1][2], n[0], n[1], n[2], uvs[2], uvs[3], lm ? lm[2] : 0, lm ? lm[3] : 0, cols ? cols[1] : W, g);
    const c = this.vert(p[2][0], p[2][1], p[2][2], n[0], n[1], n[2], uvs[4], uvs[5], lm ? lm[4] : 0, lm ? lm[5] : 0, cols ? cols[2] : W, g);
    const d = this.vert(p[3][0], p[3][1], p[3][2], n[0], n[1], n[2], uvs[6], uvs[7], lm ? lm[6] : 0, lm ? lm[7] : 0, cols ? cols[3] : W, g);
    this.idx.push(a, b, c, a, c, d);
  }

  // Caixa alinhada aos eixos (opcionalmente girada em Y em torno do centro).
  // lmFn(x, z, nx, nz) → [u, v]; color: [r,g,b]; uvScale: metros por repetição.
  box(cx, cy, cz, sx, sy, sz, color, lmFn, opt = {}) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const rot = opt.rot || 0;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const us = opt.uvScale || 1;
    const skip = opt.skip || '';
    const ao = opt.ao !== undefined ? opt.ao : 0.55;
    const tr = (x, y, z) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const trn = (x, y, z) => [x * cs + z * sn, y, -x * sn + z * cs];
    const faces = [
      ['px', [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0], sz, sy],
      ['nx', [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0], sz, sy],
      ['pz', [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1], sx, sy],
      ['nz', [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1], sx, sy],
      ['py', [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0], sx, sz],
      ['ny', [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0], sx, sz],
    ];
    const bottomY = cy - hy;
    for (const f of faces) {
      if (skip.includes(f[0])) continue;
      const pts = [tr(...f[1]), tr(...f[2]), tr(...f[3]), tr(...f[4])];
      const n = trn(...f[5]);
      const w = f[6] / us;
      const h = f[7] / us;
      const uvs = [0, 0, w, 0, w, h, 0, h];
      let lm = null;
      if (lmFn) {
        lm = [];
        for (const q of pts) lm.push(...lmFn(q[0] + n[0] * 0.25, q[2] + n[2] * 0.25));
      }
      // oclusão de contato perto do chão em faces verticais
      const cols = pts.map((q) => {
        let k = 1;
        if (n[1] === 0) k = 1 - ao * Math.exp(-(q[1] - (opt.floorY || 0)) / 0.35) * (bottomY - (opt.floorY || 0) < 0.05 ? 1 : 0.3);
        if (n[1] < 0) k = 0.55;
        return [color[0] * k, color[1] * k, color[2] * k];
      });
      this.quad(pts, n, uvs, lm, cols, opt.group || 0);
    }
  }

  // Cilindro vertical (ou ao longo de um eixo) com n lados.
  cylinder(cx, cy, cz, r, h, color, lmFn, opt = {}) {
    const n = opt.sides || 10;
    const axis = opt.axis || 'y';
    const r2 = opt.r2 !== undefined ? opt.r2 : r;
    // permutações com determinante +1 (rotações), para não inverter as faces
    const mapn = (a, b, c) => {
      if (axis === 'y') return [a, b, c];
      if (axis === 'x') return [b, a, -c];
      return [-a, c, b];
    };
    const map = (a, b, c) => {
      const q = mapn(a, b, c);
      return [cx + q[0], cy + q[1], cz + q[2]];
    };
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p0 = map(Math.cos(a0) * r, -h / 2, Math.sin(a0) * r);
      const p1 = map(Math.cos(a1) * r, -h / 2, Math.sin(a1) * r);
      const p2 = map(Math.cos(a1) * r2, h / 2, Math.sin(a1) * r2);
      const p3 = map(Math.cos(a0) * r2, h / 2, Math.sin(a0) * r2);
      const nn = mapn(Math.cos(am), 0, Math.sin(am));
      let lm = null;
      if (lmFn) {
        lm = [];
        for (const q of [p0, p1, p2, p3]) lm.push(...lmFn(q[0] + nn[0] * 0.25, q[2] + nn[2] * 0.25));
      }
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const uvq = opt.uvConst ? [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] : [u1, 0, u0, 0, u0, h, u1, h];
      this.quad([p1, p0, p3, p2], nn, uvq, lm, opt.cols || [color, color, color, color], opt.group || 0);
      if (opt.caps !== false) {
        const top = map(0, h / 2, 0);
        const tn = mapn(0, 1, 0);
        let lmt = null;
        if (lmFn) {
          const l = lmFn(top[0], top[2]);
          lmt = [l[0], l[1], l[0], l[1], l[0], l[1], l[0], l[1]];
        }
        this.quad([top, p2, p3, top], tn, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], lmt, [color, color, color, color], opt.group || 0);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv1, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aGroup', new THREE.Float32BufferAttribute(this.grp, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
