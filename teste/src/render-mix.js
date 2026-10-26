// Light mixing of precomputed Cycles renders (front B6). Light adds linearly, so any time of day / season / set of
// lamps is a weighted SUM of layers rendered once offline:
//   L = gCeu * ceu + gSol * (sol[h] * (1-f) + sol[h+1] * f) + sum(lamp_k on) * lamp_k
// Layers are webp with v = (x / escala)^(1/gama) (manifest), decoded to linear in the shader, summed, white-balanced,
// exposed and tone mapped (Khronos PBR Neutral, same as the B4 interior). Gains = clear-sky illuminance models
// (ESTIMATIVA): direct beam (Meinel) and diffuse horizontal; lamps at their physical power (lm / 683).
// Same API words as src/interior.js (B4): definirHora(minutos) · definirEstacao(estacao) · definirLuz(nome, ligada).
import * as THREE from 'three';
import { solNoInstante, mesmaFace, chaveUnidade } from './interior-sol.js';
import { capacidade } from './capacidade.js';

// 15/10 FILA C8: the lamps (only fixtures seen in the clips), their order and the pouf tuning come from the tour manifest
// ("cena" block), passed by tour360.js - nothing of the apartment is written here
export const ROTULO = 'Imagem ilustrativa fiel ao apartamento — render a partir de fotos e medidas';
const LUX_W = 683, EFICACIA_SOL = 105;

