# compat-sentinel v5 — Review Record

被评审版本：`compat-sentinel-v5.md`（v5，round 4）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（629 行，LF 归一、UTF-8，SHA256 `74e0a21a91aff4b7ddd21a415dccc5dbb2a617da07e7395390bbadfbe96762f4`）+ 本记录的决策半。
版本历史：v1、v2、v3、v4 全文在 `archive/`（v4 是过渡版本，见 `archive/compat-sentinel-v4-record.md`）。v3 → v5 是 **Substantive Change**：`region` 止锚改成结构性块尾、判定顺序把 `bytes === 0` 提到 `region` 之前、`missing` 的打印规则、总评第 3 分支去掉阈值、`liveOrThrow` 的 `Array.isArray` 移出 `try`、验收表第 2/6/14 行与 Step 3/8 的期望值。

## 结论

**round 4 进行中。** round 3 的两份报告（reused r2-goal：2 high / 2 medium / 4 low；新 r3-adv：3 high / 4 medium / 2 low）共 17 条，v5 逐条处理（15 resolved、2 披露）。round 4 派发中。

## 版本、级别与授权

- 当前版本 v5；已完成 round：3；进行中：round 4。
- 评审级别：**Standard**，route 数 2。级别不变。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始（用户未放行）。

### 本轮级别复检（一行）

同一级别 Standard；scan route 是新代理（未见过 v1–v5），reused route 是 r3-adv（持有 round 3 的证据链）；未使用「预算用尽再加一轮」的例外。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 53 行断言表内嵌在脚本里，一处维护；不配置化、不拆文件 | 用户原话「后面也没啥可扩展的了」；property: preference | 多套表才划算（BS-4/BS-7） |
| Decision 2 | 读取只走子进程 `node scripts/asar.mjs cat` | 用户硬要求；`asar.mjs:68-85` 是唯一入口且带 `process.exit`；property: fact | CLI 形状变了 → 验收第 1 行红 → §7 停 |
| Decision 3 | 断言默认读 `src/*.ts`；A44/A45 锁 `lib/index.js` | 安装同时带 `src/`（341 个 `index.ts`）与 `lib/`；`hostRequire` 走 `exports → lib`；property: fact / preference | 全量 lib（打包改名假红）或 require 真机（要运行时）被否 |
| Decision 4 | 两处收敛：`resolvePeer` + `liveOrThrow`；不做第三处 | `index.js:177-188` 与 `:282-293` 两份抄写；三处子代理判定语义不同；property: fact | 抽顶层守卫会把两种语义挤进一个函数 |
| Decision 5 | `rename_session` 不走 `liveOrThrow` | `rename()` 要活的 `agent.session`；property: fact | 改行为 = 超授权 |
| Decision 6 | FAIL 先判「DSH 变了 vs 断言写错」；放宽要记录 | 哨兵失效模式是「为了变绿而放宽」；property: preference | 断言真锚错时放宽是正确动作（要记录） |
| Decision 7 | 三个客户端插件不进表（BS-7） | 用户点名两个插件；扩表 = 改交付规模；property: preference | 用户要求全覆盖 → 另开一轮 |
| Decision 8（本轮再改） | `region` = `[起锚, \`\n}\`]`：起锚在条目里恰好 1 次；止锚是**声明块的结尾行**、取起锚之后第一个；窗口 = 起锚起点到止锚终点；锚错误判 `region-mismatch` 且不得回退；字段 pattern 带声明缩进 | round 3 两份报告都指向同一处：v3 的「止锚取其后第一个匹配」让窗口能被**搬出块外的同名字段**拉长（A14 甚至不用搬——同文件 `ResolvedConfig` 里本来就有一份）。v5 改回结构性止锚后，8 个「字段搬出块」变异全部变红（R7） | 若某条断言需要跨多个块 → §7 停。被否的替代：「止锚要求唯一」（会误杀 `ResolvedConfig` 这种同名字段）、块解析器（No-go 10） |
| Decision 9 | 进表条件**只约束新增行**：新依赖点若「改了会当场抛错」就不新开行；已有行与往已有行补 pattern 不受限 | round 3 指出 v3 的措辞自相矛盾（表里 12 行的 `means` 就是「会抛/会崩」）。v5 把规则限到新增行，并明确「已有行不因这条被删——它们抓的是插件根本起不来」；property: preference | 用户要求「连会抛错的也全收」→ 表会翻一倍，大半是本来就会响的点 |

### Appendix 1 · 依赖清单里三项未被调用

