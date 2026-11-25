# mailbox-wake v4（Work Plan）

本方案自足。实现方只读本文件，不读评审记录。版本 v4，round 4 冻结文本。

强度词只有五个：**必须**（硬闸）、**不得**（禁止）、**默认**（可偏离，偏离要写进交付报告）、**可**（可选）、**只能**（唯一做法）。

## 1. 用户要什么（原话）

> 发消息时如果目标不是活会话，就用它的 session id 把它唤醒，然后再投递。

范围：只改 `send_session_message` 的投递路径。本文件内其余工具（`list_sessions` / `rename_session` / `list_workspaces` / `create_session` / `archive_sessions` / `delete_workspaces`）的**行为**不动；`rename_session` 只把「取 agent」这一次调用换成 §4 S2 3 的装载体，它的白名单闸、`sessionController` 缺失早退、`try/catch`、错误文案与判定分支全部保留。

## 2. Core Task 与失败症状

**Core Task**：`send_session_message` 的目标是本进程未加载（冷）的 top-level 会话、且调用方给出它的完整 session id 时，工具唤醒该会话、把消息投进它的收件箱，并在返回里标记这次调用走了冷路径。

**失败症状**（任一条成立即判 Core Task 未达成）：

1. 调用抛「没有活会话匹配」，没有尝试唤醒。
2. 冷路径投递返回成功，但 `woke` 字段缺失、或为 `false`。
3. 返回 `woke: true`，但转录里没有一条 `user/message`、其 `source.kind === 'session-mailbox'`、正文含本次探针文本。（用 `node scripts/session-log.mjs <id>` 核对时，它的渲染是 `[USER source=session-mailbox]` 加正文。）

## 3. 开始指令

先做 Step 0，之后按 Step 1 → 6 的顺序做。每一步都在上一步的完成判据变绿之后才开始。

| Step | 一句话 | 卡住时 |
|---|---|---|
| 0 | 通读文件、备份、记下基线 | 停下问 |
| 1 | `lib/pure.js` 加两个纯函数，并加 5 个 CASE | 停下问 |
| 2 | `index.js` 加装载体、改两条路径与统一尾部 | 停下问 |
| 3 | `index.js` 改输出 schema 与 render | 停下问 |
| 4 | 工具描述、参数描述、系统提示词、README、版本号 | 默认继续 |
| 5 | 跑完整验收表 | 停下问 |
| 6 | 提交、打 tag、推送 | 停下问 |

**Step 0 · 准备与基线**
读 `plugins/session-mailbox/index.js` 全文、`lib/pure.js`、`test/pure.test.mjs`、`test/create.test.mjs`、`README.md`。
把将要修改的 `index.js`、`lib/pure.js`、`test/pure.test.mjs`、`README.md`、`package.json` 各复制一份到 `backups/mailbox-wake-<yyyyMMdd-HHmmss>/`（保持原相对路径）。
在交付报告里记下三个基线值：`git rev-parse HEAD`、`node --test plugins/session-mailbox/test/*.test.mjs` 输出里的 `ℹ tests <N>`、`git tag --list 'dsh-session-mailbox/*'` 的最后一行。
完成判据：`Get-ChildItem backups/mailbox-wake-*/ -Recurse -File` 列出 5 个文件；三个基线值都在交付报告里。

**Step 1 · 纯逻辑与它的 CASE**
在 `lib/pure.js` 里新增并导出 `wakeFailureVerdict` 与 `coldAdmission`（只许用 `node:` 内置，本步不需要任何 import），同时按 §4 S5 在 `test/pure.test.mjs` 追加 5 个 CASE。
完成判据：`node --check plugins/session-mailbox/lib/pure.js` 退出码 0；`node --test plugins/session-mailbox/test/*.test.mjs` 退出码 0 且 `ℹ tests` 由 Step 0 的 N 变为 N+5。

**Step 2 · 编排**
按 §4 S2 加装载体并改 `send_session_message`；`rename_session` 只把 `controller.resolveAgent(entry.id)` 这一次调用换成 `wakeAgent(entry.id)`，其余（白名单闸、`sessionController` 缺失早退、`try/catch`、文案）一字不动。
完成判据：`node --check plugins/session-mailbox/index.js` 退出码 0；四处计数都对上（`Select-String -Path plugins/session-mailbox/index.js -SimpleMatch`）——`'controller.resolveAgent('` 命中 1 行；`'pure.coldAdmission('` 命中 1 行；`'pure.decideDelivery('` 命中 2 行；`'cannot rename session'` 命中数与改动前相同（改动前为 4，Step 0 复核）。

