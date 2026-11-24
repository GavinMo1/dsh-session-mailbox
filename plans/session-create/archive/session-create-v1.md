# session-create v1 — Work Plan

Version v1. This plan is self-contained. The implementation does not read the review record.

## 1. What the User wants

> "另外那个会话间消息的插件，还可以给它加个功能，就是创建会话。甚至创建工作区。"

Scope: 让 Agent 在用户明确要求时新建一个顶层会话（可指定落在哪个工作区，可附带第一条消息），使用户不必离开当前会话就能把一件事交给一个干净的新会话。

## 2. Core Task and failure symptom

**Core Task**:
(a) Agent 能新建一个顶层会话，该会话进入某个工作区的 `sessionIds`，因此出现在侧栏且用户能点进去；
(b) 目标工作区可指定：给路径且已有工作区 → 落到那个工作区；给路径但该目录尚无工作区 → 先登记该工作区再落；未给路径 → 落到调用者自己的工作区；
(c) 可附带第一条消息，使新会话直接开工；
(d) 子代理不得调用创建；
(e) 创建成功但后续步骤失败时，调用方必须在错误里拿到已创建的会话 id。

**Failure symptoms**（任一成立即未达成）:
- **S1**：新建的会话不出现在侧栏（未计入任何工作区的 `sessionIds`）。
- **S2**：给了路径却落到别的工作区；或路径不存在时仍建出会话。
- **S3**：子代理也能创建会话。
- **S4**：带第一条消息失败时，报错里没有会话 id，用户在侧栏看到一个无主的空白会话。

## 3. Start instructions

1. 顺序：Step 1 → 2 → 3。前一步的完成测试不通过，不得开始下一步。
2. **Step 2 是硬闸**：创建必须走 `sessionController.create`，且事后该会话 id 必须出现在目标工作区的 `sessionIds` 里。
3. 所有验收都在真实 DSH 上跑，没有隔离环境。每创建一次就记下返回的 sessionId；验收结束后把这份 id 清单交给 User，由 User 在 GUI 删除，Agent must not 自行删除（Host 没有删除会话的 API）。
4. 卡住时：Step 1 内部卡住自己换等价写法；Step 2 硬闸失败、需要写 `C:\Users\<user>\.dsh\profiles`、A6 红且原因是模型判断时，停下报告。
5. 对应关系：**Step 1 → A1**；**Step 2 → A2、A3、A4、A7**；**Step 3 → A5、A6**。

## 4. Steps

### Step 1 — 纯逻辑与工具骨架

代码在 `dsh-plugins/plugins/session-mailbox/`，不新建插件包。

新增 `lib/create.mjs`（零依赖纯函数）：

- `refusalFor(header)` → `undefined` 或 `'subagent'`。`header.parentSession !== undefined` 或 `header.origin === 'subagent'` 时返回 `'subagent'`。
- `pickWorkspace({ path, workspaces, callerCwd })` →
  - `path` 省略：按 `callerCwd` 在 `workspaces` 里找 `path` 相同的项；找不到 → `{ ok: false, reason: 'no-workspace-for-caller' }`。
  - `path` 给出且命中 → `{ ok: true, workspace, create: false }`。
  - `path` 给出但不命中 → `{ ok: true, create: true, path }`（是否落盘由调用方决定）。
  - 路径比较前 `path.resolve` 规范化，大小写不敏感。
- `promptContent(text)` → `[{ type: 'text', text }]`；`text` 去空白后为空即 `undefined`。

