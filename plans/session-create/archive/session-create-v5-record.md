# session-create v5 — Review Record

Reviewed version: **v5**（`session-create-v5.md`）。快照范围：该文件全文 + 本记录。
Reader: Author 与 User。Execution Agent 不读本文件。

## Conclusion

**Round 1–4 完成，Round 5 已派发。** Round 4：2 项 resolved（M1 残差、三处改动面）、全扫另报 2 high / 5 medium / 2 low，全部处置进 v5。

## 级别与依据

**Standard**（两条路线：Goal and Implementation、Adversarial）。四项 Light 判据中三项不成立：会话无删除 API（不可逆）、创建写用户可见的工作区记录、`prompt` 决定工具语义。只有「无迁移无新依赖」成立。

## Decision Table

| No. | Selected implementation | Evidence | Would reject it |
|---|---|---|---|
| Decision 1 | 落在既有插件 `dsh-session-mailbox` | 用户原话「另外那个会话间消息的插件…」。**preference** | 用户要求拆包 |
| Decision 2 | 创建只走 `sessionController.create` | `commands.ts :: create` 第 146–157 行 `workspace.attachSession`。**fact** | 该符号无 `attachSession` |
| Decision 3 | 只传 `workspaceId` | 同文件第 121–123 行两者同给即抛。**fact** | 无 |
| Decision 4 | 不改名 | `rename` 会唤醒会话。**preference** | 用户认不出新会话 |
| Decision 5 | 非法路径只报错；不删任何东西 | 授权范围。**preference** | 用户要求顺手建目录 |
| Decision 6 | 子代理判据 `origin` 或 `delegationDepth` | `dsh-session/src/types.ts` 排除 `parentSession`；`child-agent.ts:146-152` 同时写两者。**fact** | A6 证明两者皆空 |
| Decision 7 | `prompt` 必传 signal | `src/index.ts :: prompt` 第 469 行首句 `throwIfAborted()`。**fact** | 无 |
| Decision 8 | 新建/复用只由 id 差集判定 | `dsh-workspace/src/index.ts:533-535` canonical 短路。**fact** | 无 |
| Decision 9 | 错误 throw 裸文本 | `index.js:145` 既有写法。**fact** | 渲染层要求前缀 |
| Decision 10 | 调用者工作区先 accounting 再 cwd | `entity.ts:102-104` 的 `sessionIds` 是会计视图。**fact** | 无 |
| Decision 11 | 两个工具都声明 `output.schema` + `render` | `dsh-tools/src/contracts.ts:28-29` 强制规范输出；缺它 `defineTool` 被拒或运行期 `ToolOutputError`，会连带卸载既有工具。**fact** | 无 |

## Core Preconditions

| No. | Condition | Status | Evidence |
|---|---|---|---|
| P1 | `create({ workspaceId })` 会计入工作区 | **proved** | `commands.ts :: create` 第 147–157 行；falsifiable: 无 `attachSession` 即假 |
| P2 | 建出的会话对侧栏可见、可进入 | **proved** | `spike-findings.md :: 四个必须先回答的问题` |
| P3 | 创建它的 fiber 卸载后仍存活 | **proved** | `spike-findings.md :: 插件重载后还在吗` |
| P4 | `prompt` 可进程内直接调用（带 signal） | **to verify** | `@Remote` 只做元数据；`exec.signal` 为必填。未实测。recovery: A5 红则退化为只建会话 |
| P5 | `workspaceRegistry.create` 幂等 | **proved** | `index.ts:533-535`；A3 第五次调用是实测 |
| P6 | 子代理 header 带 `origin` 或 `delegationDepth > 0` | **to verify** | `child-agent.ts:146-152`；本机未实测。recovery: A6 |
| P7 | `exec.agent.session.header.cwd` 是调用者 cwd | **to verify** | 插件已在用该字段（`index.js:62`）。recovery: A2 |

## Closure Table

### Round 4 → v5

