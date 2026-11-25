# mailbox-wake v12 — Review Record（含实现记录）

被评审版本：`mailbox-wake-v12.md`（v12，round 12 冻结文本）。读者：Author 与 User。
版本历史：v1–v11 的全文与记录在 `archive/`（v8 **全文**缺，见 v9 记录的「流程偏差」）。

## 结论

**pass，且已实现并交付。** r11 的定向复评（`r11-focus` 新代理 + `r1-ops` 复用）给出 3 high / 1 medium / 1 low，全部落在**验收仪器**上（判据视图选错、§7 前缀判不出来），不含机制方向问题；v12 按复评给的实测修法逐条改掉，随后按用户放行（with implementation）实施，并在**重载后的 Host** 上跑完验收表：40 个 CASE 全绿、冷唤醒探针一次轮询即绿（`b'=1`、`a'=a0+1=11`）、对端真的回了 `OK`、活投递探针 `woke:false` 且转录计数 1、归档/子代理/自投/空地址/歧义五类拒绝文案逐字对上。

## 版本、级别与授权

- 当前版本 v12；已完成 round：12（r1–r10 见各版记录；r11 定向复评见下；r12 = 并入 r11 意见后的冻结文本）。
- 评审级别：**Deep**，route 数 3；r11 为定向复评（2 条 route），范围限定在 §6 冷唤醒探针与 §7 前两条——用户指定。
- `delivery point`：`with implementation`。原话：「转 pass 后直接进实现，不必再等放行」。
- 实现状态：**已实施、已重载、已验收**。

## round 11 定向复评（r11-focus / r1-ops）

| 问题 | 严重度 | 一处证据 | v12 的处置 |
|---|---|---|---|
| R11A-01：`^\[ASSISTANT\]$` 不是渲染器锚定行——`[TOOL RESULT]` / 注入正文里恰好一行 `[ASSISTANT]` 也会命中，能造出「0 条 assistant、计数 1」的假绿 | high | 合成转录（0 条 `assistant/message`）跑方案自己的命令得 `marker_lines=1`；改 `--answers` 口径后同转录为 `0`，真会话 13 = 13 | §6 的 a0 与 4b **改用 `--answers`** 视图（它跳过全部 user/tool 记录） |
| R11A-02：4b 只数「带正文的 assistant」，只跑工具不写正文的一轮永远不绿（实测一次投递 18 次工具调用、`delta=0`） | high | `r11-delta.mjs` 复算 33 次真实投递：`pass4b=false` 1/33（18 次工具调用）；首条正文前最多 54 次工具调用 | §6 新增 4c：`--tools` 的 `^\[TOOL CALL\]` 计数 `≥ t0+1`；判定改为「4a 成立 且（4b 或 4c）成立」 |
| R11A-03：宿主把工具错误渲染成 `Error: ` + message，§7 的「以 `cannot load session` 开头」对任何回执都不成立 | high | `dsh-tools/src/pipeline.ts :: toolErrorResult` 的 `` `Error: ${message}` ``；本机 255/255 条 errored tool result 以 `Error: ` 开头；12/12 宿主结局按字面 `NO RULE FIRES` | §7 开头加硬约束「先剥掉 `Error: `」，四条判据都对剥后文本做 |
| R11A-04：`unavailable` 回执不带 `cannot load session`，落进死区 | medium | 仿真：`controller missing` → 无规则命中 | §7 单列一条「含 `the sessionController service is unavailable` → 环境问题，不判 P1 被否」 |
| R11A-05：`detail` 为空时尾巴为空，被 rule2 误判成「P1 被否」 | medium | 仿真：空尾巴 / 未知 code 都落进 `P1 DENIED` | §7 把「空尾巴 / 未分类 internal」单列一条（记 `internal`，不判 P1 被否）；并新增一条「含 `belongs to subagent routing` / `is held by another writer` → 换候选」 |
| R11O-01：Step 2 第九项计数写 1，而实现后该串会出现两次（冷路径准入 + 统一尾部） | medium | 现树 1 次（活路径）；v11 的两块各产一次 | 判据改成 = 2，并在 Step 0 注明「改动前是 1」 |

r1-ops 的结论：R9O-01 / R10O-02 / R10A-04 / R10A-05 四项在 v11 里已 closed；R10O-01（`$hit` 空值 `throw`）随 4b 整体换掉而消失。

## 实现记录（v12 → 代码）

改动文件：`plugins/session-mailbox/{lib/pure.js, index.js, test/pure.test.mjs, README.md, package.json}`（`git diff --stat`：5 files, +230 / −40）。

- `lib/pure.js`：新增 `wakeFailureVerdict(error)`（四类 reason，`agent-busy` 只有 `details.reason` 含 `subagent delivery` 才算 subagent）与 `coldAdmission({allow, archived, id})`（六取值，顺序写死；内部复用 `decideDelivery`）。
- `index.js`：`apply()` 作用域新增 `wakeAgent(id)`（只统一「取 agent」，不做 `try/catch`，`agent === null` 也拒）；`send_session_message` 按 `if (found.ok === true) { 活 } else { 三条明文拒绝 → 兜底 → 冷 }` 分派，冷路径逐字按 §4 S2 6，统一尾部逐字按 §4 S2 7，输出加 `required` 的 `woke`，render 追加冷路径说明；`rename_session` 的取 agent 段换成 `wakeAgent` + `cannot rename session <id>: …` 前缀；三处对外文案（description / `parameters.agent.description` / `MAILBOX_PROMPT`）同步。
- `test/pure.test.mjs`：+5 个 CASE（`wake-verdict-not-found` / `-subagent` / `-writer-held` / `-internal` / `cold-admission-order`），`ℹ tests` 35 → 40。
- `README.md`：工具表两行、`agent` 五种写法与冷 id 来源、`rename_session` 那节改真话、新增「唤醒的代价」、已知边界改写并补 orphan 一条、「卸载时不会消失的四条事实」、测试条数 34 → 40 并把冷路径写进「没有自动化覆盖」。
- `package.json`：`0.8.1` → `0.9.0`；tag `dsh-session-mailbox/v0.9.0`。

