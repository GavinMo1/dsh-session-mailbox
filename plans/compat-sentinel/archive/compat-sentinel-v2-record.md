# compat-sentinel v2 — Review Record

被评审版本：`compat-sentinel-v2.md`（v2，round 2）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（564 行，LF 归一、UTF-8，SHA256 `625af325ac073898aae3ed75dda612a4a65d564a8c9ebbb9292210ff9a80bea6`）+ 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1 全文与本记录在 `archive/`。v1 → v2 是 **Substantive Change**（新增 `region` 匹配面、10+2 条断言、读取层的三态、判定优先级、两批交付切分、验收项增删），故开新版本并重跑全部 route。

## 结论

**round 2 进行中。** v1 的 round 1 结果是「未收敛」（r1-adv 3 high / 7 medium / 7 low；r1-goal 5 high / 10 medium / 3 low，去重后 35 条问题），v2 已逐条处理，等 round 2 回收。

## 版本、级别与授权

- 当前版本 v2；已完成 round：1；进行中：round 2。
- 评审级别：**Standard**，route 数 2：Goal and Implementation、Adversarial。级别不变（v1 关：(2) 用户可见契约、(4) 决策点两判据不成立；未到 Deep：可逆、单新文件、无迁移、`app.asar` 只读）。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始（用户未放行）。
- 评审状态：round 2 派发中。

### 本轮级别复检（一行）

