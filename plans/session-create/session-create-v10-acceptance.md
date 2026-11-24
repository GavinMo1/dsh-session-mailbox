# session-create v10 — 实施与验收记录

日期：2026-11-24 晚。机器：`GAVINMO\27017`（仓库 `D:\project\dsh-plugins`）。
方案：`session-create-v10.md`（含 §0 的 E1–E17 证据表）。**执行者不用读本文件**，除非要查「哪一条验过、证据是什么」。

## 结论

实现完成并已提交：`f3cb731`，tag `dsh-session-mailbox/v0.5.0`（版本 `0.4.0` → `0.5.0`）。
A1–A8 全部通过。`user-model` 的 A8 / A9a / A9b 也**由本机代跑通过**（见 §4）。

## 1. 改了哪些文件

| 文件 | 改动 |
|---|---|
| `plugins/session-mailbox/lib/create.js` | 新增。七个纯函数：`refusalFor`、`normalizePath`、`samePath`、`pickDefaultWorkspace`、`createdFromDiff`、`promptContent`、`subagentVerdict`、`gateVerdict`（八个名字，`normalizePath` 是为可测性单独导出的） |
| `plugins/session-mailbox/test/create.test.mjs` | 新增。18 条 `test()`，每条都 `console.log('CASE ...')` |
| `plugins/session-mailbox/index.js` | 加 `list_workspaces` 与 `create_session` 两个工具；`MAILBOX_PROMPT` 加一行；新 import 全是 `node:` 内置 |
| `plugins/session-mailbox/lib/pure.js` | 首行注释 `(currently: none)` → `(currently: create.js uses node:path)` |
| `plugins/session-mailbox/package.json` | `version` 0.5.0；`exports` 新增 `"./create"`（既有三条原样保留） |
| `plugins/session-mailbox/README.md` | 工具表加两行；新增「create_session 的语义」一节；「已知边界」补 5 条 |

备份（动文件之前做的）：`backups/index.js-bak-20261124-221319`、`package.json-bak-...`、`pure.js-bak-...`、`README.md-bak-...`。

## 2. 单元测试

```
node --check plugins/session-mailbox/index.js   → exit 0
node --test plugins/session-mailbox/test/*.test.mjs
  ℹ tests 31   ℹ pass 31   ℹ fail 0
```
既有 `pure.test.mjs` 13 条一条没动，新增 18 条。

## 3. 验收 A1–A8（全部在真实 DSH 上跑）

