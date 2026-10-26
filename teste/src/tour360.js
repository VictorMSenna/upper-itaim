// Guided 360 tour over photoreal Cycles panoramas (front B6). Matterport-like: drag = look around 360°,
// wheel/pinch = zoom, tap a floor spot = walk there (camera glide + crossfade, ~600 ms).
// Light per time/season/lamps comes from src/render-mix.js (sum of precomputed layers).
//
// API (same words as src/interior.js of B4):
//   const api = await abrirTour360({ container, manifesto, ponto, estacao, minutos, luzes, aoFechar, teste })
//   definirHora(minutos) · definirEstacao(estacao) · definirLuz(nome, ligada) · irPara(id) · estadoTour360() · fecharTour360()
// Frames: manifest points are in the plan of the unit (u, v, h metres; v toward the balcony). three.js world:
//   X = -v, Y = h, Z = u  (pano centre = +v = -X, turning right = increasing pano u, like the Blender equirect camera).
import { capacidade, rebaixar } from './capacidade.js';
import { chaveLocal } from './predio.js';
import * as THREE from 'three';
import { SOL } from './dados-sol.js';
import { MisturaPonto, ROTULO, INFO, VEU } from './render-mix.js';
import { solNoInstante } from './interior-sol.js';
import { criarVistaGerada } from './vista-gerada.js'; // RODADA 26/10 (E0): placeholder in the window while Google's picture is made

let atual = null, geracao = 0;
// 21/10 MANCHAS-360: the tour registers itself as `atual` as soon as its state exists, BEFORE the first paint and Google's
// start (seconds on a cold cache). Before, `atual` was set only when criar() returned, so an hour / season / lamp change made
// while the tour was opening (definirHora below = atual?.api...) was dropped: the bar said 21:00 and the 360 stayed at 09:00.
export async function abrirTour360(opts) {
  const g = ++geracao;
  if (atual) atual.fechar(false);
  const h = await criar({ ...opts, registrar: (x) => { if (g !== geracao) { x.fechar(false); return; } if (atual && atual !== x) atual.fechar(false); atual = x; } });
  return h.api;
}
export function definirHora(m) { atual?.api.definirHora(m); }
export function definirEstacao(e) { atual?.api.definirEstacao(e); }
export function definirLuz(n, l) { atual?.api.definirLuz(n, l); }
export function irPara(id) { return atual?.api.irPara(id); }
export function estadoTour360() { return atual ? atual.api.estado() : null; }
export function fecharTour360() { atual?.fechar(true); }

// 15/10 FILA C8: lamp names, the start point, the lamps lit at night and the night white reference come from the manifest
// ("cena" block of assets/render/tour360/manifesto.json); CENA is set when a tour opens
let CENA = { luzes: [], nomesLuz: {}, curtoLuz: {}, luzesNoite: [], inicio: null, refLuz: null, pufe: {}, chegada: {} };
// 22/10 ITEM 10/11 (Sites, module inside an iframe): &embutido=1 = the page scrolls with the wheel (no Ctrl) and with vertical
// swipes; zoom only with Ctrl+wheel or a pinch; every point is reached facing its arrival view (manifest cena.chegada)
const EMBUTIDO = typeof location !== 'undefined' && /[?&]embutido=1/.test(location.search);
const paraMundo = ([u, v, h]) => new THREE.Vector3(-v, h, u);
// D18c (Victor 16/10): until the client presses a lamp button, the lamps follow the hour: by day all off, at night only the
// spots (night = sun below -2 deg, where the day/night blend of render-mix.js starts). His first press makes his set the
// state of the visit (sessionStorage; in memory if storage is blocked): kept across hours, points, units, leaving and
// re-entering, never changed automatically again.
const CHAVE_LUZES = chaveLocal('tabela3d-luzes-cliente'); // C2: with the building id
let luzesMemoria = null;
function luzesDoCliente() {
  try { const o = JSON.parse(sessionStorage.getItem(CHAVE_LUZES) || 'null'); if (o && typeof o === 'object') return o; } catch (e) { /* private mode */ }
  return luzesMemoria;
}
function guardaLuzesCliente(l) { luzesMemoria = { ...l }; try { sessionStorage.setItem(CHAVE_LUZES, JSON.stringify(luzesMemoria)); } catch (e) { /* memory only */ } }
function luzesAuto(estacao, minutos) {
  let el = -12; try { const s = solNoInstante(SOL, estacao, minutos); if (Number.isFinite(s.el)) el = s.el; } catch (e) { /* no sun data: night */ }
  return Object.fromEntries(CENA.luzes.map((k) => [k, el < -2 && CENA.luzesNoite.includes(k)]));
}

