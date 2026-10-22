import { PREDIO_CFG } from "./predio.js";
const rad = Math.PI / 180;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function posicaoSolar(dataISO, minutos, lat = PREDIO_CFG.geo.sol.lat, lon = PREDIO_CFG.geo.sol.lon, fusoH = -3) {
  const [Y, M, D] = dataISO.split("-").map(Number);
  const inicioAno = Date.UTC(Y, 0, 1);
  const doy = Math.floor((Date.UTC(Y, M - 1, D) - inicioAno) / 864e5) + 1;
  const g = 2 * Math.PI / 365 * (doy - 1 + (minutos / 60 - 12) / 24);
  const eqt = 229.18 * (75e-6 + 1868e-6 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 6918e-6 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 6758e-6 * Math.cos(2 * g) + 907e-6 * Math.sin(2 * g) - 2697e-6 * Math.cos(3 * g) + 148e-5 * Math.sin(3 * g);
  const tst = minutos + eqt + 4 * lon - 60 * fusoH;
  const ha = (tst / 4 - 180) * rad;
  const phi = lat * rad;
  const cosz = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosz)));
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(phi) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(phi) * Math.sin(zen))))) / rad;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { el: 90 - zen / rad, az };
}
function fatorDia(el) {
  return smooth(-14, 22, el);
}
function fatorLuzesNoite(el) {
  return 1 - smooth(-13, 6, el);
}
function forcaSolDireto(el) {
  if (el <= 0) return 0;
  const s = Math.sin(el * rad);
  return Math.min(1, (1 - Math.exp(-el / 3.5)) * Math.pow(s, 0.35) * 1.05);
}
function calorSol(el) {
  return 1 - smooth(1, 22, el);
}
const mistura = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
const CEU = [
  [-18, [10, 15, 30], [21, 32, 56]],
  [-12, [13, 20, 38], [29, 41, 69]],
  [-9, [20, 30, 56], [46, 60, 96]],
  [-6, [32, 46, 84], [78, 88, 126]],
  [-3, [50, 68, 112], [150, 128, 132]],
  [0, [70, 92, 138], [214, 158, 124]],
  [3, [110, 140, 180], [240, 190, 140]],
  [10, [150, 175, 200], [230, 215, 190]],
  [22, [195, 203, 201], [226, 221, 211]]
];
function corCeu(el) {
  if (el <= CEU[0][0]) return { topo: hex(CEU[0][1]), horizonte: hex(CEU[0][2]) };
  for (let i = 1; i < CEU.length; i++) {
    if (el <= CEU[i][0]) {
      const k = (el - CEU[i - 1][0]) / (CEU[i][0] - CEU[i - 1][0]);
      return { topo: hex(mistura(CEU[i - 1][1], CEU[i][1], k)), horizonte: hex(mistura(CEU[i - 1][2], CEU[i][2], k)) };
    }
  }
  const u = CEU[CEU.length - 1];
  return { topo: hex(u[1]), horizonte: hex(u[2]) };
}
function fatorCeu(el) {
  return el >= 0 ? 0.2 + 0.8 * smooth(0, 22, el) : 0.2 * Math.pow(10, el / 8);
}
export {
  calorSol,
  corCeu,
  fatorCeu,
  fatorDia,
  fatorLuzesNoite,
  forcaSolDireto,
  posicaoSolar,
  smooth
};
