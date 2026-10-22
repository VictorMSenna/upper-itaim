import { b7Ativo } from "./entorno-config.js";
import { nivelNoite, ROTULO_NOITE } from "./noite.js";
import { aplicarCoresCss } from "./estados.js";
aplicarCoresCss();
import { CONFIG } from "./config.js";
import { META, UNIDADES, PREDIO } from "./dados.js";
import { brl, brlCurto, m2, dataBR, STATUS, POSICAO, PLANTA, el, texto } from "./util.js";
import { PREDIO_CFG } from "./predio.js";
import { abrirTour } from "./tour.js";
import * as MET from "./metricas.js";
import * as DICAS from "./dicas.js";
const params = new URLSearchParams(location.search);
const TESTE = params.has("teste");
const REVISAO = params.has("revisao");
const FORCAR_SEM_3D = params.has("semwebgl");
if (params.get("modo") === "vitrine") document.documentElement.classList.add("vitrine");
const $ = (s, r = document) => r.querySelector(s);
const desktop = () => window.matchMedia("(min-width: 1000px)").matches;
const porId = new Map(UNIDADES.map((u) => [u.id, u]));
const porNumero = new Map(UNIDADES.map((u) => [u.numero, u]));
const N = PREDIO.andares_venda;
const FINAIS = [...new Set(UNIDADES.map((u) => u.final))].sort((a, b) => a - b);
const falta = (v) => typeof v === "string" && v.includes("[falta");
const MEDIA = MET.mediaTabela(UNIDADES);
const CONT = MET.contagem(UNIDADES);
const CART = CONFIG.cartao || {};
const precoCheio = (v) => brl(v).replace(/,00$/, "");
const precoMi = (v) => "R$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " mi";
const m2Curto = (v) => brlCurto(v) + "/m²";
const pctBR = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const capitaliza = (t) => t ? t[0].toUpperCase() + t.slice(1) : t;
const TABELA_LINHA = `${CONFIG.tabela} · atualizada em ${dataBR(META.gerada_em)}`;
const app = {
  cena: null,
  modo3d: "carregando",
  motivoSem3d: null,
  vista: "3d",
  temFoto: false,
  andar: null,
  unidade: null,
  CONFIG,
  filtro: { de: 1, ate: N, precoMax: null, finais: new Set(FINAIS), soDisp: false }
};
window.__app = app;
if (REVISAO) document.body.classList.add("revisao");
function preencherTextos() {
  document.querySelectorAll("[data-cfg]").forEach((n) => {
    const k = n.dataset.cfg;
    const v = CONFIG[k];
    if (typeof v === "function") return;
    if (falta(v) && !REVISAO) {
      n.replaceChildren();
      const seg = n.closest(".seg") || (n.classList.contains("seg") ? n : null);
      if (seg) document.querySelectorAll(`.seg[data-seg="${k}"]`).forEach((s) => {
        s.hidden = true;
      });
      else n.hidden = true;
      return;
    }
    n.replaceChildren(texto(v));
  });
  const partes = CONFIG.nome.split(" ");
  $("#ab-nome").replaceChildren(partes.slice(0, -1).join(" ") + (partes.length > 1 ? " " : ""), el("span", { text: partes.at(-1) }));
  if (CONFIG.marcaLogo) {
    const s0 = document.querySelector(".ab-topo > span");
    if (s0) s0.prepend(el("img", { class: "ab-logo", src: CONFIG.marcaLogo, alt: CONFIG.marcaLogoAlt }));
  }
  $("#u-total").textContent = `${UNIDADES.length} ${CONFIG.tipologiaPlural}`;
  preencherCardPredio();
}
function preencherCardPredio() {
  const t = CART.entornoTempos;
  const metro = t && t.metro;
  const em = $("#ab-metro");
  if (metro && metro.min != null) {
    em.textContent = ` · ${metro.min} min a pé do metrô ${metro.estacao}`;
    em.hidden = false;
  } else if (REVISAO) {
    em.replaceChildren(" · ", texto("[falta: min a pé do metrô]"));
    em.hidden = false;
  }
  $("#ab-disp").textContent = CONT.disponivel;
  $("#ab-res").textContent = CONT.reservada;
  const barra = $("#ab-barra");
  barra.replaceChildren(...["disponivel", "reservada", "indisponivel"].map((k) => el("i", { class: `ab-b ${k}`, style: `width:${(CONT[k] / CONT.total * 100).toFixed(2)}%` })));
  barra.setAttribute("aria-label", `${CONT.disponivel} disponíveis, ${CONT.reservada} reservadas e ${CONT.indisponivel} indisponíveis de ${CONT.total}`);
  $("#ab-total").textContent = `${CONT.total} ${CONFIG.tipologiaPlural} no prédio, ${CONT.naTabela} na ${CONFIG.tabela.toLowerCase()}`;
  const ap = MET.aPartirDe(UNIDADES);
  $("#ab-preco").textContent = ap != null ? precoCheio(ap) : "—";
  $("#ab-m2").textContent = MEDIA ? brlCurto(MEDIA) : "—";
  const [a0, a1] = MET.faixaArea(UNIDADES);
  $("#ab-area").textContent = `${capitaliza(CONFIG.tipologia)} · ${a0.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}–${a1.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m²`;
  const mod = CART.ficha && CART.ficha.modalidade;
  const cm = $("#ab-modal");
  if (mod) {
    cm.hidden = false;
    $("#ab-modal-v").textContent = mod;
  } else if (REVISAO) {
    cm.hidden = false;
    $("#ab-modal-v").replaceChildren(texto("[falta: modalidade]"));
  }
  const de = MET.destaque(UNIDADES, CART);
  const bd = $("#ab-destaque");
  if (de) {
    const u = de.u;
    $("#ab-dest-rot").textContent = de.motivo === "regra" ? "Destaque da tabela · menor R$/m²" : `Destaque da tabela${de.texto ? " · " + de.texto : ""}`;
    $("#ab-dest-t").textContent = `Unidade ${u.numero} · ${u.andar}º andar · ${m2(u.area_m2)}`;
    $("#ab-dest-p").textContent = `${precoCheio(u.preco_total)} · ${m2Curto(u.preco_m2)}`;
    bd.onclick = () => abrirUnidade(u.id);
    bd.hidden = false;
  }
  $("#ab-data").textContent = TABELA_LINHA;
}
function passaFiltro(u) {
  const F = app.filtro;
  if (u.andar < F.de || u.andar > F.ate) return false;
  if (!F.finais.has(u.final)) return false;
  if (F.soDisp && u.situacao !== "disponivel") return false;
  if (F.precoMax != null && (u.preco_total == null || u.preco_total > F.precoMax)) return false;
  return true;
}
function filtroAtivo() {
  const F = app.filtro;
  return F.de !== 1 || F.ate !== N || F.precoMax != null || F.finais.size !== FINAIS.length || F.soDisp;
}
function montarFiltros() {
  const selDe = $("#f-de"), selAte = $("#f-ate"), selPreco = $("#f-preco");
  for (let a = 1; a <= N; a++) {
    selDe.append(el("option", { value: a, text: `${a}º` }));
    selAte.append(el("option", { value: a, text: `${a}º` }));
  }
  selAte.value = N;
  const precos = [...new Set(UNIDADES.filter((u) => u.preco_total).map((u) => u.preco_total))].sort((a, b) => a - b);
  selPreco.append(el("option", { value: "", text: "qualquer" }));
  precos.forEach((p) => selPreco.append(el("option", { value: p, text: `até ${brlCurto(p)}` })));
  for (const f of FINAIS) {
    $("#f-finais").append(el("button", {
      type: "button",
      class: "chip-final",
      "aria-pressed": "true",
      title: POSICAO[f],
      onclick: (e) => {
        if (app.filtro.finais.has(f)) app.filtro.finais.delete(f);
        else app.filtro.finais.add(f);
        e.currentTarget.setAttribute("aria-pressed", app.filtro.finais.has(f) ? "true" : "false");
        aplicarFiltro();
      }
    }, String(f)));
  }
  selDe.addEventListener("change", () => {
    app.filtro.de = +selDe.value;
    if (app.filtro.ate < app.filtro.de) {
      app.filtro.ate = app.filtro.de;
      selAte.value = app.filtro.de;
    }
    aplicarFiltro();
  });
  selAte.addEventListener("change", () => {
    app.filtro.ate = +selAte.value;
    if (app.filtro.de > app.filtro.ate) {
      app.filtro.de = app.filtro.ate;
      selDe.value = app.filtro.ate;
    }
    aplicarFiltro();
  });
  selPreco.addEventListener("change", () => {
    app.filtro.precoMax = selPreco.value ? +selPreco.value : null;
    aplicarFiltro();
  });
  $("#f-disp").addEventListener("change", (e) => {
    app.filtro.soDisp = e.target.checked;
    aplicarFiltro();
  });
  $("#f-limpar").addEventListener("click", () => {
    app.filtro = { de: 1, ate: N, precoMax: null, finais: new Set(FINAIS), soDisp: false };
    selDe.value = 1;
    selAte.value = N;
    selPreco.value = "";
    $("#f-disp").checked = false;
    document.querySelectorAll(".chip-final").forEach((b) => b.setAttribute("aria-pressed", "true"));
    aplicarFiltro();
  });
}
function aplicarFiltro() {
  const ativo = filtroAtivo();
  const n = UNIDADES.filter(passaFiltro).length;
  $("#f-resultado").textContent = ativo ? `· ${n} no filtro` : "";
  $("#btn-unidades-n").textContent = ativo ? n : "";
  document.querySelectorAll(".cel").forEach((c) => c.classList.toggle("fora", !passaFiltro(porId.get(c.dataset.id))));
  document.querySelectorAll(".foto-svg g[data-uid]").forEach((p) => p.classList.toggle("fora", !passaFiltro(porId.get(p.dataset.uid))));
  if (app.cena) app.cena.setFiltro(ativo ? passaFiltro : null);
}
function montarGrade() {
  const g = $("#grade");
  g.append(el("div", { class: "gh", text: "" }));
  for (const f of FINAIS) g.append(el("div", { class: "gh", title: POSICAO[f], text: `F${f}` }));
  for (let a = N; a >= 1; a--) {
    g.append(el("div", { class: "gl", "data-andar": a, "aria-hidden": "true" }, `${a}º`));
    UNIDADES.filter((u) => u.andar === a).forEach((u) => {
      const s = STATUS[u.situacao];
      g.append(el("button", {
        type: "button",
        class: `cel ${u.situacao}`,
        "data-id": u.id,
        "aria-label": `Unidade ${u.numero}, ${s.rotulo}${u.preco_total ? ", " + brlCurto(u.preco_total) : ""}`,
        onclick: () => abrirUnidade(u.id)
      }, u.numero));
    });
  }
  const c = CONT;
  $("#resumo").replaceChildren(
    el("span", {}, el("i", { class: "dot disponivel" }), el("b", { text: c.disponivel }), " disponíveis"),
    el("span", {}, el("i", { class: "dot reservada" }), el("b", { text: c.reservada }), " reservadas"),
    el("span", {}, el("i", { class: "dot indisponivel" }), el("b", { text: c.indisponivel }), " indisponíveis"),
    el("span", { class: "u-tabela", text: `${c.naTabela} na ${CONFIG.tabela.toLowerCase()} · atualizada em ${dataBR(META.gerada_em)}` })
  );
}
function escolherUnidade() {
  if (app.modo3d === "sem3d") {
    painelUnidades(true);
    return;
  }
  if (app.vista === "foto") mostrarVista("3d");
  painelUnidades(true);
}
async function abrirPasseioReal() {
  const m = await import("./splat-interior.js");
  let box = document.getElementById("splat");
  if (!box) {
    box = el("div", { id: "splat", class: "splat-tela" });
    document.body.append(box);
  }
  box.hidden = false;
  try {
    await m.abrirSplat({ container: box, aoFechar: () => {
      box.hidden = true;
      box.replaceChildren();
    } });
    const sm = box.querySelector(".spl-rot small");
    if (sm) sm.textContent = "luz do dia da filmagem · o que não foi filmado não aparece";
  } catch (e) {
    console.error("B8 passeio", e);
    box.hidden = true;
  }
}
function voltarLista() {
  fecharCard();
  painelUnidades(true);
}
function painelUnidades(abrir) {
  const p = $("#unidades");
  const ab = abrir ?? p.hidden;
  p.hidden = !ab;
  $("#btn-unidades").setAttribute("aria-pressed", ab ? "true" : "false");
  atualizarPainel();
}
function atualizarPainel() {
  const aberto = !$("#unidades").hidden || !$("#card").hidden;
  document.body.classList.toggle("painel-aberto", aberto);
  ajustarDeslocamento();
}
function ajustarDeslocamento() {
  if (!app.cena) return;
  const x = desktop() && document.body.classList.contains("painel-aberto") ? 432 : 0;
  let y = 0;
  if (!desktop() && solAtivo && !$("#sol-painel").hidden) {
    const r = $("#sol-painel").getBoundingClientRect();
    y = Math.max(0, window.innerHeight - r.top - 20);
  }
  if (!desktop()) for (const id of ["#card", "#unidades"]) {
    const f = $(id);
    if (!f.hidden) y = Math.max(y, f.getBoundingClientRect().height - 10);
  }
  app.cena.setDeslocamento({ x, y });
}
window.addEventListener("resize", () => ajustarDeslocamento());
function destacarAndar(a) {
  void a;
}
function linkUnidade(u) {
  return `${CONFIG.urlPublica || location.href.split("#")[0]}#u${u.numero}`;
}
function linkWhatsapp(u, tipo = "unidade") {
  const txt = tipo === "predio" || !u ? CONFIG.mensagemPredio : tipo === "reserva" ? CONFIG.mensagemReserva(u.numero) : CONFIG.mensagemWhatsapp(u.numero);
  const msg = encodeURIComponent(txt);
  const num = String(CONFIG.whatsapp).replace(/\D/g, "");
  void num;
  void msg;
  return "#";
}
let estavaListaAberta = false;
function abrirUnidade(id) {
  if (app.vista === "foto" && app.modo3d !== "sem3d") mostrarVista("3d");
  const u = porId.get(id);
  if (!u) return;
  fecharAbertura();
  DICAS.janelaUsada();
  const trocando = !$("#card").hidden && app.unidade && app.unidade !== id;
  app.unidade = id;
  app.cena?.preCarregarJanela?.({ andar: u.andar, final: u.final });
  document.querySelectorAll(".cel").forEach((c) => c.classList.toggle("sel", c.dataset.id === id));
  document.querySelectorAll(".foto-svg g[data-uid]").forEach((p) => p.classList.toggle("sel", p.dataset.uid === id));
  if (app.cena) app.cena.marcarUnidade(id);
  void trocando;
  const s = STATUS[u.situacao];
  $("#card-eyebrow").textContent = `${u.andar}º andar · final ${u.final}`;
  $("#card-titulo").replaceChildren("Unidade ", el("span", { class: "mono", text: u.numero }));
  const selo = $("#card-selo");
  selo.className = `selo ${u.situacao}`;
  selo.replaceChildren(el("i", { class: `dot ${u.situacao}`, "aria-hidden": "true" }), s.rotulo);
  const temPreco = u.preco_total != null;
  const planta = PLANTA[u.final];
  const numeroWa = String(CONFIG.whatsapp).replace(/\D/g, "");
  const corpo = $("#card-corpo");
  const vs = temPreco ? MET.vsMedia(u, MEDIA) : null;
  const sims = MET.similares(u, UNIDADES);
  const disp = u.situacao === "disponivel";
  corpo.replaceChildren(...[
    el(
      "figure",
      { class: "cd-foto", style: "margin:6px 0 14px", onclick: () => abrirGaleria(0) },
      el("img", { src: CONFIG.fotos2026.lista[0].arq, alt: CONFIG.fotos2026.altCard, loading: "lazy", width: 900, height: 1600 }),
      el("button", {
        type: "button",
        class: "pilula-360 cd-360",
        id: "cd-360",
        hidden: true,
        "aria-label": "Entrar no apartamento: tour 360° por dentro",
        onclick: (e) => {
          e.stopPropagation();
          entrarApartamento(u.id);
        }
      }, icone360(), el("span", {}, el("b", { text: "Entrar no apartamento" }), el("small", { text: "tour 360° por dentro" }))),
      el("figcaption", { text: CONFIG.tour.legendaCard })
    ),
    el(
      "p",
      { class: "cd-preco" },
      temPreco ? precoCheio(u.preco_total) : CONFIG.foraDaTabela,
      temPreco ? null : el("small", { text: "Situação a confirmar com o corretor" })
    ),
    temPreco ? el(
      "p",
      { class: "cd-m2", id: "cd-m2" },
      el("span", { class: "mono", text: m2Curto(u.preco_m2) }),
      vs ? ` · ${vs.tipo === "abaixo" ? `${pctBR(vs.pct)}% abaixo da média do prédio` : "na média do prédio"}` : null
    ) : null,
    el(
      "div",
      { class: "cd-chips", id: "cd-chips" },
      el("span", { class: "chip", text: m2(u.area_m2) }),
      el("span", { class: "chip", text: u.vaga != null ? `${u.vaga} vaga${u.vaga > 1 ? "s" : ""}` : "vaga a confirmar" }),
      el("span", { class: "chip", text: capitaliza(CONFIG.tipologia) }),
      el("span", { class: "chip chip-sol", id: "cd-sol-linha", hidden: true }, el("span", { class: "sol-ico", "aria-hidden": "true" }), el("span", { text: "" }))
    ),
    temPreco ? el(
      "section",
      { class: "cd-pag", id: "cd-pag" },
      el("h3", { text: "Condição de pagamento" }),
      el("div", { class: "cd-pag-l" }, el("span", { text: `Ato ${u.ato.pct}%` }), el("b", { class: "mono", text: precoCheio(u.ato.valor) })),
      el("div", { class: "cd-pag-l" }, el("span", { text: `Saldo ${u.parcela.pct}%` }), el("b", { class: "mono", text: precoCheio(u.parcela.valor) }))
    ) : null,
    blocoLocacao(u),
    el(
      "div",
      { class: "cd-acoes" },
      void disp,
      b7Ativo("interiorProcedural") ? el("button", { type: "button", class: "btn-sec", id: "btn-interior", onclick: () => entrarApartamento(u.id) }, "Entrar no apartamento") : null,
      el(
        "button",
        { type: "button", class: "btn-sec", id: "btn-splat", hidden: true, title: CONFIG.tour.botaoVideoTitulo, onclick: () => entrarApartamento(u.id) },
        CONFIG.tour.botaoVideo,
        el("small", { class: "btn-sub", text: CONFIG.tour.botaoVideoSub })
      ),
      void numeroWa
    ),
    sims.length ? el(
      "section",
      { class: "cd-sim", id: "cd-sim" },
      el("h3", { text: "Similares disponíveis" }),
      el("div", { class: "cd-sim-l" }, ...sims.map((v) => el(
        "button",
        { type: "button", class: "cd-sim-b", "data-num": v.numero, onclick: () => abrirUnidade(v.id), "aria-label": `Unidade ${v.numero}, ${precoCheio(v.preco_total)}` },
        el("b", {}, "Unid. ", el("span", { class: "mono", text: v.numero })),
        el("span", { class: "mono", text: precoMi(v.preco_total) })
      )))
    ) : null,
    el("p", { class: "cd-tabela", text: TABELA_LINHA }),
    el(
      "details",
      { class: "detalhes", id: "detalhes" },
      el("summary", { text: "Ver detalhes" }),
      el(
        "div",
        { class: "det-corpo" },
        temPreco ? el(
          "section",
          { class: "det-bloco" },
          el("h3", { text: "Pagamento" }),
          el(
            "ol",
            { class: "pag" },
            el("li", {}, el("span", { text: "Valor total" }), el("span", { class: "mono", text: brl(u.preco_total) })),
            el("li", {}, el("span", { text: `Ato · ${u.ato.pct}%` }), el("span", { class: "mono", text: brl(u.ato.valor) })),
            el("li", {}, el("span", { text: `Saldo · ${u.parcela.pct}%` }), el("span", { class: "mono", text: brl(u.parcela.valor) })),
            el("li", {}, el("span", { text: "R$ por m²" }), el("span", { class: "mono", text: brl(u.preco_m2) })),
            MEDIA ? el("li", {}, el("span", { text: "Média da tabela (R$ por m²)" }), el("span", { class: "mono", text: brl(MEDIA) })) : null
          )
        ) : null,
        el("ul", { class: "avisos" }, ...CONFIG.avisosCard.map((t) => el("li", { text: t }))),
        el(
          "section",
          { class: "det-bloco" },
          el("h3", { text: "Planta" }),
          planta ? el("div", { class: `planta-box ${planta.tipo}` }, el("img", { src: CONFIG.planta.arquivo, alt: CONFIG.planta.alt, loading: "lazy", width: CONFIG.planta.largura, height: CONFIG.planta.altura })) : el("div", { class: "planta-falta" }, "Planta deste final em breve"),
          el("p", { class: "legenda-pequena", text: planta ? planta.texto + " Ilustração artística." : `Posição: ${POSICAO[u.final]}.` })
        ),
        el("section", { class: "det-bloco", id: "det-sol" }),
        el(
          "section",
          { class: "det-bloco" },
          el("h3", { text: CONFIG.fotos2026.titulo }),
          galeriaMiniaturas(),
          el("p", { class: "legenda-pequena", text: CONFIG.fotos2026.legenda })
        ),
        el("button", { type: "button", class: "btn-txt", onclick: () => abrirTour(CONFIG, u) }, "Mais fotos"),
        el(
          "section",
          { class: "det-bloco" },
          el("h3", { text: "Compartilhar" }),
          el("button", { type: "button", class: "btn-txt", id: "btn-copiar", onclick: () => copiarLink(u) }, "Copiar link desta unidade"),
          el("input", { class: "link-txt mono", id: "link-txt", readonly: true, value: linkUnidade(u), "aria-label": "Link desta unidade" })
        ),
        el("p", { class: "legenda-pequena", text: `Fonte: ${CONFIG.fonteTabela}${u.fonte?.includes("pagina") ? ", " + u.fonte.split(", ")[1].replace("pagina", "página") : ""}.` })
      )
    )
  ].filter(Boolean));
  corpo.scrollTop = 0;
  if (planta && planta.tipo !== "original") {
    const box = corpo.querySelector(".planta-box");
    box.after(el("button", { type: "button", class: "btn-txt", onclick: (e) => {
      const on = box.classList.toggle("aplicada");
      e.currentTarget.textContent = on ? "Ver o desenho original" : `Ver ${planta.tipo} como no final ${u.final}`;
    } }, `Ver ${planta.tipo} como no final ${u.final}`));
  }
  estavaListaAberta = !$("#unidades").hidden;
  $("#unidades").hidden = true;
  $("#card").hidden = false;
  corpo.scrollTop = 0;
  requestAnimationFrame(() => {
    if (app.unidade === id) corpo.scrollTop = 0;
  });
  atualizarPainel();
  manifestoTour360().catch(() => null).then(async (t360) => [t360, t360 ? null : await import("./splat-interior.js").then((m) => m.splatDisponivel()).catch(() => null)]).then(([t360, spl]) => {
    const b = $("#btn-splat");
    if (!b || app.unidade !== id || !(t360 || spl)) return;
    b.hidden = false;
    if (t360) {
      b.firstChild.textContent = "Entrar no apartamento";
      const sm = b.querySelector(".btn-sub");
      if (sm) sm.textContent = "tour 360° por dentro, com a vista deste andar";
      const c = $("#cd-360");
      if (c) c.hidden = false;
    }
  });
  if (!interiorMod && b7Ativo("interiorProcedural")) setTimeout(() => {
    carregarInterior().catch(() => {
    });
  }, 1200);
  carregarSol().then((S) => {
    if (app.unidade !== id) return;
    const est = S.rel.info().est;
    const linha = S.resumoSolUnidade(S.SOL, u, est);
    const chip = $("#cd-sol-linha");
    if (chip) {
      chip.lastChild.textContent = linha || "";
      chip.hidden = !linha;
      chip.classList.toggle("sem", /^Sem sol/.test(linha || ""));
    }
    desligarSolCard();
    const sec = S.secaoSolUnidade(S.rel, CONFIG, u);
    $("#det-sol").replaceWith(sec);
    app._solCard = sec;
    app._solLinha = S.rel.ouvir((i) => {
      if (app.unidade !== id) return;
      const l = S.resumoSolUnidade(S.SOL, u, i.est);
      const n = $("#cd-sol-linha");
      if (n) {
        n.lastChild.textContent = l || "";
        n.hidden = !l;
        n.classList.toggle("sem", /^Sem sol/.test(l || ""));
      }
    });
  }).catch((e) => console.error(e));
  try {
    history.replaceState(null, "", `#u${u.numero}`);
  } catch (e) {
  }
}
function blocoLocacao(u) {
  const L = CART.locacao;
  if (!L) return REVISAO ? el("p", { class: "cd-loc-falta" }, texto("[falta: condomínio, IPTU, aluguel e diária de referência (documento do corretor)]")) : null;
  const cel = (rot, v, suf) => v == null ? null : el("div", { class: "cd-loc-c" }, el("small", { text: rot }), el("b", { class: "mono" }, brlCurto(v), suf || ""));
  const condo = L.condominio ? L.condominio.porUnidade ?? (L.condominio.porM2 != null && L.condominio.rateio === "fracao" ? L.condominio.porM2 * u.area_m2 : null) : null;
  const iptu = L.iptu ? L.iptu.porUnidadeMes ?? (L.iptu.porM2 != null ? L.iptu.porM2 * u.area_m2 : null) : null;
  const celulas = [
    cel("Condomínio", condo, "/mês"),
    cel("IPTU", iptu, "/mês"),
    cel("Long stay · referência", L.longStay && L.longStay.aluguelMedio, "/mês"),
    cel("Short stay · diária média", L.shortStay && L.shortStay.diariaMedia)
  ].filter(Boolean);
  if (!celulas.length) return null;
  return el(
    "section",
    { class: "cd-loc", id: "cd-loc" },
    el("div", { class: "cd-loc-g" }, ...celulas),
    el("p", { class: "cd-loc-nota", text: `Referências de locação: ${L.fonte || "documento do corretor"}${L.periodo ? ", " + L.periodo : ""}. Não constituem garantia de renda.` }),
    u.preco_total != null ? el("button", {
      type: "button",
      class: "cd-simular",
      id: "btn-simular",
      onclick: () => import("./predio-detalhes.js").then((m) => m.abrirSimulador({ u, L, condo, iptu }))
    }, "Simular rentabilidade desta unidade") : null
  );
}
function desligarSolCard() {
  if (app._solCard && app._solCard._desligar) app._solCard._desligar();
  if (app._solLinha) app._solLinha();
  app._solCard = null;
  app._solLinha = null;
}
function fecharCard() {
  desligarSolCard();
  $("#card").hidden = true;
  app.cena?.pararPreCarga?.();
  app.unidade = null;
  if (app.cena) {
    app.cena.marcarUnidade(null);
  }
  document.querySelectorAll(".cel.sel,.foto-svg g.sel").forEach((c) => c.classList.remove("sel"));
  atualizarPainel();
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch (e) {
  }
}
async function copiarLink(u) {
  const b = $("#btn-copiar");
  try {
    await navigator.clipboard.writeText(linkUnidade(u));
    b.textContent = "Link copiado";
  } catch (e) {
    const i = $("#link-txt");
    i.focus();
    i.select();
    b.textContent = "Selecione e copie o link";
  }
  setTimeout(() => {
    b.textContent = "Copiar link desta unidade";
  }, 2600);
}
const precoCurtoMi = (v) => "R$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " mi";
function mostrarEtiqueta(h) {
  const e = $("#etiqueta");
  if (!h) {
    e.hidden = true;
    return;
  }
  if (h.tipo === "sol") {
    const i = solMod?.rel.info();
    e.replaceChildren(el("b", { text: i ? i.hora : "" }), " · arraste o sol");
  } else {
    const u = h.u;
    const s = STATUS[u.situacao].rotulo;
    const preco = u.preco_total ? " · " + precoCurtoMi(u.preco_total) : "";
    e.replaceChildren(el("b", { text: u.numero }), ` · ${s}${preco}`);
  }
  e.style.left = h.x + "px";
  e.style.top = h.y + "px";
  e.hidden = false;
}
let solMod = null;
let solPromessa = null;
function carregarSol() {
  if (solMod) return Promise.resolve(solMod);
  if (!solPromessa) solPromessa = carregarSolUmaVez().catch((e) => {
    solPromessa = null;
    throw e;
  });
  return solPromessa;
}
async function carregarSolUmaVez() {
  const [dados, mod] = await Promise.all([import("./dados-sol.js"), import("./sol.js")]);
  const rel = mod.criarRelogio(dados.SOL, CONFIG);
  solMod = { ...mod, SOL: dados.SOL, VIZ: dados.VIZINHOS, rel, ctl: null };
  let estAnt = null;
  let solPend = null, solRaf = 0, estPend = false;
  rel.ouvir((i) => {
    if (i.est !== estAnt) {
      estAnt = i.est;
      estPend = true;
    }
    solPend = i;
    if (!solRaf) solRaf = requestAnimationFrame(() => {
      solRaf = 0;
      const est = estPend ? dados.SOL.estacoes[solPend.est] : null;
      estPend = false;
      aplicarSol(solPend, est);
    });
  });
  return solMod;
}
let solAtivo = false;
function aplicarSol(i, estacao) {
  const noite = i.noite > 0.5;
  if (app.cena && solAtivo) app.cena.setSol(i, { estacao, movendo: i.segurando });
  $("#cena").classList.toggle("noite", solAtivo && noite);
  const leg = $("#noite-legenda");
  leg.hidden = true;
  document.querySelector(".legenda")?.classList.toggle("noite", solAtivo && noite && app.vista !== "foto");
  const foto = $("#foto");
  foto.style.setProperty("--noite", "0");
  foto.style.setProperty("--luzes", "0");
  foto.classList.remove("noite");
  if (interiorMod && interiorAberto) {
    interiorMod.definirEstacao?.(i.est);
    interiorMod.definirHora?.(i.t);
  }
}
function modoSombra() {
  const forcado = params.get("sombra");
  if (forcado === "real" || forcado === "pre") return forcado;
  const t = app.gpu?.tier;
  if (t && t.type === "BENCHMARK") return t.tier >= 2 ? "real" : "pre";
  return "real";
}
async function alternarSol(_onde, abrir) {
  const S = await carregarSol();
  solAtivo = abrir ?? !solAtivo;
  $("#btn-sol").setAttribute("aria-pressed", solAtivo ? "true" : "false");
  const painel = $("#sol-painel");
  if (!S.ctl) S.ctl = S.controleSol(S.rel, CONFIG);
  if (solAtivo && !interiorAberto && S.ctl.parentNode !== painel) painel.replaceChildren(S.ctl);
  painel.hidden = !solAtivo;
  ajustarDeslocamento();
  if (app.cena) {
    if (solAtivo) {
      app.cena.iniciarSol(S.SOL, S.VIZ, { modo: modoSombra() });
      const i = S.rel.info();
      app.cena.setSol(i, { estacao: S.SOL.estacoes[i.est] });
    } else app.cena.desligarSol();
  }
  aplicarSol(S.rel.info(), null);
}
let interiorMod = null, interiorAberto = false;
let tour360Url = void 0;
let tour360Promessa = null;
function manifestoTour360() {
  return tour360Promessa || (tour360Promessa = carregaManifestoTour360());
}
async function carregaManifestoTour360() {
  if (tour360Url !== void 0) return tour360Url;
  tour360Url = null;
  const amostra = params.get("tour360") === "amostra";
  const url = amostra ? CONFIG.demo.tour360Amostra : CONFIG.demo.tour360Manifesto;
  if (params.get("tour360") === "0") return null;
  if (!amostra && !CONFIG.demo.tour360Ativo) return null;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-cache" });
    if (r.ok) {
      const m = limparManifesto360(await r.json(), url);
      if (m) tour360Url = m;
    }
  } catch (e) {
  }
  return tour360Url;
}
const CAMADAS_BASE = ["ceu", "sol", "noite", "fora", "albedo", "normal", "solvis", "solind", "vidro"];
function limparManifesto360(man, url) {
  if (!man || !Array.isArray(man.pontos)) return null;
  const completo = (p) => p && p.id && p.camadas && p.camadas.ceu && p.camadas.ceu.arq;
  const pontos = man.pontos.filter(completo).map((p) => {
    const camadas = {};
    for (const [k, v] of Object.entries(p.camadas)) if (CAMADAS_BASE.includes(k) || (man.cena && man.cena.luzes || []).includes(k)) camadas[k] = v;
    return { ...p, camadas };
  });
  const ids = new Set(pontos.map((p) => p.id));
  pontos.forEach((p) => {
    if (Array.isArray(p.vizinhos)) p.vizinhos = p.vizinhos.filter((v) => ids.has(v));
  });
  if (!pontos.length) return null;
  return { ...man, pontos, base: man.base || url.replace(/[^/]*$/, "") };
}
async function carregarInterior() {
  if (interiorMod) return interiorMod;
  const man = await manifestoTour360();
  if (man) {
    try {
      const t = await import("./tour360.js");
      interiorMod = {
        tour360: true,
        abrirInterior: (o) => t.abrirTour360({
          container: o.container,
          manifesto: man,
          estacao: o.estacao,
          minutos: o.minutos,
          aoFechar: o.aoFechar,
          teste: o.teste,
          andar: porId.get(o.id)?.andar,
          final: porId.get(o.id)?.final,
          numero: porId.get(o.id)?.numero,
          torre: porId.get(o.id)?.torre
        }),
        definirHora: t.definirHora,
        definirEstacao: t.definirEstacao,
        fecharInterior: t.fecharTour360
      };
      return interiorMod;
    } catch (e) {
      console.error("tour360 indisponivel, usando o interior 3D", e);
    }
  }
  try {
    interiorMod = await import("./interior.js");
  } catch (e) {
    interiorMod = {
      stub: true,
      async abrirInterior({ id, container }) {
        container.replaceChildren(el(
          "div",
          { class: "interior-stub" },
          el(
            "div",
            {},
            el("p", { style: "font:700 22px var(--f-display);color:var(--texto);margin:0 0 8px", text: `Unidade ${porId.get(id)?.numero}` }),
            el("p", { text: "A visita por dentro está sendo preparada." })
          )
        ));
      },
      definirHora() {
      },
      definirEstacao() {
      },
      fechar() {
      }
    };
  }
  return interiorMod;
}
let fotosGaleria = CONFIG.fotos2026.lista.map((f) => ({ ...f, legenda: CONFIG.fotos2026.legenda }));
(async () => {
  if (!CONFIG.demo.rendersManifesto) return;
  try {
    const r = await fetch(CONFIG.demo.rendersManifesto, { cache: "no-cache" });
    if (!r.ok) return;
    const m = await r.json();
    const extras = (m.fotos || []).slice(0, 4).map((f) => ({
      arq: new URL(f.arq, new URL(CONFIG.demo.rendersManifesto, location.href)).href,
      texto: f.texto || "",
      legenda: f.legenda || "Imagem ilustrativa fiel ao apartamento — render a partir de fotos e medidas"
    }));
    if (extras.length) {
      fotosGaleria = [...extras, ...fotosGaleria];
      app.rendersDemo = extras.length;
    }
  } catch (e) {
  }
})();
function galeriaMiniaturas() {
  return el("div", { class: "cd-galeria" }, ...fotosGaleria.map((f, i) => el(
    "button",
    { type: "button", onclick: () => abrirGaleria(i), "aria-label": `Abrir foto: ${f.texto}` },
    el("img", { src: f.arq.replace(/\.webp$/, "-mini.webp").replace("-mini-mini", "-mini"), alt: "", loading: "lazy", onerror: (e) => {
      e.target.src = f.arq;
    } })
  )));
}
let galAtual = 0;
function abrirGaleria(i) {
  const g = $("#galeria"), tr = $("#gal-trilho");
  tr.replaceChildren(...fotosGaleria.map((f) => el(
    "figure",
    { class: "lb-slide" },
    el("img", { src: f.arq, alt: f.texto, loading: "lazy" }),
    el("figcaption", { text: f.texto })
  )));
  g.hidden = false;
  const ir = (k, suave) => {
    galAtual = Math.max(0, Math.min(fotosGaleria.length - 1, k));
    tr.scrollTo({ left: galAtual * tr.clientWidth, behavior: suave ? "smooth" : "instant" });
    $("#gal-cont").textContent = `${galAtual + 1} / ${fotosGaleria.length}`;
    $("#gal-legenda").textContent = fotosGaleria[galAtual].legenda;
  };
  tr.onscroll = () => {
    const k = Math.round(tr.scrollLeft / tr.clientWidth);
    if (k !== galAtual) {
      galAtual = k;
      $("#gal-cont").textContent = `${k + 1} / ${fotosGaleria.length}`;
      $("#gal-legenda").textContent = fotosGaleria[k].legenda;
    }
  };
  $("#gal-ant").onclick = () => ir(galAtual - 1, true);
  $("#gal-prox").onclick = () => ir(galAtual + 1, true);
  $("#gal-fechar").onclick = () => {
    g.hidden = true;
  };
  requestAnimationFrame(() => ir(i, false));
}
const vistaInterior = /* @__PURE__ */ new Map();
let historicoEmpurrado = false, entrando = false;
function preencherBarraInterior(u) {
  const s = STATUS[u.situacao];
  $("#ib-txt").replaceChildren(
    el("span", { class: "ib-l1" }, [
      el("b", { text: `Unidade ${u.numero}` }),
      el("span", { class: "ib-andar", text: ` · ${u.andar}º andar` }),
      el("span", { class: "ib-sep", text: " · " }),
      el("span", { class: `ib-sit ${u.situacao}`, text: s.rotulo })
    ]),
    el("span", { class: "ib-l2" }, [
      el("span", { class: "ib-andar-c" }, `${u.andar}º`, el("span", { class: "ib-andar-p", text: " andar" }), u.preco_total != null ? " · " : ""),
      u.preco_total != null ? el("span", { class: "mono ib-preco", text: brl(u.preco_total).replace(",00", "") }) : "",
      u.preco_total != null ? el("span", { class: "mono ib-preco-curto", text: precoCurtoMi(u.preco_total) }) : ""
    ])
  );
  $("#int-detalhes").hidden = true;
  $("#int-det-eyebrow").textContent = `${u.andar}º andar · final ${u.final}`;
  $("#int-det-titulo").replaceChildren("Unidade ", el("span", { class: "mono", text: u.numero }));
  const planta = PLANTA[u.final];
  const temPreco = u.preco_total != null;
  $("#int-det-corpo").replaceChildren(el(
    "div",
    { class: "det-corpo" },
    el("span", { class: `selo ${u.situacao}`, style: "justify-self:start;margin:0" }, el("i", { class: `dot ${u.situacao}`, "aria-hidden": "true" }), s.rotulo),
    temPreco ? el(
      "section",
      { class: "det-bloco" },
      el("h3", { text: "Pagamento" }),
      el(
        "ol",
        { class: "pag" },
        el("li", {}, el("span", { text: "Valor total" }), el("span", { class: "mono", text: brl(u.preco_total) })),
        el("li", {}, el("span", { text: `Ato · ${u.ato.pct}%` }), el("span", { class: "mono", text: brl(u.ato.valor) })),
        el("li", {}, el("span", { text: `Saldo · ${u.parcela.pct}%` }), el("span", { class: "mono", text: brl(u.parcela.valor) }))
      )
    ) : null,
    el(
      "section",
      { class: "det-bloco" },
      el("h3", { text: "Unidade" }),
      el(
        "ol",
        { class: "pag" },
        el("li", {}, el("span", { text: "Área privativa" }), el("span", { class: "mono", text: m2(u.area_m2) })),
        el("li", {}, el("span", { text: "Vaga" }), el("span", { class: "mono", text: u.vaga != null ? String(u.vaga) : "a confirmar" })),
        temPreco ? el("li", {}, el("span", { text: "R$ por m²" }), el("span", { class: "mono", text: brl(u.preco_m2) })) : null
      )
    ),
    el("ul", { class: "avisos" }, ...CONFIG.avisosCardCurto.map((t) => el("li", { text: t }))),
    el(
      "section",
      { class: "det-bloco" },
      el("h3", { text: "Planta" }),
      planta ? el("div", { class: `planta-box ${planta.tipo}` }, el("img", { src: CONFIG.planta.arquivo, alt: CONFIG.planta.alt, loading: "lazy", width: CONFIG.planta.largura, height: CONFIG.planta.altura })) : el("div", { class: "planta-falta" }, "Planta deste final em breve"),
      el("p", { class: "legenda-pequena", text: planta ? planta.texto + " Ilustração artística." : "" })
    ),
    el(
      "section",
      { class: "det-bloco" },
      el("h3", { text: CONFIG.fotos2026.titulo }),
      galeriaMiniaturas(),
      el("p", { class: "legenda-pequena", text: CONFIG.fotos2026.legenda })
    )
  ));
}
async function entrarApartamento(id, { semAnimacao = false } = {}) {
  if (!b7Ativo("interiorProcedural") && !await manifestoTour360().catch(() => null)) {
    abrirPasseioReal();
    return;
  }
  const u = porId.get(id);
  if (!u || interiorAberto || entrando) return;
  entrando = true;
  try {
    const carga = Promise.all([carregarSol(), carregarInterior()]);
    if (app.cena && app.vista !== "foto" && !semAnimacao) await app.cena.irParaJanela(id);
    const [S, M] = await carga;
    interiorAberto = true;
    preencherBarraInterior(u);
    $("#interior").hidden = false;
    if (!S.ctl) S.ctl = S.controleSol(S.rel, CONFIG);
    const i = S.rel.info();
    if (M.stub || M.tour360) $("#interior-sol").append(S.ctl);
    const api = await M.abrirInterior({
      id,
      estacao: i.est,
      minutos: i.t,
      container: $("#interior-cena"),
      teste: TESTE,
      controleSol: M.stub || M.tour360 ? null : S.ctl,
      aoMudarSol: ({ estacao, minutos }) => {
        if (estacao) S.rel.estacao(estacao);
        if (minutos != null) S.rel.hora(minutos);
      },
      aoFechar: () => pedirSaida("modulo")
    });
    espelharEstadoInterior(S.ctl);
    legendaVistaInterior();
    const v = vistaInterior.get(id);
    if (v && api && api.irVista) api.irVista(v);
    app.interior = { id, stub: !!M.stub, tour360: !!M.tour360, api };
    if (M.tour360) DICAS.dentro($("#interior-cena"));
    try {
      history.pushState({ interior: id }, "", `#u${u.numero}-dentro`);
      historicoEmpurrado = true;
    } catch (e) {
      historicoEmpurrado = false;
    }
  } finally {
    entrando = false;
  }
}
let obsEstado = null;
let obsVista = null;
function legendaVistaInterior() {
  if (obsVista) obsVista.disconnect();
  const raiz = document.querySelector("#interior");
  const rot = raiz && raiz.querySelector(".int-vista-rot");
  if (!raiz || !rot) return;
  let cap = raiz.querySelector(".int-rodape");
  if (!cap) {
    cap = document.createElement("p");
    cap.className = "int-rodape";
    raiz.append(cap);
  }
  const atualizar = () => {
    const v = raiz.querySelector('.int-vistas button[aria-pressed="true"]')?.dataset.v;
    cap.textContent = rot.textContent;
    cap.hidden = !(v === "janela" || v === "varanda") || !rot.textContent;
  };
  atualizar();
  obsVista = new MutationObserver(atualizar);
  obsVista.observe(rot, { childList: true, characterData: true, subtree: true });
  raiz.querySelectorAll(".int-vistas button").forEach((b) => obsVista.observe(b, { attributes: true, attributeFilter: ["aria-pressed"] }));
}
function espelharEstadoInterior(ctl) {
  if (obsEstado) obsEstado.disconnect();
  const fonte = document.querySelector("#interior .int-estado .int-txt");
  if (!fonte || !ctl || !ctl._marcarEstado) return;
  const tmp = document.createElement("div");
  const copiar = () => {
    tmp.innerHTML = fonte.innerHTML.replace(/<br\s*\/?>/gi, "\n");
    const t = tmp.textContent.split(/\n+/).map((x) => x.trim()).filter(Boolean).join(" · ").replace(/Neste dia: sem sol/, "neste dia sem sol").replace(/Neste dia:/, "sol neste dia:");
    if (t) ctl._marcarEstado(t.replace(/^[^—]*—\s*/, ""));
    ctl.title = t;
  };
  copiar();
  obsEstado = new MutationObserver(copiar);
  obsEstado.observe(fonte, { childList: true, characterData: true, subtree: true });
}
function pedirSaida(origem) {
  if (!interiorAberto) return;
  if (historicoEmpurrado && origem !== "voltar") {
    historicoEmpurrado = false;
    let feito = false;
    const fallback = setTimeout(() => {
      if (!feito) sairApartamento(origem);
    }, 450);
    window.addEventListener("popstate", () => {
      feito = true;
      clearTimeout(fallback);
    }, { once: true });
    try {
      history.back();
    } catch (e) {
      clearTimeout(fallback);
      sairApartamento(origem);
    }
    return;
  }
  sairApartamento(origem);
}
function sairApartamento(origem) {
  if (!interiorAberto) return;
  interiorAberto = false;
  const id = app.interior?.id;
  const pressed = document.querySelector('#interior .int-vistas [aria-pressed="true"]');
  if (id && pressed) vistaInterior.set(id, pressed.dataset.v);
  if (origem !== "modulo") {
    try {
      (interiorMod?.fecharInterior || interiorMod?.fechar)?.();
    } catch (e) {
    }
  }
  $("#interior").hidden = true;
  $("#int-detalhes").hidden = true;
  $("#interior-cena").replaceChildren();
  if (obsEstado) {
    obsEstado.disconnect();
    obsEstado = null;
  }
  if (solMod?.ctl) {
    const sb = solMod.ctl.querySelector(".sol-sub");
    if (sb) delete sb.dataset.externo;
    solMod.rel.hora(solMod.rel.info().t);
  }
  if (solMod?.ctl) {
    $("#sol-painel").replaceChildren(solMod.ctl);
    $("#sol-painel").hidden = !solAtivo;
  }
  app.interior = null;
  app.ultimaSaida = origem;
  if (id) {
    if ($("#card").hidden || app.unidade !== id) abrirUnidade(id);
    if (app.cena) app.cena.voltarDaJanela();
  }
  try {
    if (id) history.replaceState(null, "", `#u${porId.get(id).numero}`);
  } catch (e) {
  }
}
async function carregarVistaFoto() {
  const vf = CONFIG.vistaFoto;
  let svgTxt = null;
  try {
    const r = await fetch(vf.svg, { cache: "no-cache" });
    if (r.ok) svgTxt = await r.text();
  } catch (e) {
  }
  if (!svgTxt || !svgTxt.includes("<svg")) return;
  const box = $("#foto-box");
  box.replaceChildren(el("img", { src: vf.imagem, alt: vf.legenda, class: "foto-img", width: 1080, height: 1920 }));
  const tmp = document.createElement("div");
  tmp.innerHTML = svgTxt;
  const svg = tmp.querySelector("svg");
  if (!svg) return;
  svg.querySelectorAll("script,foreignObject").forEach((n) => n.remove());
  svg.classList.add("foto-svg");
  svg.setAttribute("preserveAspectRatio", "none");
  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };
  const defs = mk("defs");
  const cpA = mk("clipPath", { id: "cp-acesa" }), cpF = mk("clipPath", { id: "cp-fraca" });
  const quente = mk("filter", { id: "f-quente", "color-interpolation-filters": "sRGB" });
  quente.append(mk("feColorMatrix", { type: "matrix", values: "1.55 .25 0 0 .16  .12 1.05 .05 0 .08  0 .05 .55 0 0  0 0 0 1 0" }));
  const fraca = mk("filter", { id: "f-fraca", "color-interpolation-filters": "sRGB" });
  fraca.append(mk("feColorMatrix", { type: "matrix", values: ".8 .12 0 0 .05  .06 .52 0 0 .02  0 0 .22 0 0  0 0 0 1 0" }));
  const bloom = mk("filter", { id: "f-bloom", x: "-20%", y: "-20%", width: "140%", height: "140%" });
  bloom.append(mk("feGaussianBlur", { stdDeviation: "7" }));
  defs.append(cpA, cpF, quente, fraca, bloom);
  const camada = mk("g", { class: "camada-noite" });
  const imgA = mk("image", { href: vf.imagem, x: 0, y: 0, width: 1080, height: 1920, preserveAspectRatio: "none", "clip-path": "url(#cp-acesa)", filter: "url(#f-quente)" });
  const imgF = mk("image", { href: vf.imagem, x: 0, y: 0, width: 1080, height: 1920, preserveAspectRatio: "none", "clip-path": "url(#cp-fraca)", filter: "url(#f-fraca)" });
  const brilho = mk("g", { filter: "url(#f-bloom)", opacity: ".38", style: "mix-blend-mode:screen" });
  camada.append(brilho, imgF, imgA);
  svg.prepend(defs);
  svg.insertBefore(camada, defs.nextSibling);
  svg.querySelectorAll("g[data-id]").forEach((g) => {
    const u = porId.get(g.getAttribute("data-id"));
    if (!u) {
      g.remove();
      return;
    }
    g.classList.add(u.situacao);
    g.dataset.uid = u.id;
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", `Unidade ${u.numero}, ${STATUS[u.situacao].rotulo}`);
    const vid = g.querySelector(".vidro");
    const nivel = nivelNoite(u.situacao);
    if (vid && nivel === "acesa") {
      cpA.append(vid.cloneNode());
      const b = vid.cloneNode();
      b.setAttribute("fill", "#ffb24d");
      brilho.append(b);
    }
    if (vid && nivel === "fraca") cpF.append(vid.cloneNode());
    g.addEventListener("click", () => abrirUnidade(u.id));
    g.addEventListener("dblclick", () => entrarApartamento(u.id));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrirUnidade(u.id);
      }
    });
    g.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") mostrarEtiqueta({ tipo: "unidade", u, x: e.clientX, y: e.clientY });
    });
    g.addEventListener("pointerleave", () => mostrarEtiqueta(null));
  });
  box.append(svg);
  app.temFoto = true;
  app.fotoUnidades = svg.querySelectorAll("g[data-uid]").length;
  $("#btn-vista").hidden = true;
  aplicarFiltro();
}
function mostrarVista(qual) {
  if (qual === "foto") return;
  app.vista = qual;
  $("#foto").hidden = qual !== "foto";
  $("#cena").style.visibility = qual === "foto" ? "hidden" : "visible";
  $("#btn-vista-txt").textContent = qual === "foto" ? "Maquete" : "Foto";
  $("#btn-vista").setAttribute("aria-label", qual === "foto" ? "Ver a maquete 3D" : "Ver a foto do prédio");
  document.body.classList.toggle("vista-foto", qual === "foto");
  document.body.classList.toggle("sem3d", app.modo3d === "sem3d");
  if (qual === "foto" && app.modo3d !== "sem3d") {
    painelUnidades(false);
    if (!$("#card").hidden) fecharCard();
  }
  if (qual !== "foto" && app.cena) app.cena.pedirRender();
  if (solMod) aplicarSol(solMod.rel.info(), null);
}
function webgl2Ok() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return { ok: false, motivo: "WebGL2 indisponível" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const rend = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true, renderer: String(rend) };
  } catch (e) {
    return { ok: false, motivo: "erro ao criar WebGL2" };
  }
}
async function tierGpu() {
  try {
    const mod = await Promise.race([import("detect-gpu"), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout import")), 2500))]);
    return await Promise.race([
      mod.getGPUTier({ benchmarksURL: new URL("./vendor/detect-gpu@5.0.70/dist/benchmarks", import.meta.url).href }),
      new Promise((res) => setTimeout(() => res({ tier: -1, type: "TIMEOUT" }), 2500))
    ]);
  } catch (e) {
    return { tier: -1, type: "ERRO", erro: String(e.message || e) };
  }
}
async function iniciar3D() {
  if (FORCAR_SEM_3D) return semTresD("modo sem 3D forçado");
  const gl = webgl2Ok();
  app.gpu = { webgl2: gl };
  if (!gl.ok) return semTresD(gl.motivo);
  const t = await tierGpu();
  app.gpu.tier = t;
  const soft = /swiftshader|llvmpipe|software/i.test(gl.renderer || "");
  if (t.tier === 0 && !(TESTE && soft)) return semTresD(`placa de vídeo classificada como fraca (${t.type})`);
  try {
    const { criarCena } = await import("./cena3d.js");
    app.cena = criarCena({
      container: $("#cena"),
      predio: PREDIO,
      unidades: UNIDADES,
      teste: TESTE,
      onTocarUnidade: (u) => abrirUnidade(u.id),
      onDuploToque: (u) => {
        abrirUnidade(u.id);
        entrarApartamento(u.id);
      },
      onTocarAndar: (a) => destacarAndar(a),
      onHover: mostrarEtiqueta,
      onArrastarSol: (t2, fase) => {
        if (solMod) solMod.rel.arrastar(t2, fase);
      }
    });
    app.modo3d = "3d";
    ajustarDeslocamento();
    DICAS.maquete({
      cena: app.cena,
      destaqueId: unidadeDaAbertura()?.id,
      disponiveis: UNIDADES.filter((u) => u.situacao === "disponivel").sort((a, b) => b.andar - a.andar).map((u) => u.id)
    });
    if (filtroAtivo()) app.cena.setFiltro(passaFiltro);
    if (app.unidade) app.cena.marcarUnidade(app.unidade);
    alternarSol("cena", true);
  } catch (e) {
    console.error(e);
    semTresD("erro ao montar o 3D: " + (e.message || e));
  }
}
function semTresD(motivo) {
  app.modo3d = "sem3d";
  app.motivoSem3d = motivo;
  $("#cena").setAttribute("data-ready", "1");
  $("#cena").replaceChildren(el(
    "div",
    { class: "interior-stub" },
    el(
      "div",
      {},
      el("p", { style: "font:700 20px var(--f-display);color:var(--texto);margin:0 0 6px", text: "A maquete 3D não abre neste aparelho" }),
      el("p", { text: "Use a lista de unidades: mesmas cores e preços." }),
      el("p", { class: "so-revisao", style: "font-size:12px", text: `Motivo técnico: ${motivo}` })
    )
  ));
  $("#cena").style.background = "var(--base)";
  painelUnidades(true);
}
function fecharAbertura() {
  const ab = $("#abertura");
  if (ab.hidden) return;
  ab.hidden = true;
  if (desktop()) painelUnidades(true);
  if (app.cena) app.cena.pedirRender();
}
function unidadeDaAbertura() {
  const disp = UNIDADES.filter((u) => u.situacao === "disponivel").sort((a, b) => b.andar - a.andar || a.numero - b.numero);
  return disp[0] || MET.destaque(UNIDADES, CART)?.u || null;
}
function entrarPelaAbertura() {
  const u = unidadeDaAbertura();
  if (!u) return;
  fecharAbertura();
  abrirUnidade(u.id);
  entrarApartamento(u.id);
}
function icone360() {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "ico-360");
  s.innerHTML = '<ellipse cx="12" cy="12" rx="9.5" ry="4.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 3.5v4M12 16.5v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="m17.6 14.6 2.2 1.1-1.3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}
function ligar() {
  $("#btn-ver").addEventListener("click", fecharAbertura);
  $("#ab-360").addEventListener("click", entrarPelaAbertura);
  $("#ab-360").prepend(icone360());
  manifestoTour360().catch(() => null).then((t) => {
    if (t && unidadeDaAbertura()) {
      $("#ab-360").hidden = false;
      $("#ab-oferta").hidden = false;
    }
  });
  $("#btn-predio-det").addEventListener("click", () => import("./predio-detalhes.js").then((m) => m.abrirDetalhesPredio({
    U: UNIDADES,
    PREDIO,
    CONFIG,
    MEDIA,
    revisao: REVISAO,
    tabelaLinha: TABELA_LINHA,
    unidadeRef: MET.destaque(UNIDADES, CART)?.u || null,
    linkPredio: linkWhatsapp(null, "predio"),
    aoVerUnidades: () => fecharAbertura()
  })).catch((e) => console.error("detalhes do predio", e)));
  $("#card-fechar").addEventListener("click", fecharCard);
  $("#card-voltar").addEventListener("click", voltarLista);
  $("#btn-foto-real").addEventListener("click", () => {
    if (!$("#card").hidden) fecharCard();
    $("#abertura").hidden = false;
  });
  $("#btn-lista").addEventListener("click", () => {
    if (!$("#card").hidden) voltarLista();
    else escolherUnidade();
  });
  $("#unidades-fechar").addEventListener("click", () => painelUnidades(false));
  $("#btn-unidades").addEventListener("click", () => {
    if (app.vista === "foto" && app.modo3d !== "sem3d") {
      escolherUnidade();
      return;
    }
    if (!$("#card").hidden && !desktop()) fecharCard();
    painelUnidades();
  });
  $("#foto-escolher").addEventListener("click", escolherUnidade);
  $("#btn-sol").addEventListener("click", () => {
    if (app.vista === "foto") mostrarVista("3d");
    alternarSol("cena");
  });
  $("#btn-vista").addEventListener("click", () => mostrarVista(app.vista === "foto" ? "3d" : "foto"));
  if (b7Ativo("entorno") || b7Ativo("entornoFora")) {
    import("./entorno.js").then(({ ATRIBUICAO_ENTORNO }) => {
      const p = $("#legal-entorno");
      p.textContent = ATRIBUICAO_ENTORNO;
      p.hidden = false;
      $("#atrib-curta").hidden = false;
    }).catch(() => {
    });
  }
  const abrirLegal = () => {
    $("#legal").hidden = false;
    $("#legal-fechar").focus();
  };
  $("#btn-legal").addEventListener("click", abrirLegal);
  $("#btn-legal-2").addEventListener("click", abrirLegal);
  $("#legal-fechar").addEventListener("click", () => {
    $("#legal").hidden = true;
  });
  $("#legal").addEventListener("click", (e) => {
    if (e.target.id === "legal") $("#legal").hidden = true;
  });
  $("#interior-fechar").addEventListener("click", () => pedirSaida("botao"));
  $("#ib-det").addEventListener("click", () => {
    $("#int-detalhes").hidden = !$("#int-detalhes").hidden;
  });
  $("#int-det-fechar").addEventListener("click", () => {
    $("#int-detalhes").hidden = true;
  });
  window.addEventListener("popstate", () => {
    if (interiorAberto) sairApartamento("voltar");
  });
  const vizinho = (d) => {
    const u = porId.get(app.unidade);
    if (!u) return;
    const n = FINAIS.length, f = FINAIS[(FINAIS.indexOf(u.final) + d + n) % n];
    abrirUnidade(`${u.andar}-${f}`);
  };
  $("#card-ant").addEventListener("click", () => vizinho(-1));
  $("#card-prox").addEventListener("click", () => vizinho(1));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("#tour").hidden || e.defaultPrevented || $("#splat") && !$("#splat").hidden) return;
    if (!$("#galeria").hidden) {
      $("#galeria").hidden = true;
      return;
    }
    if (!$("#legal").hidden) $("#legal").hidden = true;
    else if (interiorAberto) {
      if (!$("#int-detalhes").hidden) $("#int-detalhes").hidden = true;
      else pedirSaida("tecla");
    } else if (!$("#card").hidden) fecharCard();
  });
}
function deepLink() {
  const m = new RegExp(`^#u(${PREDIO_CFG.unidades.regexNumero})(-dentro)?$`).exec(location.hash || "");
  const u = m && porNumero.get(m[1]);
  if (!u) return false;
  fecharAbertura();
  abrirUnidade(u.id);
  if (m[2]) {
    try {
      history.replaceState(null, "", `#u${u.numero}`);
    } catch (e) {
    }
    entrarApartamento(u.id, { semAnimacao: true });
  }
  return true;
}
preencherTextos();
montarGrade();
montarFiltros();
ligar();
aplicarFiltro();
if (!deepLink() && params.has("semabertura")) fecharAbertura();
function estadoModulo(e) {
  document.documentElement.dataset.estado = e;
  try {
    if (window.parent !== window) window.parent.postMessage({ fonte: "modulo-3d", estado: e, sem3d: app.modo3d === "sem3d" }, "*");
  } catch (er) {
  }
}
estadoModulo("carregando");
document.addEventListener("webglcontextlost", () => estadoModulo("contexto-perdido"), true);
document.addEventListener("webglcontextrestored", () => estadoModulo("pronto"), true);
iniciar3D().finally(async () => {
  document.documentElement.setAttribute("data-app", "pronto");
  if (app.modo3d === "sem3d") document.documentElement.dataset.sem3d = "1";
  if (params.get("modo") === "vitrine") {
    app.vitrinePronta = () => {
      if (document.documentElement.dataset.estado === "carregando") estadoModulo("pronto");
    };
    try {
      const v = await import("./vitrine.js");
      await v.iniciarVitrine(app);
    } catch (e) {
      console.error("vitrine", e);
    }
  }
  if (document.documentElement.dataset.estado === "carregando") estadoModulo("pronto");
});
Object.assign(app, {
  pedirSaida,
  interiorAberto: () => interiorAberto,
  alternarSol,
  carregarSol,
  abrirUnidade,
  fecharCard,
  destacarAndar,
  fecharAbertura,
  painelUnidades,
  mostrarVista,
  passaFiltro,
  entrarApartamento,
  sairApartamento,
  selecionarAndar: destacarAndar
});
