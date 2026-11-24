# 交接状态（2026-11-24 晚，从 ruike 台式机推送）

这个仓库除了插件，还放了**未完成工作的方案与记录**，方便换机器接着干。
原工作区 `C:\Users\ruike\Documents\deepseek-harness\default-workspace` 不是 git 仓库，所以这里是从那里拷过来的快照。

## 目录

```
plugins/session-mailbox/       会话间消息插件（已上线，v0.4.0）
plugins/user-model/            用户画像库的读写插件 + um CLI（已上线，已启用）
plans/user-model-tools/        上面那个插件的方案与验收记录
plans/session-create/          「建会话 / 建工作区」的方案（评审进行中）
scripts/link-plugins.mjs       把仓库里的插件接到 profile 上（幂等）
```

## 一、user-model（要做的事：只剩验收）

已完成：库 `~/.agents/user-model`（私有远端 `GavinMo1/user-model`）、插件三个工具、`um` CLI、单元测试 22 条全绿、A1–A7/A10/A11 实测通过。

**还没做**（必须真人跑，Agent 无法自建带指定 cwd 的会话）：

- **A8**：两个新会话（cwd 一个在 `C:\Users\ruike` 下、一个在 `C:\Windows\Temp`），各问「你不知道我有什么偏好的时候会先做什么？」→ 应调用 `user_model_search`。
- **A9a**：新会话问「我周末一般什么时候写代码？」→ 答案里应出现 `ZKQ7-marker`（夹具条目 `20261124-a9-fixture` 已在库里）。
- **A9b**：新会话问「我养猫吗？」→ 应仍然反问你。

细节见 `plans/user-model-tools/acceptance-v5-run1.md`。

**收尾**：A9 通过后删夹具
`cd ~/.agents/user-model && git rm entries/20261124-a9-fixture.md && git commit -m "chore: drop A9a fixture" && git push`

**遗留垃圾**：`default-workspace` 里多了 3 个空白会话（spike 时创建，侧栏显示为 (blank)），在 GUI 里删掉即可。

## 二、session-create（要做的事：评审未收尾，一行代码都还没写）

方案文件：`plans/session-create/session-create-v7.md`（执行版）与 `session-create-v7-record.md`（评审记录，执行者不要读）。

背景结论已经实测钉死（见 `spike-findings.md`）：

- 建会话必须走 `sessionController.create({ workspaceId })`；
- `ctx.agents.create` 与 `workspaceController.insertSessionBefore` 两条路都**不会**把会话计入工作区（侧栏看不到）；
- 新会话对侧栏可见、可输入、插件重载后仍存活；
- 建工作区走 `workspaceController.create({ path })`（幂等）。

**评审进度**：v1→v7 共 6 轮，每轮两路线 + 一个全扫 agent。Round 7 只收到两路：

- Goal 路线：v7 清（注册证明、会话计数、无悬挂引用都对）。
- Adversarial 路线：`subagents.rootOf` 的语义核实为正确，但**它会在两种情况下抛异常**（`'agent has no active runtime owner'`、`'subagent tree access requires the exact live caller'`），所以 Step 2.2 第 2 条要把调用包进 `try { … } catch { throw new Error('subagents cannot create sessions') }`。**这条还没落进方案**。

**Round 7 的第三路（全扫）结论没收到**——agent 还在跑时这台机器就收工了，所以 v7 的评审是**不完整**的，不要当作已通过。

## 三、下一个人在另一台机器上怎么接

```powershell
git clone git@github.com:GavinMo1/dsh-plugins.git
cd dsh-plugins
node scripts/link-plugins.mjs --dry-run   # 先看它要改 profile 的什么
node scripts/link-plugins.mjs --apply     # 备份 profile 后接线并 pnpm install
```

然后：

1. **session-create**：把 Adversarial 那条 `try/catch` 落进 v8，重跑一轮全扫（新 agent，不看历史）；无 high/medium 后即可按方案 Step 0–3 实现。
2. **user-model**：跑 A8 / A9a / A9b，绿了删夹具。
3. 库里还留着 `plans/*/archive/` 的历次版本，是评审轨迹，不用删。

## 四、这台机器上的既有状态（供对照）

- profile：`C:\Users\ruike\.dsh\profiles\desktop`，`dsh-session-mailbox` 与 `dsh-user-model` 都是 `link:` 指向本仓库。
- `~/.agents/user-model` 是独立 git 仓库，远端 `GavinMo1/user-model`（私有），已推送。
- DSH 里 `include:user-model` 已启用；插件代码改动后**必须重启 DSH**（ESM 缓存不会因关开而失效）。
