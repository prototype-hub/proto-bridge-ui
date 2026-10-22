# 默认素材与内容来源

当前默认素材使用维护者在本地提供的 PNG，以下 SHA256 对应提交的原始字节；默认 favicon 复用 logo PNG。图片通过本地静态资源加载，不依赖外部图片服务。此处记录文件来源和用途，不将维护者提供等同于原创证明或第三方图片、商标的使用授权。

| 素材                                                           | 用途                 | 来源                 |
| -------------------------------------------------------------- | -------------------- | -------------------- |
| `src/modules/authentication-manager-ui/assets/logo/logo.png`   | 默认 logo 与 favicon | 维护者提供的本地文件 |
| `src/modules/authentication-manager-ui/assets/login/login.png` | 默认登录背景         | 维护者提供的本地文件 |

当前素材 SHA256：

- `src/modules/authentication-manager-ui/assets/logo/logo.png`：`b34bb192ec5d9828ffa7b1b68b357fcbd9c5a1a8026a08ce2b793e7458739763`
- `src/modules/authentication-manager-ui/assets/login/login.png`：`7b4066ff4e8efd5b683d7cd30e22b099c6d0688e681f3adfe35e8ef3c84ac20d`

此前 Git 提交 `5656d9b` 中的 logo/login SVG 声明为本项目原创 Apache-2.0 贡献；该声明仅对应历史 SVG，不适用于本次替换的 PNG。历史文件可从 Git 追溯，当前默认资源已不再引用它们。

备案区仅展示已配置的文字和原链接，不附带第三方备案徽章。服务端自定义品牌图片覆盖机制保持；上传者/部署者应确保该内容有使用和分发权，项目许可证不自动覆盖其图片、商标或客户原型。

菜单图标通过公开 `@ant-design/icons-vue` 依赖使用，其版权和许可随第三方声明保留。项目截图使用当前可分发、脱敏样本后才能公开；历史内部截图、追踪和审计原始数据不纳默认源码导出。

素材说明仅记录当前默认图片的文件来源和历史变更，不代表所有图片、历史参考实现、用户内容或品牌权利均已审查。第三方与项目商标不得由 Apache-2.0 的代码许可推导为已获商标授权。
