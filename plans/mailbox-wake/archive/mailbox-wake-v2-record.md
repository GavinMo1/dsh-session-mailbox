# mailbox-wake v2 — Review Record

被评审版本：`mailbox-wake-v2.md`（v2，round 2）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文 + 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1 全文与记录在 `archive/`。v1 → v2 是 Substantive Change（改了行为、拒绝条件、步骤与验收项），故开新版本并重跑全部 route。

## 结论

**round 2 进行中。** v1 的 round 1 结果为「未收敛」，2 high / 17 medium / 10 low；v2 已逐条处理，等 round 2 回收。

## 版本、级别与授权

- 当前版本 v2；已完成 round：1；进行中：round 2。
- 评审级别：**Deep**，route 数 3。级别本轮不变（v1 关：公开工具契约 + 一条改全部后续步骤的决策点）。
- `delivery point`：`plan only`。原话：「这一轮只出方案，不写实现代码；实现要等用户放行。」
- 实现状态：未开始（用户未放行）。

### 本轮级别复检（一行）

同一级别 Deep；本轮 scan route 是新的 Goal and Implementation 代理（未见过任何旧版本），两个 reused route 只查 Closure Table 引用的位置；未使用「预算用尽再加一轮」的例外（本 loop 该例外仍未使用）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 冷会话唤醒走 `ctx.get('sessionController').resolveAgent(sessionId)`，用它的返回值（`{ agent }` 或 `{ error }`） | `dsh-api-session-controller/src/index.ts :: SessionController.resolveAgent` 只有一行 `return this.agents.resolveAgent(sessionId)`；`src/agent.ts :: ApiSessionAgentController.resolve` 全程 try/catch，把 not-found / subagent / writer-held / 其余折成 `{ error: RemoteError }` 返回、不抛；property: fact | 若真机上 `resolveAgent` 抛异常而不是返回 `{error}`，本决策被否（→ 需自建 try/catch）。替代方案「自己 `ctx.agents.resume({resumeSessionId, agentOptions, setup})`」被否：`agent.ts :: resumeObserved` 里 `composition = await this.composeAgent(this.presetForObservation(observation))`，自组要复刻 preset 解析与 projection 读取两层 |
| Decision 2 | 冷路径只接受完整 session id；标题、短名、id 后缀不解析冷会话 | `index.js :: rows()` 只映射 `ctx.agents.list()`，`pure.resolveTarget` 的输入表天然只含活会话；property: preference | 替代方案「用 `sessionController.list()` 拿全量（含冷）行」被否：`list()` 是 `@Remote` 异步方法，每次发消息都要扫一遍持久化记录；`types.ts :: SessionSummary` 没有 title 字段，标题得从 projection cache 取；用户原话只要求「用它的 session id」。本轮实测：本机 52 次真实 `send_session_message` 调用里 48 次用 8 位短名、4 次用标题、0 次用完整 id —— 故错误文案必须解释「短名不是 id」，见 Appendix 5 |
| Decision 3 | 冷路径的判定顺序固定为 白名单 → 归档 → 唤醒 → 统一尾部（子代理 → 归档复查）；归档在读失败时拒绝 | `archived-session-gate.ts :: ArchivedSessionGate` 在 `agent/pre-step` 上 `reject`，注释原话「ends as `blocked` without a request」；活路径的归档复查在 `index.js:204-213`；`index.js:190` 的白名单闸用**已解析的** `entry.id`；property: fact（gate 行为）/ preference（顺序） | 若 gate 允许 pre-step 通过，本决策的前半被否。替代方案「先唤醒再判归档与白名单」被否：先付一份内存再必然失败。替代方案「两条路径各写一套判定」被否：冷路径会与活路径的归因不一致（v1 的 R1A-06/R1A-07） |
| Decision 4 | 投递仍用活 agent 的 `followup` / `steer`，冷路径不特判 `statusBefore` / `primitive` | `agent.ts :: resumeObserved` 返回 `ctx.agents.resume(...).agent`，与 GUI 打开会话拿到的是同一类对象；`agent-loop/agent.ts` 的 maintenance 期间 `status === 'idle'`；property: fact（对象同一性、idle 状态）/ to verify（followup 立即起 turn，见 P6） | 替代方案「冷路径改用 `controller.prompt({mode:'queue'})`」被否：把两条路径拆成两套语义，`steer` 在冷路径上无从表达 |
| Decision 5 | 输出契约新增 required boolean `woke`；回执的 `name` 由 `rows()` 的别名表给出（不是另算）；同步改工具描述、`MAILBOX_PROMPT`、README；`list_sessions` 不动；版本 0.8.1 → 0.9.0 | `index.js :: send_session_message.output.schema`（五个 required 字段）+ `README.md` 工具表与「已知边界」+ `package.json` `"version": "0.8.1"`；`pure.js :: buildAliasTable` 是 `name` 的唯一来源（同基组会加长后缀）；property: preference | 若用户要求「不加字段」，则只剩 render 文本能表达唤醒，调用方无法程序化判断。替代方案「`name` 用 `id.slice(-8)`」被否：与别名表两套规则，碰撞时回执的 `name` 会解析到另一个会话（v1 的 R1A-04 实测） |
| Decision 6 | 唤醒不加自建超时、不加 `Promise.race`、不重试 | `agent.ts :: ApiSessionAgentController.resumes` 是 `Map<SessionId, Promise<Agent>>`，同 id 并发唤醒已去重；`resolveAgent(sessionId)` 没有 signal 位置；property: fact | 若真机上出现唤醒长时间不返回，按 BS-4 回来 |

