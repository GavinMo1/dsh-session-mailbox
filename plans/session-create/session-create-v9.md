# session-create v9 — Work Plan

Version v9. This plan is self-contained. The implementation does not read any review record.

v9 相对 v8 的全部改动，逐条对应上一轮全扫评审（5 high / 9 medium）与一轮安装包源码取证：

- **路径与用户名全部改成现取**（v8 把 `C:\Users\ruike\...`、`default-workspace`、`sync` 当常量写死，换机即失效）。
- **工作区复用/新建的判定改成「id 差集」，不再做路径字符串比较**。安装包源码证明 `workspaceRegistry.create(path)` 自己会 `fs.realpath` 规范化并且按 canonical 路径幂等，所以拿 id 差集判定是唯一正确且不需规范化比较的做法。
- **`pickWorkspace` 缩成只处理「没给路径」的默认分支**，`target` 给出时不查注册表，直接 `create()`（幂等）。
- **回读硬闸写成唯一代码**（v8 只说「回读」，复用旧快照会恒红、不复用会假绿）。
- **`inject` 补 `subagents`**，并把 `rootOf` 抛错的文案与子代理拒绝区分开。
- **验收去掉所有字面标题与固定行数**，A2 不再依赖 `list_sessions` 的冷会话可见性，A3 改用规范化后比较，A4 补「会话集合不变」，新增 A8 覆盖别名路径复用。
- **新增 Step 4 — 交付闸**（`node --check`、单测、README、版本、tag、`git status`、`backups\`），v8 整段缺失。
- **新增 §3 角色分工**：v8 要求「执行验收的必须是顶层会话」，却没写清谁是实施者，按字面读会卡死在自我前置上。

## 0. 证据（本轮直接从安装包源码取证，执行者可直接依赖，不需要再查）

来源：`<DSH 安装目录>/resources/app.asar` 内随包发布的 TypeScript 源码（与运行时同源）。下表每一条都可用同样方式复核：解出 asar 后按 `file:line` 读。

| # | 事实 | 出处 |
|---|---|---|
| E1 | 工作区服务名就是 `workspaceRegistry` | `@deepseek-ai/dsh-workspace/src/index.ts:211`（`super(ctx, 'workspaceRegistry')`） |
| E2 | `list(): Workspace[]`，**同步**，按注册顺序返回 entities | 同上 `:308` |
| E3 | `create(path: string, title?: string): Promise<Workspace>`，**返回 Workspace 本身**，不是 `{ workspace, created }` | 同上 `:254` |
| E4 | `create` 内部 `realpathNormalize(path)` 规范化、对非目录抛 `cannot create a workspace at '<canonical>': path is not a directory`、**同一 canonical 路径重复调用返回既有记录且不改标题**（幂等） | 同上 `:254-260`、文档 `:238-248` |
| E5 | `Workspace` 记录字段：`id`、`path`（`fs.realpath` 规范化后的值）、`title`（默认取路径末段）、`createdAt`、`updatedAt`、`sessionIds`（只读，同步过滤后的候选账目） | `@deepseek-ai/dsh-workspace/src/types.ts:69-100` |
| E6 | `get(id): Workspace \| undefined` 存在，可用来重新取一次记录 | `dsh-workspace/src/index.ts:298` |
| E7 | 会话服务名就是 `sessionController` | `@deepseek-ai/dsh-api-session-controller/src/index.ts:179` |
| E8 | `create(request: SessionCreateRequest): Promise<SessionCreateValue>`，**只收一个对象参数，没有 signal** | 同上 `:307` |
| E9 | `SessionCreateRequest = { workspaceId?, cwd?, sessionId?, agentPreset? }`；`SessionCreateValue = { sessionId, agentPreset? }` | `dsh-api-session-controller/src/types.ts:268-284` |
| E10 | `prompt(request: SessionPromptRequest, signal: AbortSignal)`——**signal 是第二个位置参数**，且函数体第一句就是 `signal.throwIfAborted()` | `dsh-api-session-controller/src/index.ts:468-469` |
| E11 | `SessionPromptRequest = { requestId, sessionId, mode: 'queue' \| 'steer', content: PromptContentPart[], clientTimeZone? }`；文本块形状 `{ type: 'text', text }`；`SessionPromptValue = { accepted: true }` | `dsh-api-session-controller/src/types.ts:80-88`、`:324-337` |
| E12 | 内容没有非空白文本也没有附件时，`prompt` 抛 `gateway/bad-request` | `dsh-api-session-controller/src/index.ts:470-471` |
| E13 | 错误码 `session/workspace-attach-failed` 真实存在，`details` 的键是 `sessionId` 与 `workspaceId` | `dsh-api-session-controller/src/types.ts:199` |
| E14 | `SessionHeader.delegationDepth` 真实存在，缺省按 0 处理 | `@deepseek-ai/dsh-subagent/src/depth.ts:28-35` |
| E15 | 子代理服务名是 `subagents` | `dsh-subagent/src/index.ts:210` |
| E16 | `rootOf(caller): Agent` 的三个分支：调用者不是**同一个** live agent 实例 → 抛 `UNAUTHORIZED`/`subagent tree access requires the exact live caller`；调用者是 delegated（`origin === 'subagent'` 或有 own-seq 身份）或有 resident activation 而它的 root 不再 live → 抛 `UNAUTHORIZED`/`agent has no active runtime owner`；其余（普通顶层会话）→ **返回 caller 自身** | `dsh-subagent/src/manager.ts:509-522` |

**由 E5 + E4 得到的设计结论（v9 的核心简化）**：`Workspace.path` 存的是 `fs.realpath` 后的值，而 `create()` 又按 canonical 路径幂等。所以「有没有这个工作区」不需要我们自己做路径规范化比较——**直接调 `create(path)`，然后用调用前后的 id 集合差集判定它是新建还是复用**。v8 里那套 `resolve` + 小写比较既多余又会假红（大小写、尾斜杠、8.3 短名、junction 都能让字符串不等）。

## 1. What the User wants

> "另外那个会话间消息的插件，还可以给它加个功能，就是创建会话。甚至创建工作区。"

Scope: 让 Agent 在用户明确要求时新建一个顶层会话（可指定落在哪个工作区，工作区不存在时新建，可附带第一条消息），使用户不必离开当前会话就能把一件事交给一个干净的新会话。

## 2. Core Task and failure symptom

**Core Task**:
(a) Agent 能新建一个顶层会话，该会话进入某个工作区的 `sessionIds`，因此出现在侧栏且用户能点进去；
(b) 目标工作区可指定：给路径就交给 `workspaceRegistry.create` 解析（它幂等且按 realpath 规范化，已存在即复用、不存在即登记）；未给路径则落到调用者自己的**工作区**（先按 accounting 判定，再退回 cwd 相等）。输出必须区分「复用」与「新建」，且该标记**只由调用前后的 id 差集判定**；
(c) 可附带第一条消息，使新会话直接开工；空白消息视为没给；
(d) 子代理不得调用创建；
(e) 创建成功但后续步骤失败时，调用方必须在错误里拿到已创建的会话 id；若本次还新登记了工作区，错误里也要给出它的 id。

**Failure symptoms**:
- **S1**：新建的会话不出现在侧栏（未计入任何工作区的 `sessionIds`）。
- **S2**：给了路径却落到别的工作区；或非法路径仍建出会话。
- **S3**：子代理也能创建会话。
- **S4**：失败路径上报错没有会话 id；或「复用」与「新建」无法区分，或标记与实际不符。

## 3. Start instructions

1. **角色分工（先读这条）**：Step 0、Step 1、Step 2、Step 3、Step 4 的代码与单测**可以由任何 Agent 完成**，包括子代理。**A2–A8 必须在顶层会话里执行**：执行者的 `session.header` 不得有 `origin: 'subagent'`，也不得有非零 `delegationDepth`。若你被派来干活而拿到的活里含 A2–A8，就只做 Step 0–4 与 A1，把 A2–A8 的 Recipe 交回派你的顶层会话，**不得**把 A2–A8 记为通过。
2. 顺序：Step 0 → 1 → 2 → 3 → 4。前一步的完成测试不通过，不得开始下一步。
3. **Step 2 是硬闸**：创建必须走 `sessionController.create`，且回读必须证明「调用前不在、调用后在该工作区」。
4. **代码改完要重载才能验收**：插件是 profile 里的 junction，改仓库文件不需要写 profile，但 DSH 不会自动吃新代码。重载走 `plugin_manager` 的 `set_plugin`，`target` 填 `entryId`（形如 `include:<rowId>`），先 `enabled:false` 再 `enabled:true`，两次都返回 `application:"applied"`；或重启 DSH。重载后先确认 `create_session` 与 `list_workspaces` 出现在自己的工具列表里，再开始 A2。
5. **错误一律 `throw new Error('<文本>')`，文本不带 `error: ` 前缀**，与既有工具一致。**must not** 把错误文本当正常返回值返回。
6. 所有验收都在真实 DSH 上跑。验收会留下 **6 个会话**（A3 两个、A5 两个、A8 两个）与 **1 个新工作区**（A3 在 `%TEMP%` 下登记的）。每个 id 记入交付清单，由 User 在 GUI 删除。Agent must not 自行删除会话或工作区。
7. 卡住时：Step 0、Step 1 内部卡住自己换等价写法；Step 2 硬闸失败、profile 的 junction 断了需要写 `%USERPROFILE%\.dsh\profiles`、A6 红且原因是模型判断、A2 红且原因是会计滞后，就停下报告。
8. 对应关系：**Step 0 → 其自身完成测试**；**Step 1 → A1**；**Step 2 → A2、A3、A4、A7、A8**；**Step 3 → A5、A6**；**Step 4 → 交付清单**。

## 4. Steps

### Step 0 — 接线

1. 确认 profile 里 `dsh-session-mailbox` 是 `link:` 依赖：读 `<profile>/package.json` 的 `dependencies["dsh-session-mailbox"]`，值必须是 `link:<仓库根>/plugins/session-mailbox`。若不在或不是 `link:`，**停下报告**（接线要写 profile，需 User 一句确认；本仓库的做法是 `node scripts/link-plugins.mjs --apply`，它会自己备份）。
2. `package.json` **不需要加任何 `exports`**。`index.js` 用相对路径 `./lib/create.js` 引纯逻辑，v8 那条 `"./create": "./lib/create.js"` 是没人消费的死出口，v9 删掉。

**完成测试**（workdir = 仓库根，用 `git rev-parse --show-toplevel` 现取；取不到就用当前会话 cwd，并在执行记录里写明用了哪个）：

```powershell
node -e "import('./plugins/session-mailbox/index.js').then(() => console.log('entry-ok'), (e) => { console.error(e.message); process.exit(1) })"
```

输出 `entry-ok`、退出码 0。**然后**用 `plugin_manager` 的 `list_plugins` 确认 `dsh-session-mailbox` 那行 `enabled === true && installed === true`。

### Step 1 — 纯逻辑

代码在 `plugins/session-mailbox/`，不新建插件包。`lib/` 下用 `.js` 扩展名，与既有 `lib/pure.js` 一致。零依赖（只用 `node:path`）。

新增 `lib/create.js`，导出五个纯函数：

- `refusalFor(header)` → `undefined` 或 `'subagent'`。命中任一即 `'subagent'`：`header.origin === 'subagent'`；`typeof header.delegationDepth === 'number' && header.delegationDepth > 0`（字段名已由 E14 证实）。**must not** 用 `header.parentSession`。这一条只覆盖「header 自报是子代理」的情况，裸 header 的子代理由 Step 2 的 `subagents.rootOf` 判据兜住。
- `samePath(a, b)` → 规范化后比较：`resolve(a)` 与 `resolve(b)`，去掉尾部分隔符，`toLowerCase()` 后相等。只用于默认分支的 cwd 比较，**must not** 用它判定「注册表里有没有这个路径」（那是 E4 的活）。
- `pickDefaultWorkspace({ workspaces, callerCwd, callerSessionId })` → 显式嵌套，只有三条出口：
  1. `workspaces.find((w) => (w.sessionIds ?? []).map(String).includes(String(callerSessionId)))` 命中 → `{ ok: true, workspace: w }`；
  2. `callerCwd === undefined` → `{ ok: false, reason: 'no-cwd' }`；
  3. `workspaces.find((w) => samePath(w.path, callerCwd))` 命中 → `{ ok: true, workspace: w }`；未命中 → `{ ok: false, reason: 'no-workspace-for-caller' }`。
- `createdFromDiff(before, entityId)` → `!before.has(String(entityId))`。这是 Decision 8 的唯一实现，单独成函数以便单测。
- `promptContent(text)` → 去空白后为空即 `undefined`，否则 `[{ type: 'text', text: <原文> }]`（形状对齐 E11）。

新增 `test/create.test.mjs`，`node --test` 可跑，至少含这些 `console.log('CASE <name>')`：`CASE pick-by-accounting`、`CASE pick-by-cwd`、`CASE pick-no-cwd`、`CASE pick-no-workspace`、`CASE pick-accounting-first`（同时能命中 accounting 与 cwd 时取 accounting）、`CASE same-path-case`、`CASE same-path-trailing`、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE created-by-id-diff`、`CASE prompt-shape`。

