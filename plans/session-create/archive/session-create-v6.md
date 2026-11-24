# session-create v6 — Work Plan

Version v6. This plan is self-contained. The implementation does not read the review record.
（v6 相对 v5：补齐控制流与变量绑定、`created` 无条件计算、子代理改用正向判据、`list_workspaces` 的寻址规则、验收每行自带打分所需的读步骤、会话计数与 junction 拆除方式。）

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

**Failure symptoms**:
- **S1**：新建的会话不出现在侧栏（未计入任何工作区的 `sessionIds`）。
- **S2**：给了路径却落到别的工作区；或非法路径仍建出会话。
- **S3**：子代理也能创建会话。
- **S4**：失败路径上报错没有会话 id；或「复用」与「新建」无法区分，或标记与实际不符。

## 3. Start instructions

1. 顺序：Step 0 → 1 → 2 → 3。前一步的完成测试不通过，不得开始下一步。
2. **Step 2 是硬闸**：创建必须走 `sessionController.create`，且回读必须证明「调用前不在、调用后在该工作区」。
3. **代码改完要重载才能验收**：插件是 profile 里的 junction，改工作区文件不需要写 profile，但 DSH 不会自动吃新代码，必须重启 DSH。重启后先确认 `create_session` 出现在自己的工具列表里，再开始 A2。
4. **错误一律 `throw new Error('<文本>')`，文本不带 `error: ` 前缀**，与既有工具一致。**must not** 把错误文本当正常返回值返回。
5. 所有验收都在真实 DSH 上跑。验收会留下 **6 个会话**（A2 一个、A3 三个、A5 两个），其中 5 个是空白，A5 的第一个带首条消息并**已跑完一轮、计费一次模型调用**；另有 **1 个工作区**。每个 id 记入交付清单，由 User 在 GUI 删除。Agent must not 自行删除会话或工作区。
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

- `refusalFor(header)` → `undefined` 或 `'subagent'`。命中任一即 `'subagent'`：`header.origin === 'subagent'`；`typeof header.delegationDepth === 'number' && header.delegationDepth > 0`。**must not** 用 `header.parentSession`。
- `pickWorkspace({ target, workspaces, callerCwd, callerSessionId })`（参数名用 `target`）：
  - `target` 省略：先 `workspaces.find(w => (w.sessionIds ?? []).includes(callerSessionId))`；命中 → `{ ok: true, workspace }`。
  - 未命中且 `callerCwd` 为 `undefined` → `{ ok: false, reason: 'no-cwd' }`。
  - 再按 cwd 相等找（`resolve` + 小写比较）；命中 → `{ ok: true, workspace }`；未命中 → `{ ok: false, reason: 'no-workspace-for-caller' }`。
  - `target` 不是绝对路径 → `{ ok: false, reason: 'not-absolute' }`。
  - `target` 按**同一规范化**（`resolve` + 小写比较）命中 → `{ ok: true, workspace }`；未命中 → `{ ok: true, create: true, path: <resolve 后的绝对路径> }`。
- `promptContent(text)` → 去空白后为空即 `undefined`，否则 `[{ type: 'text', text: <原文> }]`。

新增 `test/create.test.mjs`，`node --test` 可跑，至少含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-by-accounting`、`CASE pick-no-cwd`、`CASE pick-not-absolute`、`CASE pick-unregistered`、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE prompt-shape`。

**完成测试**：A1。

### Step 2 — 创建与工作区解析（硬闸）

在 `index.js` 的 `apply` 里注册两个工具，`inject` 增加 `'sessionController'`。两个工具的 schema **照既有 `list_sessions` 的写法**：属性的 `required: true` 写在属性节点里（该写法在本机已实测注册成功）。**must not** 改用对象级 `required` 数组。

#### 2.1 `list_workspaces`

参数 `{ workspace?: string }`。

