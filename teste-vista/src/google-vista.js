import * as THREE from "three";
import { capacidade } from "./capacidade.js";
import { chaveLocal, PREDIO_CFG } from "./predio.js";
import { smooth, fatorDia, fatorLuzesNoite } from "./luz-curva.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
const V = "3d-tiles-renderer@0.5.3";
const CDN = new URL(`./vendor/${V}/build/`, import.meta.url).href;
const DRACO = new URL("./vendor/three@0.186.1/examples/jsm/libs/draco/gltf/", import.meta.url).href;
const LOGO = "assets/marca/google-maps-logo-contorno-escuro.svg";
const CRED_CSS = "pointer-events:none;overflow:visible";
const CRED_ESTILO = ".g3d-cred{display:grid;grid-template-columns:auto minmax(0,auto);column-gap:10px;row-gap:3px;align-items:center;padding:10px 10px 5px;border-radius:8px;background:rgba(0,0,0,.5);color:#fff;font:9px/1.2 system-ui,sans-serif;white-space:normal;box-sizing:border-box}.g3d-cred img{height:21px;width:auto;display:block;grid-row:1;grid-column:1}.g3d-cred .g3d-parte{grid-row:1;grid-column:2;font-weight:600}.g3d-cred .g3d-attr{grid-row:2;grid-column:1/-1;opacity:.92}.g3d-cred .g3d-attr:empty{display:none}@media (min-width:1000px){.g3d-cred{grid-template-columns:auto auto auto;font-size:10px}.g3d-cred .g3d-attr{grid-row:1;grid-column:3}}";
function estiloCredito() {
  if (typeof document === "undefined" || document.getElementById("g3d-cred-css")) return;
  const st = document.createElement("style");
  st.id = "g3d-cred-css";
  st.textContent = CRED_ESTILO;
  document.head.appendChild(st);
}
function htmlCredito(parte) {
  estiloCredito();
  return '<img alt="Google Maps" aria-label="Google Maps" src="' + LOGO + '" referrerpolicy="no-referrer"><span class="g3d-parte">' + parte + '</span><span class="g3d-attr"></span>';
}
const textoDados = (out) => {
  const t = out.filter((a) => a.type === "string" && a.value).map((a) => a.value).join("; ");
  return t ? "Dados do mapa: " + t : "";
};
const ERRO_360 = typeof location !== "undefined" && +new URLSearchParams(location.search).get("gerr") || capacidade().erro360;
const RAIO = typeof location !== "undefined" && +new URLSearchParams(location.search).get("graio") || 2e4;
const QS_FOTO = typeof location !== "undefined" ? new URLSearchParams(location.search).get("gfoto") : null;
const MODO_FOTO = QS_FOTO === "1" || QS_FOTO !== "0" && (capacidade().movel || capacidade().nivel !== "topo");
const ERRO_FOTO = +(typeof location !== "undefined" && new URLSearchParams(location.search).get("gferr")) || (capacidade().nivel === "topo" ? 6 : 14);
const FOTO_LADO = capacidade().nivel === "topo" ? 2048 : 1536;
const FOTO_LADO_W = capacidade().nivel === "topo" ? 2048 : 1024;
const FOTO_MIN = +(typeof location !== "undefined" && new URLSearchParams(location.search).get("gfmin")) || 99999;
const FOTO_MB = (+(typeof location !== "undefined" && new URLSearchParams(location.search).get("gfmb")) || (capacidade().nivel === "topo" ? capacidade().movel ? 900 : 1500 : capacidade().tilesMB)) * 1048576;
const FOTO_N = +(typeof location !== "undefined" && new URLSearchParams(location.search).get("gfn")) || (capacidade().nivel === "topo" ? 4 : 2);
const desligadoPorUrl = () => /[?&]google3d=0/.test(location.search);
async function chaveDaPagina() {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const k = window.__G3D_KEY || (local ? new URLSearchParams(location.search).get("gkey") : null);
  if (k) return k;
  try {
    return (await import("./g3d-chave.js")).CHAVE || "";
  } catch (e) {
    return "";
  }
}
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F);
function ecef(latDeg, lonDeg, h) {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  const N = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  return [(N + h) * Math.cos(la) * Math.cos(lo), (N + h) * Math.cos(la) * Math.sin(lo), (N * (1 - E2) + h) * Math.sin(la)];
}
function matrizLocal(lat, lon, h, [dE = 0, dN = 0, dU = 0] = []) {
  const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const P = ecef(lat, lon, h);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const Pe = dot(e, P), Pn = dot(n, P), Pu = dot(u, P);
  const m = new THREE.Matrix4();
  m.set(
    e[0],
    e[1],
    e[2],
    -Pe - dE,
    u[0],
    u[1],
    u[2],
    -Pu - dU,
    -n[0],
    -n[1],
    -n[2],
    Pn + dN,
    0,
    0,
    0,
    1
  );
  return m;
}
const GRADE_GLSL = `
vec3 g3dGrade(vec3 c, vec4 g) {
  c *= g.x;
  float y = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
  float y2 = y < g.w ? g.w * pow(y / g.w, g.y) : y; // contrast only BELOW the pivot (lifted blacks of the aerial photo); highlights not pushed (Neutral shoulder)
  c *= y2 / y;
  return max(mix(vec3(y2), c, g.z), vec3(0.0));
}
vec3 g3dOmbro(vec3 x, vec2 o) {
  vec3 s = o.x + (1.0 - o.x) * (1.0 - exp(-max(x - o.x, vec3(0.0)) / (1.0 - o.x))); // max(): no exp overflow under the knee (inf x 0 = NaN in mix)
  return mix(x, mix(x, s, step(vec3(o.x), x)), o.y);
}
`;
const LUZ_GLSL = `
  {
    vec3 cB = outgoingLight;
    outgoingLight = g3dGrade(cB * uLuz, uGrade); // C7 21/10: day grade (identity at night and in the window photo shots)
    if (uNoiteG > 0.001 && uTerrExt > 0.0) {
      vec2 rq = (vB5.xz + uTerrExt) / (2.0 * uTerrExt);
      if (all(greaterThan(rq, vec2(0.0))) && all(lessThan(rq, vec2(1.0)))) {
        vec3 lz = texture2D(uTerr, rq).rgb;
        float hrua = vB5.y - (lz.b * 60.0 - 20.0);
        outgoingLight += uNoiteG * (lz.r * vec3(1.0, 0.56, 0.22) + lz.g * vec3(1.0, 0.82, 0.6)) * cB * 1.6 * (1.0 - smoothstep(1.0, 10.0, hrua));
      }
    }
    if (uNoiteG > 0.001) {
      vec3 nB = normalize(cross(dFdx(vB5), dFdy(vB5)));
      bool verde = cB.g > cB.r * 1.08 && cB.g > cB.b * 1.04;
      if (!verde && abs(nB.y) < 0.5 && vB5.y > 3.5) {
        vec2 tgv = normalize(vec2(-nB.z, nB.x) + 1e-5); float lado = floor(nB.x * 3.0) * 17.0 + floor(nB.z * 3.0) * 5.0; float alin = 1.0, temMapa = 0.0;
        if (uAngExt > 0.0) {
          vec2 ru = (vB5.xz + uAngExt) / (2.0 * uAngExt);
          vec3 an = texture2D(uAng, ru).rgb;
          if (an.b > 0.35 && all(greaterThan(ru, vec2(0.0))) && all(lessThan(ru, vec2(1.0)))) {
            float t = atan(an.g * 2.0 - 1.0, an.r * 2.0 - 1.0) * 0.25;
            vec2 e1 = vec2(cos(t), sin(t)), e2 = vec2(-e1.y, e1.x);
            float d1 = dot(nB.xz, e1), d2 = dot(nB.xz, e2);
            if (abs(d1) > abs(d2)) { tgv = e2; lado = sign(d1) * 17.0; } else { tgv = e1; lado = 40.0 + sign(d2) * 17.0; } temMapa = 1.0; alin = smoothstep(0.80, 0.90, max(abs(d1), abs(d2)) / max(length(nB.xz), 1e-4)); // triangles > ~30 deg off the facade (balcony zig-zag) get no window: they only made shards
          }
        }
        float sF = dot(vB5.xz, tgv);
        vec2 cel = vec2(floor(sF / 3.1), floor(vB5.y / 2.85));
        vec2 f = vec2(fract(sF / 3.1), fract(vB5.y / 2.85));
        float jan = smoothstep(0.20, 0.24, f.x) * (1.0 - smoothstep(0.76, 0.80, f.x)) * smoothstep(0.34, 0.38, f.y) * (1.0 - smoothstep(0.84, 0.88, f.y));
        float id = g3dH21(cel + lado + floor(vB5.xz / 40.0) * 3.1);
        jan *= mix(1.0, alin, temMapa);${typeof location !== "undefined" && /[?&]gangdbg=1/.test(location.search) ? " outgoingLight = vec3(temMapa, alin, jan) * 0.6; cB = vec3(0.0);" : ""} // ?gangdbg=1: R = facade map here, G = triangle on the facade axis, B = window
        float acesa = step(id, uFracG) * jan;
        float lum = dot(cB, vec3(0.2126, 0.7152, 0.0722));
        float vidro = 1.0 - smoothstep(0.18, 0.5, lum);
        vec3 quente = mix(vec3(1.0, 0.72, 0.42), vec3(0.95, 0.9, 0.82), step(0.82, g3dH21(cel + 7.0)));
        float forca = 0.12 + 0.88 * pow(g3dH21(cel + 3.0), 2.2);
        outgoingLight += uNoiteG * acesa * mix(0.5, 1.0, vidro) * quente * forca * 0.85;
      }
    }
  }`;
