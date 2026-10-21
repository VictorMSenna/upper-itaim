// Sun math for the apartment interior (front B4).
// - sun position at any minute (same interpolation as src/sol.js > criarRelogio.info, data from B3 sol.json)
// - plan frame <-> building frame for each final (final 6 drawing rotated/mirrored per the architect's note)
// - analytic sun patch on the floor (projection of the openings) and polygon tools to compare with B3 `mancha`
//
// Frames
//   building (B3/B1): x away from the street, z from row 1-3-5-7-9 to row 2-4-6-8, metres; +x bearing = meta.orientacao.eixo_x
//   scene / plan: u = across the room (0 = inner face of the left wall of the final-6 drawing), v = from the entrance wall
//   (0) toward the balcony, y up. three.js scene uses (x, y, z) = (u, y, v).
//   For mirrored finals the layout itself is mirrored (u -> 5.40 - u), so plan -> building is always a pure rotation.

import { posicaoSolar, fatorDia } from './luz-curva.js';
import { PREDIO_CFG } from './predio.js';

export const DIA = 1440;
export const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const fmt = (t) => {
  const m = ((Math.round(t) % DIA) + DIA) % DIA;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ---- plan dimensions (measured on assets/planta/planta-final-6.webp, scale 114 px/m; see docs/RELATORIO-B4-interior.md)
// Heights: B5 measured 2.81 m floor-to-floor on the drone point cloud (dados/predio-forma.json); the balcony section
// (door height, balcony ceiling, edge beam, curb) was MEASURED on the calibrated photo of apt 31 (final 1,
// docs/b4-scripts/calibra_fotos.py) and is assumed equal in the other finals (ESTIMATIVA).
// 15/10 FILA C9: the numbers live in predio.json "plantaStudio" (Upper values below, for reference):
//   W 5.40 room inner width (dimension "5.40" of the drawing) · VG 6.14 glass plane of the balcony door (inner wall face VI
//   6.05, outer VO 6.23) · BAL 1.22 balcony depth glass -> outer edge, set per face by configurarFace() (B5) · VB = VG + BAL
//   outer edge · G0 0.81 / G1 4.55 glass opening across the room (drawing 3.74 m; photo of apt 31: 3.54 m) · HG 2.25 opening
//   height (photo of apt 31) · HT 2.60 room ceiling (2.81 floor-to-floor - ~0.21, ESTIMATIVA) · HCB 2.32 balcony ceiling ·
//   HB 2.19 bottom of the edge beam · VIGA 0.22 beam depth (= curb) · HC 0.106 curb height · B0 -0.10 / B1 5.50 balcony
//   side walls · PISO_A_PISO 2.81, LAJE_1 11.92 (B5, dados/predio-forma.json > niveis)
const { _leia: _p0, ...PL_ } = PREDIO_CFG.plantaStudio;
export const P = { ...PL_, VB: PL_.VG + PL_.BAL };
// balcony depth by face (B5 > medidas, B3 sol.json 14:17): north 1.10, street 1.50, south 1.20; east (finals 8, 9)
// = window WITHOUT balcony (ESTIMATIVA of B5: the east side was barely filmed) -> "a conferir" on screen
export const BAL_FACE = Object.fromEntries(Object.entries(PREDIO_CFG.faces).map(([k, v]) => [k, v.varanda])); // C4: predio.json faces (Upper N 1.10, W 1.50, S 1.20, E 0)
export function configurarFace(lado) { P.BAL = BAL_FACE[lado] ?? PL_.BAL; P.VB = P.VG + P.BAL; P.SEM_VARANDA = P.BAL < 0.05; return P; }
export const alturaPiso = (andar) => P.LAJE_1 + (andar - 1) * P.PISO_A_PISO;

// ---------------------------------------------------------------- sun at minute t
export function solNoInstante(SOL, est, t) {
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
    if (f > n - 1) { const fim = ini + (n - 1) * passo; el = e.el[n - 1] * Math.max(0, (por - t) / Math.max(1, por - fim)); }
  } else {
    az = t >= por ? 260 : 100;
  }
  // F23 (B1, shared curve in src/luz-curva.js): continuous twilight driven by the true elevation, also below the
  // horizon, instead of jumping from night to day at sunrise. B3's samples and NOAA agree within 0.4 deg.
  const ps = posicaoSolar(e.data, t, SOL.meta.local?.lat, SOL.meta.local?.lon);
  el = ps.el; az = ps.az;
  const noite = 1 - fatorDia(el);
  const idx = Math.max(0, Math.min(n - 1, Math.floor(f)));
  return { est, data: e.data, nascer: e.nascer, por: e.por, t, hora: fmt(t), dia, az, el, noite, idx, dentro: f >= 0 && f <= n - 1 };
}