**Step 3 · 输出契约**
按 §4 S3 加 `woke` 字段与 render 尾句。
完成判据：`node --check plugins/session-mailbox/index.js` 退出码 0；`Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'woke'` 至少命中 schema、render、返回点三处。

**Step 4 · 文档与版本**
按 §4 S4 改工具描述、参数描述、`MAILBOX_PROMPT`、README、`package.json` 版本。
完成判据：`Select-String -Path plugins/session-mailbox/index.js,plugins/session-mailbox/README.md -SimpleMatch -Pattern 'this tool reaches only sessions','未加载（冷）会话收不到','改标题会唤醒冷会话'` 得到 0 行。

**Step 5 · 验收**
按 §6 全表逐行执行、逐行对上。
完成判据：§6 全表逐行对上，没有一行既非绿也非红。

**Step 6 · 交付**
`package.json` 的 `version` 改成 `0.9.0`；`git add plugins/session-mailbox plans/mailbox-wake`；commit message `session-mailbox: wake a cold session by id before delivering`；`git tag dsh-session-mailbox/v0.9.0`；`git push`；`git push origin dsh-session-mailbox/v0.9.0`。
完成判据：`git status --short -- plugins/session-mailbox plans/mailbox-wake` 无输出；`git ls-remote --tags origin` 里有 `dsh-session-mailbox/v0.9.0`；`(Get-Content plugins/session-mailbox/package.json | ConvertFrom-Json).version` 是 `0.9.0`。工作树里其它未跟踪路径既不提交也不删除，只写进交付报告。

## 4. Steps 的细节

### S1 `lib/pure.js`

**`wakeFailureVerdict(error)`** —— 按 `error.code` 与 `error.details` 判，先命中先返回：

| 条件 | reason |
|---|---|
| `error?.code === 'session/not-found'` | `not-found` |
| `error?.code === 'session/agent-busy'` 且 `String(error?.details?.reason ?? '')` 含 `'subagent delivery'` | `subagent` |
| `error?.code === 'session/agent-busy'`（其余 reason） | `internal` |
| `error?.code === 'session/writer-held'` | `writer-held` |
| 其余（含 `code` 缺失、`error` 不是对象） | `internal` |

`detail` 取 `String(error?.message ?? '')`；`ok` 恒为 `false`。本函数只对 `sessionController.resolveAgent` 的错误有定义，不得在别处复用。

**`coldAdmission({ allow, archived, id })`** —— 顺序固定，先命中先返回：

1. `allow !== undefined && !Array.isArray(allow)` → `'allow-unreadable'`。
2. `const gate = decideDelivery(allow, id)`；`gate.ok !== true` → 返回 `gate.reason`（只能是 `'denied-all'` 或 `'denied'`）。`decideDelivery` 是本文件已有的导出，本步直接调用它，不得复制它的三态逻辑。
3. `!Array.isArray(archived)` → `'archived-unreadable'`。
4. `archived.map(String).includes(id)` → `'archived'`。
5. 否则 `'ok'`。

`allow === undefined`（出厂默认）走第 2 步并得到 `ok: true`，与 `decideDelivery` 的三态语义一致。判定顺序写死在本函数里，调用方不得自行重排。

### S2 `index.js`：装载体、两条路径、统一尾部

**1. 前置守卫**（不动）：`exec.agent === undefined` 报错；`exec.agent.session.header.origin === 'subagent'` 报错；`pure.validateMessage` 三条错误原样。

**2. 解析**（不动，引文按现树）：
```js
const list = rows()
const senderRow = list.find((r) => r.id === String(exec.agent.id))
const senderName = senderRow?.name ?? String(exec.agent.id).slice(-8)
const found = pure.resolveTarget(list, args.agent, String(exec.agent.id))
```
`found.reason` 是 `'empty'` / `'self'` / `'ambiguous'` 时报原有错误，不得进入冷路径。

**3. 装载体**：在 `apply()` 作用域内定义一次 `wakeAgent(id)`，`send_session_message` 与 `rename_session` 都只能通过它取 Agent：