- 正文每行 `<id> | <title> | <path> | sessions: <n>`。
- 给了 `workspace`：先按 id 精确匹配；没有 id 匹配再按标题匹配；标题命中多于一者 → 抛 `ambiguous workspace: <值> (ids: <id1>,<id2>)`；都匹配不上 → 抛 `unknown workspace: <值>`。匹配上就在该行之后逐行追加 `session: <id>`。

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

**唯一的返回点**在最后。执行顺序固定（任一失败即抛出）：

1. `exec.agent === undefined` → 抛 `create_session requires a calling agent`。
2. 子代理判定，命中任一即抛 `subagents cannot create sessions`：
   - `refusalFor(exec.agent.session.header) !== undefined`；
   - 或 `exec.agent.id` 不在 `ctx.agents.list().filter(a => a.session.header.origin !== 'subagent')` 的 id 集合里（正向判据，兜住「子代理 header 两个字段都为空」）。
3. `path` 去空白后为空但参数出现 → 抛 `empty path: pass a directory path or omit it`。
4. `path` 给出时逐个判（回显一律用原样字符串）：不是绝对路径 → 抛 `path must be absolute: <原样>`；`statSync` 抛 `ENOENT`/`ENOTDIR` → 抛 `bad path: <原样>`；抛其它错 → 抛 `cannot read path: <code> <原样>`；存在但不是目录 → 抛 `not a directory: <原样>`。**must not 创建目录**。
5. `const workspaces = ctx.get('workspaceRegistry').list()`；`const before = new Set(workspaces.map(w => String(w.id)))`。
6. `const picked = pickWorkspace({ target: path, workspaces, callerCwd: exec.agent.session.header.cwd, callerSessionId: String(exec.agent.id) })`：
   - `'no-cwd'` → 抛 `no workspace for caller: the session header has no cwd`；
   - `'no-workspace-for-caller'` → 抛 `no workspace for caller cwd: <callerCwd>`。
7. `const entity = picked.create === true ? await ctx.get('workspaceRegistry').create(picked.path) : picked.workspace`（`create` 抛错则抛 `cannot create workspace: <reason>`）。
8. **无条件**计算 `const created = !before.has(String(entity.id))`。**must not** 只看走了哪条分支。
9. `const sessionIdsBefore = (entity.sessionIds ?? []).map(String)`。
10. `let sessionId; try { ({ sessionId } = await ctx.get('sessionController').create({ workspaceId: entity.id })) } catch (error) { … }`：
    - `error.code === 'session/workspace-attach-failed'` → 抛 `create failed after the session existed: <error.details.sessionId> <reason>` + （`created` 为真时）` (workspace <entity.id> was created and holds no session)`；
    - 其它 → 抛 `create failed: <reason>` + 同样的尾巴。
    - **must not** 仅凭 `details.sessionId` 存在就断定是本次创建；**must not** 传 `cwd`；**must not** 用 `agents.create`。
11. 回读该工作区 `sessionIds`：`sessionId` 必须「`sessionIdsBefore` 里没有」且「现在有」，否则抛 `session not accounted: <sessionId>`。
12. `const content = promptContent(prompt)`，然后按 Step 3 得到 `promptState`（`'queued'` 或 `'none'`）。
13. 返回 `{ sessionId, workspaceTitle: String(entity.title), workspacePath: String(entity.path), workspaceCreated: created, prompt: promptState }`。

`workspacePath` 一律取 `entity.path`（注册表里的 canonical 串）。

**完成测试**：A2、A3、A4、A7。

### Step 3 — 第一条消息

这一节只产出 `promptState`，**不新增返回点**。

