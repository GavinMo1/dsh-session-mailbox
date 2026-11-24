# user-model-tools v5 — Work Plan

Version v5. This plan is self-contained. The implementation does not read the review record.
（v5 相对 v4 只改提交推送段、`skipped` 判据、匹配拼接与 A2 夹具，无结构变化。）

## 1. What the User wants

> "我觉得可以设计一个写入脚本和读取脚本。AI只需要通过读取脚本，通过输入一些关键词什么的，就能拿到对应的一些内容。至于写入脚本，是为了保证读取脚本能够正常维系。"

Scope: 一个私有库 + 读、写两个入口。**读**：给关键词，拿回最多 3 条命中的正文与命中总数。**写**：只有经过 `approve` 的条目才进入读集合，因此读永远能解析到它扫到的全部条目。

## 2. Core Task and failure symptom

**Core Task**:
(a) Agent 用关键词取回相关条目，一次最多 3 条（含正文），并知道共有多少条命中；
(b) 读接口输出**就是当前 `entries/` 里能解析且已批准的条目**；不能解析或未批准的文件必须被逐条报出，不得静默消失；
(c) 一条记录进入读集合需要两次操作：`append` 落到暂存区，`approve` 写入同意来源、搬入正式区并提交推送；
(d) 写入拒绝破坏读所依赖的结构：重复 id、非法 kind、超长、坏日期、保留字符；
(e) 中文按词组匹配——查询「深色」能命中「偏好深色主题」；
(f) 同主题以**较新的一条为准**，且这一点由排序保证，不靠提示词。

**Failure symptoms**（任一成立即未达成）:
- **S1**：库里有对应条目，Agent 仍然问了 User。
- **S2**：`approve` 之后，紧接着的 `search` 查不到它，或另一台机器 `pull` 之后查不到它。
- **S3**：未批准、无法解析、或**已被更新条目取代**的答案被当成唯一答案返回，且输出里没有任何区分。
- **S4**：`total` 与实际匹配条目数不符，或返回超过 3 条正文。

## 3. Start instructions

1. 顺序：Step 0 → 1 → 2 → 3 → 4 → 5 → 6。前一步完成测试不通过，不得开始下一步。
2. **Step 3 是硬闸**：暂存与批准两段、批准时的独占落位、以及批准后的提交推送，三件必须同时成立。
3. **所有验收都在临时库上跑**。每条 recipe 第一步必须跑 `um status` 并断言输出里的 `root:` **不等于**真库路径；`UM_HOME` **只被 `bin/um.mjs` 读取**，插件永远用 `os.homedir()` 解析。
4. **A8、A9a、A9b 由 User 执行**（执行 Agent 无法自建带指定 cwd 的会话）。
5. 卡住时：Step 0–2 内部卡住自己换等价写法；Step 3 硬闸失败、写 `C:\Users\<user>\.dsh\profiles`、A9 红且原因是模型判断、`check` 报 `future date` 时，停下报告。
6. 对应关系：**Step 0 → A7**；**Step 1 → A1**；**Step 2 → A3、A4、A10**；**Step 3 → A5、A6、A11**；**Step 4 → A8**；**Step 5 → A2**；**Step 6 → A9a、A9b**。

## 4. Steps

### Step 0 — 库仓库初始化

```
C:\Users\<user>\.agents\user-model\
  README.md          规则说明（查 / 写 / 批准 / 同步）
  entries\           已批准的条目
  entries\.pending\  暂存
  .gitignore         entries/.pending/ 与 entries/*.tmp
```

`git init` + 首次提交 + 私有远端 `GavinMo1/user-model`。建库前确认 `C:\Users\<user>\.agents` **不是** git 仓库。

**完成测试**：A7。

### Step 1 — 代码骨架（`dsh-plugins/plugins/user-model`）

```
package.json  cordis.patch.yml  index.js
lib/um.mjs     纯逻辑，零依赖
lib/paths.mjs  CLI 用：UM_HOME 优先，否则 os.homedir() + .agents/user-model
               插件用：只用 os.homedir()
bin/um.mjs     CLI: search / append / approve / sync / check / status
tests/um.test.mjs
```

