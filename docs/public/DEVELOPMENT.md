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

连接真实后端的浏览器用例单独使用 `playwright.live.config.ts` 与 `tests/live`，不由默认 Mock 配置收集。它需要 `PROTO_E2E_API_URL`、`PROTO_E2E_USERNAME`、`PROTO_E2E_PASSWORD` 和 `PROTO_E2E_ZIP_PATH`；缺少接线时明确失败，不跳过验证。使用配套后端的 `tools/verify-runtime.py --jar /path/to/bootstrap.jar --frontend-dir /path/to/proto-bridge-ui` 可自动提供随机隔离数据库、临时账号与原创多页 HTML ZIP，并在结束后回收自身资源。

运行前先安装锁定依赖并执行 `pnpm build`，安装 Playwright 配置指定的浏览器。接线完成后可运行 `pnpm test:e2e:live`；专用预览配置不读取 `.env`，只提供生产 `dist` 并将 `/api` 代理至指定后端。默认本机端口为 `5197`，可由 `PROTO_E2E_UI_PORT` 修改；端口占用时失败，不复用现有服务。

测试连接真实接口，密码和令牌只作为运行时数据，不放入 `VITE_*` 或发行材料；trace、截图和录像关闭，结果写入被忽略的 `test-results/live`。仅对本次测试创建的资源执行清理。真实后端用例与 Mock 回归各自报告覆盖范围，不互相替代。

复用 QueryTable/QueryConditions、FormModal 等现有共享组件和字段类型；列表覆盖加载、空数据、异常、无权限、分页和响应式布局。查询条件沿服务端字段契约，不让界面权限代替后端校验。响应式页面变化需要有意义的行为回归，不增加仅镜像实现的测试。

界面文字进入现有 locale 资源；API 变化同步类型与契约。测试应等待可观察行为并清理组件/定时器，不通过全局抬高超时掩盖泄漏。测试工具使用支持当前 Node.js/Vite 的 Vitest 4；工具链升级后运行完整单元与组件回归，避免与占用大量资源的后端构建并行造成误判。

新增第三方依赖应明确必要性、锁定版本并核对许可。`pnpm test:release` 验证许可收集与发行门禁行为，`pnpm verify` 收集可追溯许可资料；正式分发产物另执行 `pnpm licenses:release`，存在声明资料待审时必须失败。在线漏洞审计与未决项见[发布指南](RELEASE.md)。

贡献和发行见 [CONTRIBUTING](../../CONTRIBUTING.md)、[发布指南](RELEASE.md)。
