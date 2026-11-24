# session-create v5 — Work Plan

Version v5. This plan is self-contained. The implementation does not read the review record.
（v5 相对 v4 补齐工具契约与 id 绑定：两个工具的 `output.schema`/`render` 写全、`list_workspaces` 增加按工作区展开会话 id、`create` 的返回值显式解构、验收改成可机械判定的形式、junction 那步纳入停止项。步骤数仍为 4。）

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
3. **代码改完要重载才能验收**：插件是 profile 里的 junction，改工作区文件不需要写 profile，但 DSH 不会自动吃新代码，必须重启 DSH。重启后先确认 `create_session` 出现在自己的工具列表里，再开始 A2。
4. **错误一律 `throw new Error('<文本>')`，文本不带 `error: ` 前缀**，与既有工具一致。**must not** 把错误文本当正常返回值返回。
5. 所有验收都在真实 DSH 上跑，没有隔离环境。验收会留下 **6 个空白会话**（A2 一个、A3 三个、A5 两个）与 **1 个工作区**；每个 id 都要记入交付清单，由 User 在 GUI 删除。Agent must not 自行删除会话或工作区。
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
  - `target` 省略时先按 accounting 找：`workspaces.find(w => (w.sessionIds ?? []).includes(callerSessionId))`；命中 → `{ ok: true, workspace, create: false }`。
  - 没命中且 `callerCwd` 为 `undefined` → `{ ok: false, reason: 'no-cwd' }`。
  - 没命中则按 cwd 相等找（`resolve` + 小写比较）；命中 → `{ ok: true, workspace, create: false }`；未命中 → `{ ok: false, reason: 'no-workspace-for-caller' }`。
  - `target` 不是绝对路径 → `{ ok: false, reason: 'not-absolute' }`。
  - `target` 规范化后命中 → `{ ok: true, workspace, create: false }`；未命中 → `{ ok: true, create: true, path: <规范化后的绝对路径> }`。
- `promptContent(text)` → 去空白后为空即 `undefined`，否则 `[{ type: 'text', text: <原文> }]`。

新增 `test/create.test.mjs`，`node --test` 可跑，至少含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-by-accounting`、`CASE pick-no-cwd`、`CASE pick-not-absolute`、`CASE pick-unregistered`、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE prompt-shape`。

**完成测试**：A1。

### Step 2 — 创建与工作区解析（硬闸）

在 `index.js` 的 `apply` 里注册两个新工具，`inject` 增加 `'sessionController'`。

#### 2.1 `list_workspaces`

参数：`{ workspace?: string }`（工作区 id 或标题；给了就额外展开该工作区的会话 id）。

```js
parameters: {
  workspace: { type: 'string', description: 'Workspace id or title. When given, that workspace\'s session ids are listed too.' },
},
output: {
  schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
  render: (_args, value) => [{ type: 'text', text: value.text }],
},
```

正文：每行 `<id> | <title> | <path> | sessions: <n>`；给了 `workspace` 时，在该行之后逐行追加 `session: <id>`。标题或 id 都匹配不上 → 抛 `unknown workspace: <值>`。写 `isConcurrencySafe: () => true`。

#### 2.2 `create_session`

参数：`{ path?: string, prompt?: string }`。

```js
output: {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      sessionId: { type: 'string', required: true },
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
      'workspace: ' + v.workspaceTitle + ' (' + v.workspacePath + ') [' + (v.workspaceCreated ? 'created' : 'reused') + ']',
      'prompt: ' + v.prompt,
    ].join('\n'),
  }],
},
```

`workspacePath` 取 `entity.path`（注册表里的 canonical 串），不是调用方输入的串。

执行顺序固定（任一失败即抛出）：

1. `exec.agent === undefined` → 抛 `create_session requires a calling agent`。
2. `if (refusalFor(exec.agent.session.header) !== undefined) throw new Error('subagents cannot create sessions')`（判据非空即拒，**must not** 只判 `=== 'subagent'`）。
3. `path` 去空白后为空但参数出现 → 抛 `empty path: pass a directory path or omit it`。
4. `path` 给出时逐个判（回显一律用原样字符串）：
   - 不是绝对路径 → 抛 `path must be absolute: <原样>`；
   - `statSync` 抛 `ENOENT` / `ENOTDIR` → 抛 `bad path: <原样>`；
   - `statSync` 抛其它错 → 抛 `cannot read path: <code> <原样>`；
   - 存在但不是目录 → 抛 `not a directory: <原样>`。
   - **must not 创建目录**。
5. `const workspaces = ctx.get('workspaceRegistry').list()`；`const before = new Set(workspaces.map(w => String(w.id)))`（在任何分支之前）。
6. `pickWorkspace({ target: path, workspaces, callerCwd: exec.agent.session.header.cwd, callerSessionId: String(exec.agent.id) })`：
   - `'no-cwd'` → 抛 `no workspace for caller: the session header has no cwd`；
   - `'no-workspace-for-caller'` → 抛 `no workspace for caller cwd: <callerCwd>`；
   - `{ ok: true, workspace }` → `let entity = workspace; let created = false`；
   - `{ ok: true, create: true, path }` → `entity = await ctx.get('workspaceRegistry').create(path)`（抛错则抛 `cannot create workspace: <reason>`），随后 `created = !before.has(String(entity.id))`。
