# dsh-session-mailbox

给 DeepSeek Harness 的会话加一个**信箱**：让一个 top-level 会话能看见、给对方发消息、改对方的标题，也能把宿主里建会话 / 归档 / 删工作区登记这几件事交给模型做。

宿主是同一个 DSH Host 进程，纯 Node 内置依赖，零运行时依赖。

## 它是给谁用的

DSH 里「一个会话」等于侧栏里的一行。默认情况下，一行不知道自己旁边还有别的行：

- 想分工时，用户只能手动在另一个窗口里再开一个会话，再把结论复制回来；
- 想收尾时，模型看不到自己刚才开了哪些会话，也没有任何手段把它们从侧栏收走；
- 会话之间的「标题」是给**人**看的（自动生成、随时可能变），模型手里唯一可用的地址只有一串 id。

这个插件把这几条补上：**`list_sessions` 看见同类，`send_session_message` 说一句话过去，`rename_session` 把人话标题钉住，`compact_session` 把对面压一压，`create_session` / `list_workspaces` / `archive_sessions` / `delete_workspaces` 让「开一个、收一个」变成工具调用而不是手动点**。

一次典型用法：主会话建一个子任务会话 → 给它一条首条消息让它开工 → 自己去干别的 → 对方做完回一条 `send_session_message` → 主会话把已经用完的会话 `archive_sessions` 收走。全程不需要用户切窗口。

## 依赖的宿主版本

本包只通过公开的 Cordis 服务与工具 API 接触宿主，不发版宿主源码。运行前请确认宿主版本满足：

| 宿主包 | 接受的版本 | 用来做什么 |
|---|---|---|
| `@deepseek-ai/dsh-tools` | `>=0.2.2-rc.5 <0.2.3-0 \|\| >=0.2.3-rc.0 <0.3.0-0 \|\| >=0.2.4-rc.0 <0.3.0-0 \|\| >=0.3.0-rc.0 <0.4.0-0 \|\| >=0.4.0-rc.0` | `defineTool`：工具的 schema 与注册 |
| `@deepseek-ai/dsh-llm` | `>=0.2.2-rc.5 <0.2.3-0 \|\| >=0.2.3-rc.0 <0.3.0-0 \|\| >=0.2.4-rc.0 <0.3.0-0 \|\| >=0.3.0-rc.0 <0.4.0-0 \|\| >=0.4.0-rc.0` | `createUserMessage`：构造要投递的消息 |
| `@deepseek-ai/schemastery` | `>=3.19.0` | 插件 `Config` 的解析 |

Node `>=24.9.0`（与宿主一致）。

宿主包由插件运行时按 profile 的安装锚点解析，**不需要**你把它们写进自己的 `dependencies`。上表是 `peerDependencies`，npm 只用作兼容性检查。

为什么 dsh-tools / dsh-llm 的写法这么长：node-semver 里**带预发布的比较符只对同一个 `major.minor.patch` 三元组放行其他预发布**。所以单写 `>=0.2.2-rc.5` 时，宿主一旦换成 `0.2.3-rc.1` 或 `0.3.0-rc.1`，`npm install` 会直接 ERESOLVE —— 而用户完全看不出是自己装的包写错了。上面按三元组逐段列出（`0.2.2-rc.5`→`0.2.3-0`、`0.2.3-rc.0`→`0.3.0-0`、`0.2.4-rc.0`→`0.3.0-0`、`0.3.0-rc.0`→`0.4.0-0`、`>=0.4.0-rc.0` 向上不设界），保证每一档 minor 的预发布宿主都能装上。

**维护者请注意（可执行判断）**：三段 `0.2.x` 是枚举出来的，不是范围推出来的。宿主**再发任何新的补丁级预发布**（`0.2.5-rc.*`、`0.2.6-rc.*` 同理——当前矩阵里 `0.2.5-rc.1` 就是 fail），必须给这条范围**再加一段 `>=<新版本>-rc.0 <0.3.0-0`**（`>=0.2.5-rc.0 <0.3.0-0`、`>=0.2.6-rc.0 <0.3.0-0` …），并升一个 patch 版本发出去；否则宿主升上去的用户 `npm install` 会 ERESOLVE。稳定版（`0.2.5`、`0.2.6` …）不用动，它们一直通过。