- `content === undefined` → `promptState = 'none'`，不发请求。
- 否则 `await ctx.get('sessionController').prompt({ requestId: 'create-' + sessionId, sessionId, mode: 'queue', content }, exec.signal ?? new AbortController().signal)`：
  - 成功 → `promptState = 'queued'`；**signal 必须传**（该方法第一句是 `signal.throwIfAborted()`）；
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
- **Locked (Decision 6)**: 子代理判定用「header 命中」**或**「不在顶层集合里」两条正向判据；不用 `parentSession`。
- **Locked (Decision 7)**: `prompt` 必须带 `AbortSignal`。
- **Locked (Decision 8)**: `created` 在解析出 `entity` 之后**无条件**按 id 差集计算。
- **Locked (Decision 9)**: 错误一律 throw 裸文本。
- **Locked (Decision 10)**: 调用者工作区先按 `sessionIds` 会计，再退回 cwd 相等。
- **Locked (Decision 11)**: 两个工具都声明 `output.schema` + `render`，`required: true` 写在属性节点里，照既有 `list_sessions`。
- **Locked (Decision 12)**: `list_workspaces` 的 `workspace` 参数先按 id、再按标题，标题歧义即抛。
- 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：
- `workdir` 一律 `C:\Users\ruike\Documents\dsh-plugins`。
- 执行 A2–A7 的会话，其 `cwd` 必须等于 `default-workspace` 的 `path`（先 `list_workspaces` 读出、再 `pwd` 核对）。不相等就停下报告。
- `0` 表示返回 0 且输出与 Expected 一致。`expected-error` 表示工具报错且文本含引号内**确切**子串。
- A3 的 junction 一步属项目根外写入：执行前报绝对路径并等 User 一句确认。拆除用 `cmd /c rmdir "<链接路径>"`（只删链接本身，绝不进入目标）；拆前后各跑 `Get-Item -Force "<链接路径>" | Select-Object LinkType,Target` 作为证据，并确认 `%TEMP%` 原有文件仍在。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/session-mailbox/test/create.test.mjs` | 0 | 含 `ℹ fail 0`；`ℹ pass N` 且 N ≥ 10；含 §Step 1 列的 10 个 `CASE ` 名；无 `ERR_MODULE_NOT_FOUND` |
| A2 | `list_workspaces({ workspace: "default-workspace" })` → `create_session({})` → `list_sessions({})` → `list_workspaces({ workspace: "default-workspace" })` | 0 | 第二次第二行为 `workspace: default-workspace (<该工作区 path>) [reused]`；第三次含第二次的 `sessionId` 且状态 `inactive`；第四次多出一行 `session: <该 sessionId>` |
| A3 | `list_workspaces({})` 记行数 k 并确认目标目录未登记（默认 `C:\Users\ruike\AppData\Local\Temp`；若已登记或第 8 步判出 `created=false`，停下让 User 给未登记目录）→ `create_session({ path: <该目录> })` → `create_session({ path: <该目录> })` → 建 junction `<该目录>\umlink` → `create_session({ path: "<该目录>\\umlink" })` → `list_workspaces({ workspace: <第二次返回的 workspaceId> })` → `list_workspaces({})` | 0 | 第一次 k 且不含该目录；第二次第二行 `[created]`；第三次 `[reused]`；第四次（别名）`[reused]` 且 `workspace:` 行 path 与第三次完全相同；第五次该工作区 `sessions: 3` 并列出三个 `session:` 行；末尾 `list_workspaces({})` 行数为 k+1 |
| A4 | `list_workspaces({})` 记 k → `create_session({ path: "" })` → `create_session({ path: "sync" })` → `create_session({ path: "C:\\nope-does-not-exist-xyz" })` → `create_session({ path: "C:\\Users\\ruike\\.agents\\user-model\\README.md" })` → `list_workspaces({})` | `expected-error` ×4 | 四次分别含 `empty path:`、`path must be absolute: sync`、`bad path: C:\nope-does-not-exist-xyz`、`not a directory: `；末尾行数仍 k；`C:\nope-does-not-exist-xyz` 未被创建 |
| A5 | `create_session({ prompt: "只回一个字：好" })` → 轮询 `session_event_search`（`event_types: ['user/message']`、`query: "只回一个字"`、`session_id: <上一步 sessionId>`），最多 30 秒、间隔 5 秒 → `create_session({ prompt: "   " })` | 0 | 第一次第三行 `prompt: queued`；轮询在 30 秒内命中 ≥1 条；第三次第三行 `prompt: none`；两个 sessionId 记入交付清单 |
| A6 | 逐工作区展开 `list_workspaces({ workspace: <每个 id> })` 记基线 → 派一个 subagent 令其调用 `create_session({})` → 逐工作区再展开一次 | 0 | subagent 报告含 `subagents cannot create sessions`；前后逐工作区的 `session:` 集合完全相同 |
| A7 | `list_workspaces({})` | 0 | 至少 8 行；每行含 `\|` 分隔的 id、title、path 与 `sessions: <n>`；含 `default-workspace` 与 `sync` |

**A5 变红时如何区分两种成因**（写进执行记录，不进判定）：去 GUI 看那个会话里有没有「只回一个字：好」这条。有 → 是检索工具看不见刚建的会话（记入盲点 `search-can-new-session`）；没有 → 是 prompt 没落地（真红）。

## 7. When to stop and ask

- Step 2 硬闸失败：第 11 步回读证明不了「调用前不在、调用后在该工作区」。
- Step 0 发现 profile 的 junction 已断（重连要写 `C:\Users\<user>\.dsh\profiles`）：报绝对路径等一句确认。
- 执行验收的会话 cwd 与 `default-workspace` 的 path 不相等。
- A3 的目标目录已被登记，且 User 没给替代目录。
- A3 要在 `%TEMP%` 下建 junction：报绝对路径等一句确认（项目根外写入 + 链接创建）；拆除前再确认一次。
- A6 红且原因是模型判断而非工具拦截；或子代理根本没拿到这个工具。
- 用户对「Agent 可以自己建会话」或「可以自己建工作区」改变主意。
- 出现需要删除会话才能收场的局面：停下，把 id 清单交给 User。

## 8. Blind Spot List

- **no-delete-api**：误建的会话只能由用户在 GUI 删。回到这里的条件：用户说「垃圾会话清不掉」。
- **failure-path-prose**：Core Task (e) 的两条错误串（attach 失败、prompt 失败）没有验收行能变红，只有文本。回到这里的条件：任一次真实失败，或用户要求给这两条加注入测试。
- **search-can-new-session**：A5 依赖「检索工具能看见刚建的会话」，该前提未单独验证。回到这里的条件：A5 变红且 GUI 里能看到那条消息。
- **eacces-prose**：`EACCES` 分支只有文本、没有验收行能变红。回到这里的条件：真的遇到读不到的路径。
- **concurrent-registration**：第 5 步快照与第 7 步 create 之间若有别人登记同一目录，会报 `[created]`。方向无害。回到这里的条件：用户看到「新建」的其实是刚在界面上建的。
- **title-blank**：不传 prompt 时新会话显示为空白。回到这里的条件：用户连续两次认不出哪个是他刚让建的。
- **prompt-cost**：`prompt` 会真的发起一轮模型调用并跑工具。回到这里的条件：出现「只是建个会话怎么就开始跑了」。
- **recursion-prose**：跨顶层会话自繁殖只靠提示词一行约束。回到这里的条件：出现一次未经用户要求的创建。
- **cwd-fallback-coverage**：`pick-default` 的 cwd 相等分支只有单测覆盖，端到端走不到。回到这里的条件：某台机器会计滞后导致 A2 走到该分支。
- **workspace-path-case**：别名拼写的显示串可能与输入不同。回到这里的条件：用户说「我给的路径和显示的不一样」。
- **archived-grouping**：建在已归档会话所在工作区时的分组表现未验证。回到这里的条件：用户说新会话出现在「已归档」里。
