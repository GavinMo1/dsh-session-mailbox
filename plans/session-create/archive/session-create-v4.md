# session-create v4 — Work Plan

Version v4. This plan is self-contained. The implementation does not read the review record.
（v4 相对 v3 只做收口：新建/复用的判定在两条分支上都有定义、调用者工作区先按 accounting 找、attach 失败按错误码识别、验收补一条别名用例并改用集合比较、明确验收会话的 cwd。步骤数仍为 4。）

## 1. What the User wants

> "另外那个会话间消息的插件，还可以给它加个功能，就是创建会话。甚至创建工作区。"

Scope: 让 Agent 在用户明确要求时新建一个顶层会话（可指定落在哪个工作区、工作区不存在时新建，可附带第一条消息），使用户不必离开当前会话就能把一件事交给一个干净的新会话。

## 2. Core Task and failure symptom

**Core Task**:
(a) Agent 能新建一个顶层会话，该会话进入某个工作区的 `sessionIds`，因此出现在侧栏且用户能点进去；
(b) 目标工作区可指定：给路径且已登记 → 复用；给路径但该目录尚无工作区 → 先登记该工作区再落；未给路径 → 落到调用者自己的**工作区**（先按 accounting 判定，再退回 cwd 相等）。输出必须区分「复用」与「新建」，且该标记只由 id 差集判定；
(c) 可附带第一条消息，使新会话直接开工；空白消息视为没给；
(d) 子代理不得调用创建；
(e) 创建成功但后续步骤失败时，调用方必须在错误里拿到已创建的会话 id；若本次还新登记了工作区，错误里也要给出它的 id。

**Failure symptoms**（任一成立即未达成）:
- **S1**：新建的会话不出现在侧栏（未计入任何工作区的 `sessionIds`）。
- **S2**：给了路径却落到别的工作区；或非法路径（空、相对、不存在、不是目录、读不到）仍建出会话。
- **S3**：子代理也能创建会话。
- **S4**：失败路径上报错没有会话 id；或「复用」与「新建」无法区分，或标记与实际不符。

## 3. Start instructions

1. 顺序：Step 0 → 1 → 2 → 3。前一步的完成测试不通过，不得开始下一步。
2. **Step 2 是硬闸**：创建必须走 `sessionController.create`，且回读必须证明「调用前不在、调用后在该工作区」。
3. **代码改完要重载才能验收**：插件是 profile 里的 junction（`profiles/desktop/node_modules/dsh-session-mailbox` → 本仓库目录），改工作区文件不需要写 profile，但 DSH 不会自动吃新代码，必须重启 DSH。重启后先确认 `create_session` 出现在自己的工具列表里，再开始 A2。
4. **错误一律 `throw new Error('<文本>')`，文本不带 `error: ` 前缀**，与既有工具一致（`index.js` 里 `throw new Error('send_session_message requires a calling agent')`）。**must not** 把错误文本当正常返回值返回。
5. 所有验收都在真实 DSH 上跑，没有隔离环境。每创建一次就记下返回的 sessionId（以及新登记的工作区 id）；验收结束后把这份清单交给 User，由 User 在 GUI 删除。Agent must not 自行删除会话或工作区。
6. 卡住时：Step 0、Step 1 内部卡住自己换等价写法；Step 2 硬闸失败、junction 断了需要写 `C:\Users\<user>\.dsh\profiles`、A6 红且原因是模型判断时，停下报告。
7. 对应关系：**Step 0 → 其自身完成测试**；**Step 1 → A1**；**Step 2 → A2、A3、A4、A7**；**Step 3 → A5、A6**。

## 4. Steps

### Step 0 — 接线

在 `dsh-plugins/plugins/session-mailbox/package.json` 的 `exports` 加一条 `"./create": "./lib/create.js"`。确认 profile 里 `dsh-session-mailbox` 仍是 `link:` 依赖、其 `node_modules` 项是指向本仓库的 junction；若已断，停下报告。

**完成测试**（在 `C:\Users\ruike\Documents\dsh-plugins` 下执行，此时 `lib/create.js` 还不必存在）：

```powershell
node -e "console.log(JSON.parse(require('node:fs').readFileSync('plugins/session-mailbox/package.json','utf8')).exports['./create'])"
```

输出必须是 `./lib/create.js`。

### Step 1 — 纯逻辑

代码在 `dsh-plugins/plugins/session-mailbox/`，不新建插件包。`lib/` 下用 `.js` 扩展名，与既有 `lib/pure.js` 一致。

