# 发布 kev-webgpu

这个项目包含两个静态页面：`/kev-webgpu/` 用图示介绍 Kev、WebGPU 和 WebAssembly；`/kev-webgpu/demo/` 运行真实的 Kev q8 浏览器推理。GitHub Pages 只托管页面和程序文件，模型从锁定版本的公共 Hugging Face 地址下载，不需要推理服务器或 API key。

目标仓库名为 `kev-webgpu`。发布是否完成，以 GitHub Actions 的部署结果与实际 HTTPS 页面检查为准；本地构建成功不等于已上线。

## 本地构建

```sh
npm ci
npm test
PAGES_BASE=/kev-webgpu/ npm run build
PAGES_BASE=/kev-webgpu/ npm run preview
```

在 preview 输出的本地地址后加上 `/kev-webgpu/` 或 `/kev-webgpu/demo/`。默认只监听本机。`PAGES_BASE` 必须与部署目录一致，并保留结尾的 `/`。正常构建不包含开发用模型验证页面、原始测试报告或模型权重。

## GitHub Pages 设置

1. 创建公开的 `kev-webgpu` 仓库，并把审核过的源文件推送到 `main`。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。使用 GitHub CLI 的仓库管理员也可通过 Pages API 设置 `build_type: workflow`。
3. `.github/workflows/pages.yml` 会在 `main` 有新提交时运行，也可从 Actions 手动触发。已有环境保护规则会继续生效。
4. 工作流依次执行 `npm ci`、单元测试、TypeScript 检查和 Vite 构建，验证两个页面入口并拒绝权重、归档和开发报告，最后部署 `dist/`。
5. 以 `deploy` 作业返回的页面 URL 为准，打开介绍页和真实 Demo 检查。项目站点通常为 `https://<用户名>.github.io/kev-webgpu/`。

工作流将 `PAGES_BASE` 固定为 `/kev-webgpu/`，使用提交 SHA 标识构建版本。构建作业只有源码与 Pages 配置读取权限；部署作业有 Pages 写入和 OIDC 权限。使用 GitHub 自动提供的凭据，不需要新增 PAT 或仓库密钥。官方 action 固定在不可变的提交 SHA；版本依据官方 release API 核对于 2026-10-11。

## 公开仓库包含什么

建议明确选择源码目录 `src/`、`public/`、`tests/`、`scripts/`、`.github/`，构建配置、锁文件、README、第三方许可和已审阅的技术文档。`public/cases/` 只包含合成案例。可保留经过内容检查的少量原始数值结果来支撑验证结论；必须同时保留失败结果，不能把 GPU 能运行描述成 RCA 判断已可靠。

以下内容留在本地，不应直接批量提交：浏览器 profile 和模型缓存、`node_modules/`、`dist/`、ZIP、Git bundle、`LOCAL_HANDOFF.md`、用户导出的证据、包含本机绝对路径的日志及交接记录、完整浏览器 console 和大量原始 profile。已有 Git 历史中的文件也需要检查；新增 `.gitignore` 不能隐藏已提交文件。

截图只使用合成案例。公开文件不得包含访问令牌、带签名下载地址、客户信息或真实基础设施数据。页面不加载分析服务、远程字体、崩溃报告或云端推理。

## 上线后验证

- 记录实际 URL、部署提交及 workflow run，并检查两个入口、JS、Worker、MJS/WASM 和案例文件在仓库子路径下正常响应。
- 确认 HTTPS 安全上下文与真实 WebGPU adapter。普通 Pages 无需自定义 COOP/COEP，也不应要求不安全浏览器参数。
- 用户主动加载模型后，核对固定 q8 清单、下载地址、重定向、CORS 和摘要。不得下载其它精度或视觉模型。
- 运行真实分析并保留 GPU 执行证据。页面上显示 “WebGPU” 本身不构成 GPU 执行证明。
- 模型加载完成后，在同一打开的标签页断网，编辑为新的非预设输入，确认输入 hash 改变并再次推理。
- 编辑、导入、推理和导出期间检查网络请求，确认证据未出站。公共静态资源及模型下载仍会向服务方暴露普通网络元数据。
- 检查取消、下载失败、重新加载、清理缓存与卸载后控件可恢复，旧结果不会附着到新证据。

CI 不运行硬件 GPU 验收，也不自动下载模型。上述浏览器检查需要真实支持的设备。不要通过 `no-cors`、嵌入 HF token、替换模型或改用云推理掩盖失败。

## 缓存边界

模型已经载入且标签页保持打开时，可以继续做离线推理。关闭标签页后完全离线重启不属于当前承诺：应用文件、manifest 与运行时资产也必须可用，不能仅凭缓存了权重就宣称支持。清理缓存只能清理本应用的缓存命名空间。

## 官方参考

- [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages 发布源设置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Pages 大小等限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)
- [configure-pages v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0)、[upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)、[deploy-pages v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)