| ID | Source | Status | 处置位置 |
|---|---|---|---|
| S4-01（high：`list_workspaces` 行里没有会话 id，A2/A3 断言无法满足） | Scan | Resolved | Step 2.1 增加 `workspace` 参数与 `session: <id>` 行；A2/A3 改用该形式 |
| S4-02（high：工具输出契约未写，执行者必须发明） | Scan | Resolved | Step 2.1 / 2.2 给出完整 `output.schema` 与 `render`；§5 Decision 11 |
| S4-03（medium：`create` 返回值没绑定，可能把工作区 id 当会话 id） | Scan | Resolved | Step 2.2 第 8 条 `const { sessionId } = await …create(...)` |
| S4-04（medium：`refusalFor` 判据非空却只判 `=== 'subagent'`） | Scan | Resolved | Step 2.2 第 2 条 `if (refusalFor(...) !== undefined) throw` |
| S4-05（medium：A5 立刻检索会因排队消息尚未落盘而红） | Scan | Resolved | A5 改为最多 30 秒、每 5 秒一次的轮询 |
| S4-06（medium：A6 的 Exit 与「失败发生在子代理里」自相矛盾） | Scan | Resolved | A6 的 Exit 改 `0`，断言子代理报告里的文本 |
| S4-07（medium：junction 那步是项目根外写入 + 建链接，未进停止项） | Scan | Resolved | §6 约定第 4 条 + §7 新增两条停止项 |
| S4-08（low：`workspaces` 变量未曾绑定） | Scan | Resolved | Step 2.2 第 5 条 `const workspaces = …list()` |
| S4-09（low：`<path>` 没说是哪个串） | Scan | Resolved | Step 2.2 明写 `workspacePath` 取 `entity.path` |
| R4-01（Goal：残留会话要记录） | Goal | Resolved | §3 第 5 条写明验收会留下 6 个会话 + 1 个工作区 |
| R4-02（Goal：拆除只拆链接） | Goal | Resolved | §6 约定第 4 条 |

## Revision Table（Round 4 → v5）

| Source | Revision | Changes the implementation action? |
|---|---|---|
| S4-01 | `list_workspaces` 增加 `workspace` 参数与 `session:` 行 | Yes（接口） |
| S4-02 | 写全两个工具的 `output.schema` + `render` | Yes（机制） |
| S4-03 | 显式解构 `{ sessionId }` | Yes（机制） |
| S4-04 | 判据非空即拒 | Yes（机制） |
| S4-05 / S4-06 | A5 轮询、A6 改 Exit | No（只改验收） |
| S4-07 | junction 进停止项 | No（只改流程） |
| S4-08 / S4-09 | 变量绑定、`entity.path` | Yes（实现细节） |

## 本轮变化面（三项）

1. **触及的决策点**：Decision 11（新增：工具输出契约）。
2. **新增位置**：Step 2.1 的 `workspace` 参数与 `session:` 行；两个工具的 `output` 块；Step 2.2 第 5、7、8、10 条；A5 的轮询；A6 的 Exit；§6 约定第 4 条；§7 的 junction 停止项；§8 `cwd-fallback-coverage`。
3. **删除/合并的规则**：删掉 A2/A3 里「该行包含该 id」的模糊说法（行里本没有 id），改为显式的 `session:` 行；删掉「成功返回三行」的散文（改成 schema + render）。

## Choice List

| 项 | 选择 | 备选与代价 |
|---|---|---|
| `list_workspaces` 如何暴露会话 id | 加 `workspace` 参数按需展开 | 每行都附带全部 id（`default-workspace` 有 45 条，输出会很长） |
| A5 的等待 | 轮询 30 秒 | 固定 sleep 10 秒（慢且仍可能红） |
| A6 的 Exit | `0` + 断言子代理报告 | 让子代理把错误逐字回传再断言（多一层转述） |
| junction 拆除 | 回收站 + 只动链接 | 留着（污染 `%TEMP%`） |

## Open items at the stop

（Round 5 进行中，暂无。）

## Rounds

| Round | 冻结版本 | 路线 | 状态 |
|---|---|---|---|
| 1 | v1 | Goal、Adversarial | 3 high / 6 medium / 4 low |
| 2 | v2 | Goal（复用）、Adversarial（复用）、全扫 | 2 high / 3 medium / 2 low + 3 partly |
| 3 | v3 | 同三路 | 1 high / 4 medium / 2 low + 1 partly |
| 4 | v4 | 同三路 | 2 high / 5 medium / 2 low（+ 2 项 resolved） |
| 5 | v5 | 同三路 | 已派发 |
