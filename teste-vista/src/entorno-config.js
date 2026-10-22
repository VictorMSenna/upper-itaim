const PADRAO_B7 = { entorno: true, entornoFora: true, fachada: true, interiorBake: false, interiorProcedural: false };
function b7Ativo(chave) {
  try {
    const v = new URLSearchParams(location.search).get(chave);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch (e) {
  }
  return !!PADRAO_B7[chave];
}
export {
  PADRAO_B7,
  b7Ativo
};
