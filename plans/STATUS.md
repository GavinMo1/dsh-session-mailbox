# 交接状态（2026-11-24 晚，第二台机器接手后更新）

这个仓库除了插件，还放了**未完成工作的方案与记录**，方便换机器接着干。
上一版交接是从 `C:\Users\ruike` 的台式机推的；本版由 `C:\Users\27017` 这台机器接手后更新。

## 目录

```
plugins/session-mailbox/       会话间消息插件（已上线，v0.4.0；create_session 尚未实现）
plugins/user-model/            用户画像库的读写插件 + um CLI（已上线，已启用）
plans/user-model-tools/        上面那个插件的方案与验收记录
plans/session-create/          「建会话 / 建工作区」的方案（v10 待最终复核）
scripts/link-plugins.mjs       把仓库里的插件接到 profile 上（幂等）
```

## 本机现状（先读这段，它和上一台机器不一样）

- 仓库在 `D:\project\dsh-plugins`（clone 自 `https://github.com/GavinMo1/dsh-plugins.git`），分支 `main`。
- profile：`C:\Users\27017\.dsh\profiles\desktop`。
- **两个插件已经接线**（2026-11-24 晚，`node scripts/link-plugins.mjs --apply`）：
  `package.json` 里两条依赖是 `link:D:/project/dsh-plugins/plugins/...`，`dsh.profile.bundles` 末尾追加了
  `dsh-session-mailbox` 与 `dsh-user-model`，`node_modules/` 下两个 **SymbolicLink** 都指向 `D:\project\dsh-plugins\plugins\...`。
  备份在 `<profile>\backups\package.json.bak-link-plugins-20261124135558` 与 `pnpm-lock.yaml.bak-link-plugins-20261124135558`。
- **`pnpm install` 有个坑（已绕过，值得记住）**：pnpm 11.1.2 会把 `pnpm-workspace.yaml` 的 `allowBuilds` 当版本 spec 解析，
  而这份 profile 里有三条 `dsh-synapse@git+https://…` / `@…tar.gz…` / `@…#hash` 的旧条目被判为
  `ERR_PNPM_INVALID_VERSION_UNION`。这三条已删除（只留合法的 `dsh-synapse: true`），原文件备份在
  `<profile>\backups\pnpm-workspace.yaml.bak-20261124-215619`。`dsh-synapse` 并不在 `dependencies` 里，删的是死条目。
  最后用 `pnpm --dir <profile> install --ignore-scripts` 收尾（这两个插件没有 build 脚本）。
- 实测通过：`node --check` 两个 `index.js` 都是 0；`session-mailbox` 单测 **13/13**；`user-model` 单测 **22/22**。
- **重载已完成并验过**（2026-11-24 22:11 重启后）：`plugin_manager` 里
  `include:session-mailbox`（moduleName `dsh-session-mailbox`）与 `include:user-model`（`dsh-user-model`）
  都是 `enabled: true` / `fiberPhase: "active"`。活体功能实测：
  `user_model_search(["ZKQ7"])` 返回 `# library: ok` + 夹具条目（含 `ZKQ7-marker`）；
  `list_sessions({})` 返回 1 条其他顶层会话。→ 接线这一步彻底完成，v10 的 Step 0 前置已满足。
- 库仓库在 `D:\project\user-model`（私有远端 `GavinMo1/user-model`，HEAD 含夹具 `entries/20261124-a9-fixture.md`）。
- **库已经挂好了**：`C:\Users\27017\.agents\user-model` 是指向 `D:\project\user-model` 的 **junction**
  （`LinkType: Junction`）。插件与 `um` CLI 读的就是这个路径（`plugins/user-model/lib/paths.mjs:13-15`
  写死 `os.homedir()`，**不读 `UM_HOME`**）。已实测：`git -C ~/.agents/user-model status` 正常、
  `node plugins/user-model/bin/um.mjs --help` 退出码 0、夹具内容里 `ZKQ7-marker` 在位。
  → 建 junction 不需要管理员权限；**但不要让 `D:\project\user-model` 被移走或删掉**，否则 junction 悬空。

## 一、session-create（**已实现并验收通过**，2026-11-24 晚）

方案：`plans/session-create/session-create-v10.md`（自包含；`v9.md` 是前一稿，`v10-verify.md` 是复核轨迹，都不用读）。
实施与验收记录：`plans/session-create/session-create-v10-acceptance.md`。

**状态**：`session-mailbox` 已到 **v0.7.0**，四个提交依次是
`f3cb731`（create_session + list_workspaces）、`731f715`（文档）、`c3abecd`（archive_sessions）、`9b01e4f`（delete_workspaces）。
A1–A8 全绿；单元测试 `plugins/session-mailbox` 共 **34 条**全过（既有 13 + create 18 + delete 3）。

**清理已经用新的工具做完了**（不再需要 User 手动删）：

| 提交 / tag | 加了什么 | 为什么 |
|---|---|---|
| `c3abecd` / `v0.6.0` | `archive_sessions({ sessionIds, stop? })` | 归档＝离开侧栏但不删转录，宿主有 `unarchiveSession` 可恢复。验收留下的 12 个会话已用它归档 |
| `9b01e4f` / `v0.7.0` | `delete_workspaces({ workspaceIds, force? })` | 删**工作区登记**。目录与会话日志都留盘上，但 `delete` **不 detach**，会话会丢侧栏分组——所以「还持有会话」默认拒绝（要 `force`），「持有调用者自己」即使 `force` 也拒绝 |

`delete_workspaces` 已在真机上用一个临时工作区验过四条路径：持有会话被拒 → `force` 后删掉 → 删完 `%TEMP%` 目录仍在、被归档会话的日志目录仍在 → 未知 id 走 `skipped` 且不报错。

