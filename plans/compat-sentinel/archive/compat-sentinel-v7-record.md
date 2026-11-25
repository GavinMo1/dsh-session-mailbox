# compat-sentinel v7 — Review Record

被评审版本：`compat-sentinel-v7.md`（v7，round 6）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（654 行，LF 归一、UTF-8，SHA256 `20de084531bd68a8513bdf446b365d82e63781c90f227225dba125d5ed8044eb`）+ 本记录的决策半。
版本历史：v1–v6 全文与本记录在 `archive/`。v6 → v7 是 **Substantive Change**：`region` 新增第 3b 条归属校验（窗口里不得出现第二个声明头）、字段 pattern 全部加右边界、空条目的 `lines` 统一成一句、总评第 3/5 分支补 STALE 尾巴、`liveOrThrow` 的 `Array.isArray` 守卫进验收、断言表 56 → 57 行（A57 = attach 失败 payload 的运行时构造处；A21 补 `WorkspaceActiveSessionError` 抛点）、§6 第 6/14/15/16 行的期望值、Step 0 的 asar 解析、Step 7/§4 S6 改成按符号定位。

## 结论

**round 6 进行中。** round 5 两份报告（新 r5-adv：1 high / 4 medium / 2 low；reused r4-goal：2 high / 3 medium / 5 low）去重后 19 条，v7 处理：16 resolved、3 披露。round 6 派发中。

## 版本、级别与授权

- 当前版本 v7；已完成 round：5；进行中：round 6。
- 评审级别：**Standard**，route 数 2。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Standard；scan route 是新代理（未见过 v1–v7），reused route 是 r5-adv（持有 round 5 的证据链）；预算 10 个 round，已用 5，未使用「预算用尽再加一轮」的例外。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉 / 被否的替代 |
|---|---|---|---|
| Decision 1 | 57 行断言表内嵌脚本、一处维护 | 用户原话「后面也没啥可扩展的了」；property: preference | 多套表才划算 |
| Decision 2 | 读取只走子进程 `node scripts/asar.mjs cat` | 用户硬要求；`asar.mjs:68-85`；property: fact | CLI 变形 → 第 1 行红 |
| Decision 3 | 默认读 `src/*.ts`；A44/A45 锁 `lib/index.js` | 安装同时带两层；`hostRequire` 走 exports→lib；property: fact / preference | 全量 lib 或 require 真机 |
| Decision 4 | 两处收敛：`resolvePeer` + `liveOrThrow` | 两份抄写；三处子代理判定语义不同；property: fact | 抽顶层守卫 |
| Decision 5 | `rename_session` 不走 `liveOrThrow` | `rename()` 要活的 `agent.session`；property: fact | 改行为 |
| Decision 6 | FAIL 先判「DSH 变了 vs 断言写错」 | 失效模式是「为了变绿而放宽」；property: preference | 断言真锚错时放宽是正确动作（要记录） |
| Decision 7 | 三个客户端插件不进表（BS-7） | 用户点名两个插件；property: preference | 用户要求全覆盖 |
| Decision 8（第 5 次定稿） | `region`：起锚恰好 1 次；块尾 = 与起锚同缩进的 `}`，取其后第一个；窗口 = 起点到止锚终点；**窗口内不得出现第二个声明头**（3b）；锚错误 / 3b 失败判 `region-mismatch`；字段 pattern 带缩进锚 + 右边界 | round 5 两份报告各实测一条残余：①块尾形态变了就改锚到下一个声明（T7：字段已搬出块仍 PASS）；②字段只有左缩进锚，`T \| undefined`、`T \| 'paused'` 这类类型放宽是前缀命中。v7 加 3b 与右边界后，两种输入都变红（R7） | 若断言需要跨多个块 → §7 停；不得换成块解析器（No-go 10） |
| Decision 9 | 进表条件只约束新增行 | 用户范围 + 会抛错的点本来就响；property: preference | 用户要求全收 |

### Appendix 1 · 依赖清单里三项未被调用

