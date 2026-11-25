# mailbox-wake v2（Work Plan）

本方案自足。实现方只读本文件，不读评审记录。版本 v2，round 2 冻结文本。

强度词只有五个：**必须**（硬闸）、**不得**（禁止）、**默认**（可偏离，偏离要写进交付报告）、**可**（可选）、**只能**（唯一做法）。

## 1. 用户要什么（原话）

> 发消息时如果目标不是活会话，就用它的 session id 把它唤醒，然后再投递。

范围：只改 `send_session_message` 的投递路径。`list_sessions` / `list_workspaces` / `create_session` / `archive_sessions` / `delete_workspaces` 的语义不动。

## 2. Core Task 与失败症状

**Core Task**：`send_session_message` 的目标是本进程未加载（冷）的 top-level 会话、且调用方给出它的完整 session id 时，工具唤醒该会话、把消息投进它的收件箱，并在返回里标记这次调用走了冷路径。

**失败症状**（任一条成立即判 Core Task 未达成）：

1. 调用抛「没有活会话匹配」，没有尝试唤醒。
2. 投递返回成功，但 `woke` 字段缺失、或为 `false`。
3. 返回 `woke: true`，但目标的转录没有增长，或这条消息没有出现在转录里。

## 3. 开始指令

先做 Step 0，之后按 Step 1 → 6 的顺序做。每一步都在上一步的完成判据变绿之后才开始。

| Step | 一句话 | 卡住时 |
|---|---|---|
| 0 | 通读文件，备份待改文件 | 停下问 |
| 1 | `lib/pure.js` 加两个纯函数 | 停下问 |
| 2 | `index.js` 改投递顺序 | 停下问 |
| 3 | `index.js` 改输出 schema 与 render | 停下问 |
| 4 | 工具描述、系统提示词、README、版本号 | 默认继续 |
| 5 | 跑完整验收表 | 停下问 |
| 6 | 提交、打 tag、推送 | 停下问 |

**Step 0 · 准备**
读 `plugins/session-mailbox/index.js` 全文、`lib/pure.js`、`test/pure.test.mjs`、`test/create.test.mjs`、`README.md`。
把将要修改的 `index.js`、`lib/pure.js`、`test/pure.test.mjs`、`README.md`、`package.json` 各复制一份到 `backups/mailbox-wake-<yyyyMMdd-HHmmss>/`（保持原相对路径）。
完成判据：`Get-ChildItem backups/mailbox-wake-*/ -Recurse -File` 列出 5 个文件。

**Step 1 · 纯逻辑**
在 `lib/pure.js` 里新增并导出两个函数，只许用 `node:` 内置（本步不需要任何 import）。

- `wakeFailureVerdict(error)`：输入是 `sessionController.resolveAgent` 返回的 `{ error }` 里那个错误对象，返回 `{ ok: false, reason, detail }`，`reason` 只能是 `'not-found' | 'subagent' | 'writer-held' | 'internal'`。
- `coldAdmission({ allow, archived, id })`：返回 `'denied-all' | 'denied' | 'archived-unreadable' | 'archived' | 'ok'`。判定顺序写死在函数里，见 §4 S1。

完成判据：`node --check plugins/session-mailbox/lib/pure.js` 退出码 0；`node --test plugins/session-mailbox/test/*.test.mjs` 退出码 0 且输出含 `ℹ tests 34`（新 CASE 还没写）。

**Step 2 · 编排**
按 §4 S2 的六段顺序改 `send_session_message` 的 `execute`。
完成判据：`node --check plugins/session-mailbox/index.js` 退出码 0；`Select-String -Path plugins/session-mailbox/index.js -Pattern 'coldAdmission|resolveAgent'` 的行号显示 `coldAdmission` 出现两次、且都早于 `resolveAgent`。

**Step 3 · 输出契约**
按 §4 S3 加 `woke` 字段与 render 尾句。
完成判据：`node --check plugins/session-mailbox/index.js` 退出码 0；`Select-String -Path plugins/session-mailbox/index.js -Pattern 'woke'` 至少命中 schema、render、execute 三处。

**Step 4 · 文档与版本**
按 §4 S4 改工具描述、`MAILBOX_PROMPT`、README、`package.json` 版本。
完成判据：`Select-String -Path plugins/session-mailbox/index.js,plugins/session-mailbox/README.md -SimpleMatch -Pattern 'this tool reaches only sessions','未加载（冷）会话收不到'` 得到 0 行。

**Step 5 · 验收**
按 §6 全表逐行执行、逐行对上。
完成判据：§6 全表逐行对上。

