# mailbox-wake v5 — Review Record

被评审版本：`mailbox-wake-v5.md`（v5，round 5）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1–v4 的全文与记录在 `archive/`。每版都是 Substantive Change，各自重跑 route。

## 结论

**round 5 进行中。** 累计：r1 → 2 high / 17 med / 10 low；r2 → 1 high / 12 med / 11 low；r3 → 3 high / 9 med / 10 low；r4 → **0 high** / 7 med / 9 low。v4 已无 high，且 Core Task 的机制链（准入 → 装载 → 唯一返回点 → 转录证据）在 r4 三条 route 下都闭合；v5 只收窄验收口径与 rename 侧适配。

## 版本、级别与授权

- 当前版本 v5；已完成 round：4；进行中：round 5。
- 评审级别：**Deep**，route 数 3，五轮不变（公开工具契约 + 改全部后续步骤的决策点）。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Adversarial route 换成新代理做全量扫描，Goal 与 Operation 复用并只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用（round 5/10）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛；property: fact | 真机上抛异常则本决策被否。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`；property: preference | 替代方案「扫 `sessionController.list()`」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。实测历史 52 次投递：48 短名 / 4 标题 / 0 完整 id —— 故 v5 在三处对外文案里点名冷 id 的来源（`list_workspaces` 展开行） |
| Decision 3 | 冷路径顺序：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝；其余取值兜底抛错 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`（「ends as `blocked` without a request」）；property: fact（gate）/ preference（顺序） | 若 gate 放行 pre-step，前半被否。替代方案「先装载再判归档」被否：先付内存再必然失败 |
| Decision 4 | 投递仍用 `followup` / `steer`，冷路径不特判 `statusBefore` / `primitive` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`；maintenance 期间 `status === 'idle'`；property: fact / to verify（P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：两条路径语义分裂，`steer` 无从表达 |
| Decision 5 | 输出契约新增 required `woke`；回执 `name` 取自 `rows()` 的别名表；三处对外文案点名冷 id 来源；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；`index.js :: list_workspaces` 的展开行是冷 id 的唯一可读来源；property: preference | 替代方案「`name` 用 `id.slice(-8)`」被否：与别名表两套规则。替代方案「不提 id 来源」被否：`list_sessions` 不列冷会话，用户原话的场景在自然语言驱动下不可达 |
| Decision 6 | 唤醒不加自建超时 / `Promise.race` / 重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`；`resolveAgent` 无 signal 位置；property: fact | 长时间不返回按 BS-4 回来 |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」；`rename_session` 按 §4 S2 3 的显式替换规则消费 `{ok, agent}`，并用自己的 `cannot rename session <id>: <detail>` 文案 | 现树 `rename_session.execute` 自带 `try/catch`、`sessionController` 缺失早退与三处 `cannot rename session`；替换后为 3 处；property: preference | 替代方案「装载体连文案一起统一」被否：会把改名失败讲成装载/投递失败。替代方案「rename 不换调用」被否：用户对端要求不要两套唤醒逻辑。替代方案「只换调用、旧四行不动」被否：`{ok, agent}` 没有 `error` 键，所有失败会塌成一句假陈述 |
| Decision 8 | 两条路径共用同一段尾部代码；活路径白名单闸留在原位；冷路径准入由 `coldAdmission`（内部复用 `decideDelivery`）承担 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`pure.js :: decideDelivery` 是唯一策略实现；property: preference | 替代方案「活路径也走 `coldAdmission`」被否：会把活路径归档判定提前到 `ctx.agents.get` 之前，动了一个与目标无关的既有行为。替代方案「两份白名单」被否：策略分叉（r3 的 R3A-01 就是漏了一份） |

### Appendix 1 · 错误码到文案的映射

`resolve` 四出口：`ApiSessionNotFound` → `'session/not-found'`；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者，故按 reason 白名单判。`RemoteError` 带 `readonly code` / `readonly details`，按字段判。property: fact。

### Appendix 2 · 不做全量预热

每会话一份，插件侧不留 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 README 的 `<plugin-name>/v<version>` 且要求 `name` 用 `dsh-<name>`，故前缀是包名。property: fact。

### Appendix 4 · `woke` = 「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也拿到 `true`。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`session/not-found` 至少三个来源（无转录、无 `cwd`、标称不是 id 的串），故文案只说「匹配不上且装载不了」并给出唯一可行下一步（用完整 id）。`list_workspaces` 展开行只有 `session: <id>`、无标题，且 `WorkspaceEntity.sessionIds` 会过滤 cwd 与工作区不一致的会话 —— 这些事实写进文案时只陈述「能打印 id」，不承诺能对上标题。property: fact / preference。

### Appendix 6 · 白名单三态只有一份实现

