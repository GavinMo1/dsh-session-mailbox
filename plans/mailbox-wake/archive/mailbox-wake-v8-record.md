# mailbox-wake v8 — Review Record

被评审版本：`mailbox-wake-v8.md`（v8，round 8）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1–v7 的全文与记录在 `archive/`。

## 结论

**round 8 进行中。** high 数按轮次：r1 = 2、r2 = 1、r3 = 3、r4 = 0、r5 = 1、r6 = 2、r7 = 1（v7 新加的 `--answers` 判据不可证伪）。v8 把它换成「不带 flag 的增量读」（`b` / `a` 双增量），并补上 round 7 暴露的两处执行缺口：**验收期没有任何一步把新代码装进运行中的 Host**、以及**轮询预算 60 秒不足以覆盖一次冷启动 + 首轮模型调用**。

## 版本、级别与授权

- 当前版本 v8；已完成 round：7；进行中：round 8。
- 评审级别：**Deep**，route 数 3。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Goal route 换成新代理做全量扫描，Operation 与 Adversarial 复用并只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用（round 8/10）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛，只有这两种返回态；property: fact | 真机上抛异常或出现第三种返回态则被否（§7 有对应停条件）。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`；property: preference | 替代方案「扫 `sessionController.list()`」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。历史 52 次投递：48 短名 / 4 标题 / 0 完整 id |
| Decision 3 | 冷路径顺序：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝；准入返回值之外的取值兜底抛错 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`；property: fact（gate）/ preference（顺序） | 若 gate 放行 pre-step，前半被否。替代方案「先装载再判归档」被否：先付内存再必然失败（Step 2 的行序判据把它变成可检查的） |
| Decision 4 | 投递仍用 `followup` / `steer`；「唤醒」的验收要求对端真的产出新的 `assistant/message`，用**增量**读（历史回复不算） | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`；`dsh-agent/src/runtime-types.ts` 的 `followup` = 「Queue an ordinary follow-up turn and wake the driver」；`scripts/session-log.mjs` 不带 flag 时按记录顺序打印 `[USER …]` 与 `[ASSISTANT]`，带 `--answers` 只打后者（无位置锚点）；property: fact / to verify（P6） | 替代方案「用 `--answers` 的存在性判据」被否：r7 实测该视图不含探针消息，任何有历史的会话都先验为绿。替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：两条路径语义分裂，`steer` 无从表达 |
| Decision 5 | 输出契约新增 required `woke`；回执 `name` 取自 `rows()` 的别名表（兜底用 `slice(-8)`，与文件既有约定一致）；三处对外文案点名冷 id 来源并声明 orphan 边界；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；`index.js:175`/`:716` 的既有兜底都是 `slice(-8)`；property: preference | 替代方案「`name` 用完整 id 兜底」被否：与文件既有约定不一致。替代方案「不提 id 来源」被否：那会让新能力只对「用户手动粘 id」可达 |
| Decision 6 | 唤醒不加自建超时 / `Promise.race` / 重试；验收的等待由**外部轮询预算**承担（30 次 × 10 秒），用尽不判红而是停下问 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`；`resolveAgent` 无 signal 位置；实测一次冷启动 = 读转录 + preset mount + 首轮模型调用，量级数十秒；property: fact / preference | 替代方案「6 次 × 10 秒、用尽判红」被否：正确实现会被 60 秒窗口判死（r7 的 R7G-02） |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」；`rename_session` 用 §4 S2 3 的完整代码块替换它的取 agent 段 | 现树 `rename_session.execute` 自带 `try/catch`、早退、三处 `cannot rename session` 与 `unexpected resolve verdict` 兜底；替换后 `cannot rename session` 3 处、`unexpected resolve verdict` 仍 2 处；property: preference | 替代方案「只换调用表达式、旧四行不动」被否：`{ok, agent}` 没有 `error` 键，失败会塌成一句假陈述。替代方案「为凑计数删掉 rename 的兜底」被否：越界改动 |
| Decision 8 | 两条路径用 `if (found.ok === true) { 活 } else { 三条拒绝 → 兜底 → 冷 }` 分派；共用同一段尾部；活路径白名单闸留在原位 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`pure.js :: decideDelivery` 是唯一策略实现；property: preference | 替代方案「`else if (found.ok === true) … else throw`」被否：三条明文文案会落进 `else`（r6 实测）。替代方案「活路径也走 `coldAdmission`」被否：会动活路径既有的归档判定时机 |
| Decision 9 | 验收前必须把新代码装进运行中的 Host（`plugin_manager set_plugin` 切 `enabled`，或用户重启 DSH），并把这条写进 No-go 9 的豁免 | 本插件以 `link:` 接入，`AGENTS.md` 写明「`dsh-hmr` 不会跟踪 junction 指向的目录，所以改源码后必须走 `set_plugin` 或重启」；否则 §6 的活体验收跑的是 0.8.1；property: fact / preference | 替代方案「默认实现方自己会重载」被否：§6 全表本来没有任何一步要求它，且 No-go 9 的原文（不得改 profile 配置）会把这条唯一合法路径挡在门外 |

