# Review Record — user-model-tools v5

Reviewed version: **user-model-tools v5**（`plans/user-model-tools/user-model-tools-v5.md`）
Snapshot scope: 方案全文 + 本记录全文。
Level: **Deep**；Tier **A（砍功能）+ 四轮机械修补**。

## Conclusion

**Pass（plan only）。** Gate 1、2、3 为真：执行 Agent 只读方案即可开工；无遗留问题会让它做出与规则相反的动作；记录能回答「为什么这么定」。

第四轮盲扫的 11 条全部落在 v4 新增的 git 段，v5 逐条闭合，未改动读接口骨架。Pass 只表示**可以开工**，不表示机制在真机上有效——A8/A9a/A9b 必须由 User 执行，P3/P4/P5 仍是 to verify。

## 四轮的收敛轨迹

| 版本 | 新发现 | high | 形态 |
|---|---|---|---|
| v1 | 39 | 9 | 派生数据与 mtime 判据 |
| v2 | 51 | 13 | 换机制后新增两态（暂存/独占落位） |
| v3 | 34 | 5 | 缺判据、状态未定义、顺序错 |

high 从 9→13→5，且 v3 那五条中没有一条是机制错。这与上一版 project（user-model v1–v5）的「修复自身成为矛盾」不同，说明骨架已经稳定。

## Level evidence

四条 Light 测试逐条不成立：写错影响所有后续会话；改变 Agent 提问行为（可见）；新增依赖（插件 + 三工具 + git push）；存在决定布局的决策点（读集合由谁决定）。故 Deep。

## Why we decided this

| No. | Selected implementation | Evidence | What would reject it, or the alternative |
|---|---|---|---|
| Decision 1 | 代码与数据分属两仓库 | `session-mailbox` 已在 `dsh-plugins` 并用 `link:` 跑通。事实。 | 单仓库会让数据改动绑死插件版本。 |
| Decision 3 | 无派生数据，读每次现算 | 首轮五处独立命中 mtime 判据；≤400 字符 × 数百条在毫秒级。事实。 | 数千条时改内容签名。 |
| Decision 4 | 两段式；同意来源在 `approve` 时写 | 首轮「approved 只判非空」；二轮「append 时填的是预言」。偏好。 | 工具仍无法证明同意来自 User（盲点 `consent-unverifiable`）。 |
| Decision 5 | 一次 ≤3 条正文；`total` = 实际匹配数 | 可判定的上界。偏好。 | 无分页（盲点 `no-paging`）。 |
| Decision 6 | `slug` 调用方给出 | 零依赖无法把中文标题转成英文 slug。事实。 | — |
| Decision 8 | 无取代链、无条目总数上限 | 两者合计贡献六条缺陷且 User 未要求。偏好。 | 需要「推翻可追溯」时，得同时定义作用域、fan-in、悬空与上限冲突。 |
| Decision 9 | `linkSync`/`COPYFILE_EXCL` 落位，禁 `rename` | 本轮实测 `renameSync` 覆盖已存在目标。事实。 | 目标文件系统不支持硬链接时退到 `COPYFILE_EXCL`。 |
| **Decision 11（新增）** | `search`/`check` 只读，不建目录 | `t-scan3` S-09：读操作 `mkdir -p` 会把「库没同步下来」写成「空库」；`t-ops` N-10 指出 `UM_HOME` 误指在输出上零差异。事实 + 偏好。 | 若要求读路径自愈（重建缓存），则必须同时定义「本次读是否完整」。 |
| **Decision 12（新增）** | `UM_HOME` 只被 CLI 读取，插件只用 `os.homedir()` | `t-adv` C-06：同一份解析被 CLI 与插件共用时，环境变量会静默把插件指向临时库，而 A8 只验提示词文本，对它无感。偏好。 | 若要插件也支持覆盖，必须加哨兵文件或 `root:` 输出 + A8 断言。 |
| **Decision 13（新增）** | `approve` 必须以 `git add/commit/push` 收尾 | `t-scan3` S-01：v3 全文没有任何步骤提交条目，多机同步在正常路径上从未成立，而 11 条验收无一条能发现。事实。 | 若某机无 git 或远端不可写，`approve` 报 `push failed` 并保留本地提交（盲点 `git-dependency`）。 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | 一个插件可同时注册多个工具与提示词注入 | **proved** | `session-mailbox` 两处 `tools.register` + 一处 `systemPrompt.context`，本轮实测在跑。 |
| P2 | 插件随 `dsh-plugins` 分发 + `link:` + `set_plugin` 重载 | **proved** | 本轮两次 `set_plugin` 返回 `application:"applied"`。 |
| P3 | `UM_HOME` 覆盖只影响 CLI | **to verify** | A2 首步 `status` 断言 `root:` ≠ 真库；§7 增加「等于真库即停」。 |
| P4 | `linkSync` 在目标存在时抛 `EEXIST`，NTFS 支持硬链接 | **to verify** | A1 的 `CASE link-exclusive` + A6 的「复制副本后 approve」用例。 |
| P5 | 本机 `git` 可执行且在 PATH，远端可写 | **to verify** | A11 断言 `git status --porcelain` 为空且 `git log -1 --name-only` 含该条目。 |
| P6 | `node --test` 与零依赖脚本可用 | **proved** | 本轮 `ℹ pass 13`、`node --check` 退出 0；node v24.21.0。 |

