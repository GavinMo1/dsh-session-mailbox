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

测试目录名不统一，按插件实际目录跑：`session-mailbox` 是 `test/`（单数），`user-model` 是 `tests/`（复数）。

活体验证（不重启）：`plugin_manager` `set_plugin`，`target` 填 `entryId`
（`include:<rowId>`，**不是**包名、**不是** `rowId`），`enabled:false` → `true`。
两次都返回 `application:"applied"` 说明新代码已在跑。

`dsh-hmr` **不会**跟踪 junction 指向的目录，所以改源码后必须走上面这条或重启。

## 提交与版本

- 一次改动一个插件，commit message：`<plugin>: <what changed>`。
- 需要给机器间同步用的点：`git tag <plugin>/v<version>`，推 tag。
- `package.json` 的 `version` 与 tag 保持一致；行为变更升 minor，修 bug 升 patch。
- 交付前读一遍 `plugins/<name>/README.md`，把新行为、已知边界、卸载方式同步进去。

## 宿主 API 要点（从 `app.asar` 里的随包源码核实过）

`resources/app.asar` 里带着与运行时同源的 TypeScript 源码（`node_modules/@deepseek-ai/*/src`），
所以宿主行为可以**读出来**而不是猜。用 `scripts/asar.mjs` 取：

```powershell
node scripts/asar.mjs list "<...>/resources/app.asar" 'dsh-workspace/src/index\.ts'
node scripts/asar.mjs cat  "<...>/resources/app.asar" 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts'
```

下面这些是已经踩过、且改插件时最常要用的（每条都能在源码里按 `file:line` 复核）：

| 服务 | 事实 |
|---|---|
| `workspaceRegistry` | `list()` **同步**返回 `Workspace[]`；`create(path, title?)` 返回 `Workspace` **实体本身**（不是 `{ workspace, created }`），内部 `fs.realpath` 规范化、**同一 canonical 路径幂等复用**；`get(id)`；`delete(id)` 只删登记**不 detach 会话**（会话会丢侧栏分组）；`archiveSession(id, { stopActivity })` / `unarchiveSession` 改的是 `archivedSessionIds` |
| `sessionController` | `create(request)` **只收一个对象参数、没有 signal**；`workspaceId` 与 `cwd` **只能给一个**；attach 失败的错误码是 `session/workspace-attach-failed`，`details.sessionId` 是真会话 id。`prompt(request, signal)` 的 `signal` 是**第二个位置参数**，函数体第一句就是 `signal.throwIfAborted()`；`requestId` **没有任何格式校验**，固定值即幂等 |
| `subagents` | `rootOf(caller)` 有**四条**路径：调用者不是同一个 live 实例 → 抛；resident 且 root 仍 live → 返回 `activation.root`（**可能不是调用者**）；delegated 或 root 不 live → 抛；其余 → 返回调用者自身。所以「没抛 ≠ 顶层」，判定必须比较 id |
| `SessionHeader` | 有 `delegationDepth` 字段（缺省按 0）；**没有**标题字段，标题在 `sessionTitle` 服务里 |

不要把上面任何一条「优化」成更省事的写法——`create()` 的返回值形状、`rootOf` 的返回值、`prompt` 的
signal 位置，三处都试过写错且不会报错。

**读会话日志时的一个坑**：`~/.dsh/sessions/<cwd 编码>/<session-id>/session.v4.jsonl.zstd` 是**多个 zstd 帧
首尾相接**的，不是单个流。`zstdDecompressSync` 只解第一帧（那帧只有 `{"type":"session",...}` 一行），
看起来像「日志是空的」。要按帧切分后逐帧解，才能读到 `user/message` / `assistant/message` / `tool/call` /
`tool/result`。想看某个会话跑过哪些工具时，`~/.dsh/storages/session_projcache/sessions/<id>.json` 里的
`record.rows.contextTimeline.val.toolTally` 更省事。

## 已知的静默失败模式（踩过）

| 症状 | 真因 |
|---|---|
| 插件加载成功但一个工具都没有 | 漏了 `ctx.tools.register(...)` |
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/...` | 裸 import 从 profile 解析，没走 `createRequire(anchor)` |
| 工具报 schema 校验错 | `agent.status` 原值直传，或写了 `undefined` 属性 |
| 改了代码没生效 | `dsh-hmr` 不跟 junction；要 `set_plugin` 开关或重启 |
| `set_plugin` 报 `unknown-plugin` | `target` 填了包名或 `rowId`，应填 `entryId` |
