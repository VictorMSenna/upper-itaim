const qs = new URLSearchParams(location.search);
const minutos = (t, pad) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? +m[1] * 60 + +m[2] : pad;
};
const avisa = (v) => {
  document.documentElement.dataset.vitrine = v;
  try {
    if (window.parent !== window) window.parent.postMessage({ fonte: "modulo-3d", vitrine: v }, "*");
  } catch (e) {
  }
};
async function iniciarVitrine(app) {
  document.documentElement.classList.add("vitrine");
  app.fecharAbertura();
  app.painelUnidades(false);
  if (app.modo3d !== "3d" || !app.cena) {
    avisa("sem-3d");
    return;
  }
  const cena = app.cena, c = cena.controls;
  const retrato = innerWidth < innerHeight;
  const dist = retrato ? 260 : 200;
  const longe = Math.round(dist * 1.6);
  const enquadra = (d) => {
    c.enabled = false;
    c.maxDistance = Math.max(c.maxDistance, longe + 40);
    c.rotateTo(-2.6, 1.22, false);
    c.dollyTo(d, false);
    cena.pedirRender();
  };
  if (cena.esconderArco) cena.esconderArco(true);
  const S = await app.carregarSol();
  S.rel.estacao("primavera");
  enquadra(longe);
  const de = minutos(qs.get("de"), 17 * 60 + 30), ate = minutos(qs.get("ate"), 20 * 60 + 30);
  const dur = Math.max(1, Math.min(60, +qs.get("dur") || 9)) * 1e3;
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fim = () => {
    S.rel.hora(ate);
    enquadra(dist);
    avisa("noite");
    if (qs.get("interativo") === "1") {
      c.minDistance = Math.max(c.minDistance, 140);
      c.maxDistance = dist + 120;
      c.enabled = true;
    }
    cena.pedirRender();
  };
  S.rel.hora(reduz ? ate : de);
  await new Promise((ok) => {
    const t02 = performance.now();
    let q = 0;
    const olha = () => {
      const t = window.__g3dTiles;
      const st = t && t.stats ? t.stats.queued + t.stats.downloading + t.stats.parsing : 0;
      q = st === 0 ? q + 1 : 0;
      if (q >= 6 || performance.now() - t02 > 25e3) ok();
      else setTimeout(olha, 250);
    };
    setTimeout(olha, 500);
  });
  enquadra(reduz ? dist : longe);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (typeof app.vitrinePronta === "function") app.vitrinePronta();
  if (reduz) {
    fim();
    return;
  }
  avisa("animando");
  const t0 = performance.now();
  await new Promise((ok) => {
    const passo = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      S.rel.hora(Math.round(de + (ate - de) * e));
      c.dollyTo(longe + (dist - longe) * e, false);
      if (k < 1) setTimeout(passo, 120);
      else ok();
    };
    setTimeout(passo, 120);
  });
  fim();
}
export {
  iniciarVitrine
};