同一级别 Standard；本轮 scan route 是**新的** Adversarial 代理（未见过任何旧版本、只拿 v2 全文），reused route 是 r1-adv（它持有自己的证据链，只查 Closure Table 引用的位置）；未使用「预算用尽再加一轮」的例外（本 loop 仍未使用）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 47 行断言表内嵌在 `scripts/compat-check.mjs` 里，一处维护；不做配置驱动、不拆成「表 + 引擎」两文件 | 用户原话「后面也没啥可扩展的了」+「明确不在范围：不做大重构」；property: preference | 若第二台机器需要一套不同的表，配置化才划算；本仓只有一组插件，见 BS-4/BS-7 |
| Decision 2 | 读取 asar 只走子进程 `node scripts/asar.mjs cat <asar> <entry>`，脚本里不解析 asar 二进制、不 import `asar.mjs` | 用户硬要求「复用仓库已有的 `scripts/asar.mjs`」；`scripts/asar.mjs:68-85` 是 `cat` 的唯一入口，且它是带 `process.exit` 的 CLI，import 不了；property: fact | 若 `asar.mjs` 的 CLI 形状变了（第 2 个参数不再是 asarPath），验收表第 1 行会红 → §7 停下问 |
| Decision 3 | 断言对象默认是 asar 内的 `node_modules/@deepseek-ai/<pkg>/src/*.ts` 文本；**只有** A44/A45 两条锁 `lib/index.js` 的运行时导出 | 实测该安装同时带 `src/`（341 个 `src/index.ts`）与 `lib/`；AGENTS.md「宿主 API 要点」整节以 `src` 为依据；`hostRequire` 真正解析的是 `package.json` 的 `exports → lib`（v1 review R1G-09 指出），故用两条 lib 断言补上「真正被执行的那份」，其余仍用 src（lib 是打包产物，符号可合法改名，全量锚 lib 会大面积假红）；property: fact（两层都在）/ preference（分层） | 被否的替代：全量锚 `lib`（打包器改名即假红）、require 真机模块（需要宿主运行时、会触发插件加载副作用）。代价见 BS-1 |
| Decision 4 | 两处收敛的边界：抽 `resolvePeer(list, arg, selfId, text)` 与 `liveOrThrow(id)`；`lib/pure.js`、`lib/create.js`、测试文件一个字不改；不做第三处（顶层守卫不抽） | `index.js:177-188` 与 `:282-293` 是同一段五分支的两份抄写（`found.reason ===` 改前 8 次，按 §4 S5 落地后 4 次）；`:198-214` 是「活 / 非 subagent / 非归档」唯一完整三连；`list_sessions:126` 返 `[]`、`create_session:411-428` 走 `createLib.subagentVerdict`，三处语义不同；property: fact | 若把顶层守卫也抽成一个函数，`list_sessions` 的「返空数组」与 `create_session` 的「unverifiable」两种语义要挤进同一函数 → 参数化的行为差异，正是用户否掉的扩展 |
| Decision 5 | `rename_session` 不走 `liveOrThrow`，继续走 `sessionController.resolveAgent` | `index.js:305-317` 的注释与 README「改标题会唤醒冷会话」：`rename()` 要活的 `agent.session` 才能 append `session/title`；`liveOrThrow` 第一条就是 `get() === undefined` 就拒绝，套上去会打死已交付能力；property: fact | 若产品上决定「rename 也只接受活会话」，本决策被否——那是行为变更，超出本轮授权 |
| Decision 6 | FAIL 的处理次序：先判断是「DSH 变了」还是「断言写错」，只在前者才谈暂缓升级；任何对断言的放宽都必须写进交付报告 | 哨兵的失败模式是「为了变绿而放宽」：`patterns` 从 `steer\(message: UserMessage\): void` 松成 `steer\(` 就再也抓不到改名；property: preference | 若某条断言被证明锚在了会漂的东西上（BS-3/BS-9），放宽它是正确动作——本决策要求的是**记录**而不是禁止 |
| Decision 7 | 三个纯客户端插件（`blank-draft-handoff`、`dsh-input-history`、`dsh-message-editor`）的宿主 UI 接口**不进表**，作为 BS-7 披露 | 用户点名的是「`session-mailbox`，也一并纳入 `user-model`」；扩表会改变用户确认过的交付规模（三插件的 `client.js` 共 101 KB，各有一套 `ctx.slots`/`ctx.uiWorkspace` 用法）；property: preference | 若用户要求「全部五个插件都得有哨兵」，本决策被否——那需要另开一轮（每插件一张子表 + 客户端包在 asar 里的源码位置） |
| Decision 8 | 断言可带 `region: [起锚, 止锚]`，命中面取「第一个起锚匹配到其后第一个止锚匹配」之间的子串；不做块解析、不做括号匹配、不加 regex flag | round 1 实测：`SessionHeader.cwd`/`origin` 与 `CreateSessionOptions.meta` 的同名字段各出现 2 次，整文件匹配时把 SessionHeader 的字段删掉仍绿；`interface Config` 与 `ResolvedConfig` 的 `maxTitleBytes` 同理；property: fact（重复存在）/ preference（用窗口而不是解析） | 若某个断言需要跨多个块或嵌套块，当前定义就够不着 → §7 停下问，不得升级成块解析器（No-go 10）。被否的替代：把 pattern 写成含相邻字段的长正则——长度随字段位置漂移，且 `[^]*` 贪婪会跨块接住下一个同名符号（round 1 已证） |

### Appendix 1 · 用户给的依赖清单里三项经核实并未被任何插件调用

`ctx.agents.resume(...)`、`ctx.agents.resolveAgent(id)`、`ctx.sessionQuery.observeSession`：在 `plugins/` 下 grep 均无命中；`resolveAgent` 的实际调用点是 `sessionController.resolveAgent`（已由 A09/A43 覆盖），`create_session` 的身份校验走 `subagents.rootOf`（A23/A24）。property: fact。处置：不进表。

### Appendix 2 · 「插件里哪一行依赖它」用 site 正则现场求行号

每条断言带 `sites: [[文件, 正则]]`，FAIL 时才现场求行号；不硬编码行号（会腐烂，且腐烂的行号比没有更糟）。代价：正则匹配不到 → `STALE`，与 FAIL 同等非 0 退出。多命中时打印前 3 处 + `(+N more)`。property: preference。

