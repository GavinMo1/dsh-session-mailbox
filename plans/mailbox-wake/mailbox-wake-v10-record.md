# mailbox-wake v10 — Review Record

被评审版本：`mailbox-wake-v10.md`（v10，round 10）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1–v9 的全文在 `archive/`（v8 的**全文**缺，见 v9 记录的「流程偏差」；v8 的 record 在 `archive/mailbox-wake-v8-record.md`）。

## 结论

**部分交付（partial delivery）。** 十轮预算用尽，round 10 结束时仍有 2 个 high 未闭合，且它们不是措辞问题：**验收仪器**在 r10 被我自己改坏了（见下）。机制侧连续七轮无 high，实现正文（§4 S1–S4、§3 Step 0–4.5、§5 No-go）经独立复算可开工；挂起的是「冷唤醒探针」这一行端到端验收与依赖它的两条停条件（详见「交付形态」节）。

high 数按轮次：r1 = 2、r2 = 1、r3 = 3、r4 = 0、r5 = 1、r6 = 2、r7 = 1、r8 = 1、r9 = 2、r10 = 2。

r10 的两个 high 是同一个动作的两面：为修 r9 的「4b 无上界」，我给 `[ASSISTANT]` 计数加了「下一条 `[USER` 之前」的窗口；但渲染器把 `time-context` / `runtime-context` / `subagent-settled` 这类注入记录也印成 `[USER source=…]`，窗口在助手正文之前就关了。r7-goal 与 r10-adv 各自独立实测：历史 30 条 `session-mailbox` 入站消息上，窗口化判据成立 **13/30**，无上界 30/30；普通用户轮次 **0/6** vs 6/6。也就是说这条判据会把**正确实现**判成「Core Task 未达成」。同一行还留着「8 条候选里 ≥1 条给出 `woke: true` → 该行绿」，与同一行的「(4) 两条同时成立」正面冲突——这一句是 fail-open，会让症状 3 一行不红地不被验证。

## 交付形态：部分交付（ready / held 拆分）

**可开工的部分**（Gate 1 的三问都有答案，且不依赖任何未决项）：

| Gate 1 的问题 | 答案 | 位置 |
|---|---|---|
| 从哪开始、按什么顺序 | Step 0 → 1 → 2 → 3 → 4 → 4.5 | §3 的步骤表 |
| 每一步怎么判 | 每步都有 `node --check` / `Select-String` 计数 / 命令形态的完成判据 | §3 Step 0–4.5 |
| 什么不能碰、何时停 | No-go 1–11；§7 的九条停条件 | §5、§7 |

范围：§3 Step 0–4.5、§4 S1（两个纯函数）、§4 S2（装载体 / 分派 / 活路径 / 冷路径 / 统一尾部）、§4 S3（输出契约）、§4 S4（文档与版本）、§4 S5（5 个 CASE）、§5（No-go 1–11），以及 §6 里不依赖冷唤醒探针的那些行（测试、`node --check`、活投递探针、两个不存在的地址、自己的地址与空地址、create · rename · archive、三条文档 grep、版本、git）。

**挂起的部分**（依赖未决项，不得当作已验证）：

1. §6「冷唤醒探针」整行（r10 的 R10A-01 / R10A-02 / R10G-01）。
2. §2 失败症状 3 的措辞（它引用同一判据）。
3. §7 的第 3、4、5 条停条件与 §8 的 BS-1（都指向冷唤醒探针）。
4. §7 第一条对 `internal` 的误分类（R10A-04 / R10G-02）与它对「`detail` 为空时无冒号」的形态（R10O-02）。
5. §4 S2 7「统一尾部」仍是散文，而它承接了两个被搬出来的检查（R10A-05）。
6. §3 Step 0 里给白名单 profile 的替换指令与 §6 第 5 行互斥（R10A-06 / R10O-03 / R10G-04）。

**已定好的修复方案**（下一轮直接执行，不需要重新设计）：