`ctx.agents.resume`、`ctx.agents.resolveAgent`、`ctx.sessionQuery.observeSession`：0 命中。property: fact。

### Appendix 2 · site 行号现场求（多命中打印前 3 + `(+N more)`）

### Appendix 3 · 退出码 0/1/2；「无法判定」用总评五分支表达（第 3 分支 = 全部不可判定）

### Appendix 4 · 首行打印 dsh 版本（只展示）

### Appendix 5 · 路标放 `AGENTS.md`

### Appendix 6 · 57 条 = 35 + 12 + 6 + 3 + 1

最后一条 A57 来自 round 5：A55 锁的是 `types.ts` 里的**声明**，而插件读的是 `commands.ts` 现造的**值**，两层都要锁。

### Choice List（派生视图）

- asked：无。
- default, not asked；chose 窗口里禁止第二个声明头（3b），rejected 只靠「块尾同缩进」、did not ask，because 块尾形态一变就改锚，实测字段搬出块仍绿。
- default, not asked；chose 字段 pattern 加右边界，rejected 只靠左缩进锚，did not ask，because 类型放宽是另一种「接口变了」。
- default, not asked；chose 第 14 行要求 2 并禁止共享常量，rejected「1 或 2」，did not ask，because 后者无法区分「共享」与「一处被清空」。
- default, not asked；chose 第 16 行钉 sha，rejected `HEAD~1`/`-3` 这类位置写法，did not ask，because 本仓库有并发写入者。

## Core Preconditions

| No. | 条件 | 状态 | 证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | asar 里有 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `matched: 341`；A50 的 `.tsx` 可 `cat` | 对 `dsh-agent/src/index\.ts` 返回 0 |
| P2 | 57 条 pattern 在当前安装全部命中 | proved | R6 `OK: 57 rows validate` | R6 出现任一 FAIL |
| P3 | 74 组 site 全部可解析，13 行带 `region` | proved | R6 同遍扫描 | 出现 `site miss` |
| P4 | 断言对真改动有判别力 | proved | R7：32 个变异，30 条 `MUT-RED` + 2 条标注 accepted | 出现未披露的 `MUT-STILL-GREEN` |
| P5 | 两处收敛不改变行为与文案 | to verify | 验收第 13/14/15 行 | 第 14 行期望不成立 |
| P6 | 未跟踪文件不会被误提交 | proved | `git status` 前后一致 | 出现新路径 |

## Run record

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R6 | v7 的 57 行 + 74 组 site | `node %TEMP%\compat-asar\verify6.mjs`（读 `assertions-v7.js`） | 0 | `OK: 57 rows validate (74 site pairs, 13 with region)` | P2/P3 proved；3b 在真机上无假红（没有窗口跨声明头） |
| R7 | 32 个变异 | 同上 | 0 | `OK: 32 mutations behave as expected`；新增的「类型放宽 ×4」「块尾改形态 + 字段搬出」「A21 抛点消失」「A57 payload 改形」全 `MUT-RED` | P4 proved |
| R8/R10 | fixture 与指纹 | `asar.mjs list/cat`、`git status` | 0 | 与 v6 同 | 未改受版本控制的文件 |

## Closure Table（round 5 的 19 条，去重后 16 行）

