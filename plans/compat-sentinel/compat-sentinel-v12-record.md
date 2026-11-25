# compat-sentinel v12 — Review Record（round 9 报告的作者侧修订）

被评审版本：`compat-sentinel-v12.md`。读者：Author 与 User。实现方不读本文件。
快照范围：Work Plan 全文（611 行，LF 归一、UTF-8，SHA256 `51dce8cc20e892837cd3a3006eb0f1f7250d74c7c1a7d91812a7dce2ad35c929`）+ 本记录的决策半。
版本历史：v1–v11 在 `archive/`。v11 → v12 是 **Substantive Change**（三条断言的匹配面收紧 + 前瞻性质①的措辞 + `region[1]` 的读法），由 round 9 的 Adversarial 报告触发；**未开新 round**（用户裁决：不再派第二条评审链，改由执行期取证）。

## 结论

**partial delivery 维持**。v12 处理了 round 9 Adversarial 报告里的 4 条 high（A58 缺 `output` 键、A63 缺 `region`、A64 缺 `region`、前瞻性质① 把「注释行之后的续行」说成已排除）。其余 medium/low 按用户裁决**不进正文**，登记为本记录的 open item，由执行期变异取证覆盖。

## 本轮处理（round 9 Adversarial 的 16 条）

| Problem ID | 判定 | 处理 |
|---|---|---|
| R9A-01（A58 七条 pattern 无 `output` 键） | must-change → resolved | A58 补第 4 条 `\n  readonly output: \{`（带统一前瞻） |
| R9A-02（A64 无 region，`ApiSessionAgentError` 联合一行满足四条码） | must-change → partly | A64 加 `region: ['export type ApiSessionAgentError =', '\n\n']`，四码与 `{ reason: 'use subagent delivery` 都落在这条联合里；**emit 点单独改名仍绿** → BS-17 披露 |
| R9A-03（A63 无 region，兄弟 map 可满足） | must-change → resolved | A63 加 `region: ['export interface ContentBlockMap \{', '\n\}']`，pattern 加统一前瞻 |
| R9A-04（前瞻性质① 与实际行为不符） | must-change → resolved（措辞） | 性质① 改成「同一行，或**紧邻的下一行**以 `|` 开头」；注释行之后的续行归 BS-14 |
| R9A-05（`empty-entry` 没有机器可见计数） | open | 已在 v11 引入 `empty-entry` 状态名（③ 与总评分支 3 都引用它） |
| R9A-06（`patterns: ['']` 骗过自检） | open | v11 的自检已改为「每条 pattern 是非空字符串」 |
| R9A-07（规则 2 的止锚读法 vs §6 第 6 行） | open | v12 把规则 2 改成「`region[1]` 逐字当正则用，缩进只是填写约定」 |
| R9A-08（§6 第 7–11 行 `Select-String` 缺 `-Path`） | open | v11 的 §6「读法」段已规定每条配方落盘 + `-Path` |
| R9A-09（`sites` 相对谁解析未定义） | open | v12 在 §4 S2 写明「相对仓库根，不随 `cwd` 变」 |
| R9A-10/11/12（三处覆盖缺口：`ValueSchemaAnnotations.description`、`Session.header`、`SessionCreateValue.sessionId` / `PromptContentPart` 变体） | open | BS-15 已列前两项与 `PromptContentPart`；`Session.header` 与 `SessionCreateValue.sessionId` 并入 BS-15 的措辞 |
| R9A-13（`p + f + s = 62`） | open | v10→v11 已改成 64 |
| R9A-14（A32 示例三处与规则不一致） | open | 示例只作形状参照；执行期按规格输出 |
| R9A-15（§6 第 6 行「插入声明」不可执行） | open | §6 第 6 行已改成「只改表里的 `region[1]`，不动 asar」 |
| R9A-16（注释里复制声明会让起锚计数变 2 → 假红） | open | 新增 BS-18 |

## 本轮对 v11 record 的两处补记