无索引、无缓存、无派生数据。

**条目格式**（唯一格式）。front-matter 七个字段：

```
---
schema: 1
id: 20261124-commit-lang
date: 2026-11-24
kind: decision
staged-on: 2026-11-24T09:12:03Z
approved-by: user, 2026-11-24
approved-on: 2026-11-24T09:15:40Z
---
title: 提交信息用中文
<body>
```

| 字段 | 规则 |
|---|---|
| `schema` | 恒为 `1` |
| `id` | 等于文件名去扩展名；文件名前缀 `YYYYMMDD` 取自 `date` |
| `date` | `YYYY-MM-DD`；**可等于今天或明天**，更晚即 `bad date` |
| `kind` | `fact` 或 `decision` |
| `staged-on` / `approved-on` | ISO-8601 UTC，形如 `2026-11-24T09:12:03Z`；`approved-on` 在批准前为空 |
| `approved-by` | 自由文本；批准前为空 |
| `title` | 1–60 字符；**不得含任何换行符（含 `\r`）或 `\|`** |
| `body` | 1–400 字符；**可含换行；不得含 `\|`；不得含整行等于 `---`**；写入前把 CRLF 归一成 LF |

`tokenize(q)` 规则：

1. 汉字与其它字符之间切段；ASCII 段内 `#`、`+`、`.`、`-`、`_` 视为词内字符，不切。
2. ASCII 段长度 ≥1 时小写化后保留。
3. 汉字段长度 1 → 保留该字；长度 ≥2 → 生成全部相邻二字组。
4. 去重。结果为空的查询（无参数、纯符号）是错误，见 Step 2。

`matchScore(entry, tokens)` = `tokens` 中出现在 `title + '\n' + body`（不区分大小写）里的个数。两个字段之间必须插入分隔符，否则「深」结尾的 title 与「色…」开头的 body 会拼出并不存在的词。

**完成测试**：A1。

### Step 2 — 读接口（只读，不建目录）

`bin/um.mjs search <关键词...>`：扫 `entries/` 顶层的 `*.md`（跳过 `.pending/` 与 `*.tmp`）→ 逐个解析并校验 → 匹配 → 排序 → 输出。

- **不得创建任何目录或文件。** 库或 `entries/` 不存在时按空库处理，但必须在输出里区分（见 `# library:`）。
- `tokens` 为空 → `error: no keywords`，非零退出。
- 校验不通过的条目进入 `skipped`：解析失败、`schema` 不是 1、id 与文件名或 `date` 不符、kind 非法、title/body 越界或含保留字符、`approved-by`/`approved-on`/`staged-on` 为空或非 ISO-8601 UTC、落在 `entries/` 顶层的非 `.md` 非 `.tmp` 文件。**`date` 是否「过晚」不在此列**：另一台机器时钟超前时条目必须仍可读，这一项只在 `check` 里报。
- 排序：**`date` 降序为主键，`matchScore` 降序为次键**；取前 3 条。
- 输出（元数据行一律以 `# ` 开头，数据行一律以 id 开头）：

```
# library: ok
# root: C:\Users\<user>\.agents\user-model
# staged: 3
<id> | <date> | <kind> | <title> | <body 单行，换行替换为空格>
# total: <匹配条目数>
# skipped: <文件名>
# no match
```

`# library:` 取 `ok` / `missing`（库根或 `entries/` 不存在）——这样「没同步下来」与「确实没记过」在输出上可分，提示词据此判断。

三种状态写死：有命中 → 数据行 + `# total:`；零命中 → `# no match`（仍打 `# total: 0`）；有 skipped → 每个文件一行 `# skipped:`，位置在 `# total:` 之后。`# root:` 与 `# staged:` 恒出现。

**完成测试**：A3、A4、A10。

### Step 3 — 写接口（硬闸）

`bin/um.mjs append --slug <..> --kind <..> --title <..> --body <..> [--date YYYY-MM-DD]`

先 `mkdir -p entries` 与 `entries/.pending`。执行顺序（任一不通过即不写入、非零退出）：

