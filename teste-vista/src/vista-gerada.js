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
uniform float contraste;   // contrast around mid grey (golden hour / dusk)
uniform float kNoite;      // weight of the night emission
uniform float escuro;      // how much the day photo is darkened at night (0 = day)
uniform vec3 ceuTopo;
uniform vec3 ceuHoriz;
uniform vec3 nevoa;        // haze colour of the hour (low sun / dusk)
uniform float forca;
uniform float alfaMeio;
uniform float kCeuFoto;    // v2: the drone's own cloudy sky by day (faded above 18-28 deg, where the stitch ends)
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
    B.a = alfaMeio > 0.5 ? clamp((B.a - 0.5) * 2.0, 0.0, 1.0) : B.a;   // v2 layers: sky stored at alpha 0.5
    vec3 x = lin(B.rgb) * tinta * expo;
    float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
    x = mix(vec3(l), x, sat);
    x = 0.18 * pow(max(x, vec3(0.0)) / 0.18, vec3(contraste));
    x = x * (1.0 - escuro) + lin(texture2D(tNoite, uv).rgb) * kNoite;
    vec3 cf = lin(B.rgb) * mix(vec3(1.0), tinta, 0.6) * expo;
    float wf = kCeuFoto * smoothstep(0.36, 0.21, lat);   // fade the real sky out between 21 and 12 deg (the stitch border lies above)
    vec3 ceuF = mix(ceu, cf, wf);
    cor = mix(ceuF, x, B.a);
  }
  float aw = m * forca;
  gl_FragColor = vec4(paraSrgb(cor) * aw, aw);             // premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA)
}`;

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mistura = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);

// colour state of the hour from the sun elevation (el, degrees) and the clock. v2 (22/10, coordinator: "12h e 17h quase iguais"):
// a strong, obvious grade per moment - morning cool and clean, noon neutral, 17h warm gold with contrast, 18h30 pink/blue dusk,
// 21h dark blue night - blended continuously (each weight is a smoothstep of the elevation).
function filtroDaHora(el, minutos) {
  const tarde = minutos >= 12 * 60 ? 1 : 0;
  const manha = (1 - tarde) * suave(4, 30, el) * (1 - suave(45, 70, el));      // morning, sun up but not high
  const ouro = tarde * suave(32, 12, el) * suave(-2, 4, el);                  // afternoon golden hour
  const ouroM = (1 - tarde) * suave(16, 4, el) * suave(-2, 3, el) * 0.5;      // a softer gold at sunrise
  const crep = suave(-13, -3, el) * (1 - suave(-1.5, 3, el));                 // dusk: pink horizon, blue sky
  const noite = 1 - suave(-16, -7, el);
  let tinta = [1.0, 1.0, 1.0];
  tinta = mistura(tinta, [0.84, 0.95, 1.16], manha);
  tinta = mistura(tinta, [1.30, 0.98, 0.64], Math.max(ouro, ouroM));
  tinta = mistura(tinta, [0.82, 0.62, 0.92], crep);
  tinta = mistura(tinta, [0.42, 0.52, 0.95], noite);
  let expo = (1.0 + 0.08 * suave(50, 70, el)) * (1 + 0.06 * manha);
  expo *= 1 - 0.08 * ouro;
  expo *= 1 - 0.62 * crep;
  expo = expo * (1 - noite) + 0.10 * noite;
  const contraste = 1 + 0.30 * ouro + 0.14 * manha + 0.12 * crep;
  const sat = (1.05 + 0.30 * ouro - 0.08 * manha) * (1 - 0.25 * crep) * (1 - 0.35 * noite);
  const kNoite = Math.max(1 - suave(-12, -2, el), 0) * (0.55 + 0.45 * suave(-6, -14, el));   // 18h30 partly lit, 21h all
  let topo = [0.20, 0.40, 0.80], horiz = [0.66, 0.78, 0.92];
  topo = mistura(topo, [0.26, 0.48, 0.88], manha); horiz = mistura(horiz, [0.80, 0.88, 0.98], manha);
  topo = mistura(topo, [0.28, 0.40, 0.68], Math.max(ouro, ouroM)); horiz = mistura(horiz, [1.0, 0.70, 0.40], Math.max(ouro, ouroM));
  topo = mistura(topo, [0.10, 0.14, 0.40], crep); horiz = mistura(horiz, [0.98, 0.56, 0.58], crep);
  topo = mistura(topo, [0.006, 0.012, 0.045], noite); horiz = mistura(horiz, [0.035, 0.05, 0.13], noite);
  const kCeuFoto = suave(2, 14, el) * (1 - 0.5 * ouro);   // real clouds by day, the gradient takes over at golden hour/dusk/night
  return { kCeuFoto, tinta, expo, sat, contraste, kNoite, escuro: 0, topo, horiz, nevoa: horiz, pesos: { manha, ouro, crep, noite } };
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
    tinta: { value: new THREE.Vector3(1, 1, 1) }, expo: { value: 1 }, sat: { value: 1 }, contraste: { value: 1 }, kNoite: { value: 0 }, escuro: { value: 0 },
    kCeuFoto: { value: 0 }, alfaMeio: { value: face.alfa_meio ? 1 : 0 }, ceuTopo: { value: new THREE.Vector3() }, ceuHoriz: { value: new THREE.Vector3() }, nevoa: { value: new THREE.Vector3() }, forca: { value: 1 },
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
      U.tinta.value.set(...F.tinta); U.expo.value = F.expo; U.sat.value = F.sat; U.contraste.value = F.contraste; U.kNoite.value = F.kNoite; U.escuro.value = F.escuro;
      U.kCeuFoto.value = (face.ceu_foto ? 1 : 0) * F.kCeuFoto; U.ceuTopo.value.set(...F.topo); U.ceuHoriz.value.set(...F.horiz); U.nevoa.value.set(...F.nevoa);
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