## 安装

```bash
pnpm --dir <你的 DSH profile 目录> add dsh-session-mailbox
```

然后在 profile 的 `package.json` 里把 bundle 登记进去：

```json
{
  "dsh": {
    "profile": {
      "bundles": ["dsh-session-mailbox"]
    }
  }
}
```

`install` 之后**重启 DSH**。本包自带 `cordis.patch.yml`，加载器据它往 profile 的插件图里插一行 `session-mailbox`，工具随插件一起出现。

装好后的自检（在任一会话里）：

1. 工具列表里应出现 `list_sessions`、`send_session_message`、`rename_session`、`list_workspaces`、`create_session`、`archive_sessions`、`delete_workspaces`；
2. `list_sessions({})` 应列出本进程里**别的**会话（不含自己）。

工具没出现、但插件没报错，通常是 bundle 没登记（`enabled` 与 `installed` 是两个字段：装了不等于启用了，启用也不等于登记了）。

## 八个工具

| 工具 | 一句话 |
|---|---|
| `list_sessions()` | 列出本进程内其它 top-level 会话：短名 `name`（会话 id 末 8 位）、完整 `id`、`title`、`running`/`inactive`、`cwd`；不列自己，不列已归档的会话。**和你交换过消息的会话，行尾还会多一小段「已回信 / 未回信」**（见下）。 |
| `send_session_message({ agent, message })` | 给另一个 top-level 会话投一条纯文本，返回 `{ queued, to, name, statusBefore, primitive, woke }`，其中 `primitive` 说明这次是插进对方当前 step（`steer`）还是给它开新 turn（`followup`）。 |
| `rename_session({ agent, title })` | 给另一个会话换标题；新标题是「用户来源」的，会**钉住**该会话，之后的自动标题生成不再覆盖它。 |
| `compact_session({ agent })` | 对另一个会话跑宿主自己的 `/compact`（压缩较早的对话历史），返回压缩前后的 token 大小；目标必须空闲，忙则直接报 `busy`，不排队不重试。 |
| `list_workspaces({ workspace? })` | 每行 `<id> \| <title> \| <path> \| sessions: <n>`；给 `workspace`（id 或精确标题）就在该行后展开它的 `session: <id>` 行。 |
| `create_session({ path?, prompt? })` | 新建一个 top-level 会话并挂到某个工作区（因此侧栏可见）；给 `prompt` 就立刻让它开始跑一轮。 |
| `archive_sessions({ sessionIds, stop? })` | 按 id 归档：离开侧栏，**转录仍在磁盘上**，可用宿主的 `unarchiveSession`（或 GUI）恢复。 |
| `delete_workspaces({ workspaceIds, force? })` | 按 id 删**工作区登记**：目录与所有会话日志都留在磁盘上，工作区离开侧栏。 |

### `agent` 参数怎么填

五种写法，按这个顺序匹配：`name`（短名）→ 完整 `id` → **完整标题** → id 后缀 → 标题子串。任一步命中多个就报 `ambiguous` 并列出候选，不猜。

一个本进程**没有装载**的会话（冷会话）只能按**完整 id** 命中——它的标题和短名要靠活会话表，冷态下解析不出来。这类 id 通常来自 `list_workspaces` 的展开行（那里打 `session: <id>`，不含标题）。

`send_session_message` / `rename_session` / `compact_session` 遇到冷 id 时，会用宿主的 `sessionController.resolveAgent` 把它从磁盘装载起来，再干活。装载是一次冷启动（读转录 → 解析并 mount agent preset → 发布 Agent），每会话一份，插件不提供卸载，直到 DSH 重启。

### 行尾的「已回信 / 未回信」

`[inactive]` 只说明「现在没在跑」，它同时可能是「干完了没汇报」「干到一半被打断」「早就没用了」。这一小段把它补上：

```
77de88cc [inactive] session-77de… — 给 mailbox 加 compact_session · 自上次派发（40 分钟）未回信
9a1c2b3d [inactive] session-9a1c… — 市场条目改短并落分支 · 已回信（12 分钟前）
```