1. `--slug` 不匹配 `^[a-z][a-z0-9-]{0,40}$` → `error: bad slug: <值>`
2. `--kind` 不是 `fact`/`decision` → `error: bad kind: <值>`
3. `title` 为空、超过 60 字符、或含换行/`|` → `error: bad title: <原因>`
4. `body` 为空、超过 400 字符、含 `|`、或含整行等于 `---` → `error: bad body: <原因>`
5. `--date` 不是 `YYYY-MM-DD`，或晚于本机明天 → `error: bad date: <值>`
6. 同 id 已存在于 `entries/` 或 `entries/.pending/` → `error: entry exists: <id>`

通过后：清掉本 id 的陈旧 tmp → 写 `entries/.pending/<id>.md.<pid>-<rand>.tmp`（`wx`）→ `fs.linkSync` 到 `entries/.pending/<id>.md`（目标存在 → `error: entry exists: <id>`）→ 删除 tmp。**任一步失败时也必须在返回前删掉本次的 tmp。** 成功打印 `staged: <id>`。

`bin/um.mjs approve <id> --approved-by <来源>`

先 `mkdir -p`。执行顺序：

1. `--approved-by` 去空白后为空 → `error: approved-by is required`
2. `entries/.pending/<id>.md` 不存在 → `error: unknown pending: <id>`
3. 该文件解析失败，或 id/`date`/`kind`/`title`/`body` 任一不合规 → `error: bad pending: <原因>`
4. `entries/<id>.md` 已存在 → `error: entry exists: <id>`

通过后：读 pending → 填入 `approved-by` 与 `approved-on`（当前 UTC）→ 写 `entries/<id>.md.<pid>-<rand>.tmp`（`wx`）→ `fs.linkSync` 到 `entries/<id>.md`（目标存在 → `error: entry exists: <id>`）→ 删除 tmp 与 pending → 提交推送。

**任何一条错误路径都必须在返回前删掉本次自己创建的 tmp**（`finally`）。否则失败方的 tmp 会留下，`check` 永久报 `stale tmp`，而失败方拿到的错误串里没有任何提示。

提交推送：`git -C <root> add -- entries/<id>.md` → `git -C <root> commit -m "entry: <id>" -- entries/<id>.md` → `git -C <root> push`。

- 提交**路径限定**且消息固定：不读编辑器、不扫入别人的改动（并发 `approve` 不会把另一条一起提交）。
- `add` 或 `commit` 失败 → `error: commit failed: <reason>`；`push` 失败 → `error: push failed: <reason>`。两种情况下**条目已落在 `entries/` 且本机可读**，只是尚未到达远端：退出码非零，但 must **不删除**已落位的条目。
- 失败后由 `bin/um.mjs sync` 补偿：对 `git status --porcelain` 中属于 `entries/` 的文件逐个 `add` + `commit -m` + 一次 `push`，成功打印 `synced: <n>`。
- **成功打印 `approved: <id>`。**

- **落位 must not 用 `fs.rename`**：Node 的 `rename` 在目标存在时覆盖。
- 若文件系统不支持硬链接（`EPERM`/`ENOTSUP`），退化到 `fs.copyFileSync(tmp, target, COPYFILE_EXCL)` 再 `unlink` tmp；`COPYFILE_EXCL` 在目标存在时抛 `EEXIST`，映射为 `error: entry exists: <id>`。

正向输出与 body 一致性：批准前后 `body` 必须逐字节相同（只改 front-matter 两个字段），A5 用哈希核对。

**完成测试**：A5、A6、A11。

### Step 4 — 插件接线与启用

`index.js` 的 `apply` 注册三个工具并注入提示词：

- `user_model_search({ keywords: string[] })`
- `user_model_append({ slug, kind, title, body, date? })` → `{ id }`
- `user_model_approve({ id, approvedBy })`

注入五行（原文）：