- 判据改成「同一份不带 flag 视图里的基线增量」：第 (2) 步记 `a0 = (Select-String -Pattern '^\[ASSISTANT\]$').Count`，第 (4) 步要求 `≥ a0 + 1`，去掉 `$next`/`$upper` 的窗口（r10-adv 实测 30/30 成立）；`b' = b+1` 与 `^\[ASSISTANT\]$` 正则保留。若坚持窗口，只能上界到 `^\[USER source=(user|session-mailbox)\]` 这类 turn-opening 源。
- 删掉「≥1 条给出 `woke: true` → 该行绿」，改成「某条候选同时满足 `woke: true` + `b' = b+1` + 4b ≥ 1 才算绿；8 条用尽而没有任何一条三项同时成立 → 判红」。
- §7 第一条按 `resume failed for session` 分流（记 `internal`、不判 P1 被否），只有既非载体固定句、也非 `resume failed for session …` 的形态才判 P1 被否；前缀去掉 `": "` 的冒号依赖。
- 给 §4 S2 7 补代码块，并把 `'cannot verify the archived state of '` 与 `'addresses top-level sessions only'` 加进 Step 2 的计数表。
- Step 0 删掉白名单替换指令，改为「白名单 profile 下这两行改用 `not in the allow list` 作为证据，并在交付报告里声明 `allow` 已配置」。
- `wakeAgent` 的 `agent === undefined` 改成 `agent === undefined || agent === null`；rename 的 `detail === ''` 分支保留现树语义（`it could not be loaded in this process (<reason>)`）。
- Step 4.5 前置一次 `plugin_manager list_plugins`（确认可调用 + 当前 `enabled`），完成判据改成「第 3 步新文案 + `list_plugins` 里该条 `enabled` 为 true（贴原始行）」。

**恢复条件**：按上面七条改出一个新版本，跑一轮独立复评（重点只需盯 §6 冷唤醒探针那一行与 §7 的前两条），Gate 2 通过后即可从 partial 转为 pass。

## 版本、级别与授权