// ---------------------------------------------------------------- unit -> final -> face (16/10, C3: no building in code)
// Key of a final in sol.json `finais` / predio.json `finais`: plain final ("7", Upper) or "<torre>-<final>" for buildings
// with towers (Passo 3 writes "A-1"; predio-forma.json unidades carry `torre`). Accepts a unit object or a final.
export function chaveFinal(SOL, un) {
  if (un != null && typeof un === 'object') {
    const f = String(un.final);
    const ct = un.torre != null ? `${un.torre}-${f}` : null;
    return ct && SOL.finais && SOL.finais[ct] ? ct : f;
  }
  return String(un);
}
// key of a unit in sol.json `unidades`: "107" (Upper) or "<torre>-<numero>" (Passo 3, towers)
export function chaveUnidade(SOL, un) {
  const ct = un.torre != null ? `${un.torre}-${un.numero}` : null;
  return ct && SOL.unidades && SOL.unidades[ct] ? ct : String(un.numero);
}
// face of a final: side in the plan frame (N/S/W/E of predio-forma.json) + bearing the balcony points to (sol.json)
export function faceDoFinal(SOL, chave) {
  const fin = SOL.finais && SOL.finais[chaveFinal(SOL, chave)];
  return fin ? { lado: fin.sacada_lado, aponta: fin.sacada_aponta_graus } : null;
}
// S2 (15/10): the 360 render was made for ONE unit (manifest `final` = dados/interior-planta.json unidade.final); its
// direct sun is valid only for units whose balcony points the same way. null = unknown (caller keeps the sun).
export function mesmaFace(SOL, un, finalRender, tolGraus = 1) {
  if (un == null || finalRender == null) return null;
  const fu = faceDoFinal(SOL, un), fr = faceDoFinal(SOL, finalRender);
  if (!fu || !fr) return null;
  return Math.abs(((fu.aponta - fr.aponta + 540) % 360) - 180) <= tolGraus;
}
// plan type of a final from predio.json finais[k].planta.tipo (original / espelhada / rotacionada); absent = 'falta'.
// The base drawing is the final whose tipo is 'original' (Upper: 6).
export function plantaDoFinal(chave, cfg = PREDIO_CFG) {
  const fin = cfg.finais || {};
  const pl = fin[chave] && fin[chave].planta;
  const tipo = (pl && typeof pl === 'object' ? pl.tipo : null) || 'falta';
  const base = Object.keys(fin).find((k) => fin[k].planta && fin[k].planta.tipo === 'original');
  return { tipo, base: base != null ? `do final ${base}` : 'tipo' };
}
const rosa4 = (g) => ['norte', 'leste', 'sul', 'oeste'][Math.round((((g % 360) + 360) % 360) / 90) % 4];

// ---------------------------------------------------------------- per-final transform
// returns { M:{a,b,c,d}, t:[tx,tz], espelhado, tipo, lado, aviso, chave }
// caixa-local (x,z) = M*(u,v) + t ; inverse (u,v) = M^T*((x,z) - t)
// 16/10 (C3): `un` = unit object ({final, torre?}) or final; plan type from predio.json (was the legacy dados/predio.json
// text of the Upper, 2nd argument kept only for old callers and ignored).
export function transformacao(SOL, a, b) {
  const un = b === undefined ? a : b;
  const f = chaveFinal(SOL, un);
  const fin = SOL.finais[f];
  const cx = fin.caixa_planta;
  const lado = fin.sacada_lado;
  const { tipo, base } = plantaDoFinal(f);
  const falta = tipo === 'falta';
  const espelhado = tipo === 'espelhada';
  configurarFace(lado);
  let Weff, Deff;
  if (lado === 'N' || lado === 'S') { Weff = cx.largura; Deff = cx.profundidade; } else { Weff = cx.profundidade; Deff = cx.largura; }
  const ou = (Weff - P.W) / 2, ov = Deff - P.VB;
  let M, t;
  if (lado === 'S') { M = { a: 1, b: 0, c: 0, d: 1 }; t = [ou, ov]; }
  else if (lado === 'N') { M = { a: -1, b: 0, c: 0, d: -1 }; t = [Weff - ou, Deff - ov]; }
  else if (lado === 'W') { M = { a: 0, b: -1, c: 1, d: 0 }; t = [Deff - ov, ou]; }
  else { M = { a: 0, b: 1, c: -1, d: 0 }; t = [ov, Weff - ou]; }
  const semVar = P.SEM_VARANDA ? ` · janela sem varanda: a conferir (estimativa do lado ${rosa4(fin.sacada_aponta_graus)})` : '';
  const aviso = falta ? `[falta: planta do final ${f}] — interior montado com a planta ${base}${semVar}`
    : tipo === 'original' ? `Planta ${base} (desenho do arquiteto)`
      : `Planta ${base} ${tipo} (nota do arquiteto)`;
  return { M, t, espelhado, tipo, lado, aviso, chave: f, caixa: cx, Weff, Deff, ajusteFora: P.VB - Deff };
}
export const caixaParaPlanta = (T, x, z) => {
  const dx = x - T.t[0], dz = z - T.t[1];
  return [T.M.a * dx + T.M.c * dz, T.M.b * dx + T.M.d * dz];
};
export const predioParaPlanta = (T, x, z) => caixaParaPlanta(T, x - T.caixa.x, z - T.caixa.z);
// direction (building frame) -> plan frame (rotation part only)
export const dirParaPlanta = (T, dx, dz) => [T.M.a * dx + T.M.c * dz, T.M.b * dx + T.M.d * dz];

