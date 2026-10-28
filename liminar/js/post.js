// Pós-processamento: cena em HDR (com MSAA), bloom em cadeia (Kawase duplo),
// tone mapping ACES, gradação de cor por nível, efeitos de sanidade e filtros.
import * as THREE from 'three';
import { FILTERS } from './config.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

const PREFILTER = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 pf( vec3 c ) {
  float br = max( c.r, max( c.g, c.b ) );
  float soft = clamp( br - uThreshold + uKnee, 0.0, 2.0 * uKnee );
  soft = soft * soft / ( 4.0 * uKnee + 1e-4 );
  float w = max( soft, br - uThreshold ) / max( br, 1e-4 );
  return min( c * w, vec3( 60.0 ) );
}
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = pf( texture2D( tInput, vUv + vec2( -o.x, -o.y ) ).rgb );
  c += pf( texture2D( tInput, vUv + vec2( o.x, -o.y ) ).rgb );
  c += pf( texture2D( tInput, vUv + vec2( -o.x, o.y ) ).rgb );
  c += pf( texture2D( tInput, vUv + vec2( o.x, o.y ) ).rgb );
  gl_FragColor = vec4( c * 0.25, 1.0 );
}
`;

const DOWN = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D( tInput, vUv ).rgb * 4.0;
  c += texture2D( tInput, vUv + vec2( -o.x, -o.y ) ).rgb;
  c += texture2D( tInput, vUv + vec2( o.x, -o.y ) ).rgb;
  c += texture2D( tInput, vUv + vec2( -o.x, o.y ) ).rgb;
  c += texture2D( tInput, vUv + vec2( o.x, o.y ) ).rgb;
  gl_FragColor = vec4( c / 8.0, 1.0 );
}
`;

const UP = /* glsl */ `
uniform sampler2D tLow;
uniform sampler2D tCur;
uniform vec2 uTexel;
uniform float uCurW;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D( tLow, vUv + vec2( -2.0 * o.x, 0.0 ) ).rgb;
  c += texture2D( tLow, vUv + vec2( 2.0 * o.x, 0.0 ) ).rgb;
  c += texture2D( tLow, vUv + vec2( 0.0, -2.0 * o.y ) ).rgb;
  c += texture2D( tLow, vUv + vec2( 0.0, 2.0 * o.y ) ).rgb;
  c += texture2D( tLow, vUv + vec2( -o.x, -o.y ) ).rgb * 2.0;
  c += texture2D( tLow, vUv + vec2( o.x, -o.y ) ).rgb * 2.0;
  c += texture2D( tLow, vUv + vec2( -o.x, o.y ) ).rgb * 2.0;
  c += texture2D( tLow, vUv + vec2( o.x, o.y ) ).rgb * 2.0;
  gl_FragColor = vec4( c / 12.0 + texture2D( tCur, vUv ).rgb * uCurW, 1.0 );
}
`;

// Composição final com os filtros. FILTER é definido em tempo de compilação.
const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloom;
uniform float uExposure;
uniform vec3 uTint;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform float uVignette;
uniform float uGrain;
uniform float uStrength;
uniform float uInsane;
uniform float uPulse;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uFlash;
uniform float uGlitch;
uniform float uDamage;
uniform float uBlur;
uniform vec2 uMotion;
uniform float uEdgeBlur;
varying vec2 vUv;

float hash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
vec3 aces( vec3 x ) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );
}
float luma( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

vec3 hdrAt( vec2 uv ) {
  return texture2D( tScene, uv ).rgb + texture2D( tBloom, uv ).rgb * uBloom;
}
vec3 toneMap( vec3 c ) {
  c = aces( c * uExposure );
  c = pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) );
  float l = luma( c );
  c = mix( vec3( l ), c, uSat );
  c *= uTint;
  c = ( c - 0.5 ) * uContrast + 0.5;
  c = uLift + c * ( 1.0 - uLift );
  return clamp( c, 0.0, 1.0 );
}
vec3 colorAt( vec2 uv ) { return toneMap( hdrAt( uv ) ); }