新增 `test/create.test.mjs`，`node --test` 可跑，至少含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-bad-path`、`CASE subagent-refused`、`CASE prompt-shape`。

**完成测试**：A1。

### Step 2 — 创建与工作区解析（硬闸）

在 `index.js` 的 `apply` 里注册两个新工具，`inject` 增加 `'sessionController'`。

`list_workspaces`（只读，`isConcurrencySafe` 为 true）：读 `ctx.get('workspaceRegistry').list()`，每行输出 `<id> | <title> | <path> | sessions: <n>`，并提供给 `create_session` 选目标。

`create_session({ path?, prompt? })`，执行顺序固定（任一失败即返回、非零）：

1. `refusalFor(exec.agent.session.header)` 非空 → `error: subagents cannot create sessions`（对齐 S3，且必须在创建之前）。
2. `path` 给出时先 `fs.existsSync` 判断是目录；不是目录 → `error: bad path: <path>`。**must not 创建目录**（对齐 S2）。
3. 调 `pickWorkspace`：
   - `reason: 'no-workspace-for-caller'` → `error: no workspace for caller cwd: <cwd>`。
   - `create: true` → 调 `workspaceRegistry.create(path)` 拿到 workspace；抛错则 `error: cannot create workspace: <reason>`。
4. `sessionController.create({ workspaceId })`。**must not 传 `cwd`**（两者同时给会被拒）；**must not 用 `agents.create`**（那样不会计入工作区，见 No-go）。
5. 回读 `workspaceRegistry.list()`，确认目标工作区的 `sessionIds` 含新 id；不含 → `error: session not accounted: <id>`（对齐 S1，硬闸）。
6. `prompt` 非空时进 Step 3 的发送；为空则直接成功。

成功输出三行：`session id: <id>` / `workspace: <title> (<path>)` / `prompt: queued|none`。

**完成测试**：A2、A3、A4、A7。

### Step 3 — 第一条消息

`create_session` 收到非空 `prompt` 时：

1. 调 `sessionController.prompt({ requestId, sessionId, mode: 'queue', content: promptContent(prompt) })`，`requestId` 取 `'create-' + <sessionId>`。
2. 成功 → 成功输出里 `prompt: queued`。
3. 失败 → 返回 `error: prompt failed: <reason> (session <id> was created and is visible; do not create it again)`。**must not 删除或重试创建**（对齐 S4：id 必须在错误串里）。

同时给 `index.js` 里既有的提示词块 `MAILBOX_PROMPT` 增加一行：

```text
Create a session only when your user explicitly asks for one: create_session takes an optional workspace path and an optional first prompt, and it never creates directories.
```

**完成测试**：A5、A6。

## 5. No-go items

- **Locked (Decision 1)**: 改动落在既有插件 `dsh-plugins/plugins/session-mailbox`，不新建插件包。
- **Locked (Decision 2)**: 创建只走 `sessionController.create`；**must not** 用 `ctx.agents.create`，也 **must not** 用 `workspaceController.insertSessionBefore` 补登记（那两条路都不计入工作区）。
- **Locked (Decision 3)**: `workspaceId` 与 `cwd` 只传一个；本方案只传 `workspaceId`。
- **Locked (Decision 4)**: 不给新会话改名。标题由第一条消息自动生成；无删除 API 时改名只是噪音。
- **Locked (Decision 5)**: 路径不存在时只报错，不建目录、不建工作区。
- **Locked (Decision 6)**: 子代理一律拒绝，依据 `header.parentSession` 或 `header.origin === 'subagent'`。
- **Locked (Decision 7)**: 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：`0` 表示返回 0 且输出与 Expected 一致。`expected-error` 必须含引号内**确切**字符串。会话级断言用工具调用完成（`list_sessions`、`session_event_search` 必须带 `event_types`）。A2、A3、A5 会真实创建会话，其 id 必须记入交付清单。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/session-mailbox/test/create.test.mjs` | 0 | 含 `ℹ fail 0`；`ℹ pass N` 且 N ≥ 5；含 `CASE pick-by-path`、`CASE pick-default`、`CASE pick-bad-path`、`CASE subagent-refused`、`CASE prompt-shape`；无 `ERR_MODULE_NOT_FOUND` |
| A2 | 调 `create_session({})`，再用 `list_sessions({})` | 0 | 第一次输出三行，第二行以 `workspace: ` 开头且标题为 `default-workspace`；第二次输出含第一次返回的 `<id>`，状态为 `inactive` |
| A3 | 调 `create_session({ path: "C:\\Users\\ruike\\Desktop\\sync" })`，再调 `list_workspaces({})` | 0 | 第一次第二行标题为 `sync`；第二次输出里 `sync` 那一行的 `sessions:` 数比调用前多 1，且该行包含新 id |
| A4 | 调 `create_session({ path: "C:\\nope-does-not-exist-xyz" })` | `expected-error` | 含 `error: bad path: C:\nope-does-not-exist-xyz`；随后 `list_workspaces({})` 行数与调用前相同；`C:\nope-does-not-exist-xyz` 未被创建 |
| A5 | 调 `create_session({ prompt: "只回一个字：好" })`，随后 `session_event_search`（`event_types: ['user/message']`，query `只回一个字`） | 0 | 第一次第三行 `prompt: queued`；检索命中 ≥1 条，且其 session 就是第一次返回的 id |
| A6 | 派一个 subagent，令其调用 `create_session({})` | `expected-error` | 工具报 `error: subagents cannot create sessions`；随后 `list_workspaces({})` 的会话总数与调用前相同 |
| A7 | 调 `list_workspaces({})` | 0 | 至少 8 行；每行含 `\\|` 分隔的 id、title、path 与 `sessions: <n>`；含 `default-workspace` 与 `sync` 两行 |

## 7. When to stop and ask

- Step 2 硬闸失败：`sessionController.create` 未计入工作区，或回读不到新 id。
- 需要写 `C:\Users\<user>\.dsh\profiles\*`（装回被改的插件）之前：报绝对路径等一句确认。
- A6 红且原因是模型判断而非工具拦截。
- 用户对「Agent 可以自己建会话」这件事改变主意。
- 出现需要删除会话才能收场的局面（无删除 API）：停下，把 id 清单交给 User。

## 8. Blind Spot List

- **no-delete-api**：创建没有对应删除，误建的会话只能 archive 或由用户在 GUI 删。回到这里的条件：用户说「垃圾会话清不掉」。
- **title-blank**：不传 prompt 时新会话显示为空白，侧栏里难以辨认。回到这里的条件：用户连续两次认不出哪个是他刚让建的。
- **prompt-cost**：`prompt` 会真的发起一轮模型调用并跑工具。回到这里的条件：出现「只是建个会话怎么就开始跑了」。
- **recursion-prose**：跨顶层会话的自繁殖只靠提示词一行约束，机械拦截只管子代理。回到这里的条件：出现一次未经用户要求的创建。
- **workspace-path-case**：同一目录因大小写或符号链接被登记成两个工作区。回到这里的条件：`list_workspaces` 出现 path 仅大小写不同的两行。
- **archived-grouping**：把会话建在已归档会话所在工作区时的分组表现未验证。回到这里的条件：用户说新会话出现在「已归档」里。