### Appendix 3 · 退出码 0 / 1 / 2，不设「哨兵无法判定」的第三个码

「这个构建不附 `src`」与「插件真的会坏」在分类上不同，但第三个码要人多学一个分支，而人看的是总评行。折中：全部条目缺失时总评追加一段「哨兵无法判定，不等于插件会坏」；**但「asar 读不了」是另一类**——那是路径/文件问题，不是 DSH 的性质，必须 exit 2 并且不得说出「不附源码」（round 1 的 R1A-06/R1G-06 就是这条塌陷）。property: preference。

### Appendix 4 · 首行打印 `dsh <name> <version>`

读 asar 根的 `package.json`（本机 `dsh-desktop-next 2.0.24-next`）。一条 FAIL 是「这次升级带来的」还是「一直如此」，看首行就能对上 git 历史。只展示，不参与判定。property: preference。

### Appendix 5 · 路标放 `AGENTS.md`

`AGENTS.md` 是这台机器上 agent 必读的文件，讲的是「改完/升级后做什么」；`README.md` 讲插件清单与安装。一行指路放前者命中时刻。property: preference。

### Appendix 6 · 47 条断言（v1 的 35 条 + 12 条）

round 1 的两份报告一共指出 12 处「真改坏了而仍绿」的缺口，逐项对上：`tools` 服务键(A36)、`systemPrompt` 服务键(A37)、`Agent.session`/`status` 字段(A38)、`Workspace` 实体字段(A39)、`SessionCreateRequest`(A40)、`SessionPromptRequest`(A41)、标题事件载荷(A42)、`resolveAgent` 返回联合(A43)、`dsh-tools` 运行时导出(A44)、`dsh-llm` 运行时导出(A45)、`form: 'relay'`(A46)、attach 失败错误码(A47)。加这 12 条是为了让「主机改了、插件静默失效、哨兵仍绿」这条路在已识别的形态上都断掉。property: preference（选哪些形态进表）/ fact（每条都在真机上验证过命中）。

### Choice List（Decision Table 的派生视图）

- asked：无（本轮没有向 User 提问）。
- default, not asked；chose 断言默认读 `src/*.ts` + 两条锁 `lib` 导出，rejected 全量 lib 或 require 真机，did not ask，because AGENTS.md 已把「随包源码可读」当依据，而 lib 是打包产物。
- default, not asked；chose `region` 窗口，rejected 块解析器/长正则，did not ask，because round 1 已实测长正则会跨块接住同名符号。
- default, not asked；chose 三个客户端插件不进表，rejected 五插件全覆盖，did not ask，because 用户点名范围是两个插件，扩表=改交付规模（Decision 7）。
- default, not asked；chose `rename_session` 不接 `liveOrThrow`，rejected 复用，did not ask，because 会打死「改冷会话标题」。
- default, not asked；chose 两批交付（A 可单独放行），rejected 一条链一次 push，did not ask，because 用户把两处收敛叫「次要」且要求本轮不实现，主诉求不该被它拖住。
- default, not asked；chose asar 探测按 mtime 取最新，rejected 按目录名倒序，did not ask，because 目录名与「当前 profile 加载的那个」无因果（BS-8）。

## Core Preconditions

