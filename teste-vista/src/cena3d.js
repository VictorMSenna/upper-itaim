import { capacidade, rebaixar } from "./capacidade.js";
import { PREDIO_CFG } from "./predio.js";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import CameraControls from "camera-controls";
import { construirPredio } from "./predio-geo.js";
import { FORMA } from "./predio-forma.js";
import { CONTINUO } from "./predio-continuo.js";
import { forcaSolDireto, calorSol, corCeu, smooth } from "./luz-curva.js";
import { Sky } from "three/addons/objects/Sky.js";
import { b7Ativo } from "./entorno-config.js";
import { LUZ_NOITE, COR_LUZ_NOITE, nivelNoite } from "./noite.js";
CameraControls.install({ THREE });
import { ESTADOS, SELECAO } from "./estados.js";
function criarCena({
  container,
  predio,
  unidades,
  teste = false,
  onTocarUnidade,
  onDuploToque,
  onTocarAndar,
  onHover,
  onArrastarSol
}) {
  void predio;
  const NIV = FORMA.niveis;
  const H = NIV.pe_direito;
  const LAJES = NIV.lajes;
  const LAJE = NIV.espessura_laje;
  const TOPO = NIV.topo_coroa;
  const cxs = Object.values(FORMA.unidades).map((u) => u.caixa);
  const X0 = Math.min(...cxs.map((c) => c[0])), X1 = Math.max(...cxs.map((c) => c[3]));
  const Z0 = Math.min(...cxs.map((c) => c[2])), Z1 = Math.max(...cxs.map((c) => c[5]));
  const vols = FORMA.volumes.map((v) => v.caixa);
  const BX0 = Math.min(...vols.map((c) => c[0])), BX1 = Math.max(...vols.map((c) => c[3]));
  const BZ0 = Math.min(...vols.map((c) => c[2])), BZ1 = Math.max(...vols.map((c) => c[5]));
  const CX = (X0 + X1) / 2, CZ = (Z0 + Z1) / 2;
  const W = X1 - X0, D = Z1 - Z0;
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const RAIO_CEU = 2.5 * TOPO;
  const RAIO_ARCO = RAIO_CEU;
  const FOV_NORMAL = 56, FOV_SOL = 56;
  const DRONE = b7Ativo("entornoFora");
  const POL = {
    inicio: (DRONE ? 0.4 : 0.42) * Math.PI,
    max: (DRONE ? 0.455 : 0.48) * Math.PI,
    sol: 0.42 * Math.PI,
    maxSol: 0.44 * Math.PI,
    solRetrato: 0.46 * Math.PI,
    maxSolRetrato: 0.47 * Math.PI
  };
  let ceuRetrato = false, estacaoAtual = null;
  let topoCeuVisivel = 12;
  const ELEV_TELA = (el) => Math.max(0, el);
  const ELEV_TELA_CEU = (el) => {
    const e = Math.max(0, el);
    const topo = Math.max(3, topoCeuVisivel - (ceuRetrato ? 4 : 3));
    const teto = 1.5 + (topo - 1.5) * 0.55;
    if (e <= 12) return 1.5 + e * (teto - 1.5) / 12;
    return teto + (Math.min(e, 90) - 12) * (topo - teto) / 78;
  };
  let largura = 1, altura = 1;
  let solBorda = null;
  const stats = { quadros: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, pronto: false };
  const clock = { t: performance.now(), getDelta() {
    const n = performance.now();
    const d = (n - this.t) / 1e3;
    this.t = n;
    return Math.min(d, 0.25);
  } };
  let rafId = 0, sujo = true, ociosos = 0;
  let controls = null;
  let ponteiroAbaixo = 0, continuo = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default", preserveDrawingBuffer: !!teste });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, capacidade().dprMax));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-label", "Prédio em 3D: arraste para girar, toque numa janela para ver a unidade");
  canvas.className = "cena-canvas";
  container.prepend(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_NORMAL, 1, 1, 3600);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const tema = {};
  function lerTema() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    tema.ceu = new THREE.Color(v("--cena-ceu", "#c9cfcc"));
    tema.fundo = new THREE.Color(v("--cena-fundo", "#e4dfd5"));
    tema.chao = new THREE.Color(v("--cena-chao", "#dcd6cb"));
    tema.argila = new THREE.Color(v("--cena-argila", "#efebe4"));
    tema.argilaEscura = new THREE.Color(v("--cena-argila-2", "#cfc9be"));
    tema.tijolo = new THREE.Color(v("--cena-tijolo", "#8a4a35"));
    tema.vizinho = new THREE.Color(v("--cena-vizinho", "#dcd7cd"));
    tema.linha = new THREE.Color(v("--cena-linha", "#3a3530"));
    tema.rua = new THREE.Color(v("--cena-rua", "#3c3e42"));
    tema.vidro = new THREE.Color(v("--cena-vidro", "#9fbdb2"));
    tema.destaque = new THREE.Color(v("--cena-destaque", "#14110f"));
  }
  lerTema();
  function texturaCeu(topo, horizonte) {
    const cv = document.createElement("canvas");
    cv.width = 2;
    cv.height = 256;
    const g = cv.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#" + topo.getHexString());
    gr.addColorStop(1, "#" + horizonte.getHexString());
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  let ceuDia = texturaCeu(tema.ceu, tema.fundo);
  const ceuCv = document.createElement("canvas");
  ceuCv.width = 2;
  ceuCv.height = 256;
  const ceuTex = new THREE.CanvasTexture(ceuCv);
  ceuTex.colorSpace = THREE.SRGBColorSpace;
  function pintarCeu(topo, horiz) {
    const g = ceuCv.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, topo);
    gr.addColorStop(1, horiz);
    g.fillStyle = gr;
    g.fillRect(0, 0, 2, 256);
    ceuTex.needsUpdate = true;
  }
  scene.background = ceuDia;
  scene.fog = new THREE.Fog(tema.fundo.clone(), 500, 1500);
  const LUZ = { sol: 2.8, env: 0.36, hemi: 0.16, sombra: 0.95 };
  scene.environmentIntensity = LUZ.env;
  const hemi = new THREE.HemisphereLight(16777215, 12037534, LUZ.hemi);
  scene.add(hemi);
  const sol = new THREE.DirectionalLight(16774374, LUZ.sol);
  const CENTRO = new THREE.Vector3(CX, 0, CZ);
  const CENTRO_ARCO = CENTRO;
  sol.position.set(-45, 70, -50);
  sol.target.position.copy(CENTRO);
  sol.castShadow = true;
  const MAPA = mobile ? 2048 : 4096;
  sol.shadow.mapSize.set(MAPA, MAPA);
  const sc = sol.shadow.camera;
  sc.left = -60;
  sc.right = 60;
  sc.top = 72;
  sc.bottom = -60;
  sc.near = 10;
  sc.far = 340;
  sol.shadow.bias = -8e-4;
  sol.shadow.normalBias = 0.05;
  sol.shadow.intensity = LUZ.sombra;
  sol.shadow.radius = +(/[?&]sombraRaio=([\d.]+)/.exec(location.search) || [0, mobile ? 2.5 : 2])[1];
  scene.add(sol, sol.target);
  const matUnid = new THREE.MeshStandardMaterial({ color: 16777215, roughness: 0.8, metalness: 0 });
  const matChao = new THREE.MeshStandardMaterial({ color: tema.chao, roughness: 1, metalness: 0 });
  const matRua = new THREE.MeshStandardMaterial({ color: tema.rua, roughness: 1, metalness: 0 });
  const CALCADA = new THREE.Color("#b3ada3");
  const matCalcada = new THREE.MeshStandardMaterial({ color: CALCADA, roughness: 1, metalness: 0 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tmpQ = new THREE.Quaternion();
  const matrizBox = (x0, y0, z0, x1, y1, z1) => new THREE.Matrix4().compose(
    new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    tmpQ,
    new THREE.Vector3(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
  );
  const matUnidade = new THREE.MeshStandardMaterial({ color: 16777215, roughness: 0.32, metalness: 0.05 });
  matUnidade.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
        varying vec2 vUvE5;`).replace("#include <color_fragment>", `#include <color_fragment>
        {
          vec2 q = vUvE5;
          float fx = 0.018, fy = 0.03;                                   // outer frame (~8-10 cm)
          float borda = step(q.x, fx) + step(1.0 - fx, q.x) + step(q.y, fy) + step(1.0 - fy, q.y);
          float m = abs(fract(q.x * 4.0 + 0.5) - 0.5) / 4.0;            // 3 mullions (4 panes)
          float mul = 1.0 - step(0.006, m);
          float tr = 1.0 - step(0.008, abs(q.y - 0.86));                 // transom at door height
          float quadro = clamp(borda + mul + tr, 0.0, 1.0);
          vec3 vidro = mix(vec3(0.05, 0.07, 0.08), diffuseColor.rgb, 0.92); // tinted glass, a bit deeper
          diffuseColor.rgb = mix(vidro, vec3(0.16, 0.165, 0.17), quadro);
        }`).replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.7, step(0.5, clamp(step(vUvE5.x, 0.018) + step(0.982, vUvE5.x) + step(vUvE5.y, 0.03) + step(0.97, vUvE5.y), 0.0, 1.0)));`);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
        varying vec2 vUvE5;`).replace("#include <uv_vertex>", `#include <uv_vertex>
        vUvE5 = uv;`);
  };
  matUnidade.customProgramCacheKey = () => "unidade-e5";
  const { _leia: _m0, ...MAT_ } = PREDIO_CFG.materiais;
  const PB = construirPredio(THREE, { forma: FORMA, linhas: true, materiais: {
    ...MAT_,
    unidade: matUnidade
  } });
  scene.add(PB.grupo);
  PB.grupo.traverse((o) => {
    if (o.isMesh && o.geometry.attributes.uv && !o.geometry.attributes.uvB) o.geometry.setAttribute("uvB", o.geometry.attributes.uv.clone());
  });
  {
    const CORES = PREDIO_CFG.materiaisEnchimento;
    for (const mat of ["branco", "pedra"]) {
      const lista = CONTINUO.filter((c) => c.material === mat);
      if (!lista.length) continue;
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: CORES[mat], roughness: 0.9 }), lista.length);
      lista.forEach((c, k) => m.setMatrixAt(k, matrizBox(...c.caixa)));
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = m.receiveShadow = true;
      m.raycast = () => {
      };
      m.name = "predio-continuo-" + mat;
      PB.grupo.add(m);
    }
  }
  let gradeFn = null;
  let entB7 = { carregado: false, atualizarCamera() {
  }, atualizarSol() {
  } };
  if (DRONE) {
    import("./entorno.js").then(({ criarEntorno: criarEntorno2, gradeEntorno }) => {
      gradeFn = gradeEntorno || null;
      if (solEstado.ultimo && gradeFn) pedirRender();
      entB7 = criarEntorno2({ cena: scene, renderer, modo: "externo", alvo: new THREE.Vector3(CX, TOPO * 0.45, CZ), aoCarregar: () => {
        entB7.carregado = true;
        chao.visible = rua.visible = false;
        if (entorno) entorno.visible = entornoFantasma.visible = false;
        pedirRender();
        setTimeout(() => nossoCarregou(), 0);
      } });
    }).catch((e) => console.error("B7 entorno", e));
  }
  const b7 = { fachada: false };
  let gCena = null, torreCamada = false;
  let googleEsperado = !/[?&]google3d=0/.test(location.search);
  let preJanela = null;
  let avisaNosso = null;
  const nossoPronto = new Promise((ok) => {
    avisaNosso = ok;
    setTimeout(ok, 2e4);
  });
  const nossoCarregou = () => {
    if ((entB7.carregado || !DRONE) && (b7.fachada || !b7Ativo("fachada"))) avisaNosso();
  };
  if (!/[?&]google3d=0/.test(location.search)) Promise.resolve().then(() => import("./google-vista.js")).then(async (gm) => {
    const G_ = PREDIO_CFG.geo, RT_ = G_.recorteTorre;
    const lote = await fetch(G_.lote).then((r) => r.ok ? r.json() : null).catch(() => null);
    gCena = await gm.ligarGoogleCena({
      scene,
      camera,
      renderer,
      ref: {
        ...G_.origemGoogle,
        rumoX: G_.rumoX
        /* 15/10 audit S1: 73.36 true north (71.67 = UTM grid bearing, Google city turned ~1.7 deg) */
      },
      aoMudar: () => pedirRender(),
      recorte: (() => {
        const bx = new THREE.Box3().setFromObject(PB.grupo);
        bx.min.x -= RT_.inflar;
        bx.min.z -= RT_.inflar;
        bx.max.x += RT_.inflar;
        bx.max.z += RT_.inflar;
        bx.min.y = RT_.desdeY;
        bx.max.y += RT_.acimaDoTopo;
        if (lote && lote.b5_xz) {
          bx.lote = lote.b5_xz;
          bx.margemLote = G_.margemLote;
        }
        return bx;
      })(),
      mostrar: () => {
        googleEsperado = false;
        chao.visible = rua.visible = !entB7.carregado;
        if (entB7.grupo) {
          entB7.grupo.visible = !!entB7.carregado;
          if (b7SoSombra) voltaB7();
        }
        pedirRender();
      }
    });
    if (!gCena) {
      googleEsperado = false;
      pedirRender();
    }
    if (gCena && solEstado.ultimo) gCena.definirSol(solEstado.ultimo.el);
    if (gCena && preJanela) gCena.preCarregar(preJanela);
  }).catch((e) => {
    googleEsperado = false;
    pedirRender();
    console.warn("google3d (cena) indisponivel", e && e.message);
  });
  if (b7Ativo("fachada")) import("./predio-textura.js").then(({ texturizarPredio }) => texturizarPredio(PB, { renderer, mascara: true }).then((r) => {
    b7.fachada = true;
    nossoCarregou();
    b7.mascara = !!(r.mascararMaterial && r.mascararMaterial(matUnidNoite));
    if (b7.mascara) {
      const mascara = matUnidNoite.onBeforeCompile;
      matUnidNoite.onBeforeCompile = (sh) => {
        fachadaNoite(sh);
        mascara(sh);
      };
      matUnidNoite.customProgramCacheKey = () => "unid-noite-fachada-mascara";
      matUnidNoite.needsUpdate = true;
    }
    const v = meshNoite.visible;
    meshNoite.visible = true;
    try {
      renderer.compile(scene, camera);
    } catch (e) {
    }
    meshNoite.visible = v;
    pedirRender();
  })).catch((e) => console.error("B7 fachada", e));
  const meshUnid = PB.pecas.unidades;
  const inst = unidades.map((u) => PB.unidades.get(u.id).instancia);
  const doInst = new Map(inst.map((k, i) => [k, i]));
  const unidadeBox = unidades.map((u) => {
    const b = PB.unidades.get(u.id).caixa;
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
  });
  const corIndisp = new THREE.Color(ESTADOS.indisponivel.dia);
  stats.predio = "B5";
  const reservIdx = unidades.map((u, i) => u.situacao === "reservada" ? i : -1).filter((i) => i >= 0);
  let meshListras = null;
  if (reservIdx.length) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    g.strokeStyle = "rgba(40,28,0,0.55)";
    g.lineWidth = 9;
    for (let k = -64; k <= 128; k += 22) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 64, 64);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    meshListras = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false
    }), reservIdx.length);
    reservIdx.forEach((i, k) => {
      const b = unidadeBox[i];
      meshListras.setMatrixAt(k, matrizBox(b[0] - 0.01, b[1] - 0.01, b[2] - 0.01, b[3] + 0.01, b[4] + 0.01, b[5] + 0.01));
    });
    meshListras.raycast = () => {
    };
    scene.add(meshListras);
  }
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), matChao);
  chao.rotation.x = -Math.PI / 2;
  chao.position.copy(CENTRO);
  chao.receiveShadow = true;
  chao.raycast = () => {
  };
  scene.add(chao);
  const RUA_ = PREDIO_CFG.rua, COMPR_RUA = RUA_.comprimento;
  const rua = new THREE.Group();
  const asfalto = new THREE.Mesh(new THREE.PlaneGeometry(RUA_.largura, COMPR_RUA), matRua);
  asfalto.position.set(BX0 - RUA_.distancia, 0.02, CZ);
  const calcadas = [BX0 - RUA_.distancia + RUA_.largura / 2 + RUA_.calcada / 2, BX0 - RUA_.distancia - RUA_.largura / 2 - RUA_.calcada / 2].map((x) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(RUA_.calcada, COMPR_RUA), matCalcada);
    m.position.set(x, 0.04, CZ);
    return m;
  });
  [asfalto, ...calcadas].forEach((m) => {
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    m.raycast = () => {
    };
    rua.add(m);
  });
  scene.add(rua);
  rua.visible = false;
  const matLinha = PB.pecas.linhas ? PB.pecas.linhas.material : new THREE.LineBasicMaterial();
  matLinha.toneMapped = false;
  const matSel = new THREE.LineBasicMaterial({ color: SELECAO.cor, toneMapped: false, depthTest: false, transparent: true, linewidth: 2 });
  const matAndar = new THREE.LineBasicMaterial({ color: tema.destaque, toneMapped: false, transparent: true, opacity: 0.35 });
  const matHover = new THREE.LineBasicMaterial({ color: 16777215, toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 });
  const caixaLinhas = (b) => {
    const g = new THREE.EdgesGeometry(box);
    g.applyMatrix4(matrizBox(...b));
    return g;
  };
  const selAndar = new THREE.LineSegments(new THREE.BufferGeometry(), matAndar);
  const selUnid = new THREE.LineSegments(new THREE.BufferGeometry(), matSel);
  const selHover = new THREE.LineSegments(new THREE.BufferGeometry(), matHover);
  [selAndar, selUnid, selHover].forEach((o) => {
    o.renderOrder = 10;
    o.visible = false;
    o.raycast = () => {
    };
    scene.add(o);
  });
  const brilho = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
  brilho.visible = false;
  brilho.raycast = () => {
  };
  brilho.renderOrder = 9;
  scene.add(brilho);
  const estado = { andar: null, unidade: null, filtro: null };
  const corStatus = { disponivel: new THREE.Color(ESTADOS.disponivel.dia), reservada: new THREE.Color(ESTADOS.reservada.dia) };
  const corNoite = Object.fromEntries(Object.keys(LUZ_NOITE).map((s) => [s, new THREE.Color(COR_LUZ_NOITE[nivelNoite(s)])]));
  const fundoNoite = new THREE.Color("#15213a");
  const cTmp = new THREE.Color();
  const solEstado = { ativo: false, noite: 0, luzes: 0, modo: "real", flags: null, SOL: null, ref: null };
  const matUnidNoite = new THREE.MeshBasicMaterial({
    color: 16777215,
    toneMapped: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const fachadaNoite = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying float vFachada;\nattribute vec3 aFace;").replace("#include <begin_vertex>", `#include <begin_vertex>
        vFachada = step(0.5, dot(normal, aFace));
        vec3 escN = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        `);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFachada;").replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n  if (vFachada < 0.5) discard;");
  };
  matUnidNoite.onBeforeCompile = fachadaNoite;
  matUnidNoite.customProgramCacheKey = () => "unid-noite-fachada";
  const boxNoite = box.clone();
  const faceArr = new Float32Array(unidades.length * 3);
  unidades.forEach((u, i) => {
    const nn = PB.unidades.get(u.id)?.normal;
    if (nn) faceArr.set([nn.x, nn.y, nn.z], inst[i] * 3);
  });
  boxNoite.setAttribute("aFace", new THREE.InstancedBufferAttribute(faceArr, 3));
  const meshNoite = new THREE.InstancedMesh(boxNoite, matUnidNoite, unidades.length);
  unidadeBox.forEach((b, i) => meshNoite.setMatrixAt(inst[i], matrizBox(...b)));
  meshNoite.visible = false;
  meshNoite.raycast = () => {
  };
  scene.add(meshNoite);
  function pintar() {
    const luzes = solEstado.luzes || 0;
    unidades.forEach((u, i) => {
      const foraFiltro = estado.filtro && !estado.filtro(u);
      const foraAndar = estado.andar != null && u.andar !== estado.andar;
      cTmp.copy(u.situacao === "indisponivel" ? corIndisp : corStatus[u.situacao]);
      if (solEstado.flags && solEstado.flags[i] === 0) cTmp.multiplyScalar(0.58);
      if (foraFiltro) cTmp.lerp(tema.fundo, 0.8);
      else if (foraAndar) cTmp.lerp(tema.fundo, 0.45);
      meshUnid.setColorAt(inst[i], cTmp);
      cTmp.copy(corNoite[u.situacao]);
      if (foraFiltro) cTmp.lerp(fundoNoite, 0.78);
      else if (foraAndar) cTmp.lerp(fundoNoite, 0.5);
      meshNoite.setColorAt(inst[i], cTmp);
    });
    meshUnid.instanceColor.needsUpdate = true;
    meshNoite.instanceColor.needsUpdate = true;
    meshUnid.visible = true;
    meshNoite.visible = luzes > 0.01;
    matUnidNoite.opacity = luzes;
    if (meshListras) {
      meshListras.material.opacity = (estado.andar != null ? 0.6 : 1) * (1 - luzes);
      meshListras.visible = luzes < 0.99;
    }
    pedirRender();
  }
  pintar();
  controls = new CameraControls(camera, canvas);
  controls.smoothTime = 0.25;
  controls.draggingSmoothTime = 0.1;
  controls.minPolarAngle = 0.22 * Math.PI;
  controls.maxPolarAngle = POL.max;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.dollyToCursor = false;
  controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
  controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
  controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
  controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
  controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY;
  controls.touches.three = CameraControls.ACTION.NONE;
  const caixaPredio = new THREE.Box3(new THREE.Vector3(BX0, 0, BZ0), new THREE.Vector3(BX1, TOPO, BZ1));
  const ALVO = caixaPredio.getCenter(new THREE.Vector3());
  const RAIO_PREDIO = caixaPredio.getBoundingSphere(new THREE.Sphere()).radius;
  const esferaPredio = new THREE.Sphere(ALVO.clone(), RAIO_PREDIO);
  const limiteAlvo = new THREE.Box3(new THREE.Vector3(ALVO.x - 0.25, 0, ALVO.z - 0.25), new THREE.Vector3(ALVO.x + 0.25, TOPO, ALVO.z + 0.25));
  const alvoAtual = ALVO.clone();
  controls.setBoundary(limiteAlvo);
  controls.boundaryFriction = 0;
  let modoJanela = false;
  function distanciaAjuste() {
    const fullW = largura + desloc.x, fullH = altura + desloc.y;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tv = t * (altura - desloc.y) / fullH;
    const th = t * (largura - desloc.x) / fullH;
    const meia = Math.atan(Math.min(tv, th));
    return RAIO_PREDIO / Math.sin(meia);
  }
  function distanciaArco() {
    const tg = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const meia = Math.atan(tg * Math.min(altura - desloc.y, largura - desloc.x) / (altura + desloc.y));
    return RAIO_CEU * 1.08 / Math.sin(meia);
  }
  function aplicarLimites() {
    if (modoJanela) return;
    if (largura < 50 || altura < 50 || container.style.visibility === "hidden") return;
    const d = distanciaAjuste();
    const atual = controls.distance;
    controls.minDistance = Math.min(d * 0.42, atual);
    const dArco = distanciaArco();
    controls.maxDistance = Math.max(d * (largura - desloc.x < altura - desloc.y ? 1.7 : 2), dArco, atual);
    acordar();
  }
  function modoLenteSol(ligar) {
    camera.fov = ligar ? FOV_SOL : FOV_NORMAL;
    controls.maxPolarAngle = ligar ? largura < altura ? POL.maxSolRetrato : POL.maxSol : POL.max;
    aplicarDesloc();
    aplicarLimites();
  }
  function recentrar(anim = true) {
    if (modoJanela) return;
    const t = new THREE.Vector3();
    controls.getTarget(t);
    if (t.distanceTo(alvoAtual) > 0.3) controls.moveTo(alvoAtual.x, alvoAtual.y, alvoAtual.z, anim);
  }
  const VISTAS = { inicio: { az: -0.78 * Math.PI, pol: POL.inicio } };
  function irVista(nome = "inicio", anim = true) {
    const vv = VISTAS[nome] || VISTAS.inicio;
    estado.andar = null;
    estado.unidade = null;
    selAndar.visible = selUnid.visible = false;
    pintar();
    alvoAtual.copy(ALVO);
    controls.moveTo(ALVO.x, ALVO.y, ALVO.z, anim);
    controls.rotateTo(vv.az, vv.pol, anim);
    const dA = distanciaAjuste();
    controls.dollyTo(Math.min(Math.max(dA * 0.92, distanciaArco() * 0.8), dA * (largura - desloc.x < altura - desloc.y ? 1.3 : 1.33)), anim);
    acordar();
  }
  function caixaDoAndar(a) {
    const yb = LAJES[a - 1];
    return [X0 - 0.3, yb - 0.02, Z0 - 0.3, X1 + 0.3, yb + H - LAJE + 0.02, Z1 + 0.3];
  }
  function focarAndar(a, anim = true, mover = true) {
    void a;
    void caixaDoAndar;
    void mover;
    void anim;
    recentrar(true);
    acordar();
  }
  function marcarUnidade(id) {
    const i = unidades.findIndex((u) => u.id === id);
    if (i < 0) {
      selUnid.visible = false;
      estado.unidade = null;
      pedirRender();
      return;
    }
    const b = unidadeBox[i];
    selUnid.geometry.dispose();
    selUnid.geometry = caixaLinhas([b[0] - 0.12, b[1] - 0.12, b[2] - 0.12, b[3] + 0.12, b[4] + 0.12, b[5] + 0.12]);
    selUnid.visible = true;
    estado.unidade = id;
    alvoAtual.set(ALVO.x, (b[1] + b[4]) / 2, ALVO.z);
    controls.moveTo(alvoAtual.x, alvoAtual.y, alvoAtual.z, true);
    pulsoAte = performance.now() + SELECAO.pulsoSegundos * 1e3;
    pedirRender();
  }
  function setFiltro(fn) {
    estado.filtro = fn;
    pintar();
  }
  function limparSelecao() {
    estado.andar = null;
    estado.unidade = null;
    selAndar.visible = selUnid.visible = false;
    alvoAtual.copy(ALVO);
    controls.moveTo(ALVO.x, ALVO.y, ALVO.z, true);
    pintar();
  }
  const camadaRotulos = document.createElement("div");
  camadaRotulos.className = "rotulos-3d";
  container.appendChild(camadaRotulos);
  const rotulos = [];
  for (let a = 1; a <= NIV.andares; a++) {
    const el = document.createElement("span");
    el.className = "rotulo-andar";
    el.textContent = `${a}º`;
    el.setAttribute("aria-hidden", "true");
    void onTocarAndar;
    camadaRotulos.appendChild(el);
    rotulos.push({ a, el, y: LAJES[a - 1] + H / 2 });
  }
  const cantos = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
  const vp = new THREE.Vector3();
  function projetar(x, y, z) {
    vp.set(x, y, z).project(camera);
    return { x: (vp.x * 0.5 + 0.5) * largura, y: (-vp.y * 0.5 + 0.5) * altura, z: vp.z };
  }
  function bordaEsq(y) {
    let minX = Infinity, yy = 0;
    cantos.forEach(([cx, cz]) => {
      const p = projetar(cx, y, cz);
      if (p.x < minX) {
        minX = p.x;
        yy = p.y;
      }
    });
    return { x: minX, y: yy };
  }
  function atualizarRotulos() {
    const passo = Math.abs(projetar(X0, LAJES[0], Z0).y - projetar(X0, LAJES[1], Z0).y);
    const mostrar = passo >= 9;
    const todos = passo >= 15;
    rotulos.forEach((r) => {
      const p = bordaEsq(r.y);
      const ok = mostrar && p.x > -40 && p.y > 0 && p.y < altura && (todos || r.a % 2 === 1 || r.a === estado.andar);
      r.el.hidden = !ok;
      if (!ok) return;
      const w = r.el.offsetWidth || 26;
      r.el.style.transform = `translate(${Math.round(Math.max(4, p.x - 8 - w))}px, ${Math.round(p.y)}px) translate(0, -50%)`;
      r.el.classList.toggle("ativo", r.a === estado.andar);
    });
  }
  const ceuFisico = new Sky();
  ceuFisico.scale.setScalar(3e3);
  ceuFisico.frustumCulled = false;
  ceuFisico.renderOrder = -100;
  ceuFisico.raycast = () => {
  };
  {
    const u = ceuFisico.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 4e-3;
    u.mieDirectionalG.value = 0.78;
    if (u.cloudCoverage) u.cloudCoverage.value = 0;
    if (u.showSunDisc) u.showSunDisc.value = 0;
    u.uAlfa = { value: 0 };
    u.uGanho = { value: 0.55 };
    ceuFisico.material.transparent = true;
    ceuFisico.material.fog = false;
    ceuFisico.material.onBeforeCompile = (sh) => {
      sh.uniforms.uAlfa = u.uAlfa;
      sh.uniforms.uGanho = u.uGanho;
      sh.fragmentShader = sh.fragmentShader.replace("uniform float showSunDisc;", "uniform float showSunDisc; uniform float uAlfa; uniform float uGanho;").replace("gl_FragColor = vec4( texColor, 1.0 );", "gl_FragColor = vec4( texColor * uGanho, uAlfa * smoothstep( 0.0, 0.16, direction.y ) );");
    };
    ceuFisico.material.customProgramCacheKey = () => "ceu-f42";
  }
  ceuFisico.visible = false;
  scene.add(ceuFisico);
  let b7SoSombra = false;
  function objsB7() {
    const l = [];
    if (entB7.grupo) entB7.grupo.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine) l.push(o);
    });
    const a = entB7.arvores && entB7.arvores();
    if (a) l.push(a);
    return l;
  }
  let b7Marcados = 0;
  function sombraSoB7() {
    if (!entB7.grupo) return;
    const objs = objsB7();
    if (b7SoSombra && objs.length === b7Marcados) return;
    b7SoSombra = true;
    b7Marcados = objs.length;
    entB7.grupo.visible = true;
    for (const o of objs) {
      if (o.name === "entorno-postes") continue;
      o.layers.set(0);
      for (const m of [].concat(o.material || [])) {
        if (m.userData.g3dCw === void 0) {
          m.userData.g3dCw = m.colorWrite;
          m.userData.g3dDw = m.depthWrite;
        }
        if (m.uniforms && m.uniforms.uTipo && m.uniforms.uTipo.value === 1) {
          m.polygonOffset = true;
          m.polygonOffsetFactor = 2;
          m.polygonOffsetUnits = 16;
          if (m.uniforms.uSoChao) m.uniforms.uSoChao.value = 1;
          continue;
        }
        m.colorWrite = false;
        m.depthWrite = false;
      }
    }
    renderer.shadowMap.needsUpdate = true;
  }
  const caixaTorre = new THREE.Box3(), cantoT = new THREE.Vector3(), tamT = new THREE.Vector2();
  function caixaTorreNaTela() {
    if (caixaTorre.isEmpty()) caixaTorre.setFromObject(PB.grupo);
    renderer.getDrawingBufferSize(tamT);
    camera.updateMatrixWorld();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, prof = 1e9;
    for (let i = 0; i < 8; i++) {
      cantoT.set(i & 1 ? caixaTorre.max.x : caixaTorre.min.x, i & 2 ? caixaTorre.max.y : caixaTorre.min.y, i & 4 ? caixaTorre.max.z : caixaTorre.min.z);
      const d = -cantoT.clone().applyMatrix4(camera.matrixWorldInverse).z;
      prof = Math.min(prof, d);
      if (d <= camera.near) return [null, 0];
      cantoT.project(camera);
      const x = (cantoT.x * 0.5 + 0.5) * tamT.x, y = (cantoT.y * 0.5 + 0.5) * tamT.y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    return [[x0 - 2, y0 - 2, x1 + 2, y1 + 2], prof - 1.5];
  }
  let mapaPrediosFeito = false, terrenoFeito = false;
  function ligaTerreno() {
    if (terrenoFeito || !gCena || !entB7.grupo) return terrenoFeito;
    entB7.grupo.traverse((o) => {
      const u = !terrenoFeito && o.material && o.material.uniforms;
      if (u && u.uRua && u.uRua.value && u.uRuaOn && u.uRuaOn.value > 0.5) {
        terrenoFeito = true;
        gCena.terreno(u.uRua.value, u.uRuaExt.value);
      }
    });
    return terrenoFeito;
  }
  {
    const tTerr = setInterval(() => {
      if (ligaTerreno() || !googleEsperado && !gCena) clearInterval(tTerr);
    }, 1e3);
  }
  const ALVO_FANT = new THREE.Vector3(CX, TOPO * 0.45, CZ);
  function montaMapaPredios() {
    try {
      const TAM = 1400, N = 1024, gl = renderer.getContext();
      const flutua = renderer.capabilities.isWebGL2 && gl.getExtension("EXT_color_buffer_float");
      const rt = new THREE.WebGLRenderTarget(N, N, { type: flutua ? THREE.FloatType : THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true });
      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: "attribute vec4 _centro; varying vec3 vC; varying float vY; void main() { vC = _centro.xyz; vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }",
        fragmentShader: "varying vec3 vC; varying float vY; void main() { if (vC.x > 9000.0) discard; gl_FragColor = vec4(vC, 1.0 + max(vY, 0.0)); }"
      });
      const cena = new THREE.Scene(), pais = /* @__PURE__ */ new Map();
      entB7.grupo.traverse((o) => {
        if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.attributes._centro) pais.set(o, o.parent);
      });
      const cam = new THREE.OrthographicCamera(-TAM / 2, TAM / 2, TAM / 2, -TAM / 2, 1, 3e3);
      cam.position.set(CX, 1500, CZ);
      cam.up.set(0, 0, -1);
      cam.lookAt(CX, 0, CZ);
      cam.updateMatrixWorld(true);
      const ac = renderer.autoClear, rtAnt = renderer.getRenderTarget(), cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0, 0);
      renderer.clear();
      renderer.autoClear = false;
      for (const o of pais.keys()) {
        const c = new THREE.Mesh(o.geometry, mat);
        o.updateWorldMatrix(true, false);
        c.matrixAutoUpdate = false;
        c.matrix.copy(o.matrixWorld);
        c.matrixWorld.copy(o.matrixWorld);
        cena.children.length = 0;
        cena.add(c);
        c.matrixWorld.copy(o.matrixWorld);
        renderer.render(cena, cam);
      }
      renderer.setRenderTarget(rtAnt);
      renderer.autoClear = ac;
      renderer.setClearColor(cc, ca);
      gCena.mapaPredios(rt.texture, CX - TAM / 2, CZ - TAM / 2, TAM);
      stats.mapaPredios = pais.size;
    } catch (e) {
      console.warn("mapa de predios (fantasma do Google) falhou", e && e.message);
    }
  }
  function voltaB7() {
    b7SoSombra = false;
    b7Marcados = 0;
    for (const o of objsB7()) for (const m of [].concat(o.material || [])) if (m.userData.g3dCw !== void 0) {
      m.colorWrite = m.userData.g3dCw;
      m.depthWrite = m.userData.g3dDw;
      m.polygonOffset = false;
      if (m.uniforms && m.uniforms.uSoChao) m.uniforms.uSoChao.value = 0;
    }
    if (entB7.grupo) entB7.grupo.visible = !!entB7.carregado;
    chao.visible = rua.visible = !entB7.carregado;
    renderer.shadowMap.needsUpdate = true;
  }
  const matSombraG = new THREE.ShadowMaterial({ opacity: +(/[?&]sombraG=([\d.]+)/.exec(location.search) || [0, 0.42])[1], depthWrite: false, transparent: true });
  matSombraG.depthFunc = THREE.LessEqualDepth;
  matSombraG.polygonOffset = true;
  matSombraG.polygonOffsetFactor = -1;
  matSombraG.polygonOffsetUnits = -1;
  function render() {
    if (ceuFisico.visible) ceuFisico.position.copy(camera.position);
    seguirCamera();
    rotulosForaDosBotoes();
    entB7.atualizarCamera(camera);
    const noiteCidade = false;
    if (gCena) {
      gCena.definirNoite(noiteCidade);
      gCena.antes(modoJanela || noiteCidade);
    }
    const usaGoogle = !!(gCena && gCena.mostrando && !noiteCidade);
    if (usaGoogle) {
      chao.visible = rua.visible = false;
      if (entorno) entorno.visible = false;
      if (entornoFantasma) entornoFantasma.visible = false;
      if (entB7.grupo) sombraSoB7();
    } else if (googleEsperado) {
      if (entB7.grupo) sombraSoB7();
      if (entorno) entorno.visible = false;
      if (entornoFantasma) entornoFantasma.visible = false;
    } else if (b7SoSombra) voltaB7();
    if (usaGoogle) {
      if (!sol.shadow.camera.layers.isEnabled(2)) {
        sol.shadow.camera.layers.enable(1);
        sol.shadow.camera.layers.enable(2);
        renderer.shadowMap.needsUpdate = true;
      }
      if (!torreCamada) {
        torreCamada = true;
        PB.grupo.traverse((o) => o.layers.set(1));
        selUnid.layers.set(1);
        meshNoite.layers.set(1);
        hemi.layers.enable(1);
        sol.layers.enable(1);
        ray.layers.enableAll();
      }
      if (!mapaPrediosFeito && entB7.carregado && entB7.grupo) {
        mapaPrediosFeito = true;
        montaMapaPredios();
      }
      ligaTerreno();
      gCena.fantasma(camera.position, ALVO_FANT);
      {
        const [r, prof] = caixaTorreNaTela();
        gCena.telaTorre(r, prof);
      }
      if (!matSombraG.__recorte) {
        matSombraG.__recorte = true;
        gCena.aplicarRecorte(matSombraG);
      }
      const fundo = scene.background, ac = renderer.autoClear;
      camera.layers.set(0);
      camera.layers.enable(1);
      renderer.render(scene, camera);
      scene.background = null;
      renderer.autoClear = false;
      if (solEstado.modo === "real" && sol.intensity > 0 && !/[?&]sombraG=0/.test(location.search)) {
        sol.layers.enable(3);
        scene.overrideMaterial = matSombraG;
        camera.layers.set(3);
        renderer.render(scene, camera);
        scene.overrideMaterial = null;
      }
      scene.background = fundo;
      renderer.autoClear = ac;
      camera.layers.enableAll();
    } else renderer.render(scene, camera);
    stats.quadros++;
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.geometries = renderer.info.memory.geometries;
    stats.textures = renderer.info.memory.textures;
    atualizarRotulos();
    if (!stats.pronto) {
      stats.pronto = true;
      canvas.setAttribute("data-ready", "1");
      container.setAttribute("data-ready", "1");
    }
  }
  let pulsoAte = 0;
  function loop() {
    const dt = clock.getDelta();
    if (selUnid.visible && performance.now() < pulsoAte) {
      matSel.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.cos((pulsoAte - performance.now()) / 1e3 * Math.PI * 1.25));
      sujo = true;
    } else if (matSel.opacity !== 1) {
      matSel.opacity = 1;
      sujo = true;
    }
    const mudou = controls ? controls.update(dt) : false;
    if (mudou || sujo) {
      render();
      sujo = false;
      ociosos = 0;
    } else {
      ociosos++;
      if (ociosos === 1) talvezReparticionar();
    }
    rafId = ociosos < 3 || ponteiroAbaixo || continuo || selUnid.visible && performance.now() < pulsoAte ? requestAnimationFrame(loop) : 0;
  }
  function acordar() {
    ociosos = 0;
    if (!rafId) {
      clock.getDelta();
      rafId = requestAnimationFrame(loop);
    }
  }
  function pedirRender() {
    sujo = true;
    acordar();
  }
  ["wake", "controlstart", "control", "controlend", "transitionstart", "update"].forEach((ev) => controls.addEventListener(ev, acordar));
  ["rotate", "rotateTo", "rotateAzimuthTo", "rotatePolarTo", "dolly", "dollyTo", "zoom", "zoomTo", "moveTo", "setLookAt", "fitToSphere", "fitToBox", "setPosition", "setTarget", "reset"].forEach((nome) => {
    const orig = controls[nome];
    if (typeof orig !== "function") return;
    controls[nome] = function(...args) {
      const r = orig.apply(controls, args);
      acordar();
      return r;
    };
  });
  controls.addEventListener("rest", () => {
    talvezReparticionar();
    recentrar(true);
  });
  controls.addEventListener("controlend", () => recentrar(true));
  canvas.addEventListener("wheel", acordar, { passive: true });
  canvas.addEventListener("pointerdown", () => {
    ponteiroAbaixo++;
    acordar();
  });
  canvas.addEventListener("pointermove", () => {
    if (ponteiroAbaixo) acordar();
  });
  const soltouPonteiro = () => {
    if (ponteiroAbaixo) {
      ponteiroAbaixo = 0;
      acordar();
    }
    canvas.classList.remove("arrastando");
  };
  window.addEventListener("pointerup", soltouPonteiro);
  window.addEventListener("pointercancel", soltouPonteiro);
  window.addEventListener("blur", soltouPonteiro);
  const desloc = { x: 0, y: 0 };
  function aplicarDesloc() {
    const x = Math.min(desloc.x, largura * 0.6);
    let y = Math.min(desloc.y, altura * 0.6);
    let oy = y, ext = y;
    if (largura < altura) {
      const topo = 120, d = Math.min(y, altura * 0.6) - topo;
      ext = Math.abs(d);
      oy = d > 0 ? d : 0;
    }
    camera.aspect = (largura + x) / (altura + ext);
    if (x || ext) camera.setViewOffset(largura + x, altura + ext, x, oy, largura, altura);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  function redimensionar() {
    const r = container.getBoundingClientRect();
    largura = Math.max(1, Math.round(r.width));
    altura = Math.max(1, Math.round(r.height));
    renderer.setSize(largura, altura, false);
    canvas.style.width = largura + "px";
    canvas.style.height = altura + "px";
    aplicarDesloc();
    if (controls) aplicarLimites();
    const retrato = largura < altura;
    if (retrato !== ceuRetrato) {
      ceuRetrato = retrato;
      if (estacaoAtual && solEstado.ultimo) {
        desenharArco(estacaoAtual);
        dirDisco = direcao(solEstado.ultimo.az, elevDesenho(solEstado.ultimo.az, solEstado.ultimo.el));
      }
    }
    pedirRender();
  }
  function setDeslocamento({ x = 0, y = 0 } = {}) {
    if (x === desloc.x && y === desloc.y) return;
    desloc.x = x;
    desloc.y = y;
    aplicarDesloc();
    aplicarLimites();
    pedirRender();
  }
  new ResizeObserver(redimensionar).observe(container);
  redimensionar();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function raioDe(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray;
  }
  function unidadeEm(x, y) {
    const hit = raioDe(x, y).intersectObject(meshUnid, false)[0];
    return hit && hit.instanceId != null ? doInst.get(hit.instanceId) ?? -1 : -1;
  }
  const esferaDisco = new THREE.Sphere();
  function noDisco(x, y) {
    if (!disco.visible) return false;
    seguirCamera();
    esferaDisco.set(disco.position, RAIO_CEU * 0.09);
    return raioDe(x, y).ray.intersectsSphere(esferaDisco);
  }
  let down = null, ultimoToque = { i: -1, t: 0 };
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 8 || dt > 600) return;
    const i = unidadeEm(e.clientX, e.clientY);
    if (i < 0) return;
    const agora = performance.now();
    if (ultimoToque.i === i && agora - ultimoToque.t < 380 && onDuploToque) {
      ultimoToque = { i: -1, t: 0 };
      onDuploToque(unidades[i]);
      return;
    }
    ultimoToque = { i, t: agora };
    if (onTocarUnidade) onTocarUnidade(unidades[i]);
  });
  let hoverPendente = null, hoverRaf = 0, hoverAtual = -2;
  function mostrarHover(i) {
    if (i === hoverAtual) return;
    hoverAtual = i;
    if (i >= 0) {
      const b = unidadeBox[i];
      selHover.geometry.dispose();
      selHover.geometry = caixaLinhas([b[0] - 0.08, b[1] - 0.08, b[2] - 0.08, b[3] + 0.08, b[4] + 0.08, b[5] + 0.08]);
      brilho.matrix.copy(matrizBox(b[0] - 0.05, b[1] - 0.05, b[2] - 0.05, b[3] + 0.05, b[4] + 0.05, b[5] + 0.05));
      brilho.matrix.decompose(brilho.position, brilho.quaternion, brilho.scale);
      selHover.visible = brilho.visible = true;
    } else selHover.visible = brilho.visible = false;
    pedirRender();
  }
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || arrasto) return;
    hoverPendente = { x: e.clientX, y: e.clientY, botao: e.buttons };
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const h = hoverPendente;
      if (!h) return;
      if (h.botao) {
        canvas.style.cursor = "grabbing";
        mostrarHover(-1);
        onHover && onHover(null);
        return;
      }
      if (noDisco(h.x, h.y)) {
        canvas.style.cursor = "grab";
        mostrarHover(-1);
        onHover && onHover({ tipo: "sol", x: h.x, y: h.y });
        return;
      }
      const i = unidadeEm(h.x, h.y);
      canvas.style.cursor = i >= 0 ? "pointer" : "grab";
      mostrarHover(i);
      onHover && onHover(i >= 0 ? { tipo: "unidade", u: unidades[i], x: h.x, y: h.y } : null);
    });
  });
  canvas.addEventListener("pointerleave", () => {
    hoverPendente = null;
    mostrarHover(-1);
    onHover && onHover(null);
    if (!arrasto) canvas.style.cursor = "grab";
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") canvas.style.cursor = "grabbing";
    mostrarHover(-1);
    onHover && onHover(null);
  });
  canvas.style.cursor = "grab";
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    stats.contextoPerdido = (stats.contextoPerdido || 0) + 1;
    if (!/[?&]teste=1/.test(location.search) && rebaixar()) setTimeout(() => location.reload(), 300);
  });
  canvas.addEventListener("webglcontextrestored", () => {
    stats.contextoRestaurado = (stats.contextoRestaurado || 0) + 1;
    renderer.shadowMap.needsUpdate = true;
    pedirRender();
  });
  let eixoX = 73.4;
  function direcao(az, el, out = new THREE.Vector3()) {
    const r = THREE.MathUtils.degToRad;
    const h = Math.cos(r(el));
    return out.set(h * Math.cos(r(az - eixoX)), Math.sin(r(el)), h * Math.cos(r(az - eixoX - 90)));
  }
  const matArco = new THREE.LineBasicMaterial({ color: 15774282, transparent: true, opacity: 0.9, toneMapped: false });
  const arco = new THREE.Line(new THREE.BufferGeometry(), matArco);
  arco.visible = false;
  arco.raycast = () => {
  };
  let arcoOculto = false;
  const disco = new THREE.Mesh(new THREE.SphereGeometry(RAIO_CEU * 0.022, 24, 16), new THREE.MeshBasicMaterial({ color: 16764764, toneMapped: false, fog: false }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(RAIO_CEU * 0.042, 24, 16), new THREE.MeshBasicMaterial({ color: 16764764, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false, fog: false }));
  disco.add(halo);
  arco.renderOrder = 1;
  disco.renderOrder = 2;
  halo.renderOrder = 2;
  arco.frustumCulled = false;
  disco.frustumCulled = false;
  let dirDisco = null;
  const matArcoFantasma = new THREE.LineBasicMaterial({ color: 15774282, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const arcoFantasma = new THREE.Line(new THREE.BufferGeometry(), matArcoFantasma);
  arcoFantasma.renderOrder = 3;
  arcoFantasma.frustumCulled = false;
  arcoFantasma.raycast = () => {
  };
  const matMarcas = new THREE.PointsMaterial({ color: 15774282, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const marcasHora = new THREE.Points(new THREE.BufferGeometry(), matMarcas);
  marcasHora.renderOrder = 4;
  marcasHora.frustumCulled = false;
  marcasHora.raycast = () => {
  };
  arco.add(arcoFantasma, marcasHora);
  const rotulosHora = [];
  function rotuloHora(txt) {
    const cv = document.createElement("canvas");
    cv.width = 128;
    cv.height = 64;
    const g = cv.getContext("2d");
    g.font = "700 42px Archivo, system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(16,18,17,.8)";
    g.strokeText(txt, 64, 33);
    g.fillStyle = "#f4c45a";
    g.fillText(txt, 64, 33);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false, toneMapped: false, fog: false }));
    const e = largura < altura ? 0.11 : 0.06;
    sp.scale.set(e, e / 2, 1);
    sp.renderOrder = 5;
    sp.raycast = () => {
    };
    return sp;
  }
  const SELETORES_SOBRE = [".topo .marca-nome", ".topo .legenda", "#btn-foto-real", "#btn-lista", "#btn-legal", "#sol-painel", ".linha-legal"];
  const SELETORES_SOBRE_BORDA = [".topo .marca", ".barra"];
  let rectsSobre = [], rectsBorda = [], rectsT = 0;
  const vRot = new THREE.Vector3();
  function lerRectsSobre() {
    rectsT = performance.now();
    const c = canvas.getBoundingClientRect();
    const le = (lista) => {
      const out = [];
      for (const s of lista) {
        const e = document.querySelector(s);
        if (!e || e.hidden || e.offsetParent === null) continue;
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push([r.left - c.left - 8, r.top - c.top - 8, r.right - c.left + 8, r.bottom - c.top + 8]);
      }
      return out;
    };
    rectsSobre = le(SELETORES_SOBRE);
    rectsBorda = rectsSobre.concat(le(SELETORES_SOBRE_BORDA));
  }
  function rotulosForaDosBotoes() {
    if (!rotulosHora.length || !arco.visible) return;
    if (performance.now() - rectsT > 250) lerRectsSobre();
    const k = camera.projectionMatrix.elements[5] * altura / 2;
    for (const sp of rotulosHora) {
      vRot.copy(sp.position).add(arco.position).project(camera);
      if (vRot.z > 1) {
        sp.visible = false;
        continue;
      }
      const x = (vRot.x * 0.5 + 0.5) * largura, y = (-vRot.y * 0.5 + 0.5) * altura;
      const hw = sp.scale.x * k * 0.32, hh = sp.scale.y * k * 0.36;
      sp.visible = x - hw >= 0 && x + hw <= largura && y - hh >= 0 && y + hh <= altura && !rectsSobre.some(([x0, y0, x1, y1]) => x + hw > x0 && x - hw < x1 && y + hh > y0 && y - hh < y1);
    }
  }
  const vTmpCeu = new THREE.Vector3();
  let topoArco = null;
  const vEl = new THREE.Vector3(), vTopoEl = new THREE.Vector3(), vDirEl = new THREE.Vector3();
  let topoElY = 0, chaveCamEl = "";
  const SEM_LIFT = /[?&]arcolift=0/.test(location.search);
  function discoAcimaDoTopo(az, e) {
    direcao(az, e, vDirEl);
    vEl.copy(CENTRO_ARCO).addScaledVector(vDirEl, RAIO_CEU).applyMatrix4(camera.matrixWorldInverse);
    if (vEl.z > -1) return false;
    vEl.applyMatrix4(camera.projectionMatrix);
    return (-vEl.y * 0.5 + 0.5) * altura < topoElY - altura * 0.03;
  }
  function elevDesenho(az, el) {
    const e0 = Math.max(0, el);
    if (e0 <= 4 || SEM_LIFT) return e0;
    vTopoEl.set(CX, TOPO, CZ).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    topoElY = (-vTopoEl.y * 0.5 + 0.5) * altura;
    if (discoAcimaDoTopo(az, e0) || !discoAcimaDoTopo(az, 85)) return e0;
    let lo = e0, hi = 85;
    for (let k = 0; k < 12; k++) {
      const m = (lo + hi) / 2;
      if (discoAcimaDoTopo(az, m)) hi = m;
      else lo = m;
    }
    return e0 + (hi - e0) * smooth(4, 12, e0);
  }
  function remapearArco() {
    camera.updateMatrixWorld();
    for (const x of arcoPts) {
      direcao(x.az, elevDesenho(x.az, x.el), x.d);
      x.p.copy(CENTRO_ARCO).addScaledVector(x.d, RAIO_CEU);
    }
    const pos = arco.geometry.getAttribute("position");
    if (pos && pos.count === arcoPts.length) {
      arcoPts.forEach((x, k) => pos.setXYZ(k, x.d.x * RAIO_CEU, x.d.y * RAIO_CEU, x.d.z * RAIO_CEU));
      pos.needsUpdate = true;
      arco.geometry.computeBoundingSphere();
    }
    const hs = arcoPts.filter((x) => x.cheia), pm = marcasHora.geometry.getAttribute("position");
    if (pm && pm.count === hs.length) {
      hs.forEach((x, k) => pm.setXYZ(k, x.d.x * RAIO_CEU, x.d.y * RAIO_CEU, x.d.z * RAIO_CEU));
      pm.needsUpdate = true;
    }
    rotulosHora.forEach((sp) => {
      if (sp.userData.pt) sp.position.copy(sp.userData.pt.d).multiplyScalar(RAIO_CEU * 1.06);
    });
    if (solEstado.ultimo && solEstado.ultimo.el > -2) dirDisco = direcao(solEstado.ultimo.az, elevDesenho(solEstado.ultimo.az, solEstado.ultimo.el));
  }
  function criaSolBorda() {
    solBorda = document.createElement("button");
    solBorda.type = "button";
    solBorda.className = "sol-borda";
    solBorda.hidden = true;
    solBorda.setAttribute("aria-label", "O sol está fora da tela: toque para enquadrar o sol");
    solBorda.title = "Sol fora da tela: toque para ver";
    solBorda.style.cssText = "position:absolute;left:0;top:0;z-index:4;width:30px;height:30px;margin:-15px 0 0 -15px;padding:0;border:0;border-radius:50%;cursor:pointer;background:radial-gradient(circle,#ffe08a 0 38%,#ffcf5c 39% 46%,rgba(255,207,92,.35) 47% 70%,rgba(255,207,92,0) 71%);-webkit-tap-highlight-color:transparent";
    solBorda.innerHTML = '<i style="position:absolute;left:50%;top:50%;width:0;height:0;margin:-5px 0 0 13px;border:5px solid transparent;border-left:7px solid #ffcf5c;filter:drop-shadow(0 0 1px rgba(0,0,0,.6));transform-origin:-13px 5px"></i>';
    solBorda.addEventListener("click", (e) => {
      e.stopPropagation();
      enquadrarSol(true);
    });
    container.appendChild(solBorda);
  }
  const vBorda = new THREE.Vector3();
  function marcaSolBorda() {
    if (!solBorda) criaSolBorda();
    if (!arco.visible || !disco.visible || modoJanela) {
      solBorda.hidden = true;
      return;
    }
    if (performance.now() - rectsT > 250) lerRectsSobre();
    vBorda.copy(disco.position).applyMatrix4(camera.matrixWorldInverse);
    const atras = vBorda.z > -1e-3;
    vBorda.applyMatrix4(camera.projectionMatrix);
    let sx = (vBorda.x * 0.5 + 0.5) * largura, sy = (-vBorda.y * 0.5 + 0.5) * altura;
    const m = 22, W2 = largura - desloc.x, Hh = altura - desloc.y;
    const tapa = (x, y) => rectsBorda.some(([a, b, c, d]) => x > a && x < c && y > b && y < d);
    if (!atras && sx > m && sx < W2 - m && sy > m && sy < Hh - m && !tapa(sx, sy)) {
      solBorda.hidden = true;
      return;
    }
    const cx = W2 / 2, cy = Hh / 2;
    let dx, dy, px, py, ux, uy;
    if (atras) {
      const lado = vBorda.x >= 0 ? 1 : -1;
      dx = -lado;
      dy = 0;
      px = dx > 0 ? W2 - m : m;
      py = Math.max(m, Hh * 0.3);
      ux = 0;
      uy = -1;
    } else {
      dx = sx - cx;
      dy = sy - cy;
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) dy = -1;
      const t = Math.min(dx ? ((dx > 0 ? W2 - m : m) - cx) / dx : Infinity, dy ? ((dy > 0 ? Hh - m : m) - cy) / dy : Infinity);
      px = cx + dx * t;
      py = cy + dy * t;
      const len = Math.hypot(dx, dy);
      ux = dx / len;
      uy = dy / len;
    }
    for (let k = 0; k < 80 && tapa(px, py); k++) {
      px -= ux * 8;
      py -= uy * 8;
    }
    solBorda.style.transform = `translate(${Math.round(px)}px,${Math.round(py)}px)`;
    solBorda.firstChild.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    solBorda.hidden = false;
  }
  function seguirCamera() {
    if (!arco.visible) {
      if (solBorda) solBorda.hidden = true;
      return;
    }
    arco.position.copy(CENTRO_ARCO);
    const ch = [camera.position.x, camera.position.y, camera.position.z].map((v) => Math.round(v * 2)).join() + "|" + largura + "x" + altura + "|" + desloc.x + "," + desloc.y;
    if (ch !== chaveCamEl) {
      chaveCamEl = ch;
      remapearArco();
    }
    if (dirDisco) disco.position.copy(CENTRO_ARCO).addScaledVector(dirDisco, RAIO_CEU);
    marcaSolBorda();
    return;
    const pitch = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(camera.getWorldDirection(vTmpCeu).y, -1, 1)));
    topoCeuVisivel = pitch + camera.fov / 2;
    if (topoArco == null || Math.abs(topoCeuVisivel - topoArco) > 0.3) {
      topoArco = topoCeuVisivel;
      if (estacaoAtual) desenharArcoSo(estacaoAtual);
      if (solEstado.ultimo) dirDisco = direcao(solEstado.ultimo.az, ELEV_TELA(solEstado.ultimo.el));
    }
    arco.position.copy(camera.position);
    if (dirDisco) disco.position.copy(camera.position).addScaledVector(dirDisco, RAIO_CEU);
  }
  disco.visible = false;
  disco.raycast = () => {
  };
  halo.raycast = () => {
  };
  matArco.fog = false;
  scene.add(arco, disco);
  let arcoPts = [];
  let entorno = null, entornoFantasma = null;
  const matEntorno = new THREE.MeshStandardMaterial({ color: tema.vizinho, roughness: 1, metalness: 0 });
  const matFantasma = new THREE.MeshStandardMaterial({ color: tema.vizinho, roughness: 1, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false });
  let blocosGeo = [];
  function montarEntorno(camPos) {
    const B = new THREE.Vector2(CX, CZ);
    const C = new THREE.Vector2(camPos.x, camPos.z);
    const dir = C.clone().sub(B);
    const L = dir.length() || 1;
    dir.divideScalar(L);
    const op = { pos: [], nor: [] }, fa = { pos: [], nor: [] };
    let nf = 0;
    blocosGeo.forEach((b) => {
      const v = b.c.clone().sub(B);
      const s2 = v.dot(dir);
      const perp = Math.abs(v.x * dir.y - v.y * dir.x);
      const naFrente = s2 > 0 && s2 < L && perp < 20 + b.r && b.h > 12;
      const alvo = naFrente ? fa : op;
      if (naFrente) nf++;
      for (let i = 0; i < b.pos.length; i++) alvo.pos.push(b.pos[i]);
      for (let i = 0; i < b.nor.length; i++) alvo.nor.push(b.nor[i]);
    });
    const geo = (o) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(o.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(o.nor, 3));
      return g;
    };
    entorno.geometry.dispose();
    entorno.geometry = geo(op);
    entornoFantasma.geometry.dispose();
    entornoFantasma.geometry = geo(fa);
    stats.vizinhosFantasma = nf;
    renderer.shadowMap.needsUpdate = true;
    pedirRender();
  }
  function criarEntorno(blocosViz) {
    if (entB7.carregado) return;
    if (DRONE) return;
    if (entorno || !blocosViz?.length) return;
    let pos2 = [], nor = [];
    const push = (a, b, c, n) => {
      pos2.push(...a, ...b, ...c);
      nor.push(...n, ...n, ...n);
    };
    const RAIO_VIZ = 220;
    blocosViz.forEach((bl) => {
      pos2 = [];
      nor = [];
      const pts = bl.xz.map(([x, z]) => new THREE.Vector2(x, z));
      if (pts.length > 2 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      if (pts.length < 3) return;
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cz = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      if (Math.hypot(cx - CX, cz - CZ) > RAIO_VIZ) return;
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      const h = Math.max(2, bl.h);
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
        const n = new THREE.Vector3(p1.y - p0.y, 0, -(p1.x - p0.x)).normalize().toArray();
        const a0 = [p0.x, 0, p0.y], a1 = [p1.x, 0, p1.y], b0 = [p0.x, h, p0.y], b1 = [p1.x, h, p1.y];
        push(a0, a1, b1, n);
        push(a0, b1, b0, n);
      }
      THREE.ShapeUtils.triangulateShape(pts, []).forEach(([i, j, k]) => push([pts[i].x, h, pts[i].y], [pts[k].x, h, pts[k].y], [pts[j].x, h, pts[j].y], [0, 1, 0]));
      const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cz)));
      blocosGeo.push({ c: new THREE.Vector2(cx, cz), r, h, pos: pos2, nor });
    });
    matEntorno.side = matFantasma.side = THREE.DoubleSide;
    entorno = new THREE.Mesh(new THREE.BufferGeometry(), matEntorno);
    entornoFantasma = new THREE.Mesh(new THREE.BufferGeometry(), matFantasma);
    entorno.castShadow = entorno.receiveShadow = true;
    entornoFantasma.castShadow = true;
    entorno.raycast = entornoFantasma.raycast = () => {
    };
    scene.add(entorno, entornoFantasma);
    stats.entornoTriangulos = blocosGeo.reduce((s3, b) => s3 + b.pos.length / 9, 0);
    stats.entornoBlocos = blocosGeo.length;
    montarEntorno(camera.position);
  }
  let ultimoSplit = new THREE.Vector3(1e9, 0, 0);
  function talvezReparticionar() {
    if (!entorno) return;
    if (camera.position.distanceTo(ultimoSplit) < 6) return;
    ultimoSplit.copy(camera.position);
    montarEntorno(camera.position);
  }
  const hm = (s) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  };
  function desenharArco(estacao) {
    estacaoAtual = estacao;
    desenharArcoSo(estacao);
  }
  function desenharArcoSo(estacao) {
    const passo = solEstado.SOL?.meta?.passo_min || 15;
    const ini = hm(estacao.inicio);
    arcoPts = [];
    estacao.az.forEach((az, k) => {
      const el = estacao.el[k];
      if (el >= 0) {
        const d = direcao(az, ELEV_TELA(el)), t = ini + k * passo;
        arcoPts.push({ t, az, el, cheia: Math.abs(t % 60) < 1e-6, d, p: CENTRO_ARCO.clone().addScaledVector(d, RAIO_CEU) });
      }
    });
    camera.updateMatrixWorld();
    arcoPts.forEach((x) => {
      direcao(x.az, elevDesenho(x.az, x.el), x.d);
      x.p.copy(CENTRO_ARCO).addScaledVector(x.d, RAIO_CEU);
    });
    arco.geometry.dispose();
    arco.geometry = new THREE.BufferGeometry().setFromPoints(arcoPts.map((x) => x.d.clone().multiplyScalar(RAIO_CEU)));
    arcoFantasma.geometry = arco.geometry;
    const hs = arcoPts.filter((x) => Math.abs(x.t % 60) < 1e-6).map((x) => x.d.clone().multiplyScalar(RAIO_CEU));
    marcasHora.geometry.dispose();
    marcasHora.geometry = new THREE.BufferGeometry().setFromPoints(hs);
    rotulosHora.forEach((r) => {
      arco.remove(r);
      r.material.map.dispose();
      r.material.dispose();
    });
    rotulosHora.length = 0;
    const cheias = arcoPts.filter((x) => Math.abs(x.t % 60) < 1e-6);
    if (cheias.length) {
      const quer = /* @__PURE__ */ new Set([6, 12, 18, cheias[0].t / 60, cheias[cheias.length - 1].t / 60]);
      cheias.filter((x) => quer.has(x.t / 60)).forEach((x) => {
        const sp = rotuloHora(`${x.t / 60}h`);
        sp.position.copy(x.d).multiplyScalar(RAIO_CEU * 1.06);
        sp.userData.pt = x;
        arco.add(sp);
        rotulosHora.push(sp);
      });
    }
  }
  function enquadrarSol(anim = true, { agora = false } = {}) {
    if (!estacaoAtual || !arcoPts.length) return;
    const elMax = Math.max(...estacaoAtual.el);
    const k = estacaoAtual.el.indexOf(elMax);
    void agora;
    const comSol = solEstado.ultimo && solEstado.ultimo.el > 0;
    const azSol = comSol ? solEstado.ultimo.az : estacaoAtual.az[k];
    const meiaH = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV_SOL / 2)) * (largura - desloc.x) / (altura + desloc.y)));
    const desvio = Math.min(28, meiaH * (largura < altura ? 0.55 : 0.8));
    const dCam = direcao(azSol + 180 + desvio, 0);
    controls.moveTo(ALVO.x, ALVO.y, ALVO.z, anim);
    controls.rotateTo(Math.atan2(dCam.x, dCam.z), largura < altura ? POL.solRetrato : POL.sol, anim);
    controls.dollyTo(distanciaAjuste() * 1, anim);
    acordar();
  }
  let usuarioMexeu = false, inicialFeito = false;
  controls.addEventListener("controlstart", () => {
    usuarioMexeu = true;
  });
  const vIni = new THREE.Vector3(), esfIni = new THREE.Spherical();
  function enquadrarInicial() {
    if (inicialFeito || usuarioMexeu || modoJanela || estado.unidade) return;
    inicialFeito = true;
    const s = solEstado.ultimo;
    if (!s || s.el <= 0 || !arcoPts.length) return;
    const alvo = new THREE.Vector3();
    controls.getTarget(alvo);
    const dist = controls.distance, pos0 = camera.position.clone(), q0 = camera.quaternion.clone();
    const livreW = largura - desloc.x, livreH = altura - desloc.y;
    const x0 = 32, x1 = livreW - 32, y0 = 32, y1 = livreH - 32;
    lerRectsSobre();
    const tapas = rectsSobre.map(([a, b2, c, d]) => [a - 8, b2 - 8, c + 8, d + 8]);
    const naTela = (p) => {
      vIni.copy(p).project(camera);
      if (vIni.z > 1) return null;
      return [(vIni.x * 0.5 + 0.5) * largura, (-vIni.y * 0.5 + 0.5) * altura];
    };
    const livre = (q) => !!q && q[0] > x0 && q[0] < x1 && q[1] > y0 && q[1] < y1 && !tapas.some(([a, b2, c, d]) => q[0] > a && q[0] < c && q[1] > b2 && q[1] < d);
    const dentro = (p) => livre(naTela(p));
    const ponto = (az, el) => CENTRO_ARCO.clone().addScaledVector(direcao(az, elevDesenho(az, el)), RAIO_CEU);
    const SOLd = solEstado.SOL, outros = [];
    if (SOLd) for (const e of Object.values(SOLd.estacoes)) {
      const k = Math.round((s.t - hm(e.inicio)) / (SOLd.meta.passo_min || 15));
      if (k >= 0 && k < e.el.length && e.el[k] > 0) outros.push([e.az[k], e.el[k]]);
    }
    const az0 = VISTAS.inicio.az;
    const horiz = (v) => {
      v.y = 0;
      return v.normalize();
    };
    const hSol = horiz(direcao(s.az, 0)), hOutros = outros.map(([a]) => horiz(direcao(a, 0)));
    const COS_MAX = Math.cos(THREE.MathUtils.degToRad(70)), COS_OUTRO = Math.cos(THREE.MathUtils.degToRad(80));
    const vCamH = new THREE.Vector3();
    let melhor = null;
    for (const pol of [POL.inicio, (POL.inicio + POL.max) / 2]) {
      for (let k = 0; k < 72; k++) {
        const az = az0 + k * Math.PI / 36;
        esfIni.set(dist, pol, az);
        camera.position.copy(alvo).add(vIni.setFromSpherical(esfIni));
        camera.lookAt(alvo);
        camera.updateMatrixWorld();
        horiz(vCamH.copy(camera.position).sub(alvo));
        const cosA = vCamH.dot(hSol);
        if (cosA < COS_MAX) continue;
        const nOutros = hOutros.filter((h) => vCamH.dot(h) >= COS_OUTRO).length;
        const nArco = arcoPts.filter((x) => dentro(ponto(x.az, x.el))).length;
        const pDisco = ponto(s.az, s.el), disco2 = dentro(pDisco);
        if (disco2 && camera.position.distanceTo(pDisco) < RAIO_CEU * 0.9) continue;
        const alfaG = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, cosA)));
        const desvio = Math.abs(Math.atan2(Math.sin(az - az0), Math.cos(az - az0)));
        const nota = 2 * (outros.length ? nOutros / outros.length : 1) + nArco / arcoPts.length + 0.6 * (1 - Math.abs(alfaG - 45) / 45) - desvio * 0.05 - (pol - POL.inicio) * 0.5;
        if (!melhor || nota > melhor.nota) melhor = { nota, az, pol, nOutros, nArco, disco: disco2, alfa: Math.acos(Math.min(1, cosA)) };
      }
      if (melhor && melhor.nArco > 0) break;
    }
    estado.enquadramentoInicial = melhor && { az: +THREE.MathUtils.radToDeg(melhor.az).toFixed(1), solAoLado: +THREE.MathUtils.radToDeg(melhor.alfa).toFixed(1), outrasEstacoesIluminadas: `${melhor.nOutros}/${outros.length}`, arco: `${melhor.nArco}/${arcoPts.length}`, discoNoQuadro: melhor.disco };
    camera.position.copy(pos0);
    camera.quaternion.copy(q0);
    camera.updateMatrixWorld();
    if (!melhor) return;
    controls.rotateTo(melhor.az, melhor.pol, false);
    chaveCamEl = "";
    pedirRender();
  }
  const cTemp = new THREE.Color();
  let sombraUlt = null;
  function setSol(i, { estacao = null, movendo = false, enquadrar = false } = {}) {
    if (estacao) desenharArco(estacao);
    const primeiro = !solEstado.ativo;
    solEstado.ativo = true;
    arco.visible = !arcoOculto;
    if (primeiro) controls.maxPolarAngle = POL.max;
    scene.fog.near = 900;
    scene.fog.far = 3200;
    const luzesAntes = solEstado.luzes || 0;
    solEstado.noite = i.noite;
    solEstado.luzes = i.luzes ?? (i.noite > 0.5 ? 1 : 0);
    const dia = 1 - i.noite;
    if (i.dia && i.el > -2) {
      const d = direcao(i.az, Math.max(i.el, 0.5));
      sol.position.copy(CENTRO).addScaledVector(d, 420);
      sol.target.position.copy(CENTRO);
      camera.updateMatrixWorld();
      dirDisco = direcao(i.az, elevDesenho(i.az, i.el));
      disco.visible = !arcoOculto && i.el >= 0;
      seguirCamera();
    } else disco.visible = false;
    solEstado.ultimo = { az: i.az, el: i.el, t: i.t };
    ceuFisico.visible = true;
    ceuFisico.material.uniforms.sunPosition.value.copy(direcao(i.az, i.el));
    ceuFisico.material.uniforms.uAlfa.value = smooth(-8, 6, i.el);
    entB7.atualizarSol({ el: i.el, t: i.t, az: i.az, est: i.est });
    if (gCena) gCena.definirSol(i.el);
    sol.intensity = LUZ.sol * 1.1 * forcaSolDireto(i.el);
    sol.color.set(16774374).lerp(cTemp.set("#ff9f55"), calorSol(i.el));
    sol.castShadow = solEstado.modo === "real";
    let flags = null;
    if (solEstado.SOL && i.dia) {
      flags = new Int8Array(unidades.length).fill(-1);
      unidades.forEach((u, k) => {
        const cv = solEstado.SOL.unidades[u.numero]?.est?.[i.est]?.cv;
        if (cv && i.idx >= 0 && i.idx < cv.length) flags[k] = cv[i.idx] === "1" ? 1 : 0;
      });
    }
    solEstado.ref = flags;
    const flagsAntes = solEstado.flags;
    solEstado.flags = solEstado.modo === "pre" ? flags : null;
    const mudouFlags = solEstado.modo === "pre" && String(flagsAntes) !== String(solEstado.flags);
    scene.environmentIntensity = 0.3 + (LUZ.env - 0.3) * dia;
    hemi.intensity = 0.5 + (LUZ.hemi - 0.5) * dia;
    hemi.color.set(16777215).lerp(cTemp.set("#9fb4e0"), i.noite);
    hemi.groundColor.set(12037534).lerp(cTemp.set("#3a4458"), i.noite);
    const fill = 1 - 0.35 * forcaSolDireto(i.el);
    scene.environmentIntensity *= fill;
    hemi.intensity *= fill;
    if (gradeFn) {
      const g = gradeFn(i.el), kt = 0.15 + 0.85 * g.k;
      scene.environmentIntensity *= kt;
      hemi.intensity *= kt;
      if (g.k > 1e-3) hemi.color.multiply(cTemp.setRGB(g.base[0] / g.k, g.base[1] / g.k, g.base[2] / g.k));
    }
    const ceu = corCeu(i.el);
    pintarCeu(ceu.topo, ceu.horizonte);
    scene.background = ceuTex;
    scene.fog.color.set(ceu.horizonte);
    matChao.color.copy(tema.chao).lerp(cTemp.set("#2a3448"), i.noite);
    matRua.color.copy(tema.rua).lerp(cTemp.set("#121418"), i.noite);
    matCalcada.color.copy(CALCADA).lerp(cTemp.set("#2a2c31"), i.noite);
    matEntorno.color.copy(tema.vizinho).lerp(cTemp.set("#3a465c"), i.noite);
    matLinha.color.copy(tema.linha).lerp(cTemp.set("#b9c9dd"), i.noite);
    matLinha.opacity = 0.32 + 0.4 * i.noite;
    matArco.color.set(15774282).lerp(cTemp.set("#5d6f8c"), i.noite);
    matArcoFantasma.color.copy(matArco.color);
    matMarcas.color.copy(matArco.color);
    if (sol.shadow.mapSize.x !== MAPA) {
      sol.shadow.mapSize.set(MAPA, MAPA);
      if (sol.shadow.map) {
        sol.shadow.map.dispose();
        sol.shadow.map = null;
      }
    }
    const dSol = sombraUlt ? Math.hypot(i.az - sombraUlt.az, i.el - sombraUlt.el) : 99;
    if (!movendo || dSol > 0.5) {
      renderer.shadowMap.needsUpdate = true;
      sombraUlt = { az: i.az, el: i.el };
    }
    if (enquadrar) enquadrarSol(true);
    if (primeiro && /[?&]inicioSol=1/.test(location.search)) enquadrarInicial();
    if (mudouFlags || luzesAntes > 0.01 !== solEstado.luzes > 0.01) pintar();
    else {
      matUnidNoite.opacity = solEstado.luzes;
      if (meshListras) meshListras.material.opacity = (estado.andar != null ? 0.6 : 1) * (1 - solEstado.luzes);
      pedirRender();
    }
  }
  function desligarSol() {
    entB7.atualizarSol({ el: 35, t: 720 });
    solEstado.ativo = false;
    solEstado.noite = 0;
    solEstado.luzes = 0;
    solEstado.flags = null;
    sol.color.set(16774374);
    arco.visible = disco.visible = false;
    scene.fog.near = 500;
    scene.fog.far = 1500;
    sol.position.set(-45, 70, -50);
    sol.target.position.copy(CENTRO);
    sol.intensity = LUZ.sol;
    sol.castShadow = true;
    scene.environmentIntensity = LUZ.env;
    hemi.intensity = LUZ.hemi;
    hemi.color.set(16777215);
    hemi.groundColor.set(12037534);
    scene.background = ceuDia;
    scene.fog.color.copy(tema.fundo);
    matChao.color.copy(tema.chao);
    matRua.color.copy(tema.rua);
    matCalcada.color.copy(CALCADA);
    matEntorno.color.copy(tema.vizinho);
    matLinha.color.copy(tema.linha);
    matLinha.opacity = 0.32;
    if (sol.shadow.mapSize.x !== MAPA) {
      sol.shadow.mapSize.set(MAPA, MAPA);
      if (sol.shadow.map) {
        sol.shadow.map.dispose();
        sol.shadow.map = null;
      }
    }
    renderer.shadowMap.needsUpdate = true;
    pintar();
    irVista("inicio");
  }
  function iniciarSol(SOL, VIZ, { modo = "real" } = {}) {
    eixoX = SOL?.meta?.orientacao?.eixo_x_predio_bearing_graus ?? eixoX;
    solEstado.SOL = SOL;
    solEstado.modo = modo;
    criarEntorno(VIZ?.blocos);
    sc.left = sc.bottom = -250;
    sc.right = sc.top = 250;
    sc.near = 20;
    sc.far = 900;
    sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    const objs = [meshNoite, arco, disco, halo], vis = objs.map((o) => o.visible);
    objs.forEach((o) => {
      o.visible = true;
    });
    sol.castShadow = modo === "real";
    try {
      renderer.compile(scene, camera);
    } catch (e) {
    }
    objs.forEach((o, k) => {
      o.visible = vis[k];
    });
  }
  let arrasto = null;
  function tempoNaTela(x, y) {
    const r = canvas.getBoundingClientRect();
    let melhor = null;
    for (let k = 0; k < arcoPts.length - 1; k++) {
      const a = projetar(arcoPts[k].p.x, arcoPts[k].p.y, arcoPts[k].p.z);
      const b = projetar(arcoPts[k + 1].p.x, arcoPts[k + 1].p.y, arcoPts[k + 1].p.z);
      const px = x - r.left, py = y - r.top;
      const vx = b.x - a.x, vy = b.y - a.y;
      const L = vx * vx + vy * vy || 1;
      const s = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / L));
      const d = Math.hypot(a.x + vx * s - px, a.y + vy * s - py);
      if (!melhor || d < melhor.d) melhor = { d, t: arcoPts[k].t + (arcoPts[k + 1].t - arcoPts[k].t) * s };
    }
    return melhor ? melhor.t : null;
  }
  container.addEventListener("pointerdown", (e) => {
    if (!solEstado.ativo || !noDisco(e.clientX, e.clientY)) return;
    e.stopPropagation();
    e.preventDefault();
    arrasto = { id: e.pointerId };
    continuo = true;
    canvas.style.cursor = "grabbing";
    onArrastarSol && onArrastarSol(null, "inicio");
    acordar();
  }, { capture: true });
  window.addEventListener("pointermove", (e) => {
    if (!arrasto || e.pointerId !== arrasto.id) return;
    const t = tempoNaTela(e.clientX, e.clientY);
    if (t != null && onArrastarSol) onArrastarSol(t, "movendo");
    onHover && onHover({ tipo: "sol", x: e.clientX, y: e.clientY });
  });
  const fimArrasto = (e) => {
    if (!arrasto || e && e.pointerId != null && e.pointerId !== arrasto.id) return;
    arrasto = null;
    continuo = false;
    canvas.style.cursor = "grab";
    onHover && onHover(null);
    onArrastarSol && onArrastarSol(null, "fim");
    acordar();
  };
  window.addEventListener("pointerup", fimArrasto);
  window.addEventListener("pointercancel", fimArrasto);
  window.addEventListener("blur", () => fimArrasto());
  let poseSalva = null;
  function irParaJanela(id) {
    const u = PB.unidades.get(id);
    if (!u) return Promise.resolve();
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    controls.getPosition(p);
    controls.getTarget(t);
    poseSalva = { p, t };
    modoJanela = true;
    controls.setBoundary();
    controls.minDistance = 1;
    const alvo = u.centro.clone().add(new THREE.Vector3(0, 1.2, 0));
    const pos = alvo.clone().addScaledVector(u.normal, 6.5).add(new THREE.Vector3(0, 0.6, 0));
    const st = controls.smoothTime;
    controls.smoothTime = 0.22;
    controls.setLookAt(pos.x, pos.y, pos.z, alvo.x, alvo.y, alvo.z, true);
    acordar();
    return new Promise((res) => setTimeout(() => {
      controls.smoothTime = st;
      res();
    }, 800));
  }
  function voltarDaJanela() {
    if (!poseSalva) return;
    const { p, t } = poseSalva;
    poseSalva = null;
    controls.setLookAt(p.x, p.y, p.z, ALVO.x, ALVO.y, ALVO.z, true);
    acordar();
    setTimeout(() => {
      modoJanela = false;
      controls.setBoundary(limiteAlvo);
      aplicarLimites();
      recentrar(true);
    }, 900);
  }
  irVista("inicio", false);
  controls.update(0);
  render();
  function pontoDaUnidade(id) {
    const i = unidades.findIndex((u) => u.id === id);
    if (i < 0) return null;
    const b = unidadeBox[i];
    const c = new THREE.Vector3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    const faces = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((n2) => new THREE.Vector3(...n2));
    const paraCam = camera.position.clone().sub(c).normalize();
    const n = faces.reduce((m, f) => f.dot(paraCam) > m.dot(paraCam) ? f : m);
    const half = new THREE.Vector3((b[3] - b[0]) / 2, 0, (b[5] - b[2]) / 2);
    const p = c.clone().add(new THREE.Vector3(n.x * (half.x + 0.02), 0, n.z * (half.z + 0.02)));
    const s = projetar(p.x, p.y, p.z);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y, alvo: unidadeEm(r.left + s.x, r.top + s.y) >= 0 ? unidades[unidadeEm(r.left + s.x, r.top + s.y)].id : null };
  }
  function pontoDoSol() {
    if (!disco.visible) return null;
    const s = projetar(disco.position.x, disco.position.y, disco.position.z);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }
  function pontoDoArco(t) {
    if (!arcoPts.length) return null;
    const k = arcoPts.reduce((m, x, j) => Math.abs(x.t - t) < Math.abs(arcoPts[m].t - t) ? j : m, 0);
    const p = arcoPts[k].p;
    const s = projetar(p.x, p.y, p.z);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y, t: arcoPts[k].t };
  }
  function luminanciaMedia() {
    render();
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let soma = 0, n = 0;
    for (let k = 0; k < px.length; k += 4 * 37) {
      soma += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2];
      n++;
    }
    return soma / n / 255;
  }
  function medirEnquadramento() {
    const r = canvas.getBoundingClientRect();
    const cs = [];
    for (const x of [BX0, BX1]) for (const y of [0, TOPO]) for (const z of [BZ0, BZ1]) cs.push(projetar(x, y, z));
    const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
    const livreW = largura - desloc.x, livreH = altura - desloc.y;
    const bx0 = Math.max(0, Math.min(...xs)), bx1 = Math.min(livreW, Math.max(...xs));
    const by0 = Math.max(0, Math.min(...ys)), by1 = Math.min(livreH, Math.max(...ys));
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const t = new THREE.Vector3();
    controls.getTarget(t);
    return {
      cxRel: +((bx0 + bx1) / 2 / livreW).toFixed(3),
      cyRel: +((by0 + by1) / 2 / livreH).toFixed(3),
      cxBruto: +(cx / livreW).toFixed(3),
      cyBruto: +(cy / livreH).toFixed(3),
      areaRel: +(Math.max(0, bx1 - bx0) * Math.max(0, by1 - by0) / (livreW * livreH)).toFixed(3),
      wRel: +(Math.max(0, bx1 - bx0) / livreW).toFixed(3),
      hRel: +(Math.max(0, by1 - by0) / livreH).toFixed(3),
      alvoDist: +t.distanceTo(ALVO).toFixed(2),
      dist: +controls.distance.toFixed(1),
      azimute: +THREE.MathUtils.radToDeg(controls.azimuthAngle).toFixed(1),
      livre: [livreW, livreH],
      canvas: [r.width, r.height]
    };
  }
  function solDebug() {
    const topo = projetar(CX, TOPO, CZ);
    const ds = disco.visible ? projetar(disco.position.x, disco.position.y, disco.position.z) : null;
    const norte = direcao(0, 0);
    seguirCamera();
    return {
      ...solEstado.ultimo,
      ceu: true,
      inicial: estado.enquadramentoInicial || null,
      elevTela: solEstado.ultimo ? +elevDesenho(solEstado.ultimo.az, solEstado.ultimo.el).toFixed(1) : null,
      discoNaTela: ds ? [Math.round(ds.x), Math.round(ds.y)] : null,
      discoAltura_m: +disco.position.y.toFixed(1),
      topoPredio_m: +TOPO.toFixed(1),
      raioArco_m: +RAIO_ARCO.toFixed(1),
      discoAcimaDoTopoNaTela: ds ? ds.y < topo.y : null,
      arcoPontos: arcoPts.length,
      arcoMinY_m: arcoPts.length ? +Math.min(...arcoPts.map((x) => x.p.y)).toFixed(1) : null,
      norteNaCena: [+norte.x.toFixed(3), +norte.z.toFixed(3)],
      luzMesmaDirecao: disco.visible ? +sol.position.clone().sub(CENTRO).normalize().dot(disco.position.clone().sub(CENTRO_ARCO).normalize()).toFixed(4) : null
    };
  }
  return {
    esconderArco: (v) => {
      arcoOculto = !!v;
      arco.visible = !arcoOculto && solEstado.ativo;
      if (arcoOculto) disco.visible = false;
      pedirRender();
    },
    renderer,
    stats,
    controls,
    camera,
    irVista,
    focarAndar,
    marcarUnidade,
    setFiltro,
    pedirRender,
    limparSelecao,
    iniciarSol,
    setSol,
    desligarSol,
    enquadrarSol,
    emNoite: () => solEstado.noite > 0.5,
    solRef: () => ({ modo: solEstado.modo, ref: solEstado.ref ? Array.from(solEstado.ref) : null }),
    pontoDaUnidade,
    pontoDoSol,
    pontoDoArco,
    solDebug,
    setDeslocamento,
    irParaJanela,
    voltarDaJanela,
    medirEnquadramento,
    luminanciaMedia,
    preCarregarJanela: (u) => {
      preJanela = u;
      if (gCena) gCena.preCarregar(u);
    },
    pararPreCarga: () => {
      preJanela = null;
      if (gCena) gCena.pararPreCarga();
    },
    vistaDeCima({ altura: h = 320, contorno = true, semPredio = false, raio = 0 } = {}) {
      controls.minPolarAngle = 0;
      controls.maxDistance = 1e4;
      controls.minDistance = 1;
      controls.setLookAt(ALVO.x, h, ALVO.z + 1e-3, ALVO.x, 0, ALVO.z, false);
      if (raio) {
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(raio / h));
        aplicarDesloc();
      }
      PB.grupo.visible = !semPredio;
      const base = scene.getObjectByName("entorno-base-torre");
      if (base) base.visible = !semPredio;
      if (meshListras && semPredio) meshListras.visible = false;
      if (meshNoite) meshNoite.visible = !semPredio && meshNoite.visible;
      if (contorno) {
        const b = new THREE.Box3().setFromObject(PB.grupo);
        const pts = [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.max.x, b.max.z], [b.min.x, b.max.z], [b.min.x, b.min.z]].map(([x, z]) => new THREE.Vector3(x, TOPO + 1, z));
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 16719904, depthTest: false, toneMapped: false }));
        l.renderOrder = 50;
        scene.add(l);
      }
      acordar();
      pedirRender();
      return { alvo: [ALVO.x, ALVO.z], caixa: new THREE.Box3().setFromObject(PB.grupo) };
    },
    b7Estado: () => ({ entornoFora: DRONE, entornoCarregado: !!entB7.carregado, fachada: b7.fachada }),
    malhasInfo: () => PB.grupo.children.filter((m) => m.isMesh).map((m) => ({ n: m.name, cont: m.count, key: m.material.customProgramCacheKey ? m.material.customProgramCacheKey() : "-", comp: !!m.material.userData.compilado, cor: m.material.color && m.material.color.getHexString(), vis: m.visible })),
    contaLuzes: () => {
      const c = {};
      let somb = 0;
      scene.traverse((o) => {
        if (o.isLight) {
          c[o.type] = (c[o.type] || 0) + 1;
          if (o.castShadow) somb++;
        }
      });
      return { luzes: c, comSombra: somb, maxTex: renderer.capabilities.maxTextures, maxVertTex: renderer.capabilities.maxVertexTextures, programas: renderer.info.programs.length };
    },
    luzInfo: () => ({
      sol: sol.intensity,
      solCast: sol.castShadow,
      env: scene.environmentIntensity,
      hemi: hemi.intensity,
      expo: renderer.toneMappingExposure,
      mapa: sol.shadow.mapSize.x,
      ultimo: solEstado.ultimo,
      ativo: solEstado.ativo,
      modo: solEstado.modo,
      gradeFn: !!gradeFn,
      ceu: ceuFisico.visible,
      matU: { cor: meshUnid.material.color.getHexString(), emis: meshUnid.material.emissive ? meshUnid.material.emissive.getHexString() : null, ver: meshUnid.material.version }
    }),
    fachadaInfo: () => {
      const m = meshUnid.material, u = m.userData || {};
      const cont = { disponivel: 0, reservada: 0, indisponivel: 0 };
      unidades.forEach((x) => {
        cont[x.situacao]++;
      });
      const cor = new THREE.Color(), porCor = {};
      for (let i = 0; i < meshUnid.count; i++) {
        meshUnid.getColorAt(i, cor);
        const k = cor.getHexString();
        porCor[k] = (porCor[k] || 0) + 1;
      }
      return {
        material: m.name || m.type,
        chave: m.customProgramCacheKey ? m.customProgramCacheKey() : null,
        atlasPronto: !!(u.atlas && u.atlas.image && u.atlas.image.complete !== false && u.atlas.image.width),
        mascaraPronta: !!(u.mascara && u.mascara.image && u.mascara.image.width),
        compilado: !!u.compilado,
        situacoes: cont,
        coresInstancia: porCor
      };
    },
    info() {
      return { ...stats, programas: renderer.info.programs ? renderer.info.programs.length : null, dpr: renderer.getPixelRatio(), largura, altura, sombraMapa: sol.shadow.mapSize.x, instancias: unidades.length };
    }
  };
}
export {
  criarCena
};