- 当前版本 v10；已完成 round：9；进行中：round 10。
- 评审级别：**Deep**，route 数 3。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Adversarial route 换成新代理做全量扫描并接手 r9-adv 的问题清单，Goal 与 Operation 复用并只查 Closure Table 引用的位置；未使用「预算用尽再加一轮」的例外（本轮即第 10 轮，预算用尽）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛，只有这两种返回态（并发 / 子代理 / 归档 / writer-held 四种状态逐条核过）；property: fact | 真机上抛异常或出现第三种返回态则被否（§7 前两条停条件 + 冷路径的 `cannot load session "<q>": …` 前缀包装）。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`；property: preference | 替代方案「扫 `sessionController.list()`」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。历史 52 次投递：48 短名 / 4 标题 / 0 完整 id |
| Decision 3 | 冷路径顺序：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝；准入返回值之外的取值兜底抛错 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`；`resumeObserved` 本身**不查归档**，故「冷且归档」全靠 `coldAdmission` 提前拒绝；property: fact（gate 与 resume 不查归档）/ preference（顺序） | 若 gate 放行 pre-step 或 `coldAdmission` 漏判，冷归档会被真的装载（BS-7）；替代方案「先装载再判归档」被否：先付内存再必然失败（Step 2 的行序判据把它变成可检查的） |
| Decision 4 | 「唤醒」的验收 = 入站增量（`--source` 口径）+ **窗口化位置锚点**（探针行之后、下一条 `[USER` 之前有 `^\[ASSISTANT\]$`），不成立即判红 | `scripts/session-log.mjs`：`--source` 只保留 `user/message`；不带 flag 时 `[USER …]` 与 `[ASSISTANT]` 按记录顺序打印。实测：731 份转录 1168 个 turn 里带正文的 assistant 条数为 0/1/≥2 的占比 31%/32%/37%（精确等值只在约三分之一 turn 上成立）；30 条历史 inbound 消息按「之后所有 `[ASSISTANT]`」口径 30/30 ≥1，按「下一条 `[USER` 之前」口径只有 7/30；property: fact | 替代方案「`--answers` 存在性判据」被否（r7：视图里没有探针消息）。替代方案「无 flag 视图数总增量」被否（r8：对端复述会把 `b` 推成 `b+2`）。替代方案「字面串 `[ASSISTANT]`、无上界」被否（r9：本仓 20 行含该字样里 13 行是工具参数）。替代方案「不成立时停下问」被否（r8：Core Task 症状 3 永不判红） |
| Decision 5 | 输出契约新增 required `woke`；`name` 取自 `rows()` 的别名表（兜底 `slice(-8)`）；`primitive`/`statusBefore` 只记录不作判据；三处对外文案点名冷 id 来源并声明 orphan 边界；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；`index.js:175`/`:716` 兜底都是 `slice(-8)`；`resumeObserved` 没有 status 断言；property: preference | 替代方案「把 `statusBefore`/`primitive` 写死成 `inactive`/`followup`」被否（r8：无源码支撑）。替代方案「`name` 用完整 id 兜底」被否：与文件既有约定不一致 |
| Decision 6 | 唤醒不加自建超时；等待由外部轮询承担（30 次 × 10 秒） | `resumes` 是 `Map<SessionId, Promise<Agent>>`；`resolveAgent` 无 signal 位置；一次冷启动含 preset mount 与首轮模型调用；property: fact / preference | 替代方案「6 次 × 10 秒且用尽判红」被否（r7：正确实现会被 60 秒窗口判死） |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」；`rename_session` 用 §4 S2 3 的完整代码块替换取 agent 段；`send_session_message` 在冷路径调用点外面包 `cannot load session "<q>": …` | 现树 `rename_session.execute` 自带 `try/catch`、早退、三处 `cannot rename session` 与 `unexpected resolve verdict` 兜底；替换后 `cannot rename session` 3 处、`unexpected resolve verdict` 仍 2 处；property: preference | 替代方案「只换调用表达式」被否（`{ok, agent}` 没有 `error` 键）。替代方案「不包装 send 侧抛出」被否（r8：把宿主裸 message 甩给调用方） |
| Decision 8 | 两条路径用 `if (found.ok === true) { 活 } else { 三条拒绝 → 兜底 → 冷 }` 分派；共用同一段尾部；活路径白名单闸留在原位 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`decideDelivery` 是唯一策略实现；property: preference | 替代方案「`else if (found.ok === true) … else throw`」被否（r6：三条明文文案会落进 `else`）。替代方案「活路径也走 `coldAdmission`」被否：会动活路径既有的归档判定时机 |
| Decision 9 | 验收前必须把新代码装进运行中的 Host，并用一次活体探针验证旧文案已消失；失败时先恢复 `enabled`，再请用户在 GUI 重新启用 | 本插件以 `link:` 接入，`AGENTS.md` 写明 `dsh-hmr` 不跟踪 junction；`enabled` 是落盘的 profile 字段；`index.js` 的旧文案被 Step 4 要求清零，故运行时出现它只可能是旧代码；property: fact | 替代方案「只信 `application: "applied"`」被否（配置层确认不证模块重新求值）。替代方案「失败就请用户重启」被否（disabled 条目重启也不加载） |
| Decision 10 | 冷探针的候选池按「最多 8 条、全部归档则停而不判红」处理，因为 `list_workspaces` 展开行**包含归档会话**，而 `list_sessions` 剔归档 | `README.md` 明写 `list_workspaces` 不剔归档、`list_sessions` 剔；本机 `default-workspace` 45 条 sessionIds 里 25 条在 `archivedSessionIds`；工具面没有「列出归档 id」的手段；property: fact | 替代方案「3 条候选、用尽判红」被否（r9：本机多半候选是归档，正确实现会被判死）。替代方案「先读 profile 的 `archivedSessionIds` 过滤」被否：那是 profile 文件路径，No-go 9 未授权读它作为验收步骤（只读也不该成为前提） |

### Appendix 1 · 错误码到文案的映射

