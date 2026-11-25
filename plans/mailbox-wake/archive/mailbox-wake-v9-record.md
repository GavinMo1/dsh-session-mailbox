# mailbox-wake v9 — Review Record

被评审版本：`mailbox-wake-v9.md`（v9，round 9）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。

## 结论

**round 9 进行中。** high 数按轮次：r1 = 2、r2 = 1、r3 = 3、r4 = 0、r5 = 1、r6 = 2、r7 = 1、r8 = 1。r8 的 high 是**我自己在 v8 引入的**：唯一条端到端验收（冷唤醒探针）把「消息到了但没起 turn」判成「停下问」而不是判红，且用精确等值 `a+1`（实测一个 turn 里带正文的 `assistant/message` 条数为 0 / 1 / ≥2 的占比约 31% / 32% / 37%）。v9 改成「入站增量 + 位置锚点」：`b'` 用 `--source session-mailbox` 数（对端复述进不来），「起没起 turn」用「探针消息那一行之后是否还有 `[ASSISTANT]`」判定，且不成立即判红。

## 版本、级别与授权

- 当前版本 v9；已完成 round：8；进行中：round 9。
- 评审级别：**Deep**，route 数 3。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Adversarial route 换成新代理做全量扫描，Goal 与 Operation 复用并只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用（round 9/10）。

### 流程偏差（披露）

v8 的冻结文本在 round 9 准备期被**原地改写**成 v9，因此 `archive/` 里没有 v8 全文（v1–v7 都在）。v8 → v9 的每一处改动都逐条记在下面的 Revision Table 里，diff 可从 v7（`archive/mailbox-wake-v7.md`）+ 那 9 条 + 本轮 11 条重建。这是本轮的一处流程缺陷，不改写它、如实记在这里。

### 环境变更（评审期间发生）

