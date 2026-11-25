# compat-sentinel v9 — Review Record

被评审版本：`compat-sentinel-v9.md`（v9，round 8）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（688 行，LF 归一、UTF-8，SHA256 `4ffa427b5c3b97103f7eb314056bcef542cf14c1b488c569bcf60fcc2e7c7ce6`）+ 本记录的决策半。
版本历史：v1–v8 全文与本记录在 `archive/`。v8 → v9 是 **Substantive Change**：右边界统一成一条前瞻（去掉 `[`/`]`、允许行尾注释、拒绝续行并集）、3b 改成「`trimStart()` 后按更宽的声明头集合逐行匹配」、`--asar` 空值 → exit 2、内容含 `\0` → `asar unreadable`、新增运行前的表自检、断言表 61 → 62 行（A62 TextBlock；A58 改成锁成员、A60 加 `region`）、§6 第 14/15/16 行的期望值与第 6 行的计数、site 正则按当前插件代码重新锚定。

## 结论

**round 8 进行中。** round 7 两份报告（reused r6-goal：1 high / 3 medium / 5 low；新 r7-adv：3 high / 6 medium / 4 low）去重后 19 条，v9 处理：16 resolved、3 披露（其中 1 条是本轮浮现的**环境事实**，见 O-0）。round 8 派发中（已用 8 个 round，预算 10）。

## 版本、级别与授权

- 当前版本 v9；已完成 round：7；进行中：round 8。
- 评审级别：**Standard**，route 数 2。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**」。
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Standard；scan route 是新代理（未见过 v1–v9），reused route 是 r7-adv（持有 round 7 的证据链）；预算 10，已用 8。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉 / 被否的替代 |
|---|---|---|---|
| Decision 1 | 62 行断言表内嵌脚本、一处维护 | 用户原话；property: preference | 多套表才划算 |
| Decision 2 | 读取只走子进程 `node scripts/asar.mjs cat` | 用户硬要求；property: fact | CLI 变形 |
| Decision 3 | 默认读 `src/*.ts`；A44/A45 锁 `lib/index.js` | 安装同时带两层；property: fact / preference | 全量 lib 或 require 真机 |
| Decision 4 | 两处收敛：`resolvePeer` + `liveOrThrow` | 两份抄写；property: fact | 抽顶层守卫 |
| Decision 5 | `rename_session` 不走 `liveOrThrow` | `rename()` 要活的 `agent.session`；property: fact | 改行为 |
| Decision 6 | FAIL 先判「DSH 变了 vs 断言写错」 | 失效模式是「为了变绿而放宽」；property: preference | 断言真锚错时放宽要记录 |
| Decision 7 | 三个客户端插件不进表（BS-7） | 用户点名两个插件；property: preference | 用户要求全覆盖 |
| Decision 8（定稿） | `region`：起锚恰好 1 次；块尾 = 与起锚同缩进的 `}`；3b = `trimStart()` 后逐行匹配更宽的声明头集合、且缩进 ≤ 起锚缩进；**所有** pattern 用同一条右边界前瞻 `(?=[ \t]*(?:(?:\r?\n)(?!\s*\|)|//|/\*|[,;:(){}]|$))` | round 7 两份报告分别实测出：签名行续行并集仍绿（A11/A12/A18/A24）、`Agent[]→Agent[][]` 仍绿、3b 的头集合漏 `default/async/abstract/module`、字段行尾注释假红。统一前瞻同时解决四条（R7 的 32 个变异全绿） | 需要跨块 → §7 停；不得换块解析器（No-go 10） |
| Decision 9 | 进表条件只约束新增行；payload 形状单独开口（A58–A62） | 用户范围；property: preference | 用户要求全收 |
| Decision 10（本轮新增） | **不写死会漂移的基线**：Step 0 记下 `found.reason ===` 的计数作为「收敛起点」，§6 里凡依赖它的期望按起点推导 | 本仓有并发写入者：评审期间 `plugins/session-mailbox/index.js` 被别的会话从 720 行改到 799 行，`found.reason ===` 从 8 变 7、`controller.resolveAgent(entry.id)` 变成 `controller.resolveAgent(id)`，v8 的两条 site 因此失配（本轮实测） | property: fact。若实现方照抄文件里的示例数字，会得到一条恒红的验收项 |

### Appendix 1 · 依赖清单里三项未被调用（property: fact）

### Appendix 2 · site 行号现场求（多命中打印前 3 + `(+N more)`）

### Appendix 3 · 退出码 0/1/2；总评五分支；「无法判定」= 条目不存在或内容为空

### Appendix 4 · 首行打印 dsh 版本（只展示）

### Appendix 5 · 路标放 `AGENTS.md`

### Appendix 6 · 62 条 = 35 + 12 + 6 + 3 + 1 + 4 + 1

