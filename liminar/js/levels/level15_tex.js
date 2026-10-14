// Nível 15 — texturas procedurais e materiais especiais (LEDs, reflexo do
// piso polido e números pontilhados pintados nas paredes).
import * as THREE from 'three';
import { registerTexture, TEX, textCanvasTex } from '../textures.js';
import { clamp, mulberry32 } from '../util.js';

const { toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;

// ------------------------------------------------------------ texturas
registerTexture('l15Wall', (S) => {
  // painel branco de 1,6 m × 3,4 m: juntas na borda, a 0,9 m e a 2,5 m
  const W = S >> 1;
  const H = S;
  const low = noiseField(W, H, 2, 4, 3, 151);
  const fine = whiteNoise(W * H, 152);
  const rows = [Math.round(H * (1 - 0.9 / 3.4)), Math.round(H * (1 - 2.5 / 3.4))];
  const hf = new Float32Array(W * H);
  const cv = paintRGB(W, H, (x, y, i, o) => {
    const dx = Math.min(x, W - 1 - x);
    let dy = 99;
    for (const r of rows) dy = Math.min(dy, Math.abs(y - r));
    const d = Math.min(dx, dy);
    let k = 0.86 + low[i] * 0.025 + fine[i] * 0.008;
    if (d < 1) k *= 0.5;
    else if (d < 3) k *= 0.96 + d * 0.012;
    o[0] = k * 0.982;
    o[1] = k * 0.993;
    o[2] = k;
    hf[i] = d < 1 ? 0 : 0.5 + low[i] * 0.03;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, W, H, 2.2) };
});

registerTexture('l15Floor', (S) => {
  // resina polida cinza-clara em placas de 0,8 m (2×2 por repetição de 1,6 m)
  const low = noiseField(S, S, 3, 3, 4, 161);
  const speck = whiteNoise(S * S, 162);
  const tone = mulberry32(163);
  const tiles = [tone(), tone(), tone(), tone()];
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const h = S >> 1;
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const tx = x < h ? 0 : 1;
    const ty = y < h ? 0 : 1;
    const dx = Math.min(x % h, h - 1 - (x % h));
    const dy = Math.min(y % h, h - 1 - (y % h));
    const d = Math.min(dx, dy);
    const t = tiles[ty * 2 + tx];
    let k = 0.6 + low[i] * 0.035 + (t - 0.5) * 0.025;
    if (speck[i] > 0.985) k += 0.06;
    else if (speck[i] < -0.988) k -= 0.08;
    if (d < 1) k *= 0.55;
    o[0] = k * 0.98;
    o[1] = k * 0.99;
    o[2] = k;
    hf[i] = d < 1 ? 0 : 0.5;
    rg[i] = d < 1 ? 0.75 : clamp(0.2 + low[i] * 0.18, 0.08, 0.4);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.5), roughnessMap: toTex(rgh, { srgb: false }) };
});

registerTexture('l15Ceil', (S) => {
  const low = noiseField(S, S, 2, 2, 3, 171);
  const h = S >> 1;
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const d = Math.min(x % h, h - 1 - (x % h), y % h, h - 1 - (y % h));
    let k = 0.82 + low[i] * 0.02;
    if (d < 1) k *= 0.55;
    o[0] = k * 0.985;
    o[1] = k * 0.995;
    o[2] = k;
    hf[i] = d < 1 ? 0 : 0.5;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.5) };
});

registerTexture('l15Metal', (S) => {
  // metal escovado com leve sujeira (tingido pelas cores dos vértices)
  const streak = noiseField(S, S, 1, 64, 3, 181);
  const low = noiseField(S, S, 3, 3, 4, 182);
  const fine = whiteNoise(S * S, 183);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const k = 0.78 + streak[i] * 0.05 + low[i] * 0.04 + fine[i] * 0.015;
    o[0] = k;
    o[1] = k;
    o[2] = k * 1.01;
  });
  return { map: toTex(cv) };
});