**完成测试**：A1。

### Step 2 — 创建与工作区解析（硬闸）

`index.js` 的 `inject` 改为 `['tools', 'agents', 'systemPrompt', 'workspaceRegistry', 'sessionController', 'subagents']`（`subagents` 不能漏：漏了 `ctx.get('subagents')` 就是 `undefined`，`?.` 会把守卫静默跳过，见 AGENTS.md 的静默失败模式表）。schema 的 `required: true` 写在属性节点里，照既有 `list_sessions` 的写法。

`apply` 里加一条加载期自检（只警告不抛错，避免在没装 subagent bundle 的 profile 上加载即死）：

```js
if (ctx.get('subagents') === undefined) {
  ctx.logger?.warn?.('session-mailbox: the `subagents` service is unavailable; create_session will refuse instead of guessing')
}
```

#### 2.1 `list_workspaces`

参数 `{ workspace?: string }`。

- 每行 `<id> | <title> | <path> | sessions: <n>`，其中 `n = (w.sessionIds ?? []).length`。标题或路径里若含 `|` 原样输出、不转义（验收按行首 id 与行尾 `sessions: n` 定位）。**没有 `workspace` 参数时只输出这些行，不追加任何 `session:` 行。**
- 给了 `workspace`：先按 id 精确匹配（`String(w.id) === 值`），再按 `w.title === 值` 匹配；标题命中多于一者 → 抛 `ambiguous workspace: <值> (ids: <id1>,<id2>)`；都匹配不上 → 抛 `unknown workspace: <值>`。匹配上就在该行之后逐行追加 `session: <id>`。

