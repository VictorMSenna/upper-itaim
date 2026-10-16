// Single place the page reads its settings from. 15/10 (FILA C1): everything that belongs to the BUILDING or the broker
// comes from predio.json (src/predio.js); what stays written here is the same for every building (sun pace, demo
// switches). The keys of CONFIG did not change, so app.js / sol.js / tour.js and the data-cfg slots of index.html read the
// same names as before. Any value starting with "[falta" is shown only in ?revisao=1, exactly as written.
import { PREDIO_CFG as P } from './predio.js';

const id = P.identidade, mc = P.marca, lg = P.legal;
export const CONFIG = {
  nome: id.nome,
  nomeNoPdf: id.nomeNoPdf,
  endereco: id.endereco,
  tabela: lg.tabela,
  tabelaCurta: lg.tabelaCurta,
  atualizado: lg.atualizado,

  // WhatsApp that receives the leads (decision D7: the broker's). Digits only, with country code.
  whatsapp: mc.whatsapp,
  mensagemWhatsapp: (numero) => mc.mensagemWhatsapp.replaceAll('{numero}', numero),
  // Card do Hugo (16/10, spec T5): message by kind - unit (above), reservation ("Reservar com"), building (no unit)
  mensagemReserva: (numero) => (mc.mensagemReserva || mc.mensagemWhatsapp).replaceAll('{numero}', numero),
  mensagemPredio: mc.mensagemPredio || '',
  corretorCurto: mc.corretorCurto || mc.corretor,
  bairroCidade: id.bairroCidade || '',
  enderecoRua: id.enderecoRua || '',
  // building card, tabs, rental, market, legal, docs: every null field stays hidden for the client (predio.json "cartao")
  cartao: P.cartao || {},
  faltaWhatsapp: mc.faltaWhatsapp,

  imobiliaria: mc.imobiliaria,
  creciJ: mc.creciJ,
  corretor: mc.corretor,
  creciCorretor: mc.creciCorretor,
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

  // Public link of the page, used by "Copiar link desta unidade". Empty = use the address of the open page.
  urlPublica: '',

  // Photo view (front B2). If these files are not published next to the page, the "Foto" tab stays hidden.
  // SVG contract: one <polygon>/<path> per unit with data-id="andar-final" (e.g. "10-4"), or id="u104".
  vistaFoto: P.vistaFoto,

  // Sun cycle (hold the button for the sun to move). Same for every building.
  sol: {
    horasPorSegundo: 1,      // day pace while the button is held: 1 h of day per second
    noiteSegundos: 3,        // the whole night (sunset -> sunrise) passes in this many seconds
    toqueCurtoMin: 30,       // a short tap advances this many minutes
    toqueCurtoMs: 260,       // press shorter than this = short tap
    estacaoInicial: 'primavera',
    horaInicial: '09:00',
    rotulo: 'Simulação do sol — pode variar com obstáculos não mapeados.',
    // rotuloNoite: built from the convention table in src/noite.js (F25), not here
    rotuloNoiteFoto: P.vistaFoto.rotuloNoiteFoto, // the photo's date is the building's (predio.json)
  },

  // Demo (07/10): features that depend on other fronts stay OFF unless their files exist (never half-working).
  demo: {
    // B6 photoreal stills: shown first in the gallery only if this manifest exists ({ fotos: [{ arq, legenda }] }).
    // null = no request at all (15/10 FILA D16: the demo manifest is never published, so it was a 404 on every opening)
    rendersManifesto: null,
    // B6 360 tour: replaces the 3D interior only if this manifest exists (the real batch); ?tour360=amostra tests the sample
    tour360Ativo: true, // ON since 08/10 (v4 batch, only lamps whose fixture is seen: teto, abajur, cozinha)
    tour360Manifesto: 'assets/render/tour360/manifesto.json', // B6's v3 batch writes manifesto.json (manifest.json 404'd)
    tour360Amostra: 'assets/render/tour360/manifesto.json',
  },

  fotos2026: P.fotos2026,
  tour: P.tour,
};
