# session-create v6 — Review Record

Reviewed version: **v6**（`session-create-v6.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**Round 1–5 完成，Round 6 已派发。** Round 5 有一路失败（`review-scan5` 无输出），已由 `review-scan5b` 接替其全扫职责，该轮记为 **incomplete**。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。三项 Light 判据不成立：会话无删除 API、创建写用户可见的工作区记录、`prompt` 决定工具语义。

## Decision Table

| No. | Selected implementation | Evidence | Would reject it |
|---|---|---|---|
| Decision 1 | 落在既有插件 `dsh-session-mailbox` | 用户原话「另外那个会话间消息的插件…」。**preference** | 用户要求拆包 |
| Decision 2 | 创建只走 `sessionController.create` | `commands.ts :: create` 第 146–157 行 `workspace.attachSession`。**fact** | 该符号无 `attachSession` |
| Decision 3 | 只传 `workspaceId` | 同文件第 121–123 行。**fact** | 无 |
| Decision 4 | 不改名 | `rename` 会唤醒会话。**preference** | 用户认不出新会话 |
| Decision 5 | 非法路径只报错；不删任何东西 | 授权范围。**preference** | 用户要求顺手建目录 |
| Decision 6 | 子代理用「header 命中」+「不在顶层集合」两条正向判据 | `types.ts:123-128`：`origin`/`delegationDepth` 缺省值是「顶层」的标记，所以单靠 header 存在 fail-open；`index.js:41` 已有顶层过滤写法。**fact** | A6 证明两条都失效 |
| Decision 7 | `prompt` 必传 signal | `src/index.ts :: prompt` 第 469 行首句。**fact** | 无 |
| Decision 8 | `created` 在解析出 `entity` 后无条件按 id 差集算 | `index.ts:533-535` canonical 短路；只在 create 分支赋值会漏掉别名拼写。**fact** | 无 |
| Decision 9 | 错误 throw 裸文本 | `index.js:145`。**fact** | 渲染层要求前缀 |
| Decision 10 | 调用者工作区先 accounting 再 cwd | `entity.ts:102-104`。**fact** | 无 |
| Decision 11 | `output.schema` + `render`，`required: true` 写在属性节点 | 既有 `list_sessions` 用同一写法且在本机注册成功（`index.js` 的 `output.schema`）。**fact** | 若某版本 SDK 改为对象级 `required` |
| Decision 12 | `list_workspaces({ workspace })` 先 id 后标题，标题歧义即抛 | `index.ts:243-245`：不同 canonical 路径可以共享显示标题。**fact** | 无 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `create({ workspaceId })` 会计入工作区 | **proved** | `commands.ts :: create` 第 147–157 行；falsifiable: 无 `attachSession` 即假 |
| P2 | 建出的会话对侧栏可见、可进入 | **proved** | `spike-findings.md :: 四个必须先回答的问题` |
| P3 | 创建它的 fiber 卸载后仍存活 | **proved** | `spike-findings.md :: 插件重载后还在吗` |
| P4 | `prompt` 可进程内直接调用（带 signal） | **to verify** | `@Remote` 只做元数据；`exec.signal` 为必填。未实测。recovery: A5 红 → 盲点 `search-can-new-session` 判成因 |
| P5 | `workspaceRegistry.create` 幂等 | **proved** | `index.ts:533-535`；A3 别名调用是实测 |
| P6 | 子代理 header 带判据，或在顶层集合之外 | **to verify**（已加第二条正向判据兜底） | `child-agent.ts:146-152`；`index.js:41` 的顶层过滤。recovery: A6 |
| P7 | `exec.agent.session.header.cwd` 是调用者 cwd | **to verify** | 插件已在用该字段（`index.js:62`）。recovery: A2 |

## Closure Table

### Round 5 → v6

| ID | Source | Status | 处置位置 |
|---|---|---|---|
| S5b-01（high：A6 前后 bookends 不展开会话，断言不可观测） | Scan5b | Resolved | A6 改为逐工作区 `list_workspaces({ workspace: <每个 id> })` |
| S5b-02（high：`queued` 未绑定，Step 2 与 Step 3 各有一个返回点） | Scan5b | Resolved | Step 2 第 12 条算 `promptState`，Step 3 只产出状态；§Step 3 首句「不新增返回点」 |
| S5b-03（medium：`required` 写在属性节点是否合法） | Scan5b | Resolved | §Step 2 首段 + §5 Decision 11：照既有 `list_sessions` 写法（本机已注册成功），**must not** 改对象级 |
| S5b-04（medium：A3 缺少末尾行数步骤、标题寻址无优先级） | Scan5b | Resolved | A3 末尾加 `list_workspaces({})`；Step 2.1 定 id 优先、标题歧义即抛 |
| S5b-05（medium：Core Task (e) 无验收行） | Scan5b | Disclosed | §8 `failure-path-prose` |
| S5b-06（medium：只判 header 会 fail-open） | Scan5b | Resolved | Step 2.2 第 2 条第二条正向判据（不在顶层集合即拒）；§5 Decision 6 |
| S5b-07（medium：A5 一个断言两种成因） | Scan5b | Resolved | §6 A5 下方的成因判别段；盲点 `search-can-new-session` |
| S5b-08（low：`target` 的规范化没定义） | Scan5b | Resolved | Step 1 写明与 cwd 分支同一规范化（`resolve` + 小写） |
| S5b-09（low：会话计数用词） | Scan5b + Goal | Resolved | §3 第 5 条改为「6 个会话（5 空白 + A5 第一个已跑完一轮、计费一次）」 |
| S5b-10（low：`created` 只在 create 分支赋值） | Scan5b | Resolved | Step 2 第 8 条无条件计算；§5 Decision 8 |
| R5-01（Goal：junction 拆除理由写错） | Goal | Resolved | §6 约定第 4 条改用 `cmd /c rmdir`，并给出 `LinkType/Target` 前后证据 |
| R5-02（Adv：标题歧义无定义） | Adv | Resolved | 同 S5b-04 的寻址规则 |

## Revision Table（Round 5 → v6）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| S5b-01 | A6 换成逐工作区展开 | No（只改验收） |
| S5b-02 | 单一返回点 + `promptState` | Yes（机制） |
| S5b-03 | 钉死 schema 写法 | Yes（契约） |
| S5b-04 / R5-02 | 寻址优先级与歧义抛错 | Yes（接口） |
| S5b-06 | 新增第二条子代理判据 | Yes（机制） |
| S5b-07 / R5-01 / S5b-09 | 成因判别、拆除命令、计数用词 | No |
| S5b-08 / S5b-10 | 规范化定义、无条件计算 | Yes（实现细节） |

## 本轮变化面（三项）

1. **触及的决策点**：Decision 6（第二条判据）、Decision 8（无条件计算）、Decision 11（schema 写法）、Decision 12（寻址规则）。
2. **新增位置**：§Step 2 首段（schema 写法）、Step 2.1 寻址规则、Step 2.2 第 2 条第二判据、第 8 条、第 12/13 条、§Step 3 首句、§3 第 5 条计数、§6 约定第 4 条、A5 的成因判别段、A6 的新 bookends、§8 `failure-path-prose` 与 `search-can-new-session`。
3. **删除/合并的规则**：删掉 Step 3 的独立返回点；删掉 A6 的「比较 `session:` 集合」而无展开步骤的写法；删掉 junction 拆除里错误的 `-Recurse` 理由。

## Choice List

| 项 | 选择 | 备选与代价 |
|---|---|---|
| schema 的 `required` 写法 | 属性级（与既有工具一致） | 对象级数组（标准但本机未验证） |
| 子代理判定 | header 命中 + 顶层集合 | 只用 header（fail-open） |
| A5 两种成因 | 变红时人工看 GUI 一眼 | 加注入测试（要临时改 Host 行为） |
| junction 拆除 | `cmd /c rmdir` | `Directory::Delete` 非递归（也可，但跨 PowerShell/CMD 更绕） |

## Open items at the stop

（Round 6 进行中，暂无。）

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal、Adversarial | 3 high / 6 medium / 4 low |
| 2 | v2 | 三路 | 2 high / 3 medium / 2 low + 3 partly |
| 3 | v3 | 三路 | 1 high / 4 medium / 2 low + 1 partly |
| 4 | v4 | 三路 | 2 high / 5 medium / 2 low |
| 5 | v5 | Goal、Adversarial、Scan5（失败→Scan5b 接替） | **incomplete**：2 high / 5 medium / 3 low |
| 6 | v6 | 三路 | 已派发 |