```js
output: {
  schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
  render: (_args, value) => [{ type: 'text', text: value.text }],
},
```

`isConcurrencySafe: () => true`。

#### 2.2 `create_session`

参数 `{ path?: string, prompt?: string }`。

```js
output: {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessionId: { type: 'string', required: true },
      workspaceId: { type: 'string', required: true },
      workspaceTitle: { type: 'string', required: true },
      workspacePath: { type: 'string', required: true },
      workspaceCreated: { type: 'boolean', required: true },
      prompt: { type: 'string', required: true, enum: ['queued', 'none'] },
    },
  },
  render: (_args, v) => [{
    type: 'text',
    text: [
      'session id: ' + v.sessionId,
      'workspace: ' + v.workspaceTitle + ' (' + v.workspacePath + ') [' + (v.workspaceCreated ? 'created' : 'reused') + '] (id: ' + v.workspaceId + ')',
      'prompt: ' + v.prompt,
    ].join('\n'),
  }],
},
```

**唯一的返回点**在最后。执行顺序固定：

1. `exec.agent === undefined` → 抛 `create_session requires a calling agent`。
2. 子代理判定，命中任一即抛 `subagents cannot create sessions`：
   - `refusalFor(exec.agent.session.header) !== undefined`；
   - 否则 `const subagents = ctx.get('subagents')`；`subagents === undefined` → 抛 `create_session cannot verify the calling agent's subagent tree: the subagents service is unavailable`；否则 `let root; try { root = subagents.rootOf(exec.agent) } catch (error) { throw new Error('create_session cannot verify the calling agent\'s subagent tree: ' + (error instanceof Error ? error.message : String(error)) + '; refusing') }`，再 `if (root?.id !== undefined && String(root.id) !== String(exec.agent.id)) throw new Error('subagents cannot create sessions')`。
   按 E16，顶层会话拿到的就是它自己；抛错只发生在「调用者不是同一个 live agent 实例」与「delegated 但没有 live root」两种情形，**按子代理处理（拒绝而不是放任）**，但文案与子代理拒绝分开，免得把真实故障报成策略拒绝。
