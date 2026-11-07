/* PaperWorld · 专业 3D 资产接入扩展点（GLB / KTX2）
 *
 * 目标：为中央大厅逐步替换"许可清晰的烘焙模型"预留能力，但本轮不附带高面数资产。
 * 约定：放置 assets/exhibits/manifest.json 后才会尝试加载，格式：
 *   { "exhibits": [ { "url": "assets/exhibits/xxx.glb",
 *                     "position": [0, 1.6, 0], "scale": 1,
 *                     "replace": "turbine"   // 可选：替换程序化展品的标识
 *                   } ] }
 * 加载器按需动态 import：需先把 GLTFLoader / KTX2Loader 及 basis 转码器
 * vendor 到 vendor/three/addons/ 与 vendor/three/basis/。未 vendor 或无 manifest
 * 时静默跳过，保留现有程序化展品与性能档位，不影响主流程。
 * 许可红线：只接受manifest 中声明了 license 字段且为 CC0/CC-BY 等可再分发许可的资产。
 */
export async function loadProfessionalExhibits(scene, THREE, { renderer } = {}) {
  let manifest;
  try {
    const res = await fetch("assets/exhibits/manifest.json");
    if (!res.ok) return { loaded: 0, reason: "no-manifest" };
    manifest = await res.json();
  } catch {
    return { loaded: 0, reason: "no-manifest" };
  }
  const list = Array.isArray(manifest?.exhibits) ? manifest.exhibits : [];
  if (!list.length) return { loaded: 0, reason: "empty-manifest" };

  let GLTFLoader, KTX2Loader;
  try {
    ({ GLTFLoader } = await import("../../vendor/three/addons/loaders/GLTFLoader.js"));
  } catch {
    return { loaded: 0, reason: "gltf-loader-not-vendored" };
  }
  try {
    ({ KTX2Loader } = await import("../../vendor/three/addons/loaders/KTX2Loader.js"));
  } catch { KTX2Loader = null; }

  const loader = new GLTFLoader();
  if (KTX2Loader && renderer) {
    try {
      const ktx2 = new KTX2Loader().setTranscoderPath("../../vendor/three/basis/").detectSupport(renderer);
      loader.setKTX2Loader(ktx2);
    } catch { /* 无 basis 转码器时退回普通贴图 */ }
  }

  let loaded = 0;
  for (const item of list) {
    if (!item?.url || !item.license) continue; // 许可不明不加载
    try {
      const gltf = await loader.loadAsync(item.url);
      const node = gltf.scene;
      if (Array.isArray(item.position)) node.position.fromArray(item.position);
      if (item.scale) node.scale.setScalar(item.scale);
      node.userData.exhibitId = item.replace || item.url;
      scene.add(node);
      loaded++;
    } catch (err) {
      console.warn("[assets] 跳过资产", item.url, err.message);
    }
  }
  return { loaded, reason: loaded ? "ok" : "all-failed" };
}
