# dsh-plugins

DeepSeek Harness（DSH）插件，私有 monorepo。多个插件放在同一个仓库里，每台机器 clone 一次，
profile 用 `link:` 指向 clone 里的目录。

## 为什么是 `link:` 而不是 git 依赖

`link:` 让 profile 直接用 clone 的工作区目录，于是**升级 = `git pull` + 重载**：
不需要 `pnpm install`、不需要改 spec 里的版本号、不需要重新打 tag。代价是版本由 clone 的
HEAD 决定而不是 lockfile —— 回滚就 `git checkout <tag>`。

## 目录

```
plugins/
  <plugin-name>/          # 一个目录 = 一个 npm 包 = 一个 DSH bundle
    package.json          # 必须含 "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
    cordis.patch.yml
    index.js              # DSH plugin 入口，导出 name / inject / Config / apply
    lib/                  # 纯逻辑，零依赖
    test/                 # node --test，零依赖
    README.md
scripts/
  link-plugins.mjs        # 把本仓库所有插件接到某个 profile 上（幂等）
```

## 新机器接线

```powershell
git clone git@github.com:GavinMo1/dsh-plugins.git C:\Users\<user>\Documents\dsh-plugins
cd C:\Users\<user>\Documents\dsh-plugins
node scripts/link-plugins.mjs --dry-run     # 先看它要改什么
node scripts/link-plugins.mjs --apply       # 备份 profile 的 package.json，改写，然后 pnpm install
```

然后重启 DSH。`link:` 路径写的是本机绝对路径，所以每台机器各自跑一次这个脚本，`package.json`
不进版本控制也不影响一致性。

## 升级

```powershell
cd C:\Users\<user>\Documents\dsh-plugins
git pull
```

再重载插件即可。**不需要** `pnpm install`（`link:` 直接读工作区文件）。

重载方式，二选一：

- 重启 DSH；
- 不重启：`plugin_manager` 的 `set_plugin`，`target` 填 bundle 行里的 **`entryId`**
  （形如 `include:session-mailbox`，不是包名、不是 `rowId`），先 `enabled:false` 再
  `enabled:true`，两次都返回 `application:"applied"` 就是重建了这个 fiber。

**注意**：`dsh-hmr` 不跟踪 junction 指向的目录，所以改了插件源码**不会**自动热重载，
必须走上面两条之一。

## 回滚某个插件

```powershell
git log --oneline -- plugins/session-mailbox
git checkout <commit-or-tag> -- plugins/session-mailbox
```

再重载。装错版本时比改 manifest 快。

## 加新插件

1. `plugins/<name>/` 照现有结构建（`package.json` 的 `name` 用 `dsh-<name>`，含 `dsh.bundle.patch`）。
2. `node scripts/link-plugins.mjs --dry-run` 确认它被扫到。
3. `--apply` + 重载。
4. 打 tag：`git tag <plugin-name>/v<version>`，`git push --tags`。

## 已知约束

- **`peerDependencies` 警告可无视**：pnpm 会警告「linked dependency 不会从目标 node_modules 解析
  peer dependencies」。这些插件用 `createRequire(<install anchor>)` 从 DSH **安装目录**取
  `@deepseek-ai/*`，不走 profile 的 node_modules。
- **锚点必须是 `ctx.get('profileContext').installAnchor`**。`process.env.DSH_INSTALL_DIR` 是每次
  工具执行注入的 shell 变量，Host 进程里**没有**它。别把它「优化」回去。
- 插件名与 bundle 名一致（`dsh-<name>`），`dsh.profile.bundles` 里写包名。
