import { PREDIO_CFG as P } from "./predio.js";
const id = P.identidade, mc = P.marca, lg = P.legal;
const CONFIG = {
  nome: id.nome,
  nomeNoPdf: id.nomeNoPdf,
  endereco: id.endereco,
  tabela: lg.tabela,
  tabelaCurta: lg.tabelaCurta,
  atualizado: lg.atualizado,
  whatsapp: mc.whatsapp,
  mensagemWhatsapp: (numero) => mc.mensagemWhatsapp.replaceAll("{numero}", numero),
  mensagemReserva: (numero) => (mc.mensagemReserva || mc.mensagemWhatsapp).replaceAll("{numero}", numero),
  mensagemPredio: mc.mensagemPredio || "",
  corretorCurto: mc.corretorCurto || mc.corretor,
  bairroCidade: id.bairroCidade || "",
  enderecoRua: id.enderecoRua || "",
  cartao: P.cartao || {},
  faltaWhatsapp: mc.faltaWhatsapp,
  imobiliaria: mc.imobiliaria,
  linhaDemo: lg.linhaDemo || "",
  marcaLogo: mc.logo || null,
  marcaLogoAlt: mc.logoAlt || "",
  corretor: mc.corretor,
  construtora: lg.construtora,
  registro: lg.registro,
  autorizacao: lg.autorizacao,
  estadoImovel: id.estadoImovel,
  tipologia: id.tipologia,
  tipologiaPlural: id.tipologiaPlural,
  foraDaTabela: lg.foraDaTabela,
  fonteTabela: lg.fonteTabela,
  avisosCard: lg.avisosCard,
  avisosCardCurto: lg.avisosCardCurto,
  planta: P.planta,
  urlPublica: "",
  vistaFoto: P.vistaFoto,
  sol: {
    horasPorSegundo: 1,
    noiteSegundos: 3,
    toqueCurtoMin: 30,
    toqueCurtoMs: 260,
    estacaoInicial: "primavera",
    horaInicial: "09:00",
    rotulo: "Simulação do sol — pode variar com obstáculos não mapeados.",
    rotuloNoiteFoto: P.vistaFoto.rotuloNoiteFoto
  },
  demo: {
    rendersManifesto: null,
    tour360Ativo: true,
    tour360Manifesto: "../teste/assets/render/tour360/manifesto.json", // E0 21/10: tour layers read from the published TEST (no 353 MB copy)
    tour360Amostra: "../teste/assets/render/tour360/manifesto.json"
  },
  fotos2026: P.fotos2026,
  tour: P.tour
};
export {
  CONFIG
};