const FANT_GLSL = `
uniform sampler2D uMapaP; uniform vec4 uMapaR; uniform vec3 uCamB5; uniform vec3 uAlvoB5; uniform sampler2D uTerr; uniform float uTerrExt;
bool g3dSome(vec4 c) {
  if (c.a < 0.5) return false;
  vec2 a = uCamB5.xz, b = uAlvoB5.xz, ab = b - a;
  float t = clamp(dot(c.xy - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  float d = length(c.xy - (a + ab * t));
  float hLinha = mix(uCamB5.y, uAlvoB5.y, t), hTopo = c.w - 1.0;
  bool entre = t > 0.05 && t < 0.93 && d < c.z * 0.8 + 14.0 && length(c.xy - b) > 20.0 && hTopo > hLinha - 4.0; // 08/10: +14 m = the tower's half width (edges were left covered)
  bool naCamera = length(c.xy - a) < c.z * 0.8 + 2.0 && uCamB5.y < hTopo + 8.0; // 08/10: only when the camera is at the building's height, not flying over its roof (houses below an aerial camera vanished)
  return entre || naCamera;
}
bool g3dFantasma(vec3 p) {
  if (uMapaR.w < 0.5) return false;
  if (uRet.x < uRet.z && gl_FragCoord.x > uRet.x && gl_FragCoord.x < uRet.z && gl_FragCoord.y > uRet.y && gl_FragCoord.y < uRet.w && vProf < uProf) {
    float ch = 3.8;
    if (uTerrExt > 0.0) { vec2 rq0 = (p.xz + uTerrExt) / (2.0 * uTerrExt); if (all(greaterThan(rq0, vec2(0.0))) && all(lessThan(rq0, vec2(1.0)))) ch = texture2D(uTerr, rq0).b * 60.0 - 20.0; }
    if (p.y > ch + 6.0) return true; // 08/10 (Victor: walls of neighbours still in front of the tower)
  }
  float chao = 3.8;
  if (uTerrExt > 0.0) { vec2 rq = (p.xz + uTerrExt) / (2.0 * uTerrExt); if (all(greaterThan(rq, vec2(0.0))) && all(lessThan(rq, vec2(1.0)))) chao = texture2D(uTerr, rq).b * 60.0 - 20.0; }
  if (p.y < chao + 1.2) return false;
  vec2 uv = vec2((p.x - uMapaR.x) * uMapaR.z, 1.0 - (p.z - uMapaR.y) * uMapaR.z), e = vec2(2.5 * uMapaR.z, 0.0); // map camera up = -z: v 0 at z max
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return false;
  return g3dSome(texture2D(uMapaP, uv)) || g3dSome(texture2D(uMapaP, uv + e.xy)) || g3dSome(texture2D(uMapaP, uv - e.xy))
      || g3dSome(texture2D(uMapaP, uv + e.yx)) || g3dSome(texture2D(uMapaP, uv - e.yx));
}
`;
const GRADE_G3D = { expo: 0.85, contraste: 1.3, sat: 1.2, pivo: 0.18, joelho: 0.6 };
const GRADE_DESL = typeof location !== "undefined" && /[?&]g3dgrade=0/.test(location.search);
function gradeGoogle(el) {
  const e = Number.isFinite(el) ? el : -20, w = GRADE_DESL ? 0 : smooth(-2, 10, e), G = GRADE_G3D;
  const m = (v) => +(1 + (v - 1) * w).toFixed(4);
  return { w: +w.toFixed(4), expo: m(G.expo), contraste: m(G.contraste), sat: m(G.sat), pivo: G.pivo, joelho: G.joelho };
}
const QS8 = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams(""), Q8 = [QS8.get("g3daniso"), QS8.get("g3dmsaa"), QS8.get("g3dnitidez"), QS8.get("g3derrk"), QS8.get("g3dplanos"), QS8.get("g3dplanosr"), QS8.get("g3dplanosdbg")];
const C8 = { aniso: Q8[0] === "0" ? 1 : 16, msaa: Q8[1] === "0" ? 0 : 4, nitidez: Q8[2] == null ? 0.6 : +Q8[2] || 0, erroK: +Q8[3] || 1, planos: Q8[4] === "1" ? 1 : 0, planosR: +Q8[5] || 100, planosPx: 14, planosDbg: Q8[6] === "1" ? 1 : 0 };
const DESPRE = { value: C8.msaa ? 1 : 0 };
const NIT_GLSL = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if (uNitG > 0.0) {
    vec2 ux = dFdx(vMapUv), uy = dFdy(vMapUv);
    vec3 c0 = sqrt(max(sampledDiffuseColor.rgb, vec3(0.0)));
    vec3 mb = 0.25 * (sqrt(texture2D(map, vMapUv + ux).rgb) + sqrt(texture2D(map, vMapUv - ux).rgb) + sqrt(texture2D(map, vMapUv + uy).rgb) + sqrt(texture2D(map, vMapUv - uy).rgb));
    vec3 c1 = max(c0 + clamp(uNitG * (c0 - mb), vec3(-0.04), vec3(0.04)), vec3(0.0));
    sampledDiffuseColor.rgb = c1 * c1;
  }
  diffuseColor *= sampledDiffuseColor;