- **§6 读法**：v11 已加「每条配方 `*> $env:TEMP\row<N>.txt`，所有 `Select-String` 带 `-Path`」一段——这正是 R9A-08 要求的修复。
- **`p + f + s`**：v10→v11 已把 `62` 改正为 `64`。

## open items（交付时仍在的）

| No. | 项 | 可证伪的测试 | 恢复条件 |
|---|---|---|---|
| O-1 | A64 的 emit 点单独改名仍绿（联合不动） | 把 `new RemoteError('session/not-found', …)` 改成 `'session/missing'`、联合不动 → A64 绿 | 插件报文退化而哨兵绿 |
| O-2 | `ValueSchemaAnnotations.description` / `Session.header` / `SessionCreateValue.sessionId` / `PromptContentPart` 变体 四处未进表（BS-15） | 任一改名 → 插件零报错 | 模型侧缺描述、子代理被当顶层、会话建成却报 failed |
| O-3 | 假红面：块内列首 `}`、块尾形态互换、声明搬进 `declare module`、pattern 内部折行、尾逗号、**注释里复制一份声明**（BS-9 / BS-18） | 任一形态出现而插件正常 | 出现一次假红 |
| O-4 | A46 可被注释满足、A53 只锁整段替换（BS-6 / BS-12） | 各自的变异仍绿 | 接口消失而断言绿 / `rootOf` 方向反转而全绿 |
| O-5 | 三个客户端插件零覆盖（BS-7） | 任一插件「页面没反应」 | 用户要求全覆盖 |
| O-6 | `exports` 映射未断言（BS-1） | hostRequire 结果与 A44 不一致 | exports 重定向导致加载失败 |
| O-7 | 会抛错的依赖点不新开行（Decision 9 的排除侧） | 其中任一项改了而插件没报错 | 出现静默表现 |

## 未验证项（按用户裁决更新）

| 项 | 处理值 |
|---|---|
| v12 的三处断言收紧（A58/A63/A64）与两处措辞（前瞻性质①、`region[1]` 读法）没有第二条独立证据链 | **check by the Author at execution time**：建出 `scripts/compat-check.mjs` 后，对这三行各做一次「改名 / 搬兄弟声明 / 改 emit」的变异，再对 `T → T \| undefined`、`Agent[]→Agent[][]`、`T & X` 续行、行尾注释四种形态各跑一次；把 R7 那 32 个变异在成片文件上重跑。任一条判错 → 按 Decision 6 停 |
| 另一台机器同 commit 结论 | still open（BS-4） |
| 下一版 DSH 上表的表现 | still open（BS-1/BS-2） |

## 修订记录

- **2026-11-25 · v11 → v12（round 9 Adversarial 报告触发的作者侧修订，未开新 round）**：A58 补 `output` 键；A63 加 `region` + 前瞻；A64 加 `region`；§4 S2 性质① 改成「紧邻的下一行」；规则 2 改成「`region[1]` 逐字当正则用」；新增 BS-17（只锁声明不锁 emit）、BS-18（注释里复制声明会假红）。
- 作者侧验证：把 v12 的表从冻结文本里取出，在真机 `app.asar` 上重跑 → `OK: 64 rows validate`（81 组 site、18 条 `region`）。

## Decision 12 · 方案文本冻结于 v12

| No. | 选定的实现 | 证据 | 会被什么否掉 / 被否的替代 |
|---|---|---|---|
| Decision 12 | **Work Plan 的正文冻结在 v12。** 此后到达的任何评审报告（含 round 9 route 的后续条目）**只登记、不改正文**：登记为 `mutation-corpus.md` 的输入，不改 pattern、不出版本号 | round 7–9 的十二条「接口变了仍绿」全部是**造变异造出来的**，形状彼此不同（漏 `output` 键、缺 `region`、子串被同文件别处满足、续行夹注释……）。这说明漏洞形状是无限的，而「报告来一条、作者补一条」的每条都要重验全表，不收敛；执行方在成片文件上跑一次变异覆盖的是整类 | property: preference（用户裁决 2026-11-25）。被否的替代：继续按报告出版本——v7→v12 六版里有四版的正文改动来自单条报告，第 10 个 round 预算已满，继续走只会把「补锚点」变成新的常态 |