### 验收（在重载后的 Host 上跑，`plugin_manager set_plugin` 两次 `applied`）

| 行 | 结果 |
|---|---|
| `node --test`（含 5 个新 CASE） | `ℹ tests 40` / `ℹ fail 0`，exit 0 |
| `node --check index.js` | exit 0，无输出 |
| Step 4.5 生效探针（不存在的完整 id） | `Error: no live session matches "session-0000…" and it could not be loaded: … only by its full session id …` → 新代码在跑 |
| **冷唤醒探针**（候选 `session-a06de951…`） | 回执 `woke: true`（render 含 `this call took the cold path`）、`to` 正确；第 1 次轮询即 `b'=1`、`a'=11=a0+1`；对端转录末条为 `[ASSISTANT] OK` |
| 活投递探针（`session-09b32c17…`） | `woke: false`（render 无 `cold path`）；`--source` 计数 1 |
| 两个不存在的地址（8 位串 + 完整 id） | 两次都抛 `no live session matches` + `only by its full session id`；`list_sessions` 行数不变 |
| 自己的地址 / 空地址 / 歧义 | `cannot send to yourself` / `agent must not be empty` / `ambiguous session "dup probe …": a1505fa5, edca505e` |
| create · rename · archive | 建 → 改名 → 归档 → 投递，得 `target session is archived; unarchive it before messaging` |
| 文档 grep（四条禁用串） | 0 |
| `package.json` 版本 | `0.9.0` |

## 实现偏差（按用户要求记入记录）

1. **行号漂移**：v12 冻结时 HEAD 已从 `28fc4f6` 前进到 `30ef21d`（中间有 `list_sessions` 子代理分支改动与 user-model 两个提交）。方案里凡以符号/串判定的步骤（Step 2 的十项计数、Step 4 的四条 grep）在实现前按实际树重测过：基线为 `1 / 0 / 0 / 2 / 4 / 0 / 2 / 1 / 1 / 1`，与 Step 0 期望一致；实现后十项为 `1 / 1 / 2 / 2 / 3 / 1 / 2 / 1 / 2 / 1`，与 Step 2 期望逐项一致（含 R11O-01 修正后的第九项 = 2）。没有一处依赖绝对行号。
2. **冷路径候选池**：`default-workspace` 的展开行里多半是归档会话，验收时改用了 `一些讨论`（8 条、0 归档），按方案「最多 8 条」规则选第一条不在 `list_sessions` 里的 id 即命中，无需换候选。
3. **rename 探针**：`create_session` 造出的空白会话没有标题，所以只做了「改成探针标题」这一步（没有「改回原标题」——无可改回的标题），与方案的「对 `<sid>` 做」一致。
4. **遗留对象**：验收留下三条归档的空白会话（`session-34a15caf…`、`session-f2cd989a…`、`session-583a5f5c…`）与一次冷唤醒（`session-a06de951…` 现在活着），都在交付报告里点名。
5. **`rename_session` 里 `controller` 变量**：早退判断保留、但 `wakeAgent` 内部自己取服务，该局部变量如今只用于早退，属无害冗余（未删，避免无谓改动）。

## 停止时的开放项

| 项 | 为什么现在不改 | 一个可证伪测试 | 回来条件 |
|---|---|---|---|
| `config.allow` 无行为级验收（BS-8） | 行为级验证要改 profile 配置，超出本任务授权 | 消费 `admit` 却不按其值抛错（只 `console.warn`）→ Step 2 计数与 §6 全表仍绿 | 用户要求覆盖，或观察到 `allow` 不生效 |
| `validateMessage` 三条 throw 无验收行（R9G-03） | 代码在 §4 S2 1 逐字给出、三条文案是现树原文；加行收益低于噪声 | 漏抄 `message must not be empty` → §6 全表与十项计数仍绿 | 用户要求把输入校验纳入验收 |
| 冷 + 归档会话的真机走向（BS-6） | 造「冷且归档」要重启 Host；`resumeObserved` 不查归档，提前拒绝完全依赖 `coldAdmission`（它读不到归档表时 fail-closed） | 若 `coldAdmission` 读表失败却不拒绝，会装载一个归档会话 | 观察到归档会话出现在 `list_sessions` 里 |
| 冷子代理会话没有验收行（BS-5） | 拒绝路径不影响 Core Task；id 可枚举（740 份转录里 480 份子代理） | `wakeFailureVerdict` 的 reason 白名单写错 → 只有 `CASE wake-verdict-subagent` 会红 | 用户要求覆盖 |
| v8 全文未进 `archive/` | round 9 准备期原地改写，已在 v9 记录披露 | 用 v7 全文 + 变更面重建 | 用户要求逐版审计 |

## 环境备注

- 宿主源码取自 `C:\Users\ruike\AppData\Local\Programs\DSH NEXT\resources\app.asar`；`file :: symbol` 指该包内路径。
- 重载用 `plugin_manager set_plugin`，`target = include:session-mailbox`，两次都 `application: "applied"`；重载后系统提示词立刻变成新版（含「A cold session … can still receive a message」那行），可作为重载生效的旁证。
- 备份在 `backups/mailbox-wake-20261125-164015/`（5 个文件，保持原相对路径）。
