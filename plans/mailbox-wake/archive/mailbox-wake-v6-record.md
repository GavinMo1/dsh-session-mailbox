# mailbox-wake v6 — Review Record

被评审版本：`mailbox-wake-v6.md`（v6，round 6）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1–v5 的全文与记录在 `archive/`。

## 结论

**round 6 进行中。** 累计 high 数：r1 = 2、r2 = 1、r3 = 3、r4 = 0、r5 = 1。r5 的 high（R5A-01）是 v5 把活/冷两条路径写成两个平铺块、且 `notfound` 被「其余取值」那句吞掉，属本轮结构重写的漏洞；v6 用显式的 `if / else if / else` 分派封住，并把该分派纳入 Step 2 的静态计数。

## 版本、级别与授权

- 当前版本 v6；已完成 round：5；进行中：round 6。
- 评审级别：**Deep**，route 数 3（六轮不变）。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Goal route 换成新代理做全量扫描（「本版是否引入新问题」的检查位），Operation 与 Adversarial 复用并只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用（round 6/10）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛，且只有这两种返回态；property: fact | 真机上抛异常或出现第三种返回态则本决策被否（§7 有对应的停条件）。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`；property: preference | 替代方案「扫 `sessionController.list()`」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。历史 52 次投递：48 短名 / 4 标题 / 0 完整 id —— 故三处对外文案点名冷 id 的来源，并声明 orphan 会话列不出来的边界 |
| Decision 3 | 冷路径顺序：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝；准入返回值之外的取值兜底抛错 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`（「ends as `blocked` without a request」）；property: fact（gate）/ preference（顺序） | 若 gate 放行 pre-step，前半被否。替代方案「先装载再判归档」被否：先付内存再必然失败（v6 用 Step 2 的行序判据把它变成可检查的） |
| Decision 4 | 投递仍用 `followup` / `steer`，冷路径不特判 `statusBefore` / `primitive` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`；maintenance 期间 `status === 'idle'`；property: fact / to verify（P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：两条路径语义分裂，`steer` 无从表达 |
| Decision 5 | 输出契约新增 required `woke`；回执 `name` 取自 `rows()` 的别名表；三处对外文案点名冷 id 来源并声明 orphan 边界；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；`index.js :: list_workspaces` 的展开行是冷 id 的可读来源；property: preference | 替代方案「`name` 用 `id.slice(-8)`」被否：与别名表两套规则。替代方案「不提 id 来源」被否：那会让新能力只对「用户手动粘 id」可达 |
| Decision 6 | 唤醒不加自建超时 / `Promise.race` / 重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`；`resolveAgent` 无 signal 位置；property: fact | 长时间不返回按 BS-4 回来 |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」；`rename_session` 用 §4 S2 3 的完整代码块替换它的取 agent 段（含 `let loaded` 与 `try/catch` 形状） | 现树 `rename_session.execute` 自带 `try/catch`、早退与三处 `cannot rename session`；替换后为 3 处；property: preference | 替代方案「只换调用、旧四行不动」被否：`{ok, agent}` 没有 `error` 键，失败会塌成一句假陈述。替代方案「不给 `loaded` 赋值」被否：`ReferenceError` 被外层 catch 吞成 `cannot rename session …: loaded is not defined`（r5 实测） |
| Decision 8 | 两条路径用显式 `if (found.reason === 'notfound') … else if (found.ok === true) … else throw` 分派；共用同一段尾部；活路径白名单闸留在原位 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`pure.js :: decideDelivery` 是唯一策略实现；`notfound` 不是「其余取值」（那三句只覆盖 empty/self/ambiguous）；property: preference | 替代方案「两块平铺」被否：活路径块会先跑并对 `undefined` 取属性（r5 实测 TypeError）。替代方案「活路径也走 `coldAdmission`」被否：会动活路径既有的归档判定时机 |

### Appendix 1 · 错误码到文案的映射

`resolve` 四出口：`ApiSessionNotFound` → `'session/not-found'`；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者，故按 reason 白名单判。`RemoteError` 带 `readonly code` / `readonly details`。property: fact。

### Appendix 2 · 不做全量预热

每会话一份，插件侧不留 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 README 的 `<plugin-name>/v<version>` 且要求 `name` 用 `dsh-<name>`。property: fact。

### Appendix 4 · `woke` = 「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也拿到 `true`。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`session/not-found` 至少三个来源（无转录、无 `cwd`、标称不是 id 的串）。`list_workspaces` 展开行只有 `session: <id>`、无标题，且 `WorkspaceEntity.sessionIds` 会过滤 cwd 与工作区不一致的会话；orphan 会话（工作区登记已删）在任何展开行里都不出现。property: fact / preference。

### Appendix 6 · 白名单三态只有一份实现