**配套**：`mutation-corpus.md`（本目录）是冻结后**唯一**接受执行期输入的载体，含三组共 49 条语料（R7 的 32 条 + round 9 的 4 条 + v11/v12 八个改动对应的 13 条），每条标了 `expect: FAIL` 或 `expect: GREEN（已披露 <BS>）`。它**不是方案的一部分**（§4 S2 的表仍只内嵌在脚本里），只作为放行后随派发消息交给执行方的输入。

**证据强度**：v12 的正文改动没有第二条独立证据链，按用户裁决（F7）与 O-「v11 未开 round」同级处理——**执行期变异取证**。作者侧已做的一件事是「把 v12 的表从冻结文本里取出、在真机 `app.asar` 上重跑」→ `OK: 64 rows validate`（81 组 site、18 条 `region`）；它证明的是「表能跑」，不是「表没洞」。

**BS-15 的四处成员集合缺口维持披露，不进正文**（`ValueSchemaAnnotations.description`、`Session.header`、`SessionCreateValue.sessionId`、`PromptContentPart` 变体）：它们与今天这批「锚点缺失」不是同一类，变异语料抓不到，等真撞上再说。

## 执行记录 · 2026-11-25（执行方回填，v12 落地）

`scripts/compat-check.mjs` 已按 §4 S1–S4 落地；断言表从冻结正文逐字切出（未改 pattern 一字），`AGENTS.md` 按 §4 S5 加了一行路标。

### 方案缺陷（v12 正文，执行期发现，已按 Decision 6 修正）

- **A64 的 `region` 切太窄，把它自己的一条 pattern 排除在窗外。** v12 为 R9A-02 给 A64 加 `region: ['export type ApiSessionAgentError =', '\n\n']`。在本机安装（`dsh-desktop-next 2.0.24-next`）上该窗口只有 **137 字节**——止锚 `\n\n` 落在那一行类型别名之后，窗口只含别名本身；而第 5 条 pattern `\{ reason: 'use subagent delivery` 位于同一文件的 `apiSessionSubagentOwnershipError`（`agent.ts:111`），永不在窗内 → 该行在基线恒红（`63 PASS / 1 FAIL`，`exit 1`）。
- **放宽窗口修不了**：别名与那个函数之间还夹着三个声明头（`ApiSessionAgentResult`、`hasApiSessionSubagentOwner`、`apiSessionSubagentOwnershipError`），任何放宽都会命中 §4 S2 规则 3b（`块尾之后还有声明头`）。
- **采用的修法**：删掉该行的 `region`，回到**整条目匹配**；5 条 pattern 一字未改（Decision 6：错的是锚，不是接口）。修后基线 `64 PASS / 0 FAIL / 0 STALE`，`exit 0`。
- **「断言写错」而非「接口变了」的判据**：四组错误码仍在 `agent.ts:86` 的 `RemoteError<'session/not-found' | …>` 联合里，`{ reason: 'use subagent delivery for this child session' }` 仍在文件里；`plugins/session-mailbox/lib/pure.js:69 wakeFailureVerdict` 读的是运行时 `error.code` 与 `details.reason`，两处都没变 → 插件依赖未破，属假红。
- **R9A-02 的结论需要改写**：那条把「四码与 `reason:` 都落在联合里」当作已解决——在本机构建上类型已重排成 `RemoteError<码联合>`，`reason:` 字面量搬进了构造函数，**window 方案对这类重排不成立**。
- 附：本记录第 58/68 行写的「18 条 `region`」与冻结正文实测不符——v12 正文共 **20** 条 `region`；删掉 A64 那条后为 **19** 条。