### 已经钉死的事实（不用再验证）

`plans/session-create/spike-findings.md` 的结论仍然成立，另有 v10 §0 新增的 E1–E17 证据表——
它们不是猜的，是直接读 `<DSH 安装目录>/resources/app.asar` 里随包发布的 TypeScript 源码得来的，
每条都带 `file:line`。要点：

- `workspaceRegistry.create(path, title?)` 返回 `Workspace` 实体本身（不是 `{ workspace, created }`），
  内部 `fs.realpath` 规范化，**同一 canonical 路径幂等复用**。所以「新建 vs 复用」只该用 id 差集判定。
- `sessionController.prompt(request, signal)` 的 `signal` 是**第二个位置参数**，函数体第一句就是 `throwIfAborted()`。
- `sessionController.create(request)` 只有一个对象参数，**没有 signal**。
- `SessionHeader.delegationDepth` 真实存在；`subagents.rootOf` 有**四条**路径（两条抛错、一条返回 `activation.root`、一条返回自身），
  所以「不抛 ≠ 顶层」，必须比较 id。
- 仓库目录里 `node -e "import('./plugins/session-mailbox/index.js')"` **必然失败**（`index.js:3` 裸 import
  `@deepseek-ai/schemastery`，仓库里没有那个包）。判入口只能在 profile 里验。

### 评审轨迹

v1→v8 共 7 轮（上一台机器）。本机接着做了两轮独立全扫（新 agent、不看历史）：

- 对 v8：5 high / 9 medium → 重写成 v9。
- 对 v9：3 high / 11 medium → 重写成 v10。
- 对 v10：一轮只核实「14 项是否关闭」的复核，结果见 `session-create-v10-verify.md`。

**判据是「没有 high 与 medium 才能开工」**，别把「已经改了两轮」当成已通过。

### 下一步

**已经做完了。** 留在这里的是「如果还要再改」时的顺序：

1. 改 `plugins/session-mailbox/` 里的代码 → `node --check` + `node --test` → `plugin_manager` 的 `set_plugin` 拨 `entryId`（`include:session-mailbox`）或重启 DSH。
2. 想再评审方案就派新的独立 agent（别让它读 `-record` / `-verify` / `archive`）。
3. 已知未覆盖项见 `session-create-v10-acceptance.md` §6，其中一条值得单独查：**`session_event_search` 在本机每次都 30 秒超时**（不是零结果），与本次改动无关但会挡住「按事件检索」这条路。

## 二、user-model（**A8/A9a/A9b 已由 Agent 代跑通过**，只差删夹具）

已完成：库（私有远端 `GavinMo1/user-model`）、插件三个工具、`um` CLI、单元测试、A1–A7/A10/A11 实测通过。

**A8 / A9a / A9b 三项原本标注「必须真人跑，Agent 无法自建带指定 cwd 的会话」——`create_session` 上线后这条不再成立，已代跑，全部通过：**

| # | 结果 | 关键证据 |
|---|---|---|
| A8a（cwd = `C:\Users\27017`） | 绿 | 调了 `user_model_search(["偏好","习惯","工作方式"])`，答案「先查用户模型库，而不是先猜」 |
| A8b（cwd = `%TEMP%`） | 绿 | 调了 `user_model_search(["偏好","回答风格","习惯"])`，并复述库里那条记录 |
| A9a（周末写代码） | 绿 | 答案里出现 **`ZKQ7-marker`** 与条目 id `20261124-a9-fixture`，据此答「周末通常在下午写代码」 |
| A9b（我养猫吗） | 绿 | 答「查不到相关记录，所以不知道你养不养猫」，结尾邀请补充——没编 |

逐条证据（含工具调用原文）见 `plans/session-create/session-create-v10-acceptance.md` §4。

**只剩下收尾：删夹具**（A9 已通过，按原交接文档该删了；**这一步要 User 点头**，因为它会 commit + push 到私有库）：

```powershell
cd ~/.agents/user-model
git rm entries/20261124-a9-fixture.md
git commit -m "chore: drop A9a fixture"
git push
```

> 注意：`~/.agents/user-model` 是 junction，`git rm` 实际删的是 `D:\project\user-model\entries\20261124-a9-fixture.md`。
> 按仓库规矩，删除应走回收站而非 `rm`；但这条是 git 跟踪文件、`git rm` 后仍可从历史恢复，所以按上面命令做是安全的。

## 三、下一个人在另一台机器上怎么接

```powershell
git clone https://github.com/GavinMo1/dsh-plugins.git D:\project\dsh-plugins
cd D:\project\dsh-plugins
node scripts/link-plugins.mjs --dry-run   # 先看它要改 profile 的什么
node scripts/link-plugins.mjs --apply     # 备份 profile 后接线并 pnpm install
```

`--apply` 里的 `pnpm install` 可能撞 `ERR_PNPM_INVALID_VERSION_UNION`（见上面「本机现状」那个坑）；
绕法是先清掉 `pnpm-workspace.yaml` 里非精确版本的 `allowBuilds` 条目，再 `pnpm --dir <profile> install --ignore-scripts`。

然后读 `plans/session-create/session-create-v10-acceptance.md` 了解现状（v10 方案本身已执行完）。

## 四、注意

- `plans/*/archive/` 是历次版本的评审轨迹，不用删，但执行者不要读。
- 插件代码改动后**必须重载**才能生效：`plugin_manager` `set_plugin`（`target` 填 `entryId`，形如 `include:<rowId>`）
  先 `enabled:false` 再 `true`，或重启 DSH。`dsh-hmr` 不跟踪 junction。
