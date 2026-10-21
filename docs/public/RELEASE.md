# 源码与前端发行指南

## 许可证与分发边界

项目有权授予的原创贡献采用 [Apache-2.0](../../LICENSE)，允许商业使用、修改和闭源分发，但须遵守适用的许可证、版权/NOTICE 保留、修改标记和专利条款；许可证不授予商标使用权。第三方组件保持各自许可，不可用项目许可证覆盖。详情以[官方完整条款](https://www.apache.org/licenses/LICENSE-2.0)为准。

源码权属、雇主/贡献者授权与参考实现的可分发范围由维护者核实；项目选择许可证不替代这些事实确认。用户/客户上传内容也不自动归入项目许可。

## 公开源码导出

在仓库根目录执行：

```bash
python3 tools/export-source.py
# 或指定一个不存在、位于源目录外的新目录：
python3 tools/export-source.py --output /tmp/proto-source-review
```

导出只选取 `open-source-export.json` 明确允许的源码、配置与公共文档，不依赖 `.git`。它拒绝符号链接、源目录内部/祖先输出位置及覆盖已有目录；不复制 `.env`、本地配置、运行数据、依赖/构建产物、IDE 文件、内部审计证据、截图或测试追踪。`SOURCE_MANIFEST.json` 记录每个文件的 SHA256 和大小，并记录有限敏感模式扫描的范围。

导出前后均检查敏感模式，并递归校验全部选中文档的本地链接已选入导出。扫描并不证明无所有秘密/无漏洞/已完成权属核实；正式公开前仍需人工审阅清单与实际文件。若引入旧 Git 历史，需要额外审查完整历史；不要将旧 `.git` 或本地目录整包上传。

## 生产构建与第三方声明

```bash
pnpm typecheck
pnpm verify
pnpm test:release
pnpm test:unit
pnpm build
# 正式分发构建产物前，执行严格许可门禁：
pnpm licenses:release
```

构建生成 `dist/THIRD_PARTY_NOTICES.txt` 完整许可文本及 `dist/third-party-manifest.json`，Docker 复制 dist 时一并提供。该清单覆盖运行依赖解析闭包，可能大于实际浏览器 bundle；缺少必要许可文本应使构建失败，不用 SPDX 标签替代全文和版权声明。

`agent-base@6.0.2` 与 `https-proxy-agent@5.0.1` 将完整 MIT 文本放在 README 的 License 段，已按 npm `gitHead` 对应的官方提交核对原文，并在 `third-party/supplements.json` 记录精确版本、来源和 SHA256；新增版本缺少许可文本仍会失败，不自动套用旧版本例外。

`dom-scroll-into-view@2.0.1` 的上游包和对应源码树只声明 MIT、未提供独立 LICENSE 或作者版权原文；生成清单保留 `declaration-only` 待审标签，`pnpm licenses:release` 会因此失败。开发构建可以生成带此标签的审查产物，但不能据此批准二进制发行。维护者应取得可核验的上游声明，或完成有依据的依赖替换后再解除门禁；不得臆造版权人。公开项目源码的审查与包含第三方代码的构建产物分发分别确认，项目的 Apache-2.0 不覆盖该缺口。

`pnpm sbom` 是当前安装环境清单，不能证明所有目标平台可选包、实际bundle或许可证义务均已核对；发布时结合 lock、实际产物与完整文本审查。默认素材来源见 [素材说明](../ASSET_PROVENANCE.md)，外部品牌/上传内容由其提供者确认权利。

## 依赖漏洞复核

```bash
pnpm audit --prod --json --registry https://registry.npmjs.org
pnpm audit --json --registry https://registry.npmjs.org
```

每次发行重新在线扫描并记录时间、锁文件摘要与命中路径。`verify` 检查来源、敏感模式和许可资料，不代替漏洞扫描；审计命中导致的非零退出也不能当作工具故障忽略。

2026-10-21 针对当前锁文件的复核已消除生产闭包和 Critical 命中：Axios 升至 1.20.0、Vue 升至 3.5.42、Vite 保持 6 系列并升至 6.4.4；Vitest 按[官方迁移路径](https://v4.vitest.dev/guide/migration.html)升至 4.1.11，移除旧 `tinypool` 依赖，不使用跨主版本强制覆盖。

开发依赖仍有以下未清项，后续扫描可能变化：

- `eslint-plugin-vue`/`stylelint` 经 `micromatch` 引入的 `braces@3.0.3`：High，[上游问题](https://github.com/micromatch/braces/issues/70)描述深度嵌套的外部 glob 模式可耗尽 Node 调用栈，当前无修复版本。它不在生产依赖闭包；本项目的 lint 使用仓库维护的固定模式，仍应在隔离环境中处理不可信源码或配置，不能据此宣称漏洞已修复。
- `eslint-plugin-vue@10.5.0` 引入的 `postcss-selector-parser@6.1.4`：Moderate，[公告](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)的修复线为 7.1.6。当前调用方约束为 6 系列，不强制替换其主版本；待上游兼容更新后复核。

这些结果是检查时点的依赖记录，不涵盖镜像、部署代理或未来新增依赖，也不能代替维护者对正式发行风险的判断。

## 干净构建与真实后端验证

在新导出的源码目录执行 `pnpm install --frozen-lockfile` 与 `pnpm build`，不要复制原工作区的 `node_modules`、`dist` 或 `.env.local`。真实后端浏览器入口是 `pnpm test:e2e:live`（`playwright.live.config.ts`），与默认 Mock 测试隔离，使用不加载 `.env` 的专用配置预览生产 `dist`；由配套后端 `tools/verify-runtime.py` 的 `--frontend-dir` 参数提供随机隔离实例和临时账号，接线要求见[开发指南](DEVELOPMENT.md)。

记录实际产物、浏览器和样本范围。原创 HTML 多页样本通过不能证明全部 Axure 导出能力、生产 Nginx 或其他浏览器均兼容；不公开运行时账号、令牌、分享 URL、截图或追踪。运行检查与第三方许可、安全扫描及目标部署验收分别执行。

## 手动发布门禁与兼容范围

- 运行类型、lint、verify、默认单元测试与生产构建；关键流程增加 Playwright，说明 Mock 与真实后端覆盖范围，不把定向通过写成全量通过。
- 在实际 Nginx 代理下核对 runtime `Origin: null`、模块/资源、分享与检查器，代理不重复增加 CORS 头；用安全隔离而非 `allow-same-origin` 维持边界。
- 普通逐菜单管理保留已有 owner；整树初始化/批量替换使用明确的单 owner 目标，混合 owner 或目标不明确时在请求前拒绝，避免部分替换及影响其他 owner 菜单。
- 复杂 Axure 原生父子 iframe 对象共享可能受 opaque sandbox 限制，播放器页名或初始目录选择可能缺失；不要宣称全部原生导出能力完全兼容。
- 使用当前漏洞库检查实际依赖和镜像，记录环境/时间；检查许可全文、目标架构、TLS、持久化与恢复。项目不预设远端 CI 或承诺旧扫描代表当前安全。
- 公开仓库前启用 [私密安全报告入口](../../SECURITY.md)，按贡献和来源说明处理权利；不发布有效分享/预览链接或内部截图。

参见 [开发指南](DEVELOPMENT.md)、[部署指南](DEPLOYMENT.md)、[CONTRIBUTING](../../CONTRIBUTING.md) 与 [来源审查](../OPEN_SOURCE_REVIEW.md)。