```text
Before asking the user anything that may be a durable preference or an already-made decision, call user_model_search.
Query shape: pass 1 to 3 concrete content words, not a sentence. Results are ordered newest first; when several entries cover the same subject, the newest one is the answer.
If the output has any "# skipped:" line, this read was incomplete: do not conclude the library lacks the fact, and report the skipped files.
Recording is two steps: user_model_append stages an entry and returns its id; user_model_approve makes it searchable. Call approve with the id that append returned, and only after the user says in their own words that this entry should be kept.
There is no "replaced" flag: to change an earlier decision, record a new entry; the newer date wins.
```

插件解析库根 must 只用 `os.homedir()`，忽略 `UM_HOME`。提示词里不出现任何路径。

启用：profile 的 `package.json` 加 `link:` 依赖与 `dsh.profile.bundles` 条目 → `pnpm --dir <profile> install` → `plugin_manager` 的 `set_plugin` 以 `include:user-model` 先 `enabled:false` 再 `true`。写 profile 之前先报绝对路径并等一句确认。**启用前确认当前环境未设置 `UM_HOME`。**

**完成测试**：A8。

### Step 5 — `check` 与 `status`

`bin/um.mjs check`（只读）：逐个文件校验 `entries/` 顶层与 `entries/.pending/`，命中任一即非零退出并打印 `<原因>: <文件名>`：

- `parse`：七字段或 title/body 缺失、不可解析
- `schema`：`schema` 不是 1
- `id mismatch`：id ≠ 文件名去扩展名，或文件名前缀 ≠ `date` 去连字符
- `bad kind` / `bad title` / `bad body`：取值不合规（含保留字符 `|`，body 含整行 `---`）
- `bad time`：`staged-on`/`approved-on` 非 ISO-8601 UTC
- `unapproved`：`entries/` 顶层的条目 `approved-by` 或 `approved-on` 为空
- `stray file`：`entries/` 或 `.pending/` 顶层出现非 `.md` 且非 `.tmp` 的文件
- `stale tmp`：存在 `*.tmp` 文件
- `future date`：`date` 晚于本机明天

干净库上退出 0 且无输出。

`bin/um.mjs status`（只读）：打印 `library: <ok|missing>`、`root: <绝对路径>`、`entries: <n>`、`staged: <m>`，随后每行一个 `staged id: <id>`。库里没有任何东西时也打印这四行。

**完成测试**：A2、A6。

### Step 6 — 真机验收（A9a、A9b，由 User 执行）

执行 Agent 交付两段话术与检索命令；A9a 的夹具条目 `body` 里含标记串 `ZKQ7-marker`。

**完成测试**：A9a 与 A9b 同时成立。只成 A9a → 读接口过强或提问规则被覆盖；只成 A9b → 工具没注册或注入没生效。

## 5. No-go items

- **Locked (Decision 1)**: 代码在 `dsh-plugins/plugins/user-model`，数据在 `C:\Users\<user>\.agents\user-model`。
- **Locked (Decision 3)**: 无派生数据，读每次现算。
- **Locked (Decision 4)**: 记录两段式；同意来源在 `approve` 时写入，`append` 不接受同意参数。
- **Locked (Decision 5)**: 一次最多 3 条正文；`total` 报实际匹配条目数。
- **Locked (Decision 6)**: `slug` 由调用方显式给出。
- **Locked (Decision 8)**: 没有取代链，没有条目总数上限。
- **Locked (Decision 9)**: 落位用 `link`（或 `COPYFILE_EXCL`），must not 用 `rename`。
- **Locked (Decision 11)**: `search` 与 `check` **只读**，不创建任何文件或目录。
- **Locked (Decision 12)**: `UM_HOME` 只被 CLI 读取，插件只用 `os.homedir()`。
- **Locked (Decision 13)**: `approve` 成功必须以本地提交并推送收尾。
- 不改 `app.asar`；不替换 `@deepseek-ai/*` 包；不禁用 profile 既有插件；不引入运行时依赖。

## 6. Acceptance

**约定**：Exit 列 `0` 表示每条命令返回 0 且结果与 Expected output 一致。`expected-error` 必须失败并含引号内**确切**字符串。命令一律用 `node -e`，不用 `touch`/`Get-ChildItem`。**每条 recipe 第一步跑 `um status` 并断言 `root:` 不是真库路径**；所有写操作都在 `UM_HOME` 指向的临时目录里。`session_event_search` 必须带 `event_types`。

