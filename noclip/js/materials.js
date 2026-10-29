// Materiais: carregamento das texturas e injeção de shader (lightmap com canais
// de lâmpadas piscando, luz por vértice, sondas de ambiente, variação em escala
// grande para quebrar a repetição e sujeira perto do chão).
import * as THREE from 'three';
import { Q } from './config.js';

export const LU = {
  uPower: { value: 1 },
  uFlick: { value: new THREE.Vector3(1, 1, 1) },
  uFlickColor: { value: new THREE.Color(1, 0.96, 0.86) },
  uNoise: { value: null },
  uTime: { value: 0 },
};

const loader = new THREE.TextureLoader();
const cache = new Map();
export function tex(name, { srgb = true, rep = true } = {}) {
  const key = name + (srgb ? ':s' : ':l');
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(new URL(`../assets/tex/${name}`, import.meta.url).href);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Q().aniso;
  cache.set(key, t);
  return t;
}

// Espera todas as texturas pedidas até agora terminarem de carregar.
export function texturesReady() {
  const list = [...cache.values()];
  return Promise.all(
    list.map(
      (t) =>
        new Promise((res) => {
          if (t.image && (t.image.complete || t.image.width)) return res();
          const check = () => (t.image && t.image.width ? res() : setTimeout(check, 30));
          check();
        })
    )
  );
}

export function setAnisotropy(a) {
  for (const t of cache.values()) {
    t.anisotropy = a;
    t.needsUpdate = true;
  }
}

const FRAG_HEAD = /* glsl */ `
uniform float uPower;
uniform vec3 uFlick;
uniform vec3 uFlickColor;
uniform sampler2D uNoise;
varying vec3 vWPos;
#ifdef USE_GRIME
uniform vec3 uGrime;
#endif
#ifdef USE_MACRO
uniform float uMacro;
#endif
#ifdef USE_LMFLICK
uniform sampler2D uFlickMap;
#endif
#ifdef USE_VLIGHT
varying vec3 vLight;
varying vec3 vFlick;
#endif
#ifdef USE_PROBE
uniform vec3 uProbe[6];
#endif
#ifdef USE_TRIPLANAR
uniform sampler2D uDetail;
uniform sampler2D uDetailN;
uniform float uDetailScale;
#endif
`;

const MACRO = /* glsl */ `
#if defined(USE_MACRO) || defined(USE_GRIME)
  vec2 mq = vWPos.xz * 0.045 + vec2(vWPos.y * 0.071, -vWPos.y * 0.053);
  vec4 nz1 = texture2D(uNoise, mq);
  vec4 nz2 = texture2D(uNoise, mq * 3.7 + 0.31);
#endif
#ifdef USE_MACRO
  diffuseColor.rgb *= 1.0 + uMacro * ((nz1.r - 0.5) * 1.6 + (nz2.g - 0.5) * 0.7);
#endif
#ifdef USE_GRIME
  float gh = 1.0 - smoothstep(0.0, uGrime.y, vWPos.y);
  gh += uGrime.z * smoothstep(2.0, 3.0, vWPos.y) * 0.5;
  diffuseColor.rgb *= 1.0 - uGrime.x * gh * (0.55 + 0.9 * nz2.b);
#endif
#ifdef USE_TRIPLANAR
  vec3 tw = abs(vNormalW);
  tw = pow(tw, vec3(4.0));
  tw /= (tw.x + tw.y + tw.z);
  vec3 tp = vObjPos * uDetailScale;
  vec3 dcol = texture2D(uDetail, tp.yz).rgb * tw.x + texture2D(uDetail, tp.xz).rgb * tw.y + texture2D(uDetail, tp.xy).rgb * tw.z;
  diffuseColor.rgb *= dcol * 1.08;
#endif
`;

const LIGHTS = /* glsl */ `
#if defined( RE_IndirectDiffuse )
#ifdef USE_LMFLICK
  irradiance += uFlickColor * dot(texture2D(uFlickMap, vLightMapUv).rgb, uFlick) * PI * uPower;
#endif
#ifdef USE_VLIGHT
  irradiance += (vLight + uFlickColor * dot(vFlick, uFlick)) * PI * uPower;
#endif
#ifdef USE_PROBE
  {
    vec3 wn = inverseTransformDirection(normal, viewMatrix);
    vec3 w2 = wn * wn;
    vec3 amb = w2.x * (wn.x > 0.0 ? uProbe[0] : uProbe[1]) + w2.y * (wn.y > 0.0 ? uProbe[2] : uProbe[3]) + w2.z * (wn.z > 0.0 ? uProbe[4] : uProbe[5]);
    irradiance += amb * PI * uPower;
  }
#endif
#endif
`;

function inject(sh, mat) {
  const u = mat.userData;
  sh.uniforms.uPower = LU.uPower;
  sh.uniforms.uFlick = LU.uFlick;
  sh.uniforms.uFlickColor = LU.uFlickColor;
  sh.uniforms.uNoise = LU.uNoise;
  if (u.uGrime) sh.uniforms.uGrime = u.uGrime;
  if (u.uMacro) sh.uniforms.uMacro = u.uMacro;
  if (u.uFlickMap) sh.uniforms.uFlickMap = u.uFlickMap;
  if (u.uProbe) sh.uniforms.uProbe = u.uProbe;
  if (u.uDetail) {
    sh.uniforms.uDetail = u.uDetail;
    sh.uniforms.uDetailN = u.uDetailN;
    sh.uniforms.uDetailScale = u.uDetailScale;
  }
  sh.vertexShader = sh.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vWPos;
#ifdef USE_VLIGHT
attribute vec3 aLight; attribute vec3 aFlick; varying vec3 vLight; varying vec3 vFlick;
#endif
#ifdef USE_TRIPLANAR
varying vec3 vObjPos; varying vec3 vNormalW;
#endif`
    )
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp4 = instanceMatrix * wp4;
  #endif
  vWPos = (modelMatrix * wp4).xyz;
}
#ifdef USE_VLIGHT
vLight = aLight; vFlick = aFlick;
#endif
#ifdef USE_TRIPLANAR
vObjPos = position; vNormalW = normal;
#endif`
    );
  sh.fragmentShader = sh.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
