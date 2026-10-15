# 前端开发与共享组件

使用 README 指定 Node.js/pnpm 与锁文件安装依赖。`src/modules` 放业务模块，`src/shared` 仅存多模块复用能力；保持现有 hooks、组件、类型、API与工具的职责，不按每个小功能增加层级。

```bash
pnpm install --frozen-lockfile
pnpm dev:mock
pnpm typecheck
pnpm lint
pnpm verify
pnpm test:unit
pnpm build
```

接真实后端从 `.env.example` 复制为 `.env.local` 并填写自己的地址，`VITE_*` 只放可公开的构建配置。关键浏览器回归使用 `pnpm test:e2e`，需要安装对应测试浏览器；Mock 成功不等于真实服务已经验收。

复用 QueryTable/QueryConditions、FormModal 等现有共享组件和字段类型；列表覆盖加载、空数据、异常、无权限、分页和响应式布局。查询条件沿服务端字段契约，不让界面权限代替后端校验。响应式页面变化需要有意义的行为回归，不增加仅镜像实现的测试。

界面文字进入现有 locale 资源；API 变化同步类型与契约。测试应等待可观察行为并清理组件/定时器，不通过全局抬高超时掩盖泄漏。新增第三方依赖应明确必要性、锁定版本并核对许可。

贡献和发行见 [CONTRIBUTING](../../CONTRIBUTING.md)、[发布指南](RELEASE.md)。
