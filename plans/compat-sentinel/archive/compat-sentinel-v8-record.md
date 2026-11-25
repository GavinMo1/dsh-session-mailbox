# compat-sentinel v8 — Review Record

被评审版本：`compat-sentinel-v8.md`（v8，round 7）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（678 行，LF 归一、UTF-8，SHA256 `6310b606046932a342f17bf3ba96fa86d23d7301eaa45c6cfd10aac3a6ffb2e7`）+ 本记录的决策半。
版本历史：v1–v7 全文与本记录在 `archive/`。v7 → v8 是 **Substantive Change**：所有 pattern 统一加右边界（签名/语句用前瞻，含 `//`、`/*` 分支）、3b 改成「逐行 + 受缩进限制」、断言表 57 → 61 行（新增 A58 DefineToolOptions / A59 MessageBase / A60 RemoteError.details / A61 PromptContext 四个「插件交给宿主的对象形状」）、§6 第 6/10/14/15/16 行与新增第 18 行的期望值、Step 0 的 asar 解析加空值回退、总评第 4 分支补 STALE 尾巴。

## 结论

**round 7 进行中。** round 6 两份报告（reused r5-adv：1 high / 4 medium / 4 low；新 r6-goal：1 high / 5 medium / 5 low）去重后 18 条，v8 处理：16 resolved、1 partly、1 披露。round 7 派发中（第 7 个 round，预算 10）。

## 版本、级别与授权

- 当前版本 v8；已完成 round：6；进行中：round 7。
- 评审级别：**Standard**，route 数 2。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始。

### 本轮级别复检（一行）

同一级别 Standard；scan route 是新代理（未见过 v1–v8），reused route 是 r6-goal（持有 round 6 的证据链）；预算 10，已用 6。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉 / 被否的替代 |
|---|---|---|---|
| Decision 1 | 61 行断言表内嵌脚本、一处维护 | 用户原话；property: preference | 多套表才划算 |
| Decision 2 | 读取只走子进程 `node scripts/asar.mjs cat` | 用户硬要求；property: fact | CLI 变形 |
| Decision 3 | 默认读 `src/*.ts`；A44/A45 锁 `lib/index.js` | 安装同时带两层；property: fact / preference | 全量 lib 或 require 真机 |
| Decision 4 | 两处收敛：`resolvePeer` + `liveOrThrow` | 两份抄写；property: fact | 抽顶层守卫 |
| Decision 5 | `rename_session` 不走 `liveOrThrow` | `rename()` 要活的 `agent.session`；property: fact | 改行为 |
| Decision 6 | FAIL 先判「DSH 变了 vs 断言写错」 | 失效模式是「为了变绿而放宽」；property: preference | 断言真锚错时放宽要记录 |
| Decision 7 | 三个客户端插件不进表（BS-7） | 用户点名两个插件；property: preference | 用户要求全覆盖 |
| Decision 8（定稿） | `region`：起锚恰好 1 次；块尾 = 与起锚同缩进的 `}`；窗口不得跨越第二个声明头（3b：**逐行**匹配、只看缩进 ≤ 起锚缩进的行）；字段带缩进锚、所有 pattern 带右边界 | round 6 两份报告各指出「签名行加后缀式放宽仍绿」（实测 6 条 `STILL-GREEN`）与「3b 一窗一次 `.test()` 等于没查」。v8 把右边界推广到全部 pattern（前瞻含 `//`、`/*`），并给 3b 钉死逐行实现与缩进限制；R7 的 32 个变异全绿 | 需要跨块 → §7 停；不得换块解析器（No-go 10） |
| Decision 9 | 进表条件只约束新增行；**并对「插件交给宿主的对象形状」单独开口**（v8 的 A58–A61） | round 6 指出 Decision 9 的分类只覆盖「调用返回值」，漏了「入参/payload」这一类（`DefineToolOptions`、`MessageBase`、`RemoteError.details`、`PromptContext`），而它们的失效全是静默；property: preference | 用户要求「只留会静默降级的点」→ 这四条正好都在那一侧 |

