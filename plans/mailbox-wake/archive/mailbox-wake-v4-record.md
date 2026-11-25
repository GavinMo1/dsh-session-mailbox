# mailbox-wake v4 — Review Record

被评审版本：`mailbox-wake-v4.md`（v4，round 4）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1、v2、v3 的全文与记录在 `archive/`。每版都是 Substantive Change，各自重跑 route。

## 结论

**round 4 进行中。** 累计：round 1 → 2 high / 17 medium / 10 low（v1 未收敛）；round 2 → 1 high / 12 medium / 11 low（v2 未收敛）；round 3 → 3 high / 9 medium / 10 low（v3 未收敛）。v3 的 3 个 high 里有两个是 v3 自身重写引入的回归（活路径白名单闸丢失、`coldAdmission` 把出厂默认判成拒绝），本轮逐一封住。

## 版本、级别与授权

- 当前版本 v4；已完成 round：3；进行中：round 4。
- 评审级别：**Deep**，route 数 3，四轮不变（公开工具契约 + 改全部后续步骤的决策点）。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Goal route 换成新代理做全量扫描（这是「本版是否引入新问题」的检查位），Operation 与 Adversarial 两条复用并只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用（round 4/10）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用返回值的 `{ agent }` / `{ error }` | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 转发给 `this.agents.resolveAgent`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch 折成 `{ error: RemoteError }`、不抛；property: fact | 若真机上抛异常而不是返回 `{error}`，本决策被否。替代方案「自己 `ctx.agents.resume(...)`」被否：要复刻 `composeAgent` 的 preset 解析与 projection 读取 |
| Decision 2 | 冷路径只接受完整 session id | `index.js :: rows()` 只映射 `ctx.agents.list()`，`resolveTarget` 的输入表只含活会话；property: preference | 替代方案「扫 `sessionController.list()` 拿全量行」被否：`@Remote` 异步、每次发消息扫一遍持久化、`SessionSummary` 无 title。实测历史 52 次投递：48 短名 / 4 标题 / 0 完整 id |
| Decision 3 | 冷路径顺序固定：准入（`coldAdmission`）→ 装载（`wakeAgent`）→ 统一尾部；归档读失败拒绝 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`（注释：「ends as `blocked` without a request」）；property: fact（gate）/ preference（顺序） | 若 gate 放行 pre-step，前半被否。替代方案「先装载再判归档」被否：先付内存再必然失败 |
| Decision 4 | 投递仍用 `followup` / `steer`，冷路径不特判 `statusBefore` / `primitive` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`；maintenance 期间 `status === 'idle'`；property: fact / to verify（P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：两条路径语义分裂，`steer` 无从表达 |
| Decision 5 | 输出契约新增 required `woke`；回执 `name` 取自 `rows()` 的别名表；README/description/prompt 同步；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；property: preference | 替代方案「`name` 用 `id.slice(-8)`」被否：与别名表两套规则，碰撞时回执的 `name` 解析到另一会话 |
| Decision 6 | 唤醒不加自建超时 / `Promise.race` / 重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`，同 id 并发已去重；`resolveAgent` 无 signal 位置；property: fact | 长时间不返回按 BS-4 回来 |
| Decision 7 | `wakeAgent(id)` 只统一「取 agent」，两个工具共用；报错文案、`try/catch`、早退各归各的调用方 | 现树 `rename_session` 自带 `try/catch`（折成 `cannot rename session <id>: …`）与 `sessionController` 缺失早退；`send_session_message` 有自己的五条文案；property: preference | 替代方案「装载体同时统一文案」被否：会让 rename 的错误讲成「装载/投递」失败（round 3 的 R3A-04）。替代方案「不共用」被否：用户对端要求不要两套唤醒逻辑 |
| Decision 8 | 两条路径共用同一段尾部代码，但活路径的白名单闸留在原位；冷路径的准入由 `coldAdmission`（内部复用 `decideDelivery`）承担 | 现树活路径闸在 `resolveTarget` 之后、`ctx.agents.get` 之前；`pure.js :: decideDelivery` 的三态语义是唯一策略实现；property: preference | 替代方案「活路径也改走 `coldAdmission`」被否：那会把活路径的归档判定提前到 `ctx.agents.get` 之前，改了一个与本次目标无关的既有行为。替代方案「白名单在两条路径各写一份」被否：策略分叉（round 3 的 R3A-01 就是漏了一份） |

### Appendix 1 · 错误码到文案的映射

`resolve` 的四个出口：`ApiSessionNotFound` → `'session/not-found'`；subagent 归属 → `'session/agent-busy'` 且 `details.reason === 'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者（`prompt rejected`、`generation continuation …`），故按 reason 白名单判。`RemoteError` 带 `readonly code` / `readonly details`，按字段判、不按类名。property: fact。

