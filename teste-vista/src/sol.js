import { el } from "./util.js";
import { PREDIO_CFG } from "./predio.js";
import { posicaoSolar, fatorDia, fatorLuzesNoite } from "./luz-curva.js";
const ESTACOES = [
  ["outono", "Outono"],
  ["inverno", "Inverno"],
  ["primavera", "Primavera"],
  ["verao", "Verão"]
];
const NOME_EST = Object.fromEntries(ESTACOES);
const DIA = 1440;
const hm = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (t) => {
  const m = (Math.round(t) % DIA + DIA) % DIA;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const fmtH = (t) => fmt(t).replace(":", "h");
const dataBR = (iso) => iso.split("-").reverse().slice(0, 2).join("/");
const durTxt = (h) => {
  const mm = Math.round(h * 60);
  return `${Math.floor(mm / 60)}h${String(mm % 60).padStart(2, "0")}`;
};
function criarRelogio(SOL, CFG) {
  const C = CFG.sol;
  const passo = SOL.meta.passo_min || 15;
  const st = { est: C.estacaoInicial in SOL.estacoes ? C.estacaoInicial : "primavera", t: hm(C.horaInicial), segurando: false, arrastando: false, usado: false };
  const subs = /* @__PURE__ */ new Set();
  function info() {
    const e = SOL.estacoes[st.est];
    const ini = hm(e.inicio);
    const t = st.t;
    const f = (t - ini) / passo;
    const ps = posicaoSolar(e.data, t, SOL.meta.local?.lat, SOL.meta.local?.lon);
    const elv = ps.el, az = ps.az;
    const dia = elv > 0;
    const noite = 1 - fatorDia(elv);
    const luzes = fatorLuzesNoite(elv);
    return {
      est: st.est,
      nomeEst: NOME_EST[st.est],
      data: e.data,
      t,
      hora: fmt(t),
      nascer: e.nascer,
      por: e.por,
      dia,
      az,
      el: elv,
      noite,
      luzes,
      idx: Math.floor(f),
      segurando: st.segurando || st.arrastando,
      usado: st.usado
    };
  }
  const avisar = () => {
    const i = info();
    subs.forEach((fn) => fn(i));
  };
  function avancar(min) {
    let t = st.t + min;
    if (t >= DIA) t -= DIA;
    st.t = t;
  }
  let raf = 0, tAnt = 0;
  function passoTempo(dtSeg) {
    const e = SOL.estacoes[st.est];
    const nascer = hm(e.nascer), por = hm(e.por);
    const dia = st.t >= nascer && st.t < por;
    if (dia) {
      const novo = st.t + dtSeg * C.horasPorSegundo * 60;
      st.t = novo >= por ? por : novo;
      if (novo >= por) st.t = por + 0.01;
    } else {
      const noiteMin = DIA - por + nascer;
      avancar(dtSeg * noiteMin / C.noiteSegundos);
      const t = st.t;
      const aindaNoite = t >= por || t < nascer;
      if (!aindaNoite) st.t = nascer;
    }
  }
  function loop(now) {
    const dt = Math.min(0.25, (now - tAnt) / 1e3);
    tAnt = now;
    passoTempo(dt);
    avisar();
    raf = st.segurando ? requestAnimationFrame(loop) : 0;
  }
  function segurar() {
    if (st.segurando) return;
    st.segurando = true;
    st.usado = true;
    tAnt = performance.now();
    avisar();
    raf = requestAnimationFrame(loop);
  }
  function soltar() {
    if (!st.segurando) return;
    st.segurando = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    avisar();
  }
  function toqueCurto() {
    st.usado = true;
    const e = SOL.estacoes[st.est];
    const nascer = hm(e.nascer), por = hm(e.por);
    const dia = st.t >= nascer && st.t < por;
    if (dia) {
      st.t = Math.min(st.t + C.toqueCurtoMin, por + 0.01);
    } else {
      st.t = nascer;
    }
    avisar();
  }
  function estacao(nome) {
    if (SOL.estacoes[nome]) {
      st.est = nome;
      avisar();
    }
  }
  function arrastar(t, fase) {
    if (fase === "inicio") {
      st.arrastando = true;
      st.usado = true;
      avisar();
      return;
    }
    if (fase === "fim") {
      st.arrastando = false;
      avisar();
      return;
    }
    if (t != null) {
      st.t = t;
      avisar();
    }
  }
  function hora(t) {
    st.t = t;
    avisar();
  }
  return { info, ouvir: (fn) => {
    subs.add(fn);
    fn(info());
    return () => subs.delete(fn);
  }, segurar, soltar, toqueCurto, estacao, hora, arrastar, passo, SOL };
}
function controleSol(rel, CFG, { compacto = false, desativado = null } = {}) {
  const C = CFG.sol;
  const relogio = el("span", { class: "sol-hora mono", "aria-live": "off" });
  const sub = el("span", { class: "sol-sub" });
  const dica = el("span", { class: "sol-dica", text: "segure para o sol andar" });
  const btn = el(
    "button",
    { type: "button", class: "sol-btn", "aria-label": "Segure para o sol andar; toque curto avança 30 minutos" },
    el("span", { class: "sol-ico", "aria-hidden": "true" }),
    el("span", { class: "sol-btn-txt", text: "Segure" })
  );
  const est = el(
    "select",
    { class: "sol-est", "aria-label": "Estação do ano", onchange: (e) => rel.estacao(e.target.value) },
    ...ESTACOES.map(([k, n]) => el("option", { value: k, text: n }))
  );
  const faixa = el("input", { type: "range", class: "sol-range", min: 0, max: 1439, step: 1, "aria-label": "Hora do dia" });
  const marcas = el(
    "div",
    { class: "sol-marcas", "aria-hidden": "true" },
    el("i", { class: "m-nasce" }),
    el("i", { class: "m-poe" }),
    el("span", { class: "m-txt m0", text: "0h" }),
    el("span", { class: "m-txt m12", text: "12h" }),
    el("span", { class: "m-txt m24", text: "24h" })
  );
  const trilho = el("div", { class: "sol-trilho" }, faixa, marcas);
  let arrastandoFaixa = false;
  const RAIO_POLEGAR = 12;
  let ar = null;
  const minPorPx = () => 1439 / Math.max(1, faixa.getBoundingClientRect().width - 2 * RAIO_POLEGAR);
  const tDoX = (x) => {
    const r = faixa.getBoundingClientRect();
    return (x - r.left - RAIO_POLEGAR) / Math.max(1, r.width - 2 * RAIO_POLEGAR) * 1439;
  };
  const lim = (t) => Math.max(0, Math.min(1439, t));
  const fator = () => (ar.fino ? 0.25 / minPorPx() : 1) * (Math.abs(ar.yUlt - ar.y0) > 36 ? 0.25 : 1);
  faixa.addEventListener("pointerdown", (e) => {
    if (e.button !== void 0 && e.button !== 0) return;
    e.preventDefault();
    try {
      faixa.setPointerCapture(e.pointerId);
    } catch (x) {
    }
    faixa.focus({ preventScroll: true });
    const tAtual = +faixa.value;
    const xPolegar = (() => {
      const r = faixa.getBoundingClientRect();
      return r.left + RAIO_POLEGAR + tAtual / 1439 * (r.width - 2 * RAIO_POLEGAR);
    })();
    const noPolegar = Math.abs(e.clientX - xPolegar) <= RAIO_POLEGAR + 6;
    const t02 = noPolegar ? tAtual : lim(tDoX(e.clientX));
    ar = { id: e.pointerId, x0: e.clientX, y0: e.clientY, yUlt: e.clientY, t0: t02, k: 1, fino: false, moveu: false, timer: 0 };
    ar.k = fator();
    ar.timer = setTimeout(() => {
      if (ar && !ar.moveu) {
        ar.fino = true;
        raiz.classList.add("fino");
        ar.t0 = +faixa.value;
        ar.x0 = ar.xUlt ?? ar.x0;
        ar.k = fator();
      }
    }, 450);
    arrastandoFaixa = true;
    rel.arrastar(null, "inicio");
    rel.arrastar(t02, "movendo");
  });
  faixa.addEventListener("pointermove", (e) => {
    if (!ar || e.pointerId !== ar.id) return;
    if (Math.abs(e.clientX - ar.x0) > 4 || Math.abs(e.clientY - ar.y0) > 4) ar.moveu = true;
    ar.xUlt = e.clientX;
    ar.yUlt = e.clientY;
    const k = fator();
    if (k !== ar.k) {
      ar.t0 = +faixa.value;
      ar.x0 = e.clientX;
      ar.k = k;
    }
    rel.arrastar(lim(ar.t0 + (e.clientX - ar.x0) * minPorPx() * ar.k), "movendo");
  });
  const fimFaixa = (e) => {
    if (ar && e && e.pointerId !== void 0 && e.pointerId !== ar.id) return;
    if (ar) {
      clearTimeout(ar.timer);
      ar = null;
      raiz.classList.remove("fino");
    }
    if (arrastandoFaixa) {
      arrastandoFaixa = false;
      rel.arrastar(null, "fim");
    }
  };
  faixa.addEventListener("pointerup", fimFaixa);
  faixa.addEventListener("pointercancel", fimFaixa);
  faixa.addEventListener("lostpointercapture", fimFaixa);
  faixa.addEventListener("mousedown", (e) => e.preventDefault());
  faixa.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  faixa.addEventListener("input", () => {
    if (!ar) rel.arrastar(+faixa.value, "movendo");
  });
  faixa.addEventListener("change", () => {
    if (!ar) rel.arrastar(null, "fim");
  });
  const raiz = el(
    "div",
    { class: `sol-ctl slim${compacto ? " compacto" : ""}`, title: C.rotulo },
    btn,
    el("div", { class: "sol-relogio" }, relogio, sub),
    trilho,
    est,
    dica
  );
  raiz._marcarEstado = (txt) => {
    sub.textContent = txt;
    sub.dataset.externo = "1";
  };
  if (desativado) {
    btn.disabled = true;
    raiz.append(el("p", { class: "sol-nota", text: desativado }));
  }
  let t0 = 0, timer = 0, longo = false;
  const iniciar = (e) => {
    if (btn.disabled) return;
    e.preventDefault();
    t0 = performance.now();
    longo = false;
    timer = setTimeout(() => {
      longo = true;
      rel.segurar();
    }, C.toqueCurtoMs);
    try {
      btn.setPointerCapture(e.pointerId);
    } catch (x) {
    }
  };
  const parar = () => {
    if (!t0) return;
    clearTimeout(timer);
    if (longo) rel.soltar();
    else rel.toqueCurto();
    t0 = 0;
  };
  btn.addEventListener("pointerdown", iniciar);
  btn.addEventListener("pointerup", parar);
  btn.addEventListener("pointercancel", parar);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
  btn.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "ArrowRight" && e.key !== "Enter") return;
    e.preventDefault();
    if (!e.repeat) {
      t0 = performance.now();
      longo = false;
      timer = setTimeout(() => {
        longo = true;
        rel.segurar();
      }, C.toqueCurtoMs);
    }
  });
  btn.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      parar();
    }
  });
  btn.addEventListener("click", (e) => e.preventDefault());
  let estPintada = null;
  const desligar = rel.ouvir((i) => {
    relogio.textContent = i.hora;
    if (!sub.dataset.externo) {
      const curto = raiz.getBoundingClientRect().width < 560;
      sub.textContent = curto ? `${dataBR(i.data)} · sol ${i.nascer}–${i.por}` : `${i.nomeEst} · ${dataBR(i.data)} · nasce ${i.nascer} · põe ${i.por}`;
    }
    dica.hidden = i.usado;
    raiz.classList.toggle("noite", !i.dia);
    raiz.classList.toggle("andando", i.segurando);
    if (est.value !== i.est) est.value = i.est;
    faixa.value = Math.round(i.t);
    faixa.setAttribute("aria-valuetext", i.hora);
    if (estPintada !== i.est) {
      estPintada = i.est;
      const pn = hm(i.nascer) / 1440 * 100, pp = hm(i.por) / 1440 * 100;
      trilho.style.setProperty("--nasce", pn.toFixed(2) + "%");
      trilho.style.setProperty("--poe", pp.toFixed(2) + "%");
      trilho.style.setProperty("--meio", ((pn + pp) / 2).toFixed(2) + "%");
      marcas.querySelector(".m-nasce").title = `nasce ${i.nascer}`;
      marcas.querySelector(".m-poe").title = `se põe ${i.por}`;
    }
  });
  raiz._desligar = desligar;
  return raiz;
}
function secaoSolUnidade(rel, CFG, u) {
  const S = rel.SOL;
  const fin = S.finais[String(u.final)];
  const dadosU = S.unidades[u.numero];
  if (!fin || !dadosU) return el("p", { class: "sol-nota", text: "Simulação do sol desta unidade: [falta]" });
  const cx = fin.caixa_planta;
  const W = cx.largura, D = cx.profundidade;
  const PAD = 0.5;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `${-PAD} ${-PAD} ${W + 2 * PAD} ${D + 2 * PAD}`);
  svg.setAttribute("class", "sol-planta");
  svg.setAttribute("role", "img");
  const mk = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    svg.append(n);
    return n;
  };
  const vp = fin.abertura?.varanda_prof_m ?? 1.22;
  const lado = fin.sacada_lado;
  const semSacada = fin.abertura?.varanda_prof_m === 0;
  const onde = semSacada ? "janela" : "sacada";
  const varanda = lado === "N" ? [0, 0, W, vp] : lado === "S" ? [0, D - vp, W, vp] : lado === "W" ? [0, 0, vp, D] : [W - vp, 0, vp, D];
  mk("rect", { x: 0, y: 0, width: W, height: D, class: "sp-piso" });
  mk("rect", { x: varanda[0], y: varanda[1], width: varanda[2], height: varanda[3], class: "sp-varanda" });
  const mancha = mk("polygon", { class: "sp-sol", points: "" });
  mk("rect", { x: 0, y: 0, width: W, height: D, class: "sp-borda" });
  const tv = mk("text", { x: varanda[0] + varanda[2] / 2, y: varanda[1] + varanda[3] / 2, class: "sp-txt", "text-anchor": "middle", "dominant-baseline": "middle" });
  tv.textContent = onde;
  if (lado === "W" || lado === "E") tv.setAttribute("transform", `rotate(-90 ${varanda[0] + varanda[2] / 2} ${varanda[1] + varanda[3] / 2})`);
  const arco = document.createElementNS(ns, "svg");
  arco.setAttribute("viewBox", "0 0 160 64");
  arco.setAttribute("class", "sol-arco");
  const mkA = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    arco.append(n);
    return n;
  };
  const faixas = mkA("g", { class: "sa-faixas" });
  mkA("line", { x1: 0, y1: 58, x2: 160, y2: 58, class: "sa-chao" });
  const curva = mkA("polyline", { class: "sa-curva", points: "" });
  const ponto = mkA("circle", { r: 4, class: "sa-ponto", cx: -10, cy: -10 });
  const tNasce = mkA("text", { x: 2, y: 63, class: "sa-txt" });
  const tPoe = mkA("text", { x: 158, y: 63, class: "sa-txt", "text-anchor": "end" });
  const resumo = el("p", { class: "sol-resumo" });
  const agora = el("span", { class: "sol-agora" });
  const legenda = el("p", { class: "sol-nota" });
  let estDesenhada = null;
  const desenharEst = (i) => {
    const e = S.estacoes[i.est];
    const n = e.el.length;
    const nascer = hm(e.nascer), por = hm(e.por), ini = hm(e.inicio);
    const X = (t) => (t - nascer) / (por - nascer) * 156 + 2;
    const Y = (elv) => 58 - Math.max(0, elv) / 90 * 54;
    const pts = [[X(nascer), 58], ...e.el.map((v, k) => [X(ini + k * rel.passo), Y(v)]), [X(por), 58]];
    curva.setAttribute("points", pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "));
    faixas.replaceChildren();
    const cv = dadosU.est[i.est].cv;
    for (let k = 0; k < cv.length; k++) {
      if (cv[k] !== "1") continue;
      const r = document.createElementNS(ns, "rect");
      const a = X(ini + k * rel.passo), b = X(ini + (k + 1) * rel.passo);
      r.setAttribute("x", a.toFixed(1));
      r.setAttribute("width", Math.max(0.5, b - a).toFixed(1));
      r.setAttribute("y", 4);
      r.setAttribute("height", 54);
      r.setAttribute("class", "sa-faixa");
      faixas.append(r);
    }
    tNasce.textContent = e.nascer;
    tPoe.textContent = e.por;
    const d = dadosU.est[i.est];
    const ints = d.intervalos.map(([a, b]) => `${fmtH(hm(a))}–${fmtH(hm(b))}`);
    resumo.textContent = ints.length ? `Sol direto na ${onde}: ${ints.join(" e ")} (~${durTxt(d.horas)}) · ${NOME_EST[i.est]}, ${dataBR(e.data)}` : `Sem sol direto na ${onde} em ${dataBR(e.data)} (${NOME_EST[i.est].toLowerCase()}), pela simulação.`;
    legenda.textContent = `${semSacada ? "Janela" : "Sacada"} voltada para ${PREDIO_CFG.faces[lado]?.texto || lado}. Planta esquemática do final ${u.final}; mancha = sol direto no piso. ${S.meta.aviso}`;
    estDesenhada = i.est;
    return { X, Y };
  };
  let escala = null;
  const desligar = rel.ouvir((i) => {
    if (estDesenhada !== i.est) escala = desenharEst(i);
    const e = S.estacoes[i.est];
    const cv = dadosU.est[i.est].cv;
    const k = i.idx;
    const temSol = i.dia && k >= 0 && k < cv.length && cv[k] === "1";
    agora.textContent = temSol ? `sol na ${onde} agora` : "sem sol direto agora";
    agora.classList.toggle("sim", temSol);
    const poli = i.dia && k >= 0 ? (fin.mancha[i.est] || [])[Math.min(k, (fin.mancha[i.est] || []).length - 1)] : null;
    mancha.setAttribute("points", temSol && poli ? poli.map(([x, z]) => `${x},${z}`).join(" ") : "");
    if (temSol && !poli) agora.textContent = `sol na ${onde} agora (não chega ao piso da sala)`;
    if (i.dia) {
      ponto.setAttribute("cx", escala.X(i.t).toFixed(1));
      ponto.setAttribute("cy", escala.Y(i.el).toFixed(1));
    } else {
      ponto.setAttribute("cx", -10);
    }
    void e;
  });
  const sec = el(
    "section",
    { class: "cd-sol" },
    el("h3", { text: "Sol na unidade (simulação)" }),
    el("div", { class: "cd-sol-grid" }, svg, el("div", { class: "cd-sol-dir" }, arco, el("p", { class: "sol-agora-linha" }, agora))),
    resumo,
    legenda
  );
  sec._desligar = desligar;
  return sec;
}
const PERIODO = { manha: "Sol da manhã", tarde: "Sol da tarde", "manha e tarde": "Sol de manhã e à tarde" };
const NA_EST = { outono: "no outono", inverno: "no inverno", primavera: "na primavera", verao: "no verão" };
const dur5 = (h) => {
  const mm = Math.round(h * 60 / 5) * 5;
  return `${Math.floor(mm / 60)}h${String(mm % 60).padStart(2, "0")}`;
};
const solConfiavel = (SOL) => /LiDAR/i.test(SOL?.meta?.versao || "");
function resumoSolUnidade(SOL, u, est) {
  if (!solConfiavel(SOL)) return null;
  const d = SOL.unidades[u.numero]?.est?.[est];
  if (!d) return null;
  if (d.periodo === "sem sol direto" || !d.horas || d.horas < 0.25) return `Sem sol direto ${NA_EST[est]}`;
  const p = PERIODO[d.periodo] || "Sol direto";
  return `${p} · ~${dur5(d.horas)}/dia ${NA_EST[est]}`;
}
export {
  controleSol,
  criarRelogio,
  fmt,
  hm,
  resumoSolUnidade,
  secaoSolUnidade,
  solConfiavel
};
