# mailbox-wake v1（Work Plan）

本方案自足。实现方只读本文件，不读评审记录。版本 v1，round 1 冻结文本。

强度词只有五个：**必须**（硬闸）、**不得**（禁止）、**默认**（可偏离，偏离要写进交付报告）、**可**（可选）、**只能**（唯一做法）。

## 1. 用户要什么（原话）

> 发消息时如果目标不是活会话，就用它的 session id 把它唤醒，然后再投递。

范围：只改 `send_session_message` 的投递路径。`list_sessions` / `list_workspaces` / `create_session` / `archive_sessions` / `delete_workspaces` 的语义不动。

## 2. Core Task 与失败症状

**Core Task**：`send_session_message` 的目标是本进程未加载（冷）的 top-level 会话、且调用方给出它的完整 session id 时，工具唤醒该会话、把消息投进它的收件箱，并在返回里标记发生了唤醒。

**失败症状**（任一条成立即判 Core Task 未达成）：

1. 调用抛 `no live top-level session matches ...`，没有尝试唤醒。
2. 投递返回成功，但 `woke` 字段缺失、或为 `false`。
3. 返回 `woke: true`，但目标的转录里没有这条消息，或没有因此开始一个 turn。

## 3. 开始指令

先做 Step 0，之后按 Step 1 → 6 的顺序做。每一步都在上一步的完成判据变绿之后才开始。

| Step | 一句话 | 卡住时 |
|---|---|---|
| 0 | 通读三个文件，备份待改文件 | 停下问 |
| 1 | `lib/pure.js` 加两个纯函数 | 停下问 |
| 2 | `index.js` 改投递顺序 | 停下问 |
| 3 | `index.js` 改输出 schema 与 render | 停下问 |
| 4 | 工具描述、系统提示词、README、版本号 | 默认继续 |
| 5 | 跑完整验收表 | 停下问 |
| 6 | 提交、打 tag、推送 | 停下问 |

**Step 0 · 准备**
读 `plugins/session-mailbox/index.js` 全文、`plugins/session-mailbox/lib/pure.js`、`plugins/session-mailbox/test/pure.test.mjs`、`plugins/session-mailbox/README.md`。
把将要修改的 `index.js`、`lib/pure.js`、`test/pure.test.mjs`、`README.md`、`package.json` 各复制一份到 `backups/mailbox-wake-<yyyyMMdd-HHmmss>/`（保持原相对路径）。
完成判据：`Get-ChildItem backups/mailbox-wake-*/ -Recurse -File` 列出 5 个文件。

**Step 1 · 纯逻辑**
在 `lib/pure.js` 里新增并导出两个函数，只许用 `node:` 内置（本步不需要任何 import）。

- `wakeFailureVerdict(error)`：输入是 `sessionController.resolveAgent` 返回的 `{ error }` 里那个错误对象。返回 `{ ok: false, reason, detail }`，`reason` 取值只能是 `'not-found' | 'subagent' | 'writer-held' | 'internal'`。映射见 §4 S1。
- `coldTargetName(id)`：返回 `String(id).slice(-8)`。

完成判据：`node --check plugins/session-mailbox/lib/pure.js` 退出码 0；`node --test plugins/session-mailbox/test/pure.test.mjs` 退出码 0（此时新 CASE 还没写，旧 34 条仍绿）。

**Step 2 · 编排**
按 §4 S2 的六段顺序改 `send_session_message` 的 `execute`。
完成判据：`node --check plugins/session-mailbox/index.js` 退出码 0，且 `Select-String -Path plugins/session-mailbox/index.js -Pattern 'decideDelivery|resolveAgent'` 的行号显示 `decideDelivery` 那一处出现在 `resolveAgent` 之前。

**Step 3 · 输出契约**
按 §4 S3 加 `woke` 字段与 render 尾句。
完成判据：`node --check plugins/session-mailbox/index.js` 退出码 0；`Select-String -Path plugins/session-mailbox/index.js -Pattern 'woke'` 至少命中 schema、render、execute 三处。

