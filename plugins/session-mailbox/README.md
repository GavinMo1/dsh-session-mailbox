# dsh-session-mailbox

两个 **top-level 会话** 之间互发文本消息。宿主是同一个 DSH Host 进程。

## 工具

| 工具 | 作用 |
|---|---|
| `list_sessions({})` | 列出本进程内其它 top-level 会话：短名 `name`（会话 id 末 8 位）、完整 `id`、**标题 `title`**、`running`/`inactive`、`cwd`。不列自己；**不列已归档的会话**（它们收不到消息）；**子代理调用会报错**（不是返回空数组——空数组会被误读成"这台机器上没有别的会话"）。 |
| `send_session_message({ agent, message })` | 向 `agent` 投一条文本。返回 `{ queued, to, name, statusBefore, primitive, woke }`；回显里写明走了 `followup` 还是 `steer`、以及调用前对端是 `running` 还是 `inactive`——这两者语义差别很大（`steer` 插进对端当前 step，`followup` 给它开新 turn），调用方否则无从判断。`woke: true` 表示这次调用走了**冷路径**（目标原本没装进本进程，是这次调用把它从磁盘装载起来的）。 |
| `rename_session({ agent, title })` | 给另一个 top-level 会话改标题。新标题是**用户来源**的：它会**钉住**该会话，之后的自动标题生成不再覆盖它。**改标题需要已装载的会话**：冷会话先用 `send_session_message` 按完整 id 唤醒，再改。空标题/多行标题拒绝；超长由 session-title 服务的 `maxTitleBytes` 拒绝。自己不能给自己改（那会让「改别人的标题」变成自述）。 |
| `list_workspaces({ workspace? })` | 每行 `<id> | <title> | <path> | sessions: <n>`。给 `workspace`（id 或精确标题）就在该行后追加它的 `session: <id>` 行；标题命中多个报 `ambiguous workspace`，都匹配不上报 `unknown workspace`。**不剔已归档会话**（与 `list_sessions` 的口径不同：那里剔，因为归档的收不到消息；这里报全量账目），归档的那个仍出现在行里。 |
| `create_session({ path?, prompt? })` | 新建一个 top-level 会话并让它进入某个工作区，因此侧栏可见、用户能点进去。返回 `{ sessionId, workspaceId, workspaceTitle, workspacePath, workspaceCreated, prompt }`。 |
| `archive_sessions({ sessionIds, stop? })` | 按 id 归档会话：离开侧栏与工作区分组，但**转录仍在磁盘上**，可用 `unarchiveSession`（或 GUI）恢复。逐 id 独立处理并报告 `{ archived, failed }`；已归档的 id 是 no-op。运行中的会话默认拒绝，除非 `stop: true`（先停它再归档）。**拒绝归档调用者自己**。 |
| `delete_workspaces({ workspaceIds, force? })` | 按 id 删**工作区登记**：目录与所有会话日志都留在磁盘上，工作区离开侧栏。**不 detach**，所以工作区里的会话会丢侧栏分组——还持有会话时默认拒绝，要 `force: true`；持有调用者自己时**即使 force 也拒绝**。逐 id 独立，返回 `{ deleted, skipped, failed }`。 |

`agent` 接受五种写法，按代码里的真实顺序匹配：`name` → 完整 `id` → **完整标题** → id 后缀 → 标题子串。任一步命中多个就报 `ambiguous` 并列出候选，不猜。冷会话（本进程没装载的）**只能按完整 id** 命中——它的标题与短名要靠活会话表，冷态下解析不出来。

冷会话的 id 通常来自 `list_workspaces` 的展开行（那里打 `session: <id>`，**不含标题**）；工作区登记已被删除的会话不在任何展开行里，只能由用户或其他记录提供。

标题来自 `sessionTitle` 服务（`session/title` 事件的折叠值）；`SessionHeader` 本身没有标题字段，所以缺标题时列表显示 `(untitled)`。

空闲目标 → `followup`（开新 turn）；运行中的目标 → `steer`（下一个 step）。

**`queued` 只表示「已进收件箱」，不表示对方读到了。** 要确认到达，请让对方回信。

