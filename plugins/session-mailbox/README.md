# dsh-session-mailbox

两个 **top-level 会话** 之间互发文本消息。宿主是同一个 DSH Host 进程。

## 工具

| 工具 | 作用 |
|---|---|
| `list_sessions({})` | 列出本进程内其它 top-level 会话：短名 `name`（会话 id 末 8 位）、完整 `id`、**标题 `title`**、`running`/`inactive`、`cwd`。不列自己；**不列已归档的会话**（它们收不到消息）；子代理内部调用返回空数组。 |
| `send_session_message({ agent, message })` | 向 `agent` 投一条文本。返回 `{ queued, to, name, statusBefore, primitive }`。 |
| `list_workspaces({ workspace? })` | 每行 `<id> | <title> | <path> | sessions: <n>`。给 `workspace`（id 或精确标题）就在该行后追加它的 `session: <id>` 行；标题命中多个报 `ambiguous workspace`，都匹配不上报 `unknown workspace`。**不剔已归档会话**（与 `list_sessions` 的口径不同：那里剔，因为归档的收不到消息；这里报全量账目），归档的那个仍出现在行里。 |
| `create_session({ path?, prompt? })` | 新建一个 top-level 会话并让它进入某个工作区，因此侧栏可见、用户能点进去。返回 `{ sessionId, workspaceId, workspaceTitle, workspacePath, workspaceCreated, prompt }`。 |

`agent` 接受四种写法，按顺序匹配：**完整标题** → `name` → 完整 `id` → id 后缀 → 标题子串。任一步命中多个就报 `ambiguous` 并列出候选，不猜。

标题来自 `sessionTitle` 服务（`session/title` 事件的折叠值）；`SessionHeader` 本身没有标题字段，所以缺标题时列表显示 `(untitled)`。

空闲目标 → `followup`（开新 turn）；运行中的目标 → `steer`（下一个 step）。

**`queued` 只表示「已进收件箱」，不表示对方读到了。** 要确认到达，请让对方回信。

## create_session 的语义

- **建在哪**：给 `path` 就交给 `workspaceRegistry.create(path)`——它按 `fs.realpath` 规范化、同一 canonical 路径幂等复用，所以「已存在就复用、不存在就登记」由它保证，代码里不做路径字符串比较。不给 `path` 就落到**调用者自己的**工作区（先按「本会话是否已在某工作区的 `sessionIds` 里」判定，再退回 cwd 相等）。
- **`[created]` / `[reused]`**：只由「调用前后的工作区 id 差集」决定，不看 `create()` 的返回值形状。
- **首条消息**：给了非空白 `prompt` 就走 `sessionController.prompt(..., mode: 'queue')` 真发一轮，**会真的消耗一次模型调用并跑工具**；空白视为没给，不发请求。
- **硬闸**：建完立刻回读该工作区的 `sessionIds`，证明会话此刻确实在里面，否则报 `session not accounted`。
- **不建目录、不删任何东西**：路径非法只报错。

## 配置

```yaml
# profile 的 cordis.patch.yml 里，本插件条目下的 config
allow: []          # 省略 = 全部放行；[] = 全拒；[<session id>, ...] = 白名单
maxBytes: 65536    # 单条消息 UTF-8 字节上限
```

## 安装

profile `package.json` 里加依赖与 bundle 条目，然后 `pnpm --dir <profile> install`，重启 DSH。

## 卸载

主路径：从 `dsh.profile.bundles` 与 `dependencies` 各删一行 →
`pnpm --dir <profile> install` → 重启 → `list_bundles` 里应**没有** `name === 'dsh-session-mailbox'`
的行。**只把 `enabled` 关掉不算卸载**：`enabled` 与 `installed` 是两个字段。

次路径：`plugin_manager` 的 `remove_bundle`。本 profile 有 `hmr`，走活体分支：先改写 manifest 并
`reload()`，再检查是否还有活着的 loader entry，有则抛 `bundle-in-use`。收到 `bundle-in-use`
表示「manifest 已改、包未删」，重启后不再加载，再用 `pnpm remove dsh-session-mailbox` 收尾并
核对 `pnpm-lock.yaml` 首行仍是 `lockfileVersion: '9.0'`。

## 三条卸载时不会消失的事实

1. 卸载不修改既有转录：旧会话里仍然写着 `Use send_session_message(...)`，而工具已经不存在。
2. `source.kind === 'session-mailbox'` 的事件不进 `session export`（导出只取 `kind === 'user'`）。
3. 系统提示词段是每个会话的持久快照，装了就在该会话里留一份，卸载也清不掉。

## 已知边界

- 同一 Host 进程内的顶层会话；不同 DSH 实例 / CLI 进程互不可见；未加载（冷）会话收不到。
- 别名只在本进程当前存活集合内唯一，且随集合变化可能改变长度。
- **标题不是稳定地址**：由 LLM 自动生成、会随新消息重新生成，也可能两个分支同名。所以标题只用于
  「用户说的是哪个」的解析，命中多个一律拒绝；要长期引用请用 `id`。
- 投递不分 workspace；但验收用的 `session_event_search` 要求对端与调用者同 `cwd`。
- 维护期（compaction 等）的 `agent.status` 仍报 `idle`，因此会被报成 `inactive`。
- 目标 turn 被取消或归档时消息可能丢失：用户按 Stop 保留；运行中被归档会被销毁；空闲归档则保留但被 gate 拦住。
- **不承诺「不能借权限」可被强制**：消息里没有任何可表达权限的字段，但对端在自己的权限下执行对端的请求，
  这是提示词层面的约束，不是机制拦截。
- **`create_session` 建的会话不会被自动清理**：误建只能由用户在 GUI 里删，插件不提供删除。
- **`create_session` 子代理不可用**：header 自报子代理、或 `subagents.rootOf` 指向别的 agent 时一律拒绝。
  该服务取不到时也是拒绝（报 `cannot verify ...`），不是放行。
- **`create_session` 不声明并发安全**：两个并发调用共用同一份「调用前 id 快照」，后一个可能把已有工作区
  报成 `[created]`。方向无害。
- **别名拼写的 path 可能与输入不同**：返回的 `workspacePath` 是 `fs.realpath` 后的规范值，比较一律先规范化。

