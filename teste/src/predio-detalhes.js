// Card do Hugo (16/10/2026, docs/card-hugo/CARD-ESPEC.md B + T3/T4): "Ver detalhes do prédio" sheet with tabs
// Ativo · Histórico · Mercado · Jurídico · Docs, and the rentability simulator of the unit card.
// Data-driven: every tab reads its block of predio.json "cartao" (locacao, mercado, juridico, docs, ficha, entornoTempos);
// a tab whose block is null/empty does not exist for the client (PROTOCOLO §3 nº 3: [falta] only in ?revisao=1).
// Nothing of a building is written here.
import { el, texto, brl, brlCurto } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (s) => { const [a, m] = String(s).split('-'); return `${MES[+m - 1]}/${a.slice(2)}`; };
const pct = (v) => (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const faltaTxt = (rotulo) => texto(`[falta: ${rotulo}]`);

let raiz = null, empurrado = false, aoFecharAtual = null;

function folha(id, rotuloAria) {
  let f = document.getElementById(id);
  if (f) f.remove();
  f = el('section', { id, class: 'pdet', role: 'dialog', 'aria-modal': 'true', 'aria-label': rotuloAria });
  document.body.append(f);
  return f;
}
function fechar() {
  if (!raiz) return;
  if (empurrado) { empurrado = false; try { history.back(); return; } catch (e) { /* sandbox */ } }
  esconder();
}
function esconder() {
  if (!raiz) return;
  raiz.remove(); raiz = null;
  document.removeEventListener('keydown', teclaEsc, true);
  window.removeEventListener('popstate', aoVoltar);
  const fn = aoFecharAtual; aoFecharAtual = null; if (fn) fn();
}
function teclaEsc(e) { if (e.key === 'Escape' && raiz) { e.preventDefault(); e.stopPropagation(); fechar(); } }
function aoVoltar() { empurrado = false; esconder(); }
function montar(id, rotulo, aoFechar) {
  if (raiz) esconder();
  raiz = folha(id, rotulo);
  aoFecharAtual = aoFechar || null;
  document.addEventListener('keydown', teclaEsc, true);
  // browser / phone "back" closes the sheet (same rule as the 360: back never leaves the page from a sheet)
  try { history.pushState({ pdet: id }, '', location.pathname + location.search + location.hash); empurrado = true; } catch (e) { empurrado = false; }
  window.addEventListener('popstate', aoVoltar);
  return raiz;
}

// ------------------------------------------------------------------ tabs
function linhaFicha(rot, v, revisao, faltaRot) {
  if (v == null || v === '') return revisao ? el('div', { class: 'pd-l' }, el('span', { text: rot }), el('b', {}, faltaTxt(faltaRot || rot))) : null;
  return el('div', { class: 'pd-l' }, el('span', { text: rot }), el('b', { text: String(v) }));
}
function abaAtivo(ctx) {
  const { U, PREDIO, CONFIG, revisao } = ctx;
  const C = CONFIG.cartao || {}, F = C.ficha || {}, L = C.locacao || {};
  const areas = U.map((u) => u.area_m2);
  const fx = `${Math.min(...areas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}–${Math.max(...areas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²`;
  const tip = CONFIG.tipologiaPlural ? CONFIG.tipologiaPlural[0].toUpperCase() + CONFIG.tipologiaPlural.slice(1) : '';
  const inc = [F.incorporadora, F.arquitetura].filter(Boolean).join(' · ');
  const porM2 = (o) => (o && o.porM2 != null ? `${brl(o.porM2)}/m²` : null);
  const linhas = [
    linhaFicha('Entrega', F.entrega, revisao, 'ano do habite-se'),
    linhaFicha('Incorporação · arquitetura', inc || null, revisao, 'incorporadora e arquiteto'),
    linhaFicha('Andares · unidades', `${PREDIO.andares_venda} · ${U.length}`, revisao),
    linhaFicha('Tipologia', `${tip} · ${fx}`, revisao),
    linhaFicha('Imóvel', F.situacao, revisao),
    linhaFicha('Modalidade', F.modalidade, revisao, 'short e/ou long stay'),
    linhaFicha('Operação de short stay', F.operador, revisao, 'operador'),
    linhaFicha('Condomínio médio', porM2(L.condominio), revisao, 'condomínio R$/m²'),
    linhaFicha('IPTU médio', porM2(L.iptu), revisao, 'IPTU R$/m²'),
  ].filter(Boolean);
  const out = [el('h3', { class: 'pd-h', text: 'Ficha técnica do prédio' }), el('div', { class: 'pd-tab' }, ...linhas)];
  if (F.areasComuns && F.areasComuns.length) {
    out.push(el('h3', { class: 'pd-h', text: 'Áreas comuns' }), el('div', { class: 'pd-chips' }, ...F.areasComuns.map((a) => el('span', { class: 'chip', text: a }))));
    if (F.areasComunsNota) out.push(el('p', { class: 'pd-nota', text: F.areasComunsNota }));
  }
  const T = C.entornoTempos;
  const itensT = T ? ['metro', 'fariaLima', 'ibirapuera'].map((k) => T[k]).filter((x) => x && x.min != null) : [];
  if (itensT.length) {
    out.push(el('h3', { class: 'pd-h', text: 'Entorno' }),
      el('div', { class: 'pd-cards' }, ...itensT.map((x) => el('div', { class: 'pd-card' }, el('b', { class: 'mono', text: `${x.min} min` }),
        el('small', { text: `${x.rotulo}${x.modo === 'carro' ? ' · de carro' : ' · a pé'}` })))));
    if (T.fonte) out.push(el('p', { class: 'pd-nota', text: T.fonte }));
  } else if (revisao) out.push(el('h3', { class: 'pd-h', text: 'Entorno' }), el('p', {}, faltaTxt('tempos a pé até metrô, Faria Lima e Ibirapuera')));
  return out;
}
function abaHistorico(ctx) {
  const L = ctx.CONFIG.cartao.locacao, S = L.shortStay || {}, LS = L.longStay || {};
  const cel = (rot, v) => (v == null ? null : el('div', { class: 'pd-card' }, el('small', { text: rot }), el('b', { class: 'mono', text: v })));
  const revpar = S.diariaMedia != null && S.ocupacao12m != null ? brlCurto(S.diariaMedia * S.ocupacao12m) : null; // RevPAR calculated, never typed
  const out = [el('p', { class: 'pd-nota', text: `Desempenho realizado${L.operador ? ' · ' + L.operador : ''}${L.periodo ? ' · ' + L.periodo : ''}` }),
    el('div', { class: 'pd-cards g2' }, ...[cel('Ocupação 12 meses', S.ocupacao12m != null ? pct(S.ocupacao12m) : null), cel('Diária média', S.diariaMedia != null ? brlCurto(S.diariaMedia) : null),
      cel('Receita por noite disponível', revpar), cel('Aluguel long stay médio', LS.aluguelMedio != null ? brlCurto(LS.aluguelMedio) : null)].filter(Boolean))];
  if (Array.isArray(S.mensal) && S.mensal.length) {
    out.push(el('div', { class: 'pd-barras-box' }, el('h3', { class: 'pd-h', text: 'Ocupação mensal' }),
      el('div', { class: 'pd-barras' }, ...S.mensal.map((m) => el('div', { class: 'pd-bar', title: `${mesAno(m.mes)}: ${pct(m.ocupacao)}` },
        el('i', { style: `height:${Math.max(0, Math.min(1, m.ocupacao)) * 100}%` }), el('small', { text: MES[+m.mes.split('-')[1] - 1][0].toUpperCase() }))))));
  }
  out.push(el('p', { class: 'pd-nota', text: `Fonte: ${L.fonte || 'documento do corretor'}${L.documento ? ' (' + L.documento + ')' : ''}. Resultados passados não garantem resultados futuros; os números variam por unidade, operador e momento de mercado.` }));
  return out;
}
function abaMercado(ctx) {
  const M = ctx.CONFIG.cartao.mercado, u = ctx.unidadeRef;
  const linhas = [];
  if (u && u.preco_m2 != null) linhas.push([`Unidade ${u.numero} (tabela)`, u.preco_m2]);
  if (M.predio && M.predio.n >= 3 && M.predio.medianaM2 != null) linhas.push([`${ctx.CONFIG.nome} · transações ITBI (mediana, n=${M.predio.n})`, M.predio.medianaM2]);
  if (M.bairro && M.bairro.n >= 3 && M.bairro.medianaM2 != null) linhas.push([`${M.bairro.rotulo || 'Bairro'} · ${M.bairro.filtro || ''} (mediana, n=${M.bairro.n})`, M.bairro.medianaM2]);
  const max = Math.max(...linhas.map((l) => l[1]), 1);
  const out = [el('p', { class: 'pd-nota', text: `Preço comparado ao mercado · ${M.fonte}${M.janela ? ' · ' + mesAno(M.janela[0]) + '–' + mesAno(M.janela[1]) : ''}` }),
    el('div', { class: 'pd-tab' }, ...linhas.map(([r, v], i) => el('div', { class: 'pd-cmp' }, el('div', { class: 'pd-l' }, el('span', { text: r }), el('b', { class: 'mono', text: `${brlCurto(v)}/m²` })),
      el('div', { class: 'pd-trilho' }, el('i', { class: i === 0 ? 'q' : '', style: `width:${(v / max) * 100}%` })))))];
  if (M.predio && M.predio.n > 0 && M.predio.n < 3) out.push(el('p', { class: 'pd-nota', text: `${ctx.CONFIG.nome}: poucas transações na janela (${M.predio.n}); sem média.` }));
  const ult = (M.predio && M.predio.ultimas) || [];
  if (ult.length) out.push(el('h3', { class: 'pd-h', text: 'Últimas transações no prédio' }),
    el('div', { class: 'pd-tab' }, ...ult.map((t) => el('div', { class: 'pd-l pd-l3' }, el('span', { text: mesAno(t.mes) }), el('span', { class: 'mono', text: `${t.areaConstr.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m²` }), el('b', { class: 'mono', text: `${brlCurto(t.m2)}/m²` })))));
  // the caveats go on the screen, not only in the spec (B.3): area bases, brokerage in the table price
  out.push(el('ul', { class: 'pd-avisos' }, ...(M.notas || []).map((n) => el('li', { text: n }))));
  return out;
}
function abaJuridico(ctx) {
  const J = ctx.CONFIG.cartao.juridico;
  const itens = (J.itens || []).filter((i) => i.verificadoEm);
  const out = [el('p', { class: 'pd-nota', text: J.titulo || 'Documentação verificada' }),
    el('div', { class: 'pd-tab' }, ...itens.map((i) => el('div', { class: 'pd-jur' }, el('i', { class: 'pd-ok', 'aria-hidden': 'true' }),
      el('div', {}, el('b', { text: i.texto }), el('small', { text: `${i.detalhe ? i.detalhe + ' · ' : ''}verificado em ${dataBR(i.verificadoEm)}` })))))];
  if (J.responsavelTexto) out.push(el('div', { class: 'pd-resp' }, el('b', { text: J.responsavelTitulo || '' }), el('p', { text: J.responsavelTexto })));
  return out;
}
function abaDocs(ctx) {
  const D = ctx.CONFIG.cartao.docs;
  const itens = (D.itens || []).filter((i) => i.autorizado && i.arq);
  return [el('p', { class: 'pd-nota', text: 'Material para baixar' }),
    el('div', { class: 'pd-tab' }, ...itens.map((i) => el('a', { class: 'pd-doc', href: i.arq, target: '_blank', rel: 'noopener', download: '' },
      el('div', {}, el('b', { text: i.titulo }), i.sub ? el('small', { text: i.sub }) : null), el('span', { class: 'pd-baixar', 'aria-hidden': 'true', text: '↓' }))))];
}
// which tabs exist (exported so the page check can count them without opening the sheet)
export function abasComDado(CONFIG) {
  const C = CONFIG.cartao || {};
  const L = C.locacao, S = L && L.shortStay;
  return [
    ['ativo', 'Ativo', true],
    ['historico', 'Histórico', !!(L && (S && (S.ocupacao12m != null || S.diariaMedia != null || (S.mensal || []).length) || (L.longStay && L.longStay.aluguelMedio != null)))],
    ['mercado', 'Mercado', !!(C.mercado && ((C.mercado.predio && C.mercado.predio.n > 0) || (C.mercado.bairro && C.mercado.bairro.n >= 3)))],
    ['juridico', 'Jurídico', !!(C.juridico && (C.juridico.itens || []).some((i) => i.verificadoEm))],
    ['docs', 'Docs', !!(C.docs && (C.docs.itens || []).some((i) => i.autorizado && i.arq))],
  ].filter((a) => a[2]);
}
const ABAS = { ativo: abaAtivo, historico: abaHistorico, mercado: abaMercado, juridico: abaJuridico, docs: abaDocs };

export function abrirDetalhesPredio(ctx) {
  const { CONFIG } = ctx;
  const f = montar('predio-det', `Detalhes do ${CONFIG.nome}`, ctx.aoFechar);
  const abas = abasComDado(CONFIG);
  const corpo = el('div', { class: 'pd-corpo', id: 'pd-corpo' });
  const mostrar = (id) => {
    corpo.replaceChildren(...ABAS[id](ctx).filter(Boolean));
    f.querySelectorAll('.pd-abas button').forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === id ? 'true' : 'false'));
    corpo.scrollTop = 0;
  };
  const partes = CONFIG.nome.split(' ');
  f.append(el('div', { class: 'pd-caixa' },
    el('div', { class: 'pd-topo' }, el('button', { type: 'button', class: 'pd-voltar', id: 'pd-voltar', onclick: fechar }, '‹ Resumo'),
      el('span', { class: 'pd-data', text: ctx.tabelaLinha })),
    el('p', { class: 'ab-lugar', text: CONFIG.bairroCidade }),
    el('h2', { class: 'pd-nome' }, partes.slice(0, -1).join(' ') + (partes.length > 1 ? ' ' : ''), el('span', { text: partes.at(-1) })),
    // one tab only (today: Ativo) -> no tab bar, just its content
    abas.length > 1 ? el('div', { class: 'pd-abas', role: 'tablist' }, ...abas.map(([id, rot]) => el('button', { type: 'button', role: 'tab', 'data-aba': id, onclick: () => mostrar(id) }, rot))) : null,
    corpo,
    el('div', { class: 'pd-acoes' },
      el('button', { type: 'button', class: 'btn-pri', id: 'pd-ver', onclick: () => { esconderPorAcao(); ctx.aoVerUnidades && ctx.aoVerUnidades(); } }, 'Ver unidades disponíveis'),
      el('a', { class: 'btn-sec', href: ctx.linkPredio, target: '_blank', rel: 'noopener', id: 'pd-wa' }, `Falar com ${CONFIG.corretorCurto}`))));
  mostrar(abas[0][0]);
  $('#pd-voltar', f).focus({ preventScroll: true });
  return f;
}
// leaving the sheet by an action (Ver unidades): drop our history entry without a visible jump
function esconderPorAcao() {
  if (empurrado) { empurrado = false; window.removeEventListener('popstate', aoVoltar); try { history.back(); } catch (e) { /* */ } }
  esconder();
}

