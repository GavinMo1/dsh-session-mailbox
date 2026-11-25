# compat-sentinel v11 — Review Record

被评审版本：`compat-sentinel-v11.md`（v11，round 10 冻结文本）。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（610 行，LF 归一、UTF-8，SHA256 `e2846d71549b03d1488e822d963721aa5715ac244770913cd59b2dfa6363afb1`（layout 修订后；修订前为 `379a9012…f37618`，见文末「修订记录」））+ 本记录的决策半。
版本历史：v1–v10 全文与本记录在 `archive/`。v10 → v11 是 **Substantive Change**：删掉移出单元 B 后残留的四处文字（§1 范围、Step 5「继续 Step 6」、`§4 S7` 引用、两个 `### S4`）、Step 0 的备份清单与「五个基线值」、§6 的「读法」一段（每条配方落盘 + `Select-String -Path`）、A64 的第五条 pattern 收窄到 `{ reason: 'use subagent delivery`、全文统一成一种右边界前瞻（`(?!\s*[|&])`）、3b 的关键字边界从 `\b` 改成 `\s`（否则 `type: 'text'` 会被当成声明头）、清掉五个控制字符、BS-14 收窄并新增 BS-15/BS-16。

## 结论

**partial delivery（部分交付）。** 交付的部分：Step 0–5 的哨兵方案——它的开始指令完整、可判、未被任何 open item 卡住。没交付的部分：**两处收敛（`resolvePeer` / `liveOrThrow`）已被整体移出**（不是挂起，是撤回）：`plugins/session-mailbox` 在评审期间被另一个会话推到 0.9.0（commit `88f52ea`，tag `dsh-session-mailbox/v0.9.0`），`send_session_message` 的 notfound 分支已经变成「冷准入 → `wakeAgent(id)` → 投递」，照旧写的 `resolvePeer` 会把这条已发版路径删掉。撤回由 Decision 11 记录、由 §4 S6 说明。

为什么不是 pass：round 9 的两条独立报告都落在 v10 上（0 high / 5 medium / 3 low），v11 逐条处理了它们，但 **v11 本身没有再跑一个完整 round**（预算 10 用完）。v11 的改动全部由 Author 用「把表从冻结文本里取出来重跑」的方式验证过（见 Run record R12），但没有第二条独立证据链。按本 loop 的规则，这不算 pass。

## 版本、级别与授权

- 当前版本 v11；已完成 round：9；v11 未开 round（预算 10 已用满）。
- 评审级别：**Standard**，route 数 2。级别在 v11 未变（范围缩小，判据更不成立）。
- `delivery point`：`plan only`。用户原话：「**本轮只出方案，不写实现**（`scripts/compat-check.mjs` 和插件改动都等放行）」。
- 实现状态：未开始。仓库里只有 `plans/compat-sentinel/` 的提交，没有 `scripts/compat-check.mjs`。

### 本轮级别复检（一行）

同一级别 Standard；round 9 的 scan route 是新的 Adversarial 代理（未见过 v1–v11），reused route 是 r8-goal（持有 round 8/9 的证据链）；预算 10 已用满，未使用「预算用尽再加一轮」的例外。

## Decision Table

