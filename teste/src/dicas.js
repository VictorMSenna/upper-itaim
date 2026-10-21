// ENTRAR-NO-AP (Victor 21/10 ~19h: "se eu mandar o link sem falar nada, a pessoa so percebe que da para entrar no apartamento
// se ler no cartao"): first-visit tips, each shown until the client USES what it teaches, then never again (localStorage with
// the building id; storage blocked = memory only, the tip comes back on the next visit and nothing breaks).
//   maquete(): pill "Toque numa janela..." (#dica, index.html) + a soft pulse on one available window that is really on screen
//              (the highlight unit first). Gone for good when any unit card opens (tap on a window, list, highlight).
//   dentro(container): over the 360, "Arraste para olhar em volta..." Gone for good after a drag or a walk to another point;
//              fades by itself after 10 s without being marked (it shows again on the next entry until used).
// Never a modal, never blocks a tap: every element here has pointer-events: none.
import { chaveLocal } from './predio.js';

const memoria = {};
function usada(nome) {
  try { if (localStorage.getItem(chaveLocal('tabela3d-dica-' + nome)) === '1') return true; } catch (e) { /* private mode */ }
  return !!memoria[nome];
}
function marcar(nome) {
  memoria[nome] = true;
  try { localStorage.setItem(chaveLocal('tabela3d-dica-' + nome), '1'); } catch (e) { /* memory only */ }
}

// ---------------------------------------------------------------- outside: tap a window
let pulso = null, raf = 0, alvoId = null, cenaRef = null, ativa = false;
const desktop = () => window.matchMedia('(min-width: 1000px)').matches;
// a window of the unit is on screen when the hit test at its projected point returns that same unit, outside the panels
function naTela(id) {
  const q = cenaRef && cenaRef.pontoDaUnidade(id);
  if (!q || q.alvo !== id) return null;
  const painel = desktop() && document.body.classList.contains('painel-aberto') ? 440 : 0;
  let baixo = innerHeight - 40;
  // the sun bar always covers the bottom; the list/card are a bottom sheet only on phones (a right panel on computers, above)
  for (const s of desktop() ? ['#sol-painel'] : ['#sol-painel', '#card', '#unidades']) { const e = document.querySelector(s); if (e && !e.hidden && e.offsetParent !== null) baixo = Math.min(baixo, e.getBoundingClientRect().top - 8); }
  const topo = (document.querySelector('#dica')?.getBoundingClientRect().bottom || 0) + 8;
  if (q.x < 16 || q.x > innerWidth - painel - 16 || q.y < topo || q.y > baixo) return null;
  return q;
}
function escolherAlvo(ids) {
  for (const id of ids) if (naTela(id)) return id;
  return null;
}
function passo() {
  raf = 0;
  if (!ativa) return;
  const abertura = document.querySelector('#abertura');
  const livre = abertura && abertura.hidden && document.querySelector('#interior')?.hidden !== false && !document.body.classList.contains('vista-foto');
  let q = livre && alvoId ? naTela(alvoId) : null;
  if (livre && !q) { alvoId = escolherAlvo(candidatos()); q = alvoId ? naTela(alvoId) : null; }
  posicionarDica();
  if (q) { pulso.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`; pulso.hidden = false; } else pulso.hidden = true;
  raf = requestAnimationFrame(passo);
}
let candidatos = () => [];
// phone: right under the chip stack at the top (it grows at night with the night legend); computer: top centre (CSS)
function posicionarDica() {
  const dica = document.querySelector('#dica'); if (!dica) return;
  if (desktop()) { dica.style.top = ''; return; }
  const m = document.querySelector('.topo .marca'); const y = m ? Math.round(m.getBoundingClientRect().bottom + 12) : 140;
  if (dica.style.top !== y + 'px') dica.style.top = y + 'px';
}
export function maquete({ cena, destaqueId, disponiveis }) {
  const dica = document.querySelector('#dica');
  if (!dica || usada('janela')) { if (dica) dica.hidden = true; return; }
  cenaRef = cena;
  // highlight first, then the available units from the top floors down (they stand clear of the neighbours in the start view)
  candidatos = () => [destaqueId, ...disponiveis].filter(Boolean);
  if (!pulso) { pulso = document.createElement('div'); pulso.className = 'dica-pulso'; pulso.setAttribute('aria-hidden', 'true'); pulso.hidden = true; document.querySelector('#palco').append(pulso); }
  dica.hidden = false;
  posicionarDica();
  ativa = true;
  if (!raf) raf = requestAnimationFrame(passo);
}
// called by app.js whenever a unit card opens (window tap, list, highlight, opening button)
export function janelaUsada() {
  if (!usada('janela')) marcar('janela');
  ativa = false;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  const dica = document.querySelector('#dica'); if (dica) dica.hidden = true;
  if (pulso) pulso.hidden = true;
}

// ---------------------------------------------------------------- inside the 360: drag + walk
export function dentro(container) {
  if (!container || usada('360')) return;
  const d = document.createElement('div');
  d.className = 'dica-360';
  d.setAttribute('role', 'status');
  d.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M2.5 12h4.5M2.5 12l2.5-2.5M2.5 12 5 14.5M21.5 12H17m4.5 0L19 9.5m2.5 2.5L19 14.5"/></svg>'
    + '<span><b>Arraste para olhar em volta</b><small>toque nos nomes de baixo para andar pelo apartamento</small></span>';
  container.append(d);
  let ini = null, fim = false, obs = null;
  const sai = (marca) => {
    if (fim) return; fim = true;
    if (marca) marcar('360');
    d.classList.add('some'); setTimeout(() => d.remove(), 450);
    container.removeEventListener('pointerdown', baixo, true); window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', solta, true); container.removeEventListener('click', clique, true); if (obs) obs.disconnect();
  };
  const baixo = (e) => { ini = { x: e.clientX, y: e.clientY }; };
  const move = (e) => { if (ini && Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 14) sai(true); };
  const clique = (e) => { if (e.target.closest && e.target.closest('.t360-chip')) sai(true); };
  const solta = () => { ini = null; };
  container.addEventListener('pointerdown', baixo, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', solta, true);
  container.addEventListener('click', clique, true);
  // a walk by tapping a floor ring changes the point name (tour360.js .t360-nome): that is a use too
  const nome = container.querySelector('.t360-nome'), nome0 = nome ? nome.textContent : null;
  obs = nome ? new MutationObserver(() => { if (nome.textContent !== nome0) sai(true); }) : null;
  if (obs) obs.observe(nome, { childList: true, characterData: true, subtree: true });
  setTimeout(() => sai(false), 10000);
}
