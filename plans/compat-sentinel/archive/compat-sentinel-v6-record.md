# compat-sentinel v6 — Review Record

被评审版本：`compat-sentinel-v6.md`（v6，round 5）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（647 行，LF 归一、UTF-8，SHA256 `2bf6158065fe51d901bd2aceab4cd52ebfecd7adf998b5643a3bf27f52c5d895`）+ 本记录的决策半。
版本历史：v1–v5 全文与本记录在 `archive/`。v5 → v6 是 **Substantive Change**：`region` 止锚按声明缩进区分（`\n}` / `\n  }`）、判定顺序把「内容为空」放宽到去空白后为空、总评从四分支改为五分支（新增「全部不可判定」）、`liveOrThrow` 两条分支回到同一句原文、断言表 53 → 56 行（新增 A54/A55/A56，改写 A05/A21/A34/A44/A17）。

## 结论

**round 5 进行中。** round 4 两份报告（reused r3-adv：1 high / 3 medium / 2 low；新 r4-goal：3 high / 4 medium / 4 low）共 17 条（去重后 15 条），v6 逐条处理：13 resolved、2 披露。round 5 派发中。

## 版本、级别与授权

- 当前版本 v6；已完成 round：4；进行中：round 5。
- 评审级别：**Standard**，route 数 2。级别不变（判据 (2)(4) 仍不成立；未到 Deep 的四条理由未变）。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Standard；scan route 是新代理（未见过 v1–v6），reused route 是 r4-goal（持有 round 4 的证据链）；未使用「预算用尽再加一轮」的例外（本轮是第 5 个 round，预算 10，未用）。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉，或被否掉的替代方案 |
|---|---|---|---|
| Decision 1 | 56 行断言表内嵌脚本、一处维护 | 用户原话「后面也没啥可扩展的了」；property: preference | 多套表才划算（BS-4/BS-7） |
| Decision 2 | 读取只走子进程 `node scripts/asar.mjs cat` | 用户硬要求；`asar.mjs:68-85` 唯一入口且带 `process.exit`；property: fact | CLI 变形 → 验收第 1 行红 → §7 停 |
| Decision 3 | 默认读 `src/*.ts`；A44/A45 锁 `lib/index.js` | 安装同时带 `src/`（341 个 `index.ts`）与 `lib/`；`hostRequire` 走 `exports → lib`；property: fact / preference | 全量 lib（假红）或 require 真机（要运行时）被否 |
| Decision 4 | 两处收敛：`resolvePeer` + `liveOrThrow`；不做第三处 | `index.js:177-188` / `:282-293` 两份抄写；三处子代理判定语义不同；property: fact | 抽顶层守卫会把两种语义挤进一个函数 |
| Decision 5 | `rename_session` 不走 `liveOrThrow` | `rename()` 要活的 `agent.session`；property: fact | 改行为 = 超授权 |
| Decision 6 | FAIL 先判「DSH 变了 vs 断言写错」；放宽要记录 | 哨兵失效模式是「为了变绿而放宽」；property: preference | 断言真锚错时放宽是正确动作（要记录） |
| Decision 7 | 三个客户端插件不进表（BS-7） | 用户点名两个插件；property: preference | 用户要求全覆盖 → 另开一轮 |
| Decision 8（本轮定稿） | `region` = `[起锚, 块尾]`：起锚在条目里恰好 1 次；块尾 `<缩进>}` 与起锚所在声明的缩进一致（列首声明用 `\n}`，`declare module` 里的声明用 `\n  }`），取起锚之后第一个；窗口 = 起锚起点到块尾终点；锚错误判 `region-mismatch` 且不得回退；字段 pattern 带声明缩进锚 | round 4 两份报告各自实测出同一处残余：A38/A49 的声明在 `declare module` 里，`\n}` 落在**外层块**上，窗口吞掉同块兄弟声明。改成同缩进块尾后，两个「同 module 兄弟声明」变异都变红（R7）；property: fact（两种缩进都在源码里）/ preference（按缩进取块尾而不是解析） | 若某条断言需要跨多个块 → §7 停。被否的替代：块解析器（No-go 10）、止锚取「某个字段」（round 3 已证字段搬走即失守） |
| Decision 9 | 进表条件**只约束新增行**：新依赖点若「改了会当场抛错」就不新开行；已有行与往已有行补 pattern 不受限 | round 3 指出 v3 措辞自相矛盾；round 4 的 R4G-03/R4G-04 又补了两条「静默降级」的点（A54/A55）——正是这条判据该收的；property: preference | 用户要求「连会抛错的也全收」→ 表翻倍 |

