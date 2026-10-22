# 前后端请求契约

默认管理 API 为 `/api`，开发由 Vite 代理，生产由 Nginx 代理。管理客户端附认证与语言头，公开分享客户端不发送管理凭据；登录加密与验证码由后端配置决定，RSA 不代替 HTTPS。

登录未勾选“记住我”时保持现有 `expires: 3600000` 和 localStorage 令牌策略；勾选时发送 hsweb 支持的 `expires: -1`，只将令牌保存到 `${storageNamespace}-remember-token` Cookie，不保存密码。Cookie 为 host-only、`Path=/`、`SameSite=Lax`，HTTPS 使用 `Secure`，有效期为 400 天且访问时续期；浏览器清理或策略可能提前移除，不能保证永久保留。重新访问受保护页面或登录页时仍会向后端验证身份。退出、当前会话的 401、修改密码和账户禁用清除记住的 Cookie 与旧令牌；服务端长期令牌仍可被撤销。

动态菜单决定导航及按钮展示；后端必须再次校验每个读写请求的身份、权限和数据范围。本人资料/头像使用自助接口，系统品牌上传属于管理能力。列表分页、筛选、用户绑定与角色撤销的行为需前后端同版本回归。

运行态 HTML 使用 opaque sandbox，仅传输模式与检查结果等必要消息；检查来源窗口，不把认证令牌放进 postMessage。Nginx不增加覆盖runtime的重复CORS头。分享与预览URL是敏感能力链接，不能写入公开问题或截图。

实际接口以对应后端版本 OpenAPI 和当前 API 类型为准。未接入 SSO/应用/资产模块时的空列表属于独立版范围，不宣称完成所有原企业平台能力。

用户列表、详情和当前用户资料的 `type`，以及 `GET /user/detail/types` 的选项项，使用 `{ "value": "normal", "text": "普通用户", "id": "normal" }` 形式；管理员为 `admin` / `管理员`。`id` 保留用于已发布接口兼容，筛选和比较使用 `value`，展示优先使用当前行的后端 `text`，不由前端重建中文映射。类型由服务端管理，用户创建/更新不提交只读的 `type/typeId`。未知类型保留后端标识和原文；前端兼容旧版字符串与 `id/name` 形式。

## 项目成员与内部预览授权

项目查询返回 `ownerId`（可为 `null`）、`role`（`owner/editor/viewer/admin`）、`claimRequired` 和 `capabilities: {read, edit, manageMembers, deleteProject, manageShares}`。能力由服务端当前项目归属与角色计算，界面同时保留普通菜单/动作权限；缺少能力时默认拒绝，不根据当前登录用户名猜测管理员或所有者。仅项目查询/维护权限即可进入成员管理，版本列表与用量需另外具备版本查询权限。

| 项目角色 | 项目与版本读取         | 项目/版本维护及分享管理                        | 成员管理与删除项目                         |
| -------- | ---------------------- | ---------------------------------------------- | ------------------------------------------ |
| 所有者   | 支持                   | 支持                                           | 支持；有版本的项目仍不可删除               |
| 编辑者   | 支持                   | 支持；不能删除项目                             | 不支持                                     |
| 查看者   | 支持                   | 不支持，也不能读取含公开访问凭据的分享管理列表 | 不支持                                     |
| 管理员   | 由服务端管理员例外授权 | 同时校验普通动作权限                           | 可处理待认领项目；认领不提供普通所有权转移 |

所有读取/写入仍以服务端权限为准。不可见项目、其版本和关联资源返回 404；可见项目内角色不足返回 403。把另一个项目的版本 ID 填入 URL 不会扩大范围。项目列表仅返回当前可见项目，用量仍按整库实际项目计量，不用可见列表长度推算，配额不会因项目成员隔离而变为每用户额度。

下列路径由管理客户端加 `/api`，普通项目动作权限与项目角色同时生效：

