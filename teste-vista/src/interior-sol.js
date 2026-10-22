import { posicaoSolar, fatorDia } from "./luz-curva.js";
import { PREDIO_CFG } from "./predio.js";
const DIA = 1440;
const hm = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (t) => {
  const m = (Math.round(t) % DIA + DIA) % DIA;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const { _leia: _p0, ...PL_ } = PREDIO_CFG.plantaStudio;
const P = { ...PL_, VB: PL_.VG + PL_.BAL };
const BAL_FACE = Object.fromEntries(Object.entries(PREDIO_CFG.faces).map(([k, v]) => [k, v.varanda]));
function configurarFace(lado) {
  P.BAL = BAL_FACE[lado] ?? PL_.BAL;
  P.VB = P.VG + P.BAL;
  P.SEM_VARANDA = P.BAL < 0.05;
  return P;
}
const alturaPiso = (andar) => P.LAJE_1 + (andar - 1) * P.PISO_A_PISO;
function solNoInstante(SOL, est, t) {
  const e = SOL.estacoes[est];
  const passo = SOL.meta.passo_min || 15;
  const nascer = hm(e.nascer), por = hm(e.por), ini = hm(e.inicio);
  const dia = t >= nascer && t < por;
  const f = (t - ini) / passo;
  const n = e.az.length;
  let az = null, el = -12;
  if (dia) {
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
    const i1 = Math.min(n - 1, i0 + 1);
    const k = Math.max(0, Math.min(1, f - i0));
    let a0 = e.az[i0], a1 = e.az[i1];
    if (Math.abs(a1 - a0) > 180) a1 += a1 < a0 ? 360 : -360;
    az = (a0 + (a1 - a0) * k + 360) % 360;
    el = e.el[i0] + (e.el[i1] - e.el[i0]) * k;
    if (f < 0) el = e.el[0] * Math.max(0, (t - nascer) / Math.max(1, ini - nascer));
    if (f > n - 1) {
      const fim = ini + (n - 1) * passo;
      el = e.el[n - 1] * Math.max(0, (por - t) / Math.max(1, por - fim));
    }
  } else {
    az = t >= por ? 260 : 100;
  }
  const ps = posicaoSolar(e.data, t, SOL.meta.local?.lat, SOL.meta.local?.lon);
  el = ps.el;
  az = ps.az;
  const noite = 1 - fatorDia(el);
  const idx = Math.max(0, Math.min(n - 1, Math.floor(f)));
  return { est, data: e.data, nascer: e.nascer, por: e.por, t, hora: fmt(t), dia, az, el, noite, idx, dentro: f >= 0 && f <= n - 1 };
}
function chaveFinal(SOL, un) {
  if (un != null && typeof un === "object") {
    const f = String(un.final);
    const ct = un.torre != null ? `${un.torre}-${f}` : null;
    return ct && SOL.finais && SOL.finais[ct] ? ct : f;
  }
  return String(un);
}
function chaveUnidade(SOL, un) {
  const ct = un.torre != null ? `${un.torre}-${un.numero}` : null;
  return ct && SOL.unidades && SOL.unidades[ct] ? ct : String(un.numero);
}
function faceDoFinal(SOL, chave) {
  const fin = SOL.finais && SOL.finais[chaveFinal(SOL, chave)];
  return fin ? { lado: fin.sacada_lado, aponta: fin.sacada_aponta_graus } : null;
}
function mesmaFace(SOL, un, finalRender, tolGraus = 1) {
  if (un == null || finalRender == null) return null;
  const fu = faceDoFinal(SOL, un), fr = faceDoFinal(SOL, finalRender);
  if (!fu || !fr) return null;
  return Math.abs((fu.aponta - fr.aponta + 540) % 360 - 180) <= tolGraus;
}
function plantaDoFinal(chave, cfg = PREDIO_CFG) {
  const fin = cfg.finais || {};
  const pl = fin[chave] && fin[chave].planta;
  const tipo = (pl && typeof pl === "object" ? pl.tipo : null) || "falta";
  const base = Object.keys(fin).find((k) => fin[k].planta && fin[k].planta.tipo === "original");
  return { tipo, base: base != null ? `do final ${base}` : "tipo" };
}
const rosa4 = (g) => ["norte", "leste", "sul", "oeste"][Math.round((g % 360 + 360) % 360 / 90) % 4];
function transformacao(SOL, a, b) {
  const un = b === void 0 ? a : b;
  const f = chaveFinal(SOL, un);
  const fin = SOL.finais[f];
  const cx = fin.caixa_planta;
  const lado = fin.sacada_lado;
  const { tipo, base } = plantaDoFinal(f);
  const falta = tipo === "falta";
  const espelhado = tipo === "espelhada";
  configurarFace(lado);
  let Weff, Deff;
  if (lado === "N" || lado === "S") {
    Weff = cx.largura;
    Deff = cx.profundidade;
  } else {
    Weff = cx.profundidade;
    Deff = cx.largura;
  }
  const ou = (Weff - P.W) / 2, ov = Deff - P.VB;
  let M, t;
  if (lado === "S") {
    M = { a: 1, b: 0, c: 0, d: 1 };
    t = [ou, ov];
  } else if (lado === "N") {
    M = { a: -1, b: 0, c: 0, d: -1 };
    t = [Weff - ou, Deff - ov];
  } else if (lado === "W") {
    M = { a: 0, b: -1, c: 1, d: 0 };
    t = [Deff - ov, ou];
  } else {
    M = { a: 0, b: 1, c: -1, d: 0 };
    t = [ov, Weff - ou];
  }
  const semVar = P.SEM_VARANDA ? ` · janela sem varanda: a conferir (estimativa do lado ${rosa4(fin.sacada_aponta_graus)})` : "";
  const aviso = falta ? `[falta: planta do final ${f}] — interior montado com a planta ${base}${semVar}` : tipo === "original" ? `Planta ${base} (desenho do arquiteto)` : `Planta ${base} ${tipo} (nota do arquiteto)`;
  return { M, t, espelhado, tipo, lado, aviso, chave: f, caixa: cx, Weff, Deff, ajusteFora: P.VB - Deff };
}
const caixaParaPlanta = (T, x, z) => {
  const dx = x - T.t[0], dz = z - T.t[1];
  return [T.M.a * dx + T.M.c * dz, T.M.b * dx + T.M.d * dz];
};
const predioParaPlanta = (T, x, z) => caixaParaPlanta(T, x - T.caixa.x, z - T.caixa.z);
const dirParaPlanta = (T, dx, dz) => [T.M.a * dx + T.M.c * dz, T.M.b * dx + T.M.d * dz];
function direcaoSolPlanta(SOL, T, az, el) {
  const eixo = SOL.meta.orientacao && SOL.meta.orientacao.eixo_x_predio_bearing_graus || PREDIO_CFG.geo.rumoSolReserva;
  const r = Math.PI / 180;
  const h = Math.cos(el * r);
  const dx = h * Math.cos((az - eixo) * r), dz = h * Math.sin((az - eixo) * r);
  const [du, dv] = dirParaPlanta(T, dx, dz);
  return [du, Math.sin(el * r), dv];
}
function area(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
const ccw = (p) => area(p) < 0 ? p.slice().reverse() : p;
function recorta(sub, clip) {
  if (!sub || sub.length < 3) return [];
  let out = ccw(sub);
  const c = ccw(clip);
  for (let i = 0; i < c.length && out.length; i++) {
    const A = c[i], B = c[(i + 1) % c.length];
    const dentro = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= -1e-12;
    const inter = (p, q) => {
      const a1 = (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
      const a2 = (B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0]);
      const k = a1 / (a1 - a2);
      return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    };
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      const dp = dentro(p), dq = dentro(q);
      if (dp) out.push(p);
      if (dp !== dq) out.push(inter(p, q));
    }
  }
  return out.length >= 3 ? out : [];
}
function iou(a, b) {
  const A = a && a.length >= 3 ? Math.abs(area(a)) : 0, B = b && b.length >= 3 ? Math.abs(area(b)) : 0;
  if (!A && !B) return { iou: 1, aMeu: 0, aB3: 0, inter: 0 };
  if (!A || !B) return { iou: 0, aMeu: A, aB3: B, inter: 0 };
  const I = Math.abs(area(recorta(a, b)));
  return { iou: I / (A + B - I), aMeu: A, aB3: B, inter: I };
}
function projRet(d, vc, u0, u1, y0, y1) {
  const pr = (u, y) => [u - d[0] * y / d[1], vc - d[2] * y / d[1]];
  return [pr(u0, y0), pr(u1, y0), pr(u1, y1), pr(u0, y1)];
}
function manchaAnalitica(d, { abertura = [P.G0, P.G1], espessura = true, vMax = P.VG } = {}) {
  if (!d || d[1] <= 5e-3 || d[2] <= 1e-3) return [];
  let poly;
  if (P.SEM_VARANDA) poly = projRet(d, P.VO, -1, P.W + 1, 0, P.HG);
  else {
    poly = projRet(d, P.VB, P.B0, P.B1, P.HC, P.HB);
    poly = recorta(poly, projRet(d, P.VB - P.VIGA, P.B0, P.B1, P.HC, P.HB));
  }
  const vidros = espessura ? [P.VI, P.VO] : [P.VG];
  for (const vc of vidros) poly = recorta(poly, projRet(d, vc, abertura[0], abertura[1], 0, P.HG));
  return recorta(poly, [[0, 0], [P.W, 0], [P.W, vMax], [0, vMax]]);
}
function manchaB3Planta(SOL, T, final, est, idx) {
  const m = SOL.finais[T.chave ?? chaveFinal(SOL, final)].mancha[est];
  const p = m && m[idx];
  if (!p) return [];
  return p.map(([x, z]) => caixaParaPlanta(T, x, z));
}
export {
  BAL_FACE,
  DIA,
  P,
  alturaPiso,
  area,
  caixaParaPlanta,
  chaveFinal,
  chaveUnidade,
  configurarFace,
  dirParaPlanta,
  direcaoSolPlanta,
  faceDoFinal,
  fmt,
  hm,
  iou,
  manchaAnalitica,
  manchaB3Planta,
  mesmaFace,
  plantaDoFinal,
  predioParaPlanta,
  recorta,
  solNoInstante,
  transformacao
};
