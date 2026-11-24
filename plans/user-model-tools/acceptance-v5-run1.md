# user-model-tools v5 — Acceptance Run 1

执行日期 2026-11-24。执行环境：Windows，PowerShell 7，node v24.21.0，DSH Desktop。
方案：[user-model-tools-v5.md](user-model-tools-v5.md)。本文件只记录实测结果，不重复方案内容。

## 结论

Step 0–5 全部落地，A1–A7、A10、A11 通过。**A8、A9a、A9b 待 User 执行**（执行 Agent 无法自建带指定 cwd 的新会话），因此 Gate 未完全关闭。

## 逐条

| # | 结果 | 证据要点 |
|---|---|---|
| A1 | 通过 | `ℹ pass 18`、`ℹ fail 0`；18 个互不相同的 `CASE ` 名，含 `CASE tokenize-cjk` / `CASE tokenize-empty` / `CASE link-exclusive`；无 `ERR_MODULE_NOT_FOUND` |
| A2 | 通过 | 临时库 `status` 首行 `library: ok`、`root:` = `%TEMP%\um-a2-*\lib`（≠ 真库）、`entries: 0`、`staged: 0`；`append`→`approve`→新进程 `search` 命中 `# total: 1`；删除条目文件后 `# no match` + `# total: 0`；`entries/` 顶层只有 `.pending/` 与该 `.md`；`git clone` 出的第二目录 `search` 同样命中（提交推送生效） |
| A3 | 通过 | 同日三条中两条含「提交」→ `# total: 2`、数据行 2 条（≤3）；`search 深色` 命中「深色主题」条目（二字组生效）；`search zzzz` → `# no match` + `# total: 0` |
| A4 | 通过 | 早日期高分（body 三次「排序」）与晚日期低分（一次）同场：第一行数据是晚日期那条 —— 日期是主键 |
| A5 | 通过 | 七次错误串全部命中，`error: bad slug: Bad_Slug`、`error: entry exists: `、`error: bad kind: other`、`error: bad title: `、`error: bad body: `（两次）、`error: bad date: 2099-01-01`；七次后 `.pending/` 文件数仍为 1 |
| A6 | 通过 | `append` 后 `search` 未含该 id；把 pending 复制进 `entries/` 后 `check` 退出 1 且含 `unapproved: `；无 `--approved-by` 时 `error: approved-by is required`；随后 `approved: <id>`、`search` 命中 `# total: 1`、`# staged:` 由 2 降为 1 |
| A7 | 通过 | 真库 `git ls-files` = `.gitignore`、`README.md`；`git ls-files entries/.pending` 为空；`entries/` 顶层仅 `.pending`；`.pending/` 顶层为空 |
| A8 | **待 User** | 本会话里注入块随 `include:user-model` 关→开同步消失与复现，是注入生效的直接证据；但方案要求两个不同 cwd 的新会话，仍由 User 执行 |
| A9a | **待 User** | 夹具条目已批准：`20261124-a9-fixture`，`body` 末含 `ZKQ7-marker`，已推送 |
| A9b | **待 User** | 未造任何「库里没有」的假条目 |
| A10 | 通过 | 一条损坏 → 命中另一条并输出 `# skipped: 20261124-a3-dark.md`；两条都损坏 → `# no match` + 两行 `# skipped:`；无参数 → `error: no keywords`、退出 1；`UM_HOME` 指向不存在目录 → `# library: missing`、退出 0 |
| A11 | 通过 | 正常态 `git status --porcelain` 空、`git log -1 --name-only` 含 `entries/20261124-a6-two.md`；`--unset user.email` + `user.useConfigOnly true` 后 `approve` 输出 `error: commit failed: ` 且 `entries/20261124-a11-fail.md` 仍在且可 `search` 到；恢复身份后 `um sync` 输出 `synced: 1`，随后 porcelain 为空 |

## 实现与方案的两处偏差