`ctx.agents.resume`、`ctx.agents.resolveAgent`、`ctx.sessionQuery.observeSession`：`plugins/` 下 0 命中。property: fact。

### Appendix 2 · site 行号现场求

不硬编码行号；多命中打印前 3 + `(+N more)`。property: preference。

### Appendix 3 · 退出码 0/1/2

「不附 src」用总评追加段表达（任何 `entry-missing` 或 `bytes === 0` 的行都触发，无阈值）；「asar 读不了」exit 2 且不得说「不附源码」。property: preference。

### Appendix 4 · 首行打印 dsh 版本

只展示，不参与判定。property: preference。

### Appendix 5 · 路标放 `AGENTS.md`

property: preference。

### Appendix 6 · 53 条 = 35 + 12 + 6

property: preference。

### Choice List（派生视图）

- asked：无。
- default, not asked；chose 结构性止锚 `\n}`，rejected「止锚唯一」与块解析，did not ask，because 前者误杀同名字段、后者是 No-go 10 明令禁止的。
- default, not asked；chose 判定顺序把 `bytes === 0` 提到 `region` 之前，rejected 让 region-mismatch 承担「文件是空的」这层含义，did not ask，because 空文件谈不上「锚被改名」。
- default, not asked；chose 总评第 3 分支去掉「过半」阈值，rejected 26.5 这种会在 26/27 处翻面的边界，did not ask，because 边界数字本身就是错判源。
- default, not asked；chose 第 14 行允许共享常量（`1 或 2`），rejected 死守「源码出现 2 次」，did not ask，because 那会惩罚更彻底的去重。

## Core Preconditions

| No. | 条件 | 状态 | 证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | asar 里有 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `matched: 341`；A50 的 `.tsx` 可 `cat` | 对 `dsh-agent/src/index\.ts` 返回 0 |
| P2 | 53 条 pattern 在当前安装全部命中 | proved | R6 `OK: 53 rows validate` | R6 出现任一 FAIL |
| P3 | 70 组 site 全部可解析，11 行带 `region` | proved | R6 同遍扫描 | 出现 `site miss` |
| P4 | 断言对真改动有判别力 | proved | R7：24 个变异，23 条 `MUT-RED` + 1 条标注为「文本匹配抓不到新增分支」的 accepted-green | 出现未被披露的 `MUT-STILL-GREEN` |
| P5 | 两处收敛不改变行为与文案 | to verify | 验收第 13/14/15 行 | 第 14 行期望不成立 |
| P6 | 未跟踪文件不会被误提交 | proved | `git status` 前后一致 | 出现新路径 |

## Run record（隔离运行）