新增 `lib/create.js`（零依赖纯函数；只用 `node:path`）：

- `refusalFor(header)` → `undefined` 或 `'subagent'`。命中任一即返回 `'subagent'`：`header.origin === 'subagent'`；`typeof header.delegationDepth === 'number' && header.delegationDepth > 0`。**must not** 用 `header.parentSession`。
- `pickWorkspace({ target, workspaces, callerCwd, callerSessionId })`（参数名用 `target`，避开模块名 `path`）：
  - `target` 省略时**先按 accounting 找**：`workspaces.find(w => (w.sessionIds ?? []).includes(callerSessionId))`；命中 → `{ ok: true, workspace, create: false }`。
  - 没命中且 `callerCwd` 为 `undefined` → `{ ok: false, reason: 'no-cwd' }`。
  - 没命中则按 cwd 相等找（`resolve` + 小写比较）；命中 → `{ ok: true, workspace, create: false }`，未命中 → `{ ok: false, reason: 'no-workspace-for-caller' }`。
  - `target` 不是绝对路径 → `{ ok: false, reason: 'not-absolute' }`。
  - `target` 规范化后命中 → `{ ok: true, workspace, create: false }`；未命中 → `{ ok: true, create: true, path: <规范化后的绝对路径> }`。
- `promptContent(text)` → 去空白后为空即 `undefined`，否则 `[{ type: 'text', text: <原文> }]`。

新增 `test/create.test.mjs`，`node --test` 可跑，至少含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-by-accounting`、`CASE pick-no-cwd`、`CASE pick-not-absolute`、`CASE pick-unregistered`、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE prompt-shape`。

**完成测试**：A1。

### Step 2 — 创建与工作区解析（硬闸）

在 `index.js` 的 `apply` 里注册两个新工具，`inject` 增加 `'sessionController'`。

`list_workspaces`（只读，写 `isConcurrencySafe: () => true`）：读 `ctx.get('workspaceRegistry').list()`，每行 `<id> | <title> | <path> | sessions: <n>`。

`create_session({ path?, prompt? })`，执行顺序固定（任一失败即抛出并结束）：

1. `exec.agent === undefined` → 抛 `create_session requires a calling agent`。
2. `refusalFor(exec.agent.session.header)` 为 `'subagent'` → 抛 `subagents cannot create sessions`（在创建之前，对齐 S3）。
3. `path` 去空白后为空但参数出现 → 抛 `empty path: pass a directory path or omit it`。**must not** 把空串当成省略。
4. `path` 给出时逐个判（回显一律用**原样字符串**）：
   - 不是绝对路径 → 抛 `path must be absolute: <原样>`。
   - `statSync` 抛 `ENOENT` / `ENOTDIR` → 抛 `bad path: <原样>`。
   - `statSync` 抛其它错 → 抛 `cannot read path: <code> <原样>`。
   - 存在但不是目录 → 抛 `not a directory: <原样>`。
   - **must not 创建目录**（对齐 S2）。
5. **先取快照**（在任何分支之前）：`before = new Set(ctx.get('workspaceRegistry').list().map(w => String(w.id)))`。
6. `pickWorkspace({ target: path, workspaces, callerCwd: exec.agent.session.header.cwd, callerSessionId: String(exec.agent.id) })`：
   - `reason: 'no-cwd'` → 抛 `no workspace for caller: the session header has no cwd`。
   - `reason: 'no-workspace-for-caller'` → 抛 `no workspace for caller cwd: <callerCwd>`。
   - 返回 `{ ok: true, workspace }`（复用分支）→ `entity = workspace`、`created = false`。
   - 返回 `{ ok: true, create: true, path }`（新建分支）→ `entity = await ctx.get('workspaceRegistry').create(path)`；抛错则抛 `cannot create workspace: <reason>`。
7. **判定新建还是复用只看 id 差集**：新建分支里 `created = !before.has(String(entity.id))`；复用分支恒为 `false`。**must not** 用「走了新建分支」当作新建的证据（`workspaceRegistry.create` 对同一 canonical 路径会返回既有实体）。
8. **快照 sessionIds**：记下 `entity.sessionIds` 的当前内容（用于第 10 步）。
9. `sessionController.create({ workspaceId: entity.id })`，包在 try 里：
   - `error.code === 'session/workspace-attach-failed'` → 抛 `create failed after the session existed: <error.details.sessionId> <reason>`；`created` 为真时追加 ` (workspace <entity.id> was created and holds no session)`。
   - 其它抛错 → 抛 `create failed: <reason>`；`created` 为真时追加 ` (workspace <entity.id> was created and holds no session)`。
   - **must not** 仅凭 `details.sessionId` 存在就断定是本次创建（`session/conflict` 等错误也带 sessionId）。
   - **must not** 传 `cwd`；**must not** 用 `agents.create`。