vec2 barrel( vec2 uv, float k ) {
  vec2 c = uv - 0.5;
  float r2 = dot( c, c );
  return 0.5 + c * ( 1.0 + k * r2 ) / ( 1.0 + k * 0.25 );
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  float frame = floor( t * 24.0 );
  float S = uStrength;

  // ---- distorções de coordenada
  float ins = uInsane;
  uv += vec2( sin( uv.y * 11.0 + t * 1.9 ), cos( uv.x * 9.0 + t * 1.6 ) ) * 0.006 * ins * ins;
  if ( uGlitch > 0.0 ) {
    float row = floor( uv.y * 40.0 );
    float g = step( 1.0 - uGlitch * 0.8, hash( vec2( row, floor( t * 20.0 ) ) ) );
    uv.x += ( hash( vec2( row, t ) ) - 0.5 ) * 0.2 * g * uGlitch;
  }
  bool outside = false;

#if FILTER == 1
  // VHS: tremor de linha, faixa de trilha e ruído de troca de cabeça
  float line = floor( uv.y * 260.0 );
  uv.x += ( hash( vec2( line, frame ) ) - 0.5 ) * 0.0018 * S;
  float bandY = fract( t * 0.07 );
  float band = 1.0 - smoothstep( 0.0, 0.025, abs( uv.y - bandY ) );
  uv.x += band * ( vnoise( vec2( uv.y * 300.0, t * 40.0 ) ) - 0.5 ) * 0.02 * S;
  float head = smoothstep( 0.035, 0.0, uv.y );
  uv.x += head * ( hash( vec2( floor( uv.y * 120.0 ), frame ) ) - 0.3 ) * 0.04 * S;
  uv.y += sin( t * 0.7 ) * 0.0006 * S;
#elif FILTER == 2
  uv += vec2( sin( t * 13.0 ) * 0.0012, cos( t * 7.3 ) * 0.0018 + ( hash( vec2( frame, 3.0 ) ) - 0.5 ) * 0.002 ) * S;
#elif FILTER == 5
  uv = mix( uv, barrel( uv, 0.22 ), S );
  outside = any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) );
#elif FILTER == 7
  vec2 blk = floor( uv * vec2( 10.0, 28.0 ) );
  float tb = floor( t * 9.0 );
  float r = hash( blk + tb );
  if ( r > 0.9 - 0.05 * S ) uv.x += ( hash( blk * 1.7 + tb ) - 0.5 ) * 0.12 * S;
  float lineG = step( 0.985, hash( vec2( floor( uv.y * 180.0 ), tb ) ) );
  uv.x += lineG * 0.05 * S;
#elif FILTER == 10
  uv = mix( uv, barrel( uv, 0.55 ), S );
  outside = any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) );
#endif

  // ---- amostragem (com aberração cromática quando necessário)
  float ca = 0.0015 * ins + 0.004 * ins * ins;
#if FILTER == 6
  ca += 0.0035 * S;
#elif FILTER == 7
  ca += 0.006 * S * ( 0.4 + hash( vec2( floor( t * 9.0 ), 1.0 ) ) );
#elif FILTER == 1
  ca += 0.0012 * S;
#endif
  vec3 col;
  if ( ca > 0.0 ) {
    vec2 dir = ( uv - 0.5 ) * ca * 2.0;
#if FILTER == 7 || FILTER == 1
    dir = vec2( ca, 0.0 );
#endif
    col = vec3( colorAt( uv + dir ).r, colorAt( uv ).g, colorAt( uv - dir ).b );
  } else {
    col = colorAt( uv );
  }
  // desfoque de movimento (direção do giro/deslocamento da câmera na tela)
  float mv = length( uMotion );
  if ( mv > 0.0004 ) {
    vec3 acc = col;
    float wsum = 1.0;
    for ( int k = 1; k <= 6; k++ ) {
      float f = float( k ) / 6.0 - 0.5;
      float w = 1.0 - abs( f );
      acc += colorAt( uv + uMotion * f ) * w;
      wsum += w;
    }
    col = acc / wsum;
  }
  // leve desfoque nas bordas (lente), mais forte ao correr
  if ( uEdgeBlur > 0.001 ) {
    float e = smoothstep( 0.25, 0.75, length( ( uv - 0.5 ) * vec2( 1.3, 1.0 ) ) ) * uEdgeBlur;
    if ( e > 0.01 ) {
      vec3 acc = col;
      for ( int k = 0; k < 6; k++ ) {
        float a = float( k ) * 1.0472;
        acc += colorAt( uv + vec2( cos( a ), sin( a ) ) * e * 0.006 );
      }
      col = acc / 7.0;
    }
  }
  // visão embaçada (alguns níveis)
  if ( uBlur > 0.001 ) {
    vec3 acc = col;
    for ( int k = 0; k < 8; k++ ) {
      float a = float( k ) * 0.785398 + t * 0.4;
      acc += colorAt( uv + vec2( cos( a ), sin( a ) * 1.6 ) * uBlur * 0.01 );
    }
    col = acc / 9.0;
  }
  vec3 base = col;

  // ---- filtros de cor
  float grainAmt = uGrain * 0.06;
