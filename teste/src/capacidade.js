// What this device can hold (Victor 07/10, after the Google 3D crash on his Samsung M21s: "seria legal se ele pudesse
// identificar e dar o que cada um aguenta"). One tier for the whole page, decided once from what the browser reports:
//   navigator.deviceMemory (GB, rounded down to a power of 2 and capped at 8 by Chrome; Safari does not report it),
//   phone or not, the GPU name (WEBGL_debug_renderer_info) and the largest texture.
// Measured 07/10 on the test Chrome (phone emulation): outside view with Google ~600 MB of tiles; 360 + Google renderer
// process 1.4 GB before the CPU copies were dropped. ?nivel=topo|medio|leve forces a tier (tests).
//   topo  : the maximum (8 GB+ phones, iPhones, computers)
//   medio : 4-6 GB phones and mid GPUs (Mali G5x/G7x, Adreno 5xx/6xx below 640, PowerVR): smaller tile budget, a bit less
//           Google detail, 360 layers at 2048, screen density up to 2
//   leve  : 2 GB or less / old GPU: no Google city (our city only), 360 at 2048, density up to 1.5
let cache = null;
// the GPU context was lost (out of GPU memory): one step down for this device, remembered; returns false if already lowest
export function rebaixar() {
  const ordem = ['leve', 'medio-', 'medio', 'ios', 'topo'], atual = capacidade().nivel, i = ordem.indexOf(atual);
  if (i <= 0) return false;
  try { localStorage.setItem('tabela3d-nivel-teto-3', ordem[i - 1]); } catch (e) { return false; }
  return true;
}
// alive mark of this tab (see capacidade()): refreshed while visible, removed when the page is left or hidden (switching apps
// on a phone can kill a background tab: that is not a crash of ours)
function vigiaQueda() {
  if (vigiaQueda.ok) return; vigiaQueda.ok = true;
  const marca = () => { try { if (document.visibilityState === 'visible') sessionStorage.setItem('tabela3d-vivo', String(Date.now())); } catch (e) { /* ignore */ } };
  const tira = () => { try { sessionStorage.removeItem('tabela3d-vivo'); } catch (e) { /* ignore */ } };
  marca(); setInterval(marca, 20e3);
  addEventListener('pagehide', tira);
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? marca() : tira()));
}
export function capacidade() {
  if (cache) return cache;
  // crash guard (08/10): the page died while the window photo was being shot (renderer out of memory, 'Ah, nao!') ->
  // this device steps one level down now (the mark is removed when a shot completes)
  let caiu = false; try { const t = +localStorage.getItem('tabela3d-foto-ativa'); if (t && Date.now() - t < 3 * 3600e3) caiu = true; localStorage.removeItem('tabela3d-foto-ativa'); } catch (e) { /* private mode */ }
  // 08/10 (Hugo's brother's iPhone: 'A problem repeatedly occurred' on the unit card): the page itself died with the 3D on.
  // Mark per TAB, refreshed every 20 s while visible, removed on leaving / hiding the page: a fresh mark at load = it crashed.
  try { const t = +sessionStorage.getItem('tabela3d-vivo'); if (t && Date.now() - t < 90e3) caiu = true; } catch (e) { /* private mode */ }
  const q = new URLSearchParams(location.search).get('nivel');
  const movel = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
  const ios = /iPhone|iPad/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || (ios ? 4 : 8); // Safari does not report memory: assume a 4 GB iPhone (its tab limit is far below that)
  let gpu = '', maxTex = 4096;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      const perde = gl.getExtension('WEBGL_lose_context'); if (perde) perde.loseContext();
    }
  } catch (e) { /* no WebGL info: decide by memory only */ }
  const adreno = /Adreno \(TM\) (\d{3})/i.exec(gpu);
  const gpuMedia = /Mali-G(5\d|7[0-7])\b|Mali-T|PowerVR|Adreno \(TM\) [345]\d\d/i.test(gpu) || (adreno && +adreno[1] < 640);
  let nivel = 'topo';
  if (movel && (mem <= 2 || maxTex < 4096)) nivel = 'leve';
  else if (ios) nivel = 'ios';
  else if (movel && !ios && (mem <= 4 || gpuMedia)) nivel = 'medio';
  // a device that already lost its GPU context here runs one step lower (rebaixar(), stored per device). Key '-2' (08/10):
  // layers no longer keep mipmaps (less GPU memory), so devices that stepped down before get one more try at their tier
  let teto = null; try { teto = localStorage.getItem('tabela3d-nivel-teto-3'); } catch (e) { /* private mode */ }
  const ordem = ['leve', 'medio-', 'medio', 'ios', 'topo'];
  if (teto && ordem.indexOf(teto) >= 0 && ordem.indexOf(teto) < ordem.indexOf(nivel)) nivel = teto;
  if (q === 'topo' || q === 'medio' || q === 'leve' || q === 'medio-' || q === 'ios') nivel = q;
  const T = {
    topo: { google: true, tilesMB: movel ? 700 : 1200, erro360: 8, larguraPano: 4096, dprMax: 3, parse: movel ? 3 : 8 }, // Victor 07/10: computers and top phones get Google's finest detail
    // iPhone/iPad (08/10): Safari kills the tab well below the phone's RAM and counts WebGL memory in it -> tile budget like
    // the mid tier, Google detail between, 3072 layers, density 2 (the 500 MB / 4096 / dpr 3 setup crashed on the unit card)
    ios: { google: true, tilesMB: 240, erro360: 16, larguraPano: 3072, dprMax: 2, parse: 2 },
    medio: { google: true, tilesMB: 260, erro360: 24, larguraPano: 3072, dprMax: 2.5, parse: 2 }, // 3072: what Victor's M21s ran in the demo (2048 looked blurry)
    'medio-': { google: true, tilesMB: 200, erro360: 28, larguraPano: 2048, dprMax: 2, parse: 2 },  // after a lost GPU context at 'medio' (M21s 07/10)
    leve: { google: false, tilesMB: 0, erro360: 32, larguraPano: 2048, dprMax: 1.5, parse: 1 },
  }[nivel];
  const pw = +new URLSearchParams(location.search).get('pano'); if (pw) T.larguraPano = pw; // tests
  cache = { nivel, movel, mem, gpu, maxTex, ...T, rebaixar };
  if (caiu && nivel !== 'leve' && !q) { try { sessionStorage.removeItem('tabela3d-vivo'); } catch (e) { /* ignore */ } if (typeof window !== 'undefined') window.__capacidade = cache; rebaixar(); cache = null; return capacidade(); } // one step down per crash; last step = leve (our city, no Google)
  if (typeof window !== 'undefined') { window.__capacidade = cache; vigiaQueda(); }
  return cache;
}
