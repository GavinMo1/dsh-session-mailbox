# mailbox-wake v3 — Review Record

被评审版本：`mailbox-wake-v3.md`（v3，round 3）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1、v2 的全文与记录在 `archive/`。v1 → v2、v2 → v3 都是 Substantive Change（改行为、拒绝条件、步骤与验收项），各自开新版本并重跑 route。

## 结论

**round 3 进行中。** 累计：round 1 出 2 high / 17 medium / 10 low（v1 未收敛）；round 2 出 1 high / 12 medium / 11 low（v2 未收敛）；v3 已逐条处理，等 round 3 回收。

## 版本、级别与授权

- 当前版本 v3；已完成 round：2；进行中：round 3。
- 评审级别：**Deep**，route 数 3。级别三轮不变（公开工具契约 + 改全部后续步骤的决策点）。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Deep；本轮 Adversarial route 换成新代理（全量扫描 + 接手 r1-adv 的旧问题），Goal 与 Operation 两条是复用代理只查 Closure Table 引用的位置；「预算用尽再加一轮」的例外仍未使用。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用它的返回值（`{ agent }` 或 `{ error }`） | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 只有一行 `return this.agents.resolveAgent(sessionId)`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch，把四类失败折成 `{ error: RemoteError }` 返回、不抛；property: fact | 若真机上 `resolveAgent` 抛异常而不是返回 `{error}`，本决策被否。替代方案「自己 `ctx.agents.resume({resumeSessionId, agentOptions, setup})`」被否：`resumeObserved` 里 `composeAgent(presetForObservation(observation))`，自组要复刻 preset 解析与 projection 读取两层 |
| Decision 2 | 冷路径只接受完整 session id；标题、短名、id 后缀不解析冷会话 | `index.js :: rows()` 只映射 `ctx.agents.list()`，`pure.resolveTarget` 的输入表天然只含活会话；property: preference | 替代方案「用 `sessionController.list()` 拿全量（含冷）行」被否：`list()` 是 `@Remote` 异步方法，每次发消息都要扫一遍持久化记录；`SessionSummary` 没有 title 字段；用户原话只要求「用它的 session id」。实测：本机历史 52 次真实投递，48 次用 8 位短名、4 次用标题、0 次用完整 id |
| Decision 3 | 冷路径的判定顺序固定为 白名单 → 归档 → 装载 → 统一尾部（子代理 → 归档复查）；归档在读失败时拒绝 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`（注释原话「ends as `blocked` without a request」）；活路径的归档复查在现树 `index.js :: send_session_message.execute` 尾部；property: fact（gate 行为）/ preference（顺序） | 若 gate 允许 pre-step 通过，前半被否。替代方案「先装载再判归档与白名单」被否：先付内存再必然失败。替代方案「两条路径各写一套判定」被否：冷路径与活路径的归因会不一致 |
| Decision 4 | 投递仍用活 agent 的 `followup` / `steer`，冷路径不特判 `statusBefore` / `primitive` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`，与 GUI 打开会话拿到的是同一类对象；`agent-loop/src/agent.ts` 的 maintenance 期间 `status === 'idle'`；property: fact（对象同一性、idle 状态）/ to verify（followup 立即起 turn，见 P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：两条路径语义分裂，`steer` 在冷路径上无从表达 |
| Decision 5 | 输出契约新增 required boolean `woke`；回执的 `name` 由 `rows()` 的别名表给出；同步改工具描述、参数描述、`MAILBOX_PROMPT`、README；`list_sessions` 不动；版本 0.8.1 → 0.9.0 | 现树 `index.js :: send_session_message.output.schema`（五个 required 字段）+ README 工具表与「已知边界」+ `package.json` `"version": "0.8.1"`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源；property: preference | 若用户要求「不加字段」，则只剩 render 能表达唤醒。替代方案「`name` 用 `id.slice(-8)`」被否：与别名表两套规则，碰撞时回执的 `name` 会解析到另一个会话（round 1 实测） |
| Decision 6 | 唤醒不加自建超时、不加 `Promise.race`、不重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`，同 id 并发装载已去重；`resolveAgent(sessionId)` 没有 signal 位置；property: fact | 若真机上出现唤醒长时间不返回，按 BS-4 回来 |
| Decision 7 | 唤醒只写一处：`apply()` 作用域内的 `wakeAgent(id)`，`send_session_message` 与 `rename_session` 共用；`rename_session` 的判定分支与错误文案不变 | 现树 `index.js :: rename_session.execute` 已直接调 `controller.resolveAgent(entry.id)`（`28fc4f6` 引入）；两处各写一套会让错误分类与 preset 装配的处理漂移；property: preference | 替代方案「让 `rename_session` 也获得冷会话语义」被否：那需要一条会改用户会话标题的验收，越出本轮授权。替代方案「不共用、`rename_session` 保留自己的调用」被否：用户对端明确要求不要两套唤醒逻辑 |

### Appendix 1 · 错误码到文案的映射

`agent.ts :: ApiSessionAgentController.resolve` 的四个出口：`ApiSessionNotFound` → `RemoteError('session/not-found', …)`；`ApiSessionSubagentOwnership` / live 且 subagent → `apiSessionSubagentOwnershipError()`，code 是 **`'session/agent-busy'`**，`details.reason` 是 `'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`session/agent-busy` 另有产生者（`prompt rejected`、`generation continuation …`），故判定用 reason 白名单。`remote-error.ts :: RemoteError` 带 `readonly code` / `readonly details`，按字段判、不按类名。property: fact。