| No. | 选定的实现 | 证据 | 会被什么否掉 / 被否的替代 |
|---|---|---|---|
| Decision 1 | 64 行断言表内嵌脚本、一处维护 | 用户原话「后面也没啥可扩展的了」；property: preference | 多套表才划算 |
| Decision 2 | 读取只走子进程 `node scripts/asar.mjs cat` | 用户硬要求；`asar.mjs:68-85` 是唯一入口且带 `process.exit`；property: fact | CLI 变形 → 验收第 1 行红 |
| Decision 3 | 默认读 `src/*.ts`；A44/A45 锁 `lib/index.js` | 安装同时带两层（`matched: 341`）；`hostRequire` 走 `exports → lib`；property: fact / preference | 全量 lib（打包改名假红）或 require 真机（要运行时） |
| Decision 4 | ~~两处收敛~~ → **已撤回**（见 Decision 11） | - | - |
| Decision 5 | ~~`rename_session` 不走 `liveOrThrow`~~ → 随 Decision 11 一并撤回 | - | - |
| Decision 6 | FAIL 先判「DSH 变了 vs 断言写错」；放宽断言要记录 | 失效模式是「为了变绿而放宽」；property: preference | 断言真锚错时放宽是正确动作（要记录） |
| Decision 7 | 三个客户端插件不进表（BS-7） | 用户点名两个 Host 侧插件；property: preference | 用户要求全覆盖 |
| Decision 8（定稿） | `region`：起锚恰好 1 次；块尾 = 与起锚同缩进的 `}`；3b = `trimStart()` 后逐行匹配、关键字后接空白、缩进 ≤ 起锚缩进；**所有** pattern 用同一条前瞻 `(?=[ \t]*(?:(?:\r?\n)(?!\s*[|&])|//|/\*|[,;:(){}]|$))` | round 9 指出「字段类一种前瞻、其余另一种」是两套方言；v11 统一成 `[|&]`，并在真机上重跑 64 行仍全绿（R12）；3b 的 `\b` 会让 `type: 'text'` 被当成声明头（A62 在真机上直接红），改成 `\s` 后 64 行全绿 | 需要跨块 → §7 停；不得换块解析器（No-go 6/7） |
| Decision 9 | 进表条件只约束新增行；payload 形状单独开口（A58–A64） | 用户范围；property: preference | 用户要求全收 |
| Decision 10 | 不写死会漂移的基线：Step 0 记 5 项（含 `version` 与 `found.reason ===` 计数），§6 里不再出现依赖插件计数的期望 | 评审期间插件被并发改动（720→799 行、`found.reason ===` 8→7、0.8.1→0.9.0）；property: fact | 若实现方照抄示例数字，会得到恒红的验收项 |
| Decision 11（本轮定稿） | **撤回两处收敛**：本方案只交付哨兵（Step 0–5，一次提交，不动 `plugins/`、不改 `version`、不打 tag） | `plugins/session-mailbox` 已是 0.9.0（`88f52ea` / tag `v0.9.0`），`found.ok !== true` 分支已是 45 行的冷唤醒路径（`index.js:231–275`）；`resolvePeer` 在 notfound 上抛错会让它不可达；且 §6 里原先那四个计数只有删掉这条路径才成立——即验收在逼实现方删已发版功能。round 8/9 两条独立报告都指到这里，property: fact | 若用户仍想做收敛，应在读到当时的 `index.js` 后另开一轮：`resolvePeer` 只处理 empty/self/ambiguous，`liveOrThrow` 只替换子代理守卫 + 归档集合 + 归档拒绝三处 |

### Appendix 1 · 用户给的依赖清单里三项未被调用

`ctx.agents.resume`、`ctx.agents.resolveAgent`、`ctx.sessionQuery.observeSession`：`plugins/` 下 0 命中（`resolveAgent` 的实际调用点是 `sessionController.resolveAgent`，A09/A43）。property: fact。

### Appendix 2 · site 行号现场求

多命中打印前 3 + `(+N more)`；不硬编码行号。property: preference。

### Appendix 3 · 退出码 0/1/2；总评五分支；「无法判定」= 条目不存在或内容为空

### Appendix 4 · 首行打印 `dsh <name> <version>`（只展示；已知它报的是桌面壳版本，见 BS-16）

### Appendix 5 · 路标放 `AGENTS.md`

### Appendix 6 · 64 条 = 35 + 12 + 6 + 3 + 1 + 4 + 2 + 1

依次来自：v1 的 35 条；round 1 的 12 条；round 2 的 6 条；round 4 的 3 条（A54/A55/A56）；round 5 的 1 条（A57）；round 6 的 4 条（A58–A61）；round 7 的 2 条（A62/A63）；round 8 的 1 条（A64）。

### Choice List（派生视图）

- asked：无。
- default, not asked；chose 撤回两处收敛，rejected 按 v9 的 S5/S6 硬改，did not ask，because 那会删掉另一个会话刚发版的冷唤醒路径，且 §1 已写明本轮只出方案。
- default, not asked；chose 一种前瞻方言（`[|&]`），rejected 字段/签名两套，did not ask，because 两套会让「所有 pattern 同一规则」这句话变成假的。
- default, not asked；chose 3b 的关键字后接 `\s`，rejected `\b`，did not ask，because `type: 'text'` 会被 `\b` 当成声明头，A62 在真机上直接红。
- default, not asked；chose Step 0 记 5 项基线且 §6 不写死插件计数，rejected 照抄示例数字，did not ask，because 插件正被并发改动。

## Core Preconditions

