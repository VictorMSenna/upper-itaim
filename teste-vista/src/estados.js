const ESTADOS = {
  disponivel: { rotulo: "Disponível", dia: "#12a150", css: "#16a34a", noite: "acesa", listras: false },
  reservada: { rotulo: "Reservada", dia: "#e69f00", css: "#e69f00", noite: "fraca", listras: true },
  indisponivel: { rotulo: "Indisponível", dia: "#4a4e55", css: "#5b6068", noite: "apagada", listras: false }
};
const COR_LUZ_NOITE = { acesa: "#ffc66e", fraca: "#8a5c1c", apagada: "#1a222c" };
const LUZ_NOITE = Object.fromEntries(Object.entries(ESTADOS).map(([k, v]) => [k, v.noite]));
const nivelNoite = (situacao) => LUZ_NOITE[situacao] || "apagada";
const SELECAO = { cor: "#ffffff", pulsoSegundos: 6 };
const TEXTO = { acesa: "luz acesa", fraca: "fraca", apagada: "apagada" };
const ROTULO_NOITE = "Modo noite: " + ["acesa", "fraca", "apagada"].map((n) => {
  const s = Object.keys(ESTADOS).find((k) => ESTADOS[k].noite === n);
  return `${TEXTO[n]} = ${ESTADOS[s].rotulo.toLowerCase()}`;
}).join(" · ");
function aplicarCoresCss(raiz = document.documentElement) {
  raiz.style.setProperty("--disp", ESTADOS.disponivel.css);
  raiz.style.setProperty("--res", ESTADOS.reservada.css);
  raiz.style.setProperty("--ind", ESTADOS.indisponivel.css);
}
export {
  COR_LUZ_NOITE,
  ESTADOS,
  LUZ_NOITE,
  ROTULO_NOITE,
  SELECAO,
  aplicarCoresCss,
  nivelNoite
};