- HEAD 从 `28fc4f6` 前进到 `b991e51`（`.gitignore` 新增 `.tmp-*`）再到 `ffb3628`（`list_sessions` 的子代理分支从「返回空数组」改成抛错）。后者改变的是 `list_sessions` 在子代理里的行为，与 `send_session_message` 的投递路径无关；本方案的 No-go 1（`list_sessions` 语义不动）与 §6 的行数比较仍成立，基线计数也未变（Step 2 的八项在 `ffb3628` 上重测一致）。
- `plugins/user-model` 在工作树里有别人的在途改动（`M`），因此 v9 的 No-go 新增第 11 条：不得碰它、不得写进本次提交。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛，只有这两种返回态；property: fact | 真机上抛异常或出现第三种返回态则被否（§7 有对应停条件，冷路径也有前缀包装）。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`；property: preference | 替代方案「扫 `sessionController.list()`」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。历史 52 次投递：48 短名 / 4 标题 / 0 完整 id |
| Decision 3 | 冷路径顺序：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝；准入返回值之外的取值兜底抛错 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`；property: fact（gate）/ preference（顺序） | 若 gate 放行 pre-step，前半被否。替代方案「先装载再判归档」被否：先付内存再必然失败（Step 2 的行序判据把它变成可检查的） |
| Decision 4 | 「唤醒」的验收 = 入站增量（`--source` 口径）+ **位置锚点**（探针行之后是否还有 `[ASSISTANT]`），且不成立即判红 | `scripts/session-log.mjs`：`--source <kind>` 只保留 `user/message`（对端回复进不来）；不带 flag 时 `[USER …]` 与 `[ASSISTANT]` 按记录顺序打印，故可按 `LineNumber` 判先后；实测 731 份转录 1168 个 turn 里「带正文的 assistant/message」条数为 0 / 1 / ≥2 的占比 31% / 32% / 37%（精确等值 `+1` 只在约三分之一的 turn 上成立）；property: fact | 替代方案「`--answers` 存在性判据」被否：r7 实测该视图不含探针消息。替代方案「无 flag 视图里数 `[ASSISTANT]` 总增量」被否：对端复述探针文本会把 `b` 推成 `b+2`，且一轮可能落多条。替代方案「不成立时停下问」被否：那正是 r8 的 high——Core Task 症状 3 永不判红 |
| Decision 5 | 输出契约新增 required `woke`；`name` 取自 `rows()` 的别名表（兜底 `slice(-8)`）；`primitive` / `statusBefore` 只记录不作判据；三处对外文案点名冷 id 来源并声明 orphan 边界；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；`index.js:175`/`:716` 的兜底都是 `slice(-8)`；`agent.ts :: resumeObserved` 没有 status 断言，故不能把 `idle` 写成硬期望；property: preference | 替代方案「把 `statusBefore`/`primitive` 写死成 `inactive`/`followup`」被否：没有源码支撑（r8 的 R8G-03）。替代方案「`name` 用完整 id 兜底」被否：与文件既有约定不一致 |
| Decision 6 | 唤醒不加自建超时 / `Promise.race` / 重试；等待由外部轮询承担（30 次 × 10 秒） | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`；`resolveAgent` 无 signal 位置；一次冷启动含 preset mount 与首轮模型调用；property: fact / preference | 替代方案「6 次 × 10 秒且用尽判红」被否：正确实现会被 60 秒窗口判死（r7 的 R7G-02） |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」；`rename_session` 用 §4 S2 3 的完整代码块替换取 agent 段；`send_session_message` 的冷路径在调用点外面包一层 `cannot load session "<q>": …` | 现树 `rename_session.execute` 自带 `try/catch`、早退、三处 `cannot rename session` 与 `unexpected resolve verdict` 兜底；替换后 `cannot rename session` 3 处、`unexpected resolve verdict` 仍 2 处；property: preference | 替代方案「只换调用表达式、旧四行不动」被否：`{ok, agent}` 没有 `error` 键，失败会塌成一句假陈述。替代方案「不包装 send 侧的抛出」被否：会把宿主裸 message 直接甩给调用方（r8 的 R8G-06） |
| Decision 8 | 两条路径用 `if (found.ok === true) { 活 } else { 三条拒绝 → 兜底 → 冷 }` 分派；共用同一段尾部；活路径白名单闸留在原位 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`pure.js :: decideDelivery` 是唯一策略实现；property: preference | 替代方案「`else if (found.ok === true) … else throw`」被否：三条明文文案会落进 `else`（r6 实测）。替代方案「活路径也走 `coldAdmission`」被否：会动活路径既有的归档判定时机 |
| Decision 9 | 验收前必须把新代码装进运行中的 Host，并**用一次活体探针验证旧文案已消失**；失败时先恢复 `enabled`，再请用户在 GUI 重新启用（只重启不够） | 本插件以 `link:` 接入，`AGENTS.md` 写明 `dsh-hmr` 不跟踪 junction；`enabled` 是落盘的 profile 字段（`~/.dsh/profiles/desktop/cordis.patch.yml` 里有 `enabled:` 行），`set_plugin` 第二次失败会让条目停在 disabled；`index.js:185` 的旧文案被 Step 4 要求清零，因此运行时一旦出现它只可能是旧代码；property: fact | 替代方案「只信 `application: "applied"`」被否：那是配置层确认，不证模块被重新求值。替代方案「失败就请用户重启」被否：disabled 的条目重启也不会加载 |

### Appendix 1 · 错误码到文案的映射

`resolve` 四出口：`ApiSessionNotFound` → `'session/not-found'`（**两个来源共用同一条 message**：无转录、有转录但 `header.cwd === undefined`）；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者，故按 reason 白名单判。`RemoteError` 带 `readonly code` / `readonly details`。property: fact。

### Appendix 2 · 不做全量预热

每会话一份，插件侧不留 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 README 的 `<plugin-name>/v<version>` 且要求 `name` 用 `dsh-<name>`。property: fact。

### Appendix 4 · `woke` = 「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也拿到 `true`。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`list_workspaces` 展开行只有 `session: <id>`、无标题，且 `WorkspaceEntity.sessionIds` 会过滤 cwd 与工作区不一致的会话；orphan 会话在任何展开行里都不出现。`session/not-found` 的两种来源共用一条 message，故文案不承诺能分辨它们。property: fact / preference。

### Appendix 6 · 白名单三态只有一份实现

`pure.js :: decideDelivery` 是唯一策略实现；`coldAdmission` 先判「allow 既非 undefined 也非数组」→ `allow-unreadable`，再调它。活路径对非数组 `allow` 仍是既有行为，属范围外的既有缺陷。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（九轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose 显式 `if (ok) … else { 拒绝三连 → 兜底 → 冷 }`，rejected `else if (ok) … else throw`，because 后者会让三条明文文案落进 `else`。
- default, not asked；chose 「入站用 `--source`、起 turn 用位置锚点、不成立即判红」，rejected 「无 flag 视图里数 `[ASSISTANT]` 总增量」与「不成立就停下问」，because 前者会被复述污染、后者让 Core Task 症状 3 永不判红。
- default, not asked；chose 30 次 × 10 秒轮询，rejected 6 次，because 一次冷启动加首轮模型调用就可能超过 60 秒。
- default, not asked；chose 验收前 `set_plugin` + 活体探针验证，rejected 只信 `applied`，because 配置层确认不证模块被重新求值。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 fact；P6 to verify，destination 为 §6 冷唤醒探针 4b。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛，无第三种返回态 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾折成 `{ error: RemoteError(...) }`。判据：若该类里出现第三处 `return` 形状，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 冷唤醒探针 4b（探针消息之后出现 `[ASSISTANT]`）；result：未跑。`dsh-agent/src/runtime-types.ts` 的 `followup` 契约与 `dsh-agent-loop` 的 `wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r7-goal（复用；看过 v7） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v7 内存 |
| Operation and Evolution | r1-ops（复用；看过 v1–v8） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v1–v8 内存 |
| Adversarial | r9-adv（**新代理**，未见过任何旧版本） | 未开始 | v9 全文（全量扫描） | — |