### Appendix 1 · 依赖清单里三项未被调用

property: fact。

### Appendix 2 · site 行号现场求（多命中打印前 3 + `(+N more)`）

### Appendix 3 · 退出码 0/1/2；「无法判定」用总评五分支表达

### Appendix 4 · 首行打印 dsh 版本（只展示）

### Appendix 5 · 路标放 `AGENTS.md`

### Appendix 6 · 61 条 = 35 + 12 + 6 + 3 + 1 + 4

最后四个来自 round 6：A58（`DefineToolOptions` 的 name/description/output）、A59（`MessageBase` 的 id/content/source）、A60（`RemoteError.details`）、A61（`PromptContext` 的五个字段）。它们的共同点：插件把一个**对象**交给宿主，字段改名是静默降级。

### Choice List（派生视图）

- asked：无。
- default, not asked；chose 全部 pattern 加右边界（含签名行），rejected 只给字段加，did not ask，because round 6 实测 6 条签名行在后缀式放宽下仍绿。
- default, not asked；chose 3b 逐行 + 缩进限制，rejected 一窗一次 `.test()`（等于没查）与不限缩进（会误伤块内注释示例），did not ask，because 两种读法在真机上都全绿、无法靠验收区分。
- default, not asked；chose 补 4 条 payload 形状行，rejected 只按「会抛错/静默」二分继续排除它们，did not ask，because 它们的失效形态（模型拿到无描述的工具、消息载荷畸形、错误报文退化、提示词消失）都是静默。

## Core Preconditions

| No. | 条件 | 状态 | 证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | asar 里有 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `matched: 341`；A50 的 `.tsx` 可 `cat` | 对 `dsh-agent/src/index\.ts` 返回 0 |
| P2 | 61 条 pattern 在当前安装全部命中 | proved | R6 `OK: 61 rows validate` | R6 出现任一 FAIL |
| P3 | 78 组 site 全部可解析，16 行带 `region` | proved | R6 同遍扫描 | 出现 `site miss` |
| P4 | 断言对真改动有判别力 | proved | R7：32 个变异，30 条 `MUT-RED` + 2 条标注 accepted | 出现未披露的 `MUT-STILL-GREEN` |
| P5 | 两处收敛不改变行为与文案 | to verify | 验收第 13/14/15 行 | 第 14 行期望不成立 |
| P6 | 未跟踪文件不会被误提交 | proved | `git status` 前后一致 | 出现新路径 |

## Run record

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R6 | v8 的 61 行 + 78 组 site | `node %TEMP%\compat-asar\verify6.mjs`（读 `assertions-v8.js`） | 0 | `OK: 61 rows validate (78 site pairs, 16 with region)` | P2/P3 proved；3b 的缩进限制在真机上无假红 |
| R7 | 32 个变异 | 同上 | 0 | `OK: 32 mutations behave as expected`；A58–A61 与全部右边界收紧后的变异均 `MUT-RED` | P4 proved |
| R8/R10 | fixture 与指纹 | `asar.mjs`、`git status` | 0 | 与 v7 同 | 未改受版本控制的文件 |

## Closure Table（round 6 的 18 条）

