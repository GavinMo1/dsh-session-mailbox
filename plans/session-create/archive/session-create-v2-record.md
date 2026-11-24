# session-create v2 — Review Record

Reviewed version: **v2**（`session-create-v2.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**Round 1 完成：3 high / 6 medium / 4 low，全部处置为 v2 的对应修改；Round 2 已派发。** 合并后共 13 个独立问题项（v1 的 15 条原始发现里有 2 对是同一根因）。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。四项 Light 判据中三项不成立：

| Light 判据 | 是否成立 | 证据 |
|---|---|---|
| 变更可逆，错误结果可撤回 | **不成立** | 会话没有删除 API；工作区有 `workspaceRegistry.delete`，会话只能由用户在 GUI 删 |
| 不触碰用户可见数据、外部行为、已发布契约 | **不成立** | 创建会写工作区记录的 `sessionIds`，侧栏可见 |
| 无迁移、无切换、无新依赖 | 成立 | 只改一个既有插件；不加 npm 依赖 |
| 无改变后续全部步骤的决策点 | **不成立** | 是否发第一条消息决定工具语义是「建空会话」还是「派活」 |

## Decision Table

| No. | Selected implementation | Evidence | What would reject it, or the alternative |
|---|---|---|---|
| Decision 1 | 改动落在既有插件 `dsh-plugins/plugins/session-mailbox` | 用户原话「另外那个会话间消息的插件，还可以给它加个功能」；该插件已有 `list_sessions` / `send_session_message` 与一段 `MAILBOX_PROMPT`。属性：**preference** | 用户要求拆包时推翻。替代：新建 `dsh-session-create` |
| Decision 2 | 创建只走 `sessionController.create` | `commands.ts :: create`（第 146–157 行）在 `agents.createSession` 之后调 `workspace.attachSession(sessionId)`，accounting 就在这里；spike 实测 `accountedAfter: true`、`sessionIds` 42→43。属性：**fact** | 若 `agents.create` 也登记工作区则放宽。替代：无 |
| Decision 3 | 只传 `workspaceId`，不传 `cwd` | `commands.ts :: create` 第 121–123 行：两者同给抛 `session.create accepts workspaceId or cwd, not both`。属性：**fact** | 无 |
| Decision 4 | 不给新会话改名 | `rename` 的契约是「after explicitly resuming it」，会唤醒会话；标题由首条消息生成（profile 里 `session-title-all-prompts-llm` 已启用）。属性：**preference** | 用户抱怨侧栏认不出新会话时推翻 |
| Decision 5 | 路径非法只报错，不建目录、不建工作区 | 用户授权是「创建会话 / 工作区」，不含在磁盘造目录。属性：**preference** | 用户说「顺手把目录建了」时推翻 |
| Decision 6 | 子代理判定只看 `origin === 'subagent'` | G-03 的证据：`dsh-session/src/types.ts` 写明「存在 `parentSession` 本身不代表子代理，要用 `origin`」，且 fork 的顶层会话会保留该字段 —— 用 `parentSession` 会误拒 fork。属性：**fact** | A6 若证明子代理的 `origin` 为空（ADV-06 的担忧），退回「`origin` 与 `parentSession` 都缺时默认拒绝」并记入风险 |
| Decision 7 | `prompt` 必须传 `AbortSignal` | `src/index.ts :: prompt` 第 468–469 行：`signal.throwIfAborted()` 是方法第一句，`signal` 无默认值，少传必抛 `TypeError`。属性：**fact** | 无 |
| Decision 8 | 创建失败时从 `error.details.sessionId` 取回 id | `commands.ts :: create` 第 151–155 行：attach 失败抛 `session/workspace-attach-failed`，`details: { sessionId, workspaceId }`，消息里也带 id。属性：**fact** | 无 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `sessionController.create({ workspaceId })` 会把新会话计入该工作区的 `sessionIds` | **proved** | anchor: `dsh-api-session-controller/src/commands.ts :: create`（第 147–157 行 `workspace.attachSession(sessionId)`）；falsifiable: 该符号里找不到 `attachSession` 即本项为假 |
| P2 | 这样建出的会话对侧栏可见且用户可进入 | **proved** | anchor: `plans/session-create/spike-findings.md :: 四个必须先回答的问题`（`blank: true`、`agentAvailable: true`） |
| P3 | 创建它的 fiber 卸载后会话仍存活 | **proved** | 同上文件「插件重载后还在吗」；实测 `session-37f0a7ae-…` 在插件关开后仍 `stillListed: true` |
| P4 | `sessionController.prompt` 可被插件在进程内直接调用（带 signal） | **to verify** | 已核到 `@Remote` 只做元数据、方法体直接执行（`dsh-typert-protocol` 的 `bindTypertRemote` 只冻结 `{service, serviceKey, namespace}`）；`signal` 依赖已由 Decision 7 补上。仍未实测。recovery: A5 红则按 Tier C 退化为只建会话、不发消息 |
| P5 | `workspaceRegistry.create(path)` 对已存在目录幂等 | **proved** | `dsh-workspace/src/index.ts :: create` 的文档行「Repeated calls … return the existing entity」，并拒绝非目录。A3 的第四次调用是它的实测 |
| P6 | 子代理的 `SessionHeader.origin` 为 `'subagent'` | **to verify** | 只有类型声明与 `parentSession` 的排除说明。recovery: A6 红则按 Decision 6 的退路 |

## Closure Table（Round 1 → v2）

| Problem ID | Source route | Status | Evidence position | Next step |
|---|---|---|---|---|
| M1（= ADV-03 + G-01，high） | Adversarial + Goal | Resolved | §6 A3、A3 的第四次调用；§4 Step 2 输出行加 `[created\|reused]`；§2 Core Task (b) 末句 | - |
| M2（= ADV-01，high） | Adversarial | Resolved | §4 Step 3 第 1 条（`signal` 必传）；§5 Decision 7 | - |
| M3（= ADV-02，high） | Adversarial | Resolved | §4 Step 2 第 7 条的 `error.details?.sessionId` 分支；§5 Decision 8 | - |
| M4（= ADV-05 + ADV-08 + G-06，medium） | Adversarial + Goal | Resolved | §4 Step 2 第 3、4 条的四段式路径校验；§4 Step 1 的 `target` 参数改名 | - |
| M5（= ADV-04，medium） | Adversarial | Resolved | §4 Step 2 第 7 条尾巴 `(workspace <id> was created and is now empty)` | - |
| M6（= G-03 + ADV-06，medium） | Goal + Adversarial | Resolved | §4 Step 1 `refusalFor` 只用 `origin`；§5 Decision 6；A1 增 `CASE fork-not-refused` | - |
| M7（= G-02，medium） | Goal | Resolved | §6 A5 的 `session_id: <上一步的 id>` | - |
| M8（= G-04，medium） | Goal | Resolved | §4 Step 2 第 6 条前置快照 + 第 8 条「调用前不在、调用后在该工作区」 | - |
| M9（= G-05，medium） | Goal | Resolved | §3 第 3 条（重载后才能验收）；§7 改为「junction 断了才要写 profile」 | - |
| M10（= ADV-07，low） | Adversarial | Resolved | §4 Step 2 第 4 条的 `EACCES` 分支与 `cannot read path:` | - |
| M11（= G-07，low） | Goal | Resolved | §4 Step 2 第 1 条 | - |
| M12（= G-08，low） | Goal | Resolved | §4 Step 2 第 3、4 条的「原样回显」；§6 A4 的期望串 | - |
| M13（= G-09，low） | Goal | Resolved | §6「约定」里的 `workdir` | - |
| M14（Author，无路线来源） | - | Resolved | §4 Step 0（`exports` 加 `"./create"`）、§4 Step 1 的 `.js` 扩展名 | - |

## Revision Table（Round 1）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| M1 | A3 改用未登记的 `AppData\Local\Temp`，加第四次调用验 `[reused]`；成功输出加 `[created\|reused]` | Yes（输出与验收） |
| M2 | Step 3 的 `prompt` 调用补 `signal` | Yes（机制） |
| M3 | Step 2 第 7 条补 `error.details?.sessionId` 分支 | Yes（机制） |
| M4 | 路径校验拆四段（空/相对/不存在/非目录/读不到），参数改名 `target` | Yes（机制） |
| M5 | 失败尾巴追加「新建但空的工作区 id」 | Yes（输出） |
| M6 | `refusalFor` 从「`parentSession` 或 `origin`」改为只看 `origin` | Yes（机制） |
| M7 | A5 的 `session_event_search` 补 `session_id` | Yes（验收） |
| M8 | Step 2 加前置快照，回读判定改为「前不在后在新」 | Yes（机制） |
| M9 | 加「改完必须重启 DSH 才能验收」，删掉「装回插件要写 profile」的错误前提 | Yes（顺序） |
| M10–M13 | `EACCES` 分支、`exec.agent` 空判、原样回显、`workdir` | No（只改措辞/判据细节） |
| M14 | `exports` 条目与 `.js` 扩展名 | Yes（接线） |

## 本轮变化面（三项，不合并计数）

1. **触及的决策点**：Decision 6（子代理判据）、Decision 7（新的强制参数）、Decision 8（新的错误读取点）。
2. **本轮新增的位置**：Step 0 整节；Step 2 的第 3、6、7、8 条；Step 3 的 signal 句；A3 的第四次调用；A4 的第三个与第四个子用例；A5 的空白 prompt 子用例；§5 的 Decision 7、8。

   **机制数量说明**：本轮新增三个机制（`AbortSignal`、`error.details` 读取、前置快照），超过「一轮最多一个机制」的限额。理由是 v1 从未可执行（ADV-01 必抛、ADV-02 会丢 id），不补这三个它连一次都跑不通；拆成三轮只会让方案在不可执行状态多停留两轮。已在此记录，供审计。
3. **删除或合并的规则**：删掉 §7 的「装回插件要写 profile」（错的前提）；`refusalFor` 的 `parentSession` 判据被删除而不是新增条件（根因是那条多余判据，G-03 与 ADV-06 冲突时删它同时解决两边）。

## 语义变化清单（Choice List）

| 项 | 选择 | 备选与代价 |
|---|---|---|
| A3 用哪个目录证明「创建工作区」 | `C:\Users\ruike\AppData\Local\Temp` | 备选：让 User 先建一个专用目录（多一步人工，但侧栏更干净）。选 TEMP 因为它必然存在且明显是测试路径 |
| 空白 `prompt` 的处理 | 视为 `none`，不发请求 | 备选：报错（会把「我没想派活」变成失败，不如放行） |
| 路径不是目录时的错误串 | `error: not a directory:` | 备选：并入 `bad path:`（会把两种原因混成一个码） |

## Open items at the stop

（Round 2 进行中，暂无。）

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal and Implementation、Adversarial | 完成：3 high / 6 medium / 4 low，全部处置 |
| 2 | v2 | Goal and Implementation（复用，只核 Closure 位置）、Adversarial（复用，只核 Closure 位置）、新冻结全扫 | 已派发 |