```js
// 返回 { ok: true, agent } 或 { ok: false, reason, detail }
// reason ∈ 'unavailable' | 'not-found' | 'subagent' | 'writer-held' | 'internal'
const wakeAgent = async (id) => {
  const controller = ctx.get('sessionController')
  if (controller === undefined) return { ok: false, reason: 'unavailable', detail: 'the sessionController service is unavailable' }
  const result = await controller.resolveAgent(id)
  if (result !== null && typeof result === 'object' && 'error' in result) {
    const verdict = pure.wakeFailureVerdict(result.error)
    return { ok: false, reason: verdict.reason, detail: verdict.detail }
  }
  if (result === null || typeof result !== 'object') {
    return { ok: false, reason: 'internal', detail: 'resolveAgent returned ' + String(result) }
  }
  const agent = result.agent
  if (agent === undefined) return { ok: false, reason: 'internal', detail: 'resolveAgent returned an object with no agent key' }
  return { ok: true, agent }
}
```
装载体只统一「取 agent」，不统一报错文案：两个调用方各自决定怎么把 `reason` / `detail` 说出去。不得在装载体里 `try/catch`（`resolveAgent` 的抛出留给调用方处理）；`rename_session` 保留它自己的 `try/catch` 与 `sessionController` 缺失早退。

**4. 活路径**（现有代码逐句保留，含白名单闸）：
```js
const entry = found.entry
// 白名单闸：与改动前逐字相同，不得删、不得后移
const gate = pure.decideDelivery(config.allow, entry.id)
if (gate.ok !== true) {
  if (gate.reason === 'denied-all') throw new Error('every session is denied by an empty allow list')
  if (gate.reason === 'denied') throw new Error(`session not in the allow list: ${entry.id}`)
  throw new Error(`unexpected delivery verdict: ${gate.reason}`)
}
const target = ctx.agents.get(entry.id)
if (target === undefined) throw new Error(`session ${entry.id} is no longer live in this process`)
const woke = false
```
到这一步为止，活路径独有的代码结束。

**5. 冷路径**（只在 `found.reason === 'notfound'`）：
   1. `const q = String(args.agent).trim()`。
   2. `let archived; try { archived = ctx.workspaceRegistry.archivedSessionIds } catch { archived = undefined }`。
   3. `const admit = pure.coldAdmission({ allow: config.allow, archived, id: q })`；按返回值报错，不得唤醒：
      - `allow-unreadable` → `the allow list is misconfigured (expected a list of session ids); refusing to deliver`
      - `denied-all` → `every session is denied by an empty allow list`
      - `denied` → `session not in the allow list: <q>`
      - `archived-unreadable` → `cannot verify the archived state of <q>; refusing to deliver`
      - `archived` → `target session is archived; unarchive it before messaging`
   4. `const loaded = await wakeAgent(q)`；`loaded.ok !== true` 时按 `reason` 报错，文案逐字如下（`detail` 为空时省掉冒号与值）：
      - `unavailable` → `send_session_message cannot load a cold session: the sessionController service is unavailable`
      - `not-found` → `no live session matches "<q>" and it could not be loaded: a cold session is loaded only by its full session id, and only when its stored transcript can be resumed`
      - `subagent` → `session "<q>" belongs to subagent routing; use send_message`
      - `writer-held` → `session "<q>" is held by another writer; retry after it finishes`
      - `internal` → `cannot load session "<q>": <detail>`
   5. 成功：`const target = loaded.agent`；`const row = rows().find((r) => r.id === String(target.id))`；`const entry = { id: String(target.id), name: row?.name ?? String(target.id) }`；`const woke = true`。

**6. 统一尾部**（活路径与冷路径共用同一段代码，顺序固定）：
   1. `target.session.header.origin === 'subagent'` → `send_session_message addresses top-level sessions only`
   2. 再读一次 `ctx.workspaceRegistry.archivedSessionIds`；读失败或不是数组 → `cannot verify the archived state of <target.id>; refusing to deliver`；含该 id → `target session is archived; unarchive it before messaging`
   3. `const statusBefore = pure.pageStatus(target.status)`；`const primitive = pure.primitiveFor(target.status)`
   4. `const message = createUserMessage({ content: [{ type: 'text', text: pure.messageText(senderName, args.message) }], source: pure.messageSource(exec.agent.id) })`
   5. `if (primitive === 'followup') target.followup(message) else target.steer(message)`
   6. 唯一返回点：`{ queued: true, to: String(target.id), name: entry.name, statusBefore, primitive, woke }`

