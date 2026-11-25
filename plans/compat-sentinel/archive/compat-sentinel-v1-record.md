# compat-sentinel v1 — Review Record

被评审版本：`compat-sentinel-v1.md`（v1，round 1）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（441 行，LF 归一、UTF-8，SHA256 `c3161cd30513d5686f78a2244f9624df890cf27752050b9b253482535c552115`）+ 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1 是首版，无 `archive/`。

## 结论

**round 1 进行中。** v1 冻结后派两个 route（Goal and Implementation、Adversarial），本轮回收结果后给出结论。

## 版本、级别与授权

- 当前版本 v1；已完成 round：0；进行中：round 1。
- 评审级别：**Standard**，route 数 2：Goal and Implementation、Adversarial。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始（用户未放行）。
- 评审状态：round 1 派发中。

### 本轮级别复检（一行）

首轮定级 Standard，本轮无级别变更；scan route 是新的 Goal and Implementation 代理（未见过任何旧版本）；未使用「预算用尽再加一轮」的例外（本 loop 该例外仍未使用）。

## 级别证据

| Light 判据 | 是否成立 | 证据 |
|---|---|---|
| (1) 可逆，错了能直接回退 | 成立 | 交付物是一个新脚本 + 两处函数搬移；`git revert` 或从 `backups/compat-sentinel-*/` 还原即可，无数据写入、无迁移 |
| (2) 不碰用户可见数据、外部行为、已发布契约 | **不成立** | 两处收敛会重排 `send_session_message` 的检查顺序；脚本的退出码与总评行是被用户当作「升级放行/暂缓」的判据来用的。这不是内部细节 |
| (3) 无迁移、无切换、无新依赖 | 成立 | 只用 `node:` 内置；脚本不写文件；不新增包（No-go 2） |
| (4) 没有会改变后续所有步骤的决策点 | **不成立** | 三个：断言读 `src` 还是 `lib`（Decision 3）、表内嵌还是配置化（Decision 1）、依赖行号硬编码还是现场求（Appendix 2）。任一反向选择都会改写全文 |

判据 (2)、(4) 不成立 → 不用 Light。不到 Deep：改动可逆、只新增一个脚本文件、无数据迁移、无切换回滚、无多人协作的运行时接口变更（`app.asar` 只读）。故 **Standard，2 route**。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 35 行断言表内嵌在 `scripts/compat-check.mjs` 里，一处维护；不做配置驱动、不拆成「表 + 引擎」两文件 | 用户原话「后面也没啥可扩展的了」+「明确不在范围：不做大重构（不拆多文件、不引入事件总线、不改成配置驱动工具表）」；property: preference | 若第二台机器需要不同的表（不同插件的仓库），配置化才划算——本仓只有一个插件组，被 BS-4 覆盖 |
| Decision 2 | 读取 asar 只走子进程 `node scripts/asar.mjs cat <asar> <entry>`，脚本里不解析 asar 二进制、不 import `asar.mjs` | 用户硬要求「复用仓库已有的 `scripts/asar.mjs`，不依赖本机是否有解包源码」；`scripts/asar.mjs:68-85` 是 `cat` 的唯一入口且 `asar.mjs` 是带顶层副作用的 CLI（`process.exit`），import 不了；property: fact | 若 `asar.mjs` 的 CLI 形状变了（第二个参数从 asarPath 变成别的），子进程调用会失效 → 验收表第 1 行会红，按 §7 停下问 |
| Decision 3 | 断言对象是 asar 内的 `node_modules/@deepseek-ai/<pkg>/src/*.ts` 文本，不是 `lib/*.js`，也不 require 真机模块 | 实测该安装同时带 `src/`（341 个 `src/index.ts`）与 `lib/`（例：`dsh-tools/lib/index.js` 27 559 字节）；AGENTS.md「宿主 API 要点」整节就是以 `src` 为依据；property: fact（两个目录都在）/ preference（选 src） | 被否的替代：① 断言 `lib/*.js` —— 那是 bundler 产物，符号可以合法改名/内联，会大面积假红（实测 `dsh-api-session-controller/lib/index.js` 保留了 `resolveAgent`，但 `defineTool` 是否出现在 `lib/index.js` 的导出列表里取决于打包器，不稳定）；② require 真机模块 —— 需要宿主运行时、会触发插件加载副作用，且 `@deepseek-ai/*` 从仓库解析不到（AGENTS.md 硬规则：裸 import 从 profile 解析不到）。代价是「src 是否存在」成了前提 → P1 + BS-1/BS-2 |
| Decision 4 | 两处收敛的边界：抽 `resolvePeer(list, arg, selfId, text)` 与 `liveOrThrow(id)`；`lib/pure.js`、`lib/create.js`、测试文件一个字不改；不做第三处（顶层守卫 `origin === 'subagent'` 不抽） | `plugins/session-mailbox/index.js:177-188` 与 `:282-293` 是同一段五分支的两份抄写（`found.reason ===` 今日计 8 次）；`:198-214` 是「活 / 非 subagent / 非归档」的唯一完整三连；`list_sessions:126` 对子代理返 `[]`、`create_session:411-428` 走 `createLib.subagentVerdict`，三处语义不同；property: fact | 若把顶层守卫也抽成一个函数，`list_sessions` 的「返空数组」与 `create_session` 的「unverifiable」两种语义就得塞进同一个函数 → 引入参数化的行为差异，正是用户否掉的「扩展」。被否的替代：只抽 `resolveTarget` 的判定结果（返回 `{ok, reason}` 让调用方自己 throw）——那样两个调用方仍然各写 5 条文案映射，重复没消失 |
| Decision 5 | `rename_session` 不走 `liveOrThrow`，继续走 `sessionController.resolveAgent` | `index.js:305-317` 的注释与 README「改标题会唤醒冷会话」：`rename()` 需要活的 `agent.session` 才能 append `session/title`，所以那条路径**故意**装载冷会话；`liveOrThrow` 的第一条就是 `get() === undefined` 就拒绝，套上去会把「改冷会话标题」这个已交付能力打死；property: fact | 若产品上决定「rename 也只接受活会话」，本决策被否；那要改 README 与工具描述，属于行为变更，超出本轮授权 |
| Decision 6 | FAIL 的处理次序：先判断是「DSH 变了」还是「断言写错」，只在前者才谈暂缓升级；任何对断言的放宽都必须写进交付报告 | 哨兵的失败模式是「为了变绿而放宽」：一条 `patterns` 从 `steer\(message: UserMessage\): void` 松成 `steer\(`，就再也抓不到 `steer` 改名；property: preference | 若某条断言被证明确实是「我们写错了」（例如锚在了会漂的常量值上，见 BS-3），放宽它就是正确动作——本决策要求的是**记录**而不是禁止 |