| No. | 条件 | 状态 | 锚点 / 运行证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | 当前安装的 `app.asar` 里带 `node_modules/@deepseek-ai/<pkg>/src/*.ts` 与 `lib/*.js` | proved | `node scripts/asar.mjs list <asar> 'node_modules/@deepseek-ai/[^/]+/src/index\.ts$'` → `{"total":28922,"matched":341}`，exit 0；`dsh-tools/lib/index.js`、`dsh-llm/lib/index.js` 均可 `cat` | 若 `list` 对 `'node_modules/@deepseek-ai/dsh-agent/src/index\.ts'` 返回 `matched: 0`，本条件为假 |
| P2 | 47 条 `patterns`（含 `region` 面）在**当前**安装上全部命中 | proved | 隔离运行 R6：`OK: 47 rows validate on the real tree`，exit 0 | 若重跑 R6 出现任一 `FAIL`，本条件为假 |
| P3 | 52 条 `sites` 在当前插件源码里全部命中 | proved | 隔离运行 R6 的同一遍扫描：sites 全部解析（无 `site miss`） | 若出现 `site miss`，本条件为假 |
| P4 | 断言对「真改动」有判别力（不是被同文件另一处符号接住） | proved | 隔离运行 R7：11 个破坏性变异，全部 `MUT-RED`（含 v1 里 fail-open 的 A32/A14/A04 三个） | 若任一变异仍 `MUT-STILL-GREEN`，本条件为假 |
| P5 | 两处收敛不改变任何对外行为与错误文案 | to verify | check: 验收表第 11、12、13 行 + `ℹ tests` 不变 | 若第 12 行任一计数不是预期，本条件为假 |
| P6 | 仓库里已有的未跟踪文件不会被误提交 | proved | `git status --porcelain` 前后都是 15 个 `.tmp-*` + `plans/` | 若出现新路径且不在 §4 S7 的 add 清单内，本条件为假 |

## Run record（隔离运行）