#endif
`;
const PLANO_MAP_GLSL = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  if (sampledDiffuseColor.a < 0.995) {
    vec4 m1 = texture2D(map, vMapUv, 3.0), m2 = texture2D(map, vMapUv, 6.0);
    vec3 fo = m1.a > 0.05 ? m1.rgb / m1.a : (m2.a > 0.01 ? m2.rgb / m2.a : vec3(0.45));
    sampledDiffuseColor = vec4(sampledDiffuseColor.rgb + fo * (1.0 - sampledDiffuseColor.a), 1.0);
  }
  diffuseColor *= sampledDiffuseColor;
#endif
`;
let PLANOS_DADOS = null;
function luzDaCidade(el) {
  const e = Number.isFinite(el) ? el : -20;
  const k = 0.04 + 0.96 * fatorDia(e), azul = smooth(-14, -3, e) * (1 - smooth(-2, 8, e)), noite = 1 - smooth(-14, -4, e);
  const base = [1, 1, 1].map((v, i) => {
    let x = v;
    x += ([0.9, 0.95, 1.06][i] - x) * azul * 0.6;
    x += ([0.62, 0.74, 1.05][i] - x) * noite;
    return x * k;
  });
  return { base, luzes: fatorLuzesNoite(e) * (1 - smooth(-7, 0, e)) };
}
let sessao = null;
const STATUS = { estado: "parado", erro: null, raiz: 0, bytes: 0, tiles: 0 };
if (typeof window !== "undefined") window.__g3d = STATUS;
if (typeof window !== "undefined") window.__g3dC8 = { C8, aplicar(o) {
  Object.assign(C8, o || {});
  DESPRE.value = C8.msaa ? 1 : 0;
  if (sessao) sessao.then((s) => {
    if (s && s.aplicarC8) s.aplicarC8();
  });
  return { ...C8 };
} };
function iniciarGoogle() {
  if (sessao) return sessao;
  sessao = (async () => {
    const chave = await chaveDaPagina();
    if (!chave || desligadoPorUrl()) {
      STATUS.estado = "sem-chave";
      return null;
    }
    if (!capacidade().google) {
      STATUS.estado = "aparelho-leve";
      return null;
    }
    STATUS.estado = "carregando";
    try {
      const [{ TilesRenderer }, { GoogleCloudAuthPlugin }] = await Promise.all([import(`${CDN}index.js`), import(`${CDN}index.core-plugins.js`)]);
      const tiles = new TilesRenderer();
      tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: chave, autoRefreshToken: true, logoUrl: LOGO, useRecommendedSettings: false }));
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO);
      const gltf = new GLTFLoader(tiles.manager);
      gltf.setDRACOLoader(draco);
      tiles.manager.addHandler(/\.gltf$/, gltf);
      tiles.errorTarget = 8;
      if (tiles.downloadQueue) {
        if ("maxJobsPerOrigin" in tiles.downloadQueue) tiles.downloadQueue.maxJobsPerOrigin = 30;
        else tiles.downloadQueue.maxJobs = 30;
      }
      if (tiles.parseQueue) tiles.parseQueue.maxJobs = capacidade().parse;
      const movel = capacidade().movel;
      const mb = +new URLSearchParams(location.search).get("gmb") || capacidade().tilesMB;
      tiles.lruCache.maxBytesSize = mb * 1048576;
      tiles.lruCache.minBytesSize = Math.round(mb * 0.95) * 1048576;
      tiles.autoDisableRendererCulling = true;
      const escena = new THREE.Scene();
      escena.add(tiles.group);
      const s = { tiles, escena, TilesRenderer, dono: null, cor: [1, 1, 1] };
      const atualizaBase = Object.getPrototypeOf(TilesRenderer.prototype).update;
      s.esvaziar = () => {
        if (typeof atualizaBase === "function") atualizaBase.call(tiles);
        else tiles.update();
      };
      s.tomar = (quem, pai, matriz, cam, erro) => {
        if (s.dono !== quem) {
          if (s.dono && s.dono.restauraCache) s.dono.restauraCache();
          s._recFeito = false;
          if (s.recorte) {
            s.recorte.vizN.value = 0;
            s.recorte.mapaR.value.w = 0;
            s.recorte.ret.value.set(1, 1, 0, 0);
          }
          for (const c of [...tiles.cameras]) tiles.deleteCamera(c);
          tiles.setCamera(cam);
          const g2 = tiles.group;
          if (g2.parent !== pai) {
            g2.parent?.remove(g2);
            pai.add(g2);
          }
          s.dono = quem;
        }
        const g = tiles.group;
        g.matrixAutoUpdate = false;
        if (!g.matrix.equals(matriz)) {
          g.matrix.copy(matriz);
          g.matrixWorldNeedsUpdate = true;
          if (s.atualizaRecorte) s.atualizaRecorte();
        } else if (s.dono === quem && s.recorte && s.recorte.ecefParaB5 && !s._recFeito) {
          s._recFeito = true;
          s.atualizaRecorte();
        }
        tiles.errorTarget = erro * C8.erroK;
      };
      s.recorte = {
        liga: { value: 0 },
        min: { value: new THREE.Vector3() },
        max: { value: new THREE.Vector3() },
        paraB5: { value: new THREE.Matrix4() },
        ecefParaB5: null,
        ret: { value: new THREE.Vector4(1, 1, 0, 0) },
        prof: { value: 0 },
        luz: { value: new THREE.Vector3(1, 1, 1) },
        noite: { value: 0 },
        frac: { value: 0.25 },
        grade: { value: new THREE.Vector4(1, 1, 1, 0.18) },
        nit: { value: C8.nitidez },
        viz: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
        vizN: { value: 0 },
        mapa: { value: null },
        mapaR: { value: new THREE.Vector4(0, 0, 0, 0) },
        camB5: { value: new THREE.Vector3() },
        alvoB5: { value: new THREE.Vector3() },
        terr: { value: null },
        terrExt: { value: 0 },
        ang: { value: null },
        angExt: { value: 0 },
        lote: { value: Array.from({ length: 24 }, () => new THREE.Vector2()) },
        loteN: { value: 0 }
      };
      const shaderRecorte = (sh) => {
        sh.uniforms.uLote = s.recorte.lote;
        sh.uniforms.uLoteN = s.recorte.loteN;
        sh.uniforms.uRecLiga = s.recorte.liga;
        sh.uniforms.uRecMin = s.recorte.min;
        sh.uniforms.uRecMax = s.recorte.max;
        sh.uniforms.uParaB5 = s.recorte.paraB5;
        sh.uniforms.uRet = s.recorte.ret;
        sh.uniforms.uProf = s.recorte.prof;
        sh.uniforms.uLuz = s.recorte.luz;
        sh.uniforms.uNoiteG = s.recorte.noite;
        sh.uniforms.uFracG = s.recorte.frac;
        sh.uniforms.uGrade = s.recorte.grade;
        sh.uniforms.uNitG = s.recorte.nit;
        sh.uniforms.uViz = s.recorte.viz;
        sh.uniforms.uVizN = s.recorte.vizN;
        sh.uniforms.uMapaP = s.recorte.mapa;
        sh.uniforms.uMapaR = s.recorte.mapaR;
        sh.uniforms.uCamB5 = s.recorte.camB5;
        sh.uniforms.uAlvoB5 = s.recorte.alvoB5;
        sh.uniforms.uTerr = s.recorte.terr;
        sh.uniforms.uTerrExt = s.recorte.terrExt;
        sh.uniforms.uAng = s.recorte.ang;
        sh.uniforms.uAngExt = s.recorte.angExt;
        sh.vertexShader = "uniform mat4 uParaB5;\nvarying vec3 vB5;\nvarying float vProf;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\nvB5 = (uParaB5 * modelMatrix * vec4(transformed, 1.0)).xyz;\nvProf = -mvPosition.z;");
        sh.fragmentShader = "uniform vec2 uLote[24];\nuniform float uLoteN;\nbool g3dNoLote(vec2 p) { bool d = false; for (int i = 0; i < 24; i++) { if (float(i) >= uLoteN) break; vec2 a = uLote[i], b = uLote[i + 1 < 24 ? i + 1 : 0]; if (float(i + 1) >= uLoteN) b = uLote[0]; if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d; } return d; }\nuniform float uRecLiga;\nuniform vec3 uRecMin;\nuniform vec3 uRecMax;\nuniform vec4 uRet;\nuniform float uProf;\nvarying vec3 vB5;\nvarying float vProf;\nuniform vec4 uGrade;\nuniform float uNitG;\nuniform vec4 uViz[16];\nuniform float uVizN;\nbool g3dNoViz(vec3 p) { for (int i = 0; i < 8; i++) { if (float(i) >= uVizN) break; vec4 a = uViz[2 * i], b = uViz[2 * i + 1]; vec2 d = p.xz - a.xy; vec2 q = vec2(dot(d, b.xy), dot(d, vec2(-b.y, b.x))); if (abs(q.x) < a.z && abs(q.y) < a.w && p.y > b.z && p.y < b.w) return true; } return false; }\n" + GRADE_GLSL + "uniform vec3 uLuz;\nuniform float uNoiteG;\nuniform float uFracG;\nuniform sampler2D uAng;\nuniform float uAngExt;\nfloat g3dH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n" + FANT_GLSL + sh.fragmentShader.replace("#include <map_fragment>", NIT_GLSL).replace("#include <opaque_fragment>", LUZ_GLSL + "\n#include <opaque_fragment>").replace(
          "void main() {",
          "void main() {\n  if (uRecLiga > 0.5 && all(greaterThan(vB5, uRecMin)) && all(lessThan(vB5, uRecMax))) discard;\n  if (uRecLiga > 0.5 && uLoteN > 2.5 && vB5.y > uRecMin.y && vB5.y < uRecMax.y && g3dNoLote(vB5.xz)) discard;\n  if (g3dFantasma(vB5)) discard;\n#ifndef G3D_PLANO\n  if (uVizN > 0.5 && g3dNoViz(vB5)) discard;\n#endif"
        );
      };
      s.shaderRecorte = shaderRecorte;
      new THREE.TextureLoader().load("assets/entorno/fachadas-angulo.webp", (t) => {
        t.colorSpace = THREE.NoColorSpace;
        t.minFilter = t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        s.recorte.ang.value = t;
        s.recorte.angExt.value = PREDIO_CFG.entorno.extensaoFachadas_m;
      }, void 0, () => {
      });
      const recortar = (o) => {
        if (!o.isMesh || !o.material || o.material.__recorte) return;
        const m = o.material;
        m.__recorte = true;
        m.onBeforeCompile = shaderRecorte;
        m.customProgramCacheKey = () => "g3d-recorte";
        m.needsUpdate = true;
      };
      tiles.addEventListener("load-model", (ev) => ev.scene.traverse(recortar));
      tiles.addEventListener("load-model", (ev) => ev.scene.traverse((o) => {
        if (o.isMesh) {
          o.layers.enable(3);
          o.receiveShadow = true;
          o.castShadow = false;
        }
      }));
      tiles.addEventListener("load-model", (ev) => ev.scene.traverse((o) => {
        if (o.isMesh && o.material && o.material.map) o.material.map.anisotropy = C8.aniso;
      }));
      s.aplicarC8 = () => {
        s.recorte.nit.value = C8.nitidez;
        tiles.forEachLoadedModel((sc) => sc.traverse((o) => {
          const x = o.isMesh && o.material && o.material.map;
          if (x && x.anisotropy !== C8.aniso) {
            x.anisotropy = C8.aniso;
            x.needsUpdate = true;
          }
        }));
      };
      s.atualizaRecorte = () => {
        if (!s.recorte.ecefParaB5) return;
        tiles.group.updateMatrixWorld(true);
        s.recorte.paraB5.value.copy(s.recorte.ecefParaB5).multiply(new THREE.Matrix4().copy(tiles.group.matrixWorld).invert());
      };
      s.pintar = () => {
      };
      s.definirLuz = (el) => {
        const L = luzDaCidade(el), Gr = gradeGoogle(el);
        s.recorte.luz.value.set(L.base[0], L.base[1], L.base[2]);
        s.recorte.noite.value = L.luzes;
        s.recorte.grade.value.set(Gr.expo, Gr.contraste, Gr.sat, Gr.pivo);
        STATUS.luz = { el: Number.isFinite(el) ? +el.toFixed(2) : null, base: L.base.map((x) => +x.toFixed(4)), luzes: +L.luzes.toFixed(4), grade: Gr };
      };
      await new Promise((ok, falha) => {
        const t = setTimeout(() => falha(new Error("timeout da raiz")), 2e4);
        const aoRaiz = () => {
          clearTimeout(t);
          STATUS.raiz++;
          tiles.removeEventListener("load-root-tileset", aoRaiz);
          ok();
        };
        tiles.addEventListener("load-root-tileset", aoRaiz);
        const aoErro = (ev) => {
          clearTimeout(t);
          tiles.removeEventListener("load-error", aoErro);
          falha(ev.error || new Error("load-error"));
        };
        tiles.addEventListener("load-error", aoErro);
        const cam = new THREE.PerspectiveCamera(60, 1, 1, 1e3);
        cam.updateMatrixWorld();
        tiles.setCamera(cam);
        tiles.setResolution(cam, 256, 256);
        tiles.update();
        s._camInicial = cam;
      });
      tiles.deleteCamera(s._camInicial);
      tiles.addEventListener("load-error", (ev) => {
        STATUS.erro = String(ev.error && ev.error.message || ev.error).slice(0, 160);
      });
      STATUS.estado = "pronto";
      return s;
    } catch (e) {
      STATUS.estado = "falhou";
      STATUS.erro = String(e && e.message || e).slice(0, 160);
      return null;
    }
  })();
  return sessao;
}
class VistaGoogle {
  constructor(renderer, s, ref, aoMudar) {
    this.r = renderer;
    this.s = s;
    this.ref = ref;
    this.aoMudar = aoMudar || (() => {
    });
    this.cam = new THREE.PerspectiveCamera(60, 1, 3, 2e4);
    this.camSel = new THREE.PerspectiveCamera(60, 1, 3, RAIO);
    this.dirs = null;
    this.mascaraFonte = null;
    this.rt = null;
    this.ativo = true;
    this.ocioso = 0;
    this.larg = 0;
    this.alt = 0;
    this.escala = 1;
    this.alvoDir = new THREE.Vector3(0, 0, -1);
    this.ligaNaCena();
    this._aoCarregar = () => this.acordar();
    for (const ev of ["load-model", "tiles-load-end", "needs-update", "tile-visibility-change"]) s.tiles.addEventListener(ev, this._aoCarregar);
    this.credito = this.montaCredito();
  }
  ligaNaCena() {
    const { lat, lon, h, ajuste } = this.ref;
    this.matriz = matrizLocal(lat, lon, h, ajuste && ajuste.enu || []);
  }
  dirParaL(dx, dy, dz) {
    const f = -dx, r = -dz;
    const b = (this.ref.rumo + (this.ref.ajuste && this.ref.ajuste.rumo || 0)) * Math.PI / 180;
    const E = Math.sin(b) * f + Math.sin(b + Math.PI / 2) * r, N = Math.cos(b) * f + Math.cos(b + Math.PI / 2) * r;
    return new THREE.Vector3(E, dy, -N);
  }
  tamanho(w, h, escala) {
    this.larg = Math.max(2, Math.round(w * escala));
    this.alt = Math.max(2, Math.round(h * escala));
    this.escala = escala;
    const ns = C8.msaa ? Math.min(C8.msaa, this.r.capabilities.maxSamples || 0) : 0;
    if (this.rt && (this.rt.width !== this.larg || this.rt.height !== this.alt || this.rt.samples !== ns)) {
      this.rt.dispose();
      this.rt = null;
    }
    if (this.rtV && (this.rtV.width !== this.larg || this.rtV.height !== this.alt || this.rtV.samples !== ns)) {
      this.rtV.dispose();
      this.rtV = null;
    }
    if (!this.rt) {
      const gl = this.r.getContext();
      const half = this.r.capabilities.isWebGL2 && (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
      this.rt = new THREE.WebGLRenderTarget(this.larg, this.alt, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: false, samples: ns });
      this.rt.texture.colorSpace = half ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    }
    this.resW = w;
    this.resH = h;
  }
  definirMascara(img) {
    if (!img || img === this.mascaraFonte) return;
    this.mascaraFonte = img;
    const W = 256, H = 128, c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, out = [];
    for (let r = 0; r < H; r++) for (let k = 0; k < W; k++) {
      if (px[(r * W + k) * 4] < 64) continue;
      const phi = (k + 0.5) / W * 2 * Math.PI, th = Math.PI * (1 - (r + 0.5) / H);
      out.push(Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    }
    this.dirs = new Float32Array(out);
  }
  definirVidro(img) {
    if (!img || img === this.vidroFonte) return;
    this.vidroFonte = img;
    const W = 256, H = 128, c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, out = [];
    for (let r = 0; r < H; r++) for (let k = 0; k < W; k++) {
      if (px[(r * W + k) * 4] < 64) continue;
      const phi = (k + 0.5) / W * 2 * Math.PI, th = Math.PI * (1 - (r + 0.5) / H);
      out.push(Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    }
    this.dirsV = new Float32Array(out);
  }
  vidroNaTela(camera) {
    return this.dirsV ? this.janelaNaTela(camera, this.dirsV) : { x0: -1, y0: -1, x1: 1, y1: 1 };
  }
  janelaNaTela(camera, dirs) {
    const d = dirs || this.dirs;
    if (!d) return { x0: -1, y0: -1, x1: 1, y1: 1 };
    const m = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
    let x0 = 2, y0 = 2, x1 = -2, y1 = -2, n = 0;
    for (let i = 0; i < d.length; i += 3) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      const vx = m[0] * x + m[4] * y + m[8] * z, vy = m[1] * x + m[5] * y + m[9] * z, vz = m[2] * x + m[6] * y + m[10] * z;
      if (vz > -0.05) continue;
      const w = -vz, sx = (p[0] * vx + p[8] * vz) / w, sy = (p[5] * vy + p[9] * vz) / w;
      if (sx < -1.2 || sx > 1.2 || sy < -1.2 || sy > 1.2) continue;
      n++;
      if (sx < x0) x0 = sx;
      if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy;
      if (sy > y1) y1 = sy;
    }
    if (!n) return null;
    const mg = 0.06, cl = (v) => Math.max(-1, Math.min(1, v));
    return { x0: cl(x0 - mg), y0: cl(y0 - mg), x1: cl(x1 + mg), y1: cl(y1 + mg) };
  }
  desenha(dir, fov, aspect, janela, soCarregar = false, dirV = null) {
    if (!this.rt) return;
    const d = this.dirParaL(dir.x, dir.y, dir.z);
    this.cam.position.set(0, 0, 0);
    this.cam.up.set(0, 1, 0);
    this.cam.fov = fov;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(d);
    this.cam.updateMatrixWorld(true);
    if (this.s.dono !== this) this.s.pintar([1, 1, 1]);
    const j = janela || { x0: -1, y0: -1, x1: 1, y1: 1 }, cs = this.camSel, W = this.resW, H = this.resH;
    const px = Math.floor((j.x0 + 1) / 2 * W), py = Math.floor((1 - j.y1) / 2 * H);
    const pw = Math.max(2, Math.ceil((j.x1 - j.x0) / 2 * W)), ph = Math.max(2, Math.ceil((j.y1 - j.y0) / 2 * H));
    cs.position.copy(this.cam.position);
    cs.quaternion.copy(this.cam.quaternion);
    cs.up.copy(this.cam.up);
    cs.fov = fov;
    cs.aspect = aspect;
    cs.setViewOffset(W, H, px, py, pw, ph);
    cs.updateProjectionMatrix();
    cs.updateMatrixWorld(true);
    this.janela = { px, py, pw, ph };
    this.s.tomar(this, this.s.escena, this.matriz, cs, ERRO_360);
    this.s.tiles.setResolution(cs, pw, ph);
    const T = this.s.tiles;
    if (dirV && !soCarregar) {
      if (!this.camV) {
        this.camV = new THREE.PerspectiveCamera(60, 1, 3, 2e4);
        this.camSelV = new THREE.PerspectiveCamera(60, 1, 3, RAIO);
      }
      if (!this.rtV) {
        this.rtV = this.rt.clone();
        this.rtV.texture.colorSpace = this.rt.texture.colorSpace;
      }
      const cv = this.camV, sv = this.camSelV;
      cv.position.set(0, 0, 0);
      cv.up.set(0, 1, 0);
      cv.fov = fov;
      cv.aspect = aspect;
      cv.updateProjectionMatrix();
      cv.lookAt(this.dirParaL(dirV.x, dirV.y, dirV.z));
      cv.updateMatrixWorld(true);
      sv.position.copy(cv.position);
      sv.quaternion.copy(cv.quaternion);
      sv.up.copy(cv.up);
      sv.fov = fov;
      sv.aspect = aspect;
      sv.updateProjectionMatrix();
      sv.updateMatrixWorld(true);
      if (!T.cameras.includes(sv)) T.setCamera(sv);
      T.setResolution(sv, W, H);
    } else if (this.camSelV && T.cameras.includes(this.camSelV)) T.deleteCamera(this.camSelV);
    this.planosPreparar();
    const assa = !soCarregar && this._planosPasso(false);
    this._planosAplica();
    this.s.escena.updateMatrixWorld(true);
    this.s.tiles.update();
    if (soCarregar) {
      const st2 = this.s.tiles.stats;
      if (st2.queued + st2.downloading + st2.parsing > 0 || this.s.tiles.loadProgress < 1) this.acordar();
      return;
    }
    const r = this.r, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    const rtAnt = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.setClearColor(0, 0);
    r.clear();
    r.render(this.s.escena, this.cam);
    if (dirV && this.rtV) {
      r.setRenderTarget(this.rtV);
      r.clear();
      r.render(this.s.escena, this.camV);
    }
    r.setRenderTarget(rtAnt);
    r.setClearColor(cc, ca);
    if (assa) this._planosDepois();
    const st = this.s.tiles.stats;
    STATUS.tiles = st ? st.visible || 0 : 0;
    if (st && (st.queued + st.downloading + st.parsing > 0 || this.s.tiles.loadProgress < 1)) this.acordar();
    this.atualizaCredito();
  }
  facesDaJanela() {
    const out = [], d = this.dirs, v = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const cam = this.foto.cams[i];
      let n = 0;
      if (d) for (let k = 0; k < d.length; k += 3) {
        v.copy(this.dirParaL(d[k], d[k + 1], d[k + 2])).multiplyScalar(100).project(cam);
        if (v.z < 1 && v.z > -1 && Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02) n++;
      }
      else n = 1;
      if (n) out.push([i, n]);
    }
    return out.sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]);
  }
  passoFoto() {
    if (!this.foto) {
      const eixos = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], ups = [[0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, 1, 0]];
      const cams = eixos.map((e, i) => {
        const c = new THREE.PerspectiveCamera(90, 1, 3, RAIO);
        c.up.set(...ups[i]);
        c.lookAt(...e);
        c.updateMatrixWorld(true);
        return c;
      });
      this.foto = { cams, alvos: [], chave: null, faces: [], i: 0, reg: 0, t0: 0, feito: false, prog: 0, mats: [] };
    }
    const F2 = this.foto, ref = this.ref, agora = performance.now();
    const chave = this.unidadeChave || [ref.lat, ref.lon, ref.h, ref.rumo].join("|");
    const alvo = (lado) => {
      const c = new THREE.WebGLRenderTarget(lado, lado, { type: THREE.UnsignedByteType, generateMipmaps: false, depthBuffer: true });
      c.texture.colorSpace = THREE.SRGBColorSpace;
      c.texture.minFilter = c.texture.magFilter = THREE.LinearFilter;
      return c;
    };
    if (chave === F2.chave && this.dirs !== F2.dirsVistos) {
      F2.dirsVistos = this.dirs;
      const falta = this.facesDaJanela().filter((f) => !F2.faces.includes(f)).slice(0, 4 - F2.faces.length);
      if (falta.length) {
        if (F2.feito) {
          F2.i = F2.faces.length;
          F2.reg = 0;
          F2.fila = null;
          F2.t0 = agora;
          F2.feito = false;
          this.restauraCache();
          const c = this.s.tiles.lruCache;
          this._guardaCache();
          c.minBytesSize = 0;
          c.unloadPercent = 1;
          c.maxBytesSize = Math.max(c.maxBytesSize, FOTO_MB);
          try {
            localStorage.setItem(chaveLocal("tabela3d-foto-ativa"), String(Date.now()));
          } catch (e) {
          }
        }
        for (const f of falta) {
          F2.faces.push(f);
          F2.alvos.push({ A: alvo(FOTO_LADO), W: alvo(FOTO_LADO_W) });
          F2.mats.push(new THREE.Matrix4().multiplyMatrices(F2.cams[f].projectionMatrix, F2.cams[f].matrixWorldInverse));
        }
      }
    }
    if (chave !== F2.chave) {
      F2.chave = chave;
      F2.dirsVistos = this.dirs;
      F2.matriz = this.matriz.clone();
      F2.faces = this.facesDaJanela();
      F2.i = 0;
      F2.reg = 0;
      F2.t0 = agora;
      F2.feito = false;
      F2.log = [];
      F2.fila = null;
      F2.extras = false;
      F2.fundo = false;
      for (const a of F2.alvos) {
        a.A.dispose();
        a.W.dispose();
      }
      F2.alvos = F2.faces.map(() => ({ A: alvo(FOTO_LADO), W: alvo(FOTO_LADO_W) }));
      F2.mats = F2.faces.map((f) => new THREE.Matrix4().multiplyMatrices(F2.cams[f].projectionMatrix, F2.cams[f].matrixWorldInverse));
      F2.limpos = /* @__PURE__ */ new Set();
      try {
        localStorage.setItem(chaveLocal("tabela3d-foto-ativa"), String(Date.now()));
      } catch (e) {
      }
      if (!window.__g3dSaida) {
        window.__g3dSaida = true;
        addEventListener("pagehide", () => {
          try {
            localStorage.removeItem(chaveLocal("tabela3d-foto-ativa"));
          } catch (e) {
          }
        });
      }
      this.pronto = false;
      this.restauraCache();
      {
        const c = this.s.tiles.lruCache;
        this._guardaCache();
        c.minBytesSize = 0;
        c.unloadPercent = 1;
        c.maxBytesSize = Math.max(c.maxBytesSize, FOTO_MB);
      }
    }
    if (F2.feito || !F2.faces.length) {
      if (!F2.faces.length && !F2.feito) {
        F2.feito = true;
      }
      return;
    }
    this.planosPreparar();
    if (this.planos && this.planos.estado !== "pronto" && this.planos.estado !== "off") {
      if (this.planos.estado === "assando") {
        const fc = this.planos.faces[this.planos.i];
        this.s.tomar(this, this.s.escena, F2.matriz || this.matriz, fc.cam || F2.cams[0], ERRO_FOTO);
        if (this._planosPasso(true)) {
          this.s.escena.updateMatrixWorld(true);
          this.s.tiles.update();
          this._planosDepois();
        }
      }
      this.acordar();
      return;
    }
    const N = FOTO_N, L = FOTO_LADO;
    if (!F2.fila) {
      F2.fila = [];
      for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) F2.fila.push([k * L / N, j * L / N, L / N]);
      F2.feitosF = 0;
    }
    const [x, y, w] = F2.fila[0];
    const t = this.s.tiles, base = F2.cams[F2.faces[F2.i]];
    if (!F2.sel) F2.sel = new THREE.PerspectiveCamera(90, 1, 3, RAIO);
    const cam = F2.sel;
    cam.quaternion.copy(base.quaternion);
    cam.position.set(0, 0, 0);
    cam.up.copy(base.up);
    cam.setViewOffset(L, L, x, y, w, w);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.s.tomar(this, this.s.escena, F2.matriz || this.matriz, cam, ERRO_FOTO);
    this._planosAplica();
    if (t.cameras.length !== 1 || t.cameras[0] !== cam) {
      for (const c of [...t.cameras]) t.deleteCamera(c);
      t.setCamera(cam);
    }
    t.setResolution(cam, w, w);
    this.s.escena.updateMatrixWorld(true);
    t.update();
    const st = t.stats, pend = st.queued + st.downloading + st.parsing, tempo = agora - F2.t0;
    F2.prog = (F2.i + Math.min(0.99, F2.feitosF / (L * L))) / F2.faces.length;
    F2.semFila = pend === 0 ? (F2.semFila || 0) + 1 : 0;
    F2.quietos = pend === 0 && (t.loadProgress === void 0 || t.loadProgress >= 1 || F2.semFila >= 30) ? (F2.quietos || 0) + 1 : 0;
    const cheio = t.lruCache.isFull();
    if (cheio && w > FOTO_MIN && tempo > 300) {
      F2.fila.shift();
      const h = w / 2;
      F2.fila.unshift([x, y, h], [x + h, y, h], [x, y + h, h], [x + h, y + h, h]);
      const c = t.lruCache, mx = c.maxBytesSize;
      for (const k of [...t.cameras]) t.deleteCamera(k);
      c.maxBytesSize = 1;
      this.s.esvaziar();
      c.maxBytesSize = mx;
      F2.t0 = agora;
      F2.quietos = 0;
      this.acordar();
      return;
    }
    if (F2.quietos >= 3 && tempo > 200 || cheio && pend === 0 && tempo > 12e3 || tempo > 6e4) {
      F2.quietos = 0;
      F2.log.push({ f: F2.faces[F2.i], r: F2.reg, ms: Math.round(tempo), cheio: t.lruCache.isFull(), mb: Math.round(t.lruCache.cachedBytes / 1048576), vis: st.visible });
      const r = this.r, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), ant = r.getRenderTarget(), al = F2.alvos[F2.i];
      const R = this.s.recorte, luz0 = R.luz.value.clone(), noite0 = R.noite.value, grade0 = R.grade.value.clone();
      r.setClearColor(0, 0);
      const pinta = (rt, lado, ms) => {
        const k = lado / L, vx = Math.round(x * k), vy = Math.round((L - y - w) * k), vw = Math.round(w * k);
        if (!F2.limpos.has(rt)) {
          F2.limpos.add(rt);
          rt.scissorTest = false;
          rt.viewport.set(0, 0, lado, lado);
          r.setRenderTarget(rt);
          r.clear();
        }
        if (ms) {
          r.setRenderTarget(this._alvoMS(vw));
          r.clear();
          r.render(this.s.escena, cam);
        }
        rt.viewport.set(vx, vy, vw, vw);
        rt.scissor.set(vx, vy, vw, vw);
        rt.scissorTest = true;
        r.setRenderTarget(rt);
        r.clear();
        if (ms) r.render(this._copiaMS.cena, this._copiaMS.cam);
        else r.render(this.s.escena, cam);
        rt.scissorTest = false;
        rt.viewport.set(0, 0, lado, lado);
      };
      R.luz.value.set(1, 1, 1);
      R.noite.value = 0;
      R.grade.value.set(1, 1, 1, 0.18);
      pinta(al.A, FOTO_LADO, C8.msaa > 0);
      R.luz.value.set(0, 0, 0);
      R.noite.value = 1;
      pinta(al.W, FOTO_LADO_W);
      R.luz.value.copy(luz0);
      R.noite.value = noite0;
      R.grade.value.copy(grade0);
      r.setRenderTarget(ant);
      r.setClearColor(cc, ca);
      this.atualizaCredito();
      {
        const c = t.lruCache, mx = c.maxBytesSize;
        if (c.cachedBytes > mx * 0.7) {
          for (const k of [...t.cameras]) t.deleteCamera(k);
          c.maxBytesSize = 1;
          this.s.esvaziar();
          c.maxBytesSize = mx;
        }
      }
      F2.fila.shift();
      F2.feitosF += w * w;
      F2.reg++;
      F2.t0 = agora;
      if (!F2.fila.length) {
        F2.fila = null;
        F2.reg = 0;
        F2.i++;
      }
      if (F2.i >= 1 && !this.pronto) {
        this.pronto = true;
        this.tPronto = agora;
      }
      if (F2.i >= F2.faces.length && !F2.extras && F2.faces.length < 4) {
        F2.extras = true;
        const p0 = F2.faces[0], viz = p0 < 2 ? [4, 5] : p0 > 3 ? [0, 1] : [];
        const add = [...viz, 3].filter((f) => !F2.faces.includes(f)).slice(0, 4 - F2.faces.length);
        const alvo2 = (lado) => {
          const c = new THREE.WebGLRenderTarget(lado, lado, { type: THREE.UnsignedByteType, generateMipmaps: false, depthBuffer: true });
          c.texture.colorSpace = THREE.SRGBColorSpace;
          c.texture.minFilter = c.texture.magFilter = THREE.LinearFilter;
          return c;
        };
        for (const f of add) {
          F2.faces.push(f);
          F2.alvos.push({ A: alvo2(FOTO_LADO), W: alvo2(FOTO_LADO_W) });
          F2.mats.push(new THREE.Matrix4().multiplyMatrices(F2.cams[f].projectionMatrix, F2.cams[f].matrixWorldInverse));
        }
        if (add.length) {
          F2.fundo = true;
          if (!this.pronto) {
            this.pronto = true;
            this.tPronto = agora;
          }
        }
      }
      if (F2.i >= F2.faces.length) {
        F2.feito = true;
        this._soltaMS();
        cam.clearViewOffset();
        if (!this.pronto) {
          this.pronto = true;
          this.tPronto = agora;
        }
        STATUS.tiles = st.visible || 0;
        if (capacidade().nivel === "topo") this.restauraCache();
        else this.soltaCache();
        try {
          localStorage.removeItem(chaveLocal("tabela3d-foto-ativa"));
        } catch (e) {
        }
      }
    }
    this.acordar();
  }
  _alvoMS(lado) {
    const ns = Math.min(C8.msaa, this.r.capabilities.maxSamples || 0);
    if (!this._ms || this._ms.width !== lado || this._ms.samples !== ns) {
      if (this._ms) this._ms.dispose();
      this._ms = new THREE.WebGLRenderTarget(lado, lado, { type: THREE.UnsignedByteType, samples: ns, generateMipmaps: false, depthBuffer: true });
      this._ms.texture.colorSpace = THREE.SRGBColorSpace;
      this._ms.texture.minFilter = this._ms.texture.magFilter = THREE.NearestFilter;
    }
    if (!this._copiaMS) {
      const m = new THREE.ShaderMaterial({
        uniforms: { t: { value: null } },
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: "uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv);\n#include <colorspace_fragment>\n}"
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      q.frustumCulled = false;
      const cena = new THREE.Scene();
      cena.add(q);
      this._copiaMS = { cena, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), m };
    }
    this._copiaMS.m.uniforms.t.value = this._ms.texture;
    return this._ms;
  }
  _soltaMS() {
    if (this._ms) {
      this._ms.dispose();
      this._ms = null;
    }
  }
  planosPreparar() {
    const R = this.s.recorte;
    if (!C8.planos || !R.ecefParaB5 || !this.matriz) {
      if (this.planos) this.planosLimpa();
      return;
    }
    const chave = (this.unidadeChave || [this.ref.lat, this.ref.lon, this.ref.h].join("|")) + "|" + C8.planosR;
    if (this.planos && this.planos.chave === chave) return;
    this.planosLimpa();
    const P = this.planos = { chave, estado: "dados", faces: [], caixas: [], i: 0 };
    if (!PLANOS_DADOS) PLANOS_DADOS = fetch("assets/entorno/vizinhos-planos.json").then((r) => r.ok ? r.json() : null).catch(() => null);
    PLANOS_DADOS.then((D) => {
      if (this.planos !== P) return;
      if (!D || !D.partes) {
        P.estado = "off";
        return;
      }
      this._planosMonta(D);
      this.acordar();
    });
  }
  _planosMonta(D) {
    const P = this.planos, R = this.s.recorte;
    const paraB5 = new THREE.Matrix4().copy(R.ecefParaB5).multiply(this.matriz.clone().invert());
    const olho = new THREE.Vector3(0, 0, 0).applyMatrix4(paraB5);
    P.olho = olho.toArray().map((x) => +x.toFixed(2));
    const dist = (p) => {
      const c = Math.cos(p.a), s = Math.sin(p.a), dx = olho.x - p.c[0], dz = olho.z - p.c[1];
      const qx = dx * c + dz * s, qz = -dx * s + dz * c;
      return Math.hypot(Math.max(Math.abs(qx) - p.h[0], 0), Math.max(Math.abs(qz) - p.h[1], 0));
    };
    const sel = D.partes.filter((p) => p.fill >= 0.7 && p.y[1] - p.y[0] >= 6).map((p) => ({ p, d: dist(p) })).filter((x) => x.d < C8.planosR && x.d > 2).sort((a, b) => a.d - b.d).slice(0, 8);
    const Y = new THREE.Vector3(0, 1, 0);
    for (const { p, d } of sel) {
      const c = Math.cos(p.a), s = Math.sin(p.a), U = new THREE.Vector3(c, 0, s), W = new THREE.Vector3(-s, 0, c);
      const C0 = new THREE.Vector3(p.c[0], (p.y[0] + p.y[1]) / 2, p.c[1]), alt = p.y[1] - p.y[0];
      P.caixas.push({ id: p.id, n: p.n, d: +d.toFixed(1), c: p.c, h: p.h, a: p.a, y: p.y });
      for (const [N, hn, ho] of [[U, p.h[0], p.h[1]], [U.clone().negate(), p.h[0], p.h[1]], [W, p.h[1], p.h[0]], [W.clone().negate(), p.h[1], p.h[0]]]) {
        const centro = C0.clone().addScaledVector(N, hn);
        if (new THREE.Vector3().subVectors(olho, centro).dot(N) < 0.5) continue;
        const dirF = N.clone().negate(), dir = new THREE.Vector3().crossVectors(dirF, Y).normalize();
        P.faces.push({ id: p.id, centro, n: N.clone(), up: Y.clone(), dir, larg: 2 * ho, alt });
      }
      if (olho.y > p.y[1] + 1) {
        const centro = new THREE.Vector3(p.c[0], p.y[1], p.c[1]), dir = new THREE.Vector3().crossVectors(new THREE.Vector3(0, -1, 0), W).normalize();
        P.faces.push({ id: p.id, centro, n: Y.clone(), up: W.clone(), dir, larg: 2 * p.h[0], alt: 2 * p.h[1], teto: true });
      }
    }
    P.estado = P.faces.length ? "assando" : "off";
    P.t0 = performance.now();
    if (typeof window !== "undefined") window.__g3dPlanos = { olho: P.olho, caixas: P.caixas, faces: P.faces.length };
  }
  _planosParaL() {
    return new THREE.Matrix4().copy(this.s.tiles.group.matrix).multiply(new THREE.Matrix4().copy(this.s.recorte.ecefParaB5).invert());
  }
  _planosPasso(exclusivo) {
    const P = this.planos;
    if (!P || P.estado !== "assando") return false;
    const t = this.s.tiles, f = P.faces[P.i], ML = this._planosParaL(), D = 10;
    if (!f.cam) {
      f.w = Math.max(32, Math.min(1024, Math.round(f.larg * C8.planosPx)));
      f.h = Math.max(32, Math.min(1024, Math.round(f.alt * C8.planosPx)));
      f.cam = new THREE.OrthographicCamera(-f.larg / 2, f.larg / 2, f.alt / 2, -f.alt / 2, D - 5, D + 6);
      f.rt = new THREE.WebGLRenderTarget(f.w, f.h, { type: THREE.UnsignedByteType, generateMipmaps: true, depthBuffer: true, samples: Math.min(4, this.r.capabilities.maxSamples || 0) });
      f.rt.texture.colorSpace = THREE.SRGBColorSpace;
      f.rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
      f.rt.texture.magFilter = THREE.LinearFilter;
      f.rt.texture.anisotropy = 8;
      f.t0 = performance.now();
      f.q = 0;
    }
    const pos = f.centro.clone().addScaledVector(f.n, D).applyMatrix4(ML), alvo = f.centro.clone().applyMatrix4(ML);
    f.cam.position.copy(pos);
    f.cam.up.copy(f.up).transformDirection(ML);
    f.cam.lookAt(alvo);
    f.cam.updateMatrixWorld(true);
    if (exclusivo) {
      if (t.cameras.length !== 1 || t.cameras[0] !== f.cam) {
        for (const c of [...t.cameras]) t.deleteCamera(c);
        t.setCamera(f.cam);
      }
    } else if (!t.cameras.includes(f.cam)) t.setCamera(f.cam);
    t.setResolution(f.cam, f.w, f.h);
    return true;
  }
  _planosDepois() {
    const P = this.planos;
    if (!P || P.estado !== "assando") return;
    const t = this.s.tiles, f = P.faces[P.i], st = t.stats, pend = st.queued + st.downloading + st.parsing, agora = performance.now();
    f.q = pend === 0 ? f.q + 1 : 0;
    if (!(f.q >= 4 && agora - f.t0 > 300 || agora - f.t0 > 2e4)) {
      this.acordar();
      return;
    }
    const r = this.r, R = this.s.recorte, ant = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    const luz0 = R.luz.value.clone(), noite0 = R.noite.value, grade0 = R.grade.value.clone(), viz0 = R.vizN.value;
    R.luz.value.set(1, 1, 1);
    R.noite.value = 0;
    R.grade.value.set(1, 1, 1, 0.18);
    R.vizN.value = 0;
    if (this._planosG) this._planosG.visible = false;
    this.s.escena.updateMatrixWorld(true);
    r.setRenderTarget(f.rt);
    r.setClearColor(0, 0);
    r.clear();
    r.render(this.s.escena, f.cam);
    r.setRenderTarget(ant);
    r.setClearColor(cc, ca);
    R.luz.value.copy(luz0);
    R.noite.value = noite0;
    R.grade.value.copy(grade0);
    R.vizN.value = viz0;
    if (this._planosG) this._planosG.visible = true;
    if (t.cameras.includes(f.cam)) t.deleteCamera(f.cam);
    f.ms = Math.round(agora - f.t0);
    P.i++;
    if (P.i >= P.faces.length) this._planosFim();
    this.acordar();
  }
  _planosFim() {
    const P = this.planos, g = this._planosG = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.name = "g3d-planos";
    for (const f of P.faces) {
      const a = f.dir.clone().multiplyScalar(f.larg / 2), b = f.up.clone().multiplyScalar(f.alt / 2), c = f.centro;
      const v = [c.clone().sub(a).sub(b), c.clone().add(a).sub(b), c.clone().add(a).add(b), c.clone().sub(a).add(b)];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(v.flatMap((p) => p.toArray()), 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const m = new THREE.MeshBasicMaterial({ map: f.rt.texture, side: THREE.DoubleSide, color: C8.planosDbg ? 16740464 : 16777215 });
      m.onBeforeCompile = (sh) => {
        this.s.shaderRecorte(sh);
        sh.fragmentShader = "#define G3D_PLANO\n" + sh.fragmentShader.replace(NIT_GLSL, PLANO_MAP_GLSL);
      };
      m.customProgramCacheKey = () => "g3d-plano";
      const me = new THREE.Mesh(geo, m);
      me.frustumCulled = false;
      g.add(me);
    }
    this.s.escena.add(g);
    P.estado = "pronto";
    P.ms = Math.round(performance.now() - P.t0);
    if (typeof window !== "undefined" && window.__g3dPlanos) {
      window.__g3dPlanos.ms = P.ms;
      window.__g3dPlanos.pronto = true;
    }
  }
  _planosAplica() {
    const P = this.planos, R = this.s.recorte;
    if (!P || P.estado !== "pronto" || !this._planosG) {
      R.vizN.value = 0;
      return;
    }
    this._planosG.matrix.copy(this._planosParaL());
    this._planosG.matrixWorldNeedsUpdate = true;
    P.caixas.forEach((k, i) => {
      R.viz.value[2 * i].set(k.c[0], k.c[1], k.h[0] + 1.5, k.h[1] + 1.5);
      R.viz.value[2 * i + 1].set(Math.cos(k.a), Math.sin(k.a), k.y[0] + 0.5, k.y[1] + 0.3);
    });
    R.vizN.value = P.caixas.length;
  }
  planosLimpa() {
    const P = this.planos;
    this.planos = null;
    this.s.recorte.vizN.value = 0;
    if (this._planosG) {
      this.s.escena.remove(this._planosG);
      this._planosG.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      this._planosG = null;
    }
    if (P) for (const f of P.faces) {
      if (f.rt) f.rt.dispose();
      if (f.cam && this.s.tiles.cameras.includes(f.cam)) this.s.tiles.deleteCamera(f.cam);
    }
  }
  refazerFoto() {
    if (this.foto) {
      this.foto.chave = null;
      this.foto.feito = false;
    }
    this.acordar();
  }
  _guardaCache() {
    const c = this.s.tiles.lruCache;
    if (!this._cache0) this._cache0 = { min: c.minBytesSize, max: c.maxBytesSize, pct: c.unloadPercent };
  }
  soltaCache() {
    if (capacidade().nivel === "topo") return;
    const t = this.s.tiles, c = t.lruCache;
    this._guardaCache();
    for (const k of [...t.cameras]) t.deleteCamera(k);
    c.minBytesSize = 0;
    c.maxBytesSize = 1;
    c.unloadPercent = 1;
    this.s.esvaziar();
    this._solto = true;
  }
  restauraCache() {
    if (!this._cache0) return;
    const c = this.s.tiles.lruCache;
    c.minBytesSize = this._cache0.min;
    c.maxBytesSize = this._cache0.max;
    c.unloadPercent = this._cache0.pct;
    this._solto = false;
  }
  progressoFoto(ver) {
    const el = this.carga, F2 = this.foto;
    if (!el || !F2) return;
    const mostra = ver && !F2.feito && !F2.fundo;
    if (el.hidden === mostra) el.hidden = !mostra;
    if (mostra) el.querySelector("b").style.width = Math.round(4 + 96 * F2.prog) + "%";
  }
  opacidade() {
    return this.pronto ? Math.min(1, (performance.now() - this.tPronto) / 800) : 0;
  }
  progresso(janelaNaTela) {
    const st = this.s.tiles.stats, pend = st.queued + st.downloading + st.parsing, el = this.carga;
    if (!el) return;
    const barra = el.querySelector("b");
    if (pend > 0) {
      if (!this._lote) this._lote = { base: st.loaded, p: 0 };
      const feitos = Math.max(0, st.loaded - this._lote.base);
      this._lote.p = Math.max(this._lote.p, feitos / (feitos + pend));
      clearTimeout(this._some);
      this._some = 0;
    }
    this._quieto = pend === 0 ? (this._quieto || 0) + 1 : 0;
    const feitosL = this._lote ? Math.max(0, st.loaded - this._lote.base) : 0;
    const loteOk = !!this._lote && feitosL + pend >= 200 && feitosL / (feitosL + pend) >= 0.85;
    if (!this.pronto && st.visible > 0 && (pend === 0 && this._quieto >= 15 || loteOk || st.visible >= 100 || this.s.tiles.lruCache.isFull())) {
      this.pronto = true;
      this.tPronto = performance.now();
    }
    if (pend === 0) {
      if (this._lote && !this._some) {
        barra.style.width = "100%";
        this._some = setTimeout(() => {
          el.hidden = true;
          this._lote = null;
          this._some = 0;
        }, 900);
      }
      return;
    }
    const ver = !!janelaNaTela;
    if (el.hidden === ver) el.hidden = !ver;
    if (ver) barra.style.width = Math.round(4 + 96 * this._lote.p) + "%";
  }
  acordar() {
    this.ocioso = 0;
    if (this._laco || !this.ativo) return;
    const passo = () => {
      this._laco = 0;
      if (!this.ativo) return;
      const t = this.s.tiles, st = t.stats || {};
      const ocupado = (st.queued || 0) + (st.downloading || 0) + (st.parsing || 0) > 0 || t.loadProgress !== void 0 && t.loadProgress < 1;
      this.aoMudar();
      this.ocioso = ocupado ? 0 : this.ocioso + 1;
      if (this.ocioso < 30 && !this._laco) this._laco = requestAnimationFrame(passo);
    };
    this._laco = requestAnimationFrame(passo);
  }
  montaCredito() {
    const d = document.createElement("div");
    d.className = "t360-g3d g3d-cred";
    d.innerHTML = htmlCredito("Vista da janela: Google Maps<br>apartamento: render ilustrativo");
    this.carga = document.createElement("div");
    this.carga.className = "t360-g3d-carga";
    this.carga.hidden = true;
    this.carga.innerHTML = "<span>Montando a vista real da cidade</span><i><b></b></i>";
    return d;
  }
  atualizaCredito() {
    const out = [];
    this.s.tiles.getAttributions(out);
    const txt = textoDados(out);
    const el = this.credito.querySelector(".g3d-attr");
    if (el && el.textContent !== txt) el.textContent = txt;
  }
  liberar() {
    this.ativo = false;
    if (this._laco) cancelAnimationFrame(this._laco);
    for (const ev of ["load-model", "tiles-load-end", "needs-update", "tile-visibility-change"]) this.s.tiles.removeEventListener(ev, this._aoCarregar);
    if (this.s.dono === this) {
      for (const c of [...this.s.tiles.cameras]) this.s.tiles.deleteCamera(c);
      this.s.dono = null;
    }
    if (this.rt) this.rt.dispose();
    if (this.rtV) this.rtV.dispose();
    if (this.foto) {
      for (const a of this.foto.alvos) {
        a.A.dispose();
        a.W.dispose();
      }
      this.foto = null;
    }
    this._soltaMS();
    this.planosLimpa();
    try {
      localStorage.removeItem(chaveLocal("tabela3d-foto-ativa"));
    } catch (e) {
    }
    this.restauraCache();
    this.credito.remove();
    if (this.carga) this.carga.remove();
  }
}
const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tG;
uniform sampler2D tM;
uniform vec2 res;
uniform vec3 ganho;
uniform float forca;
uniform vec3 ceuTopo;
uniform vec3 ceuHoriz;
uniform sampler2D fA0; uniform sampler2D fA1; uniform sampler2D fA2; uniform sampler2D fA3;
uniform sampler2D fW0; uniform sampler2D fW1; uniform sampler2D fW2; uniform sampler2D fW3;
uniform mat4 fM[4];
uniform float nF;
uniform float nOk;
uniform vec3 luzBase;
uniform float luzesN;
uniform float usaCubo;
uniform float rumoB;
uniform vec4 gradeF;
uniform vec2 ombro;
uniform float despre; // C8: 1 = Google's pixels are premultiplied by coverage at the edges (MSAA): divide back
${GRADE_GLSL}// 08/10 glass of the facade seen from the balcony (Victor: the city reflected in it was gone; with Google's 3D): tV.r = glass,
uniform sampler2D tV;
uniform float usaVidro;
uniform float espelho;
uniform float forcaV;
uniform float kDiaV;
uniform sampler2D tPano;
uniform float panoSrgb;
uniform sampler2D tGV;
uniform float temJanela;
uniform vec3 caixaMin;
uniform vec3 caixaMax;
uniform float usaCaixa;
bool cubo(vec3 d, out vec4 g){
  float f = -d.x, r = -d.z;
  vec3 L = vec3(sin(rumoB) * f + cos(rumoB) * r, d.y, -(cos(rumoB) * f - sin(rumoB) * r));
  g = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    if (float(k) >= nOk) break;
    vec4 c = fM[k] * vec4(L, 1.0);
    if (c.w <= 0.0) continue;
    vec2 q = c.xy / c.w;
    if (abs(q.x) > 1.0 || abs(q.y) > 1.0) continue;
    vec2 uv = q * 0.5 + 0.5; vec4 a; vec3 w;
    if (k == 0) { a = texture2D(fA0, uv); w = texture2D(fW0, uv).rgb; }
    else if (k == 1) { a = texture2D(fA1, uv); w = texture2D(fW1, uv).rgb; }
    else if (k == 2) { a = texture2D(fA2, uv); w = texture2D(fW2, uv).rgb; }
    else { a = texture2D(fA3, uv); w = texture2D(fW3, uv).rgb; }
    vec3 ac = despre > 0.5 && a.a > 0.0 ? a.rgb / a.a : a.rgb;
    g = vec4(g3dGrade(ac * luzBase, gradeF) + w * luzesN, a.a);
    return true;
  }
  return false;
}
vec3 paraSrgb(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  float m = texture2D(tM, vUv).r;
  float phi = vUv.x * 6.28318530718, th = 3.14159265359 * (1.0 - vUv.y);
  vec3 d = vec3(cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
  vec3 ceu = mix(ceuHoriz, ceuTopo, smoothstep(0.5, 0.78, vUv.y));
  vec3 rgb = vec3(0.0); float a = 0.0; // premultiplied output (blend ONE, ONE_MINUS_SRC_ALPHA)
  if (m > 0.002 && temJanela > 0.5) { // the window: Google's city where the pano's 'fora' mask is open
    vec4 g; bool ok = true;
    if (usaCubo > 0.5) ok = cubo(d, g); else { g = texture2D(tG, gl_FragCoord.xy / res); if (despre > 0.5 && g.a > 0.0) g.rgb /= g.a; }
    if (ok) { float aw = m * forca; rgb += paraSrgb(mix(ceu, g3dOmbro(g.rgb * ganho, ombro), g.a)) * aw; a += aw; } // face not shot yet: our render's city stays
  }
  if (usaVidro > 0.5) {
    vec2 v = texture2D(tV, vUv).rg;
    if (v.r > 0.002) {
      vec4 g; bool ok = true;
      if (usaCubo > 0.5) ok = cubo(vec3(-d.x, d.y, d.z), g);
      else if (espelho > 0.5) { g = texture2D(tGV, vec2(res.x - gl_FragCoord.x, gl_FragCoord.y) / res); if (despre > 0.5 && g.a > 0.0) g.rgb /= g.a; }
      else ok = false;
      vec2 uvR = vec2(fract(0.5 - vUv.x), vUv.y); // the mirrored direction (forward flips) in the panorama's own uv
      if (usaCaixa > 0.5) { // R3a (Victor 13/10: 'reflete como se o piso da varanda nao existisse'): parallax of the balcony
        vec3 L = vec3(-d.x, d.y, -d.z); // forward, up, right
        vec3 Gp = L * (caixaMin.x / min(L.x, -1e-4)); // point on the glass plane behind the eye
        vec3 Rd = vec3(-L.x, L.y, L.z); Rd = mix(Rd, vec3(1e-5), step(abs(Rd), vec3(1e-6))); // no division by 0
        vec3 tA = (caixaMin - Gp) / Rd, tB = (caixaMax - Gp) / Rd, tF = max(tA, tB);
        float sx = max(min(min(tF.x, tF.y), tF.z), 0.0);
        vec3 P = Gp + Rd * sx; vec3 q = normalize(vec3(-P.x, P.y, -P.z)); // back to the scene frame
        float ph = atan(q.z, q.x); ph += step(ph, 0.0) * 6.28318530718;
        uvR = vec2(ph / 6.28318530718, 1.0 - acos(clamp(q.y, -1.0, 1.0)) / 3.14159265359);
      }
      float mR = smoothstep(0.1, 0.9, texture2D(tM, uvR).r);
      vec3 pR = texture2D(tPano, uvR).rgb; if (panoSrgb > 0.5) pR = pow(pR, vec3(2.2)); pR = min(pR, vec3(1.0));
      if (!ok) { g = vec4(0.0); ok = true; mR = 0.0; } // no picture of the city here yet: the balcony still reflects
      if (ok) {
        float w = v.r * (0.25 + 0.75 * v.g) * forcaV * forca;
        rgb += paraSrgb(mix(pR, mix(ceu, g3dOmbro(g.rgb * ganho, ombro), g.a), mR)) * w; a += w * kDiaV; // 08/10 Victor: the floor of the balcony blocks the city in the reflection
      }
    }
  }
  gl_FragColor = vec4(rgb, min(a, 1.0));
}`;
function materialSobreposicao() {
  const forcaV = +(typeof location !== "undefined" && new URLSearchParams(location.search).get("gvidro") || 0.4);
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      tG: { value: null },
      tM: { value: null },
      res: { value: new THREE.Vector2(1, 1) },
      ganho: { value: new THREE.Vector3(1, 1, 1) },
      forca: { value: 1 },
      fA0: { value: null },
      fA1: { value: null },
      fA2: { value: null },
      fA3: { value: null },
      fW0: { value: null },
      fW1: { value: null },
      fW2: { value: null },
      fW3: { value: null },
      fM: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
      nF: { value: 0 },
      nOk: { value: 0 },
      luzBase: { value: new THREE.Vector3(1, 1, 1) },
      luzesN: { value: 0 },
      usaCubo: { value: 0 },
      rumoB: { value: 0 },
      tV: { value: null },
      usaVidro: { value: 0 },
      tGV: { value: null },
      temJanela: { value: 1 },
      caixaMin: { value: new THREE.Vector3() },
      caixaMax: { value: new THREE.Vector3() },
      usaCaixa: { value: 0 },
      tPano: { value: null },
      panoSrgb: { value: 0 },
      espelho: { value: 0 },
      forcaV: { value: forcaV },
      kDiaV: { value: 1 },
      gradeF: { value: new THREE.Vector4(1, 1, 1, 0.18) },
      ombro: { value: new THREE.Vector2(0.6, 0) },
      despre: DESPRE,
      ceuTopo: { value: new THREE.Vector3(0.12, 0.27, 0.6) },
      ceuHoriz: { value: new THREE.Vector3(0.55, 0.66, 0.8) }
    }
  });
}
function ceuParaSol(el) {
  const e = Number.isFinite(el) ? el : -20;
  const dia = smooth(-2, 10, e), crep = smooth(-8, 0, e) * (1 - smooth(4, 14, e));
  const L = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  let topo = L([8e-3, 0.012, 0.03], [0.12, 0.27, 0.6], dia), horiz = L([0.02, 0.025, 0.05], [0.55, 0.66, 0.8], dia);
  topo = L(topo, [0.16, 0.2, 0.42], crep * 0.5);
  horiz = L(horiz, [0.85, 0.6, 0.42], crep * 0.45);
  return { topo, horiz };
}
function ganhoParaSol(el, { dia = 1.35, noite = 0.14 } = {}) {
  const t = Math.min(1, Math.max(0, ((Number.isFinite(el) ? el : -12) + 4) / 14)), k = t * t * (3 - 2 * t);
  const tint = [0.55 + 0.45 * k, 0.68 + 0.32 * k, 1];
  const g = noite + (dia - noite) * k;
  return tint.map((x) => x * g);
}
function inflar(P, m) {
  const pts = P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1] ? P.slice(0, -1) : P.slice();
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sg = area > 0 ? 1 : -1, n = pts.length, out = [];
  const nor = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [sg * dy / l, -sg * dx / l];
  };
  for (let i = 0; i < n; i++) {
    const p = pts[i], n0 = nor(pts[(i - 1 + n) % n], p), n1 = nor(p, pts[(i + 1) % n]);
    let bx = n0[0] + n1[0], by = n0[1] + n1[1];
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl;
    by /= bl;
    const k = Math.min(3, 1 / Math.max(0.33, bx * n1[0] + by * n1[1]));
    out.push([p[0] + bx * m * k, p[1] + by * m * k]);
  }
  return out;
}
async function ligarGoogleCena({ scene, camera, renderer, ref, aoMudar, esconder = [], mostrar = () => {
}, recorte = null }) {
  const s = await iniciarGoogle();
  if (!s) return null;
  const { tiles } = s;
  if (typeof window !== "undefined") window.__g3dTiles = tiles;
  const la = ref.lat * Math.PI / 180, lo = ref.lon * Math.PI / 180, b = ref.rumoX * Math.PI / 180;
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const ax = [0, 1, 2].map((i) => Math.sin(b) * e[i] + Math.cos(b) * n[i]);
  const az = [0, 1, 2].map((i) => Math.sin(b + Math.PI / 2) * e[i] + Math.cos(b + Math.PI / 2) * n[i]);
  const P = ecef(ref.lat, ref.lon, ref.h), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const m = new THREE.Matrix4();
  m.set(ax[0], ax[1], ax[2], -dot(ax, P), u[0], u[1], u[2], -dot(u, P), az[0], az[1], az[2], -dot(az, P), 0, 0, 0, 1);
  const g = tiles.group;
  g.renderOrder = -1;
  if (recorte && !/[?&]recorte=0/.test(location.search)) {
    s.recorte.min.value.copy(recorte.min);
    s.recorte.max.value.copy(recorte.max);
    s.recorte.ecefParaB5 = m.clone();
    s.recorte.liga.value = 1;
    if (recorte.lote && recorte.lote.length >= 3) {
      const L = inflar(recorte.lote, recorte.margemLote || 1.5).slice(0, 24);
      L.forEach((p, i) => s.recorte.lote.value[i].set(p[0], p[1]));
      s.recorte.loteN.value = L.length;
    }
    s._recFeito = false;
    if (s.atualizaRecorte) s.atualizaRecorte();
  }
  let ganhoCena = [1, 1, 1];
  const tam = new THREE.Vector2(), camSelFora = new THREE.PerspectiveCamera();
  let falhou = false, mostrando = false;
  const cred = document.createElement("div");
  cred.className = "g3d-cena g3d-cred";
  cred.style.cssText = "position:absolute;right:8px;bottom:120px;z-index:5;max-width:calc(100% - 16px);" + CRED_CSS;
  cred.innerHTML = htmlCredito("Cidade 3D: Google Maps<br>prédio em destaque: maquete própria");
  let credT = 0;
  const posCred = () => {
    const agora = performance.now();
    if (agora - credT < 300) return;
    credT = agora;
    const pai = renderer.domElement.parentElement.getBoundingClientRect();
    const vis = (q) => {
      const e2 = document.querySelector(q);
      return e2 && !e2.hidden && e2.offsetParent !== null ? e2.getBoundingClientRect() : null;
    };
    let topo = pai.bottom - 30, dir = 8;
    for (const q of ["#sol-painel", "#sol-painel .sol-dica", "#card", "#unidades"]) {
      const r = vis(q);
      if (!r || !r.height) continue;
      if (innerWidth >= 1e3 && (q === "#card" || q === "#unidades")) {
        dir = Math.max(dir, pai.right - r.left + 8);
        continue;
      }
      topo = Math.min(topo, r.top);
    }
    const baixo = Math.round(pai.bottom - topo + 8);
    cred.style.bottom = baixo + "px";
    cred.style.right = Math.round(dir) + "px";
    cred.style.left = "auto";
    if (recorte && recorte.min) {
      const xs = [], ys = [];
      for (const x of [recorte.min.x, recorte.max.x]) for (const y of [0, recorte.max.y]) for (const z of [recorte.min.z, recorte.max.z]) {
        vCred.set(x, y, z).project(camera);
        if (vCred.z > 1) continue;
        xs.push((vCred.x * 0.5 + 0.5) * pai.width);
        ys.push((-vCred.y * 0.5 + 0.5) * pai.height);
      }
      if (xs.length) {
        const T = [Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6];
        const w = cred.offsetWidth, h = cred.offsetHeight, y1 = pai.height - baixo, y0 = y1 - h;
        const toca = (x0, x1) => x0 < T[2] && x1 > T[0] && y0 < T[3] && y1 > T[1];
        if (toca(pai.width - dir - w, pai.width - dir) && !toca(8, 8 + w)) {
          cred.style.right = "auto";
          cred.style.left = "8px";
        }
      }
    }
  };
  const vCred = new THREE.Vector3();
  cred.hidden = true;
  renderer.domElement.parentElement.appendChild(cred);
  const carga = document.createElement("div");
  carga.style.cssText = "position:absolute;left:10px;top:132px;z-index:5;display:flex;flex-direction:column;gap:3px;padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:10px/1.2 system-ui,sans-serif;pointer-events:none;width:150px";
  carga.innerHTML = '<span>Montando a cidade real</span><i style="display:block;height:2px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden"><b style="display:block;height:100%;width:4%;background:#fff;transition:width .4s ease"></b></i>';
  renderer.domElement.parentElement.appendChild(carga);
  let lote0 = null, pMax = 0;
  let refino = null;
  const aoCarregar = () => aoMudar && aoMudar();
  for (const ev of ["load-model", "tiles-load-end", "needs-update"]) tiles.addEventListener(ev, aoCarregar);
  const out = [];
  let laco = 0, quieto = 0;
  const pendente = () => {
    const st = tiles.stats;
    return st.queued + st.downloading + st.parsing > 0 || tiles.loadProgress < 1;
  };
  const bombear = () => {
    quieto = 0;
    if (laco || falhou) return;
    const passo = () => {
      laco = 0;
      if (falhou) return;
      aoMudar && aoMudar();
      quieto = pendente() ? 0 : quieto + 1;
      if (quieto < 30 && !laco) laco = requestAnimationFrame(passo);
    };
    laco = requestAnimationFrame(passo);
  };
  const api = {
    tiles,
    perf: { n: 0, ms: 0 },
    get mostrando() {
      return mostrando && !falhou;
    },
    antes(congelado = false) {
      if (falhou || congelado) return;
      try {
        const t0 = performance.now();
        if (s.dono && s.dono !== api && s.dono.ativo) return;
        if (s.dono !== api) {
          const voltando = !!s.dono && mostrando;
          s.tomar(api, scene, m, camSelFora, ERRO_360 * 1.25);
          s.pintar(ganhoCena);
          if (voltando) {
            refino = { lote0: null, pMax: 0, t0: performance.now() };
            carga.querySelector("b").style.width = "4%";
            renderer.domElement.parentElement.appendChild(carga);
            bombear();
          }
        }
        renderer.getDrawingBufferSize(tam);
        camera.updateMatrixWorld(true);
        const card = document.getElementById("card"), rc = card && !card.hidden ? card.getBoundingClientRect() : null;
        const fr = rc && rc.width > innerWidth * 0.8 && rc.top > innerHeight * 0.3 ? Math.min(1, rc.top / innerHeight + 0.05) : 1;
        camSelFora.copy(camera, false);
        camSelFora.far = Math.min(camSelFora.far, RAIO);
        if (fr < 1) camSelFora.setViewOffset(tam.x, tam.y, 0, 0, tam.x, Math.round(tam.y * fr));
        else camSelFora.clearViewOffset();
        camSelFora.updateProjectionMatrix();
        camSelFora.updateMatrixWorld(true);
        tiles.setResolution(camSelFora, tam.x, Math.round(tam.y * fr));
        tiles.update();
        out.length = 0;
        tiles.getAttributions(out);
        const txt = textoDados(out);
        const el = cred.querySelector(".g3d-attr");
        if (el.textContent !== txt) el.textContent = txt;
        if (!cred.hidden) posCred();
        const st = tiles.stats, pend = st.queued + st.downloading + st.parsing;
        if (!mostrando) {
          if (lote0 == null) lote0 = st.loaded;
          const feitos = st.loaded - lote0;
          pMax = Math.max(pMax, pend > 0 ? feitos / (feitos + pend) : 0);
          carga.querySelector("b").style.width = Math.round(4 + 96 * pMax) + "%";
          if (st.visible > 8 && (pend === 0 || pMax >= 0.85 || tiles.lruCache.isFull())) {
            mostrando = true;
            carga.remove();
            cred.hidden = !!api.noite;
          }
        }
        if (refino) {
          if (refino.lote0 == null) refino.lote0 = st.loaded;
          const feitos = st.loaded - refino.lote0;
          refino.pMax = Math.max(refino.pMax, pend > 0 ? feitos / (feitos + pend) : 1);
          carga.querySelector("b").style.width = Math.round(4 + 96 * refino.pMax) + "%";
          if (pend === 0 && tiles.loadProgress >= 1 && performance.now() - refino.t0 > 500 || tiles.lruCache.isFull() && pend === 0 && performance.now() - refino.t0 > 3e3 || performance.now() - refino.t0 > 3e4) {
            carga.remove();
            refino = null;
          }
        }
        if (api.preFoto) {
          const P2 = api.preFoto;
          P2.q = pend === 0 ? P2.q + 1 : 0;
          if (P2.q >= 3 && performance.now() - P2.t0 > 300 || performance.now() - P2.t0 > 15e3) {
            P2.reg++;
            P2.t0 = performance.now();
            P2.q = 0;
            if (P2.reg >= FOTO_N * FOTO_N) {
              api.pararPreCarga();
            } else api.passoPreFoto();
          }
          bombear();
        }
        if (pendente()) bombear();
        api.perf.n++;
        api.perf.ms += performance.now() - t0;
        if (STATUS.erro && /403|429|quota|key|denied|permission/i.test(STATUS.erro)) throw new Error(STATUS.erro);
      } catch (err) {
        api.desligar(err);
      }
    },
    async preCarregar({ andar, final } = {}) {
      if (falhou || andar == null || final == null) return;
      const { GEO_PREDIO: G } = await import("./google-geo.js");
      const f = G.finais[String(final)];
      if (!f) return;
      const [u2, v, hp] = PREDIO_CFG.tour360.olhoJanela;
      const x = f.M[0] * u2 + f.M[1] * v + f.t[0], z = f.M[2] * u2 + f.M[3] * v + f.t[1], y = G.laje_1 + (andar - 1) * G.piso + hp;
      const W = Math.round(innerWidth * Math.min(3, devicePixelRatio || 1)), H = Math.round(innerHeight * Math.min(3, devicePixelRatio || 1));
      if (!api.camPre) api.camPre = new THREE.PerspectiveCamera(90, 1, 3, RAIO);
      const c = api.camPre;
      c.fov = innerHeight > innerWidth ? 90 : 75;
      c.aspect = W / H;
      const y0 = Math.round(H * 0.37), hh = Math.round(H * 0.4);
      c.setViewOffset(W, H, 0, y0, W, hh);
      c.position.set(x, y, z);
      c.up.set(0, 1, 0);
      c.lookAt(x + f.M[1] * 100, y, z + f.M[3] * 100);
      c.updateProjectionMatrix();
      c.updateMatrixWorld(true);
      if (s.dono !== api) return;
      if (MODO_FOTO) {
        c.fov = 95;
        c.aspect = 1;
        c.clearViewOffset();
        c.updateProjectionMatrix();
        api.preFoto = { reg: 0, t0: performance.now(), q: 0 };
        api.preCarga = { andar, final };
        api.passoPreFoto();
        bombear();
        return;
      }
      if (!tiles.cameras.includes(c)) tiles.setCamera(c);
      tiles.setResolution(c, Math.round(W * 1.25), Math.round(hh * 1.25));
      api.preCarga = { andar, final };
      bombear();
    },
    pararPreCarga() {
      if (api.camPre && tiles.cameras.includes(api.camPre)) tiles.deleteCamera(api.camPre);
      api.preCarga = null;
      api.preFoto = null;
    },
    passoPreFoto() {
      const P2 = api.preFoto, c = api.camPre;
      if (!P2 || !c || s.dono !== api) return;
      const N = FOTO_N, L = FOTO_LADO, w = L / N, x = P2.reg % N * w, y = Math.floor(P2.reg / N) * w;
      c.setViewOffset(L, L, x, y, w, w);
      c.updateProjectionMatrix();
      c.updateMatrixWorld(true);
      if (!tiles.cameras.includes(c)) tiles.setCamera(c);
      const k = ERRO_360 * 1.25 / ERRO_FOTO;
      tiles.setResolution(c, Math.round(w * k), Math.round(w * k));
    },
    terreno(tex, ext) {
      s.recorte.terr.value = tex;
      s.recorte.terrExt.value = ext;
    },
    mapaPredios(tex, minX, minZ, tam2) {
      s.recorte.mapa.value = tex;
      s.recorte.mapaR.value.set(minX, minZ, 1 / tam2, 0);
    },
    fantasma(cam, alvo) {
      if (!s.recorte.mapa.value) return;
      s.recorte.mapaR.value.w = cam ? 1 : 0;
      if (cam) {
        s.recorte.camB5.value.copy(cam);
        s.recorte.alvoB5.value.copy(alvo);
      }
    },
    telaTorre(r, prof) {
      if (r) {
        s.recorte.ret.value.set(r[0], r[1], r[2], r[3]);
        s.recorte.prof.value = prof;
      } else s.recorte.ret.value.set(1, 1, 0, 0);
    },
    aplicarRecorte(material) {
      material.onBeforeCompile = s.shaderRecorte;
      material.customProgramCacheKey = () => "g3d-recorte-sombra";
      material.needsUpdate = true;
    },
    definirNoite(v) {
      if (api.noite === v) return;
      api.noite = v;
      g.visible = !v;
      cred.hidden = v || !(mostrando && !falhou);
    },
    definirSol(el) {
      s.definirLuz(el);
      api.el = el;
    },
    desligar(err) {
      falhou = true;
      mostrando = false;
      carga.remove();
      if (laco) cancelAnimationFrame(laco);
      if (s.dono === api) {
        scene.remove(g);
        s.dono = null;
      }
      cred.remove();
      mostrar();
      console.warn("google3d (cena) desligado", err && err.message);
      aoMudar && aoMudar();
    }
  };
  bombear();
  return api;
}
export {
  C8,
  GRADE_G3D,
  MODO_FOTO,
  STATUS,
  VistaGoogle,
  ceuParaSol,
  desligadoPorUrl,
  ecef,
  estiloCredito,
  ganhoParaSol,
  gradeGoogle,
  htmlCredito,
  iniciarGoogle,
  ligarGoogleCena,
  luzDaCidade,
  materialSobreposicao,
  matrizLocal,
  textoDados
};