### Appendix 2 · 不做全量预热

唤醒即真装 agent，每会话一份，插件侧不留 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 README 的 `<plugin-name>/v<version>` 且要求 `name` 用 `dsh-<name>`，故前缀是包名；目录名只对应一条历史 `session-mailbox/v0.4.0`。property: fact。

### Appendix 4 · `woke` = 「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也拿到 `true`；字段与 render 都按这个含义写。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`session/not-found` 至少三个来源：无转录、有转录但 `header.cwd === undefined`、标称不是 id 的字符串。三者共用一条 reason，故文案只说「匹配不上且装载不了」并给出唯一可行下一步（用完整 id），不承诺任何工具会打印那条 id（`list_workspaces` 展开行只有 `session: <id>`、无标题，且 `WorkspaceEntity.sessionIds` 会过滤 cwd 与工作区不一致的会话）。property: fact / preference。

### Appendix 6 · 白名单的三态语义只有一份实现

`pure.js :: decideDelivery` 是唯一策略实现；`coldAdmission` 先用它、再判归档。若 `allow` 既不是 `undefined` 也不是数组（配置写错），冷路径返回 `allow-unreadable` 并单独报错，不再与「不在白名单」混为一谈。property: preference（既有活路径对非数组 `allow` 的行为是 `includes` 的隐式转换，属本轮范围外的既有缺陷，未改）。

### Choice List（Decision Table 的派生视图）

- asked：无（四轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()`，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，because 有 `statusBefore`/`primitive` 的先例。
- default, not asked；chose `resolveAgent`，rejected 手搓 `agents.resume`，because 前者是宿主注释写明的对外入口。
- default, not asked；chose 装载体只统一「取 agent」，rejected 连文案一起统一，because 后者会让改名失败报成投递失败。
- default, not asked；chose 活路径白名单闸留在原位，rejected 两条路径都走 `coldAdmission`，because 那会顺带改动活路径既有的归档判定时机。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 property: fact；P6 to verify，destination 为 §6 第 3 行。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `sessionController.resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾把一切折成 `{ error: RemoteError(...) }`。判据：若找不到 `return { error:` 分支，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))` → `ctx.agents.resume(...)`。判据：若没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若无 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController` | proved | 现树 `index.js :: rename_session.execute` / `create_session.execute` 都有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句含 `observation.header.cwd === undefined`。判据：若该条件不在，本条为假 |
| P6 | resume 之后立刻 `followup` 会起 turn | to verify | check：§6 第 3 行（`[USER source=session-mailbox]` 计数为 1 且其后出现探针文本）；result：未跑。`agent-loop/src/agent.ts` 的 `followup → send(...,'next-turn',true) → wakeDriver` 支持「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r4-goal（**新代理**，未见过任何旧版本） | 未开始 | v4 全文（全量扫描） | — |
| Operation and Evolution | r1-ops（复用；看过 v1–v3） | 未开始 | 仅 Closure Table 引用的位置 | 已暴露旧版本内存 |
| Adversarial | r3-adv（复用；看过 v3） | 未开始 | 仅 Closure Table 引用的位置 + v4 相关段 | 已暴露 v3 内存 |

## 本轮变更面（v3 → v4）

