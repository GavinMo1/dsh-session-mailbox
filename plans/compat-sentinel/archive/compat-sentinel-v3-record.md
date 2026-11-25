# compat-sentinel v3 — Review Record

被评审版本：`compat-sentinel-v3.md`（v3，round 3）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（628 行，LF 归一、UTF-8，SHA256 `f4142d451cd82483a254fa8bfa48db315790677c4046286b6958f1e591bc331a`）+ 本记录的决策半（Decision Table、Appendix、Choice List、Core Preconditions）。
版本历史：v1、v2 全文与记录都在 `archive/`。v2 → v3 是 **Substantive Change**（`region` 取窗规则重定义、字段 pattern 加缩进锚、新增 6 条断言、四种 FAIL 形态、总评四分支、验收表从 15 行扩到 17 行并重排序、单元 B 的命令顺序改变），故开新版本并重跑全部 route。

## 结论

**round 3 进行中。** v2 的 round 2 结果：r1-adv（复用）2 high / 5 medium / 5 low，r2-goal（新）4 high / 12 medium / 4 low，去重后 32 条问题；其中 v1 的 30 条里有 18 条被关掉、11 条部分、1 条披露。v3 逐条处理，等 round 3 回收。

## 版本、级别与授权

- 当前版本 v3；已完成 round：2；进行中：round 3。
- 评审级别：**Standard**，route 数 2：Goal and Implementation、Adversarial。级别不变（(2) 用户可见契约与 (4) 关键决策点两判据仍不成立；未到 Deep：可逆、单新文件、无迁移）。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始（用户未放行）。

### 本轮级别复检（一行）

同一级别 Standard；本轮 scan route 是**新的** Adversarial 代理（未见过 v1/v2），reused route 是 r2-goal（它持有 round 2 的证据链）；未使用「预算用尽再加一轮」的例外（仍未使用）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 53 行断言表内嵌在 `scripts/compat-check.mjs` 里，一处维护；不做配置驱动、不拆文件 | 用户原话「后面也没啥可扩展的了」+「明确不在范围：不做大重构」；property: preference | 若第二台机器需要另一套表才划算；本仓只有一组插件（BS-4/BS-7） |
| Decision 2 | 读取 asar 只走子进程 `node scripts/asar.mjs cat`；脚本里不解析 asar 二进制、不 import `asar.mjs` | 用户硬要求复用 `scripts/asar.mjs`；`scripts/asar.mjs:68-85` 是 `cat` 的唯一入口且带 `process.exit`；property: fact | `asar.mjs` 的 CLI 形状变了 → 验收第 1 行会红 → §7 停 |
| Decision 3 | 断言默认读 `src/*.ts`；只有 A44/A45 锁 `lib/index.js` 的运行时导出 | 该安装同时带 `src/`（341 个 `src/index.ts`）与 `lib/`；AGENTS.md 以 `src` 为依据；`hostRequire` 真正解析 `exports → lib`；property: fact（两层都在）/ preference（分层） | 全量锚 lib（打包改名即假红）或 require 真机（要宿主运行时）都被否 |
| Decision 4 | 两处收敛的边界：`resolvePeer` + `liveOrThrow`；`pure.js`/`create.js`/测试不动；不做第三处 | `index.js:177-188` 与 `:282-293` 是同一段五分支的两份抄写（`found.reason ===` 8 → 4）；`list_sessions:126` 返 `[]`、`create_session` 走 `subagentVerdict`，三处语义不同；property: fact | 把顶层守卫也抽掉会把两种语义挤进一个函数（用户已否掉的扩展） |
| Decision 5 | `rename_session` 不走 `liveOrThrow`，继续走 `sessionController.resolveAgent` | `index.js:305-317` 与 README：`rename()` 要活的 `agent.session` 才能 append 事件；`liveOrThrow` 第一条就拒绝不活的 agent；property: fact | 若产品上决定「rename 只接受活会话」，本决策被否（行为变更，超授权） |
| Decision 6 | FAIL 的处理次序：先判断「DSH 变了」还是「断言写错」；放宽断言必须写进交付报告 | 哨兵的失效模式是「为了变绿而放宽」；property: preference | 若断言确实锚错了（BS-3/BS-9），放宽是正确动作——本决策要求的是记录 |
| Decision 7 | 三个纯客户端插件不进表，作为 BS-7 披露 | 用户点名范围是两个插件；扩表会改变交付规模（三个 `client.js` 共 101 KB）；property: preference | 用户要求全覆盖 → 另开一轮 |
| Decision 8（本轮重写） | `region` = `[起锚, 止锚]`：起锚在条目里必须**恰好 1 次**、止锚取起锚之后**第一个**匹配、窗口含止锚那条；锚错误判 `region-mismatch` 且**不得**退回整条目。字段 pattern 一律带 `\n` + 声明缩进（2 格或 4 格） | round 2 实测两条来源：① v2 的「第一个起锚匹配」被**声明合并**打败——在真块之前插一个同名 `interface SessionHeader` 就能让 A32 全绿；② 字段搬进嵌套对象（缩进 4 格）后 `readonly cwd?: string` 照样命中；property: fact（两种形态都能造出来）/ preference（用唯一锚 + 缩进而不是块解析） | 若某条断言需要跨多个块 → §7 停，不得升级成块解析器（No-go 10/11）。被否的替代：长正则跨块（round 1 已证贪婪会接住下一个同名符号）、括号匹配（= 块解析） |
| Decision 9（本轮新增） | 断言表的准入条件：只收「宿主改了它 → 插件**不报错**地降级」的依赖点；会当场抛错的依赖点不进表 | round 2 提了 15 个「还缺一条」的点，按这条判据筛：`Agent.id`(A48)、`AssembleContext.agent`(A49)、`relay` 契约(A50/A51)、`exec.signal` 与 `exec.agent`(A52)、`rootOf` 语义(A53)、`prompt.content`(A41) 进表；`SessionCreateValue.sessionId`、`attach-failed details`、`PromptContext.order/text`、工具 schema 方言**不进**（缺了会抛），列在 O-5；property: preference | 若用户要「所有依赖点，包括会抛错的」，本决策被否——那会让表膨胀一倍且大半是「本来就会响」的点 |