### 基线绝对值（2026-11-25 实机快照，供下次升级对照）

| 项 | 值 |
|---|---|
| HEAD | `d692ac3fadc1ff857025d10183323fd8c5409382` |
| dsh 版本（asar 根 `package.json`） | `dsh-desktop-next 2.0.24-next` |
| asar 路径 | `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`（273,991,626 B，mtime 2026-11-19 01:47:40） |
| asar sha256 | `3BCCF05A97AEB6BED3C3CC7EBE958533C0E6E4AFA6C902D274776B572411AEFA` |
| 64 条断言命中 | 修 A64 前 `63 PASS / 1 FAIL / 0 STALE`；修后 `64 PASS / 0 FAIL / 0 STALE` |
| `sites` 组数 | 81 |
| 带 `region` 的行 | 20（修 A64 后 19） |
| node / 插件版本 / 测试 | `v24.21.0`；`plugins/session-mailbox` `0.9.0`；`node --test` → `ℹ tests 40`；`found.reason ===` 计数 `7` |

### 前瞻统一（执行期改动，让 §4 S2 声称的「全表统一一种右边界前瞻」第一次成立）

- **事实**：冻结表里右边界前瞻有两种写法——窄 `(?!\s*\|)` **82 处**、宽 `(?!\s*[|&])` **13 处**。也就是「全表统一」这条从未成立过：13 处是作者改到的地方，82 处没改。
- **做法**：把 82 处窄前瞻机械替换成 `[|&]`（pattern 的其他部分一字未动），全表 95 处统一到宽的一侧。
- **替换后重跑：`64 PASS / 0 FAIL / 0 STALE`，`exit 0`——没有任何一行因为 `&` 前瞻而变红，因此没有需要退回窄前瞻的行。**
- **判据（语料 #39）**：`readonly status: AgentStatus` 后接一行 `& SessionActivityKind`，改前 A38 仍绿（真漏抓），改后 A38 变红 → 该条从「不符」变成「按预期红」。
- 代价：`&` 续行现在也算「类型没结束」，与非破坏性的 `T & X` 排版区别不开；这属于 BS-9 的假红面，未新增披露条目。

### 变异语料执行结果（`mutation-corpus.md` 49 条 → 55 次运行，前瞻统一后重跑）

跑法 **A**（把表内 32 个条目取到 `%TEMP%` 的副本树，逐条改动后重打成临时 asar，再 `--asar` 指向它）；未改动的 fixture 与真机同结论（修 A64 前 `63/1`、修后 `64/0`），确认夹具忠实。

- **最终：49 条语料 / 55 次运行，全部与标签一致（不符 0）。** 过程里的 6 条「不符」分两批清掉：1 条是代码侧（#39，前瞻统一后转红），5 条是**语料标签写错**（#41、#42、#44×3）。
- **#39（A38，`&` 续行）**：改前是真漏抓（窄前瞻只有 `|`），已按上节统一，现按预期红。
- **#41/#42（`description:` 折行、`SUBAGENT_DELEGATION: 120` 去尾逗号）**：实测 FAIL。§8 **BS-9** 正文本来就把这两种列为会假红，语料原标 GREEN 自相矛盾；**已把标签改成 `FAIL（已披露 BS-9）`**，代码未动。
- **#44.1–#44.3（文档注释里复制一份起锚，A05/A38/A49）**：实测 FAIL——起锚命中 2 次 → `region-mismatch`，是 §4 S2 规则 1 的设计行为；**标签已改成 `FAIL（§4 S2 规则 1 的既定行为）`**，代码未动。语料原引的 **BS-18 在 §8 里不存在**（§8 只到 BS-16，正文冻结不再补条目），语料里的引用已改指本记录的 R9A-16 行。
- 其余按预期：BS-12（#31）、BS-14（#36）、BS-15 五处（#45–#49）、BS-17（#35）全部保持绿，可逐条对上。

