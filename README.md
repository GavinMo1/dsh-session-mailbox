# dsh-session-mailbox

给 DeepSeek Harness 的会话加一个**信箱**：一个 top-level 会话能看见旁边的会话、给对方发消息、钉住它的标题、把它压一压，也能建会话、归档、删工作区登记。

宿主是同一个 DSH Host 进程，纯 Node 内置依赖，零运行时依赖。

## 它是给谁用的

DSH 里「一个会话」等于侧栏里的一行。默认情况下，一行不知道自己旁边还有别的行：

- 想分工时，用户只能手动在另一个窗口里再开一个会话，再把结论复制回来；
- 想收尾时，模型看不到自己刚才开了哪些会话，也没有任何手段把它们从侧栏收走；
- 会话之间的「标题」是给**人**看的（自动生成、随时可能变），模型手里唯一可用的地址只有一串 id。

这个插件把这几条补上：**`list_sessions` 看见同类，`send_session_message` 说一句话过去，`rename_session` 把人话标题钉住，`compact_session` 把对面压一压，`create_session` / `list_workspaces` / `archive_sessions` / `delete_workspaces` 让「开一个、收一个」变成工具调用而不是手动点**。

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

1. 工具列表里应出现这八个：`list_sessions`、`send_session_message`、`rename_session`、`compact_session`、`list_workspaces`、`create_session`、`archive_sessions`、`delete_workspaces`；
2. `list_sessions({})` 应列出本进程里**别的**会话（不含自己）。