### Appendix 1 · 用户给的依赖清单里三项经核实并未被任何插件调用

`ctx.agents.resume(...)`、`ctx.agents.resolveAgent(id)`、`ctx.sessionQuery.observeSession`：`plugins/` 下 grep 均无命中；`resolveAgent` 的实际调用点是 `sessionController.resolveAgent`（A09/A43），身份校验走 `subagents.rootOf`（A23/A24/A53）。property: fact。

### Appendix 2 · 「插件里哪一行依赖它」用 site 正则现场求行号

每条断言带 `sites`，FAIL 时现场求行号；不硬编码行号。多命中时打印前 3 处 + `(+N more)`。代价：正则匹配不到 → `STALE`，与 FAIL 同等非 0 退出。property: preference。

### Appendix 3 · 退出码 0 / 1 / 2

「这个构建不附 `src`」与「插件真的会坏」不设第三个码；用总评追加段表达「哨兵无法判定」（`entry-missing` 与 `bytes === 0` 的行数合计过半时触发）。但「asar 读不了」是路径/文件问题，必须 exit 2，且不得说「不附源码」。property: preference。

### Appendix 4 · 首行打印 `dsh <name> <version>`

读 asar 根的 `package.json`（本机 `dsh-desktop-next 2.0.24-next`），只展示、不参与判定。property: preference。

### Appendix 5 · 路标放 `AGENTS.md`

`AGENTS.md` 讲的是「改完/升级后做什么」；`README.md` 讲插件清单。property: preference。

### Appendix 6 · 53 条 = v1 的 35 + round 1 的 12 + round 2 的 6

新增 6 条全部来自 round 2 的实测反例：A48（`Agent.id`）、A49（`AssembleContext.agent`）、A50（`ContextBody` 的 relay 分支）、A51（`KNOWN_FORMS` 的 `relay`）、A52（`ToolExecutionInput.agent/signal`）、A53（`rootOf` 的实现语义）。property: preference。

### Choice List（Decision Table 的派生视图）

- asked：无（本轮没有向 User 提问）。
- default, not asked；chose `region` 唯一锚 + 字段缩进锚，rejected 块解析/长正则，did not ask，because 两种替代各有一个已实测的失效面。
- default, not asked；chose 进表条件（只收静默降级），rejected 全覆盖，did not ask，because 目录里大半「会抛错」的点本来就会响，收进来只增加噪声。
- default, not asked；chose 三个客户端插件不进表，rejected 全覆盖，did not ask，because 用户点名两个插件（Decision 7）。
- default, not asked；chose `rename_session` 不接 `liveOrThrow`，did not ask，because 会打死「改冷会话标题」。
- default, not asked；chose 单元 B 先跑哨兵再打 tag，rejected 先 push 后验，did not ask，because tag 一旦推上去再回滚就是版本语义问题。