## 本轮变更面（v8 → v9）

- 触及的决策点：Decision 4（验收仪器）、Decision 5（`statusBefore`/`primitive` 降级为记录）、Decision 7（send 侧抛出包装）、Decision 9（重载的验证与恢复）。
- 新增位置：
  1. §3 Step 4.5 的第 3 步（活体探针验证旧文案已消失）与失败恢复（先恢复 `enabled`、再请用户在 GUI 重新启用）。
  2. §3 Step 2 的第八项计数（`'config.maxBytes ?? 65536'` = 1）。
  3. §4 S2 1 的代码块（`maxBytes` + `validateMessage` 三条 throw 逐字写入）。
  4. §4 S2 6.4 的 `try/catch` 包装（`cannot load session "<q>": …`）。
  5. §6 冷唤醒探针的 4a / 4b 两读、位置锚点判据、「旧文案 → 回 Step 4.5」。
  6. §6「自己的地址与空地址」的第 (3)(4) 步（造两个同名会话 + 归档收尾）。
  7. §5 No-go 11（不得碰 `plugins/user-model`）。
  8. §7 的三条新停条件（旧文案、`b'=b+1` 但无 `[ASSISTANT]`、重载未生效）。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §6 冷唤醒探针的 `a`（`[ASSISTANT]` 总计数增量）与「用尽不判红」两条，改为位置锚点 + 判红。
  2. 删 `statusBefore: "inactive"` / `primitive: "followup"` 两条硬期望（改为只记录）。
  3. 删 §5 No-go 7 的「解析拒绝三连…都不得动」中隐含的「位置也不得动」，改成「判定与文案不得动（位置按 §4 S2 4 搬进分派）」。
- 为什么新增不是 0：位置锚点是 Decision 4 唯一能做到「证伪得了、也不会误杀」的形式；Step 4.5 的活体验证是 Decision 9 唯一能区分「装上了」与「没装上」的手段；`maxBytes` 代码块与抛出包装是补两处会被静默丢掉的现树行为。其余新增都是把已有判据写成可执行形态。
- 是否用新规则回答新发现：否。本轮没有新增数据源、状态或依赖。
- 本轮新增机制数：0。

## Closure Table（round 8 的 10 个问题）

