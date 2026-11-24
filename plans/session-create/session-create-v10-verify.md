# session-create v10 — 复核记录

本文件是 `session-create-v10.md` 的复核轨迹。**执行者不要读**（方案本身自包含）。
写在这里只为让下一个人知道「哪些问题被问过、结论是什么、还剩什么」。

## 复核轮次

| 轮 | 对象 | 结论 | 处理 |
|---|---|---|---|
| 1 | v8 | 5 high / 9 medium | 重写为 v9 |
| 2 | v9 | 3 high / 11 medium（含一条当场跑出来的真故障：仓库里 `import('./plugins/session-mailbox/index.js')` 必然 `ERR_MODULE_NOT_FOUND`，因为 `index.js:3` 裸 import `@deepseek-ai/schemastery`） | 重写为 v10 |
| 3 | v10 | 14 项里 9 项已关闭、5 项部分关闭（H1/H3/M9/M11 + 连带），另有 6 处内部矛盾（集中在 Step 0 的时序与备份口径） | 就地修 v10 |
| 4 | v10（修后） | 11 项里 10 项已消除；剩 1 项：A1 的归属在三处有三种写法，与「不得把任何 A 项记为通过」互撞 | 就地修 v10（改（甲）/（乙）边界：A1 归（甲），（乙）= A2–A8 + Step 4） |

## 第 4 轮之后的状态

最后一轮之后又做了三处纯口径收紧（未再送复核）：

- Step 4 的测试条数改成下界口径（不断言总数，避免「一个 CASE 拆成多个 `test()`」时假红）。
- A4 的 Exit 列补成「第 4–7 步 `expected-error`，其余按 `0` 判」。
- 既有测试条数改成「以改动前那一次的 `ℹ pass` 为基线」，不再写死数字。

**因此：v10 的「无 high / 无 medium」结论来自第 4 轮，最后三处收紧未单独复核。** 若要把这条判据当成硬闸，开工前值得再派一轮只核这三处的复核。

## 复核方式（下一轮照做即可）

派**新的独立 agent**，告诉它：只读被评审的方案 + 仓库 `AGENTS.md` + `plugins/session-mailbox/` 源码 + 已解出的安装包源码目录；
**明令禁止**读本文件、`plans/session-create/archive/`、`STATUS.md` 与其它方案版本；
要求它按 high/medium/low 分级并给 `file:line`，最后回答「能否直接开工」（判据：没有 high 与 medium）。

## 复核中被证伪的怀疑（记下来，别再查一遍）

这几条曾被认为「没有证据、是凭空断言」，实测后结论是**方案原来就是对的**：

- `sessionController.prompt` 的 `signal` 确实是第二个位置参数，函数体第一句确实是 `signal.throwIfAborted()`
  （`dsh-api-session-controller/src/index.ts:468-469`）。
- 错误码 `session/workspace-attach-failed` 真实存在，`details` 键就是 `sessionId` / `workspaceId`
  （`dsh-api-session-controller/src/types.ts:199`）。
- `SessionHeader.delegationDepth` 是真实字段（`dsh-subagent/src/depth.ts:28-36`）。
- `workspaceRegistry.list()` 同步返回 `Workspace[]`、`create(path)` 返回 `Workspace` 本身
  （`dsh-workspace/src/index.ts:254/308`）。

## 复核中确实推翻了一处的假设

「`subagents.rootOf` 不抛就是顶层」——**错**。它有四条路径：一条返回 `activation.root`（可能不是调用者）、
两条抛 `UNAUTHORIZED`、一条返回调用者自身（`dsh-subagent/src/manager.ts:509-522`）。
所以守卫必须比较 `root.id` 与调用者 id，不能只看有没有抛。方案 §0 的 E16 已按此改写。

## 一个仍然存在的已知缺口

`rootOf` 那半个判据没有端到端覆盖：普通 subagent 的 header 就带 `origin: 'subagent'`，
会先在 `refusalFor` 命中，A6 只证明 header 分支。已登记为 Blind Spot `rootof-guard-uncovered`。
