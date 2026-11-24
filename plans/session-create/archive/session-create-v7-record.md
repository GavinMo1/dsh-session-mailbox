# session-create v7 — Review Record

Reviewed version: **v7**（`session-create-v7.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**Round 1–6 完成，Round 7 已派发。** Round 6：adversarial 2 项、goal 1 项（并指出 v6 的拆除命令触犯 AGENTS A2）、补扫 2 high / 2 medium / 2 low。全部处置进 v7，其中 A3 的 junction 一步按 **Tier C（少做）** 整体删除。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。三项 Light 判据不成立：会话无删除 API、创建写用户可见的工作区记录、`prompt` 决定工具语义。

## Decision Table

| No. | Selected implementation | Evidence | Would reject it |
|---|---|---|---|
| Decision 1 | 落在既有插件 `dsh-session-mailbox` | 用户原话。**preference** | 用户要求拆包 |
| Decision 2 | 创建只走 `sessionController.create` | `commands.ts :: create` 第 146–157 行 `attachSession`。**fact** | 该符号无 `attachSession` |
| Decision 3 | 只传 `workspaceId` | 同文件第 121–123 行。**fact** | 无 |
| Decision 4 | 不改名 | `rename` 会唤醒会话。**preference** | 用户认不出新会话 |
| Decision 5 | 不建目录、不建工作区以外的东西，任何情况不删 | 用户授权范围 + AGENTS A2（禁 `rmdir`/`Remove-Item`）。**fact**（A2 是项目硬规则） | 用户明确要求可删除 |
| Decision 6 | 子代理 = header 命中 **或** `subagents.rootOf` 指向别人 | `subagents.rootOf(caller): Agent` 是既有服务方法；v6 的「在不在 `agents.list()` 顶层过滤里」自我满足（`agents.list()` 本来就含子代理，裸 header 的子代理也通过）。**fact** | A6 红 |
| Decision 7 | `prompt` 必传 signal | `src/index.ts :: prompt` 第 469 行首句。**fact** | 无 |
| Decision 8 | `created` 只由 `createdFromDiff(before, entity.id)` 决定 | `index.ts:533-535` canonical 短路；只在 create 分支赋值会漏别名。**fact** | 无 |
| Decision 9 | 错误 throw 裸文本，`<reason>` 取 `error.message` | `index.js:145`；`remote-error.ts:22-30` 的 `message` 已含整句，`details` 只有字段。**fact** | 无 |
| Decision 10 | 调用者工作区先 accounting 再 cwd | `entity.ts:102-104`。**fact** | 无 |
| Decision 11 | `output.schema` + `render`，`required: true` 写在属性节点 | `dsh-tools/src/schema.ts:293-296,336` 会把属性级 `required` 编译进父节点的 `required` 数组 —— 所以该写法合法且被 `register()` 再断言一次。**fact** | 无 |
| Decision 12 | `list_workspaces({ workspace })` 先 id 后标题，歧义即抛 | `index.ts:243-245`：不同 canonical 路径可共享显示标题。**fact** | 无 |
| Decision 13 | **Tier C**：A3 不做 junction 别名端到端用例，改为 `CASE created-by-id-diff` 纯函数单测 | 该用例连续两轮带出「项目根外写入」（A5 报备）与「删除命令」（A2 禁止）两条规则冲突，而它要证明的机制（id 差集）可以在纯函数层证伪。**fact**（两轮证据）；成本判断属 **preference** | 用户要求端到端覆盖别名场景 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `create({ workspaceId })` 会计入工作区 | **proved** | `commands.ts :: create` 第 147–157 行；falsifiable: 无 `attachSession` 即假 |
| P2 | 建出的会话对侧栏可见、可进入 | **proved** | `spike-findings.md :: 四个必须先回答的问题` |
| P3 | 创建它的 fiber 卸载后仍存活 | **proved** | `spike-findings.md :: 插件重载后还在吗` |
| P4 | `prompt` 可进程内直接调用（带 signal） | **to verify** | `@Remote` 只做元数据；`exec.signal` 必填。recovery: A5 红 → 按成因判别段分流 |
| P5 | `workspaceRegistry.create` 幂等 | **proved** | `index.ts:533-535`；A3 的第二次调用是实测 |
| P6 | `subagents.rootOf` 对子代理返回非自身的根 | **to verify** | 服务目录里有该方法；语义未实测。recovery: A6 |
| P7 | `exec.agent.session.header.cwd` 是调用者 cwd | **to verify** | 插件已在用（`index.js:62`）。recovery: A2 |

## Closure Table

### Round 6 → v7

| ID | Source | Status | 处置位置 |
|---|---|---|---|
| S6-01 / ADV-6a（A3 用了输出里没有的 `workspaceId`） | Scan + Adv | Resolved | 输出 schema 与 render 都加 `workspaceId`；A3 改用它 |
| S6-02（high：第二条子代理判据自我满足） | Scan | Resolved | Step 2.2 第 2 条改用 `subagents.rootOf`；§5 Decision 6 明写禁用「在不在 `agents.list()` 顶层过滤里」 |
| S6-03（medium：`prompt` 失败串缺工作区 id） | Scan | Resolved | Step 3 失败分支追加 `(workspace <entity.id> was created)` |
| S6-04（medium：`<reason>` 未绑定，直接拼会重复整句） | Scan | Resolved | Step 2.2 第 10 条与 Step 3 都绑 `const reason = error instanceof Error ? error.message : String(error)` |
| S6-05（low：`picked.ok === false` 的 `not-absolute` 分支无兜底） | Scan | Resolved | Step 2.2 第 6 条加 `if (picked.ok !== true)` 与 `no workspace: <reason>` |
| S6-06（low：A3 序号与 recipe 步序错位） | Scan | Resolved | A3 改为按「第一次/第二次/第三次」与调用名叙述 |
| ADV-6b（两条拒绝原因塌成同一句） | Adv | Resolved | 第二判据换成 `rootOf`；两条判据仍同句，但语义已正、不再误导（同句本身不构成误判） |
| R6-01（goal：v6 的 `rmdir` 触犯 A2） | Goal | Resolved | junction 一步整体删除；§6 约定改为「本方案不创建任何目录或链接」 |
| R6-02（goal：`rmdir` 非零要停、绝不能 `/s`） | Goal | Resolved | 同上（不再有该命令） |

## Revision Table（Round 6 → v7）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| S6-01 | 输出加 `workspaceId` | Yes（契约） |
| S6-02 | 子代理判据换 `subagents.rootOf` | Yes（机制） |
| S6-03 | prompt 失败串加工作区 id | Yes（输出） |
| S6-04 | 绑定 `reason` | Yes（实现细节） |
| S6-05 | `picked.ok` 兜底 | Yes（实现细节） |
| S6-06 | A3 叙述改写 | No |
| R6-01/02 | 删除 junction 一步与相关停止项 | Yes（验收范围缩小） |

## 本轮变化面（三项）

1. **触及的决策点**：Decision 5（把「不删」写成含 `rmdir` 的禁令）、Decision 6（判据换实现）、Decision 13（新增：Tier C 少做）。
2. **新增位置**：`lib/create.js` 的 `createdFromDiff`；Step 2.2 第 2 条第二判据、第 6 条兜底、第 10 条 `reason` 绑定；Step 3 失败串尾巴；输出 schema 的 `workspaceId`；A1 的 `CASE created-by-id-diff` 与 `CASE pick-case-insensitive`；§8 `canonical-collision-e2e`。
3. **删除的规则**：A3 的 junction 建/拆两步、§6 约定第 4 条、§7 的两条 junction 停止项、§3 里「6 个会话」的计数（改为 5）。

## Choice List

| 项 | 选择 | 备选与代价 |
|---|---|---|
| 别名/短名的覆盖层级 | 纯函数单测（Tier C） | 端到端 junction（两轮都撞上 A2/A5 规则冲突） |
| 子代理判据 | `subagents.rootOf` | 只用 header（裸 header 会 fail-open） |
| A3 引用工作区 | 返回里的 `workspaceId` | 用标题（标题可重复） |
| 两条拒绝原因 | 共用一句 | 分两句（可选，但当前两条判据语义已正确） |

## Open items at the stop

（Round 7 进行中，暂无。）

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal、Adversarial | 3 high / 6 medium / 4 low |
| 2 | v2 | 三路 | 2 high / 3 medium / 2 low + 3 partly |
| 3 | v3 | 三路 | 1 high / 4 medium / 2 low + 1 partly |
| 4 | v4 | 三路 | 2 high / 5 medium / 2 low |
| 5 | v5 | Goal、Adversarial、Scan5b | incomplete：2 high / 5 medium / 3 low |
| 6 | v6 | 三路 | 2 high / 2 medium / 2 low + 3 项（goal/adv） |
| 7 | v7 | 三路 | 已派发 |