最后一条 A62 来自 round 7：A59 锁的是 `MessageBase` 三字段，而插件真正构造的 `{ type: 'text', text }` 在 `dsh-llm/src/types.ts` 的 `TextBlock` 里。

### Choice List（派生视图）

- asked：无。
- default, not asked；chose 一条统一前瞻，rejected 字段/签名两套边界，did not ask，because 两套边界在 round 7 里各自漏了一类（字段漏数组、签名漏续行并集）。
- default, not asked；chose 把 A58 从 `output: {` 改成锁成员，rejected 只锁外壳，did not ask，because 外壳改名会假红、成员改名会假绿。
- default, not asked；chose `--asar` 空值判用法错误，rejected 静默退回探测，did not ask，because 管道里变量没设时会去审另一份安装并报全绿。
- default, not asked；chose 内容含 `\0` 判 unreadable，rejected 只在退出码非 0 时判错，did not ask，because 截断的 asar 会用 NUL 补齐、`cat` 仍返回 0。

## Core Preconditions

| No. | 条件 | 状态 | 证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | asar 里有 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `matched: 341`；A50 的 `.tsx` 可 `cat` | 对 `dsh-agent/src/index\.ts` 返回 0 |
| P2 | 62 条 pattern 在当前安装全部命中 | proved | R6 `OK: 62 rows validate` | R6 出现任一 FAIL |
| P3 | 79 组 site 全部可解析，18 行带 `region` | proved | R6 同遍扫描（site 已按当前插件代码重锚） | 出现 `site miss` |
| P4 | 断言对真改动有判别力 | proved | R7：32 个变异，30 条 `MUT-RED` + 2 条标注 accepted | 出现未披露的 `MUT-STILL-GREEN` |
| P5 | 两处收敛不改变行为与文案 | to verify | 验收第 13/14/15 行（第 13 行按 Step 0 的起点推导） | 第 14 行期望不成立 |
| P6 | 未跟踪文件不会被误提交 | proved | `git status` 前后一致 | 出现新路径 |

## Run record

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R6 | v9 的 62 行 + 79 组 site | `node %TEMP%\compat-asar\verify6.mjs`（读 `assertions-v9.js`） | 0 | `OK: 62 rows validate (79 site pairs, 18 with region)` | P2/P3 proved |
| R7 | 32 个变异 | 同上 | 0 | `OK: 32 mutations behave as expected`；`A38 status → AgentStatus[]`、`A49 agent → Agent[]`、签名续行并集、A62 `text → value` 全部 `MUT-RED` | P4 proved |
| R11 | 当前插件代码的实测基线（决定 site 与验收数字） | `Select-String` 若干 | 0 | `found.reason ===`=7、`pure.resolveTarget(`=2、`liveOrThrow(`=0、`Array.isArray(archived`=2、`cannot verify the archived state of`=2、`is no longer live`=1、`agent must not be empty`=2 | Decision 10 的来源：这些数会随并发写入漂移 |

## Closure Table（round 7 的 19 条，去重后 18 行）