| # | Recipe | Exit | Expected output set |
|---|---|---|---|
| A1 | `node --test plugins/user-model/tests/um.test.mjs` | 0 | 含 `ℹ fail 0`；`ℹ pass N` 且 N ≥ 12；≥12 个互不相同的 `CASE ` 名，其中必须含 `CASE tokenize-cjk`、`CASE tokenize-empty`、`CASE link-exclusive`；无 `ERR_MODULE_NOT_FOUND` |
| A2 | 临时库：`status` → `append` → `approve` → 新进程 `search` → `node -e` 删除 `entries/<id>.md` → 再 `search`；随后 `git clone <临时库> <第二个目录>`，以 `UM_HOME=<第二个目录>` 跑 `search` | 0 | `status` 首行 `library: ok`，`root:` ≠ 真库路径，`entries: 0`、`staged: 0`；第一次 `search` 命中且 `# total: 1`；删除后 `# no match`；`entries/` 顶层未出现非 `.md`/`.tmp` 文件；克隆目录里的 `search` 同样命中该条（证明提交推送生效） |
| A3 | 造 3 条同日（`date` 相同），其中两条 `title` 含「提交」、一条不含；再造一条 `title: 深色主题`、`body: 偏好深色主题`；`search 提交`；`search 深色`；`search zzzz` | 0 | 第一次数据行 ≤3、`# total: 2`；第二次命中「深色主题」那条（二字组）；第三次 `# no match` 且含 `# total: 0` |
| A4 | 排序：造 A（`date` 早，body 里查询词出现 3 次）与 B（`date` 晚，查询词出现 1 次），`search` 该词 | 0 | 第一行数据是 B（日期为主键）；A 在第二行或不在结果里，但不得排在 B 之前 |
| A5 | 前置：成功 `append --slug a5dup`。依次：`--slug Bad_Slug`；重复 `--slug a5dup`；`--kind other`；`--title` 61 字符；`--body 401` 字符；`--body "a|b"`；`--date 2099-01-01` | 0（`expected-error`） | 七次分别含 `error: bad slug: Bad_Slug`、`error: entry exists: `、`error: bad kind: other`、`error: bad title: `、`error: bad body: `、`error: bad body: `、`error: bad date: 2099-01-01`；七次后 `.pending/` 文件数不变 |
| A6 | 两段式与独占落位：`append` → `search`（应查不到）→ `node -e` 把 `.pending/<id>.md` 复制成 `entries/<id>.md` → `check` → 删除该副本 → `approve <id>`（不带 `--approved-by`）→ `approve <id> --approved-by "user, 2026-11-25"` → `search` | 0（含 `expected-error`） | 第一次 search 无该 id（未批准不可读）；复制后 `check` 非零且含 `unapproved: `；不带 `--approved-by` 含 `error: approved-by is required`；随后 `approved: <id>`；第二次 search 命中且 `# total: 1` |
| A7 | 结构 | 0 | `git ls-files` 每项是 `README.md`、`.gitignore`、或 `entries/` 下以 `.md` 结尾的文件；`git ls-files entries/.pending` 为空；`entries/` 顶层只有 `.md`/`.tmp` 与 `.pending`；`.pending/` 顶层只有 `.md`/`.tmp` |
| A8 | **User 执行**：两个新会话（cwd 分别在 `C:\Users\<user>` 内与 `C:\Windows\Temp`）各检索 `user_model_search` | 0 | 两次都命中 ≥1 条 `user/message`；命中文本含 `user_model_search`、`user_model_approve`、`Recording is two steps`、`# skipped:`；不含 `C:\` |
| A9a | **User 执行**：新会话问一个库中已有条目的主题；该条目 `body` 含 `ZKQ7-marker` | 0 | 会话内 `event_types: ['tool/call']` 检索 `user_model_search` 命中 ≥1；回答里出现 `ZKQ7-marker`；不出现同题反问 |
| A9b | **User 执行**：另一个新会话问库里完全没有的主题 | 0 | `user_model_search` 调用 ≥1 次且结果含 `# no match`；Agent 提问或明说拿不准 |
| A10 | 坏文件与空关键词：造 2 条，把其中一条改成纯文本；`search <另一条的关键词>`；再把两条都改坏，`search`；`search` 不带参数；最后把 `UM_HOME` 指向一个不存在的目录再 `search` | 0（第三次 `expected-error`） | 第一次命中另一条且含 `# skipped: <坏文件名>`；第二次 `# no match` 且仍列出两行 `# skipped:`；第三次含 `error: no keywords` 且非零退出；第四次输出 `# library: missing` 且退出 0 |
| A11 | 提交与推送：`approve` 后检查仓库状态；再故意让 `commit` 失败一次（临时 `git config --unset user.email`），跑 `approve`，然后恢复配置跑 `um sync` | 0 | 正常态：`git status --porcelain` 为空、`git log -1 --name-only` 含该条目路径、`search` 的 `# staged:` 比批准前少 1；失败态：含 `error: commit failed: ` 且 `entries/<id>.md` 仍在；`um sync` 打印 `synced: ` 后 `git status --porcelain` 为空 |

