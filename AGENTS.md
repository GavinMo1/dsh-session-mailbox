# AGENTS.md — 给在这个仓库里干活的 Agent

私有 DSH 插件 monorepo。这里的东西会装进真机 profile，**改坏了会让用户的 DSH 起不来**。

## 硬规则

1. **不要直接改用户的 profile**（`%USERPROFILE%\.dsh\profiles\<name>\`）。接线和升级走
   `scripts/link-plugins.mjs`，它自己会备份。确需手改时，先报出绝对路径等一句确认。
2. **不要 `rm` / `del` / `Remove-Item`**。要删就移到回收站：
   `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(path, OnlyErrorDialogs, SendToRecycleBin)`。
3. **不要引入运行时依赖**。`lib/` 下的纯逻辑只允许 `node:` 内置；测试只允许 `node:test` +
   `node:assert`。这是多个机器直接 `link:` 的前提 —— 没有 node_modules 可解析。
4. **不要碰 `@deepseek-ai/*` 的源码**（`app.asar`）。只用公开的 Cordis 服务与工具 API。

## 写 DSH 插件时必须守住的四件事

1. **锚点用 profile 上下文**：
   ```js
   const fromProfile = ctx.get('profileContext')?.installAnchor
   ```
   `process.env.DSH_INSTALL_DIR` 在 Host 进程里不存在（它是每次工具执行注入的 shell 变量），
   只能当回退。宿主包一律 `createRequire(anchor)('@deepseek-ai/dsh-tools')`，裸 import 从
   profile 解析不到。
2. **`defineTool({...})` 只是定义，必须 `ctx.tools.register(defineTool({...}))`**。漏了注册，
   插件会正常加载、零工具、加载器不报错。
3. **`apply(ctx, config = {})` 必须同步、必须导出**。HMR 重建时会在新 fiber 里再跑一次，
   所以别写依赖单例状态的初始化。
4. **schema 与真实值必须对齐**：`agent.status` 只有 `'idle' | 'running'`，而页面语义是
   `'running' | 'inactive'`，必须经映射函数转换；`undefined` 属性违反 lossless JSON，缺省时
   **删键**而不是写 `undefined`；`z.array(...)` 会把 `undefined` 压成 `[]`，三态配置要用
   `.default(undefined)` 并显式比较。

## 改完必须做的验证

```powershell
node --test plugins/<name>/test/*.test.mjs   # 每个 CASE 都要有 console.log('CASE <name>')
node --check plugins/<name>/index.js
```

活体验证（不重启）：`plugin_manager` `set_plugin`，`target` 填 `entryId`
（`include:<rowId>`，**不是**包名、**不是** `rowId`），`enabled:false` → `true`。
两次都返回 `application:"applied"` 说明新代码已在跑。

`dsh-hmr` **不会**跟踪 junction 指向的目录，所以改源码后必须走上面这条或重启。

## 提交与版本

- 一次改动一个插件，commit message：`<plugin>: <what changed>`。
- 需要给机器间同步用的点：`git tag <plugin>/v<version>`，推 tag。
- `package.json` 的 `version` 与 tag 保持一致；行为变更升 minor，修 bug 升 patch。
- 交付前读一遍 `plugins/<name>/README.md`，把新行为、已知边界、卸载方式同步进去。

## 已知的静默失败模式（踩过）

| 症状 | 真因 |
|---|---|
| 插件加载成功但一个工具都没有 | 漏了 `ctx.tools.register(...)` |
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/...` | 裸 import 从 profile 解析，没走 `createRequire(anchor)` |
| 工具报 schema 校验错 | `agent.status` 原值直传，或写了 `undefined` 属性 |
| 改了代码没生效 | `dsh-hmr` 不跟 junction；要 `set_plugin` 开关或重启 |
| `set_plugin` 报 `unknown-plugin` | `target` 填了包名或 `rowId`，应填 `entryId` |