| No. | 条件 | 状态 | 证据 | 可证伪条件 |
|---|---|---|---|---|
| P1 | asar 里有 `src/*.ts`（含 `.tsx`）与 `lib/*.js` | proved | `node scripts/asar.mjs list <asar> 'node_modules/@deepseek-ai/[^/]+/src/index\.ts$'` → `matched: 341` | 对 `dsh-agent/src/index\.ts` 返回 0 |
| P2 | 64 条 pattern 在当前安装全部命中 | proved | R12 `OK: 64 rows validate` | 出现任一不命中 |
| P3 | 81 组 site 全部可解析，18 行带 `region` | proved | R12 同遍扫描 | 出现 `site miss` |
| P4 | 断言对真改动有判别力 | proved | R7/R12：32 个变异 30 红 2 披露；A63/A64 的四个 code 与 `{ reason: 'use subagent delivery` 实测红 | 出现未披露的「改了接口仍绿」 |
| P5 | ~~收敛后行为与文案不变~~ → 随 Decision 11 撤回，不再是本方案的前置条件 | - | - | - |
| P6 | 未跟踪文件不会被误提交 | proved | `git status --short` 只出现 `plans/compat-sentinel/` | 出现新路径 |

## Run record

| # | 目的 | 命令 | exit | 关键输出 | 结论 |
|---|---|---|---|---|---|
| R6 | v10 的 64 行 + 81 组 site | `node %TEMP%\compat-asar\verify6.mjs` | 0 | `OK: 64 rows validate (81 site pairs, 18 with region)` | P2/P3 |
| R7 | 32 个变异 | 同上 | 0 | `OK: 32 mutations behave as expected` | P4 |
| R12 | **把 v11 冻结文本里的表取出来重跑**（v11 未开 round，这条是它的唯一验证） | `node %TEMP%\compat-asar\verify11.cjs`（从 `compat-sentinel-v11.md` 的 ```js 块原样抽取 64 行） | 0 | 先报 `FAIL A62 head`（3b 的 `\b` 把 `type: 'text'` 当声明头），改 `\s` 后 `OK: 64 rows validate` | P2/P3/P4 在 v11 上复现；3b 的 `\b`→`\s` 由此发现并修正 |
| R13 | 控制字符 | `[regex]::Matches($raw,"[\x00-\x08\x0B\x0C\x0E-\x1F]")` | 0 | v10 命中 5 处（4 个 lone CR + 1 个 FF，导致 `resolvePeer` 被写成 `esolvePeer`、`found.ok` 被写成 `ound.ok`）；v11 为 0 | v11 文本干净 |

## Closure Table（round 9 的 8 条）

| Problem ID | Source | Status | Evidence position | Next step |
|---|---|---|---|---|
| R9G-01（移出单元 B 后的残留文字：§1 范围、Step 5「继续 Step 6」、`§4 S7`、两个 `### S4`、Step 0 的 plugins 备份） | Goal | Resolved | §1 第 17 行改成「只交付一件东西」；Step 5 判据删掉「单元 B 等放行」；`§4 S7` → `§4 S5`；第二个 `### S4` → `### S6`；Step 0 只备份 `AGENTS.md` | - |
| R9G-02（「所有 pattern 同一前瞻」与表内两种方言矛盾） | Goal | Resolved | 全文统一成 `(?!\s*[|&])`；R12 在真机上 64 行全绿 | - |
| R9G-03（§6 第 2–10 行没落盘、`Select-String` 缺 `-Path` 会报错） | Goal | Resolved | §6 表头新增「读法」一段：每条配方 `*> $env:TEMP\row<N>.txt`，所有 `Select-String` 带 `-Path`；「含 X」/「不含 X」都给了计数口径 | - |
| R9G-04（A64 的 `subagent delivery` 被同文件 `super()` 文案兜住） | Goal | Resolved | A64 第五条 pattern 改成 `\{ reason: 'use subagent delivery`（收窄到 `details.reason`）；R12 中该 pattern 在真机上命中 | - |
| R9G-05（三处「成员集合」只补了一半：TextBlock 必填成员、controller 的 PromptContentPart 变体、ValueSchemaAnnotations.description） | Goal | Unresolved（披露） | 方案 §8 新增 BS-15，逐条点名三处 | O-1 |
| R9G-06（5 个控制字符写坏正文） | Goal | Resolved | R13：v11 为 0；`resolvePeer` / `found.ok` 已修回 | - |
| R9G-07（Step 0 判据仍写「三个基线值」；行号引用不准） | Goal | Resolved | Step 0 改成「五个基线值」；行号改成按 `name: 'send_session_message'` 符号读 | - |
| R9G-08（三处 round-8 low：首行版本、A56/A55 顺序、`bytes` 单位；第 14 行的离线口径） | Goal | Unresolved（披露） | BS-16 写明首行报的是桌面壳版本、`bytes` 用 `Buffer.byteLength`；A56/A55 顺序未改（id 计数不受影响，`unique ids: 64`）；第 14 行已把 `git ls-remote` 标成需网络 | O-2 |

