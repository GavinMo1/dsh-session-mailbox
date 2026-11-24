# session-create v10 — Work Plan

Version v10. This plan is self-contained: 只看现状就能照做，不需要读任何历史版本或评审记录。

改动来源：两轮独立全扫评审 + 一轮安装包源码取证。v10 相对上一版的实质改动是——**备份前置到动文件之前**、**Step 0 的完成测试换成仓库里真能跑的那条**、**「找自己所在工作区」改成逐工作区展开**、**`inject` 不再包含 `subagents`**、**回读硬闸改成单侧判定**、**验收的行数口径定义清楚**。

## 0. 证据（直接从安装包源码取证，执行者可直接依赖，不需要再查）

来源：`<DSH 安装目录>/resources/app.asar` 内随包发布的 TypeScript 源码（与运行时同源）。复核方式：解出 asar 后按 `file:line` 读。

| # | 事实 | 出处 |
|---|---|---|
| E1 | 工作区服务名就是 `workspaceRegistry` | `@deepseek-ai/dsh-workspace/src/index.ts:211` |
| E2 | `list(): Workspace[]`，**同步**，按注册顺序返回 entities | 同上 `:308-315` |
| E3 | `create(path: string, title?: string): Promise<Workspace>`，**返回 Workspace 本身**，不是 `{ workspace, created }` | 同上 `:254` |
| E4 | `create` 内部 `realpathNormalize(path)`；非目录抛 `cannot create a workspace at '<canonical>': path is not a directory`；**同一 canonical 路径重复调用返回既有记录且不改标题**（幂等） | 同上 `:254-260`、`:533-535`、文档 `:238-248` |
| E5 | `Workspace` 字段：`id`、`path`（`fs.realpath` 后的值）、`title`（默认取路径末段，**不同目录可同名**）、`createdAt`、`updatedAt`、`sessionIds`（只读、同步过滤的候选账目） | `dsh-workspace/src/types.ts:69-100` |
| E6 | `get(id): Workspace \| undefined` 存在，可重新取一次记录 | `dsh-workspace/src/index.ts:298` |
| E7 | 会话服务名就是 `sessionController` | `dsh-api-session-controller/src/index.ts:179` |
| E8 | `create(request: SessionCreateRequest): Promise<SessionCreateValue>`，**单对象参数、没有 signal** | 同上 `:307` |
| E9 | `SessionCreateRequest = { workspaceId?, cwd?, sessionId?, agentPreset? }`；`SessionCreateValue = { sessionId, agentPreset? }` | `dsh-api-session-controller/src/types.ts:268-284` |
| E10 | `prompt(request: SessionPromptRequest, signal: AbortSignal)`——**signal 是第二个位置参数**，函数体第一句就是 `signal.throwIfAborted()` | `dsh-api-session-controller/src/index.ts:468-469` |
| E11 | `SessionPromptRequest = { requestId, sessionId, mode: 'queue' \| 'steer', content: PromptContentPart[], clientTimeZone? }`；文本块 `{ type: 'text', text }`；`SessionPromptValue = { accepted: true }` | `dsh-api-session-controller/src/types.ts:80-88`、`:324-337` |
| E12 | 内容既无非空白文本也无附件时，`prompt` 抛 `gateway/bad-request` | `dsh-api-session-controller/src/index.ts:470-471` |
| E13 | 错误码 `session/workspace-attach-failed` 真实存在，`details` 键为 `sessionId` 与 `workspaceId` | `dsh-api-session-controller/src/types.ts:199` |
| E14 | `SessionHeader.delegationDepth` 真实存在，缺省按 0；`delegationDepthOf` 还会取运行期 `subagentDepth` 的较大值 | `@deepseek-ai/dsh-subagent/src/depth.ts:28-36` |
| E15 | 子代理服务名是 `subagents` | `dsh-subagent/src/index.ts:210` |
| E16 | `rootOf(caller)` 有**四条**路径：① `agents.get(caller.id) !== caller` → 抛 `UNAUTHORIZED`/`subagent tree access requires the exact live caller`；② resident 激活、`activationAgent(activation) === caller` 且其 root 仍 live → **返回 `activation.root`（可能不是 caller）**；③ `delegated`（`origin === 'subagent'` 或有 own-seq 身份）或有 resident 激活但 root 不 live → 抛 `UNAUTHORIZED`/`agent has no active runtime owner`；④ 其余（非 resident 的普通顶层）→ 返回 caller 自身。**所以守卫必须比较 id，不能只看有没有抛。** | `dsh-subagent/src/manager.ts:509-522` |
| E17 | 仓库目录**不能**裸 import `index.js`：`index.js:3` 的 `import z from '@deepseek-ai/schemastery'` 在仓库里解析不到（`ERR_MODULE_NOT_FOUND`），宿主包只在 profile 的 loader 里可用 | 实测（见 §4 Step 0）；根因见 `plugins/session-mailbox/index.js:3` |