// ------------------------------------------------------------------ rentability simulator (spec T4)
// Only reachable when predio.json cartao.locacao exists (unit card button). Every input on the screen and editable;
// the defaults are the broker's documented references; the ITBI rate and the deed % are editable fields too.
export function abrirSimulador({ u, L, condo, iptu }) {
  const f = montar('simulador', `Simular rentabilidade da unidade ${u.numero}`);
  const S = L.shortStay || {}, LS = L.longStay || {}, P = L.simulador || {};
  const campos = [
    ['preco', 'Preço da unidade (R$)', u.preco_total],
    ['itbiPct', 'ITBI (% do preço)', P.itbiPct ?? null],
    ['escrituraPct', 'Escritura e registro (% do preço)', P.escrituraPct ?? null],
    ['diaria', 'Short stay · diária (R$)', S.diariaMedia ?? null],
    ['ocupacao', 'Short stay · ocupação (%)', S.ocupacao12m != null ? +(S.ocupacao12m * 100).toFixed(1) : null],
    ['taxaOperadorPct', 'Taxa do operador (%)', L.taxaOperadorPct ?? null],
    ['condominio', 'Condomínio (R$/mês)', condo ?? null],
    ['iptu', 'IPTU (R$/mês)', iptu != null ? +iptu.toFixed(2) : null],
    ['custosFixos', 'Outros custos fixos (R$/mês)', P.custosFixos ?? 0],
    ['aluguel', 'Long stay · aluguel (R$/mês)', LS.aluguelMedio ?? null],
    ['taxaAdmPct', 'Taxa de administração do aluguel (%)', P.taxaAdmPct ?? null],
    ['encargosProprietario', 'Encargos do proprietário no long stay (R$/mês)', P.encargosProprietario ?? 0],
  ];
  const ins = {};
  const res = el('div', { class: 'pd-res', id: 'sim-res', 'aria-live': 'polite' });
  const num = (k) => { const v = ins[k].value.trim().replace(/\./g, '').replace(',', '.'); return v === '' ? null : +v; };
  const calcula = () => import('./metricas.js').then((M) => {
    const p = {};
    for (const [k] of campos) p[k] = num(k);
    if (p.ocupacao != null) p.ocupacao /= 100;
    const r = M.rentabilidade(p.preco || 0, p);
    const linha = (t, o) => (o ? el('div', { class: 'pd-l' }, el('span', { text: t }), el('b', { class: 'mono', text: `${brlCurto(o.mensal)}/mês · ${o.pctAno != null ? o.pctAno.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% ao ano' : '—'}` })) : null);
    res.replaceChildren(el('div', { class: 'pd-tab' },
      el('div', { class: 'pd-l' }, el('span', { text: 'Investimento (preço + ITBI + escritura)' }), el('b', { class: 'mono', text: brlCurto(r.investimento) })),
      linha('Short stay · líquido', r.short), linha('Long stay · líquido', r.long)));
  });
  f.append(el('div', { class: 'pd-caixa' },
    el('div', { class: 'pd-topo' }, el('button', { type: 'button', class: 'pd-voltar', onclick: fechar }, `‹ Unidade ${u.numero}`)),
    el('h2', { class: 'pd-nome', text: 'Simular rentabilidade' }),
    el('div', { class: 'pd-corpo' },
      el('div', { class: 'pd-form' }, ...campos.map(([k, rot, v]) => {
        ins[k] = el('input', { type: 'text', inputmode: 'decimal', id: 'sim-' + k, value: v == null ? '' : String(v).replace('.', ','), oninput: calcula });
        return el('label', { for: 'sim-' + k }, el('span', { text: rot }), ins[k]);
      })),
      res,
      el('p', { class: 'pd-nota', text: `Simulação com os números acima (referências: ${L.fonte || 'documento do corretor'}${L.periodo ? ', ' + L.periodo : ''}); não constitui garantia de renda. Short stay: diária × ocupação × 30,4 dias × (1 − taxa do operador) − condomínio − IPTU − custos fixos.` }))));
  calcula();
  return f;
}