registerTexture('l15Lens', () => {
  const S = 64;
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const u = Math.abs(x / (S - 1) - 0.5) * 2;
    const v = Math.abs(y / (S - 1) - 0.5) * 2;
    const e = Math.max(u, v);
    const k = e > 0.93 ? 0.55 : 1 - e * e * 0.12;
    o[0] = k * 0.97;
    o[1] = k * 0.99;
    o[2] = k;
  });
  return { map: toTex(cv, { repeat: false }) };
});

// Atlas com os algarismos 0–9 em pontos (pintura de estêncil pontilhada).
registerTexture('l15Digits', () => {
  const cols = 8;
  const rowsN = 12;
  const pitch = 12;
  const cw = 128;
  const W = cw * 10;
  const H = 160;
  const rnd = mulberry32(191);
  const tex = textCanvasTex(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    const sw = cols * 10;
    const sh = rowsN * 10;
    const sc = document.createElement('canvas');
    sc.width = sw;
    sc.height = sh;
    const s = sc.getContext('2d');
    for (let d = 0; d < 10; d++) {
      s.clearRect(0, 0, sw, sh);
      s.fillStyle = '#fff';
      s.font = `bold ${Math.round(sh * 1.12)}px Arial, Helvetica, sans-serif`;
      s.textAlign = 'center';
      s.textBaseline = 'middle';
      s.fillText(String(d), sw / 2, sh / 2 + sh * 0.05);
      const px = s.getImageData(0, 0, sw, sh).data;
      const ox = d * cw + (cw - cols * pitch) / 2;
      const oy = (H - rowsN * pitch) / 2;
      for (let gy = 0; gy < rowsN; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          let cov = 0;
          for (let yy = 0; yy < 10; yy++) for (let xx = 0; xx < 10; xx++) cov += px[((gy * 10 + yy) * sw + gx * 10 + xx) * 4 + 3];
          cov /= 100 * 255;
          if (cov < 0.18) continue;
          const r = pitch * 0.47 * Math.sqrt(cov) * (0.9 + rnd() * 0.12);
          c.globalAlpha = 0.82 + rnd() * 0.18;
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(ox + (gx + 0.5) * pitch, oy + (gy + 0.5) * pitch, r, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.globalAlpha = 1;
  });
  return { map: tex };
});

// Telas dos terminais, cartão de acesso e placa da comporta.
registerTexture('l15Misc', () => {
  const screen = (on) =>
    textCanvasTex(256, 160, (c, w, h) => {
      c.fillStyle = on ? '#021a0b' : '#1c0404';
      c.fillRect(0, 0, w, h);
      const fg = on ? '#5dff95' : '#ff4433';
      c.strokeStyle = fg;
      c.globalAlpha = 0.5;
      c.lineWidth = 3;
      c.strokeRect(8, 8, w - 16, h - 16);
      c.globalAlpha = 1;
      c.fillStyle = fg;
      c.font = 'bold 18px "Courier New", monospace';
      c.textAlign = 'left';
      c.fillText('TERMINAL N15', 20, 34);
      c.font = 'bold 40px "Courier New", monospace';
      c.textAlign = 'center';
      c.fillText(on ? 'ONLINE' : 'OFFLINE', w / 2, 92);
      c.font = '15px "Courier New", monospace';
      c.fillText(on ? 'SISTEMA ATIVO' : 'RELIGAR SISTEMA', w / 2, 124);
      for (let i = 0; i < 8; i++) {
        c.globalAlpha = 0.6;
        c.fillRect(24 + i * 27, 140, 20, on ? 8 : 3);
      }
      c.globalAlpha = 1;
      // linhas de varredura
      c.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    });
  const card = textCanvasTex(128, 80, (c, w, h) => {
    c.fillStyle = '#eef1f3';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f5fbf';
    c.fillRect(0, 0, w, 20);
    c.fillStyle = '#c9a43c';
    c.fillRect(12, 32, 22, 17);
    c.strokeStyle = '#8a6d22';
    c.strokeRect(12.5, 32.5, 21, 16);
    c.fillStyle = '#ffffff';
    c.font = 'bold 13px Arial, sans-serif';
    c.fillText('ACESSO', 8, 15);
    c.fillStyle = '#1b2a3a';
    c.font = 'bold 12px Arial, sans-serif';
    c.fillText('NÍVEL 15', 44, 44);
    c.font = '9px Arial, sans-serif';
    c.fillText('MANUTENÇÃO', 44, 58);
    c.fillRect(8, 66, 112, 4);
  });
  const sign = textCanvasTex(512, 96, (c, w, h) => {
    c.fillStyle = '#e8ecee';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#111416';
    c.fillRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#f2c230';
    c.font = 'bold 52px Arial, Helvetica, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('COMPORTA 15', w / 2, h / 2 + 3);
  });
  return { screenOff: screen(false), screenOn: screen(true), card, sign };
});

// ------------------------------------------------------------ materiais
// LEDs de status: cor nos vértices; aGroup > 0 pisca (parte inteira = ritmo,
// fração = fase), aGroup = 0 fica aceso.
export function ledMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uI: { value: 2.4 } }]),
    vertexShader: /* glsl */ `
      attribute float aGroup;
      varying vec3 vCol;
      varying float vG;
      #include <fog_pars_vertex>
      void main() {
        vCol = color;
        vG = aGroup;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uI;
      varying vec3 vCol;
      varying float vG;
      #include <fog_pars_fragment>
      void main() {
        float on = 1.0;
        if ( vG > 0.0 ) {
          float rate = 0.3 + floor( vG ) * 0.45;
          float ph = fract( vG );
          on = mix( 0.1, 1.0, step( fract( uTime * rate + ph ), 0.3 + 0.55 * fract( ph * 7.31 ) ) );
        }
        gl_FragColor = vec4( vCol * uI * on, 1.0 );
        #include <fog_fragment>
      }`,
    vertexColors: true,
    fog: true,
  });
}