`pure.js :: decideDelivery` 是唯一策略实现；`coldAdmission` 先判「allow 既非 undefined 也非数组」→ `allow-unreadable`，再调它。活路径对非数组 `allow` 仍是既有行为，属范围外的既有缺陷。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（六轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose 装载体只统一取 agent + rename 用完整替换块，rejected 只换调用表达式，because 后者会被外层 catch 吞成 `loaded is not defined`。
- default, not asked；chose 显式 `if / else if / else` 分派，rejected 两块平铺，because 后者活路径块先跑并对 `undefined` 取属性。
- default, not asked；chose 三处文案点名 `list_workspaces` 并声明 orphan 边界，rejected 沉默，because 沉默会让新能力只对「用户手动粘 id」可达。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 fact；P6 to verify，destination 为 §6 冷唤醒探针。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛，无第三种返回态 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾折成 `{ error: RemoteError(...) }`。判据：若该类里出现第三处 `return` 形状，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 冷唤醒探针第 (4) 步计数由 b 变 b+1；result：未跑。`dsh-agent/src/index.ts :: enter` 在 `resume` 返回前写 store、`dsh-agent-loop/src/agent.ts` 的 `followup → send(...,'next-turn',true) → wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r6-goal（**新代理**，未见过任何旧版本） | 未开始 | v6 全文（全量扫描） | — |
| Operation and Evolution | r1-ops（复用；看过 v1–v5） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v1–v5 内存 |
| Adversarial | r5-adv（复用；看过 v5） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露 v5 内存 |

## 本轮变更面（v5 → v6）

- 触及的决策点：Decision 3（准入兜底与行序判据）、Decision 7（rename 的完整替换块）、Decision 8（显式分派）。
- 新增位置：
  1. §4 S2 4 的 `if / else if / else` 分派骨架（`let entry / let target / let woke = false` 与之同段）。
  2. §4 S2 3 的 rename 完整替换块（`let loaded` + `try/catch` 只包调用 + 两个 `throw` 在 `try` 外）。
  3. §3 Step 2 的两条行序判据（`pure.coldAdmission(` < `await wakeAgent(`；`pure.decideDelivery(` 首次 < `ctx.agents.get(`）与 `unexpected admission verdict` / `unexpected resolve verdict` 计数。
  4. §6 的「执行顺序」说明与候选淘汰规则（任一错误都换候选）。
  5. §5 No-go 9 按名字引用（上一版已改，本轮沿用并随行名更新）。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §4 S2 2 的「其余未列出的取值仍走兜底」这句（它把 `notfound` 吞掉），改为分派骨架里的 `else`。
  2. 删 §4 S2 5/6 的「两块各包一对花括号」表述，改为分派骨架内两块。
  3. 删 §6 冷唤醒探针的「`[USER source=session-mailbox]` 行出现在该计数所在段落里」这半句（`Select-String` 的 `.Count` 不产出上下文，无法出示；`--source` 前置过滤已承担该保证）。
  4. 并 §6「create · rename · archive」与调换执行顺序的说明。
  5. 删 §7 第 1 条里「返回的对象既没有 `agent` 也没有 `error` 键 → 停」的原始表述，改为挂在载体的 `cannot load session …: resolveAgent returned …` 文本上（原表述永远触发不到，因为载体已把它折成 `internal`）。
- 为什么新增不是 0：分派骨架是本轮唯一的结构性新增，缺它两块必然互相踩；rename 替换块是 Decision 7 的执行细节；两条行序判据是「顺序」这一决策唯一可机械检查的形式。其余都是把已有规则写得更可判定。
- 是否用新规则回答新发现：否。本轮没有新增数据源、状态或依赖。
- 本轮新增机制数：1（`if / else if / else` 分派骨架，取代「两块平铺」这一无法执行的写法）。

## Closure Table（round 5 的 16 个问题）

| Problem ID | Source route | Status | Evidence position（v6） | Next step |
|---|---|---|---|---|
| R5A-01（两块平铺 / `notfound` 被「其余取值」吞掉） | Adversarial | Resolved | §4 S2 4 的显式分派骨架；§3 Step 2 计数 `unexpected resolve verdict` = 1 | - |
| R5A-02（rename 替换块缺 `loaded` 赋值、`try/catch` 形状未定） | Adversarial | Resolved | §4 S2 3 的完整代码块（`let loaded`、`try/catch` 只包调用、两个 `throw` 在 `try` 外）；§3 Step 2 计数 `await wakeAgent(` = 2、`cannot rename session` = 3 | - |
| R5A-03（「准入 → 装载」顺序无静态闸） | Adversarial | Resolved | §3 Step 2 的行序判据（`pure.coldAdmission(` < `await wakeAgent(`）；§8 BS-6 改述为「只保证调用顺序、不保证归档冷会话的真机走向」 | - |
| R5A-04（冷探针候选可能是「归档但仍活」的会话） | Adversarial | Resolved | §6 冷唤醒探针：回执抛**任何**错误都换候选（不再只限 5.3/5.4 两段）；§6 顶部的执行顺序说明把会留下归档会话的那行排到最后 | - |
| R5A-05（8 位串可被标题子串命中并真的投递） | Adversarial | Resolved | §6「两个不存在的地址」行给出三条前置：没有 `name` 等于它、没有 `title` 含它、它不是任何 id 的后缀 | - |
| R5A-06 / R5G-01（`'woke }'` 依赖尾逗号风格） | Adversarial / Goal | Resolved | §3 Step 3 第三个判据改成 `'woke,'` 与 `'woke }'` 合计命中 1 行 | - |
| R5A-07（`.Count` 无法出示「段落」） | Adversarial | Resolved | §6 冷唤醒探针删掉该半句，只留 `b+1` | - |
| R5A-08 / R5O-04（README 小节标题不符） | Adversarial / Operation | Resolved | §4 S4 要求把标题改成 `` ### `rename_session` 的语义 ``，并说明「0.8.1 里该承诺本来就不成立」 | - |
| R5A-09（冷路径二次 `rows()` 导致两张别名表） | Adversarial | Resolved | §4 S2 6.6：本块内不得重算 `senderName`，发送方别名以调用开始时那张表为准 | - |
| R5O-01（Step 5 的「或」给红行开了交付出口） | Operation | Resolved | §3 Step 5 分两条路：Core Task 行红 → 停、不得执行 Step 6；§3 Step 6 加前置「§6 全绿（或已按 Step 5 停下并报告）」 | - |
| R5O-02（§7 第 1 条与载体的 `internal` 折叠互相抵消） | Operation | Resolved | §7 第 2 条改为挂在 `cannot load session "<q>": resolveAgent returned …` 这段文本上 | - |
| R5O-03（orphan 会话列不出 id，文案却无条件承诺） | Operation | Resolved | §4 S4 三处文案改成「usually prints」，README「已知边界」新增 orphan 一条 | - |
| R5G-02（rename 描述被整段替换，丢掉校验说明） | Goal | Resolved | §4 S4 改成「保留现有全文，只替换最后一个子句」 | - |
| R5G-03（记录侧开放项的可证伪测试已失效） | Goal | Resolved（record） | 见本记录「开放项」表第 1 行 | - |

## Revision Table（round 5 → v6）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R5A-01 | S2 加显式分派骨架；S2 2 删「其余取值」句 | Yes（机制结构） |
| R5A-02 | S2 3 给 rename 完整替换块 | Yes（机制） |
| R5A-03 | Step 2 加行序判据；BS-6 改述 | Yes（验收 + 盲点） |
| R5A-04 | §6 候选淘汰规则改成「任一错误」；加执行顺序 | Yes（验收） |
| R5A-05 | §6 8 位串加三条前置 | Yes（验收） |
| R5A-06 / R5G-01 | Step 3 第三判据改合计口径 | Yes（验收） |
| R5A-07 | 删「段落」半句 | No（删冗余条件） |
| R5A-08 / R5O-04 | README 标题改名 + 说明 | No（文档） |
| R5A-09 | S2 6.6 明确不重算 senderName | No（明确取舍） |
| R5O-01 | Step 5 分两路；Step 6 加前置 | Yes（交付判据） |
| R5O-02 | §7 停条件改挂文本 | Yes（停条件） |
| R5O-03 | 三处文案 + README 边界 | No（文档） |
| R5G-02 | rename 描述只换子句 | No（文档） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| `config.allow` 在两条路径上没有行为级验收（BS-8） | 行为级验证必须临时改 profile 的插件 config，No-go 9 禁止 | 若实现消费了 `admit` 却不按其值抛错（例如只 `console.warn`），Step 2 的计数与 §6 全表仍绿 | 真机上观察到 `allow` 对冷路径或活路径不起作用，即转 must-change |
| 冷 + 归档会话的真机走向（BS-6） | 造一条「冷且归档」会话需要重启 Host；静态闸只保证调用顺序 | 有行序判据，但被归档的冷会话走哪条拒绝仍未观测 | 观察到一条归档会话出现在 `list_sessions` 里 |
| 冷子代理会话的真机探针（BS-5） | 本机没有可枚举的冷子代理 session id 来源 | `CASE wake-verdict-subagent` 只覆盖错误对象到 reason 的映射 | 拿到一个冷子代理 id，或用户报告该分支异常 |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- round 6 冻结时 HEAD = `28fc4f6`，`node --test` 基线 35，`index.js` 里 `controller.resolveAgent(` 1 处、`pure.coldAdmission(` 0 处、`await wakeAgent(` 0 处、`pure.decideDelivery(` 2 处（191/298）、`cannot rename session` 4 处（311/314/317/324）、`unexpected admission verdict` 0 处、`unexpected resolve verdict` 1 处、`ctx.agents.get(` 1 处（198）。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
