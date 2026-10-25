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

分享管理行提供“访问者身份设置”，需要分享保存权限与当前项目的分享管理能力。`GET /prototype-hub/shares/{id}/review` 返回 `{enabled,allowUnverified,mailAvailable,configVersion}`；`PUT` 同一路径提交 `{enabled,allowUnverified?,expectedVersion}`。旧分享的两个许可默认关闭，旧客户端省略allowUnverified或传null时保留其已有值；普通分享创建/编辑不会自行开启。保存使用刚读取的版本，409后刷新并要求手动重新确认；策略更新轮换原分享凭据，刷新分享列表。只有身份总开关与allowUnverified均开启才提供低保障入口。

分享密码授权后的响应提供 `reviewEnabled/reviewAvailable/reviewUnverifiedAllowed`；最后一项仅在当前授权、身份总开关和低保障许可均有效时为true，context也返回allowUnverified。可信外壳保留邮箱OTP，并只在管理员允许时提供“未验证”方式：姓名必填、公司可选、不收集邮箱、不发送邮件。界面始终区分“邮箱已验证”和“未验证”；姓名/公司均为自述，邮箱持有权也不代表实名或企业认证。没有邮件服务或发码失败时仅提示原因，不自动选择或提交低保障方式。固定分享可手动复制定向邀请，仍须指定邮箱重新OTP；当前不创建平台用户，不提供人工身份关联、批注或业务提醒。

以下均为 `POST /prototype-hub/public/shares/{token}/review/{action}`，请求体必须携带本次分享的 `{revisionId,accessKey}`，不放在查询字符串；固定与跟随分享都以本次明确修订为范围，不隐式切换最新内容。

| action       | 额外输入                                        | 响应                                                                   |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `context`    | 无                                              | `{revisionId,enabled,allowUnverified,mailAvailable,csrfToken,session}` |
| `challenges` | `{email,displayName,company?,invitationToken?}` | `{challengeId,expiresAt,resendAfter}`                                  |
| `verify`     | `{challengeId,code}`                            | 同context，成功后轮换Cookie/CSRF                                       |
| `unverified` | `{displayName,company?}`                        | 同context；须显式获准，返回未验证身份                                  |
| `logout`     | 无                                              | `{loggedOut:true}`，随后重新获取匿名context                            |

`session`只含 `{guestId,displayName,company,maskedEmail,verificationLevel,expiresAt}`；verificationLevel仅为email或unverified，低保障maskedEmail为null，邮箱身份只显示脱敏值。前端沿用trim整理姓名和公司；姓名须非空且最多100字符，公司可选且最多200字符。服务端独立校验收到的原始字段，拒绝Unicode控制字符后才strip，不依赖客户端校验。身份和CSRF只留在可信外壳内存，不传到原型iframe、postMessage、资源URL或全局store/localStorage。

接口使用独立同源JSON fetch客户端，浏览器仅向review路径发送HttpOnly、SameSite=Strict的限时Cookie；生产HTTPS默认Secure，不读取Cookie、不附平台令牌，除context外均使用 `X-Review-CSRF`。公开预览客户端继续省略Cookie，原型iframe的opaque sandbox边界不变。反向代理按后端文档设置精确受信Origin，不放宽CORS或全局Cookie策略。

`ORIGIN_DENIED`提示管理员核对可信前端地址，`COOKIE_REQUIRED`提示检查Cookie与HTTPS配置，`CSRF_INVALID`提示重新载入身份验证；与分享撤销/过期分开显示，不因诊断自动发送验证码。缺失、null或其他站点的Origin不受信任，开发代理改写Host也不意味着接受任意Origin或转发头。

验证码为6位ASCII数字、有效5分钟；发送冷却、次数限制及一次性消费由服务端决定。发码不自动重试，网络结果不明确时由用户显式核对再发送；修改邮箱/姓名/公司须重新发码。相同项目邮箱重新OTP找回同一邮箱身份，仍须满足当前分享与密码授权；不按姓名合并。

未验证身份从首次签发起固定8小时；同一有效会话再次提交保留原ID、资料与到期时间，不改名或续期。当前已有有效邮箱身份时申请低保障身份返回409 / `PROTOTYPE_HUB_REVIEW_IDENTITY_EXISTS`，须先显式退出。未验证会话退出、丢失、到期或被撤销后，不能通过姓名、公司、邮箱或OTP找回，也不自动合并进后来验证的邮箱身份。分享配置换代后，重新取得当前分享证明再明确申请可获得另一随机身份，无须依赖清除旧Cookie；旧ID和期限不会恢复，未知会话等级仍拒绝。界面明确提示无自助/人工关联入口，需联系管理员线下处理；新申请是另一个身份。

未验证新建采用独立的项目60次/小时、当前Cookie5次/小时及60秒冷却窗口，有效会话复用不计新建。此限制不识别人或设备；清除Cookie不能绕过项目总量上限。邮箱OTP额度与低保障创建额度分开，状态切换不退还。关闭抽屉清空页面内身份，重开仍从服务器校验Cookie和分享范围；分享变更、停用、撤销、过期或软删均不能靠旧身份绕过。

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
