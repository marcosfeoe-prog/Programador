// Água dos lagos e do rio: um plano no nível da água com ondas (normal map rolando),
// reflexo do céu (Fresnel), brilho do sol, cor pela profundidade e espuma na margem.
import * as THREE from 'three';
import { HALF, RES, WATER } from './heightfield.js';

export function makeHeightTexture(hf) {
  const t = new THREE.DataTexture(hf.h, RES, RES, THREE.RedFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// trecho GLSL: altura do terreno com interpolação manual (textura float sem filtro)
export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D tHeight;
float terrainH(vec2 xz) {
  vec2 g = clamp((xz + ${HALF.toFixed(1)}) / ${(2 * HALF / (RES - 1)).toFixed(4)}, vec2(0.0), vec2(${(RES - 1.001).toFixed(3)}));
  ivec2 i = ivec2(floor(g));
  vec2 f = g - vec2(i);
  float h00 = texelFetch(tHeight, i, 0).r;
  float h10 = texelFetch(tHeight, i + ivec2(1, 0), 0).r;
  float h01 = texelFetch(tHeight, i + ivec2(0, 1), 0).r;
  float h11 = texelFetch(tHeight, i + ivec2(1, 1), 0).r;
  if (f.x + f.y < 1.0) return h00 + (h10 - h00) * f.x + (h01 - h00) * f.y;
  return h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
}`;

export class Water {
  constructor(scene, heightTex, normalTex, sky) {
    this.sky = sky;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(uniforms, {
      tHeight: { value: heightTex },
      tNormal: { value: normalTex },
      uTime: { value: 0 },
      uSunDir: sky.uniforms.uSunDir,
      uSunColor: sky.uniforms.uSunColor,
      uZenith: sky.uniforms.uZenith,
      uHorizon: sky.uniforms.uHorizon,
      uNight: sky.uniforms.uNight,
      uSunVis: sky.uniforms.uSunVis,
    });
    this.uniforms = uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        varying vec3 vWPos;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWPos = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tNormal;
        uniform float uTime, uNight, uSunVis;
        uniform vec3 uSunDir, uSunColor, uZenith, uHorizon;
        varying vec3 vWPos;
        ${HEIGHT_GLSL}
        #include <fog_pars_fragment>
        void main() {
          float depth = ${WATER.toFixed(1)} - terrainH(vWPos.xz);
          if (depth < -0.05) discard;
          vec2 uv = vWPos.xz;
          vec3 n1 = texture2D(tNormal, uv * 0.045 + vec2(uTime * 0.012, uTime * 0.007)).xzy * 2.0 - 1.0;
          vec3 n2 = texture2D(tNormal, uv * 0.11 - vec2(uTime * 0.017, -uTime * 0.011)).xzy * 2.0 - 1.0;
          vec3 n3 = texture2D(tNormal, uv * 0.012 + vec2(uTime * 0.004, 0.0)).xzy * 2.0 - 1.0;
          vec3 n = normalize(vec3(0.0, 1.0, 0.0) + (n1 + n2 * 0.6 + n3 * 0.8) * vec3(0.18, 0.0, 0.18));
          vec3 v = normalize(cameraPosition - vWPos);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 r = reflect(-v, n);
          vec3 sky = mix(uHorizon, uZenith, pow(max(r.y, 0.0), 0.5));
          vec3 shallow = vec3(0.16, 0.32, 0.27);
          vec3 deep = vec3(0.02, 0.09, 0.12);
          vec3 body = mix(shallow, deep, smoothstep(0.0, 5.0, depth)) * (0.35 + 0.65 * (1.0 - uNight)) * max(0.25, uSunDir.y + 0.4);
          vec3 col = mix(body, sky, fres);
          float spec = pow(max(dot(r, uSunDir), 0.0), 220.0) * 8.0 * uSunVis;
          col += uSunColor * spec;
          // espuma na margem
          float foam = smoothstep(0.35, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 1.3 + vWPos.x * 0.7 + vWPos.z * 0.4));
          col = mix(col, vec3(0.82, 0.86, 0.84) * (1.0 - uNight * 0.85), foam * 0.45);
          float alpha = clamp(smoothstep(0.0, 1.6, depth) * 0.75 + fres * 0.6 + 0.15, 0.0, 0.97);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(dt) {
    this.uniforms.uTime.value += dt;
  }
}