**由 E4 + E5 得到的设计结论**：`Workspace.path` 存的是 realpath 后的值，`create()` 又按 canonical 路径幂等。所以「这个工作区存在吗」不需要我们自己规范化比较——**直接调 `create(path)`，用调用前后的 id 集合差集判定新建还是复用**。任何路径字符串比较都会因大小写、尾斜杠、8.3 短名、junction 假红。

**由 E16 得到的设计结论**：`rootOf` 不抛 ≠ 顶层。必须比较 `root.id` 与调用者 id。

## 1. What the User wants

> "另外那个会话间消息的插件，还可以给它加个功能，就是创建会话。甚至创建工作区。"

Scope: 让 Agent 在用户明确要求时新建一个顶层会话（可指定落在哪个工作区，工作区不存在时新建，可附带第一条消息），使用户不必离开当前会话就能把一件事交给一个干净的新会话。

## 2. Core Task and failure symptom

**Core Task**:
(a) Agent 能新建一个顶层会话，该会话进入某个工作区的 `sessionIds`，因此出现在侧栏且用户能点进去；
(b) 目标工作区可指定：给路径就交给 `workspaceRegistry.create`（它幂等且按 realpath 规范化，已存在即复用、不存在即登记）；未给路径则落到调用者自己的**工作区**（先按 accounting 判定，再退回 cwd 相等）。输出必须区分「复用」与「新建」，且该标记**只由调用前后的 id 差集判定**；
(c) 可附带第一条消息，使新会话直接开工；空白消息视为没给；
(d) 子代理不得调用创建；
(e) 创建成功但后续步骤失败时，调用方必须在错误里拿到已创建的会话 id；若本次还新登记了工作区，错误里也要给出它的 id。

**Failure symptoms**:
- **S1**：新建的会话不出现在侧栏（未计入任何工作区的 `sessionIds`）。
- **S2**：给了路径却落到别的工作区；或非法路径仍建出会话。
- **S3**：子代理也能创建会话。
- **S4**：失败路径上报错没有会话 id；或「复用」与「新建」无法区分，或标记与实际不符。

## 3. Start instructions

1. **两个阶段，分开读**：（甲）**实施**——Step 0、1、2、3 的代码，加 `node --check`、`node --test`（含 A1）；任何 Agent 都能做，包括子代理。（乙）**验收与交付**——重载插件、跑 A2–A8、做 Step 4；只能在顶层会话里做（`plugin_manager` 通常要 danger-full-access，子代理默认没有）。
2. **执行 A2–A8 的必须是顶层会话**：执行者的 `session.header` 不得有 `origin: 'subagent'`，也不得有非零 `delegationDepth`。若你是子代理或拿不到 `plugin_manager` 的写权限：做完（甲）后停下，把（乙）整段交回派你的顶层会话，**不得**把 A2–A8 与 Step 4 记为通过（A1 属（甲），可以记）。
3. 顺序：Step 0 → 1 → 2 → 3 按实现顺序推进。Step 0 与 Step 1 的完成测试**当场可判，必须先过**再进下一步；Step 2 与 Step 3 的完成测试依赖重载插件，只能在（乙）里跑，所以这两步先写完代码、到（乙）再补验。**Step 4 放在 A1–A8 全部跑完之后。**
4. **Step 2 是硬闸**：创建必须走 `sessionController.create`，且回读必须证明「调用后该会话在该工作区账目里」。
5. **代码改完要重载才能验收**：插件是 profile 里的 junction，改仓库文件不需要写 profile，但 DSH 不会自动吃新代码。重载走 `plugin_manager` 的 `set_plugin`，`target` 填 `entryId`（形如 `include:<rowId>`，**不是**包名、**不是** `rowId`），先 `enabled:false` 再 `enabled:true`，两次都返回 `application:"applied"`；或重启 DSH。重载后先确认 `create_session` 与 `list_workspaces` 出现在自己的工具列表里，再开始 A2。
6. **错误一律 `throw new Error('<文本>')`，文本不带 `error: ` 前缀**。**must not** 把错误文本当正常返回值返回。
7. 所有验收都在真实 DSH 上跑。验收会留下 **7 个会话**（A2 一个、A3 两个、A5 两个、A8 两个）与 **1 个新工作区**（A3 在 `%TEMP%` 下登记的；若 A8 首调返回 `[created]` 则为 2 个，以其返回值为准）。每个 id 记入交付清单，由 User 在 GUI 删除。Agent must not 自行删除会话或工作区。
8. 卡住时：Step 0、Step 1 内部卡住自己换等价写法；Step 2 硬闸失败、profile 里没有 `link:` 依赖、A6 红且原因是模型判断、A2 红且 `list_workspaces` 证明会话确实进了目标工作区，就停下报告。
9. 对应关系：**Step 0 → 它自己的两条完成测试**；**Step 1 → 探针 + A1**；**Step 2 → A2、A3、A4、A7、A8**；**Step 3 → A5、A6**；**Step 4 → 交付清单（最后做）**。

