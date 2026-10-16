// Card do Hugo (16/10/2026, docs/card-hugo/CARD-ESPEC.md anexo T1): numbers of the building card and of the unit card,
// computed from the units table (UNIDADES of dados.js). Pure functions, no DOM, no import: node tests them directly
// (docs/card-hugo/teste_metricas.mjs). Nothing here is a value of a building: everything comes from U and cfg.

export const naTabela = (U) => U.filter((u) => u.preco_total != null);           // Upper: 80
export const disponiveis = (U) => U.filter((u) => u.situacao === 'disponivel'); // Upper: 78

// "Média da tabela" = sum of prices / sum of private areas of the units WITH a price (weighted). Upper: 27.761,07
export function mediaTabela(U) {
  const t = naTabela(U);
  const a = t.reduce((s, u) => s + u.area_m2, 0);
  return a ? t.reduce((s, u) => s + u.preco_total, 0) / a : null;
}
// "A partir de" = lowest price among the AVAILABLE units. Upper: 1.030.000
export function aPartirDe(U) {
  const d = disponiveis(U).filter((u) => u.preco_total != null);
  return d.length ? Math.min(...d.map((u) => u.preco_total)) : null;
}
export function faixaArea(U) { const a = U.map((u) => u.area_m2).filter((v) => v != null); return [Math.min(...a), Math.max(...a)]; }
export function contagem(U) {
  const c = { disponivel: 0, reservada: 0, indisponivel: 0, total: U.length, naTabela: naTabela(U).length };
  for (const u of U) if (u.situacao in c) c[u.situacao]++;
  return c;
}

// Unit vs building average. null = say nothing (above the average the card shows no comparison - spec C).
export function vsMedia(u, media) {
  if (u.preco_m2 == null || !media) return null;
  const d = u.preco_m2 / media - 1;
  if (d <= -0.01) return { tipo: 'abaixo', pct: Math.floor(-d * 1000) / 10, d }; // one decimal, rounded DOWN (never overstate a discount)
  if (d < 0.01) return { tipo: 'media', d };
  return null;
}

// Similar AVAILABLE units: |area - area_u| <= 1 m2 and |price - price_u| <= 5% (10% when fewer than n), ordered by
// floor distance, then price distance, then number. Unit without a price: area only, cheapest first.
export function similares(u, U, n = 3) {
  const cand = disponiveis(U).filter((v) => v.id !== u.id && v.preco_total != null && Math.abs(v.area_m2 - u.area_m2) <= 1.0);
  if (u.preco_total == null) {
    return cand.sort((a, b) => a.preco_total - b.preco_total || Math.abs(a.andar - u.andar) - Math.abs(b.andar - u.andar) || +a.numero - +b.numero).slice(0, n);
  }
  const ordena = (l) => l.sort((a, b) => Math.abs(a.andar - u.andar) - Math.abs(b.andar - u.andar)
    || Math.abs(a.preco_total - u.preco_total) - Math.abs(b.preco_total - u.preco_total) || +a.numero - +b.numero);
  let l = cand.filter((v) => Math.abs(v.preco_total - u.preco_total) <= 0.05 * u.preco_total);
  if (l.length < n) l = cand.filter((v) => Math.abs(v.preco_total - u.preco_total) <= 0.10 * u.preco_total);
  return ordena(l).slice(0, n);
}

// Highlight of the table: the broker's choice (cfg.destaque.numero) when that unit is available; otherwise the lowest
// R$/m2 available (cents), tie -> higher floor, then lower final. Returns { u, motivo: 'corretor' | 'regra' } or null.
export function destaque(U, cfg) {
  const d = disponiveis(U).filter((u) => u.preco_m2 != null);
  const esc = cfg && cfg.destaque && cfg.destaque.numero != null ? d.find((u) => u.numero === String(cfg.destaque.numero)) : null;
  if (esc) return { u: esc, motivo: 'corretor', texto: cfg.destaque.motivo || null };
  if (!d.length) return null;
  const c = (v) => Math.round(v * 100);
  const u = [...d].sort((a, b) => c(a.preco_m2) - c(b.preco_m2) || b.andar - a.andar || a.final - b.final)[0];
  return { u, motivo: 'regra', texto: null };
}

// Minutes rounded to 5 -> "3h35" (sun chip, spec T2)
export function duracaoHM(horas) {
  const mm = Math.round((horas * 60) / 5) * 5;
  return `${Math.floor(mm / 60)}h${String(mm % 60).padStart(2, '0')}`;
}

// Rentability (spec T4): only with the broker's documented rental data (cfg.locacao). Every input is shown and editable
// on the screen; the result is never a promise. Returns null when the data needed for a mode is missing.
export function rentabilidade(preco, p) {
  const inv = preco * (1 + (p.itbiPct || 0) / 100 + (p.escrituraPct || 0) / 100);
  const enc = (p.condominio || 0) + (p.iptu || 0);
  const out = { investimento: inv };
  if (p.diaria != null && p.ocupacao != null) {
    const bruto = p.diaria * p.ocupacao * 30.4;
    const liq = bruto * (1 - (p.taxaOperadorPct || 0) / 100) - enc - (p.custosFixos || 0);
    out.short = { mensal: liq, anual: liq * 12, pctAno: inv ? (liq * 12) / inv * 100 : null };
  }
  if (p.aluguel != null) {
    const liq = p.aluguel * (1 - (p.taxaAdmPct || 0) / 100) - (p.encargosProprietario || 0);
    out.long = { mensal: liq, anual: liq * 12, pctAno: inv ? (liq * 12) / inv * 100 : null };
  }
  return out;
}
