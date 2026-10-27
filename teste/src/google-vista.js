// Live layer (front B10, ON in the published site since 07/10; ?google3d=0 turns it off): the city seen through the windows of the 360 tour comes from Google
// Photorealistic 3D Tiles (Map Tiles API), rendered with a three.js camera standing where the panorama was taken.
//
// Rules from the Google terms (briefing pacote-google-3d-tiles.md): Google logo + aggregated attribution on screen, say
// "Cidade: Google", no storing of tiles (only the in-memory renderer cache), no extraction, Google's mesh is never hidden or
// clipped (our model is only drawn OVER it) [15/10 note: the tower/lot cut in the outside view is under review by the
// Google-terms front, audit A R5]. Everything here is optional: no key / any error / quota hit / trial ended =>
// `iniciarGoogle()` resolves false and the tour keeps its current look, with no message to the visitor.
//
// The key is NEVER in the project source: window.__G3D_KEY (local test harness), ?gkey= (tests), else src/g3d-chave.js, which
// exists ONLY in the published copies (written by docs/b10-scripts/prepara_pages.py / prepara_teste.py, site key restricted by referrer).
import * as THREE from 'three';
import { capacidade } from './capacidade.js';
import { chaveLocal, PREDIO_CFG } from './predio.js';
import { smooth, fatorDia, fatorLuzesNoite } from './luz-curva.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const V = '3d-tiles-renderer@0.5.3'; // pinned
// 15/10 FILA C5: the libraries are copies in src/vendor (docs/b10-scripts/vendoriza.py), same versions as the old CDN links
const CDN = new URL(`./vendor/${V}/build/`, import.meta.url).href;
const DRACO = new URL('./vendor/three@0.186.1/examples/jsm/libs/draco/gltf/', import.meta.url).href;
// 15/10 (Google terms, G1-TERMOS A4): the official "Google Maps" logo (Google_Maps_Attribution_Assets.zip, outlined version for a
// busy background, unmodified) replaces the old "Google" logo; shown 21 px tall = the logo itself ~17 px (min 16, max 19 dp)
// plus its outline; accessibility label "Google Maps"; clear space 10/10/10/5 px; data attribution in full (no ellipsis),
// as the plugin aggregates it (sorted by occurrences, ';'), after "Dados do mapa:"; and a line that says WHICH part of the
// scene is Google's (hybrid-scene rule). The grey-zone uses (window photo, reflection, night grade, tower cut) are unchanged.
const LOGO = 'assets/marca/google-maps-logo-contorno-escuro.svg';
// 15/10 22h wave 1 (Victor: the box was too big, it covered the lower floors and the top of the 360): compact box. Logo
// unchanged (21 px, logo ~17 px + outline, clear space 10 px left/top/right and to the text, 5 px under it); the
// which-part line sits BESIDE the logo (2 short lines in the logo's height) and the data attribution, in full, runs under
// both (phones) or on the same line (>= 1000 px). Class .g3d-cred, CSS injected once (estiloCredito).
const CRED_CSS = 'pointer-events:none;overflow:visible';
const CRED_ESTILO = '.g3d-cred{display:grid;grid-template-columns:auto minmax(0,auto);column-gap:10px;row-gap:3px;align-items:center;padding:10px 10px 5px;border-radius:8px;background:rgba(0,0,0,.5);color:#fff;font:9px/1.2 system-ui,sans-serif;white-space:normal;box-sizing:border-box}'
  + '.g3d-cred img{height:21px;width:auto;display:block;grid-row:1;grid-column:1}.g3d-cred .g3d-parte{grid-row:1;grid-column:2;font-weight:600}'
  + '.g3d-cred .g3d-attr{grid-row:2;grid-column:1/-1;opacity:.92}.g3d-cred .g3d-attr:empty{display:none}'
  + '@media (min-width:1000px){.g3d-cred{grid-template-columns:auto auto auto;font-size:10px}.g3d-cred .g3d-attr{grid-row:1;grid-column:3}}';
export function estiloCredito() {
  if (typeof document === 'undefined' || document.getElementById('g3d-cred-css')) return;
  const st = document.createElement('style'); st.id = 'g3d-cred-css'; st.textContent = CRED_ESTILO; document.head.appendChild(st);
}
export function htmlCredito(parte) {
  estiloCredito();
  return '<img alt="Google Maps" aria-label="Google Maps" src="' + LOGO + '" referrerpolicy="no-referrer">'
    + '<span class="g3d-parte">' + parte + '</span><span class="g3d-attr"></span>';
}
export const textoDados = (out) => { const t = out.filter((a) => a.type === 'string' && a.value).map((a) => a.value).join('; '); return t ? 'Dados do mapa: ' + t : ''; };