**单写点，双视角。** 每条消息都是经本插件发出的，所以记账只有一处：`send_session_message` 成功后记一条边 `from → to`。两个方向都从这张表按方向读：

- 我最后发给 X 的时间 = 边 `我 → X`
- X 最后发给我的时间 = 边 `X → 我`
- 于是「它回过信」= **存在 `X → 我` 这条边**，不是去消息文本里认 `Agent <短名> sent a message:` 那种前缀（字符串格式一变就静默失效，结构信息不该降级成文本再猜回来）

**落盘而不是内存。** 插件在宿主里是**单实例、根作用域**（`profile.bundles` 里的一条 insert，`apply` 每进程跑一次），进程内内存本来就互通；落文件是为了另外三条：重启不丢、同机多 profile 多进程能对上、以及「读」永远读当前事实而不是本进程的记忆。

- 路径：`%LOCALAPPDATA%\dsh-session-mailbox\peers.json`（macOS `~/Library/Application Support/`，其余 `$XDG_STATE_HOME` 或 `~/.local/state`）；`SESSION_MAILBOX_STATE` 可覆盖整个目录（测试用）。
- 写入：兄弟临时文件 + `rename` 覆盖，另留一份 `.bak`；主文件损坏时读回退到 `.bak`。
- **读是纯读**：不建目录、不写、不清理、不修坏文件。淘汰只发生在写路径上。
- 上限 **200 条边**，按最近使用淘汰（只在写时）。

时间取消息自身的时刻（发信那一刻 / 事件落盘时宿主盖的 `event.time`），**不看文件 mtime**。显示粒度：不到 1 分钟、`N 分钟`、`N 小时`、`N 天`。

### 压缩一个会话

`compact_session` 不自己压：它把目标会话的 `Agent` 交给宿主的 `CommandRuntime.execute(agent, '/compact', [], signal)`，也就是 GUI 里敲 `/compact` 走的同一条路（命令由 `@deepseek-ai/dsh-command-compact` 注册，**不接受任何参数**）。因此：

- **跨会话可行**：命令表视图是按 agent 分开的，命令记进的是**目标会话自己的日志**（`command/run` + `command/done`），这是正常生命周期，不是污染。
- **目标必须空闲**：中途的会话宿主会回 `busy`（`ManualCompactionError`）。本插件不排队、不重试，直接把这句话报给调用方。注意 `agent.status` 在压缩进行中仍报 `idle`，所以插件只能预先挡掉「正在跑 turn」的会话，真正的并发保护在宿主侧。另外按本版宿主的源码，`dsh-compaction-basic` 把自己那条 `runMaintenance` 里出来的**任何**失败都重新包装成 `busy`，所以「摘要失败 / 落盘失败」大概率也以 busy 那句话出现——错误码在这个 backend 上不细分，要看细节得读目标会话日志里的 `compaction/end{error}`。
- **大小从宿主的 token 计量器读**：`ctx.tokenMeter`（`@deepseek-ai/dsh-token-meter`）的 `measure(session).totalTokens` 取压缩前 / 压缩后，`contextPressure(session)` 取上下文窗口。取的是数字，不从命令返回的那句给人看的文案里抠。这台 DSH 没有挂 token 计量器时，工具会明说 `countSource: unavailable`，而不是编一个数出来。
- **要求宿主编好了 `/compact`**：`ctx.get('commands')` 拿不到、或 `execute` 返回 `undefined`（宿主唯一可靠的「没这个命令」信号），都会以具名错误失败。

### 建、归档、删的语义要点