3. `path` 去空白后为空但参数出现 → 抛 `empty path: pass a directory path or omit it`。
4. `path` 给出时逐个判（回显一律用原样字符串），这些只是为了让错误文本可读——E4 说明 `create()` 自己也会拒相对/不存在/非目录：
   - 不是绝对路径 → 抛 `path must be absolute: <原样>`；
   - `statSync` 抛 `ENOENT`/`ENOTDIR` → 抛 `bad path: <原样>`；
   - 抛其它错 → 抛 `cannot read path: <code> <原样>`；
   - 存在但不是目录 → 抛 `not a directory: <原样>`。
   **must not** 创建目录。
5. `const registry = ctx.get('workspaceRegistry')`；`const before = new Set(registry.list().map((w) => String(w.id)))`。
6. 解析目标工作区：
   - `path` 给出 → `let entity; try { entity = await registry.create(path) } catch (error) { throw new Error('cannot create workspace: ' + (error instanceof Error ? error.message : String(error))) }`。**不要去 `list()` 里找路径、不要做规范化比较**——E4 已经保证同一 canonical 路径复用同一条记录。
   - `path` 未给 → `const picked = pure.pickDefaultWorkspace({ workspaces: registry.list(), callerCwd: exec.agent.session.header.cwd, callerSessionId: String(exec.agent.id) })`；`picked.ok !== true` 时按 `picked.reason` 抛：`'no-cwd'` → `no workspace for caller: the session header has no cwd`；`'no-workspace-for-caller'` → `no workspace for caller cwd: <callerCwd>`；其它 → `no workspace: <picked.reason>`。命中则 `entity = picked.workspace`。