// detail level: ?gerr=<px> sets the 360 target, the outside view uses 1.25x
// detail per device tier (src/capacidade.js): 8 px = Google's finest on computers and top phones, 24/28 on mid phones
const ERRO_360 = (typeof location !== 'undefined' && +new URLSearchParams(location.search).get('gerr')) || capacidade().erro360;
// ON by default (07/10); ?google3d=0 turns it off. Key: test harness (window.__G3D_KEY) or ?gkey=, else src/g3d-chave.js,
// which only exists in the PUBLISHED copy (written by prepara_pages.py from the referrer-restricted site key)
// radius (m) of Google's city around the camera: tiles farther than this are neither loaded nor drawn (?graio= to test)
const RAIO = (typeof location !== 'undefined' && +new URLSearchParams(location.search).get('graio')) || 20000;
// 08/10 PHOTO MODE for the 360 on mid phones (Victor's M21s: mushy city, a loading bar on every turn, sluggish): the window
// view is shot ONCE per point into a cube (one face at a time, finer detail than live), then only that picture is shown.
// ?gfoto=1 forces it (tests), ?gfoto=0 turns it off.
const QS_FOTO = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('gfoto') : null;
export const MODO_FOTO = QS_FOTO === '1' || (QS_FOTO !== '0' && (capacidade().movel || capacidade().nivel !== 'topo')); // every phone (Victor 08/10); computers stay live
const ERRO_FOTO = +(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gferr')) || (capacidade().nivel === 'topo' ? 6 : 14); // mid phones: half the detail, much faster (Victor 08/10: 'demora uma eternidade') // finest Google detail for the picture, every device (it is shot once); ?gferr= tests
const FOTO_LADO = capacidade().nivel === 'topo' ? 2048 : 1536; // px per 90 deg face (mid phones 1536: M21s crashed with 2048 + 3072 layers)
const FOTO_LADO_W = capacidade().nivel === 'topo' ? 2048 : 1024; // night-windows picture (lit dots only)
const FOTO_MIN = +(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfmin')) || 99999; // smallest region the splitter goes down to (?gfmin=128 tests)
const FOTO_MB = (+(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfmb')) || (capacidade().nivel === 'topo' ? (capacidade().movel ? 900 : 1500) : capacidade().tilesMB)) * 1048576; // iPhone ('ios'): its own budget // mid phones: no raise (M21s crashed at 420, 08/10)
const FOTO_N = +(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfn')) || (capacidade().nivel === 'topo' ? 4 : 2); // regions per face side (mid phones: 2x2 at the lower detail)
// RODADA 26/10 item 1: coarse first pass over every window face (?gfr=0 = off, ?gferr2= its errorTarget)
const RAPIDO = !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfr') === '0');
const ERRO_RAPIDO = +(typeof location !== 'undefined' && new URLSearchParams(location.search).get('gferr2')) || ERRO_FOTO * 3;
// 26/10 ASK 8 (Sites, pub 7: the tour window took 30-40 s to fill, flat dark-blue haze for the first 15-21 s; the bar fell back to
// ~2 % and vanished at 76 %): the LIVE window (computers) loads in 2 stages - a coarse pass first (errorTarget x FASE1_K, the photo
// mode's coarse ratio), shown as soon as the window has no pending tile (whole opening covered at that level), then the finest
// detail refines in place (the renderer keeps a parent until all its children are in). ?g1k=1 = one stage (as before).
const FASE1_K = +(typeof location !== 'undefined' && new URLSearchParams(location.search).get('g1k')) || 3;
export const desligadoPorUrl = () => /[?&]google3d=0/.test(location.search);
async function chaveDaPagina() {
  // 15/10 FILA C6: ?gkey= only on localhost/127.0.0.1 (on the public domain a pasted key in a link is ignored)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const k = window.__G3D_KEY || (local ? new URLSearchParams(location.search).get('gkey') : null);
  if (k) return k;
  try { return (await import('./g3d-chave.js')).CHAVE || ''; } catch (e) { return ''; }
}

// ---------------------------------------------------------------- geodesy (double precision, plain JS numbers)
const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F);
export function ecef(latDeg, lonDeg, h) {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  const N = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2);
  return [(N + h) * Math.cos(la) * Math.cos(lo), (N + h) * Math.cos(la) * Math.sin(lo), (N * (1 - E2) + h) * Math.sin(la)];
}
// ECEF -> local frame L (x east, y up, z = -north), origin at the eye (+ optional eye offset in ENU metres)
export function matrizLocal(lat, lon, h, [dE = 0, dN = 0, dU = 0] = []) {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const P = ecef(lat, lon, h);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const Pe = dot(e, P), Pn = dot(n, P), Pu = dot(u, P);
  const m = new THREE.Matrix4();
  m.set(e[0], e[1], e[2], -Pe - dE,
    u[0], u[1], u[2], -Pu - dU,
    -n[0], -n[1], -n[2], Pn + dN,
    0, 0, 0, 1);
  return m;
}

// C7 21/10: g = (exposure, toe contrast, saturation, pivot); identity = (1, 1, 1, any). o = (knee, weight) of the shoulder.
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
// time-of-day light of Google's photo city, applied in every tile shader from shared uniforms (never per material)
const LUZ_GLSL = `
  {
    vec3 cB = outgoingLight;
    outgoingLight = g3dGrade(cB * uLuz, uGrade); // C7 21/10: day grade (identity at night and in the window photo shots)
    // street lights (same map as our city: R sodium, G LED, B terrain height), on what is near street level
    if (uNoiteG > 0.001 && uTerrExt > 0.0${typeof location !== 'undefined' && /[?&]g3dlz=0/.test(location.search) ? ' && false' : ''}) { // ?g3dlz=0: street-light pools off (tests)
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
      // RODADA 26/10 (Meta: beige 'lit window' patches on roofs and ground seen from the balcony, sticker-like patches on facades):
      // only vertical surfaces (|n.y| < 0.3; a 30-45 deg tiled roof has |n.y| 0.7-0.87 but the screen-derivative normal of coarse
      // tiles wanders) and >= 3 m above the LOCAL ground (terrain map), not above the B5 origin
      float hLocJ = vB5.y;
      if (uTerrExt > 0.0) { vec2 rqJ = (vB5.xz + uTerrExt) / (2.0 * uTerrExt); if (all(greaterThan(rqJ, vec2(0.0))) && all(lessThan(rqJ, vec2(1.0)))) hLocJ = vB5.y - (texture2D(uTerr, rqJ).b * 60.0 - 20.0); }
      // ... and only on the wall of a TALL building of OUR footprint map (c.w = 1 + roof height, cena3d montaMapaPredios), below its
      // roof: the photo W layer (dumped 26/10) had shards on parapets / roof steps of the low houses and on Google's roof edges
      bool altoJ = true;
      if (uMapaR.z > 0.0) {
        vec2 uvJ = vec2((vB5.x - uMapaR.x) * uMapaR.z, 1.0 - (vB5.z - uMapaR.y) * uMapaR.z);
        if (all(greaterThan(uvJ, vec2(0.0))) && all(lessThan(uvJ, vec2(1.0)))) {
          vec2 eJ = vec2(2.5 * uMapaR.z, 0.0); float topoJ = -1.0; vec4 cJ;
          cJ = texture2D(uMapaP, uvJ); if (cJ.a > 0.5) topoJ = max(topoJ, cJ.w - 1.0);
          cJ = texture2D(uMapaP, uvJ + eJ.xy); if (cJ.a > 0.5) topoJ = max(topoJ, cJ.w - 1.0);
          cJ = texture2D(uMapaP, uvJ - eJ.xy); if (cJ.a > 0.5) topoJ = max(topoJ, cJ.w - 1.0);
          cJ = texture2D(uMapaP, uvJ + eJ.yx); if (cJ.a > 0.5) topoJ = max(topoJ, cJ.w - 1.0);
          cJ = texture2D(uMapaP, uvJ - eJ.yx); if (cJ.a > 0.5) topoJ = max(topoJ, cJ.w - 1.0);
          altoJ = topoJ > 12.0 && vB5.y < topoJ - 1.5;
        }
      }
      // JANELAS-PLANOS 26/10 (Victor rejected the 150 m cut: 'janelas acesas de verdade' on the near towers too, no dark towers, no
      // shards). Root cause of the shards: the window cell was decided per pixel on whatever Google triangle it landed on. Now, in the
      // 360 window view, a fragment of a building of OUR LiDAR footprint list (vizinhos-planos.json, GeoSampa LiDAR rectangles: the
      // same data as the shadow city; uJanB = up to 16 boxes near the eye) takes its window from the building's TRUE WALL PLANE: the
      // camera ray through the fragment is intersected with the nearest face of the box and the window grid (floors of 2.85 m from the
      // box base, bays of ~3.1 m fitted to the face width) is evaluated at that point of the plane. The lit window is therefore the
      // perspective image of a rectangle on the wall, whatever Google's triangulation under it; Google's surface only says WHERE the
      // building is on screen (other buildings in front are other fragments, so occlusion is Google's own). Only fragments within 3 m
      // of the wall the camera ray enters the box by (slab test; a roof entry or an up-facing fragment = no window), ground floor and the
      // last 1.5 m under the roof skipped. The same rectangle is thus hit by every pixel of the window, whichever triangle they are on.
      float janT = -1.0; vec2 celT = vec2(0.0);
      float faceMap = 0.0; // JANELAS-NOITE: this face has an authored map (grid or balcony band); else the far-city rule below applies
      float mapaOk = 0.0, mapaU = 0.0, mapaH = 0.0, mapaRow = 0.0; // JANELAS-NOITE: wall entry point of the camera ray
      float uT = 0.0, hT = 0.0, uST = 0.0, bayT = 3.1, hbT = 0.0; vec2 clT = vec2(0.0); float boxT = 0.0, faceT = 0.0; vec2 nFJ = vec2(1.0, 0.0); // JANELAS-COMBINADAS
      if (uJanN > 0.5 && uPertoJ < 0.5) {
        vec3 camN = (uParaB5 * vec4(cameraPosition, 1.0)).xyz;
        for (int i = 0; i < 32; i++) {
          if (float(i) >= uJanN) break;
          vec4 a = uJanB[2 * i], b = uJanB[2 * i + 1];
          vec2 e1 = b.xy, e2 = vec2(-b.y, b.x), dq = vB5.xz - a.xy, q = vec2(dot(dq, e1), dot(dq, e2));
          if (abs(q.x) > a.z + 4.0 || abs(q.y) > a.w + 4.0 || vB5.y < b.z - 1.0 || vB5.y > b.w + 2.0) continue;
          janT = 0.0; // a footprint building: its windows come only from its wall planes
          if (b.w - b.z < 12.0) break; // low block (1-3 storeys, often under trees): no lit window (cells there were cut into flecks)
          // camera ray to this fragment (t = 1 at the fragment), box slabs in the box frame: entry point = the wall the eye sees here
          vec2 dc = camN.xz - a.xy, qc = vec2(dot(dc, e1), dot(dc, e2));
          vec3 o = vec3(qc.x, camN.y, qc.y), D = vec3(q.x - qc.x, vB5.y - camN.y, q.y - qc.y);
          vec3 iD = 1.0 / (D + sign(D) * 1e-5 + step(abs(D), vec3(0.0)) * 1e-5);
          vec3 t1 = (vec3(-a.z, b.z, -a.w) - o) * iD, t2 = (vec3(a.z, b.w, a.w) - o) * iD;
          vec3 tn = min(t1, t2), tf = max(t1, t2);
          float tE = max(max(tn.x, tn.y), tn.z), tS = min(min(tf.x, tf.y), tf.z);
          if (!(tE > tS || tE <= 0.0 || tn.y >= max(tn.x, tn.z)) && abs(nB.y) < 0.75 && abs(dot(normalize(nB.xz + 1e-6), tn.x >= tn.z ? e1 : e2)) > 0.35) { bool fxM = tn.x >= tn.z; vec3 PM = o + tE * D; mapaOk = 1.0; mapaU = fxM ? PM.z : PM.x; mapaH = PM.y;
            mapaRow = float(i) * 4.0 + (fxM ? (PM.x > 0.0 ? 0.0 : 1.0) : (PM.z > 0.0 ? 2.0 : 3.0)); }
          if (tE > tS || tE <= 0.0 || tn.y >= max(tn.x, tn.z) || abs(nB.y) > 0.6) break; // missed the box, entered by the roof, or an up-facing fragment
          bool fx = tn.x >= tn.z;
          // 27/10: no per-fragment flat-facade gate: a window is a whole rectangle in wall coordinates, found once per cell in the photo (the gate cut it at pillars)
          if ((fx ? abs(abs(q.x) - a.z) : abs(abs(q.y) - a.w)) > 3.0) break; // the fragment is not on that wall (lower houses inside a block rectangle made flecks)
          vec3 P = o + tE * D;
          float ao = fx ? a.w : a.z, u = fx ? P.z : P.x;
          float nb = max(1.0, floor(2.0 * ao / 3.1)), bay = 2.0 * ao / nb;
          vec2 cc = vec2((u + ao) / bay, (P.y - b.z) / 2.85), fr = fract(cc), cl = floor(cc);
          float dentro = step(0.6, cl.x * bay) * step(0.6, 2.0 * ao - (cl.x + 1.0) * bay) * step(1.0, cl.y) * step(b.z + (cl.y + 1.0) * 2.85, b.w - 1.0); // whole cells only (a cell cut by the roof line or a corner made slivers)
          janT = dentro; uT = u; hT = P.y; uST = -ao + cl.x * bay; bayT = bay; hbT = b.z + cl.y * 2.85; clT = cl; boxT = float(i);
          faceT = fx ? (P.x > 0.0 ? 0.0 : 1.0) : (P.z > 0.0 ? 2.0 : 3.0); nFJ = fx ? e1 : e2;
          celT = cl + vec2(float(i) * 37.0 + (fx ? 0.0 : 17.0) + ((fx ? P.x : P.z) > 0.0 ? 5.0 : 0.0), 0.0);
          break;
        }
      }
      // JANELAS-COMBINADAS 27/10 (Meta: the wall-plane cards sat between Google's openings; the openings alone were dots and specks).
      // Per lit cell (floor x bay of the LiDAR wall): the OPENING is found in Google's own facade photo - 9 samples along the bay at
      // window height and 5 up the floor, mapped from wall metres to texture through the screen derivatives - and its centroid gives
      // the position; the SIZE is a standard window, 1.3 x 1.4 m, sill 0.9 m above the floor line (centre from the photo, clamped
      // +-0.4 m), drawn on the wall plane with a ~1.5 px soft edge, in the far city's warm colour and night ramp. Ambiguous cells (no
      // clear dark opening, a wide dark band, no wall above / below) draw nothing.
      float fwU = 1.5 * fwidth(uT), fwH = 1.5 * fwidth(hT);
      if (janT >= 0.0) {
        // JANELAS-NOITE 27/10 (Meta after Victor's 'bem ridiculas': no runtime guess on Google's near mesh). The window grid of each
        // near tower face was authored OFFLINE (assets/entorno/janelas-noite.json: LiDAR wall plane + bays / floors phase-fitted on a
        // hi-res day capture of that facade, cells without a window excluded, reviewed on an overlay sheet). Row (slot * 4 + face) of
        // uJanMap (96 x 128): texel 0 = (-, -, columns, window width), texel 1 = (first row centre h, floor pitch, rows, window height),
        // texels 2-17 = the column centres u (4 per texel, real positions found in the photo), texels 18.. = one per grid row, 4 x 24-bit
        // masks of the columns that have a window. The fragment's point on the
        // wall plane (camera ray, as above) falls in one cell; a lit window is drawn as a window, not a sticker: interior colour per
        // window (mostly warm 2700-3500 K, some cool, a few dim), a soft vertical gradient (ceiling light / curtain), a dark frame and
        // a mullion, edges anti-aliased on the wall plane. Occupancy follows the hour (uJanHora): ~45 % at 19 h, ~38 % at 21 h, ~22 % at
        // 23 h. Stable per window (hash of face + cell). Faces without a map stay as Google draws them (dark).
        if (mapaOk > 0.5) {
          int rowM = int(mapaRow); float uT = mapaU, hT = mapaH;
          vec4 pA = texelFetch(uJanMap, ivec2(0, rowM), 0), pB = texelFetch(uJanMap, ivec2(1, rowM), 0);
          vec4 sA = texelFetch(uJanMap, ivec2(80, rowM), 0), sB = texelFetch(uJanMap, ivec2(81, rowM), 0);
          faceMap = max(step(0.5, pA.z) * step(0.5, pB.z), step(0.5, sB.w));
          // BALCONY BAND (zig-zag balcony tower, recessed balconies): the glass behind each balcony is a horizontal strip per floor
          // (sA = u0, u1, first band centre h, floor pitch; sB = floors, band height, unit width, on), cut into units along u; a lit
          // unit glows warm with a curtain-like variation along the strip and a soft top / bottom edge. Whole strips, never specks.
          if (sB.w > 0.5 && uNoiteG > 0.001 && uT > sA.x && uT < sA.y) {
            float rS = floor((hT - sA.z) / sA.w + 0.5);
            if (rS >= 0.0 && rS < sB.x) {
              float lhS = hT - (sA.z + rS * sA.w), uu = (uT - sA.x) / sB.z, un = floor(uu), fu = fract(uu);
              vec2 aaS = max(vec2(fwidth(uT), fwidth(hT)), vec2(1e-3));
              float banda = smoothstep(-aaS.y * 1.5, aaS.y * 1.5, 0.5 * sB.y - abs(lhS)) * smoothstep(0.0, 0.08 + aaS.x / sB.z, min(fu, 1.0 - fu));
              vec2 idS = vec2(un, rS) + vec2(float(rowM) * 53.0, 7.0);
              float hr2 = uJanHora / 60.0; hr2 = hr2 < 12.0 ? hr2 + 24.0 : hr2;
              float occS = hr2 < 19.0 ? mix(0.30, 0.45, clamp((hr2 - 17.0) / 2.0, 0.0, 1.0)) : hr2 < 21.0 ? mix(0.45, 0.38, (hr2 - 19.0) / 2.0) : hr2 < 23.0 ? mix(0.38, 0.22, (hr2 - 21.0) / 2.0) : hr2 < 26.0 ? mix(0.22, 0.08, (hr2 - 23.0) / 3.0) : 0.08;
              float ligaS = step(g3dH21(idS), occS);
              float cortS = 0.55 + 0.45 * smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(6.2832 * (fu * (1.5 + g3dH21(idS + 2.0)) + g3dH21(idS + 5.0))));
              vec3 corS = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.78, 0.55), g3dH21(idS + 9.0)) * (0.5 + 0.4 * g3dH21(idS + 3.0));
              float vS = clamp(lhS / sB.y + 0.5, 0.0, 1.0);
              outgoingLight = mix(outgoingLight, corS * cortS * mix(0.75, 1.05, vS), uNoiteG * ligaS * banda);
            }
          }
          if (pA.z > 0.5 && pB.z > 0.5 && uNoiteG > 0.001) {
            int nC = int(pA.z);
            float c0 = texelFetch(uJanMap, ivec2(2, rowM), 0).x, cN = texelFetch(uJanMap, ivec2(2 + (nC - 1) / 4, rowM), 0)[(nC - 1) - ((nC - 1) / 4) * 4];
            float pas = nC > 1 ? (cN - c0) / float(nC - 1) : 3.0;
            int kE = int(clamp(floor((uT - c0) / max(pas, 0.5) + 0.5), 0.0, float(nC - 1)));
            float cx = -1.0, cU = 0.0, dB = 1e9;
            for (int q = -2; q <= 2; q++) { int k = kE + q; if (k < 0 || k >= nC) continue; float c = texelFetch(uJanMap, ivec2(2 + k / 4, rowM), 0)[k - (k / 4) * 4]; if (abs(uT - c) < dB) { dB = abs(uT - c); cx = float(k); cU = c; } }
            float cy = floor((hT - pB.x) / pB.y + 0.5);
            if (cx >= 0.0 && cy >= 0.0 && cy < pB.z && cy < 62.0) {
              vec4 mk = texelFetch(uJanMap, ivec2(18 + int(cy), rowM), 0);
              float canal = floor(cx / 24.0), bit = cx - canal * 24.0;
              float v = canal < 0.5 ? mk.x : canal < 1.5 ? mk.y : canal < 2.5 ? mk.z : mk.w;
              float tem = mod(floor(v / exp2(bit)), 2.0);
              float lu = uT - cU, lh = hT - (pB.x + cy * pB.y), hw = 0.5 * pA.w, hh = 0.5 * pB.w;
              vec2 aa = max(vec2(fwidth(uT), fwidth(hT)), vec2(1e-3));
              float fora = smoothstep(-aa.x, aa.x, hw - abs(lu)) * smoothstep(-aa.y, aa.y, hh - abs(lh)); // window opening
              float fr = 0.07; // frame width (m)
              float vidro = smoothstep(-aa.x, aa.x, hw - fr - abs(lu)) * smoothstep(-aa.y, aa.y, hh - fr - abs(lh));
              vec2 idJ = vec2(cx, cy) + vec2(rowM * 131, rowM * 17);
              float hA = g3dH21(idJ), hB = g3dH21(idJ + 7.3), hC = g3dH21(idJ + 19.1);
              float mul = step(1.25, pA.w) * (1.0 - smoothstep(0.02, 0.02 + aa.x, abs(lu - (hB - 0.5) * 0.25 * pA.w))); // a mullion on wide windows
              float hr = uJanHora / 60.0; hr = hr < 12.0 ? hr + 24.0 : hr;
              float occ = hr < 19.0 ? mix(0.4, 0.62, clamp((hr - 17.0) / 2.0, 0.0, 1.0)) : hr < 21.0 ? mix(0.62, 0.58, (hr - 19.0) / 2.0) : hr < 23.0 ? mix(0.58, 0.36, (hr - 21.0) / 2.0) : hr < 26.0 ? mix(0.36, 0.12, (hr - 23.0) / 3.0) : 0.12; // of the eligible cells (27/10 Meta: ~30-40 % of the real window cells at 21 h)
              float liga = tem * step(hA, occ${typeof location !== 'undefined' && /[?&]jantodas=1/.test(location.search) ? ' * 0.0 + 1.0' : ''});
              // 27/10 Meta (2x/4x of v1: 'flat cream squares'): the variation of Hobbs' photo, in the far city's palette. Colour by hash:
              // warm orange 35 %, warm 30 %, yellow-white 17 %, white 10 %, cool 8 %; brightness 0.4-1.2 x (a few 1.4 x); a top-to-
              // bottom curtain gradient on ~1/3, a mild ceiling gradient on the rest, a side curtain on ~1/5; soft edges; a faint halo.
              vec3 corW = hB < 0.35 ? mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.68, 0.36), hC) : hB < 0.65 ? vec3(1.0, 0.72, 0.42) : hB < 0.82 ? mix(vec3(0.98, 0.84, 0.58), vec3(0.98, 0.9, 0.7), hC) : hB < 0.92 ? vec3(0.95, 0.9, 0.82) : mix(vec3(0.78, 0.86, 1.0), vec3(0.86, 0.92, 1.0), hC);
              float hF = g3dH21(idJ + 3.7), forcaW = 0.4 + 0.8 * pow(hF, 1.3); forcaW *= hF > 0.95 ? 1.4 : 1.0;
              float yv = clamp(lh / max(2.0 * hh, 1e-3) + 0.5, 0.0, 1.0); // 0 bottom .. 1 top
              float hG = g3dH21(idJ + 11.0);
              float grad = hG < 0.34 ? mix(1.05, 0.45, yv) : hG < 0.5 ? mix(0.5, 1.05, yv) : mix(0.88, 1.0, yv); // curtain lit from below / from above; mild ceiling light
              float temCort = step(g3dH21(idJ + 23.0), 0.2), ladoC = g3dH21(idJ + 29.0) < 0.5 ? -1.0 : 1.0, fracC = 0.3 + 0.4 * g3dH21(idJ + 31.0);
              float cort = temCort * smoothstep(-aa.x * 1.6, aa.x * 1.6, ladoC * lu - hw * (1.0 - 2.0 * fracC));
              vec3 luzW = corW * forcaW * grad * (1.0 - 0.6 * mul) * mix(1.0, 0.55, cort);
              float vidroM = smoothstep(-aa.x * 1.6, aa.x * 1.6, hw - fr - abs(lu)) * smoothstep(-aa.y * 1.6, aa.y * 1.6, hh - fr - abs(lh)); // softer edge
              float dF = length(max(vec2(abs(lu) - hw, abs(lh) - hh), vec2(0.0))), halo = (1.0 - fora) * exp(-dF / 0.2) * step(dF, 0.6);
              float ver = ${typeof location !== 'undefined' && /[?&]jangrade=1/.test(location.search) ? '1.0' : '0.0'}; // ?jangrade=1 (tests): every grid cell outlined, green = may light, red = excluded
              outgoingLight = mix(outgoingLight, outgoingLight * 0.7, uNoiteG * tem * (fora - vidro)); // frame: darker than the wall
              outgoingLight = mix(outgoingLight, luzW, uNoiteG * liga * vidroM);
              outgoingLight += uNoiteG * liga * halo * corW * forcaW * 0.12;
              outgoingLight = mix(outgoingLight, mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), tem), ver * (fora - vidro));
            }
          }
        }
      }
      if ((janT < 0.0 || faceMap < 0.5) && !verde && altoJ && abs(nB.y) < 0.3 && hLocJ > 9.0 && vB5.y > 3.5) { // 9 m (3rd floor up): the walls/parapets of the 1-2 storey houses below (prints) got shards
        // window grid along the facade. 08/10 (Victor: 'triangulos, varios formatos'): Google's mesh is a patchwork of
        // triangles with their own normals, so a grid following each triangle's normal broke every window into shards. The
        // facade direction now comes from OUR city's walls (fachadas-angulo.webp, angle mod 90 deg): every triangle of a
        // facade uses the same axis -> rectangles in rows and columns. Outside the map: the old per-triangle axis.
        vec2 tgv = normalize(vec2(-nB.z, nB.x) + 1e-5); float lado = floor(nB.x * 3.0) * 17.0 + floor(nB.z * 3.0) * 5.0; float alin = 1.0, temMapa = 0.0;
        if (uAngExt > 0.0) {
          vec2 ru = (vB5.xz + uAngExt) / (2.0 * uAngExt);
          vec3 an = texture2D(uAng, ru).rgb;
          if (an.b > 0.35 && all(greaterThan(ru, vec2(0.0))) && all(lessThan(ru, vec2(1.0)))) {
            float t = atan(an.g * 2.0 - 1.0, an.r * 2.0 - 1.0) * 0.25;
            vec2 e1 = vec2(cos(t), sin(t)), e2 = vec2(-e1.y, e1.x);
            float d1 = dot(nB.xz, e1), d2 = dot(nB.xz, e2);
            if (abs(d1) > abs(d2)) { tgv = e2; lado = sign(d1) * 17.0; } else { tgv = e1; lado = 40.0 + sign(d2) * 17.0; } temMapa = 1.0; alin = smoothstep(0.95, 0.985, max(abs(d1), abs(d2)) / max(length(nB.xz), 1e-4)); /* JANELAS-GIGANTES 26/10: was 0.88..0.95 (up to 28 deg off: parallelograms) */ // triangles > ~30 deg off the facade (balcony zig-zag) get no window: they only made shards
          }
        }
        float sF = dot(vB5.xz, tgv);
        vec2 cel = vec2(floor(sF / 3.1), floor(vB5.y / 2.85));
        vec2 f = vec2(fract(sF / 3.1), fract(vB5.y / 2.85));
        float jan = smoothstep(0.24, 0.28, f.x) * (1.0 - smoothstep(0.72, 0.76, f.x)) * smoothstep(0.34, 0.38, f.y) * (1.0 - smoothstep(0.84, 0.88, f.y)); // JANELAS-GIGANTES 26/10: 1.49 x 1.43 m (was 1.74 m wide)
        float id = g3dH21(cel + lado + floor(vB5.xz / 40.0) * 3.1);
        jan *= mix(1.0, alin, temMapa) * (uAngExt > 0.0 ? temMapa : 1.0); // RODADA 26/10: inside our facade map only (off-map triangles made loose patches)${typeof location !== 'undefined' && /[?&]gangdbg=1/.test(location.search) ? ' outgoingLight = vec3(temMapa, alin, jan) * 0.6; cB = vec3(0.0);' : ''} // ?gangdbg=1: R = facade map here, G = triangle on the facade axis, B = window
        // RODADA 26/10: a wall seen at a grazing angle (from the balcony, looking down past a roof edge) squeezes a window into a
        // loose sliver ('manchas soltas sobre os telhados'). Screen footprint anisotropy: one pixel spans much more wall along one
        // axis than the other -> no lit window there (frontal walls, near or far, keep ratio ~1)
        float gxJ = length(dFdx(vB5)), gyJ = length(dFdy(vB5));
        jan *= 1.0 - smoothstep(2.5, 4.0, max(gxJ, gyJ) / max(min(gxJ, gyJ), 1e-4));
        // and the wall must face the camera: cos(view, normal) > ~0.4 (the camera of the window photo is the balcony eye)
        vec3 camJ = (uParaB5 * vec4(cameraPosition, 1.0)).xyz;
        jan *= smoothstep(0.30, 0.45, abs(dot(nB, normalize(camJ - vB5))));
        // JANELAS-GIGANTES 26/10 (Meta, live site pub5 after an orbit at 21:00: GIANT beige rectangles on the melted mesh of the near
        // Google building in front of the tower + loose light flakes). The cell is in metres, but on Google's coarse/melted mesh
        // (a) the surface is not vertical: fade from |n.y| 0.08 to 0.16 (~5-9 deg; the gate above lets up to 0.3 = 17 deg in);
        // (b) the normal changes from pixel to pixel (small triangles at random angles = melted): fwidth of the normal;
        // (c) outside view only (uPertoJ = 1, set by ligarGoogleCena): no lit window on a wall nearer than 45 m to the camera, full
        //     from 90 m - near the camera the coarse mesh melts and one window fills a big part of the screen. The 360 window
        //     view (balcony eye, neighbours at 20-80 m) keeps them (uPertoJ = 0).
        jan *= 1.0 - smoothstep(0.08, 0.16, abs(nB.y));
        jan *= 1.0 - smoothstep(0.05, 0.15, length(fwidth(nB)));
        // JANELAS-PROXIMAS 26/10 (Meta, Site pub7 79a5d5d, Varanda 21:00: slanted triangle shards on the 2-4 nearest towers). A window
        // cell is gated fragment by fragment (normal, alignment, grazing angle), and on the fine mesh of a NEAR building each window
        // spans several Google triangles at different angles, so part of the cell passes and part does not: the lit patch takes the
        // shape of the triangles. Measured with ?jandist=1 (every gated cell coloured by distance, unit 137): cells cut into wedges on
        // every wall nearer than ~110 m, still some slivers at 110-150 m (2.5x zoom with a 100-130 m fade), whole rectangles beyond
        // 150 m (coarser tiles = planar facades). The 360 window view (uPertoJ = 0) now draws no lit window nearer than 150 m, full
        // from 190 m; the outside view keeps its 45-90 m rule.
        float dCamJ = length(camJ - vB5);
        jan *= uPertoJ > 0.5 ? smoothstep(45.0, 90.0, dCamJ) : smoothstep(${typeof location !== 'undefined' && /[?&]janperto=\d+,\d+/.test(location.search) ? location.search.match(/[?&]janperto=(\d+),(\d+)/).slice(1, 3).map((x) => x + '.0').join(', ') : '150.0, 190.0'}, dCamJ); // ?janperto=A,B (tests): other fade distances in metres${typeof location !== 'undefined' && /[?&]jandist=1/.test(location.search) ? ' { float dJ = length(camJ - vB5); outgoingLight = cB * 0.35 + jan * (dJ < 40.0 ? vec3(1.0, 0.0, 0.0) : dJ < 60.0 ? vec3(1.0, 0.5, 0.0) : dJ < 80.0 ? vec3(1.0, 1.0, 0.0) : dJ < 110.0 ? vec3(0.0, 1.0, 0.0) : dJ < 150.0 ? vec3(0.0, 1.0, 1.0) : vec3(0.3, 0.3, 1.0)); cB = vec3(0.0); jan = 0.0; }' : ''} // ?jandist=1 (tests): every window cell that passes the gates, coloured by distance to the camera: red < 40 m, orange < 60, yellow < 80, green < 110, cyan < 150, blue beyond
        float acesa = step(id, uFracG) * jan;
        float lum = dot(cB, vec3(0.2126, 0.7152, 0.0722));
        float vidro = 1.0 - smoothstep(0.18, 0.5, lum);
        vec3 quente = mix(vec3(1.0, 0.72, 0.42), vec3(0.95, 0.9, 0.82), step(0.82, g3dH21(cel + 7.0)));
        float forca = 0.12 + 0.88 * pow(g3dH21(cel + 3.0), 2.2);
        outgoingLight += uNoiteG * acesa * mix(0.5, 1.0, vidro) * quente * forca * 0.85;
      }
    }
  }`;
// building ghosts: same rule as entorno.js (whole building between camera and tower, or around the camera, is not drawn).
// The building of a Google fragment = the footprint texel under it (5 taps, 2.5 m apart: Google's walls a bit outside our
// footprints still go with their building). Ground + lower 5 m always stay (street slope).
const FANT_GLSL = `
uniform sampler2D uMapaP; uniform vec4 uMapaR; uniform vec3 uCamB5; uniform vec3 uAlvoB5; uniform sampler2D uTerr; uniform float uTerrExt;
bool g3dSome(vec4 c) {
  if (c.a < 0.5) return false;
  vec2 a = uCamB5.xz, b = uAlvoB5.xz, ab = b - a;
  float t = clamp(dot(c.xy - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  float d = length(c.xy - (a + ab * t));
  // only buildings that really stand on the line of sight to the tower (Victor 07/10: they vanished too early). c.z = the
  // building's radius; the tower is ~12 m wide
  // 08/10 (Victor: houses below were cut out too, leaving a hole in the ground): only what rises above the line of sight
  // camera -> tower at that point blocks the view. c.w = 1 + roof height of the building (cena3d montaMapaPredios)
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
  // keep the ground: 1.2 m above the real terrain (our city's street map), or 5 m where there is no terrain data
  float chao = 3.8;
  if (uTerrExt > 0.0) { vec2 rq = (p.xz + uTerrExt) / (2.0 * uTerrExt); if (all(greaterThan(rq, vec2(0.0))) && all(lessThan(rq, vec2(1.0)))) chao = texture2D(uTerr, rq).b * 60.0 - 20.0; }
  if (p.y < chao + 1.2) return false;
  vec2 uv = vec2((p.x - uMapaR.x) * uMapaR.z, 1.0 - (p.z - uMapaR.y) * uMapaR.z), e = vec2(2.5 * uMapaR.z, 0.0); // map camera up = -z: v 0 at z max
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return false;
  return g3dSome(texture2D(uMapaP, uv)) || g3dSome(texture2D(uMapaP, uv + e.xy)) || g3dSome(texture2D(uMapaP, uv - e.xy))
      || g3dSome(texture2D(uMapaP, uv + e.yx)) || g3dSome(texture2D(uMapaP, uv - e.yx));
}
`;
// 21/10 C7 (Victor: Google's city pale / blown out by day, fine at night): DAY grade of the photo city, tied to our sun.
// Same kind of change the code already applies to the tiles (a global exposure/curve over the whole image, like uLuz):
// no content changed, Google logo and data attribution untouched (G1-TERMOS U4: colour/light on the tiles = grey zone,
// kept moderate). Applied on luminance (hue kept): exposure, contrast below a mid-grey pivot (toe), saturation; in the 360 window
// also a highlight shoulder after the window gain (1.35x clipped the bright facades to 255). Weight w = smooth(-2, 10, sun
// elevation): 0 with the sun below -2 deg -> late dusk and night EXACTLY as before. ?g3dgrade=0 = off (before/after check).
export const GRADE_G3D = { expo: 0.85, contraste: 1.3, sat: 1.2, pivo: 0.18, joelho: 0.6 };
const GRADE_DESL = typeof location !== 'undefined' && /[?&]g3dgrade=0/.test(location.search);
export function gradeGoogle(el) {
  const e = Number.isFinite(el) ? el : -20, w = GRADE_DESL ? 0 : smooth(-2, 10, e), G = GRADE_G3D;
  const m = (v) => +(1 + (v - 1) * w).toFixed(4);
  return { w: +w.toFixed(4), expo: m(G.expo), contraste: m(G.contraste), sat: m(G.sat), pivo: G.pivo, joelho: G.joelho };
}
// 21/10 C8 (Victor: 'da pra melhorar alguma coisa nessas imagens do 3D do Google sem o drone?'): render-only improvements of
// Google's city, no content changed (G1-TERMOS: logo, attribution and the mesh untouched; same kind of change as the grade):
//   ?g3daniso=0   anisotropic filtering of the tile photos (16x, the GPU clamps it): ground, roofs and facades seen at a slant
//   ?g3dmsaa=0    4x MSAA on the 360 window (live target on computers; window photo on phones via one shared region target)
//   ?g3dnitidez=0 light sharpening of the tile photo (unsharp mask at screen-pixel scale, capped; ?g3dnitidez=<amount> tests)
//   ?g3derrk=     tests only: factor on the detail target (errorTarget) of both views
// (outside haze 900-3200 m: tested 1500-3500 m, changed only 0.4% of Google's pixels in the measured views -> left as it was)
const QS8 = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams(''), Q8 = [QS8.get('g3daniso'), QS8.get('g3dmsaa'), QS8.get('g3dnitidez'), QS8.get('g3derrk'), QS8.get('g3dplanos'), QS8.get('g3dplanosr'), QS8.get('g3dplanosdbg')]; // ?g3dplanos=1 (C8b, off by default: artifacts) ?g3dplanosr=<m> ?g3dplanosdbg=1 (boxes tinted red)
export const C8 = { aniso: Q8[0] === '0' ? 1 : 16, msaa: Q8[1] === '0' ? 0 : 4, nitidez: Q8[2] == null ? 0.6 : (+Q8[2] || 0), erroK: +Q8[3] || 1, planos: Q8[4] === '1' ? 1 : 0, planosR: +Q8[5] || 100, planosPx: 14, planosDbg: Q8[6] === '1' ? 1 : 0 };
const DESPRE = { value: C8.msaa ? 1 : 0 }; // overlay: the MSAA edges are stored premultiplied (colour x coverage); divided back before use
// unsharp mask of the tile photo, one screen pixel's uv step (dFdx/dFdy), in a gamma-2 space (dark detail counts like bright), capped
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
// C8b 21/10: map of a near neighbour's clean face (baked from Google's own facade): where the slab had no Google surface (alpha 0)
// the hole takes the blurred colour of the same face (two mip levels, premultiplied), never an invented colour
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
let NOITE_DADOS = null; // assets/entorno/janelas-noite.json (JANELAS-NOITE: offline window grids of the near towers), loaded once
let PLANOS_DADOS = null; // assets/entorno/vizinhos-planos.json (docs/b10-scripts/gera_vizinhos_planos.py), loaded once
// same curve as our city (entorno.js gradeEntorno): base grade by sun elevation + window lights at night
export function luzDaCidade(el) {
  const e = Number.isFinite(el) ? el : -20;
  const k = 0.04 + 0.96 * fatorDia(e), azul = smooth(-14, -3, e) * (1 - smooth(-2, 8, e)), noite = 1 - smooth(-14, -4, e);
  const base = [1, 1, 1].map((v, i) => { let x = v; x += ([0.90, 0.95, 1.06][i] - x) * azul * 0.6; x += ([0.62, 0.74, 1.05][i] - x) * noite; return x * k; });
  return { base, luzes: fatorLuzesNoite(e) * (1 - smooth(-7, 0, e)) };
}
// ---------------------------------------------------------------- shared session (ONE root tileset request per page load)
let sessao = null;
export const STATUS = { estado: 'parado', erro: null, raiz: 0, bytes: 0, tiles: 0 };
if (typeof window !== 'undefined') window.__g3d = STATUS;
// C8: test captures switch the improvements in ONE page load (one Google session); aplicar({ aniso, msaa, nitidez, erroK })
if (typeof window !== 'undefined') window.__g3dC8 = { C8, aplicar(o) { Object.assign(C8, o || {}); DESPRE.value = C8.msaa ? 1 : 0; if (sessao) sessao.then((s) => { if (s && s.aplicarC8) s.aplicarC8(); }); return { ...C8 }; } };

export function iniciarGoogle() {
  if (sessao) return sessao;
  sessao = (async () => {
    const chave = await chaveDaPagina();
    if (!chave || desligadoPorUrl()) { STATUS.estado = 'sem-chave'; return null; }
    if (!capacidade().google) { STATUS.estado = 'aparelho-leve'; return null; } // weak phone: our city only
    STATUS.estado = 'carregando';
    try {
      const [{ TilesRenderer }, { GoogleCloudAuthPlugin }] = await Promise.all([import(`${CDN}index.js`), import(`${CDN}index.core-plugins.js`)]);
      const tiles = new TilesRenderer();
      const auth = new GoogleCloudAuthPlugin({ apiToken: chave, autoRefreshToken: true, logoUrl: LOGO, useRecommendedSettings: false });
      tiles.registerPlugin(auth);
      // 27/10 ASK 8 (a): the site embeds the module twice (hero + block-3 tour, same origin). Google's tile files are sent with
      // 'Cache-Control: private, max-age=14400' (measured 27/10), but their URLs carry the session token, so the tour's own session
      // missed every file the hero had already downloaded. The frames now share ONE session through a BroadcastChannel of the
      // origin: a frame starting asks (1.5 s max) and reuses the token of a frame already running; the browser's HTTP cache then
      // serves the tour the files the hero downloaded. Each frame still requests its own root.json. Embedded only; ?gpartilha=0 = off.
      let canal = null, sessaoHeroi = null; // root.json with another frame's session = HTTP 400 (measured): the shared token is set AFTER this frame's own root
      try { if (window.parent !== window && typeof BroadcastChannel !== 'undefined' && !/[?&]gpartilha=0/.test(location.search)) canal = new BroadcastChannel('g3d-sessao'); } catch (e) { canal = null; }
      if (canal) {
        const veio = await new Promise((ok) => { const t = setTimeout(() => ok(null), 1500); canal.onmessage = (ev) => { const d = ev.data; if (d && d.sessao) { clearTimeout(t); ok(d.sessao); } }; canal.postMessage({ pede: 1 }); });
        if (veio) sessaoHeroi = veio; else STATUS.canal = 'sem-resposta';
        STATUS.respostas = 0;
        canal.onmessage = (ev) => { const d = ev.data; if (d && d.pede) { if ((auth.auth || auth).sessionToken) { canal.postMessage({ sessao: (auth.auth || auth).sessionToken }); STATUS.respostas++; } else STATUS.semToken = (STATUS.semToken || 0) + 1; } };
      }
      const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
      const gltf = new GLTFLoader(tiles.manager); gltf.setDRACOLoader(draco);
      tiles.manager.addHandler(/\.gltf$/, gltf);
      tiles.errorTarget = 8;                      // detail: close, narrow views (each view sets its own below)
      if (tiles.downloadQueue) { if ('maxJobsPerOrigin' in tiles.downloadQueue) tiles.downloadQueue.maxJobsPerOrigin = 30; else tiles.downloadQueue.maxJobs = 30; } // 21/10: 0.5.3 renamed it (the old name = same setter + a console warning)
      if (tiles.parseQueue) tiles.parseQueue.maxJobs = capacidade().parse; // fewer parses per frame on phones: less stutter while loading
      // 07/10: at 300 MB the cache was FULL (315 MB) and the renderer refused every finer tile -> coarse city. The full-detail
      // view needs more; ?gmb=<MB> overrides for measuring. Same on phones (high-end target): no coarsening.
      // budget by device: phones report navigator.deviceMemory (GB, capped at 8); measured 07/10: outside view ~600 MB of tiles
      const movel = capacidade().movel;
      const mb = +new URLSearchParams(location.search).get('gmb') || capacidade().tilesMB;
      tiles.lruCache.maxBytesSize = mb * 1048576;
      // keep EVERYTHING already downloaded until the device budget is nearly full (Victor 07/10: turning away and back made
      // the city reload); only then the least recently seen tiles go
      tiles.lruCache.minBytesSize = Math.round(mb * 0.95) * 1048576;
      tiles.autoDisableRendererCulling = true;
      const escena = new THREE.Scene(); escena.add(tiles.group);
      const s = { tiles, escena, TilesRenderer, dono: null, cor: [1, 1, 1] };
      // 21/10 NO-CAMERAS: the cache flushes (passoFoto, soltaCache) drop every camera ON PURPOSE and run one traversal so the LRU
      // unloads what no view uses. TilesRenderer.update() = the base update + console.warn('no cameras defined') when it has no camera
      // (4x per window photo on mid phones, root 21/10). The flush calls the base update itself: same traversal and unload, no warning.
      const atualizaBase = Object.getPrototypeOf(TilesRenderer.prototype).update;
      s.esvaziar = () => { if (typeof atualizaBase === 'function') atualizaBase.call(tiles); else tiles.update(); };
      // ONE tiles set serves two views (outside scene and 360 window). Whoever draws takes it: its scene, its frame, ONLY its
      // camera (a forgotten camera keeps loading tiles for a view nobody sees) and its detail target.
      s.tomar = (quem, pai, matriz, cam, erro) => {
        if (s.dono !== quem) {
          if (s.dono && s.dono.restauraCache) s.dono.restauraCache(); // the 360 photo freed the tiles: the next view gets its budget back
          s._recFeito = false; if (s.recorte) { s.recorte.vizN.value = 0; s.recorte.perto.value = 0; s.recorte.janN.value = 0; s.recorte.janDetOk.value = 0; s.recorte.mapaR.value.w = 0; s.recorte.ret.value.set(1, 1, 0, 0); } // building ghosts only in the outside view (cena3d turns them on)
          for (const c of [...tiles.cameras]) tiles.deleteCamera(c);
          tiles.setCamera(cam);
          const g = tiles.group; if (g.parent !== pai) { g.parent?.remove(g); pai.add(g); }
          s.dono = quem; if (s.ritmoFora) s.ritmoFora(); // ASK 8: the 360 taking the tiles lifts the outside view's slow rhythm
        }
        const g = tiles.group; g.matrixAutoUpdate = false;
        if (!g.matrix.equals(matriz)) { g.matrix.copy(matriz); g.matrixWorldNeedsUpdate = true; if (s.atualizaRecorte) s.atualizaRecorte(); }
        else if (s.dono === quem && s.recorte && s.recorte.ecefParaB5 && !s._recFeito) { s._recFeito = true; s.atualizaRecorte(); }
        tiles.errorTarget = erro * C8.erroK;
        if (quem && quem._janPlanos) quem._janPlanos(); // JANELAS-PLANOS: wall planes of the near footprint buildings (360 view)
      };
      // Memory (07/10, Victor's Android crashed "Ah, nao!"): tiles keep a CPU copy besides the GPU one. Dropping it was
      // tried and REVERTED: the outside view and the 360 draw the same tiles with two different WebGL contexts, and the second
      // one still needs the data ('Unsupported buffer data format'). Memory is held by the per-device budget (src/capacidade.js).
      // Clip box of OUR tower (B5 frame): Google's own mesh of the building is not drawn inside it, in both views. One set
      // of shared uniforms; uParaB5 = (ECEF -> B5) x inverse(current group world matrix), refreshed when a view takes the tiles.
      // + ghost box: uRet = screen rectangle (drawing-buffer px) of our tower, uProf = its nearest view depth; Google's
      // fragments inside the rectangle and nearer than the tower are dropped (x0 > x1 = off, e.g. in the 360)
      s.recorte = { liga: { value: 0 }, min: { value: new THREE.Vector3() }, max: { value: new THREE.Vector3() }, paraB5: { value: new THREE.Matrix4() }, ecefParaB5: null,
        ret: { value: new THREE.Vector4(1, 1, 0, 0) }, prof: { value: 0 },
        luz: { value: new THREE.Vector3(1, 1, 1) }, noite: { value: 0 }, frac: { value: 0.25 }, perto: { value: 0 }, janB: { value: Array.from({ length: 64 }, () => new THREE.Vector4()) }, janN: { value: 0 }, janDet: { value: null }, janDetOk: { value: 0 }, janMap: { value: null }, janHora: { value: 1260 }, grade: { value: new THREE.Vector4(1, 1, 1, 0.18) }, nit: { value: C8.nitidez }, viz: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, vizN: { value: 0 },
        mapa: { value: null }, mapaR: { value: new THREE.Vector4(0, 0, 0, 0) }, camB5: { value: new THREE.Vector3() }, alvoB5: { value: new THREE.Vector3() },
        terr: { value: null }, terrExt: { value: 0 }, ang: { value: null }, angExt: { value: 0 }, lote: { value: Array.from({ length: 24 }, () => new THREE.Vector2()) }, loteN: { value: 0 } };
      const shaderRecorte = (sh) => {
        sh.uniforms.uLote = s.recorte.lote; sh.uniforms.uLoteN = s.recorte.loteN; sh.uniforms.uRecLiga = s.recorte.liga; sh.uniforms.uRecMin = s.recorte.min; sh.uniforms.uRecMax = s.recorte.max; sh.uniforms.uParaB5 = s.recorte.paraB5;
        sh.uniforms.uRet = s.recorte.ret; sh.uniforms.uProf = s.recorte.prof;
        sh.uniforms.uLuz = s.recorte.luz; sh.uniforms.uNoiteG = s.recorte.noite; sh.uniforms.uFracG = s.recorte.frac; sh.uniforms.uPertoJ = s.recorte.perto; sh.uniforms.uJanB = s.recorte.janB; sh.uniforms.uJanN = s.recorte.janN; sh.uniforms.uJanDet = s.recorte.janDet; sh.uniforms.uJanDetOk = s.recorte.janDetOk; sh.uniforms.uJanMap = s.recorte.janMap; sh.uniforms.uJanHora = s.recorte.janHora; sh.uniforms.uGrade = s.recorte.grade; sh.uniforms.uNitG = s.recorte.nit; sh.uniforms.uViz = s.recorte.viz; sh.uniforms.uVizN = s.recorte.vizN;
        sh.uniforms.uMapaP = s.recorte.mapa; sh.uniforms.uMapaR = s.recorte.mapaR; sh.uniforms.uCamB5 = s.recorte.camB5; sh.uniforms.uAlvoB5 = s.recorte.alvoB5;
        sh.uniforms.uTerr = s.recorte.terr; sh.uniforms.uTerrExt = s.recorte.terrExt; sh.uniforms.uAng = s.recorte.ang; sh.uniforms.uAngExt = s.recorte.angExt;
        sh.vertexShader = 'uniform mat4 uParaB5;\nvarying vec3 vB5;\nvarying float vProf;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvB5 = (uParaB5 * modelMatrix * vec4(transformed, 1.0)).xyz;\nvProf = -mvPosition.z;');
        sh.fragmentShader = 'uniform mat4 uParaB5;\nuniform vec2 uLote[24];\nuniform float uLoteN;\nbool g3dNoLote(vec2 p) { bool d = false; for (int i = 0; i < 24; i++) { if (float(i) >= uLoteN) break; vec2 a = uLote[i], b = uLote[i + 1 < 24 ? i + 1 : 0]; if (float(i + 1) >= uLoteN) b = uLote[0]; if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) d = !d; } return d; }\nuniform float uRecLiga;\nuniform vec3 uRecMin;\nuniform vec3 uRecMax;\nuniform vec4 uRet;\nuniform float uProf;\nvarying vec3 vB5;\nvarying float vProf;\n'
          + 'uniform vec4 uGrade;\nuniform float uNitG;\nuniform vec4 uViz[16];\nuniform float uVizN;\nbool g3dNoViz(vec3 p) { for (int i = 0; i < 8; i++) { if (float(i) >= uVizN) break; vec4 a = uViz[2 * i], b = uViz[2 * i + 1]; vec2 d = p.xz - a.xy; vec2 q = vec2(dot(d, b.xy), dot(d, vec2(-b.y, b.x))); if (abs(q.x) < a.z && abs(q.y) < a.w && p.y > b.z && p.y < b.w) return true; } return false; }\n' + GRADE_GLSL + 'uniform vec3 uLuz;\nuniform float uNoiteG;\nuniform float uFracG;\nuniform float uPertoJ;\nuniform vec4 uJanB[64];\nuniform float uJanN;\nuniform sampler2D uJanDet;\nuniform highp sampler2D uJanMap;\nuniform float uJanHora;\nuniform float uJanDetOk;\nuniform sampler2D uAng;\nuniform float uAngExt;\nfloat g3dH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n'
          + FANT_GLSL
          + sh.fragmentShader.replace('#include <map_fragment>', NIT_GLSL).replace('#include <opaque_fragment>', LUZ_GLSL + '\n#include <opaque_fragment>').replace('void main() {',
          'void main() {\n  if (uRecLiga > 0.5 && all(greaterThan(vB5, uRecMin)) && all(lessThan(vB5, uRecMax))) discard;\n  if (uRecLiga > 0.5 && uLoteN > 2.5 && vB5.y > uRecMin.y && vB5.y < uRecMax.y && g3dNoLote(vB5.xz)) discard;\n  if (g3dFantasma(vB5)) discard;\n#ifndef G3D_PLANO\n  if (uVizN > 0.5 && g3dNoViz(vB5)) discard;\n#endif');
      };
      s.shaderRecorte = shaderRecorte;
      // facade orientation of our city's walls (+-2048 m around the B5 origin): straight window rows at night (LUZ_GLSL)
      new THREE.TextureLoader().load('assets/entorno/fachadas-angulo.webp', (t) => { t.colorSpace = THREE.NoColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; s.recorte.ang.value = t; s.recorte.angExt.value = PREDIO_CFG.entorno.extensaoFachadas_m; /* C9: predio.json (+-2048 m on the Upper) */ }, undefined, () => { /* optional: old per-triangle grid */ });
      const recortar = (o) => {
        if (!o.isMesh || !o.material || o.material.__recorte) return;
        const m = o.material; m.__recorte = true;
        m.onBeforeCompile = shaderRecorte;
        m.customProgramCacheKey = () => 'g3d-recorte';
        m.needsUpdate = true;
      };
      tiles.addEventListener('load-model', (ev) => ev.scene.traverse(recortar));
      // outside view: tiles also on layer 3 (the shadow-overlay pass of cena3d.js) and able to receive the sun's shadow map
      tiles.addEventListener('load-model', (ev) => ev.scene.traverse((o) => { if (o.isMesh) { o.layers.enable(3); o.receiveShadow = true; o.castShadow = false; } }));
      // C8 21/10: anisotropic filtering of the tile photos (ground, roofs, facades seen at a slant stay sharp); ?g3daniso=0 = off
      tiles.addEventListener('load-model', (ev) => ev.scene.traverse((o) => { if (o.isMesh && o.material && o.material.map) o.material.map.anisotropy = C8.aniso; }));
      // C8: the switches again on the tiles already loaded (test captures toggle them in one page load)
      s.aplicarC8 = () => { s.recorte.nit.value = C8.nitidez; tiles.forEachLoadedModel((sc) => sc.traverse((o) => { const x = o.isMesh && o.material && o.material.map; if (x && x.anisotropy !== C8.aniso) { x.anisotropy = C8.aniso; x.needsUpdate = true; } })); };
      s.atualizaRecorte = () => {
        if (!s.recorte.ecefParaB5) return;
        tiles.group.updateMatrixWorld(true);
        s.recorte.paraB5.value.copy(s.recorte.ecefParaB5).multiply(new THREE.Matrix4().copy(tiles.group.matrixWorld).invert());
      };
      // time of day for ALL tiles (shared uniforms; per-material colour left stale tints on cached tiles = patches)
      s.pintar = () => {};
      s.definirLuz = (el) => { const L = luzDaCidade(el), Gr = gradeGoogle(el); s.recorte.luz.value.set(L.base[0], L.base[1], L.base[2]); s.recorte.noite.value = L.luzes; s.recorte.grade.value.set(Gr.expo, Gr.contraste, Gr.sat, Gr.pivo); STATUS.luz = { el: Number.isFinite(el) ? +el.toFixed(2) : null, base: L.base.map((x) => +x.toFixed(4)), luzes: +L.luzes.toFixed(4), grade: Gr }; };
      await new Promise((ok, falha) => {
        const t = setTimeout(() => falha(new Error('timeout da raiz')), 20000);
        const aoRaiz = () => { clearTimeout(t); STATUS.raiz++; tiles.removeEventListener('load-root-tileset', aoRaiz); ok(); };
        tiles.addEventListener('load-root-tileset', aoRaiz);
        const aoErro = (ev) => { clearTimeout(t); tiles.removeEventListener('load-error', aoErro); falha(ev.error || new Error('load-error')); };
        tiles.addEventListener('load-error', aoErro);
        // the root json is only requested on the first update() with a camera
        const cam = new THREE.PerspectiveCamera(60, 1, 1, 1000); cam.updateMatrixWorld();
        tiles.setCamera(cam); tiles.setResolution(cam, 256, 256); tiles.update();
        s._camInicial = cam;
      });
      tiles.deleteCamera(s._camInicial);
      if (sessaoHeroi) { (auth.auth || auth).sessionToken = sessaoHeroi; STATUS.sessaoPartilhada = true; } // ASK 8 (a): the children then have the same URLs as the other frame's
      tiles.addEventListener('load-error', (ev) => { STATUS.erro = String(ev.error && ev.error.message || ev.error).slice(0, 160); });
      STATUS.estado = 'pronto';
      return s;
    } catch (e) {
      STATUS.estado = 'falhou'; STATUS.erro = String(e && e.message || e).slice(0, 160);
      return null;
    }
  })();
  return sessao;
}

// ---------------------------------------------------------------- a view: camera at the eye, tiles rendered to a target
// ref = { lat, lon, h (ellipsoid metres), rumo (bearing of the pano centre, deg), ajuste: { enu:[e,n,u], rumo:dDeg } }
export class VistaGoogle {
  constructor(renderer, s, ref, aoMudar) {
    this.r = renderer; this.s = s; this.ref = ref; this.aoMudar = aoMudar || (() => {});
    this.cam = new THREE.PerspectiveCamera(60, 1, 3, 20000);
    // tiles are SELECTED with a camera cropped to the window on screen (setViewOffset): nothing behind the walls is
    // downloaded, same pixel density inside the window. Drawing still uses the full camera.
    this.camSel = new THREE.PerspectiveCamera(60, 1, 3, RAIO);
    this.dirs = null; this.mascaraFonte = null;
    this.rt = null; this.ativo = true; this.ocioso = 0; this.larg = 0; this.alt = 0; this.escala = 1;
    this.alvoDir = new THREE.Vector3(0, 0, -1);
    this.ligaNaCena();
    this._aoCarregar = () => this.acordar();
    for (const ev of ['load-model', 'tiles-load-end', 'needs-update', 'tile-visibility-change']) s.tiles.addEventListener(ev, this._aoCarregar);
    this.credito = this.montaCredito();
  }
  ligaNaCena() {
    const { lat, lon, h, ajuste } = this.ref;
    this.matriz = matrizLocal(lat, lon, h, (ajuste && ajuste.enu) || []);
  }
  // scene-frame view direction (X=-v, Y=h, Z=u as in tour360.js) -> local frame L
  dirParaL(dx, dy, dz) {
    const f = -dx, r = -dz;
    const b = ((this.ref.rumo + ((this.ref.ajuste && this.ref.ajuste.rumo) || 0)) * Math.PI) / 180;
    const E = Math.sin(b) * f + Math.sin(b + Math.PI / 2) * r, N = Math.cos(b) * f + Math.cos(b + Math.PI / 2) * r;
    return new THREE.Vector3(E, dy, -N);
  }
  tamanho(w, h, escala) {
    this.larg = Math.max(2, Math.round(w * escala)); this.alt = Math.max(2, Math.round(h * escala)); this.escala = escala;
    const ns = C8.msaa ? Math.min(C8.msaa, this.r.capabilities.maxSamples || 0) : 0; // C8 21/10: 4x MSAA (edges of Google's buildings against the sky were stair-stepped)
    if (this.rt && (this.rt.width !== this.larg || this.rt.height !== this.alt || this.rt.samples !== ns)) { this.rt.dispose(); this.rt = null; }
    if (this.rtV && (this.rtV.width !== this.larg || this.rtV.height !== this.alt || this.rtV.samples !== ns)) { this.rtV.dispose(); this.rtV = null; }
    if (!this.rt) {
      const gl = this.r.getContext();
      const half = this.r.capabilities.isWebGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
      this.rt = new THREE.WebGLRenderTarget(this.larg, this.alt, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: false, samples: ns });
      this.rt.texture.colorSpace = half ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
      this.rt.texture.minFilter = this.rt.texture.magFilter = THREE.LinearFilter;
    }
    this.resW = w; this.resH = h; // REAL drawing-buffer size (dpr included), not the scaled target
  }
  // window mask (pano equirect, bitmap row 0 = v 0 as loaded by render-mix) -> list of scene-frame directions where it is open
  // ASK 8: the window view now starts while the panorama layers are still loading; until a layer is in, its texture's image is not
  // drawable (measured on TEST, entering the tour from the outside view: drawImage threw and Google was turned off for the visit)
  static desenhavel(img) { return !!img && ((typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement && img.naturalWidth > 0) || (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)); }
  definirMascara(img) {
    if (!VistaGoogle.desenhavel(img) || img === this.mascaraFonte) return;
    this.mascaraFonte = img;
    const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, out = [];
    for (let r = 0; r < H; r++) for (let k = 0; k < W; k++) {
      if (px[(r * W + k) * 4] < 64) continue;
      const phi = ((k + 0.5) / W) * 2 * Math.PI, th = Math.PI * (1 - (r + 0.5) / H); // SphereGeometry uv, x mirrored (scale -1)
      out.push(Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    }
    this.dirs = new Float32Array(out);
  }
  // 13/10 (R3b): the facade glass seen from the balcony gets its own direction list, so the mirror is drawn whenever the
  // GLASS is on screen, also when the window is on screen at the same time (before: window on screen = no city in the glass)
  definirVidro(img) {
    if (!VistaGoogle.desenhavel(img) || img === this.vidroFonte) return;
    this.vidroFonte = img;
    const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data, out = [];
    for (let r = 0; r < H; r++) for (let k = 0; k < W; k++) {
      if (px[(r * W + k) * 4] < 64) continue;
      const phi = ((k + 0.5) / W) * 2 * Math.PI, th = Math.PI * (1 - (r + 0.5) / H);
      out.push(Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    }
    this.dirsV = new Float32Array(out);
  }
  // JANELAS-PLANOS: the near LiDAR boxes (vizinhos-planos.json) around this eye -> uJanB (32 nearest, < 260 m, height >= 6 m,
  // rectangle fill >= 0.7; up to 32 boxes). Recomputed when the eye moves (another point / unit). 27/10 JANELAS-NOITE: DEFAULT in the 360 window; ?janplanos=0 = the pub 9 rule (tests).
  _janPlanos() {
    const R = this.s.recorte;
    if (!R.janB || !R.ecefParaB5 || !this.matriz || (typeof location !== 'undefined' && /[?&]janplanos=0/.test(location.search))) { if (R.janN) R.janN.value = 0; return; } // 27/10 JANELAS-NOITE: default ON in the 360 window; ?janplanos=0 = the pub 9 rule (tests)
    const chave = this.matriz.elements.map((x) => x.toFixed(2)).join(',');
    if (this._janChave === chave) { R.janN.value = this._janN || 0; R.janDetOk.value = this._janDet ? 1 : 0; if (this._janDet) R.janDet.value = this._janDet.tex; return; }
    this._janChave = chave; this._janN = 0; R.janN.value = 0;
    if (!PLANOS_DADOS) PLANOS_DADOS = fetch('assets/entorno/vizinhos-planos.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!NOITE_DADOS) NOITE_DADOS = fetch('assets/entorno/janelas-noite.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([PLANOS_DADOS, NOITE_DADOS]).then(([D, JN]) => {
      if (this._janChave !== chave || !D || !D.partes) return;
      const paraB5 = new THREE.Matrix4().copy(R.ecefParaB5).multiply(this.matriz.clone().invert());
      const olho = new THREE.Vector3(0, 0, 0).applyMatrix4(paraB5);
      const dist = (p) => { const c = Math.cos(p.a), s = Math.sin(p.a), dx = olho.x - p.c[0], dz = olho.z - p.c[1];
        const qx = dx * c + dz * s, qz = -dx * s + dz * c; return Math.hypot(Math.max(Math.abs(qx) - p.h[0], 0), Math.max(Math.abs(qz) - p.h[1], 0)); };
      const sel = D.partes.filter((p) => p.fill >= 0.7 && p.y[1] - p.y[0] >= 6).map((p) => ({ p, d: dist(p) })).filter((x) => x.d < 260 && x.d > 2).sort((a, b) => a.d - b.d).slice(0, 32);
      sel.forEach(({ p }, i) => { R.janB.value[2 * i].set(p.c[0], p.c[1], p.h[0], p.h[1]); R.janB.value[2 * i + 1].set(Math.cos(p.a), Math.sin(p.a), p.y[0], p.y[1]); });
      // JANELAS-NOITE: the offline grid of each selected face -> rows of uJanMap (96 x 128 RGBA float)
      if (!R.janMap.value) { const t = new THREE.DataTexture(new Float32Array(96 * 128 * 4), 96, 128, THREE.RGBAFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; R.janMap.value = t; }
      { const T = R.janMap.value, d = T.image.data, F = (JN && JN.faces) || {}; d.fill(0); let nF = 0;
        sel.forEach(({ p }, i) => { for (let f = 0; f < 4; f++) {
          const m = F[`${p.id}.${p.n || 0}-f${f}`]; if (!m || !((m.colunas_u.length && m.linhas_h.length) || m.sacada)) continue;
          const row = i * 4 + f, k0 = row * 96 * 4, nc = Math.min(64, m.colunas_u.length); nF++;
          if (m.sacada) { const q = m.sacada; d.set([q.u[0], q.u[1], q.h0, q.andar], k0 + 80 * 4); d.set([q.linhas, q.alt, q.unidade, 1], k0 + 81 * 4); }
          if (!nc || !m.linhas_h.length) continue;
          d.set([0, 0, nc, m.janela.larg], k0); d.set([m.linhas_h[0], m.andar, Math.min(62, m.linhas_h.length), m.janela.alt], k0 + 4);
          d.set(m.colunas_u.slice(0, nc), k0 + 8);
          m.mascara.slice(0, 62).forEach((lin, r) => { const w = [0, 0, 0, 0]; for (let c = 0; c < Math.min(nc, lin.length); c++) if (lin[c] === '1') w[Math.floor(c / 24)] += 2 ** (c % 24); d.set(w, k0 + (18 + r) * 4); });
        } });
        T.needsUpdate = true; this._janFaces = nF; }
      this._janSel = sel.map((x) => x.p); this._janDet = null; // JANELAS-COMBINADAS: detection redone for this eye
      this._janN = sel.length; if (this.s.dono === this) R.janN.value = sel.length;
      if (typeof window !== 'undefined') window.__g3dJanPlanos = { olho: olho.toArray().map((x) => +x.toFixed(1)), n: sel.length, ids: sel.map((x) => x.p.id + ':' + x.d.toFixed(0)) };
      this.acordar();
    });
  }
  // JANELAS-COMBINADAS 27/10: per cell of the near LiDAR walls, find Google's window opening ONCE (not per fragment: per-fragment texture
  // lookups gave a different answer on every triangle). When the live window view has settled, the city is drawn once more with neutral
  // light into a small target, read back IN MEMORY (never stored), and each cell visible in it is tested: 9 samples along the bay at
  // window height and 5 up the floor; an opening = clearly darker than the wall (< 0.62 x), not a wide dark band (<= 4 of 9 dark), wall
  // above and below. Result per cell (found, centre along the bay, centre height) in a 128 x 4096 texture read by the tile shader, which
  // draws a standard window (1.2 x 1.3 m) centred there. Cells never seen or ambiguous stay unlit. Rotating the view re-tests new cells.
  _janDetecta() {
    const R = this.s.recorte, S = this._janSel; if (!S || !R.ecefParaB5 || !this.rt) return;
    const W = Math.min(1600, this.larg), H = Math.max(2, Math.round(W * this.alt / this.larg));
    if (!this._detRT || this._detRT.width !== W || this._detRT.height !== H) { if (this._detRT) this._detRT.dispose(); this._detRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: true, generateMipmaps: false }); }
    const r = this.r, ant = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    const luz0 = R.luz.value.clone(), noite0 = R.noite.value, grade0 = R.grade.value.clone();
    R.luz.value.set(1, 1, 1); R.noite.value = 0; R.grade.value.set(1, 1, 1, 0.18);
    r.setRenderTarget(this._detRT); r.setClearColor(0x000000, 0); r.clear(); r.render(this.s.escena, this.cam);
    const px = new Uint8Array(W * H * 4); r.readRenderTargetPixels(this._detRT, 0, 0, W, H, px);
    R.luz.value.copy(luz0); R.noite.value = noite0; R.grade.value.copy(grade0); r.setRenderTarget(ant); r.setClearColor(cc, ca);
    if (!this._janDet) { const d = new Uint8Array(128 * 4096 * 4); const tex = new THREE.DataTexture(d, 128, 4096, THREE.RGBAFormat, THREE.UnsignedByteType); tex.minFilter = tex.magFilter = THREE.NearestFilter; this._janDet = { d, tex, n: 0 }; }
    const D = this._janDet.d, ML = this._planosParaL(), cam = this.cam, v = new THREE.Vector3();
    cam.updateMatrixWorld(true);
    const lum = (u, h, f) => { v.copy(f(u, h)).applyMatrix4(ML).project(cam); if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return -1;
      const x = Math.min(W - 1, Math.max(0, Math.round((v.x * 0.5 + 0.5) * (W - 1)))), y = Math.min(H - 1, Math.max(0, Math.round((v.y * 0.5 + 0.5) * (H - 1)))), k = (y * W + x) * 4;
      if (px[k + 3] < 200) return -1; return (0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255; };
    let novos = 0;
    S.forEach((p, i) => {
      const c = Math.cos(p.a), s = Math.sin(p.a);
      for (let face = 0; face < 4; face++) {
        const fx = face < 2, sg = face % 2 === 0 ? 1 : -1, off = fx ? p.h[0] : p.h[1], ao = fx ? p.h[1] : p.h[0];
        // wall point (u along the face, h height) -> B5; box frame: q.x along e1 = (c, s), q.y along e2 = (-s, c)
        const f = (u, h) => { const qx = fx ? sg * off : u, qy = fx ? u : sg * off; return new THREE.Vector3(p.c[0] + qx * c - qy * s, h, p.c[1] + qx * s + qy * c); };
        const nb = Math.max(1, Math.floor(2 * ao / 3.1)), bay = 2 * ao / nb, nf = Math.min(32, Math.floor((p.y[1] - p.y[0]) / 2.85));
        for (let cx = 1; cx < Math.min(nb - 1, 128); cx++) for (let cy = 1; cy < nf; cy++) {
          const row = (i * 4 + face) * 32 + cy, k0 = (row * 128 + cx) * 4; if (D[k0 + 3] > 0) continue;
          const uS = -ao + cx * bay, hb = p.y[0] + cy * 2.85; if (hb + 2.85 > p.y[1] - 1) continue;
          // search the WHOLE cell (12 x 8 samples): the LiDAR floor line and Google's floors drift by up to a metre, a fixed sampling
          // row missed most openings. Opening = darkest compact spot, < 0.6 x the cell's bright wall, with wall 0.9 m left and right and
          // 1.0 m above and below brighter than 1.5 x it.
          const G = []; let lmax = 0, lmin = 9, gmin = -1, fora = false;
          for (let a = 0; a < 8 && !fora; a++) for (let k = 0; k < 12; k++) { const x = lum(uS + bay * (k + 0.5) / 12, hb + 2.85 * (a + 0.5) / 8, f); if (x < 0) { fora = true; break; } G.push(x); if (x > lmax) lmax = x; if (x < lmin) { lmin = x; gmin = G.length - 1; } }
          if (fora) continue; // not (fully) on screen in this view
          const ord = [...G].sort((a2, b2) => a2 - b2), lpar = ord[Math.floor(ord.length * 0.75)], nesc = G.filter((x) => x < 0.6 * lpar).length;
          const ka = gmin % 12, aa = Math.floor(gmin / 12);
          let sw = 0, su = 0, sh = 0; G.forEach((x, n) => { const k = n % 12, a = Math.floor(n / 12); if (Math.abs(k - ka) <= 2 && Math.abs(a - aa) <= 2) { const w = Math.max(0, 0.6 * lpar - x); sw += w; su += w * (k + 0.5) / 12; sh += w * (a + 0.5) / 8; } });
          const ucr = sw > 0 ? su / sw : (ka + 0.5) / 12, uc = uS + ucr * bay, hc = hb + 2.85 * (sw > 0 ? sh / sw : (aa + 0.5) / 8);
          const lC = lum(uc, hc, f), lE = lum(uc - 0.9, hc, f), lD = lum(uc + 0.9, hc, f), lAc = lum(uc, hc + 1.0, f), lAb = lum(uc, hc - 1.0, f);
          const ok = lpar > 0.04 && lC >= 0 && lC < 0.6 * lpar && nesc <= 30 && Math.min(lE, lD) > 1.5 * lC && Math.min(lAc, lAb) > 1.5 * lC && hc > hb + 0.6 && hc < hb + 2.4;
          let wl = 0, wr = 0, ht = 0, hd = 0; const lim = 0.72 * lpar;
          if (ok) { for (let d = 0.1; d <= 1.2; d += 0.1) { const x = lum(uc - d, hc, f); if (x < 0 || x > lim) break; wl = d; } for (let d = 0.1; d <= 1.2; d += 0.1) { const x = lum(uc + d, hc, f); if (x < 0 || x > lim) break; wr = d; }
            for (let d = 0.1; d <= 1.2; d += 0.1) { const x = lum((uc - wl + uc + wr) / 2, hc + d, f); if (x < 0 || x > lim) break; ht = d; } for (let d = 0.1; d <= 1.2; d += 0.1) { const x = lum((uc - wl + uc + wr) / 2, hc - d, f); if (x < 0 || x > lim) break; hd = d; } }
          const ucm = (uc - wl + uc + wr) / 2, hcm = (hc + ht + hc - hd) / 2, larg = wl + wr + 0.1, alt = ht + hd + 0.1;
          if (ok) { const st = window.__g3dJanMed || (window.__g3dJanMed = []); if (st.length < 2000) st.push([+larg.toFixed(1), +alt.toFixed(1)]); }
          D[k0] = ok ? Math.max(1, Math.round(larg / 3 * 255)) : 0; D[k0 + 1] = Math.round(Math.min(1, Math.max(0, (ucm - uS) / bay)) * 255); D[k0 + 2] = Math.round(Math.min(1, (hcm - hb) / 2.85) * 255); D[k0 + 3] = ok ? Math.max(2, Math.round(alt / 3 * 255)) : 1; novos++;
        }
      }
    });
    this._janDet.n += novos; this._janDet.tex.needsUpdate = true;
    R.janDet.value = this._janDet.tex; R.janDetOk.value = 1;
    if (typeof window !== 'undefined') window.__g3dJanDet = { celulas: this._janDet.n, achadas: [...D].filter((x, k) => k % 4 === 0 && x > 0).length };
    this.acordar();
  }
  vidroNaTela(camera) { return this.dirsV ? this.janelaNaTela(camera, this.dirsV) : { x0: -1, y0: -1, x1: 1, y1: 1 }; }
  // NDC box of the open window as seen by `camera` (scene frame), with a small margin; null = no window on screen
  janelaNaTela(camera, dirs) {
    const d = dirs || this.dirs; if (!d) return { x0: -1, y0: -1, x1: 1, y1: 1 };
    const m = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
    let x0 = 2, y0 = 2, x1 = -2, y1 = -2, n = 0;
    for (let i = 0; i < d.length; i += 3) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      const vx = m[0] * x + m[4] * y + m[8] * z, vy = m[1] * x + m[5] * y + m[9] * z, vz = m[2] * x + m[6] * y + m[10] * z;
      if (vz > -0.05) continue; // behind the camera
      const w = -vz, sx = (p[0] * vx + p[8] * vz) / w, sy = (p[5] * vy + p[9] * vz) / w;
      if (sx < -1.2 || sx > 1.2 || sy < -1.2 || sy > 1.2) continue;
      n++; if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    if (!n) return null;
    const mg = 0.06, cl = (v) => Math.max(-1, Math.min(1, v));
    return { x0: cl(x0 - mg), y0: cl(y0 - mg), x1: cl(x1 + mg), y1: cl(y1 + mg) };
  }
  // 22/10 ITEM 8: the outside view's ghost rules (building ghosts + tower screen box) never apply to the 360 window
  _semFantasma() { const R = this.s.recorte; R.mapaR.value.w = 0; R.ret.value.set(1, 1, 0, 0); }
  // point the camera and draw the tiles into the target. dir = scene-frame direction; janela = NDC box to load tiles for
  // dirV (13/10, R3b): also draw the mirrored camera (balcony glass) into rtV in the same frame; its selection camera joins the
  // tiles' camera set so one update loads both views (no thrash between two updates per frame)
  desenha(dir, fov, aspect, janela, soCarregar = false, dirV = null) {
    if (!this.rt) return;
    const d = this.dirParaL(dir.x, dir.y, dir.z);
    this.cam.position.set(0, 0, 0); this.cam.up.set(0, 1, 0);
    this.cam.fov = fov; this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.cam.lookAt(d); this.cam.updateMatrixWorld(true);
    if (this.s.dono !== this) this.s.pintar([1, 1, 1]); // the 360 applies its own gain in the overlay shader
    const j = janela || { x0: -1, y0: -1, x1: 1, y1: 1 }, cs = this.camSel, W = this.resW, H = this.resH;
    const px = Math.floor(((j.x0 + 1) / 2) * W), py = Math.floor(((1 - j.y1) / 2) * H);
    const pw = Math.max(2, Math.ceil(((j.x1 - j.x0) / 2) * W)), ph = Math.max(2, Math.ceil(((j.y1 - j.y0) / 2) * H));
    cs.position.copy(this.cam.position); cs.quaternion.copy(this.cam.quaternion); cs.up.copy(this.cam.up);
    cs.fov = fov; cs.aspect = aspect; cs.setViewOffset(W, H, px, py, pw, ph); cs.updateProjectionMatrix(); cs.updateMatrixWorld(true);
    this.janela = { px, py, pw, ph };
    this.s.tomar(this, this.s.escena, this.matriz, cs, this._fase1 !== false && FASE1_K > 1 ? ERRO_360 * FASE1_K : ERRO_360); // ASK 8: coarse pass first
    this.s.tiles.setResolution(cs, pw, ph); // same pixel density as the full screen (offset narrows the projection)
    const T = this.s.tiles;
    if (dirV && !soCarregar) {
      if (!this.camV) { this.camV = new THREE.PerspectiveCamera(60, 1, 3, 20000); this.camSelV = new THREE.PerspectiveCamera(60, 1, 3, RAIO); }
      if (!this.rtV) { this.rtV = this.rt.clone(); this.rtV.texture.colorSpace = this.rt.texture.colorSpace; }
      const cv = this.camV, sv = this.camSelV;
      cv.position.set(0, 0, 0); cv.up.set(0, 1, 0); cv.fov = fov; cv.aspect = aspect; cv.updateProjectionMatrix();
      cv.lookAt(this.dirParaL(dirV.x, dirV.y, dirV.z)); cv.updateMatrixWorld(true);
      sv.position.copy(cv.position); sv.quaternion.copy(cv.quaternion); sv.up.copy(cv.up); sv.fov = fov; sv.aspect = aspect; sv.updateProjectionMatrix(); sv.updateMatrixWorld(true);
      if (!T.cameras.includes(sv)) T.setCamera(sv);
      T.setResolution(sv, W, H);
    } else if (this.camSelV && T.cameras.includes(this.camSelV)) T.deleteCamera(this.camSelV);
    this.planosPreparar(); const assa = !soCarregar && this._planosPasso(false); this._planosAplica(); // C8b near neighbours
    this.s.escena.updateMatrixWorld(true);
    this.s.tiles.update();
    this._faseAtualiza();
    if (soCarregar) { const st = this.s.tiles.stats; if (st.queued + st.downloading + st.parsing > 0 || this.s.tiles.loadProgress < 1) this.acordar(); return; }
    const r = this.r, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    const rtAnt = r.getRenderTarget();
    this._semFantasma();
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.s.escena, this.cam);
    if (dirV && this.rtV) { r.setRenderTarget(this.rtV); r.clear(); r.render(this.s.escena, this.camV); }
    r.setRenderTarget(rtAnt); r.setClearColor(cc, ca);
    if (assa) this._planosDepois();
    const st = this.s.tiles.stats; STATUS.tiles = st ? (st.visible || 0) : 0;
    if (st && (st.queued + st.downloading + st.parsing > 0 || this.s.tiles.loadProgress < 1)) { this.acordar(); this._detQ = 0; }
    else if (this._janSel && this._janSel.length) { this._detQ = (this._detQ || 0) + 1; if (this._detQ === 20 && /[?&]janret=1/.test(location.search)) this._janDetecta(); /* rectangle detection (rejected 27/10) only with ?janret=1 */ }
    this.atualizaCredito();
  }
  // ---- photo mode (08/10): which of the 6 axis directions (90 deg faces) see the open window, in the local frame
  facesDaJanela() {
    const out = [], d = this.dirs, v = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const cam = this.foto.cams[i]; let n = 0;
      if (d) for (let k = 0; k < d.length; k += 3) {
        v.copy(this.dirParaL(d[k], d[k + 1], d[k + 2])).multiplyScalar(100).project(cam);
        if (v.z < 1 && v.z > -1 && Math.abs(v.x) <= 1.02 && Math.abs(v.y) <= 1.02) n++;
      } else n = 1;
      if (n) out.push([i, n]);
    }
    return out.sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]); // the overlay samples up to 4 faces
  }
  passoFoto() {
    if (!this.foto) {
      const eixos = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], ups = [[0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, 1, 0]];
      const cams = eixos.map((e, i) => { const c = new THREE.PerspectiveCamera(90, 1, 3, RAIO); c.up.set(...ups[i]); c.lookAt(...e); c.updateMatrixWorld(true); return c; });
      this.foto = { cams, alvos: [], chave: null, faces: [], i: 0, reg: 0, t0: 0, feito: false, prog: 0, mats: [] };
    }
    const F = this.foto, ref = this.ref, agora = performance.now();
    // one picture per UNIT (tour360 sets unidadeChave); points of the unit reuse it and only add faces they need
    const chave = this.unidadeChave || [ref.lat, ref.lon, ref.h, ref.rumo].join('|');
    const alvo = (lado) => { const c = new THREE.WebGLRenderTarget(lado, lado, { type: THREE.UnsignedByteType, generateMipmaps: false, depthBuffer: true });
      c.texture.colorSpace = THREE.SRGBColorSpace; c.texture.minFilter = c.texture.magFilter = THREE.LinearFilter; return c; };
    if (chave === F.chave && this.dirs !== F.dirsVistos) { // another point of the same unit: shoot only the missing window faces
      F.dirsVistos = this.dirs;
      const falta = this.facesDaJanela().filter((f) => !F.faces.includes(f)).slice(0, 4 - F.faces.length);
      if (falta.length) {
        if (F.feito) { F.k = F.faces.length; F.reg = 0; F.fila = null; F.t0 = agora; F.feito = false; this.restauraCache(); const c = this.s.tiles.lruCache; this._guardaCache(); c.minBytesSize = 0; c.unloadPercent = 1; c.maxBytesSize = Math.max(c.maxBytesSize, FOTO_MB); try { localStorage.setItem(chaveLocal('tabela3d-foto-ativa'), String(Date.now())); } catch (e) { /* ignore */ } }
        if (RAPIDO && F.nRapido >= F.faces.length) { F.nRapido = F.faces.length; F.tR0 = agora; F.quietosR = 0; }
        for (const f of falta) { F.faces.push(f); F.alvos.push({ A: alvo(FOTO_LADO), W: alvo(FOTO_LADO_W) }); F.mats.push(new THREE.Matrix4().multiplyMatrices(F.cams[f].projectionMatrix, F.cams[f].matrixWorldInverse)); }
      }
    }
    if (chave !== F.chave) { // new unit: a new picture (our render's city stays in the window meanwhile)
      F.chave = chave; F.dirsVistos = this.dirs; F.matriz = this.matriz.clone(); F.faces = this.facesDaJanela(); F.k = 0; F.nRapido = RAPIDO ? 0 : 99; F.i = 0; F.tR0 = agora; F.quietosR = 0; F.reg = 0; F.t0 = agora; F.feito = false; F.log = []; F.fila = null; F.extras = false; F.fundo = false;
      // two 2D targets per window face: A = city with neutral light, W = only the lit night windows. The tile shader is linear
      // in (uLuz, uNoiteG): any hour = A x base(hour) + W x lights(hour) in the overlay, no re-shoot when the time changes
      for (const a of F.alvos) { a.A.dispose(); a.W.dispose(); }
      F.alvos = F.faces.map(() => ({ A: alvo(FOTO_LADO), W: alvo(FOTO_LADO_W) }));
      F.mats = F.faces.map((f) => new THREE.Matrix4().multiplyMatrices(F.cams[f].projectionMatrix, F.cams[f].matrixWorldInverse));
      F.limpos = new Set();
      try { localStorage.setItem(chaveLocal('tabela3d-foto-ativa'), String(Date.now())); } catch (e) { /* private mode */ } // crash guard (capacidade.js)
      if (!window.__g3dSaida) { window.__g3dSaida = true; addEventListener('pagehide', () => { try { localStorage.removeItem(chaveLocal('tabela3d-foto-ativa')); } catch (e) { /* ignore */ } }); } // closing the page is not a crash
      this.pronto = false; this.restauraCache();
      { const c = this.s.tiles.lruCache; this._guardaCache(); c.minBytesSize = 0; c.unloadPercent = 1; c.maxBytesSize = Math.max(c.maxBytesSize, FOTO_MB); } // shooting: bigger budget, shot regions dropped at once
    }
    if (F.feito || !F.faces.length) { if (!F.faces.length && !F.feito) { F.feito = true; } return; }
    this.planosPreparar();
    if (this.planos && this.planos.estado !== 'pronto' && this.planos.estado !== 'off') { // C8b: near neighbours' boxes first (they go into the photo)
      if (this.planos.estado === 'assando') {
        const fc = this.planos.faces[this.planos.i]; this.s.tomar(this, this.s.escena, F.matriz || this.matriz, fc.cam || F.cams[0], ERRO_FOTO);
        if (this._planosPasso(true)) { this.s.escena.updateMatrixWorld(true); this.s.tiles.update(); this._planosDepois(); }
      }
      this.acordar(); return;
    }
    // RODADA 26/10 item 1 (Victor, unit 106 at night on his phone: 'a foto da sacada ta cortada' - Google's city as a rectangle with
    // straight edges, plain dark-blue haze around it, a diagonal cut at the bottom from 'Porta da varanda'): the window was shown
    // as soon as the FIRST 90 deg face was shot (21/10) and the other faces (sides, down) arrived one by one, ~1 min on a mid
    // phone. Now every face of the window is first shot ONCE at low detail (one region per face, ERRO_RAPIDO), the window shows
    // only when all of them are in (whole opening covered), and the fine regions then replace it in place.
    if (F.nRapido < F.faces.length) {
      const L0 = FOTO_LADO, t = this.s.tiles, fr = F.nRapido, base = F.cams[F.faces[fr]];
      if (!F.selR) F.selR = new THREE.PerspectiveCamera(90, 1, 3, RAIO);
      const cam = F.selR; cam.quaternion.copy(base.quaternion); cam.position.set(0, 0, 0); cam.up.copy(base.up);
      cam.clearViewOffset(); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      this.s.tomar(this, this.s.escena, F.matriz || this.matriz, cam, ERRO_RAPIDO);
      this._planosAplica();
      if (t.cameras.length !== 1 || t.cameras[0] !== cam) { for (const c of [...t.cameras]) t.deleteCamera(c); t.setCamera(cam); }
      t.setResolution(cam, L0, L0);
      this.s.escena.updateMatrixWorld(true);
      t.update();
      const st = t.stats, pend = st.queued + st.downloading + st.parsing, tempo = agora - F.tR0;
      F.semFilaR = pend === 0 ? (F.semFilaR || 0) + 1 : 0;
      F.quietosR = pend === 0 && (t.loadProgress === undefined || t.loadProgress >= 1 || F.semFilaR >= 30) ? (F.quietosR || 0) + 1 : 0;
      F.prog = Math.min(0.99, (fr + 0.5) / F.faces.length) * 0.5;
      if ((F.quietosR >= 3 && tempo > 150) || tempo > 15000) {
        const r = this.r, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), ant = r.getRenderTarget(), al = F.alvos[fr];
        const R = this.s.recorte, luz0 = R.luz.value.clone(), noite0 = R.noite.value, grade0 = R.grade.value.clone();
        r.setClearColor(0x000000, 0); this._semFantasma();
        for (const [rt, lado, liga] of [[al.A, FOTO_LADO, true], [al.W, FOTO_LADO_W, false]]) {
          if (liga) { R.luz.value.set(1, 1, 1); R.noite.value = 0; R.grade.value.set(1, 1, 1, 0.18); } else { R.luz.value.set(0, 0, 0); R.noite.value = 1; }
          F.limpos.add(rt); rt.scissorTest = false; rt.viewport.set(0, 0, lado, lado); r.setRenderTarget(rt); r.clear(); r.render(this.s.escena, cam);
        }
        R.luz.value.copy(luz0); R.noite.value = noite0; R.grade.value.copy(grade0); r.setRenderTarget(ant); r.setClearColor(cc, ca);
        F.log.push({ f: F.faces[fr], rapido: true, ms: Math.round(tempo), vis: st.visible });
        F.nRapido++; F.tR0 = agora; F.quietosR = 0; F.semFilaR = 0; F.i = Math.max(F.nRapido, F.k); F.t0 = agora;
        if (F.nRapido >= F.faces.length && !this.pronto) { this.pronto = true; this.tPronto = agora; }
        this.atualizaCredito();
      }
      this.acordar(); return;
    }
    const N = FOTO_N, L = FOTO_LADO;
    if (!F.fila) { F.fila = []; for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) F.fila.push([(k * L) / N, (j * L) / N, L / N]); F.feitosF = 0; }
    const [x, y, w] = F.fila[0];
    const t = this.s.tiles, base = F.cams[F.faces[F.k]];
    if (!F.sel) F.sel = new THREE.PerspectiveCamera(90, 1, 3, RAIO);
    const cam = F.sel; cam.quaternion.copy(base.quaternion); cam.position.set(0, 0, 0); cam.up.copy(base.up);
    cam.setViewOffset(L, L, x, y, w, w); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    this.s.tomar(this, this.s.escena, F.matriz || this.matriz, cam, ERRO_FOTO); // the unit's first point
    this._planosAplica();
    if (t.cameras.length !== 1 || t.cameras[0] !== cam) { for (const c of [...t.cameras]) t.deleteCamera(c); t.setCamera(cam); }
    t.setResolution(cam, w, w);
    this.s.escena.updateMatrixWorld(true);
    t.update();
    const st = t.stats, pend = st.queued + st.downloading + st.parsing, tempo = agora - F.t0;
    F.prog = (F.k + Math.min(0.99, F.feitosF / (L * L))) / F.faces.length; // share of this face's area already shot
    // only when this region is COMPLETE (queue empty for 3 frames); a full budget or a stuck queue gives up much later
    // 21/10 SACADA-GOOGLE-JA (phone, local test): a region could sit with an EMPTY queue and loadProgress < 1 (a tile that never
    // finishes) and was only shot after the 60 s timeout - or at once when the visitor moved the view (new camera = new queue):
    // 'aparece o Google quando mexo'. An empty queue for 30 frames now counts as complete too.
    F.semFila = pend === 0 ? (F.semFila || 0) + 1 : 0;
    F.quietos = pend === 0 && (t.loadProgress === undefined || t.loadProgress >= 1 || F.semFila >= 30) ? (F.quietos || 0) + 1 : 0;
    const cheio = t.lruCache.isFull();
    if (cheio && w > FOTO_MIN && tempo > 300) { // this region needs more than the budget: split it in 4 and shoot the pieces (off by default: too slow on mid phones, 08/10)
      F.fila.shift(); const h = w / 2; F.fila.unshift([x, y, h], [x + h, y, h], [x, y + h, h], [x + h, y + h, h]);
      const c = t.lruCache, mx = c.maxBytesSize; for (const k of [...t.cameras]) t.deleteCamera(k); c.maxBytesSize = 1; this.s.esvaziar(); c.maxBytesSize = mx;
      F.t0 = agora; F.quietos = 0; this.acordar(); return;
    }
    if ((F.quietos >= 3 && tempo > 200) || (cheio && pend === 0 && tempo > 12000) || tempo > 60000) {
      F.quietos = 0; F.log.push({ f: F.faces[F.k], r: F.reg, ms: Math.round(tempo), cheio: t.lruCache.isFull(), mb: Math.round(t.lruCache.cachedBytes / 1048576), vis: st.visible });
      const r = this.r, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha(), ant = r.getRenderTarget(), al = F.alvos[F.k];
      const R = this.s.recorte, luz0 = R.luz.value.clone(), noite0 = R.noite.value, grade0 = R.grade.value.clone();
      r.setClearColor(0x000000, 0);
      const pinta = (rt, lado, ms) => {
        const k = lado / L, vx = Math.round(x * k), vy = Math.round((L - y - w) * k), vw = Math.round(w * k);
        if (!F.limpos.has(rt)) { F.limpos.add(rt); rt.scissorTest = false; rt.viewport.set(0, 0, lado, lado); r.setRenderTarget(rt); r.clear(); }
        if (ms) { r.setRenderTarget(this._alvoMS(vw)); r.clear(); r.render(this.s.escena, cam); } // C8: the region drawn with 4x MSAA, then copied into its place
        rt.viewport.set(vx, vy, vw, vw); rt.scissor.set(vx, vy, vw, vw); rt.scissorTest = true;
        r.setRenderTarget(rt); r.clear(); if (ms) r.render(this._copiaMS.cena, this._copiaMS.cam); else r.render(this.s.escena, cam);
        rt.scissorTest = false; rt.viewport.set(0, 0, lado, lado);
      };
      this._semFantasma();
      R.luz.value.set(1, 1, 1); R.noite.value = 0; R.grade.value.set(1, 1, 1, 0.18); pinta(al.A, FOTO_LADO, C8.msaa > 0); // C7: A stays the raw photo city; the overlay grades it by the hour
      R.luz.value.set(0, 0, 0); R.noite.value = 1; pinta(al.W, FOTO_LADO_W);
      R.luz.value.copy(luz0); R.noite.value = noite0; R.grade.value.copy(grade0);
      r.setRenderTarget(ant); r.setClearColor(cc, ca);
      this.atualizaCredito();
      // flush: every tile of the region just shot leaves memory now (the LRU kept them: the budget filled region after region)
      { const c = t.lruCache, mx = c.maxBytesSize; if (c.cachedBytes > mx * 0.7) { for (const k of [...t.cameras]) t.deleteCamera(k); c.maxBytesSize = 1; this.s.esvaziar(); c.maxBytesSize = mx; } } // flush only when nearly full (08/10: on 4G the full flush re-downloaded shared tiles every region)
      F.fila.shift(); F.feitosF += w * w; F.reg++; F.t0 = agora;
      if (!F.fila.length) { F.fila = null; F.reg = 0; F.k++; } F.i = Math.max(F.nRapido >= 99 ? 0 : F.nRapido, F.k);
      // 21/10 SACADA-GOOGLE-JA: the window shows Google as soon as the FIRST face (the window's own direction) is shot; faces not
      // shot yet keep the haze of the hour (render-mix VEU), never our render's city - before, the whole cube had to finish (~1 min)
      if (F.k >= 1 && !this.pronto && !RAPIDO) { this.pronto = true; this.tPronto = agora; }
      if (F.k >= F.faces.length && !F.extras && F.faces.length < 4) { // the unit's other points: facade neighbours + down, in the background
        F.extras = true; const p0 = F.faces[0], viz = p0 < 2 ? [4, 5] : p0 > 3 ? [0, 1] : [];
        const add = [...viz, 3].filter((f) => !F.faces.includes(f)).slice(0, 4 - F.faces.length);
        const alvo = (lado) => { const c = new THREE.WebGLRenderTarget(lado, lado, { type: THREE.UnsignedByteType, generateMipmaps: false, depthBuffer: true }); c.texture.colorSpace = THREE.SRGBColorSpace; c.texture.minFilter = c.texture.magFilter = THREE.LinearFilter; return c; };
        for (const f of add) { F.faces.push(f); F.alvos.push({ A: alvo(FOTO_LADO), W: alvo(FOTO_LADO_W) }); F.mats.push(new THREE.Matrix4().multiplyMatrices(F.cams[f].projectionMatrix, F.cams[f].matrixWorldInverse)); }
        if (add.length) { F.fundo = true; if (!this.pronto) { this.pronto = true; this.tPronto = agora; } }
      }
      if (F.k >= F.faces.length) { F.feito = true; this._soltaMS(); cam.clearViewOffset(); if (!this.pronto) { this.pronto = true; this.tPronto = agora; } STATUS.tiles = st.visible || 0; if (capacidade().nivel === 'topo') this.restauraCache(); else this.soltaCache(); try { localStorage.removeItem(chaveLocal('tabela3d-foto-ativa')); } catch (e) { /* ignore */ } }
    }
    this.acordar();
  }
  // C8 21/10: ONE 4x MSAA target for the window photo regions (shared by the faces, freed when the photo is done): 768 px on mid
  // phones = ~19 MB while shooting. Copied 1:1 into the face (premultiplied edges; the overlay divides them back, DESPRE).
  _alvoMS(lado) {
    const ns = Math.min(C8.msaa, this.r.capabilities.maxSamples || 0);
    if (!this._ms || this._ms.width !== lado || this._ms.samples !== ns) {
      if (this._ms) this._ms.dispose();
      this._ms = new THREE.WebGLRenderTarget(lado, lado, { type: THREE.UnsignedByteType, samples: ns, generateMipmaps: false, depthBuffer: true });
      this._ms.texture.colorSpace = THREE.SRGBColorSpace; this._ms.texture.minFilter = this._ms.texture.magFilter = THREE.NearestFilter;
    }
    if (!this._copiaMS) {
      const m = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv);\n#include <colorspace_fragment>\n}' });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); q.frustumCulled = false;
      const cena = new THREE.Scene(); cena.add(q);
      this._copiaMS = { cena, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), m };
    }
    this._copiaMS.m.uniforms.t.value = this._ms.texture;
    return this._ms;
  }
  _soltaMS() { if (this._ms) { this._ms.dispose(); this._ms = null; } }
  // ---- C8b 21/10 (Victor: 'a vista da janela ta muito ruim para os predios mais proximos'): the near neighbours (< C8.planosR m
  // from the eye, ?g3dplanosr=) are drawn as CLEAN BOXES in the window/balcony view only: the rectangle of the LiDAR footprint
  // (GeoSampa, assets/entorno/vizinhos-planos.json; not derived from Google's mesh) extruded to its LiDAR height, each face facing
  // the eye textured with GOOGLE'S OWN facade rendered flat onto it (orthographic camera along the face normal, a slab 5 m in front
  // to 6 m behind the face): same colours and real windows, without the melted relief. Google's mesh inside those boxes (+1.5 m) is
  // not drawn (uViz); the rest of Google's city is untouched; the outside view is untouched. Grey zone of the terms (texture of
  // the tiles shown on our own geometry, in memory only, never stored): see docs/rodada-2110/C8-GOOGLE-SEM-DRONE.md. OFF by default
  // (21/10 first test: straight edges, but holes filled flat, roofs paled, texture still smeared); ?g3dplanos=1 = on.
  planosPreparar() {
    const R = this.s.recorte;
    if (!C8.planos || !R.ecefParaB5 || !this.matriz) { if (this.planos) this.planosLimpa(); return; }
    const chave = (this.unidadeChave || [this.ref.lat, this.ref.lon, this.ref.h].join('|')) + '|' + C8.planosR;
    if (this.planos && this.planos.chave === chave) return;
    this.planosLimpa();
    const P = this.planos = { chave, estado: 'dados', faces: [], caixas: [], i: 0 };
    if (!PLANOS_DADOS) PLANOS_DADOS = fetch('assets/entorno/vizinhos-planos.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    PLANOS_DADOS.then((D) => { if (this.planos !== P) return; if (!D || !D.partes) { P.estado = 'off'; return; } this._planosMonta(D); this.acordar(); });
  }
  _planosMonta(D) {
    const P = this.planos, R = this.s.recorte;
    const paraB5 = new THREE.Matrix4().copy(R.ecefParaB5).multiply(this.matriz.clone().invert());
    const olho = new THREE.Vector3(0, 0, 0).applyMatrix4(paraB5); P.olho = olho.toArray().map((x) => +x.toFixed(2));
    const dist = (p) => { const c = Math.cos(p.a), s = Math.sin(p.a), dx = olho.x - p.c[0], dz = olho.z - p.c[1];
      const qx = dx * c + dz * s, qz = -dx * s + dz * c; return Math.hypot(Math.max(Math.abs(qx) - p.h[0], 0), Math.max(Math.abs(qz) - p.h[1], 0)); };
    const sel = D.partes.filter((p) => p.fill >= 0.7 && p.y[1] - p.y[0] >= 6).map((p) => ({ p, d: dist(p) })).filter((x) => x.d < C8.planosR && x.d > 2).sort((a, b) => a.d - b.d).slice(0, 8);
    const Y = new THREE.Vector3(0, 1, 0);
    for (const { p, d } of sel) {
      const c = Math.cos(p.a), s = Math.sin(p.a), U = new THREE.Vector3(c, 0, s), W = new THREE.Vector3(-s, 0, c);
      const C0 = new THREE.Vector3(p.c[0], (p.y[0] + p.y[1]) / 2, p.c[1]), alt = p.y[1] - p.y[0];
      P.caixas.push({ id: p.id, n: p.n, d: +d.toFixed(1), c: p.c, h: p.h, a: p.a, y: p.y });
      for (const [N, hn, ho] of [[U, p.h[0], p.h[1]], [U.clone().negate(), p.h[0], p.h[1]], [W, p.h[1], p.h[0]], [W.clone().negate(), p.h[1], p.h[0]]]) {
        const centro = C0.clone().addScaledVector(N, hn);
        if (new THREE.Vector3().subVectors(olho, centro).dot(N) < 0.5) continue; // face turned away from the eye
        const dirF = N.clone().negate(), dir = new THREE.Vector3().crossVectors(dirF, Y).normalize();
        P.faces.push({ id: p.id, centro, n: N.clone(), up: Y.clone(), dir, larg: 2 * ho, alt });
      }
      if (olho.y > p.y[1] + 1) { // roof seen from above
        const centro = new THREE.Vector3(p.c[0], p.y[1], p.c[1]), dir = new THREE.Vector3().crossVectors(new THREE.Vector3(0, -1, 0), W).normalize();
        P.faces.push({ id: p.id, centro, n: Y.clone(), up: W.clone(), dir, larg: 2 * p.h[0], alt: 2 * p.h[1], teto: true });
      }
    }
    P.estado = P.faces.length ? 'assando' : 'off'; P.t0 = performance.now();
    if (typeof window !== 'undefined') window.__g3dPlanos = { olho: P.olho, caixas: P.caixas, faces: P.faces.length };
  }
  // B5 -> the frame the tiles are drawn in now (group matrix of this view)
  _planosParaL() { return new THREE.Matrix4().copy(this.s.tiles.group.matrix).multiply(new THREE.Matrix4().copy(this.s.recorte.ecefParaB5).invert()); }
  _planosPasso(exclusivo) {
    const P = this.planos; if (!P || P.estado !== 'assando') return false;
    const t = this.s.tiles, f = P.faces[P.i], ML = this._planosParaL(), D = 10;
    if (!f.cam) {
      f.w = Math.max(32, Math.min(1024, Math.round(f.larg * C8.planosPx))); f.h = Math.max(32, Math.min(1024, Math.round(f.alt * C8.planosPx)));
      f.cam = new THREE.OrthographicCamera(-f.larg / 2, f.larg / 2, f.alt / 2, -f.alt / 2, D - 5, D + 6);
      f.rt = new THREE.WebGLRenderTarget(f.w, f.h, { type: THREE.UnsignedByteType, generateMipmaps: true, depthBuffer: true, samples: Math.min(4, this.r.capabilities.maxSamples || 0) });
      f.rt.texture.colorSpace = THREE.SRGBColorSpace; f.rt.texture.minFilter = THREE.LinearMipmapLinearFilter; f.rt.texture.magFilter = THREE.LinearFilter; f.rt.texture.anisotropy = 8;
      f.t0 = performance.now(); f.q = 0;
    }
    const pos = f.centro.clone().addScaledVector(f.n, D).applyMatrix4(ML), alvo = f.centro.clone().applyMatrix4(ML);
    f.cam.position.copy(pos); f.cam.up.copy(f.up).transformDirection(ML); f.cam.lookAt(alvo); f.cam.updateMatrixWorld(true);
    if (exclusivo) { if (t.cameras.length !== 1 || t.cameras[0] !== f.cam) { for (const c of [...t.cameras]) t.deleteCamera(c); t.setCamera(f.cam); } }
    else if (!t.cameras.includes(f.cam)) t.setCamera(f.cam);
    t.setResolution(f.cam, f.w, f.h);
    return true;
  }
  _planosDepois() {
    const P = this.planos; if (!P || P.estado !== 'assando') return;
    const t = this.s.tiles, f = P.faces[P.i], st = t.stats, pend = st.queued + st.downloading + st.parsing, agora = performance.now();
    f.q = pend === 0 ? f.q + 1 : 0;
    if (!((f.q >= 4 && agora - f.t0 > 300) || agora - f.t0 > 20000)) { this.acordar(); return; }
    const r = this.r, R = this.s.recorte, ant = r.getRenderTarget(), cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    const luz0 = R.luz.value.clone(), noite0 = R.noite.value, grade0 = R.grade.value.clone(), viz0 = R.vizN.value;
    this._semFantasma();
    R.luz.value.set(1, 1, 1); R.noite.value = 0; R.grade.value.set(1, 1, 1, 0.18); R.vizN.value = 0; // Google's facade as it is (raw, neutral light)
    if (this._planosG) this._planosG.visible = false;
    this.s.escena.updateMatrixWorld(true);
    r.setRenderTarget(f.rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.s.escena, f.cam);
    r.setRenderTarget(ant); r.setClearColor(cc, ca);
    R.luz.value.copy(luz0); R.noite.value = noite0; R.grade.value.copy(grade0); R.vizN.value = viz0;
    if (this._planosG) this._planosG.visible = true;
    if (t.cameras.includes(f.cam)) t.deleteCamera(f.cam);
    f.ms = Math.round(agora - f.t0); P.i++;
    if (P.i >= P.faces.length) this._planosFim();
    this.acordar();
  }
  _planosFim() {
    const P = this.planos, g = this._planosG = new THREE.Group(); g.matrixAutoUpdate = false; g.name = 'g3d-planos';
    for (const f of P.faces) {
      const a = f.dir.clone().multiplyScalar(f.larg / 2), b = f.up.clone().multiplyScalar(f.alt / 2), c = f.centro;
      const v = [c.clone().sub(a).sub(b), c.clone().add(a).sub(b), c.clone().add(a).add(b), c.clone().sub(a).add(b)];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v.flatMap((p) => p.toArray()), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const m = new THREE.MeshBasicMaterial({ map: f.rt.texture, side: THREE.DoubleSide, color: C8.planosDbg ? 0xff7070 : 0xffffff });
      m.onBeforeCompile = (sh) => { this.s.shaderRecorte(sh); sh.fragmentShader = '#define G3D_PLANO\n' + sh.fragmentShader.replace(NIT_GLSL, PLANO_MAP_GLSL); };
      m.customProgramCacheKey = () => 'g3d-plano';
      const me = new THREE.Mesh(geo, m); me.frustumCulled = false; g.add(me);
    }
    this.s.escena.add(g); P.estado = 'pronto'; P.ms = Math.round(performance.now() - P.t0);
    if (typeof window !== 'undefined' && window.__g3dPlanos) { window.__g3dPlanos.ms = P.ms; window.__g3dPlanos.pronto = true; }
  }
  // every frame of this view: boxes in place (group matrix) + Google's mesh inside them not drawn
  _planosAplica() {
    const P = this.planos, R = this.s.recorte;
    if (!P || P.estado !== 'pronto' || !this._planosG) { R.vizN.value = 0; return; }
    this._planosG.matrix.copy(this._planosParaL()); this._planosG.matrixWorldNeedsUpdate = true;
    P.caixas.forEach((k, i) => { R.viz.value[2 * i].set(k.c[0], k.c[1], k.h[0] + 1.5, k.h[1] + 1.5); R.viz.value[2 * i + 1].set(Math.cos(k.a), Math.sin(k.a), k.y[0] + 0.5, k.y[1] + 0.3); });
    R.vizN.value = P.caixas.length;
  }
  planosLimpa() {
    const P = this.planos; this.planos = null; this.s.recorte.vizN.value = 0;
    if (this._planosG) { this.s.escena.remove(this._planosG); this._planosG.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); this._planosG = null; }
    if (P) for (const f of P.faces) { if (f.rt) f.rt.dispose(); if (f.cam && this.s.tiles.cameras.includes(f.cam)) this.s.tiles.deleteCamera(f.cam); }
  }
  // test captures (C8): shoot the window photo again with the current switches (same point, same hour)
  refazerFoto() { if (this.foto) { this.foto.chave = null; this.foto.feito = false; } this.acordar(); }
  // mid phones: once the picture is taken the 3D tiles leave the GPU (they were most of its memory; Victor 08/10: "se a gente
  // diminuir o consumo de memoria do google 3d da pra aumentar a resolucao do resto"). A new point loads them again (HTTP cache).
  _guardaCache() { const c = this.s.tiles.lruCache; if (!this._cache0) this._cache0 = { min: c.minBytesSize, max: c.maxBytesSize, pct: c.unloadPercent }; }
  soltaCache() {
    if (capacidade().nivel === 'topo') return;
    const t = this.s.tiles, c = t.lruCache;
    this._guardaCache();
    for (const k of [...t.cameras]) t.deleteCamera(k);
    c.minBytesSize = 0; c.maxBytesSize = 1; c.unloadPercent = 1;
    this.s.esvaziar();
    this._solto = true;
  }
  restauraCache() {
    if (!this._cache0) return;
    const c = this.s.tiles.lruCache; c.minBytesSize = this._cache0.min; c.maxBytesSize = this._cache0.max; c.unloadPercent = this._cache0.pct;
    this._solto = false;
  }
  progressoFoto(ver) {
    const el = this.carga, F = this.foto; if (!el || !F) return;
    // ASK 8: the bar only goes up (F.prog restarts at 0 when the fine regions start after the coarse pass) and shows 100 % before it hides
    if (F.chave !== this._pFchave) { this._pFchave = F.chave; this._pF = 0; this._pFfim = false; }
    this._pF = Math.max(this._pF || 0, F.feito ? 1 : F.prog);
    if (F.feito && !F.fundo && !this._pFfim && !el.hidden) { this._pFfim = true; el.querySelector('b').style.width = '100%'; setTimeout(() => { el.hidden = true; }, 900); return; }
    if (this._pFfim) return;
    const mostra = ver && !F.feito && !F.fundo; // background faces (other points) load without the bar
    if (el.hidden === mostra) el.hidden = !mostra;
    if (mostra) el.querySelector('b').style.width = Math.round(4 + 96 * this._pF) + '%';
  }
  // Discreet progress (Victor 07/10): while the window is on screen and tiles are still arriving, a thin bar fills with the
  // share of this batch already loaded; it hides ~1 s after the queue empties. Coarse tiles are already drawn meanwhile.
  // 0..1 opacity of the Google overlay (fade 0.8 s after it is ready)
  opacidade() { return this.pronto ? Math.min(1, (performance.now() - this.tPronto) / 800) : 0; }
  // ASK 8: a new point (tour360 aposPintar) starts again at the coarse stage, with a new bar
  recomeca() {
    this.pronto = false; this._lote = null; this._quieto = 0;
    this._fase1 = true; this._t1 = null; this._q1 = 0; this._fim = false;
    if (this._some) { clearTimeout(this._some); this._some = 0; }
  }
  // ASK 8: stage switch, every frame the window view is updated (also while the visitor looks at the room and the window view only
  // loads). Stage 1 is done when the window has no pending tile for 15 frames (between a tile and its children the queue is empty for a
  // frame or two) with tiles on screen: the whole opening is covered at the coarse level -> Google fades in, the fine stage starts.
  // Way out if the queue never settles: 8 s with >= 30 tiles on screen, or a full cache.
  _faseAtualiza() {
    if (FASE1_K <= 1) return;
    const t = this.s.tiles, st = t.stats, pend = st.queued + st.downloading + st.parsing, agora = performance.now();
    if (this._t1 == null) this._t1 = agora;
    this._q1 = pend === 0 ? (this._q1 || 0) + 1 : 0;
    if (this._fase1 === false) return;
    const quieto = this._q1 >= 15 && (t.loadProgress === undefined || t.loadProgress >= 1 || this._q1 >= 30);
    if ((st.visible > 0 && quieto) || t.lruCache.isFull() || (agora - this._t1 > 8000 && st.visible >= 30)) {
      this._fase1 = false; this._q1 = 0; this._fase1ms = Math.round(agora - this._t1);
      if (!this.pronto) { this.pronto = true; this.tPronto = agora; }
      this.acordar();
    }
  }
  progresso(janelaNaTela) {
    const st = this.s.tiles.stats, pend = st.queued + st.downloading + st.parsing, el = this.carga;
    if (!el) return;
    const barra = el.querySelector('b');
    if (FASE1_K > 1) {
      // ASK 8: ONE bar per point, only going up: stage 1 fills 0-60 %, the fine stage 60-100 %; it hides only after 100 % (fine
      // stage with no pending tile for 15 frames). Tiles that load later (the visitor turns to a new part of the window) load
      // without a bar: the window already shows Google.
      if (this._fim) return;
      // the window shows Google as early as before ASK 8 (>= 100 tiles on screen, or 85 % of a batch of >= 200), even if the coarse
      // stage has not settled yet (measured on TEST: waiting for the settle alone was slower on Hugo's page)
      if (!this.pronto && st.visible >= 100) { this.pronto = true; this.tPronto = performance.now(); }
      if (!this._lote) this._lote = { base: st.loaded, p: 0, b2: null };
      const Lt = this._lote;
      let f;
      if (this._fase1 !== false) { const fe = Math.max(0, st.loaded - Lt.base); f = pend > 0 ? 0.6 * fe / (fe + pend) : Lt.p; }
      else { if (Lt.b2 == null) Lt.b2 = st.loaded; const fe = Math.max(0, st.loaded - Lt.b2); f = 0.6 + 0.4 * (pend > 0 ? fe / (fe + pend) : 1); }
      Lt.p = Math.max(Lt.p, Math.min(f, this._fase1 !== false ? 0.6 : 0.99));
      const ver = !!janelaNaTela;
      if (this._fase1 === false && this._q1 >= 15 && (this.s.tiles.loadProgress === undefined || this.s.tiles.loadProgress >= 1 || this._q1 >= 30)) {
        this._fim = true; barra.style.width = '100%'; if (ver) el.hidden = false; // 100 % is always seen before the bar goes
        this._some = setTimeout(() => { el.hidden = true; this._some = 0; }, 900);
        return;
      }
      if (el.hidden === ver) el.hidden = !ver;
      if (ver) barra.style.width = Math.round(4 + 96 * Lt.p) + '%';
      return;
    }
    if (pend > 0) {
      if (!this._lote) this._lote = { base: st.loaded, p: 0 };
      const feitos = Math.max(0, st.loaded - this._lote.base);
      this._lote.p = Math.max(this._lote.p, feitos / (feitos + pend));
      clearTimeout(this._some); this._some = 0;
    }
    // our render's city (inside the panorama) stays in the window until Google's view is COMPLETE (Victor 07/10: no melted
    // blobs on screen); then Google fades in and stays for this point, even if a new area starts loading
    // 21/10 SACADA-GOOGLE-JA: the first tiny batch (root tiles only, 7 visible = a flat brown blob) counted as '85 % there' and
    // faded in 2 s after opening the balcony; now the batch must be >= 200 tiles (the balcony's coarse levels come in batches of
    // ~50 before the full batch of ~1,100 is queued: 32 still let a 53-tile batch through, local test 12:4x), and 'queue empty'
    // must hold for 15 frames (between the root and its children the queue is empty for a frame or two)
    this._quieto = pend === 0 ? (this._quieto || 0) + 1 : 0;
    const feitosL = this._lote ? Math.max(0, st.loaded - this._lote.base) : 0; // the share NOW (the bar's p is a running max)
    const loteOk = !!this._lote && feitosL + pend >= 200 && feitosL / (feitosL + pend) >= 0.85;
    // ... or >= 100 tiles on screen: the balcony view at ~100 tiles already reads as the real city (local test 21/10: 5 s, PC),
    // the rest keeps refining under it; at < 35 tiles it was the melted blobs. 85 % of ~1,100 took 19 s of plain haze.
    if (!this.pronto && st.visible > 0 && ((pend === 0 && this._quieto >= 15) || loteOk || st.visible >= 100 || this.s.tiles.lruCache.isFull())) { this.pronto = true; this.tPronto = performance.now(); }
    if (pend === 0) {
      // done: fill the bar, then hide it a moment later (the page may not render again, so a timer does it)
      if (this._lote && !this._some) { barra.style.width = '100%'; this._some = setTimeout(() => { el.hidden = true; this._lote = null; this._some = 0; }, 900); }
      return;
    }
    const ver = !!janelaNaTela;
    if (el.hidden === ver) el.hidden = !ver;
    if (ver) barra.style.width = Math.round(4 + 96 * this._lote.p) + '%';
  }
  // keeps asking for frames while tiles are still arriving, then stops (no idle GPU work)
  acordar() {
    this.ocioso = 0;
    if (this._laco || !this.ativo) return;
    const passo = () => {
      this._laco = 0;
      if (!this.ativo) return;
      const t = this.s.tiles, st = t.stats || {};
      const ocupado = (st.queued || 0) + (st.downloading || 0) + (st.parsing || 0) > 0 || (t.loadProgress !== undefined && t.loadProgress < 1);
      this.aoMudar();
      this.ocioso = ocupado ? 0 : this.ocioso + 1;
      if (this.ocioso < 30 && !this._laco) this._laco = requestAnimationFrame(passo); // desenha() may already have re-armed it
    };
    this._laco = requestAnimationFrame(passo);
  }
  montaCredito() {
    const d = document.createElement('div');
    d.className = 't360-g3d g3d-cred';
    d.innerHTML = htmlCredito('Vista da janela e reflexo: Google Maps<br>apartamento: render ilustrativo');
    // discreet progress, a separate element (tour360 places it on the left, the credit sits small on the right)
    this.carga = document.createElement('div'); this.carga.className = 't360-g3d-carga'; this.carga.hidden = true;
    this.carga.innerHTML = '<span>Montando a vista real da cidade</span><i><b></b></i>';
    return d;
  }
  atualizaCredito() {
    const out = []; this.s.tiles.getAttributions(out);
    const txt = textoDados(out);
    const el = this.credito.querySelector('.g3d-attr');
    if (el && el.textContent !== txt) el.textContent = txt;
  }
  liberar() {
    this.ativo = false;
    if (this._laco) cancelAnimationFrame(this._laco);
    for (const ev of ['load-model', 'tiles-load-end', 'needs-update', 'tile-visibility-change']) this.s.tiles.removeEventListener(ev, this._aoCarregar);
    if (this.s.dono === this) { for (const c of [...this.s.tiles.cameras]) this.s.tiles.deleteCamera(c); this.s.dono = null; }
    if (this.rt) this.rt.dispose();
    if (this.rtV) this.rtV.dispose();
    if (this.foto) { for (const a of this.foto.alvos) { a.A.dispose(); a.W.dispose(); } this.foto = null; }
    this._soltaMS(); this.planosLimpa();
    try { localStorage.removeItem(chaveLocal('tabela3d-foto-ativa')); } catch (e) { /* ignore */ } // leaving the 360 mid-photo is not a crash
    this.restauraCache();
    this.credito.remove(); if (this.carga) this.carga.remove();
  }
}

