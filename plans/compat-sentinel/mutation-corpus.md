# compat-sentinel 变异语料（执行期取证用）

**这不是方案的一部分。** Work Plan 的正文冻结在 `compat-sentinel-v12.md`（Decision 12），本文件是交给执行方的一份**输入语料**：建出 `scripts/compat-check.mjs` 之后，用它在成片文件上跑一遍，替代「再派一位只读同一份文本的评审」。

读者：执行方（用户放行后由派发消息把它作为额外交付输入给出）与 Author。

## 怎么跑

1. 把宿主源码从 `app.asar` 取到临时目录（`scripts/asar.mjs cat <asar> <entry> <outFile>`，**不要**改成仓库内的文件；asar 是只读的，§5 No-go 2）。
2. 对每条语料：在副本上做标注的改动 → 用**已实现的** `scripts/compat-check.mjs` 指向同一份 asar? **不行**——`compat-check` 只读 asar。所以两种跑法，二选一并在交付报告里写明用了哪种：
   - **A（推荐）**：把改动后的源码树重新打进一个临时 asar（`asar` 格式：16 字节头 + JSON + 数据，`files` 里给出 `size`/`offset`；本仓 `scripts/asar.mjs` 的解析就是格式规范），再用 `node scripts/compat-check.mjs --asar <临时 asar>`。
   - **B**：把 `compat-check.mjs` 的读取层用一个 `--fixture-dir <dir>` 之类的**临时本地补丁**替换（只存在于 `%TEMP%`，不进仓库、不进提交），跑完后删掉。**不得**把这个开关提交进仓库（§5 No-go 4：「表只能内嵌在脚本里」的同一精神）。
3. 判据：语料标 `expect: FAIL <id>` 的 → 该行必须红；标 `expect: GREEN（已披露）` 的 → 该行保持绿，但必须能在交付报告里引用本文件对应的 BS 条目。任一条不符 → 按 Decision 6 停，不要改断言。

## 一、R7 的 32 条（v7/v8 轮建立的语料，v12 的表仍适用）

| # | 改动（宿主源码） | 目标行 | expect |
|---|---|---|---|
| 1 | `SessionHeader` 的 `cwd`/`origin`/`delegationDepth` 搬进一个 4 格嵌套对象 | A32 | FAIL |
| 2 | 同上三字段删掉，改成「块后一个兄弟 interface 携带」 | A32 | FAIL |
| 3 | `Config.maxTitleBytes` 从公开 `Config` 删掉（`ResolvedConfig` 保留） | A14 | FAIL |
| 4 | `interface Agent` 的 `session`/`status` 搬进**同一 `declare module` 内**的兄弟声明 | A38 | FAIL |
| 5 | `interface AssembleContext` 的 `agent?: Agent` 同样搬进同 module 兄弟声明 | A49 | FAIL |
| 6 | `followup` 改名 `enqueueFollowup`，同文件别处留一个 `LegacyInbox { followup(...) }` | A05 | FAIL |
| 7 | `archiveSession(...)` 的返回类型从 `Promise<void>` 改成 `Promise<ArchiveOutcome>` | A21 | FAIL |
| 8 | `ArchiveSessionOptions.stopActivity` 改名，另留一个同形兄弟字段 | A56 | FAIL |
| 9 | `SUBAGENT_DELEGATION: 120,` → `1200,` | A34 | FAIL |
| 10 | `SessionTitleSnapshot` 去掉 `extends SessionTitleEventData` | A54 | FAIL |
| 11 | `'session/workspace-attach-failed'` 的 details 键改成 `createdSessionId` | A55 | FAIL |
| 12 | `readonly status: AgentStatus` → `AgentStatus \| 'paused'`（同一行） | A38 | FAIL |
| 13 | `readonly title: string` → `string \| undefined`（同一行） | A42 | FAIL |
| 14 | `readonly createdAt: number` → `number \| undefined`（同一行） | A32 | FAIL |
| 15 | `get archivedSessionIds(): readonly SessionId[]` → 末尾加 `\| undefined` | A20 | FAIL |
| 16 | `throw new WorkspaceActiveSessionError(sessionId, activity)` 改成 `logger.warn(...)`（不再抛） | A21 | FAIL |
| 17 | `commands.ts` 的 `{ sessionId, workspaceId: workspace.id }` 改成 `{ createdSessionId: ... }` | A57 | FAIL |
| 18 | `SessionHeader` 的块尾 `\n}` 改成 `\n  }`，`cwd` 搬进紧随其后的声明 | A32 | FAIL |
| 19 | `dsh-agent/src/types.ts` 删掉 `readonly id: SessionId` | A48 | FAIL |
| 20 | `SessionPromptRequest.content` 搬进后面的 interface | A41 | FAIL |
| 21 | `rootOf` 整段替换成 `return caller` | A53 | FAIL |
| 22 | `ContextBody.tsx` 的 `asRecord(source)?.['senderSessionId']` → `['senderId']` | A50 | FAIL |
| 23 | `event-projection.ts` 的 `KNOWN_FORMS` 里去掉 `'relay'` | A51 | FAIL |
| 24 | `ToolExecutionInput.signal` 改名 `abort` | A52 | FAIL |
| 25 | `dsh-tools/src/index.ts` 的 `super(ctx, 'tools')` → `'toolbox'` | A36 | FAIL |
| 26 | `AgentStatus` 加第三个成员（同一行） | A04 | FAIL |
| 27 | `Workspace.title` 改名 `displayTitle` | A39 | FAIL |
| 28 | `SessionTitleEventData.title` 改名 `text` | A42 | FAIL |
| 29 | `ProfileContext.installAnchor` 改名 `anchor` | A31 | FAIL |
| 30 | `export function defineTool<` → `defineToolV2<` | A25 | FAIL |
| 31 | `rootOf` 开头插一条早退（四个标记全留） | A53 | **GREEN（已披露 BS-12）** |
| 32 | `Config` 块内插一行列首 `}` 注释 | A14 | **GREEN（已披露 BS-9；假红方向）** |

