# AGENTS.md —— 改这个插件之前先读

这份文件写给**动手装、改、排障**的 Agent。用户看 [README.md](README.md)，取舍论证看 [DESIGN.md](DESIGN.md)。
不变量破了就是 bug，不是「风格问题」。

## 它怎么装配的

一句话：**一个 profile bundle，一条 insert，根作用域一个实例。**

- 用户在 profile `package.json` 的 `dsh.profile.bundles` 里登记本包，本包自带 `cordis.patch.yml`：

  ```yaml
  - insert:
      - id: session-mailbox
        name: 'dsh-session-mailbox'
  ```

  加载器把它拼进 profile 的插件图（`cordis.yml` 是空数组，整棵树由 bundle 层 + patch 层组成），`apply(ctx, config)` 每进程跑**一次**。
- `inject = ['tools', 'agents', 'systemPrompt', 'workspaceRegistry']`。这四个是必需的。
- 其余服务全部**软取**：`commands`、`tokenMeter`、`sessionController`、`subagents`、`sessionTitle`、`sessions`。理由是硬的会**整插件不 apply**——`commands` 缺失不该把另外七个工具一起带走。取不到就退化并给具名错误，不猜。
- `apply` 必须同步、必须导出 `name` / `inject` / `Config`。

为什么是单实例、以及为什么状态仍要落文件，见 [DESIGN.md](DESIGN.md#为什么是整宿主一个实例)。

## 不变量

1. **寻址只有一条路**：`lib/pure.js` 的 `resolveTarget` 五步（短名 → 完整 id → 完整标题 → id 后缀 → 标题子串），命中多个一律 `ambiguous` 并给候选，**不猜**。冷会话只能按完整 id 命中。
2. **投递 = 包一层 + 落一次盘**：`agents.withoutInitiator(...)` 包住收件箱 splice（与 Web UI 发 prompt 同一归因），随后 `sessions.flush`。**flush 失败不改变「已投递」**——`lib/deliver.js` 故意吞掉它，把已接收报成没送到是另一种谎。
3. **记账只有一个写入点**：`send_session_message` 投递成功后记一条边；`recordSendEdge` 的失败**不许**影响投递结果（`noteSend` 内外都 try/catch）。入站从不检测，别按方向去补第二个写点。
4. **读路径纯读**：`readPeers` 不建目录、不写、不清理、不修坏文件，`.bak` 只在读坏主文件时回退。**淘汰只在写路径**（`peerstore.FILE_LIMIT`）。
5. **读不到归档集合就拒绝投递**（fail-closed）：`workspaceRegistry.archivedSessionIds` 非数组 → 报 `cannot verify the archived state of …; refusing to deliver`，绝不当作「没归档」放行。
6. **拒绝动调用者自己**：`archive_sessions` 没有越过的开关；`delete_workspaces` 的 `force: true` 也不许删掉持有调用者的工作区。
7. **`compact_session` 不排队、不重试，也不等待**：调用只负责「开压」就把 `status: 'started'` 返回，压缩结果稍后以一条消息送回**调用方**（`followup`，对方空闲与否都能收到）。`busy` 原样透传给调用方，且必须是**同步**失败——判得起的错（busy / 找不到 / 归档 / 没有命令运行时 / 子代理调用）一律走返回值或抛出，绝不留到那条通知里。它可以预检「正在跑 turn」，但**不能**靠 `agent.status` 判断维护期——压缩进行中它仍报 `idle`，所以「同一目标正在压」只能靠插件自己的内存集合（`compacting`）判断，第二次调用回 `already-running`。
8. **数字三态，缺的一端不填**：压缩前后的读数只有三种结局——两端都有、只读得到一端、两端都读不到（没有 token 计量器）。它们现在只体现在**通知文案**里（返回值已不带计数，见第 7 条）：缺的一端写 `?`，两端都缺就明说「压了，但读不到前后大小」，**不编 0**。
9. **消息来源只能是宿主那三键**：`{ kind: 'agent-message', form: 'relay', senderSessionId }`。多一个少一个键，宿主的会话格式校验会抛 `SessionFormatError`。
10. **子代理在 `execute` 期被拒**，不是在注册期：工具对子代理仍然可见（可见性是宿主注册表的），由 `execute` 里检查并报错。
11. **`lib/` 下只许 `node:` 内置**；测试只许 `node:test` + `node:assert`。这是它能被 `link:` 进没有 `node_modules` 的 profile 的前提。
12. **每个工具都必须 `ctx.tools.register(defineTool(...))`**：漏注册的后果是插件加载成功、工具零个、加载器还不报错。

## 验证清单（改完就跑，别口头说「应该没问题」）

```powershell
node --check plugins/session-mailbox/index.js
node --check plugins/session-mailbox/lib/*.js
node --test plugins/session-mailbox/test/*.test.mjs     # 82 条
node scripts/compat-check.mjs                           # 读 app.asar 断言宿主接口
```

- 测试只用 fake ctx / 临时 state 目录（`SESSION_MAILBOX_STATE` 覆盖），不碰真实状态。
- `index.js` 的编排、冷路径装载、真实落盘只能靠实际运行看——测试覆盖的是 `lib/` 的纯函数与投递步骤。**唯一例外是 `compact_session` 的异步边界**：它是个时序性质，跑起来看不出来，所以 `test/compact-async.test.mjs` 用 fake ctx 直接驱动工具本体（fake 的 `commands.execute` 永不 resolve，断言调用照样立刻返回）。那里的两个 fixture 只是为了让 `index.js` 能被 import（一条 `schemastery` 解析映射 + 一个临时 anchor 里的两行宿主包桩），不是依赖。
- **热加载**：`dsh-hmr` 不跟踪 junction。改完源码要 `plugin_manager` `set_plugin`（`target` 填 `entryId`，即 `include:<rowId>`）关一次再开，或重启 DSH。
- **热加载顺序**：先把自己要发的消息发出去，再 reload——关掉这个插件的那一瞬间，`send_session_message` 也一起消失（同一个插件提供的）。

## 误诊手册

| 你看到的 | 真因 | 看哪里 |
|---|---|---|
| `compact_session` 报 `busy` | **不是故障**：目标会话正在跑一轮，或正在维护。错误码在本版 `dsh-compaction-basic` 上不细分（摘要失败/落盘失败也被重包成 `busy`） | 目标会话自己的日志里 `compaction/end{error}` |
| `compact_session` 成功但通知里写「读不到前后大小」 | 这台 DSH 没挂 token 计量器，不是压缩没发生 | `ctx.get('tokenMeter')`；`dsh-token-meter` 是否在 bundles 里 |
| `compact_session` 返回 `started` 后再没消息来 | 见「已知盲点」：DSH 在压缩途中重启，那次不会有完成通知——**当没压处理**，重发一次即可 | 目标会话日志里有没有 `compaction/end` |
| 同一目标连着调两次，第二次 `already-running` | 上一次还在压。不排队不重试，等第一条通知 | 通知里的 `压缩完成：` / `这次没压成：` |
| 通知落在调用方「跑了很久的那一轮」后面 | 通知走 `followup`（下一轮/下一步才读），**故意不用 `steer`**：状态消息不该插进别人正在做的那一步 | `lib/` 无涉；看 `notifyCaller` |
| 行尾没有「已回信」 | 无记录：从没经本插件发过，或文件缺失/损坏/版本不认识。**这是设计**，不是漏显示 | `%LOCALAPPDATA%\dsh-session-mailbox\peers.json`；`SESSION_MAILBOX_STATE` 指到哪了 |
| 一直「未回信」但对方坚持回了 | 对方不是**经本插件**回的（用户自己打字、别的插件投递），或回的那条还没落进对方日志 | 同上文件里有没有 `对方id\|自己id` 那条边 |
| 工具一个都没有，插件却加载成功 | 漏了 `ctx.tools.register`；或 bundle 没登记（`enabled` ≠ `installed` ≠ 已登记） | profile `package.json` 的 `dsh.profile.bundles` |
| 改了代码没生效 | `dsh-hmr` 不跟 junction | `set_plugin` 开关一次，或重启 |
| `npm install` 报 ERESOLVE | peer 范围少了宿主那一档预发布 | 本文「peer 范围怎么维护」 |
| `ambiguous session "…"` | 地址命中多个（标题不是唯一地址） | 用完整 `id` 重试 |
| `session not accounted` | `create_session` 建完回读工作区账目没看到它 | `workspaceRegistry.get(<workspaceId>).sessionIds` |
| `ERR_MODULE_NOT_FOUND: @deepseek-ai/…` | 裸 import 从 profile 解析不到 | 必须 `createRequire(anchor)`，anchor 来自 `profileContext.installAnchor` |

## 已知盲点

- **重启丢通知**：`compact_session` 的完成通知只是内存里一个 detached 任务的结果。DSH 重启时正在压的那次不会有完成通知，调用方按没压处理（重发一次即可）。不做工程化补救——进程都没了，那次压缩本来也没跑完，补一条「可能压了也可能没压」的记录比沉默更误导。
- **跨进程看不见**：`compacting` 集合是进程内存，桌面端与 web/qqbot 各有一个 Host 进程，互相不知道对方在压同一个目标。同一进程内重复调用已被挡下；跨进程重复压缩由宿主的 `/compact` 自己报 `busy`。

## peer 范围怎么维护

`dsh-tools` / `dsh-llm` 的范围是**按三元组枚举**的，不是范围推出来的：node-semver 里带预发布的比较符只对同一个 `major.minor.patch` 三元组放行其他预发布。

**宿主再发任何新的补丁级预发布**（`0.2.5-rc.*`、`0.2.6-rc.*` …）就必须给这条范围**再加一段** `>=<新版本>-rc.0 <0.3.0-0`，并升一个 release 版本发出去；否则宿主升上去的用户 `npm install` 会 ERESOLVE，而他们看不出是自己装的包写错了。

稳定版（`0.2.5`、`0.2.6` …）不用动。加段前后都用 `semver.satisfies(v, range, { includePrerelease: false })` 把候选版本过一遍再发。

## 文件地图

| 路径 | 职责 |
|---|---|
| `index.js` | 八个工具的注册与编排；寻址、准入、系统提示词、记账的调用点 |
| `lib/pure.js` | 寻址、允许名单、状态映射、消息正文与 `source` 的构造（纯函数） |
| `lib/deliver.js` | 投递这一步：`withoutInitiator` + `flush`，以及两者的容错 |
| `lib/create.js` | 建会话 / 工作区 / 删除判定的纯逻辑 |
| `lib/compact.js` | `/compact` 结果的形状判定、忙判据、token 前后对比（纯函数） |
| `lib/peers.js` | 「谁最后说话」的边模型：`recordSend`、`lookupPair`、后缀文案（纯函数） |
| `lib/peerstore.js` | 边表的落盘：路径、原子写、**纯读**、唯一的写入口 |
| `test/*.test.mjs` | 各模块的单测（fake ctx / 临时 state） |
| `cordis.patch.yml` | 让加载器往插件图里插一行 |
| `README.md` / `AGENTS.md` / `DESIGN.md` | 用户 / Agent / 为什么 |

## 发布到独立仓

- 独立仓（`GavinMo1/dsh-session-mailbox`，本仓 remote 别名 `public`）是 `git subtree split --prefix=plugins/session-mailbox` 出来的，**根目录就是插件本体**。手动同步，没有自动化。
- 顺序：`git tag dsh-session-mailbox/vX.Y.Z <含文档提交的 HEAD>` → `git subtree split --prefix=plugins/session-mailbox -b tmp-<ver> <同一个 commit>` → 推 main → 推 tag。
- 推 main 之前**先确认快进**：`git ls-remote public refs/heads/main` 拿到的 hash 必须是 split 分支的祖先（`git merge-base --is-ancestor`）。**不是快进就停下来报告，不许 force**——那说明历史被人改过，force 会覆盖别人的东西。
- **mirror 的 tag 指向 split 提交，不是 monorepo 提交**：`v0.10.x` 及更早的 tag 指向 monorepo 根，检出后连 `package.json` 都没有（`git cat-file -e <tag>:package.json` 可验），**在「只从 tag 发布」的口径下是废的，别拿它们当范例**。
- **不能 `git push public --tags`**：同名 tag 在 mirror 指 split 提交、在 monorepo 指 monorepo 提交，`--tags` 会撞。按 refspec 显式推：`git push public <split-sha>:refs/tags/dsh-session-mailbox/vX.Y.Z`。
- 不建 GitHub Release；mirror 的 README 不手改（与 monorepo 是同一份，随 split 走）。
- 教训：旧做法（照抄 monorepo hash）本身就是错的，照着抄只会一直错下去。发现方向错了，用 `--force` 改**自己刚建的** tag 可以，动别人的不行。

## 别做的三件事

- 别为了变绿放宽断言；也别在测试里碰真实状态目录。
- 别在 `lib/` 里引入运行时依赖（包括 `@deepseek-ai/*`）。
- 别把「对方回过信」实现成解析消息文本：结构信息降级成字符串再猜回来，格式一变就静默失效。见 [DESIGN.md](DESIGN.md#为什么是单写点双视角读)。