// 21/10 MANCHAS-360: a lost WebGL context reloads the page one tier down (capacidade.rebaixar). The visit comes back where it was:
// the app restores season + hour from this record (app.js deepLink) and the tour its point and view (criar below), then drops it.
const CHAVE_RETORNO = chaveLocal('tabela3d-360-retorno');
export function retorno360(numero) {
  try {
    const o = JSON.parse(sessionStorage.getItem(CHAVE_RETORNO) || 'null');
    if (o && String(o.numero) === String(numero) && Date.now() - o.t < 120e3) return o;
  } catch (e) { /* storage blocked */ }
  return null;
}
async function criar({ container, manifesto = 'assets/render/tour360/manifesto.json', ponto, estacao = 'inverno', minutos = 900,
  luzes = null, reflexo = false, aoFechar, teste = false, andar = null, final = null, numero = null, torre = null, registrar = null }) {
  const man = typeof manifesto === 'string' ? await (await fetch(manifesto)).json() : manifesto;
  const base = typeof manifesto === 'string' ? manifesto.replace(/[^/]*$/, '') : (man.base || '');
  const PTS = Object.fromEntries(man.pontos.map((p) => [p.id, p]));
  CENA = { ...CENA, ...(man.cena || {}) };
  const REF_LUZ = (() => { const r = CENA.refLuz, c = r && PTS[r.ponto] && PTS[r.ponto].camadas && PTS[r.ponto].camadas[r.camada]; return c ? (c.media_dentro || c.media) : null; })();
  // first view: the middle of the room facing the balcony when it has the new render (window mask = its own exposure +
  // Google city of the unit); otherwise the first point with a window mask; the manifest order last (07/10 Victor)
  const pontoInicial = () => (man.pontos.find((p) => p.id === CENA.inicio && p.camadas && p.camadas.fora) || man.pontos.find((p) => p.camadas && p.camadas.fora) || man.pontos[0]).id; // Victor 08/10: the tour starts at the entrance
  const volta = numero != null ? retorno360(numero) : null; // MANCHAS-360: back from a context-loss reload
  if (volta) { try { sessionStorage.removeItem(CHAVE_RETORNO); } catch (e) { /* ignore */ } if (!ponto && PTS[volta.ponto]) ponto = volta.ponto; }
  // RODADA 26/10: lamps given by the caller (P1c start parameter &luzes=) win over the visitor's saved choice; the glass
  // reflection starts OFF unless the caller asks for it (Victor: 'sem reflexo'; Sites P1c 22/10 04:31)
  const estado = { estacao, minutos, luzes: { ...(luzes || luzesDoCliente() || luzesAuto(estacao, minutos)) }, ponto: ponto && PTS[ponto] ? ponto : pontoInicial(), reflexo: !!reflexo };
  if (luzes) guardaLuzesCliente(estado.luzes); // RODADA 26/10 P1c: lamps given at the start stay (a change of hour no longer resets them to the automatic rule)
  let VG = null; // RODADA 26/10 (E0): generated view of the unit's facade, shown only until Google's window is ready (modo 'espera')
  let G = null; // B10 (ON in the published site): live layer with Google Photorealistic 3D Tiles behind the `fora` window mask; null = current behaviour

  // ---------------------------------------------------------------- DOM
  const raiz = document.createElement('div');
  raiz.className = 't360';
  raiz.innerHTML = `
    <canvas class="t360-cv"></canvas>
    <button type="button" class="t360-rot" aria-label="Sobre a imagem" aria-expanded="false"><span class="t360-rot-i" aria-hidden="true">i</span><span class="t360-rot-txt">${ROTULO}</span></button>
    <div class="t360-vista" hidden>Vista simulada</div>
    <div class="t360-nome"></div>
    <div class="t360-luzes">${CENA.luzes.filter((k) => man.pontos.some((p) => p.camadas && p.camadas[k])).map((k) => `<button data-luz="${k}" aria-pressed="false" title="${CENA.nomesLuz[k] || k}"><span class="l-longo">${CENA.nomesLuz[k] || k}</span><span class="l-curto">${CENA.curtoLuz[k] || CENA.nomesLuz[k] || k}</span></button>`).join('')}</div>
    <button class="t360-fechar" aria-label="Fechar">×</button>
    <div class="t360-chips"></div>
    <div class="t360-aviso-sol" hidden>Esta sacada tem sol direto agora; o passeio foi feito num studio de outra face e não mostra esse sol (veja o cartão).</div>`;
  // 08/10 Victor: the city reflected in the balcony glass is nice but sometimes in the way -> on/off, only where there is glass
  const bR = document.createElement('button'); bR.className = 't360-reflexo'; bR.hidden = true; bR.setAttribute('aria-pressed', 'false');
  bR.innerHTML = '<span class="l-longo">Reflexo no vidro</span><span class="l-curto">Reflexo</span>';
  raiz.querySelector('.t360-luzes').appendChild(bR);
  bR.addEventListener('click', () => { estado.reflexo = estado.reflexo === false; bR.setAttribute('aria-pressed', String(estado.reflexo)); if (G && G.vidro) { G.malha.material.uniforms.usaVidro.value = estado.reflexo ? 1 : 0; G.vista.acordar(); } desenha(); repinta(); }); // ITEM 12: + the lamps' reflection baked in the windows (render-mix semRefl)
  // 22/10 ITEM 12 (Victor: 'sempre sem reflexo do vidro quando desligado'): the lamp layers of the render carry the room reflected
  // in the window glass (porta-varanda at night, seen whenever Google's city is not over the window). The button now shows on every
  // point with a window (or the balcony glass) and OFF removes both reflections: Google's city in the balcony glass and the lamps'
  // reflection in the window pixels (render-mix.js semRefl).
  function botaoReflexo() { const p = PTS[pontoVisivel()]; bR.hidden = !((G && G.vidro) || !!(p && p.camadas && p.camadas.fora)); bR.setAttribute('aria-pressed', String(estado.reflexo !== false)); }
  container.appendChild(raiz);
  if (EMBUTIDO) raiz.style.touchAction = 'pan-y'; // ITEM 11: a vertical swipe scrolls the page, a sideways drag turns the 360, a pinch zooms
  { const b = raiz.querySelector('.t360-rot'); let tm = 0; b.addEventListener('click', (ev) => { ev.stopPropagation(); const ab = !b.classList.contains('aberto'); b.classList.toggle('aberto', ab); b.setAttribute('aria-expanded', String(ab)); clearTimeout(tm); if (ab) tm = setTimeout(() => { b.classList.remove('aberto'); b.setAttribute('aria-expanded', 'false'); }, 6000); }); }
  if (!document.getElementById('t360-css')) {
    const css = document.createElement('style'); css.id = 't360-css';
    css.textContent = `
    .t360{position:absolute;inset:0;overflow:hidden;background:#111;touch-action:none;user-select:none;font:14px/1.3 system-ui,sans-serif}
    .t360-cv{width:100%;height:100%;display:block;cursor:grab}
    .t360-cv.arrastando{cursor:grabbing}.t360-cv.alvo{cursor:pointer}
    .t360-rot{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);min-height:24px;padding:3px;border:0;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font:11px/1.3 system-ui,sans-serif;text-align:left;cursor:pointer}
    .t360-rot-i{flex:none;width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,.7);display:grid;place-items:center;font:italic 600 11px Georgia,serif}
    .t360-rot-txt{display:none;padding-right:8px}.t360-rot.aberto{border-radius:10px;background:rgba(0,0,0,.72)}.t360-rot.aberto .t360-rot-txt{display:block}
    .t360-luzes .l-curto{display:none}
    .t360-vista{position:absolute;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap}
    .t360-nome{position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff}
    .t360-luzes{position:absolute;right:12px;top:56px;display:flex;flex-direction:column;gap:6px}
    .t360-luzes button{padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.45);color:#fff;cursor:pointer}
    .t360-luzes button[aria-pressed="true"]{background:#f5c66b;color:#222;border-color:#f5c66b}
    .t360-chips{position:absolute;inset:0;pointer-events:none;z-index:4}
    .t360-chip{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(255,255,255,.65);background:rgba(16,18,17,.8);color:#fff;font:600 12.5px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}
    .t360-chip i{font-style:normal;font-size:14px;opacity:.85}
    .t360-aviso-sol{position:absolute;left:50%;top:104px;transform:translateX(-50%);width:max-content;max-width:min(86%,420px);padding:6px 10px;border-radius:10px;background:rgba(16,18,17,.78);color:#f4d48a;font:11.5px/1.3 system-ui,sans-serif;text-align:center;pointer-events:none;z-index:4}
    .t360-aviso-sol[hidden]{display:none}
    @media (max-width:760px){.t360-aviso-sol{top:200px}}
    .t360-fechar{position:absolute;right:12px;top:12px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:22px;cursor:pointer}`;
    document.head.appendChild(css);
  }
  const cv = raiz.querySelector('.t360-cv');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: teste });
  // GPU ran out of memory (black screen on Victor's M21s at 3072): this device goes one level down and the page reopens here
  // MANCHAS-360: the reload keeps the visit (season + hour via the app, point + view here); no tier left to step down = the
  // context comes back in place: every point is repainted from scratch with the CURRENT state (recuperaContexto)
  cv.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); if (rebaixar()) { guardaRetorno(); setTimeout(() => location.reload(), 300); } });
  cv.addEventListener('webglcontextrestored', () => { if (!fechado) recuperaContexto(); });
  renderer.setPixelRatio(Math.min(capacidade().dprMax, window.devicePixelRatio || 1)); // tier of this device (src/capacidade.js) // 07/10 Victor: full screen density on phones (max 3) // orq 07/10 08:4x: phones at real screen density (1.0 made a 390-px image stretched ~3x = blurry on Victor's phone); one sphere is cheap
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  // phones: 2048 px panoramas (GPU memory: 7 layers x 2 points); desktop: full 4096 when the GPU allows it
  const movel = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const larguraMax = Math.min(capacidade().larguraPano, renderer.capabilities.maxTextureSize); // 07/10 Victor: 4096 on phones too // phones full 3072 (07/10 08:3x: 2048 + narrow portrait view looked blurry on Victor's phone; the 08:0x 'crash' was the degraded test browser)

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
  let yaw = 0, pitch = 0, fov = (innerHeight > innerWidth ? 90 : 75); // portrait phones: wider vertical fov so the horizontal view is not a narrow zoomed slice // yaw 0 = looking at the balcony (+v)

  // ---------------------------------------------------------------- panorama spheres (one per visible point)
  const RAIO = 5;
  const esferas = new Map();
  function esfera(id) {
    if (esferas.has(id)) return esferas.get(id);
    const p = PTS[id];
    const geo = new THREE.SphereGeometry(RAIO, 96, 48); geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat); m.position.copy(paraMundo(p.pos)); m.visible = false; cena.add(m);
    const mix = new MisturaPonto(renderer, p, base, { larguraMax, SOL, unidade: final != null && numero != null ? { numero: String(numero), andar, final, torre } : null, finalRender: man.final ?? null, luzes: CENA.luzes, pufe: CENA.pufe });
    mix.pufeNoiteCena = CENA.pufe && CENA.pufe.noite; // S2: sun of THIS unit
    // 12-bit lamp low bits arrived (render-mix.js). 13/10 Victor (R2, rings at night in the kitchen): when they landed
    // during the walk to this point (estado.ponto still the old one; cached files land in < 600 ms) the repaint was
    // skipped and the 8-bit picture stayed until the next sun move. Now the point remembers it and repaints on arrival.
    // MANCHAS-360: 'this point' = the one on screen, i.e. the walk's destination while walking (pontoVisivel)
    mix.aoRefinar = () => { if (fechado) return; if (pontoVisivel() === id) repinta(); else e.refinar = true; };
    mix.refLuz = REF_LUZ; // R1: one fixed night white balance (the white kitchen light) for every point
    const e = { m, mix, pronto: null, refinar: false };
    esferas.set(id, e);
    return e;
  }
  // 21/10 MANCHAS-360 (Victor, unit 131, 'varanda' at 21h with the spots: blue / pink / green stains that never went away).
  // Measured cause: a change of hour / season / lamps that came DURING a walk repainted the point being LEFT (estado.ponto
  // changes only at the end of the walk) and the destination kept the picture of the state of the walk's start (09:00 = day
  // exposure 0.497 under a 21:00 bar, Google's day city in the glass); it was only repainted when 12-bit lamp bits landed.
  // Now: the point on screen is the destination while walking; every paint records the state it used (render-mix
  // ultimo.estado); at the end of a walk and after every paint the point on screen is compared with the CURRENT state and
  // repainted until they match. Google's window follows only the point on screen.
  let destino = null;
  const pontoVisivel = () => destino || estado.ponto;
  function emDia(e) {
    const u = e.mix.ultimo;
    if (!u || !u.estado || e.refinar) return false;
    const s = u.estado;
    return s.estacao === estado.estacao && s.minutos === estado.minutos && u.veu === VEU.fora.value && s.reflexo === (estado.reflexo !== false)
      && CENA.luzes.every((k) => !!s.luzes[k] === !!estado.luzes[k]);
  }
  async function pinta(id) {
    const e = esfera(id);
    e.refinar = false; // this paint reads whatever low bits are here now; a later arrival sets it again
    const tx = await e.mix.atualizar(estado); // one paint at a time per point, state read when it starts (render-mix)
    if (fechado || !tx) return e;
    e.m.material.map = tx; e.m.material.needsUpdate = true;
    if (id === pontoVisivel()) botaoReflexo();
    if (VG && id === pontoVisivel()) VG.aposPintar(id, e);
    if (G && id === pontoVisivel()) G.aposPintar(id, e);
    return e;
  }

  // ---------------------------------------------------------------- hotspots on the floor
  const grupoHot = new THREE.Group(); cena.add(grupoHot);
  const texHot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(64, 64, 40, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 59, 0, 7); g.stroke(); // RODADA 26/10: reads on a white wall too
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // MANCHAS-360: the floor rings are rebuilt on every walk; their geometry / material are freed (renderer.info: +1 geometry per
  // 2 walks before, measured with docs/b10-scripts/manchas_360.mjs)
  function limpaHot() { for (const m of grupoHot.children) { if (!m.isSprite) m.geometry.dispose(); m.material.dispose(); } grupoHot.clear(); } // a Sprite's geometry is three's shared one
  // RODADA 26/10 item 4 (Victor: 'de cada ponto as outras 2 bolas ficam visiveis sempre'): each neighbour is a ball facing the
  // camera, drawn on top of everything (behind the glass or a wall too: depthTest off, renderOrder 5) and never smaller than
  // BOLA_MIN CSS px on screen, however far (the 0.22 m floor ring of before was a thin ellipse a few px tall far away).
  const BOLA_M = 0.44, BOLA_MIN = 34;
  function ajustaHot() {
    const k = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (cv.clientHeight || 1); // metres per CSS px at 1 m
    for (const m of grupoHot.children) m.scale.setScalar(Math.max(BOLA_M, BOLA_MIN * k * camera.position.distanceTo(m.position)));
  }
  function montaHot() {
    limpaHot();
    const p = PTS[estado.ponto];
    for (const vid of p.vizinhos || []) {
      const q = PTS[vid]; if (!q) continue;
      const pos = paraMundo([q.pos[0], q.pos[1], 0.3]);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHot, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      m.position.copy(pos); m.userData.id = vid; m.renderOrder = 5; m.scale.setScalar(BOLA_M);
      grupoHot.add(m);
    }
  }

  // ---------------------------------------------------------------- camera + interaction
  function aplicaCam() {
    pitch = Math.max(-85, Math.min(85, pitch));
    const y = (yaw * Math.PI) / 180, x = (pitch * Math.PI) / 180;
    // yaw 0 -> -X (balcony); positive yaw turns right (toward -Z)
    const d = new THREE.Vector3(-Math.cos(x) * Math.cos(y), Math.sin(x), -Math.cos(x) * Math.sin(y));
    camera.fov = fov; camera.updateProjectionMatrix();
    camera.lookAt(camera.position.clone().add(d));
  }
  function redim() {
    const w = raiz.clientWidth || 1, h = raiz.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); desenha();
  }
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function hotEm(ev) {
    const r = cv.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(grupoHot.children, false)[0];
    return h ? h.object.userData.id : null;
  }
  let arr = null, moveu = 0; const toques = new Map(); let pinca = null;
  cv.addEventListener('pointerdown', (ev) => {
    cv.setPointerCapture(ev.pointerId); toques.set(ev.pointerId, [ev.clientX, ev.clientY]);
    arr = { x: ev.clientX, y: ev.clientY, yaw, pitch }; moveu = 0; cv.classList.add('arrastando');
    if (toques.size === 2) { const [a, b] = [...toques.values()]; pinca = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov }; }
  });
  cv.addEventListener('pointermove', (ev) => {
    if (toques.has(ev.pointerId)) toques.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinca && toques.size === 2) {
      const [a, b] = [...toques.values()]; fov = Math.max(35, Math.min(95, pinca.fov * pinca.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1]))));
      aplicaCam(); desenha(); return;
    }
    if (arr) {
      const k = fov / (cv.clientHeight || 600);
      moveu = Math.max(moveu, Math.hypot(ev.clientX - arr.x, ev.clientY - arr.y));
      yaw = arr.yaw - (ev.clientX - arr.x) * k; pitch = arr.pitch + (ev.clientY - arr.y) * k;
      aplicaCam(); desenha(); return;
    }
    cv.classList.toggle('alvo', !!hotEm(ev));
  });
  const solta = (ev) => {
    toques.delete(ev.pointerId); if (toques.size < 2) pinca = null;
    cv.classList.remove('arrastando');
    if (arr && moveu < 6) { const id = hotEm(ev); if (id) irPara(id); }
    arr = null;
  };
  cv.addEventListener('pointerup', solta); cv.addEventListener('pointercancel', solta);
  cv.addEventListener('wheel', (ev) => { if (EMBUTIDO && !ev.ctrlKey) return; /* ITEM 11: the page scrolls; zoom = Ctrl+wheel or pinch */ ev.preventDefault(); fov = Math.max(35, Math.min(95, fov + ev.deltaY * 0.05)); aplicaCam(); desenha(); }, { passive: false });

  // ---------------------------------------------------------------- draw
  const elVista = raiz.querySelector('.t360-vista');
  function desenha() {
    ajustaHot(); // RODADA 26/10 item 4
    if (G) G.antes();
    if (VG) VG.antes(camera, estado.ponto, andando, G);
    renderer.render(cena, camera);
    // "Vista simulada" tag anchored outside the balcony (direction +v, slightly up)
    const p = PTS[estado.ponto];
    const alvo = paraMundo([p.pos[0], p.pos[1] + 30, p.pos[2] + 2]);
    const v = alvo.clone().project(camera);
    const ok = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
    elVista.hidden = !ok || !!(G && G.malha.visible); // B10: with Google's city the credit pill replaces "Vista simulada"
    if (ok) { elVista.style.left = `${(v.x * 0.5 + 0.5) * 100}%`; elVista.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`; }
    atualizaChips();
  }

  // 15/10 FILA D4 (C defect 4): on phones the floor rings fell under the sun bar or were cut at the screen edge. Every
  // neighbour point whose ring is not tappable (behind the camera, < 24 px from an edge, or under a control over the
  // image) gets a chip just above the sun bar, with its name and the side it is on; a tap walks there (same as the ring).
  const chipsBox = raiz.querySelector('.t360-chips');
  const COBRE = ['#interior-sol', '#int-barra', '#interior-fechar', '.t360-luzes', '.t360-nome', '.int-luzes-barra', '.t360-rot', '.int-rodape', '#int-detalhes'];
  let chipsSig = '', chipsAtuais = [];
  const vC = new THREE.Vector3(), vF = new THREE.Vector3(), vD = new THREE.Vector3();
  function atualizaChips() {
    if (fechado) return;
    const r = cv.getBoundingClientRect();
    if (andando || !r.width) { if (chipsSig) { chipsSig = ''; chipsAtuais = []; chipsBox.replaceChildren(); } return; }
    const tampas = [];
    for (const s of COBRE) for (const el of document.querySelectorAll(s)) {
      if (el.hidden || el.offsetParent === null) continue;
      const q = el.getBoundingClientRect(); if (q.width && q.height) tampas.push(q);
    }
    const sol = document.querySelector('#interior-sol');
    let baseY = sol && sol.offsetParent !== null && sol.getBoundingClientRect().height ? sol.getBoundingClientRect().top - 10 : r.bottom - 20;
    for (const d of document.querySelectorAll('#interior-sol .sol-dica')) if (!d.hidden && d.offsetParent !== null) baseY = Math.min(baseY, d.getBoundingClientRect().top - 6); // the 'segure' hint sits above the bar
    { const ri = raiz.querySelector('.t360-rot'); if (ri && ri.offsetParent !== null) { const q = ri.getBoundingClientRect(); if (q.bottom > baseY - 40) baseY = Math.min(baseY, q.top - 6); } } // and the 'i' of the image
    camera.getWorldDirection(vF); vF.y = 0; vF.normalize();
    const precisa = [], aneis = [];
    for (const m of grupoHot.children) {
      vC.copy(m.position).project(camera);
      const x = r.left + (vC.x * 0.5 + 0.5) * r.width, y = r.top + (-vC.y * 0.5 + 0.5) * r.height, R2 = 22;
      const naTela = vC.z < 1 && x > r.left + 24 && x < r.right - 24 && y > r.top + 24 && y < r.bottom - 24;
      const tapado = tampas.some((q) => x + R2 > q.left && x - R2 < q.right && y + R2 > q.top && y - R2 < q.bottom);
      if (naTela && !tapado) { aneis.push([x - r.left, y]); continue; }
      vD.copy(m.position).sub(camera.position); vD.y = 0;
      const ang = THREE.MathUtils.radToDeg(Math.atan2(vD.x * -vF.z + vD.z * vF.x, vD.x * vF.x + vD.z * vF.z)); // + = to the right
      precisa.push({ id: m.userData.id, ang });
    }
    precisa.sort((a, b) => a.ang - b.ang);
    const meiaFov = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect));
    // 16/10 AC4 (ensaio G/H): the layout assumed every chip 120 px wide; "Porta da varanda" is ~143 px, so from the balcony
    // its chip was pushed 4 px past the right edge of a 390 px phone and the check (and a thumb on the edge) missed it.
    // Each chip now uses its MEASURED width (per point, measured once off-screen) for the clamp, the spacing and the packing.
    const W = r.width;
    let fimAnt = -1e9;
    const lista = precisa.map((c) => {
      const w = largChip(c.id);
      let x = Math.abs(c.ang) < meiaFov ? W / 2 + (c.ang / meiaFov) * (W / 2) : (c.ang < 0 ? 0 : W);
      x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x));
      if (x - w / 2 < fimAnt + 6) x = fimAnt + 6 + w / 2;
      fimAnt = x + w / 2;
      return { ...c, x, w, seta: c.ang < -12 ? '←' : c.ang > 12 ? '→' : '↓' };
    });
    // too many for one row: keep them inside the screen, packed from the right edge back
    for (let k = lista.length - 1, lim = W - 8; k >= 0; k--) { if (lista[k].x + lista[k].w / 2 > lim) lista[k].x = lim - lista[k].w / 2; lim = lista[k].x - lista[k].w / 2 - 6; }
    // a chip never sits on a ring that can be tapped: the chip row moves above it
    for (const c of lista) for (const [ax, ay] of aneis) if (Math.abs(c.x - ax) < c.w / 2 + 22 && ay > baseY - 36 - 22 && ay < baseY + 22) baseY = Math.min(baseY, ay - 28);
    const sig = lista.map((c) => c.id + ':' + Math.round(c.x / 8) + c.seta).join('|') + '@' + Math.round(baseY);
    if (sig === chipsSig) return;
    chipsSig = sig; chipsAtuais = lista.map((c) => ({ id: c.id, x: r.left + c.x, y: baseY }));
    chipsBox.replaceChildren(...lista.map((c) => {
      const b = criaChip(c.id, c.seta);
      b.style.left = c.x + 'px'; b.style.top = (baseY - r.top) + 'px';
      b.addEventListener('click', (ev) => { ev.stopPropagation(); irPara(c.id); });
      return b;
    }));
  }
  function criaChip(id, seta) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 't360-chip'; b.dataset.id = id;
    const i = document.createElement('i'); i.textContent = seta; i.setAttribute('aria-hidden', 'true');
    b.append(...(seta === '→' ? [PTS[id].nome, i] : [i, PTS[id].nome]));
    b.setAttribute('aria-label', 'Ir para ' + PTS[id].nome);
    return b;
  }
  const largChips = new Map();
  function largChip(id) { // CSS px of the chip of this point (the 3 arrows have about the same width; +2 px of margin)
    let w = largChips.get(id);
    if (w) return w;
    const b = criaChip(id, '→'); b.style.visibility = 'hidden'; b.style.left = '-1000px'; chipsBox.append(b);
    w = Math.ceil(b.getBoundingClientRect().width) + 2; b.remove();
    if (!(w > 2)) return 120; // not laid out yet (hidden tour): old fixed width, measured again next time
    largChips.set(id, w); return w;
  }

  // ---------------------------------------------------------------- walking between points
  // ITEM 10 (22/10): arrival view per point, manifest cena.chegada = { <point>: [yaw, pitch, fov?] } (yaw 0 = balcony, + = right);
  // only in embedded mode (&embutido=1) or with ?chegada=1 (tests). Before: the view direction was kept from point to point
  // ('meio' opened looking at the ceiling and the glass).
  function chegadaDe(id) { const c = (EMBUTIDO || /[?&]chegada=1/.test(location.search)) && CENA.chegada && CENA.chegada[id]; return Array.isArray(c) && c.length >= 2 ? c.map(Number) : null; }
  let andando = null;
  async function irPara(id, { dur = 600 } = {}) {
    if (!PTS[id] || id === estado.ponto || andando) return andando;
    destino = id; // MANCHAS-360: from now on a change of hour / lamps repaints THIS point (repinta / aoRefinar)
    andando = (async () => {
      const de = esfera(estado.ponto), para = await pinta(id);
      if (fechado) return;
      para.m.visible = true; para.m.material.opacity = 0; para.m.renderOrder = 1; de.m.renderOrder = 0;
      limpaHot();
      const p0 = paraMundo(PTS[estado.ponto].pos), p1 = paraMundo(PTS[id].pos);
      const ch = chegadaDe(id), y0 = yaw, pi0 = pitch, f0 = fov; // ITEM 10
      const dy = ch ? ((((ch[0] - y0) % 360) + 540) % 360) - 180 : 0; // shortest turn
      const t0 = performance.now();
      await new Promise((ok) => {
        const passo = (t) => {
          const k = Math.min(1, (t - t0) / dur), s = k * k * (3 - 2 * k);
          camera.position.lerpVectors(p0, p1, s);
          if (ch) { yaw = y0 + dy * s; pitch = pi0 + (ch[1] - pi0) * s; if (ch[2]) fov = f0 + (ch[2] - f0) * s; }
          para.m.material.opacity = s; de.m.material.opacity = 1;
          aplicaCam(); desenha();
          if (k < 1) requestAnimationFrame(passo); else ok();
        };
        requestAnimationFrame(passo);
      });
      if (fechado) return;
      de.m.visible = false; para.m.material.opacity = 1;
      estado.ponto = id; destino = null; raiz.querySelector('.t360-nome').textContent = PTS[id].nome;
      // (B1) release the layers of the point we left (queued after any paint of it still in flight, render-mix)
      if (de !== para) de.mix.soltarCamadas();
      andando = null; // before the last frame: Google's window view only draws/loads when not walking (Victor 08/10: the city only loaded after moving the camera)
      montaHot(); desenha();
      // MANCHAS-360: the point we arrived at must show the CURRENT state (hour / season / lamps changed during the walk, or
      // the 12-bit low bits landed, R2); repinta() checks it again after each paint, so no race can leave an old picture
      if (!emDia(para)) repinta(); else avisoSol(para);
    })();
    // a failed walk (layer fetch error) never leaves the tour locked in 'walking' (before: every later tap was ignored)
    const esta = andando;
    esta.catch((err) => console.warn('tour360: caminhada falhou', err && err.message)).finally(() => { if (andando === esta) andando = null; if (destino === id) destino = null; });
    return andando;
  }

  // (B1) the sun bar fires many changes: one repaint at a time, latest state wins (no pile of concurrent decodes)
  // MANCHAS-360: it paints the point ON SCREEN (the destination while walking) and loops until that point's picture was
  // made with the current state (a change that lands while a paint is in flight is never lost)
  let pintando = null, pendente = false;
  async function repinta() {
    if (fechado) return null;
    if (pintando) { pendente = true; return pintando; }
    pintando = (async () => {
      let semPedido = 0;
      while (!fechado) {
        pendente = false;
        const alvo = pontoVisivel();
        const e = await pinta(alvo);
        if (fechado) break;
        if (alvo === estado.ponto && !andando) { e.m.visible = true; avisoSol(e); }
        desenha();
        if (pendente) continue; // a newer change arrived during this paint: always painted
        if (emDia(esfera(pontoVisivel()))) break;
        if (++semPedido >= 3) break; // (never seen) guard against a point that cannot reach the state
      }
    })().finally(() => { pintando = null; });
    return pintando;
  }
  // MANCHAS-360: record for the context-loss reload (see retorno360)
  function guardaRetorno() {
    if (numero == null) return;
    try { sessionStorage.setItem(CHAVE_RETORNO, JSON.stringify({ numero: String(numero), estacao: estado.estacao, minutos: estado.minutos, ponto: estado.ponto, yaw, pitch, fov, t: Date.now() })); } catch (e) { /* no storage: the visit restarts */ }
  }
  // context restored in place: every GPU object is new and the layer textures dropped their CPU copy (render-mix), so every
  // point fetches its layers again (HTTP cache) and the point on screen is repainted with the current state. Google's
  // overlay is not restarted (it would be one more Google session): our render's city shows in the window.
  function recuperaContexto() {
    if (G) { try { G.liberar(); } catch (e) { /* ignore */ } G = null; window.__g3dVista = null; }
    VEU.fora.value = 0;
    for (const e of esferas.values()) { e.mix.esquecerCamadas(); e.refinar = true; }
    repinta();
  }
  // S2 (15/10): another facade than the render's and the card says the balcony has sun now -> say so instead of faking it
  function avisoSol(e) { const a = raiz.querySelector('.t360-aviso-sol'); if (a) a.hidden = !(e.mix.outraFace() && e.mix.cvAgora(estado.estacao, estado.minutos) > 0.5); }
  function marcaLuzes() { raiz.querySelectorAll('[data-luz]').forEach((b) => b.setAttribute('aria-pressed', String(!!estado.luzes[b.dataset.luz]))); }
  raiz.querySelectorAll('[data-luz]').forEach((b) => b.addEventListener('click', () => { estado.luzes[b.dataset.luz] = !estado.luzes[b.dataset.luz]; guardaLuzesCliente(estado.luzes); marcaLuzes(); repinta(); }));
  function luzesPelaHora() { if (!luzesDoCliente()) { estado.luzes = luzesAuto(estado.estacao, estado.minutos); marcaLuzes(); } } // D18c: untouched = follow the hour
  let fechado = false;
  function fechar(chamaCb = true) {
    if (fechado) return; fechado = true;
    if (VG) { try { VG.liberar(); } catch (e) { /* ignore */ } VG = null; }
    if (G) { try { G.liberar(); } catch (e) { /* ignore */ } G = null; }
    for (const e of esferas.values()) { e.mix.liberar(); e.m.geometry.dispose(); e.m.material.dispose(); }
    renderer.dispose(); raiz.remove(); window.removeEventListener('resize', redim); chipsBox.replaceChildren();
    if (atual && atual.raiz === raiz) atual = null;
    if (chamaCb && aoFechar) aoFechar();
  }
  raiz.querySelector('.t360-fechar').addEventListener('click', () => fechar(true));
  window.addEventListener('resize', redim);

  // ---------------------------------------------------------------- B10: Google 3D Tiles behind the window mask (on by default, ?google3d=0 off; key from src/g3d-chave.js)
  // Where the point's `fora` mask is white the city is drawn from Google's tiles with a camera at the panorama's real position
  // (manifest `geo`: lat, lon, h ellipsoid, rumo = bearing of the pano centre). The panorama sphere stays untouched underneath,
  // so any failure (no key, quota, error, trial ended) just removes the overlay and the current look remains, silently.
  // geodetic eye of any point: its own `geo`, else derived from a reference point that has one (same unit plan, so the
  // offset is the [u, v, h] difference turned by the bearing: +v = rumo, +u = rumo - 90 deg, as in paraMundo/dirParaL)
  let geoPredio = null; // dados/google-geo.json: eye of any unit (final + floor) in the registered B5 frame
  const raio = (lat) => { const la = (lat * Math.PI) / 180, a = 6378137, e2 = 0.00669437999014, w = Math.sqrt(1 - e2 * Math.sin(la) ** 2); return { M: (a * (1 - e2)) / w ** 3, N: a / w, la }; };
  function geoDaUnidade(p) {
    const G0 = geoPredio, f = G0 && G0.finais[String(final ?? G0.padrao.final)];
    if (!f || !p.pos) return null;
    const [u, v, hp] = p.pos, x = f.M[0] * u + f.M[1] * v + f.t[0], z = f.M[2] * u + f.M[3] * v + f.t[1];
    const y = G0.laje_1 + ((andar ?? G0.padrao.andar) - 1) * G0.piso + hp;
    const o = G0.origem, b = (o.rumoX * Math.PI) / 180, E = x * Math.sin(b) + z * Math.cos(b), Nn = x * Math.cos(b) - z * Math.sin(b), r = raio(o.lat);
    return { lat: o.lat + (Nn / r.M) * (180 / Math.PI), lon: o.lon + (E / (r.N * Math.cos(r.la))) * (180 / Math.PI), h: o.h + y, rumo: f.rumo, porUnidade: true, ajuste: G0.ajuste };
  }
  function geoDoPonto(id) {
    const p = PTS[id];
    const gu = geoDaUnidade(p); if (gu) return gu;
    if (p.geo) return p.geo;
    const ref = Object.values(PTS).find((q) => q.geo && q.pos) || (man.geo && man.geo.pos ? { geo: man.geo, pos: man.geo.pos } : null);
    if (!ref || !p.pos) return null;
    const g = ref.geo, b = (g.rumo * Math.PI) / 180, du = p.pos[0] - ref.pos[0], dv = p.pos[1] - ref.pos[1], dh = p.pos[2] - ref.pos[2];
    const E = Math.sin(b) * dv - Math.cos(b) * du, Nn = Math.cos(b) * dv + Math.sin(b) * du;
    const la = (g.lat * Math.PI) / 180, a = 6378137, e2 = 0.00669437999014, w = Math.sqrt(1 - e2 * Math.sin(la) ** 2);
    const M = (a * (1 - e2)) / w ** 3, Nr = a / w;
    return { ...g, lat: g.lat + (Nn / M) * (180 / Math.PI), lon: g.lon + (E / (Nr * Math.cos(la))) * (180 / Math.PI), h: g.h + dh };
  }
  async function ligaGoogle() {
    if (/[?&]google3d=0/.test(location.search)) return; // on by default (no key = silently off)
    try {
      const gm = await import('./google-vista.js');
      try { geoPredio = (await import('./google-geo.js')).GEO_PREDIO; } catch (e) { /* per-point geo only */ }
      const sess = await gm.iniciarGoogle();
      if (!sess || fechado) { semGoogle(); return; }
      const vista = new gm.VistaGoogle(renderer, sess, { lat: 0, lon: 0, h: 0, rumo: 0 }, () => desenha());
      const mat = gm.materialSobreposicao();
      const geo = new THREE.SphereGeometry(RAIO, 96, 48); geo.scale(-1, 1, 1);
      const malha = new THREE.Mesh(geo, mat); malha.renderOrder = 3; malha.visible = false; malha.frustumCulled = false; cena.add(malha);
      const st = document.createElement('style'); st.id = 't360-g3d-css';
      st.textContent = '.t360-g3d{position:absolute;right:10px;bottom:78px;max-width:calc(100% - 20px);pointer-events:none;overflow:visible}.t360-g3d[hidden]{display:none}@media (max-width:760px){.t360-g3d{top:92px;bottom:auto!important}.t360-g3d-carga{top:92px;bottom:auto!important;width:130px!important}}.t360-g3d-carga{position:absolute;left:12px;bottom:78px;width:160px;display:flex;flex-direction:column;gap:3px;padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:10px/1.2 system-ui,sans-serif;pointer-events:none}.t360-g3d-carga[hidden]{display:none}.t360-g3d-carga i{display:block;height:2px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}.t360-g3d-carga b{display:block;height:100%;width:4%;background:#fff;transition:width .4s ease}';
      document.head.appendChild(st); raiz.appendChild(vista.credito); raiz.appendChild(vista.carga);
      const dir = new THREE.Vector3(), tam = new THREE.Vector2(), perf = { n: 0, ms: 0, max: 0 }, camV = new THREE.PerspectiveCamera();
      let atual = null, falhou = false;
      G = {
        vista, malha, perf, gm,
        ativoEm: (id) => !falhou && !!(PTS[id].camadas && PTS[id].camadas.fora) && !!geoDoPonto(id),
        aposPintar(id, e) {
          if (!this.ativoEm(id)) return;
          // 21/10 SACADA-GOOGLE-JA: a new point waits for ITS view (haze of the hour meanwhile, render-mix VEU); before, the 'ready'
          // of the first point carried over and the balcony showed Google's coarse root tiles (melted blobs) for seconds
          if (atual !== null && atual !== id && !gm.MODO_FOTO) { vista.pronto = false; vista._lote = null; vista._quieto = 0; }
          const g0 = geoDoPonto(id);
          // follows the unit the client opened: final (side, xy, bearing) + floor from dados/google-geo.json; old per-point geo as fallback
          const g = g0.porUnidade ? g0 : { ...g0, h: g0.h + (andar != null && g0.andar_ref != null ? (andar - g0.andar_ref) * (g0.por_andar || 2.81) : 0) };
          // switching points inside the unit keeps Google's window on (the tiles are already here: no 'reload' look)
          vista.ref = { ...g, ajuste: window.__g3dAjuste || g.ajuste }; vista.unidadeChave = andar != null && final != null ? `${andar}-${final}` : null;
          vista.ligaNaCena();
          mat.uniforms.tM.value = e.mix.mat.uniforms.tFora.value;
          mat.uniforms.tPano.value = e.m.material.map; mat.uniforms.panoSrgb.value = e.mix.mat.uniforms.srgb.value;
          vista.definirMascara(mat.uniforms.tM.value && mat.uniforms.tM.value.image);
          const el = e.mix.ultimo && e.mix.ultimo.sol ? e.mix.ultimo.sol.el : 20;
          // the time-of-day grade + night windows live in the tile shaders (shared with the outside view); here only the
          // brightness match of the window (city behind glass ~1.35x, as before)
          sess.definirLuz(el); mat.uniforms.ganho.value.setScalar((window.__g3dGanho && window.__g3dGanho.dia) || 1.35);
          { const Gr = gm.gradeGoogle(el); mat.uniforms.ombro.value.set(Gr.joelho, Gr.w); if (window.__g3d) window.__g3d.ganhoJanela = mat.uniforms.ganho.value.x; } // C7 21/10: highlight shoulder after the gain, by day only
          { const c = gm.ceuParaSol(el); mat.uniforms.ceuTopo.value.set(...c.topo); mat.uniforms.ceuHoriz.value.set(...c.horiz); } // sky of the hour in the window
          this.el = el; // night (sun below -2 deg): the window shows our render's night city, not Google's day photos
          // 08/10 glass reflection (varanda looking in): mask of this point's facade glass, if it has one
          const cv = PTS[id].camadas && PTS[id].camadas.vidro; mat.uniforms.usaVidro.value = 0; this.vidro = false; botaoReflexo();
          { const t = Math.min(1, Math.max(0, (el + 2) / 10)); mat.uniforms.kDiaV.value = cv && cv.sem_reflexo ? 1 : t * t * (3 - 2 * t); } // 12/10: panorama rendered without the baked reflection -> real glass: interior x (1 - R) + R x city, day and night
          if (cv && cv.arq) { if (!this.vidros) this.vidros = new Map(); // own loader: the layer LRU of render-mix may dispose textures
            if (!this.vidros.has(cv.arq)) this.vidros.set(cv.arq, new Promise((ok) => new THREE.TextureLoader().load(e.mix.base + cv.arq, (t) => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; ok(t); }, undefined, () => ok(null))));
            this.vidros.get(cv.arq).then((tx) => { if (!tx || atual !== id) return; mat.uniforms.tV.value = tx; vista.definirVidro(tx.image); mat.uniforms.usaVidro.value = estado.reflexo === false ? 0 : 1; this.vidro = true; botaoReflexo(); vista.acordar(); desenha(); }); }
          // R3a 13/10: balcony box of this point (manifest vidro.caixa = [back, floor, left, front, ceiling, right] m around the eye)
          mat.uniforms.usaCaixa.value = cv && Array.isArray(cv.caixa) ? 1 : 0;
          if (cv && Array.isArray(cv.caixa)) { mat.uniforms.caixaMin.value.set(cv.caixa[0], cv.caixa[1], cv.caixa[2]); mat.uniforms.caixaMax.value.set(cv.caixa[3], cv.caixa[4], cv.caixa[5]); }
          atual = id;
        },
        antes() {
          if (gm.MODO_FOTO) return this.antesFoto();
          let mostrar = !andando && !falhou && atual === estado.ponto && this.ativoEm(estado.ponto);
          // no window on screen (looking at a wall): no city to draw and nothing to download
          let janela = null, vidroTela = null;
          if (mostrar) {
            camera.updateMatrixWorld(true); janela = vista.janelaNaTela(camera);
            mat.uniforms.espelho.value = 0; mat.uniforms.temJanela.value = 1;
            // R3b 13/10 (Victor: the reflection vanished at some angles with the glass still on screen): the mirror is drawn
            // whenever the GLASS is on screen; with the window on screen too, both views are drawn (tG + tGV)
            vidroTela = this.vidro && mat.uniforms.usaVidro.value > 0.5 ? vista.vidroNaTela(camera) : null;
            if (!janela && vidroTela) janela = { x0: -1, y0: -1, x1: 1, y1: 1, espelho: true }; // looking into the flat from the balcony: the glass reflects the city
            if (!janela) {
              // looking at the room, not the window: keep downloading the window view (yaw 0 of this point), nothing drawn
              mostrar = false; malha.visible = false; vista.credito.hidden = true;
              camV.position.copy(camera.position); camV.fov = camera.fov; camV.aspect = camera.aspect; camV.updateProjectionMatrix();
              camV.lookAt(camV.position.x - 1, camV.position.y, camV.position.z); camV.updateMatrixWorld(true);
              const jv = vista.janelaNaTela(camV);
              if (jv) { try { renderer.getDrawingBufferSize(tam); vista.tamanho(tam.x, tam.y, Math.min(1, renderer.capabilities.maxTextureSize / Math.max(tam.x, tam.y))); camV.getWorldDirection(dir); vista.desenha(dir, camV.fov, camV.aspect, jv, true); } catch (e) { /* ignore */ } }
              return;
            }
          }
          malha.visible = mostrar; vista.credito.hidden = !mostrar;
          if (!mostrar) return;
          try {
            const t0 = performance.now();
            renderer.getDrawingBufferSize(tam);
            const k = Math.min(1, renderer.capabilities.maxTextureSize / Math.max(tam.x, tam.y)); // full drawing-buffer resolution at device dpr, no phone downgrade
            vista.tamanho(tam.x, tam.y, k);
            camera.updateMatrixWorld(true); camera.getWorldDirection(dir);
            malha.position.copy(camera.position);
            let dirV = null;
            if (janela.espelho) { dir.x = -dir.x; mat.uniforms.espelho.value = 1; mat.uniforms.temJanela.value = 0; } // mirrored across the facade (forward = -x flips); the shader flips the image back
            else if (vidroTela) { dirV = dir.clone(); dirV.x = -dirV.x; mat.uniforms.espelho.value = 1; } // window AND glass on screen
            vista.desenha(dir, camera.fov, camera.aspect, janela, false, dirV);
            mat.uniforms.tGV.value = dirV && vista.rtV ? vista.rtV.texture : vista.rt.texture;
            vista.progresso(true);
            const op = vista.opacidade(); mat.uniforms.forca.value = op; if (op < 1) vista.acordar(); // keep frames coming during the fade
            vista.credito.hidden = op <= 0; // the credit shows only while Google's city is on screen
            // credit + progress sit just above the image caption (the sun bar below would hide them)
            if ((perf.n & 31) === 0) { const rot = raiz.querySelector('.t360-rot'); const topo = Math.min(rot && rot.offsetParent ? rot.getBoundingClientRect().top : innerHeight - 120, ...[...raiz.querySelectorAll('.t360-chip')].map((c) => c.getBoundingClientRect().top)); /* 15/10: the Google credit never under a chip */ const bb = Math.max(78, Math.round(raiz.getBoundingClientRect().bottom - topo + 6)) + 'px'; vista.credito.style.bottom = bb; vista.carga.style.bottom = bb; }
            mat.uniforms.tG.value = vista.rt.texture; mat.uniforms.res.value.copy(tam);
            const dt = performance.now() - t0; perf.n++; perf.ms += dt; perf.max = Math.max(perf.max, dt);
            if (window.__g3d && window.__g3d.erro && /403|429|quota|key|denied|permission/i.test(window.__g3d.erro)) throw new Error(window.__g3d.erro);
          } catch (err) { falhou = true; semGoogle(); malha.visible = false; vista.credito.hidden = true; try { vista.liberar(); } catch (e2) { /* ignore */ } console.warn('google3d desligado', err && err.message); }
        },
        // photo mode (phones, 08/10): the window view is shot once per point (cube), then turning only shows that picture
        antesFoto() {
          const ok = !falhou && atual === estado.ponto && this.ativoEm(estado.ponto);
          if (!ok) { malha.visible = false; vista.credito.hidden = true; vista.progressoFoto(false); return; }
          try {
            vista.passoFoto();
            camera.updateMatrixWorld(true); const janela = vista.janelaNaTela(camera);
            const ve = (!!janela || this.vidro) && !andando; // the balcony glass reflects the picture too
            malha.visible = ve && vista.pronto; malha.position.copy(camera.position); mat.uniforms.espelho.value = 0; mat.uniforms.temJanela.value = 1;
            mat.uniforms.usaCubo.value = 1; { const F = vista.foto, U = mat.uniforms; U.nF.value = F.alvos.length; U.nOk.value = F.feito ? F.alvos.length : F.i;
              F.alvos.forEach((a, k) => { U['fA' + k].value = a.A.texture; U['fW' + k].value = a.W.texture; U.fM.value[k].copy(F.mats[k]); }); }
            { const L = gm.luzDaCidade(this.el), Gr = gm.gradeGoogle(this.el); mat.uniforms.luzBase.value.set(...L.base); mat.uniforms.luzesN.value = L.luzes; mat.uniforms.gradeF.value.set(Gr.expo, Gr.contraste, Gr.sat, Gr.pivo); mat.uniforms.ombro.value.set(Gr.joelho, Gr.w); } // hour of the day on the picture (C7: + day grade)
            mat.uniforms.rumoB.value = ((vista.ref.rumo + ((vista.ref.ajuste && vista.ref.ajuste.rumo) || 0)) * Math.PI) / 180;
            vista.progressoFoto(true); // the bar stays while the picture is being made, wherever the visitor looks (Victor 08/10)
            const op = vista.opacidade(); mat.uniforms.forca.value = op; if (op < 1 && malha.visible) vista.acordar();
            vista.credito.hidden = !malha.visible || op <= 0;
            if ((perf.n++ & 31) === 0) { const rot = raiz.querySelector('.t360-rot'); const topo = Math.min(rot && rot.offsetParent ? rot.getBoundingClientRect().top : innerHeight - 120, ...[...raiz.querySelectorAll('.t360-chip')].map((c) => c.getBoundingClientRect().top)); /* 15/10: the Google credit never under a chip */ const bb = Math.max(78, Math.round(raiz.getBoundingClientRect().bottom - topo + 6)) + 'px'; vista.credito.style.bottom = bb; vista.carga.style.bottom = bb; }
            if (window.__g3d && window.__g3d.erro && /403|429|quota|key|denied|permission/i.test(window.__g3d.erro)) throw new Error(window.__g3d.erro);
          } catch (err) { falhou = true; semGoogle(); malha.visible = false; vista.credito.hidden = true; try { vista.liberar(); } catch (e2) { /* ignore */ } console.warn('google3d desligado', err && err.message); }
        },
        liberar() { malha.geometry.dispose(); mat.dispose(); cena.remove(malha); vista.liberar(); if (this.vidros) for (const p of this.vidros.values()) p.then((t) => t && t.dispose()); },
      };
      window.__g3dVista = G;
      G.aposPintar(estado.ponto, esfera(estado.ponto));
      vista.acordar();
      desenha();
    } catch (err) { G = null; semGoogle(); console.warn('google3d indisponivel', err && err.message); }
  }
  // 21/10 SACADA-GOOGLE-JA: Google off / failed -> our render's city back in the window (the haze was only a wait for Google)
  function semGoogle() { if (VEU.fora.value) { VEU.fora.value = 0; if (!fechado) repinta(); } }

  // ---------------------------------------------------------------- API (MANCHAS-360: built and registered BEFORE the first paint)
  const api = {
    definirHora: (m) => { estado.minutos = m; luzesPelaHora(); return repinta(); },
    definirEstacao: (e) => { estado.estacao = e; luzesPelaHora(); return repinta(); },
    definirLuz: (n, l) => { estado.luzes[n] = !!l; marcaLuzes(); return repinta(); },
    irPara,
    olhar: (y, p = 0, f = fov) => { yaw = y; pitch = p; fov = f; aplicaCam(); desenha(); },
    // screen position (CSS px, relative to the canvas) of the floor spots in view, for tests and tooltips
    hotspots: () => { const r = cv.getBoundingClientRect(); return grupoHot.children.map((m) => { const v = m.position.clone().project(camera);
      const px = m.scale.x / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (cv.clientHeight || 1) * camera.position.distanceTo(m.position)); // on-screen diameter
      return { id: m.userData.id, x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visivel: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, px: Math.round(px) }; }); },
    cursor: () => cv.className,
    chips: () => chipsAtuais.slice(), // D4: neighbours reachable by a chip (rings not tappable from this view)
    // MANCHAS-360: `pintado` = the state the picture on screen was made with (render-mix ultimo.estado) and `emDia` = it is the
    // current one (tests: docs/b10-scripts/manchas_360.mjs)
    estado: () => { const e = esfera(estado.ponto), u = e.mix.ultimo;
      return { ...estado, luzes: { ...estado.luzes }, yaw, pitch, fov, expo: u?.expo, lG: u?.lG, andando: !!andando,
        pintado: u && u.estado ? { ...u.estado, luzes: { ...u.estado.luzes }, veu: u.veu, el: u.sol && Number.isFinite(u.sol.el) ? +u.sol.el.toFixed(2) : null, bits12: u.bits12, bits8: u.bits8 } : null, emDia: emDia(e),
        google: G ? { ...(window.__g3d || {}), ms: G.perf.n ? G.perf.ms / G.perf.n : 0, max: G.perf.max, n: G.perf.n } : null }; },
    fechar: () => fechar(true),
    renderer,
  };
  const alca = { api, fechar, raiz };
  if (registrar) registrar(alca);

  // ---------------------------------------------------------------- start
  camera.position.copy(paraMundo(PTS[estado.ponto].pos));
  if (volta && volta.ponto === estado.ponto) { yaw = +volta.yaw || 0; pitch = +volta.pitch || 0; fov = +volta.fov || fov; } // context-loss reload: same view
  else { const ch = chegadaDe(estado.ponto); if (ch) { yaw = ch[0]; pitch = ch[1]; if (ch[2]) fov = ch[2]; } } // ITEM 10: first view of the visit
  raiz.querySelector('.t360-nome').textContent = PTS[estado.ponto].nome;
  aplicaCam(); redim(); marcaLuzes();
  // 21/10 SACADA-GOOGLE-JA: from the very first frame the window waits for Google's city with the haze of the hour (no swap of
  // our render's city for Google's); Google starts loading right below (ligaGoogle), with no gesture needed
  VEU.fora.value = /[?&]google3d=0/.test(location.search) ? 0 : 1;
  if (VEU.fora.value && !/[?&]vistagerada=0/.test(location.search)) criarVistaGerada({ cena, PTS, andar, final, RAIO, modo: 'espera', renderer }).then((v) => { // not awaited: never delays the 360
    if (!v) return; if (fechado) { v.liberar(); return; } VG = v; raiz.appendChild(v.credito); VG.aposPintar(pontoVisivel(), esfera(pontoVisivel())); desenha();
  }).catch(() => { VG = null; });
  await repinta(); if (fechado) return alca;
  montaHot(); desenha();
  await ligaGoogle(); if (fechado) return alca;
  raiz.dataset.ready = '1';
  if (/[?&]debug360=1/.test(location.search)) { // (B1) device report for Victor's screenshot
    const d = document.createElement('pre');
    d.style.cssText = 'position:absolute;left:8px;top:240px;z-index:50;margin:0;padding:6px 8px;font:11px/1.35 monospace;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:80%';
    const atualizaDbg = () => { d.textContent = `WebGL ${INFO.webgl} · RT float: ${INFO.rtFloat ? 'sim' : 'NAO (8 bits, sRGB)'}
maxTextureSize ${INFO.maxTex} · larguraMax ${larguraMax}
texturas enviadas: ${[...INFO.tamanhos].join(', ')}
decodificador: ${INFO.decodificador} · dpr ${renderer.getPixelRatio()}
${navigator.userAgent.slice(0, 120)}`; };
    atualizaDbg(); setInterval(atualizaDbg, 2000); raiz.appendChild(d);
  }

  return alca;
}
