const resp = await fetch(new URL("../predio.json", import.meta.url));
if (!resp.ok) throw new Error("predio.json: HTTP " + resp.status);
const PREDIO_CFG = await resp.json();
try {
  const r = await fetch(new URL("../marca.json", import.meta.url));
  if (r.ok) {
    const mj = await r.json();
    PREDIO_CFG.marcaSite = mj;
    if (mj && mj.placeholder === false) {
      if (mj.nome) PREDIO_CFG.marca.imobiliaria = mj.nome;
      if (mj.logo) {
        PREDIO_CFG.marca.logo = mj.logo;
        PREDIO_CFG.marca.logoAlt = mj.nome || "";
      }
    }
  }
} catch (e) {
}
const chaveLocal = (nome) => `${PREDIO_CFG.id}:${nome}`;
function migraChave(area, nome) {
  try {
    const velho = area.getItem(nome);
    if (velho != null && area.getItem(chaveLocal(nome)) == null) area.setItem(chaveLocal(nome), velho);
    if (velho != null) area.removeItem(nome);
  } catch (e) {
  }
}
export {
  PREDIO_CFG,
  chaveLocal,
  migraChave
};