// ---------------------------------------------------------------- compositing sphere: Google colour where the pano's `fora` mask is white
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
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
// C7 21/10: gradeF = day grade of the PHOTO cube (live mode is graded in the tile shader); ombro = (knee, weight) after the gain
uniform vec4 gradeF;
uniform vec2 ombro;
uniform float despre; // C8: 1 = Google's pixels are premultiplied by coverage at the edges (MSAA): divide back
${GRADE_GLSL}// 08/10 glass of the facade seen from the balcony (Victor: the city reflected in it was gone; with Google's 3D): tV.r = glass,
// tV.g = reflectance shape by incidence angle (gera_mascara_vidro.py). The reflected direction is the view direction mirrored
// across the facade (forward component flips). Photo mode reads it from the same cube; live mode (computers) draws a
// mirrored camera into tG when the glass, not the window, is on screen (espelho = 1, image flipped in x).
uniform sampler2D tV;
uniform float usaVidro;
uniform float espelho;
uniform float forcaV;
uniform float kDiaV;
uniform sampler2D tPano;
uniform float panoSrgb;
// 13/10 (R3): tGV = mirrored city (live), temJanela = the window part is drawn from tG (0 when tG holds the mirror only);
// caixaMin/caixaMax = the balcony box around the eye, in (forward +v, up, right) metres: facade glass at caixaMin.x,
// floor caixaMin.y, parapet line caixaMax.x, ceiling caixaMax.y, side limits z. The reflected ray starts ON the glass, so
// near things (floor, parapet, walls) are found where that ray leaves the box and read from the panorama at that point.
uniform sampler2D tGV;
uniform float temJanela;
uniform vec3 caixaMin;
uniform vec3 caixaMax;
uniform float usaCaixa;
// photo cube lookup: scene-frame direction (x mirrored like the sphere) -> local frame of the shot -> face texture
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
  // sky where Google drew nothing (equirect: v 0.5 = horizon, 1 = zenith); same elevation for the mirrored direction
  vec3 ceu = mix(ceuHoriz, ceuTopo, smoothstep(0.5, 0.78, vUv.y));
  vec3 rgb = vec3(0.0); float a = 0.0; // premultiplied output (blend ONE, ONE_MINUS_SRC_ALPHA)
  if (m > 0.002 && temJanela > 0.5) { // the window: Google's city where the pano's 'fora' mask is open
    vec4 g; bool ok = true;
    if (usaCubo > 0.5) ok = cubo(d, g); else { g = texture2D(tG, gl_FragCoord.xy / res); if (despre > 0.5 && g.a > 0.0) g.rgb /= g.a; }
    if (ok) { float aw = m * forca; rgb += paraSrgb(mix(ceu, g3dOmbro(g.rgb * ganho, ombro), g.a)) * aw; a += aw;${typeof location !== 'undefined' && /[?&]g3dburaco=1/.test(location.search) ? ' if (vUv.y < 0.5 && g.a < 0.5) rgb = vec3(1.0, 0.0, 1.0) * aw;' : ''} } // face not shot yet: our render's city stays. 22/10 ITEM 8: ?g3dburaco=1 paints MAGENTA where Google drew nothing BELOW the horizon (the 'sky-coloured holes' under the balcony railing), for counting in tests
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
      // 12/10: the pano's own sky (hidden behind Google) holds HDR fireflies; a 1-2% leak of them through a filtered mask
      // edge sparkled as white dots in the glass -> snap the mask and cap the pano
      float mR = smoothstep(0.1, 0.9, texture2D(tM, uvR).r);
      vec3 pR = texture2D(tPano, uvR).rgb; if (panoSrgb > 0.5) pR = pow(pR, vec3(2.2)); pR = min(pR, vec3(1.0));
      if (!ok) { g = vec4(0.0); ok = true; mR = 0.0; } // no picture of the city here yet: the balcony still reflects
      if (ok) {
        float w = v.r * (0.25 + 0.75 * v.g) * forcaV * forca;
        // day: covers the reflection of our render's city baked in the pano; night: adds the lit city on the dark glass
        rgb += paraSrgb(mix(pR, mix(ceu, g3dOmbro(g.rgb * ganho, ombro), g.a), mR)) * w; a += w * kDiaV; // 08/10 Victor: the floor of the balcony blocks the city in the reflection
      }
    }
  }
  gl_FragColor = vec4(rgb, min(a, 1.0));
}`;
export function materialSobreposicao() {
  const forcaV = +((typeof location !== 'undefined' && new URLSearchParams(location.search).get('gvidro')) || 0.4); // ?gvidro= tests
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { tG: { value: null }, tM: { value: null }, res: { value: new THREE.Vector2(1, 1) }, ganho: { value: new THREE.Vector3(1, 1, 1) }, forca: { value: 1 }, fA0: { value: null }, fA1: { value: null }, fA2: { value: null }, fA3: { value: null }, fW0: { value: null }, fW1: { value: null }, fW2: { value: null }, fW3: { value: null },
      fM: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] }, nF: { value: 0 }, nOk: { value: 0 }, luzBase: { value: new THREE.Vector3(1, 1, 1) }, luzesN: { value: 0 }, usaCubo: { value: 0 }, rumoB: { value: 0 },
      tV: { value: null }, usaVidro: { value: 0 }, tGV: { value: null }, temJanela: { value: 1 }, caixaMin: { value: new THREE.Vector3() }, caixaMax: { value: new THREE.Vector3() } /* C8: set from the manifest vidro.caixa (usaCaixa) */, usaCaixa: { value: 0 }, tPano: { value: null }, panoSrgb: { value: 0 }, espelho: { value: 0 }, forcaV: { value: forcaV }, kDiaV: { value: 1 },
      gradeF: { value: new THREE.Vector4(1, 1, 1, 0.18) }, ombro: { value: new THREE.Vector2(0.6, 0) }, despre: DESPRE,
      ceuTopo: { value: new THREE.Vector3(0.12, 0.27, 0.6) }, ceuHoriz: { value: new THREE.Vector3(0.55, 0.66, 0.8) } },
  });
}
// sky colours (linear) for the window by sun elevation: day blue, warm horizon around sunrise/sunset, dark night
export function ceuParaSol(el) {
  const e = Number.isFinite(el) ? el : -20;
  const dia = smooth(-2, 10, e), crep = smooth(-8, 0, e) * (1 - smooth(4, 14, e));
  const L = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  let topo = L([0.008, 0.012, 0.03], [0.12, 0.27, 0.6], dia), horiz = L([0.02, 0.025, 0.05], [0.55, 0.66, 0.8], dia);
  topo = L(topo, [0.16, 0.2, 0.42], crep * 0.5); horiz = L(horiz, [0.85, 0.6, 0.42], crep * 0.45);
  return { topo, horiz };
}
// daylight baked in the tiles -> dusk / night: darker + bluer, following the same smooth elevation ramp as render-mix.js
export function ganhoParaSol(el, { dia = 1.35, noite = 0.14 } = {}) {
  const t = Math.min(1, Math.max(0, ((Number.isFinite(el) ? el : -12) + 4) / 14)), k = t * t * (3 - 2 * t);
  const tint = [0.55 + 0.45 * k, 0.68 + 0.32 * k, 1.0];
  const g = noite + (dia - noite) * k;
  return tint.map((x) => x * g);
}

// ---------------------------------------------------------------- Phase 2: Google tiles as the city of the OUTSIDE view (cena3d.js)
// ref = { lat, lon, h, rumoX }: geodetic position of the B5 plan origin (sidewalk NW corner, y = 0) and bearing of +x (deg).
// Scene frame of cena3d = B5 frame (x along +x, y up, z along +x + 90 deg). Our tower is NOT touched or hidden by this; only
// the old city (B7 + B9 bake) is hidden once Google's tiles are actually visible, and shown again on any failure.
// polygon offset (miter, capped) for the lot clip: every edge moves out by m metres
function inflar(P, m) {
  const pts = P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1] ? P.slice(0, -1) : P.slice();
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sg = area > 0 ? 1 : -1, n = pts.length, out = [];
  const nor = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [sg * dy / l, -sg * dx / l]; };
  for (let i = 0; i < n; i++) {
    const p = pts[i], n0 = nor(pts[(i - 1 + n) % n], p), n1 = nor(p, pts[(i + 1) % n]);
    let bx = n0[0] + n1[0], by = n0[1] + n1[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const k = Math.min(3, 1 / Math.max(0.33, bx * n1[0] + by * n1[1]));
    out.push([p[0] + bx * m * k, p[1] + by * m * k]);
  }
  return out;
}
export async function ligarGoogleCena({ scene, camera, renderer, ref, aoMudar, esconder = [], mostrar = () => {}, recorte = null }) {
  const s = await iniciarGoogle();
  if (!s) return null;
  const { tiles } = s; if (typeof window !== 'undefined') window.__g3dTiles = tiles;
  const la = (ref.lat * Math.PI) / 180, lo = (ref.lon * Math.PI) / 180, b = (ref.rumoX * Math.PI) / 180;
  const e = [-Math.sin(lo), Math.cos(lo), 0];
  const n = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const u = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const ax = [0, 1, 2].map((i) => Math.sin(b) * e[i] + Math.cos(b) * n[i]);               // scene +x in ECEF
  const az = [0, 1, 2].map((i) => Math.sin(b + Math.PI / 2) * e[i] + Math.cos(b + Math.PI / 2) * n[i]); // scene +z
  const P = ecef(ref.lat, ref.lon, ref.h), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const m = new THREE.Matrix4();
  m.set(ax[0], ax[1], ax[2], -dot(ax, P), u[0], u[1], u[2], -dot(u, P), az[0], az[1], az[2], -dot(az, P), 0, 0, 0, 1);
  const g = tiles.group; g.renderOrder = -1;
  // our tower's box in the B5 frame (= this scene's frame): Google's mesh of the same building is hidden inside it
  if (recorte && !/[?&]recorte=0/.test(location.search)) {
    s.recorte.min.value.copy(recorte.min); s.recorte.max.value.copy(recorte.max); s.recorte.ecefParaB5 = m.clone(); s.recorte.liga.value = 1;
    // 08/10 (Victor: walls of Google's own mesh of the building stuck out of the box): the whole LOT (GeoSampa lote_cidadao,
    // dados/lote-1577.json, B5 xz) inflated by recorte.margemLote metres is cleared too, from the box floor to its top
    if (recorte.lote && recorte.lote.length >= 3) { const L = inflar(recorte.lote, recorte.margemLote || 1.5).slice(0, 24); L.forEach((p, i) => s.recorte.lote.value[i].set(p[0], p[1])); s.recorte.loteN.value = L.length; }
    s._recFeito = false; if (s.atualizaRecorte) s.atualizaRecorte();
  }
  let ganhoCena = [1, 1, 1];
  const tam = new THREE.Vector2(), camSelFora = new THREE.PerspectiveCamera();
  let falhou = false, mostrando = false;
  const cred = document.createElement('div'); cred.className = 'g3d-cena g3d-cred'; // not t360-g3d: the 360's CSS (bottom:78px) stretched it
  // compact credit in a corner (Victor 07/10 and 15/10: it took too much space): logo + which-part line + data attribution
  cred.style.cssText = 'position:absolute;right:8px;bottom:120px;z-index:5;max-width:calc(100% - 16px);' + CRED_CSS;
  cred.innerHTML = htmlCredito('Cidade 3D: Google Maps<br>prédio em destaque: maquete própria');
  // bottom right of the free part of the stage (the usual place, A4), above the sun bar / phone sheets and left of the
  // docked desktop panel; at the top right it covered the sun disc on phones (15/10)
  let credT = 0;
  const posCred = () => {
    const agora = performance.now(); if (agora - credT < 300) return; credT = agora;
    const pai = renderer.domElement.parentElement.getBoundingClientRect();
    const vis = (q) => { const e = document.querySelector(q); return e && !e.hidden && e.offsetParent !== null ? e.getBoundingClientRect() : null; };
    let topo = pai.bottom - 30, dir = 8;
    for (const q of ['#sol-painel', '#sol-painel .sol-dica', '#card', '#unidades']) {
      const r = vis(q); if (!r || !r.height) continue;
      if (innerWidth >= 1000 && (q === '#card' || q === '#unidades')) { dir = Math.max(dir, pai.right - r.left + 8); continue; }
      topo = Math.min(topo, r.top);
    }
    const baixo = Math.round(pai.bottom - topo + 8);
    cred.style.bottom = baixo + 'px'; cred.style.right = Math.round(dir) + 'px'; cred.style.left = 'auto';
    // 15/10 wave 1: never over our tower. Its box (the cut box, from the ground) projected on the screen; if the credit in
    // the bottom-right corner would touch it, the credit goes to the bottom-left corner (same height) when that one is free.
    if (recorte && recorte.min) {
      const xs = [], ys = [];
      for (const x of [recorte.min.x, recorte.max.x]) for (const y of [0, recorte.max.y]) for (const z of [recorte.min.z, recorte.max.z]) {
        vCred.set(x, y, z).project(camera); if (vCred.z > 1) continue;
        xs.push((vCred.x * 0.5 + 0.5) * pai.width); ys.push((-vCred.y * 0.5 + 0.5) * pai.height);
      }
      if (xs.length) {
        const T = [Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6];
        const w = cred.offsetWidth, h = cred.offsetHeight, y1 = pai.height - baixo, y0 = y1 - h;
        const toca = (x0, x1) => x0 < T[2] && x1 > T[0] && y0 < T[3] && y1 > T[1];
        if (toca(pai.width - dir - w, pai.width - dir) && !toca(8, 8 + w)) { cred.style.right = 'auto'; cred.style.left = '8px'; }
      }
    }
  };
  const vCred = new THREE.Vector3();
  cred.hidden = true; // only while Google's city is on screen
  renderer.domElement.parentElement.appendChild(cred);
  // our city stays until Google's first view is complete; meanwhile a discreet bar (top left, under the buttons)
  const carga = document.createElement('div');
  carga.style.cssText = 'position:absolute;left:10px;top:132px;z-index:5;display:flex;flex-direction:column;gap:3px;padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:10px/1.2 system-ui,sans-serif;pointer-events:none;width:150px';
  carga.innerHTML = '<span>Montando a cidade real</span><i style="display:block;height:2px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden"><b style="display:block;height:100%;width:4%;background:#fff;transition:width .4s ease"></b></i>';
  renderer.domElement.parentElement.appendChild(carga);
  let lote0 = null, pMax = 0;
  // 15/10 FILA D11: back from the 360 the tiles of the near city had been dropped (the window owned the budget), so the
  // front buildings stayed blurred while they refined, with no sign. The bar comes back until the view is complete again.
  let refino = null;
  const aoCarregar = () => aoMudar && aoMudar();
  for (const ev of ['load-model', 'tiles-load-end', 'needs-update']) tiles.addEventListener(ev, aoCarregar);
  const out = [];
  // The page renders on demand: if nothing asks for a frame, tiles.update() never runs and refinement stalls at the coarse
  // level. Any frame that finds pending work keeps asking for frames until the queues are empty for a while.
  let laco = 0, quieto = 0;
  const pendente = () => { const st = tiles.stats; return st.queued + st.downloading + st.parsing > 0 || tiles.loadProgress < 1; };
  // 26/10 ASK 8 (Sites: the hero and the block-3 tour are two module iframes = two tile sets; the hero went on refining ~200-300 MB
  // while the visitor was already at the tour, whose window waited behind it): EMBEDDED only (window.parent !== window), once Google's
  // city is on screen and the outside view owns the tiles, a page scrolled out of view downloads with 2 parallel requests instead of
  // 30 and stops asking for frames; back in view it resumes at once. A standalone page (Hugo's link) is always in view: unchanged.
  // ?gpausa=0 = off (tests).
  let foraDaTela = false;
  const fila = tiles.downloadQueue, campoFila = fila && ('maxJobsPerOrigin' in fila ? 'maxJobsPerOrigin' : 'maxJobs'), filaMax = fila ? fila[campoFila] : 30;
  s.ritmoFora = () => { if (!fila) return; const lento = foraDaTela && mostrando && (!s.dono || s.dono === api); const v = lento ? 2 : filaMax; if (fila[campoFila] !== v) fila[campoFila] = v; };
  const bombear = () => {
    quieto = 0; if (laco || falhou) return;
    const passo = () => { laco = 0; if (falhou) return; if (foraDaTela && mostrando && (!s.dono || s.dono === api)) return; aoMudar && aoMudar(); quieto = pendente() ? 0 : quieto + 1; if (quieto < 30 && !laco) laco = requestAnimationFrame(passo); };
    laco = requestAnimationFrame(passo);
  };
  if (typeof window !== 'undefined' && window.parent !== window && typeof IntersectionObserver !== 'undefined' && !/[?&]gpausa=0/.test(location.search)) {
    new IntersectionObserver((ents) => {
      const fora = !ents.some((x) => x.isIntersecting);
      if (fora === foraDaTela) return;
      foraDaTela = fora; s.ritmoFora();
      if (!fora) bombear();
    }).observe(document.documentElement);
  }
  const api = {
    tiles, perf: { n: 0, ms: 0 }, get mostrando() { return mostrando && !falhou; },
    // call once per frame before renderer.render()
    // congelado = the camera is flying into a unit (the 360 opens right after): draw what is loaded, download nothing
    antes(congelado = false) {
      if (falhou || congelado) return;
      try {
        const t0 = performance.now();
        if (s.dono && s.dono !== api && s.dono.ativo) return; // the 360 window owns the tiles while it is open
        if (s.dono !== api) {
          const voltando = !!s.dono && mostrando;
          s.tomar(api, scene, m, camSelFora, ERRO_360 * 1.25); s.pintar(ganhoCena); s.recorte.perto.value = 1; // JANELAS-GIGANTES: near-wall fade of the lit windows, outside view only
          if (voltando) { refino = { lote0: null, pMax: 0, t0: performance.now() }; carga.querySelector('b').style.width = '4%'; renderer.domElement.parentElement.appendChild(carga); bombear(); }
        }
        // tiles are selected only for the part of the screen above the unit card (phone bottom sheet): the city hidden
        // under the card is not downloaded and does not take the memory the prefetch of the unit's window needs
        renderer.getDrawingBufferSize(tam); camera.updateMatrixWorld(true);
        const card = document.getElementById('card'), rc = card && !card.hidden ? card.getBoundingClientRect() : null;
        const fr = rc && rc.width > innerWidth * 0.8 && rc.top > innerHeight * 0.3 ? Math.min(1, rc.top / innerHeight + 0.05) : 1;
        camSelFora.copy(camera, false); camSelFora.far = Math.min(camSelFora.far, RAIO);
        if (fr < 1) camSelFora.setViewOffset(tam.x, tam.y, 0, 0, tam.x, Math.round(tam.y * fr)); else camSelFora.clearViewOffset();
        camSelFora.updateProjectionMatrix(); camSelFora.updateMatrixWorld(true);
        tiles.setResolution(camSelFora, tam.x, Math.round(tam.y * fr)); tiles.update();
        out.length = 0; tiles.getAttributions(out);
        const txt = textoDados(out);
        const el = cred.querySelector('.g3d-attr'); if (el.textContent !== txt) el.textContent = txt;
        // 26/10 (Sites: 'cidade' visivel:false for ~2-8 s after Google's tiles were already on screen): the attribution shows as
        // soon as one Google tile is drawn, not only when Google takes over from our city ('mostrando', 85% loaded)
        if (cred.hidden && !api.noite && !falhou && g.visible && tiles.stats.visible > 0 && txt) cred.hidden = false;
        if (!cred.hidden) posCred();
        const st = tiles.stats, pend = st.queued + st.downloading + st.parsing;
        if (!mostrando) {
          if (lote0 == null) lote0 = st.loaded;
          const feitos = st.loaded - lote0; pMax = Math.max(pMax, pend > 0 ? feitos / (feitos + pend) : 0);
          carga.querySelector('b').style.width = Math.round(4 + 96 * pMax) + '%';
          // Google replaces our city when its view is 85% there, complete, or when this device's memory budget is full
          // (on mid phones the budget fills before 'complete': it never switched - Victor 07/10 21h50)
          if (st.visible > 8 && (pend === 0 || pMax >= 0.85 || tiles.lruCache.isFull())) { mostrando = true; carga.remove(); cred.hidden = !!api.noite; s.ritmoFora(); }
        }
        if (refino) {
          if (refino.lote0 == null) refino.lote0 = st.loaded;
          const feitos = st.loaded - refino.lote0; refino.pMax = Math.max(refino.pMax, pend > 0 ? feitos / (feitos + pend) : 1);
          carga.querySelector('b').style.width = Math.round(4 + 96 * refino.pMax) + '%';
          if ((pend === 0 && tiles.loadProgress >= 1 && performance.now() - refino.t0 > 500) || (tiles.lruCache.isFull() && pend === 0 && performance.now() - refino.t0 > 3000) || performance.now() - refino.t0 > 30000) { carga.remove(); refino = null; }
        }
        if (api.preFoto) { // photo prefetch: next region when the queue is empty (or after 15 s); done after the last one
          const P = api.preFoto; P.q = pend === 0 ? P.q + 1 : 0;
          if ((P.q >= 3 && performance.now() - P.t0 > 300) || performance.now() - P.t0 > 15000) {
            P.reg++; P.t0 = performance.now(); P.q = 0;
            if (P.reg >= FOTO_N * FOTO_N) { api.pararPreCarga(); } else api.passoPreFoto();
          }
          bombear();
        }
        if (pendente()) bombear();
        api.perf.n++; api.perf.ms += performance.now() - t0;
        if (STATUS.erro && /403|429|quota|key|denied|permission/i.test(STATUS.erro)) throw new Error(STATUS.erro);
      } catch (err) { api.desligar(err); }
    },
    // Prefetch (Victor 07/10): when a unit's card opens, start downloading the city as seen from inside that unit, so the
    // 360 window is ready (or nearly) when the client goes in. A second camera at the unit's eye (point meio, B5 frame =
    // this scene frame) looking out through the facade, wide enough for the whole window, at the 360's pixel density.
    // The 360 taking the tiles deletes it; closing the card removes it.
    async preCarregar({ andar, final } = {}) {
      if (falhou || andar == null || final == null) return;
      const { GEO_PREDIO: G } = await import('./google-geo.js');
      const f = G.finais[String(final)]; if (!f) return;
      const [u, v, hp] = PREDIO_CFG.tour360.olhoJanela; // C8: eye of the 360 point 'meio' in the plan (predio.json; Upper 3.7, 4.3, 1.55)
      const x = f.M[0] * u + f.M[1] * v + f.t[0], z = f.M[2] * u + f.M[3] * v + f.t[1], y = G.laje_1 + (andar - 1) * G.piso + hp;
      // EXACTLY the first view of the 360 (point meio, yaw 0, portrait 90 deg) cropped to where the window is on that
      // screen (measured 07/10: rows 37%..77% of the height, full width). A wider prefetch (97x70 deg) needed ~1.5 GB and
      // the cache threw the prefetched tiles away before the 360 used them (measured: 526 tiles downloaded again).
      const W = Math.round(innerWidth * Math.min(3, devicePixelRatio || 1)), H = Math.round(innerHeight * Math.min(3, devicePixelRatio || 1));
      if (!api.camPre) api.camPre = new THREE.PerspectiveCamera(90, 1, 3, RAIO);
      const c = api.camPre; c.fov = innerHeight > innerWidth ? 90 : 75; c.aspect = W / H;
      const y0 = Math.round(H * 0.37), hh = Math.round(H * 0.40);
      c.setViewOffset(W, H, 0, y0, W, hh); c.position.set(x, y, z); c.up.set(0, 1, 0);
      c.lookAt(x + f.M[1] * 100, y, z + f.M[3] * 100); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
      if (s.dono !== api) return; // the 360 is open: it loads its own view
      if (MODO_FOTO) { // photo mode: same regions + detail as the window photo, one region at a time (see antes())
        c.fov = 95; c.aspect = 1; c.clearViewOffset(); c.updateProjectionMatrix();
        api.preFoto = { reg: 0, t0: performance.now(), q: 0 };
        api.preCarga = { andar, final }; api.passoPreFoto(); bombear(); return;
      }
      if (!tiles.cameras.includes(c)) tiles.setCamera(c);
      // this view's errorTarget is 1.25x the 360's: a 1.25x resolution asks for the 360's exact level
      tiles.setResolution(c, Math.round(W * 1.25), Math.round(hh * 1.25));
      api.preCarga = { andar, final }; bombear();
    },
    pararPreCarga() { if (api.camPre && tiles.cameras.includes(api.camPre)) tiles.deleteCamera(api.camPre); api.preCarga = null; api.preFoto = null; },
    // one step of the photo prefetch: region r of FOTO_N x FOTO_N, resolution scaled so this camera gets the photo's detail
    passoPreFoto() {
      const P = api.preFoto, c = api.camPre; if (!P || !c || s.dono !== api) return;
      const N = FOTO_N, L = FOTO_LADO, w = L / N, x = (P.reg % N) * w, y = Math.floor(P.reg / N) * w;
      c.setViewOffset(L, L, x, y, w, w); c.updateProjectionMatrix(); c.updateMatrixWorld(true);
      if (!tiles.cameras.includes(c)) tiles.setCamera(c);
      const k = (ERRO_360 * 1.25) / ERRO_FOTO;
      tiles.setResolution(c, Math.round(w * k), Math.round(w * k));
    },
    // building ghosts (like our city): footprint map of our city's buildings + camera and tower positions (B5 = this frame)
    terreno(tex, ext) { s.recorte.terr.value = tex; s.recorte.terrExt.value = ext; },
    mapaPredios(tex, minX, minZ, tam) { s.recorte.mapa.value = tex; s.recorte.mapaR.value.set(minX, minZ, 1 / tam, 0); },
    // 22/10 ITEM 8 (Victor: sky-coloured holes under the balcony railing in the 360): cena3d.js render() calls these two on every
    // outside frame, also while the 360 window OWNS the tiles (its gCena.antes() returns early but the frame still renders on a
    // sun change). The shared uniforms then carried the outside camera's ghost rules into the 360: Google's fragments inside the
    // outside tower's screen box (drawing-buffer px) and nearer than its depth were dropped in the window view / window photo =
    // holes of sky. Measured (buracos_varanda.mjs, P1's path: camera 200 m away, entry without animation): 274 885 hole px in
    // 20 framings with the rules on, 0 with them off. Now they are written only by the owner of the tiles.
    fantasma(cam, alvo) { if (s.dono !== api) return; if (!s.recorte.mapa.value) return; s.recorte.mapaR.value.w = cam ? 1 : 0; if (cam) { s.recorte.camB5.value.copy(cam); s.recorte.alvoB5.value.copy(alvo); } },
    // our tower's box on screen (drawing-buffer px, y up) + its nearest view depth; null = off
    telaTorre(r, prof) { if (s.dono !== api) return; if (r) { s.recorte.ret.value.set(r[0], r[1], r[2], r[3]); s.recorte.prof.value = prof; } else s.recorte.ret.value.set(1, 1, 0, 0); },
    // the shadow-overlay material drops the same fragments (no shadow painted on clipped / ghosted Google surfaces)
    aplicarRecorte(material) { material.onBeforeCompile = s.shaderRecorte; material.customProgramCacheKey = () => 'g3d-recorte-sombra'; material.needsUpdate = true; },
    // (kept for the API; Google now stays on at night with its own night light)
    definirNoite(v) {
      if (api.noite === v) return;
      api.noite = v; g.visible = !v; cred.hidden = v || falhou || !(mostrando || tiles.stats.visible > 0);
    },
    // daylight is baked in the tiles: darken + tint at dusk/night (materials are unlit)
    definirSol(el) {
      s.definirLuz(el); api.el = el;
    },
    desligar(err) {
      falhou = true; mostrando = false; carga.remove(); if (laco) cancelAnimationFrame(laco); if (s.dono === api) { scene.remove(g); s.dono = null; } cred.remove(); mostrar();
      console.warn('google3d (cena) desligado', err && err.message); aoMudar && aoMudar();
    },
  };
  bombear();
  return api;
}