| Problem ID | Source | Status | Evidence position | Next step |
|---|---|---|---|---|
| R7G-01（第 14 行加引号把三项模板串打成 0） | Goal | Resolved | §6 第 14 行：三项模板串改成不带引号（并写明为什么），其余六项仍带引号 | - |
| R7G-02 + R7A-13（续行并集 / `Agent[]→Agent[][]` 仍绿） | Goal + Adversarial | Resolved | 统一前瞻的 `\r?\n(?!\s*\|)` 与「`[`/`]` 不算收尾」；R7 两条变异 `MUT-RED` | - |
| R7G-03 + R7A-02（A58 只锁 `output: {` 外壳） | Goal + Adversarial | Resolved | A58 改成锁 `schema` / `render` / `presentationMeta` / `isConcurrencySafe` 四个成员 | - |
| R7G-04 + R7A-03（`TextBlock` 零覆盖） | Goal + Adversarial | Resolved | 新增 A62（`dsh-llm/src/types.ts` 的 `TextBlock`），R7 `MUT-RED` | - |
| R7A-01（A58/A61 用签名边界断言字段） | Adversarial | Resolved | 统一前瞻对字段与签名同一口径，且不含 `[`；`description: string[]` 实测 `MUT-RED` | - |
| R7A-04（A60 无锚，兄弟声明可满足） | Adversarial | Resolved | A60 加 `region: ['export class RemoteError<', '\n}']` | - |
| R7A-05（3b 的头集合漏 `default/async/abstract/module`） | Adversarial | Resolved | 3b 的头正则补这四个关键字 | - |
| R7A-06（`--asar` 空值静默退回探测） | Adversarial | Resolved | §4 S1 第 1 条新增「`--asar` 取不到值 → exit 2」 | - |
| R7A-07（截断 asar 被判「接口变了」） | Adversarial | Resolved | 读取层新增「退出码 0 但内容含 `\0` → `asar unreadable` + exit 2」 | - |
| R7A-08（3b 作用在原行还是 trim 行未定） | Adversarial | Resolved | 3b 明写「先 `trimStart()` 再匹配」，并说明列首锚下两者等价 | - |
| R7A-09（假红面比 BS-9 宽：折行、尾逗号、行尾注释） | Adversarial | Resolved | 统一前瞻放过行尾注释与折行；尾逗号类写进 BS-9 | - |
| R7A-10（第 16 行 `0 ×6` 与 8 条命令不符） | Adversarial | Resolved | 改成 `0 ×8`，并把 `git ls-remote` 标为需网络、离线不判红 | - |
| R7A-11（第 15 行 4 条命令只给 3 个值、理由错） | Adversarial | Resolved | 第 15 行改成四项 2/1/2/2，理由改成「catch 分支与非数组分支各一句」 | - |
| R7A-12（空 `patterns: [ ]` / `sites: []` 恒 PASS） | Adversarial | Resolved | §4 S2 新增运行前的表自检（`patterns.length ≥ 1 且 sites.length ≥ 1`，否则 exit 2） | - |
| R7G-05（字段右边界不认行尾注释） | Goal | Resolved | 统一前瞻含 `//`、`/*` | - |
| R7G-06（A04 的「必须空行收尾」造成注释假红） | Goal | Resolved | A04 回到裸并集，靠统一前瞻拒绝续行成员 | - |
| R7G-07（第 16 行 commit 1 的允许集含插件路径） | Goal | Resolved | 允许集删掉 `plugins/` | - |
| R7G-08（记录账目：17 行写成 18、BS-10 计数） | Goal | Resolved | 本记录按 18 行去重后 18 行写清；BS-10 改成 28 条 | - |
| R6G-10 / O-1（宿主 `engines.dsh` 闸门未用） | 上一轮 | Unresolved（披露） | O-1 | O-1 |

**本轮浮现的环境事实（O-0）**：`plugins/session-mailbox/index.js` 在评审期间被另一个会话重写（720 → 799 行，新增 wake 路径；`found.reason ===` 8 → 7；`controller.resolveAgent(entry.id)` → `controller.resolveAgent(id)`）。v8 的两条 site 因此失配，v9 已按当前代码重锚；但**这验证了 Decision 10**：凡依赖插件行号/计数的验收项，都必须在执行时按 Step 0 的实测值推导。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R7G-02/R7A-13/R7G-05/R7A-01 | 右边界统一成一条前瞻（表内容整体变 + 规则文本） | Yes（表内容 + 规则） |
| R7A-02/R7G-03 | A58 改成锁成员 | Yes（表内容） |
| R7G-04/R7A-03 | 新增 A62 | Yes（表内容） |
| R7A-04 | A60 加 `region` | Yes（表内容） |
| R7A-05/R7A-08 | 3b 头集合 + `trimStart()` | Yes（匹配规则） |
| R7A-06/R7A-07 | `--asar` 空值、`\0` 判 unreadable | Yes（定位层/读取层） |
| R7A-12 | 表自检 | Yes（运行前检查） |
| R7G-01/R7A-10/R7A-11/R7G-07/R7G-08 | 验收行与账目 | Yes（验收项 + 记录） |
| R7G-06 | A04 回到裸并集 | Yes（表内容） |
| 环境事实 O-0 | 新增 Decision 10（基线按 Step 0 推导） | Yes（步骤措辞） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（右边界与 3b 第三次收紧）、新增 Decision 10（不写死漂移基线）。
2. **本轮新出现的位置**：§4 S2 的「运行前的表自检」、§4 S1 的 `--asar` 空值分支与 `\0` 判据、3b 的 `trimStart()`、A62。
3. **删除/合并**：删掉 v8 的两套右边界（字段 / 签名）合并成一条前瞻；A04 的空行判据删除。用新规则回答的发现：1 条（A62）；本轮新增机制数：**0**。

## open items

