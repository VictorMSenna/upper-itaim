const naTabela = (U) => U.filter((u) => u.preco_total != null);
const disponiveis = (U) => U.filter((u) => u.situacao === "disponivel");
function mediaTabela(U) {
  const t = naTabela(U);
  const a = t.reduce((s, u) => s + u.area_m2, 0);
  return a ? t.reduce((s, u) => s + u.preco_total, 0) / a : null;
}
function aPartirDe(U) {
  const d = disponiveis(U).filter((u) => u.preco_total != null);
  return d.length ? Math.min(...d.map((u) => u.preco_total)) : null;
}
function faixaArea(U) {
  const a = U.map((u) => u.area_m2).filter((v) => v != null);
  return [Math.min(...a), Math.max(...a)];
}
function contagem(U) {
  const c = { disponivel: 0, reservada: 0, indisponivel: 0, total: U.length, naTabela: naTabela(U).length };
  for (const u of U) if (u.situacao in c) c[u.situacao]++;
  return c;
}
function vsMedia(u, media) {
  if (u.preco_m2 == null || !media) return null;
  const d = u.preco_m2 / media - 1;
  if (d <= -0.01) return { tipo: "abaixo", pct: Math.floor(-d * 1e3) / 10, d };
  if (d < 0.01) return { tipo: "media", d };
  return null;
}
function similares(u, U, n = 3) {
  const cand = disponiveis(U).filter((v) => v.id !== u.id && v.preco_total != null && Math.abs(v.area_m2 - u.area_m2) <= 1);
  if (u.preco_total == null) {
    return cand.sort((a, b) => a.preco_total - b.preco_total || Math.abs(a.andar - u.andar) - Math.abs(b.andar - u.andar) || +a.numero - +b.numero).slice(0, n);
  }
  const ordena = (l2) => l2.sort((a, b) => Math.abs(a.andar - u.andar) - Math.abs(b.andar - u.andar) || Math.abs(a.preco_total - u.preco_total) - Math.abs(b.preco_total - u.preco_total) || +a.numero - +b.numero);
  let l = cand.filter((v) => Math.abs(v.preco_total - u.preco_total) <= 0.05 * u.preco_total);
  if (l.length < n) l = cand.filter((v) => Math.abs(v.preco_total - u.preco_total) <= 0.1 * u.preco_total);
  return ordena(l).slice(0, n);
}
function destaque(U, cfg) {
  const d = disponiveis(U).filter((u2) => u2.preco_m2 != null);
  const esc = cfg && cfg.destaque && cfg.destaque.numero != null ? d.find((u2) => u2.numero === String(cfg.destaque.numero)) : null;
  if (esc) return { u: esc, motivo: "corretor", texto: cfg.destaque.motivo || null };
  if (!d.length) return null;
  const c = (v) => Math.round(v * 100);
  const u = [...d].sort((a, b) => c(a.preco_m2) - c(b.preco_m2) || b.andar - a.andar || a.final - b.final)[0];
  return { u, motivo: "regra", texto: null };
}
function duracaoHM(horas) {
  const mm = Math.round(horas * 60 / 5) * 5;
  return `${Math.floor(mm / 60)}h${String(mm % 60).padStart(2, "0")}`;
}
function rentabilidade(preco, p) {
  const inv = preco * (1 + (p.itbiPct || 0) / 100 + (p.escrituraPct || 0) / 100);
  const enc = (p.condominio || 0) + (p.iptu || 0);
  const out = { investimento: inv };
  if (p.diaria != null && p.ocupacao != null) {
    const bruto = p.diaria * p.ocupacao * 30.4;
    const liq = bruto * (1 - (p.taxaOperadorPct || 0) / 100) - enc - (p.custosFixos || 0);
    out.short = { mensal: liq, anual: liq * 12, pctAno: inv ? liq * 12 / inv * 100 : null };
  }
  if (p.aluguel != null) {
    const liq = p.aluguel * (1 - (p.taxaAdmPct || 0) / 100) - (p.encargosProprietario || 0);
    out.long = { mensal: liq, anual: liq * 12, pctAno: inv ? liq * 12 / inv * 100 : null };
  }
  return out;
}
export {
  aPartirDe,
  contagem,
  destaque,
  disponiveis,
  duracaoHM,
  faixaArea,
  mediaTabela,
  naTabela,
  rentabilidade,
  similares,
  vsMedia
};