没有在仓库目录里跑任何写命令；所有验证都在 `%TEMP%\compat-asar\` 与只读读取上完成。

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R0 | 把 asar 里的 `@deepseek-ai/**/src/*.ts` 抽到临时树（副本，只读 asar） | `node %TEMP%\compat-asar\extract.cjs <asar> %TEMP%\compat-asar\tree` | 0 | `extracted 2304 files`，合计 19 798 944 字节 | fixture = 真实安装的原样副本 |
| R1 | v1 的 35 条 pattern | `node %TEMP%\compat-asar\table.mjs` | 0 | `all 35 rows validate` | v1 基线 |
| R2 | v1 的 35 条 site | `node %TEMP%\compat-asar\verify-sites.mjs` | 0 | `all sites resolve` | v1 基线 |
| R4 | 空 asar 的行为 | `node scripts/asar.mjs list %TEMP%\empty-asar-fixture.asar …` / `cat …` | 0 / 1 | `{"total":0,"matched":0}` / stderr `not found: …` | 「条目不存在」这条路可造、可判 |
| R6 | v2 的 47 条 pattern（含 `region`）+ 52 条 site | `node %TEMP%\compat-asar\table2.mjs` | 0 | `OK: 47 rows validate on the real tree` | P2/P3 proved |
| R7 | v2 的判别力（mutation suite，改的是内存里的副本） | 同上脚本的 mutation 段 | 0 | 11 条全 `MUT-RED`，例：`A32 header loses cwd/origin/delegationDepth` → `readonly cwd\?: string \| readonly origin\?: 'subagent' \| readonly delegationDepth\?: number` 不命中；`A04 AgentStatus gains a third value` → `export type AgentStatus = 'idle' \| 'running'\r?\n` 不命中 | P4 proved；v1 的三个 fail-open 关掉了 |
| R8 | 把 `dsh-tools/lib/index.js`、`dsh-llm/lib/index.js` 抽进 fixture（A44/A45 的匹配面） | `node scripts/asar.mjs cat <asar> … %TEMP%\compat-asar\tree\…` | 0 | `wrote 27559 bytes` / `wrote 109854 bytes` | 运行时层断言可验 |
| R9 | 指纹前后一致 | `git status --porcelain`（多次） | 0 | 始终是 15 个 `.tmp-*` + `plans/` | 受版本控制的文件未被验证过程改过 |

临时目录 `%TEMP%\compat-asar\` 与 `%TEMP%\empty-asar-fixture.asar`、`%TEMP%\adv-compat\`（Adversarial route 自己的 fixture）保留以便复跑。

## Closure Table

| Problem ID | Source route | Status | Evidence position | Next step |
|---|---|---|---|---|
| R1A-01 + R1G-08（同一条：整文件匹配被同文件另一处符号接住） | Adversarial + Goal | Resolved | 方案 §4 S2 A32 带 `region: SessionHeader`；Decision 8；No-go 10；R7 证据 `MUT-RED A32` | - |
| R1A-02（means 说「返回形状」但只锁签名） | Adversarial | Resolved | 新增 A40/A41/A42/A43；A21 加 `stopActivity`；A09/A11 的 means 收窄到实际断言 | - |
| R1A-03 + R1G-11（`found.reason ===` 计数自相矛盾） | Adversarial + Goal | Resolved | 方案 §3 Step 6 判据 = 4；§4 S5 末段写明「8 → 4」；§6 第 11 行 | - |
| R1A-04（A14 被 `ResolvedConfig` 接住） | Adversarial | Resolved | A14 带 `region: Config`；R7 `MUT-RED A14` | - |
| R1A-05（条目存在但为空 vs 不命中） | Adversarial | Resolved | §4 S1 三态表（`ok` 含空 stdout、`bytes: 0`）；§4 S3 `lines` 行写明「条目存在但为空」 | - |
| R1A-06 + R1G-06（坏 asar/拿错路径 → 错误结论） | Adversarial + Goal | Resolved | §4 S1 三态表第 3 行 → `asar unreadable` + exit 2；§4 S4；§6 第 4、6 行 | - |
| R1A-07（FAIL 与 STALE 同时成立时优先级未定） | Adversarial | Resolved | §4 S3 首段「先 STALE，后断言；一行一状态」；总评 `p+f+s = 47` | - |
| R1A-08（A32 site 漏 `topLevel` 的 `!==`） | Adversarial | Resolved | A32 sites 增 `origin !== 'subagent'` 与 `create.js :: header.delegationDepth` | - |
| R1A-09 + R1G-10（A14 的 site 落在 JSDoc） | Adversarial + Goal | Resolved | A14 site 改到 `index.js :: titles.rename(...)`；A13/A33 的 site 也离开 README（改到 `index.js :: titleOf` 与 `pure.js :: form: 'relay'`） | - |
| R1A-10（多命中 site 报哪一行没规则） | Adversarial | Resolved | §4 S3 `depends` 段：前 3 处 + `(+N more)` | - |
| R1A-11（A13/A33 唯一 site 在 README） | Adversarial | Resolved | 同 R1A-09 的 site 迁移 | - |
| R1A-12（`patterns: []` 恒真） | Adversarial | Resolved | §3 Step 2 判据加 `patterns: \[\]` 计数 0 | - |
| R1A-13（29/35 单 pattern 行没有兜底） | Adversarial | Partly resolved | 关键行已多条 pattern（A04/A32/A38/A39/A21/A41）；剩余单 pattern 行仍存在 | 见「open items」O-1（BS-10） |
| R1A-14 + R1G-17（搬家文案只验 4/9） | Adversarial + Goal | Resolved | §6 第 12 行覆盖 8 条 + `ambiguous session "` 计 2 | - |
| R1A-15（Step 4 要还原一个没备份的文件） | Adversarial | Resolved | §3 Step 0 增加 `compat-check.step3.mjs` 备份；Step 4 用它还原 | - |
| R1A-16 + R1G-15（探测按目录名倒序） | Adversarial + Goal | Partly resolved | §4 S1 第 3 步改按 `app.asar` mtime 倒序并打印全部候选 | 残留见 BS-8（读不到 profile 真正加载的那个） |
| R1A-17（过紧 pattern 在非破坏性改名上假红） | Adversarial | Partly resolved | BS-9 登记；不改 pattern（放松会漏真改动，Decision 6） | 见 O-2 |
| R1G-01（Step 6 打断 Step 2 的 A02 site） | Goal | Resolved | A02 site 改为 `ctx\.agents\.get\(`（改名前后的形状都命中）；§6 新增第 15 行「单元 B 之后再跑一次哨兵」；Step 8 判据指向第 9–15 行 | - |
| R1G-02（`tools` 服务键无断言） | Goal | Resolved | 新增 A36；R7 `MUT-RED A36` | - |
| R1G-03（`Agent.status` 字段无断言） | Goal | Resolved | A04 加 `readonly status: AgentStatus`；新增 A38；R7 `MUT-RED` | - |
| R1G-04（`delegationDepth` 无断言） | Goal | Resolved | A32 加 `readonly delegationDepth\?: number`（`region` 内） | - |
| R1G-05（三个客户端插件零覆盖 + 记录把「只有一个插件组」写成 fact） | Goal | Unresolved（disclosed） | Decision 7 改写为 preference 并点名三个插件；方案 §1、§8 BS-7 | 见 O-3 |
| R1G-06（请求/选项 DTO 形状） | Goal | Resolved | 新增 A40/A41；A21 加 `stopActivity`；R7 `MUT-RED A21/A41` | - |
| R1G-07（`Workspace` 实体字段） | Goal | Resolved | 新增 A39；R7 `MUT-RED A39` | - |
| R1G-09（`hostRequire` 走 `lib`，src 断言不覆盖运行时） | Goal | Partly resolved | 新增 A44/A45 锁 `lib/index.js` 的导出；Decision 3 分层写明 | `package.json` 的 `exports` 映射本身未断言 → 见 O-4 |
| R1G-12（验收不断言行号值与总评尾句） | Goal | Resolved | §6 第 2 行要求 `index\.js:\d+`；第 1、8、15 行要求总评尾句字面量 | - |
| R1G-13（`exec.signal`、attach 错码、`relay` 表单、`DefineToolOptions`、schema 方言、bundle patch） | Goal | Partly resolved | 新增 A46（`relay`）与 A47（attach 错码） | 其余四项见 O-5 |
| R1G-14（次要部分与主诉求捆成一条链、一次 push） | Goal | Resolved | §1 两批交付；Step 5 结束即报告；两次 add/commit/push；Step 8 单独 tag；No-go 11 | - |
| R1G-16（A15 断言插件并不读的符号） | Goal | Partly resolved | A15 保留（用户清单点名要 `SessionTitleInvalidError`），means 改成「按类型区分失败的能力」这一真实契约 | 见 O-6 |
| R1G-18（Step 2/3 判据只数个数与字面量存在） | Goal | Partly resolved | Step 1/2/3 判据加「非注释行」「`patterns: []` 为 0」；§6 第 2/3 行是行为反例 | 覆盖度见 BS-10（O-1） |

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R1A-01/R1G-08 | 断言可带 `region`，A32/A14/A21/A38/A39/A40/A41/A42 落在各自声明块内 | Yes（机制：新增 `region` 参数与匹配顺序） |
| R1A-02/R1G-06/R1G-07 | 新增 A39–A43，A21 加 `stopActivity`，A04 加 `status` 字段 | Yes（表内容） |
| R1A-03/R1G-11 | Step 6 判据 1 → 4；§4 S5 写明 8 → 4 | Yes（验收判据） |
| R1A-05/R1A-06/R1G-06 | `readEntry` 三态（ok/missing/error），error → `asar unreadable` + exit 2；`--asar` 要 `isFile()` | Yes（错误路径 + 退出码语义） |
| R1A-07 | §4 S3 先判 STALE、一行一状态、`p+f+s = 47` | Yes（判定顺序） |
| R1A-08 | A32 sites 增两处（`origin !== 'subagent'`、`create.js :: delegationDepth`） | Yes（site 表） |
| R1A-09/R1A-11/R1G-10 | A13/A14/A33 的 site 全部从文档/注释迁到代码行 | Yes（site 表） |
| R1A-10 | `depends` 多命中打印前 3 + `(+N more)` | Yes（输出格式） |
| R1A-12/R1G-18 | Step 2/3 判据加严（`patterns: []` 为 0、字面量须在代码行） | Yes（验收判据） |
| R1A-14/R1G-17 | §6 第 12 行覆盖 9 条文案 | Yes（验收项） |
| R1A-15 | Step 0 增加 `compat-check.step3.mjs` 备份 | Yes（步骤） |
| R1A-16/R1G-15 | 探测改按 `app.asar` mtime 倒序 + 打印全部候选 | Yes（定位顺序） |
| R1G-01 | A02 site 改 `ctx\.agents\.get\(`；§6 新增第 15 行；Step 8 判据扩到第 15 行 | Yes（site 表 + 验收项） |
| R1G-02/R1G-03/R1G-04 | 新增 A36/A38，A04 加字段 pattern，A32 加 `delegationDepth` | Yes（表内容） |
| R1G-13 | 新增 A46/A47 | Yes（表内容） |
| R1G-14 | 两批交付 + Step 5 停 + 两次提交/推送 | Yes（步骤结构与交付面） |
| R1G-05/R1G-09/R1G-16/R1A-13/R1A-17 | 不扩范围：改 Decision 的表述、登记 BS-7/BS-9/BS-10、收窄 means | No（文字与披露） |
| 全部 | 行数 35 → 47，`45`/`44` 等计数同步 | Yes（计数） |

## 变更面（本轮三件事）

1. **触及的决策点**：Decision 3（加了 lib 层两条）与新 Decision 7（客户端插件范围）、新 Decision 8（`region`）；Decision 4/5/6 未变。
2. **本轮新出现的位置**：`region` 字段与匹配顺序（§4 S2 首段 + No-go 10）、`readEntry` 三态与 `asar unreadable`（§4 S1/S4）、STALE 优先（§4 S3）、两批交付的切分（§1/§3/§4 S7）、§6 第 15 行（单元 B 后复跑）。
3. **删除/合并**：删掉 v1 的「`entry missing` 暗示不附源码」这条泛化注脚（改为只对「全部条目缺失」生效）；把 v1 的 `A13/A33` 文档 site 合并到代码 site；把 v1 的三条 FAIL 形态保留但合并了「一行同时 fail 与 stale」的分支。用新规则回答的发现：0 条（所有 round 1 发现都是落到具体断言/判据/步骤）；本轮新增机制数：**1**（`region`）。

## open items（交付时仍在的项）

| No. | 项 | 不现在改的理由 | 一条可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | 部分行仍是单 pattern，判别力靠 `region` 与经验（BS-10） | 47 行逐条做 mutation 的成本远高于收益；关键行已多 pattern | 对任意一条单 pattern 行做一次同名符号变异，若仍绿则该行必须补 pattern | 出现一次「改了接口而某条断言没红」→ 该行必须改成多条 pattern |
| O-2 | 过紧的签名 pattern 会在非破坏性改名上假红（BS-9） | 放松就会漏真改动（Decision 6）；两者只能选一个 | 一次升级里哨兵红而插件行为完全正常 | 出现一次假红 → 把该 pattern 收到「只锁调用点实际依赖的部分」 |
| O-3 | 三个客户端插件的宿主 UI 接口零覆盖（BS-7） | 用户点名范围是两个插件（Decision 7）；扩表=改交付规模 | 任一客户端插件出现「页面没反应但插件状态正常」 | 用户要求全覆盖 → 另开一轮 |
| O-4 | `package.json` 的 `exports` 映射未断言（BS-1 的一部分） | A44/A45 已经锁了真正被加载的 `lib/index.js`；再锁 exports 字段是第三条冗余 | `hostRequire` 解析结果与 A44 的断言不一致（例如 exports 指向别的文件） | 出现 exports 重定向导致的加载失败 → 补一条锁 `exports["."]` 的断言 |
| O-5 | `exec.signal`、`DefineToolOptions` 字段、工具 schema 方言、`cordis.patch.yml` 装载格式未断言 | 每加一条都要重新验证并在真机上复现；本轮已加 12 条，继续加会把表推向「全量复查」 | 任一形态改动后插件静默失效而哨兵绿 | 出现一次这样的失效 → 补对应行 |
| O-6 | A15 锁的类插件并不按类型读（只透传 message） | 用户清单点名要它；它仍是 README 写明的契约 | 插件代码里出现按 `SessionTitleInvalidError` 分类的 catch | 出现后 A15 从「弱契约」升级为硬依赖，`means` 应改写 |

## 未验证项

| 项 | 谁发现 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| P5 收敛后行为与文案不变 | Author | 收敛代码还没写（本轮 plan only） | 执行方在 Step 6/7 之后按 §6 第 11–13 行验，Author 复核 | to do during the implementation |
| 同一 commit 在另一台机器的结论 | Author | 只有一台机器装了 DSH | 用户/lead 在另一台机器 `git pull` 后跑一次 | still open（BS-4） |
| 下一个 DSH 版本上表的表现 | Author | 需要新版本可测 | 首次真实升级时 | still open（BS-1/BS-2） |
| 三个客户端插件的接口面 | r1-goal（R1G-05） | 本轮范围外 | 用户决定是否另开一轮 | still open（BS-7） |

## Blind Spot List（四项齐全；方案里只留名称与回来条件）

| 名称 | 为什么现在不处理 | 代价 | 必须把我拉回来的条件 |
|---|---|---|---|
| BS-1 src/lib 不同层 | 全量锚 lib 会因打包改名大面积假红；require 真机要宿主运行时 | 只覆盖两个包的运行时导出 | 某次升级 `src` 未变而行为变了 |
| BS-2 构建不再附 src | 无工具能预知 | 首跑成片 `entry missing` | 首跑成片 `entry missing` |
| BS-3 常量值 | 只锁键名会漏「数值语义变了」 | 假红一次 | 只因数值变了而红 |
| BS-4 单机 | 哨兵不联网 | 两机结论可能不同 | 同一 commit 两机结论不同 |
| BS-5 客户端聊天包可能缺席 | A33 是用户点名要的判据 | headless 安装上 A33 常红 | A33 在某台机器常红 |
| BS-6 文本匹配命中注释 | 排除注释要做语法解析 | 注释里留旧名字时假绿 | 接口已消失而断言仍绿 |
| BS-7 三个客户端插件零覆盖 | 范围外（Decision 7） | 它们的宿主 API 改了没人报 | 任一客户端插件「页面没反应」 |
| BS-8 多安装按 mtime | 脚本读不到「当前 profile 加载的那个」 | 可能审到旧安装 | 哨兵结论与插件行为相反 |
| BS-9 过紧 pattern 假红 | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 单 pattern 行无逐条反例 | 成本 | 个别行可能接住同名符号 | 改了接口而某条没红 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation（round 1） | r1-goal（新） | finished；**本轮不参与** | v1 全文 + 决策半 + 宿主源码 + 插件源码 | 只有一个安装可对照 |
| Adversarial（round 1） | r1-adv（新） | finished，round 2 复用 | v1 全文 + 决策半 + 自建 fixture 与 mutation | 无法运行尚未实现的脚本 |
| Adversarial（round 2） | r1-adv（**reused**，见过 v1） | 已派发：查 Closure Table 引用的位置与「修复是否引入新失败路径」 | Closure Table 全表（含 r1-goal 的项） | 记忆暴露：它见过 v1 与其结论 |
| Goal and Implementation（round 2） | 新代理（未见过任何旧版本） | 已派发：对 v2 全文做新问题全量扫描 | v2 全文 + 决策半 | 同上 |

## 下一步可执行动作

等两个 route 结果回齐 → 核证 → 若需改则开 v3（v2 全文与本记录移入 `archive/`）→ 交付形态判定（pass / partial delivery / exit without convergence）。