## Core Preconditions

| No. | 条件 | 状态 | 锚点 / 运行证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | 安装的 `app.asar` 里带 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `node scripts/asar.mjs list <asar> 'node_modules/@deepseek-ai/[^/]+/src/index\.ts$'` → `matched: 341`；A50 的 `.tsx` 条目也可 `cat` | 若 `list` 对 `dsh-agent/src/index\.ts` 返回 0，本条件为假 |
| P2 | 53 条 pattern（含 `region` 窗口）在当前安装上全部命中 | proved | R6：`OK: 53 rows validate on the real tree` | 若 R6 出现任一 FAIL，本条件为假 |
| P3 | 全部 `sites`（按行内 `[文件, 正则]` 对计数 70 组，其中 11 行带 `region`）在当前插件源码上可解析 | proved | R6 同一遍扫描无 `site miss` | 若出现 `site miss`，本条件为假 |
| P4 | 断言对「真改动」有判别力 | proved | R7：16 个破坏性变异全部 `MUT-RED`，含 v2 里仍绿的「字段搬进嵌套对象」与「同名块插在前面」两个形态 | 若任一变异 `MUT-STILL-GREEN`，本条件为假 |
| P5 | 两处收敛不改变任何对外行为与错误文案 | to verify | check: 验收表第 13–15 行 + `ℹ tests` 不变 | 若第 14 行任一计数不是预期，本条件为假 |
| P6 | 仓库里已有的未跟踪文件不会被误提交 | proved | `git status --porcelain` 前后都是 15 个 `.tmp-*` + `plans/` | 若出现新路径且不在 §4 S7 的 add 清单内，本条件为假 |

## Run record（隔离运行）