7. `const sessionIdsBefore = (entity.sessionIds ?? []).map(String)`。
8. `const { sessionId } = await ctx.get('sessionController').create({ workspaceId: entity.id })`，包在 try 里：
   - `error.code === 'session/workspace-attach-failed'` → 抛 `create failed after the session existed: <error.details.sessionId> <reason>` + （`created` 为真时）` (workspace <entity.id> was created and holds no session)`；
   - 其它抛错 → 抛 `create failed: <reason>` + 同样的尾巴。
   - **must not** 仅凭 `details.sessionId` 存在就断定是本次创建；**must not** 传 `cwd`；**must not** 用 `agents.create`。
9. 回读该工作区的 `sessionIds`：`sessionId` 必须「`sessionIdsBefore` 里没有」且「现在有」，否则抛 `session not accounted: <sessionId>`。
10. 返回 `{ sessionId, workspaceTitle: String(entity.title), workspacePath: String(entity.path), workspaceCreated: created, prompt: queued ? 'queued' : 'none' }`（`prompt` 见 Step 3）。

**完成测试**：A2、A3、A4、A7。

### Step 3 — 第一条消息

`promptContent(prompt)` 为 `undefined` → 直接返回 `prompt: 'none'`，不发请求。

否则 `await ctx.get('sessionController').prompt({ requestId: 'create-' + sessionId, sessionId, mode: 'queue', content }, exec.signal ?? new AbortController().signal)`。

- 成功 → `prompt: 'queued'`。**signal 必须传**：该方法第一句是 `signal.throwIfAborted()`。
- 失败 → 抛 `prompt failed: <reason> (session <sessionId> was created and is visible; do not create it again)`。**must not 删除或重试创建**。

同时给既有的 `MAILBOX_PROMPT` 增加一行：

```text
Create a session only when your user explicitly asks for one: create_session takes an optional workspace path and an optional first prompt, and it never creates directories or deletes anything.
```

**完成测试**：A5、A6。

## 5. No-go items

