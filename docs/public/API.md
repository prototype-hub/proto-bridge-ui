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

项目和版本的 `DELETE` 为软删除：正常列表、分页总数和使用额排除已删除记录，删除后释放相应使用额，保留原资源 ID、修订、文件、分享及创建请求记录；不改变购买额度、项目绑定或安装标识。项目仍有活动版本时返回 409，须先删除其全部活动版本。项目列表与详情提供回收站切换，按当前授权显示已删除项目或版本。删除记录持续保留，不自动过期或物理清理；不提供永久删除入口。

已删除项目或版本的详情、成员、上传、修订、页面、分享管理、新内部预览授权和公开分享均返回 404；此前签发的内部 runtime 地址继续遵循 403 拒绝语义。原公开分享及其旧资源授权不可再次使用，管理员也不能通过普通接口绕过删除状态。相同名称新建资源会产生新 ID，不能使旧预览或分享复活；资源仍被删除时，保留的创建请求键重放返回 409。删除响应为 404 时，界面重读列表和用量并保留真实错误，不自动重试删除。撤销只作用于后续请求，无法撤回已经下载或渲染的内容。

项目创建 `POST /prototype-hub/projects` 和版本上传 `POST /prototype-hub/projects/{projectId}/versions` 发送 `Idempotency-Key`。同一弹窗内、输入及所选文件不变的失败重试沿用原键；输入或所选文件改变、关闭后重新打开时生成新键，不自动重试 POST。后端将键绑定用户、动作和项目，并校验元数据与 ZIP 字节摘要；同键同内容返回首次创建的同一资源，同键异内容或资源已删除返回 409。上传新修订使用 `PUT /prototype-hub/versions/{id}`，不新增版本占用；并发冲突返回 409 `PROTOTYPE_HUB_VERSION_CONFLICT`，页面提示刷新确认，不自动覆盖。独立客户端可省略请求键，但不保证 POST 幂等；提供时须为 1–128 个可打印 ASCII 非空白字符。

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

项目和版本响应增加 `deletedTime`：活动资源为 `null`，回收记录为删除时间戳。回收站复用当前分页、名称筛选及排序规则，普通查询始终排除删除记录。仅看得到项目不等于可以恢复它。

恢复会原子重验当前权限、父项目状态和当前容量，重新占用一个相应名额。已活动资源、容量不足等冲突返回 409，回收记录和引用不变；缺失或不可见资源遵守原 404/403 边界。界面不乐观移除记录，不自动重试；404 会刷新当前列表与用量，同时保留真实错误。恢复项目后须进入项目回收站逐个恢复版本。

旧分享保持永久撤销，旧内部预览凭证不复活。恢复后可按当前权限重新授权预览或创建新分享。恢复保留创建请求记录，原请求键在重新核验当前授权后可以返回恢复的同一 ID，不能重复占用额度。恢复按钮与普通保存权限共同生效；前端提示不替代服务端校验。