## Closure（第三轮 34 条）

| 类 | 源 ID | 处置 |
|---|---|---|
| 条目从未被提交推送，多机不成立 | t-scan3 S-01 | resolved（Decision 13 + A11） |
| `body` 字符集三处口径不一 | t-scan3 S-02、t-ops N-15、t-adv C-11 | resolved：body 禁 `\|`、禁整行 `---`、允许换行；三处同一套；A5 增 `\|` 用例 |
| `approve` 清单引用不存在的参数 | t-scan3 S-03 | resolved：清单改为四条，无 `--date` |
| 陈旧 `.tmp` 锁死 id 且不可见 | t-scan3 S-04、t-ops N-09、t-adv C-01 | resolved：tmp 名带 pid+随机；启动时清本 id 陈旧 tmp；`check` 报 `stale tmp` |
| 同机并发同 slug 抢同一 tmp | t-scan3 S-05 | resolved（同上，tmp 名唯一） |
| 文件名日期来源未定义 | t-scan3 S-06 | resolved：前缀取自 `date` |
| 排序与 3 条上限只写在盲点里 | t-scan3 S-07、t-adv C-10 | resolved：写进 Step 2，且改「`date` 为主键」（Decision 12 相关）→ 「较新胜」成为机制 |
| A6 夹具同时踩两条规则 | t-scan3 S-08 | resolved：拆成两段，且 `# ` 前缀使标签可定位 |
| 读操作建目录、库缺失与空库坍缩 | t-scan3 S-09、t-ops N-10 | resolved：`search`/`check` 只读（Decision 11）；`status` 打印 `root:` |
| 单字符 ASCII 关键词被丢弃 | t-scan3 S-10、t-adv C-05 | resolved：ASCII 段 ≥1 保留；空 token 集 → `error: no keywords` |
| clone 后 `.pending` 缺失 | t-scan3 S-11、t-adv B-12 | resolved：`append`/`approve` 各自 `mkdir -p`；`check` 对缺失目录按空处理 |
| `staged-on`/`approved-on` 无形态 | t-scan3 S-12 | resolved：ISO-8601 UTC，`check` 报 `bad time` |
| 跨机时钟差被判 `future date` | t-scan3 S-13、t-adv C-12 | resolved：边界放宽到「本机明天」；§7 增加停下条件 |
| 非 `.md` 文件不被 `skipped` 报出 | t-scan3 S-14、t-adv C-04 | resolved：非 `.md`/`.tmp` 文件进 `skipped`；三态输出写死 |
| A2「真库文件数不变」不可度量 | t-scan3 S-15、t-ops N-14 | resolved：改为 `status` 的 `root:` 断言 |
| `skipped` 无消费规则 | t-ops N-08 | resolved：提示词第 3 行 |
| 暂存区无枚举能力 | t-ops N-03 | resolved：`status` 列出 `staged id`；`search` 打 `# staged:` |
| 无上限后无观测 | t-ops N-11 | resolved：`status` 报 `entries`/`staged` 数（在 stdout，独立于 `check` 的干净契约） |
| **复制 pending 绕过 approve 且 `check` 放行** | t-adv C-08 | resolved：`check` 增 `unapproved`；`search` 的 skipped 判据并入 → A6 用例 |
| `approve` 重写正文 | t-adv C-09 | resolved：body 禁整行 `---`；A5 之外新增「批准前后 body 哈希一致」断言（并入 A6） |
| `link` 的 EEXIST 从未被验收触达 | t-adv C-03 | resolved：A1 `CASE link-exclusive` + A6 复制副本用例 |
| `link` 不可用时无退路 | t-adv C-02 | resolved：Step 3 写入 `COPYFILE_EXCL` 退路与错误映射 |
| 条目格式无版本 | t-ops O-05 | resolved：front-matter 增 `schema: 1`；`check` 报 `schema` |
| 其余（O-01…O-12、N-01、N-05、N-06、N-12、N-13、B-04、B-05、B-07 等） | — | 沿用前两轮处置，未回退 |

