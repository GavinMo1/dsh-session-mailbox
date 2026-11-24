# session-create v8 — Review Record

Reviewed version: **v8**（`session-create-v8.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。
上一版的完整决策证据见 `archive/session-create-v7-record.md`；本文件只补 Round 7 的处置与当前决策表。

## Conclusion

**Round 1–7 完成，v8 尚未评审。** Round 7 三路齐：Goal 判 v7 清；Adversarial 判 `rootOf` 语义正确但会抛异常；全扫（迟到的 `review-scan7`）报 **2 high / 4 medium / 1 low**。全部处置进 v8。**v8 还需要一轮复核才能标 Pass** —— 这是交接时最重要的一条。

## Decision Table（当前有效）

| No. | Selected implementation | Evidence / property |
|---|---|---|
| 1 | 落在既有插件 `dsh-session-mailbox` | 用户原话；**preference** |
| 2 | 创建只走 `sessionController.create` | `commands.ts :: create` 第 146–157 行 `attachSession`；**fact** |
| 3 | 只传 `workspaceId` | `commands.ts:121-123` 两者同给即抛；**fact** |
| 4 | 不改名 | `rename` 会唤醒会话；**preference** |
| 5 | 不建目录/链接、任何情况不删（含 `rmdir`） | 用户授权 + AGENTS A2；**fact**（A2 为项目硬规则） |
| 6 | 子代理 = header 命中 或 `rootOf` 指向别人；`rootOf` 抛错时**拒绝** | `manager.ts:510-523`：普通调用者返回自身、子代理返回 `activation.root`、代理或归属丢失时抛 `SubagentError`；**fact** |
| 7 | `prompt` 必传 `AbortSignal` | `src/index.ts :: prompt` 第 469 行首句 `throwIfAborted()`；**fact** |
| 8 | `created` 只由 `createdFromDiff(before, entity.id)` 决定 | `index.ts:533-535` canonical 短路；**fact** |
| 9 | 错误 throw 裸文本，`<reason>` 取 `error.message` | `index.js:145`；`remote-error.ts:22-30`；**fact** |
| 10 | 调用者工作区先 accounting 再 cwd | `entity.ts:102-104`；**fact** |
| 11 | `output.schema` + `render`，`required: true` 写在属性节点 | `dsh-tools/src/schema.ts:293-296,336` 会把它编译进父节点的 `required`；**fact** |
| 12 | `list_workspaces({ workspace })` 先 id 后标题，歧义即抛；无参数不追加 `session:` 行 | `index.ts:243-245` 标题可重复；**fact** |
| 13 | Tier C：别名/短名的端到端用例删除，改纯函数单测 `CASE created-by-id-diff` | 两轮都撞上 A5（项目根外写入）与 A2（删除命令）；**fact**（冲突证据）+ **preference**（取舍） |

## Core Preconditions

| No. | Condition | Status |
|---|---|---|
| P1 | `create({ workspaceId })` 会计入工作区 | **proved**（`commands.ts:147-157`；falsifiable: 无 `attachSession` 即假） |
| P2 | 建出的会话对侧栏可见、可进入 | **proved**（`spike-findings.md`） |
| P3 | 创建它的 fiber 卸载后仍存活 | **proved**（`spike-findings.md`） |
| P4 | `prompt` 可进程内直接调用（带 signal） | **to verify**（A5；红时按成因判别段分流） |
| P5 | `workspaceRegistry.create` 幂等 | **proved**（`index.ts:533-535`） |
| P6 | `subagents.rootOf` 的三种行为如上表 Decision 6 | **proved by source**（`manager.ts:510-523`），本机运行时未实测 |
| P7 | `exec.agent.session.header.cwd` 是调用者 cwd | **to verify**（A2） |

## Closure Table（Round 7 → v8）

| ID | Source | Status | 处置位置 |
|---|---|---|---|
| S7-01（high：验收没要求「由顶层会话执行」，子代理一跑就全红且无处可停） | Scan7 | Resolved | §6 约定第 1 条新增顶层会话前置；§7 停止项并入「或当前会话本身是子代理」 |
| S7-02（high：`rootOf` 抛错无失败臂，会把 `SubagentError` 漏出去） | Scan7 + Adv | Resolved | Step 2.2 第 2 条改为 `try/catch`，catch 即抛 `subagents cannot create sessions` |
| S7-03（medium：没说无 `workspace` 参数时是否追加 `session:` 行） | Scan7 | Resolved | Step 2.1 首条加粗写明 |
| S7-04（medium：`promptState` 从未声明，Step 3 却在赋值） | Scan7 | Resolved | Step 2.2 第 12 条 `let promptState = 'none'` |
| S7-05（medium：A3 前置引用了内部步骤号，执行者看不到） | Scan7 | Resolved | 改为「看第一次输出的 `workspace:` 行是否 `[reused]`」 |
| S7-06（medium：A6 只比较已知工作区，恶意创建新工作区可绕过） | Scan7 | Resolved | A6 前后各加 `list_workspaces({})`，比较工作区 id 集合与行数 |
| S7-07（low：A4 的「不是目录」夹具依赖库里一个可能移动的文件） | Scan7 | Resolved | 换成 `dsh-plugins/plugins/session-mailbox/package.json` |
| R7-01（Adv：`rootOf` 会抛两种 `SubagentError`） | Adv | Resolved | 同 S7-02 |

## Revision Table（Round 7 → v8）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| S7-01 | 验收前置：必须顶层会话 | No（只改验收前置） |
| S7-02 / R7-01 | `try/catch` + 拒绝 | Yes（机制） |
| S7-03 | 无参数不追加 | Yes（输出契约） |
| S7-04 | `let promptState` | Yes（实现细节） |
| S7-05 | 前置改看 `[reused]` | No |
| S7-06 | A6 加工作区集合比较 | No（只改验收） |
| S7-07 | 换夹具 | No |

## 本轮变化面（三项）

1. **触及的决策点**：Decision 6（抛错即拒绝）、Decision 12（无参数时的输出形状）。
2. **新增位置**：§6 约定第 1 条；§7 的「或当前会话本身是子代理」；Step 2.1 首条加粗句；Step 2.2 第 2 条的 `try/catch` 与第 12 条的 `let`。
3. **删除的规则**：A3 前置里对「第 8 步」的引用（执行者不可见）；A4 的旧夹具路径。

## Open items at the stop

| 项 | 为什么现在不改 | 可证伪的测试 |
|---|---|---|
| **v8 未评审** | 交接时来不及再派一轮，且用户已离开 | 家庭机器上重跑一轮全扫（新 agent），若出现 high/medium 即本项转为必修 |
| `failure-path-prose` | 两条失败串没有验收行能变红；注入失败需要在 Host 上做手脚 | 任一次真实 attach/prompt 失败 |
| `search-can-new-session` | A5 依赖检索工具能看见刚建的会话，未单独验证 | A5 变红且在 GUI 里能看到那条消息 |
| `eacces-prose` | `EACCES` 分支只有文本 | 真的遇到读不到的路径 |
| `canonical-collision-e2e` | 别名端到端已按 Tier C 删除 | 出现真实别名场景 |
| `concurrent-registration` | 快照与 create 之间的竞态，方向无害 | 用户看到「新建」的其实是界面上刚建的 |
| `title-blank` / `prompt-cost` / `recursion-prose` / `cwd-fallback-coverage` / `workspace-path-case` / `archived-grouping` | 见 v8 §8，各有回访条件 | 同 §8 |

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1–6 | v1–v6 | 三路 | 见 `archive/` 各版记录 |
| 7 | v7 | Goal、Adversarial、全扫 | **完成**：Goal 清；Adv 1 条；Scan7 2 high / 4 medium / 1 low（迟到收） |
| 8 | v8 | 未派发 | **待办** |
