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

真实用例同时覆盖分享编辑、跟随最新、暂停/恢复、轮换与终态撤销，并核对旧页面和资源授权失效。测试连接真实接口，密码和令牌只作为运行时数据，不放入 `VITE_*` 或发行材料；trace、截图和录像关闭，结果写入被忽略的 `test-results/live`。仅对本次测试创建的资源执行清理。真实后端用例与 Mock 回归各自报告覆盖范围，不互相替代。

软删除回归覆盖删除确认、使用额释放、相同名称补位使用新 ID，以及已删除目标的旧内部预览、公开分享和新授权拒绝。Mock 保留资源、修订和创建请求记录，以活动资源过滤正常查询及配额；它只验证界面契约，不能证明数据库事务或文件保留。真实用例在删除后同步移除本测试的活动资源清理登记，不对已删除目标再次调用不可访问的子资源接口。服务端保留的数据与文件仍需纳入数据库和文件联合备份；回收站恢复保留原 ID，项目与版本分别恢复；旧分享与预览授权不复活。删除记录按各自删除时间保留固定 30×24 小时，满期即从回收查询排除且恢复返回 404，随后由服务端自动永久清理数据库记录、创建请求记录及原型快照。父项目恢复不延长子版本期限；父记录只有在全部原始子版本记录清理后才移除。升级前需停止旧写入/清理节点并联合备份数据库与文件，既有墓碑同样按原删除时间到期。

复用 QueryTable/QueryConditions、FormModal 等现有共享组件和字段类型；列表覆盖加载、空数据、异常、无权限、分页和响应式布局。查询条件沿服务端字段契约，不让界面权限代替后端校验。响应式页面变化需要有意义的行为回归，不增加仅镜像实现的测试。

界面文字进入现有 locale 资源；API 变化同步类型与契约。测试应等待可观察行为并清理组件/定时器，不通过全局抬高超时掩盖泄漏。测试工具使用支持当前 Node.js/Vite 的 Vitest 4；工具链升级后运行完整单元与组件回归，避免与占用大量资源的后端构建并行造成误判。

新增第三方依赖应明确必要性、锁定版本并核对许可。`pnpm test:release` 验证许可收集与发行门禁行为，`pnpm verify` 收集可追溯许可资料；正式分发产物另执行 `pnpm licenses:release`，存在声明资料待审时必须失败。在线漏洞审计与未决项见[发布指南](RELEASE.md)。

贡献和发行见 [CONTRIBUTING](../../CONTRIBUTING.md)、[发布指南](RELEASE.md)。

回收站回归覆盖项目/版本恢复、同 ID 与修订保留、当前额度冲突、角色与动作权限、恢复后的新授权以及旧分享持续失效。恢复查询沿用原型列表的分页取消与最后页校正，不向普通查询添加 includeDeleted 开关。真实浏览器用例还检查先恢复父项目不会连带恢复版本。Mock 的测试专用时钟与清理控制分开模拟“到期但尚未清理”和“清理已完成”，覆盖 30 天前 1 毫秒、恰好到期、到期后 1 毫秒、未来时间、恢复 404 后刷新、子版本独立期限，以及清理后旧创建请求键只能产生新 ID。该控制仅在 `dev:mock` 中存在，不进入生产构建；它不证明真实数据库事务或物理文件安全。

异步详情读取按路由代次提交结果，菜单、角色和职位均覆盖 A 请求晚于 B 完成的反例；原型删除及编辑结果只反馈给原来的页面或弹窗。安全随机标识统一使用共享工具，局域网 HTTP 缺少 randomUUID 时仅回退到 getRandomValues，不使用时间戳或 Math.random。

## 修订比较的维护边界

比较页复用历史修订分页、现有版本 query 权限、固定修订页面与短期预览接口。`useRevisionComparison` 管理 pair 请求、独立差异分页、页面位置和两个短期授权；切换 pair 取消旧请求并清空旧内容，分页不重新签发预览凭证。`useWorkspaceLocation` 的可选左右命名空间只用于比较页，默认单独预览与公开分享仍使用原 revisionId/pageId 规则。比较页面不写 currentRevisionId，不增加版本额度，也不把下载文件、视觉截图或语义重命名混入 hash 比较。

相关测试入口：`tests/component/revision-comparison.test.ts`、`tests/component/preview-location.test.ts`、`tests/unit/revision-comparison-api.test.ts`、`tests/e2e/revision-comparison.spec.ts`，以及既有真实后端 `tests/live/prototype-release.spec.ts` 的比较步骤。Mock 仅提供有界历史、确定页面/文件差异及不同 HTML；服务端权限、持久清单分类与实际文件安全仍须由后端集成及真实 JAR 验证，不能以 Mock 结果替代。

## 交付包质量报告的维护边界

质量报告沿历史修订的项目读能力与版本 query 权限进入。`RevisionQualityDrawer` 承接单个修订报告，`useRevisionQuality` 管理读取、取消代次、局部分页和同报告导出；类型及端点仍在模块 `types`、`api/version.ts`。不要从当前修订接口推断所选历史内容，不增加平行下载端点、扫描任务或全局缓存。

问题列表仅用文本插值显示包内路径和引用，不能使用 `v-html` 或将原始引用直接变为可点击外链。界面区分检查完成、存在错误与检查不完整；未检查引用、跳过文档和遗漏问题数必须保留在界面与下载中。JSON 下载复用共享 API 客户端的 `download`，不深导入其他业务模块私有工具。

针对性入口为 `tests/component/revision-quality.test.ts`、`tests/unit/revision-quality-api.test.ts`、`tests/e2e/revision-quality.spec.ts`。Mock 仅模拟固定报告和有界问题列表，覆盖取消、归属检查、分页、错误重试、文本显示、下载及窄屏；真实浏览器用例还从已上传且已被新修订替换的旧内容读取报告并核对下载完全相同。HTML/CSS 解析、引用归一化、读写安全、预算及数据权限需要服务端测试和最终 JAR 联验，Mock 不替代这些证据。
