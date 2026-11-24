# session-create v1 — Review Record

Reviewed version: **v1**（`session-create-v1.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**进行中（Round 1 派发前）。** 本轮尚未收到任何路线结论。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。依据四项 Light 判据，逐条给证据：

| Light 判据 | 是否成立 | 证据 |
|---|---|---|
| 变更可逆，错误结果可撤回 | **不成立** | 创建出的会话没有删除 API；Host 只提供 `workspaceController.archiveSession` / `unarchiveSession`，误建只能归档 |
| 不触碰用户可见数据、外部行为、已发布契约 | **不成立** | 创建会写入工作区记录的 `sessionIds`（spike 实测 42→45），侧栏可见 |
| 无迁移、无切换、无新依赖 | 成立 | 只改一个既有插件文件；不加 npm 依赖 |
| 无改变后续全部步骤的决策点 | 不成立 | 是否自动发第一条消息（`prompt`）决定这个工具是「建空会话」还是「派活」，二者实现不同 |

两条路线由 User 认可：「只跑评审的两条主路线（目标&实现 + 对抗性）」。深一级（三条路线）未采用，因为本变更不改共享契约、无数据迁移、无发布流程。

## Decision Table

| No. | Selected implementation | Evidence | What would reject it, or the alternative |
|---|---|---|---|
| Decision 1 | 改动落在既有插件 `dsh-plugins/plugins/session-mailbox`，不新建插件包 | 用户原话「另外那个会话间消息的插件，还可以给它加个功能」；该插件已有 `list_sessions` / `send_session_message` 两个工具与一段 `MAILBOX_PROMPT`，同属「会话操作」语义。属性：**preference** | 用户要求拆成独立插件时推翻。替代：新包 `dsh-session-create` |
| Decision 2 | 创建只走 `sessionController.create`；`agents.create` 与 `insertSessionBefore` 两条路都不计入工作区 | spike 实测：`agents.create` 后 `accountedAfter: false`；补 `insertSessionBefore` 抛 `cannot move session '…': the session is not accounted`；`sessionController.create` 后 `accountedAfter: true`、工作区 `sessionIds` 42→43。属性：**fact** | 若某个 DSH 版本让 `agents.create` 也登记工作区，本决策可放宽。替代：无 |
| Decision 3 | `workspaceId` 与 `cwd` 只传一个，本方案只传 `workspaceId` | spike 实测两个都给时抛 `RemoteError: session.create accepts workspaceId or cwd, not both`。属性：**fact** | 无 |
| Decision 4 | 不给新会话改名 | `sessionController.rename` 的说明是「after explicitly resuming it」，改名会把会话一起唤醒，成本高于收益；标题由首条消息生成（profile 里 `session-title-all-prompts-llm` 已启用）。属性：**to verify**（改名是否真的唤醒未实测，但本决策不需要它） | 用户抱怨侧栏里认不出新会话时推翻，改走 `rename` |
| Decision 5 | 路径不存在时报错，不建目录、不建工作区 | 用户的授权是「创建会话 / 工作区」，不包括在磁盘上造目录。属性：**preference** | 用户说「顺手把目录也建了」时推翻 |
| Decision 6 | 子代理一律拒绝创建 | 子代理由 Agent 自己派生，若也能建顶层会话，一条指令可扇出任意多会话；`SessionHeader` 声明含 `parentSession?: SessionId` 与 `origin?: 'subagent'`，机械可判。属性：**preference**（拦截依据是 fact） | 用户要求让子代理也能建时推翻 |
| Decision 7 | `prompt` 为可选参数，`mode: 'queue'` | `sessionController.prompt` 契约：`{ requestId, sessionId, mode: 'queue' \| 'steer', content }`，与 GUI 发消息同一调用。属性：**to verify**（插件进程内直接调用未实测，只有契约） | A5 红则退化为只建会话、不发消息（Tier C） |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `sessionController.create({ workspaceId })` 会把新会话计入该工作区的 `sessionIds` | **proved** | anchor: `plans/session-create/spike-findings.md :: 结论`。falsifiable: 该文件里若找不到 `accountedAfter: true` 与 `42→43` 的记录，本项为假 |
| P2 | 这样建出的会话对侧栏可见且用户可进入 | **proved** | anchor: `plans/session-create/spike-findings.md :: 四个必须先回答的问题`。falsifiable: 找不到 `blank: true` / `agentAvailable: true` 两行，本项为假 |
| P3 | 创建它的 fiber 卸载后会话仍存活 | **proved** | 同上文件「插件重载后还在吗」一行；实测 `session-37f0a7ae-…` 在插件关开后仍 `stillListed: true` |
| P4 | `sessionController.prompt` 可被插件在进程内直接调用 | **to verify** | 只有类型契约，没有实测。recovery: A5 红则按 Decision 7 的退路走 |
| P5 | `workspaceRegistry.create(path)` 对已存在目录幂等 | **to verify** | 契约说明「Create or idempotently resolve one Workspace over an existing directory」，未实测。recovery: A3 红则改为「路径未登记时直接报错，不代建工作区」 |
| P6 | 子代理的 `SessionHeader.parentSession` 有值 | **to verify** | `SessionHeader` 类型声明含 `parentSession?: SessionId`；运行时是否填写未实测。recovery: A6 红则改用 `origin === 'subagent'` 单独判定，两者都空则该拦截降级为提示词约束并记入风险 |

## Open items at the stop

（Round 1 尚未派发，暂无。）

## Blind Spot List（理由在此，名字在方案里）

| 名字 | 为什么现在不处理 |
|---|---|
| no-delete-api | Host 没有删除会话的 API，这是平台事实，本方案无法补；只能把 id 清单交给 User |
| title-blank | 不改名的直接后果，已由 Decision 4 承担；加改名会引入「唤醒会话」的新风险 |
| prompt-cost | 用户要的正是「派活」，成本是它的一部分；靠提示词约束调用时机 |
| recursion-prose | 机械拦截只覆盖子代理；跨顶层自繁殖没有可靠判据（插件无法给会话打标记），只能靠提示词 |
| workspace-path-case | `path.resolve` 已规范化大小写以外的差异；符号链接与大小写属平台行为，需真实撞上才知道 |
| archived-grouping | 已归档会话的分组是 GUI 侧行为，本方案不触碰；需撞上才知道 |

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal and Implementation、Adversarial | 已派发，等待结论 |