- **Locked (Decision 1)**: 改动落在既有插件 `dsh-session-mailbox`，不新建插件包。
- **Locked (Decision 2)**: 创建只走 `sessionController.create`；**must not** 用 `ctx.agents.create`，也 **must not** 用 `workspaceController.insertSessionBefore`。
- **Locked (Decision 3)**: `workspaceId` 与 `cwd` 只传一个；只传 `workspaceId`。
- **Locked (Decision 4)**: 不给新会话改名。
- **Locked (Decision 5)**: 路径非法只报错，不建目录、不建工作区；任何情况 must not 删除会话或工作区。
- **Locked (Decision 6)**: 子代理判定命中任一即拒，判据是 `origin` 与 `delegationDepth`，不用 `parentSession`。
- **Locked (Decision 7)**: `prompt` 必须带 `AbortSignal`。
- **Locked (Decision 8)**: `[created|reused]` 与错误尾巴只由 id 差集判定，两条分支都要有定义。
- **Locked (Decision 9)**: 错误一律 throw 裸文本。
- **Locked (Decision 10)**: 调用者工作区先按 `sessionIds` 含该会话 id 找，再退回 cwd 相等。
- **Locked (Decision 11)**: 两个工具都必须声明 `output.schema` 与 `render`，形状照 Step 2。
- 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：
- `workdir` 一律 `C:\Users\ruike\Documents\dsh-plugins`。
- 执行 A2–A7 的会话，其 `cwd` 必须等于 `default-workspace` 的 `path`（先 `list_workspaces` 读出、再 `pwd` 核对）。不相等就停下报告，**must not** 改测试。
- `0` 表示返回 0 且输出与 Expected 一致。`expected-error` 表示工具报错且文本含引号内**确切**子串。
- A3 的 junction 一步属项目根外写入：执行前报出绝对路径并等 User 一句确认；拆除只把链接本身送入回收站（`DeleteFile` 对 junction 用 `DeleteDirectory` 且不带 `-Recurse` 语义），**must not** 触碰目标目录。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/session-mailbox/test/create.test.mjs` | 0 | 含 `ℹ fail 0`；`ℹ pass N` 且 N ≥ 10；含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-by-accounting`、`CASE pick-no-cwd`、`CASE pick-not-absolute`、`CASE pick-unregistered`、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE prompt-shape`；无 `ERR_MODULE_NOT_FOUND` |
| A2 | `list_workspaces({ workspace: "default-workspace" })` → `create_session({})` → `list_sessions({})` → `list_workspaces({ workspace: "default-workspace" })` | 0 | 第二次第二行为 `workspace: default-workspace (<该工作区 path>) [reused]`；第三次输出含第二次的 `sessionId` 与状态 `inactive`；第四次输出多出一行 `session: <该 sessionId>` |
| A3 | `list_workspaces({})` 确认目标目录未登记（取 `C:\Users\ruike\AppData\Local\Temp`；若已登记，停下让 User 给未登记目录，或若第 6 步判出 `created=false` 就按已登记处理、停下要新目录）→ `create_session({ path: <该目录> })` → `list_workspaces({})` → `create_session({ path: <该目录> })` → 建 junction `<该目录>\umlink` → `create_session({ path: "<该目录>\\umlink" })` → `list_workspaces({ workspace: <第二次返回的工作区标题> })` | 0 | 行数 k（不含该目录）；第二次 `[created]`；第三次 k+1；第四次 `[reused]`；第五次 `[reused]` 且 `workspace:` 行的 path 与第四次完全相同；第六次该工作区行 `sessions: 3` 且列出三个 `session:` 行；末尾行数仍 k+1 |
| A4 | `list_workspaces({})` 记行数 k → `create_session({ path: "" })` → `create_session({ path: "sync" })` → `create_session({ path: "C:\\nope-does-not-exist-xyz" })` → `create_session({ path: "C:\\Users\\ruike\\.agents\\user-model\\README.md" })` → `list_workspaces({})` | `expected-error` ×4 | 四次分别含 `empty path:`、`path must be absolute: sync`、`bad path: C:\nope-does-not-exist-xyz`、`not a directory: `；末尾行数仍为 k；`C:\nope-does-not-exist-xyz` 未被创建 |
| A5 | `create_session({ prompt: "只回一个字：好" })` → 轮询 `session_event_search`（`event_types: ['user/message']`、`query: "只回一个字"`、`session_id: <上一步的 sessionId>`），最多 30 秒、每次间隔 5 秒，命中即停 → `create_session({ prompt: "   " })` | 0 | 第一次第三行 `prompt: queued`；轮询在 30 秒内命中 ≥1 条；第三次第三行 `prompt: none`；两个 sessionId 都记入交付清单 |
| A6 | 派一个 subagent，令其调用 `create_session({})`；前后各 `list_workspaces({})` | 0 | subagent 的报告含 `subagents cannot create sessions`；**逐工作区的 `session:` 集合**与调用前完全相同（不比较 `sessions:` 之和） |
| A7 | `list_workspaces({})` | 0 | 至少 8 行；每行含 `\|` 分隔的 id、title、path 与 `sessions: <n>`；含 `default-workspace` 与 `sync` 两行 |

## 7. When to stop and ask

- Step 2 硬闸失败：第 9 步的回读证明不了「调用前不在、调用后在该工作区」。
- Step 0 发现 profile 的 junction 已断（重连要写 `C:\Users\<user>\.dsh\profiles`）：报绝对路径等一句确认。
- 执行验收的会话 cwd 与 `default-workspace` 的 path 不相等。
- A3 的目标目录已被登记，且 User 没给替代目录。
- A3 要在 `%TEMP%` 下建 junction：报绝对路径等一句确认（项目根外写入 + 链接创建）。
- A6 红且原因是模型判断而非工具拦截；或子代理根本没拿到这个工具。
- 用户对「Agent 可以自己建会话」或「可以自己建工作区」改变主意。
- 出现需要删除会话才能收场的局面：停下，把 id 清单交给 User。

## 8. Blind Spot List

- **no-delete-api**：误建的会话只能由用户在 GUI 删。回到这里的条件：用户说「垃圾会话清不掉」。
- **eacces-prose**：`EACCES` 分支只有文本、没有验收行能变红。回到这里的条件：真的遇到读不到的路径。
- **concurrent-registration**：第 5 步快照与第 6 步 create 之间若有别人登记同一目录，本次会报 `[created]`。方向无害。回到这里的条件：用户看到「新建」的其实是刚在界面上建的。
- **title-blank**：不传 prompt 时新会话显示为空白。回到这里的条件：用户连续两次认不出哪个是他刚让建的。
- **prompt-cost**：`prompt` 会真的发起一轮模型调用并跑工具。回到这里的条件：出现「只是建个会话怎么就开始跑了」。
- **recursion-prose**：跨顶层会话自繁殖只靠提示词一行约束。回到这里的条件：出现一次未经用户要求的创建。
- **cwd-fallback-coverage**：`pick-default` 的 cwd 相等分支只有单测覆盖，端到端不会走到（A2 走 accounting 分支）。回到这里的条件：某台机器的 `sessionIds` 会计滞后导致 A2 走到该分支。
- **workspace-path-case**：别名拼写的显示串仍可能与输入不同（A3 已覆盖「别名不产生第二个工作区」）。回到这里的条件：用户说「我给的路径和显示的不一样」。
- **archived-grouping**：建在已归档会话所在工作区时的分组表现未验证。回到这里的条件：用户说新会话出现在「已归档」里。