## 4. Steps

### Step 0 — 接线与备份

1. 确认 profile 里 `dsh-session-mailbox` 是 `link:` 依赖：读 `<profile>/package.json` 的 `dependencies["dsh-session-mailbox"]`，值必须是 `link:<仓库根>/plugins/session-mailbox`。若不在或不是 `link:`，**停下报告**（接线要写 profile，需 User 一句确认；本仓库的做法是 `node scripts/link-plugins.mjs --apply`，它自己会备份）。
2. `package.json` **不新增任何 `exports` 条目**。现有三条 `exports`（`.`、`./pure`、`./package.json`）**原样保留**——must not 删掉，`./pure` 是被外部引用的入口。`index.js` 以相对路径 `./lib/create.js` 引纯逻辑，包内相对 import 不受 `exports` 约束，所以不需要新条目。
3. **动任何文件之前**做备份。本次会改四个文件：`plugins/session-mailbox/index.js`、`plugins/session-mailbox/package.json`（Step 2）、`plugins/session-mailbox/lib/pure.js`（Step 1，只改一行注释）、`plugins/session-mailbox/README.md`（Step 4）。把**这四个**都复制到仓库根 `backups\`，文件名加后缀 `-bak-<yyyymmdd-hhmmss>`，并在交付清单里写出四个绝对路径。

**完成测试（两条，都在 Step 0 当场可判）**：

- **①** profile 的 `<profile>/package.json` 里 `dependencies["dsh-session-mailbox"]` 的值是 `link:<仓库根>/plugins/session-mailbox`（分隔符正/反斜杠与大小写都不计较），且 `dsh.profile.bundles` 里含 `dsh-session-mailbox`。贴出这两处的原文。
- **②** `Get-ChildItem <仓库根>\backups | Where-Object Name -like '*-bak-*'` 的输出里，本次的四个备份文件都在。贴出输出。

两条都过才进 Step 1。**入口能否加载、工具是否注册，是 Step 2 的完成测试**，不在 Step 0 判。

> **must not** 用 `node -e "import('./plugins/session-mailbox/index.js')"` 判入口：E17 说明 `index.js:3` 的 `@deepseek-ai/schemastery` 从仓库目录永远解析不到，这条命令必然 `ERR_MODULE_NOT_FOUND`，与实现对不对无关。

### Step 1 — 纯逻辑

代码在 `plugins/session-mailbox/`，不新建插件包。`lib/` 下用 `.js` 扩展名，与既有 `lib/pure.js` 一致。只允许 `node:` 内置（本文件用 `node:path`）；顺手把 `lib/pure.js` 首行注释里的 `(currently: none)` 改成 `(currently: create.js uses node:path)`，免得后来者以为不能引内置。

新增 `lib/create.js`，导出五个纯函数：

- `refusalFor(header)` → `undefined` 或 `'subagent'`。命中任一即 `'subagent'`：`header.origin === 'subagent'`；`typeof header.delegationDepth === 'number' && header.delegationDepth > 0`（E14）。**must not** 用 `header.parentSession`。只覆盖「header 自报是子代理」的情况，其余由 Step 2 的 `rootOf` 判据兜住。
- `samePath(a, b)` → 规范化比较：两边 `resolve(String(p))`，仅当长度 > 3（保护盘根 `C:\`）时去掉尾部分隔符，再 `toLowerCase()` 比相等。**must not** 用它判定「注册表里有没有这个路径」（那是 E4 的活）。
- `pickDefaultWorkspace({ workspaces, callerCwd, callerSessionId })` → 显式嵌套，只有三条出口：
  1. `workspaces.find((w) => (w.sessionIds ?? []).map(String).includes(String(callerSessionId)))` 命中 → `{ ok: true, workspace: w }`；
  2. `callerCwd === undefined` → `{ ok: false, reason: 'no-cwd' }`；
  3. `workspaces.find((w) => samePath(w.path, callerCwd))` 命中 → `{ ok: true, workspace: w }`；未命中 → `{ ok: false, reason: 'no-workspace-for-caller' }`。
- `createdFromDiff(before, entityId)` → `!before.has(String(entityId))`。这是 Decision 8 的唯一实现，单独成函数以便单测。
- `promptContent(text)` → 去空白后为空即 `undefined`，否则 `[{ type: 'text', text: <原文> }]`（对齐 E11）。

新增 `test/create.test.mjs`，`node --test` 可跑，至少含这些 `console.log('CASE <name>')`：`CASE pick-by-accounting`、`CASE pick-by-cwd`、`CASE pick-no-cwd`、`CASE pick-no-workspace`、`CASE pick-accounting-first`（同时能命中 accounting 与 cwd 时取 accounting）、`CASE same-path-case`、`CASE same-path-trailing`、`CASE same-path-drive-root`（`C:\` 与 `c:\` 相等，且不被截成 `C:`）、`CASE subagent-refused`、`CASE delegation-depth-refused`、`CASE fork-not-refused`、`CASE created-by-id-diff`、`CASE prompt-shape`。

**完成测试**：先跑探针，再跑 A1。

探针（workdir = 仓库根，用 `git rev-parse --show-toplevel` 现取）——只验纯逻辑模块面，不碰宿主包：

```powershell
node -e "import('./plugins/session-mailbox/lib/create.js').then((m) => { const need=['refusalFor','samePath','pickDefaultWorkspace','createdFromDiff','promptContent']; const miss=need.filter((k)=>typeof m[k]!=='function'); if (miss.length) { console.error('missing:', miss.join(',')); process.exit(1) } console.log('lib-ok') }, (e) => { console.error(e.message); process.exit(1) })"
```

必须输出 `lib-ok`、退出码 0。然后跑 A1。

### Step 2 — 创建与工作区解析（硬闸）

`index.js` 的 `inject` 改为 `['tools', 'agents', 'systemPrompt', 'workspaceRegistry', 'sessionController']`。

> **must not** 把 `subagents` 写进 `inject`：`inject` 是必需依赖，服务缺失时整个插件根本不会 `apply`，`list_sessions` / `send_session_message` 会一起消失（AGENTS.md 静默失败表里「插件加载成功但一个工具都没有」那一类）。`subagents` 一律用 `ctx.get('subagents')` 现取，取不到就让 `create_session` 拒绝。

两个工具都必须照既有写法 `ctx.tools.register(defineTool({...}))` 注册；只 `defineTool` 不 `register` 会加载成功但零工具。schema 的 `required: true` 写在属性节点里，照既有 `list_sessions`。

#### 2.1 `list_workspaces`

参数 `{ workspace?: string }`。

- 每行 `<id> | <title> | <path> | sessions: <n>`，`n = (w.sessionIds ?? []).length`。标题或路径含 `|` 时原样输出、不转义（验收按行首 id 与行尾 `sessions: n` 定位）。**没有 `workspace` 参数时只输出这些行，不追加任何 `session:` 行。**
- 给了 `workspace`：先按 id 精确匹配（`String(w.id) === 值`），再按 `w.title === 值`；标题命中多于一者 → 抛 `ambiguous workspace: <值> (ids: <id1>,<id2>)`；都匹配不上 → 抛 `unknown workspace: <值>`。匹配上就在该行之后逐行追加 `session: <id>`。

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
   - 否则 `const subagents = ctx.get('subagents')`；`subagents === undefined` → 抛 `create_session cannot verify the calling agent's subagent tree: the subagents service is unavailable`；否则 `let root; try { root = subagents.rootOf(exec.agent) } catch (error) { throw new Error('create_session cannot verify the calling agent\'s subagent tree: ' + (error instanceof Error ? error.message : String(error)) + '; refusing') }`，再 `if (root !== undefined && String(root.id) !== String(exec.agent.id)) throw new Error('subagents cannot create sessions')`。
   按 E16，四条路径里两条会抛、一条返回 `activation.root`、一条返回自身；**必须比较 id**，不能只看有没有抛。抛错的文案与「策略拒绝」分开，免得把真实故障报成策略拒绝。
3. `path` 去空白后为空但参数出现 → 抛 `empty path: pass a directory path or omit it`。
4. `path` 给出时逐个判（回显一律用原样字符串）；这些只是为了让错误文本可读，E4 说明 `create()` 自己也会拒相对/不存在/非目录：
   - 不是绝对路径 → 抛 `path must be absolute: <原样>`；
   - `statSync` 抛 `ENOENT`/`ENOTDIR` → 抛 `bad path: <原样>`；
   - 抛其它错 → 抛 `cannot read path: <code> <原样>`；
   - 存在但不是目录 → 抛 `not a directory: <原样>`。
   **must not** 创建目录。
5. `const registry = ctx.get('workspaceRegistry')`；`const before = new Set(registry.list().map((w) => String(w.id)))`。
6. 解析目标工作区：
   - `path` 给出 → `let entity; try { entity = await registry.create(path) } catch (error) { throw new Error('cannot create workspace: ' + (error instanceof Error ? error.message : String(error))) }`。**不要**去 `list()` 里找路径、**不要**做规范化比较——E4 已保证同一 canonical 路径复用同一条记录。
   - `path` 未给 → `const picked = pure.pickDefaultWorkspace({ workspaces: registry.list(), callerCwd: exec.agent.session.header.cwd, callerSessionId: String(exec.agent.id) })`；`picked.ok !== true` 时按 `picked.reason` 抛：`'no-cwd'` → `no workspace for caller: the session header has no cwd`；`'no-workspace-for-caller'` → `no workspace for caller cwd: <callerCwd>`；其它 → `no workspace: <picked.reason>`。命中则 `entity = picked.workspace`。
7. `const created = createdFromDiff(before, entity.id)`（**无条件**调用，不看走了哪条分支）。
8. `const sessionIdsBefore = (entity.sessionIds ?? []).map(String)`（**必须 `.map(String)` 成数组快照**，`sessionIds` 是活账目）。
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
   E8：`create` 只收对象参数、**没有 signal**，别传第二个参数。E13：错误码与 `details.sessionId`/`details.workspaceId` 都是真的。**must not** 只凭 `details.sessionId` 存在就断定是本次创建；**must not** 传 `cwd`；**must not** 用 `agents.create`。
10. 回读硬闸（**只有这一段算数**）：
    ```js
    const after = ctx.get('workspaceRegistry').get(entity.id)
    if (after === undefined) {
      throw new Error('workspace disappeared after the session was created: session ' + sessionId + ' workspace ' + entity.id)
    }
    const nowIds = (after.sessionIds ?? []).map(String)
    if (!nowIds.includes(String(sessionId))) {
      throw new Error('session not accounted: ' + sessionId + ' (workspace ' + entity.id + ', ' + (created ? 'created' : 'reused') + ')')
    }
    ```
    **判定只看「现在在不在」这一侧**。`sessionIdsBefore.includes(sessionId)` 只为在执行记录里标注「这次拿到的是一个已在账目里的空白会话」（E8 的 `create` 只在点名 `sessionId` 时复用，我们不传 `sessionId`，正常不会发生；真发生了也不要判红）。
    **must not** 用第 5 步的 `workspaces` 或第 6 步的 `entity.sessionIds` 当回读结果——`before` 是快照、`entity` 是创建前的对象，拿它们比必然恒红。
11. `const content = promptContent(prompt)`；`let promptState = 'none'`，再按 Step 3 改写。
12. 返回 `{ sessionId, workspaceId: String(entity.id), workspaceTitle: String(entity.title), workspacePath: String(entity.path), workspaceCreated: created, prompt: promptState }`。

`workspacePath` 一律取 `entity.path`（E5：realpath 后的值，可能与用户输入拼写不同，正常，不要「修正」）。

`create_session` **不声明** `isConcurrencySafe`（写操作，按非并发处理）。

**完成测试**：先重载插件（§3 第 5 条），再用 `plugin_manager` 的 `list_plugins` 确认 `dsh-session-mailbox` 那行 `enabled === true && installed === true`、自己的工具列表里有 `create_session` 与 `list_workspaces`；然后 A2、A3、A4、A7、A8。

### Step 3 — 第一条消息

这一节只产出 `promptState`，**不新增返回点**。

- `content === undefined` → `promptState = 'none'`，不发请求。
- 否则 `await ctx.get('sessionController').prompt({ requestId: 'create-' + sessionId, sessionId, mode: 'queue', content }, exec.signal ?? new AbortController().signal)`：
  - 成功（返回 `{ accepted: true }`，E11）→ `promptState = 'queued'`；**signal 必须作为第二个位置参数传**（E10：函数体第一句就是 `signal.throwIfAborted()`，不传就是 TypeError）。
  - 失败 → `const reason = error instanceof Error ? error.message : String(error)`，抛 `prompt failed: <reason> (session <sessionId> was created and is visible; do not create it again)` + （`created` 为真时）` (workspace <entity.id> was created)`。**must not** 删除或重试创建。
- 若 `prompt` 因 `requestId` 格式报错（`SessionRequestId` 是品牌类型，`'create-' + sessionId` 没有单独证据），退化为 `requestId: crypto.randomUUID()`，并把该退化写进执行记录。

同时给既有的 `MAILBOX_PROMPT` 增加一行：

```text
Create a session only when your user explicitly asks for one: create_session takes an optional workspace path and an optional first prompt, and it never creates directories or deletes anything.
```

**完成测试**：A5、A6。

### Step 4 — 交付

1. `git status --short --branch` 记基线。出现本次任务之外的未提交改动 → 停下报告，**不得** stash、不得丢弃。（`plans/session-create/session-create-*.md` 是本方案本体，不算任务外改动。）
2. `node --check plugins/session-mailbox/index.js` 退出码 0。
3. `node --test plugins/session-mailbox/test/*.test.mjs` 全绿：既有测试全部通过（以改动前那一次跑出来的 `ℹ pass` 实际结果为准，不写死条数），本次新增的 CASE 全部通过，整体 `fail 0`。**不断言总条数**——一个 CASE 允许拆成多个 `test()`，条数是下界不是等式。
4. `plugins/session-mailbox/README.md`：工具表加 `list_workspaces` 与 `create_session` 两行；「已知边界」补三条——创建的会话落在指定工作区、不会被自动删除；空白 `prompt` 不会发起模型调用；子代理不可调用。
5. `package.json` 的 `version` 从 `0.4.0` 升到 `0.5.0`（行为变更升 minor），`git tag dsh-session-mailbox/v0.5.0`。
6. 一次提交，message `session-mailbox: add create_session and list_workspaces`；tag 随提交一起推。

## 5. No-go items

- **Locked (Decision 1)**: 改动落在既有插件 `dsh-session-mailbox`，不新建插件包。
- **Locked (Decision 2)**: 创建只走 `sessionController.create`；**must not** 用 `ctx.agents.create`，也 **must not** 用 `workspaceController.insertSessionBefore`。
- **Locked (Decision 3)**: `workspaceId` 与 `cwd` 只传一个；只传 `workspaceId`。
- **Locked (Decision 4)**: 不给新会话改名。
- **Locked (Decision 5)**: 路径非法只报错，不建目录、不建工作区；任何情况 must not 删除会话、工作区或目录（含 `rmdir`）。
- **Locked (Decision 6)**: 子代理判定 = header 命中 **或** `subagents.rootOf` 返回的 id 与调用者不同；**must not** 用 `parentSession`，也 **must not** 用「在不在 `agents.list()` 的顶层过滤里」。
- **Locked (Decision 7)**: `prompt` 必须带 `AbortSignal`，位置是第二个实参。
- **Locked (Decision 8)**: `created` 只由 `createdFromDiff(before, entity.id)` 决定，无条件调用。
- **Locked (Decision 9)**: 错误一律 throw 裸文本；`<reason>` 一律取 `error.message`。
- **Locked (Decision 10)**: 调用者工作区先 accounting 再 cwd，只用于「没给路径」的默认分支。
- **Locked (Decision 11)**: 两个工具都声明 `output.schema` + `render`，`required: true` 写在属性节点。
- **Locked (Decision 12)**: `list_workspaces({ workspace })` 先 id 后标题，标题歧义即抛。
- **Locked (Decision 13)**: 工作区复用/新建一律靠 id 差集判定；**must not** 在代码里做路径规范化匹配来「提前判断是否已存在」。
- **Locked (Decision 14)**: `inject` 不含 `subagents`，也不含任何「缺了会让既有工具消失」的可选服务。
- 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：
- **执行 A2–A8 的必须是顶层会话**（见 §3 第 1、2 条）。若执行者是子代理，只做 A1，停下报告，**must not** 试图绕过。
- `workdir` 一律 = 仓库根，用 `git rev-parse --show-toplevel` 现取。仓库根记作 R。
- **「行数 k」一律指 `<id> | ` 开头的工作区行**；`session: ` 行不计入 k。
- **怎么找「自己所在的工作区」W**：先 `(Resolve-Path .).Path` 取自己的 cwd 记 C；`list_workspaces({})` 取出全部工作区 id；逐个 `list_workspaces({ workspace: <id> })`，谁展开的 `session:` 行里出现自己的会话 id，就记该工作区为 W，并核对该行的 `<path>` 经 `Resolve-Path` 后等于 C。全部展开都没有 → 停下报告。（裸 `list_workspaces({})` 按 §2.1 **不输出** `session:` 行，所以必须逐个展开。）
- `0` 表示返回 0 且输出与 Expected 一致。`expected-error` 表示工具报错且文本含引号内**确切**子串。
- 本方案**不创建任何目录或链接**。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/session-mailbox/test/create.test.mjs` | 0 | 输出含 `fail 0`；含 `pass <N>` 且 N ≥ 13；§Step 1 列的 13 个 `CASE ` 名各出现 ≥1 次；无 `ERR_MODULE_NOT_FOUND` |
| A2 | 1) `list_workspaces({})` 记工作区行数 k 与全部工作区 id；2) 按 §6 约定逐个展开，求出含自己会话 id 的 W，并记下 W 那一行的 `<title>` 与 `<path>`；3) `create_session({})`；4) `list_workspaces({ workspace: W })`；5) `list_workspaces({})` | 0 | 第 3 步第二行为 `workspace: <W 的 title> (<W 的 path>) [reused] (id: W)`（title 与 path 与第 2 步那一行逐字一致，现取比对，不断言任何字面标题）；第 4 步比第 2 步对 W 的展开多出一行 `session: <第 3 步的 sessionId>`；第 5 步工作区行数仍 k |
| A3 | 1) `list_workspaces({})` 记工作区行数 k 与全部 id/path；2) 取 `(Resolve-Path $env:TEMP).Path` 作为 T，回显原样；3) 若有任何一行 path 规范化后等于 T，停下让 User 给一个未登记目录，否则继续；4) `create_session({ path: T })`；5) 再 `create_session({ path: T })`；6) `list_workspaces({ workspace: <第 4 步返回的 workspaceId> })`；7) `list_workspaces({})` | 0 | 第 3 步通过（起点不含 T）；第 4 步 `[created]`；第 5 步 `[reused]` 且 id 与第 4 步完全相同；第 6 步该工作区 `sessions: 2` 并列出两个 `session:` 行；第 7 步工作区行数 k+1 |
| A4 | 1) `list_workspaces({})` 记工作区行数 k 与全部 id；2) 逐 id 展开，把每个工作区的 `session:` 集合存为基线 F；3) 赋 `$np = Join-Path $env:TEMP 'nope-does-not-exist-xyz'`（纯赋值，不计步）；4) `create_session({ path: "" })`；5) `create_session({ path: "sync" })`；6) `create_session({ path: $np })`；7) `create_session({ path: "<R>\\plugins\\session-mailbox\\package.json" })`；8) 逐 id 再展开一次；9) `list_workspaces({})`；10) `Test-Path $np` | `expected-error` ×4 | 第 4–7 步各报错一次（其余步骤按 `0` 判）：第 4–7 步分别含 `empty path:`、`path must be absolute: sync`、`bad path: <$np 的值>`、`not a directory: `；第 8 步的会话集合与 F **逐工作区完全相同**（不只 W）；第 9 步工作区行数仍 k；第 10 步返回 `False` |
| A5 | `create_session({ prompt: "只回一个字：好" })` → 轮询 `session_event_search`（`event_types: ['user/message']`、`query: "只回一个字"`、`session_id: <上一步 sessionId>`），最多 90 秒、间隔 5 秒 → `create_session({ prompt: "   " })` → 对该第三个 `sessionId` 做一次 `session_event_search({ event_types: ['user/message'], session_id: <第三个 sessionId> })` | 0 | 第一次第三行 `prompt: queued`；轮询命中 ≥1 条；第三次第三行 `prompt: none`；第四次结果为 0 条（证明空白 prompt 没发起模型调用）；两个 sessionId 记入交付清单 |
| A6 | `list_workspaces({})` 记工作区 id 集合与行数 → 逐工作区展开记会话基线 → 派一个 subagent 令其调用 `create_session({})` → 逐工作区再展开一次 → `list_workspaces({})` | 0 | **判定只取机制事实**：前后工作区 id 集合、工作区行数、逐工作区 `session:` 集合三者完全相同。子代理报告里出现 `subagents cannot create sessions` 记为佐证、不进判定；未出现但三组集合全等也判绿，并把子代理报告原文写进执行记录 |
| A7 | `list_workspaces({})` → 对其中两个工作区各跑一次 `list_workspaces({ workspace: <id> })` | 0 | 工作区行数 ≥ 2；每行以 `<id> \| ` 开头、以 ` \| sessions: <n>$` 结尾；包含 A2 的 W 与 A3 新建的工作区 id；两次展开里 `session:` 行数与对应行的 `sessions: <n>` 相等 |
| A8 | `create_session({ path: "<R>\\" })` → `create_session({ path: "<R>\\." })` → `list_workspaces({})` | 0 | 两次 `workspace:` 行的 id 相同（realpath 规范化后是同一个工作区）；该行的 `<path>` 经 `Resolve-Path` 后等于 R；第一次 `[reused]`（若为 `[created]`，记下并继续）；第二次必须 `[reused]`；第三步工作区行数不因第二次而增加 |

**A5 变红时如何区分两种成因**（写进执行记录，不进判定）：去 GUI 看那个会话里有没有「只回一个字：好」。有 → 是检索工具看不见刚建的会话（记盲点 `search-can-new-session`）；没有 → 是 prompt 没落地（真红）。

## 7. When to stop and ask

- Step 2 硬闸失败：第 10 步回读证明不了「调用后该会话在该工作区账目里」。
- Step 0 发现 profile 里没有 `dsh-session-mailbox` 的 `link:` 依赖，或 junction 已断（重连要写 `%USERPROFILE%\.dsh\profiles`）：报绝对路径等一句确认。
- 执行验收的会话是子代理，或拿不到 `plugin_manager` 的写权限。
- 按 §6 约定展开全部工作区都找不到自己所在的工作区。
- A3 的目标目录已被登记，且 User 没给替代目录。
- A6 红且原因是模型判断而非机制事实。
- A2 红且 `list_workspaces({ workspace: W })` 显示会话确实进了 W，但回读判定失败（会计滞后，不是实现错）。
- 用户对「Agent 可以自己建会话」或「可以自己建工作区」改变主意。
- 出现需要删除会话才能收场的局面：停下，把 id 清单交给 User。

## 8. Blind Spot List

- **no-delete-api**：误建的会话只能由用户在 GUI 删。回到这里的条件：用户说「垃圾会话清不掉」。
- **failure-path-prose**：Core Task (e) 的四条错误串（attach 失败、prompt 失败、`workspace disappeared`、`session not accounted`）没有验收行能变红，只有文本。回到这里的条件：任一次真实失败，或用户要求加注入测试。
- **rootof-guard-uncovered**：`rootOf` 那半个判据（E16 的两条抛错路径与「返回 activation.root」那条）没有端到端覆盖——普通 subagent 的 header 就带 `origin: 'subagent'`，会先在 `refusalFor` 命中，A6 只证明 header 分支。回到这里的条件：出现一次「header 干净但 rootOf 指向别人」的真实调用。
- **search-can-new-session**：A5 依赖「检索工具能看见刚建的会话」。回到这里的条件：A5 变红且 GUI 里能看到那条消息。
- **prompt-needs-live-session**：未验证「刚创建、从未打开的会话能否直接 `prompt`」。回到这里的条件：A5 报 `prompt failed:` 而会话确实存在。
- **requestid-format**：`requestId: 'create-' + sessionId` 的格式没有单独证据，只有 Step 3 的随机 UUID 退化方案。回到这里的条件：真机报 `requestId` 相关的校验错。
- **eacces-prose**：`EACCES` 分支只有文本。回到这里的条件：真的遇到读不到的路径。
- **concurrent-registration**：第 5 步快照与第 6 步 create 之间若有别人登记同一目录，会报 `[created]`。方向无害。回到这里的条件：用户看到「新建」的其实是界面上刚建的。
- **title-blank**：不传 prompt 时新会话显示为空白。回到这里的条件：用户连续两次认不出哪个是他刚让建的。
- **prompt-cost**：`prompt` 会真的发起一轮模型调用并跑工具。回到这里的条件：出现「只是建个会话怎么就开始跑了」。
- **recursion-prose**：跨顶层会话自繁殖只靠提示词一行约束。回到这里的条件：出现一次未经用户要求的创建。
- **cwd-fallback-coverage**：默认分支的 cwd 相等出口只有单测覆盖，A2 正常走 accounting。回到这里的条件：某台机器会计滞后导致 A2 走到该分支。
- **archived-grouping**：建在已归档会话所在工作区时的分组表现未验证。回到这里的条件：用户说新会话出现在「已归档」里。
- **workspace-title-dup**：`Workspace.title` 默认取路径末段，不同目录可同名（E5）。`list_workspaces({ workspace })` 按标题匹配会同名歧义报错（设计如此）；A2 用 id 定位 W，天然避开歧义。回到这里的条件：用户抱怨按标题找不到工作区。