**Step 4 · 文档与版本**
按 §4 S4 改工具描述、`MAILBOX_PROMPT`、README、`package.json` 版本。
完成判据：`Select-String -Path plugins/session-mailbox/index.js,plugins/session-mailbox/README.md -Pattern 'loaded in this process|未加载（冷）会话收不到'` 命中 0 行。

**Step 5 · 验收**
跑完 §6 全表，每一行的退出码与消息集合都对上。
完成判据：§6 九行全绿。

**Step 6 · 交付**
`git add` 本插件目录与 `plans/mailbox-wake/`；commit message `session-mailbox: wake a cold session by id before delivering`；`package.json` 的 `version` 与 tag 都是 `0.9.0`；`git tag session-mailbox/v0.9.0`；`git push` 与 `git push origin session-mailbox/v0.9.0`。
完成判据：`git status --short` 为空；`git ls-remote --tags origin` 里有 `session-mailbox/v0.9.0`。

## 4. Steps 的细节

### S1 `lib/pure.js :: wakeFailureVerdict`

按 `error.code` 与 `error.details` 判定，判定顺序如下，先命中先返回：

| 条件 | reason |
|---|---|
| `code === 'session/not-found'` | `not-found` |
| `code === 'session/agent-busy'` 且 `String(details?.reason ?? '')` 含 `subagent` | `subagent` |
| `code === 'session/agent-busy'`（其余） | `subagent` |
| `code === 'session/writer-held'` | `writer-held` |
| 其余（含 `code` 缺失、`error` 不是对象） | `internal` |

`detail` 取 `String(error?.message ?? '')`。`ok` 恒为 `false`。不要在这里拼用户文案（文案在 S2）。

### S2 `index.js :: send_session_message.execute` 的六段顺序

1. **前置守卫**原样不动：`exec.agent === undefined` 报错；`exec.agent.session.header.origin === 'subagent'` 报错；`pure.validateMessage` 三条错误原样。
2. **活会话解析**原样不动：`const found = pure.resolveTarget(rows(), args.agent, String(exec.agent.id))`。`found.ok === true` 时走现有路径直到函数返回，这一段（白名单、`ctx.agents.get`、归档读、`statusBefore`、`followup`/`steer`、返回值）除 S3 的 `woke` 外一字不改，`woke` 取 `false`。
3. **三种拒绝原样不动**：`found.reason` 是 `'empty'` / `'self'` / `'ambiguous'` 时报原有错误，不得进入唤醒路径。
4. **唤醒路径**只在 `found.reason === 'notfound'` 时进入，顺序固定：
   1. `const q = String(args.agent).trim()`。
   2. `const gate = pure.decideDelivery(config.allow, q)`；`gate.ok !== true` 时按现有两条白名单错误原文报错，**不得**唤醒。
   3. 读 `ctx.workspaceRegistry.archivedSessionIds`；读失败或不是数组时报 `cannot verify the archived state of <q>; refusing to deliver`；`archived.map(String).includes(q)` 为真时报 `target session is archived; unarchive it before messaging`。
   4. `const controller = ctx.get('sessionController')`；`undefined` 时报 `send_session_message cannot wake a cold session: the sessionController service is unavailable`。
   5. `const result = await controller.resolveAgent(q)`。**不得**传第二个参数，**不得**包 `Promise.race` 或自建超时。
   6. `result` 里有 `error` 键时用 `pure.wakeFailureVerdict(result.error)` 映射成错误并抛出，文案逐字如下：
      - `not-found` → `no session matches "<q>": nothing live in this process, and no transcript is stored under that id`
      - `subagent` → `session "<q>" belongs to subagent routing; use send_message`
      - `writer-held` → `session "<q>" is held by another writer; retry after it finishes`
      - `internal` → `cannot wake session "<q>": <detail>`
   7. 成功时令 `target = result.agent`、`woke = true`、`entry = { id: String(target.id), name: pure.coldTargetName(target.id) }`。**不得**再调一次 `ctx.agents.get`。
