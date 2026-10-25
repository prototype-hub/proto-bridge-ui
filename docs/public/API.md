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

## 不可变修订与分享内容

逻辑版本 `id` 保持稳定。版本响应新增 `currentRevisionId`、`revisionId`、`revisionCount`、`migrationRequired`；日常列表/详情的 `revisionId` 等于当前修订。新建版本请求的幂等重放返回首次成功的 `revisionId`，`currentRevisionId` 仍是当时实际当前指针，不将后续上传伪装为首次结果。项目和版本数量仍按逻辑资源计量，不按修订计量。

| 请求                                                                       | 行为                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /prototype-hub/versions/{id}/current-revision`                        | 解析一次当前修订                                                           |
| `GET /prototype-hub/versions/{id}/revisions?after=…&limit=50`              | 按创建时间、ID 倒序返回修订数组；`after` 为上一页末尾 ID，`limit` 为 1–100 |
| `GET /prototype-hub/versions/{id}/revisions/{revisionId}`                  | 读取指定不可变修订                                                         |
| `GET /prototype-hub/versions/{id}/revisions/{revisionId}/pages`            | 读取该修订页面树；页面带 `pageId`，目录 `pageId=null`                      |
| `POST /prototype-hub/versions/{id}/revisions/{revisionId}/preview-session` | 授予绑定该修订的 5 分钟内部预览                                            |

修订返回 `{id,projectId,versionId,versionName,description,entryFile,manifestSha256,fileCount,totalBytes,createdBy,createdAt}`，时间为毫秒时间戳，大小为字节。预览路由 `/preview/:projectId/:versionId?revisionId=…` 可打开历史；省略修订时先解析当前修订，再以同一 ID 读取入口、页面树和授权，避免并发上传造成内容混用。项目范围与操作权限检查同样适用于历史内容。

新分享默认 `revisionMode=fixed`，固定创建时的当前修订；可显式选择 `latest` 跟随最新。固定模式下修改描述不会移动原修订，编辑时也可明确选择该版本的其他历史修订。跟随模式每次打开或验证密码时解析一次当前修订；公开响应中的 `revisionId` 总是本次已授权的快照，之后上传新修订不会使当前已打开的预览混用新旧资源。本界面不提供回滚或删除单独修订。

分享管理响应包含 `revisionMode`、`revisionId`（跟随模式为 `null`）、`revoked` 和 `configVersion`，不返回密码或存储密钥。编辑、暂停/恢复、轮换和永久撤销提交所见 `configVersion` 作为 `expectedVersion`，并使用原有分享 `save` 权限与项目范围交集：

| 请求                                          | 行为                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `PUT /prototype-hub/shares/{id}`              | 完整替换描述、有效期和内容模式；密码显式选择 `keep/replace/remove`；`null` 清除描述或有效期 |
| `PUT /prototype-hub/shares/{id}/enabled`      | `{expectedVersion,enabled}`；暂停可恢复，但不恢复暂停前的访问凭据                           |
| `POST /prototype-hub/shares/{id}/rotate-link` | `{expectedVersion}`；返回新链接，原链接及旧访问凭据永久失效                                 |
| `POST /prototype-hub/shares/{id}/revoke`      | `{expectedVersion}`；终态撤销，保留管理记录，不能恢复或再修改                               |
| `DELETE /prototype-hub/shares/{id}`           | 按原删除权限永久删除记录                                                                    |

所有配置变更使此前页面树、HTML 和资源授权失效；HTTP 409 表示配置已变化，界面刷新列表并要求重新核对，不能自动覆盖或重试写入。密码只保存在当前弹窗内存，关闭、切换、观察到配置变更或执行管理变更后清除旧证明；轮换后需要重新分发新链接。网络结果不明时先刷新核对，不盲目重复操作。

公开客户端使用后端返回的 `pagesUrl` 与 runtime 地址，校验同源、当前 API 前缀及相同 token、派生 key 和修订 ID。规范地址包含 `/public/shares/{token}/{key}/revisions/{revisionId}/pages` 或 `/runtime/**`，不在前端重拼无修订的旧授权地址。公开请求不带平台 token 或 Cookie；页面地址和密码不进入持久存储。后端逐资源检查当前分享状态，已被浏览器收到的内容不能远程收回。

旧版本仍显示在列表，但 `migrationRequired=true` 时禁用预览、上传新修订和分享入口。管理员先联合备份数据库与文件，在副本验证 `POST /prototype-hub/versions/{id}/revision-migration` 的 `{apply:false}` 检查结果，确认后 `{apply:true}` 执行迁移；旧分享绑定迁移时现存内容，已被过去替换覆盖的历史无法恢复。EasyORM 自动补齐结构不能代替该数据迁移。具体副本检查和恢复步骤以配套后端说明为准。

## HTML 文件夹与 ZIP 上传

上传版本/新修订的弹窗提供 ZIP 和 HTML 文件夹两种来源。文件夹须先由 Axure 等工具导出 HTML；浏览器根据 [`File.webkitRelativePath`](https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath) 保留全部所选文件及中文、空格、嵌套子路径，只去掉所选最外层目录。零字节文件保留，空目录不由浏览器文件列表表示；不读取 `.rp`、不监听目录或自动采集预览。

只被剥离、不进入 ZIP 的外层目录可以以点开头，例如选择 `.export` 后上传其中 `index.html`；内部隐藏文件/目录、越界路径、重复路径与文件/目录冲突仍会拒绝整次选择。界面列出具体路径、原因及冲突双方，最多显示 20 项并保留问题总数，不会跳过问题文件。任何路径问题都阻止文件读取、打包和上传；修正源文件后须重新选择，打包成功后显式保存。取消、重置或切换来源会清空旧诊断。

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

项目和版本的 `DELETE` 为软删除：正常列表、分页总数和使用额排除已删除记录，删除后释放相应使用额，保留原资源 ID、修订、文件、分享及创建请求记录；不改变购买额度、项目绑定或安装标识。项目仍有活动版本时返回 409，须先删除其全部活动版本。独立的回收站菜单内提供“项目回收站 / 版本回收站”两个标签，按各自查询权限显示。每条删除记录从自己的 `deletedTime` 起保留固定 30×24 小时。满 30 天即不可恢复，服务端自动永久清理数据库记录及对应的原型快照文件；不提供手动永久删除入口。恢复父项目不会延长版本的独立保留期；父项目要等所有版本记录清理后才会物理移除，不提前删除较新或仍活动的子版本。封面、头像和品牌资源不属于该原型快照清理范围。

版本回收站使用 `POST /prototype-hub/versions/_deleted/_query`，沿用分页、名称搜索和排序请求体。省略 `projectId` 时由后端在同一权限查询中分页返回所有可编辑活动项目的已删除版本，不逐个项目拉取；可传 URL 参数 `projectId` 缩小范围，不能因此扩大权限。列表显示版本名称、所属项目标识和删除时间，恢复需要版本 `query`、`save` 与当前项目编辑权限，服务端重新检查保留期和额度。已删除父项目须先恢复；项目恢复成功后的快捷入口自动定位该项目的版本回收站，可显式清除筛选查看全部授权项目。旧 `/prototype-hub/projects/:id?recycle=versions` 入口只跳转到当前用户获授权且已注册的回收站菜单；没有该菜单或版本查询权限时显示无权限，不生成绕过菜单授权的路由。这里的版本回收站与不可变“历史修订”抽屉是两项现有功能，本次不新增历史页面或权限。

既有部署可继续使用同一个回收站菜单：`code`、`componentCode` 均为 `prototype-hub/Recycle`，默认 `url=/prototype-hub/recycle-bin`（支持管理员自定义 URL）。菜单基础 `permissions=[]`，避免两种查询动作按 AND 校验阻断只有一种查询权限的角色；通过以下按钮分别绑定真实资源权限：

| 按钮标识         | 名称           | 资源与动作                                                  |
| ---------------- | -------------- | ----------------------------------------------------------- |
| `queryProjects`  | 查询项目回收站 | `prototype-hub-project:query`                               |
| `queryVersions`  | 查询版本回收站 | `prototype-hub-version:query`                               |
| `restore`        | 恢复项目       | `prototype-hub-project:query`、`prototype-hub-project:save` |
| `restoreVersion` | 恢复版本       | `prototype-hub-version:query`、`prototype-hub-version:save` |

前端按真实资源动作控制标签和恢复操作，不把按钮标识当作额外授权。只有版本查询权限时默认打开版本标签；两项查询权限都没有时显示无权限且不请求项目、版本列表。启动初始化不会强行覆盖已有菜单或给已有角色自动授权；管理员需要核对菜单字段、显式分配菜单及所需按钮权限。完整字段示例见后端仓库的 `doc/public/DATA.md`。

已删除项目或版本的详情、成员、上传、修订、页面、分享管理、新内部预览授权和公开分享均返回 404；此前签发的内部 runtime 地址继续遵循 403 拒绝语义。原公开分享及其旧资源授权不可再次使用，管理员也不能通过普通接口绕过删除状态。相同名称新建资源会产生新 ID，不能使旧预览或分享复活；资源删除后、其创建请求记录尚保留时，原创建请求键重放返回 409。删除响应为 404 时，界面重读列表和用量并保留真实错误，不自动重试删除。撤销只作用于后续请求，无法撤回已经下载或渲染的内容。

项目创建 `POST /prototype-hub/projects` 和版本上传 `POST /prototype-hub/projects/{projectId}/versions` 发送 `Idempotency-Key`。同一弹窗内、输入及所选文件不变的失败重试沿用原键；输入或所选文件改变、关闭后重新打开时生成新键，不自动重试 POST。后端将键绑定用户、动作和项目，并校验元数据与 ZIP 字节摘要；创建请求记录保留时，同键同内容返回首次创建的同一资源，同键异内容或资源已删除返回 409。到期资源被永久清理时，其创建请求记录一并移除；此后旧键不再具有去重保证，重新创建仍须通过当前权限、配额及内容校验，成功会生成新 ID，不能复活旧资源。上传新修订使用 `PUT /prototype-hub/versions/{id}`，不新增版本占用；并发冲突返回 409 `PROTOTYPE_HUB_VERSION_CONFLICT`，页面提示刷新确认，不自动覆盖。独立客户端可省略请求键，但不保证 POST 幂等；提供时须为 1–128 个可打印 ASCII 非空白字符。

服务端容量冲突使用 HTTP 409 与 `PROTOTYPE_HUB_PROJECT_LIMIT_REACHED` / `PROTOTYPE_HUB_VERSION_LIMIT_REACHED`；幂等冲突为 HTTP 409 与 `PROTOTYPE_HUB_IDEMPOTENCY_CONFLICT`；无效请求键为 HTTP 400 与 `PROTOTYPE_HUB_IDEMPOTENCY_KEY_INVALID`。页面保留服务端失败原因，不把权限、网络或上传校验失败统一解释为容量不足。

更改请求/DTO/错误提示时同时更新契约测试、UI失败反馈和后端兼容说明。浏览器端校验仅改善交互体验，上传文件和权限安全由后端最终负责。

## 项目与版本分页检索

列表页面使用 `POST /prototype-hub/projects/_query` 和 `POST /prototype-hub/versions/_query?projectId=…`，请求体示例：

```json
{
  "pageIndex": 0,
  "pageSize": 20,
  "keyword": "项目名称",
  "sortBy": "createTime",
  "sortOrder": "desc"
}
```

响应沿用标准信封，`result` 为 `{data,total,pageIndex,pageSize}`。`total` 只统计当前用户有权访问且符合关键词的记录。`pageIndex` 从 0 开始，范围 0–10000；`pageSize` 为 1–100，默认 20。`keyword` 最长 128 个字符，去除首尾空白后，对项目名称或版本名称进行区分大小写的字面子串匹配；`%`、`_`、反斜杠不会扩大匹配范围。空关键词不筛选。

`sortBy` 仅允许 `createTime`、`name`，后者在版本列表对应版本名称；`sortOrder` 为 `asc`、`desc`。默认创建时间降序，始终附加 ID 升序以稳定相同值的顺序。超出末页返回空数组及实际总数，页面会回到有效末页重新请求。版本查询中的项目范围保留在 URL 参数，继续要求版本查询权限与项目访问权限。

项目卡片和版本表格支持显式提交名称搜索、重置、四种排序及每页 10/20/50 条。输入不会逐字触发远程查询；搜索、排序或修改每页数量后回到首页。刷新保留已提交条件；切换项目时清除上一项目的筛选、分页和临时操作，迟到请求不能恢复旧数据。用量信息独立查询，不以当前页数或筛选总数代替额度。

已发布的 `GET /prototype-hub/projects`、`GET /prototype-hub/versions?projectId=…` 仍保留原数组响应，供已有客户端兼容；新列表页面不回退到全量接口。

## 固定页面链接与页面目录

成员预览使用 `/preview/:projectId/:versionId?revisionId=…&pageId=…`。旧链接省略 `revisionId` 时只解析一次当前修订，首次打开后以 `replace` 固定实际修订与首个安全页面，刷新仍读取同一修订。目录选择以页面树返回的精确 `pageId` 更新应用路由；前进、后退或仅切换 `pageId` 不重新读取元数据或签发授权。切换修订会重新校验权限并卸载旧内容，迟到请求不能覆盖新页面。原内部短期授权到期后仍需显式重新授权，切换页面不会续期。

显式目标为空、重复查询键、未知或重复的页面标识、目录标识、不可用路径时显示错误并卸载 iframe，不回退到其他页面。旧页面树没有唯一标识时仍支持按路径浏览，但不生成伪造的稳定页面链接，复制按钮不可用。页面查找按名称或路径进行不区分大小写的字面匹配，保留祖先和当前页面；无匹配时明确提示。当前页面显示名称与路径。

公开链接使用原分享 token 的 `/share/:token?revisionId=…&pageId=…`。它仍通过当前分享策略解析授权；缺少修订时固定本次获准的修订，URL 指定修订与新授权不符时显示失效，不能借此访问 `latest` 分享的历史修订。密码验证同样执行该检查，暂停、过期、撤销继续由服务端拒绝。没有增加匿名指定历史修订的接口。

“复制当前页面链接”只重建应用路径、获准的 `revisionId` 与唯一 `pageId`，不复制运行态 URL、派生访问 key、密码、平台 token、其他查询参数或片段。复制复用现有 Clipboard API 与 HTTP 部署下的选择复制回退；iframe sandbox 和 no-referrer 策略保持原样。验证使用本机 Chrome 与原创合成 HTML，多页定位并不代表所有真实 Axure 导出格式已验证。

## 回收站与显式恢复

| 请求                                                       | 行为                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /prototype-hub/projects/_deleted/_query`             | 使用原型分页查询体，返回当前所有者或管理员可恢复的已删除项目            |
| `POST /prototype-hub/versions/_deleted/_query?projectId=…` | 使用同一分页查询体；父项目必须活动且当前用户有编辑能力，查看者不能读取  |
| `POST /prototype-hub/projects/{id}/_restore`               | 项目 save 动作及当前所有者/管理员；只恢复父项目，保留原 ID              |
| `POST /prototype-hub/versions/{id}/_restore`               | 版本 save 动作及当前父项目编辑能力；恢复原版本、修订和文件，不创建新 ID |

项目和版本响应增加 `deletedTime`：活动资源为 `null`，回收记录为删除时间戳。回收站复用当前分页、名称筛选及排序规则，在统计总数和分页前排除满 30 天的记录，普通查询始终排除删除记录。删除时间恰好等于服务端当前时间减 30×24 小时即视为到期，浏览器时间不决定是否可恢复。仅看得到项目不等于可以恢复它。

恢复会原子重验当前权限、父项目状态和当前容量，重新占用一个相应名额。已活动资源、容量不足等冲突返回 409，回收记录和引用不变；满 30 天的资源即使物理清理尚未执行也返回 404；缺失或不可见资源遵守原 404/403 边界。界面不乐观移除记录，不自动重试；404 会刷新当前列表与用量，同时保留真实错误。恢复项目后可通过“查看该项目的版本回收站”进入该项目详情并逐个恢复版本。

旧分享保持永久撤销，旧内部预览凭证不复活。恢复后可按当前权限重新授权预览或创建新分享。恢复保留创建请求记录，保留的原请求键在重新核验当前授权后可以返回恢复的同一 ID，不能重复占用额度；该保证不延伸到永久清理之后。恢复按钮与普通保存权限共同生效；前端提示不替代服务端校验。

升级包含自动清理的版本前，应停止全部旧版写入和清理节点，并在同一维护窗口备份数据库和原型存储目录；不要让不具备保留期规则的旧节点混合写入。升级前已有的删除记录也按原删除时间计算 30 天，到期数据会进入自动清理。恢复数据应同时恢复数据库与文件，不能仅依赖回收站代替备份。

项目列表与项目回收站使用独立的服务端菜单：`prototype-hub/Project` 和 `prototype-hub/Recycle`，回收站地址为 `/prototype-hub/recycle-bin`。前端只注册当前用户获授且显示的菜单，不因组件存在而补造菜单路由；旧项目地址和管理员配置的项目菜单地址继续有效。回收站查看使用项目 `query`，恢复仍需要项目 `save` 及当前数据范围权限，不增加永久删除操作，也不自动给角色授权。既有安装升级后需由管理员按需分配新菜单。

版本回收仍位于活动项目详情中，恢复项目后的快捷入口使用原详情地址及 `?recycle=versions`。这样能继续按原项目范围读取已删除版本，无需扩大为跨项目扫描。项目、版本与回收列表共用框架的名称查询条件控件，但仅提供接口支持的名称包含筛选；不提供任意字段或逻辑组查询。分页操作靠内容区右侧排列，不遮挡列表。

## 两修订比较

成员可调用 `GET /prototype-hub/versions/{id}/revisions/_compare`，必填 `leftRevisionId`、`rightRevisionId`。两者必须属于同一活动版本及项目，可为同一修订。接口使用现有版本 query 动作与项目读权限，不授予公开分享历史访问能力。显式修订缺失、跨版本或资源已删除时遵守现有 404/403 边界；未迁移旧版本返回 409，不回退当前修订。

响应包含 `versionId`、固定的 `left`/`right` 修订元数据、完整 `summary.pages`/`summary.files` 四状态计数及独立的 `pages`、`files` 分页。`pagesPageIndex`/`filesPageIndex` 从 0 开始，默认 0；对应 `pagesPageSize`/`filesPageSize` 默认 50，范围 1–100。`includeUnchanged` 默认 false，分页 total 只统计过滤后的结果，summary 始终统计完整集合。行按路径排序，超出范围返回空页。

页面行是 `{path,status,left,right}`，各侧为 `{pageId,name,path}` 或 null；文件行各侧为 `{size,sha256,mediaType}` 或 null。状态为从左到右的 added、removed、changed、unchanged。文件同路径且 SHA-256 或大小不同即变化；页面以路径配对，主名称或关联文件变化即变化，重复路径保留首个主页面。路径区分大小写，重命名仅表现为删除与新增，不代表视觉或 HTML 语义差异。旧页面 null 标识保持原样，不伪造标识。响应不包含存储根目录或预览凭证。

比较页 `/prototype-hub/compare/:projectId/:versionId` 通过 `leftRevisionId`、`rightRevisionId`、可选 `leftPageId`、`rightPageId` 恢复固定定位。历史抽屉按选择顺序打开左右修订；各侧目录独立导航，点击差异行才按该路径同时定位两侧。缺失页面显示空态，无稳定标识的旧页面仅显示比较信息，不能定位预览。每侧使用已有固定修订短期授权，过期卸载 iframe，需显式重新授权。复制链接只包含应用身份字段，不能包含平台 token 或运行态授权；原单独预览及公开分享的定位与授权行为保持不变。

## 固定修订交付包质量

历史修订行的“质量体检”调用 `GET /prototype-hub/versions/{id}/revisions/{revisionId}/quality`，需要当前项目读权限与版本 `query` 动作。它只检查所选活动版本的明确修订，不回退当前修订，不向公开分享授予历史报告访问能力。关闭抽屉、切换修订或失去权限时清空结果并取消请求。

报告包含 `versionId`、`revisionId`、`manifestSha256`、`entryFile`、`summary`、`limits`、`complete` 和 `findings`。每个问题为 `{code,severity,sourcePath,targetPath,reference}`，后两项可为 null，级别为 `error/warning`。检查覆盖入口、清单文件存在性与支持的本地 HTML/CSS 静态引用；中文路径是兼容提醒。不会执行脚本、请求外网或验证动态业务交互，也不能代替上传 ZIP 安全检查。

`summary` 提供包内文件数、已读取文档/字节数、已检查本地引用数、错误/提醒/问题总数、遗漏问题数及跳过文档数。`uncheckedReferences` 单独统计外部、根绝对路径、页内锚点和其他协议引用，这些未检查项不代表已通过。`complete=true` 仅表示支持的本地检查范围完成；文件缺失、读取失败、预算或问题收录限制等会使其为 false。界面始终显示范围、限制、未检查项及遗漏数量，不把“没有问题”解释为所有页面正确。

当前预算为单文档 2 MiB、文档合计 32 MiB、最多 100000 条引用及最多收录 1000 项问题；以报告 `limits` 的实际值为准。界面每页显示 50 条已收录问题，翻页不请求服务器。下载使用同一份已加载报告在浏览器生成 JSON，保留总数与遗漏信息，不重新扫描、不补造被遗漏的问题；文件名仅使用版本和修订标识，不带预览授权或平台令牌。下载后的报告与其他已下载内容一样无法远程撤回。

## 分享的邮箱访问者身份

分享管理行提供“访问者身份设置”，需要分享保存权限与当前项目的分享管理能力。`GET /prototype-hub/shares/{id}/review` 返回 `{enabled,allowUnverified,allowComment,mailAvailable,configVersion}`；`PUT` 同一路径提交 `{enabled,allowUnverified?,allowComment?,expectedVersion}`。历史身份与许可均默认关闭，旧客户端省略许可或传null时保留存储值；普通分享创建/编辑不会自行开启。反馈仅在身份开启且fixed分享有有效修订时可用；enabled=false同时显式allowComment=true返回400，新界面关闭身份时同时提交allowComment=false。旧客户端保留的存储标志在身份关闭时仍返回有效false。保存使用刚读取的版本，409后刷新并要求手动重新确认；策略更新轮换原分享凭据，刷新分享列表，重新开启不恢复旧会话。只有身份总开关与allowUnverified均开启才提供低保障入口。

分享密码授权后的响应提供 `reviewEnabled/reviewAvailable/reviewUnverifiedAllowed`；最后一项仅在当前授权、身份总开关和低保障许可均有效时为true，context还返回allowUnverified与allowComment的有效值。可信外壳保留邮箱OTP，并只在管理员允许时提供“未验证”方式：姓名必填、公司可选、不收集邮箱、不发送邮件。界面始终区分“邮箱已验证”和“未验证”；姓名/公司均为自述，邮箱持有权也不代表实名或企业认证。没有邮件服务或发码失败时仅提示原因，不自动选择或提交低保障方式。固定分享可手动复制定向邀请，仍须指定邮箱重新OTP；启用页面反馈后支持文字线程与网页回复，不创建平台用户，不提供人工身份关联或业务提醒。

以下均为 `POST /prototype-hub/public/shares/{token}/review/{action}`，请求体必须携带本次分享的 `{revisionId,accessKey}`，不放在查询字符串；固定与跟随分享都以本次明确修订为范围，不隐式切换最新内容。

| action       | 额外输入                                        | 响应                                                                                |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `context`    | 无                                              | `{revisionId,enabled,allowUnverified,allowComment,mailAvailable,csrfToken,session}` |
| `challenges` | `{email,displayName,company?,invitationToken?}` | `{challengeId,expiresAt,resendAfter}`                                               |
| `verify`     | `{challengeId,code}`                            | 同context，成功后轮换Cookie/CSRF                                                    |
| `unverified` | `{displayName,company?}`                        | 同context；须显式获准，返回未验证身份                                               |
| `logout`     | 无                                              | `{loggedOut:true}`，随后重新获取匿名context                                         |

`session`只含 `{guestId,displayName,company,maskedEmail,verificationLevel,expiresAt}`；verificationLevel仅为email或unverified，低保障maskedEmail为null，邮箱身份只显示脱敏值。前端沿用trim整理姓名和公司；姓名须非空且最多100字符，公司可选且最多200字符。服务端独立校验收到的原始字段，拒绝Unicode控制字符后才strip，不依赖客户端校验。身份和CSRF只留在可信外壳内存，不传到原型iframe、postMessage、资源URL或全局store/localStorage。

接口使用独立同源JSON fetch客户端，浏览器仅向review路径发送HttpOnly、SameSite=Strict的限时Cookie；生产HTTPS默认Secure，不读取Cookie、不附平台令牌，除context外均使用 `X-Review-CSRF`。公开预览客户端继续省略Cookie，原型iframe的opaque sandbox边界不变。反向代理按后端文档设置精确受信Origin，不放宽CORS或全局Cookie策略。

`ORIGIN_DENIED`提示管理员核对可信前端地址，`COOKIE_REQUIRED`提示检查Cookie与HTTPS配置，`CSRF_INVALID`提示重新载入身份验证；与分享撤销/过期分开显示，不因诊断自动发送验证码。缺失、null或其他站点的Origin不受信任，开发代理改写Host也不意味着接受任意Origin或转发头。

验证码为6位ASCII数字、有效5分钟；发送冷却、次数限制及一次性消费由服务端决定。发码不自动重试，网络结果不明确时由用户显式核对再发送；修改邮箱/姓名/公司须重新发码。相同项目邮箱重新OTP找回同一邮箱身份，仍须满足当前分享与密码授权；不按姓名合并。

未验证身份从首次签发起固定8小时；同一有效会话再次提交保留原ID、资料与到期时间，不改名或续期。当前已有有效邮箱身份时申请低保障身份返回409 / `PROTOTYPE_HUB_REVIEW_IDENTITY_EXISTS`，须先显式退出。未验证会话退出、丢失、到期或被撤销后，不能通过姓名、公司、邮箱或OTP找回，也不自动合并进后来验证的邮箱身份。分享配置换代后，重新取得当前分享证明再明确申请可获得另一随机身份，无须依赖清除旧Cookie；旧ID和期限不会恢复，未知会话等级仍拒绝。界面明确提示无自助/人工关联入口，需联系管理员线下处理；新申请是另一个身份。

未验证新建采用独立的项目60次/小时、当前Cookie5次/小时及60秒冷却窗口，有效会话复用不计新建。此限制不识别人或设备；清除Cookie不能绕过项目总量上限。邮箱OTP额度与低保障创建额度分开，状态切换不退还。身份状态由分享外壳统一持有，身份或反馈抽屉打开时共用；两个抽屉均关闭后清空身份上下文，重开仍从服务器校验Cookie和分享范围。分享变更、停用、撤销、过期或软删均不能靠旧身份绕过。

## 固定页面文字反馈

反馈入口复用公开分享与成员预览工具栏，不增加全局菜单。目标是外壳当前选中的固定revisionId与唯一manifest pageId，界面明确提示不跟随iframe内部导航；legacy、重复或无效页面标识没有反馈入口。服务端校验清单成员并返回pageName/pagePath，前端不提供作者身份或可信页面路径。当前支持文字线程、对客回复、内部备注、open/resolved状态、成员专用线程负责人、访客创建时的根页面点/矩形/椭圆位置快照及访客初始投稿和已有线程回复中的单张手动图片；不含跨frame或语义元素定位、通用附件、全局分派队列、编辑删除或业务邮件。

公开接口全部位于 `/prototype-hub/public/shares/{token}/review`，除跨页总览外提交 `{revisionId,accessKey,pageId}`，沿用同源Cookie、受信Origin、`X-Review-CSRF`、no-store；新接口包含明确的PUT方法，不能把身份Cookie扩至runtime：

| 请求                                       | 额外字段                                                       | 结果                           |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------ |
| `POST /threads/_query`                     | `{pageIndex,pageSize,state?}`                                  | 本人线程分页                   |
| `POST /threads/_overview`                  | `{revisionId,accessKey,pageIndex,pageSize,state?}`，不需pageId | 当前固定修订中本人跨页线程分页 |
| `POST /threads/{threadId}/_detail`         | 无                                                             | 当前本人范围的单个Thread       |
| `POST /threads`                            | `{text,clientRequestId,anchor?}`                               | Thread                         |
| `POST /threads/_with-image`                | multipart中的request含原创建字段，另含image                    | Thread，首条公开消息附图       |
| `POST /threads/{threadId}/messages/_query` | `{pageIndex,pageSize}`                                         | 仅公开消息分页                 |
| `POST /threads/{threadId}/messages`        | `{text,clientRequestId}`                                       | 当前访客的公开Message          |
| `PUT /threads/{threadId}/status`           | `{state:'open',expectedVersion,clientRequestId}`               | 重开后的Thread                 |

逐页接口的本人线程范围匹配同一项目、版本、分享、修订、页面及身份保障等级/guestId，跨页总览仅省略页面条件。另一分享不继承旧线程，已验证邮箱重新OTP仍须相同分享当前授权；未验证会话到期、丢失或退出后不能按姓名或邮箱恢复历史。公开列表不按客户端过滤内部数据，不展示其他访客或内部备注的内容、数量、时间或版本变化。

成员从预览进入反馈，查询要求版本query与项目edit，写入要求版本save与项目edit；仅有项目read不能查看全部客户反馈或内部备注。管理接口基于 `/prototype-hub/versions/{versionId}/review-threads`，除跨页总览外所有请求提交 `{revisionId,pageId}`：

| 请求                               | 额外字段                                                     | 结果                           |
| ---------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| `POST /_query`                     | `{pageIndex,pageSize,state?}`                                | Thread分页                     |
| `POST /_overview`                  | `{revisionId,pageIndex,pageSize,state?}`，不需pageId         | 当前固定修订全部页面Thread分页 |
| `POST /{threadId}/_detail`         | 无                                                           | 当前管理范围的单个Thread       |
| `POST /{threadId}/messages/_query` | `{pageIndex,pageSize}`                                       | 全部公开/内部Message分页       |
| `POST /{threadId}/messages`        | `{text,visibility:'public'\|'internal',clientRequestId}`     | Message                        |
| `PUT /{threadId}/status`           | `{state:'open'\|'resolved',expectedVersion,clientRequestId}` | Thread                         |

PM不能创建客户顶层线程。对客回复与内部备注使用明确不同的选择项和标识；内部备注永不进入公开列表。分享或访客停用后，当前有权PM仍可处理归档，项目/版本/修订不可用时拒绝。访客公开回复自动重开resolved，PM公开回复保持状态；访客只能明确重开，只有PM可解决。状态转换才增加configVersion，同版本同状态请求不重复转换；内部备注不改变公开updatedAt、状态、版本或排序。

Thread为 `{id,revisionId,pageId,pageName,pagePath,summary,authorName,authorCompany,verificationLevel,state,configVersion,createdAt,updatedAt,anchor}`；summary是首次公开文本前200个Java字符，首位作者资料/等级固定为投稿快照。Message为 `{id,threadId,text,authorType,authorName,authorCompany,verificationLevel,visibility,createdAt}`；作者种类为guest/member，成员等级为null。两者均不含原始作者ID、完整邮箱或凭据，不增加messageCount。纯文本使用转义插值显示，不解释HTML或Markdown。

### 全部页面反馈

公开分享和成员预览工具栏提供显式“全部页面反馈”，原当前页反馈仍是默认入口。总览独立只读加载当前固定修订，不能跨分享、修订或合并身份；公开结果仍限定当前shareId、guestId与保障等级，成员仍须版本query及项目edit。两个\_overview接口使用独立请求，不放宽原逐页请求的pageId要求。revisionId必填，公开端另需accessKey；pageIndex为0–10000、默认0，pageSize为1–100、默认20，state可省略或为精确的open/resolved，空字符串无效。界面每页20条，按服务端total分页；越界页保留真实total且data为空，不自动回退。排序为公开updatedAt降序、ID升序，内部备注和分派不影响总数、时间、排序或Thread投影。

总览显示已有页面名称/路径、摘要、状态、作者自述/保障等级及时间，不加载消息、图片或负责人，不预取所有页面。只有明确“查看”才验证返回线程的修订和threadId，以及已加载manifest中唯一非目录pageId，再导航到原revisionId/pageId/threadId并调用详情接口重新授权；不传运行地址、正文或凭据。缺失身份或待用邀请时不请求总览，由原显式身份流程完成后返回原筛选和页号，不自动发送OTP或放弃邀请。

筛选、分页、错误及请求代次独立于原线程抽屉。范围、修订或实际作者变化及销毁时清空结果并取消请求，迟到响应不能覆盖新范围；授权失效不保留旧结果。打开/关闭总览、同目标返回及身份往返不清除当前文字、File、锚点、请求键或分派意图。跨目标忙碌时禁用查看；有草稿、未知提交或分派编辑/未知结果时先明确确认放弃，取消保留原payload、请求键和地址，确认后才导航。总览不自动提交、重试或更改线程状态，不新增全局工作队列、消息通知或持久缓存。

线程深链沿现有成员预览或公开分享外壳路由使用 `?revisionId={rid}&pageId={pageId}&threadId={threadId}`，threadId为43位URL安全随机标识。目标必须包含完整、单值且格式有效的三个标识；重复、空白、非法或缺少配套参数显示目标错误，不悄悄改为首页、另一线程或新建反馈。原有不含threadId的页面链接保持兼容。规范化页面地址须保留合法线程目标；明确选择页面会清除线程目标，浏览器前进后退可恢复有效目标。

目标线程独立调用详情接口，再使用原消息分页，不要求它出现在当前线程分页或state筛选中，也不扫描全部分页、插入额外列表行或改写total。收到详情先验证id/revisionId/pageId；矛盾结果不得显示或用于发送。切换目标、范围或身份时清空旧内容并取消请求，迟到的详情和消息不能覆盖新目标。链接只定位线程，不定位某一消息页。

链接不授予访问权。管理端仍检查项目edit与版本query，公开端仍检查同一分享、本人guest及身份等级；无权或错误范围不从threadId推断页面。外壳按正常流程要求分享密码、有效身份及待用邀请的新OTP，完成后恢复所请求线程；不自动发码、退出、放弃邀请或投稿。丢失的未验证身份不能凭链接找回。当前目标失效或越权时清除旧详情并显示错误，不能将同一输入降级为新建线程。

“复制当前线程链接”仅重建当前外壳路径及revisionId/pageId/threadId，沿用router的base/hash支持和现有复制回退，不复制accessKey、CSRF、Cookie、邀请片段、正文、运行URL或其他参数，不自动把成员地址改成客户分享地址。“复制当前页面链接”仍只含修订与页面。目标标识仅用于外壳导航，复制不包含anchor；线程数据和凭据不进入iframe、postMessage或持久存储。用户明确采集/定位时仅几何通过独立根文档通道传递。

所有分页使用服务端total，页号0–10000、每页1–100，右侧显示分页器；线程按公开updatedAt降序、ID升序，消息按createdAt升序、ID升序。text经strip后1–4000个Java字符，Unicode纯空白无效；state/visibility仅接受精确字符串。每次写入的clientRequestId为1–128个可打印ASCII非空白字符，界面使用crypto.randomUUID并只存当前外壳内存。相同语义重试复用原键，不确定结果不自动重发；修改文本、创建锚点、可见性、expectedVersion或目标后创建新意图。同键不同内容返回409，不生成重复消息或事件；重放仍先重新授权，再返回原资源当前结果。

身份与反馈抽屉共用一个身份hook，切换时先打开目标再关闭来源。草稿仅在当前外壳内存：同目标关闭重开、OTP返回或会话过期保留文字；会话过期提供显式复制与重新验证，验证成功不会自动投稿。分享/修订/页面/线程或实际身份变化、分享证明/页面失效会清理错误范围草稿；缺失/过期会话与范围失效分开处理。取消请求与代次检查阻止切换后的旧结果覆盖新目标。409刷新当前状态并保留同目标未发送文字，由用户重新确认；凭据、完整草稿、姓名、线程数据不进入iframe、workspace runtime、postMessage或持久存储；只有用户明确采集/定位所需的几何经独立根文档通道传递，页面选择事件仍仅含修订及页面身份和名称/路径。

错误码 `PROTOTYPE_HUB_REVIEW_COMMENTS_DISABLED` 为403，`PROTOTYPE_HUB_REVIEW_SESSION_REQUIRED` 为403且允许明确重新验证；缺失或越权线程统一404 / `PROTOTYPE_HUB_REVIEW_THREAD_UNAVAILABLE`，无效页面为404 / `PROTOTYPE_HUB_REVIEW_PAGE_INVALID`，陈旧状态版本为409 / `PROTOTYPE_HUB_REVIEW_THREAD_CONFLICT`。访客新写入独立限频为项目300次/小时、每保障等级/guestId 60次/小时；幂等重放不重复占次数。基础只在同一事务保存领域事件，事件30天后有界清理，不派发业务消息，不显示已发送邮件或通知。

### 根页面几何锚点

访客可在新建反馈时明确绘制点、矩形或椭圆，正文仍必填，可同时选择一张图片；JSON创建与附图创建的request均可包含anchor，回复不提交或修改锚点，PM没有新建客户顶层线程入口。anchor省略/null与旧请求一致，旧线程返回null；非空值创建后不可编辑，不能迁移到其他页面或修订。

结构为 `{space:'root-document-css-px-v1',shape:'point'|'rect'|'ellipse',x,y,width,height,documentWidth,documentHeight,viewportWidth,viewportHeight}`。八个数值均为JSON整数CSS像素；文档宽高1–1000000，视口宽高1–16384，位置及宽高非负且右/下边界不超文档。point宽高为0，rect/ellipse宽高至少1，不接受小数或数字字符串。它是用户提供的静态位置，不是DOM证据或权限凭据，不保存选择器、frame路径、HTML或任意上下文。

绘制只作用于sandbox根文档，覆盖子frame但不读取或转换其内部坐标。点选、区域绘制与键盘操作均需用户明确完成，Escape取消，零面积区域不提交；与原inspect模式互斥。页面、范围、根iframe代次或文档/视口尺寸变化会取消当前捕获，覆盖层本身不得扩大文档尺寸。绘制时关闭再打开反馈抽屉保留原文字、File及请求键，不自动上传。

已选线程只有用户明确点击后才定位，不在详情返回时自动执行。运行文档及视口宽高须同时精确匹配原快照，匹配时滚动到位置并显示标记；不匹配或之后尺寸变化则隐藏并显示不可定位，不拉伸、夹紧、重锚或改变页面选择。即使尺寸一致，动态内容也可能不同，界面须提示静态位置不跟踪元素。

几何消息使用独立的 `PROTOTYPE_REVIEW_ANCHOR_COMMAND` / `PROTOTYPE_REVIEW_ANCHOR_EVENT` 通道。外壳只接受当前根iframe的精确event.source、null origin、当前随机channel和generation及有界类型化数据；不沿原inspect的递归frame来源规则接受几何。channel用于排除迟到消息，不构成授权。runtime用不带anchor的capturing状态确认采集初始化，只有合法当前ACK才能解除外壳的有界初始化等待；人的绘图过程没有完成时限，只有captured可携带anchor。每次ready、采集及定位，runtime以自身pathname精确比对外壳从已验证运行地址计算的encoded相对路径和前缀长度，且拒绝query/hash；状态不回传原始地址或资源标识。此边界防止正常内部导航误绑，不证明恶意上传脚本可信。

原型只接收几何、模式及非授权地址提示/通道代次，不接收线程/页面/修订标识、作者、正文、File、图片字节、分享证明、Cookie、CSRF或平台token。仍保留allow-scripts/allow-forms sandbox、无allow-same-origin与no-referrer。anchor不加入复制URL或浏览器持久存储。实际作者和范围不变的OTP往返、未知响应保留完整原锚点/图片/请求键供明确重试；修改锚点创建新意图。相同键与相同语义重放原线程，改变锚点或无/有锚点互换返回409；省略/null保持历史指纹。

维护几何协议时，真实运行脚本验证使用独立入口：`PROTOTYPE_HUB_TEST_INSPECTOR_PATH=/absolute/path/to/inspector.js pnpm exec playwright test --config tests/playwright.anchors.config.ts`。显式指定当前后端的原始inspector.js，专项直接使用该资源，不复制协议实现；缺少变量时明确失败，不静默跳过。默认 `pnpm test:e2e` 仍运行原mock目录，不需要本机后端路径，此测试变量不是产品运行配置。

### 成员线程负责人

仅成员预览的已有选定线程展示负责人，公开分享不调用分派接口。base为 `/prototype-hub/versions/{versionId}/review-threads/{threadId}`，每次带 `{revisionId,pageId}`；详情与候选要求版本query，修改要求版本save，均同时检查当前项目edit或既有有效管理员例外。

| 请求                           | 额外字段                                       | 结果                      |
| ------------------------------ | ---------------------------------------------- | ------------------------- |
| `POST /assignment/_detail`     | 无                                             | Assignment                |
| `POST /assignment/_candidates` | `{pageIndex:0,pageSize:20,keyword?}`           | `{userId,name}`服务端分页 |
| `PUT /assignment`              | `{assigneeId,expectedVersion,clientRequestId}` | Assignment；null清除      |

Assignment为 `{threadId,assignmentVersion,updatedAt,assignee:null|{userId,name,available}}`，初始版本0、更新时间null；name为最多128字符的姓名快照。available只表示目标账号当前启用且仍是本项目owner/editor，不授予访问权限。停用或撤员显示不可用，不自动转交；同一账号重新合格可再次可用。账号删除同步清除分派，重建同ID不恢复。

编辑时才明确加载候选，按name、userId升序，使用真实total；pageIndex为0–10000、pageSize为1–50，默认0/20，keyword最多100字符且仅按姓名字面包含搜索。候选只含当前启用owner/editor，去重后不含viewer、无项目绑定的管理员或其他平台账号，也不返回username、邮箱。没有全局账号搜索或逐线程列表补查。

expectedVersion使用独立assignmentVersion，不能用线程状态configVersion；assigneeId只接受非空白字符串或null。当前授权先于回执重放，同键相同范围/目标/expectedVersion返回当前Assignment，不重写旧目标或重复事件；旧目标不可用也不能阻止合法旧键重放。同键不同语义409。新操作先校验版本及非空目标当前资格，仍选原目标也不能绕过停用或撤员；同版本同合格目标不递增，清除未分派目标也不改变版本。实际设置/清除才更新独立版本与时间，公开Thread形状、updatedAt、状态configVersion及消息计数/排序不变。

分派独立维护忙碌、错误、取消与请求代次，关闭、更换actor/范围/线程或卸载后不显示迟到结果。409只刷新分派并保留回复文字、File、状态意图、选择及回复请求键；未知结果保留原分派请求键/原payload供明确重试，改选目标才形成新意图。失败不自动提交消息或状态。使用转义姓名、zh/en、窄屏及键盘可操作控件；分派数据不进入公开分享、iframe、postMessage、URL或持久存储，不新增授权、主副负责人、自动转交或通知。

### 私有消息图片

访客新建附图线程使用公开base下的 `POST /threads/_with-image`；已有线程仍在原公开/成员review-threads base下使用 `POST /{threadId}/messages-with-image`。multipart只含application/json的request（该端原文字创建或回复字段）与唯一image文件part。正文仍必填，普通文字JSON接口不变，不新增成员创建客户线程入口。附图创建返回原Thread而非Message，不增加image字段；成功后选中返回线程，按原接口查询首条公开消息并由用户明确查看图片。仅允许实际PNG/JPEG，最多5 MiB，宽高各1–16384且像素总数不超过16000000；前端类型/大小提示不替代服务端内容校验。原文件名不显示、持久化或用作路径，multipart发送固定文件名，FormData边界由浏览器生成，不手写Content-Type覆盖boundary。

Message新增 `image:null|{contentType,size,width,height}`，size为字节、宽高为像素；旧消息为null。图片继承所在消息的public/internal可见性，响应不提供路径、URL、hash或新凭据。查看须用户明确触发 `POST /{threadId}/messages/{messageId}/image`，JSON为该端原页面请求，公开端仍有accessKey、当前Cookie、受信Origin和X-Review-CSRF，不发送平台token。接口返回原始PNG/JPEG字节并带nosniff、private/no-store和固定安全inline文件名；缺失或失效不回退其他图片。

可信外壳校验响应MIME/字节长度和消息元数据后创建Blob object URL，不直接将鉴权API作为img src，不向原型iframe、postMessage、URL、本地存储或遥测传File、图片字节、Blob URL或凭据。替换、关闭查看、范围/actor/thread/message切换或卸载时撤销object URL并取消请求；迟到响应不能覆盖新目标。拒绝或缺失时隐藏旧图并显示不可用状态，已合法下载的图片不可能由服务端召回。

同目标同作者身份验证往返保留本地文字、File及请求键且不自动上传；范围、授权或作者变化依现有草稿规则清空。未知响应保留File和原clientRequestId供明确重试；文字和附图创建共用创建操作范围，同键同文字和真实图bytes返回原线程，不重复首消息、事件或限频。已有图片回复仍按原操作范围返回原消息。修改内容生成新意图，同键改文字、改图或文字与图片互换返回409。成功创建清除草稿与File，选择新线程；取消、替换及销毁沿原规则撤销Blob URL，迟到结果不能跳转旧范围。不得为了LAN HTTP要求crypto.subtle。支持zh/en及窄屏手动选择、移除、发送和查看；不提供跨frame定位、自动截图、单图编辑删除或业务通知。

图片错误为400 / `PROTOTYPE_HUB_REVIEW_IMAGE_INVALID`（实际格式、解码或维度）、400 / `PROTOTYPE_HUB_REVIEW_IMAGE_TOO_LARGE`（服务端原图字节预算）、400 / `PROTOTYPE_HUB_REVIEW_IMAGE_PARTS_INVALID`（part、JSON、请求校验或multipart解析预算）、404 / `PROTOTYPE_HUB_REVIEW_IMAGE_UNAVAILABLE`（无图、缺文件或完整性失败）。解析期超限也可能先返回PARTS_INVALID，不能依赖唯一超限码。原Origin、CSRF、会话、权限与409幂等错误保持；不能因错误自动换键或重发图片。

## 固定分享邀请

邀请是指定邮箱对当前固定分享的身份确认，不把分享改成“仅受邀者访问”，也不替代分享密码。普通邮箱/已获准的未验证入口保持原权限；邀请模式不自动发送邀请邮件或提供免OTP登录。

管理接口基于 `/prototype-hub/shares/{shareId}/review-invitations`，查询要求分享query，创建/撤销要求save，并且始终要求当前项目manageShares能力：

| 请求                         | 输入/结果                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `POST` 基础路径              | `{email,expectedShareVersion}` → `{invitation,invitationToken}`，原始凭据仅创建时返回 |
| `POST /_query`               | `{pageIndex:0,pageSize:20}` → 标准服务端分页                                          |
| `PUT /{invitationId}/revoke` | `{expectedVersion}` → 当前邀请记录                                                    |

邀请记录为 `{id,maskedEmail,status,configVersion,createdAt,expiresAt,consumedAt}`；状态 `pending/consumed/revoked/expired/invalidated`，不返回完整邮箱或持久凭据。分页0–10000、每页1–100，创建时间降序、ID升序，越界返回真实total与空data。仅活动、身份已开启且有有效固定修订的fixed分享可创建，latest提示先改固定修订。24小时有效期被分享到期时间截断；创建独立限频为项目60次/小时、收件邮箱5次/小时及60秒冷却，不占用OTP额度。

创建使用最新分享configVersion作为expectedShareVersion；撤销使用邀请自己的configVersion。409后刷新并手动重新确认，不自动重试创建或撤销。相同版本已撤销记录可原样返回，已消费/到期/失效不可变更。撤销只阻止待用邀请，不撤销已签发身份；后者需访问者管理停用。分享配置换代、停用/撤销/到期、关闭身份、资源回收，或邮箱访客停用再恢复，均不能复活旧邀请。

创建响应中的原始凭据仅保留在当前弹窗内存，使用现有同源分享URL生成 `#reviewInvitation=TOKEN`，用户明确点击后才复制；关闭或更换分享即清空，不可从列表重新获取。公开外壳在工作区构建或导航前捕获并清除片段，保留应用base路径；邀请只在当前同一分享内存中有效，不进入query、全局store、localStorage/sessionStorage、日志、iframe URL/props或postMessage。普通“复制当前页面链接”仍不复制邀请片段。

邀请模式要求访客自己输入指定收件邮箱，不调用公开邀请详情。即使已有邮箱或未验证身份，也须提示明确退出，再获取新的OTP；同页退出保留待用邀请，不自动接受邀请。该模式隐藏未验证捷径；只有用户明确放弃邀请才回到独立普通身份流程，错误片段或失败请求不能自动回退。发码携带可选invitationToken；verify保持原challengeId/code协议，由服务端读取绑定关系，成功后清空原始邀请凭据。invitationToken非null时必须为43位URL安全字符，格式非法返回400；格式合法但未知、失效或收件人/范围不匹配统一返回403 / `PROTOTYPE_HUB_REVIEW_INVITATION_INVALID`，不给出完整邮箱；SMTP失败仍不可跳过验证。

## 项目访问者管理

项目详情的“访问者管理”在当前项目manageShares能力与分享query动作同时具备时显示；启用/禁用额外要求分享save。它不属于系统用户管理、不新增导航菜单；后端逐次校验项目范围，不能仅凭访问者ID操作其他项目。

- `POST /prototype-hub/projects/{projectId}/review-guests/_query` 提交 `{verificationLevel:'email',pageIndex:0,pageSize:20}`，省略等级查email，切换未验证身份使用unverified。两类分别分页，不混合客户端过滤；等级无效返回400。页号0–10000、页大小1–100，按更新时间倒序、ID正序；超出范围保留真实total并返回空页，不提供邮箱搜索或任意查询条件。
- 列表与更新仅返回 `{id,displayName,company,maskedEmail,verificationLevel,enabled,configVersion,createTime,modifyTime,expiresAt}`。email的expiresAt为null，unverified返回固定期限与null maskedEmail；不返回完整邮箱、邮箱哈希、Cookie或会话密钥。尚未完成首次OTP的收件人不出现在邮箱联系人列表。
- `PUT /prototype-hub/projects/{projectId}/review-guests/{guestId}/enabled?verificationLevel=unverified` 提交 `{enabled,expectedVersion}`；省略查询参数时按email处理，等级只接受精确email/unverified，显式空值或重复查询参数返回400；跨项目、跨等级或已到期未验证身份的状态更新返回404。409后刷新并重新确认，不自动重试写入；同版本同状态不产生副作用。
- 实际状态转换撤销对应身份的旧会话，邮箱身份还撤销该项目邮箱验证码；低保障操作不影响同名邮箱联系人。重新启用不复活Cookie或验证码，也不延长固定期限。邮箱联系人须新OTP才能继续；未验证身份没有恢复原ID的凭据，新申请不关联旧记录。

切换项目、身份等级、页码、关闭抽屉或权限变化时取消旧请求并清空数据，迟到结果不能覆盖当前列表；访问者信息不进入全局store。管理状态变更不影响匿名原型预览、不退还限额，也不能撤回已被SMTP受理的邮件。生产邮件配置及后续独立通知模块边界以后端运维文档为准。