| Problem ID | Source | Status | Evidence position | Next step |
|---|---|---|---|---|
| R6A-01 + R6G-01（第 15 行 `Array.isArray` 期望 1，实际必为 2） | Adversarial + Goal | Resolved | §6 第 15 行改成 `Array.isArray(archived)`=2，并新增 `cannot verify the archived state of`=2（`liveOrThrow` 两条分支）；**不改 `liveRows()`** | - |
| R6A-02（右边界不认行尾注释） | Adversarial | Resolved | 右边界改成前瞻 `(?=\s*(?:\r?\n\|//\|/\*\|[,;:(){}[\]]\|$))` | - |
| R6A-03（3b 误伤块内注释里的伪声明） | Adversarial | Resolved | 3b 加「缩进不超过起锚缩进」的限制 | - |
| R6A-04（3b 实现方式未定、零验收） | Adversarial | Resolved | 3b 明写「按 `\n` 切开逐行匹配」；§6 新增第 18 行验 `块尾之后还有声明头` | - |
| R6A-05 + R6G-06 + R6G-07（签名行与 A49/A55 无右边界） | Adversarial + Goal | Resolved | 全部 pattern 加右边界（前瞻），字段另带类型边界；R7 里 6 条后缀放宽变异转红 | - |
| R6A-06（总评第 4 分支漏 STALE 尾巴） | Adversarial | Resolved | 第 4 分支补 `（另有 <s> 行 STALE）` | - |
| R6A-07（Step 0 在变量为空时抛错，与第 11 行冲突） | Adversarial | Resolved | Step 0 加空值回退（退回 §4 S1 探测）；§7 第一条改用 `$asar` | - |
| R6A-08（冻结文本里的过期数字） | Adversarial | Resolved | `p+f+s=56`→61、15 行/BS-10 计数、第 6/10 行的 3/58/61 全部重算 | - |
| R6A-09（第 14 行子串计数抓不到「文案被加长」） | Adversarial | Resolved | 第 14 行改成带引号的整串期望（`'agent must not be empty'` 等） | - |
| R6G-02（`DefineToolOptions` 三个字段零断言） | Goal | Resolved | 新增 A58 | - |
| R6G-03（`UserMessage`/`ContentBlock` 零断言） | Goal | Resolved | 新增 A59（`MessageBase` 的 id/content/source） | - |
| R6G-04（`RemoteError.details` 属性名无人断言） | Goal | Resolved | 新增 A60 | - |
| R6G-05（A13 前缀匹配，`EventDataV2` 仍绿） | Goal | Resolved | A13 加右边界 | - |
| R6G-08（A04 的续行并集仍绿） | Goal | Resolved | A04 改成 `...\r?\n\r?\n`（并集必须以空行收尾） | - |
| R6G-09（第 16 行只 `git show HEAD`，证明不了 commit 1 的文件集合） | Goal | Resolved | 第 16 行拆成 `git show --stat HEAD` 与 `git show --stat <commit-1-sha>` 两条，并修正 `0 ×6` | - |
| R6G-11（`PromptContext` 字段零断言） | Goal | Resolved | 新增 A61 | - |
| R6G-10（宿主 `engines.dsh` 兼容闸门未被利用） | Goal | Unresolved（披露） | 记为 O-1：本轮不动 `package.json`（那是插件改动，超出 plan-only 与 No-go 范围）；哨兵与 semver 闸门是互补的 | O-1 |

小计：resolved 16、partly 0、unresolved（披露）1。另：记录此前两处账目（Closure 行数、BS-10 计数）按本轮实测重算。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R6A-01/R6G-01 | 第 15 行三项计数 | Yes（验收项） |
| R6A-02/R6A-05/R6G-06/R6G-07/R6G-05 | 全部 pattern 的右边界（表内容整体变） | Yes（表内容 + 规则文本） |
| R6A-03/R6A-04 | 3b 逐行 + 缩进限制；§6 第 18 行 | Yes（匹配规则 + 验收项） |
| R6A-06/R6A-08 | 第 4 分支尾巴、数字重算 | Yes（输出语义 + 账目） |
| R6A-07 | Step 0 空值回退；§7 用 `$asar` | Yes（步骤） |
| R6A-09 | 第 14 行带引号 | Yes（验收项） |
| R6G-02/R6G-03/R6G-04/R6G-11 | 新增 A58–A61 | Yes（表内容） |
| R6G-08/R6G-09 | A04 的收尾、第 16 行拆两条 | Yes（表内容 + 验收项） |
| R6G-10 | 只登记 O-1 | No（披露） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（右边界 + 3b 逐行）、Decision 9（对 payload 形状开口）。
2. **本轮新出现的位置**：`pattern 的收尾规则` 一段（取代原来的「字段类 pattern 的写法」）、3b 的逐行与缩进限制、§6 第 18 行、A58–A61。
3. **删除/合并**：删掉「只有字段带右边界」的旧写法（推广到全部 pattern）；把 3b 从「一窗一次」改成「逐行」。用新规则回答的发现：4 条（A58–A61 由 Decision 9 的新口径判进来）；本轮新增机制数：**0**。

