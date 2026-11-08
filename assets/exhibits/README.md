# 3D 资产清单

当前版本**没有加载任何外部 GLB/glTF**。首页空间站与中央大厅都由本地 three.js 程序化几何、程序化贴图和运行时环境反射构成。

`manifest.json` 为空是有意的：

- `js/cosmos/assets.js` 只有在 manifest 中存在条目时才会尝试加载；
- 每条资产必须声明 `url` 与明确的 `license`（如 CC0、CC-BY），没有许可的素材不会进入渲染；
- 当前仓库没有经过质量与许可复核的九轴空间站资产，因此不放入占位模型，也不在界面声称已加载模型。

如果之后加入资产，请同时提供：来源 URL、作者、许可类型、是否允许再分发、是否经过压缩（Draco / KTX2），以及回退方案。加载器目前需要先把 `GLTFLoader` 与可选 `KTX2Loader` vendor 到 `vendor/three/addons/`。