### Appendix 1 · 错误码到文案的映射

`agent.ts :: ApiSessionAgentController.resolve` 的四个出口：`ApiSessionNotFound` → `RemoteError('session/not-found', …)`；`ApiSessionSubagentOwnership` / live 且 subagent → `apiSessionSubagentOwnershipError()`，code 是 **`'session/agent-busy'`**（不是独立 code），`details.reason` 是 `'use subagent delivery for this child session'`；`SessionAlreadyOwnedError` → `'session/writer-held'`；其余 → `'gateway/internal'`。`remote-error.ts :: RemoteError` 带 `readonly code` / `readonly details`，判别按 `code` + `details`，不按类名。`session/agent-busy` 在宿主里另有产生者（`prompt rejected`、`generation continuation …`），故 `wakeFailureVerdict` 用 reason 白名单而不是黑名单。property: fact。

### Appendix 2 · 不做全量预热、不缓存唤醒结果

唤醒即真装 agent，每会话一份；插件侧不留任何 woken 集合。property: preference。若调用方一次 turn 内唤醒过多会话，按 BS-3 回来。

### Appendix 3 · tag 前缀随包名，不随目录名

仓内既有 tag 是 `dsh-session-mailbox/v0.5.0 … v0.8.1`（`git tag --list` 实测），根 `README.md` 的「加新插件」第 4 步写 `<plugin-name>/v<version>` 而第 1 条要求 `package.json` 的 `name` 用 `dsh-<name>`，故 `plugin-name` 指包名。目录名 `session-mailbox` 只对应一条历史遗留 `session-mailbox/v0.4.0`。property: fact。

### Appendix 4 · `woke` 的含义是「这次调用走了冷路径」

同一 id 的并发唤醒由宿主的 `resumes` Map 去重，第二个调用方也会拿到 `woke: true`，而它其实没有唤醒任何东西。把字段定义成「走了冷路径」而不是「创建了 Agent」，两条回执都是真话。property: preference。

### Appendix 5 · 错误文案只陈述判别器知道的事

`resolveAgent` 的 `session/not-found` 有两个来源：没有转录，以及「有转录但 `header.cwd === undefined`」（`agent.ts :: resumeObserved` 首句）。冷路径另外还会收到「标称不是 id」的字符串（短名/标题）。三者共用一条 reason，故文案只说「匹配不上且唤不醒」，并把唯一可行的下一步写出来（改用完整 id）。真机实测：本机 52 次投递里 48 次用短名、4 次用标题、0 次用完整 id；720 个转录 header 全部有 `cwd`。property: fact（两个来源）/ preference（合并成一句而不是加输入形态判定：后者要新增一条正则规则，且仍无法区分 not-found 的两种内因）。

### Choice List（Decision Table 的派生视图）

- asked：无（本轮没有向 User 提问）。
- default, not asked；chose 冷路径只认完整 id，rejected `sessionController.list()` 全量解析，did not ask，because 用户原话已限定「用它的 session id」。
- default, not asked；chose 新增 required `woke`，rejected 只在 render 里说，did not ask，because 加字段有本插件先例（`statusBefore`/`primitive`）。
- default, not asked；chose `resolveAgent`，rejected 手搓 `agents.resume`，did not ask，because 前者是宿主注释写明的对外入口。
- default, not asked；chose `woke` = 「走了冷路径」，rejected = 「创建了 Agent」，did not ask，because 后者在并发唤醒下会说假话，且无法从返回值里区分。
- default, not asked；chose 错误文案合并三种 not-found 内因，rejected 加输入形态判定（正则）分两句，did not ask，because 正则仍然区分不了「无转录」与「无 cwd」，只会把两种猜测变成三种。
- fact or to verify：Decision 1 / 3 / 4 / 6 / Appendix 1 / Appendix 3 均 property: fact，destination 为 text 与「一项测试」；P6 property: to verify，destination 为 §6 第 3、4 行。