### Appendix 2 · 不做全量预热、不缓存唤醒结果

唤醒即真装 agent，每会话一份；插件侧不留任何 woken 集合。property: preference。按 BS-3 回来。

### Appendix 3 · tag 前缀随包名

仓内既有 tag 是 `dsh-session-mailbox/v0.5.0 … v0.8.1`；根 `README.md` 的「加新插件」第 4 步写 `<plugin-name>/v<version>`，第 1 条要求 `package.json` 的 `name` 用 `dsh-<name>`，故 `plugin-name` 指包名。目录名只对应一条历史遗留 `session-mailbox/v0.4.0`。property: fact。

### Appendix 4 · `woke` 的含义是「这次调用走了冷路径」

并发装载同一 id 时第二个调用方也会拿到 `true`，而它没有装载任何东西；字段定义成「走了冷路径」，两条回执都是真话，render 也据此写成 `this call took the cold path`。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`session/not-found` 至少有三个来源：没有转录、有转录但 `header.cwd === undefined`、以及标称不是 id 的字符串。三者共用一条 reason，故文案只说「匹配不上且装载不了」，并把唯一可行的下一步写出来（用完整 id），不再承诺「`list_workspaces` 会打印它」——`list_workspaces` 展开行只有 `session: <id>`、没有标题，且 `WorkspaceEntity.sessionIds` 会过滤掉 cwd 与工作区不一致的会话。property: fact（三个来源与过滤链）/ preference（合并成一句而不加输入形态判定：正则分不清「无转录」与「无 cwd」）。

### Choice List（Decision Table 的派生视图）