## 二、round 9 Adversarial 报告的 4 条（v12 已收，作为回归语料）

| # | 改动 | 目标行 | expect |
|---|---|---|---|
| 33 | `DefineToolOptions` 的 `readonly output: {` → `readonly result: {`（`defineTool` 体内同步改） | A58 | FAIL |
| 34 | `ContentBlockMap` 的 `'text'` 改名 `'plain'`，同文件新增 `PromptBlockMap { 'text': TextBlock }` | A63 | FAIL |
| 35 | `agent.ts` 的 emit 侧 `'session/not-found'` → `'session/missing'`，union(:86) 与另一处文案(:23) 不动 | A64 | **GREEN（已披露 BS-17）** |
| 36 | `AgentStatus` 的并集第三成员写成「先一行注释、再起一行 `\| 'paused'`」 | A04 | **GREEN（已披露 BS-14）** |

## 三、为 v11/v12 的 8 个改动准备的那批（这一类洞的回归集）

| # | 改动 | 目标行 | expect |
|---|---|---|---|
| 37 | `T → T \| undefined`（同一行） | A38 / A42 / A32 / A20 | FAIL（四条各跑一次） |
| 38 | `Agent[] → Agent[][]`（`list()` 的返回类型） | A03 / A19 | FAIL |
| 39 | 联合成员以 `&` 续行、且不在行首（`\n  & Branded`） | A38 | FAIL |
| 40 | 字段后面加行尾注释（`readonly cwd?: string // absolute`） | A32 | **GREEN（无害编辑；前瞻含 `//`）** |
| 41 | `readonly description:\n    string`（pattern 内部折行） | A58 | **GREEN（已披露 BS-9；假红方向）** |
| 42 | `SUBAGENT_DELEGATION: 120,` 去掉尾逗号 | A34 | **GREEN（已披露 BS-9；假红方向）** |
| 43 | 在 `AgentStatus` 之后插一行 `/** … */` 再空行 | A04 | FAIL（前瞻允许注释，但 next 不是 `\|` 时应通过——此条用来确认注释本身不触发 FAIL，**expect GREEN**） |
| 44 | `region` 起锚在文档注释里被复制一份（`* interface Agent {`） | A05/A38/A49 | **GREEN（已披露 BS-18；假红方向）** |
| 45 | `TextBlock` 加一个必填成员 `renderedAt: number` | A62/A63 | **GREEN（已披露 BS-15；成员集合）** |
| 46 | `ValueSchemaAnnotations.description` 改名 `doc` | A58 | **GREEN（已披露 BS-15）** |
| 47 | `dsh-session/src/index.ts` 的 `Session.header` 改名/收窄成子集 | A32 | **GREEN（已披露 BS-15）** |
| 48 | `SessionCreateValue.sessionId` 改名 | A07 | **GREEN（已披露 BS-15）** |
| 49 | controller 的 `PromptContentPart` text 变体 `text` → `value` | A41 | **GREEN（已披露 BS-15）** |

## 记法

- **FAIL** = 断言必须变红；不变红就是「漏抓 → 按 Decision 6 停，不要为了变绿改断言，也不要新开版本号」。
- **GREEN（已披露）** = 预期不变红，且必须能在交付报告里指到对应的 BS 条目（BS-9 / BS-12 / BS-14 / BS-15 / BS-17 / BS-18）。它们不是缺陷计数，是**已知边界**。
- 每条语料都应在仓库外的副本上做；`plugins/` 与 profile 一律不动（§5 No-go 9）。
