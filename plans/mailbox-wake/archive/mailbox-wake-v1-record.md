# mailbox-wake v1 — Review Record

被评审版本：`mailbox-wake-v1.md`（v1，round 1）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Choice List、Core Precondition 状态、开放项）。

## 结论

**未收敛 → 开出 v2。** round 1 三条 route 全部完成，共 2 个 high、17 个 medium、10 个 low；两个 high（S4 与验收判据自相矛盾；not-found 文案断言了判别器查不到的事实）落在「必须改，且改完就是新版本」的位置上。v1 的实现状态：未开始（用户未放行）。

## 版本、级别与授权

- 当前版本 v1；已完成 round：1；进行中：无（v2 待写）。
- 评审级别：**Deep**，route 数 3（Goal and Implementation / Operation and Evolution / Adversarial）。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 级别判定证据（四个 Light 测试）

| 测试 | 结论 | 证据 |
|---|---|---|
| (1) 改动可逆 | 成立 | 源码改动可用 `git revert`；文档改动同在本插件目录 |
| (2) 不触达用户可见行为与公开契约 | **不成立** | `send_session_message` 的错误文本、输出 schema（新增 required `woke`）、README「已知边界」都变；见 Decision 5 |
| (3) 无迁移、无切换、无新依赖 | 成立 | 无数据迁移；不引入依赖；不改 profile |
| (4) 无改变后续所有步骤的决策点 | 不成立 | Decision 2（`resolveAgent` 还是手搓 `agents.resume`）改变整条实现路径 |

→ 按「触达共享接口（公开工具契约）」判 Deep，不降级。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用它的返回值（`{ agent }` 或 `{ error }`） | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 只有一行 `return this.agents.resolveAgent(sessionId)`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch，把 not-found / subagent / writer-held / 其他都折成 `{ error: RemoteError }` 返回、不抛；property: fact | 若 `resolveAgent` 在真机上抛异常而不是返回 `{error}`，本决策被否。替代方案「自己 `ctx.agents.resume({resumeSessionId, agentOptions, setup})`」被否：`agent.ts :: resumeObserved` 里 `composition = await this.composeAgent(this.presetForObservation(observation))`，自组需复刻 preset 解析与 projection 读取两层 |
| Decision 2 | 冷路径只接受完整 session id；标题、短名、id 后缀不解析冷会话 | `index.js :: rows()` 只映射 `ctx.agents.list()`，故 `pure.resolveTarget` 的输入表天然只含活会话；property: preference | 替代方案「用 `sessionController.list()` 拿全量（含冷）行」被否：`list()` 是 `@Remote` 异步方法，每次发消息都要扫一遍持久化记录；`types.ts :: SessionSummary` 没有 title 字段，标题得从 projection cache 取；用户原话只要求「用它的 session id」 |
| Decision 3 | 归档检查放在唤醒**之前**，读失败一律拒绝 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`，注释原话「ends as `blocked` without a request」，所以唤醒归档会话等于空转；property: fact | 若 gate 允许 pre-step 通过，本决策被否。替代方案「先唤醒再看归档」被否：先付一份内存再必然失败 |
| Decision 4 | 投递仍用活 agent 的 `followup` / `steer`，唤醒路径不特判 `statusBefore` / `primitive` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`，与 GUI 打开会话得到的是同一类对象；`agent-loop/agent.ts` 的 maintenance 期间 `status === 'idle'`；property: fact（对象同一性与 idle 状态）/ to verify（followup 立即起 turn，见 P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：把两条路径拆成两套语义，`steer` 在冷路径上无从表达 |
| Decision 5 | 输出契约新增 required boolean `woke`，同步改工具描述、`MAILBOX_PROMPT`、README；`list_sessions` 不动；版本 0.8.1 → 0.9.0 | `index.js :: send_session_message.output.schema`（五个 required 字段）+ `README.md` 工具表与「已知边界」；`package.json` `"version": "0.8.1"`；property: preference | 若用户要求「不加字段」，则只剩 render 文本能表达唤醒，调用方无法程序化判断 |
| Decision 6 | 唤醒不加自建超时、不加 `Promise.race`、不重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`，同 id 并发唤醒已去重；`resolveAgent(sessionId)` 没有 signal 位置；property: fact | 若真机上出现唤醒长时间不返回，按 BS-5 回来 |

### Appendix 1 · 错误码到文案的映射

`agent.ts :: ApiSessionAgentController.resolve` 的四个出口：`ApiSessionNotFound` → `RemoteError('session/not-found', …)`；`ApiSessionSubagentOwnership` / live 且 subagent → `apiSessionSubagentOwnershipError()`，code 是 **`'session/agent-busy'`**（不是独立 code），`details.reason` 是 `'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`remote-error.ts :: RemoteError` 带 `readonly code` / `readonly details`，判别按 `code` + `details`，不按类名。property: fact。