## Closure（第四轮 11 条，全部落在 v4 新增的 git 段）

| 源 ID | 处置 | v5 位置 |
|---|---|---|
| 第四轮 S-01：`commit` 无消息、`add`/`commit` 失败未定义 | resolved | Step 3：`commit -m "entry: <id>" -- entries/<id>.md`；失败串 `error: commit failed:` / `error: push failed:`；条目保留本地可读；`um sync` 补偿；A11 造一次真实失败 |
| 第四轮 S-02：并发 `approve` 的 `add`/`commit`/`push` 可交错 | resolved | Step 3：**路径限定**提交 + 固定消息，不扫入他人改动 |
| 第四轮 S-03：A2「第二个克隆上 `approve`」无对象、且推不动 | resolved | A2 改为「先 `approve` 再 `git clone`，在克隆目录里 `search`」 |
| 第四轮 S-04：`date` 过晚被他机永久 skip | resolved | Step 2 的 skipped 判据去掉「过晚」；该项只在 `check` 报；盲点 `clock-skew` |
| 第四轮 S-05：`link` 失败时自己的 tmp 不删 → 永久 `stale tmp` | resolved | Step 3：错误路径 `finally` 删自己的 tmp |
| 第四轮 S-06：`--date` 缺省值未定义 | resolved | 缺省＝本机今天 |
| 第四轮 S-07：`approve` 的 pending 校验比 `search` 松 | resolved | approve 规则 3 与 search 的 skipped 判据同源（含 `schema`、时间形态） |
| 第四轮 S-08：库缺失与空库在输出上不可分 | resolved | 输出与 `status` 新增 `library: ok\|missing` |
| 第四轮 S-09：`title + body` 直接拼接产生跨字段假命中 | resolved | 拼接改为 `title + '\n' + body` |
| 第四轮 S-10：`\r` 绕过「不得含换行」 | resolved | title 明文禁 `\r`；body 写入前 CRLF 归一为 LF |
| 第四轮 S-11：`bad time` 对 `search` 不可见 | resolved | `staged-on`/`approved-on` 的形态进入 search 的 skipped 判据 |

## What is still open

- **P3、P4、P5**：三条 to verify，各有对应验收项。
- 九条已声明盲点，各有回访条件。

## Unverified list

- A8、A9a、A9b 依赖模型在真机会话中的行为，必须由 User 执行。
- 「提问总量下降」不可证明（`ask-total`）。
- 跨机 add/add 冲突与 `git push` 在真实远端上的行为未实测。

## Choice List（未提问的默认选择）

| 项 | 选择 | 未问的理由 |
|---|---|---|
| `title` / `body` 上限 | 60 / 400 字符 | 400 让一条正文进得了一次上下文。 |
| 主结果条数 | 3 | 与 `total` 配对。 |
| 输出元数据前缀 | `# ` | 使数据行与元数据行可机械区分。 |
| 排序 | `date` 降序 → 匹配词数降序 | 让「较新胜」成为机制而非提示词。 |
| 中文切词 | 二字组 | 零依赖下唯一可用的近似。 |
| 插件与工具名 | `dsh-user-model`；`user_model_search`/`_append`/`_approve`；profile 条目 `include:user-model` | 与既有命名一致。 |