## 7. When to stop and ask

- Step 3 硬闸失败：两段写入、`link`/`COPYFILE_EXCL` 独占落位、或提交推送任一不成立。
- 写 `C:\Users\<user>\.dsh\profiles\*`（装插件）之前：报出绝对路径等确认。
- 库目录不可写；`C:\Users\<user>\.agents` 是 git 仓库；`git push` 失败（远端拒绝、无网络、需要认证）。
- `git pull` 产生冲突：停下问 User，不得 `push -f`，不得自行解冲突后提交。
- `check` 报 `future date`：停下，报出文件与两台机器的时钟，不得改条目。
- 任何一条 recipe 的 `status` 显示 `root:` 等于真库路径：立刻停下，说明隔离失效。
- User 划定「哪些不能记」：以边界为准，改 README 与 `validateAppend`。
- A9a 或 A9b 红，且原因是模型判断而非库内容。

## 8. Blind Spot List

- **recall-miss**：二字组与 ASCII 词匹配仍可能漏掉同义改写。回到这里的条件：出现「库里有、`search` 返回 `# no match`」。
- **precision**：至少一个词命中即算命中，常见词会把 `total` 拉大。回到这里的条件：出现「前 3 条与问题无关」。
- **no-paging**：接口没有 offset，`total` > 3 时更旧的条目只能靠更具体的词取回；配合「日期优先」排序，旧条目更容易被挤出去。回到这里的条件：出现「知道库里有但换词也取不回」。
- **consent-unverifiable**：`approved-by` 是自由文本，工具无法证明它真的来自 User。回到这里的条件：出现一条「Agent 自称获批但 User 否认」的条目。
- **cross-machine-add**：两台机器同日同 slug 得到同名文件，`git pull` 出现 add/add 冲突。回到这里的条件：第一次真实冲突。
- **pending-rot**：暂存区条目可能永远不被批准；`# staged:` 与 `status` 能让它可见，但没有清理动作。回到这里的条件：`staged` 超过 20。
- **tool-shadow**：三个工具被工具集裁剪或与其它插件重名而静默消失。回到这里的条件：A8 在任一台机器变红。
- **ask-total**：无法证明「提问总量下降」。回到这里的条件：User 要求统计。
- **git-dependency**：`approve` 依赖本机 `git` 可执行且在 PATH、已配 `user.name`/`user.email`、远端可写。任一缺失时 `approve` 报 `commit failed` 或 `push failed`，条目留在本地且本机可读，由 `um sync` 补偿。回到这里的条件：某台机器上 `approve` 连续两次报这两类错误。
- **clock-skew**：`date` 只在本机写入时校验「不晚于明天」；他机时钟领先时 `check` 会报 `future date`，但条目仍可读。回到这里的条件：`check` 在同步后报 `future date`。