## Core Preconditions

| No. | 条件 | 状态 | 锚点与可证伪判据 |
|---|---|---|---|
| P1 | `sessionController.resolveAgent(sessionId)` 返回 `{agent}` 或 `{error}`，不抛 | proved | `index.ts :: SessionController.resolveAgent`；`agent.ts :: ApiSessionAgentController.resolve` 末尾把一切折成 `{ error: RemoteError(...) }`。判据：若在该符号里找不到 `return { error:` 分支，本条为假 |
| P2 | 冷会话 resume 自动组装 preset | proved | `agent.ts :: resumeObserved` → `composeAgent(presetForObservation(observation))` → `ctx.agents.resume(...)`。判据：若 `resumeObserved` 里没有 `composeAgent(`，本条为假 |
| P3 | 归档会话的 turn 被 gate 拒绝，唤醒它等于空转 | proved | `archived-session-gate.ts :: ArchivedSessionGate.apply` 的 `agent/pre-step` → `{ kind: 'reject' }`。判据：若 pre-step 没有 reject 分支，本条为假 |
| P4 | 插件内能拿到 `sessionController`，不需要新依赖 | proved | `index.js :: create_session.execute` 已有 `ctx.get('sessionController')`。判据：若找不到该调用，本条为假 |
| P5 | 持久化 header 无 `cwd` 的会话会被报 not-found 而不是被唤醒 | proved | `agent.ts :: resumeObserved` 首句 `if (observation.header.id !== sessionId || observation.header.cwd === undefined) throw new ApiSessionNotFound(...)`。判据：若该行没有 `header.cwd === undefined`，本条为假 |
| P6 | resume 之后立刻 `followup` 会真的起一个 turn | to verify | check：§6 第 3、4 行（转录 `# <m> records` 增长且出现 `[USER source=session-mailbox]`）；result：未跑（实现前没有可调用的新代码）。Adversarial route 从 `agent-loop/agent.ts`（maintenance 期间 idle）与 `agent-loop/index.ts`（`interruptedTurnClosers`）读出「应当成立」，仍按 to verify 保留 |

未验证清单：P6（Owner：实现方，随 Step 5 完成）。

## Route 状态

| Route | 代理 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation | r2-goal（**新代理**，未见过 v1） | 未开始 | v2 全文 + 决策半 | — |
| Operation and Evolution | r1-ops（**复用**，见过 v1） | 未开始 | 仅 Closure Table 引用的位置 + v2 全文的相关段 | 已暴露旧版本内存 |
| Adversarial | r1-adv（**复用**，见过 v1） | 未开始 | 仅 Closure Table 引用的位置 + v2 全文的相关段 | 已暴露旧版本内存 |

## 本轮变更面（v1 → v2）

- 触及的决策点：Decision 3（顺序从「归档先于唤醒」扩展成完整四段序）、Decision 5（`name` 的来源与文档同步范围）。Decision 1、2、4、6 未变。
- 新增位置（v1 在这些位置没有文本）：
  1. §4 S1 的 `coldAdmission` 函数（白名单 + 归档的纯判定，把顺序变成可单测的东西）。
  2. §4 S2 第 4.2–4.3 段（冷路径的准入判定与四条拒绝文案）。
  3. §4 S2 第 5.2 段（统一尾部里的归档复查）。
  4. §5 No-go 7 的冷路径顺序条款。
  5. §6 的三条新行（`-SimpleMatch` 的旧句清除、转录增长度量、tag 前缀）与 §8 的 BS-5。
- 删除或合并的位置（deleted ≠ 0）：
  1. 删 `coldTargetName`（v1 S1 的第二个纯函数），由 `rows()` 的别名表取代 —— 两套命名规则是 R1A-04 的根因，删掉它根因就消失。
  2. 删 v1 S2 4.2「按现有两条白名单错误原文报错」中依赖 `entry.id` 的写法（唤醒路径没有 `entry`），改为对 `<q>` 插值。
  3. 合并 v1 §6 第 6、7 行的两条 not-found/子代理错例中的重复表述。
- 为什么新增不是 0：第 1–5 条新位置各自对应一个可以被独立测到/跑到的判定，无法合并成一个位置——准入判定（纯函数）、统一尾部复查（编排顺序）、验收度量（命令形态）三者读者不同。
- 是否用新规则回答新发现：否。v2 的新位置都是**既有机制的顺序与暴露**（`coldAdmission` 只是把 v1 已经写过的两步判定搬到纯函数里让它可以单测），没有新增第三方数据源或新的状态。
- 本轮新增机制数：1（`coldAdmission` 这个纯函数），同时删除 1（`coldTargetName`）。