小计：resolved 6、unresolved（披露）2。

## Revision Table

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R9G-01 | 删残留文字、`§4 S7`→`S5`、第二个 `S4`→`S6`、Step 0 备份清单 | Yes（步骤与引用） |
| R9G-02 | 统一前瞻方言（表内容整体变） | Yes（表内容 + 规则） |
| R9G-03 | §6 新增「读法」一段 | Yes（验收口径） |
| R9G-04 | A64 第五条 pattern 收窄 | Yes（表内容） |
| R9G-06 | 清控制字符、修 `resolvePeer`/`found.ok` | Yes（正文可读性） |
| R9G-07 | 「五个基线值」、符号定位 | Yes（步骤） |
| R9G-05 / R9G-08 | BS-15 / BS-16 | No（披露） |
| R12 自查 | 3b 的关键字边界 `\b`→`\s` | Yes（规则） |

## 变更面（本轮）

1. **触及的决策点**：Decision 8（前瞻方言统一 + 3b 边界）、Decision 11（撤回收敛，定稿）。
2. **本轮新出现的位置**：§6 的「读法」一段、§8 的 BS-15 / BS-16、§4 S6（改名后的「为什么没有那两处收敛」）。
3. **删除/合并**：删掉 §1 的「两处重复收敛」、Step 5 的「继续 Step 6」、`§4 S7` 引用、重复的 `### S4` 编号。用新规则回答的发现：0 条。本轮新增机制数：**0**。

## open items

| No. | 项 | 不现在改的理由 | 可证伪的测试 | 恢复条件 |
|---|---|---|---|---|
| O-1 | 三处「成员集合」没进断言面（TextBlock 新增必填成员、controller 的 `PromptContentPart` 变体、`ValueSchemaAnnotations.description`） | 补它们要再开三行并各自做变异验证；本轮预算已满 | 三者任一改名后插件仍零报错（实测：A62/A63/A41/A58 都保持 PASS） | 出现一次「模型拿到的工具描述/消息块缺字段」而哨兵全绿 |
| O-2 | 首行版本是桌面壳版本；A56/A55 顺序 | 前者只影响可读性（BS-16 已写明），后者不影响 id 计数 | 首行版本与宿主包实际版本对不上 | 用户要求首行给宿主包版本 |
| O-3 | 假红面（块内列首 `}` 注释、块尾形态互换、声明搬进 `declare module`、pattern 内部折行、尾逗号） | 要语法解析 | 任一形态出现而插件正常 | 出现一次假红 |
| O-4 | A46 可被注释满足（BS-6 实例） | 文本匹配边界 | `'relay'`→`'relayed'` 且注释留旧写法，A46 仍绿 | relay 真不被接受而哨兵绿 |
| O-5 | A53 只锁整段替换（BS-12） | 同上 | `rootOf` 加早退，A53 仍绿 | `rootOf` 方向反转而全绿 |
| O-6 | 字段 pattern 依赖缩进 | 去掉缩进锚会重开嵌套洞 | 宿主整体重排缩进，13 条一起红 | 出现一次假红 |
| O-7 | 三个客户端插件零覆盖（BS-7） | 用户点名范围外 | 任一插件「页面没反应」 | 用户要求全覆盖 |
| O-8 | `exports` 映射未断言（BS-1） | A44/A45 已锁 lib | hostRequire 结果与 A44 不一致 | exports 重定向导致加载失败 |
| O-9 | 会抛错的依赖点不新开行（Decision 9 的排除侧） | 它们会当场响 | 其中任一项改了而插件没报错 | 出现静默表现 |
| O-10 | 右边界前瞻的两个已知绕过（`/*…*/` 后接 `|`、注释行后再接 `|`） | 要剥注释才根治 | 宿主用这两种排版引入联合成员而哨兵绿 | 出现一次 |

## 未验证项

