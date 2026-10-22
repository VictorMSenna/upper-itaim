import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
const URL_BAKE = new URL("../assets/interior/b6/interior_b6.glb.json", import.meta.url).href;
const DRACO = new URL("./vendor/three@0.186.1/examples/jsm/libs/draco/gltf/", import.meta.url).href;
let cache = null;
async function baixar() {
  const r = await fetch(URL_BAKE);
  if (!r.ok) throw new Error("bake HTTP " + r.status);
  const j = await r.json();
  const bin = atob(j.base64 || j.b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO);
  loader.setDRACOLoader(draco);
  const gltf = await new Promise((ok, erro) => loader.parse(u8.buffer, "", ok, erro));
  draco.dispose();
  return gltf.scene;
}
async function aplicarBake(planta, { W }) {
  try {
    if (!cache) cache = baixar().catch((e) => {
      cache = null;
      throw e;
    });
    const src = await cache;
    const bake = src.clone(true);
    bake.name = "interior-bake-b6";
    bake.scale.x = -1;
    bake.position.x = W;
    const mats = [];
    bake.traverse((o) => {
      if (o.isLight || /^luz_/.test(o.name)) {
        o.visible = false;
        return;
      }
      if (!o.isMesh) return;
      const m = o.material.clone();
      m.map = m.emissiveMap;
      m.color = new THREE.Color(0.55, 0.55, 0.55);
      m.side = THREE.DoubleSide;
      m.roughness = 0.85;
      m.metalness = 0;
      o.material = m;
      o.castShadow = false;
      o.receiveShadow = true;
      mats.push(m);
    });
    for (const [k, m] of Object.entries(planta.malhas)) {
      if (["vidro", "lente", "lenteCoz", "lenteOff"].includes(k)) continue;
      m.material = m.material.clone();
      m.material.colorWrite = false;
      m.material.depthWrite = false;
    }
    planta.grupo.children.filter((c) => /^quadro_\d_arte$/.test(c.name)).forEach((c) => {
      c.position.y += 1.136 + 0.571 / 2 - (1.5 + 2.07) / 2;
    });
    planta.grupo.add(bake);
    return {
      bake,
      definirDia(dia) {
        for (const m of mats) m.emissiveIntensity = 0.04 + 0.96 * dia;
      }
    };
  } catch (e) {
    console.warn("interior bake B6: nao carregou, fica o interior procedural", e);
    return null;
  }
}
export {
  aplicarBake
};
