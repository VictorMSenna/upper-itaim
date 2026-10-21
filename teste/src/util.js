export const brl = (v) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
export const brlCurto = (v) =>
  v == null ? '—' : 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export const m2 = (v) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' m²');
export const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
export const pct = (a, b) => Math.round((a / b) * 100);

export const STATUS = {
  disponivel: { rotulo: 'Disponível', curto: 'Disp.', icone: '✓' },
  reservada: { rotulo: 'Reservada', curto: 'Res.', icone: 'R' },
  indisponivel: { rotulo: 'Indisponível', curto: 'Indisp.', icone: '–' },
};

// 15/10 FILA C4: position of each final and how the architect's drawing applies to it come from predio.json "finais"
// (Upper: the final-6 drawing, note 6 of the plan; finais without a drawing have no "planta")
import { PREDIO_CFG } from './predio.js';
export const POSICAO = Object.fromEntries(Object.entries(PREDIO_CFG.finais).map(([f, v]) => [f, v.posicao]));
export const PLANTA = Object.fromEntries(Object.entries(PREDIO_CFG.finais).filter(([, v]) => v.planta).map(([f, v]) => [f, v.planta]));

export function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) e.append(f instanceof Node ? f : document.createTextNode(String(f)));
  return e;
}

// Text that starts with "[falta" gets a visible marker style
export function texto(v) {
  if (typeof v === 'string' && v.includes('[falta')) {
    const frag = document.createDocumentFragment();
    v.split(/(\[falta[^\]]*\])/).forEach((p) => {
      if (!p) return;
      frag.append(p.startsWith('[falta') ? el('span', { class: 'falta', text: p }) : document.createTextNode(p));
    });
    return frag;
  }
  return document.createTextNode(v ?? '');
}
