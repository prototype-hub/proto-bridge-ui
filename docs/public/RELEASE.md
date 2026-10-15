# 源码与前端发行指南

## 许可证与分发边界

项目有权授予的原创贡献采用 [Apache-2.0](../../LICENSE)，允许商业使用、修改和闭源分发，但须遵守适用的许可证、版权/NOTICE 保留、修改标记和专利条款；许可证不授予商标使用权。第三方组件保持各自许可，不可用项目许可证覆盖。详情以[官方完整条款](https://www.apache.org/licenses/LICENSE-2.0)为准。

源码权属、雇主/贡献者授权与参考实现的可分发范围由维护者核实；项目选择许可证不替代这些事实确认。用户/客户上传内容也不自动归入项目许可。

## 公开源码导出

在仓库根目录执行：

```bash
python3 scripts/export-source.py
# 或指定一个不存在、位于源目录外的新目录：
python3 scripts/export-source.py --output /tmp/proto-source-review
```

导出只选取 `open-source-export.json` 明确允许的源码、配置与公共文档，不依赖 `.git`。它拒绝符号链接、源目录内部/祖先输出位置及覆盖已有目录；不复制 `.env`、本地配置、运行数据、依赖/构建产物、IDE 文件、内部审计证据、截图或测试追踪。`SOURCE_MANIFEST.json` 记录每个文件的 SHA256 和大小，并记录有限敏感模式扫描的范围。

导出前后均检查敏感模式，并递归校验全部选中文档的本地链接已选入导出。扫描并不证明无所有秘密/无漏洞/已完成权属核实；正式公开前仍需人工审阅清单与实际文件。若引入旧 Git 历史，需要额外审查完整历史；不要将旧 `.git` 或本地目录整包上传。

## 生产构建与第三方声明

```bash
pnpm typecheck
pnpm verify
pnpm test:unit
pnpm build
```

构建生成 `dist/THIRD_PARTY_NOTICES.txt` 完整许可文本及 `dist/third-party-manifest.json`，Docker 复制 dist 时一并提供。该清单覆盖运行依赖解析闭包，可能大于实际浏览器 bundle；缺少必要许可文本应使构建失败，不用 SPDX 标签替代全文和版权声明。

`dom-scroll-into-view@2.0.1` 的上游包只声明 MIT、未提供独立 LICENSE 或作者版权原文；生成清单明确标记 `declaration-only`，该署名/来源项仍需维护者复核，不能声称第三方权属和声明已全部完成。

`pnpm sbom` 是当前安装环境清单，不能证明所有目标平台可选包、实际bundle或许可证义务均已核对；发布时结合 lock、实际产物与完整文本审查。默认素材来源见 [素材说明](../ASSET_PROVENANCE.md)，外部品牌/上传内容由其提供者确认权利。

## 手动发布门禁与兼容范围

- 运行类型、lint、verify、默认单元测试与生产构建；关键流程增加 Playwright，说明 Mock 与真实后端覆盖范围，不把定向通过写成全量通过。
- 在实际 Nginx 代理下核对 runtime `Origin: null`、模块/资源、分享与检查器，代理不重复增加 CORS 头；用安全隔离而非 `allow-same-origin` 维持边界。
- 普通逐菜单管理保留已有 owner；整树初始化/批量替换使用明确的单 owner 目标，混合 owner 或目标不明确时在请求前拒绝，避免部分替换及影响其他 owner 菜单。
- 复杂 Axure 原生父子 iframe 对象共享可能受 opaque sandbox 限制，播放器页名或初始目录选择可能缺失；不要宣称全部原生导出能力完全兼容。
- 使用当前漏洞库检查实际依赖和镜像，记录环境/时间；检查许可全文、目标架构、TLS、持久化与恢复。项目不预设远端 CI 或承诺旧扫描代表当前安全。
- 公开仓库前启用 [私密安全报告入口](../../SECURITY.md)，按贡献和来源说明处理权利；不发布有效分享/预览链接或内部截图。

参见 [开发指南](DEVELOPMENT.md)、[部署指南](DEPLOYMENT.md)、[CONTRIBUTING](../../CONTRIBUTING.md) 与 [来源审查](../OPEN_SOURCE_REVIEW.md)。