#if FILTER == 1
  {
    // separa luma/croma (YIQ) e borra o croma na horizontal
    mat3 toYIQ = mat3( 0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312 );
    mat3 toRGB = mat3( 1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703 );
    vec3 yiq = toYIQ * col;
    vec2 cs = vec2( 0.0 );
    for ( int i = -3; i <= 3; i++ ) {
      vec3 s = toYIQ * colorAt( uv + vec2( float( i ) * 0.0025 + 0.004, 0.0 ) );
      cs += s.yz;
    }
    yiq.yz = mix( yiq.yz, cs / 7.0 * 1.15, S );
    vec3 v = toRGB * yiq;
    v = mix( v, v * vec3( 1.05, 0.98, 0.9 ) + vec3( 0.02, 0.015, 0.03 ), S );
    v *= 1.0 - 0.07 * S * step( 0.5, fract( gl_FragCoord.y * 0.5 ) );
    float n = hash( uv * uRes + frame );
    v += ( n - 0.5 ) * 0.09 * S;
    v += band * ( hash( vec2( uv.x * 400.0, frame ) ) ) * 0.25 * S;
    v = mix( v, vec3( hash( uv * 731.0 + frame ) ), head * 0.6 * S );
    col = mix( col, v, S );
  }
#elif FILTER == 2
  {
    float l = luma( col );
    l = smoothstep( 0.02, 0.98, l );
    vec3 sep = vec3( l * 1.07, l * 0.9, l * 0.68 ) + vec3( 0.04, 0.025, 0.0 );
    sep *= 0.9 + 0.1 * hash( vec2( frame, 7.0 ) );
    // riscos verticais e poeira
    for ( int i = 0; i < 3; i++ ) {
      float fi = float( i );
      float xs = hash( vec2( frame, fi * 13.0 ) );
      float on = step( 0.55, hash( vec2( frame, fi + 40.0 ) ) );
      sep *= 1.0 - on * 0.6 * smoothstep( 0.0012, 0.0, abs( uv.x - xs ) );
    }
    float dust = step( 0.9993, hash( floor( uv * uRes / 3.0 ) + frame * 1.37 ) );
    sep = mix( sep, vec3( 0.05 ), dust );
    vec2 q = uv - 0.5;
    sep *= 1.0 - dot( q, q ) * 1.6;
    col = mix( col, sep, S );
    grainAmt += 0.07 * S;
  }
#elif FILTER == 3
  {
    float l = luma( col );
    l = smoothstep( 0.04, 0.9, l );
    l = l * l * ( 3.0 - 2.0 * l );
    col = mix( col, vec3( l ), S );
    grainAmt += 0.05 * S;
  }
#elif FILTER == 4
  {
    vec3 h = hdrAt( uv ) * 2.6;
    float l = luma( aces( h ) );
    l = pow( l, 0.8 );
    vec3 g = vec3( 0.12, 1.0, 0.25 ) * l + vec3( 0.0, 0.03, 0.0 );
    g += ( hash( uv * uRes + frame ) - 0.5 ) * 0.22;
    g *= 0.92 + 0.08 * sin( gl_FragCoord.y * 1.5 );
    vec2 q = ( uv - 0.5 ) * vec2( uRes.x / uRes.y, 1.0 );
    g *= smoothstep( 0.95, 0.55, length( q ) );
    col = mix( col, g, S );
  }
#elif FILTER == 5
  {
    vec3 c = col * 1.15;
    float sl = 0.65 + 0.35 * pow( sin( uv.y * uRes.y * 0.5 * 3.14159 ), 2.0 );
    float m = mod( gl_FragCoord.x, 3.0 );
    vec3 mask = m < 1.0 ? vec3( 1.0, 0.7, 0.7 ) : m < 2.0 ? vec3( 0.7, 1.0, 0.7 ) : vec3( 0.7, 0.7, 1.0 );
    c *= sl * mask * 1.25;
    vec2 q = uv - 0.5;
    c *= smoothstep( 0.5, 0.42, max( abs( q.x ), abs( q.y ) ) * 1.0 );
    c += texture2D( tBloom, uv ).rgb * 0.05;
    col = mix( col, c, S );
  }