| Problem ID | Source route | Status | Evidence position（v9） | Next step |
|---|---|---|---|---|
| R8G-01（`[ASSISTANT]` 判据既不可证伪也不按真实形态成立；「没起 turn」被判成停下问） | Goal | Resolved | §6 冷唤醒探针 4b 的位置锚点判据 + 「b'=b+1 但 4b 为 0 → 该行判红并停」；§2 症状 3 与 §7 同步；Decision 4 | - |
| R8G-02（Step 4.5 的 `applied` 不证新代码在跑；旧文案出现时被当成 Core Task 红） | Goal | Resolved | §3 Step 4.5 第 3 步（活体探针 + 旧文案判定）；§6 冷探针「旧文案 → 回 Step 4.5」；§7 第一条 | - |
| R8G-03（`statusBefore` / `primitive` 是被证伪不了的硬期望） | Goal | Resolved | §6 冷唤醒探针期望列改为「只记录、不作判据」；Decision 5 | - |
| R8G-04（§4 S2 1 缺 `maxBytes` / `validateMessage` 代码） | Goal | Resolved | §4 S2 1 的代码块；§3 Step 2 第八项计数 | - |
| R8G-05（No-go 7 的「不得动」与 §4 S2 4 的位置搬移字面冲突） | Goal | Resolved | §5 No-go 7 改成「判定与文案不得动（位置按 §4 S2 4 搬进分派）」 | - |
| R8G-06（`resolveAgent` 抛出时把宿主裸 message 甩给调用方） | Goal | Resolved | §4 S2 6.4 的 `try/catch` 包装 | - |
| R8O-01（`set_plugin` 第二次失败会让条目停在 disabled，只重启救不回来） | Operation | Resolved | §3 Step 4.5 第 2 步（再试一次）+ 失败恢复（写明 `enabled` 状态、请用户在 GUI 重新启用）；§7 | - |
| R8O-02 / R8A-03（同名会话没有处置） | Operation / Adversarial | Resolved | §6「自己的地址与空地址」第 (3)(4) 步（两个 `create_session` + 两次 `rename_session` + `archive_sessions` 收尾） | - |
| R8O-03 / R8A-01（`b` 在不带 flag 的视图里会被对端复述污染） | Operation / Adversarial | Resolved | §6 冷唤醒探针第 (2)/4a 改用 `--source session-mailbox` 计数 | - |
| R8A-02（`applied` 不证 `lib/pure.js` 被重新求值） | Adversarial | Resolved | 同 R8G-02（活体探针）；另 §7 第一条覆盖「`is not a function` 之类的未装载形态」 | - |

## Revision Table（round 8 → v9）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R8G-01 | 冷探针改 4a/4b + 位置锚点 + 判红 | Yes（验收 + Core Task 判据） |
| R8G-02 / R8A-02 | Step 4.5 加活体探针与恢复；§7 加停条件 | Yes（步骤 + 停条件） |
| R8G-03 | `statusBefore`/`primitive` 降级为记录 | Yes（验收期望） |
| R8G-04 | S2 1 代码块；Step 2 第八项计数 | Yes（代码 + 验收） |
| R8G-05 | No-go 7 措辞 | No（措辞） |
| R8G-06 | S2 6.4 的 try/catch 包装 | Yes（错误文案） |
| R8O-01 | Step 4.5 第 2 步与恢复口径 | Yes（步骤） |
| R8O-02 / R8A-03 | 同名会话的配方与归档收尾 | Yes（验收） |
| R8O-03 / R8A-01 | `b` 的计数口径改回 `--source` | Yes（验收） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| `config.allow` 没有行为级验收（BS-8） | 行为级验证必须临时改 profile 的插件 config，No-go 9 禁止 | 若实现消费了 `admit` 却不按其值抛错（例如只 `console.warn`），Step 2 的实参级计数与 §6 全表仍绿 | 真机上观察到 `allow` 对冷路径或活路径不起作用 |
| 冷 + 归档会话的真机走向（BS-6） | 造一条「冷且归档」会话需要重启 Host | 行序判据只保证调用顺序，不保证被归档的冷会话走哪条拒绝 | 观察到一条归档会话出现在 `list_sessions` 里 |
| 冷子代理会话的真机探针（BS-5） | 本机没有可枚举的冷子代理 session id 来源 | `CASE wake-verdict-subagent` 只覆盖错误对象到 reason 的映射 | 拿到一个冷子代理 id，或用户报告该分支异常 |
| v8 全文未进 `archive/` | 它在 round 9 准备期被原地改写成 v9（见「流程偏差」） | 若需要复核 v8，用 v7 全文 + 本记录的两张表重建 | 用户要求逐版审计时 |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- round 9 冻结时 HEAD = `ffb3628`；`node --test` 基线 35；`index.js` 里 `controller.resolveAgent(` 1、`pure.coldAdmission(` 0、`await wakeAgent(` 0、`pure.decideDelivery(` 2、`cannot rename session` 4、`unexpected admission verdict` 0、`unexpected resolve verdict` 2、`ctx.agents.get(` 1、`config.maxBytes ?? 65536` 1。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
