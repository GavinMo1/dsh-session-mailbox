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