### Appendix 1 · 依赖清单里三项未被调用

`ctx.agents.resume`、`ctx.agents.resolveAgent`、`ctx.sessionQuery.observeSession`：`plugins/` 下 0 命中。property: fact。

### Appendix 2 · site 行号现场求

多命中打印前 3 + `(+N more)`。property: preference。

### Appendix 3 · 退出码 0/1/2；「无法判定」用总评五分支表达

第 3 分支（全部 FAIL 都是不可判定行）→ `哨兵无法判定：<N> 行条目不存在或为空…`；第 4 分支（混合）→ 先插「（其中 <N> 行无法判定）」再接「有接口变了」。property: preference。

### Appendix 4 · 首行打印 dsh 版本（只展示）

### Appendix 5 · 路标放 `AGENTS.md`

### Appendix 6 · 56 条 = 35 + 12 + 6 + 3

最后三条来自 round 4：A54（`SessionTitleSnapshot extends SessionTitleEventData`）、A55（attach 失败的 `details.sessionId`）、A56（`ArchiveSessionOptions.stopActivity` 独立成行，因为 A21 的签名不在那个 interface 的 region 里）。

### Choice List（派生视图）

- asked：无。
- default, not asked；chose 块尾按声明缩进，rejected 统一 `\n}`（`declare module` 里的声明会溢出到外层块），did not ask，because 源码里两种缩进都真实存在。
- default, not asked；chose「去空白后为空」也算空条目，rejected 只认 `bytes === 0`，did not ask，because 只剩 BOM/换行的占位文件会把「文件是空的」误报成「锚被改名」。
- default, not asked；chose 新增「全部不可判定」分支，rejected 让混合分支的尾句承担两种结论，did not ask，because 同一行里先说「不说明接口变了」再说「有接口变了」是自相矛盾的。
- default, not asked；chose `liveOrThrow` 两条分支同文案，rejected 给非数组分支加后缀（会违反 No-go 5 的「不改错误文案」），did not ask，because R3A-08 的诉求只是「文案可达」。

## Core Preconditions

| No. | 条件 | 状态 | 证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | asar 里有 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `matched: 341`；A50 的 `.tsx` 可 `cat` | 对 `dsh-agent/src/index\.ts` 返回 0 |
| P2 | 56 条 pattern 在当前安装全部命中 | proved | R6 `OK: 56 rows validate` | R6 出现任一 FAIL |
| P3 | 73 组 site 全部可解析，13 行带 `region` | proved | R6 同遍扫描 | 出现 `site miss` |
| P4 | 断言对真改动有判别力 | proved | R7：25 个变异，23 条 `MUT-RED` + 2 条标注的 accepted（一条文本匹配边界、一条假红） | 出现未披露的 `MUT-STILL-GREEN` |
| P5 | 两处收敛不改变行为与文案 | to verify | 验收第 13/14/15 行 | 第 14 行期望不成立 |
| P6 | 未跟踪文件不会被误提交 | proved | `git status` 前后一致；`.tmp-*` 由 `.gitignore` 忽略 | 出现新路径 |

## Run record（隔离运行）

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R6 | v6 的 56 行 + 73 组 site | `node %TEMP%\compat-asar\verify6.mjs` | 0 | `OK: 56 rows validate (73 site pairs, 13 with region)` | P2/P3 proved |
| R7 | 25 个变异 | 同上 | 0 | `OK: 25 mutations behave as expected`；A38/A49 的「同 module 兄弟声明」、A54、A55、A21 返回类型、A56、A34 数值加宽、A05 legacy twin 全部 `MUT-RED` | P4 proved |
| R8 | 0 字节 / 空 asar fixture | `node scripts/asar.mjs list/cat` | 0 / 0 | `{"total":1,"matched":1}`、空 stdout | 验收第 6/10 行可执行 |
| R10 | 指纹 | `git status --porcelain` | 0 | 只有 `plans/` 与 `.tmp-*` 的未跟踪项 | 未改受版本控制的文件 |