1. **多了一个文件 `lib/store.mjs`。** 方案的文件清单里没有它。理由：插件要在 Host 进程内直接调用读写逻辑，而 `process.execPath` 在 Desktop 里是 DSH 可执行文件、不能当 node 用，所以不能让插件去 spawn `bin/um.mjs`。`lib/um.mjs` 仍是零依赖纯逻辑，fs/git 全在 `lib/store.mjs`。
2. **A11 的临时夹具一开始漏了 `.gitignore`**，导致 `git status --porcelain` 出现 `?? entries/.pending/`。这是夹具缺陷不是代码缺陷（真库的 `.gitignore` 由 Step 0 建立），补上后复测为空。已按方案不修改代码。

## 独立代码复审（D2）与处置

一个只读子代理对着本方案核了实现，报 6 条：1 high / 2 medium / 3 low。全部处置如下，处置后再跑 `ℹ pass 22` 与一轮回归（A2/A6/A10/A11 路径）。

| # | 严重度 | 问题 | 处置 |
|---|---|---|---|
| 1 | high | `sync` 在树干净时直接返回，**从不 `git push`**。而 `push failed` 之后提交已经存在、树是干净的 —— 于是「稍后跑 `um sync` 补偿」这条承诺是空的，条目永远到不了远端，且没有任何信号 | `sync` 改为**无论是否有待提交文件都执行一次 `push`**。已实测：把 remote 改成不存在的路径让 `approve` 报 `error: push failed: `（树干净、本地已有提交），恢复 remote 后 `um sync` 输出 `synced: 0` 且远端 `git log` 出现该提交 |
| 2 | medium | `approved-by` 原样写进 front-matter，一个换行就能写出无法解析的条目，而 `approve` 仍打印成功 → 条目掉进 `# skipped:` | 落位前拒绝含换行的 `approved-by`（`error: bad approved-by: contains a newline`）；并在落位后**重新解析读回的文件**，解析/校验不通过就不报成功 |
| 3 | medium | `readdirSafe` 把任何错误变成 `[]`，于是「存在但列不出来」的 `entries/` 被当成空库：`# library: ok` + `# no match` + `# total: 0`，且 `check` 退出 0 —— 正是 Core Task (b) 禁止的静默消失 | `readdirSafe` 用 `null` 区分「不可读」与「空」；`search`/`status` 在 `null` 时报 `library: missing`，`check` 报 `unreadable: <dir>` 并非零退出 |
| 4 | low | `Date.parse('2026-02-31T00:00:00Z')` 有效，于是 `--date 2026-02-31` 被接受 | 改为日期往返比较（`new Date(...).toISOString().slice(0,10) === day`） |
| 5 | low | 全角字符（`ａ`）与 CJK 扩展 B（U+20000+）分词后为空 → `error: no keywords` | `tokenize` 先做 NFKC 归一，改为按码点迭代，`CJK_RE` 加扩展 B 区段 |
| 6 | low | `link-exclusive` 只证明了 `fs` 原语，没覆盖落位函数的 `EEXIST → entry exists` 映射 | 导出 `land()` 并新增 `CASE land-exclusive`（目标已存在时报 `entry exists: x`、原文件不变、目录里不残留 tmp）、`CASE approve-rejects-newline`、`CASE append-bad-calendar-date`、`CASE tokenize-fullwidth` |

复审同时判定以下类别无问题：往返（`title: ` 行、`approve` 前后 body 逐字节一致、CRLF 归一）、独占落位（无 `rename`，tmp 只由 `finally` 删除）、校验表与方案一致（除第 4 条）、排序/`total`/3 条上限、No-go 项无违反。

修复后测试从 18 条增至 **22 条，`ℹ pass 22 / ℹ fail 0`**。

## 交付态

- 库：`C:\Users\ruike\.agents\user-model`，远端 `GavinMo1/user-model`（私有），`entries:` 1（A9a 夹具），`check` 退出 0 无输出。
- 插件：`dsh-plugins/plugins/user-model`，profile 已 `link:` 接线，`include:user-model` 已启用且 `application: applied`。
- 夹具清理：A9a/A9b 通过后，在库目录 `git rm entries/20261124-a9-fixture.md && git commit -m "chore: drop A9a fixture" && git push`，再 `um check`。