**失败处理**：唤醒是一次冷启动——读持久化转录、由 `composeAgent` 装配 preset（`presets.mount` 可能失败）、再 publish 一个 Agent；它没有 signal、没有超时。`internal` 既覆盖未知错误，也覆盖 preset 装配失败，`detail` 原样带出。`followup` 抛错按现有行为向上抛，不捕获。

### S3 `index.js :: send_session_message` 的输出契约

- `output.schema.properties` 增加 `woke: { type: 'boolean', required: true }`。现有五个字段的名字、类型、required 一律不动。
- `woke` 的含义是「这次调用走了冷路径」：同一 id 的并发装载由宿主去重，第二个调用方也会拿到 `true`。
- `render` 第一段一字不改：`message queued to session <name> (<to>) via <primitive>; the target was <statusBefore> before the call`；`woke === true` 时追加 `; this call took the cold path (the session was loaded from disk)`。
- 唯一返回点必须带 `woke`：活路径 `false`，冷路径 `true`。

### S4 文档与版本

- `send_session_message` 的 `description`：保留现有全文，追加一句：`A full session id that this process no longer holds may be loaded from disk and then receive the message; an archived, subagent-owned, allow-list-denied or unresumable session is refused. A cold session's title or short name does not resolve while it is cold, so pass the id.`
- `send_session_message` 的 `parameters.agent.description` 改成：`Another top-level session: its title, its name, or its full id, as shown by list_sessions; for a session this process does not hold, only its full id works.`
- `MAILBOX_PROMPT` 追加一行：`A cold session (one this process does not hold) can still receive a message: pass its full session id and the tool loads it from disk first. Its title and short name do not resolve while it is cold; list_sessions shows it again after the load.`
- `rename_session` 的 `description`：改成 `Renaming needs a loaded session: rename a cold one after messaging it (send_session_message with its full id) wakes it.`
- README：
  - 工具表 `send_session_message` 行补 `woke` 与冷路径语义；`rename_session` 行改成与上一条描述一致。
  - `### rename_session 的语义` 一节里「改标题会唤醒冷会话」那一条删掉，改成「改标题需要已装载的会话；先按完整 id 发一条消息把它唤醒」。
  - `agent` 那段：把「四种写法」改成五种，并给出代码里的真实顺序 `name → 完整 id → 完整标题 → id 后缀 → 标题子串`；再补三条：冷会话只能按**完整 id** 命中；标题与短名只覆盖活会话；返回的 `name` 只用于展示，下一次调用请用 `to` 里的完整 id。
  - 「已知边界」那条 `未加载（冷）会话收不到` 改成新语义。
  - 新增小节「唤醒的代价」：唤醒是冷启动（读转录 + 装配 preset + publish Agent，无 signal、无超时，`internal` 覆盖 preset 装配失败）；每会话一份、本插件不提供卸载，存活到 DSH 重启；被唤醒的会话从此出现在 `list_sessions` 和其它会话的地址簿里；归档会话拒绝唤醒；冷子代理会话拒绝；`writer-held` 表示另一处持有写入权；唤醒后进行中的归档复查若命中，会报归档错误而 Agent 已经驻留内存。
  - 「三条卸载时不会消失的事实」标题改成「卸载时不会消失的四条事实」，并补第 4 条：0.9.0 之前启动的会话保留旧提示词快照，不会主动知道可以加载冷会话；工具描述是全量的。
  - 「测试覆盖到哪」一节：CASE 条数由 Step 0 的 N 改成 N+5；把 `send_session_message` 的冷路径加进「没有自动化覆盖」的清单。
- `package.json` `version`：`0.8.1` → `0.9.0`。

### S5 测试

在 `test/pure.test.mjs` 追加 5 个 CASE，以 `console.log('CASE <name>')` 开头，只用 `node:test` + `node:assert`：