7. `const created = createdFromDiff(before, entity.id)`（**无条件**调用，不看走了哪条分支，也不看 `create()` 的返回是不是新对象——E3/E5 说明可能拿到的是同一条既有记录）。
8. 记录快照：`const sessionIdsBefore = (entity.sessionIds ?? []).map(String)`（**必须 `.map(String)` 成数组快照**，`sessionIds` 是活账目，直接留引用会被后续变更带着走）。
9. 创建，失败时把原因绑成 `const reason = error instanceof Error ? error.message : String(error)`：
   ```js
   let sessionId
   try {
     ({ sessionId } = await ctx.get('sessionController').create({ workspaceId: entity.id }))
   } catch (error) {
     const reason = error instanceof Error ? error.message : String(error)
     const tail = created ? ' (workspace ' + entity.id + ' was created and holds no session)' : ''
     const attachedId = typeof error?.details?.sessionId === 'string' ? error.details.sessionId : undefined
     if (error?.code === 'session/workspace-attach-failed' && attachedId !== undefined) {
       throw new Error('create failed after the session existed: ' + attachedId + ' ' + reason + tail)
     }
     throw new Error('create failed: ' + reason + tail)
   }
   ```
   E8：`create` 只收对象参数、**没有 signal**，别传第二个参数。E13：错误码与 `details.sessionId`/`details.workspaceId` 都是真的。**must not** 仅凭 `details.sessionId` 存在就断定是本次创建；**must not** 传 `cwd`；**must not** 用 `agents.create`。
10. 回读硬闸（**只有这一段算数**）：
    ```js
    const after = ctx.get('workspaceRegistry').get(entity.id)
    if (after === undefined) throw new Error('workspace disappeared: ' + entity.id)
    const nowIds = (after.sessionIds ?? []).map(String)
    if (sessionIdsBefore.includes(String(sessionId)) || !nowIds.includes(String(sessionId))) {
      throw new Error('session not accounted: ' + sessionId)
    }
    ```
    **must not** 用第 5 步的 `workspaces` 或第 6 步的 `entity.sessionIds` 直接当回读结果——`before` 是快照，`entity` 是创建前的对象，拿它们比必然恒红。
11. `const content = promptContent(prompt)`；`let promptState = 'none'`，再按 Step 3 改写它。
12. 返回 `{ sessionId, workspaceId: String(entity.id), workspaceTitle: String(entity.title), workspacePath: String(entity.path), workspaceCreated: created, prompt: promptState }`。

`workspacePath` 一律取 `entity.path`（E5：那是 realpath 后的值，可能与用户输入拼写不同，这是正常的，不要「修正」）。

