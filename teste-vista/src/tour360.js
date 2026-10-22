import { capacidade, rebaixar } from "./capacidade.js";
import { chaveLocal } from "./predio.js";
import * as THREE from "three";
import { SOL } from "./dados-sol.js";
import { MisturaPonto, ROTULO, INFO, VEU } from "./render-mix.js";
import { solNoInstante } from "./interior-sol.js";
import { criarVistaGerada } from "./vista-gerada.js"; // E0 21/10: generated window view (prototype)
let atual = null;
async function abrirTour360(opts) {
  if (atual) atual.fechar(false);
  atual = await criar(opts);
  return atual.api;
}
function definirHora(m) {
  atual?.api.definirHora(m);
}
function definirEstacao(e) {
  atual?.api.definirEstacao(e);
}
function definirLuz(n, l) {
  atual?.api.definirLuz(n, l);
}
function irPara(id) {
  return atual?.api.irPara(id);
}
function estadoTour360() {
  return atual ? atual.api.estado() : null;
}
function fecharTour360() {
  atual?.fechar(true);
}
let CENA = { luzes: [], nomesLuz: {}, curtoLuz: {}, luzesNoite: [], inicio: null, refLuz: null, pufe: {} };
const paraMundo = ([u, v, h]) => new THREE.Vector3(-v, h, u);
const CHAVE_LUZES = chaveLocal("tabela3d-luzes-cliente");
let luzesMemoria = null;
function luzesDoCliente() {
  try {
    const o = JSON.parse(sessionStorage.getItem(CHAVE_LUZES) || "null");
    if (o && typeof o === "object") return o;
  } catch (e) {
  }
  return luzesMemoria;
}
function guardaLuzesCliente(l) {
  luzesMemoria = { ...l };
  try {
    sessionStorage.setItem(CHAVE_LUZES, JSON.stringify(luzesMemoria));
  } catch (e) {
  }
}
function luzesAuto(estacao, minutos) {
  let el = -12;
  try {
    const s = solNoInstante(SOL, estacao, minutos);
    if (Number.isFinite(s.el)) el = s.el;
  } catch (e) {
  }
  return Object.fromEntries(CENA.luzes.map((k) => [k, el < -2 && CENA.luzesNoite.includes(k)]));
}
async function criar({
  container,
  manifesto = "assets/render/tour360/manifesto.json",
  ponto,
  estacao = "inverno",
  minutos = 900,
  luzes = null,
  aoFechar,
  teste = false,
  andar = null,
  final = null,
  numero = null,
  torre = null
}) {
  const man = typeof manifesto === "string" ? await (await fetch(manifesto)).json() : manifesto;
  const base = typeof manifesto === "string" ? manifesto.replace(/[^/]*$/, "") : man.base || "";
  const PTS = Object.fromEntries(man.pontos.map((p) => [p.id, p]));
  CENA = { ...CENA, ...man.cena || {} };
  const REF_LUZ = (() => {
    const r = CENA.refLuz, c = r && PTS[r.ponto] && PTS[r.ponto].camadas && PTS[r.ponto].camadas[r.camada];
    return c ? c.media_dentro || c.media : null;
  })();
  const pontoInicial = () => (man.pontos.find((p) => p.id === CENA.inicio && p.camadas && p.camadas.fora) || man.pontos.find((p) => p.camadas && p.camadas.fora) || man.pontos[0]).id;
  const estado = { estacao, minutos, luzes: { ...luzesDoCliente() || luzes || luzesAuto(estacao, minutos) }, ponto: ponto && PTS[ponto] ? ponto : pontoInicial() };
  let G = null;
  let VG = null; // E0 21/10: generated window view
  const raiz = document.createElement("div");
  raiz.className = "t360";
  raiz.innerHTML = `
    <canvas class="t360-cv"></canvas>
    <button type="button" class="t360-rot" aria-label="Sobre a imagem" aria-expanded="false"><span class="t360-rot-i" aria-hidden="true">i</span><span class="t360-rot-txt">${ROTULO}</span></button>
    <div class="t360-vista" hidden>Vista simulada</div>
    <div class="t360-nome"></div>
    <div class="t360-luzes">${CENA.luzes.filter((k) => man.pontos.some((p) => p.camadas && p.camadas[k])).map((k) => `<button data-luz="${k}" aria-pressed="false" title="${CENA.nomesLuz[k] || k}"><span class="l-longo">${CENA.nomesLuz[k] || k}</span><span class="l-curto">${CENA.curtoLuz[k] || CENA.nomesLuz[k] || k}</span></button>`).join("")}</div>
    <button class="t360-fechar" aria-label="Fechar">×</button>
    <div class="t360-chips"></div>
    <div class="t360-aviso-sol" hidden>Esta sacada tem sol direto agora; o passeio foi feito num studio de outra face e não mostra esse sol (veja o cartão).</div>`;
  const bR = document.createElement("button");
  bR.className = "t360-reflexo";
  bR.hidden = true;
  bR.setAttribute("aria-pressed", "true");
  bR.innerHTML = '<span class="l-longo">Reflexo no vidro</span><span class="l-curto">Reflexo</span>';
  raiz.querySelector(".t360-luzes").appendChild(bR);
  bR.addEventListener("click", () => {
    estado.reflexo = estado.reflexo === false;
    bR.setAttribute("aria-pressed", String(estado.reflexo));
    creditoReflexo();
    if (G && G.vidro) {
      G.malha.material.uniforms.usaVidro.value = estado.reflexo ? 1 : 0;
      G.vista.acordar();
    }
    desenha();
  });
  function creditoReflexo() {
    try {
      const p = G && G.vista && G.vista.credito && G.vista.credito.querySelector(".g3d-parte");
      if (p) p.innerHTML = (G.vidro && estado.reflexo !== false ? "Vista da janela e reflexo: Google Maps" : "Vista da janela: Google Maps") + "<br>apartamento: render ilustrativo";
    } catch (e) {
    }
  }
  function botaoReflexo() {
    bR.hidden = !(G && G.vidro);
    bR.setAttribute("aria-pressed", String(estado.reflexo !== false));
    creditoReflexo();
  }
  container.appendChild(raiz);
  {
    const b = raiz.querySelector(".t360-rot");
    let tm = 0;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const ab = !b.classList.contains("aberto");
      b.classList.toggle("aberto", ab);
      b.setAttribute("aria-expanded", String(ab));
      clearTimeout(tm);
      if (ab) tm = setTimeout(() => {
        b.classList.remove("aberto");
        b.setAttribute("aria-expanded", "false");
      }, 6e3);
    });
  }
  if (!document.getElementById("t360-css")) {
    const css = document.createElement("style");
    css.id = "t360-css";
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
  const cv = raiz.querySelector(".t360-cv");
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: teste });
  cv.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    if (rebaixar()) setTimeout(() => location.reload(), 300);
  });
  renderer.setPixelRatio(Math.min(capacidade().dprMax, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const movel = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const larguraMax = Math.min(capacidade().larguraPano, renderer.capabilities.maxTextureSize);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
  let yaw = 0, pitch = 0, fov = innerHeight > innerWidth ? 90 : 75;
  const RAIO = 5;
  const esferas = /* @__PURE__ */ new Map();
  function esfera(id) {
    if (esferas.has(id)) return esferas.get(id);
    const p = PTS[id];
    const geo = new THREE.SphereGeometry(RAIO, 96, 48);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(paraMundo(p.pos));
    m.visible = false;
    cena.add(m);
    const mix = new MisturaPonto(renderer, p, base, { larguraMax, SOL, unidade: final != null && numero != null ? { numero: String(numero), andar, final, torre } : null, finalRender: man.final ?? null, luzes: CENA.luzes, pufe: CENA.pufe });
    mix.pufeNoiteCena = CENA.pufe && CENA.pufe.noite;
    mix.aoRefinar = () => {
      if (fechado) return;
      if (estado.ponto === id) repinta();
      else e.refinar = true;
    };
    mix.refLuz = REF_LUZ;
    const e = { m, mix, pronto: null, refinar: false };
    esferas.set(id, e);
    return e;
  }
  async function pinta(id) {
    const e = esfera(id);
    e.refinar = false;
    const tx = await e.mix.atualizar(estado);
    e.m.material.map = tx;
    e.m.material.needsUpdate = true;
    if (VG) {
      VG.aposPintar(id, e);
      if (G && VG.cobre(id)) { G.vidro = false; botaoReflexo(); }
    }
    if (G) G.aposPintar(id, e);
    return e;
  }
  const grupoHot = new THREE.Group();
  cena.add(grupoHot);
  const texHot = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 52, 0, 7);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.arc(64, 64, 40, 0, 7);
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  function montaHot() {
    grupoHot.clear();
    const p = PTS[estado.ponto];
    for (const vid of p.vizinhos || []) {
      const q = PTS[vid];
      if (!q) continue;
      const pos = paraMundo([q.pos[0], q.pos[1], 0.02]);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.22, 40), new THREE.MeshBasicMaterial({ map: texHot, transparent: true, depthTest: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.copy(pos);
      m.userData.id = vid;
      m.renderOrder = 5;
      grupoHot.add(m);
    }
  }
  function aplicaCam() {
    pitch = Math.max(-85, Math.min(85, pitch));
    const y = yaw * Math.PI / 180, x = pitch * Math.PI / 180;
    const d = new THREE.Vector3(-Math.cos(x) * Math.cos(y), Math.sin(x), -Math.cos(x) * Math.sin(y));
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(camera.position.clone().add(d));
  }
  function redim() {
    const w = raiz.clientWidth || 1, h = raiz.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    desenha();
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hotEm(ev) {
    const r = cv.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(grupoHot.children, false)[0];
    return h ? h.object.userData.id : null;
  }
  let arr = null, moveu = 0;
  const toques = /* @__PURE__ */ new Map();
  let pinca = null;
  cv.addEventListener("pointerdown", (ev) => {
    cv.setPointerCapture(ev.pointerId);
    toques.set(ev.pointerId, [ev.clientX, ev.clientY]);
    arr = { x: ev.clientX, y: ev.clientY, yaw, pitch };
    moveu = 0;
    cv.classList.add("arrastando");
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      pinca = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov };
    }
  });
  cv.addEventListener("pointermove", (ev) => {
    if (toques.has(ev.pointerId)) toques.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinca && toques.size === 2) {
      const [a, b] = [...toques.values()];
      fov = Math.max(35, Math.min(95, pinca.fov * pinca.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1]))));
      aplicaCam();
      desenha();
      return;
    }
    if (arr) {
      const k = fov / (cv.clientHeight || 600);
      moveu = Math.max(moveu, Math.hypot(ev.clientX - arr.x, ev.clientY - arr.y));
      yaw = arr.yaw - (ev.clientX - arr.x) * k;
      pitch = arr.pitch + (ev.clientY - arr.y) * k;
      aplicaCam();
      desenha();
      return;
    }
    cv.classList.toggle("alvo", !!hotEm(ev));
  });
  const solta = (ev) => {
    toques.delete(ev.pointerId);
    if (toques.size < 2) pinca = null;
    cv.classList.remove("arrastando");
    if (arr && moveu < 6) {
      const id = hotEm(ev);
      if (id) irPara2(id);
    }
    arr = null;
  };
  cv.addEventListener("pointerup", solta);
  cv.addEventListener("pointercancel", solta);
  cv.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    fov = Math.max(35, Math.min(95, fov + ev.deltaY * 0.05));
    aplicaCam();
    desenha();
  }, { passive: false });
  const elVista = raiz.querySelector(".t360-vista");
  function desenha() {
    if (VG) VG.antes(camera, estado.ponto, andando);
    if (G) G.antes();
    renderer.render(cena, camera);
    const p = PTS[estado.ponto];
    const alvo = paraMundo([p.pos[0], p.pos[1] + 30, p.pos[2] + 2]);
    const v = alvo.clone().project(camera);
    const ok = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
    elVista.hidden = !ok || !!(G && G.malha.visible) || !!(VG && VG.malha.visible);
    if (ok) {
      elVista.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      elVista.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    }
    atualizaChips();
  }
  const chipsBox = raiz.querySelector(".t360-chips");
  const COBRE = ["#interior-sol", "#int-barra", "#interior-fechar", ".t360-luzes", ".t360-nome", ".int-luzes-barra", ".t360-rot", ".int-rodape", "#int-detalhes"];
  let chipsSig = "", chipsAtuais = [];
  const vC = new THREE.Vector3(), vF = new THREE.Vector3(), vD = new THREE.Vector3();
  function atualizaChips() {
    if (fechado) return;
    const r = cv.getBoundingClientRect();
    if (andando || !r.width) {
      if (chipsSig) {
        chipsSig = "";
        chipsAtuais = [];
        chipsBox.replaceChildren();
      }
      return;
    }
    const tampas = [];
    for (const s of COBRE) for (const el of document.querySelectorAll(s)) {
      if (el.hidden || el.offsetParent === null) continue;
      const q = el.getBoundingClientRect();
      if (q.width && q.height) tampas.push(q);
    }
    const sol = document.querySelector("#interior-sol");
    let baseY = sol && sol.offsetParent !== null && sol.getBoundingClientRect().height ? sol.getBoundingClientRect().top - 10 : r.bottom - 20;
    for (const d of document.querySelectorAll("#interior-sol .sol-dica")) if (!d.hidden && d.offsetParent !== null) baseY = Math.min(baseY, d.getBoundingClientRect().top - 6);
    {
      const ri = raiz.querySelector(".t360-rot");
      if (ri && ri.offsetParent !== null) {
        const q = ri.getBoundingClientRect();
        if (q.bottom > baseY - 40) baseY = Math.min(baseY, q.top - 6);
      }
    }
    camera.getWorldDirection(vF);
    vF.y = 0;
    vF.normalize();
    const precisa = [], aneis = [];
    for (const m of grupoHot.children) {
      vC.copy(m.position).project(camera);
      const x = r.left + (vC.x * 0.5 + 0.5) * r.width, y = r.top + (-vC.y * 0.5 + 0.5) * r.height, R2 = 22;
      const naTela = vC.z < 1 && x > r.left + 24 && x < r.right - 24 && y > r.top + 24 && y < r.bottom - 24;
      const tapado = tampas.some((q) => x + R2 > q.left && x - R2 < q.right && y + R2 > q.top && y - R2 < q.bottom);
      if (naTela && !tapado) {
        aneis.push([x - r.left, y]);
        continue;
      }
      vD.copy(m.position).sub(camera.position);
      vD.y = 0;
      const ang = THREE.MathUtils.radToDeg(Math.atan2(vD.x * -vF.z + vD.z * vF.x, vD.x * vF.x + vD.z * vF.z));
      precisa.push({ id: m.userData.id, ang });
    }
    precisa.sort((a, b) => a.ang - b.ang);
    const meiaFov = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect));
    const W = r.width;
    let fimAnt = -1e9;
    const lista = precisa.map((c) => {
      const w = largChip(c.id);
      let x = Math.abs(c.ang) < meiaFov ? W / 2 + c.ang / meiaFov * (W / 2) : c.ang < 0 ? 0 : W;
      x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x));
      if (x - w / 2 < fimAnt + 6) x = fimAnt + 6 + w / 2;
      fimAnt = x + w / 2;
      return { ...c, x, w, seta: c.ang < -12 ? "←" : c.ang > 12 ? "→" : "↓" };
    });
    for (let k = lista.length - 1, lim = W - 8; k >= 0; k--) {
      if (lista[k].x + lista[k].w / 2 > lim) lista[k].x = lim - lista[k].w / 2;
      lim = lista[k].x - lista[k].w / 2 - 6;
    }
    for (const c of lista) for (const [ax, ay] of aneis) if (Math.abs(c.x - ax) < c.w / 2 + 22 && ay > baseY - 36 - 22 && ay < baseY + 22) baseY = Math.min(baseY, ay - 28);
    const sig = lista.map((c) => c.id + ":" + Math.round(c.x / 8) + c.seta).join("|") + "@" + Math.round(baseY);
    if (sig === chipsSig) return;
    chipsSig = sig;
    chipsAtuais = lista.map((c) => ({ id: c.id, x: r.left + c.x, y: baseY }));
    chipsBox.replaceChildren(...lista.map((c) => {
      const b = criaChip(c.id, c.seta);
      b.style.left = c.x + "px";
      b.style.top = baseY - r.top + "px";
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        irPara2(c.id);
      });
      return b;
    }));
  }
  function criaChip(id, seta) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "t360-chip";
    b.dataset.id = id;
    const i = document.createElement("i");
    i.textContent = seta;
    i.setAttribute("aria-hidden", "true");
    b.append(...seta === "→" ? [PTS[id].nome, i] : [i, PTS[id].nome]);
    b.setAttribute("aria-label", "Ir para " + PTS[id].nome);
    return b;
  }
  const largChips = /* @__PURE__ */ new Map();
  function largChip(id) {
    let w = largChips.get(id);
    if (w) return w;
    const b = criaChip(id, "→");
    b.style.visibility = "hidden";
    b.style.left = "-1000px";
    chipsBox.append(b);
    w = Math.ceil(b.getBoundingClientRect().width) + 2;
    b.remove();
    if (!(w > 2)) return 120;
    largChips.set(id, w);
    return w;
  }
  let andando = null;
  async function irPara2(id, { dur = 600 } = {}) {
    if (!PTS[id] || id === estado.ponto || andando) return andando;
    andando = (async () => {
      const de = esfera(estado.ponto), para = await pinta(id);
      para.m.visible = true;
      para.m.material.opacity = 0;
      para.m.renderOrder = 1;
      de.m.renderOrder = 0;
      grupoHot.clear();
      const p0 = paraMundo(PTS[estado.ponto].pos), p1 = paraMundo(PTS[id].pos);
      const t0 = performance.now();
      await new Promise((ok) => {
        const passo = (t) => {
          const k = Math.min(1, (t - t0) / dur), s = k * k * (3 - 2 * k);
          camera.position.lerpVectors(p0, p1, s);
          para.m.material.opacity = s;
          de.m.material.opacity = 1;
          aplicaCam();
          desenha();
          if (k < 1) requestAnimationFrame(passo);
          else ok();
        };
        requestAnimationFrame(passo);
      });
      de.m.visible = false;
      para.m.material.opacity = 1;
      de.mix.soltarCamadas();
      estado.ponto = id;
      raiz.querySelector(".t360-nome").textContent = PTS[id].nome;
      andando = null;
      montaHot();
      desenha();
      if (para.refinar) repinta();
    })();
    return andando;
  }
  let pintando = null, pendente = false;
  async function repinta() {
    if (pintando) {
      pendente = true;
      return pintando;
    }
    pintando = (async () => {
      do {
        pendente = false;
        const e = await pinta(estado.ponto);
        e.m.visible = true;
        avisoSol(e);
        desenha();
      } while (pendente);
    })().finally(() => {
      pintando = null;
    });
    return pintando;
  }
  function avisoSol(e) {
    const a = raiz.querySelector(".t360-aviso-sol");
    if (a) a.hidden = !(e.mix.outraFace() && e.mix.cvAgora(estado.estacao, estado.minutos) > 0.5);
  }
  function marcaLuzes() {
    raiz.querySelectorAll("[data-luz]").forEach((b) => b.setAttribute("aria-pressed", String(!!estado.luzes[b.dataset.luz])));
  }
  raiz.querySelectorAll("[data-luz]").forEach((b) => b.addEventListener("click", () => {
    estado.luzes[b.dataset.luz] = !estado.luzes[b.dataset.luz];
    guardaLuzesCliente(estado.luzes);
    marcaLuzes();
    repinta();
  }));
  function luzesPelaHora() {
    if (!luzesDoCliente()) {
      estado.luzes = luzesAuto(estado.estacao, estado.minutos);
      marcaLuzes();
    }
  }
  let fechado = false;
  function fechar(chamaCb = true) {
    if (fechado) return;
    fechado = true;
    if (G) {
      try {
        G.liberar();
      } catch (e) {
      }
      G = null;
    }
    if (VG) {
      try {
        VG.liberar();
      } catch (e) {
      }
      VG = null;
    }
    for (const e of esferas.values()) {
      e.mix.liberar();
      e.m.geometry.dispose();
      e.m.material.dispose();
    }
    renderer.dispose();
    raiz.remove();
    window.removeEventListener("resize", redim);
    chipsBox.replaceChildren();
    if (atual && atual.raiz === raiz) atual = null;
    if (chamaCb && aoFechar) aoFechar();
  }
  raiz.querySelector(".t360-fechar").addEventListener("click", () => fechar(true));
  window.addEventListener("resize", redim);
  let geoPredio = null;
  const raio = (lat) => {
    const la = lat * Math.PI / 180, a = 6378137, e2 = 0.00669437999014, w = Math.sqrt(1 - e2 * Math.sin(la) ** 2);
    return { M: a * (1 - e2) / w ** 3, N: a / w, la };
  };
  function geoDaUnidade(p) {
    const G0 = geoPredio, f = G0 && G0.finais[String(final ?? G0.padrao.final)];
    if (!f || !p.pos) return null;
    const [u, v, hp] = p.pos, x = f.M[0] * u + f.M[1] * v + f.t[0], z = f.M[2] * u + f.M[3] * v + f.t[1];
    const y = G0.laje_1 + ((andar ?? G0.padrao.andar) - 1) * G0.piso + hp;
    const o = G0.origem, b = o.rumoX * Math.PI / 180, E = x * Math.sin(b) + z * Math.cos(b), Nn = x * Math.cos(b) - z * Math.sin(b), r = raio(o.lat);
    return { lat: o.lat + Nn / r.M * (180 / Math.PI), lon: o.lon + E / (r.N * Math.cos(r.la)) * (180 / Math.PI), h: o.h + y, rumo: f.rumo, porUnidade: true, ajuste: G0.ajuste };
  }
  function geoDoPonto(id) {
    const p = PTS[id];
    const gu = geoDaUnidade(p);
    if (gu) return gu;
    if (p.geo) return p.geo;
    const ref = Object.values(PTS).find((q) => q.geo && q.pos) || (man.geo && man.geo.pos ? { geo: man.geo, pos: man.geo.pos } : null);
    if (!ref || !p.pos) return null;
    const g = ref.geo, b = g.rumo * Math.PI / 180, du = p.pos[0] - ref.pos[0], dv = p.pos[1] - ref.pos[1], dh = p.pos[2] - ref.pos[2];
    const E = Math.sin(b) * dv - Math.cos(b) * du, Nn = Math.cos(b) * dv + Math.sin(b) * du;
    const la = g.lat * Math.PI / 180, a = 6378137, e2 = 0.00669437999014, w = Math.sqrt(1 - e2 * Math.sin(la) ** 2);
    const M = a * (1 - e2) / w ** 3, Nr = a / w;
    return { ...g, lat: g.lat + Nn / M * (180 / Math.PI), lon: g.lon + E / (Nr * Math.cos(la)) * (180 / Math.PI), h: g.h + dh };
  }
  async function ligaGoogle() {
    if (/[?&]google3d=0/.test(location.search)) return;
    try {
      const gm = await import("./google-vista.js");
      try {
        geoPredio = (await import("./google-geo.js")).GEO_PREDIO;
      } catch (e) {
      }
      const sess = await gm.iniciarGoogle();
      if (!sess || fechado) {
        semGoogle();
        return;
      }
      const vista = new gm.VistaGoogle(renderer, sess, { lat: 0, lon: 0, h: 0, rumo: 0 }, () => desenha());
      const mat = gm.materialSobreposicao();
      const geo = new THREE.SphereGeometry(RAIO, 96, 48);
      geo.scale(-1, 1, 1);
      const malha = new THREE.Mesh(geo, mat);
      malha.renderOrder = 3;
      malha.visible = false;
      malha.frustumCulled = false;
      cena.add(malha);
      const st = document.createElement("style");
      st.id = "t360-g3d-css";
      st.textContent = ".t360-g3d{position:absolute;right:10px;bottom:78px;max-width:calc(100% - 20px);pointer-events:none;overflow:visible}.t360-g3d[hidden]{display:none}@media (max-width:760px){.t360-g3d{top:92px;bottom:auto!important}.t360-g3d-carga{top:92px;bottom:auto!important;width:130px!important}}.t360-g3d-carga{position:absolute;left:12px;bottom:78px;width:160px;display:flex;flex-direction:column;gap:3px;padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:10px/1.2 system-ui,sans-serif;pointer-events:none}.t360-g3d-carga[hidden]{display:none}.t360-g3d-carga i{display:block;height:2px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}.t360-g3d-carga b{display:block;height:100%;width:4%;background:#fff;transition:width .4s ease}";
      document.head.appendChild(st);
      raiz.appendChild(vista.credito);
      raiz.appendChild(vista.carga);
      const dir = new THREE.Vector3(), tam = new THREE.Vector2(), perf = { n: 0, ms: 0, max: 0 }, camV = new THREE.PerspectiveCamera();
      let atual2 = null, falhou = false;
      G = {
        vista,
        malha,
        perf,
        gm,
        ativoEm: (id) => !falhou && !(VG && VG.cobre(id)) && !!(PTS[id].camadas && PTS[id].camadas.fora) && !!geoDoPonto(id), // E0: never Google tiles where the generated view is
        aposPintar(id, e) {
          if (!this.ativoEm(id)) return;
          if (atual2 !== null && atual2 !== id && !gm.MODO_FOTO) {
            vista.pronto = false;
            vista._lote = null;
            vista._quieto = 0;
          }
          const g0 = geoDoPonto(id);
          const g = g0.porUnidade ? g0 : { ...g0, h: g0.h + (andar != null && g0.andar_ref != null ? (andar - g0.andar_ref) * (g0.por_andar || 2.81) : 0) };
          vista.ref = { ...g, ajuste: window.__g3dAjuste || g.ajuste };
          vista.unidadeChave = andar != null && final != null ? `${andar}-${final}` : null;
          vista.ligaNaCena();
          mat.uniforms.tM.value = e.mix.mat.uniforms.tFora.value;
          mat.uniforms.tPano.value = e.m.material.map;
          mat.uniforms.panoSrgb.value = e.mix.mat.uniforms.srgb.value;
          vista.definirMascara(mat.uniforms.tM.value && mat.uniforms.tM.value.image);
          const el = e.mix.ultimo && e.mix.ultimo.sol ? e.mix.ultimo.sol.el : 20;
          sess.definirLuz(el);
          mat.uniforms.ganho.value.setScalar(window.__g3dGanho && window.__g3dGanho.dia || 1.35);
          {
            const Gr = gm.gradeGoogle(el);
            mat.uniforms.ombro.value.set(Gr.joelho, Gr.w);
            if (window.__g3d) window.__g3d.ganhoJanela = mat.uniforms.ganho.value.x;
          }
          {
            const c = gm.ceuParaSol(el);
            mat.uniforms.ceuTopo.value.set(...c.topo);
            mat.uniforms.ceuHoriz.value.set(...c.horiz);
          }
          this.el = el;
          const cv2 = PTS[id].camadas && PTS[id].camadas.vidro;
          mat.uniforms.usaVidro.value = 0;
          this.vidro = false;
          botaoReflexo();
          {
            const t = Math.min(1, Math.max(0, (el + 2) / 10));
            mat.uniforms.kDiaV.value = cv2 && cv2.sem_reflexo ? 1 : t * t * (3 - 2 * t);
          }
          if (cv2 && cv2.arq) {
            if (!this.vidros) this.vidros = /* @__PURE__ */ new Map();
            if (!this.vidros.has(cv2.arq)) this.vidros.set(cv2.arq, new Promise((ok) => new THREE.TextureLoader().load(e.mix.base + cv2.arq, (t) => {
              t.colorSpace = THREE.NoColorSpace;
              t.generateMipmaps = false;
              t.minFilter = t.magFilter = THREE.LinearFilter;
              ok(t);
            }, void 0, () => ok(null))));
            this.vidros.get(cv2.arq).then((tx) => {
              if (!tx || atual2 !== id) return;
              mat.uniforms.tV.value = tx;
              vista.definirVidro(tx.image);
              mat.uniforms.usaVidro.value = estado.reflexo === false ? 0 : 1;
              this.vidro = true;
              botaoReflexo();
              vista.acordar();
              desenha();
            });
          }
          mat.uniforms.usaCaixa.value = cv2 && Array.isArray(cv2.caixa) ? 1 : 0;
          if (cv2 && Array.isArray(cv2.caixa)) {
            mat.uniforms.caixaMin.value.set(cv2.caixa[0], cv2.caixa[1], cv2.caixa[2]);
            mat.uniforms.caixaMax.value.set(cv2.caixa[3], cv2.caixa[4], cv2.caixa[5]);
          }
          atual2 = id;
        },
        antes() {
          if (gm.MODO_FOTO) return this.antesFoto();
          let mostrar = !andando && !falhou && atual2 === estado.ponto && this.ativoEm(estado.ponto);
          let janela = null, vidroTela = null;
          if (mostrar) {
            camera.updateMatrixWorld(true);
            janela = vista.janelaNaTela(camera);
            mat.uniforms.espelho.value = 0;
            mat.uniforms.temJanela.value = 1;
            vidroTela = this.vidro && mat.uniforms.usaVidro.value > 0.5 ? vista.vidroNaTela(camera) : null;
            if (!janela && vidroTela) janela = { x0: -1, y0: -1, x1: 1, y1: 1, espelho: true };
            if (!janela) {
              mostrar = false;
              malha.visible = false;
              vista.credito.hidden = true;
              camV.position.copy(camera.position);
              camV.fov = camera.fov;
              camV.aspect = camera.aspect;
              camV.updateProjectionMatrix();
              camV.lookAt(camV.position.x - 1, camV.position.y, camV.position.z);
              camV.updateMatrixWorld(true);
              const jv = vista.janelaNaTela(camV);
              if (jv) {
                try {
                  renderer.getDrawingBufferSize(tam);
                  vista.tamanho(tam.x, tam.y, Math.min(1, renderer.capabilities.maxTextureSize / Math.max(tam.x, tam.y)));
                  camV.getWorldDirection(dir);
                  vista.desenha(dir, camV.fov, camV.aspect, jv, true);
                } catch (e) {
                }
              }
              return;
            }
          }
          malha.visible = mostrar;
          vista.credito.hidden = !mostrar;
          if (!mostrar) return;
          try {
            const t0 = performance.now();
            renderer.getDrawingBufferSize(tam);
            const k = Math.min(1, renderer.capabilities.maxTextureSize / Math.max(tam.x, tam.y));
            vista.tamanho(tam.x, tam.y, k);
            camera.updateMatrixWorld(true);
            camera.getWorldDirection(dir);
            malha.position.copy(camera.position);
            let dirV = null;
            if (janela.espelho) {
              dir.x = -dir.x;
              mat.uniforms.espelho.value = 1;
              mat.uniforms.temJanela.value = 0;
            } else if (vidroTela) {
              dirV = dir.clone();
              dirV.x = -dirV.x;
              mat.uniforms.espelho.value = 1;
            }
            vista.desenha(dir, camera.fov, camera.aspect, janela, false, dirV);
            mat.uniforms.tGV.value = dirV && vista.rtV ? vista.rtV.texture : vista.rt.texture;
            vista.progresso(true);
            const op = vista.opacidade();
            mat.uniforms.forca.value = op;
            if (op < 1) vista.acordar();
            vista.credito.hidden = op <= 0;
            if ((perf.n & 31) === 0) {
              const rot = raiz.querySelector(".t360-rot");
              const topo = Math.min(rot && rot.offsetParent ? rot.getBoundingClientRect().top : innerHeight - 120, ...[...raiz.querySelectorAll(".t360-chip")].map((c) => c.getBoundingClientRect().top));
              const bb = Math.max(78, Math.round(raiz.getBoundingClientRect().bottom - topo + 6)) + "px";
              vista.credito.style.bottom = bb;
              vista.carga.style.bottom = bb;
            }
            mat.uniforms.tG.value = vista.rt.texture;
            mat.uniforms.res.value.copy(tam);
            const dt = performance.now() - t0;
            perf.n++;
            perf.ms += dt;
            perf.max = Math.max(perf.max, dt);
            if (window.__g3d && window.__g3d.erro && /403|429|quota|key|denied|permission/i.test(window.__g3d.erro)) throw new Error(window.__g3d.erro);
          } catch (err) {
            falhou = true;
            semGoogle();
            malha.visible = false;
            vista.credito.hidden = true;
            try {
              vista.liberar();
            } catch (e2) {
            }
            console.warn("google3d desligado", err && err.message);
          }
        },
        antesFoto() {
          const ok = !falhou && atual2 === estado.ponto && this.ativoEm(estado.ponto);
          if (!ok) {
            malha.visible = false;
            vista.credito.hidden = true;
            vista.progressoFoto(false);
            return;
          }
          try {
            vista.passoFoto();
            camera.updateMatrixWorld(true);
            const janela = vista.janelaNaTela(camera);
            const ve = (!!janela || this.vidro) && !andando;
            malha.visible = ve && vista.pronto;
            malha.position.copy(camera.position);
            mat.uniforms.espelho.value = 0;
            mat.uniforms.temJanela.value = 1;
            mat.uniforms.usaCubo.value = 1;
            {
              const F = vista.foto, U = mat.uniforms;
              U.nF.value = F.alvos.length;
              U.nOk.value = F.feito ? F.alvos.length : F.i;
              F.alvos.forEach((a, k) => {
                U["fA" + k].value = a.A.texture;
                U["fW" + k].value = a.W.texture;
                U.fM.value[k].copy(F.mats[k]);
              });
            }
            {
              const L = gm.luzDaCidade(this.el), Gr = gm.gradeGoogle(this.el);
              mat.uniforms.luzBase.value.set(...L.base);
              mat.uniforms.luzesN.value = L.luzes;
              mat.uniforms.gradeF.value.set(Gr.expo, Gr.contraste, Gr.sat, Gr.pivo);
              mat.uniforms.ombro.value.set(Gr.joelho, Gr.w);
            }
            mat.uniforms.rumoB.value = (vista.ref.rumo + (vista.ref.ajuste && vista.ref.ajuste.rumo || 0)) * Math.PI / 180;
            vista.progressoFoto(true);
            const op = vista.opacidade();
            mat.uniforms.forca.value = op;
            if (op < 1 && malha.visible) vista.acordar();
            vista.credito.hidden = !malha.visible || op <= 0;
            if ((perf.n++ & 31) === 0) {
              const rot = raiz.querySelector(".t360-rot");
              const topo = Math.min(rot && rot.offsetParent ? rot.getBoundingClientRect().top : innerHeight - 120, ...[...raiz.querySelectorAll(".t360-chip")].map((c) => c.getBoundingClientRect().top));
              const bb = Math.max(78, Math.round(raiz.getBoundingClientRect().bottom - topo + 6)) + "px";
              vista.credito.style.bottom = bb;
              vista.carga.style.bottom = bb;
            }
            if (window.__g3d && window.__g3d.erro && /403|429|quota|key|denied|permission/i.test(window.__g3d.erro)) throw new Error(window.__g3d.erro);
          } catch (err) {
            falhou = true;
            semGoogle();
            malha.visible = false;
            vista.credito.hidden = true;
            try {
              vista.liberar();
            } catch (e2) {
            }
            console.warn("google3d desligado", err && err.message);
          }
        },
        liberar() {
          malha.geometry.dispose();
          mat.dispose();
          cena.remove(malha);
          vista.liberar();
          if (this.vidros) for (const p of this.vidros.values()) p.then((t) => t && t.dispose());
        }
      };
      window.__g3dVista = G;
      G.aposPintar(estado.ponto, esfera(estado.ponto));
      vista.acordar();
      desenha();
    } catch (err) {
      G = null;
      semGoogle();
      console.warn("google3d indisponivel", err && err.message);
    }
  }
  function semGoogle() {
    if (VEU.fora.value) {
      VEU.fora.value = 0;
      if (!fechado) repinta();
    }
  }
  camera.position.copy(paraMundo(PTS[estado.ponto].pos));
  raiz.querySelector(".t360-nome").textContent = PTS[estado.ponto].nome;
  aplicaCam();
  redim();
  marcaLuzes();
  VEU.fora.value = /[?&]google3d=0/.test(location.search) ? 0 : 1;
  VG = /[?&]vistagerada=0/.test(location.search) ? null : await criarVistaGerada({ cena, PTS, andar, final, RAIO });
  if (VG) raiz.appendChild(VG.credito);
  await repinta();
  montaHot();
  desenha();
  await ligaGoogle();
  raiz.dataset.ready = "1";
  if (/[?&]debug360=1/.test(location.search)) {
    const d = document.createElement("pre");
    d.style.cssText = "position:absolute;left:8px;top:240px;z-index:50;margin:0;padding:6px 8px;font:11px/1.35 monospace;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:80%";
    const atualizaDbg = () => {
      d.textContent = `WebGL ${INFO.webgl} · RT float: ${INFO.rtFloat ? "sim" : "NAO (8 bits, sRGB)"}
maxTextureSize ${INFO.maxTex} · larguraMax ${larguraMax}
texturas enviadas: ${[...INFO.tamanhos].join(", ")}
decodificador: ${INFO.decodificador} · dpr ${renderer.getPixelRatio()}
${navigator.userAgent.slice(0, 120)}`;
    };
    atualizaDbg();
    setInterval(atualizaDbg, 2e3);
    raiz.appendChild(d);
  }
  const api = {
    definirHora: (m) => {
      estado.minutos = m;
      luzesPelaHora();
      return repinta();
    },
    definirEstacao: (e) => {
      estado.estacao = e;
      luzesPelaHora();
      return repinta();
    },
    definirLuz: (n, l) => {
      estado.luzes[n] = !!l;
      marcaLuzes();
      return repinta();
    },
    irPara: irPara2,
    olhar: (y, p = 0, f = fov) => {
      yaw = y;
      pitch = p;
      fov = f;
      aplicaCam();
      desenha();
    },
    hotspots: () => {
      const r = cv.getBoundingClientRect();
      return grupoHot.children.map((m) => {
        const v = m.position.clone().project(camera);
        return { id: m.userData.id, x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visivel: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
      });
    },
    cursor: () => cv.className,
    chips: () => chipsAtuais.slice(),
    estado: () => ({ ...estado, luzes: { ...estado.luzes }, yaw, pitch, fov, expo: esfera(estado.ponto).mix.ultimo?.expo, lG: esfera(estado.ponto).mix.ultimo?.lG, google: G ? { ...window.__g3d || {}, ms: G.perf.n ? G.perf.ms / G.perf.n : 0, max: G.perf.max, n: G.perf.n } : null }),
    fechar: () => fechar(true),
    renderer
  };
  return { api, fechar, raiz };
}
export {
  abrirTour360,
  definirEstacao,
  definirHora,
  definirLuz,
  estadoTour360,
  fecharTour360,
  irPara
};