- 触及的决策点：Decision 7（装载体职责收窄）、Decision 8（新增：尾部共用但活路径白名单闸留原位；`coldAdmission` 复用 `decideDelivery`）。
- 新增位置：
  1. §4 S2 4 里逐字恢复的活路径白名单闸（v3 把这段写成「活路径独有代码到此结束」，闸没有落点）。
  2. §4 S1 `coldAdmission` 复用 `decideDelivery` 的写法与新增的 `allow-unreadable`。
  3. §3 Step 2 的四处计数判据（`controller.resolveAgent(` / `pure.coldAdmission(` / `pure.decideDelivery(` / `cannot rename session`）。
  4. §6 的 rename 探针行与 `package.json` 版本行。
  5. §5 No-go 9 的第四项豁免（rename 探针改标题后改回）。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 §3 Step 2 里「`coldAdmission` 的行号早于 `resolveAgent`」这条行序判据（它按字面反而与 §4 S2 3 的放置相冲），改为四处符号计数。
  2. 并 §6 第 3、4 两行为一行（原第 4 行要求「在上一条之前」跑基线，只能靠重投一次实现，会把活路径的证据冒充冷路径的证据）。
  3. 删 `coldAdmission` 自己复制 `decideDelivery` 三态的写法（v3 的「`allow === undefined` 跳到第 2 步」把出厂默认判成拒绝）。
  4. 删 v3 §1 里「错误文案与判定分支不变」这句会被装载体破坏的表述，改为点名保留 `try/catch`、早退与文案。
- 为什么新增不是 0：四处计数判据各自盯一个不会被任何行为测试抓到的删除型回归（漏掉一个调用点、漏掉一个闸、多写一套策略、改坏 rename 文案），无法合并成一条命令；其余新增都是把 v3 已有的规则写回原位。
- 是否用新规则回答新发现：否。`coldAdmission` 改为复用 `decideDelivery` 是删除一份重复实现，不是新增机制；装载体在本轮反而收窄了职责。
- 本轮新增机制数：0（装载体在 v3 已存在，本轮只收窄它的职责；`coldAdmission` 少了一份逻辑）。

## Closure Table（round 3 的 22 个问题）

| Problem ID | Source route | Status | Evidence position（v4） | Next step |
|---|---|---|---|---|
| R3A-01 / R3G-02 / R3O-01（活路径白名单闸丢失） | Adversarial / Goal / Operation | Resolved | §4 S2 4 逐字恢复 `pure.decideDelivery(config.allow, entry.id)` 与两条原文错误；§5 No-go 7；§3 Step 2 计数 `pure.decideDelivery(` = 2 | - |
| R3A-02 / R3G-01（`coldAdmission` 把 undefined 判成拒绝） | Adversarial / Goal | Resolved | §4 S1 改为复用 `decideDelivery`；§4 S5 的 `CASE cold-admission-order` 要求 `allow` 为 `undefined` → `'ok'`；Appendix 6 | - |
| R3A-03（Step 1 判据与 S5 互斥） | Adversarial | Resolved | §3 Step 1 现在同时包含「加 5 个 CASE」，判据改为 `ℹ tests` 由 N 变 N+5；§6 第 1 行同口径 | - |
| R3A-04 / R3G-03 / R3O-03（rename 文案被装载体改写） | Adversarial / Goal / Operation | Resolved | §4 S2 3「装载体只统一取 agent，不统一报错文案」+「`rename_session` 保留自己的 `try/catch` 与早退」；§3 Step 2 计数 `cannot rename session` 与基线相同；§1 重述 | - |
| R3A-05（rename 的 catch 被禁止） | Adversarial | Resolved | 同上一行（§4 S2 3 现在明确允许并保留调用方的 catch） | - |
| R3A-06 / R3O-02（README 仍说改标题会唤醒冷会话） | Adversarial / Operation | Resolved | §4 S4 点名删掉该条；§3 Step 4 与 §6 第 9 行的 `-SimpleMatch` 名单含 `改标题会唤醒冷会话`（改动前 3 行 → 0） | - |
| R3A-07（第 3/4 行可双绿而 Core Task 未达成） | Adversarial | Resolved | §6 第 3 行合并成「基线 → 唯一一次投递 → 只读轮询」，判据为 `[USER source=session-mailbox]` 计数恰为 1 且其后出现探针文本；不再有第二次投递 | - |
| R3A-08 / R3G-04（Step 2 行序判据与放置相冲） | Adversarial / Goal | Resolved | §3 Step 2 改为四处符号计数，删掉行序要求 | - |
| R3A-09（装载体把三种返回态塌成一句假陈述） | Adversarial | Resolved | §4 S2 3 分三支：`result` 非对象 → `detail: 'resolveAgent returned ' + String(result)`；缺 `agent` 键 → `'resolveAgent returned an object with no agent key'`；`detail` 为空时省略冒号 | - |
| R3A-10（README 的测试条数） | Adversarial | Resolved | §4 S4 要求把「测试覆盖到哪」的条数改成 N+5，并把冷路径写进「没有自动化覆盖」的清单 | - |
| R3A-11（配置错误与输入错误共用一条文案） | Adversarial | Resolved | §4 S1 的 `allow-unreadable` + §4 S2 5.3 的独立文案 + CASE 覆盖 | - |
| R3A-12 / R1A-03（描述句无条件断言） | Adversarial | Resolved | §4 S4 的 description 改为 `may be loaded …; an archived, subagent-owned, allow-list-denied or unresumable session is refused` | - |
| R3G-05（第 3 行回退未覆盖全部错误） | Goal | Resolved | §6 第 3 行改成「报 §4 S2 5.3/5.4 的任一错误都换下一条候选」 | - |
| R3G-06（第 5 行无命令形态） | Goal | Resolved | §6 第 4 行给出 `--source session-mailbox` 与计数命令 | - |
| R3O-04（rename 完全不可验收） | Operation | Resolved | §6 第 8 行的 rename 探针（改标题再改回，两个标题写进报告）+ §5 No-go 9 第四项豁免 | - |
| R3O-05（§2 把脚本渲染当成转录事实） | Operation | Resolved | §2 症状 3 改成「一条 `user/message`、`source.kind === 'session-mailbox'`、正文含探针文本」，并注明脚本渲染形态 | - |
| R1O-03 / R1O-04 残余（冷+归档、冷子代理无真机探针） | Operation | Unresolved → disclosed | §8 BS-6、BS-5 | 见开放项 |

