# 部署与浏览器边界

README保留Docker、Nginx和子路径配置示例。构建时 `VITE_*` 决定静态产物配置；容器启动时 `API_BASE_PATH`/`SERVER_NAME` 决定Nginx上游与站点名，不能混用。`pnpm preview`用于本地检查，不替代正式Web服务。

## 本地镜像与 Compose

先运行 `pnpm install --frozen-lockfile` 和 `pnpm build`。`Dockerfile` 只打包已生成的 `dist/`；`build.sh` 也可依次构建前端和镜像，镜像名通过 `FRONTEND_IMAGE` 设置，默认 `proto-bridge-ui:local`，不会自动推送。

```bash
export API_BASE_PATH=http://host.docker.internal:8845/
export SERVER_NAME=proto.example.com
docker compose config --quiet
docker compose up -d --build
```

Compose 不依赖外部命名网络，提供宿主机网关映射。上例适用于宿主机发布的配套后端 Compose 端口；本地 JAR 默认 `8080`，应按实际环境设置上游。另一个 Docker 网络内的后端需共享网络或改为实际可达地址。`API_BASE_PATH` 必须显式非空且使用 HTTP(S)；容器自己的 `127.0.0.1` 不能指代宿主机。

## 部署验收

生产使用HTTPS，保留history回退，正确处理`/api`前缀与上游末尾斜杠，上传限额与后端一致。容器里的localhost指自身，后端地址使用共享网络服务名或实际外部地址。前端静态目录不保存业务数据库，备份由后端和基础设施负责。

恢复验收应同时检查备份前的评审身份、邀请、文字线程及相关回执是否保留原归属、期限和撤销状态，公开页面不能显示内部备注及其数量、时间或版本变化。前端静态目录或浏览器存储不能代替后端九张评审表、数据库回执、配置密钥和文件的联合备份；恢复后仍使用精确受信Origin及原Cookie路径，不通过放宽CORS或延长身份期限兼容旧授权。

配套独立进程工具先检查备份前数据在新数据库与新文件根中的持久性，再用恢复后的JAR和实际前端进行浏览器联验。浏览器新建邀请、通过本地验证码并提交文字反馈，只证明该恢复服务的功能可用；不能单独作为原数据恢复成功的依据。自动化仅使用隔离本地SMTP，不向真实邮箱发送测试邮件；完整恢复结论取决于本次进程报告，不能据此承诺外部邮件服务、其他浏览器或目标生产部署已验。

原型资源保留sandbox隔离，由后端设置所需CORS；不要为修复模块加载而给全站重复增加通配CORS头或allow-same-origin。部署候选应实际验证模块/Fetch资源、分享、Inspect与复杂原型支持范围。

Nginx 仅对 `/api/prototype-hub/runtime/{versionId}/{previewKey}/...` 和 `/api/prototype-hub/public/shares/{token}/{accessKey}/runtime/...` 两类原型运行资源省略自身添加的 `X-Frame-Options`，避免 `SAMEORIGIN` 阻止沙箱中的嵌套页面；平台页面和管理 API 继续使用 `SAMEORIGIN`。外层网关或 CDN 也应沿用此边界，保留后端的 CSP sandbox 响应头；该调整不解除 Axure 原生父子页面 DOM 访问限制。

日志避免记录完整分享/预览URL、请求认证头和Referer中的密钥；审查Nginx/CDN/错误日志。默认素材和页面截图不构成客户内容公开许可，安全问题私密提交。

浏览器功能依赖ES Modules、localStorage、postMessage、Blob和Canvas等。跨浏览器/移动兼容以实际版本回归为准，不自动承诺完整矩阵。见[发布指南](RELEASE.md)。