- **`create_session` 不建目录、不删东西**：`path` 必须是已存在的绝对目录，否则报错。建完会立刻回读工作区账目，证明这个会话此刻确实挂在里面，否则报 `session not accounted`。
- **`create_session` 的 `prompt` 会真的消耗一次模型调用并跑工具**；空白视为没给。
- **归档 ≠ 删除**：只把 id 写进宿主的 `archivedSessionIds`，转录、日志目录、工作区账目都不动，所以 `list_workspaces` 的 `sessions: <n>` 仍然算上已归档的（那是账目大小，不是可见会话数）。运行中的会话默认拒绝，`stop: true` 才会先停再归档。
- **删登记 ≠ 删目录、≠ 删会话**：只去掉注册表里那条记录。代价是**它会 orphan 会话**——会话仍然存在、仍能被 `list_sessions` 列出，只是失去侧栏分组。所以还持有会话时默认拒绝，要 `force: true`。
- 两个工具都**拒绝动调用者自己**（`archive_sessions` 不给越过的开关，`delete_workspaces` 的 `force` 也不行）：不能把用户正在看的东西藏起来。

## 配置

```yaml
# profile 的 cordis.patch.yml 里，本插件条目下的 config
allow: []          # 省略 = 全部放行；[] = 全拒；[<session id>, ...] = 白名单
maxBytes: 65536    # 单条消息 UTF-8 字节上限
```

`allow` 同时管**投递**与**改名**（改名至少和发消息一样强）。它只按会话 id 匹配：已经装载的会话按解析出的 id 判定，冷会话按你传进来的那个完整 id 判定，所以给冷会话白名单时必须写完整 id。

## 收到的那条消息长什么样

到达对端的消息是一段文本，两行前缀加正文：

```
Agent a1b2c3d4 sent a message:
来自「Release coordination」(a1b2c3d4)
<正文，逐字原样>
```

- 第一行是宿主能解析的形状 `/^Agent (\S+) sent a message:/u`：聊天界面用它做发送者徽标，统计面板用它折叠这段前缀。因为 `\S+` 不容空格，**标题不能放第一行**（标题里带空格是常态），所以第一行与没有标题时逐字节一致，可读的身份放在第二行。
- 第二行**只在发送方有标题时出现**；标题会先被清理——控制字符与换行变空格、连续空白合并、超长按码点截到 40 个再加 `…`。正文不做任何处理。
- 来源（`source`）用宿主自己为「一个 agent 发给另一个 agent」定义的三键：`{ kind: 'agent-message', form: 'relay', senderSessionId }`。多一个键少一个键都会让宿主的会话格式校验抛 `SessionFormatError`，所以标题不进 `source`。

界面上它不是用户气泡，而是一行折叠的「上下文注入」节点（宿主对所有非 `user` 来源的统一处理）；如果这条消息**唤醒**了一个空闲会话，它会变成开启新 turn 的醒目行。

## 已知边界