`create_session` **不声明** `isConcurrencySafe`（写操作，按非并发处理）。

**完成测试**：A2、A3、A4、A7、A8。

### Step 3 — 第一条消息

这一节只产出 `promptState`，**不新增返回点**。

- `content === undefined` → `promptState = 'none'`，不发请求。
- 否则 `await ctx.get('sessionController').prompt({ requestId: 'create-' + sessionId, sessionId, mode: 'queue', content }, exec.signal ?? new AbortController().signal)`：
  - 成功（返回 `{ accepted: true }`，E11）→ `promptState = 'queued'`；**signal 必须作为第二个位置参数传**（E10：函数体第一句就是 `signal.throwIfAborted()`，不传就是 TypeError）。
  - 失败 → `const reason = error instanceof Error ? error.message : String(error)`，抛 `prompt failed: <reason> (session <sessionId> was created and is visible; do not create it again)` + （`created` 为真时）` (workspace <entity.id> was created)`。**must not** 删除或重试创建。

同时给既有的 `MAILBOX_PROMPT` 增加一行：

```text
Create a session only when your user explicitly asks for one: create_session takes an optional workspace path and an optional first prompt, and it never creates directories or deletes anything.
```

**完成测试**：A5、A6。

### Step 4 — 交付

按 `AGENTS.md` 的硬规则收尾，v8 整段缺失：