- asked：无（三轮都没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()` 全量解析，did not ask，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，did not ask，because 加字段有本插件先例（`statusBefore`/`primitive`）。
- default, not asked；chose `resolveAgent`，rejected 手搓 `agents.resume`，did not ask，because 前者是宿主注释写明的对外入口。
- default, not asked；chose `woke` = 「走了冷路径」，rejected = 「创建了 Agent」，did not ask，because 后者在并发装载下会说假话。
- default, not asked；chose 错误文案合并三种 not-found 内因，rejected 加输入形态判定，did not ask，because 正则只会把两种猜测变成三种。
- default, not asked；chose `wakeAgent` 单一装载体，rejected 让 `rename_session` 也支持冷会话，did not ask，because 后者需要改用户标题的验收、越出授权；对端已明确要求不要两套唤醒逻辑。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 property: fact；P6 property: to verify，destination 为 §6 第 3、4 行。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `sessionController.resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾把一切折成 `{ error: RemoteError(...) }`。判据：若在该符号里找不到 `return { error:` 分支，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))` → `ctx.agents.resume(...)`。判据：若 `resumeObserved` 里没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝，唤醒它等于空转 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若 pre-step 没有 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController`，不需要新依赖 | proved | 现树 `index.js :: rename_session.execute` 与 `create_session.execute` 都已有 `ctx.get('sessionController')`。判据：若找不到，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话会被报 not-found 而不是被装载 | proved | `agent.ts :: resumeObserved` 首句 `if (observation.header.id !== sessionId || observation.header.cwd === undefined) throw new ApiSessionNotFound(...)`。判据：若该行没有 `header.cwd === undefined`，本条为假 |
| P6 | resume 之后立刻 `followup` 会真的起一个 turn | to verify | check：§6 第 3、4 行（转录出现 `[USER source=session-mailbox]`）；result：未跑（实现前没有可调用的新代码）。Adversarial route 从 `agent-loop/src/agent.ts`（`followup → send(...,'next-turn',true) → wakeDriver`）与 `src/index.ts`（`interruptedTurnClosers`）读出「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r2-goal（复用；它只看过 v2，未看过 v1/v3） | 未开始 | 仅 Closure Table 引用的位置 + v3 相关段 | 已暴露 v2 内存 |
| Operation and Evolution | r1-ops（复用；看过 v1、v2） | 未开始 | 仅 Closure Table 引用的位置 + v3 相关段 | 已暴露 v1、v2 内存 |
| Adversarial | r3-adv（**新代理**，未见过任何旧版本） | 未开始 | v3 全文（全量扫描）+ 接手 r1-adv 的旧问题 | — |

## 本轮变更面（v2 → v3）

- 触及的决策点：Decision 7（新增：装载体只写一处，`rename_session` 共用）、Decision 3（顺序文案里「解析」改名「装载」并把共享尾部写清）、Decision 5（参数描述与 README 的写法顺序一并修）。
- 新增位置：
  1. §4 S2 3 的 `wakeAgent(id)` 装载体契约。
  2. §4 S2 6 的「统一尾部」段（把现树活路径的尾部写成两条路径共用的一段，并给出唯一返回点）。
  3. §3 Step 0 的「三个基线值」（`HEAD`、`ℹ tests N`、最后一个 tag），使后面所有计数判据变成相对量。
  4. §5 No-go 9 的三条豁免（`backups/`、验收期新建并归档一个空白会话、投递探针）。
  5. §8 的 BS-6（冷且归档无真机探针）与 BS-7（唤醒后归档复查命中）。
  6. §6 的 `package.json` 版本行。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 v2 §3 Step 2 判据里的「`coldAdmission` 出现两次」——它对应的第二个调用点不存在，改为「`resolveAgent` 只出现在装载体里、`coldAdmission` 行号早于它」。
  2. 删 v2 §4 S2 第 2 段的「这一段一字不改」（与「统一尾部」互斥），改为「活路径独有代码到此结束，其后由共享尾部接管」。
  3. 合并 v2 §6 第 1、6 行的绝对计数（34/39）为相对量（N/N+5）与 `-SimpleMatch` 名单。
  4. 删 v2 not-found 文案里的「`list_workspaces` prints it」。
- 为什么新增不是 0：装载体是本轮唯一新增的结构（一次函数定义），它替换掉现树里 `rename_session` 与 `send_session_message` 各自持有的一份 `resolveAgent` 调用；统一尾部的文字不是新机制，而是把现树已有代码写成两条路径共用。其余新增位置都是判据与授权口径，无法互相合并（读者分别是实现方、验收方、审计方）。
- 是否用新规则回答新发现：否。本轮没有新增数据源、没有新增状态、没有新增依赖；`wakeAgent` 是把两个既有的 `resolveAgent` 调用点收成一个。
- 本轮新增机制数：1（`wakeAgent` 装载体），同时删除 1 个重复调用点。

## Closure Table（round 2 的 13 个问题）