10. 回读 `ctx.get('workspaceRegistry').list()` 里该工作区的 `sessionIds`：新 id 必须「第 8 步快照里没有」且「现在有」。不满足 → 抛 `session not accounted: <id>`（对齐 S1）。

成功返回三行：

```text
session id: <id>
workspace: <title> (<path>) [created|reused]
prompt: queued|none
```

**完成测试**：A2、A3、A4、A7。

### Step 3 — 第一条消息

`promptContent(prompt)` 为 `undefined` → 成功返回 `prompt: none`，不发任何请求。

否则：

1. `await sessionController.prompt(request, exec.signal ?? new AbortController().signal)`，`request` 为 `{ requestId: 'create-' + <sessionId>, sessionId, mode: 'queue', content }`。**signal 必须传**：该方法第一个语句是 `signal.throwIfAborted()`。
2. 成功 → `prompt: queued`。
3. 失败 → 抛 `prompt failed: <reason> (session <id> was created and is visible; do not create it again)`。**must not 删除或重试创建**。

同时给既有的提示词块 `MAILBOX_PROMPT` 增加一行：

```text
Create a session only when your user explicitly asks for one: create_session takes an optional workspace path and an optional first prompt, and it never creates directories or deletes anything.
```

**完成测试**：A5、A6。

## 5. No-go items