全部在 `%TEMP%\compat-asar\`、`%TEMP%\adv-compat\`、`%TEMP%\r2g\` 下完成；仓库内受版本控制的文件未被改动。

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R0 | 抽取 asar 内 `@deepseek-ai/**/src/*.ts` 到临时树 | `node %TEMP%\compat-asar\extract.cjs <asar> <tree>` | 0 | `extracted 2304 files` | fixture = 真实安装原样副本 |
| R1/R2 | v1 的 35 行基线 | `node table.mjs` / `verify-sites.mjs` | 0 | `all 35 rows validate` / `all sites resolve` | v1 基线 |
| R6 | v3 的 53 行 + 70 组 site | `node %TEMP%\compat-asar\table3.mjs` | 0 | `OK: 53 rows validate on the real tree` | P2/P3 proved |
| R7 | v3 的判别力（16 个变异，改的是内存副本） | 同上脚本 mutation 段 | 0 | 全部 `MUT-RED`；例：`A32 fields moved into a nested meta object (indent 4)` → `\n  readonly cwd\?: string \| … \| \n  readonly delegationDepth\?: number`；`A32 fields dropped, a same-named block inserted earlier` → `region 起锚匹配 2 次`；`A53 rootOf body replaced with return caller` → 两条 pattern 不命中 | P4 proved |
| R8 | 行外条目抽取（A44/A45 的 `lib`，A50/A51 的 `.tsx`/`projection`） | `node scripts/asar.mjs cat <asar> … <tree>\…` | 0 | 4 个条目落盘 | 运行时层与客户端层断言可验 |
| R9 | 0 字节条目 fixture 可造 | `node scripts/asar.mjs list/cat %TEMP%\zero-entry.asar …` | 0 / 0（空 stdout） | `{"total":1,"matched":1}` / 空 | 验收第 6 行可执行 |
| R10 | 指纹前后一致 | `git status --porcelain` | 0 | 始终 15 个 `.tmp-*` + `plans/` | 未改受版本控制的文件 |

## Closure Table（round 2 的 32 条）

| Problem ID | Source route | Status | Evidence position | Next step |
|---|---|---|---|---|
| R2A-01（字段搬进嵌套对象仍绿） | Adversarial | Resolved | §4 S2 字段 pattern 加缩进锚；R7 `MUT-RED A32 nested` / `A14 nested` | - |
| R2A-02 + R2G-12（`region` 锚未命中行为未定义） | Adversarial + Goal | Resolved | §4 S2 取窗规则 1/2/4（起锚恰好 1 次、锚错误判 `region-mismatch`、不得回退）；§4 S3 `region-mismatch` 块；§6 第 5 行 | - |
| R2A-03 + R2G-13（`--asar` 不存在时的消息自相矛盾） | Adversarial + Goal | Resolved | §4 S1 第 1 步拆成「不存在 → cannot locate」「存在但非文件 → is not a file」；§6 第 7/8 行各测一条 | - |
| R2A-04（`agent must not be empty` 期望 1，实际 2） | Adversarial | Resolved | §6 第 14 行期望 `2`，并注明「两个调用点各一条」 | - |
| R2A-05（Step 8 写 45 PASS） | Adversarial | Resolved | §3 Step 8 改 53；§6 第 17 行 | - |
| R2A-06（STALE-only 的总评尾句说「有接口变了」） | Adversarial | Resolved | §4 S3 总评四分支第 2 条；§6 第 3 行断言该尾句 | - |
| R2A-07（单元 B 先 push 再验） | Adversarial | Resolved | §3 Step 8 顺序 ③④⑤；§4 S7 B 部分；§6 第 17 行位置说明 | - |
| R2A-08（A47 命中两个 throw 点） | Adversarial | Unresolved（disclosed） | A47 的 `means` 已写明「两个 throw 点一起改才会红」 | O-1 |
| R2A-09 + R2G-20（记录 P3 的 site 数写 52） | Adversarial + Goal | Resolved | 本记录 P3 改为 70 组（按 `[文件, 正则]` 对计数） | - |
| R2A-10（Closure 说 Step 1 判据也加了「非注释行」） | Adversarial | Resolved | 本记录不再声称；§3 Step 3 才是那条判据 | - |
| R2A-11（A44/A45 形参假设不一致） | Adversarial | Resolved | A44/A45 都写成 `function <name>\([a-z]+\)` | - |
| R2A-12（全 0 字节构建仍说「有接口变了」） | Adversarial | Resolved | §4 S3 总评第 3 条把 `bytes === 0` 的行计入「无法判定」触发 | - |
| R2G-01（`Agent.id` 无断言） | Goal | Resolved | 新增 A48（`dsh-agent/src/types.ts`，`region: Agent`，缩进锚）；R7 `MUT-RED A48` | - |
| R2G-02（`AssembleContext.agent` 无断言） | Goal | Resolved | 新增 A49；R7 `MUT-RED A49` | - |
| R2G-03（同名块插在前面绕过 region） | Goal | Resolved | §4 S2 取窗规则 1（起锚恰好 1 次）；R7 `MUT-RED same-named block` | - |
| R2G-04（`rootOf` 语义无断言） | Goal | Resolved | 新增 A53（`manager.ts` 的实现标记：唯一活调用者检查、`return activation.root`、`return caller`）；R7 `MUT-RED A53` | - |
| R2G-05（`attach-failed` 的 `details.sessionId` 无断言） | Goal | Unresolved（disclosed） | 按 Decision 9 不进表：缺了会抛（`create failed`），不是静默降级 | O-5 |
| R2G-06（`SessionPromptRequest.content` 无断言） | Goal | Resolved | A41 增 `\n  readonly content: readonly PromptContentPart\[\]`；R7 `MUT-RED A41` | - |
| R2G-07（`SessionCreateValue.sessionId` 无断言） | Goal | Unresolved（disclosed） | 按 Decision 9 不进表：缺了会让 `gateVerdict` 抛 `session not accounted` | O-5 |
| R2G-08（`PromptContext` 字段无断言） | Goal | Unresolved（disclosed） | 同上：`order`/`text` 缺了会在装配期抛错；`interpolate` 属弱项 | O-5 |
| R2G-09（chat 侧读 relay 的两处无断言） | Goal | Resolved | 新增 A50（`ContextBody.tsx`）与 A51（`KNOWN_FORMS`）；R7 两条 `MUT-RED` | - |
| R2G-10（A38 锚在 `declare module` 增补块上） | Goal | Partly resolved | `Agent.id` 由 A48 在真声明处补上；A38 仍锚增补块（字段缩进已改 4 格） | O-2（BS-9：增补块被折叠时会假红） |
| R2G-11（`ToolExecutionInput` 的 `agent`/`signal`） | Goal | Resolved | 新增 A52（`region` 止锚用 `export type ToolExecutionMode =`，避开同名 `signal`）；R7 `MUT-RED A52` | - |
| R2G-14（验收不断言具体行号） | Goal | Resolved | §6 第 2 行要求 print 的行号等于 `Select-String` 给出的行号 | - |
| R2G-15（STALE 优先从未被造出） | Goal | Resolved | §6 第 4 行同时改坏 pattern 与 site，期望 `^STALE` 且无 `^FAIL` | - |
| R2G-16（0 字节分支无验收） | Goal | Resolved | §6 第 6 行用 `size:0` 的 fixture，断言 `0 字节（条目存在但为空）` | - |
| R2G-17（前缀式 pattern） | Goal | Resolved | A25/A28 加 `<`、A15 加 `extends Error`、A26/A29 加 `\r?\n` | - |
| R2G-18（A31 无 `region`） | Goal | Resolved | A31 带 `region: ProfileContext` + 缩进锚 | - |
| R2G-19（`isConcurrencySafe` 属静默半边） | Goal | Unresolved（disclosed） | 按 Decision 9 不进表：它不改变任何对外行为（只影响并发提示） | O-5 |
| 记录数字类（R2A-09/R2G-20/R2A-10） | 双方 | Resolved | 本记录 P3、Closure 措辞已改 | - |

小计：resolved 26、partly resolved 1、unresolved（披露）5。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R2A-01/R2G-03 | 字段 pattern 加缩进锚；`region` 起锚要求恰好 1 次 | Yes（匹配规则） |
| R2A-02/R2G-12 | 新增 `region-mismatch` 形态 + 取窗规则第 4 条（不得回退） | Yes（判定 + 输出格式） |
| R2G-01/02/04/06/09/11 | 新增 A48–A53（6 条），A41 增 `content` | Yes（表内容） |
| R2A-03/R2G-13 | §4 S1 第 1 步拆两条消息 | Yes（定位层错误路径） |
| R2A-06/R2A-12 | 总评从三分支改四分支 | Yes（输出语义） |
| R2A-07 | 单元 B 的执行顺序改成「commit → 复跑哨兵 → tag/push」 | Yes（步骤顺序） |
| R2A-04/R2A-05/R2A-11/R2G-14/15/16/17 | 验收表：计数改正、行号交叉校验、STALE 优先反例、0 字节反例、pattern 收紧 | Yes（验收项 + 表内容） |
| R2G-18 | A31 加 `region` | Yes（表内容） |
| Decision 9 + R2G-05/07/08/19 | 新增进表条件；四个「会抛错」的点披露不进表 | Yes（新增一条准入规则） |
| R2A-08/R2G-10 | 只改 `means`/登记 O-1、O-2 | No（文字与披露） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（`region` 语义重写）、新增 Decision 9（进表条件）。
2. **本轮新出现的位置**：§4 S2 的「取窗规则」四条与「字段 pattern 写法」一段、§4 S3 的 `region-mismatch` 块与总评第 2/3 分支、§4 S1 第 1 步的两条错误消息、§6 第 4/5/6/17 行。
3. **删除/合并**：删掉 v2 的「止锚要求恰好 1 次」（会误杀 `ResolvedConfig` 这类同名字段，改成「起锚唯一 + 止锚取其后第一个」）；删掉 v2 总评的「三种判定」改为四种；合并「`entry-missing` 过半」与「0 字节过半」两个条件为一条。用新规则回答的发现：1 条（Decision 9 回答「要不要把会抛错的依赖点也收进表」）；本轮新增机制数：**1**（`region` 取窗规则，属 Decision 8 的重写，不是第二个机制）。

## open items（交付时仍在的项）

| No. | 项 | 不现在改的理由 | 一条可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | A47 的两个 throw 点共用同一字符串（R2A-08） | 单独改一个 throw 点的概率极低；两处一起改名才是真实破坏 | 只改 `commands.ts:152` 那处、A47 仍绿 | 出现一次「只改一处导致 create 路径失效」 |
| O-2 | A38 锚在 `declare module` 增补块上（R2G-10 / BS-9） | 折叠增补块是内部重构，插件无损；换个锚也躲不开同类问题 | 一次纯内部重构后 A38 红而插件行为不变 | 出现一次这样的假红 |
| O-3 | 三个客户端插件的宿主 UI 接口零覆盖（BS-7） | 范围外（Decision 7） | 任一客户端插件「页面没反应但插件状态正常」 | 用户要求全覆盖 → 另开一轮 |
| O-4 | `package.json` 的 `exports` 映射未断言（BS-1 的一部分） | A44/A45 已锁真正被加载的 `lib/index.js` | `hostRequire` 解析结果与 A44 不一致 | 出现 exports 重定向导致的加载失败 |
| O-5 | 会抛错的依赖点不进表：`SessionCreateValue.sessionId`、`attach-failed details.sessionId`、`PromptContext.order/text`、工具 schema 方言、`isConcurrencySafe`（按 Decision 9） | 它们缺了会当场抛错，不是「静默失效」 | 其中任一项改了而插件**没有**报错（即表现为静默） | 出现一次静默表现 → 该点改为进表 |

## 未验证项

| 项 | 谁发现 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| P5 收敛后行为与文案不变 | Author | 收敛代码还没写（plan only） | 执行方 Step 6/7 后按 §6 第 13–15 行验 | to do during the implementation |
| 同一 commit 在另一台机器的结论 | Author | 只有一台机器 | 用户/lead 在另一台机器 `git pull` 后跑一次 | still open（BS-4） |
| 下一个 DSH 版本上表的表现 | Author | 需要新版本 | 首次真实升级 | still open（BS-1/BS-2） |
| 三个客户端插件的接口面 | r2-goal | 范围外 | 用户决定 | still open（BS-7） |

## Blind Spot List（方案里只留名称与回来条件）

| 名称 | 为什么不现在处理 | 代价 | 回来条件 |
|---|---|---|---|
| BS-1 src/lib 不同层 | 全量锚 lib 会假红；require 真机要运行时 | 只覆盖两个包的运行时导出 | `src` 未变而行为变了 |
| BS-2 构建不再附 src | 无工具能预知 | 首跑成片 entry missing | 首跑成片 entry missing |
| BS-3 常量值 | 只锁键名会漏数值语义 | 假红一次 | 只因数值变了而红 |
| BS-4 单机 | 哨兵不联网 | 两机结论可能不同 | 同一 commit 两机结论不同 |
| BS-5 客户端聊天包可能缺席 | A33/A50/A51 是用户点名要的判据 | headless 安装上常红 | 这三条在某台机器常红 |
| BS-6 文本匹配命中注释 | 排除注释要语法解析 | 注释里留旧名字时假绿 | 接口已消失而断言仍绿 |
| BS-7 三个客户端插件零覆盖 | 范围外 | 它们的宿主 API 改了没人报 | 任一插件「页面没反应」 |
| BS-8 多安装按 mtime | 读不到 profile 实际加载的那个 | 可能审到旧安装 | 结论与插件行为相反 |
| BS-9 过紧 pattern/锚假红 | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 只有 6 条有验收级反例 | 逐条反例成本高 | 个别行可能接住同名符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 需要读代码判断「静默 vs 抛错」 | 少一条/多一条断言 | 某次失效既没进表也没抛错 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation（round 1） | r1-goal | finished，本 round 不参与 | v1 | 单安装 |
| Adversarial（round 1） | r1-adv | finished | v1 | 无法跑未实现的脚本 |
| Adversarial（round 2） | r1-adv（reused） | finished | v2 + Closure | 记忆暴露（见过 v1/v2） |
| Goal and Implementation（round 2） | r2-goal（新） | finished | v2 全文 + 自建 14 个变异 | 单安装 |
| Goal and Implementation（round 3） | r2-goal（**reused**，见过 v2） | 已派发：查 Closure Table 引用的位置 + 修复是否引入新失败路径 | Closure 全表 + 本轮变更面 | 记忆暴露 |
| Adversarial（round 3） | 新代理（未见过任何旧版本） | 已派发：对 v3 全文做新问题全量扫描 | v3 全文 + 决策半 | 单安装；不能跑未实现的脚本 |

## 下一步可执行动作

等两个 route 结果回齐 → 核证 → 若需改则开 v4（v3 全文与本记录移入 `archive/`）→ 交付形态判定。
