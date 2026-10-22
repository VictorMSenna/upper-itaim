import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { P } from "./interior-sol.js";
import { SPOTS } from "./interior-spots.js";
const PALETA = {
  piso: { color: 14867928, roughness: 0.35, fonte: "porcelanato claro, IMG_5105 t=2s (329,903) #d8d2d2" },
  parede: { color: 13881547, roughness: 0.92, fonte: "pintura cinza clara, IMG_5105 t=2s parede do fundo" },
  teto: { color: 15658474, roughness: 0.95, fonte: "teto branco, IMG_5105" },
  escuro: { color: 4867908, roughness: 0.8, fonte: "laje da varanda, foto 2021 11-varanda" },
  marinho: { color: 2500911, roughness: 0.85, fonte: "faixa azul-marinho atras da cama, IMG_5104 t=5s (242,480) #222225" },
  azul: { color: 2903930, roughness: 0.85, fonte: "parede azul da mesa, IMG_5105 t=2s (523,452)" },
  madeira: {
    color: 7495759,
    roughness: 0.6,
    fonte: "painel de madeira da cabeceira, IMG_5104 t=5s (484,532) #85664b"
  },
  armario: { color: 12236464, roughness: 0.55, fonte: "armario cinza, IMG_5105 t=2s" },
  bancada: { color: 5985358, roughness: 0.4, fonte: "bancada/backsplash escuros, foto 2021 02-cozinha" },
  metal: { color: 1842206, roughness: 0.45, metalness: 0.25, fonte: "trilho, caixilho, mesinha, IMG_5106 t=4s (487,710) #363636" },
  mesa: { color: 2764083, roughness: 0.5, fonte: "tampo escuro da mesa, IMG_5105 t=2s (490,548)" },
  tecido: { color: 9276561, roughness: 1, fonte: "sofa capitone cinza, IMG_5106 t=4s (161,839) #6f6e73" },
  tecidoEsc: { color: 8225161, roughness: 1, fonte: "cadeiras estofadas cinza, IMG_5105" },
  roupa: { color: 15855853, roughness: 0.95, fonte: "roupa de cama branca, IMG_5104" },
  manta: { color: 7698044, roughness: 1, fonte: "peseira cinza de trico, IMG_5104 (242,637) #6c6d75" },
  almAzul: { color: 1920900, roughness: 1, fonte: "almofada azul, IMG_5104 (468,806) #113a61" },
  almBege: { color: 13484726, roughness: 1, fonte: "almofadas bege com estampa azul, IMG_5104 (274,806) #a4978f" },
  tapete: { color: 11118506, roughness: 1, fonte: "tapete felpudo cinza, IMG_5105 (426,774) #929093" },
  inox: { color: 12896201, roughness: 0.35, metalness: 0.5, fonte: "geladeira inox, foto 2021 04-cozinha" },
  planta: { color: 5073466, roughness: 0.9, fonte: "vasos da varanda (desenho da planta)" },
  quadro: { color: 15658736, roughness: 0.9, fonte: "quadros brancos com traco azul, IMG_5115" },
  luminaria: { color: 15986664, roughness: 0.7, fonte: "abajur branco pequeno, IMG_5107 t=2s" }
};
function texturaPiso() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#e4e0dc";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 1 + Math.random() * 3;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "120,110,100" : "255,255,255"},${0.02 + Math.random() * 0.03})`;
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
  }
  g.fillStyle = "#c9c4be";
  g.fillRect(0, 0, 512, 2);
  g.fillRect(0, 0, 2, 512);
  g.fillRect(0, 255, 512, 2);
  g.fillRect(255, 0, 2, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function texturaQuadro(seed) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const g = c.getContext("2d");
  g.fillStyle = "#f2f2f3";
  g.fillRect(0, 0, 128, 160);
  g.strokeStyle = "#d9d9dc";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 122, 154);
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  g.strokeStyle = "#2a3f8f";
  g.lineCap = "round";
  for (let k = 0; k < 5; k++) {
    g.lineWidth = 5 + rnd() * 7;
    g.beginPath();
    g.moveTo(30 + rnd() * 70, 30 + rnd() * 100);
    g.bezierCurveTo(rnd() * 128, rnd() * 160, rnd() * 128, rnd() * 160, 30 + rnd() * 70, 30 + rnd() * 100);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function construirPlanta({ espelhado = false } = {}) {
  const prim = [];
  let peca = "estrutura";
  const at = (nome) => {
    peca = nome;
  };
  const add = (k, g) => prim.push({ peca, mat: k, geo: g.index ? g.toNonIndexed() : g });
  const box = (k, u0, u1, y0, y1, v0, v1) => {
    const g = new THREE.BoxGeometry(Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(v1 - v0));
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
    add(k, g);
  };
  const rbox = (k, u0, u1, y0, y1, v0, v1, r = 0.04) => {
    const w = u1 - u0, h = y1 - y0, d = v1 - v0;
    const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
    add(k, g);
  };
  const cyl = (k, u, v, r, y0, y1, seg = 24, rTopo = r) => {
    const g = new THREE.CylinderGeometry(rTopo, r, y1 - y0, seg);
    g.translate(u, (y0 + y1) / 2, v);
    add(k, g);
  };
  const tubo = (k, a, b, r = 0.01) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const L = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r, r, L, 6);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyQuaternion(q);
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    add(k, g);
  };
  const { W, VI, VO, VG, VB, G0, G1, HG, HT, B0, B1, HCB, HB, VIGA, HC } = P;
  at("piso");
  box("piso", -0.3, W + 0.3, -0.2, 0, -0.3, VO);
  const SEMV = P.SEM_VARANDA;
  if (!SEMV) {
    at("piso_varanda");
    box("piso", B0 - 0.2, B1 + 0.2, -0.2, 0, VO - 0.01, VB);
  }
  at("teto");
  box("teto", -0.3, W + 0.3, HT, HT + 0.22, -0.3, VI);
  if (!SEMV) {
    at("forro_varanda");
    box("escuro", B0 - 0.2, B1 + 0.2, HCB, HCB + 0.22, VO - 0.01, VB);
    at("viga_borda_varanda");
    box("escuro", B0 - 0.2, B1 + 0.2, HB, HCB + 0.01, VB - VIGA, VB);
  }
  at("parede_cozinha");
  box("parede", -0.22, 0, -0.2, HT + 0.2, -0.22, VO);
  at("parede_cama");
  box("parede", W, W + 0.22, -0.2, HT + 0.2, 0.3, VO);
  at("parede_entrada");
  box("parede", -0.22, 0.69, -0.2, HT + 0.2, -0.22, 0);
  box("parede", 1.64, 2.97, -0.2, HT + 0.2, -0.22, 0);
  box("parede", 0.69, 1.64, 2.1, HT + 0.2, -0.22, 0);
  at("porta_entrada");
  box("teto", 0.71, 1.62, 0, 2.08, -0.13, -0.09);
  cyl("metal", 1.52, -0.06, 0.012, 1, 1.04, 8);
  at("banheiro_paredes");
  box("parede", 2.95, 3.07, -0.2, HT + 0.2, -0.22, 2.2);
  box("parede", 2.85, W + 0.22, -0.2, HT + 0.2, -0.22, 0.54);
  box("parede", 3.07, 3.12, -0.2, HT + 0.2, 2.09, 2.2);
  box("parede", 3.8, W, -0.2, HT + 0.2, 2.09, 2.2);
  box("parede", 3.12, 3.8, 2.03, HT + 0.2, 2.09, 2.2);
  at("banheiro_bancada");
  box("roupa", 3.07, 3.85, 0, 0.85, 0.56, 1.05);
  at("banheiro_vaso");
  rbox("roupa", 4.1, 4.48, 0, 0.42, 0.56, 1.2, 0.08);
  at("banheiro_box");
  box("vidro", 4.66, 4.68, 0, 2, 0.54, 1.85);
  at("fachada_sacada");
  box("parede", -0.22, G0, -0.2, HT + 0.2, VI, VO);
  box("parede", G1, W + 0.22, -0.2, HT + 0.2, VI, VO);
  box("parede", G0, G1, HG, HT + 0.2, VI, VO);
  if (SEMV) {
    at("guarda_corpo");
    box("vidro", G0, G1, 0, 1.1, VO + 0.02, VO + 0.04);
    box("metal", G0, G1, 1.1, 1.14, VO + 0.01, VO + 0.05);
  }
  if (!SEMV) {
    at("varanda_paredes_laterais");
    box("parede", B0 - 0.18, B0, -0.2, HCB + 0.2, VO - 0.01, VB);
    box("parede", B1, B1 + 0.18, -0.2, HCB + 0.2, VO - 0.01, VB);
    at("guarda_corpo");
    const vr = VB - VIGA / 2;
    box("escuro", B0, B1, 0, HC, VB - VIGA, VB);
    box("vidro", B0, B1, HC, 1.15, vr - 0.01, vr + 0.01);
    box("metal", B0, B1, 1.15, 1.2, vr - 0.03, vr + 0.03);
    box("metal", B0, B1, 0.27, 0.3, vr - 0.02, vr + 0.02);
    for (const u of [B0 + 0.02, 1.85, 3.65, B1 - 0.06]) box("metal", u, u + 0.04, HC, 1.15, vr - 0.02, vr + 0.02);
  }
  at("porta_sacada");
  box("metal", G0, G1, 0, 0.03, VG - 0.04, VG + 0.04);
  box("metal", G0, G1, HG - 0.07, HG, VG - 0.04, VG + 0.04);
  box("metal", G0, G0 + 0.05, 0, HG, VG - 0.04, VG + 0.04);
  box("metal", G1 - 0.05, G1, 0, HG, VG - 0.04, VG + 0.04);
  const gm = (G0 + G1) / 2;
  box("metal", gm - 0.03, gm + 0.03, 0, HG, VG - 0.04, VG + 0.04);
  box("vidro", G0, G1, 0.03, HG - 0.07, VG - 4e-3, VG + 4e-3);
  at("cortina");
  rbox("roupa", 0.02, 0.62, 0.02, HT - 0.1, 5.84, 5.98, 0.05);
  at("cortineiro");
  box("teto", 0, W, HT - 0.1, HT, 5.78, 5.8);
  at("cozinha_armario_baixo");
  box("escuro", 0, 0.54, 0, 0.1, 0.05, 2.1);
  box("armario", 0, 0.6, 0.1, 0.88, 0.05, 2.1);
  for (const y of [0.5, 0.7]) box("metal", 0.6, 0.605, y, y + 0.012, 0.08, 2.07);
  at("cozinha_bancada");
  box("bancada", 0, 0.63, 0.88, 0.92, 0.05, 2.1);
  box("bancada", 0, 0.02, 0.92, 1.52, 0.05, 2.1);
  at("cooktop");
  box("metal", 0.08, 0.52, 0.92, 0.926, 0.4, 0.98);
  at("cuba");
  box("inox", 0.12, 0.5, 0.913, 0.924, 1.25, 1.7);
  cyl("inox", 0.07, 1.48, 0.016, 0.92, 1.24, 10);
  box("inox", 0.07, 0.26, 1.22, 1.245, 1.47, 1.49);
  at("cozinha_armario_alto");
  box("armario", 0, 0.36, 1.52, 2.32, 0.05, 2.1);
  for (const v of [0.57, 1.09, 1.61]) box("metal", 0.36, 0.364, 1.55, 2.29, v, v + 6e-3);
  at("geladeira");
  box("inox", 0, 0.68, 0, 1.8, 2.12, 2.84);
  box("metal", 0.68, 0.69, 0.9, 1.5, 2.16, 2.19);
  at("armario_geladeira");
  box("armario", 0, 0.62, 1.84, 2.32, 2.12, 2.84);
  at("luminaria_cozinha");
  box("metal", 0.92, 0.98, HT - 0.06, HT, 0.45, 1.75);
  at("parede_azul");
  box("azul", 2.15, 2.95, 0, HT, 0.54, 1.09);
  at("coluna_azul");
  box("armario", 1.85, 2.15, 0, 2.35, 0.6, 1.45);
  box("azul", 2.145, 2.15, 0, 2.35, 0.6, 1.45);
  box("azul", 1.85, 2.15, 0, 2.35, 1.445, 1.45);
  at("armario_superior");
  box("armario", 2.55, 2.95, 1.48, 2.35, 1.09, 1.45);
  box("armario", 2.3, 2.55, 1.48, 1.51, 1.09, 1.45);
  box("armario", 2.3, 2.55, 1.84, 2.35, 1.09, 1.45);
  box("metal", 2.62, 2.625, 1.53, 2.3, 1.45, 1.454);
  at("micro_ondas");
  box("inox", 2.32, 2.54, 1.51, 1.81, 1.12, 1.42);
  box("escuro", 2.315, 2.32, 1.54, 1.78, 1.14, 1.33);
  at("mesa");
  box("mesa", 2.3, 2.95, 0.73, 0.76, 1.09, 3.15);
  cyl("metal", 2.7, 2.97, 0.02, 0, 0.73, 10);
  at("quadro_nicho");
  box("metal", 2.93, 2.95, 1.05, 1.45, 1.6, 1.9);
  const cadeira = (nome, u, v) => {
    at(nome);
    rbox("tecidoEsc", u - 0.21, u + 0.21, 0.44, 0.52, v - 0.22, v + 0.22, 0.04);
    rbox("tecidoEsc", u - 0.27, u - 0.21, 0.5, 0.88, v - 0.22, v + 0.22, 0.03);
    for (const du of [-0.17, 0.17]) for (const dv of [-0.18, 0.18]) cyl("metal", u + du, v + dv, 0.011, 0, 0.44, 6);
  };
  cadeira("cadeira_1", 2.18, 2.3);
  cadeira("cadeira_2", 2.18, 2.85);
  const cu0 = 3.4, cv0 = 4, cv1 = 5.6;
  at("painel_madeira");
  box("madeira", W - 0.025, W, 0, 1, 2.93, 6.04);
  at("faixa_marinho");
  box("marinho", W - 0.026, W, 1, 1.27, 2.93, 6.04);
  const QY0 = 1.5, QY1 = 2.07, QV = [[3.91, 4.378], [4.471, 4.939]];
  QV.forEach(([v0, v1], i) => {
    at(`quadro_${i + 1}`);
    box("metal", W - 0.035, W - 0.026, QY0, QY1, v0, v1);
    box("quadro", W - 0.04, W - 0.035, QY0 + 0.012, QY1 - 0.012, v0 + 0.012, v1 - 0.012);
  });
  at("cama_base");
  rbox("roupa", cu0, W - 0.03, 0.1, 0.38, cv0, cv1, 0.02);
  for (const u of [cu0 + 0.06, W - 0.1]) for (const v of [cv0 + 0.06, cv1 - 0.06]) cyl("metal", u, v, 0.02, 0, 0.1, 6);
  at("colchao");
  rbox("roupa", cu0 + 0.01, W - 0.03, 0.38, 0.62, cv0 + 0.01, cv1 - 0.01, 0.07);
  at("edredom");
  rbox("roupa", cu0 - 0.03, W - 0.45, 0.54, 0.66, cv0 - 0.04, cv1 + 0.04, 0.05);
  at("peseira");
  rbox("manta", cu0 - 0.04, cu0 + 0.55, 0.6, 0.68, cv0 - 0.06, cv1 + 0.06, 0.03);
  at("travesseiros");
  rbox("roupa", W - 0.48, W - 0.1, 0.62, 0.8, cv0 + 0.08, cv0 + 0.76, 0.08);
  rbox("roupa", W - 0.48, W - 0.1, 0.62, 0.8, cv1 - 0.76, cv1 - 0.08, 0.08);
  at("toalhas");
  rbox("roupa", 3.74, 4.1, 0.68, 0.8, 4.2, 4.56, 0.03);
  const criado = (nome, v0, v1) => {
    at(nome);
    rbox("metal", W - 0.45, W - 0.02, 0, 0.55, v0, v1, 0.02);
  };
  criado("criado_mudo_1", 3.3, 3.75);
  const abajurPos = [[5.18, 3.525]];
  abajurPos.forEach(([u, v], k) => {
    at(`abajur_${k + 1}`);
    cyl("luminaria", u, v, 0.06, 0.55, 0.6, 20, 0.05);
    cyl("luminaria", u, v, 0.075, 0.6, 0.78, 20, 0.06);
  });
  at("sofa");
  rbox("tecido", 2.48, 3.3, 0.05, 0.38, 4.12, 5.58, 0.05);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) cyl("tecidoEsc", 2.685 + j * 0.41, 4.242 + i * 0.243, 0.012, 0.38, 0.387, 6);
  for (const u of [2.54, 3.24]) for (const v of [4.19, 5.51]) cyl("metal", u, v, 0.015, 0, 0.05, 6);
  at("almofadas");
  const almof = (k, u, v, ang) => {
    const g = new RoundedBoxGeometry(0.42, 0.42, 0.12, 3, 0.06);
    g.rotateX(-0.3);
    g.rotateY(Math.PI / 2 + ang);
    g.translate(u, 0.64, v);
    add(k, g);
  };
  almof("almBege", 3.24, 5.3, 0.1);
  almof("almBege", 3.24, 4.92, -0.05);
  almof("almBege", 3.24, 4.55, 0.08);
  almof("almAzul", 3.2, 4.22, -0.2);
  at("tapete");
  rbox("tapete", 0.5, 2.8, 0, 0.03, 3.78, 5.7, 0.02);
  at("pufe");
  rbox("tecido", 1.08, 1.52, 0, 0.44, 5.08, 5.52, 0.06);
  at("mesinha_redonda");
  cyl("metal", 5.1, 5.83, 0.2, 0.545, 0.565, 24);
  cyl("metal", 5.1, 5.83, 0.015, 0, 0.565, 8);
  at("mesinha_apoio");
  cyl("metal", 3.1, 3.82, 0.215, 0.56, 0.58, 28);
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2;
    tubo("metal", [3.1, 0.56, 3.82], [3.1 + Math.cos(a) * 0.17, 0, 3.82 + Math.sin(a) * 0.17], 9e-3);
  }
  at("armario_roupa");
  box("armario", 4.09, W, 0, 2.5, 2.2, 2.75);
  box("metal", 4.084, 4.09, 0.05, 2.45, 2.3, 2.308);
  at("ar_condicionado");
  rbox("teto", 3.19, 3.97, 2.23, 2.5, 2.2, 2.4, 0.03);
  at("rebaixo");
  box("teto", 1.95, W, 2.5, HT, -0.2, 2.8);
  at("trilho_luz");
  const loop = [[1.45, 3.77], [4.4, 3.77], [4.4, 5.65], [1.45, 5.65]];
  for (let i = 0; i < loop.length; i++) {
    const [a, b] = [loop[i], loop[(i + 1) % loop.length]];
    box("metal", Math.min(a[0], b[0]) - 0.02, Math.max(a[0], b[0]) + 0.02, HT - 0.04, HT, Math.min(a[1], b[1]) - 0.02, Math.max(a[1], b[1]) + 0.02);
  }
  const spots = SPOTS.map((x) => x.slice());
  for (const [u, v, au, ay, av, acesoSp = 1] of spots) {
    const y = HT - 0.12;
    cyl("metal", u, v, 8e-3, HT - 0.1, HT - 0.04, 6);
    const dir = new THREE.Vector3(au - u, ay - y, av - v).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const g = new THREE.CylinderGeometry(0.034, 0.034, 0.14, 16);
    g.applyQuaternion(q);
    g.translate(u, y, v);
    add("metal", g);
    const l = new THREE.CircleGeometry(0.027, 18);
    l.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir));
    l.translate(u + dir.x * 0.0715, y + dir.y * 0.0715, v + dir.z * 0.0715);
    add(acesoSp ? "lente" : "lenteOff", l);
  }
  at("luminaria_cozinha");
  box("lenteCoz", 0.925, 0.975, HT - 0.062, HT - 0.059, 0.48, 1.72);
  if (!SEMV) {
    at("varanda_mesa");
    cyl("metal", 2.6, 6.85, 0.28, 0.5, 0.52, 28);
    cyl("metal", 2.6, 6.85, 0.015, 0, 0.5, 8);
    cyl("metal", 2.6, 6.85, 0.16, 0, 0.012, 20);
    at("varanda_cadeira");
    box("metal", 3.25, 3.7, 0.42, 0.45, 6.62, 7.05);
    box("metal", 3.25, 3.7, 0.45, 0.88, 7.02, 7.05);
    for (const u of [3.27, 3.66]) for (const v of [6.64, 7.02]) box("metal", u, u + 0.02, 0, 0.42, v, v + 0.02);
    [].forEach(([u, v, r], k) => {
      at(`vaso_${k + 1}`);
      cyl("escuro", u, v, r * 0.7, 0, 0.32, 20, r * 0.6);
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1, 1.15, 1);
      g.translate(u, 0.32 + r, v);
      add("planta", g);
    });
  }
  for (const p of prim) if (p.mat === "piso") {
    const pos = p.geo.attributes.position, uv = p.geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.8, pos.getZ(i) / 1.8);
  }
  const mats = {};
  const texPiso = texturaPiso();
  for (const [k, o] of Object.entries(PALETA)) {
    const { fonte, ...op } = o;
    mats[k] = new THREE.MeshStandardMaterial({ ...op, color: new THREE.Color(op.color) });
    mats[k].name = k;
    mats[k].userData.fonte = fonte;
  }
  mats.piso.map = texPiso;
  mats.parede.shadowSide = THREE.FrontSide;
  mats.vidro = new THREE.MeshStandardMaterial({ name: "vidro", color: 13623526, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false });
  mats.lente = new THREE.MeshBasicMaterial({ name: "lente", color: 3815734 });
  mats.lente.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