1. 改 `index.js`、`package.json` 之前，把这两个文件复制到仓库根 `backups\`（文件名加 `-bak-<yyyymmdd-hhmmss>`）。
2. `git status --short --branch` 记基线；出现本次任务之外的未提交改动 → 停下报告，**不得** stash、不得丢弃。
3. `node --check plugins/session-mailbox/index.js` 退出码 0。
4. `node --test plugins/session-mailbox/test/*.test.mjs` 全绿（既有 22 条 + 新增 12 条）。
5. `plugins/session-mailbox/README.md`：工具表加 `list_workspaces` 与 `create_session` 两行；「已知边界」补三条——创建的会话落在指定工作区、不会被自动删除；空白 `prompt` 不会发起模型调用；子代理不可调用。
6. `package.json` 的 `version` 从 `0.4.0` 升到 `0.5.0`（行为变更升 minor），`git tag dsh-session-mailbox/v0.5.0`。
7. 一次提交，message `session-mailbox: add create_session and list_workspaces`；tag 随提交一起推。

## 5. No-go items

- **Locked (Decision 1)**: 改动落在既有插件 `dsh-session-mailbox`，不新建插件包。
- **Locked (Decision 2)**: 创建只走 `sessionController.create`；**must not** 用 `ctx.agents.create`，也 **must not** 用 `workspaceController.insertSessionBefore`。
- **Locked (Decision 3)**: `workspaceId` 与 `cwd` 只传一个；只传 `workspaceId`。
- **Locked (Decision 4)**: 不给新会话改名。
- **Locked (Decision 5)**: 路径非法只报错，不建目录、不建工作区；任何情况 must not 删除会话、工作区或目录（含 `rmdir`）。
- **Locked (Decision 6)**: 子代理判定 = header 命中 **或** `subagents.rootOf` 指向别人；**must not** 用 `parentSession`，也 **must not** 用「在不在 `agents.list()` 的顶层过滤里」。
- **Locked (Decision 7)**: `prompt` 必须带 `AbortSignal`，位置是第二个实参。
- **Locked (Decision 8)**: `created` 只由 `createdFromDiff(before, entity.id)` 决定，无条件调用。
- **Locked (Decision 9)**: 错误一律 throw 裸文本；`<reason>` 一律取 `error.message`。
- **Locked (Decision 10)**: 调用者工作区先 accounting 再 cwd，只用于「没给路径」的默认分支。
- **Locked (Decision 11)**: 两个工具都声明 `output.schema` + `render`，`required: true` 写在属性节点。
- **Locked (Decision 12)**: `list_workspaces({ workspace })` 先 id 后标题，标题歧义即抛。
- **Locked (Decision 13)**: 工作区复用/新建一律靠 id 差集判定，**must not** 在代码里做路径规范化匹配来「提前判断是否已存在」。
- 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：
- **执行 A2–A8 的必须是顶层会话**（见 §3 第 1 条）。若执行者是子代理，只做 A1，停下报告，**must not** 试图绕过。
- `workdir` 一律 = 仓库根，用 `git rev-parse --show-toplevel` 现取。
- 执行 A2–A8 的会话，其 `cwd` 必须落在某个已登记工作区里：先 `list_workspaces({})`，找含自己会话 id 的那一行，再 `pwd` 核对 path 相等。找不到就停下报告。
- `0` 表示返回 0 且输出与 Expected 一致。`expected-error` 表示工具报错且文本含引号内**确切**子串。
- 本方案**不创建任何目录或链接**。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/session-mailbox/test/create.test.mjs` | 0 | 输出含 `fail 0`；含 `pass <N>` 且 N ≥ 12；§Step 1 列的 12 个 `CASE ` 名各出现 ≥1 次；无 `ERR_MODULE_NOT_FOUND` |
| A2 | `list_workspaces({})` 记含自己会话 id 的那一行、其 id 记为 W、行数记为 k → `create_session({})` → `list_workspaces({ workspace: W })` | 0 | 第二次第二行为 `workspace: <W 的 title> (<W 的 path>) [reused] (id: W)`（title 与 path 必须与第一步那一行逐字一致，现取比对，不断言任何字面标题）；第三次比第一步多出一行 `session: <第二次的 sessionId>`；全程行数不变（仍 k） |
| A3 | `list_workspaces({})` 记行数 k → 取 `$env:TEMP` 展开后的实际路径 T（`Resolve-Path` 现取、回显原样），确认 `list_workspaces({})` 里没有任何一行的 path 规范化后等于 T；若已登记，停下让 User 给一个未登记目录 → `create_session({ path: T })` → 再 `create_session({ path: T })` → `list_workspaces({ workspace: <第一次返回的 workspaceId> })` → `list_workspaces({})` | 0 | 起点 k 且不含 T；第一次 `[created]`；第二次 `[reused]` 且 `workspace:` 行里的 id 与第一次完全相同；第四次该工作区 `sessions: 2` 并列出两个 `session:` 行；末尾行数 k+1 |
| A4 | `list_workspaces({})` 记 k → `list_workspaces({ workspace: <A2 的 W> })` 记会话集合 S → `create_session({ path: "" })` → `create_session({ path: "sync" })` → `create_session({ path: "C:\\nope-does-not-exist-xyz" })` → `create_session({ path: "<仓库根>\\plugins\\session-mailbox\\package.json" })` → `list_workspaces({ workspace: <A2 的 W> })` → `list_workspaces({})` → `Test-Path C:\nope-does-not-exist-xyz` | `expected-error` ×4 | 四次分别含 `empty path:`、`path must be absolute: sync`、`bad path: C:\nope-does-not-exist-xyz`、`not a directory: `；第五步 W 的 `session:` 集合与 S **完全相同**（证明非法路径没有建出会话）；第二步与第七步行数都仍 k；`Test-Path` 返回 `False` |
| A5 | `create_session({ prompt: "只回一个字：好" })` → 轮询 `session_event_search`（`event_types: ['user/message']`、`query: "只回一个字"`、`session_id: <上一步 sessionId>`），最多 30 秒、间隔 5 秒 → `create_session({ prompt: "   " })` → 对该第三个 `sessionId` 做一次 `session_event_search({ event_types: ['user/message'], session_id: <第三个 sessionId> })` | 0 | 第一次第三行 `prompt: queued`；轮询在 30 秒内命中 ≥1 条；第三次第三行 `prompt: none`；第四次结果为 0 条（证明空白 prompt 没发起模型调用）；两个 sessionId 记入交付清单 |
| A6 | `list_workspaces({})` 记工作区 id 集合与行数 → 逐工作区 `list_workspaces({ workspace: <每个 id> })` 记会话基线 → 派一个 subagent 令其调用 `create_session({})` → 逐工作区再展开一次 → `list_workspaces({})` | 0 | subagent 报告含 `subagents cannot create sessions`；前后**工作区 id 集合与行数完全相同**（防止新建一个工作区把会话藏进去）；且逐工作区的 `session:` 集合完全相同 |
| A7 | `list_workspaces({})` | 0 | 行数 ≥ 2；每行符合 `<id> \| <title> \| <path> \| sessions: <n>`；包含 A2 的 W 与 A3 新建的工作区 id；每行的 `sessions: <n>` 等于该行后随 `session:` 展开条数（对其中至少两个工作区各跑一次 `list_workspaces({ workspace: <id> })` 核对） |
| A8 | `create_session({ path: "<仓库根>\\" })` → `create_session({ path: "<仓库根>\\." })` → `list_workspaces({})` | 0 | 两次的 `workspace:` 行 id 相同（realpath 规范化后是同一个工作区）；第一次 `[reused]`（仓库根通常已登记；若为 `[created]` 则记下并继续）；第二次必须 `[reused]`；末尾行数不因第二次而增加 |

**A5 变红时如何区分两种成因**（写进执行记录，不进判定）：去 GUI 看那个会话里有没有「只回一个字：好」。有 → 是检索工具看不见刚建的会话（记盲点 `search-can-new-session`）；没有 → 是 prompt 没落地（真红）。

## 7. When to stop and ask

- Step 2 硬闸失败：第 10 步回读证明不了「调用前不在、调用后在该工作区」。
- Step 0 发现 profile 里没有 `dsh-session-mailbox` 的 `link:` 依赖，或 junction 已断（重连要写 `%USERPROFILE%\.dsh\profiles`）：报绝对路径等一句确认。
- 执行验收的会话是子代理，或它的 cwd 找不到对应工作区。
- A3 的目标目录已被登记，且 User 没给替代目录。
- A6 红且原因是模型判断而非工具拦截；或子代理根本没拿到这个工具。
- A2 红且 `list_workspaces` 显示会话确实进了 W，但回读判定失败（说明会计滞后，不是实现错）。
- 用户对「Agent 可以自己建会话」或「可以自己建工作区」改变主意。
- 出现需要删除会话才能收场的局面：停下，把 id 清单交给 User。

## 8. Blind Spot List

- **no-delete-api**：误建的会话只能由用户在 GUI 删。回到这里的条件：用户说「垃圾会话清不掉」。
- **failure-path-prose**：Core Task (e) 的两条错误串（attach 失败、prompt 失败）没有验收行能变红，只有文本。回到这里的条件：任一次真实失败，或用户要求加注入测试。
- **rootof-guard-uncovered**：`rootOf` 那半个判据（E16 的两个抛错分支）没有端到端覆盖——普通 subagent 的 header 就带 `origin: 'subagent'`，会先在 `refusalFor` 命中，A6 只证明 header 分支。回到这里的条件：出现一次「header 干净但 rootOf 指向别人」的真实调用。
- **search-can-new-session**：A5 依赖「检索工具能看见刚建的会话」。回到这里的条件：A5 变红且 GUI 里能看到那条消息。
- **prompt-needs-live-session**：未验证「刚创建、从未打开的会话能否直接 `prompt`」。回到这里的条件：A5 报 `prompt failed:` 而会话确实存在。
- **eacces-prose**：`EACCES` 分支只有文本。回到这里的条件：真的遇到读不到的路径。
- **concurrent-registration**：第 5 步快照与第 6 步 create 之间若有别人登记同一目录，会报 `[created]`。方向无害。回到这里的条件：用户看到「新建」的其实是界面上刚建的。
- **title-blank**：不传 prompt 时新会话显示为空白。回到这里的条件：用户连续两次认不出哪个是他刚让建的。
- **prompt-cost**：`prompt` 会真的发起一轮模型调用并跑工具。回到这里的条件：出现「只是建个会话怎么就开始跑了」。
- **recursion-prose**：跨顶层会话自繁殖只靠提示词一行约束。回到这里的条件：出现一次未经用户要求的创建。
- **cwd-fallback-coverage**：默认分支的 cwd 相等出口只有单测覆盖，A2 正常走 accounting。回到这里的条件：某台机器会计滞后导致 A2 走到该分支。
- **archived-grouping**：建在已归档会话所在工作区时的分组表现未验证。回到这里的条件：用户说新会话出现在「已归档」里。
- **workspace-title-dup**：`Workspace.title` 默认取路径末段，不同目录可以同名（E5）。`list_workspaces({ workspace })` 按标题匹配时会同名歧义报错，这是设计如此；但 A2 依赖「含自己会话 id 的那一行」来定位 W，天然避开歧义。回到这里的条件：用户抱怨按标题找不到工作区。