**Step 6 · 交付**
`git add` 本插件目录与 `plans/mailbox-wake/`；commit message `session-mailbox: wake a cold session by id before delivering`；`package.json` 的 `version` 与 tag 都是 `dsh-session-mailbox/v0.9.0`；`git push` 与 `git push origin dsh-session-mailbox/v0.9.0`。
完成判据：`git status --short -- plugins/session-mailbox plans/mailbox-wake` 无输出；`git ls-remote --tags origin` 里有 `dsh-session-mailbox/v0.9.0`。工作树里其它未跟踪路径既不提交也不删除，只写进交付报告。

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

**`coldAdmission({ allow, archived, id })`** —— 顺序固定：

1. `allow === undefined` → 跳过白名单；`Array.isArray(allow) && allow.length === 0` → `'denied-all'`；`Array.isArray(allow) && !allow.includes(id)` → `'denied'`。
2. 再判归档：`!Array.isArray(archived)` → `'archived-unreadable'`；`archived.map(String).includes(id)` → `'archived'`。
3. 否则 `'ok'`。

### S2 `index.js :: send_session_message.execute` 的六段顺序

1. **前置守卫**原样不动：`exec.agent === undefined` 报错；`exec.agent.session.header.origin === 'subagent'` 报错；`pure.validateMessage` 三条错误原样。
2. **活会话解析**原样不动：`const found = pure.resolveTarget(rows(), args.agent, String(exec.agent.id))`。`found.ok === true` 时走现有路径直到函数返回，这一段（白名单、`ctx.agents.get`、归档读、`statusBefore`、`followup`/`steer`）一字不改，`woke` 取 `false`。
3. **三种拒绝原样不动**：`found.reason` 是 `'empty'` / `'self'` / `'ambiguous'` 时报原有错误，不得进入唤醒路径。
4. **唤醒路径**只在 `found.reason === 'notfound'` 时进入，顺序固定：
   1. `const q = String(args.agent).trim()`。
   2. 读归档集：`let archived; try { archived = ctx.workspaceRegistry.archivedSessionIds } catch { archived = undefined }`（读失败不在此报错，交给 `coldAdmission` 判 `'archived-unreadable'`）。
   3. `const admit = pure.coldAdmission({ allow: config.allow, archived, id: q })`，按返回值报错，**不得**唤醒：
      - `denied-all` → `every session is denied by an empty allow list`
      - `denied` → `session not in the allow list: <q>`
      - `archived-unreadable` → `cannot verify the archived state of <q>; refusing to deliver`
      - `archived` → `target session is archived; unarchive it before messaging`
   4. `const controller = ctx.get('sessionController')`；`undefined` 时报 `send_session_message cannot wake a cold session: the sessionController service is unavailable`。
   5. `const result = await controller.resolveAgent(q)`。不得传第二个参数，不得包 `Promise.race` 或自建超时。
   6. `result` 里有 `error` 键时用 `pure.wakeFailureVerdict(result.error)` 映射成错误并抛出，文案逐字如下：
      - `not-found` → `no live session matches "<q>" and it could not be woken; a cold session is woken only by its full session id (list_workspaces prints it), and only when its stored transcript can be resumed`
      - `subagent` → `session "<q>" belongs to subagent routing; use send_message`
      - `writer-held` → `session "<q>" is held by another writer; retry after it finishes`
      - `internal` → `cannot wake session "<q>": <detail>`
   7. 成功时令 `target = result.agent`、`woke = true`。再取 `const row = rows().find((r) => r.id === String(target.id))`，`entry = { id: String(target.id), name: row?.name ?? String(target.id) }`。不得再调 `ctx.agents.get`。
5. **统一尾部**（两条路径同文，顺序如下）：
   1. `target.session.header.origin === 'subagent'` → `send_session_message addresses top-level sessions only`
   2. 再读一次 `ctx.workspaceRegistry.archivedSessionIds`；读失败或不是数组 → `cannot verify the archived state of <target.id>; refusing to deliver`；含该 id → `target session is archived; unarchive it before messaging`
   3. `statusBefore = pure.pageStatus(target.status)`；`primitive = pure.primitiveFor(target.status)`
   4. `createUserMessage(...)`，`followup` / `steer`
6. **返回值**：现有五个字段原样，加 `woke`（见 S3）。唤醒路径不特判 `statusBefore` / `primitive`；`followup` 抛错按现有行为向上抛，不捕获。

**失败处理**：唤醒是一次冷启动——读持久化转录、由 `composeAgent` 装配 preset（`presets.mount` 可能失败）、再 publish 一个 Agent；它没有 signal、没有超时。`internal` 既覆盖未知错误，也覆盖 preset 装配失败，`detail` 原样带出。

### S3 `index.js :: send_session_message` 的输出契约