### Appendix 2 · 不做全量预热、不缓存唤醒结果

唤醒即真装 agent，每会话一份；插件侧不留任何 woken 集合。property: preference。若调用方一次 turn 内唤醒过多会话，按 BS-3 回来。

### Choice List（Decision Table 的派生视图）

- asked：无（本轮没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()` 全量解析，did not ask，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，did not ask，because 加字段有本插件先例（`statusBefore`/`primitive`）。
- default, not asked；chose `resolveAgent`，rejected 手搓 `agents.resume`，did not ask，because 前者是宿主注释写明的对外入口。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 均 property: fact，destination 为 text 与「一项测试」；P6 property: to verify，destination 为验收表第 3、4 行。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `sessionController.resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾把一切折成 `{ error: RemoteError(...) }`。判据：若在该符号里找不到 `return { error:` 分支，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))` → `ctx.agents.resume({ resumeSessionId, agentOptions, setup: composition.setup })`。判据：若 `resumeObserved` 里没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝，唤醒它等于空转 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若 pre-step 没有 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController`，不需要新依赖 | proved | `index.js :: create_session.execute` 已有 `const controller = ctx.get('sessionController')`。判据：若找不到该调用，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话会被报 not-found 而不是被唤醒 | proved | `agent.ts :: resumeObserved` 首句 `if (observation.header.id !== sessionId || observation.header.cwd === undefined) throw new ApiSessionNotFound(...)`。判据：若该行没有 `header.cwd === undefined`，本条为假 |
| P6 | resume 之后立刻 `followup` 会真的起一个 turn | to verify | check：验收表第 3、4 行；result：未跑（实现前没有可调用的新代码）。Adversarial route 从 `agent-loop/agent.ts`（maintenance 期间 idle）与 `agent-loop/index.ts`（`interruptedTurnClosers`）读出「应当成立」，仍按 to verify 保留 |

## Route 状态（round 1）

| Route | 代理 | 状态 | 覆盖 | 结果 |
|---|---|---|---|---|
| Goal and Implementation | r1-goal（新代理） | 完成 | 冻结全文 + 决策半 | 0 high / 6 medium / 4 low；Gate Q1 true 项：R1G-01、R1G-03、R1G-04、R1G-06 |
| Operation and Evolution | r1-ops（新代理） | 完成 | 冻结全文 + 决策半 | 0 high / 7 medium / 4 low；Gate Q2 true 项：R1O-03 |
| Adversarial | r1-adv（新代理） | 完成 | 冻结全文 + 决策半 | 2 high / 4 medium / 2 low；Gate Q1+Q2 true 项：R1A-01、R1A-02、R1A-03、R1A-05、R1A-06 |

三条 route 均为新代理，未读过任何旧版本；未向它们透露 Author 的判断或其他 route 的结论。

## round 1 问题清单（ID / 严重度 / 位置）

