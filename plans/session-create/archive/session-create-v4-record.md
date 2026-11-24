# session-create v4 — Review Record

Reviewed version: **v4**（`session-create-v4.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**Round 1–3 完成，Round 4 已派发。** Round 3：2 项 resolved、1 项部分、1 项披露；全扫另报 1 high / 4 medium / 2 low。全部处置进 v4。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。四项 Light 判据中三项不成立：会话无删除 API（不可逆）、创建写用户可见的工作区记录（侧栏）、`prompt` 决定工具语义（关键决策点）。只有「无迁移无新依赖」成立。

## Decision Table

| No. | Selected implementation | Evidence | Would reject it / alternative |
|---|---|---|---|
| Decision 1 | 落在既有插件 `dsh-session-mailbox` | 用户原话「另外那个会话间消息的插件…」；已有两个会话类工具与 `MAILBOX_PROMPT`。**preference** | 用户要求拆包 |
| Decision 2 | 创建只走 `sessionController.create` | `commands.ts :: create` 第 146–157 行 `workspace.attachSession(sessionId)`；spike 实测 `accountedAfter: true`。**fact** | `agents.create` 若也登记工作区 |
| Decision 3 | 只传 `workspaceId` | `commands.ts :: create` 第 121–123 行两者同给即抛。**fact** | 无 |
| Decision 4 | 不改名 | `rename` 会唤醒会话；标题由首条消息生成。**preference** | 用户认不出新会话 |
| Decision 5 | 非法路径只报错；任何情况不删会话/工作区 | 用户授权不含磁盘与删除操作。**preference** | 用户要求顺手建目录 |
| Decision 6 | 子代理判定 `origin === 'subagent'` 或 `delegationDepth > 0` | `dsh-session/src/types.ts` 说明 `parentSession` 不代表子代理；`child-agent.ts:146-152` 同时写两者。**fact** | A6 证明两者皆空 |
| Decision 7 | `prompt` 必传 `AbortSignal` | `src/index.ts :: prompt` 第 469 行 `signal.throwIfAborted()` 是第一句。**fact** | 无 |
| Decision 8 | 新建/复用只由 id 差集判定，两条分支各自定义 | `dsh-workspace/src/index.ts:533-535` 按 canonical 路径返回既有实体。**fact** | 无 |
| Decision 9 | 错误 throw 裸文本，不带 `error: ` | 既有工具如此（`index.js:145`）。**fact** | 渲染层要求前缀 |
| Decision 10 | 调用者工作区先按 `sessionIds` 会计，再退回 cwd 相等 | `dsh-workspace/src/entity.ts:102-104` 的 `sessionIds` 是会计视图；用 cwd 字符串相等会把「会话在子目录里」判成「没有工作区」。**fact** | 无 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `sessionController.create({ workspaceId })` 会计入工作区 | **proved** | `commands.ts :: create` 第 147–157 行；falsifiable: 该符号无 `attachSession` 即假 |
| P2 | 建出的会话对侧栏可见、可进入 | **proved** | `spike-findings.md :: 四个必须先回答的问题` |
| P3 | 创建它的 fiber 卸载后仍存活 | **proved** | `spike-findings.md :: 插件重载后还在吗` |
| P4 | `prompt` 可进程内直接调用（带 signal） | **to verify** | `@Remote` 只做元数据；`exec.signal` 为必填（`dsh-tools/src/contracts.ts`）。未实测。recovery: A5 红则退化为只建会话 |
| P5 | `workspaceRegistry.create` 幂等 | **proved** | `dsh-workspace/src/index.ts:533-535`；A3 第四、五次调用是实测 |
| P6 | 子代理 header 带 `origin` 或 `delegationDepth > 0` | **to verify** | `child-agent.ts:146-152`；本机未实测。recovery: A6 |
| P7 | `exec.agent.session.header.cwd` 是调用者 cwd | **to verify** | 该插件已在用同一字段（`index.js:62`）。recovery: A2 |

## Closure Table

### Round 1–2 遗留

| ID | Round 3 判定 | v4 处置 |
|---|---|---|
| M1 / R2-01（A3 可重复跑） | partly：别名拼写会让前置误判 | A3 前置加一句「若 Step 7 判出 `created=false` 就按已登记处理」；A3 增加第五次调用（junction 别名） |
| M3 / M5（错误漏工作区 id） | resolved | 保持 |
| M14（Step 0 完成测试） | resolved | 保持 |
| M10（`EACCES` 无验收行） | 披露 | §8 `eacces-prose` |
| M2（`prompt` signal） | resolved | 保持 |

### Round 3 → v4

| ID | Source | Status | 处置位置 |
|---|---|---|---|
| S3-01（high：Decision 8 无验收行可证伪） | Scan | Resolved | A3 第五次调用：junction 别名 → 必须 `[reused]` 且不新增工作区 |
| S3-02（medium：A2–A7 依赖未声明的会话 cwd） | Scan | Resolved | §6「约定」第 2 条：cwd 必须等于 `default-workspace` 的 path，不等就停 |
| S3-03（medium：复用分支没有 `before`/`entity` 定义） | Scan | Resolved | Step 2 第 5 条先取快照；第 6 条写明复用分支 `entity = workspace, created = false`；第 7 条只算新建分支 |
| S3-04（medium：调用者工作区用 cwd 相等会把子目录判成没有） | Scan | Resolved | Step 1 `pickWorkspace` 先按 `sessionIds` 找；`no-cwd` 与 `no-workspace-for-caller` 分开报 |
| S3-05（medium：A6 用 `sessions:` 之和会互相抵消） | Scan | Resolved | A6 改为逐工作区比较 id 集合 |
| S3-06（low：`details.sessionId` 不等于「本次创建」） | Scan | Resolved | Step 2 第 9 条改按 `error.code === 'session/workspace-attach-failed'` 识别 |
| S3-07（low：`isConcurrencySafe` 写成布尔值） | Scan | Resolved | Step 2 写成 `isConcurrencySafe: () => true` |
| R3-01（low：并发登记会让本次误报 `[created]`） | Adv | 披露 | §8 `concurrent-registration` |

## Revision Table（Round 3 → v4）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| S3-01 | A3 增加 junction 别名调用 | No（只改验收） |
| S3-02 | §6 约定增加会话 cwd 前置 | No（只改验收） |
| S3-03 | Step 2 第 5 条提前到分支之前；第 6 条定义复用分支 | Yes（机制） |
| S3-04 | `pickWorkspace` 增加 accounting 优先 | Yes（机制） |
| S3-05 | A6 改集合比较 | No（只改验收） |
| S3-06 | 错误识别改为按 `code` | Yes（机制） |
| S3-07 | `isConcurrencySafe` 改为函数 | No（措辞） |
| R3-01 | 记为盲点 | No |

## 本轮变化面（三项）

1. **触及的决策点**：Decision 8（两分支定义）、Decision 10（新增：按 accounting 找调用者工作区）。
2. **新增位置**：§5 Decision 10；Step 2 第 5 条（前置快照）、第 6 条的两分支、第 9 条的 `code` 判据；§6 约定第 2 条；A3 第五次调用；A6 的集合比较；§8 `concurrent-registration`。
3. **删除/合并的规则**：删掉「`details.sessionId` 存在 ⇒ 本次创建」（改按 `code`）；删掉 A6 的 `sessions:` 求和判据；把原第 6、7 条合并为一条前置快照 + 一条判定。

## Choice List

| 项 | 选择 | 备选与代价 |
|---|---|---|
| A3 的目标目录 | `%TEMP%`，已登记时由 User 另给 | 让 User 每次预建专用目录（侧栏更干净，多一步人工） |
| 别名用例的构造 | `New-Item -ItemType Junction` 指向 `%TEMP%` 自身 | 用 8.3 短名（依赖卷配置，不稳） |
| 空白 `prompt` | 视为 `none` | 报错（把「没想派活」变失败） |
| `EACCES` | 文本 + 盲点 | 造 ACL 拒绝目录（Windows 上脆弱） |
| 会话 cwd 不匹配时 | 停下报告，不改测试 | 测试里先 `create_session` 换到该工作区（把验收变成实现的自证） |

## Open items at the stop

（Round 4 进行中，暂无。）

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal、Adversarial | 完成：3 high / 6 medium / 4 low |
| 2 | v2 | Goal（复用）、Adversarial（复用）、全扫（新） | 完成：2 high / 3 medium / 2 low + 3 partly |
| 3 | v3 | Goal（复用）、Adversarial（复用）、全扫（新） | 完成：1 high / 4 medium / 2 low + 1 partly |
| 4 | v4 | 同三路 | 已派发 |
