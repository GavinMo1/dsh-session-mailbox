# mailbox-wake v7 — Review Record

被评审版本：`mailbox-wake-v7.md`（v7，round 7）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1–v6 的全文与记录在 `archive/`。

## 结论

**round 7 进行中。** high 数按轮次：r1 = 2、r2 = 1、r3 = 3、r4 = 0、r5 = 1、r6 = 2（两条 route 各自独立复现同一处：`unexpected resolve verdict` 计数写成 1，而现树是 2）。v7 修掉它，并把「唯一端到端验收没验起没起 turn」这条 medium 补成真判据。

## 版本、级别与授权

- 当前版本 v7；已完成 round：6；进行中：round 7。
- 评审级别：**Deep**，route 数 3。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Goal route 换成新代理做全量扫描，Operation 与 Adversarial 复用并只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用（round 7/10）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛，只有这两种返回态；property: fact | 真机上抛异常或出现第三种返回态则被否（§7 有对应停条件）。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`；property: preference | 替代方案「扫 `sessionController.list()`」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。历史 52 次投递：48 短名 / 4 标题 / 0 完整 id |
| Decision 3 | 冷路径顺序：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝；准入返回值之外的取值兜底抛错 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`（「ends as `blocked` without a request」）；property: fact（gate）/ preference（顺序） | 若 gate 放行 pre-step，前半被否。替代方案「先装载再判归档」被否：先付内存再必然失败（Step 2 的行序判据把它变成可检查的） |
| Decision 4 | 投递仍用 `followup` / `steer`，冷路径不特判 `statusBefore` / `primitive`；「唤醒」的验收要求对端真的产出 `assistant/message` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`；`dsh-agent/src/runtime-types.ts` 的 `followup` = 「Queue an ordinary follow-up turn and wake the driver」；property: fact / to verify（P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：两条路径语义分裂，`steer` 无从表达 |
| Decision 5 | 输出契约新增 required `woke`；回执 `name` 取自 `rows()` 的别名表；三处对外文案点名冷 id 来源并声明 orphan 边界；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；`index.js :: list_workspaces` 的展开行是冷 id 的可读来源；property: preference | 替代方案「`name` 用 `id.slice(-8)`」被否：与别名表两套规则。替代方案「不提 id 来源」被否：那会让新能力只对「用户手动粘 id」可达 |
| Decision 6 | 唤醒不加自建超时 / `Promise.race` / 重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`；`resolveAgent` 无 signal 位置；property: fact | 长时间不返回按 BS-4 回来 |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」；`rename_session` 用 §4 S2 3 的完整代码块替换它的取 agent 段 | 现树 `rename_session.execute` 自带 `try/catch`、早退、三处 `cannot rename session` 与 `unexpected resolve verdict` 兜底；替换后 `cannot rename session` 3 处、`unexpected resolve verdict` 仍 2 处；property: preference | 替代方案「只换调用表达式、旧四行不动」被否：`{ok, agent}` 没有 `error` 键，失败会塌成一句假陈述。替代方案「为凑计数删掉 rename 的兜底」被否：那是越界改动，且会让 `resolveTarget` 的新 reason 撞成 TypeError |
| Decision 8 | 两条路径用 `if (found.ok === true) { 活 } else { 三条拒绝 → 兜底 → 冷 }` 分派；共用同一段尾部；活路径白名单闸留在原位 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`pure.js :: decideDelivery` 是唯一策略实现；三条解析拒绝在现树是独立 throw；property: preference | 替代方案「`else if (found.ok === true) … else throw`」被否：`empty`/`self`/`ambiguous` 会落进 `else`，静默丢掉三条明文文案（r6 实测）。替代方案「活路径也走 `coldAdmission`」被否：会动活路径既有的归档判定时机 |

### Appendix 1 · 错误码到文案的映射

`resolve` 四出口：`ApiSessionNotFound` → `'session/not-found'`（**两个来源**：无转录、有转录但 `header.cwd === undefined`）；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者，故按 reason 白名单判。`RemoteError` 带 `readonly code` / `readonly details`。property: fact。v7 的 `not-found` 文案在末尾带上 `<detail>`，就是为了让这两种来源在回执里可分辨。

### Appendix 2 · 不做全量预热

每会话一份，插件侧不留 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 README 的 `<plugin-name>/v<version>` 且要求 `name` 用 `dsh-<name>`。property: fact。