| 请求                                                                       | 行为                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /prototype-hub/projects/{id}/members`                                 | 返回含所有者的 `{userId,name,username,role}` 数组；仅有成员管理能力者读取                                                      |
| `GET /prototype-hub/projects/{id}/member-candidates?keyword=…`             | 搜索可添加或指定的用户，最多 20 条 `{userId,name,username}`；不读取全局用户管理列表，也不返回密码/电话等资料；可含已有普通成员 |
| `PUT /prototype-hub/projects/{id}/members/{userId}`                        | `{role:"editor"}` 或 `{role:"viewer"}`，添加或更新普通成员；不能通过此接口更改所有者                                           |
| `DELETE /prototype-hub/projects/{id}/members/{userId}`                     | 移除普通成员；所有者不能移除                                                                                                   |
| `POST /prototype-hub/projects/{id}/claim`                                  | 管理员为无有效所有者项目提交 `{userId}`，指定有效用户作为所有者                                                                |
| `POST /prototype-hub/projects/_ownership-migration`                        | 管理员提交 `{apply:false}` 预览历史项目认领统计，确认后 `{apply:true}` 幂等执行；返回 `scanned/assigned/pending/unchanged`     |
| `POST /prototype-hub/versions/{id}/revisions/{revisionId}/preview-session` | 返回 `{runtimeBaseUrl,previewUrl,expiresAt}`，授予当前成员 5 分钟内部预览能力                                                  |

版本列表/详情中的旧 `runtimeBaseUrl/previewUrl` 为 `null`，不能再直接打开历史长期预览 key。内部预览先检查项目与版本关联，再换取短期凭证；凭证仅留在本次预览内存与资源 URL，不存 Cookie/localStorage、不放入 postMessage、不携带管理 token。到期卸载 iframe，点击“重新授权预览”重新检查当前权限；不在后台自动续期。每次成员变更使该项目此前的内部凭证失效，上传新修订不会撤销绑定旧修订的有效凭证，资源请求由后端逐次检查。旧匿名 previewKey 退出后，原内部 URL 需重新从项目预览入口打开。

公开分享是独立外部授权，仍走无管理凭据的公开客户端。撤员不自动撤销已发出的公开分享；需要阻止旧公开链接时必须在分享管理中单独删除/撤销。角色检查和过期控制不能抹除浏览器此前已经渲染或下载的内容。

旧项目迁移应先联合备份数据库与文件，在副本上执行预览、应用并核对统计，重跑不会重复分配，也不会重新认领已因删除账户清理的成员/所有者关系；有效创建者可成为所有者，创建者失效/缺失的旧项目保留所有者为空的待认领状态。所有者为空时仅管理员可见；所有者账号停用或失效但归属仍在时，已有编辑者/查看者仍可按成员角色访问，同时管理员可认领。删除所有者账号会清空归属并撤销内部预览授权。管理员在项目详情进入“项目成员”指定所有者。前后端需一起升级；不要恢复旧后端的匿名 runtime 来兼容过期凭证。结构自动补齐不代替历史归属迁移，具体运维步骤以配套后端说明为准。

## 不可变修订与固定分享

逻辑版本 `id` 保持稳定。版本响应新增 `currentRevisionId`、`revisionId`、`revisionCount`、`migrationRequired`；日常列表/详情的 `revisionId` 等于当前修订。新建版本请求的幂等重放返回首次成功的 `revisionId`，`currentRevisionId` 仍是当时实际当前指针，不将后续上传伪装为首次结果。项目和版本数量仍按逻辑资源计量，不按修订计量。

| 请求                                                                       | 行为                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /prototype-hub/versions/{id}/current-revision`                        | 解析一次当前修订                                                           |
| `GET /prototype-hub/versions/{id}/revisions?after=…&limit=50`              | 按创建时间、ID 倒序返回修订数组；`after` 为上一页末尾 ID，`limit` 为 1–100 |
| `GET /prototype-hub/versions/{id}/revisions/{revisionId}`                  | 读取指定不可变修订                                                         |
| `GET /prototype-hub/versions/{id}/revisions/{revisionId}/pages`            | 读取该修订页面树；页面带 `pageId`，目录 `pageId=null`                      |
| `POST /prototype-hub/versions/{id}/revisions/{revisionId}/preview-session` | 授予绑定该修订的 5 分钟内部预览                                            |

修订返回 `{id,projectId,versionId,versionName,description,entryFile,manifestSha256,fileCount,totalBytes,createdBy,createdAt}`，时间为毫秒时间戳，大小为字节。预览路由 `/preview/:projectId/:versionId?revisionId=…` 可打开历史；省略修订时先解析当前修订，再以同一 ID 读取入口、页面树和授权，避免并发上传造成内容混用。项目范围与操作权限检查同样适用于历史内容。

新分享固定到创建时的当前修订，公开分享响应包含 `revisionId`；后续上传不会使旧链接切换内容。本批界面不提供回滚或删除单独修订、跟随最新修订的分享选项。

旧版本仍显示在列表，但 `migrationRequired=true` 时禁用预览、上传新修订和分享入口。管理员先联合备份数据库与文件，在副本验证 `POST /prototype-hub/versions/{id}/revision-migration` 的 `{apply:false}` 检查结果，确认后 `{apply:true}` 执行迁移；旧分享绑定迁移时现存内容，已被过去替换覆盖的历史无法恢复。EasyORM 自动补齐结构不能代替该数据迁移。具体副本检查和恢复步骤以配套后端说明为准。

## HTML 文件夹与 ZIP 上传