// Reflexo das faixas de luz no piso polido: faixa aditiva que acompanha o
// grupo da luminária (apaga junto com ela). Divide o uniforme uGroupI do painel.
export function glossMaterial(groupUniform) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(0.9, 0.95, 1.0) } }]),
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
      uniform vec3 uColor;
      uniform vec4 uGroupI;
      varying vec2 vUv;
      varying float vGroup;
      #include <fog_pars_fragment>
      void main() {
        float gi = vGroup < 0.5 ? uGroupI.x : vGroup < 1.5 ? uGroupI.y : vGroup < 2.5 ? uGroupI.z : uGroupI.w;
        float a = ( vUv.x - 0.5 ) * 4.2;
        float k = exp( -a * a ) * 0.045 + exp( -a * a * 18.0 ) * 0.05;
        vec3 c = uColor * gi * k;
        #ifdef USE_FOG
          c *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor = vec4( c, 1.0 );
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  m.uniforms.uGroupI = groupUniform;
  return m;
}

// Números pintados em pontos (decalque escuro sobre a parede branca).
export function numMaterial(atlas) {
  return new THREE.MeshBasicMaterial({
    map: atlas,
    color: new THREE.Color(0.018, 0.02, 0.022),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    fog: true,
  });
}

// O reflexo do ambiente acompanha o lightmap: num trecho apagado o piso
// polido não pode continuar brilhando.
export function envFollowsLightmap(mat) {
  if (!mat || !mat.isMeshStandardMaterial || !mat.envMap || mat.userData.l15env) return;
  mat.userData.l15env = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#ifdef USE_LIGHTMAP
  float lmK = clamp( dot( lmv, uLMScale ) * 1.4, 0.0, 1.0 );
  #if defined( RE_IndirectSpecular )
    radiance *= lmK;
  #endif
  iblIrradiance *= lmK;
#endif
#include <lights_fragment_end>`,
    );
  };
  mat.customProgramCacheKey = () => 'liminar-lm-l15env';
  mat.needsUpdate = true;
}