## Closure Table（round 4 的 15 条，去重后）

| Problem ID | Source | Status | Evidence position | Next step |
|---|---|---|---|---|
| R4A-01 + R4G-01（`declare module` 里的声明，块尾落在外部） | Adversarial + Goal | Resolved | §4 S2 规则 2（块尾缩进随声明）+ A38/A49 的 `region` 改成 `\n  }`；R7 两个「同 module 兄弟声明」变异 `MUT-RED` | - |
| R4A-02 + R4G-02（第 10 行要求总评里不存在的串） | Adversarial + Goal | Resolved | §4 S3 新增第 3 分支 `哨兵无法判定：…`；第 6/10 行的期望串都改到这句 | - |
| R4A-03（`liveOrThrow` 改了错误文案，违反 No-go 5） | Adversarial | Resolved | §4 S6 两条分支同用 `cannot verify the archived state of <id>; refusing to deliver` | - |
| R4A-04（混合分支自相矛盾） | Adversarial | Resolved | §4 S3 分支次序：全部不可判定 → 单独判定；混合 → 括号 + 「有接口变了」 | - |
| R4A-05（只剩 BOM/换行的条目仍报「锚被改名」） | Adversarial | Resolved | §4 S3 第 ③ 步放宽到「去空白后为空」 | - |
| R4A-06 + R4G-08（块内列首 `}` 截短窗口 → 假红） | Adversarial + Goal | Unresolved（披露） | §8 BS-9 已写入「块内出现一行恰好是列首 `}` 的注释」 | O-1 |
| R4G-03（`SessionTitleSnapshot.title` 只靠继承被间接覆盖） | Goal | Resolved | 新增 A54（锁 `SessionTitleSnapshot extends SessionTitleEventData`）；R7 `MUT-RED` | - |
| R4G-04（`details.sessionId` 无 pattern，A47 的 means 超出 pattern） | Goal | Resolved | 新增 A55（锁 `'session/workspace-attach-failed': { readonly sessionId: SessionId`）；R7 `MUT-RED` | - |
| R4G-05（A21 未锁返回类型 / `stopActivity` 无 region） | Goal | Resolved | A21 的 pattern 补 `: Promise<void>`；新增 A56（`stopActivity` + `region: ArchiveSessionOptions`）；R7 两条 `MUT-RED` | - |
| R4G-06（无 `region` 的 pattern 被同文件同形符号满足；`120` 前缀） | Goal | Resolved | A05 加 `region` + 4 格缩进锚；A34 的常量补 `,`；R7 `MUT-RED` | - |
| R4G-07（第 16 行拿 `.tmp-*` 当未跟踪项、`HEAD~1` 假设无并发提交） | Goal | Resolved | §6 第 16 行改成 `git log --oneline -3` + `git status --short` + `git check-ignore -v`，并写明 `.tmp-*` 被忽略 | - |
| R4G-09（A46 可被注释满足） | Goal | Unresolved（披露） | §8 BS-6 的已复现实例；不修（文本匹配边界） | O-2 |
| R4G-10（A17 的 means 与插件注释相反） | Goal | Resolved | A17 的 `means` 改成「entity.id 变 undefined → 报 workspace disappeared…是响的但报文误导」 | - |
| R4G-11（A44 的 `[a-z]+` 对重打包假红；第 12 行证据偏弱） | Goal | Resolved | A44 改成 `function defineTool\([^)]{0,40}\)`；第 12 行的弱证据由第 1 行的 56 PASS 兜底（记在 BS-10） | - |