5. **统一尾部**：`target.session.header.origin === 'subagent'` 时报 `send_session_message addresses top-level sessions only`；随后 `statusBefore = pure.pageStatus(target.status)`、`primitive = pure.primitiveFor(target.status)`、`createUserMessage(...)`、`followup`/`steer`，与现有代码同文。
6. **返回值**：现有五个字段原样，加 `woke`（见 S3）。唤醒路径的 `statusBefore` 默认是 `'inactive'`、`primitive` 默认是 `'followup'`（新唤醒的 agent 就是 idle），**不得**为唤醒路径特判这两个字段。

兼容：`no live top-level session matches ...` 这条错误文本从此不再出现在 `index.js`。这是有意的，README 与工具描述在 Step 4 同步。
失败处理：唤醒是同步可等待的一次磁盘读；`followup` 抛错时按现有行为向上抛，不捕获。

### S3 `index.js :: send_session_message` 的输出契约

- `output.schema.properties` 增加 `woke: { type: 'boolean', required: true }`。现有五个字段的名字、类型、required 一律不动。
- `render` 的文本改成两段拼接，第一段一字不改：`message queued to session <name> (<to>) via <primitive>; the target was <statusBefore> before the call`；`woke === true` 时追加 `; the session was woken from disk for this call`。
- `execute` 的两个返回点都带上 `woke`。

### S4 文档与版本

- `send_session_message` 的 `description`：保留现有全文，追加一句：`A target that is not loaded in this process is woke from disk when `agent` is the full session id; a cold session's title or short name cannot be resolved, so pass its id (list_workspaces prints it).`
- `MAILBOX_PROMPT`（`index.js` 顶部数组）追加一行：`A peer that is not loaded in this process (a cold session) can still receive a message: pass its full session id and the tool wakes it from disk first. Its title and short name do not resolve while it is cold; `list_workspaces` prints session ids.`
- README：
  - 工具表 `send_session_message` 行补 `woke` 与唤醒语义。
  - `agent` 四种写法的段落补一条：冷会话只能按**完整 id** 命中；标题与短名只覆盖活会话。
  - 「已知边界」里 `未加载（冷）会话收不到` 改成新语义：冷会话按 id 可唤醒投递，唤醒后它保持加载到进程结束。
  - 新增小节「唤醒的代价」：唤醒是真把 Agent 装进内存、每会话一份、本插件不提供卸载（`DSH` 重启才清）；归档会话拒绝唤醒；冷子代理会话拒绝；`writer-held` 表示另一处持有写入权。
- `package.json` `version`：`0.8.1` → `0.9.0`。

### S5 测试

在 `plugins/session-mailbox/test/pure.test.mjs` 追加 5 个 CASE，全部以 `console.log('CASE <name>')` 开头，只用 `node:test` + `node:assert`：

- `CASE wake-verdict-not-found`
- `CASE wake-verdict-subagent`（两条输入：带 `details.reason` 含 `subagent` 的，与 `agent-busy` 但不带 reason 的）
- `CASE wake-verdict-writer-held`
- `CASE wake-verdict-internal`（`undefined`、`null`、无 `code` 的对象三种输入）
- `CASE cold-name`

`CASE` 总数从 34 变为 39。

### S6 交付

见 §3 Step 6。README 交付前通读一遍。

## 5. No-go 项

1. 不得改 `list_sessions` 的输出与语义：仍只列活会话，仍不列归档（Decision 5）。
2. 不得自己调 `ctx.agents.resume` 或自己组装 preset（Decision 2）。
3. 不得让冷会话按标题、短名、id 后缀被解析；冷路径只接受完整 id（Decision 3）。
4. 不得为冷路径扫 `sessionController.list()`（Decision 3）。
5. 不得给唤醒加自建超时、`Promise.race`、重试（Decision 6）。
6. 不得改 `resolveTarget` 的匹配顺序与判定（Decision 3）。
7. 不得改归档拒绝、白名单拒绝、子代理拒绝的**先后顺序**（Decision 4）。
8. 不得引入运行时依赖；`lib/` 只用 `node:` 内置，测试只用 `node:test` + `node:assert`。
9. 不得改 profile 配置，不得装/卸载插件，不得动 `plugins/` 下本插件以外的目录。
10. 不得用 `rm` / `del` / `Remove-Item`；要删就移入回收站。

## 6. 验收表