### Appendix 1 · 错误码到文案的映射

`resolve` 四出口：`ApiSessionNotFound` → `'session/not-found'`（**两个来源共用同一条 message**：无转录、有转录但 `header.cwd === undefined`）；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者，故按 reason 白名单判。`RemoteError` 带 `readonly code` / `readonly details`。property: fact。**v8 因此不再把 `detail` 拼进 not-found 文案**：两种来源的 message 逐字相同，带上它只重复调用方已给出的 id。

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

- asked：无（八轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose 显式 `if (ok) … else { 拒绝三连 → 兜底 → 冷 }`，rejected `else if (ok) … else throw`，because 后者会让三条明文文案落进 `else`。
- default, not asked；chose 唤醒的验收用「不带 flag 读 + `b`/`a` 双增量」，rejected `--answers` 存在性判据，because 后者在给定视图里不可定位且对有历史的会话先验为真。
- default, not asked；chose 30 次 × 10 秒的轮询预算且用尽停下问，rejected 6 次且用尽判红，because 一次冷启动加首轮模型调用就可能超过 60 秒。
- default, not asked；chose 验收前 `plugin_manager set_plugin` 重载（并进 No-go 9 豁免），rejected 默认实现方会自己重载，because §6 全表原本没有这一步、而 `dsh-hmr` 不跟踪 junction。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 fact；P6 to verify，destination 为 §6 冷唤醒探针。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛，无第三种返回态 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾折成 `{ error: RemoteError(...) }`。判据：若该类里出现第三处 `return` 形状，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 冷唤醒探针第 (4) 步的 `[ASSISTANT]` 计数由 a 变 a+1（增量口径）；result：未跑。`dsh-agent/src/runtime-types.ts` 的 `followup` 契约与 `dsh-agent-loop` 的 `wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r8-goal（**新代理**，未见过任何旧版本） | 未开始 | v8 全文（全量扫描） | — |
| Operation and Evolution | r1-ops（复用；看过 v1–v7） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v1–v7 内存 |
| Adversarial | r5-adv（复用；看过 v5–v7） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v5–v7 内存 |

## 本轮变更面（v7 → v8）

- 触及的决策点：Decision 4（唤醒的验收读法）、Decision 5（`name` 兜底与文案）、Decision 6（轮询预算）、新增 Decision 9（验收前重载）。
- 新增位置：
  1. §3 的 Step 4.5（`plugin_manager set_plugin` 重载，不可用则由用户重启 DSH）。
  2. §5 No-go 9 的第五项豁免（`set_plugin` 只切 `enabled`）。
  3. §6 冷唤醒探针的 `a` / `b` 双增量、5 条候选、"归档候选记下不再重选"、30 次轮询与"用尽停下问"。
  4. §7 的三条新停条件（候选耗尽、重载不可用、轮询用尽）。
  5. §6「自己的地址与空地址」的 `ambiguous` 第 (3) 步。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §6 冷唤醒探针的 `--answers` / `[ASSISTANT]` 存在性判据（r7 实测该视图不含探针消息，且历史回复会让它先验为真）。
  2. 删 `not-found` 文案尾部的 `(<detail>)`（两种来源 message 相同，不携带区分信息），并同步 Appendix 1 的措辞。
  3. 并 §6 表头的 `<stamp>` 约束补回「同一行内 (1)–(4) 用同一个值」。
  4. 删 §4 S2 6.5 的 `String(target.id)` 兜底，改为 `slice(-8)`（与文件既有约定一致）。
  5. 把 §4 S4 里对 README 工具表那一行的模糊指代换成逐字引文（`冷会话也能改——…`）。
- 为什么新增不是 0：Step 4.5 是本方案唯一能让活体验收跑在新代码上的动作，缺它 §6 全部跑在 0.8.1 上；其余新增都是把已有判据做成可执行形态。
- 是否用新规则回答新发现：否。Step 4.5 用的是 AGENTS.md 已写明的既有路径，不是新机制。
- 本轮新增机制数：0。

## Closure Table（round 7 的 11 个问题）

| Problem ID | Source route | Status | Evidence position（v8） | Next step |
|---|---|---|---|---|
| R7G-01 / R7O-01 / R7A-01（`--answers` 判据不可证伪：无位置锚点、有历史即先验为真、一次读不等 turn） | Goal / Operation / Adversarial | Resolved | §6 冷唤醒探针改成「不带 flag 读 + `b` / `a` 双增量」；§7 与 §8 BS-1 同步 | - |
| R7G-02（轮询预算 6×10s 会把正确实现判死） | Goal | Resolved | §6 冷唤醒探针改为 30 次；用尽「不判红，按 §7 停下问」；§7 新增对应停条件 | - |
| R7G-03（验收期没有把新代码装进 Host；No-go 9 挡掉唯一合法路径） | Goal | Resolved | §3 Step 4.5；§5 No-go 9 第五项豁免；§7 新增停条件 | - |
| R7G-04（候选可能是归档的、或一条都没有） | Goal | Resolved | §6 冷唤醒探针：5 条候选、归档候选记下不再重选；§7 新增「候选一条都取不到 → 停」 | - |
| R7G-05（README 工具表「冷会话也能改」无判据） | Goal | Resolved | §4 S4 给出逐字引文并要求整句替换；§3 Step 4 与 §6 第 9 行的模式加 `冷会话也能改`（改动前 4） | - |
| R7G-06（冷路径 `name` 兜底与文件既有约定不一致） | Goal | Resolved | §4 S2 6.5 改成 `slice(-8)` | - |
| R7O-02（`<stamp>` 的「同一行内保持不变」被删） | Operation | Resolved | §6 表头补回「同一行内的 (1)–(4) 必须用同一个值」 | - |
| R7A-02（`<detail>` 分辨不了两种 not-found 来源，Appendix 1 的理由与宿主不符） | Adversarial | Resolved | §4 S2 6.4 删掉 `(<detail>)`；Appendix 1 改成「两个来源共用同一条 message」 | - |
| R7A-03（`ambiguous` 没有验收） | Adversarial | Resolved | §6「自己的地址与空地址」新增第 (3) 步 | - |

## Revision Table（round 7 → v8）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R7G-01 / R7O-01 / R7A-01 | 冷探针改双增量、不带 flag | Yes（验收） |
| R7G-02 | 轮询预算 30 次；用尽停下问 | Yes（验收） |
| R7G-03 | 新增 Step 4.5 + No-go 9 豁免 + 停条件 | Yes（步骤 + 授权） |
| R7G-04 | 候选 5 条、归档不重选、无候选停 | Yes（验收） |
| R7G-05 / R7G-06 | README 引文与模式、`slice(-8)` 兜底 | No（文档 + 兜底细节） |
| R7O-02 | `<stamp>` 约束补回 | No（验收措辞） |
| R7A-02 | 删 `(<detail>)`；Appendix 1 改述 | Yes（错误文案） |
| R7A-03 | `ambiguous` 验收 | Yes（验收） |

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
- round 8 冻结时 HEAD = `28fc4f6`，`node --test` 基线 35（round 7 实测），`index.js` 里 `controller.resolveAgent(` 1、`pure.coldAdmission(` 0、`await wakeAgent(` 0、`pure.decideDelivery(` 2、`cannot rename session` 4、`unexpected admission verdict` 0、`unexpected resolve verdict` 2、`ctx.agents.get(` 1、`woke` 2（均为 `woken` 子串）。
- round 7 的 r7-goal 做过一次合并树模拟：把 §4 S2 的三段代码拼进真实 `index.js` 的副本（`%TEMP%`，未写仓库），`node --check` 通过，七项计数与两条行序判据可同时满足——这是「按方案写能落到可检查状态」的外部证据。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