### Appendix 1 · 用户给的依赖清单里三项经核实并未被任何插件调用

用户表里写「`ctx.agents` 的 `resume({ resumeSessionId, agentOptions, setup })`、`resolveAgent(id)`」与「`ctx.sessionQuery.observeSession` 用于建会话前的身份校验」。实测：

- `Select-String -Path plugins\*\index.js,plugins\*\lib\*.js -Pattern 'ctx\.agents'` 只命中 `ctx.agents.list()`（`:51`）与 `ctx.agents.get(entry.id)`（`:198`）；**没有** `resume`。
- `resolveAgent` 的实际调用点是 `sessionController.resolveAgent(entry.id)`（`:309`），不是 `ctx.agents.resolveAgent` —— 已由 A09 覆盖。
- `sessionQuery` 在两个插件里 0 命中（`Select-String -Pattern 'sessionQuery'` 无输出）；`create_session` 的身份校验用的是 `ctx.get('subagents').rootOf`（A23/A24）。

property: fact。处置：这三项不进硬断言表；`sessionController.resolveAgent` 那条已在表内。若日后插件真的开始用 `resume` 或 `observeSession`，按 BS-4 式的做法补行，而不是现在为空依赖留位。

### Appendix 2 · 「插件里哪一行依赖它」用 site 正则现场求行号，不硬编码行号

每条断言带 `sites: [[文件, 正则]]`，FAIL 时才在插件文件里跑正则取当前行号。理由：硬编码行号会随插件改动腐烂，而腐烂的行号比没有行号更糟（指向错误位置）。代价：正则匹配不到时（插件改了写法）表本身过期 → 用 `STALE` 状态显式报出来，与 FAIL 同等非 0 退出。property: preference。

### Appendix 3 · 退出码只要 0 / 1 / 2，不设「哨兵无法判定」的第 3 个码

「这个构建不随包附 `src`」与「插件真的会坏」在分类上不同，但第三条码会让调用方（人）多学一个分支，而人看的是总评行。折中：全部条目缺失时总评追加一段「该 asar 可能不附 TS 源码，哨兵无法判定，不等于插件会坏」。验收表第 5 行（空 asar）锁住这句话。property: preference。

### Appendix 4 · 首行打印 `dsh <name> <version>`