varying float vFrente;`).replace("#include <project_vertex>", `#include <project_vertex>
        vFrente = max(0.0, dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
varying float vFrente;`).replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb = mix(vec3(0.07), diffuseColor.rgb, smoothstep(0.8, 0.97, vFrente));`);
  };
  mats.lente.customProgramCacheKey = () => "lente-direcional";
  mats.lenteCoz = new THREE.MeshBasicMaterial({ name: "lenteCoz", color: 3815734 });
  mats.lenteOff = new THREE.MeshBasicMaterial({ name: "lenteOff", color: 1973791 });
  const texQ = [texturaQuadro(7), texturaQuadro(23)];
  const matsQ = texQ.map((t, i) => new THREE.MeshStandardMaterial({ name: `quadro_${i + 1}`, map: t, roughness: 0.9 }));
  const NAO_SOMBRA = ["vidro", "lente", "lenteCoz", "lenteOff"];
  const grupo = new THREE.Group();
  grupo.name = "planta";
  const porMat = {};
  for (const p of prim) (porMat[p.mat] ||= []).push(p.geo);
  const malhas = {};
  for (const [k, lista] of Object.entries(porMat)) {
    const m = new THREE.Mesh(mergeGeometries(lista, false), mats[k]);
    m.name = k;
    m.castShadow = m.receiveShadow = !NAO_SOMBRA.includes(k);
    if (k === "vidro") m.renderOrder = 2;
    grupo.add(m);
    malhas[k] = m;
  }
  QV.forEach(([v0, v1], i) => {
    const g = new THREE.PlaneGeometry(v1 - v0 - 0.12, QY1 - QY0 - 0.14);
    g.rotateY(-Math.PI / 2);
    g.translate(W - 0.042, (QY0 + QY1) / 2, (v0 + v1) / 2);
    const m = new THREE.Mesh(g, matsQ[i]);
    m.name = `quadro_${i + 1}_arte`;
    m.receiveShadow = true;
    grupo.add(m);
  });
  if (espelhado) {
    grupo.scale.x = -1;
    grupo.position.x = W;
  }
  function grupoExport() {
    const raiz = new THREE.Group();
    raiz.name = "studio_final6";
    const porPeca = {};
    for (const p of prim) ((porPeca[p.peca] ||= {})[p.mat] ||= []).push(p.geo);
    for (const [nome, pm] of Object.entries(porPeca)) {
      const gr = new THREE.Group();
      gr.name = nome;
      for (const [k, lista] of Object.entries(pm)) {
        const m = new THREE.Mesh(mergeGeometries(lista.map((g) => g.clone()), false), mats[k]);
        m.name = Object.keys(pm).length > 1 ? `${nome}_${k}` : nome;
        gr.add(m);
      }
      raiz.add(gr);
    }
    grupo.children.filter((c) => c.name.startsWith("quadro_")).forEach((c) => {
      const q = c.clone();
      raiz.getObjectByName(c.name.replace("_arte", ""))?.add(q) || raiz.add(q);
    });
    return raiz;
  }
  const mu = (u) => espelhado ? W - u : u;
  const luminarias = {
    teto: { rotulo: "Spots do teto", spots: spots.map(([u, v, au, ay, av, aceso = 1]) => ({ pos: [mu(u), HT - 0.15, v], alvo: [mu(au), ay, av], aceso: !!aceso })), icone: [mu(2.93), HT - 0.3, 4.71] },
    abajur: { rotulo: "Abajur", pontos: abajurPos.map(([u, v]) => [mu(u), 0.7, v]), icone: [mu(abajurPos[0][0]), 1, abajurPos[0][1]] },
    cortineiro: { rotulo: "LED da cortina", aConferir: true, fita: { u0: mu(0), u1: mu(W), v: 5.8, y: HT - 0.11 }, icone: [mu(2), HT - 0.25, 5.75] },
    cozinha: { rotulo: "Luz da cozinha", linear: { u: mu(0.95), v0: 0.48, v1: 1.72, y: HT - 0.065 }, icone: [mu(0.95), HT - 0.18, 1.1] }
  };
  const SHELL = ["piso", "teto", "escuro", "parede", "vidro"];
  return { grupo, malhas, mats, luminarias, mu, SHELL, grupoExport, texturas: [texPiso, ...texQ], matsExtra: matsQ, spotsPlano: spots };
}
export {
  PALETA,
  construirPlanta
};
