import { chaveLocal, migraChave } from "./predio.js";
if (typeof localStorage !== "undefined") {
  migraChave(localStorage, "tabela3d-nivel-teto-3");
  migraChave(localStorage, "tabela3d-foto-ativa");
}
let cache = null;
function rebaixar() {
  const ordem = ["leve", "medio-", "medio", "ios", "topo"], atual = capacidade().nivel, i = ordem.indexOf(atual);
  if (i <= 0) return false;
  try {
    localStorage.setItem(chaveLocal("tabela3d-nivel-teto-3"), ordem[i - 1]);
  } catch (e) {
    return false;
  }
  return true;
}
function vigiaQueda() {
  if (vigiaQueda.ok) return;
  vigiaQueda.ok = true;
  const marca = () => {
    try {
      if (document.visibilityState === "visible") sessionStorage.setItem(chaveLocal("tabela3d-vivo"), String(Date.now()));
    } catch (e) {
    }
  };
  const tira = () => {
    try {
      sessionStorage.removeItem(chaveLocal("tabela3d-vivo"));
    } catch (e) {
    }
  };
  marca();
  setInterval(marca, 2e4);
  addEventListener("pagehide", tira);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" ? marca() : tira());
}
function capacidade() {
  if (cache) return cache;
  let caiu = false;
  try {
    const t = +localStorage.getItem(chaveLocal("tabela3d-foto-ativa"));
    if (t && Date.now() - t < 3 * 36e5) caiu = true;
    localStorage.removeItem(chaveLocal("tabela3d-foto-ativa"));
  } catch (e) {
  }
  try {
    const t = +sessionStorage.getItem(chaveLocal("tabela3d-vivo"));
    if (t && Date.now() - t < 9e4) caiu = true;
  } catch (e) {
  }
  const q = new URLSearchParams(location.search).get("nivel");
  const movel = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  const ios = /iPhone|iPad/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || (ios ? 4 : 8);
  let gpu = "", maxTex = 4096;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      const perde = gl.getExtension("WEBGL_lose_context");
      if (perde) perde.loseContext();
    }
  } catch (e) {
  }
  const adreno = /Adreno \(TM\) (\d{3})/i.exec(gpu);
  const gpuMedia = /Mali-G(5\d|7[0-7])\b|Mali-T|PowerVR|Adreno \(TM\) [345]\d\d/i.test(gpu) || adreno && +adreno[1] < 640;
  let nivel = "topo";
  if (movel && (mem <= 2 || maxTex < 4096)) nivel = "leve";
  else if (ios) nivel = "ios";
  else if (movel && !ios && (mem <= 4 || gpuMedia)) nivel = "medio";
  let teto = null;
  try {
    teto = localStorage.getItem(chaveLocal("tabela3d-nivel-teto-3"));
  } catch (e) {
  }
  const ordem = ["leve", "medio-", "medio", "ios", "topo"];
  if (teto && ordem.indexOf(teto) >= 0 && ordem.indexOf(teto) < ordem.indexOf(nivel)) nivel = teto;
  if (q === "topo" || q === "medio" || q === "leve" || q === "medio-" || q === "ios") nivel = q;
  const T = {
    topo: { google: true, tilesMB: movel ? 700 : 1200, erro360: 8, larguraPano: 4096, dprMax: 3, parse: movel ? 3 : 8 },
    ios: { google: true, tilesMB: 240, erro360: 16, larguraPano: 3072, dprMax: 2, parse: 2 },
    medio: { google: true, tilesMB: 260, erro360: 24, larguraPano: 3072, dprMax: 2.5, parse: 2 },
    "medio-": { google: true, tilesMB: 200, erro360: 28, larguraPano: 2048, dprMax: 2, parse: 2 },
    leve: { google: false, tilesMB: 0, erro360: 32, larguraPano: 2048, dprMax: 1.5, parse: 1 }
  }[nivel];
  const pw = +new URLSearchParams(location.search).get("pano");
  if (pw) T.larguraPano = pw;
  cache = { nivel, movel, mem, gpu, maxTex, ...T, rebaixar };
  if (caiu && nivel !== "leve" && !q) {
    try {
      sessionStorage.removeItem(chaveLocal("tabela3d-vivo"));
    } catch (e) {
    }
    if (typeof window !== "undefined") window.__capacidade = cache;
    rebaixar();
    cache = null;
    return capacidade();
  }
  if (typeof window !== "undefined") {
    window.__capacidade = cache;
    vigiaQueda();
  }
  return cache;
}
export {
  capacidade,
  rebaixar
};