| 配方（操作序列） | 期望退出码 | 期望输出消息集合 |
|---|---|---|
| (1) `node --test plugins/session-mailbox/test/*.test.mjs` | 0 | 输出含 `# fail 0`；含全部 5 个新 CASE 名；`CASE ` 计数为 39 |
| (1) `node --check plugins/session-mailbox/index.js` | 0 | 无任何输出 |
| (1) `list_workspaces({})` 记下工作区 id；(2) `list_workspaces({ workspace: "<工作区 id>" })` 取一条 `session: <id>`，该 id 不在 `list_sessions({})` 的当前行里；(3) `send_session_message({ agent: "<id>", message: "wake probe 1: reply exactly OK" })` | 工具调用不抛错 | 返回 `woke: true`、`to: "<id>"`、`statusBefore: "inactive"`、`primitive: "followup"`；render 含 `the session was woken from disk for this call` |
| (1) 紧接上一行 `node scripts/session-log.mjs <id>` | 0 | 输出含 `wake probe 1`，且该消息之后出现该会话的回合记录（工具调用或回答）；`wake probe 1` 之前的回合数为 N，之后不为 N |
| (1) `send_session_message({ agent: "<list_sessions 里某条 id>", message: "live probe: reply OK" })` | 工具调用不抛错 | 返回 `woke: false`；render 不含 `woken from disk` |
| (1) `send_session_message({ agent: "session-00000000-0000-4000-8000-000000000000", message: "x" })` | 工具调用抛错 | 错误文本含 `no session matches` 与 `no transcript is stored under that id`；随后 `list_sessions({})` 的行数与调用前相同 |
| (1) 取一个 subagent 会话 id（`list_agents({})` 里任一条的名字即其会话短名，或从任一子代理回执取得完整 id）；(2) `send_session_message({ agent: "<该 id>", message: "subagent probe" })` | 工具调用抛错 | 错误文本含 `belongs to subagent routing; use send_message` |
| (1) `create_session({})` 得 `<sid>`；(2) `archive_sessions({ sessionIds: ["<sid>"] })`；(3) `send_session_message({ agent: "<sid>", message: "archived probe" })` | 工具调用抛错 | 错误文本含 `is archived; unarchive it before messaging`；把 `<sid>` 写进交付报告（该空白归档会话留给用户在 GUI 处处理） |
| (1) `Select-String -Path plugins/session-mailbox/index.js,plugins/session-mailbox/README.md -Pattern 'loaded in this process\|未加载（冷）会话收不到' \| Measure-Object` | 0 | 计数为 0 |
| (1) `git status --short`；(2) `git ls-remote --tags origin` | 0 / 0 | (1) 无输出；(2) 含 `session-mailbox/v0.9.0` |

## 7. 何时停下问

- `sessionController.resolveAgent` 在真机上返回的对象既没有 `agent` 也没有 `error` 键 → 停。
- 唤醒成功、`followup` 也不抛错，但 `node scripts/session-log.mjs <id>` 里没有出现这条消息或没有起 turn → 停（BS-1）。
- 归档拒绝、白名单拒绝、子代理拒绝任一条要成立，就必须改 `list_sessions` 或除本插件外的公开签名 → 停。
- 实现需要改 profile 配置、装插件、或写 `plans/` 与 `plugins/session-mailbox/` 以外的目录 → 停。
- 验收表某一行红，而修它要违反 §5 任一条 → 停，把冲突写进交付报告。

## 8. Blind Spot List

- **BS-1 resume 之后 `followup` 是否立刻起 turn**：回来条件——验收表第 4 行红，即转录里没有新回合。
- **BS-2 同一 id 的并发唤醒是否只产生一份 agent**：回来条件——`list_sessions` 里出现同 id 两行，或同一 id 的唤醒返回了两份不同的 `to`。
- **BS-3 唤醒的内存不会被本插件释放**：回来条件——一个 turn 内唤醒超过 10 个会话。
- **BS-4 唤醒期间目标被归档**：回来条件——观察到 `queued: true` 但转录里没有 turn（被 gate 以 blocked 收口）。
- **BS-5 唤醒耗时**：大转录的冷会话唤醒是同步等待，无取消。回来条件——某次唤醒超过 10 秒。