## Revision Table（round 3 → v4）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R3A-01 / R3G-02 / R3O-01 | S2 4 逐字恢复活路径白名单闸；Step 2 加计数判据 | Yes（机制 + 验收） |
| R3A-02 / R3G-01 | `coldAdmission` 改为复用 `decideDelivery`；CASE 加 `undefined → ok` | Yes（判定） |
| R3A-03 | Step 1 接管 5 个 CASE；判据改 N+5 | Yes（步骤） |
| R3A-04 / R3G-03 / R3O-03 / R3A-05 | 装载体职责收窄；rename 保留 catch / 早退 / 文案；Step 2 加 `cannot rename session` 计数 | Yes（机制 + 验收） |
| R3A-06 / R3O-02 | S4 点名改 README 那条；Step 4 与 §6 第 9 行加第三个模式 | Yes（文档 + 验收） |
| R3A-07 | §6 第 3、4 行合并为一次投递 + 只读轮询 | Yes（验收） |
| R3A-08 / R3G-04 | Step 2 删行序判据，改符号计数 | Yes（验收） |
| R3A-09 | 装载体三支 detail | Yes（错误文案） |
| R3A-11 | 新增 `allow-unreadable` | Yes（判定 + 文案） |
| R3A-12 | description 改成条件式 | No（文档措辞） |
| R3A-10 / R3O-04 / R3O-05 / R3G-05 / R3G-06 | README 条数、rename 探针、症状 3 措辞、回退清单、行命令形态 | No（验收/文档形态） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| 冷 + 归档会话的真机探针（R1O-03、BS-6） | 造一条「冷且归档」的会话需要重启 Host | 顺序若写反，`CASE cold-admission-order` 仍会绿（纯函数） | 观察到一条归档会话出现在 `list_sessions` 里即转 must-change |
| 冷子代理会话的真机探针（R1O-04、BS-5） | 本机没有可枚举的冷子代理 session id 来源 | `CASE wake-verdict-subagent` 只覆盖错误对象到 reason 的映射 | 拿到一个冷子代理 id，或用户报告该分支异常，即转 must-change |
| 活路径对非数组 `allow` 的隐式转换（Appendix 6） | 既有行为，与本次目标无关；改它会动活路径判定 | 若 `allow: "abc"` 时活路径不投递，本条不成立 | 用户要求统一两条路径的白名单语义时 |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- round 4 冻结时 HEAD = `28fc4f6`，`node --test` 基线 35，`index.js` 里 `controller.resolveAgent(` 1 处、`pure.decideDelivery(` 2 处、`cannot rename session` 4 处。
- 前面各轮的 raw evidence 在 `archive/` 的对应记录里。