读 asar 根的 `package.json`（本机为 `dsh-desktop-next 2.0.24-next`）。用途：一条 FAIL 到底是「这次升级带来的」还是「一直如此」，看首行的版本号就能对上 `git` 历史。只展示，不参与判定；读不到打印 `dsh <unknown>`，不算红。property: preference。

### Appendix 5 · 路标放 `AGENTS.md` 的「改完必须做的验证」后面

用户的目标是「`git pull` 本仓库或升级 DSH 后跑一次」。`AGENTS.md` 是这台机器上 agent 必读的文件（本仓库的硬规则都在里面），而 `README.md` 讲的是插件清单与安装。一行指路放 `AGENTS.md` 命中「升级/改完」这个时刻。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（本轮没有向 User 提问）。
- default, not asked；chose 断言读 `src/*.ts`，rejected `lib/*.js` 与 require 真机，did not ask，because AGENTS.md 已把「随包源码可读」当作既有依据，且 lib 是打包产物。
- default, not asked；chose 表内嵌单文件，rejected 配置驱动/拆两文件，did not ask，because 用户已在任务里点名排除。
- default, not asked；chose site 正则现场求行号，rejected 硬编码行号，did not ask，because 硬编码行号必然腐烂。
- default, not asked；chose 退出码 0/1/2，rejected 增加「无法判定」第 3 码，did not ask，because 人看的是总评行；用总评追加段表达。
- default, not asked；chose 三项未使用的依赖不进表，rejected 列成「占位断言」，did not ask，because 断言一个没人用的符号会把「我们依赖它」这句假话固化下来。
- default, not asked；chose `rename_session` 不接 `liveOrThrow`，rejected 让它复用，did not ask，because 会打死已交付的「改冷会话标题」。

## Core Preconditions

| No. | 条件 | 状态 | 锚点 / 运行证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | 当前安装的 `app.asar` 里带 `node_modules/@deepseek-ai/<pkg>/src/*.ts` | proved | `node scripts/asar.mjs list <asar> 'node_modules/@deepseek-ai/[^/]+/src/index\.ts$'` → `{"total":28922,"matched":341}`，exit 0 | 若 `list` 对 `'node_modules/@deepseek-ai/dsh-agent/src/index\.ts'` 返回 `matched: 0`，本条件为假 |
| P2 | 35 条 `patterns` 在**当前**安装上全部命中 | proved | 隔离运行 R1（见 Run record）：`35 PASS / 0 FAIL of 35`，exit 0 | 若重跑 R1 出现任一 `FAIL`，本条件为假（此时不是 DSH 变了就是表写错了，按 Decision 6 处理） |
| P3 | 35 条 `sites` 正则在当前插件源码里全部命中 | proved | 隔离运行 R2：`all sites resolve`，exit 0 | 若 R2 出现 `NO-MATCH`，本条件为假 |
| P4 | 两处收敛不改变任何对外行为与错误文案 | to verify | check: 验收表第 10 行（四条错误串各命中 1 次）+ 第 8 行（测试计数不变） + `found.reason ===` 由 8 降到 1 | 若第 10 行任一计数不是 1，或第 8 行的 `ℹ tests` 与基线不同，本条件为假 |
| P5 | 本机 `DSH_INSTALL_DIR` 指向 asar 本身（不是只有目录） | proved | 打印环境变量 → `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`（一个文件）；同时 `Test-Path` 为 True | 若该变量的值是一个目录，`resolveAsar()` 的第 2 步仍成立（试 `<dir>/app.asar`），故它不改变结论，只影响「先试哪条路径」 |
| P6 | 仓库里已有的未跟踪文件不会被误提交 | proved | `git status --porcelain` 当时为 15 个 `.tmp-*` + `plans/`；本记录写入后仍是这 16 项，无新增受版本控制的改动 | 若 `git status` 里出现新路径且它不在 Step 7 的 add 清单内，本条件为假 |

## Run record（隔离运行）