- `CASE wake-verdict-not-found`
- `CASE wake-verdict-subagent`（`details.reason` 含 `'subagent delivery'` → `subagent`；`agent-busy` 但 reason 是别的 → `internal`）
- `CASE wake-verdict-writer-held`
- `CASE wake-verdict-internal`（`undefined`、`null`、无 `code` 的对象三种输入）
- `CASE cold-admission-order`：**必须**覆盖 `allow` 为 `undefined` → `'ok'`；`allow` 为字符串 → `'allow-unreadable'`；`allow` 为 `[]` → `'denied-all'`；不在名单 → `'denied'`；`allow` 放行但 `archived` 为 `undefined` → `'archived-unreadable'`；`archived` 含该 id → `'archived'`；都不命中 → `'ok'`

`ℹ tests` 从 Step 0 记下的 N 变为 N+5。不得为凑数删并任何既有 CASE。

### S6 交付

见 §3 Step 6。tag 前缀随包名 `dsh-session-mailbox`，不随目录名。README 交付前通读一遍。

## 5. No-go 项

1. 不得改 `list_sessions` 的输出与语义：仍只列活会话，仍不列归档（Decision 5）。
2. 不得自己调 `ctx.agents.resume` 或自己组装 preset（Decision 2）。
3. 不得让冷会话按标题、短名、id 后缀被解析；冷路径只接受完整 id（Decision 3）。
4. 不得为冷路径扫 `sessionController.list()`（Decision 3）。
5. 不得给唤醒加自建超时、`Promise.race`、重试（Decision 6）。
6. 不得改 `resolveTarget` 的匹配顺序与判定（Decision 3）。
7. 活路径的「解析后拒绝」三条顺序（`empty`/`self`/`ambiguous`）、活路径的白名单闸、以及冷路径「准入 → 装载 → 统一尾部」的顺序都不得动（Decision 3、Decision 8）。与本节其它条目冲突时停下问，本条不自带豁免。
8. 不得引入运行时依赖；`lib/` 只用 `node:` 内置，测试只用 `node:test` + `node:assert`。
9. 不得改 profile 配置，不得装/卸载插件，不得写 `plans/`、`plugins/session-mailbox/` 以外的**受版本控制**的仓库文件。豁免四项：Step 0 的 `backups/`（已在 `.gitignore`）；验收期在用户 Host 里新建一个空白会话并归档它（§6 第 7 行）；向被唤醒会话投递探针（§6 第 3、4 行）；验收期改一次某个活会话的标题再改回（§6 第 8 行，两个标题写进交付报告）。
10. 不得用 `rm` / `del` / `Remove-Item`；要删就移入回收站。

## 6. 验收表