#elif FILTER == 6
  {
    vec3 glow = toneMap( texture2D( tBloom, uv ).rgb * 3.0 + texture2D( tScene, uv ).rgb * 0.6 );
    vec3 c = max( col, glow * 0.9 );
    c = mix( c, vec3( 1.0 ), 0.1 );
    c *= vec3( 1.05, 0.95, 1.08 );
    float l = luma( c );
    c = mix( vec3( l ), c, 1.25 );
    c = c * 0.88 + vec3( 0.1, 0.06, 0.12 );
    vec2 q = uv - 0.5;
    c = mix( c, glow + vec3( 0.12, 0.08, 0.15 ), smoothstep( 0.2, 0.75, length( q ) ) * 0.35 );
    col = mix( col, c, S );
  }
#elif FILTER == 7
  {
    vec3 c = col;
    float tb = floor( t * 9.0 );
    float bandG = step( 0.94, hash( vec2( floor( uv.y * 30.0 ), tb ) ) );
    c = mix( c, 1.0 - c.gbr, bandG * 0.8 );
    float sq = step( 0.993, hash( floor( uv * vec2( 40.0, 22.0 ) ) + tb ) );
    c = mix( c, vec3( hash( vec2( tb, 2.0 ) ), hash( vec2( tb, 3.0 ) ), hash( vec2( tb, 4.0 ) ) ), sq );
    c = floor( c * 24.0 ) / 24.0;
    col = mix( col, c, S );
  }
#elif FILTER == 8
  {
    vec3 h = hdrAt( uv ) + texture2D( tBloom, uv ).rgb * 1.5;
    float l = clamp( log2( 1.0 + luma( h ) * 6.0 ) / 4.0, 0.0, 1.0 );
    l += ( vnoise( uv * 40.0 + t ) - 0.5 ) * 0.04;
    vec3 c = mix( vec3( 0.02, 0.0, 0.12 ), vec3( 0.45, 0.0, 0.6 ), smoothstep( 0.0, 0.3, l ) );
    c = mix( c, vec3( 0.95, 0.15, 0.1 ), smoothstep( 0.25, 0.55, l ) );
    c = mix( c, vec3( 1.0, 0.85, 0.1 ), smoothstep( 0.5, 0.8, l ) );
    c = mix( c, vec3( 1.0 ), smoothstep( 0.8, 1.0, l ) );
    col = mix( col, c, S );
  }
#elif FILTER == 9
  {
    vec2 px = 1.0 / uRes;
    vec3 bl = ( colorAt( uv + vec2( px.x, 0.0 ) ) + colorAt( uv - vec2( px.x, 0.0 ) ) + colorAt( uv + vec2( 0.0, px.y ) ) + colorAt( uv - vec2( 0.0, px.y ) ) ) * 0.25;
    vec3 c = col + ( col - bl ) * 1.6;
    c *= vec3( 1.08, 1.0, 0.86 );
    float l = luma( c );
    c = mix( vec3( l ), c, 1.25 );
    vec3 cn = vec3( hash( uv * uRes + frame ), hash( uv * uRes + frame + 3.1 ), hash( uv * uRes + frame + 7.7 ) ) - 0.5;
    c += cn * 0.08 * ( 1.0 - l );
    c = min( c, vec3( 0.97 ) );
    col = mix( col, c, S );
  }
#elif FILTER == 10
  {
    float l = luma( col );
    vec3 c = vec3( l ) * vec3( 0.9, 1.0, 0.92 );
    c = ( c - 0.5 ) * 1.2 + 0.5;
    c += ( hash( uv * uRes * 0.5 + frame ) - 0.5 ) * 0.14;
    c *= 0.85 + 0.15 * step( 0.5, fract( gl_FragCoord.y * 0.25 ) );
    c *= 0.97 + 0.03 * sin( t * 50.0 );
    col = mix( col, c, S );
  }