上传版本/新修订的弹窗提供 ZIP 和 HTML 文件夹两种来源。文件夹须先由 Axure 等工具导出 HTML；浏览器根据 [`File.webkitRelativePath`](https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath) 保留全部所选文件及中文、空格、嵌套子路径，只去掉所选最外层目录。零字节文件保留，空目录不由浏览器文件列表表示；不读取 `.rp`、不监听目录或自动采集预览。

文件夹使用 Worker 内的 [fflate](https://github.com/101arrowz/fflate) 流式打包；选择后只生成本地 ZIP，确认后才上传。界面分开展示本地打包进度、HTTP 上传进度和服务器处理状态，支持取消。浏览器文件夹预算为最多 5000 文件、合计 128 MiB、单文件 64 MiB，用于控制浏览器负担，不代表固定内存峰值。不支持目录选择/Worker、超限或失败时可回到原 ZIP 入口，ZIP 浏览器上限仍为 500 MiB。服务端继续独立检查大小、路径、条目和文件类型，不会为了文件夹来源放宽策略。

两种来源复用既有 multipart 字段 `versionName`、`description` 和 `file`；新建版本发送 `POST /prototype-hub/projects/{projectId}/versions`，为所选版本上传新修订发送 `PUT /prototype-hub/versions/{id}`，并以 `expectedRevisionId` 提交弹窗打开时的当前修订。成功后保留逻辑版本 ID 和历史内容，不增加版本占用。入口明确区分新建版本与上传新修订，打包完成不会自动选择另一个目标。

取消打包会终止本地 Worker，取消 HTTP 不能保证服务端尚未提交。网络中断/响应丢失不自动重试 POST；保留当前包与输入，手动重试沿用同一幂等键。重新选择文件、修改输入或关闭后重开代表新的创建意图；若不确定前次结果，可先刷新版本列表核对。当前验证范围为本机 macOS 的 Chrome 与合成 HTML 资源；Safari、Firefox、Windows 及真实 Axure 导出包尚未验证。目录选择兼容不等同所有 Axure 导出兼容，权限、运行态 sandbox 和现有 ZIP 回退始终保留。

## 原型用量与创建请求

默认同一部署数据库最多保有 5 个项目，每项目最多 5 个逻辑版本。前端读取服务端真实用量，不用当前列表长度推算；筛选、操作者和浏览器会话不改变统计范围。下面路径由管理客户端自动加 `/api`，响应列为统一响应体的 `result`：

| 请求                                             | `result`                               | 后端权限                 |
| ------------------------------------------------ | -------------------------------------- | ------------------------ |
| `GET /prototype-hub/projects/_usage`             | `{installationId, projects: Capacity}` | 项目 `query`             |
| `GET /prototype-hub/versions/_usage?projectId=…` | `{projectId, versions: Capacity}`      | 版本 `query`，项目须存在 |

`Capacity` 为 `{used, limit, remaining, overLimit, canCreate}`；当前 `limit=5`，剩余数量最低为零。`canCreate=false` 表示已满或超限，`overLimit=true` 仅表示历史数据已超过上限。项目列表和详情独立加载用量，失败展示重试入口，不显示为零，也不阻断已有内容。满额禁用新增入口，已有项目编辑、上传版本新修订、预览、分享及删除仍可操作；删除后刷新用量。展示只是查询快照，并发新增仍以服务端事务校验结果为准。

项目创建 `POST /prototype-hub/projects` 和版本上传 `POST /prototype-hub/projects/{projectId}/versions` 发送 `Idempotency-Key`。同一弹窗内、输入及所选文件不变的失败重试沿用原键；输入或所选文件改变、关闭后重新打开时生成新键，不自动重试 POST。后端将键绑定用户、动作和项目，并校验元数据与 ZIP 字节摘要；同键同内容返回首次创建的同一资源，同键异内容或资源已删除返回 409。上传新修订使用 `PUT /prototype-hub/versions/{id}`，不新增版本占用；并发冲突返回 409 `PROTOTYPE_HUB_VERSION_CONFLICT`，页面提示刷新确认，不自动覆盖。独立客户端可省略请求键，但不保证 POST 幂等；提供时须为 1–128 个可打印 ASCII 非空白字符。

服务端容量冲突使用 HTTP 409 与 `PROTOTYPE_HUB_PROJECT_LIMIT_REACHED` / `PROTOTYPE_HUB_VERSION_LIMIT_REACHED`；幂等冲突为 HTTP 409 与 `PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT`；无效请求键为 HTTP 400 与 `PROTOTYPE_HUB_IDEMPOTENCY_KEY_INVALID`。页面保留服务端失败原因，不把权限、网络或上传校验失败统一解释为容量不足。

更改请求/DTO/错误提示时同时更新契约测试、UI失败反馈和后端兼容说明。浏览器端校验仅改善交互体验，上传文件和权限安全由后端最终负责。