- **「未回信」是派生的，不是承诺**：它只说明「经本插件发出的最后一条消息之后，对方没有经本插件回过我」。对方用别的路子（用户自己打字、别的插件投递）回你，这里看不到；反过来，只有对方真正发回来才会出现「已回信」。所以这是**可见性**，不是收据。
- **从没被本插件发过消息的会话，行尾什么都不会多**：没有边就没有这行字——用户自己开的会话不会被标红。
- **记录读不到就当作「无记录」，绝不标「未回信」**：文件缺失、坏掉、或版本不认识时，`list_sessions` 照常出行，只是没有后缀；读取全程不写盘（不建目录、不修文件、不清理）。
- **时间取消息时刻，不取文件 mtime**：发信用发信那一刻，入站用宿主落盘时盖的 `event.time`。所以整份文件被复制/触碰过，显示依然是对的。
- **只在同一个 Host 进程内**：不同 DSH 实例、不同 CLI 进程之间互不可见。
- **子代理只在 execute 期被拒**：`list_sessions` / `send_session_message` / `rename_session` 在 `execute` 里检查调用者，子代理调用会收到明确的报错；但**工具对子代理仍然可见**（它们出现在子代理的工具列表里），因为可见性是宿主注册表的事，不是插件能在执行期改的。子代理此刻该用的是 `send_message` / `list_agents`，它们操作的是子代理树。
- **归档集合读不到就拒绝投递（fail-closed）**：投递前会读宿主的 `archivedSessionIds`；读不到（服务缺失或返回非数组）时报 `cannot verify the archived state of ...; refusing to deliver`，而不是当作「没归档」放行。`list_sessions` 在这种情况下退化成不筛归档，但投递仍会拒绝。
- **消息头第二行 `来自「标题」(短名)` 是发送那一刻的标题快照**：发送方之后改名，不会改写已经投递出去的那条消息。标题是给人看的，不是地址。
- **跨会话稳定身份是 `source.senderSessionId`**：由插件从调用者的 session id 写入，模型改不了。要长期引用某个会话，用它（或完整 `id`），不要用标题——标题由 LLM 自动生成、会随新消息重新生成，两个分支也可能同名。
- **归档会话收不到消息**：冷路径在装载之前就完成归档校验，所以唤醒一个已归档会话只会被拒，不会被拉起来空转。
- **`queued` 只表示「已进收件箱」，不表示对方读到了。** 投递先把消息塞进目标收件箱（以不归属发送方这一轮的方式，与 Web UI 发 prompt 同一归因），再 `await` 一次持久化写入，尽量缩短「收了但没落盘」的窗口；两步里第二步失败不致命，也不会把已接收报成没送到。要确认到达，请让对方回信。
- **投递不分 workspace**。
- **消息能不能被对方执行由对方决定**：消息里没有任何可表达权限的字段，提示词层面是「对端的请求按我自己的权限判断」，不是机制拦截。
- **`create_session` 建的会话不会被自动清理**：误建只能由用户在 GUI 里删，插件不提供删除。它也不声明并发安全：两个并发调用共用同一份「调用前 id 快照」，后一个可能把已有工作区报成 `[created]`（方向无害）。
- **`create_session` 对子代理不可用**：header 自报子代理、或 `subagents.rootOf` 指向别的 agent 时一律拒绝；`subagents` 服务取不到时也是拒绝，不是放行。
- **`rename_session` 不能唤醒冷会话**：它只走活会话表解析，冷 id 在解析阶段就是 `notfound`。要给冷会话改名，先按完整 id 发一条消息把它唤醒。
- **标题不是唯一地址**：命中多个一律拒绝。别名长度（短名）也只在本进程当前存活集合内唯一，且随集合变化可能改变。
- **`compact_session` 会改写目标会话的历史**：它是唯一一个会改变另一个会话内容长度的工具。它不删磁盘上的转录文件（压缩由宿主的 compaction 语义负责），但目标会话的可见上下文会变短，且事后无法从这里撤回。
- **压缩中的会话 `agent.status` 仍报 `idle`**：所以插件的「忙」预检只能挡掉正在跑 turn 的会话，真正的并发保护在宿主侧（回 `busy`）。这两层里，宿主那句才是权威。
- **压缩前后的大小有三态**：`countSource: token-meter`（前后都读到）、`token-meter-partial`（只读到一端，缺失的那端**不填**）、`unavailable`（这台 DSH 没挂 token 计量器）。数字取 `tokenMeter.measure(session).totalTokens`（按日志重放，压缩落盘后立刻变），不是 `contextPressure().pressureTokens`——后者只报**上一次** LLM 调用的 prompt 大小，压缩后要等下一轮才会动。
- **维护期（compaction 等）的会话**其 `agent.status` 仍报 `idle`，因此会被显示成 `inactive`。

## 卸载

主路径：从 profile 的 `dsh.profile.bundles` 与 `dependencies` 各删一行 → `pnpm --dir <profile> install` → 重启。重启后工具列表里应**没有**这八个工具。只把 `enabled` 关掉不算卸载。

卸载**不会**回头修改既有转录：旧会话里仍然留着当时注入的系统提示词快照，以及 `source.kind === 'agent-message'` 的历史事件（这类事件也不进 `session export`，导出只取 `kind === 'user'` 的）。

## 开发

```bash
node --test test/*.test.mjs   # 在包根目录跑
```

测试只用 `node:test` + `node:assert`，覆盖 `lib/` 的纯函数与投递步骤 `lib/deliver.js`（用 fake ctx，只证明「包一层、调一次、await 一次」的顺序与容错）。`index.js` 里的编排、冷路径装载与真实落盘只能靠实际运行验证。

`lib/` 下只允许 `node:` 内置模块——这是它能在没有 `node_modules` 的 profile 里被直接 `link:` 的前提。

## License

MIT © 2026 GavinMo1