- `output.schema.properties` 增加 `woke: { type: 'boolean', required: true }`。现有五个字段的名字、类型、required 一律不动。
- `woke` 的含义是「这次调用走了冷路径」，不是「这次调用创建了 Agent」：同一 id 的并发唤醒由宿主去重，第二个调用方也会拿到 `true`。
- `render` 的文本分两段，第一段一字不改：`message queued to session <name> (<to>) via <primitive>; the target was <statusBefore> before the call`；`woke === true` 时追加 `; the session was loaded from disk for this call`。
- `execute` 只有一个返回点，必须带 `woke`：活路径 `false`，冷路径 `true`。

### S4 文档与版本

- `send_session_message` 的 `description`：保留现有全文，追加一句：`A full session id that is no longer in this process is loaded from disk and then receives the message; a cold session's title or short name does not resolve, so pass its id (list_workspaces prints it).`
- `MAILBOX_PROMPT` 追加一行：`A cold session (one this process does not hold) can still receive a message: pass its full session id and the tool loads it from disk first. Its title and short name do not resolve while it is cold; list_workspaces prints session ids, and list_sessions shows it again after the load.`
- README：
  - 工具表 `send_session_message` 行补 `woke` 与冷路径语义。
  - `agent` 四种写法的段落补三条：冷会话只能按**完整 id** 命中；标题与短名只覆盖活会话；返回的 `name` 只用于展示，下一次调用请用 `to` 里的完整 id。
  - 「已知边界」那条 `未加载（冷）会话收不到` 改成新语义。
  - 新增小节「唤醒的代价」：唤醒是冷启动（读转录 + 装配 preset + publish Agent，无 signal、无超时，`internal` 覆盖 preset 装配失败）；每会话一份、本插件不提供卸载，存活到 DSH 重启；被唤醒的会话从此出现在 `list_sessions` 和其它会话的地址簿里；归档会话拒绝唤醒；冷子代理会话拒绝；`writer-held` 表示另一处持有写入权。
  - 「三条卸载时不会消失的事实」补一条：0.9.0 之前启动的会话保留旧提示词快照，不会主动知道可以唤醒冷会话；工具描述是全量的。
- `package.json` `version`：`0.8.1` → `0.9.0`。

### S5 测试

在 `test/pure.test.mjs` 追加 5 个 CASE，以 `console.log('CASE <name>')` 开头，只用 `node:test` + `node:assert`：

- `CASE wake-verdict-not-found`
- `CASE wake-verdict-subagent`（带 `details.reason` 含 `'subagent delivery'` 的一条；`agent-busy` 但 reason 是别的一条 → 必须判 `internal`）
- `CASE wake-verdict-writer-held`
- `CASE wake-verdict-internal`（`undefined`、`null`、无 `code` 的对象三种输入）
- `CASE cold-admission-order`（`[]` → `denied-all`；不在名单 → `denied`；两者都命中时白名单先返回；`archived` 不是数组 → `archived-unreadable`；归档命中 → `archived`；否则 `ok`）

`ℹ tests` 从 34 变为 39。

### S6 交付

见 §3 Step 6。tag 前缀随包名 `dsh-session-mailbox`，不随目录名。README 交付前通读一遍。

## 5. No-go 项

1. 不得改 `list_sessions` 的输出与语义：仍只列活会话，仍不列归档（Decision 5）。
2. 不得自己调 `ctx.agents.resume` 或自己组装 preset（Decision 2）。
3. 不得让冷会话按标题、短名、id 后缀被解析；冷路径只接受完整 id（Decision 3）。
4. 不得为冷路径扫 `sessionController.list()`（Decision 3）。
5. 不得给唤醒加自建超时、`Promise.race`、重试（Decision 6）。
6. 不得改 `resolveTarget` 的匹配顺序与判定（Decision 3）。
7. 活路径的三种拒绝顺序不得动；冷路径固定为「白名单 → 归档（`coldAdmission`）→ 唤醒 → 统一尾部（子代理 → 归档复查）」；此顺序优先于本节其它条目（Decision 7）。
8. 不得引入运行时依赖；`lib/` 只用 `node:` 内置，测试只用 `node:test` + `node:assert`。
9. 不得改 profile 配置，不得装/卸载插件，不得写仓库文件（`plans/`、`plugins/session-mailbox/`）以外的地方。验收里对目标会话转录的写入是本任务授权的副作用，不在此限。
10. 不得用 `rm` / `del` / `Remove-Item`；要删就移入回收站。

## 6. 验收表