| # | 结果 | 证据 |
|---|---|---|
| A1 | **绿** | `pass 18`、`fail 0`、18 个 `CASE ` 名各出现一次、无 `ERR_MODULE_NOT_FOUND` |
| A2 | **绿** | `create_session({})` → `workspace: default-workspace (D:\文档\deepseek-harness\default-workspace) [reused] (id: 9013e500-…)`；`list_workspaces({ workspace: 'default-workspace' })` 里出现 `session: session-a299ed8b-6004-43b8-8826-ca102408fee6`；裸 `list_workspaces({})` 工作区行数保持 8 |
| A3 | **绿** | T = `C:\Users\27017\AppData\Local\Temp`；第一次 `[created]`（id `4ff0096a-3716-4c73-aed8-c3e759294634`），同路径第二次 `[reused]` 且 id 相同；展开该工作区 `sessions: 2` 并列出两个 `session:` 行；末尾工作区行数 8 → 9 |
| A4 | **绿** | 四条错误文本逐字命中：`empty path: pass a directory path or omit it`、`path must be absolute: sync`、`bad path: C:\Users\27017\AppData\Local\Temp\nope-does-not-exist-xyz`、`not a directory: D:\project\dsh-plugins\plugins\session-mailbox\package.json`；工作区行数仍 9、各工作区会话数不变、`Test-Path` 该目录 = `False` |
| A5 | **绿** | 首条消息 `只回一个字：好` → `prompt: queued`，且该会话标题变成「只回一个字：好」（说明真跑完一轮）；空白 prompt `"   "` → `prompt: none`，该会话一直是 `(untitled)`，即没发起模型调用 |
| A6 | **绿** | 派子代理调 `create_session({})`，它拿到的原文是 `Error: subagents cannot create sessions`；前后 10 个工作区的 id 集合、行数、逐工作区 `session:` 集合**完全相同** |
| A7 | **绿** | 裸 `list_workspaces({})` 8 行、格式 `<id> \| <title> \| <path> \| sessions: <n>`、裸调用不追加任何 `session:` 行；含 `default-workspace` |
| A8 | **绿** | `D:\project\dsh-plugins\` 与 `D:\project\dsh-plugins\.` 归到同一 id `7a5f3b47-ba12-4111-9ac4-5f17f1402610`，path 都是 `D:\project\dsh-plugins`，第一次 `[created]`、第二次 `[reused]` |

**验收留下的会话（由 User 在 GUI 删，Agent 不删）**：
`session-a299ed8b-…fee6`（A2）、`session-5d5ec270-…e8f9` + `session-df20498d-…e6a6`（A3）、
`session-4004d7c8-…1658`（A5，带首条消息已跑一轮）、`session-a1f51889-…0793`（A5，空白）、
`session-f6fa6677-…a95a` + `session-7c14f62f-…3c26`（A8）、`session-917b597a-…cad5`（回归冒烟）。
**新增工作区**：`4ff0096a-…4634`（Temp）、`7a5f3b47-…2610`（dsh-plugins）、`309414b7-…5340`（27017）。

## 4. user-model 三项验收（用 create_session 代跑）

原交接文档写「必须真人跑，Agent 无法自建带指定 cwd 的会话」——`create_session` 上线后这条不再成立，代跑结果：

| # | 结果 | 证据（读会话日志得出） |
|---|---|---|
| A8a（cwd = `C:\Users\27017`） | **绿** | 工具调用 `["user_model_search {\"keywords\":[\"偏好\",\"习惯\",\"工作方式\"]}"]`；答案开头即「先查用户模型库，而不是先猜」 |
| A8b（cwd = `%TEMP%`） | **绿** | 工具调用 `["user_model_search {\"keywords\":[\"偏好\",\"回答风格\",\"习惯\"]}"]`；答案复述了库里的那条记录 |
| A9a（周末写代码） | **绿** | `toolTally: {"user_model_search":2}`；答案里出现 **`ZKQ7-marker`** 与条目 id `20261124-a9-fixture`，并据此回答「周末通常在下午写代码」 |
| A9b（我养猫吗） | **绿** | `user_model_search` 后答「查不到相关记录，所以**不知道**你养不养猫」，结尾邀请「如果这是你希望我长期记住的事，直接告诉我」——没编，也没有假装知道 |

因此 A9 通过，**按交接文档可以删夹具**（命令见 `STATUS.md`）。是否现在删由 User 定。
代跑留下的会话：`session-e4d5d98a-…039e`、`session-8f27ace4-…dec7`、`session-841c6194-…ef54`、`session-98bee9ae-…f312`。

## 5. 独立 review 发现并修掉的问题

提交前按 `AGENTS.md` E2 做了一次只读子代理 review，三条实质问题已全部修掉：

1. **（high，真 bug）首条消息可能投递两次**：原实现按错误文本正则重试 `prompt`，而换 requestId 会绕过控制器侧的去重键 → 新会话收到两条用户消息、跑两轮模型。**已删掉整个投机重试**，只发一次，`requestId` 固定为 `create-<sessionId>`（review 核实过源码里 requestId 没有任何格式校验，所以固定值本身也是幂等的）。
2. **（medium）`sessionIdsBefore` 是死变量，注释还把机制说错**：原注释说「比较活账目永远不收敛」，实际 `get()` 返回同一实体但 `sessionIds` 是活 getter（`attachSession` 换掉了 record），所以读到的确实是调用后的账目。**已改成真的用上快照**：抽成 `gateVerdict({before, now, sessionId})` → `'ok' | 'already-there' | 'missing'`，注释改成正确解释。`already-there` 只作为记录，不判红（复用空白会话的情形）。
3. **（medium）`sessionController` 进了必填 `inject` 却又用 `ctx.get` 现取**：等于把「缺服务就静默零工具」的风险换了个位置。**已从 `inject` 移除**，两处都改用 `ctx.get` + 显式拒绝（`create_session cannot create sessions: the sessionController service is unavailable`）。

另外吸收了：`normalizePath` 单独导出（原来 `same-path-drive-root` 那四条断言无法区分「有守卫/没守卫」，现在直接断言规范值 `c:\`）；`index.js` 末尾补换行；README 注明 `list_workspaces` **不剔**已归档会话（与 `list_sessions` 口径不同）；原有测试条数改成下界口径。

`samePath` 里那段 `length > 3 && slice` 已删：`resolve()` 本身就会去掉非根路径的尾分隔符，能被它返回成「带尾分隔符」的只剩盘根，而那正是必须保留的。现在只剩 `normalizePath = resolve(...).toLowerCase()`，并注明这是 Windows 语义（POSIX 大小写敏感时不可用）。

## 6. 仍未覆盖的（诚实清单）

- **`rootOf` 抛错那两条路径没有端到端覆盖**：普通子代理的 header 就带 `origin: 'subagent'`，会先在 header 判定命中。`subagentVerdict` 的单测覆盖了 `allow/subagent/unverifiable` 三态，但真实 `SubagentError` 分支没被活体触发过。
- **`session_event_search` 在本机每次都在 30 秒超时**（不是零结果）。A5 因此改用「会话标题是否被 LLM 生成」+ `toolTally` 判定。这是既有工具的问题，不是本次改动的，但它让「按事件检索」这条验收路线不可用，值得单独查。
- **`already-there` 分支没有活体触发**：本工具从不传 `sessionId`，所以控制器的复用分支走不到，只有单测覆盖。
- 错误路径的文案（`create failed after the session existed:` / `prompt failed:`）没有验收行能变红，只有文本。