`resolve` 四出口：`ApiSessionNotFound` → `'session/not-found'`（两个来源共用同一条 message：无转录、有转录但 `header.cwd === undefined`）；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者，故按 reason 白名单判。property: fact。

### Appendix 2 · 不做全量预热

每会话一份，插件侧不留 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 README 的 `<plugin-name>/v<version>` 且要求 `name` 用 `dsh-<name>`。property: fact。

### Appendix 4 · `woke` = 「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也拿到 `true`；同进程另一个 writer 已 publish 时 `resolve` 会先返回 `{agent}`（`raced` 分支），同样算「走了冷路径」。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`list_workspaces` 展开行只有 `session: <id>`、无标题、**含归档会话**；orphan 会话（工作区登记已删）在任何展开行里都不出现；`session/not-found` 的两种来源共用一条 message。property: fact / preference。

### Appendix 6 · 白名单三态只有一份实现

`decideDelivery` 是唯一策略实现；`coldAdmission` 先判「allow 既非 undefined 也非数组」→ `allow-unreadable`，再调它。活路径对非数组 `allow` 仍是既有行为，属范围外的既有缺陷。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（十轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose 显式分派骨架，rejected `else if (ok) … else throw`，because 后者会让三条明文文案落进 `else`。
- default, not asked；chose 「入站用 `--source`、起 turn 用窗口化标记行、不成立判红」，rejected 三种更松/更紧的口径，because 它们分别会假绿或假红。
- default, not asked；chose 8 条候选且全归档时停下问，rejected 3 条且判红，because 本机候选池多半是归档会话。
- default, not asked；chose 验收前 `set_plugin` + 活体探针，rejected 只信 `applied`。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 fact；P6 to verify，destination 为 §6 冷唤醒探针 4b。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛，无第三种返回态 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾折成 `{ error: RemoteError(...) }`。判据：若该类里出现第三处 `return` 形状，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝（但 resume 本身不查归档） | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假；若 `resumeObserved` 里出现归档检查，则 Decision 3 的前提要改 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 冷唤醒探针 4b 的窗口化计数 ≥ 1；result：未跑。`dsh-agent/src/runtime-types.ts` 的 `followup` 契约与 `dsh-agent-loop` 的 `wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r7-goal（复用；看过 v7–v9） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v7–v9 内存 |
| Operation and Evolution | r1-ops（复用；看过 v1–v9） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v1–v9 内存 |
| Adversarial | r10-adv（**新代理**，未见过任何旧版本） | 未开始 | v10 全文（全量扫描）+ 接手 r9-adv 的 8 条 | — |

## 本轮变更面（v9 → v10）

- 触及的决策点：Decision 4（窗口化锚点与正则）、Decision 10（候选池配额）。
- 新增位置：
  1. §4 S2 6 的**代码块**（冷路径从散文改成可逐字抄的代码，含六臂准入、五臂装载、`row/entry` 重建）。
  2. §6 冷唤醒探针的候选规则（8 条、全部归档则停）、4b 的 `^\[ASSISTANT\]$` 正则 + 「下一条 `[USER` 之前」上界 + `$hit` 空值保护。
  3. §3 Step 4.5 第 3 步的三态判定（生效 / 未生效 / 环境不对）。
  4. §7 的「`cannot load session` 尾巴不是载体固定句 → P1 被否」停条件。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §7 里残留的 `a+1` 判据（`a` 在 v9 已被删除）。
  2. 删 4b 的字面串 `[ASSISTANT]` 与无上界写法。
  3. 删「5 条候选一条都没给出 `woke: true` → 判红」（它会把「候选全是归档」误判成 Core 失败）。
  4. 删 BS-5 的「本机没有可枚举的冷子代理 id」这一错误前提（实测 478 份）。
- 为什么新增不是 0：窗口化锚点是 Decision 4 唯一既不被工具参数误命中、也不被后续 turn 冒充的形式；冷路径代码块消除「分支形状不可验」的空洞；候选配额消除一个必然假红的判据。
- 是否用新规则回答新发现：否。全部是把已有判据改成可执行形态。
- 本轮新增机制数：0。

## Closure Table（round 9 的 8 个问题）

| Problem ID | Source route | Status | Evidence position（v10） | Next step |
|---|---|---|---|---|
| R9A-01（候选池把归档会话算成冷候选，5 条用尽即判红） | Adversarial | Resolved | §6 冷唤醒探针「最多列 8 条」「全部是 `target session is archived` → 停（不判红）」；Decision 10；§7 | - |
| R9A-02（4b 字面串 `[ASSISTANT]`、无上界 → 工具参数与后续 turn 会假绿） | Adversarial | Resolved | §6 4b 改用 `-Pattern '^\[ASSISTANT\]$'` + `$next`/`$upper` 上界 | - |
| R9A-03（症状 3 与 4b 量的不是同一件事） | Adversarial | Resolved | §2 症状 3 改成「这条消息之后、下一条 `[USER` 记录之前没有任何带正文的 `assistant/message`（渲染为 `^[ASSISTANT]$` 标记行）」 | - |
| R9A-04（§7 残留 `a+1`） | Adversarial | Resolved | 该条已删；同一状态只由「b' = b+1 但 4b 为 0」表述 | - |
| R9A-05（BS-5 前提不成立：冷子代理 id 可枚举） | Adversarial | Resolved | §8 BS-5 改述：可枚举（738 份里 478 份子代理），本方案不设该验收行，理由写明 | - |
| R9A-06（4b 的 `$hit` 为空时退化成全文计数） | Adversarial | Resolved | §6 4b 的 `if ($null -eq $hit) { throw 'probe line not found in the full view' }` | - |
| R9A-07（Step 4.5 把「服务缺失 / 白名单」误诊成「旧代码在跑」） | Adversarial | Resolved | §3 Step 4.5 第 3 步三态判定 | - |
| R9A-08（§4 S2 6 是散文，冷路径分支不可验） | Adversarial | Resolved | §4 S2 6 改成代码块 | - |
| R9O-01 / R9G-06（§7「`resolveAgent` 抛异常 → 停」在包装后不可观测） | Operation / Goal | Resolved | §7 第一条改成挂在 `cannot load session "<q>": ` 的尾巴上 | - |
| R9O-02 / R9G-01（§7 残留 `a+1`） | Operation / Goal | Resolved | 同 R9A-04 | - |
| R9O-03（Step 4.5 完成判据与「再试一次」互咬） | Operation | Resolved | §3 Step 4.5 完成判据改成「第 3 步拿到新文案；最终 `enabled` 为 true（重试算同一步）」 | - |
| R9G-02 / R9A-06（`$hit` 空值） | Goal / Adversarial | Resolved | 同上 | - |
| R9G-03（`validateMessage` 三条 throw 无验收） | Goal | Partly resolved | §4 S2 1 已给出代码块；**仍未设验收行**（见开放项） | 若要覆盖，加一行「发空白消息 → `message must not be empty`」 |
| R9G-04（候选回执 `woke: false` 时无处置） | Goal | Resolved | §6 冷探针「回执抛错就换下一条候选」之外，新增「若回执 `woke: false` 同样换候选（该 id 已不是冷会话）」 | - |
| R9G-05（Step 4.5 关→开之间被打断会把插件留在 disabled） | Goal | Resolved | §3 Step 4.5 第 1 步后加「两步必须在同一 turn 内连续执行；任何中断后先恢复 `enabled: true`」 | - |
| R9G-07（期望默认 `config.allow` 未设置） | Goal | Resolved | §3 Step 0 基线加「记下 `config.allow` 当前值；已配白名单时，Step 4.5 第 3 步与 §6 第 5 行改用白名单内的 id」 | - |

## Revision Table（round 9 → v10）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R9A-01 | 候选 8 条 + 全归档则停 | Yes（验收） |
| R9A-02 / R9A-06 / R9G-02 | 4b 正则 + 上界 + 空值保护 | Yes（验收） |
| R9A-03 | §2 症状 3 与 4b 口径统一 | Yes（Core Task 措辞） |
| R9A-04 / R9O-02 / R9G-01 | 删 §7 的 `a+1` | No（删残留） |
| R9A-05 | BS-5 改述 | No（盲点措辞） |
| R9A-07 | Step 4.5 三态判定 | Yes（步骤判据） |
| R9A-08 | §4 S2 6 改代码块 | Yes（代码） |
| R9O-01 / R9G-06 | §7 第一条改挂文本 | Yes（停条件） |
| R9O-03 / R9G-05 | Step 4.5 完成判据与同 turn 要求 | Yes（步骤判据） |
| R9G-04 | `woke: false` 也换候选 | Yes（验收） |
| R9G-07 | Step 0 记 `config.allow` | Yes（基线） |
| R9G-03 | 只给代码块、不设验收行 | — |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| `config.allow` 没有行为级验收（BS-8） | 行为级验证必须临时改 profile 的插件 config，No-go 9 禁止 | 若实现消费了 `admit` 却不按其值抛错（例如只 `console.warn`），Step 2 的实参级计数与 §6 全表仍绿 | 真机上观察到 `allow` 对冷路径或活路径不起作用 |
| `validateMessage` 三条 throw 没有验收行（R9G-03） | 代码已在 §4 S2 1 逐字给出，三条文案也是现树原文；再加一行验收要新建一个会话或向对端发空白消息，收益低于噪声 | 若实现漏抄 `message must not be empty` 这一条，§6 全表与 8 项计数仍绿 | 用户要求把输入校验也纳入验收 |
| 冷 + 归档会话的真机走向（BS-6） | 造一条「冷且归档」需要重启 Host；但 `resumeObserved` 不查归档，所以「提前拒绝」完全依赖 `coldAdmission` | 若 `coldAdmission` 读不到归档表，它返回 `archived-unreadable` 并拒绝（fail-closed） | 观察到一条归档会话出现在 `list_sessions` 里 |
| 冷子代理会话没有验收行（BS-5） | 拒绝路径不影响 Core Task；id 可枚举但没有必要 | 若 `wakeFailureVerdict` 的 reason 白名单写错，只有 `CASE wake-verdict-subagent` 会红 | 用户要求覆盖该分支 |
| v8 全文未进 `archive/` | v9 记录已披露（原地改写） | 用 v7 全文 + v9 记录的两张表重建 | 用户要求逐版审计 |

## round 10 结果与停止时的开放项

三条 route 都完成：r7-goal（复用，1 high / 1 medium / 3 low）、r1-ops（复用，0 high / 0 medium / 3 low）、r10-adv（新代理，2 high / 4 medium / 3 low）。r7-goal 与 r10-adv 独立复现了同一处 high（窗口上界与真实转录形态冲突），r10-adv 另外指出同一行的 fail-open 句。r1-ops 这条 route 十轮归结为 0 high / 0 medium。

停止时的开放项（均为 disclosed：Gate 2 的两个问题都不是「会让实现方做相反动作且验收全绿」的静默通道，除第 1、2 条之外也不影响 Core Task 的机制）：

| 项 | 来源 | 为什么现在不改 | 一个可证伪测试 | 恢复条件 |
|---|---|---|---|---|
| 冷唤醒探针的窗口上界会把正确实现判红 | R10A-01 / R10G-01（high） | 修法需要改判据形态（换成基线增量），属 Substantive Change，预算已用尽（第 10 轮） | 取任一含 `session-mailbox` 入站的转录，按 §6 4b 逐字跑：本机 30 条里只有 13 条窗口内计数 ≥1，而 30 条全部在无上界口径下 ≥1 | 按上面「已定好的修复方案」第 1 条改判据并复评 |
| 「≥1 条 `woke: true` → 该行绿」与 (4) 冲突（fail-open） | R10A-02（high） | 同上；且必须与第 1 条同时改，否则修掉它会让正确实现必然判红 | 把回执与 4b 的两个数写成笛卡尔表，「woke=true、count=0」这一格在 §6 同一格里同时命中「绿」与「判红」两条规则 | 同上第 2 条 |
| §7 第一条把 `internal` 误判成「P1 被否」 | R10A-04 / R10G-02（medium） | 需要扩白名单（加 `resume failed for session`），属措辞级但会改变归因 | 喂一条 `gateway/internal`：宿主 message 是 `resume failed for session …`，而 §7 只要「尾巴不是载体两句」就判 P1 被否 | 同上第 3 条 |
| 统一尾部仍是散文，两个被搬进去的检查无判据约束 | R10A-05（medium） | 需要补一段代码块 + 两个计数 | 把 `!Array.isArray(archivedNow)` 分支删掉，Step 2 的八项计数仍全绿 | 同上第 4 条 |
| Step 0 的白名单替换指令与 §6 第 5 行互斥 | R10A-06 / R10O-03 / R10G-04（medium/low） | 本机 `config.allow` 未配置，该分支休眠；改法简单但属验收口径变更 | 把 `config.allow` 设成数组后，按 Step 0 的指令改写第 5 行 → 期望的 `no live session matches` 不可能出现 | 同上第 5 条 |
| 4b 的 `$hit` 空值用 `throw` 落在轮询循环里 | R10O-01（low） | 会让「消息还没落盘」这一本来就该等的情形变成配方报错 | 投递后立刻跑 4b（消息尚未 durable）：按字面会抛 `probe line not found` | 同第 1 条一并改成「本轮不算成立、继续等」 |
| `wakeAgent` 让 `agent: null` 穿过 | R10A-07（low） | 宿主不会返回 `null`（P1 已核），属防御性缺口 | `wakeAgent({agent:null})` 的等价输入 → `ok: true` → 尾部 `target.session` 抛裸 TypeError | 同第 6 条 |
| rename 的 `detail === ''` 会把 reason 当文案 | R10A-08（low） | 现树该分支给的是 `it could not be loaded in this process` | 喂 `{code:'gateway/internal', message:''}` → 回执是 `cannot rename session <id>: internal` | 同第 6 条 |
| Step 4.5 缺 `list_plugins` 前置与读回 | R10A-09（low） | 判据只要求「最终 `enabled` 为 true」，没有点名读取命令 | 审批被禁的会话里先调 `list_plugins` → 被拒，则第 1 步必然也被拒，此时只有「停」这一条路径 | 同第 7 条 |
| `validateMessage` 三条 throw 没有验收行 | R9G-03（low，已披露） | 代码已在 §4 S2 1 逐字给出；加一行验收的收益低于噪声 | 漏抄 `message must not be empty` → §6 全表与八项计数仍绿 | 用户要求时补 |
| `config.allow` 无行为级验收 | BS-8 | 行为级验证必须改 profile 配置，No-go 9 禁止 | 消费了 `admit` 却只 `console.warn` → Step 2 计数与 §6 全绿 | 用户允许改配置时 |
| 冷 + 归档会话的真机走向 | BS-6 | `resumeObserved` 不查归档，「提前拒绝」完全依赖 `coldAdmission`；构造需要冷会话 | `coldAdmission` 读不到归档表时返回 `archived-unreadable` 并拒绝 | 观察到归档会话出现在 `list_sessions` 里 |
| 冷子代理会话没有验收行 | BS-5 | id 可枚举（740 份转录里 480 份是子代理），但拒绝路径不影响 Core Task | `wakeFailureVerdict` 的 reason 白名单写错 → 只有 `CASE wake-verdict-subagent` 会红 | 用户要求覆盖 |
| v8 全文未进 `archive/` | 流程偏差 | v9 记录已披露 | 用 v7 全文 + v9 记录的两张表重建 | 用户要求逐版审计 |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- round 10 冻结时 HEAD 在评审期间从 `28fc4f6` → `b991e51` → `ffb3628` → `046260e`（后两个都不触及 `send_session_message`）。基线在 `ffb3628` 上实测：`node --test` 35；八项计数 = 1 / 0 / 0 / 2 / 4 / 0 / 2 / 1。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