工具没出现、但插件没报错，通常是 bundle 没登记（`enabled` 与 `installed` 是两个字段：装了不等于启用了，启用也不等于登记了）。排障见 [AGENTS.md](AGENTS.md#误诊手册)。

本包对宿主版本有要求（`peerDependencies`，不是你要装的依赖）：

| 宿主包 | 接受的版本 |
|---|---|
| `@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-llm` | `>=0.2.2-rc.5 <0.2.3-0 \|\| >=0.2.3-rc.0 <0.3.0-0 \|\| >=0.2.4-rc.0 <0.3.0-0 \|\| >=0.3.0-rc.0 <0.4.0-0 \|\| >=0.4.0-rc.0` |
| `@deepseek-ai/schemastery` | `>=3.19.0` |

Node `>=24.9.0`（与宿主一致）。宿主包由插件运行时按 profile 的安装锚点解析，**不需要**你把它们写进自己的 `dependencies`。`npm install` 报 ERESOLVE 时该动哪里，见 [AGENTS.md](AGENTS.md#peer-范围怎么维护)。

## 八个工具

| 工具 | 一句话 |
|---|---|
| `list_sessions()` | 列出本进程内其它 top-level 会话：短名 `name`（会话 id 末 8 位）、完整 `id`、`title`、`running`/`inactive`、`cwd`；不列自己，不列已归档的会话。和你交换过消息的会话，行尾还会多一小段「已回信 / 未回信」。 |
| `send_session_message({ agent, message })` | 给另一个 top-level 会话投一条纯文本，返回 `{ queued, to, name, statusBefore, primitive, woke }`；`primitive` 说明这次是插进对方当前 step（`steer`）还是给它开新 turn（`followup`）。 |
| `rename_session({ agent, title })` | 给另一个会话换标题；新标题是「用户来源」的，会**钉住**该会话，之后的自动标题生成不再覆盖它。 |
| `compact_session({ agent })` | 对另一个会话跑宿主自己的 `/compact`（压缩较早的历史），返回压缩前后的 token 大小；目标必须空闲，忙则直接报 `busy`，不排队不重试。 |
| `list_workspaces({ workspace? })` | 每行 `<id> \| <title> \| <path> \| sessions: <n>`；给 `workspace`（id 或精确标题）就在该行后展开它的 `session: <id>` 行。 |
| `create_session({ path?, prompt? })` | 新建一个 top-level 会话并挂到某个工作区（因此侧栏可见）；给 `prompt` 就立刻让它开始跑一轮。 |
| `archive_sessions({ sessionIds, stop? })` | 按 id 归档：离开侧栏，**转录仍在磁盘上**，可用宿主的 `unarchiveSession`（或 GUI）恢复。 |
| `delete_workspaces({ workspaceIds, force? })` | 按 id 删**工作区登记**：目录与所有会话日志都留在磁盘上，工作区离开侧栏。 |

### 点名一个会话（`agent` 参数）

五种写法，按这个顺序匹配：`name`（短名）→ 完整 `id` → **完整标题** → id 后缀 → 标题子串。任一步命中多个就报 `ambiguous` 并列出候选，不猜。

一个本进程**没有装载**的会话（冷会话）只能按**完整 id** 命中——它的标题和短名要靠活会话表，冷态下解析不出来。这类 id 通常来自 `list_workspaces` 的展开行（那里打 `session: <id>`，不含标题）。

`send_session_message` / `rename_session` / `compact_session` 遇到冷 id 时，会用宿主的 `sessionController.resolveAgent` 把它从磁盘装载起来，再干活。装载是一次冷启动（读转录 → 解析并 mount agent preset → 发布 Agent），每会话一份，插件不提供卸载，直到 DSH 重启。

### 一次典型用法

1. 主会话 `create_session({ path: 'C:\\work\\proj', prompt: '把 tests 跑绿，跑完把结果发回来' })` 开一个子任务会话；
2. 自己去干别的，回头 `list_sessions({})` 看它那一行；
3. 它做完回一条 `send_session_message`，那一行就带上「已回信（N 分钟前）」；
4. 用完 `archive_sessions({ sessionIds: [...] })` 收走，侧栏就干净了。

### 行尾的「已回信 / 未回信」

`[inactive]` 只说明「现在没在跑」，它同时可能是「干完了没汇报」「干到一半被打断」「早就没用了」。这一小段把它补上：

```
77de88cc [inactive] session-77de… — 给 mailbox 加 compact_session · 自上次派发（40 分钟）未回信
9a1c2b3d [inactive] session-9a1c… — 市场条目改短并落分支 · 已回信（12 分钟前）
```

它只对**经本插件发过消息的会话**出现；用户自己开的、从没被派过活的会话行尾什么都不会多。含义逐条见[已知边界](#已知边界)，机制见 [DESIGN.md](DESIGN.md#为什么是单写点双视角读)。

## 配置

```yaml
# profile 的 cordis.patch.yml 里，本插件条目下的 config
allow: []          # 省略 = 全部放行；[] = 全拒；[<session id>, ...] = 白名单
maxBytes: 65536    # 单条消息 UTF-8 字节上限
```

`allow` 同时管**投递**、**改名**与**压缩**（后两者至少和发消息一样强）。它只按会话 id 匹配：已经装载的会话按解析出的 id 判定，冷会话按你传进来的那个完整 id 判定，所以给冷会话白名单时必须写完整 id。

## 对方收到的是什么

到达对端的消息是一段文本，两行前缀加正文：

```
Agent a1b2c3d4 sent a message:
来自「Release coordination」(a1b2c3d4)
<正文，逐字原样>
```

第二行只在发送方有标题时出现，标题过长会截到 40 个字符加 `…`；正文不做任何处理。

界面上它不是用户气泡，而是一行折叠的「上下文注入」节点（宿主对所有非 `user` 来源的统一处理）；如果这条消息**唤醒**了一个空闲会话，它会变成开启新 turn 的醒目行。

## 已知边界

每条都写清「真撞上时看哪里」——没有去处的边界不写在这里。

- **`queued` 只表示「已进收件箱」，不表示对方读到了**：投递先塞进目标收件箱、再等一次持久化写入，第二步失败不致命也不会把已接收报成没送到。要确认到达，让它回信，然后看行尾有没有「已回信」。
- **归档的会话收不到消息**，也不会被冷路径拉起来：要联系它先 `unarchiveSession`（或 GUI）恢复。
- **标题是快照，也不是地址**：消息头里那行 `来自「标题」` 是发送那一刻的标题；之后改名不会改写已投出去的消息。要长期引用某个会话，用完整 `id`（或 `source.senderSessionId`），别用标题。
- **「未回信」是可见性，不是收据**：它只说明「经本插件发出的最后一条之后，对方没有经本插件回过」。对方用别的路子回你（用户自己打字、别的插件投递），这里看不到。判错的时候查 `peers.json`（路径见 [AGENTS.md](AGENTS.md#文件地图)）。
- **从没被本插件发过消息的会话，行尾什么都不会多**：这是设计，不是漏显示。
- **记录读不到就当作「无记录」，绝不标「未回信」**：文件缺失、坏掉、版本不认识时，列表照常出，只是没有后缀。所以「没后缀」和「没回过信」是两件事。
- **只在同一个 Host 进程内**：不同 DSH 实例、不同 CLI 进程之间互不可见。
- **子代理不能用这些工具**：`execute` 期会明确拒绝（它们该用 `send_message` / `list_agents`）。工具本身对子代理仍可见，那是宿主注册表的事。
- **`create_session` 建的会话不会被自动清理**，误建只能由你在 GUI 里删；它也不声明并发安全（两个并发调用可能把已有工作区报成 `[created]`，方向无害）。
- **删工作区登记会 orphan 会话**：会话还在、还能被列出，只是失去侧栏分组，所以持有会话时默认拒绝，要 `force: true`。
- **消息不代表授权**：消息里没有任何可表达权限的字段，对端是「按它自己的权限判断」，不是机制拦截。

## 卸载

从 profile 的 `dsh.profile.bundles` 与 `dependencies` 各删一行 → `pnpm --dir <profile> install` → 重启。重启后工具列表里应**没有**这八个工具。只把 `enabled` 关掉不算卸载。

卸载**不会**回头修改既有转录：旧会话里仍然留着当时注入的系统提示词快照，以及 `source.kind === 'agent-message'` 的历史事件（这类事件不进 `session export`，导出只取 `kind === 'user'` 的）。

## 更多

- 机制与取舍（为什么这么实现、否决过什么）：[DESIGN.md](DESIGN.md)
- 不变量、验证步骤、误诊手册、文件地图：[AGENTS.md](AGENTS.md)

## License

MIT © 2026 GavinMo1