## Closure Table（round 1 的 29 个问题）

| Problem ID | Source route | Status | Evidence position（v2） | Next step |
|---|---|---|---|---|
| R1A-01 | Adversarial | Resolved | §3 Step 4 判据改用 `-SimpleMatch` 打两条**旧句**；§4 S4 的新句不再含 `loaded in this process`；§6 第 8 行同一写法 | - |
| R1A-02 / R1G-05 / R1O-08 | Adversarial / Goal / Operation | Resolved | §4 S2 4.6 只写一句不含内因判断的文案；§6 第 6 行按该文案断言 | - |
| R1A-03 | Adversarial | Resolved | §4 S4 的描述改成「no longer in this process 的完整 id 会被从磁盘装载」，不再断言「一定唤醒」；not-found 文案含「only when its stored transcript can be resumed」 | - |
| R1A-04 / R1G-10 | Adversarial / Goal | Resolved | §4 S2 4.7 用 `rows()` 的别名表取 `name`（删掉 `coldTargetName`）；§4 S4 README 补「`name` 只用于展示，下次用 `to`」 | - |
| R1A-05 / R1G-09 | Adversarial / Goal | Resolved | §4 S1 `coldAdmission`（白名单在前、归档在后，纯函数可单测）；§6 第 1 行的 `CASE cold-admission-order`；§4 S2 4.3 的四条文案 | - |
| R1A-06 | Adversarial | Resolved | §4 S2 第 5.2 段（统一尾部含归档复查，两条路径同文）；§5 No-go 7 | - |
| R1A-07 | Adversarial | Resolved | §5 No-go 7 明确「活路径顺序不动；冷路径固定四段序」并声明优先级 | - |
| R1A-08 | Adversarial | Resolved | §4 S1 的 `agent-busy` 改为 reason 白名单（含 `subagent delivery` 才是 subagent），其余归 `internal`；Appendix 1 | - |
| R1O-01 | Operation | Resolved | §3 Step 6 与 §6 第 9 行改为 `dsh-session-mailbox/v0.9.0`；Appendix 3 | - |
| R1O-02 | Operation | Resolved | §6 第 3 行加了「返回 `is archived` 就换下一条候选，最多 3 条，被跳过的 id 写进交付报告」 | - |
| R1O-03 | Operation | Partly resolved | 顺序已由 `coldAdmission` + `CASE cold-admission-order` 覆盖；「冷 + 归档」的真机探针仍造不出 → 转入 BS-5 | 见 BS-5 的回来条件 |
| R1O-04 / R1G-04 | Operation / Goal | Partly resolved | §6 已删掉 `list_agents` 作为 id 来源；子代理拒绝改由 `CASE wake-verdict-subagent` 在纯函数层覆盖 | 真机探针转入 BS-5 |
| R1O-05 | Operation | Resolved | §4 S4「唤醒的代价」新增「被唤醒的会话从此出现在 `list_sessions` 与其它会话的地址簿里」 | - |
| R1O-06 | Operation | Resolved | §4 S2 的「失败处理」改成「一次冷启动：读转录 + 装配 preset + publish Agent，无 signal、无超时」 | - |
| R1O-07 | Operation | Resolved | §3 Step 6 的判据收窄为 `git status --short -- plugins/session-mailbox plans/mailbox-wake`；其它未跟踪路径只写报告 | - |
| R1O-09 | Operation | Resolved | §4 S3「`execute` 只有一个返回点，必须带 `woke`」 | - |
| R1O-10 | Operation | Resolved | §4 S4 `MAILBOX_PROMPT` 新行改用 `loads it from disk`；render 尾句也用 `loaded from disk` | - |
| R1O-11 | Operation | Resolved | §4 S4 README 的「三条卸载时不会消失的事实」补第 4 条（旧会话保留旧提示词快照） | - |
| R1G-01 | Goal | Resolved | §6 第 1 行改为 `ℹ tests 39` + `ℹ fail 0` + 5 个 CASE 名逐个 `-SimpleMatch` 命中 | - |
| R1G-02 | Goal | Resolved | §6 第 8 行改用 `-SimpleMatch` 打两条旧句；Step 4 判据同一写法 | - |
| R1G-03 | Goal | Resolved | §6 第 4 行改成 `# <m> records` 增长 + `[USER source=session-mailbox]` + 每 10 秒重读最多 6 次 | - |
| R1G-06 | Goal | Resolved | §5 No-go 9 明确「验收对目标会话转录的写入是本任务授权的副作用」；§7 的停条件改成「仓库文件以外」 | - |
| R1G-07 | Goal | Resolved | §3 Step 5 与 §6 改写成「全表逐行对上」，不再给行数 | - |
| R1G-08 | Goal | Resolved | §3 Step 1 的命令改为 `test/*.test.mjs`，并与 `ℹ tests 34` 对齐 | - |