`pure.js :: decideDelivery` 是唯一策略实现；`coldAdmission` 先判「allow 既非 undefined 也非数组」→ `allow-unreadable`，再调它。活路径对非数组 `allow` 仍是既有行为（`includes` 的隐式转换），属本轮范围外的既有缺陷。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（五轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose 装载体只统一取 agent，rejected 连文案一起统一，because 后者会让改名失败报成投递失败。
- default, not asked；chose 活路径白名单闸留在原位，rejected 两条路径都走 `coldAdmission`，because 那会顺带改活路径的归档判定时机。
- default, not asked；chose 三处对外文案点名 `list_workspaces` 作为冷 id 来源，rejected 保持沉默，because 沉默会让新能力只对「用户手动粘 id」可达。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 fact；P6 to verify，destination 为 §6 冷唤醒探针。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾折成 `{ error: RemoteError(...) }`。判据：若没有 `return { error:` 分支，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 冷唤醒探针第 (4) 步的计数由 b 变 b+1；result：未跑。`dsh-agent/src/index.ts :: enter` 在 `resume` 返回前写 store、`dsh-agent-loop/src/agent.ts` 的 `followup → send(...,'next-turn',true) → wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r4-goal（复用；只看过 v4） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v4 内存 |
| Operation and Evolution | r1-ops（复用；看过 v1–v4） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v1–v4 内存 |
| Adversarial | r5-adv（**新代理**，未见过任何旧版本） | 未开始 | v5 全文（全量扫描）+ 接手 r3-adv 的旧项 | — |

## 本轮变更面（v4 → v5）

- 触及的决策点：Decision 3（兜底抛错）、Decision 5（三处文案点名冷 id 来源）、Decision 7（rename 的显式替换规则）。
- 新增位置：
  1. §4 S2 3 的 rename 替换代码块（`loaded.ok !== true` 一行 + `const agent = loaded.agent`），以及「替换后 `cannot rename session` 是 3 处」。
  2. §4 S2 5.3 的兜底 `unexpected admission verdict`。
  3. §4 S2 末尾的「结构约束」（两段各包块、`let entry/target/woke` 先声明后赋值）。
  4. §3 Step 2 的五个计数判据（含 `if (admit !== 'ok')` 与 `pure.decideDelivery(` 行号早于 `ctx.agents.get(`）。
  5. §6 的探针改为增量判据（`b+1`）与一次性 `<stamp>`，以及 create · rename · archive 合并行。
  6. §8 的 BS-8（`allow` 只有静态守卫）。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §6 的「基线计数必须为 0」与「计数恰为 1」两个绝对判据，改成 `b` / `b+1`。
  2. 删 §6 里对「`list_sessions` 里任一 id」改标题再改回的那一行，改成对 `create_session` 造出的 `<sid>` 执行 —— 原来的写法会把一个用户会话的标题永久钉住，且对 `(untitled)` 会话无法回滚。
  3. 并 §6 的 create+archive 与 rename 两行为一行。
  4. 删 §5 No-go 9 里的行号引用（本轮合并行会让它们错位一格），改成按名字引用。
  5. 删 §4 S2 4/5 的 `const entry` / `const target` / `const woke`，改成函数级 `let` + 赋值（原写法在同一函数体里必然重复声明）。
- 为什么新增不是 0：rename 的替换规则是 Decision 7 的执行细节，缺了它实现方只能在两条会各踩一个硬闸的读法里二选一；结构约束与增量判据各消除一类「按字面写必然红」的坑；其余新增都是把 v4 已有的判据写得更可判定。
- 是否用新规则回答新发现：否。本轮没有新增数据源、状态或依赖；`unexpected admission verdict` 是把活路径既有的兜底形状复制到冷路径。
- 本轮新增机制数：0。

## Closure Table（round 4 的 21 个问题）

| Problem ID | Source route | Status | Evidence position（v5） | Next step |
|---|---|---|---|---|
| R4G-04 / R4A-01 / R4O-01（rename 如何消费装载体，两种读法各踩一闸） | Goal / Adversarial / Operation | Resolved | §4 S2 3 的 rename 替换代码块（`loaded.ok !== true` → `cannot rename session <id>: <detail>`；`const agent = loaded.agent`），并写明替换后 `cannot rename session` 为 3 处；§3 Step 2 计数 = 3 | - |
| R4A-02 / R4G-02 / R4O-03（探针写成绝对计数、基线必须 0） | Adversarial / Goal / Operation | Resolved | §6 冷唤醒探针改用 `b` / `b+1` 与一次性 `<stamp>`；活投递探针同样带 `<stamp>` | - |
| R4A-03 / R4G-08（两条路径各自 `const` 同名变量） | Adversarial / Goal | Resolved | §4 S2 末尾「结构约束」：两段各包块，`let entry` / `let target` / `let woke = false` 先声明 | - |
| R4A-04 / R4O-02（rename 探针钉住用户会话标题、`(untitled)` 无法回滚） | Adversarial / Operation | Resolved | §6「create · rename · archive」行：改名对象是 `create_session` 造出的 `<sid>`，不再碰用户会话 | - |
| R4A-05（准入分派缺兜底） | Adversarial | Resolved | §4 S2 5.3 的「其余取值 → `unexpected admission verdict: <admit>`」 | - |
| R4G-01 / R4O-06（No-go 9 的行号引用错位） | Goal / Operation | Resolved | §5 No-go 9 改成按名字引用（`backups/`、`create · rename · archive` 行、冷唤醒探针、活投递探针） | - |
| R4G-03（`allow` 没有行为级验收） | Goal | Partly resolved → disclosed | §3 Step 2 的五个计数（含 `if (admit !== 'ok')` 被消费、`pure.decideDelivery(` 行号早于 `ctx.agents.get(`）；§8 BS-8 | 见开放项 |
| R4G-05（Step 3 的 `woke` 计数门槛偏低） | Goal | Resolved | §3 Step 3 改为三个互不重叠的模式各命中 1 行 | - |
| R4G-06（Step 5 可被全红表满足） | Goal | Resolved | §3 Step 5「每一行都与期望列一致；任何一行红即 Step 5 未完成」 | - |
| R4G-07（冷 id 来源没告诉调用方） | Goal | Resolved | §4 S4 的 `parameters.agent.description`、`MAILBOX_PROMPT`、README 的 `agent` 段都点名 `list_workspaces` 的展开行 | - |
| R4O-04（同 R4A-03） | Operation | Resolved | 同第 3 行 | - |
| R4O-05（`denied` 文案丢了「不是完整 id」的提示） | Operation | Resolved | §4 S2 5.3 的 `denied` → `session not in the allow list: <q> (a cold session is addressable only by its full id)` | - |
| R4G-08 后半（`unexpected resolve verdict` 兜底未被列入保留清单） | Goal | Resolved | §4 S2 2 点明该兜底仍在 | - |

## Revision Table（round 4 → v5）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R4G-04 / R4A-01 / R4O-01 | S2 3 加 rename 的替换代码块；Step 2 计数改 3 | Yes（机制 + 验收） |
| R4A-02 / R4G-02 / R4O-03 | §6 探针改增量与 `<stamp>` | Yes（验收） |
| R4A-03 / R4G-08 / R4O-04 | S2 加结构约束（`let` 先声明） | Yes（机制结构） |
| R4A-04 / R4O-02 | §6 rename 改在 `<sid>` 上做，并合并 create/archive 行 | Yes（验收 + 授权副作用） |
| R4A-05 | 冷路径准入加兜底抛错 | Yes（判定） |
| R4G-01 / R4O-06 | No-go 9 改按名字引用 | No（引用形态） |
| R4G-03 | Step 2 计数加消费与行序；BS-8 | Yes（验收 + 盲点） |
| R4G-05 / R4G-06 | Step 3 三模式、Step 5 判据收紧 | Yes（验收） |
| R4G-07 | 三处文案点名 `list_workspaces` | Yes（文档，影响可达性） |
| R4O-05 | `denied` 文案补回 id 提示 | No（文案） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| `config.allow` 在两条路径上没有行为级验收（R4G-03、BS-8） | 行为级验验收必须临时改 profile 的插件 config，No-go 9 禁止；纯函数 CASE 与 Step 2 的静态计数（含行序）是可行上限 | 若实现把闸移到 `ctx.agents.get(` 之后，静态计数仍绿而行为已变 | 真机上观察到 `allow` 对冷路径或活路径不起作用，即转 must-change |
| 冷 + 归档会话的真机探针（BS-6） | 造一条「冷且归档」的会话需要重启 Host | 顺序若写反，`CASE cold-admission-order` 仍会绿 | 观察到一条归档会话出现在 `list_sessions` 里，即转 must-change |
| 冷子代理会话的真机探针（BS-5） | 本机没有可枚举的冷子代理 session id 来源 | `CASE wake-verdict-subagent` 只覆盖错误对象到 reason 的映射 | 拿到一个冷子代理 id，或用户报告该分支异常 |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- round 5 冻结时 HEAD = `28fc4f6`，`node --test` 基线 35，`index.js` 里 `controller.resolveAgent(` 1 处、`pure.coldAdmission(` 0 处、`pure.decideDelivery(` 2 处、`cannot rename session` 4 处、`ctx.agents.get(` 1 处、`woke` 2 处（均为 "woken" 子串）。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