全部在 `%TEMP%\compat-asar\`、`%TEMP%\adv3\`、`%TEMP%\r2g\` 完成；仓库受版本控制的文件未改动。

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R6 | v5 的 53 行 + 70 组 site | `node %TEMP%\compat-asar\verify4.mjs` | 0 | `OK: 53 rows validate (70 site pairs, 11 with region)` | P2/P3 proved |
| R7 | 24 个变异（含 8 个「字段搬出块」形态） | 同上 | 0 | `OK: 24 mutations behave as expected`；搬出块类全部 `MUT-RED`（A32/A41/A48/A39/A40/A49/A14） | P4 proved；R3G-01/R3A-01/R3A-02 关掉 |
| R9 | 0 字节 fixture | `node scripts/asar.mjs list/cat %TEMP%\zero-entry.asar …` | 0 / 0（空） | `{"total":1,"matched":1}` | 验收第 6 行可执行 |
| R10 | 指纹 | `git status --porcelain` | 0 | 15 个 `.tmp-*` + `plans/` | 未改受版本控制的文件 |

（R0–R5 见 v2/v3 记录的 run record；fixture 与临时目录未变。）

## Closure Table（round 3 的 17 条）

| Problem ID | Source route | Status | Evidence position | Next step |
|---|---|---|---|---|
| R3G-01（止锚是「被断言的字段」→ 字段搬出块后窗口拉长） | Goal（reused） | Resolved | §4 S2 规则 2 改成结构性止锚 `\n}`；R7 的 8 个「搬出块」变异全红 | - |
| R3G-02（进表条件与表内 12 行自相矛盾） | Goal | Resolved | §2 末句 + §4 S2「进表条件（只约束新增行）」+ No-go 12 + Decision 9 | - |
| R3G-03（单元 B 的测试行在 push 之后） | Goal | Resolved | §3 Step 8 ①–⑥：测试与计数（13/14/15）与复跑哨兵（17）都在 tag/push 之前，第 16 行（git 检查）在之后 | - |
| R3G-04（A52 的止锚是邻居声明） | Goal | Resolved | A52 的 `region` 止锚改成 `\n}` | - |
| R3G-05（`region-mismatch` 只定义了一种文案） | Goal | Resolved | §4 S3 三种锚错误逐条写；另把 `bytes === 0` 提到 `region` 之前，删掉这条塌陷 | - |
| R3G-06（步骤表第 4 行与 Step 4/5 的行号引用不一致） | Goal | Resolved | §3 步骤表第 4 行改成「§6 第 1–11 行」；Step 5 判据改成「第 1–12 行全绿」 | - |
| R3G-07（A53 抓不到「加一条早退」） | Goal | Unresolved（披露） | 方案 §8 BS-12；本记录 O-1 | O-1 |
| R3G-08（12 条字段 pattern 依赖缩进，整体重排会一起红） | Goal | Unresolved（披露） | 方案 §8 BS-9 已写入 | O-2 |
| R3A-01 + R3A-02（11 条 `region` 行的止锚落点） | Adversarial（新） | Resolved | 结构性止锚（同 R3G-01）；R7 覆盖其中 8 个形态（A14/A32/A41/A48/A39/A40/A49/嵌套） | - |
| R3A-03（§6 第 6 行「其余 52 行 entry missing」不可达） | Adversarial | Resolved | §6 第 6 行改成 `0 字节` 计数 3（A01/A02/A03 共用一个 entry）+ `entry missing` 计数 50 | - |
| R3A-04（第 2 行要求去转义的 `missing`，与 §4 S3「原文」冲突） | Adversarial | Resolved | §4 S3 `missing` 明确「按源码原文打印、三类输出都写原始正则」；第 2 行的期望串改成带反斜杠的原文 | - |
| R3A-05（总评第 3 分支的「过半」阈值有 26/27 空档） | Adversarial | Resolved | §4 S3 分支 3 去掉阈值：只要 `entry-missing`/`bytes===0` 的行数 > 0 就插「其中 N 行无法判定」 | - |
| R3A-06（0 字节 + `region` 塌成「锚被改名」） | Adversarial | Resolved | §4 S3 判定顺序 ③：`bytes === 0` 先判 `pattern-miss`，不取窗口 | - |
| R3A-07（第 14 行惩罚更彻底的去重） | Adversarial | Resolved | §6 第 14 行：两条共享文案的期望改成「1 或 2」，并写明共享常量也算过 | - |
| R3A-08（`archivedSessionIds is not an array` 是死分支） | Adversarial | Resolved | §4 S6 把 `Array.isArray` 移出 `try`，该文案可达 | - |
| R3A-09（Step 3 判据里「不在注释行」不可执行） | Adversarial | Resolved | §3 Step 3 给出五个词各自的 `Where-Object { $_.Line -notmatch '^\s*//' }` 命令 | - |

小计：resolved 15、unresolved（披露）2。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R3G-01/R3A-01/R3A-02 | `region` 止锚改回结构性 `\n}`；规则 2 重写 | Yes（匹配规则） |
| R3A-06 | 判定顺序新增 ③（`bytes === 0` 先判 `pattern-miss`） | Yes（判定顺序 + 输出） |
| R3A-05 | 总评第 3 分支去掉「过半」 | Yes（输出语义） |
| R3A-04 | `missing`/`site`/`region` 一律打印原始正则；第 2 行期望带反斜杠 | Yes（输出格式 + 验收项） |
| R3A-03 | 第 6 行期望改成 3 + 50 | Yes（验收项） |
| R3A-07 | 第 14 行两条文案期望改成「1 或 2」 | Yes（验收项） |
| R3G-02 | 进表条件限定为新增行；§2/No-go 12/Decision 9 同步 | Yes（规则措辞 + 准入条件） |
| R3G-03 | Step 8 顺序：测试与哨兵都在 tag/push 之前 | Yes（步骤顺序） |
| R3G-04/R3G-05/R3G-06/R3A-08/R3A-09 | A52 止锚、三种锚错误文案、步骤行号引用、`Array.isArray` 移出 `try`、Step 3 判据命令 | Yes（细节修正） |
| R3G-07/R3G-08 | 只登记 BS-12 / 更新 BS-9 | No（披露） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（第三次改写：结构性止锚）、Decision 9（限定为新增行）。
2. **本轮新出现的位置**：§4 S3 判定顺序第 ③ 步、总评第 3 分支的「其中 N 行无法判定」段、§4 S3 `missing` 的「三类输出都写原始正则」、§4 S6 的 `Array.isArray` 位置。
3. **删除/合并**：删掉「过半」阈值（并入「> 0」）、删掉 `region-mismatch` 对空文件的解释权（并入 `pattern-miss`）。用新规则回答的发现：0 条。本轮新增机制数：**0**（都是同一套判定规则内部的重排与收紧）。

## open items

| No. | 项 | 不现在改的理由 | 一条可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | A53 只锁「整段替换」，加早退仍绿（R3G-07 / BS-12） | 文本匹配抓不到新增分支；要抓就得断言调用图 | 给 `rootOf` 加一条早退、四个标记全留，A53 仍绿 | `rootOf` 判定方向在真机反转而哨兵全绿 |
| O-2 | 12 条字段 pattern 依赖缩进，整文件重排会一起红（R3G-08 / BS-9） | 去掉缩进锚就重新打开「嵌套对象」的洞 | 把某宿主文件的 interface 体整体改成 4 格缩进，12 条一起红 | 出现一次这样的假红 |
| O-3 | 三个客户端插件零覆盖（BS-7） | 范围外（Decision 7） | 任一客户端插件「页面没反应」 | 用户要求全覆盖 |
| O-4 | `exports` 映射未断言（BS-1 的一部分） | A44/A45 已锁 `lib/index.js` | `hostRequire` 结果与 A44 不一致 | 出现 exports 重定向导致的加载失败 |
| O-5 | 会抛错的依赖点不新开行（Decision 9） | 它们会当场响 | 其中任一项改了而插件**没**报错 | 出现静默表现 → 该点改为进表 |

## 未验证项

| 项 | 发现者 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| P5 收敛后行为与文案不变 | Author | 代码未写（plan only） | 执行方 Step 6/7 后按第 13–15 行验 | to do during the implementation |
| 另一台机器同 commit 结论 | Author | 只有一台机器 | 用户/lead `git pull` 后跑一次 | still open（BS-4） |
| 下一版 DSH 上表的表现 | Author | 需要新版本 | 首次升级 | still open（BS-1/BS-2） |
| 三个客户端插件接口面 | r2-goal | 范围外 | 用户决定 | still open（BS-7） |

## Blind Spot List（四项齐全；方案里只留名称与回来条件）

| 名称 | 为什么不现在处理 | 代价 | 回来条件 |
|---|---|---|---|
| BS-1 src/lib 不同层 | 全量锚 lib 假红；require 真机要运行时 | 只覆盖两包运行时导出 | `src` 未变而行为变了 |
| BS-2 构建不再附 src | 无工具能预知 | 成片 entry missing | 首跑成片 entry missing |
| BS-3 常量值 | 只锁键名漏数值语义 | 假红一次 | 只因数值变了而红 |
| BS-4 单机 | 哨兵不联网 | 两机结论可能不同 | 两机结论不同 |
| BS-5 客户端聊天包可能缺席 | 是用户点名要的判据 | headless 常红 | 三条常红 |
| BS-6 文本匹配命中注释 | 要语法解析 | 注释留旧名时假绿 | 接口消失而断言仍绿 |
| BS-7 三个客户端插件零覆盖 | 范围外 | 它们的 API 改了没人报 | 「页面没反应」 |
| BS-8 多安装按 mtime | 读不到 profile 加载的那个 | 审到旧安装 | 结论与行为相反 |
| BS-9 过紧 pattern/锚假红（含 12 条缩进锚） | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 只有 13 条有验收级反例 | 逐条反例成本高 | 个别行可能接住同名符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 要读代码判断静默 vs 抛错 | 少一条/多一条 | 某次失效既没进表也没抛错 |
| BS-12 A53 只锁整段替换 | 同上（文本匹配的边界） | 加早退抓不到 | `rootOf` 方向反转而全绿 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation（round 3） | r2-goal（reused） | finished | v3 + Closure | 记忆暴露 |
| Adversarial（round 3） | r3-adv（新） | finished | v3 全文 + 自建 fixture 与参考实现 | 不能跑未实现的脚本 |
| Adversarial（round 4） | r3-adv（**reused**） | 已派发：核 Closure + 本轮改动的反例 | Closure 全表 + 变更面 | 记忆暴露 |
| Goal and Implementation（round 4） | 新代理（未见过任何旧版本） | 已派发：对 v5 全文做新问题全量扫描 | v5 全文 + 决策半 | 单安装 |

## 下一步可执行动作

等 round 4 两份结果 → 核证 → 若仍有 must-change 则开 v6；若只剩披露项，按 §4 的交付形态判定（pass / partial delivery）。