| No. | 项 | 不现在改的理由 | 可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-0 | **插件正被另一个会话改动**（720 → 799 行、`found.reason ===` 8 → 7、`resolveAgent` 调用点改名） | 本轮是 plan-only；且那是另一个会话的在途工作 | 执行时 Step 0 读到的 `found.reason ===` 与 §6 示例不一致 | 执行前必须重读插件；若 `resolveWake` 已把两处收敛做了，Step 6/7 需按现状改写 |
| O-1 | 宿主 `engines.dsh` 闸门未用 | 改 `package.json` 是插件改动，超出 plan-only | 一次同 minor 的破坏性升级后宿主不报警、哨兵也可能不红 | 用户要求「激活时就挡」 |
| O-2 | 假红面：块内列首 `}` 注释、块尾形态互换、声明搬进 `declare module`、折行/尾逗号 | 要语法解析 | 任一形态出现而插件正常 | 出现一次假红 |
| O-3 | A46 可被注释满足（BS-6 实例） | 文本匹配边界 | `'relay'→'relayed'` 且注释留旧写法，A46 仍绿 | relay 真不被接受而哨兵绿 |
| O-4 | A53 只锁整段替换（BS-12） | 同上 | `rootOf` 加早退，A53 仍绿 | `rootOf` 方向反转而全绿 |
| O-5 | 字段 pattern 依赖缩进 | 去掉缩进锚会重开嵌套洞 | 宿主整体重排缩进，13 条一起红 | 出现一次假红 |
| O-6 | 三个客户端插件零覆盖（BS-7） | 范围外 | 任一插件「页面没反应」 | 用户要求全覆盖 |
| O-7 | `exports` 映射未断言（BS-1） | A44/A45 已锁 lib | hostRequire 结果与 A44 不一致 | exports 重定向导致加载失败 |
| O-8 | 会抛错的依赖点不新开行（Decision 9 的排除侧） | 它们会当场响 | 其中任一项改了而插件没报错 | 出现静默表现 |

## 未验证项

| 项 | 发现者 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| P5 收敛后行为与文案不变 | Author | 代码未写 | 执行方 Step 6/7 后按第 13–15 行验 | to do during the implementation |
| 另一台机器同 commit 结论 | Author | 只有一台机器 | 用户/lead `git pull` 后跑一次 | still open（BS-4） |
| 下一版 DSH 上表的表现 | Author | 需要新版本 | 首次升级 | still open（BS-1/BS-2） |
| 三个客户端插件接口面 | r2-goal | 范围外 | 用户决定 | still open（BS-7） |
| 另一个会话正在改的插件最终形态（O-0） | Author | 在途 | 执行前重读 `plugins/session-mailbox/index.js` | still open |

## Blind Spot List（方案里只留名称与回来条件）

| 名称 | 为什么不现在处理 | 代价 | 回来条件 |
|---|---|---|---|
| BS-1 src/lib 不同层 | 全量锚 lib 假红；require 真机要运行时 | 只覆盖两包运行时导出 | `src` 未变而行为变了 |
| BS-2 构建不再附 src | 无工具能预知 | 成片 entry missing | 首跑成片 entry missing |
| BS-3 常量值 | 只锁键名漏数值语义 | 假红一次 | 只因数值变了而红 |
| BS-4 单机 | 哨兵不联网 | 两机结论可能不同 | 两机结论不同 |
| BS-5 客户端聊天包可能缺席 | 用户点名要的判据 | headless 常红 | 三条常红 |
| BS-6 文本匹配命中注释 | 要语法解析 | 注释留旧名时假绿 | 接口消失而断言仍绿 |
| BS-7 三个客户端插件零覆盖 | 范围外 | 它们的 API 改了没人报 | 「页面没反应」 |
| BS-8 多安装按 mtime | 读不到 profile 加载的那个 | 审到旧安装 | 结论与行为相反 |
| BS-9 过紧 pattern/锚假红（缩进锚、块内列首 `}`、块尾形态互换、搬进 `declare module`、折行、尾逗号） | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 只有 28 条有验收级反例；第 12 行是弱证据 | 逐条反例成本高 | 个别行可能接住同形符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 要读代码判断静默 vs 抛错 | 少一条/多一条 | 某次失效既没进表也没抛错 |
| BS-12 A53 只锁整段替换 | 文本匹配边界 | 加早退抓不到 | `rootOf` 方向反转而全绿 |
| BS-13 插件代码在评审期间被并发改动（O-0） | 那是另一个会话的在途工作 | 本文件的 site 与基线可能再次过期 | 执行时 Step 0 重读到的代码与本文件的描述不符 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation（round 7） | r6-goal（reused） | finished | v8 + Closure | 记忆暴露 |
| Adversarial（round 7） | r7-adv（新） | finished | v8 全文 + 自建 fixture | 单安装 |
| Adversarial（round 8） | r7-adv（**reused**） | 已派发：核 Closure + 本轮改动反例 | Closure 全表 + 变更面 | 记忆暴露 |
| Goal and Implementation（round 8） | 新代理（未见过 v1–v9） | 已派发：对 v9 全文做新问题全量扫描 | v9 全文 + 决策半 | 单安装 |

## 下一步可执行动作

等 round 8 两份结果 → 若只剩披露项，交付；若仍有 must-change，因预算只剩 2 个 round，把它们收进 v10 并做一次窄口径复核，然后交付。