| 配方（操作序列） | 期望退出码 | 期望输出消息集合 |
|---|---|---|
| (1) `node --test plugins/session-mailbox/test/*.test.mjs *> $env:TEMP\mailbox-tests.txt; $LASTEXITCODE`；(2) 对该文件 `Select-String -SimpleMatch -Pattern 'CASE wake-verdict-not-found','CASE wake-verdict-subagent','CASE wake-verdict-writer-held','CASE wake-verdict-internal','CASE cold-admission-order'` | 0 | 输出含 `ℹ fail 0` 与 `ℹ tests <N+5>`（N 是 Step 0 记下的基线）；5 个 CASE 名逐个命中 |
| (1) `node --check plugins/session-mailbox/index.js` | 0 | 无任何输出 |
| (1) `node scripts/session-log.mjs <候选 id> *> $env:TEMP\wake-baseline.txt`，记下 `# <n> records` 与 `(Select-String -Path $env:TEMP\wake-baseline.txt -SimpleMatch '[USER source=session-mailbox]').Count`，后者必须为 0；(2) `send_session_message({ agent: "<候选 id>", message: "wake probe 1: reply exactly OK" })`；(3) 每 10 秒重跑一次 (1) 的读，最多 6 次，**每次只读、不再投递** | 工具调用不抛错 | 回执 `woke: true`、`to: "<候选 id>"`、`statusBefore: "inactive"`、`primitive: "followup"`，render 含 `this call took the cold path`；第 3 步的读里 `[USER source=session-mailbox]` 计数为 1 且该行之后出现 `wake probe 1`。候选来源：`list_workspaces({})` → `list_workspaces({ workspace: "<id>" })` 里一条不在 `list_sessions({})` 行内的 `session: <id>`。回执若报 §4 S2 5.3/5.4 的任一错误（归档、白名单、子代理、writer-held、装载失败），换下一条候选（最多 3 条）；3 条用尽仍无 `woke: true` → 该行判红，把 3 个 id 与各自错误写进交付报告并停 |
| (1) `send_session_message({ agent: "<list_sessions 里某条 id>", message: "live probe: reply OK" })`；(2) `node scripts/session-log.mjs <同一 id> --source session-mailbox *> $env:TEMP\live-probe.txt`，再 `(Select-String -Path $env:TEMP\live-probe.txt -SimpleMatch 'live probe').Count` | 工具调用不抛错 | 回执 `woke: false`，render 不含 `cold path`；第 2 步计数为 1 |
| (1) `send_session_message({ agent: "<一个经 list_sessions 核对不存在、且不等于当前会话 name 的 8 位串>", message: "x" })`；(2) `send_session_message({ agent: "session-00000000-0000-4000-8000-000000000000", message: "x" })` | 两次都抛错 | 两次的错误文本都含 `no live session matches` 与 `only by its full session id`；两次之后 `list_sessions({})` 的行数与第一次调用前相同 |
| (1) `create_session({})` 得 `<sid>`；(2) `archive_sessions({ sessionIds: ["<sid>"] })`；(3) `send_session_message({ agent: "<sid>", message: "archived probe" })` | 工具调用抛错 | 错误文本含 `target session is archived; unarchive it before messaging`；把 `<sid>` 写进交付报告（该空白归档会话留给用户在 GUI 处处理） |
| (1) 对 `list_sessions({})` 里任一 id 调 `rename_session({ agent: "<id>", title: "mailbox-wake probe" })`；(2) 再调 `rename_session({ agent: "<id>", title: "<原标题>" })` | 两次都不抛错 | 第 1 次回执 `title: "mailbox-wake probe"`；第 2 次回执 `title: "<原标题>"`；两个标题都写进交付报告 |
| (1) `Select-String -Path plugins/session-mailbox/index.js,plugins/session-mailbox/README.md -SimpleMatch -Pattern 'this tool reaches only sessions','未加载（冷）会话收不到','改标题会唤醒冷会话' \| Measure-Object` | 0 | 计数为 0（改动前为 3） |
| (1) `(Get-Content plugins/session-mailbox/package.json \| ConvertFrom-Json).version` | 0 | 输出 `0.9.0` |
| (1) `git status --short -- plugins/session-mailbox plans/mailbox-wake`；(2) `git ls-remote --tags origin` | 0 / 0 | (1) 无输出；(2) 含 `dsh-session-mailbox/v0.9.0` |

## 7. 何时停下问

- `sessionController.resolveAgent` 在真机上抛异常，或返回的对象既没有 `agent` 也没有 `error` 键 → 停。
- §6 第 3 行用尽 3 条候选仍未唤醒 → 停。
- 唤醒与 `followup` 都不抛错，但 §6 第 3 行第 3 步的读里没有 `[USER source=session-mailbox]` → 停（BS-1）。
- 归档拒绝、白名单拒绝、子代理拒绝任一条要成立，就必须改 `list_sessions` 或除本插件外的公开签名 → 停。
- 需要改 profile 配置、装插件，或写 §5 No-go 9 未豁免的仓库文件 → 停。
- §6 某一行红，而修它要违反 §5 任一条 → 停，把冲突写进交付报告。

## 8. Blind Spot List

- **BS-1 resume 之后 `followup` 是否立刻起 turn**：回来条件——§6 第 3 行第 3 步的读里没有 `[USER source=session-mailbox]`。
- **BS-2 同一 id 的并发装载**：第二个调用方也会拿到 `woke: true`，而它没有装载任何东西。回来条件——一个 `woke: true` 的回执没有对应的转录变化，而另一个回执有。
- **BS-3 唤醒的内存不会被本插件释放**：回来条件——一个 turn 内唤醒超过 10 个会话。
- **BS-4 唤醒耗时**：大转录的冷会话唤醒是同步等待，无取消。回来条件——某次唤醒超过 10 秒。
- **BS-5 冷子代理会话的拒绝只在纯函数层被验证**：本机没有可枚举的冷子代理 session id 来源。回来条件——拿到一个冷子代理 id，或用户报告该分支行为异常。
- **BS-6 冷且归档的会话没有真机探针**：造一条需要重启 Host。回来条件——观察到一条归档会话出现在 `list_sessions` 里。
- **BS-7 唤醒成功后、统一尾部复查前被归档**：会报归档错误而 Agent 已驻留内存。回来条件——观察到该错误文本。