| 项 | 发现者 | 为什么不能现在验 | 谁在何时验 | 处理值 |
|---|---|---|---|---|
| v11 的改动没有第二条独立证据链 | Author | round 预算 10 已用满（v11 是第 10 个版本文本） | **改由执行期取证**（用户裁决 F7）：建出 `scripts/compat-check.mjs` 之后，对 v11 改动的 8 个位置逐条做变异——前瞻方言统一（`T \| undefined`、`Agent[]→Agent[][]`、`T & X` 续行、行尾注释）、3b 的 `\s` 边界（`type: 'text'` 不得被当成声明头）、A64 的 `{ reason: 'use subagent delivery` 收窄、§6 的「读法」段落可执行性、控制字符为零；再把 R7 那 32 个变异在成片文件上重跑一次 | 处理值：**check by the Author at execution time**；真文件上的变异证据替代第二个只读同一份文本的读者。若其中任一条在成片文件上判错 → 按 Decision 6 停 |
| 下一版 DSH 上表的表现 | Author | 需要新版本 | 首次升级 | still open（BS-1/BS-2） |
| 另一台机器同 commit 结论 | Author | 只有一台机器 | 用户 `git pull` 后跑一次 | still open（BS-4） |
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
| BS-9 过紧 pattern/锚假红（缩进锚、块内列首 `}`、块尾形态互换、搬进 `declare module`、pattern 内部折行、尾逗号） | 放松会漏真改动 | 偶发假红 | 出现一次假红 |
| BS-10 覆盖度是渐进的（约 30 条有验收级反例） | 逐条反例成本高 | 个别行可能接住同形符号 | 改了接口而某条没红 |
| BS-11 进表条件是判断题 | 要读代码判断静默 vs 抛错 | 少一条/多一条 | 某次失效既没进表也没抛错 |
| BS-12 A53 只锁整段替换 | 文本匹配边界 | 加早退抓不到 | `rootOf` 方向反转而全绿 |
| BS-13 插件代码会被别的会话并发改动 | 那是别人的在途工作 | 本文件的 site 与计数可能再次过期 | 执行时 Step 0 读到的代码与描述不符 |
| BS-14 右边界前瞻的两个已知绕过 | 要剥注释才根治 | 个别联合成员漂移不被抓 | 宿主用这两种排版引入联合成员而哨兵绿 |
| BS-15 三处「成员集合」没进断言面 | 预算与范围 | 插件零报错地丢字段 | 模型侧缺描述/缺消息块而哨兵绿 |
| BS-16 首行版本是桌面壳版本、`bytes` 单位 | 只影响可读性 | 版本对不上时多看一行 | 首行版本与实际宿主包不符 |

## Routes

| Route | Agent | 状态 | 覆盖 | 限制 |
|---|---|---|---|---|
| Goal and Implementation（round 9） | r8-goal（reused） | finished | v10 + 自建参考实现与 12 个变异 | 记忆暴露；单安装 |
| Adversarial（round 9） | r9-adv（新） | 已派发，未在本记录定稿前回收 | v10 全文 | 若其结果在本记录写入后到达，按 O-「v11 未开 round」处理：它的条目属于下一轮 |
| — | — | — | — | 预算 10 已用满；v11 未开 round |

## 下一步可执行动作

1. 执行 Step 0–5（哨兵 + `AGENTS.md` 一行 + 一次提交 + push）。这是「ready to start」的部分。
2. v11 的增量（前瞻方言统一、3b 的 `\s`、A64 收窄、§6 读法、BS-15/16、控制字符）请按 O-「v11 未开 round」再请一位独立评审代理只查这 8 个位置——那是一次窄口径复核，不另计版本。
3. 两处收敛不重启，除非用户在看到 0.9.0 的现状后明确要求另开一轮。

## 裁决与修订记录

### 用户裁决（2026-11-25，经 lead 转达）

1. **Decision 11（撤回收敛）定稿**：评审期间环境被并发改动，正确动作是撤回而不是硬改；收敛不重启。
2. **O-「v11 未开 round」不再派第二条评审链**，改由**执行期取证**（F7 判：哨兵是静态正则表，写错只产生假红/假绿，假绿会在下次升级时以插件当场报错的方式暴露，不可逆性为零，属低价值边界）。处理值已改成上面那条。
3. **撤回一个想法**：「把冷唤醒探针并进 compat-check」作废——探针要真的唤醒一个会话（造状态、不可重复），compat-check 是静态文本扫描，并进去只会多一套机制（按 F1 不合并）。0.9.0 那次 woke: true 的一次性实测已是它的全部证据。
4. **执行暂不开始**：用户原话「本轮只出方案」，等放行后按 Step 0–5 一次提交。

### 修订记录

- **2026-11-25 · layout 修订（不改技术含义）**：### S6 为什么本方案里没有那两处收敛 原夹在 ### S4 与 ### S5 之间（从 S4 改名来的残留），现整节移到 ### S5 文档、版本与交付 之后，节序回到 S1→S6。纯段落位置变更，未改任何行为、约束、步骤或验收项；按规则不需要重跑 R12（作者已核对：64 行表、§6 十四行、§5 No-go 十一项的文字一字未动）。哈希随之为 2846d71…63afb1（修订前 379a9012…f37618）。