投递本身（0.9.1 起）走两步，都在返回之前完成：先 `ctx.agents.withoutInitiator(...)` 把这条消息塞进目标收件箱
——目标因此**不会**被记成「发送方这一轮发起的工作」（与 Web UI 发 prompt 同一归因）；再 `await
ctx.sessions.flush(target.session)` 把它**写进持久转录**，所以在目标下一次写入之前重启也丢不了。两步都失败
不致命：`flush` 抛错或该服务未挂载时消息已进收件箱，调用仍报 `queued`（不会假装「没送到」）。

### `rename_session` 的语义

- **用户来源的标题会钉住会话**：`dsh-session-title` 的三个来源里，显式重命名优先级最高，且会阻止后续自动修订。所以改一次就固定，不会被模型再改回去。
- **改标题需要已装载的会话**：标题是 `session/title` 日志事件，要追加就得有活的 `agent.session`，所以实现是 `resolveAgent(id)` → `sessionTitle.rename(agent.session, title)`。但它**不**替你把冷会话装载起来——解析只走活会话表，冷 id 在解析阶段就是 `notfound`（0.8.1 里这条承诺本来就不成立）。要给冷会话改名，先按完整 id 发一条消息把它唤醒。

### 唤醒的代价

`send_session_message` 遇到「本进程没装载」的会话时，会用完整 id 把它从磁盘装载起来（`sessionController.resolveAgent`），再投递。这件事的代价与边界：

- 装载是一次**冷启动**：读持久化转录 → `composeAgent` 解析并 mount agent preset（这一步可能失败，失败走 `internal`）→ publish 一个 Agent。它没有 signal、没有超时。
- 每会话一份，本插件**不提供卸载**，存活到 DSH 重启。
- 被唤醒的会话从此出现在 `list_sessions` 和其它会话的地址簿里（`inactive`），这不是新建会话，只是把旧会话重新装进来。
- 归档会话**拒绝**唤醒（唤醒它只会被 `ArchivedSessionGate` 拦成 blocked 空转）；冷子代理会话拒绝；`writer-held` 表示另一处持有写入权。
- 唤醒成功、统一尾部复查前若目标被归档，会报归档错误，而 Agent 已经驻留内存。

## 收到的那条消息在界面上长什么样（以及为什么容易被忽略）

不是用户气泡。Chat 端的分类在 `dsh-client-ui-chat` 的 `conversation-nodes/message.ts` 里只有一句判据：
`if (event.data.source.kind !== 'user')` —— **只要 source 不是 `user`，这条 `user/message` 就变成 `kind: 'context'`
节点**，渲染成一行折叠的「上下文注入 · `agent-message`」，点开才看到「来自会话 &lt;id&gt;」和正文。行尾那个
producer 标签是 `event-projection.ts` 的 `contextProducer` 直接取 `source.kind`（`agent-message` 没有专门分支，
走 default），所以它显示的是宿主的 kind 名，不是本插件的名字。

这是 Chat 对所有非用户来源的统一处理，和本插件选了哪个 form 无关。**唯一的例外**是：如果这条消息是
**唤醒**一个空闲会话的（而不是插进正在跑的 turn），它会被投影成 `turn-trigger` 节点、走 `TurnTriggerNodeView`，
那是开启新 turn 的醒目行。

### source 用宿主的三键形状，不要自造 kind（0.9.1 修正）

`messageSource()` 返回 `{ kind: 'agent-message', form: 'relay', senderSessionId }`，**三键一个不多一个不少**：

- 宿主 `AgentMessageSource`（`dsh-subagent/src/continuation-messages.ts`）为「一个 agent 发给另一个 agent 的
  消息」定义的就是这三个字段；
- 宿主的会话格式校验 `assertSource()` 有一份 15 个 kind 的白名单，`agent-message` 在表里、**随后按上面三个键
  做严格校验**，多一键少一键都抛 `SessionFormatError`；不在表里的 kind（0.9.0 及以前用的 `session-mailbox`）
  会在迁移时报 `cannot safely transform unclassified message source`。

