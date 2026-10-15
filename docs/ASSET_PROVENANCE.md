# 默认素材与内容来源

本次开源准备移除了原先来源未明确的登录背景、备案装饰图、logo PNG/ICO（备份仅存维护者任务临时目录，不纳源码或发行物）。当前默认图形为本项目新绘制的静态 SVG，不引用外部图片、字体、脚本或远程资源；默认 favicon 复用 logo SVG。

| 素材                                                           | 用途                 | 声明                              |
| -------------------------------------------------------------- | -------------------- | --------------------------------- |
| `src/modules/authentication-manager-ui/assets/logo/logo.svg`   | 默认 logo 与 favicon | 本项目原创贡献，随项目 Apache-2.0 |
| `src/modules/authentication-manager-ui/assets/login/login.svg` | 默认登录背景         | 本项目原创贡献，随项目 Apache-2.0 |

当前素材 SHA256：

- `src/modules/authentication-manager-ui/assets/logo/logo.svg`：`150904ceca34f9c1a9c47654d0066c02bbfaafa96f01704ba5d0c3f321a165da`
- `src/modules/authentication-manager-ui/assets/login/login.svg`：`6943db961ae1bc9fe18d1c3058068ddbe1ad0f46f53388f6f0af30095b480578`

备案区仅展示已配置的文字和原链接，不附带第三方备案徽章。服务端自定义品牌图片覆盖机制保持；上传者/部署者应确保该内容有使用和分发权，项目许可证不自动覆盖其图片、商标或客户原型。

菜单图标通过公开 `@ant-design/icons-vue` 依赖使用，其版权和许可随第三方声明保留。项目截图使用当前可分发、脱敏样本后才能公开；历史内部截图、追踪和审计原始数据不纳默认源码导出。

素材说明只确认本次新增默认图形的来源与公开选择，不代表所有历史参考实现、用户内容或品牌权利均已审查。第三方与项目商标不得由 Apache-2.0 的代码许可推导为已获商标授权。