export function dniLux(el) {
  if (el <= 0.5) return 0;
  const am = 1 / Math.max(Math.sin((el * Math.PI) / 180), 0.02);
  return 1353 * 0.7 ** (am ** 0.678) * EFICACIA_SOL;
}
export function dhiLux(el) {
  if (el <= -6) return 3;
  if (el <= 0) return 3 + ((el + 6) / 6) * 400;
  return 400 + 16000 * Math.sin((el * Math.PI) / 180) ** 0.6;
}
const mix3 = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
// sky / sun colour by elevation (sunset warmer, night blue) — artistic estimate, documented in RELATORIO-B6
function corCeu(el) { return el > 10 ? [1, 1, 1] : el > -2 ? mix3([1.05, 0.9, 0.85], [1, 1, 1], (el + 2) / 12) : [0.35, 0.45, 0.9]; }
function corSol(el) { return el > 20 ? [1, 0.97, 0.92] : mix3([1, 0.62, 0.36], [1, 0.97, 0.92], Math.max(0, el) / 20); }

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D t[7];
uniform vec3 g[7];
uniform float esc[7];
uniform float gama;
uniform float ombro;
// 08/10 (Victor: odd blue cast around the abajur): lamp layers clipped their brightest 1% at the top code (red stopped,
// green/blue went on -> white -> blue after the warm night balance). Layers with a 'joelho' (knee) keep the old
// encoding below it and store the highlights above it logarithmically up to ymax x escala. joelho 0 = old encoding.
uniform float joelho[7];
uniform float joelho2[7];
uniform float gamaL[7];
uniform float y2[7];
uniform float ymax[7];
// 08/10 13h 12-bit lamp layers (Victor: rings at night with the lamps, 'de uma vez por todas'): <lamp>.webp = top 8 bits,
// <lamp>-lo.webp = low 4 bits x 17 (recodifica_luzes_12bits.py); v = hi*4080/4095 + lo*15/4095 is linear in both textures,
// so bilinear filtering stays exact. loIdx[i] = which tL holds layer i's low bits (-1 = none). COM_LO needs 16 texture units.
uniform float loIdx[7];
// 22/10 ITEM 12: semRefl = 1 when the visitor switched the glass reflection OFF: the lamp layers (ehLuz) do not count inside the
// window mask (tFora red): there they are the room reflected in the glass, baked in the render (porta-varanda at night)
uniform float semRefl;
uniform float ehLuz[7];
#ifdef COM_LO
uniform sampler2D tL0; uniform sampler2D tL1; uniform sampler2D tL2;
#endif
// lit walls between joelho and joelho2 (log up to y2), the lamps themselves above joelho2 (log from y2 up to ymax)
vec3 decod(vec3 v, float kn, float kn2, float yb, float ym, float gL){
  v = max(v, vec3(0.0)); // 16/10 CEU-PRETO: pow() of a negative code is NaN on ANGLE/D3D (black pixel) - never feed it one
  if (kn <= 0.0) return pow(v, vec3(gama));
  vec3 baixo = pow(min(v / kn, 1.0), vec3(gL)); // per-layer gamma (lamps 3.0: more codes for dark surfaces)
  vec3 meio = exp(clamp(v - kn, 0.0, kn2 - kn) / (kn2 - kn) * log(yb));
  vec3 alto = yb * exp(max(v - kn2, 0.0) / (1.0 - kn2) * log(ym / yb));
  return mix(mix(baixo, meio, step(kn, v)), alto, step(kn2, v));
}
uniform vec3 wb;
uniform float expo;
// 08/10 deband (Victor: rings / patches on smooth walls in daylight): the daylight layers (sky, sun) are 8-bit lossy webp with
// no dither and no float source left. Where 4 samples around a texel (random angle, ~dbR texels) all sit within dbT codes of
// it, the area is smooth: use their mean (+ sub-code grain) so the 8-bit steps dissolve; real edges stay untouched.
uniform float dbR;
uniform float dbT;
float hDb(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 deband(sampler2D tx, vec2 uv, vec3 c){
  float a = hDb(uv * 4096.0) * 6.2831853, r = dbR * (0.5 + 0.5 * hDb(uv * 2048.0 + 7.1));
  vec2 o = vec2(cos(a), sin(a)) * r, p = vec2(-o.y, o.x);
  vec3 s1 = texture2D(tx, uv + o).rgb, s2 = texture2D(tx, uv - o).rgb, s3 = texture2D(tx, uv + p).rgb, s4 = texture2D(tx, uv - p).rgb;
  vec3 d = max(max(abs(s1 - c), abs(s2 - c)), max(abs(s3 - c), abs(s4 - c)));
  // 16/10 CEU-PRETO (varanda by day: sky black with rows of dots): the +-0.5-code grain made pure-black texels (the sky of
  // the solind layers is 0) NEGATIVE for half the pixels -> pow(<0) = NaN in decod -> the whole sum went black. Clamp at 0.
  vec3 m = max((c + s1 + s2 + s3 + s4) * 0.2 + (hDb(uv * 3071.0 + 3.3) - 0.5) / 255.0, vec3(0.0));
  return mix(m, c, step(dbT, max(d.r, max(d.g, d.b))));
}
// 08/10 local adaptation (Victor: noon highlights blown at the entrance; room too dark seen from the balcony door): a blurred
// log-luminance map of this panorama (tLoc: r = log2 lum, g = room coverage) pulls each area toward the panorama's mean
// key (lG), by sLoc stops per stop, at most +-1.5 stops; the window keeps its own exposure. modoLum = write that map.
uniform float modoLum;
uniform sampler2D tLoc;
uniform float sLoc;
uniform float lG;
uniform sampler2D tFora;
uniform float usaFora;
uniform float pufeGanho;
uniform vec3 pufeAlb;
uniform float pufeAmb;
uniform vec3 corLuz;
uniform float ambSala;
uniform float pufeNoite;
uniform vec3 pufeCor;
uniform float pufeLumP;
uniform float fatorFora;
uniform float srgb;
uniform float veuFora;
uniform vec3 veuTopo;
uniform vec3 veuHoriz;
// v4 gradual sun: per-pixel first/last lit half-minute (t_in, t_out) packed in RGB as 12+12 bits
uniform sampler2D tAlb;
uniform sampler2D tNor;
uniform sampler2D tVis;
uniform sampler2D tVis2;
uniform float nInt;
uniform float usaVis;
uniform vec3 gDir;
uniform vec3 solDir;
uniform float meioMin;
uniform vec2 visTam;
float acesaT(sampler2D tx, vec2 uv){
  vec3 c = floor(texture2D(tx, uv).rgb * 255.0 + 0.5);
  float a = c.r * 16.0 + floor(c.g / 16.0);
  float b = mod(c.g, 16.0) * 256.0 + c.b;
  if (a + b < 0.5) return 0.0;
  return clamp((meioMin - a) / 4.0 + 0.5, 0.0, 1.0) * clamp((b - meioMin) / 4.0 + 0.5, 0.0, 1.0);
}
// uv in single-interval space; stacked files: top half (v in 0.5..1 after flipY) = even interval, bottom = odd
float acesa(vec2 uv){
  if (nInt < 0.5) return acesaT(tVis, uv);
  float v = acesaT(tVis, vec2(uv.x, 0.5 + uv.y * 0.5));
  if (nInt > 1.5) v += acesaT(tVis, vec2(uv.x, uv.y * 0.5));
  if (nInt > 2.5) v += acesaT(tVis2, vec2(uv.x, 0.5 + uv.y * 0.5));
  if (nInt > 3.5) v += acesaT(tVis2, vec2(uv.x, uv.y * 0.5));
  return min(v, 1.0);
}
// 21/10 SOL-FLUIDO: acesa() of every texel is computed ONCE per paint in a prepass (tAc, same texel grid as solvis); the
// smoothing kernel below reads that value instead of decoding up to 4 interval textures per tap (25 taps x 4 = 100 decodes
// per pixel on PC). Same numbers at the same texel centres. Compile-time switch (USA_AC, WebGL2 = prepass target available):
// with it the main program never reads tVis/tVis2, so the sampler count stays at 16 (lamp layers 12-bit use all 16; a runtime
// switch kept both and the program failed: 'texture image units count exceeds 16', first local test 21/10).
#ifdef USA_AC
uniform sampler2D tAc;
float av(vec2 q){ return texture2D(tAc, q).r; }
#else
float av(vec2 q){ return acesa(q); }
#endif
uniform float raioVis;
uniform float pesoN;
// partial sun (rug fibres, fabric, sheer curtain, penumbra) is stored as a dither of lit / unlit texels: average the
// neighbours of the SAME surface (normal agreement) so it shows as the partial light it is, not as grain
// 15/10 FILA D9 (C defect 9, reproduced: jagged edge + dots on the rug, PC 14:00): the weights now depend on the distance
// from the PIXEL (not from the texel centre) with a smooth kernel that reaches 0 at the edge of the window (raioVis + 0.5
// texels), so the sun patch is a continuous, smooth edge when magnified instead of square steps; same texel reads as before.
float visSol(vec2 uv){
  vec2 d = 1.0 / visTam; vec2 t = uv * visTam; vec2 c0 = (floor(t) + 0.5) * d; vec2 fr = t - (floor(t) + 0.5);
  vec3 n0 = texture2D(tNor, uv).rgb * 2.0 - 1.0;
  float sup2 = (raioVis + 0.5) * (raioVis + 0.5);
  float s = 0.0, w = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    if (float(i * i) > raioVis * raioVis || float(j * j) > raioVis * raioVis) continue;
    vec2 o = vec2(float(i), float(j)) - fr;
    float k = max(0.0, 1.0 - dot(o, o) / sup2); k *= k;
    if (k <= 0.0) continue;
    vec2 q = c0 + vec2(float(i), float(j)) * d;
    vec3 n = texture2D(tNor, q).rgb * 2.0 - 1.0;
    float wq = mix(1.0, smoothstep(0.35, 0.8, dot(n, n0)), pesoN) * k; // fabric/rug bump normals still count as the same surface
    s += av(q) * wq; w += wq;
  }
  return w > 1e-4 ? s / w : av(c0);
}
vec3 neutral(vec3 c){
  const float start = 0.76; const float desat = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < start) return c;
  float d = 1.0 - start;
  float np = 1.0 - d * d / (peak + d - start);
  c *= np / peak;
  float gg = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(c, np * vec3(1.0), gg);
}
void main(){
  vec3 s = vec3(0.0);
  float foR = semRefl > 0.5 && usaFora > 0.5 ? texture2D(tFora, vUv).r : 0.0; // ITEM 12
  ${[0, 1, 2, 3, 4, 5, 6].map((i) => `if (g[${i}].r + g[${i}].g + g[${i}].b > 0.0) { vec3 c${i} = texture2D(t[${i}], vUv).rgb; if (joelho[${i}] <= 0.0 && dbT > 0.0) c${i} = deband(t[${i}], vUv, c${i});\n#ifdef COM_LO\n  if (loIdx[${i}] > -0.5) { vec3 lo${i} = loIdx[${i}] < 0.5 ? texture2D(tL0, vUv).rgb : (loIdx[${i}] < 1.5 ? texture2D(tL1, vUv).rgb : texture2D(tL2, vUv).rgb); c${i} = c${i} * (4080.0 / 4095.0) + lo${i} * (15.0 / 4095.0); }\n#endif\n  s += g[${i}] * esc[${i}] * decod(c${i}, joelho[${i}], joelho2[${i}], y2[${i}], ymax[${i}], gamaL[${i}]) * (1.0 - ehLuz[${i}] * foR); }`).join('\n  ')}
  if (usaVis > 0.5) {
    vec3 alb = pow(texture2D(tAlb, vUv).rgb, vec3(2.2));
    vec3 n = normalize(texture2D(tNor, vUv).rgb * 2.0 - 1.0);
    s += gDir * alb * max(dot(n, solDir), 0.0) * visSol(vUv);
  }
  vec3 x = s * wb * expo;
  vec2 foP = usaFora > 0.5 ? texture2D(tFora, vUv).rg : vec2(0.0);
  float fo = foP.x;
  // 13/10 Victor (R4: "o pufe e um bloco preto, nao da para distinguir a forma"): the pouf pixels (fora.webp GREEN) are given
  // a lighter navy velvet: its own rendered shading (desaturated, x pufeGanho) + the room's ambient light (mean room
  // luminance ambSala, colour corLuz; the blurred local map was ruled by the black night window) x the lighter albedo pufeAlb
  // 26/10 Victor ('a cor desse puff ta ridicula'): manifest cena.pufe.cor set = the pouf is re-coloured to that albedo (warm
  // off-white boucle). The render lit it as E x albedo with a very dark navy albedo (luminance pufeLumP): E = lum(x) / pufeLumP,
  // new colour = pufeCor x E in the colour of the room light. G = the pouf's share of the texel (soft edge, no dark outline).
  if (foP.y > 0.0 && modoLum < 0.5 && pufeCor.r > 0.0) {
    // edge texels: a = pouf coverage (G), r = albedo of what is behind the edge / the pouf's (B, log scale); D = a + (1-a) r
    float a = foP.y, r = a < 0.999 ? exp(texture2D(tFora, vUv).b * 6.9078) : 1.0, D = a + (1.0 - a) * r;
    float lp = dot(x, vec3(0.2126, 0.7152, 0.0722));
    vec3 xp = pufeCor * corLuz * (lp / (pufeLumP * D)); // the pouf in the new colour under this texel's light
    // knee from 1.5 x the room's mean light (0.08..0.45): behind the balcony glass the panel also carries the glass's
    // reflection, and x 100+ turned it into a white band on the pouf's front at night (varanda, 21:00); edge texels stop AT the
    // knee (a dark leg or shadow behind the edge gives a small r and a too-bright E: light specks on the outline)
    // at night (pufeNoite > 1; ambSala >= ALVO there) the cap is 0.16
    float ks = clamp(1.5 * ambSala, 0.08, mix(0.45, 0.16, clamp((pufeNoite - 1.0) / 0.6, 0.0, 1.0))), lq = dot(xp, vec3(0.2126, 0.7152, 0.0722));
    if (lq > ks) xp *= (a < 0.999 ? ks : ks + 0.25 * ks * (lq - ks) / (lq - ks + 0.25 * ks)) / lq;
    x = x * ((1.0 - a) * r / D) + xp * a;
  } else if (foP.y > 0.0 && modoLum < 0.5) {
    float lp = dot(x, vec3(0.2126, 0.7152, 0.0722));
    vec3 sh = mix(vec3(lp), x, 0.5) * pufeGanho; // its own shading, as if the albedo were ~pufeGanho x lighter (less violet)
    sh /= 1.0 + dot(sh, vec3(0.2126, 0.7152, 0.0722)) / 0.12; // soft cap: the lit lower front seen from the balcony went white
    vec3 xp = sh + pufeAlb * corLuz * ambSala * expo * pufeAmb * pufeNoite;
    x = mix(x, xp, foP.y);
  }
  if (modoLum > 0.5) { float l0 = max(dot(x, vec3(0.2126, 0.7152, 0.0722)), 1e-6); float v = clamp((log2(l0) + 16.0) / 20.0, 0.0, 1.0) * 255.0; gl_FragColor = vec4(floor(v) / 255.0, 1.0 - fo, fract(v), 1.0); return; } // 08/10: 16 bits (R hi + B lo) - 8 bits made rings on smooth walls
  if (usaFora > 0.5) x *= mix(1.0, fatorFora, fo); // v4: window exposed on its own
  if (sLoc > 0.0) { vec4 q = texture2D(tLoc, vUv); float r = exp2(clamp((lG - ((q.r + q.b / 255.0) * 20.0 - 16.0)) * sLoc, -1.5, 1.5)); x *= mix(1.0, r, smoothstep(0.05, 0.3, q.g) * (1.0 - fo)); }
  float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
  x *= (1.0 + 1.0 / ombro) / (1.0 + l / ombro);   // soft highlight roll-off; 08/10 Victor: white bed blown in daylight -> stronger shoulder (1.1)
  vec3 o = neutral(x);
  if (veuFora > 0.5 && fo > 0.0) o = mix(o, mix(veuHoriz, veuTopo, smoothstep(0.5, 0.78, vUv.y)), fo); // 21/10 SACADA-GOOGLE-JA
  // (B1) 8-bit target (no float RT on this GPU): store sRGB-encoded values so the darks do not band
  if (srgb > 0.5) o = mix(o * 12.92, 1.055 * pow(max(o, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, o));
  gl_FragColor = vec4(o, 1.0);
}`;

// (B1, Victor's Android 07/10: blocky + banded) decode at full size (createImageBitmap WITHOUT the resize options,
// which some browsers ignore or do badly; fallback <img>.decode()); if the layer is wider than `max`, downscale on a
// canvas with high-quality smoothing; mipmaps on (trilinear minification). INFO is shown by ?debug360=1.
export const INFO = { tamanhos: new Set(), decodificador: null };
async function carregaTextura(url, max, dados = false, manterImagem = false, inteira = false) {
  if (inteira) max = 0; // lamp layers (knee encoding + dither): an 8-bit canvas resize would re-quantize them into bands
  const blob = await (await fetch(url)).blob();
  let img = null, flipY = false;
  if (dados && max && max < 4096) { // (v4 data files are 4096 wide: only lighter tiers decode twice)
    // v4 packed data on a lighter device (src/capacidade.js): NEAREST downscale only ('pixelated' never blends two packed
    // values, so every pixel still decodes to a valid first/last lit minute, at half the spatial resolution)
    try {
      const ini = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const k = ini.width > max ? max / ini.width : 1, w = Math.round(ini.width * k), h = Math.round(ini.height * k); if (ini.close) ini.close();
      img = await createImageBitmap(blob, { imageOrientation: 'flipY', colorSpaceConversion: 'none', premultiplyAlpha: 'none', resizeWidth: w, resizeHeight: h, resizeQuality: 'pixelated' });
      INFO.decodificador = 'createImageBitmap';
    } catch (e) { img = null; }
  }
  if (dados) max = 0; // never the smooth canvas resample below
  try { if (!img) { img = await createImageBitmap(blob, { imageOrientation: 'flipY', colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); INFO.decodificador = 'createImageBitmap'; } }
  catch (e) {
    const el = new Image(); el.src = URL.createObjectURL(blob);
    await el.decode(); img = el; flipY = true; INFO.decodificador = 'img.decode';
  }
  let fonte = img;
  if (max && img.width > max) {
    const c = document.createElement('canvas'); c.width = max; c.height = max / 2;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (flipY) { g.translate(0, c.height); g.scale(1, -1); flipY = false; } // keep the same orientation as the bitmap path
    g.drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    fonte = c;
  }
  INFO.tamanhos.add(`${fonte.width}x${fonte.height}`);
  const tx = new THREE.Texture(fonte);
  // 08/10 (Victor's M21s blurry: it fell to 2048 when the GPU ran out of memory): the mix samples each layer 1:1 into its
  // render target, so layer mipmaps (+33% GPU memory each) are never read; only the window mask (sampled on screen) keeps them
  tx.flipY = flipY; tx.colorSpace = THREE.NoColorSpace; tx.generateMipmaps = !!manterImagem;
  tx.minFilter = manterImagem ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; tx.magFilter = THREE.LinearFilter; tx.anisotropy = manterImagem ? 4 : 1; tx.needsUpdate = true;
  if (dados) { tx.generateMipmaps = false; tx.minFilter = tx.magFilter = THREE.NearestFilter; tx.anisotropy = 1; }
  // size kept for the shader (visTam); the CPU copy is dropped once the texture is on the GPU (it was kept twice: 13 layers
  // of 4096 in the 360 = hundreds of MB of RAM on the phone). The window mask keeps its image (read on the CPU by the
  // Google layer); a texture evicted from the LRU is fetched again (HTTP cache).
  tx.userData.w = fonte.width; tx.userData.h = fonte.height;
  if (!manterImagem) tx.onUpdate = () => { const im = tx.image; if (im && im.width) { tx.image = { width: im.width, height: im.height }; if (typeof im.close === 'function') im.close(); } tx.onUpdate = null; };
  return tx;
}
// v4: mean of the direct-sun term at a time of day, linear between the 15-min frames ({"HH:MM": [r,g,b]})
function mediaVis(tab, minutos) {
  if (!tab) return null;
  const ks = Object.keys(tab).map((k) => [+k.slice(0, 2) * 60 + +k.slice(3, 5), tab[k]]).sort((x, y) => x[0] - y[0]);
  if (!ks.length) return null;
  if (minutos <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (minutos <= ks[i][0]) { const f = (minutos - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]); return ks[i - 1][1].map((x, j) => x + (ks[i][1][j] - x) * f); }
  return ks[ks.length - 1][1];
}
const PRETO = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); PRETO.needsUpdate = true;
// 21/10 SACADA-GOOGLE-JA (Victor: 'a nossa cidade 3d aparece na vista interna da sacada (...) quando mexo o mouse aparece o 3D do
// google, isso e feio'): while Google's city is expected in the window (tour360 sets VEU.fora = 1; 0 with ?google3d=0 or after a
// Google failure) the 'fora' pixels of EVERY panorama show the sky / haze of the hour instead of our render's city, also during the
// walk between points; Google's overlay then fades in over that haze. Our render's city only shows as the fallback.
// Shared uniform objects: one switch for all points. Sky colours = the formula of the Google overlay (ceuDoSol).
export const VEU = { fora: { value: 0 }, topo: { value: new THREE.Vector3(0.12, 0.27, 0.6) }, horiz: { value: new THREE.Vector3(0.55, 0.66, 0.8) } };
const smooth_ = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// sky colours (linear) for the window by sun elevation: day blue, warm horizon around sunrise/sunset, dark night
// SAME numbers as google-vista.js ceuParaSol (the overlay's sky): kept as a copy on purpose - google-vista.js does not import
// render-mix.js, so a browser holding a cached old copy of one module never breaks the other; change both together
export function ceuDoSol(el) {
  const e = Number.isFinite(el) ? el : -20;
  const dia = smooth_(-2, 10, e), crep = smooth_(-8, 0, e) * (1 - smooth_(4, 14, e));
  const L = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  let topo = L([0.008, 0.012, 0.03], [0.12, 0.27, 0.6], dia), horiz = L([0.02, 0.025, 0.05], [0.55, 0.66, 0.8], dia);
  topo = L(topo, [0.16, 0.2, 0.42], crep * 0.5); horiz = L(horiz, [0.85, 0.6, 0.42], crep * 0.45);
  return { topo, horiz };
}

// One panorama point: owns its layer textures and a render target with the mixed (linear, tone-mapped) result.
// 21/10 SOL-FLUIDO prepass: per-texel lit fraction of the v4 sun (acesa) into a 1-channel target the size of the solvis grid.
// One target per renderer (a paint uses it at once, then the next paint overwrites it): no extra memory per tour point.
const FRAG_AC = `precision highp float;
varying vec2 vUv;
uniform sampler2D tVis;
uniform sampler2D tVis2;
uniform float nInt;
uniform float meioMin;
`
  + FRAG.slice(FRAG.indexOf('float acesaT('), FRAG.indexOf('// 21/10 SOL-FLUIDO: acesa()'))
  + 'void main(){ gl_FragColor = vec4(acesa(vUv), 0.0, 0.0, 1.0); }';
const AC = new WeakMap();
function prepassoAcesa(r, U) {
  let a = AC.get(r);
  if (!a) {
    const gl = r.getContext(), f16 = r.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_AC, depthTest: false, depthWrite: false,
      uniforms: { tVis: { value: PRETO }, tVis2: { value: PRETO }, nInt: { value: 0 }, meioMin: { value: 0 } } });
    const cena = new THREE.Scene(); cena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    a = { mat, cena, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rt: null, tipo: f16 ? THREE.HalfFloatType : THREE.UnsignedByteType, ok: r.capabilities.isWebGL2 };
    AC.set(r, a);
  }
  if (!a.ok) return null; // WebGL1: no single-channel render target -> old path
  const w = Math.round(U.visTam.value.x), h = Math.round(U.visTam.value.y);
  if (!a.rt || a.rt.width !== w || a.rt.height !== h) {
    if (a.rt) a.rt.dispose();
    a.rt = new THREE.WebGLRenderTarget(w, h, { type: a.tipo, format: THREE.RedFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }
  const V = a.mat.uniforms; V.tVis.value = U.tVis.value; V.tVis2.value = U.tVis2.value; V.nInt.value = U.nInt.value; V.meioMin.value = U.meioMin.value;
  const ant = r.getRenderTarget(); r.setRenderTarget(a.rt); r.render(a.cena, a.cam); r.setRenderTarget(ant);
  return a.rt.texture;
}

export class MisturaPonto {
  constructor(renderer, ponto, base, { larguraMax = 4096, SOL, unidade = null, finalRender = null, luzes = [], pufe = {} } = {}) {
    this.luzesOrdem = luzes; // C8: manifest cena.luzes (order of the sum kept)
    this.r = renderer; this.p = ponto; this.base = base; this.max = larguraMax; this.SOL = SOL;
    this.unidade = unidade; this.finalRender = finalRender; // S2 (15/10): unit being shown + final of the rendered unit
    this.cache = new Map();
    const w = Math.min(larguraMax, ponto.largura || 4096);
    const gl = renderer.getContext();
    const half = renderer.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    this.rt = new THREE.WebGLRenderTarget(w, w / 2, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
    // (B1) with a float target keep linear; with an 8-bit target store sRGB (decoded by the sphere material).
    // 26/10 (Victor, phone: 'cama de dia vista da Entrada estourada'): three r186 is WebGL2-only and gives an 8-bit sRGB texture
    // the SRGB8_ALPHA8 format, so the GPU already encodes on write and decodes on read. The shader's own encode (srgb = 1) was
    // a SECOND encode: on GPUs without float targets the whole 360 came out washed (mid grey 123 -> 189, bed p99 247).
    // srgb stays 0; the sRGB storage that keeps the darks from banding is the hardware one.
    this.rt.texture.colorSpace = half ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    INFO.rtFloat = !!half; INFO.webgl = renderer.capabilities.isWebGL2 ? 2 : 1; INFO.maxTex = renderer.capabilities.maxTextureSize;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, defines: renderer.capabilities.isWebGL2 ? { USA_AC: '' } : {},
      uniforms: { t: { value: Array(7).fill(PRETO) }, g: { value: Array.from({ length: 7 }, () => new THREE.Vector3()) },
        esc: { value: Array(7).fill(1) }, gama: { value: 2.2 }, ombro: { value: +(new URLSearchParams(location.search).get('ombro')) || 1.1 }, joelho: { value: Array(7).fill(0) }, joelho2: { value: Array(7).fill(0.95) }, gamaL: { value: Array(7).fill(2.2) }, y2: { value: Array(7).fill(2) }, ymax: { value: Array(7).fill(4) }, wb: { value: new THREE.Vector3(1, 1, 1) }, expo: { value: 1 }, srgb: { value: 0 },
        tFora: { value: PRETO }, usaFora: { value: 0 }, pufeGanho: { value: +(new URLSearchParams(location.search).get('pufe')) || pufe.ganho || 0 }, pufeAmb: { value: Number.isFinite(parseFloat(new URLSearchParams(location.search).get('pufeA'))) ? parseFloat(new URLSearchParams(location.search).get('pufeA')) : (pufe.amb ?? 0) },
        pufeAlb: { value: new THREE.Vector3(...(pufe.albedo || [0, 0, 0])) }, corLuz: { value: new THREE.Vector3(1, 1, 1) }, ambSala: { value: 0 }, pufeNoite: { value: 1 }, pufeCor: { value: new THREE.Vector3(...(pufe.cor || [0, 0, 0])) }, pufeLumP: { value: +(new URLSearchParams(location.search).get('pufeL')) || pufe.lumAntigo || 1 }, /* pufeAlb = sRGB (46, 50, 64) linear */ fatorFora: { value: 1 }, modoLum: { value: 0 }, tLoc: { value: PRETO }, sLoc: { value: 0 }, lG: { value: 0 }, dbR: { value: 14 / w }, loIdx: { value: Array(7).fill(-1) }, semRefl: { value: 0 }, ehLuz: { value: Array(7).fill(0) }, tL0: { value: PRETO }, tL1: { value: PRETO }, tL2: { value: PRETO }, dbT: { value: (new URLSearchParams(location.search).get('deband') === '0' ? 0 : 3) / 255 },
        veuFora: VEU.fora, veuTopo: VEU.topo, veuHoriz: VEU.horiz, tAlb: { value: PRETO }, tNor: { value: PRETO }, tVis: { value: PRETO }, tVis2: { value: PRETO }, nInt: { value: 0 }, usaVis: { value: 0 }, gDir: { value: new THREE.Vector3() },
        solDir: { value: new THREE.Vector3(0, 0, 1) }, tAc: { value: PRETO }, meioMin: { value: 0 }, visTam: { value: new THREE.Vector2(1, 1) }, raioVis: { value: Number.isFinite(parseFloat(new URLSearchParams(location.search).get('visr'))) ? parseFloat(new URLSearchParams(location.search).get('visr')) : (capacidade().nivel === 'topo' ? 2 : 1) }, pesoN: { value: new URLSearchParams(location.search).get('visn') === '0' ? 0 : 1 } }, // ?visr=0 = old look, ?visn=0 = no normal weight (tests)
    });
    // 12-bit lamp layers need 3 more samplers (16 in all); smaller GPUs read the top 8 bits only
    this.comLo = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) >= 16 && new URLSearchParams(location.search).get('lo12') !== '0';
    if (this.comLo) { this.mat.defines = { ...(this.mat.defines || {}), COM_LO: '' }; this.mat.needsUpdate = true; }
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.cena = new THREE.Scene(); this.cena.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // local adaptation maps (see FRAG): 512x256 log-luminance -> 64x32 blur (+-20 deg gaussian, wraps around in longitude)
    const mapa = (w, h) => { const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
      t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; t.texture.wrapS = THREE.RepeatWrapping; t.texture.colorSpace = THREE.NoColorSpace; return t; };
    this.rtLum = mapa(512, 256); this.rtLoc = mapa(64, 32); this.bufLoc = new Uint8Array(64 * 32 * 4);
    this.matBorra = new THREE.ShaderMaterial({ vertexShader: VERT, depthTest: false, depthWrite: false, uniforms: { tL: { value: this.rtLum.texture } }, fragmentShader: `
precision highp float; varying vec2 vUv; uniform sampler2D tL;
void main(){
  float s = 0.0, w = 0.0, wt = 0.0;
  for (int j = -4; j <= 4; j++) for (int i = -4; i <= 4; i++) {
    float k = exp(-float(i * i + j * j) / 8.0);
    vec4 c = texture2D(tL, vUv + vec2(float(i) * 0.0139, float(j) * 0.0278));
    s += ((c.r + c.b / 255.0) * 20.0 - 16.0) * c.g * k; w += c.g * k; wt += k;
  }
  float v = clamp(w > 1e-3 ? (s / w + 16.0) / 20.0 : 0.5, 0.0, 1.0) * 255.0;
  gl_FragColor = vec4(floor(v) / 255.0, w / wt, fract(v), 1.0);
}` });
    this.cenaBorra = new THREE.Scene(); this.cenaBorra.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matBorra));
  }
  textura(rel, dados = false, inteira = false) {
    if (!rel) return Promise.resolve(null);
    if (!this.cache.has(rel)) this.cache.set(rel, carregaTextura(this.base + rel, this.max, dados, /(^|\/)fora[^/]*$/.test(rel), inteira));
    // (B1) LRU: keep at most 9 layers of this point in memory (ceu + 2 sun + 3 lights + 3 spare)
    const v = this.cache.get(rel); this.cache.delete(rel); this.cache.set(rel, v);
    while (this.cache.size > 16) { const [k, p] = this.cache.entries().next().value; if (this.emUso && this.emUso.has(k)) break; this.cache.delete(k); p.then((t) => t && t.dispose()); }
    return v;
  }
  // (B1) free the layer textures of a point the visitor left (GPU memory); the mixed render target stays
  // 21/10 MANCHAS-360: queued behind a paint in flight (it was freeing the layers of a paint that was still mixing them)
  soltarCamadas() { return this._naFila(() => { for (const p of this.cache.values()) p.then((t) => t && t.dispose()); this.cache.clear(); }); }
  // context restored: the old GL objects are gone with the old context (dispose() would delete objects of another context,
  // 'object does not belong to this context'); the layers are simply forgotten and fetched again (HTTP cache)
  esquecerCamadas() { return this._naFila(() => { this.cache.clear(); this._chaveLoc = null; }); }
  _naFila(fn) { const vez = (this._fila || Promise.resolve()).then(fn); this._fila = vez.catch(() => {}); return vez; }
  // 21/10 MANCHAS-360 (Victor: blue/pink/green stains in unit 131, 'varanda', 21h): ONE paint at a time per point, in call order.
  // Two paints of the same point used to interleave at their awaits (layers / exposure / scales of one with the gains of the
  // other) and an older state could land last. Each paint reads the state when it STARTS (after the previous one ended) and
  // writes what it used in `ultimo.estado` / `ultimo.veu`, so the caller can tell a stale picture from a current one.
  atualizar(estado) { return this._naFila(() => this._atualizar(estado)); }
  // the state a paint used, in the words the tour compares (season, minute, lamp set)
  static estadoDe(estado, luzes) { return { estacao: estado.estacao, minutos: estado.minutos, reflexo: estado.reflexo !== false, luzes: Object.fromEntries(luzes.map((k) => [k, !!(estado.luzes && estado.luzes[k])])) }; }
  // which layers + gains for a state; also returns the analytic mean (for exposure/white balance)
  // 15/10 S2 (audit S2-SOL-DENTRO): ONE render (unit 107, balcony to 343.4 deg) is shown for all 117 units. Direct sun
  // (solvis) and its bounce (solind) are kept only when (1) the unit's balcony faces the same way as the rendered one and
  // (2) the unit has sun on the balcony at that moment by dados/sol.json `cv` - the SAME source as the unit card - with a
  // 15-min ramp between frames. Otherwise only the sky and the lamps light the room (no GPU, no new render).
  fatorSolUnidade(estacao, minutos) {
    const u = this.unidade, S = this.SOL;
    if (!u || !S || !S.finais || u.final == null || this.finalRender == null) return 1;
    const mesma = mesmaFace(S, u, this.finalRender); // C3 (16/10): unit/final keys + face test in interior-sol.js
    if (mesma == null) return 1;
    if (!mesma) return 0; // another facade: this render has no sun for it
    return this.cvAgora(estacao, minutos);
  }
  // sun on THIS unit's balcony at that minute (sol.json cv, same as the card), ramped over the 15-min frames
  cvAgora(estacao, minutos) {
    const u = this.unidade, S = this.SOL;
    if (!u || !S) return 0;
    const ku = S.unidades ? chaveUnidade(S, u) : null; // "107" (Upper) or "<torre>-<numero>"
    const d = ku != null && S.unidades[ku] && S.unidades[ku].est && S.unidades[ku].est[estacao];
    const e = S.estacoes && S.estacoes[estacao];
    if (!d || !e || !d.cv) return 0;
    const passo = (S.meta && S.meta.passo_min) || 15;
    const [h, m] = e.inicio.split(':').map(Number);
    const x = (minutos - (h * 60 + m)) / passo - 0.5, k0 = Math.floor(x), w = x - k0;
    const v = (k) => (k >= 0 && k < d.cv.length && d.cv[k] === '1' ? 1 : 0);
    return v(k0) * (1 - w) + v(k0 + 1) * w;
  }
  outraFace() {
    const u = this.unidade, S = this.SOL;
    if (!u || !S || !S.finais || this.finalRender == null) return false;
    return mesmaFace(S, u, this.finalRender) === false;
  }
  plano({ estacao, minutos, luzes }) {
    const s = solNoInstante(this.SOL, estacao, minutos);
    const fSol = this.fatorSolUnidade(estacao, minutos); // S2
    const C = this.p.camadas;
    const el = Number.isFinite(s.el) ? s.el : -12; // 07/10: true elevation also below the horizon (twilight), not -12 until sunrise
    const cc = corCeu(el), cs = corSol(el);
    const lista = [];
    if (C.ceu) lista.push({ c: C.ceu, g: cc.map((x) => (x * dhiLux(el)) / LUX_W) });
    // v4 (gradual sun): indirect+glossy sun layers every ~2 h cross-faded, direct diffuse computed per pixel/minute
    const v4 = !!(C.solvis && C.solvis[estacao] && C.albedo && C.normal && C.solind && C.solind[estacao]);
    let dir = null;
    if (v4 && fSol > 0) {
      const k = this.p.solvis_k || C.solvis_k || 1;
      const gd = cs.map((x) => (x * dniLux(el) * k * fSol) / LUX_W);
      const md = mediaVis((this.p.solvis_media || C.solvis_media || {})[estacao], minutos);
      dir = { vis: C.solvis[estacao], g: gd, media: md, el, az: s.az };
    }
    // sun: hourly layers, cross-faded between the two neighbouring hours (missing hour = no direct sun then)
    const sol = ((v4 ? C.solind : C.sol) && (v4 ? C.solind : C.sol)[estacao]) || {};
    const gs = (dniLux(el) / LUX_W) * fSol; // S2: no bounce of a sun patch that does not exist for this unit
    // works with hourly or sparser layers (e.g. every 2 h): fade between the nearest rendered hours around `minutos`
    const horas = Object.keys(sol).map((k) => +k.slice(0, 2) * 60 + +k.slice(3, 5)).sort((x, y) => x - y);
    const ant = horas.filter((m) => m <= minutos).pop(), pos = horas.find((m) => m > minutos);
    const nome = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (gs > 0 && (ant !== undefined || pos !== undefined)) {
      // a layer only counts within 2 h of the asked time (outside the rendered sun window there is no direct sun)
      const entre = ant !== undefined && pos !== undefined && pos - ant <= (v4 ? 150 : 120);
      const fa = entre ? (pos - minutos) / (pos - ant) : ant !== undefined ? Math.max(0, 1 - (minutos - ant) / 60) : 0;
      const fb = entre ? 1 - fa : pos !== undefined ? Math.max(0, 1 - (pos - minutos) / 60) : 0;
      if (fa > 0) lista.push({ c: sol[nome(ant)], g: cs.map((x) => x * gs * fa) });
      if (fb > 0) lista.push({ c: sol[nome(pos)], g: cs.map((x) => x * gs * fb) });
    }
    for (const k of this.luzesOrdem) if (luzes && luzes[k] && C[k]) lista.push({ c: C[k], g: [1, 1, 1], luz: true });
    const media = [0, 0, 0];
    for (const it of lista) for (let i = 0; i < 3; i++) media[i] += it.g[i] * it.c.media[i];
    // v4: separate interior / exterior means (when every layer has them)
    let mDentro = null, mFora = null, mDia = null;
    if (lista.length && lista.every((it) => it.c.media_dentro && it.c.media_fora)) {
      mDentro = [0, 0, 0]; mFora = [0, 0, 0];
      mDia = [0, 0, 0];
      for (const it of lista) for (let i = 0; i < 3; i++) { mDentro[i] += it.g[i] * it.c.media_dentro[i]; mFora[i] += it.g[i] * it.c.media_fora[i]; if (!it.luz) mDia[i] += it.g[i] * it.c.media_dentro[i]; }
      const P = this.p, md = (P.solvis_media_dentro || {})[estacao], mf = (P.solvis_media_fora || {})[estacao];
      if (dir && md && mf) { const a = mediaVis(md, minutos), b = mediaVis(mf, minutos); for (let i = 0; i < 3; i++) { mDentro[i] += dir.g[i] * a[i]; mFora[i] += dir.g[i] * b[i]; mDia[i] += dir.g[i] * a[i]; } }
    }
    if (dir && dir.media) for (let i = 0; i < 3; i++) media[i] += dir.g[i] * dir.media[i];
    return { lista: lista.slice(0, 7), media, mDentro, mFora, mDia, sol: s, dir, minutos, fSol };
  }
  async _atualizar(estado) {
    if (this.liberado) return null;
    const usado = MisturaPonto.estadoDe(estado, this.luzesOrdem); // snapshot taken with the plan below (same tick)
    const pl = this.plano(estado);
    this.emUso = new Set(pl.lista.map((it) => it.c.arq));
    const C = this.p.camadas;
    const visArq = pl.dir ? [].concat(pl.dir.vis.arq) : [];
    const tDir = pl.dir ? await Promise.all([this.textura(C.albedo.arq), this.textura(C.normal.arq), ...visArq.map((a) => this.textura(a, true))]) : null;
    if (pl.dir) for (const a of [C.albedo.arq, C.normal.arq, ...visArq]) this.emUso.add(a);
    for (const it of pl.lista) if (it.c.lo && this.comLo) this.emUso.add(it.c.lo);
    const loP = pl.lista.map((it) => (it.c.lo && this.comLo ? this.textura(it.c.lo, false, true) : null));
    const tx = await Promise.all(pl.lista.map((it) => this.textura(it.c.arq, false, !!it.c.joelho)));
    // low bits already here = used now; still downloading = this picture goes out at 8 bits and is redrawn when they land
    const txLo = await Promise.all(loP.map((p) => (p ? Promise.race([p, Promise.resolve(undefined)]) : null)));
    if (this.liberado) return null;
    if (txLo.some((t) => t === undefined)) Promise.all(loP).then(() => { if (this.aoRefinar) this.aoRefinar(); }).catch(() => {});
    const U = this.mat.uniforms;
    U.semRefl.value = estado.reflexo === false ? 1 : 0; // ITEM 12
    U.usaVis.value = tDir && tDir.every(Boolean) ? 1 : 0;
    if (U.usaVis.value) {
      U.tAlb.value = tDir[0]; U.tNor.value = tDir[1]; U.tVis.value = tDir[2]; U.tVis2.value = tDir[3] || PRETO;
      const empilhado = Array.isArray(pl.dir.vis.arq);
      U.nInt.value = empilhado ? Math.min(pl.dir.vis.intervalos || 2 * visArq.length, 2 * visArq.length) : 0;
      U.visTam.value.set(tDir[2].userData.w, empilhado ? tDir[2].userData.h / 2 : tDir[2].userData.h);
      U.gDir.value.set(...pl.dir.g);
      U.meioMin.value = pl.minutos * 2;
      // sun direction: ENU (x east, y north, z up) from az (clockwise from north) / el, then into the normal-pass frame
      const a = (pl.dir.az * Math.PI) / 180, e = (Math.max(pl.dir.el, 0) * Math.PI) / 180;
      const enu = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
      const M = this.p.enu_para_normal || this.manifestoMat || [1, 0, 0, 0, 1, 0, 0, 0, 1];
      U.solDir.value.set(M[0] * enu[0] + M[1] * enu[1] + M[2] * enu[2], M[3] * enu[0] + M[4] * enu[1] + M[5] * enu[2], M[6] * enu[0] + M[7] * enu[1] + M[8] * enu[2]).normalize();
    }
    // 13/10: unused sampler slots kept textures that the LRU / soltarCamadas had disposed; three re-uploaded them from the
    // dropped CPU image ('texSubImage2D: Overload resolution failed' on every repaint). Empty slots now hold PRETO.
    U.tL0.value = U.tL1.value = U.tL2.value = PRETO;
    // 22/10 MANCHAS-360 (varanda 'ceu' in 12 bits): the shader has only 3 low-bit slots (16 samplers). They go to the layers that
    // WEIGH most in this picture (gain x mean of the layer inside the room): by day the sky, at night the lamps that are on.
    // Before: first come, first served in list order (sky first), so with the 12-bit sky the 3rd lamp at night lost its bits.
    const pesoLo = pl.lista.map((it, i) => { if (!it || !txLo[i]) return -1; const md = it.c.media_dentro || it.c.media || [1, 1, 1];
      return 0.2126 * it.g[0] * md[0] + 0.7152 * it.g[1] * md[1] + 0.0722 * it.g[2] * md[2]; });
    const ordemLo = pesoLo.map((w, i) => [w, i]).filter((x) => x[0] >= 0).sort((p, q) => q[0] - p[0]).slice(0, 3).map((x) => x[1]);
    if (!U.usaVis.value) U.tAlb.value = U.tNor.value = U.tVis.value = U.tVis2.value = PRETO;
    for (let i = 0; i < 7; i++) {
      const it = pl.lista[i];
      U.t.value[i] = (it && tx[i]) || PRETO;
      U.loIdx.value[i] = -1;
      if (it && txLo[i]) { const k = ordemLo.indexOf(i); if (k >= 0) { U['tL' + k].value = txLo[i]; U.loIdx.value[i] = k; } }
      U.g.value[i].set(...(it ? it.g : [0, 0, 0]));
      U.esc.value[i] = it ? it.c.escala : 1;
      U.ehLuz.value[i] = it && it.luz ? 1 : 0; // ITEM 12
      U.joelho.value[i] = (it && it.c.joelho) || 0; U.joelho2.value[i] = (it && it.c.joelho2) || 0.95; U.y2.value[i] = (it && it.c.y2) || 2; U.ymax.value[i] = (it && it.c.ymax) || 4; U.gamaL.value[i] = (it && it.c.gama) || 2.2;
    }
    // partial grey-world white balance + exposure from the analytic mean (sum of layer means x gains)
    const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const m = pl.mDentro || pl.media, y = lum(m); // v4: expose the room on the room, not on the window
    const el = Number.isFinite(pl.sol.el) ? pl.sol.el : -12;
    { const cv = ceuDoSol(el); VEU.topo.value.set(...cv.topo); VEU.horiz.value.set(...cv.horiz); } // 21/10 haze of the hour in the window
    // (07/10 Victor: "ilumina de uma vez quando o sol nasce") night and day rules blend over -2..8 deg instead of a
    // switch at 2 deg. Daylight: partial grey-world balance; night: keep most of the warm cast of the lamps (a photo
    // would too), otherwise saturated lamp shades turn blue after the balance
    const tDia = Math.min(1, Math.max(0, (el + 2) / 10)), kDia = tDia * tDia * (3 - 2 * tDia);
    const balanco = (mm, WB, noite) => {
      const yb = lum(mm);
      const w = mm.map((x) => (yb > 0 ? (yb / Math.max(x, 1e-9)) ** WB : 1));
      if (noite) { // (B1) warm but not orange: balanced R/B at most 1.25, green in between (never a green cast)
        const c = [mm[0] * w[0], mm[1] * w[1], mm[2] * w[2]];
        const rb = c[0] / Math.max(c[2], 1e-9);
        if (rb > 1.25) { const k = Math.sqrt(rb / 1.25); w[0] /= k; w[2] *= k; c[0] /= k; c[2] *= k; }
        const alvoG = Math.sqrt(c[0] * c[2]); if (c[1] > 0) w[1] *= alvoG / c[1];
        const yy = 0.2126 * mm[0] * w[0] + 0.7152 * mm[1] * w[1] + 0.0722 * mm[2] * w[2]; // keep the luminance
        if (yy > 0) { const n = yb / yy; for (let i = 0; i < 3; i++) w[i] *= n; }
      }
      return w;
    };
    // 13/10 Victor (R1): the balance came from the mean of the lamps that are ON, so switching the white kitchen light
    // off re-balanced the scene on the amber spots alone and turned spots + abajur white. Now the camera balance never
    // depends on which lamps are on: night = a FIXED balance taken on the white kitchen light (the look Victor chose,
    // 'kitchen ON'), day = grey world on daylight only; one balance for every layer, so each lamp keeps its own colour.
    const mLuz = this.refLuz || (C.cozinha && (C.cozinha.media_dentro || C.cozinha.media)) || null;
    let mDiaW = pl.mDia;
    if (!mDiaW) { mDiaW = [0, 0, 0]; for (const it of pl.lista) if (!it.luz) for (let i = 0; i < 3; i++) mDiaW[i] += it.g[i] * it.c.media[i]; if (pl.dir && pl.dir.media) for (let i = 0; i < 3; i++) mDiaW[i] += pl.dir.g[i] * pl.dir.media[i]; }
    const wN = mLuz ? balanco(mLuz, 0.15, true) : balanco(m, 0.15, true);
    const wD = lum(mDiaW) > 0 ? balanco(mDiaW, 0.6, false) : balanco(m, 0.6, false);
    U.wb.value.set(...wN.map((x, i) => x + (wD[i] - x) * kDia));
    { const c = m.map((x, i) => x * U.wb.value.getComponent(i)), yc = lum(c); if (yc > 0) U.corLuz.value.set(c[0] / yc, c[1] / yc, c[2] / yc); } // R4: colour of the room light
    // exposure: night rule unchanged (gain capped at 4.5); day rule adapts only partially to a dim sky, so the room
    // brightens with the dawn instead of being normalised to full brightness as soon as there is any daylight
    const yDia = C.ceu ? (0.2126 * C.ceu.media[0] + 0.7152 * C.ceu.media[1] + 0.0722 * C.ceu.media[2]) * dhiLux(15) / LUX_W : 0;
    const eNoite = y > 0 ? Math.min(ALVO / y, 4.5) : 1;
    const yD = pl.mDia ? lum(pl.mDia) : y; // day rule on daylight only: lamps on/off do not change the daytime exposure (Victor 08/10)
    const AD = ALVO * 0.45; // day key: the look Victor preferred (lamp-on daytime, 08/10)
    // cap: dark points (entrada, cozinha) looked into the sunlit room and blew the bed out (Victor 08/10); expose for the light part
    const eDia = Math.min(yD > 0 ? (yDia > yD ? AD / Math.sqrt(yD * yDia) : AD / yD) : 1, +(new URLSearchParams(location.search).get('etop')) || 1.6);
    U.expo.value = Math.min(eNoite + (eDia - eNoite) * kDia, 8); // 08/10 Victor: max() let the night rule blow out daytime rooms with the lamps off
    // v4 window: exterior exposed on its own mean (brighter key than the room, like a real-estate photo), never
    // brighter than the room exposure would make it; at night the exterior keeps the room exposure
    const tFora = C.fora ? await this.textura(C.fora.arq) : null;
    if (this.liberado) return null;
    if (tFora) this.emUso.add(C.fora.arq);
    U.usaFora.value = tFora ? 1 : 0;
    if (!tFora) U.tFora.value = PRETO;
    if (tFora) {
      U.tFora.value = tFora;
      const yF = pl.mFora ? lum(pl.mFora) : 0;
      const alvoFora = 0.55;
      const eFora = yF > 0 ? Math.min(U.expo.value, alvoFora / yF) : U.expo.value;
      U.fatorFora.value = 1 + (eFora / U.expo.value - 1) * kDia;
    }
    // 08/10 (Victor's M21s: colour rings / bands at night): phone GPUs compute in reduced precision and the lamp layers
    // enter as tiny numbers (abajur escala 0.004 x pow(v, 2.2) < 1e-4) that round in steps. The exposure is folded into
    // each layer's scale BEFORE the sum, so every term is near 1 in the shader (same image, no underflow).
    const K = U.expo.value;
    { const c = m.map((x, i) => x * U.wb.value.getComponent(i)); U.ambSala.value = Math.max(lum(c) * K, ALVO * (1 - kDia)); /* 15/10 FILA D10: from the balcony the room is far and dim, the night gain hits its 4.5 cap and the pouf's ambient fell to ~1/3 of the other points (top face black, lit front band): at night it never goes below the uncapped value (= ALVO) */ const NN = +(new URLSearchParams(location.search).get('pufeN')) || this.pufeNoiteCena || 1; U.pufeNoite.value = NN + (1 - NN) * kDia; } // R4: mean room luminance after exposure; night lift x2.2 (amber lamps on navy = black)
    for (let i = 0; i < 7; i++) U.esc.value[i] *= K;
    U.gDir.value.multiplyScalar(K); U.expo.value = 1;
    // local adaptation: day strength 0.5, night 0.2 (keeps the mood of the lamps); ?sloc= tests, ?sloc=0 = off
    // 21/10 SOL-FLUIDO: lit fraction per texel once, before the passes that read it (USA_AC programs only)
    if (U.usaVis.value && this.mat.defines.USA_AC !== undefined) { const tac = prepassoAcesa(this.r, U); if (tac) U.tAc.value = tac; }
    const qs = new URLSearchParams(location.search).get('sloc'), sDia = qs !== null && qs !== '' ? +qs : 0.6;
    U.sLoc.value = 0;
    if (sDia > 0) {
      U.modoLum.value = 1; this.r.setRenderTarget(this.rtLum); this.r.render(this.cena, this.cam); U.modoLum.value = 0;
      this.r.setRenderTarget(this.rtLoc); this.r.render(this.cenaBorra, this.cam);
      // 21/10 SOL-FLUIDO: the synchronous readback flushed the GPU on every paint (measured: ~10 fps of the 360 while the sun
      // walks). While the sun is moving (a key of this point read < 1.5 s ago) the last key is used and refreshed in the
      // background (readRenderTargetPixelsAsync); a still picture (or a jump: key off by > 0.1 stop) is repainted exact.
      const chaveDe = (b) => { let sl = 0, sw = 0;
      for (let j = 0; j < 32; j++) { const ca = Math.cos(((j + 0.5) / 32 - 0.5) * Math.PI); for (let i = 0; i < 64; i++) { const k = (j * 64 + i) * 4, w = (b[k + 1] / 255) * ca; sl += (((b[k] + b[k + 2] / 255) / 255) * 20 - 16) * w; sw += w; } }
        return [sl, sw]; };
      let sl, sw;
      // 22/10 MANCHAS-360: the key is reused only while the sun MOVES in small steps from the previous paint of this point (same
      // season and lamps, <= 60 min: dragging / holding the sun bar = 1 h/s by day, the night in 3 s; a short tap = 30 min). A jump (tap on another hour, season, lamps, opening) reads
      // the key at once: with the GPU busy the background readback took up to 4.5 s and the jump showed the old hour's exposure.
      const ant = this._anterior; this._anterior = usado; const seq = this._seq = (this._seq || 0) + 1;
      const dMin = ant ? Math.abs(ant.minutos - usado.minutos) : 1e9, passo = Math.min(dMin, 1440 - dMin);
      const continuo = !!ant && ant.estacao === usado.estacao && JSON.stringify(ant.luzes) === JSON.stringify(usado.luzes) && passo <= 60;
      if (this._chaveLoc && performance.now() - this._chaveLoc.t < 1500 && continuo && this.r.readRenderTargetPixelsAsync) {
        [sl, sw] = this._chaveLoc.v;
        // 22/10 MANCHAS-360 (measured: entrada 12:00 kept the 09:00 key, expo 3.272 vs 2.678 = 0.29 stop, never corrected): a paint
        // that reused the key while another readback was in flight was never checked (that readback compares the key of the paint
        // that ISSUED it). It now asks for one more paint when the readback lands; that paint reads its own key back.
        if (this._lendo) this._reler = true;
        else {
          this._lendo = true; this._reler = false; const b = new Uint8Array(64 * 32 * 4), chaveUsada = sw > 0 ? sl / sw : 0;
          this.r.readRenderTargetPixelsAsync(this.rtLoc, 0, 0, 64, 32, b).then(() => {
            // a key read on an OLDER paint never overwrites the key of a newer paint (it landed after a jump read the new one)
            const v = chaveDe(b); if (!this._chaveLoc || this._chaveLoc.seq <= seq) this._chaveLoc = { v, t: performance.now(), seq };
            if ((this._reler || Math.abs((v[1] > 0 ? v[0] / v[1] : 0) - chaveUsada) > 0.1) && this.aoRefinar) setTimeout(() => this.aoRefinar && this.aoRefinar(), 120);
          }).catch(() => { this._chaveLoc = null; if (this._reler && this.aoRefinar) setTimeout(() => this.aoRefinar && this.aoRefinar(), 120); }).finally(() => { this._lendo = false; this._reler = false; });
        }
      } else {
        this.r.readRenderTargetPixels(this.rtLoc, 0, 0, 64, 32, this.bufLoc);
        [sl, sw] = chaveDe(this.bufLoc); this._chaveLoc = { v: [sl, sw], t: performance.now(), seq };
      }
      U.lG.value = sw > 0 ? sl / sw : 0; U.tLoc.value = this.rtLoc.texture; U.sLoc.value = sDia * (0.4 + 0.6 * kDia);
      // day key on the GEOMETRIC mean (08/10): the arithmetic mean was ruled by small sun patches (porta-varanda 15h exposed
      // 20x lower than the entrance, the room behind went black). Points Victor approved sit at log2 -4.0..-4.8: pull each
      // toward -4.3 (-1..+2 stops), daytime only; night keeps the lamp rule
      const kq = new URLSearchParams(location.search).get('chave'), T = kq ? +kq : -4.3;
      if (sw > 0) U.expo.value = 2 ** (Math.max(-1, Math.min(2, (T - U.lG.value) * 1.0)) * kDia);
    }
    this.r.setRenderTarget(this.rt); this.r.render(this.cena, this.cam); this.r.setRenderTarget(null);
    this.ultimo = { ...pl, expo: K * U.expo.value, lG: U.lG.value + Math.log2(U.expo.value), estado: usado, veu: U.veuFora.value,
      bits12: pl.lista.map((it, i) => (U.loIdx.value[i] >= 0 ? it.c.arq : null)).filter(Boolean), bits8: pl.lista.map((it, i) => (it.c.lo && U.loIdx.value[i] < 0 ? it.c.arq : null)).filter(Boolean) };
    return this.rt.texture;
  }
  liberar() { this.liberado = true; this.rt.dispose(); this.mat.dispose(); this.rtLum.dispose(); this.rtLoc.dispose(); this.matBorra.dispose(); for (const p of this.cache.values()) p.then((t) => t && t.dispose()); }
}
export let ALVO = 0.30;   // mean-luminance key (tuned on the proof prints; see RELATORIO-B6)
export function definirAlvo(x) { ALVO = x; }