没有在仓库目录里跑任何写命令；所有验证都在临时目录与只读读取上完成。

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R0 | 把 2 304 个 `node_modules/@deepseek-ai/**/src/*.ts` 从 asar 抽到临时树（只读 asar，副本在 `%TEMP%\compat-asar\tree`） | `node %TEMP%\compat-asar\extract.cjs <asar> %TEMP%\compat-asar\tree` | 0 | `extracted 2304 files`，合计 19 798 944 字节 | fixture = 真实安装的原样副本 |
| R1 | 35 条 `patterns` 全部命中 | `node %TEMP%\compat-asar\table.mjs` | 0 | `all 35 rows validate (patterns + sites)`；期间修过一次 A06（`super\(ctx, 'sessionController'\)` 多要求了一个 `)`，原文是 `super(ctx, 'sessionController', { namespace: 'session' })`） | P2 proved |
| R2 | 35 条 `sites` 全部命中（针对仓库里的插件文件） | `node %TEMP%\compat-asar\verify-sites.mjs` | 0 | `all sites resolve`；例：`A05 plugins/session-mailbox/index.js:224 + :225` | P3 proved |
| R3 | 生成的表源码本身可用（把要贴进方案的 JS 字面量再 eval 回对象重跑一遍） | `node %TEMP%\compat-asar\recheck.cjs` | 0 | `35 rows, 0 problems` | 方案 §4 S2 的代码块与 R1/R2 验的是同一份内容 |
| R4 | 空 asar 的行为（验收表第 5 行的配方） | `node scripts/asar.mjs list %TEMP%\empty-asar-fixture.asar 'src/index\.ts'`；`node scripts/asar.mjs cat … 'node_modules/@deepseek-ai/dsh-agent/src/index.ts'` | 0 / 1 | `{"total":0,"matched":0}` / stderr `not found: node_modules/...` | 「条目不存在」这条路可造、可判；脚本据此走 `entry-missing` |
| R5 | 指纹前后一致 | `git status --porcelain`（R1 前后各一次） | 0 | 两次都是同样的 15 个 `.tmp-*` + `plans/` | 仓库受版本控制的文件未被任何一个验证改过 |

临时目录 `%TEMP%\compat-asar\` 保留，便于复跑；`%TEMP%\empty-asar-fixture.asar` 亦保留。

## 未验证项

| 项 | 谁发现 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| P4 收敛后行为与文案完全不变 | Author | 收敛代码还没写（本轮 plan only） | 执行方在 Step 5/6 之后按验收表第 8、10 行验，Author 复核结果 | to do during the implementation |
| 另一台机器上的同一 commit 是否同结论 | Author | 只有一台机器装了 DSH | 用户/lead 在另一台机器 `git pull` 后跑一次 | still open（BS-4） |
| 升级到下一个 DSH 版本时表会怎样 | Author | 需要一个新版本可测 | 首次真实升级时 | still open（BS-1/BS-2） |

## Blind Spot List

| 名称 | 为什么不现在处理 | 代价 | 必须把我拉回来的条件 |
|---|---|---|---|
| BS-1 断言读 `src`，运行时跑 `lib` | 要断言运行时真值就得 require 宿主模块，那会把哨兵变成「启动一次 DSH」 | `src` 与 `lib` 不同步时哨兵说绿 | 某次升级 `src` 未变而插件行为变了（或反过来） |
| BS-2 这个构建可能不再随包附 `src` | 无工具能预知下一个版本打不打包源码 | 首跑成片 `entry missing`，表等于失效 | 首跑出现成片 `entry missing` |
| BS-3 个别断言锁了常量值（`SUBAGENT_DELEGATION: 120`） | 只锁键名会漏掉「数值语义变了」的情况 | 数值合法调整时假红一次 | 只因该数值变了而红 |
| BS-4 只回答「这台机器装的 DSH」 | 哨兵不联网、不知道远端版本 | 两台机器结论可能不同 | 同一 commit 在两台机器跑出不同结论 |
| BS-5 `dsh-client-ui-chat` 只存在于桌面/Web 安装 | A33 是用户点名要的判据，不能删 | 纯 headless 安装上 A33 常态红 | A33 在某台机器上常态红 |
| BS-6 文本匹配会命中注释 | 要排除注释就得做语法解析，成本远超收益 | 注释里留着旧名字时该条假绿 | 接口已消失但断言仍绿 |

## Routes

| Route | Agent | 职责 | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|---|
| Goal and Implementation | 新（未见过任何旧版本） | 目标覆盖、事实与假设、入口点、既有机制复用、关键路径、验收项的强度 | 已派发 | 全文 + 决策半 | 只有本机一个 DSH 安装可对照；看不到另一台机器 |
| Adversarial | 新（未见过任何旧版本） | 用反例检验关键假设与失败路径：fail-open、存在/空值塌陷、falsy 合并 | 已派发 | 全文 + 决策半 | 同上；且不能运行待实现的脚本 |

## 变更面

首版，无变更面可比。

## 下一步可执行动作

等两个 route 的结果回齐 → 逐条核证 → 记 Closure Table → 若需改则开 v2（v1 全文与本记录移入 `archive/`）→ 交付形态判定（pass / partial delivery / exit without convergence）。