| Problem ID | Source | Status | Evidence position | Next step |
|---|---|---|---|---|
| R5A-01 + R5G-01（§6 第 6 行三个数字互斥） | Adversarial + Goal | Resolved | 第 6 行改成 `（条目存在但为空）`=3、`entry missing`=54、`哨兵无法判定：57 行`（57 行表下 3 + 54 = 57） | - |
| R5A-02（块尾不校验归属 → 窗口改锚仍 PASS） | Adversarial | Resolved | §4 S2 新增 3b（窗口内不得出现第二个声明头）+ `region-mismatch` 第四种文案；R7 的「块尾改形态 + 字段搬出」`MUT-RED` | - |
| R5A-03（字段 pattern 无右边界 → 类型放宽仍 PASS） | Adversarial | Resolved | 全部字段类 pattern 追加右边界 `(?:\r?\n\|\s*\{\|\s*[,;]\|$)`；R7 四条放宽变异全 `MUT-RED` | - |
| R5A-04 + R5G-02（空条目 `lines` 三处不一致） | Adversarial + Goal | Resolved | §4 S3 ③ 与 `lines` 说明与 §6 第 6 行统一成 `匹配面：整个条目，<bytes> 字节（条目存在但为空）` | - |
| R5A-05（第 14 行「1 或 2」放行丢失的文案） | Adversarial | Resolved | 第 14 行要求 2 与 2；§4 S5 明写「两处各写一遍、不得提成共享常量」 | - |
| R5A-06（Step 0 把目录交给 `asar.mjs`） | Adversarial | Resolved | Step 0 先解析成 asar 文件（`Test-Path …\resources\app.asar` / `-PathType Leaf`），再探测 | - |
| R5A-07（有 STALE 时第 3 分支不提它） | Adversarial | Resolved | 总评第 3、5 分支在 `s > 0` 时追加「（另有 <s> 行 STALE…）」 | - |
| R5G-03（A55 只锁声明层，运行时 payload 无断言） | Goal | Resolved | 新增 A57（`commands.ts` 的 `{ sessionId, workspaceId: workspace.id }`）；R7 `MUT-RED` | - |
| R5G-04（A21 只锁返回类型，「不再抛」仍静默） | Goal | Resolved | A21 补 `throw new WorkspaceActiveSessionError\(sessionId, activity\)`；R7 `MUT-RED` | - |
| R5G-05（第 16 行依赖「无并发提交」，且配方缺 `git show`） | Goal | Resolved | 第 16 行改成钉 `<commit-1-sha>` + `git show --stat --oneline HEAD`；§7 增一条「因第三方提交变红 → 记录后按 sha 复核，不算交付失败」 | - |
| R5G-06（两分支同文案后 `Array.isArray` 守卫不可验） | Goal | Resolved | §6 第 15 行新增 `(Select-String -Pattern 'Array\.isArray\(archived\)').Count` = 1 | - |
| R5G-07（块尾是冻结字面量，声明搬进 `declare module` 即假红） | Goal | Unresolved（披露） | §8 BS-9 已写入「两块尾形态互换 / 声明被整体搬进 `declare module`」 | O-1 |
| R5G-08（记录本账不平：14 行 vs 15 行） | Goal | Resolved | 本记录 Closure 段写明「19 条去重后 16 行」，并在 Revision Table 里给出映射 | - |
| R5G-09（BS-10 未落地「第 12 行是弱证据」） | Goal | Resolved | §8 BS-10 补了这句 | - |
| R5G-10（Step 7 / §4 S6 的「198–214 行」已漂移） | Goal | Resolved | 两处改成按符号定位，并写明「行号会随并发提交漂移」 | - |
| R4A-06 / R4G-08 / R4G-09 的披露（块内列首 `}` 假红、A46 注释命中） | 上一轮 | Unresolved（披露） | §8 BS-9 / BS-6 | O-1 / O-2 |

小计：resolved 14（含上轮遗留的 1 条）、unresolved 3（其中 2 条是上一轮就披露的）。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R5A-01/R5G-01 | 第 6 行的三个计数 | Yes（验收项） |
| R5A-02 | 3b 归属校验 + 第四种 `region-mismatch` 文案 | Yes（匹配规则 + 输出） |
| R5A-03 | 字段 pattern 加右边界（表内容整体变） | Yes（表内容） |
| R5A-04/R5G-02 | 空条目 `lines` 统一 | Yes（输出文案） |
| R5A-05 | 第 14 行要求 2；§4 S5 禁止共享常量 | Yes（验收项 + 步骤约束） |
| R5A-06/R5G-05/R5G-10 | Step 0 解析、第 16 行钉 sha、Step 7/§4 S6 按符号定位 | Yes（步骤） |
| R5A-07 | 第 3/5 分支补 STALE 尾巴 | Yes（输出语义） |
| R5G-03/R5G-04/R5G-06 | 新增 A57、A21 补抛点、第 15 行加守卫计数 | Yes（表内容 + 验收项） |
| R5G-07/R5G-08/R5G-09 | BS-9/BS-10 措辞与本记录的数字 | No（披露与账目） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（加 3b 与右边界）。
2. **本轮新出现的位置**：§4 S2 规则 3b、`region-mismatch` 第四种文案、§6 第 15 行的 `Array.isArray` 计数、§7 的「第三方提交」条目、A57。
3. **删除/合并**：删掉「第 14 行允许 1 或 2」的容忍度；把「空条目 `lines`」三处写法合并成一句。用新规则回答的发现：1 条（第 14 行改成硬性 2）；本轮新增机制数：**0**（3b 与右边界都属 Decision 8 同一机制的收紧）。

