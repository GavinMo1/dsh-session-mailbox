# session-create v3 — Review Record

Reviewed version: **v3**（`session-create-v3.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**Round 1 + Round 2 完成，Round 3 已派发。** Round 1：3 high / 6 medium / 4 low → 13 个合并项，全部处置。Round 2：3 项 partly（M1、M3/M5、M10）、新增 3 项（2 high、1 medium）→ v3 处置。累计行数：4 个版本、2 轮、两路线 + 一个全扫。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。四项 Light 判据中三项不成立：

| Light 判据 | 是否成立 | 证据 |
|---|---|---|
| 变更可逆，错误结果可撤回 | **不成立** | 会话没有删除 API；误建只能由用户在 GUI 删 |
| 不触碰用户可见数据、外部行为、已发布契约 | **不成立** | 创建会写工作区记录的 `sessionIds`，侧栏可见 |
| 无迁移、无切换、无新依赖 | 成立 | 只改一个既有插件；不加 npm 依赖 |
| 无改变后续全部步骤的决策点 | **不成立** | 是否发第一条消息决定工具语义是「建空会话」还是「派活」 |

## Decision Table

| No. | Selected implementation | Evidence | What would reject it, or the alternative |
|---|---|---|---|
| Decision 1 | 改动落在既有插件 `dsh-plugins/plugins/session-mailbox` | 用户原话「另外那个会话间消息的插件，还可以给它加个功能」；该插件已有 `list_sessions` / `send_session_message` 与 `MAILBOX_PROMPT`。属性：**preference** | 用户要求拆包时推翻。替代：新建 `dsh-session-create` |
| Decision 2 | 创建只走 `sessionController.create` | `commands.ts :: create`（第 146–157 行）在 `agents.createSession` 之后调 `workspace.attachSession(sessionId)`，accounting 就在这里；spike 实测 `accountedAfter: true`、`sessionIds` 42→43。属性：**fact** | 若 `agents.create` 也登记工作区则放宽 |
| Decision 3 | 只传 `workspaceId`，不传 `cwd` | `commands.ts :: create` 第 121–123 行：两者同给抛 `session.create accepts workspaceId or cwd, not both`。属性：**fact** | 无 |
| Decision 4 | 不给新会话改名 | `rename` 契约是「after explicitly resuming it」，会唤醒会话；标题由首条消息生成（profile 里 `session-title-all-prompts-llm` 已启用）。属性：**preference** | 用户抱怨侧栏认不出新会话时推翻 |
| Decision 5 | 路径非法只报错，不建目录、不建工作区；任何情况不删会话/工作区 | 用户授权是「创建会话 / 工作区」，不含磁盘操作与删除。属性：**preference** | 用户说「顺手把目录建了」时推翻 |
| Decision 6 | 子代理判定用 `origin === 'subagent'` **或** `delegationDepth > 0` | `dsh-session/src/types.ts` 说明 `parentSession` 的存在不代表子代理、要用 `origin`，且 `delegationDepth` 被文档为「parent depth + 1」；`dsh-subagent/src/child-agent.ts:147-151` 同时写 `parentSession` 与 `origin`。属性：**fact**（两字段的语义），**to verify**（本机子代理的实际填充） | A6 若证明两者都为空，退回提示词约束并记入风险 |
| Decision 7 | `prompt` 必须传 `AbortSignal` | `src/index.ts :: prompt` 第 468–469 行 `signal.throwIfAborted()` 是方法第一句，`signal` 无默认值。属性：**fact** | 无 |
| Decision 8 | `[created\|reused]` 与错误尾巴的「was created」只由 id 差集判定 | `dsh-workspace/src/index.ts:533-535` 用 `entity.path === canonical` 字符串比较做幂等，所以 `resolve` 命不中、canonical 相同（8.3 短名、junction）时 create 会返回既有实体 —— 分支自述会撒谎。属性：**fact** | 无 |
| Decision 9 | 错误一律 `throw new Error('<文本>')`，不带 `error: ` 前缀 | 既有工具就是这么抛的（`index.js:145` `throw new Error('send_session_message requires a calling agent')`）。属性：**fact** | 若渲染层要求前缀，A4/A6 的期望串随之调整 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `sessionController.create({ workspaceId })` 会计入工作区 | **proved** | anchor: `dsh-api-session-controller/src/commands.ts :: create` 第 147–157 行 `workspace.attachSession(sessionId)`；falsifiable: 该符号找不到 `attachSession` 即假 |
| P2 | 建出的会话对侧栏可见、用户可进入 | **proved** | anchor: `spike-findings.md :: 四个必须先回答的问题`（`blank: true`、`agentAvailable: true`） |
| P3 | 创建它的 fiber 卸载后会话仍存活 | **proved** | `spike-findings.md :: 插件重载后还在吗` |
| P4 | `sessionController.prompt` 可被插件进程内直接调用（带 signal） | **to verify** | `@Remote` 只做元数据、方法体直接执行；`exec.signal` 已核为 `ToolExecution` 的必填字段（`dsh-tools/src/contracts.ts:113`）。仍未实测。recovery: A5 红则退化为只建会话 |
| P5 | `workspaceRegistry.create` 对已存在目录幂等 | **proved** | `dsh-workspace/src/index.ts :: createCanonical`（第 533–535 行）按 canonical 路径比较后返回既有实体；A3 第四次调用是实测 |
| P6 | 子代理的 header 会带 `origin` 或 `delegationDepth > 0` | **to verify** | 类型声明 + `child-agent.ts:147-151`；本机未实测。recovery: A6 红则按 Decision 6 退路 |
| P7 | `exec.agent.session.header.cwd` 是调用者工作区路径 | **to verify** | 该插件已在用同一字段（`index.js:62` 读 `header.cwd`）。recovery: A2 的 `[reused] default-workspace` 直接检验它 |

## Closure Table

### Round 1 → v2

| Problem ID | Source | Status | Evidence position | Next |
|---|---|---|---|---|
| M1（ADV-03 + G-01，high） | Both | Round 2 判定 **partly** → v3 处置 | A3 前置 + 四次调用 | Round 3 复核 |
| M2（ADV-01，high） | Adv | **Resolved**（Round 2 复核：`exec.signal` 为必填字段） | Step 3 第 1 条 | - |
| M3（ADV-02，high） | Adv | Round 2 判定 **partly**（漏工作区 id）→ v3 第 9 条补齐 | Step 2 第 9 条 | Round 3 复核 |
| M4（ADV-05 + ADV-08 + G-06，medium） | Both | **Resolved**（Round 2 双路线确认） | Step 2 第 3、4 条 | - |
| M5（ADV-04，medium） | Adv | Round 2 判定 **partly**（同上）→ v3 两分支都带 | Step 2 第 9 条 | Round 3 复核 |
| M6（G-03 + ADV-06，medium） | Both | Round 2 判定 **resolved**，但全扫提 S2-06（`origin` 可选）→ v3 加 `delegationDepth` | Step 1 `refusalFor` | Round 3 复核 |
| M7（G-02，medium） | Goal | **Resolved** | A5 `session_id` | - |
| M8（G-04，medium） | Goal | **Resolved**（Round 2 确认快照位置正确） | Step 2 第 8、10 条 | - |
| M9（G-05，medium） | Goal | **Resolved** | Step 0、§3 第 3 条 | - |
| M10（ADV-07，low） | Adv | Round 2：文本已到手，但无验收行 → 记为盲点 `eacces-prose` | Step 2 第 4 条；§8 | 已披露 |
| M11–M13（low） | Goal | **Resolved** | Step 2 第 1 条；「原样回显」；§6 `workdir` | - |
| M14（Author） | - | Round 2 判定 **unresolved**（完成测试跑不通）→ v3 重写 | Step 0 完成测试 | Round 3 复核 |

### Round 2 → v3

| Problem ID | Source | Status | Evidence position |
|---|---|---|---|
| R2-01（Goal：A3 不可重复跑） | Goal | Resolved | A3 前置「若已登记，停下让 User 给未登记目录」 |
| R2-02（Goal + Scan：Step 0 完成测试解析不了裸包名与不存在的文件） | Goal + Scan（S2-01，high） | Resolved | Step 0 完成测试改为读 `package.json` 的 `exports`，不需要 `lib/create.js` 存在 |
| R2-03（Adv + Scan：`[created]` 由分支自述而非证据） | Adv + Scan（S2-02，high） | Resolved | Step 2 第 7 条 id 差集；§5 Decision 8；§8 `workspace-path-case` |
| R2-04（Adv：details 分支漏工作区 id） | Adv | Resolved | Step 2 第 9 条两分支都追加 |
| R2-05（Adv：`EACCES` 无验收行） | Adv | Disclosed | §8 `eacces-prose` |
| R2-06（Scan S2-03：`callerCwd` 未定义） | Scan | Resolved | Step 2 第 5 条 `exec.agent.session.header.cwd` |
| R2-07（Scan S2-04：A4 缺前置行数） | Scan | Resolved | A4 第一步 `list_workspaces` 记 k |
| R2-08（Scan S2-05：throw 与 `error:` 前缀含混） | Scan | Resolved | §3 第 4 条 + §5 Decision 9 + A4/A6 期望串去掉前缀 |
| R2-09（Scan S2-06：`origin` 可选导致 fail-open） | Scan | Resolved | Step 1 `delegationDepth > 0` 第二判据；A1 增 `CASE delegation-depth-refused` |
| R2-10（Scan S2-07：A2 的 `sessions: n+1` 不可靠） | Scan | Resolved | A2 第四次改为「该行包含该 id」 |
| R2-11（Scan S2-08：A5 第二个子用例多建一个会话） | Scan | Resolved | A5 明写「两个新 id 都记入交付清单」 |

## Revision Table（Round 2 → v3）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| R2-02 | Step 0 完成测试改为读 `exports` 字段 | Yes（测试） |
| R2-03 | `[created]` 判定改为 id 差集；错误尾巴同步 | Yes（机制） |
| R2-04 | 两分支都追加工作区 id | Yes（输出） |
| R2-06 | `callerCwd` 写死为 `header.cwd` | Yes（机制） |
| R2-07 / R2-10 / R2-11 | A2/A4/A5 的断言改写法 | No（只改验收判据） |
| R2-08 | 统一 throw 裸文本，期望串去前缀 | Yes（输出） |
| R2-09 | `refusalFor` 加 `delegationDepth` | Yes（机制） |
| R2-01 | A3 加前置条件 | No（只改验收） |

## 本轮变化面（三项，不合并计数）

1. **触及的决策点**：Decision 6（子代理第二判据）、Decision 8（新建/复用的判定来源）、Decision 9（错误形态）。
2. **本轮新增的位置**：§5 Decision 8、9；Step 2 第 5 条；Step 2 第 7 条；A1 的第 8 个用例；§8 `eacces-prose`、`workspace-path-case`。

   **机制数量说明**：本轮三个机制（id 差集、`delegationDepth`、throw 形态），仍超一轮一个的限额。理由：前两个是替换（删掉「分支自述」与「单一 origin 判据」两个既有判据），第三个是把已有的含糊写法钉死，都不是新状态或新依赖。
3. **删除或合并的规则**：删掉 v2 的 Step 0 完成测试（跑不通）；删掉 v2 的 `sessions: n+1` 断言（判据不可靠）；删掉 v2 的「`error: ` 前缀」隐含约定（改为明写 throw 裸文本）。

## Choice List

| 项 | 选择 | 备选与代价 |
|---|---|---|
| A3 用哪个目录证明「创建工作区」 | `C:\Users\ruike\AppData\Local\Temp`，已被登记时由 User 另给一个 | 备选：让 User 每次先建一个专用目录（多一步人工，侧栏更干净） |
| 空白 `prompt` | 视为 `none`，不发请求 | 备选：报错（把「我没想派活」变成失败） |
| 路径不是目录 | 独立错误串 `not a directory:` | 备选：并入 `bad path:`（两种原因混成一个码） |
| `EACCES` | 写进文本 + 记为盲点，不加验收行 | 备选：造一个 ACL 拒绝的目录（Windows 上脆弱） |

## Open items at the stop

（Round 3 进行中，暂无。）

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal and Implementation、Adversarial | 完成：3 high / 6 medium / 4 low |
| 2 | v2 | Goal（复用，核 Closure）、Adversarial（复用，核 Closure）、全扫（新 agent） | 完成：2 high / 3 medium / 2 low + 3 partly |
| 3 | v3 | 同上三路 | 已派发 |