0.9.0 用私有 kind 换「可在日志里一眼认出是本插件发的」——代价是契约违约，而「可辨认」本来由 `form`/sender
字段就提供了。`senderSessionId` 仍由插件从 `exec.agent.id` 写入，模型伪造不了它。

### 不要为了「显眼」把 form 改成 `notice`

`notice` 是唯一能让折叠行携带 `summary` 的表单（`relay` 的 summary 槽位在 `ContextBody` 里写死为 `null`），
所以改过去确实能让折叠状态读到内容。2026-11-24 试过并**已回退**，原因：

1. **语义错位**：DSH 的 `AgentMessageSource`（`dsh-subagent/src/continuation-messages.ts`）为「一个 agent 发给
   另一个 agent 的消息」定义的正是 `relay`；而 `notice` 被明确注释为「runtime 陈述子 agent 结局」，
   两者在源码里被刻意区分。
2. **有功能损失**：`relay` 有专门的 `RelayBody` 显示「来自会话 X」，`notice` 没有。
3. **治不了根**：折叠行的病根是「非 `user` 来源一律变 context 行」，换 form 只是让那一行多几个字。

真要做出「像子 agent 回复那样醒目的卡片」，得写**客户端插件**去注册/覆盖 `conversation.chat.node` 的 `context` 键
（`ctx.slots.inject('conversation.chat.node', …)`），代价是要新引 client bundle 与 web 构建，并接管所有上下文行的渲染。

## create_session 的语义

- **建在哪**：给 `path` 就交给 `workspaceRegistry.create(path)`——它按 `fs.realpath` 规范化、同一 canonical 路径幂等复用，所以「已存在就复用、不存在就登记」由它保证，代码里不做路径字符串比较。不给 `path` 就落到**调用者自己的**工作区（先按「本会话是否已在某工作区的 `sessionIds` 里」判定，再退回 cwd 相等）。
- **`[created]` / `[reused]`**：只由「调用前后的工作区 id 差集」决定，不看 `create()` 的返回值形状。
- **首条消息**：给了非空白 `prompt` 就走 `sessionController.prompt(..., mode: 'queue')` 真发一轮，**会真的消耗一次模型调用并跑工具**；空白视为没给，不发请求。
- **硬闸**：建完立刻回读该工作区的 `sessionIds`，证明会话此刻确实在里面，否则报 `session not accounted`。
- **不建目录、不删任何东西**：路径非法只报错。

## archive_sessions 的语义

- **归档 ≠ 删除**：走 `workspaceRegistry.archiveSession`，把 id 写进 `archivedSessionIds`。会话的转录、日志目录、工作区账目都不动——`list_sessions` 会因此不再列出它（收不到消息了），侧栏的分组也不再显示它。
- **可逆**：宿主有 `workspaceController.unarchiveSession`，GUI 里也能恢复。**本插件只提供归档方向**，不提供删除，也不提供反归档（反归档是低频操作，留给 GUI/宿主）。
- **不 detach**：归档只改 `archivedSessionIds`，不改工作区的 `sessionIds`，所以 `list_workspaces` 里的 `sessions: <n>` **仍然算上已归档的**。这是有意的：那个 n 是账目大小，不是可见会话数。
- **运行中的会话**默认拒绝（`WorkspaceActiveSessionError`，错误文本会列出是什么活动挡着），`stop: true` 才会先停再归档。
- **拒绝归档调用者自己**：那会把用户正在看的这个会话藏起来。

## delete_workspaces 的语义