| 配方（操作序列） | 期望退出码 | 期望输出消息集合 |
|---|---|---|
| (1) `node --test plugins/session-mailbox/test/*.test.mjs` | 0 | 输出含 `ℹ tests 39` 与 `ℹ fail 0`；5 个新 CASE 名逐个命中：`Select-String -Path <输出文件> -SimpleMatch -Pattern 'CASE wake-verdict-not-found','CASE wake-verdict-subagent','CASE wake-verdict-writer-held','CASE wake-verdict-internal','CASE cold-admission-order'` 得到 5 行 |
| (1) `node --check plugins/session-mailbox/index.js` | 0 | 无任何输出 |
| (1) `list_workspaces({})` 记下工作区 id；(2) `list_workspaces({ workspace: "<工作区 id>" })` 取一条 `session: <id>`，该 id 不在 `list_sessions({})` 的当前行里；(3) `send_session_message({ agent: "<id>", message: "wake probe 1: reply exactly OK" })` | 工具调用不抛错 | 返回 `woke: true`、`to: "<id>"`、`statusBefore: "inactive"`、`primitive: "followup"`；render 含 `the session was loaded from disk for this call`。若该行返回 `is archived` 而不是唤醒结果，换下一条候选 id 重试（最多 3 条），并把被跳过的 id 写进交付报告 |
| (1) 在上一条之前对同一 id 跑 `node scripts/session-log.mjs <id>`，记下 `# <n> records` 的 n；(2) 投递；(3) 每 10 秒重读一次，最多 6 次：`node scripts/session-log.mjs <id>` | 0 | 输出含 `wake probe 1` 与 `[USER source=session-mailbox]`，且 `# <m> records` 的 m > n |
| (1) `send_session_message({ agent: "<list_sessions 里某条 id>", message: "live probe: reply OK" })` | 工具调用不抛错 | 返回 `woke: false`；render 不含 `loaded from disk` |
| (1) `send_session_message({ agent: "2825e0d6", message: "x" })`；(2) `send_session_message({ agent: "session-00000000-0000-4000-8000-000000000000", message: "x" })` | 两次都抛错 | 两次的错误文本都含 `no live session matches` 与 `a cold session is woken only by its full session id`；两次之后 `list_sessions({})` 的行数与第一次调用前相同 |
| (1) `create_session({})` 得 `<sid>`；(2) `archive_sessions({ sessionIds: ["<sid>"] })`；(3) `send_session_message({ agent: "<sid>", message: "archived probe" })` | 工具调用抛错 | 错误文本含 `target session is archived; unarchive it before messaging`；把 `<sid>` 写进交付报告（该空白归档会话留给用户在 GUI 处处理） |
| (1) `Select-String -Path plugins/session-mailbox/index.js,plugins/session-mailbox/README.md -SimpleMatch -Pattern 'this tool reaches only sessions','未加载（冷）会话收不到' \| Measure-Object` | 0 | 计数为 0（改动前应为 2） |
| (1) `git status --short -- plugins/session-mailbox plans/mailbox-wake`；(2) `git ls-remote --tags origin` | 0 / 0 | (1) 无输出；(2) 含 `dsh-session-mailbox/v0.9.0` |

## 7. 何时停下问

- `sessionController.resolveAgent` 在真机上返回的对象既没有 `agent` 也没有 `error` 键 → 停。
- 唤醒与 `followup` 都不抛错，但 §6 第 4 行的转录里既没有 `wake probe 1` 也没有 `[USER source=session-mailbox]` → 停（BS-1）。
- 归档拒绝、白名单拒绝、子代理拒绝任一条要成立，就必须改 `list_sessions` 或除本插件外的公开签名 → 停。
- 需要改 profile 配置、装插件，或写 `plans/` 与 `plugins/session-mailbox/` 以外的仓库文件 → 停。
- §6 某一行红，而修它要违反 §5 任一条 → 停，把冲突写进交付报告。

## 8. Blind Spot List

- **BS-1 resume 之后 `followup` 是否立刻起 turn**：回来条件——§6 第 4 行红，即转录没有增长。
- **BS-2 同一 id 的并发唤醒**：第二个调用方也会拿到 `woke: true`，而它其实没有唤醒任何东西。回来条件——观察到一个 `woke: true` 的回执其转录没有增长，而另一个回执的增长了。
- **BS-3 唤醒的内存不会被本插件释放**：回来条件——一个 turn 内唤醒超过 10 个会话。
- **BS-4 唤醒耗时**：大转录的冷会话唤醒是同步等待，无取消。回来条件——某次唤醒超过 10 秒。
- **BS-5 冷子代理会话的拒绝只在纯函数层被验证**：本机没有可枚举的冷子代理 session id 来源（`list_agents` 给的是路径名，`session_projcache` 不含 `origin`）。回来条件——手上拿到一个冷子代理 id，或用户报告该分支行为异常。
