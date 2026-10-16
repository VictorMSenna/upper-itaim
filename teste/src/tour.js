// Photo tour of the furnished studio (photos of apartment 31), opened from the unit card.
import { el, texto } from './util.js';
import { PREDIO_CFG } from './predio.js';

// 15/10 FILA C9: the old photo tour (photos of apt 31, points on the drawing, videos, common areas) comes from predio.json
const TF_ = PREDIO_CFG.tourFotos;
const FOTOS = TF_.fotos;
// hotspot positions in % of the drawing (predio.json planta.arquivo)
const PONTOS = TF_.pontos;
const GRUPOS = TF_.grupos;
const VIDEOS = TF_.videos;
const COMUNS = TF_.comuns;

const $ = (s, r = document) => r.querySelector(s);
let montado = false;
let voltarFoco = null;

function legenda(cfg) {
  return el('p', { class: 'tour-legenda' }, el('b', { text: cfg.tour.legenda }), ` · fotos de ${cfg.tour.dataFotos}`);
}

function montar(cfg) {
  const t = $('#tour');
  const corpo = $('#tour-corpo');
  const planta = el('div', { class: 'tour-planta' },
    el('img', { src: PREDIO_CFG.planta.arquivo, alt: TF_.plantaAlt, width: PREDIO_CFG.planta.largura, height: PREDIO_CFG.planta.altura, loading: 'lazy' }),
    ...PONTOS.map((p) => el('button', {
      type: 'button', class: 'ponto', style: `left:${p.x}%;top:${p.y}%`,
      onclick: () => abrirFoto(cfg, FOTOS.findIndex((x) => x.amb === p.amb)),
      'aria-label': `Fotos: ${p.rot}`,
    }, el('span', { class: 'ponto-dot', 'aria-hidden': 'true' }), el('span', { class: 'ponto-rot', text: p.rot }))));
  const grupos = GRUPOS.map(([amb, nome]) => el('section', { class: 'tour-grupo' },
    el('h3', { text: nome }),
    el('div', { class: 'tour-minis' }, ...FOTOS.map((x, i) => (x.amb !== amb ? null : el('button', {
      type: 'button', class: 'mini', onclick: () => abrirFoto(cfg, i), 'aria-label': `Abrir foto: ${x.t}`,
    }, el('img', { src: `assets/tour/${x.f}-mini.webp`, alt: '', width: 240, height: 160, loading: 'lazy' })))))));
  corpo.replaceChildren(
    legenda(cfg),
    el('p', { class: 'tour-nota', text: TF_.nota }),
    el('div', { class: 'tour-cols' }, planta, el('div', { class: 'tour-grupos' }, ...grupos)),
    el('section', { class: 'tour-videos' },
      el('h3', { text: 'Vídeos curtos' }),
      el('p', { class: 'tour-nota' }, texto(cfg.tour.legendaVideo)),
      el('div', { class: 'tour-vids' }, ...VIDEOS.map((v) => el('figure', {},
        el('video', { src: `assets/tour/${v.f}.mp4`, poster: `assets/tour/${v.f}-poster.webp`, preload: 'none', controls: true, muted: true, playsinline: true, width: 540, height: 960 }),
        el('figcaption', { text: v.t }))))),
    el('section', { class: 'tour-comuns' },
      el('h3', { text: 'Áreas comuns' }),
      el('p', { class: 'tour-nota', text: cfg.tour.legendaComum }),
      el('div', { class: 'tour-minis grande' }, ...COMUNS.map((c) => el('figure', {},
        el('img', { src: `assets/tour/${c.f}.webp`, alt: c.t, loading: 'lazy', width: 1080, height: 1920 }),
        el('figcaption', { text: c.t }))))),
  );
  $('#tour-fechar').addEventListener('click', fechar);
  $('#lb-fechar').addEventListener('click', fecharFoto);
  $('#lb-ant').addEventListener('click', () => passo(-1));
  $('#lb-prox').addEventListener('click', () => passo(1));
  const trilho = $('#lb-trilho');
  trilho.replaceChildren(...FOTOS.map((x) => el('figure', { class: 'lb-slide' },
    el('img', { 'data-src': `assets/tour/${x.f}.webp`, alt: x.t, width: 1080, height: 720 }),
    el('figcaption', { text: x.t }))));
  trilho.addEventListener('scroll', () => {
    const i = Math.round(trilho.scrollLeft / trilho.clientWidth);
    atualizar(i);
  }, { passive: true });
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!$('#lb').hidden) fecharFoto(); else fechar(); }
    if (!$('#lb').hidden && e.key === 'ArrowRight') passo(1);
    if (!$('#lb').hidden && e.key === 'ArrowLeft') passo(-1);
  });
  $('#lb-legenda').replaceChildren(legenda(cfg));
  montado = true;
}

let atual = 0;
function carregar(i) {
  [i - 1, i, i + 1].forEach((k) => {
    const img = document.querySelectorAll('#lb-trilho img')[k];
    if (img && !img.src) img.src = img.dataset.src;
  });
}
function atualizar(i) {
  i = Math.max(0, Math.min(FOTOS.length - 1, i));
  atual = i;
  carregar(i);
  $('#lb-cont').textContent = `${i + 1} / ${FOTOS.length}`;
}
function passo(d) {
  const trilho = $('#lb-trilho');
  const i = Math.max(0, Math.min(FOTOS.length - 1, atual + d));
  trilho.scrollTo({ left: i * trilho.clientWidth, behavior: 'smooth' });
  atualizar(i);
}
function abrirFoto(cfg, i) {
  const lb = $('#lb');
  lb.hidden = false;
  const trilho = $('#lb-trilho');
  atualizar(i);
  requestAnimationFrame(() => { trilho.scrollTo({ left: i * trilho.clientWidth, behavior: 'instant' }); });
  $('#lb-fechar').focus({ preventScroll: true });
}
function fecharFoto() { $('#lb').hidden = true; }

export function abrirTour(cfg, unidade) {
  if (!montado) montar(cfg);
  voltarFoco = document.activeElement;
  $('#tour-sub').textContent = unidade ? `Studio da unidade ${unidade.numero}: mesmo padrão de mobília` : '';
  $('#tour').hidden = false;
  document.body.classList.add('com-tour');
  $('#tour-fechar').focus({ preventScroll: true });
}
function fechar() {
  fecharFoto();
  document.querySelectorAll('#tour video').forEach((v) => v.pause());
  $('#tour').hidden = true;
  document.body.classList.remove('com-tour');
  if (voltarFoco) voltarFoco.focus({ preventScroll: true });
}
window.__tour = { abrirTour, abrirFoto: (i) => abrirFoto(null, i), fechar };