// unit vector toward the sun in the plan frame: [u, y, v]
export function direcaoSolPlanta(SOL, T, az, el) {
  const eixo = (SOL.meta.orientacao && SOL.meta.orientacao.eixo_x_predio_bearing_graus) || PREDIO_CFG.geo.rumoSolReserva;
  const r = Math.PI / 180;
  const h = Math.cos(el * r);
  const dx = h * Math.cos((az - eixo) * r), dz = h * Math.sin((az - eixo) * r);
  const [du, dv] = dirParaPlanta(T, dx, dz);
  return [du, Math.sin(el * r), dv];
}

// ---------------------------------------------------------------- polygons (convex, [u,v] points)
export function area(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
const ccw = (p) => (area(p) < 0 ? p.slice().reverse() : p);
// Sutherland-Hodgman: clip subject by convex clip polygon
export function recorta(sub, clip) {
  if (!sub || sub.length < 3) return [];
  let out = ccw(sub); const c = ccw(clip);
  for (let i = 0; i < c.length && out.length; i++) {
    const A = c[i], B = c[(i + 1) % c.length];
    const dentro = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]) >= -1e-12;
    const inter = (p, q) => {
      const a1 = (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
      const a2 = (B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0]);
      const k = a1 / (a1 - a2);
      return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      const dp = dentro(p), dq = dentro(q);
      if (dp) out.push(p);
      if (dp !== dq) out.push(inter(p, q));
    }
  }
  return out.length >= 3 ? out : [];
}
export function iou(a, b) {
  const A = a && a.length >= 3 ? Math.abs(area(a)) : 0, B = b && b.length >= 3 ? Math.abs(area(b)) : 0;
  if (!A && !B) return { iou: 1, aMeu: 0, aB3: 0, inter: 0 };
  if (!A || !B) return { iou: 0, aMeu: A, aB3: B, inter: 0 };
  const I = Math.abs(area(recorta(a, b)));
  return { iou: I / (A + B - I), aMeu: A, aB3: B, inter: I };
}

// projection on the floor (y = 0) of a vertical rectangle at v = vc, u in [u0,u1], y in [y0,y1], along -d
function projRet(d, vc, u0, u1, y0, y1) {
  const pr = (u, y) => [u - (d[0] * y) / d[1], vc - (d[2] * y) / d[1]];
  return [pr(u0, y0), pr(u1, y0), pr(u1, y1), pr(u0, y1)];
}
// Analytic sun patch on the studio floor (shell only: walls, slabs, balcony side walls; furniture ignored).
// opts.abertura: [g0, g1] across the room (default = drawing); opts.espessura: include the wall reveals.
export function manchaAnalitica(d, { abertura = [P.G0, P.G1], espessura = true, vMax = P.VG } = {}) {
  if (!d || d[1] <= 0.005 || d[2] <= 0.001) return [];
  // balcony mouth: between the curb top and the bottom of the edge beam, at the inner and the outer face of the beam
  let poly;
  if (P.SEM_VARANDA) poly = projRet(d, P.VO, -1, P.W + 1, 0, P.HG); // window without balcony: only the opening counts
  else {
    poly = projRet(d, P.VB, P.B0, P.B1, P.HC, P.HB);
    poly = recorta(poly, projRet(d, P.VB - P.VIGA, P.B0, P.B1, P.HC, P.HB));
  }
  const vidros = espessura ? [P.VI, P.VO] : [P.VG];
  for (const vc of vidros) poly = recorta(poly, projRet(d, vc, abertura[0], abertura[1], 0, P.HG));
  return recorta(poly, [[0, 0], [P.W, 0], [P.W, vMax], [0, vMax]]);
}

// B3 polygon (caixa-local metres) -> plan frame
export function manchaB3Planta(SOL, T, final, est, idx) {
  const m = SOL.finais[T.chave ?? chaveFinal(SOL, final)].mancha[est];
  const p = m && m[idx];
  if (!p) return [];
  return p.map(([x, z]) => caixaParaPlanta(T, x, z));
}
