// Generated window view (prototype, 21/10/2026, front GOOGLE-DIA-V2 / E0 task 4). Demo only: "imagem ilustrativa", not the
// real view. ONE generated image per facade, used as a DISTANT BACKDROP: a vertical cylinder (radius R, centred on the
// facade's generation eye) plus the ground plane. Every 360 point looks at that backdrop from its own position (point offset
// in the flat + floor height), so the angle changes a little between points and the parallax is natural. The image itself is
// an equirect crop seen from the generation eye: a ray from the point hits the proxy (ground or cylinder) at Q, and Q seen
// from the generation eye gives the pixel. Nothing closer than ~100 m was generated (a flat backdrop gives near buildings
// false parallax).
// Layers (assets/vista-gerada/<face>-*.webp): base = soft-light day photo, RGB + alpha (alpha 0 = sky, replaced by a sky
// gradient per hour); noite = emission of the lit windows + street lights (one fixed random subset). The hour of the tour's
// own time bar drives a continuous blend: exposure + colour filter (morning, noon, golden afternoon, dusk) and the night layer.
// Google's tiles are never drawn in the same frame: the points this covers switch Google's window off (tour360.js asks cobre()).
import * as THREE from "three";

const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tM;      // the point's 'fora' mask (window = .r), same pano uv as the 360 sphere
uniform sampler2D tBase;   // day photo, sRGB, alpha = city
uniform sampler2D tNoite;  // emission, sRGB
uniform vec3 O;            // point eye relative to the generation eye: (forward, right, up) metres
uniform float R;           // backdrop cylinder radius (m)
uniform float chao;        // ground plane height relative to the generation eye (m, negative)
uniform vec4 faixa;        // lon0, lon1, lat0, lat1 (radians) of the image
uniform vec3 tinta;        // colour filter of the hour
uniform float expo;        // exposure of the hour
uniform float sat;         // saturation of the hour
uniform float kNoite;      // weight of the night emission
uniform float escuro;      // how much the day photo is darkened at night (0 = day)
uniform vec3 ceuTopo;
uniform vec3 ceuHoriz;
uniform vec3 nevoa;        // haze colour of the hour (low sun / dusk)
uniform float forca;
vec3 lin(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 paraSrgb(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  float m = texture2D(tM, vUv).r;
  if (m < 0.002) discard;
  float phi = vUv.x * 6.28318530718, th = 3.14159265359 * (1.0 - vUv.y);
  vec3 d = vec3(cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
  vec3 r = normalize(vec3(-d.x, -d.z, d.y));                 // (forward, right, up) in the facade frame
  // proxy: cylinder |(f, r)| = R around the generation eye, ground plane at 'chao'
  float a = dot(r.xy, r.xy), b = 2.0 * dot(O.xy, r.xy), c = dot(O.xy, O.xy) - R * R;
  float tc = a > 1e-6 ? (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a) : 1e6;
  float t = tc;
  if (r.z < -1e-4) { float tg = (chao - O.z) / r.z; if (tg > 0.0 && tg < tc) t = tg; }
  vec3 Q = O + r * t;
  float lon = atan(Q.y, Q.x), lat = atan(Q.z, length(Q.xy));
  vec2 uv = vec2((lon - faixa.x) / (faixa.y - faixa.x), (lat - faixa.z) / (faixa.w - faixa.z));
  float el = asin(clamp(r.z, -1.0, 1.0));
  vec3 ceu = mix(ceuHoriz, ceuTopo, smoothstep(0.0, 0.75, el));
  vec3 cor = ceu;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    vec4 B = texture2D(tBase, uv);
    vec3 x = lin(B.rgb) * tinta * expo;
    float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
    x = mix(vec3(l), x, sat);
    x = x * (1.0 - escuro) + lin(texture2D(tNoite, uv).rgb) * kNoite;
    cor = mix(ceu, x, B.a);
  }
  float aw = m * forca;
  gl_FragColor = vec4(paraSrgb(cor) * aw, aw);             // premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA)
}`;

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mistura = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);

// colour state of the hour from the sun elevation (el, degrees) and the clock (afternoon = warmer)
function filtroDaHora(el, minutos) {
  const tarde = minutos >= 12 * 60 ? 1 : 0.55;
  const dia = suave(-6, 8, el);                        // 0 night .. 1 day
  const baixo = suave(28, 6, el) * suave(-4, 2, el);   // low sun: golden light
  const crep = suave(-9, -1, el) * (1 - suave(0, 5, el)); // dusk / blue hour
  let tinta = [1, 1, 1];
  tinta = mistura(tinta, [1.16, 0.98, 0.80], baixo * tarde);
  tinta = mistura(tinta, [0.70, 0.74, 1.0], crep);
  const expo = (0.06 + 0.94 * suave(-9, 6, el)) * (1 - 0.12 * baixo);
  const sat = 1.0 + 0.10 * baixo * tarde - 0.35 * crep;
  const kNoite = 1 - suave(-7, -1.5, el);
  const escuro = (1 - suave(-12, 4, el)) * 0.86;   // night: the masses of the buildings stay faintly visible (blue)
  // sky: day blue, golden horizon at low sun, dusk violet, night navy (same family as google-vista ceuParaSol)
  let topo = mistura([0.008, 0.012, 0.03], [0.16, 0.33, 0.68], dia), horiz = mistura([0.02, 0.025, 0.05], [0.62, 0.72, 0.84], dia);
  topo = mistura(topo, [0.22, 0.30, 0.58], baixo * 0.5);
  horiz = mistura(horiz, [1.0, 0.70, 0.42], baixo * tarde * 0.75);
  topo = mistura(topo, [0.10, 0.12, 0.30], crep * 0.6);
  horiz = mistura(horiz, [0.85, 0.52, 0.48], crep * 0.6);
  return { tinta, expo, sat, kNoite, escuro, topo, horiz, nevoa: horiz };
}

async function criarVistaGerada({ cena, PTS, andar, final, RAIO, base = "assets/vista-gerada/" }) {
  let cfg;
  try { cfg = await (await fetch(base + "vista.json", { cache: "no-store" })).json(); } catch (e) { return null; }
  const face = Object.values(cfg.faces || {}).find((f) => (f.finais || []).includes(Number(final ?? cfg.padrao.final)));
  if (!face) return null;
  const nAndar = Number(andar ?? cfg.padrao.andar);
  const ref = PTS[face.ponto_ref] && PTS[face.ponto_ref].pos;
  if (!ref) return null;
  const carrega = (arq) => new Promise((ok) => new THREE.TextureLoader().load(base + arq, (t) => {
    t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4; ok(t);
  }, undefined, () => ok(null)));
  const [tBase, tNoite] = await Promise.all([carrega(face.base), carrega(face.noite)]);
  if (!tBase) return null;
  const preto = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); preto.needsUpdate = true;
  const U = {
    tM: { value: preto }, tBase: { value: tBase }, tNoite: { value: tNoite || preto },
    O: { value: new THREE.Vector3() }, R: { value: face.raio_m }, chao: { value: face.chao_m },
    faixa: { value: new THREE.Vector4(...face.lon.map((x) => x * Math.PI / 180), ...face.lat.map((x) => x * Math.PI / 180)) },
    tinta: { value: new THREE.Vector3(1, 1, 1) }, expo: { value: 1 }, sat: { value: 1 }, kNoite: { value: 0 }, escuro: { value: 0 },
    ceuTopo: { value: new THREE.Vector3() }, ceuHoriz: { value: new THREE.Vector3() }, nevoa: { value: new THREE.Vector3() }, forca: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const geo = new THREE.SphereGeometry(RAIO * 0.98, 96, 48); geo.scale(-1, 1, 1);   // same uv as the pano sphere
  const malha = new THREE.Mesh(geo, mat); malha.renderOrder = 3; malha.frustumCulled = false; malha.visible = false;
  cena.add(malha);
  const credito = document.createElement("div");
  credito.className = "t360-vg-credito"; credito.hidden = true;
  credito.textContent = cfg.credito || "Vista da janela: imagem ilustrativa";
  const css = document.createElement("style");
  css.textContent = ".t360-vg-credito{position:absolute;right:10px;bottom:78px;padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:11px/1.3 system-ui,sans-serif;pointer-events:none}.t360-vg-credito[hidden]{display:none}@media (max-width:760px){.t360-vg-credito{top:92px;bottom:auto}}";
  document.head.appendChild(css);
  const pontos = new Set(face.pontos || Object.keys(PTS));
  let atual = null;
  const VG = {
    malha, credito, face, andar: nAndar,
    cobre: (id) => pontos.has(id) && !!(PTS[id] && PTS[id].camadas && PTS[id].camadas.fora),
    aposPintar(id, e) {
      if (!this.cobre(id)) { atual = null; return; }
      atual = id;
      const p = PTS[id].pos;
      // pano frame: +v = balcony (forward), +u = left (paraMundo: world = (-v, h, u); right = -Z = -u)
      U.O.value.set(p[1] - ref[1], -(p[0] - ref[0]), (p[2] - ref[2]) + (nAndar - face.andar_geracao) * face.piso_m);
      U.O.value.y += (face.desloc_final && face.desloc_final[String(final ?? cfg.padrao.final)]) || 0; // other units of the same facade: metres to the right
      U.tM.value = e.mix.mat.uniforms.tFora.value || preto;
      const el = e.mix.ultimo && e.mix.ultimo.sol && Number.isFinite(e.mix.ultimo.sol.el) ? e.mix.ultimo.sol.el : 20;
      const minutos = e.mix.ultimo && Number.isFinite(e.mix.ultimo.minutos) ? e.mix.ultimo.minutos : 720;
      this.aplicaHora(el, minutos);
    },
    aplicaHora(el, minutos) {
      const F = filtroDaHora(el, minutos);
      U.tinta.value.set(...F.tinta); U.expo.value = F.expo; U.sat.value = F.sat; U.kNoite.value = F.kNoite; U.escuro.value = F.escuro;
      U.ceuTopo.value.set(...F.topo); U.ceuHoriz.value.set(...F.horiz); U.nevoa.value.set(...F.nevoa);
      if (typeof window !== "undefined") window.__vistaGerada = { ponto: atual, el: +el.toFixed(2), minutos, O: U.O.value.toArray().map((x) => +x.toFixed(2)), andar: nAndar, ...F };
    },
    antes(camera, ponto, andando) {
      const ve = !andando && atual === ponto && this.cobre(ponto);
      malha.visible = ve; credito.hidden = !ve;
      if (ve) malha.position.copy(camera.position);
    },
    liberar() { cena.remove(malha); geo.dispose(); mat.dispose(); tBase.dispose(); if (tNoite) tNoite.dispose(); credito.remove(); css.remove(); },
  };
  return VG;
}

export { criarVistaGerada, filtroDaHora };