### Appendix 4 · `woke` = 「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也拿到 `true`。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`list_workspaces` 展开行只有 `session: <id>`、无标题，且 `WorkspaceEntity.sessionIds` 会过滤 cwd 与工作区不一致的会话；orphan 会话（工作区登记已删）在任何展开行里都不出现。property: fact / preference。

### Appendix 6 · 白名单三态只有一份实现

`pure.js :: decideDelivery` 是唯一策略实现；`coldAdmission` 先判「allow 既非 undefined 也非数组」→ `allow-unreadable`，再调它。活路径对非数组 `allow` 仍是既有行为，属范围外的既有缺陷。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（七轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose 显式 `if (ok) … else { 拒绝三连 → 兜底 → 冷 }`，rejected `else if (ok) … else throw`，because 后者会让三条明文文案落进 `else`。
- default, not asked；chose 为「唤醒」加 `assistant/message` 判据，rejected 只验消息落盘，because 用户原话要的是「唤醒 + 投递」，只验落盘等于不验唤醒。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 fact；P6 to verify，destination 为 §6 冷唤醒探针。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛，无第三种返回态 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾折成 `{ error: RemoteError(...) }`。判据：若该类里出现第三处 `return` 形状，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 冷唤醒探针的 `--answers` 读里出现 `[ASSISTANT]`；result：未跑。`dsh-agent/src/runtime-types.ts` 的 `followup` 契约与 `dsh-agent-loop` 的 `wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r7-goal（**新代理**，未见过任何旧版本） | 未开始 | v7 全文（全量扫描） | — |
| Operation and Evolution | r1-ops（复用；看过 v1–v6） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v1–v6 内存 |
| Adversarial | r5-adv（复用；看过 v5、v6） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v5、v6 内存 |

## 本轮变更面（v6 → v7）

- 触及的决策点：Decision 4（唤醒的验收判据）、Decision 7（rename 兜底的保留）、Decision 8（分派骨架的形状）。
- 新增位置：
  1. §4 S2 4 的 `if (found.ok === true) … else { 三连 → 兜底 → 冷 }` 骨架（三条明文拒绝现在写在分派内部）。
  2. §6 的「自己的地址与空地址」一行（三条明文拒绝的第一个验收项）。
  3. §6 冷唤醒探针的 `--answers` 读（`[ASSISTANT]`）。
  4. §3 Step 2 的第七项计数（`unexpected resolve verdict` = 2）与 Step 0 基线清单的第七项。
  5. §7 新增「非 Core 行红 → 停下问」一条。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §6 冷唤醒探针「换下一条候选」里对基线 `b` 的复用，改为「回到 (2) 重新取该候选自己的 b」。
  2. 删 §3 Step 5/6 之间互相矛盾的「或已按 Step 5 停下并报告」（Step 6 前置现在只有「§6 全绿」）。
  3. 删 §4 S2 5 的「现有代码逐句保留」表述（它会让 origin 检查与归档复查被搬进活路径块，与第 7 段重复）。
  4. 删 §3 Step 3 的 `'woke,'` / `'woke }'` 判据（排版敏感且返回点已被 schema required 与行为行覆盖），改为 `'let woke = false'`。
  5. 把 §4 S1 与 S5 的「五个字符串」改成「六个」。
  6. 删 §6 第 5 行对 `not-found` 文案的 `only when its stored transcript can be resumed` 独占断言，文案尾部改为带 `<detail>` 以便分辨两种 not-found 来源。
- 为什么新增不是 0：分派骨架是 Decision 8 的执行细节（上一版把三条明文文案放进了对手位置）；`--answers` 判据是 Decision 4 唯一能证明「唤醒」的观测；其余新增都是把 v6 已有规则改成可判定形态。
- 是否用新规则回答新发现：否。本轮没有新增数据源、状态或依赖。
- 本轮新增机制数：0（骨架与判据都是既有决策的执行细节）。

## Closure Table（round 6 的 18 个问题）

| Problem ID | Source route | Status | Evidence position（v7） | Next step |
|---|---|---|---|---|
| R6G-01 / R6O-01 / R6A-01（`unexpected resolve verdict` 计数 = 1 不可满足） | Goal / Operation / Adversarial | Resolved | §3 Step 0 与 Step 2 都写成 = 2（与改动前相同）；§1 明确 rename 的兜底保留 | - |
| R6A-02 / R6O-03（分派 `else` 吞掉 `empty`/`self`/`ambiguous`） | Adversarial / Operation | Resolved | §4 S2 4 把三条明文拒绝写进 `else` 内部，兜底在其后；§6 新增「自己的地址与空地址」一行 | - |
| R6G-02（端到端验收不验「起没起 turn」） | Goal | Resolved | §2 症状 3 加「其后有 `assistant/message`」；§6 冷唤醒探针加 `--answers` 读；§7 新增对应停条件 | - |
| R6G-03 / R6A-04（换候选不重测基线 b） | Goal / Adversarial | Resolved | §6 冷唤醒探针：「换候选后回到 (2) 重新取该候选自己的 b」 | - |
| R6G-04（三条解析拒绝无验收） | Goal | Resolved | §6「自己的地址与空地址」一行 | - |
| R6G-05（准入实参不可验，白名单可整段失效） | Goal | Resolved | §3 Step 2 判据改成实参级 `'pure.coldAdmission({ allow: config.allow'`；BS-8 同步改述 | - |
| R6G-06（「五个字符串」实为六个） | Goal | Resolved | §4 S1 与 S5 都写成六个，CASE 用六元素 `Set` | - |
| R6G-07（not-found 两种来源共用一条误导文案） | Goal | Resolved | §4 S2 6.4 的 `not-found` 文案尾部带 `<detail>`；Appendix 1 记录两个来源 | - |
| R6G-08（「逐句保留」与活路径块不一致） | Goal | Resolved | §4 S2 5 改成「只到 `ctx.agents.get` 的 `undefined` 检查为止；子代理检查与归档复查已移到第 7 段，不得在此重复」 | - |
| R6G-09（Step 3 判据排版敏感） | Goal | Resolved | §3 Step 3 第三项改成 `'let woke = false'`；返回点由 schema required 与行为行覆盖 | - |
| R6O-02 / R6A-03（Step 6 前置的「或」重开交付出口；非 Core 行红无处置） | Operation / Adversarial | Resolved | §3 Step 6 前置只有「§6 全绿」；§3 Step 5 与 §7 都写了「非 Core 行红 → 停下问」 | - |
| R6O-04 / R6A-05（rename 描述「最后一个子句」不准） | Operation / Adversarial | Resolved | §4 S4 改成「把其中 `Renaming a session that is not loaded …` 这一句换成 …；其余两句不动」 | - |

## Revision Table（round 6 → v7）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R6G-01 / R6O-01 / R6A-01 | Step 0/Step 2 计数改 2；§1 明确保留 rename 兜底 | Yes（验收判据） |
| R6A-02 / R6O-03 | S2 4 骨架改写；§6 加一行 | Yes（机制结构 + 验收） |
| R6G-02 | 症状 3、冷探针、§7 都加 `assistant/message` | Yes（Core Task 措辞 + 验收） |
| R6G-03 / R6A-04 | 换候选重测 b | Yes（验收） |
| R6G-05 | Step 2 判据改实参级；BS-8 改述 | Yes（验收 + 盲点） |
| R6G-07 | not-found 文案带 `<detail>` | Yes（错误文案） |
| R6G-08 | S2 5 的作用域写清 | No（明确边界） |
| R6G-09 / R6G-06 | Step 3 判据换项；「六个」 | No（措辞/计数） |
| R6O-02 / R6A-03 | Step 5/6 判据与 §7 | Yes（交付判据） |
| R6O-04 / R6A-05 | rename 描述只换中间那句 | No（文档） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| `config.allow` 没有行为级验收（BS-8） | 行为级验证必须临时改 profile 的插件 config，No-go 9 禁止 | 若实现消费了 `admit` 却不按其值抛错（例如只 `console.warn`），Step 2 的实参级计数与 §6 全表仍绿 | 真机上观察到 `allow` 对冷路径或活路径不起作用 |
| 冷 + 归档会话的真机走向（BS-6） | 造一条「冷且归档」会话需要重启 Host | 行序判据只保证调用顺序，不保证被归档的冷会话走哪条拒绝 | 观察到一条归档会话出现在 `list_sessions` 里 |
| 冷子代理会话的真机探针（BS-5） | 本机没有可枚举的冷子代理 session id 来源 | `CASE wake-verdict-subagent` 只覆盖错误对象到 reason 的映射 | 拿到一个冷子代理 id，或用户报告该分支异常 |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- round 7 冻结时 HEAD = `28fc4f6`，`node --test` 基线 35（本轮实测），`index.js` 里 `controller.resolveAgent(` 1、`pure.coldAdmission(` 0、`await wakeAgent(` 0、`pure.decideDelivery(` 2、`cannot rename session` 4、`unexpected admission verdict` 0、`unexpected resolve verdict` 2、`ctx.agents.get(` 1、`woke` 2（均为 `woken` 子串）。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
