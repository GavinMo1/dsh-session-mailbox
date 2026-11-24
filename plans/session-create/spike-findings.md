# Spike — 会话 / 工作区 能不能由插件创建

2026-11-24，一次性临时插件 `dsh-spike-session-create` 实测，跑完即拆。本文件是这次 spike 的结论，供以后写方案时直接用。

## 结论：能，代价很小

`sessionController.create` 就是 GUI「新建会话」走的那条路，插件在进程内直接调得到。

```js
const controller = ctx.get('sessionController')
const { sessionId, agentPreset } = await controller.create({ workspaceId })  // 或 { cwd }
```

`SessionCreateRequest`：`{ workspaceId?, cwd?, sessionId?, agentPreset? }`
`SessionCreateValue`：`{ sessionId, agentPreset? }`

**`workspaceId` 与 `cwd` 只能给一个**，两个都给会抛 `RemoteError: session.create accepts workspaceId or cwd, not both`。

## 四个必须先回答的问题，实测答案

| 问题 | 答案 | 证据 |
|---|---|---|
| 会出现在侧栏吗 | 会 | 会话被写进工作区记录的 `sessionIds`（42→43→44→45），且出现在 `sessionController.list()` 里 |
| 用户能进去打字吗 | 能 | 列表行 `blank: true`、`agentAvailable: true`、`cwd` 继承工作区，和 GUI 新建的会话没有区别 |
| 插件重载后还在吗 | 在 | 用 A 次加载创建的 `session-37f0a7ae-…`，在插件关掉再开（B 次加载）后仍 `stillListed: true` / `agentAvailable: true` |
| 能自动发第一条消息吗 | 契约上能，未实测 | `sessionController.prompt({ requestId, sessionId, mode: 'queue', content })`，与 GUI 发消息同一个调用 |

## 一条走不通的路（省得以后重试）

- `ctx.agents.create({ sessionId, meta: { cwd } })` 能造出 live agent，`agents.get()` 也查得到，**但不会计入任何工作区**。工作区记录的 `sessionIds` 不含它，所以它不会出现在侧栏。
- 补一个 `workspaceController.insertSessionBefore({ workspaceId, sessionId })` 也不行，直接抛：
  `cannot move session '…' in workspace '…': the session is not accounted`
  它的语义是「在已计入的会话之间调整顺序」，不是「把一个会话加进工作区」。

结论：**创建必须走 `sessionController.create`**，`agents.create` + 手工补工作区这条路是死的。

## 工作区

```js
await ctx.workspaceRegistry.create(path, title?)          // 直接注册一个工作区
await ctx.workspaceRegistry.resolveByPath(path)          // 先查有没有
await ctx.get('workspaceController').create({ path })     // GUI 走的同一个入口，幂等，返回 { workspace, created }
```

工作区不需要 spike 验证：`create` 只登记一条记录，没有会话那种「accounted」的额外关口。

## 遗留

- spike 在 `default-workspace` 里留下了 3 个空白会话（`session-39db6e36…`、`session-37f0a7ae…`、`session-6dfc4d55…`）。
- 另有 2 个用 `agents.create` 造的会话（`30b34fe3…`、`e8c4288b…`、`session-8da2cdd9…`）从未计入工作区，侧栏里看不到。