## open items

| No. | 项 | 不现在改的理由 | 可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | 宿主自带的 `engines.dsh` 兼容闸门未被使用（两个插件的 `peerDependencies` 全是 `"*"`，`engines.dsh` 未写） | 改 `package.json` 是插件改动，超出「本轮只出方案」；且 semver 只能挡住大版本破坏，抓不住 `2.0.24-next → 2.0.25` 这类同 minor 的破坏 | 一次不改变语义的 DSH 小版本升级后，宿主激活时报警而哨兵全绿（或反之） | 用户要求「激活时就挡」→ 另开一轮写 `engines.dsh` 范围 |
| O-2 | 假红面：块内列首 `}` 注释、两块尾形态互换、声明搬进 `declare module`、块内注释里的伪声明（3b 已按缩进放过，但更深缩进的真声明仍会误伤） | 要分辨注释/声明得做语法解析；方向是假红 | 任一形态出现而插件行为正常 | 出现一次这样的假红 |
| O-3 | A46 可被注释满足（BS-6 实例） | 文本匹配边界 | `'relay'`→`'relayed'` 且注释留旧写法，A46 仍绿 | relay 真不被接受而哨兵绿 |
| O-4 | A53 只锁整段替换（BS-12） | 文本匹配边界 | `rootOf` 加早退、四个标记全留，A53 仍绿 | `rootOf` 方向反转而全绿 |
| O-5 | 字段 pattern 依赖缩进 | 去掉缩进锚会重开嵌套的洞 | 宿主整体重排缩进，13 条一起红 | 出现一次这样的假红 |
| O-6 | 三个客户端插件零覆盖（BS-7） | 范围外 | 任一插件「页面没反应」 | 用户要求全覆盖 |
| O-7 | `exports` 映射未断言（BS-1） | A44/A45 已锁 lib | hostRequire 结果与 A44 不一致 | 出现 exports 重定向导致的加载失败 |
| O-8 | 会抛错的依赖点不新开行（Decision 9 的排除侧） | 它们会当场响 | 其中任一项改了而插件没报错 | 出现静默表现 |

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
| BS-9 过紧 pattern/锚假红（缩进锚、块内列首 `}`、块尾形态互换、搬进 `declare module`、块内深层真声明） | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 只有 27 条有验收级反例；第 12 行是弱证据 | 逐条反例成本高 | 个别行可能接住同形符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 要读代码判断静默 vs 抛错 | 少一条/多一条 | 某次失效既没进表也没抛错 |
| BS-12 A53 只锁整段替换 | 文本匹配边界 | 加早退抓不到 | `rootOf` 方向反转而全绿 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Adversarial（round 6） | r5-adv（reused） | finished | v7 + Closure | 记忆暴露 |
| Goal and Implementation（round 6） | r6-goal（新） | finished | v7 全文 + 自建变异 | 单安装 |
| Adversarial（round 7） | 新代理（未见过 v1–v8） | 已派发：对 v8 全文做新问题全量扫描 | v8 全文 + 决策半 | 单安装 |
| Goal and Implementation（round 7） | r6-goal（**reused**） | 已派发：核 Closure + 本轮改动反例 | Closure 全表 + 变更面 | 记忆暴露 |

## 下一步可执行动作

等 round 7 两份结果 → 若只剩披露项，按 §4 判交付形态；若仍有 must-change，因预算（已用 6/10）只剩 3 个 round，优先把 must-change 收进 v9 并做一次窄口径复核（复用 route 只查 Closure 位置）。