| ID | 严重度 | 位置 | 一句话 |
|---|---|---|---|
| R1A-01 | high | v1 §3 Step 4 判据 / §6 第 9 行 ↔ §4 S4 | S4 指定追加的两句话含 `loaded in this process`，而判据要求该串 0 命中 → 两条明文规则互斥 |
| R1A-02 | high | v1 §4 S2 4.6 / §6 第 6 行 | not-found 文案 `no transcript is stored under that id` 把「不是 id」与「无转录」塌成一个状态，真机上 52 次调用里 52 次都可能是前一种 |
| R1A-03 | medium | v1 §4 S4 | 「完整 id ⇒ 一定被唤醒」的普遍断言与 `header.cwd === undefined` 反例冲突 |
| R1A-04 | medium | v1 §4 S2 4.7 / `pure.js :: buildAliasTable` | 唤醒路径的 `name` 用 `slice(-8)`，与别名表是两套规则，构造碰撞后可解析到另一个会话 |
| R1A-05 | medium | v1 §4 S2 4.2 | 白名单闸用未解析的原始串 `q`；忽略 `config.allow` 的冷路径实现能通过全部验收行与全部 CASE |
| R1A-06 | medium | v1 §4 S2 5 | 所谓「统一尾部」不含归档复查（活路径有），唤醒后瞬间归档会 queued 但必然 blocked |
| R1A-07 | low | v1 §5 No-go 7 | 「不得改三种拒绝的先后顺序」与冷路径固定顺序冲突 |
| R1A-08 | low | v1 §4 S1 表第 3 行 | `session/agent-busy` 的「其余」一律归 subagent，宿主里该 code 还有别的产生者 |
| R1O-01 | medium | v1 §3 Step 6 / §6 第 10 行 | tag 前缀错：仓内既有 `dsh-session-mailbox/v*`，根 README 的 `<plugin-name>` 指包名 |
| R1O-02 | medium | v1 §6 第 3 行 | 目标选择器取「`list_workspaces` 有、`list_sessions` 无」的差集，而该差集是 cold ∪ archived，无法排除归档 |
| R1O-03 | medium | v1 §4 S2 4.3 / §6 第 9 行 | 冷+归档分支在整张验收表上不可达（第 9 行造的是活会话），写错不会有红行 |
| R1O-04 | medium | v1 §6 第 7 行 | `list_agents` 的名字是子代理路径名，不是会话 id（实测 `lead`/`r1-goal`/…） |
| R1O-05 | medium | v1 §4 S4 | 「唤醒的代价」漏掉唯一对其它消费者可见的副作用：唤醒后该会话出现在 `list_sessions` 里 |
| R1O-06 | medium | v1 §4 S2 失败处理 | 把唤醒写成「一次磁盘读」，实际是读转录 + 装配 preset + publish Agent |
| R1O-07 | medium | v1 §3 Step 6 / §6 第 10 行 | `git status --short` 为空这条闸受工作树里无关的未跟踪文件影响 |
| R1O-08 | low | v1 §4 S2 4.6 | not-found 文案对「标题/短名」与「无 cwd」两种情况都断言了假事实（与 R1A-02 同源） |
| R1O-09 | low | v1 §4 S3 | 「两个返回点」与实际唯一返回点不符 |
| R1O-10 | low | v1 §4 S4 | 提示词里 `woken` 一词已有旧含义（唤起空闲对端），新增行会与之混 |
| R1O-11 | low | v1 §4 S4 | 升级前启动的会话保留旧提示词快照，永远不知道可以唤醒冷会话 |
| R1G-01 | medium | v1 §6 第 1 行 | `# fail 0` 在本机永不出现（实际 `ℹ fail 0`）；`CASE ` 计数因 `✔ same-path-case` 现为 35 而非 34 |
| R1G-02 | medium | v1 §6 第 9 行 | `\|` 是 Markdown 转义，进了正则后恒 0 命中 → 该行自证 |
| R1G-03 | medium | v1 §6 第 4 行 | 无等待规则、且「回合数」不是 `session-log.mjs` 会打印的量 |
| R1G-04 | medium | v1 §6 第 7 行 | 同 R1O-04 |
| R1G-05 | medium | v1 §4 S2 4.6 | 同 R1A-02 的验收侧 |
| R1G-06 | medium | v1 §6 第 3、8 行 | 探针必然写进用户真实会话，「写其它目录 → 停」与之冲突，且没有授权口径 |
| R1G-07 | low | v1 §3 Step 5 | 「九行」与 10 行不符 |
| R1G-08 | low | v1 §3 Step 1 | 命令跑 `pure.test.mjs`（13 条）却写「旧 34 条」 |
| R1G-09 | low | v1 §4 S2 4.2 | 唤醒路径没有 `entry`，却要求「按现有两条白名单错误原文报错」 |
| R1G-10 | low | v1 §4 Step 1 / S3 | `coldTargetName` 与别名表两套规则，回传的 `name` 可能不是地址 |

## Author 对关键问题的复算（raw evidence）

| 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|
| `node --test plugins/session-mailbox/test/*.test.mjs` | 0 | `ℹ tests 34`、`ℹ fail 0`；`CASE ` 计数 35（多的一行是 `✔ same-path-case (0.2717ms)`） | R1G-01 成立 |
| `Select-String -Path index.js,README.md -Pattern 'loaded in this process\|未加载（冷）会话收不到' \| Measure-Object` | – | 计数 **0**（未实现仓库上） | R1G-02 成立 |
| 同上但用未转义的 `|` | – | 计数 **2**（`index.js:184`、`README.md:104`） | 转义是 Markdown 泄漏进正则 |
| `git tag --list \| Select-String session-mailbox` | – | `dsh-session-mailbox/v0.5.0 … v0.8.1`、`session-mailbox/v0.4.0` | R1O-01 成立 |
| `list_agents({})` | – | `lead`、`r1-goal`、`r1-ops`、`r1-adv` | R1O-04 成立 |
| `node scripts/session-log.mjs <id>` | 0 | `# <n> records`、`[USER source=session-mailbox]`、`[TOOL CALL]`；本条 route 的 `[ASSISTANT]` 计数为 0 | R1G-03 成立；可用度量改为 `# <n> records` 增长 |

## round 1 变更面

round 1 是 v1 的首次评审，没有对 v1 的改动。

- 触及的决策点：无（未改）。
- 新增位置：无。
- 删除/合并：deleted 0。
- 是否用新规则回答新发现：尚未（v2 才回答）。
- 本轮新增机制数：0。

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`，用 `node scripts/asar.mjs cat <asar> <path>` 取出。本记录的 `file :: symbol` 指该包内路径。
- 本机 `node` 在 workspace-write 沙箱下无法开 stdout 管道（EPERM）；本会话已切到 danger-full-access，`node` 可正常输出。