## open items

| No. | 项 | 不现在改的理由 | 可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | 假红面：块内列首 `}` 注释、两种块尾形态互换、声明整体搬进 `declare module` | 要分辨注释/声明得做语法解析；方向是假红 | 任一形态出现而插件行为正常 | 出现一次这样的假红 |
| O-2 | A46 可被注释满足（BS-6 实例） | 文本匹配边界 | `'relay'`→`'relayed'` 且注释留旧写法，A46 仍绿 | relay 真不被接受而哨兵绿 |
| O-3 | A53 只锁整段替换（BS-12） | 同上 | `rootOf` 加早退、四个标记全留，A53 仍绿 | `rootOf` 方向反转而全绿 |
| O-4 | 12 条字段 pattern 依赖缩进 | 去掉缩进锚会重开嵌套的洞 | 宿主整体重排缩进，12 条一起红 | 出现一次这样的假红 |
| O-5 | 三个客户端插件零覆盖（BS-7） | 范围外 | 任一插件「页面没反应」 | 用户要求全覆盖 |
| O-6 | `exports` 映射未断言（BS-1） | A44/A45 已锁 lib | hostRequire 结果与 A44 不一致 | 出现 exports 重定向导致的加载失败 |
| O-7 | 会抛错的依赖点不新开行（Decision 9） | 它们会当场响 | 其中任一项改了而插件没报错 | 出现静默表现 |

## 未验证项

| 项 | 发现者 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| P5 收敛后行为与文案不变 | Author | 代码未写 | 执行方 Step 6/7 后按第 13–15 行验 | to do during the implementation |
| 另一台机器同 commit 结论 | Author | 只有一台机器 | 用户/lead `git pull` 后跑一次 | still open（BS-4） |
| 下一版 DSH 上表的表现 | Author | 需要新版本 | 首次升级 | still open（BS-1/BS-2） |
| 三个客户端插件接口面 | r2-goal | 范围外 | 用户决定 | still open（BS-7） |

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
| BS-9 过紧 pattern/锚假红（缩进锚、块内列首 `}`、块尾形态互换、声明搬进 `declare module`） | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 只有 23 条有验收级反例；第 12 行是弱证据 | 逐条反例成本高 | 个别行可能接住同形符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 要读代码判断静默 vs 抛错 | 少一条/多一条 | 某次失效既没进表也没抛错 |
| BS-12 A53 只锁整段替换 | 文本匹配边界 | 加早退抓不到 | `rootOf` 方向反转而全绿 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Adversarial（round 5） | r5-adv（新） | finished | v6 全文 + 自建 fixture/参考实现 | 单安装 |
| Goal and Implementation（round 5） | r4-goal（reused） | finished | v6 + Closure | 记忆暴露 |
| Adversarial（round 6） | r5-adv（**reused**） | 已派发：核 Closure + 本轮改动反例 | Closure 全表 + 变更面 | 记忆暴露 |
| Goal and Implementation（round 6） | 新代理（未见过 v1–v7） | 已派发：对 v7 全文做新问题全量扫描 | v7 全文 + 决策半 | 单安装 |

## 下一步可执行动作

等 round 6 两份结果 → 若只剩披露项，按 §4 判交付形态（pass / partial delivery）；若仍有 must-change，开 v8（round 7）。