- **删登记 ≠ 删目录、≠ 删会话**：走 `workspaceRegistry.delete(id)`，只把工作区那条记录从注册表与顺序里去掉。目录原样留在磁盘上，每个会话的日志目录也原样留着（实测：删完 `%TEMP%` 的工作区后，`C:\Users\27017\AppData\Local\Temp` 仍在，`session-e528255e-…` 的日志目录仍在）。
- **但它会 orphan 会话**：`delete` **不 detach**，所以工作区里的会话仍然存在、仍然能被 `list_sessions` 列出，只是**失去了侧栏分组**。这是唯一不可通过本工具复原的副作用，所以有下面两道闸。
- **闸一：还持有会话就拒绝**，除非 `force: true`。错误文本会列出有多少个、分别是哪些 id。
- **闸二：持有调用者自己就拒绝，`force` 也不能越过**。理由同 `archive_sessions`：不能把用户正在看的东西藏起来。
- **逐 id 独立**，返回 `{ deleted, skipped, failed }`。`skipped` 里区分两种情况：未知 id（注册表侧本来就是幂等 no-op）与撞上闸门（带原因）。
- **不提供反方向**：删掉的登记无法用本工具重建。要重建就用 `create_session({ path })` 让 `workspaceRegistry.create` 重新登记那个目录——但**原工作区的 `sessionIds` 账目不会回来**，这是真损失。

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

## 卸载时不会消失的四条事实

1. 卸载不修改既有转录：旧会话里仍然写着 `Use send_session_message(...)`，而工具已经不存在。
2. `source.kind === 'agent-message'` 的事件不进 `session export`（导出只取 `kind === 'user'`）。改过版：0.9.0 及以前写的是 `'session-mailbox'`。
3. 系统提示词段是每个会话的持久快照，装了就在该会话里留一份，卸载也清不掉。
4. 0.9.0 之前启动的会话保留**旧**提示词快照，不会主动知道「传完整 id 可以装载冷会话」；工具描述是全量的，所以它们仍能在被旧错误打回后读到新能力。

## 已知边界

- 同一 Host 进程内的顶层会话；不同 DSH 实例 / CLI 进程互不可见。
- **未加载的会话按完整 id 可装载投递**（0.9.0 起）：`send_session_message` 会先把它从磁盘装载起来；标题与短名在冷态下解析不出来。装载后的会话会一直留在本进程内存里，直到 DSH 重启。
- 归档会话**收不到**消息（唤醒它只会被 gate 拦成 blocked），也**不允许**被唤醒：校验在装载之前完成。
- 工作区登记已被删除的会话不在任何 `list_workspaces` 展开行里，它的 id 只能由用户或其他记录提供。
- 别名只在本进程当前存活集合内唯一，且随集合变化可能改变长度。
- **标题不是稳定地址**：由 LLM 自动生成、会随新消息重新生成，也可能两个分支同名。所以标题只用于
  「用户说的是哪个」的解析，命中多个一律拒绝；要长期引用请用 `id`。
- 投递不分 workspace；但验收用的 `session_event_search` 要求对端与调用者同 `cwd`。
  （注：`session_event_search` 属于 `@deepseek-ai/dsh-tool-session-query`，用户关掉会话搜索后整个插件的
  工具会消失，调用报 `unknown tool`。`list_sessions` 不依赖它。）
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

## 测试覆盖到哪

`node --test plugins/session-mailbox/test/*.test.mjs`（45 条，0.9.1 起）只覆盖 `lib/` 的纯函数与
投递步骤 `lib/deliver.js`。`index.js` 里的编排靠活体验收，下面这几处**没有自动化覆盖**，改动那里要手动验：

- **`send_session_message` 的冷路径**：装载、准入判定顺序、统一尾部、`woke` 回执都只由活体验收覆盖。
- **投递的真实落盘**：`lib/deliver.js` 的四个用例用的是 fake ctx（`withoutInitiator` / `sessions.flush` 都是
  spy），只证明「包一层、调一次、await 一次」的顺序与容错，不证明真机上 flush 写到了哪。

- **`subagents.rootOf` 抛错的两条路径**：普通子代理的 header 就带 `origin: 'subagent'`，会先在 header
  判定命中，所以真实的 `SubagentError` 分支从未被端到端触发过。`subagentVerdict` 的单测覆盖了
  `allow / subagent / unverifiable` 三态。
- **`gateVerdict` 的 `already-there`**：本工具从不传 `sessionId`，控制器的「复用空白会话」分支走不到，
  只有单测覆盖。
- **错误文案**（`create failed after the session existed:` / `prompt failed:`）没有验收行能让它变红。
- **`delete_workspaces` 的 `failed` 分支**：只有在注册表写失败时才出现，没有构造过。

