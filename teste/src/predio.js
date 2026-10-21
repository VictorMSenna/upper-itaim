// FILA C1/C2 (15/10/2026): the building's configuration lives in predio.json at the site root - no value of the building
// inside src/*.js or index.html (PROTOCOLO rule 16; schema in docs/ESQUELETO-UPPER.md 2.3). Loaded ONCE here with a
// top-level await, so every module that imports it waits for it. index.html gets the same values at publish time
// (docs/b10-scripts/publicar_cfg.py preenche_index fills the {{p:...}} placeholders).
const resp = await fetch(new URL('../predio.json', import.meta.url));
if (!resp.ok) throw new Error('predio.json: HTTP ' + resp.status);
export const PREDIO_CFG = await resp.json();

// C2: every building is served from the same origin (victormsenna.github.io/<repo>/), so browser storage keys carry the
// building id: two buildings open in two tabs never share the device step-down, the crash guard or the lamp choice.
export const chaveLocal = (nome) => `${PREDIO_CFG.id}:${nome}`;
// one-time move of a key written before 15/10 without the id (only the Upper existed then)
export function migraChave(area, nome) {
  try {
    const velho = area.getItem(nome);
    if (velho != null && area.getItem(chaveLocal(nome)) == null) area.setItem(chaveLocal(nome), velho);
    if (velho != null) area.removeItem(nome);
  } catch (e) { /* private mode */ }
}