| Problem ID | Source route | Status | Evidence position（v3） | Next step |
|---|---|---|---|---|
| R2A-01 / R2G-01（测试计数 35 vs 34/39） | Adversarial / Goal | Resolved | §3 Step 0 记 `ℹ tests <N>`；§4 S5 写「N → N+5」；§6 第 1 行断 `ℹ tests <N+5>` + `-SimpleMatch` 名单 | - |
| R2O-02 / R2G-02 / R2A-02（`coldAdmission` 两次） | Operation / Goal / Adversarial | Resolved | §3 Step 2 判据改为「`resolveAgent` 只在装载体里；`coldAdmission` 行号早于它」 | - |
| R2O-03 / R2G-08 / R2A-03（第 2 段 vs 第 5 段 vs 单返回点） | Operation / Goal / Adversarial | Resolved | §4 S2 4「活路径独有代码到此结束」+ §4 S2 6「统一尾部…两条路径共用…唯一返回点」；§5 No-go 7 | - |
| R2O-01 / R2A-04（version 与 tag 混成一句） | Operation / Adversarial | Resolved | §3 Step 6 分成两句并补 `git tag` 命令；§6 新增 `package.json` 版本行 | - |
| R2O-04（Step 0 备份 vs No-go 9） | Operation | Resolved | §5 No-go 9 的豁免第 1 条（`backups/` 已 gitignore） | - |
| R2G-03（not-found 押在 `list_workspaces` 上） | Goal | Resolved | §4 S2 5.4 的 not-found 文案不再提 `list_workspaces`；Appendix 5 记录 `list_workspaces` 只打 id、且会过滤 | - |
| R2G-04（§6 第 7 行越权） | Goal | Resolved | §5 No-go 9 的豁免第 2、3 条 | - |
| R2G-05 / R2A-09（`<输出文件>` 无配方） | Goal / Adversarial | Resolved | §6 第 1 行给出 `*> $env:TEMP\mailbox-tests.txt` | - |
| R2G-06（`# records` 无区分力） | Goal | Resolved | §6 第 4 行改成「`[USER source=session-mailbox]` + 其后的探针文本」为判据，记录数只记录；§2 症状 3 同步 | - |
| R2G-07 / R2A-06（回退只覆盖 archived、无终局） | Goal / Adversarial | Resolved | §6 第 3 行回退覆盖 archived / could not be loaded / subagent，并写明 3 条用尽判红并停；§7 第二条 | - |
| R2A-05（`rename_session` 未登记、其描述不成立） | Adversarial | Resolved | §1 补登该工具并声明行为不动；§4 S4 要改它的描述；Decision 7 | - |
| R2O-05（并发下 render 说假话） | Operation | Resolved | §4 S3 的 render 尾句改成 `this call took the cold path (the session was loaded from disk)` | - |
| R2O-06（唤醒后归档复查命中无条目） | Operation | Resolved | §8 BS-7 + §4 S4「唤醒的代价」末句 | - |
| R2O-07（3 条用尽无判定） | Operation | Resolved | §6 第 3 行 + §7 | - |
| R2O-08（字面短名可能命中活会话） | Operation | Resolved | §6 第 6 行改成「经 `list_sessions` 核对不存在、且不等于当前会话 name 的 8 位串」 | - |
| R2O-09（「顺序优先于本节其它条目」过宽） | Operation | Resolved | §5 No-go 7 改成「冲突时停下问，本条不自带豁免」 | - |
| R2O-10（README 小节标题） | Operation | Resolved | §4 S4 要求标题改成「卸载时不会消失的四条事实」 | - |
| R2A-07（引用不存在的 Decision 7） | Adversarial | Resolved | §5 No-go 7 引 `(Decision 3)`；Decision 7 现在是装载体，编号实存 | - |
| R2A-08（`coldAdmission` 对非数组 allow fail-open） | Adversarial | Resolved | §4 S1 第 2 条：`!Array.isArray(allow)` → `'denied'`；`CASE cold-admission-order` 含该输入 | - |
| R2A-10（README 四种写法顺序错） | Adversarial | Resolved | §4 S4 要求改成五种并给出真实顺序 | - |
| R2A-11（S2 引文与现树不符） | Adversarial | Resolved | §4 S2 2 的引文按现树 `const list = rows()` 两行写 | - |
| R2A-12（症状 2 未限定冷路径） | Adversarial | Resolved | §2 症状 2 加「冷路径」限定 | - |
| R1A-03 / R1A-05 残余（描述句无条件、`denied` 文案形状） | Adversarial | Resolved | §4 S4 的描述改成「a full session id that this process no longer holds is loaded…」；§4 S2 5.3 的 denied 文案带「or … is not a full session id」 | - |
| R1O-03 / R1O-04 残余（冷+归档、冷子代理无真机探针） | Operation | Unresolved → disclosed | §8 BS-6、BS-5 | 见开放项 |