小计：resolved 13、unresolved（披露）2。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R4A-01/R4G-01 | 块尾随声明缩进；A38/A49 `region` 改 `\n  }` | Yes（匹配规则 + 表内容） |
| R4A-02/R4G-02/R4A-04 | 总评四分支 → 五分支；第 6/10 行期望串 | Yes（输出语义 + 验收项） |
| R4A-03 | `liveOrThrow` 两分支同文案 | Yes（代码片段） |
| R4A-05 | 「空条目」放宽到去空白后为空 | Yes（判定顺序） |
| R4G-03/R4G-04/R4G-05/R4G-06 | 新增 A54/A55/A56；A05/A21/A34/A44/A17 改写 | Yes（表内容） |
| R4G-07 | §6 第 16 行重写 | Yes（验收项） |
| R4A-06/R4G-08/R4G-09 | BS-9 / BS-6 披露 | No（披露） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（定稿：块尾随缩进）、Decision 9（应用范围扩大了两条）。
2. **本轮新出现的位置**：§4 S2 规则 2 的两种块尾写法、§4 S3 的第 3 分支（`哨兵无法判定`）、§6 第 16 行的 `check-ignore` 检查、A54/A55/A56 三行。
3. **删除/合并**：删掉「混合分支承担全部不可判定」的旧写法；把 A21 拆成 A21（签名）+ A56（选项字段）。用新规则回答的发现：2 条（A54/A55 由 Decision 9 判进来）；本轮新增机制数：**0**。

## open items

| No. | 项 | 不现在改的理由 | 一条可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | 块内出现一行恰好是列首 `}` 的注释会截短窗口（假红） | 要排除得分辨注释与代码；代价是假红一侧，不是假绿 | 在 `Config` 块内加 `/**\n}\n*/`，A14 变红而插件正常 | 出现一次这样的假红 |
| O-2 | A46 可被注释满足（BS-6 的已复现实例） | 文本匹配的边界；排除要语法解析 | 把 `'relay'` 改成 `'relayed'` 并在注释里留旧写法，A46 仍绿 | 出现 relay 表单真的不被接受而哨兵绿 |
| O-3 | A53 只锁整段替换（BS-12） | 同上 | `rootOf` 加早退、四个标记全留，A53 仍绿 | `rootOf` 方向反转而全绿 |
| O-4 | 12 条字段 pattern 依赖缩进，整体重排一起红（BS-9） | 去掉缩进锚会重开「嵌套对象」的洞 | 把某宿主文件的 interface 体改成 4 格缩进，12 条一起红 | 出现一次这样的假红 |
| O-5 | 三个客户端插件零覆盖（BS-7） | 范围外 | 任一客户端插件「页面没反应」 | 用户要求全覆盖 |
| O-6 | `exports` 映射未断言（BS-1） | A44/A45 已锁 `lib/index.js` | `hostRequire` 结果与 A44 不一致 | 出现 exports 重定向导致的加载失败 |
| O-7 | 会抛错的依赖点不新开行（Decision 9） | 它们会当场响 | 其中任一项改了而插件没报错 | 出现静默表现 → 该点改为进表 |

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
| BS-6 文本匹配命中注释 | 要语法解析 | 注释留旧名时假绿（R4G-09 已复现） | 接口消失而断言仍绿 |
| BS-7 三个客户端插件零覆盖 | 范围外 | 它们的 API 改了没人报 | 「页面没反应」 |
| BS-8 多安装按 mtime | 读不到 profile 加载的那个 | 审到旧安装 | 结论与行为相反 |
| BS-9 过紧 pattern/锚假红（含缩进锚、块内列首 `}`） | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 只有 20 条有验收级反例 | 逐条反例成本高 | 个别行可能接住同形符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 要读代码判断静默 vs 抛错 | 少一条/多一条 | 某次失效既没进表也没抛错 |
| BS-12 A53 只锁整段替换 | 文本匹配的边界 | 加早退抓不到 | `rootOf` 方向反转而全绿 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation（round 4） | r4-goal（新） | finished | v5 全文 + 自建 14 个变异 | 单安装 |
| Adversarial（round 4） | r3-adv（reused） | finished | v5 + Closure | 记忆暴露 |
| Goal and Implementation（round 5） | r4-goal（**reused**） | 已派发：核 Closure + 本轮改动反例 | Closure 全表 + 变更面 | 记忆暴露 |
| Adversarial（round 5） | 新代理（未见过 v1–v6） | 已派发：对 v6 全文做新问题全量扫描 | v6 全文 + 决策半 | 单安装 |

## 下一步可执行动作

等 round 5 两份结果 → 若仍有 must-change 开 v7；若只剩披露项，按 §4 判交付形态（pass / partial delivery）。