- **Locked (Decision 1)**: 改动落在既有插件 `dsh-plugins/plugins/session-mailbox`，不新建插件包。
- **Locked (Decision 2)**: 创建只走 `sessionController.create`；**must not** 用 `ctx.agents.create`，也 **must not** 用 `workspaceController.insertSessionBefore` 补登记。
- **Locked (Decision 3)**: `workspaceId` 与 `cwd` 只传一个；只传 `workspaceId`。
- **Locked (Decision 4)**: 不给新会话改名。
- **Locked (Decision 5)**: 路径非法只报错，不建目录、不建工作区；任何情况下 must not 删除会话或工作区。
- **Locked (Decision 6)**: 子代理判定用 `origin === 'subagent'` 或 `delegationDepth > 0`；不用 `parentSession`。
- **Locked (Decision 7)**: `prompt` 必须带 `AbortSignal`。
- **Locked (Decision 8)**: `[created|reused]` 与错误尾巴里的「was created」只由 id 差集判定，两条分支都要给出定义。
- **Locked (Decision 9)**: 错误一律 throw 裸文本，不带 `error: ` 前缀。
- **Locked (Decision 10)**: 调用者工作区先按 `sessionIds` 含该会话 id 找，找不到再按 cwd 相等找。
- 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：
- `workdir` 一律 `C:\Users\ruike\Documents\dsh-plugins`。
- 执行 A2–A7 的会话，其 `cwd` 必须等于 `default-workspace` 的 `path`（先用 `list_workspaces` 读出该路径，再用 `pwd` 核对）。不相等就停下报告，**must not** 改测试去迁就。
- `0` 表示返回 0 且输出与 Expected 一致。`expected-error` 表示工具报错且文本含引号内**确切**子串（不含 `error: ` 前缀）。
- A2、A3、A5 会真实创建会话（A5 两个）与一个工作区，其 id 必须记入交付清单。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/session-mailbox/test/create.test.mjs` | 0 | 含 `ℹ fail 0`；`ℹ pass N` 且 N ≥ 10；含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-by-accounting`、`CASE pick-no-cwd`、`CASE pick-not-absolute`、`CASE pick-unregistered`、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE prompt-shape`；无 `ERR_MODULE_NOT_FOUND` |
| A2 | `list_workspaces({})` → `create_session({})` → `list_sessions({})` → `list_workspaces({})` | 0 | 第一次含 `default-workspace` 一行；第二次第二行为 `workspace: default-workspace (<该工作区路径>) [reused]`；第三次输出含第二次的 `<id>`，状态 `inactive`；第四次 `default-workspace` 那一行**包含该 id**（不比较计数） |
| A3 | `list_workspaces({})` 确认目标目录未登记（取 `C:\Users\ruike\AppData\Local\Temp`；若已登记，停下让 User 给一个未登记目录，原样使用，且若 Step 7 判出 `created=false` 就按已登记处理、停下要新目录）→ `create_session({ path: <该目录> })` → `list_workspaces({})` → `create_session({ path: <该目录> })` → `New-Item -ItemType Junction -Path "$env:TEMP\umlink" -Target "$env:TEMP"` → `create_session({ path: "$env:TEMP\umlink" 的实际路径 })` → `list_workspaces({})` | 0 | 行数 k（不含该目录）；第二次 `[created]`；第三次 k+1 且新行含第二次的 id；第四次 `[reused]`；第五次也 `[reused]` 且第二行的工作区路径与第四次那道行的 path 相同（别名不产生第二个工作区）；末尾行数 k+1。收尾把 `umlink` 送入回收站 |
| A4 | `list_workspaces({})` 记行数 k → `create_session({ path: "" })` → `create_session({ path: "sync" })` → `create_session({ path: "C:\\nope-does-not-exist-xyz" })` → `create_session({ path: "C:\\Users\\ruike\\.agents\\user-model\\README.md" })` → `list_workspaces({})` | `expected-error` ×4 | 四次分别含 `empty path:`、`path must be absolute: sync`、`bad path: C:\nope-does-not-exist-xyz`、`not a directory: `；末尾行数仍为 k；`C:\nope-does-not-exist-xyz` 未被创建 |
| A5 | `create_session({ prompt: "只回一个字：好" })` → `session_event_search`（`event_types: ['user/message']`、`query: "只回一个字"`、`session_id: <上一步的 id>`）→ `create_session({ prompt: "   " })` | 0 | 第一次第三行 `prompt: queued`；检索命中 ≥1 条；第三次第三行 `prompt: none`；两个新 id 都记入交付清单 |
| A6 | 派一个 subagent，令其调用 `create_session({})`；前后各 `list_workspaces({})` | `expected-error` | 工具报 `subagents cannot create sessions`；**逐工作区比较 id 集合**，前后完全相同（不比较 `sessions:` 之和） |
| A7 | `list_workspaces({})` | 0 | 至少 8 行；每行含 `\|` 分隔的 id、title、path、`sessions: <n>`；含 `default-workspace` 与 `sync` 两行 |

## 7. When to stop and ask

- Step 2 硬闸失败：第 10 步的回读证明不了「调用前不在、调用后在该工作区」。
- Step 0 发现 profile 的 junction 已断（重连要写 `C:\Users\<user>\.dsh\profiles`）：报绝对路径等一句确认。
- 执行验收的会话 cwd 与 `default-workspace` 的 path 不相等。
- A3 的目标目录已被登记，且 User 没给替代目录。
- A6 红且原因是模型判断而非工具拦截；或子代理根本没拿到这个工具。
- 用户对「Agent 可以自己建会话」或「可以自己建工作区」改变主意。
- 出现需要删除会话才能收场的局面（无删除 API）：停下，把 id 清单交给 User。

## 8. Blind Spot List

- **no-delete-api**：误建的会话只能由用户在 GUI 删。回到这里的条件：用户说「垃圾会话清不掉」。
- **eacces-prose**：`EACCES` 分支只有文本、没有验收行能把它变红。回到这里的条件：真的遇到读不到的路径。
- **concurrent-registration**：第 5 步快照与第 6 步 create 之间，别的会话或 GUI 若登记了同一目录，本次会报 `[created]`。方向无害（不会把新建说成复用）。回到这里的条件：用户看到「新建」的工作区其实是刚在界面上建的。
- **title-blank**：不传 prompt 时新会话显示为空白。回到这里的条件：用户连续两次认不出哪个是他刚让建的。
- **prompt-cost**：`prompt` 会真的发起一轮模型调用并跑工具。回到这里的条件：出现「只是建个会话怎么就开始跑了」。
- **recursion-prose**：跨顶层会话自繁殖只靠提示词一行约束。回到这里的条件：出现一次未经用户要求的创建。
- **workspace-path-case**：别名（junction、8.3 短名）拼写的 path 与 `list_workspaces` 显示的可能不同；A3 第五次调用覆盖了「别名不产生第二个工作区」，但不覆盖显示串。回到这里的条件：用户说「我给的路径和显示的不一样」。
- **archived-grouping**：建在已归档会话所在工作区时的分组表现未验证。回到这里的条件：用户说新会话出现在「已归档」里。