## Revision Table（round 2 → v3）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R2A-01 / R2G-01 | 计数改为相对量（Step 0 记 N，S5 写 N+5，§6 断 N+5） | Yes（验收 + 步骤） |
| R2O-02 / R2G-02 / R2A-02 | Step 2 判据改为「`resolveAgent` 只在装载体里 + `coldAdmission` 行号在前」 | Yes（验收判据） |
| R2O-03 / R2G-08 / R2A-03 | S2 重构成「活路径独有段 + 共享尾部 + 唯一返回点」 | Yes（机制位置） |
| R2O-01 / R2A-04 | Step 6 拆开 version 与 tag，补 `git tag` 命令与版本验收行 | Yes（交付命令 + 验收） |
| R2O-04 / R2G-04 | No-go 9 增三条豁免 | Yes（授权边界） |
| R2G-03 | not-found 文案去掉对 `list_workspaces` 的承诺 | Yes（错误文案） |
| R2G-06 | 第 4 行的判据换成 `[USER source=session-mailbox]`；§2 症状 3 同步 | Yes（验收 + Core Task 措辞） |
| R2G-07 / R2A-06 | 第 3 行回退条件与终局 | Yes（验收） |
| R2A-05 | §1 补登 `rename_session`；S4 改其描述；Decision 7 | Yes（范围 + 文档） |
| R2A-08 | `coldAdmission` 对非数组 allow 拒绝 | Yes（判定） |
| R2A-10 / R2A-11 | README 写法顺序、S2 引文按现树 | No（文档措辞） |
| R2A-12 | §2 症状 2 加「冷路径」 | No（措辞，纠正一句本来会被误读的定义） |
| R2O-05 | render 尾句改成不主张因果 | No（render 文案） |
| R2O-06 / R2O-07 / R2O-08 / R2O-09 / R2O-10 | BS-7、终局、候选核对、No-go 7 收窄、README 标题 | No |
| R1A-03 / R1A-05 残余 | 描述句无条件 → 限定；denied 文案形状 | Yes（文档 + 错误文案） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| 冷 + 归档会话的真机探针（R1O-03、BS-6） | 造一条「冷且归档」的会话需要重启 Host；本机没有既能归档又能保持冷的操作 | 顺序若写反（先装载后判归档），`CASE cold-admission-order` 仍会绿（它是纯函数），§6 第 7 行只覆盖活路径 | 观察到一条归档会话出现在 `list_sessions` 里即转 must-change |
| 冷子代理会话的真机探针（R1O-04、BS-5） | 本机没有可枚举的冷子代理 session id 来源（`list_agents` 是路径名、`session_projcache` 不含 `origin`、`session-log.mjs` 不打 header） | `CASE wake-verdict-subagent` 只覆盖错误对象到 reason 的映射 | 拿到一个冷子代理 id，或用户报告该分支异常，即转 must-change |

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- 本机 `node` 在 workspace-write 沙箱下无法开 stdout 管道（EPERM）；本会话已切到 danger-full-access。
- round 1、round 2 的 raw evidence 在 `archive/mailbox-wake-v1-record.md` 与 `archive/mailbox-wake-v2-record.md`。
- 本轮冻结时 HEAD 为 `28fc4f6`（`rename_session` 落地，测试数为 35）。