## Revision Table（round 1 → v2）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R1A-01 | Step 4 判据与 §6 第 8 行改用 `-SimpleMatch` 打两条旧句；S4 的两句新文案重写以避免旧串 | Yes（验收 + 文档文本） |
| R1A-02 / R1G-05 / R1O-08 | S2 4.6 的 not-found 文案改成一句不断言内因的话；§6 第 6 行随之改 | Yes（错误文案） |
| R1A-03 | S4 描述收窄断言；not-found 文案补「can be resumed」 | No（文档措辞 + 同一句文案） |
| R1A-04 / R1G-10 | 删 `coldTargetName`，S2 4.7 改由 `rows()` 的别名表取 `name`；README 补「用 `to`」 | Yes（机制） |
| R1A-05 / R1G-09 | 新增纯函数 `coldAdmission`，S2 4.2–4.3 由它判；§6 第 1 行加 `CASE cold-admission-order` | Yes（机制） |
| R1A-06 | S2 第 5.2 段：统一尾部加归档复查 | Yes（顺序） |
| R1A-07 | §5 No-go 7 重写并声明优先级 | No（约束措辞） |
| R1A-08 | S1 的 `agent-busy` 判定改 reason 白名单 | Yes（判定） |
| R1O-01 | Step 6 与 §6 第 9 行的 tag 改 `dsh-session-mailbox/v0.9.0` | Yes（交付命令） |
| R1O-02 | §6 第 3 行加归档回退程序 | Yes（验收） |
| R1O-03 / R1O-04 / R1G-04 | 顺序入纯函数；删 `list_agents` 来源；未决部分入 BS-5 | Yes（验收 + 盲点） |
| R1O-05 | S4「唤醒的代价」补地址簿副作用 | No（文档） |
| R1O-06 | S2 失败处理改写为「冷启动」 | No（文档） |
| R1O-07 | Step 6 的 `git status` 收窄到两条路径 | Yes（交付判据） |
| R1O-09 / R1O-10 | S3 改「唯一返回点」；prompt 与 render 改用 `loaded from disk` | No（措辞 + render） |
| R1O-11 | README 三条事实补第 4 条 | No（文档） |
| R1G-01 | §6 第 1 行改度量 | Yes（验收） |
| R1G-02 | §6 第 8 行改 `-SimpleMatch` | Yes（验收） |
| R1G-03 | §6 第 4 行改度量与等待规则 | Yes（验收） |
| R1G-06 | No-go 9 与 §7 的授权口径 | Yes（授权边界） |
| R1G-07 / R1G-08 | 计数与命令口径修正 | No（措辞） |

## 开放项 / 未决（disclosed）

| 项 | 不改的理由 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| 冷 + 归档会话的真机探针（R1O-03） | 造一条「冷且归档」的会话需要重启 Host；本机没有既能归档又能保持冷的工具面操作 | §6 第 7 行只覆盖活路径的归档拒绝；若把顺序写反（先唤醒后判归档），`CASE cold-admission-order` 仍会绿，因为它是纯函数 | 出现一次「归档会话被唤醒并付了内存」的观测（会话在 `list_sessions` 里出现且它是归档的）即转 must-change |
| 冷子代理会话的真机探针（R1O-04 / R1G-04） | 本机没有可枚举的冷子代理 session id 来源：`list_agents` 给的是路径名，`session_projcache` 不含 `origin`，`session-log.mjs` 不打印 header | §6 无该行；`CASE wake-verdict-subagent` 只覆盖错误对象到文案的映射 | 拿到一个冷子代理 id，或用户报告该分支行为异常，即转 must-change |

这两项都只影响「真机确认」，不影响实现动作；`CASE` 与 §6 第 7 行分别覆盖了它们的纯函数层与活路径层。

## 实现偏差

无（实现未开始）。

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`。本记录的 `file :: symbol` 指该包内路径。
- 本机 `node` 在 workspace-write 沙箱下无法开 stdout 管道（EPERM）；本会话已切到 danger-full-access。
- round 1 的 raw evidence（实测命令与输出）在 `archive/mailbox-wake-v1-record.md` 的「Author 对关键问题的复算」表。