${FRAG_HEAD}
#ifdef USE_TRIPLANAR
varying vec3 vObjPos; varying vec3 vNormalW;
#endif`
    )
    .replace('#include <map_fragment>', '#include <map_fragment>\n' + MACRO)
    .replace(
      '#include <lights_fragment_maps>',
      THREE.ShaderChunk.lights_fragment_maps.replace('lightMapTexel.rgb * lightMapIntensity', 'lightMapTexel.rgb * lightMapIntensity * uPower') + LIGHTS
    )
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef EMIT_POWER\ntotalEmissiveRadiance *= uPower;\n#endif');
}

function onBC(sh) {
  inject(sh, this);
}

/**
 * Cria um material com as extensões do jogo.
 * opts: map, normalMap, roughnessMap, color, roughness, metalness, normalScale,
 *       lightMap, flickMap, vlight, probe, macro, grime [força, altura, teto],
 *       detail (triplanar), emissive, emissiveIntensity, emitPower, side, transparent, alphaMap...
 */
export function gameMaterial(opts = {}) {
  const pbr = opts.forcePBR || Q().pbr;
  const p = {
    color: opts.color ?? 0xffffff,
    map: opts.map || null,
    transparent: !!opts.transparent,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
  };
  if (opts.alphaTest) p.alphaTest = opts.alphaTest;
  if (opts.lightMap) {
    p.lightMap = opts.lightMap;
    p.lightMapIntensity = Math.PI;
  }
  if (opts.emissive !== undefined) {
    p.emissive = opts.emissive;
    p.emissiveIntensity = opts.emissiveIntensity ?? 1;
    if (opts.emissiveMap) p.emissiveMap = opts.emissiveMap;
  }
  let m;
  if (pbr) {
    Object.assign(p, {
      roughness: opts.roughness ?? 0.9,
      metalness: opts.metalness ?? 0,
    });
    if (opts.normalMap) {
      p.normalMap = opts.normalMap;
      p.normalScale = new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1);
    }
    if (opts.roughnessMap) p.roughnessMap = opts.roughnessMap;
    if (opts.envMap) {
      p.envMap = opts.envMap;
      p.envMapIntensity = opts.envMapIntensity ?? 1;
    }
    m = new THREE.MeshStandardMaterial(p);
  } else {
    m = new THREE.MeshLambertMaterial(p);
  }
  if (opts.depthWrite === false) m.depthWrite = false;
  if (opts.polygonOffset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  m.defines = m.defines || {};
  const u = m.userData;
  if (opts.flickMap) {
    m.defines.USE_LMFLICK = '';
    u.uFlickMap = { value: opts.flickMap };
  }
  if (opts.vlight) m.defines.USE_VLIGHT = '';
  if (opts.probe) {
    m.defines.USE_PROBE = '';
    u.uProbe = { value: Array.from({ length: 6 }, () => new THREE.Vector3(0.05, 0.05, 0.05)) };
  }
  if (opts.macro) {
    m.defines.USE_MACRO = '';
    u.uMacro = { value: opts.macro };
  }
  if (opts.grime) {
    m.defines.USE_GRIME = '';
    u.uGrime = { value: new THREE.Vector3(...opts.grime) };
  }
  if (opts.detail) {
    m.defines.USE_TRIPLANAR = '';
    u.uDetail = { value: opts.detail };
    u.uDetailN = { value: opts.detailN || opts.detail };
    u.uDetailScale = { value: opts.detailScale ?? 4 };
  }
  if (opts.emitPower) m.defines.EMIT_POWER = '';
  m.onBeforeCompile = onBC;
  return m;
}

// Atualiza o cubo de ambiente de um material com sonda a partir de 18 floats.
export function setProbe(mat, d, gain = 1) {
  const p = mat.userData.uProbe;
  if (!p) return;
  for (let i = 0; i < 6; i++) p.value[i].set(d[i * 3] * gain, d[i * 3 + 1] * gain, d[i * 3 + 2] * gain);
}

// Ambiente simples (sala com painéis de luz no teto) para reflexos especulares
// de objetos dinâmicos (luva, lanterna, pele das criaturas).
export function makeEnv(renderer, { wall = 0x6a5f35, floor = 0x3a3220, ceil = 0x4a463a, light = 0xfff4dc, lightI = 9 } = {}) {
  const s = new THREE.Scene();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const side = THREE.BackSide;
  const room = new THREE.Mesh(box, [
    new THREE.MeshBasicMaterial({ color: wall, side }),
    new THREE.MeshBasicMaterial({ color: wall, side }),
    new THREE.MeshBasicMaterial({ color: ceil, side }),
    new THREE.MeshBasicMaterial({ color: floor, side }),
    new THREE.MeshBasicMaterial({ color: wall, side }),
    new THREE.MeshBasicMaterial({ color: wall, side }),
  ]);
  room.scale.set(12, 3, 12);
  room.position.y = 1.4;
  s.add(room);
  const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(light).multiplyScalar(lightI) });
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), pm);
      p.rotation.x = Math.PI / 2;
      p.position.set(x * 3, 2.88, z * 3);
      s.add(p);
    }
  const gen = new THREE.PMREMGenerator(renderer);
  const rt = gen.fromScene(s, 0.02);
  gen.dispose();
  return rt.texture;
}