#endif
  if ( outside ) col = vec3( 0.0 );

  // ---- efeitos de sanidade: dessaturação e escurecimento pulsante
  float l0 = luma( col );
  col = mix( col, vec3( l0 ), ins * 0.55 );
  vec2 q = vUv - 0.5;
  float r2 = dot( q, q );
  col *= 1.0 - r2 * ( uVignette * 1.6 + ins * 1.8 + uPulse * ins * 2.0 );
  col = mix( col, vec3( 0.35, 0.0, 0.0 ), smoothstep( 0.1, 0.5, length( q ) ) * uDamage * 0.7 );

  // ---- granulação (mais forte nos tons médios)
  float gn = hash( vUv * uRes + fract( t * 7.13 ) * 100.0 ) - 0.5;
  col += gn * grainAmt * ( 0.5 + l0 * ( 1.0 - l0 ) * 2.0 );

  col = mix( col, vec3( 1.0 ), uFlash );
  col = mix( col, uFadeColor, uFade );
  gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
}
`;

function fsQuad(mat) {
  const scene = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false;
  scene.add(m);
  return scene;
}

function rt(w, h, type, samples = 0, depth = false) {
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    format: THREE.RGBAFormat,
    depthBuffer: depth,
    stencilBuffer: false,
    samples,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
}

export class Post {
  constructor(renderer, Q) {
    this.r = renderer;
    this.Q = Q;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const ext = renderer.extensions;
    const canHalf = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    this.type = canHalf && Q.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdr = this.type === THREE.HalfFloatType;
    this.sceneRT = rt(4, 4, this.type, Q.msaa, true);
    this.levels = Q.bloomLevels;
    this.down = [];
    this.up = [];
    for (let i = 0; i < this.levels; i++) {
      this.down.push(rt(4, 4, this.type));
      this.up.push(rt(4, 4, this.type));
    }
    const mk = (frag, uniforms) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.preMat = mk(PREFILTER, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: this.hdr ? 1.0 : 0.8 },
      uKnee: { value: 0.5 },
    });
    this.downMat = mk(DOWN, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mk(UP, {
      tLow: { value: null },
      tCur: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uCurW: { value: 1 },
    });
    this.u = {
      tScene: { value: this.sceneRT.texture },
      tBloom: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBloom: { value: 0.12 },
      uExposure: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uLift: { value: new THREE.Color(0, 0, 0) },
      uVignette: { value: 0.5 },
      uGrain: { value: 0.5 },
      uStrength: { value: 1 },
      uInsane: { value: 0 },
      uPulse: { value: 0 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uFlash: { value: 0 },
      uGlitch: { value: 0 },
      uDamage: { value: 0 },
      uBlur: { value: 0 },
      uMotion: { value: new THREE.Vector2() },
      uEdgeBlur: { value: 0 },
    };
    this.compMat = mk(COMPOSITE, this.u);
    this.compMat.defines = { FILTER: 0 };
    this.preScene = fsQuad(this.preMat);
    this.downScene = fsQuad(this.downMat);
    this.upScene = fsQuad(this.upMat);
    this.compScene = fsQuad(this.compMat);
    this.filterIndex = 0;
  }

  setFilter(id) {
    const i = Math.max(
      0,
      FILTERS.findIndex((f) => f.id === id),
    );
    this.filterIndex = i;
    this.compMat.defines.FILTER = i;
    this.compMat.needsUpdate = true;
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    this.width = w;
    this.height = h;
    this.sceneRT.setSize(w, h);
    let bw = w >> this.Q.bloomStart;
    let bh = h >> this.Q.bloomStart;
    for (let i = 0; i < this.levels; i++) {
      bw = Math.max(2, bw);
      bh = Math.max(2, bh);
      this.down[i].setSize(bw, bh);
      this.up[i].setSize(bw, bh);
      bw >>= 1;
      bh >>= 1;
    }
    this.u.uRes.value.set(w, h);
  }

  pass(scene, target) {
    this.r.setRenderTarget(target);
    this.r.render(scene, this.cam);
  }

  render(scene, camera, drawScene = true) {
    const r = this.r;
    if (drawScene) {
      r.setRenderTarget(this.sceneRT);
      r.clear();
      r.render(scene, camera);
    }
    // bloom: limiar → cadeia de redução → cadeia de ampliação
    const n = this.levels;
    this.preMat.uniforms.tInput.value = this.sceneRT.texture;
    this.preMat.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
    this.pass(this.preScene, this.down[0]);
    for (let i = 1; i < n; i++) {
      this.downMat.uniforms.tInput.value = this.down[i - 1].texture;
      this.downMat.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.pass(this.downScene, this.down[i]);
    }
    let low = this.down[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      this.upMat.uniforms.tLow.value = low.texture;
      this.upMat.uniforms.tCur.value = this.down[i].texture;
      this.upMat.uniforms.uTexel.value.set(1 / low.width, 1 / low.height);
      this.pass(this.upScene, this.up[i]);
      low = this.up[i];
    }
    this.u.tBloom.value = n > 1 ? this.up[0].texture : this.down[0].texture;
    this.pass(this.compScene, null);
  }

  dispose() {
    this.sceneRT.dispose();
    for (const t of [...this.down, ...this.up]) t.dispose();
    for (const m of [this.preMat, this.downMat, this.upMat, this.compMat]) m.dispose();
  }
}
