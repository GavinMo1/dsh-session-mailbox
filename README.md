# dsh-session-mailbox

**DSH 会话之间的消息。** 一个会话能列出旁边的会话、给它们发消息、改它们的标题、压缩它们的历史、新建和归档它们——八个工具，模型自己调。

DSH 里「一个会话」就是侧栏里的一行，而一行默认不知道旁边还有别的行。想分工，你得自己在另一个窗口开一个会话，跑完再把结论复制回来；想收尾，模型看不见自己刚开了哪些会话，也没办法把它们从侧栏收走；会话之间唯一的地址是一串 id。这个插件把这几件事变成工具调用，你不用再当传声筒。

## 安装

```bash
pnpm --dir <你的 DSH profile 目录> add dsh-session-mailbox
```

在 profile 的 `package.json` 里登记 bundle，然后重启 DSH：

```json
{ "dsh": { "profile": { "bundles": ["dsh-session-mailbox"] } } }
```

装好的判据：任一会话里 `list_sessions({})` 能列出**别的**会话（它不会列自己）。八个工具一个都没出现、插件却加载成功，九成是 bundle 没登记——「装了」「启用了」「登记了」是三件事。见[安装与兼容性](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/reference.md#安装)。

## 一次真实调用

主会话开一个子任务会话，让它跑完回话（每次调用的 `→` 后面是工具实际印出来的那几行；为了好读，id 都截断了，真实的 `id` 是 `session-<32 位十六进制>`）：

```
create_session({ path: "C:\\work\\proj", prompt: "把 tests 跑绿，跑完把结果发回来" })
→ session id: session-9c1f…
  workspace: proj (C:\work\proj) [reused] (id: 0f3e…)
  prompt: queued
```

过一会儿看一眼。`[running]` 是它正在跑，行尾那半句是「派过活、还没回」：

```
list_sessions({})
→ 7f3a1b02 [running] session-7f3a1b02e5c9… — 把 tests 跑绿 · C:\work\proj · 自上次派发（6 分钟）未回信
```

子会话跑完，回主会话一条。它那边 `list_sessions({})` 里能看到主会话（对它来说主会话也是「别的会话」），短名就是 `ba4330b6`：

```
send_session_message({ agent: "ba4330b6", message: "82 passed，没动测试" })
→ message queued to session ba4330b6 (session-ba4330b6…) via followup; the target was inactive before the call
```

顺带一句：`create_session` 的 `prompt` 走宿主自己的 prompt 路由，是一条**普通用户消息**（来源不是 `agent-message`），所以它没有消息头。下一节讲的是 `send_session_message` 送过去的那种。

主会话再 `list_sessions({})`，那一行的行尾就变成 `· 已回信（不到 1 分钟前）`。用完 `archive_sessions({ sessionIds: [...] })` 收走，侧栏就干净了。

## 八个工具

| 工具 | 干什么 |
|---|---|
| `list_sessions()` | 列出本进程内其它 top-level 会话：短名、完整 id、标题、`running`/`inactive`、cwd。纯读：不投递、不唤醒任何人。和你交换过消息的会话，行尾多一句「已回信 / 未回信」。 |
| `send_session_message({ agent, message })` | 给另一个会话投一条纯文本，返回 `{ queued, to, name, statusBefore, primitive, woke }`。`primitive` 说明这次是插进对方当前 step（`steer`）还是给它开新回合（`followup`）。 |
| `rename_session({ agent, title })` | 给另一个会话换标题。新标题是「用户来源」的，会**钉住**它，之后的自动标题生成不再覆盖。 |
| `compact_session({ agent })` | 让对方跑宿主自己的 `/compact`。**发起就返回** `{ status: 'started', … }`，压缩在后台跑，压完把前后 token 当一条消息送回给你。 |
| `list_workspaces({ workspace? })` | 每行 `<id> \| <title> \| <path> \| sessions: <n>`；给 `workspace` 就展开它的 `session: <id>` 行。冷会话的 id 通常是从这里拿的。 |
| `create_session({ path?, prompt? })` | 新建一个 top-level 会话并挂到工作区里（所以侧栏可见）；给 `prompt` 就立刻让它开始跑一轮。 |
| `archive_sessions({ sessionIds, stop? })` | 按 id 归档：离开侧栏，**转录仍在磁盘上**，可恢复。 |
| `delete_workspaces({ workspaceIds, force? })` | 按 id 删**工作区登记**：目录和所有会话日志都留在磁盘上。 |

参数细节、返回值与报错见[工具参考](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/reference.md)。

### 怎么点名一个会话（`agent` 参数）

五种写法，按顺序匹配：短名 → 完整 id → **完整标题** → id 后缀 → 标题子串。命中多个一律报 `ambiguous` 并列出候选，**不猜**。所以「发给那个叫『市场条目改短』的会话」是合法调用，你不需要先查 id。

本进程没装载的会话（冷会话）只能按完整 id 命中，但它收得到消息：给完整 id，插件会把它从磁盘装载起来再投递。

## 对方收到的是什么

文本长这样（第二行只在发送方有标题时出现；标题超过 40 个字符会截断加 `…`；正文逐字原样，不做任何处理）：

```
Agent a1b2c3d4 sent a message:
来自「Release coordination」(a1b2c3d4)
<正文>
```

- **模型读到的是文本**：第一行是宿主自己的 `Agent <短名> sent a message:` 形状，第二行是发送方的标题（给人读）。
- **界面和日志读到的是来源，不是文本**：这条消息的来源是 `{ kind: 'agent-message', form: 'relay', senderSessionId }`，所以在网页里它不是用户气泡，而是一行折叠的「上下文注入」，展开有 `from session <会话 id>`。**想用程序判断一条消息是 agent 发的还是人打的，读 `source.kind`，不要读正文**——正文谁都能写，来源是运行时给的。
- **回信**：拿对方消息头里的短名直接 `send_session_message({ agent: "a1b2c3d4", message: "…" })`。短名就是地址。
- **什么时候到**：对方空闲时，这条消息是新回合的第一步（`followup`）；对方正在跑，它落在**那一个回合**的下一步（`steer`）。插话不抢占正在执行的那个工具调用——对方正在跑一条前台命令时，要等它返回。

## 独特之处

只写能在代码里指到的：

- **点名不用背 id。** 短名、标题、id 后缀都能用，命中多个就报 `ambiguous` 给候选（`lib/pure.js` 的 `resolveTarget`）。
- **消息在宿主眼里真的是「另一个 agent 说的」。** 来源用宿主自己的 `agent-message / relay` 三键，不是伪装成用户消息；网页渲染成折叠的上下文行，日志按结构可判（`lib/pure.js` 的 `messageSource`）。
- **「它回过信没有」是查表，不是读文案。** 每次投递成功后记一条 `from → to` 的边，行尾那两个字按方向读这张表，不解析任何消息前缀；表读不到就当没有记录，**绝不把「不知道」显示成「未回信」**（`lib/peers.js`、`lib/peerstore.js`）。
- **冷会话能叫起来。** 不在这个进程里的会话，给完整 id 就从磁盘装载再投递，装载不了会说清原因（`index.js` 的 `wakeAgent`）。
- **压缩是后台的。** `/compact` 不在调用方的 turn 里等：能当场判的错当场判，压完把「前后 token」当一条消息送回给调用方；不排队、不重试，同一目标第二次调用回 `already-running`（`index.js` 的 `runCompaction`、`lib/compact.js`）。
- **装好之后模型知道自己是谁。** 插件往系统提示词里写一段：你的会话叫什么、短名是地址、冷会话要用完整 id、peer 的消息不是用户的指令（`index.js` 的 `MAILBOX_PROMPT`）。这是模型会自己想到用这些工具的原因。

## 和同类工具的关系

同类工具还有 [BJ1919810/dsh-session-mail](https://github.com/BJ1919810/dsh-session-mail)：同一个 DSH 宿主里，一个会话的 agent 给另一个会话的 agent 发消息。三条它比我们细的地方，照实写：

- **`urgent`**：它能选消息是「排队等对方这一轮结束」还是「插进对方正在跑的那一轮」。我们按对方状态自动选，**没有参数可以强制排队**。
- **`read_session_info`**：它能只读地（不唤醒、不投递）拿到对方最后一条回复、最后一次 `present` 交付的文件清单。我们只看得到标题、跑没在跑、回没回信，**看不到内容**。
- 它有消息编号、按 thread 去重和撤回；我们没有这套协议。

我们多出来的部分是会话管理：改名（钉住标题）、压缩、归档、按工作区列会话。它一共三个工具——发消息、读信息、建会话——建会话时给的是 `cwd`，不涉及工作区；寻址上它只认完整会话 id，我们可以用标题或短名。

## 已知边界

会咬人的几条，全表见[已知边界](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/boundaries.md)：

- **`queued` 只表示「已进收件箱」，不表示对方读到了。** 要确认到达，让它回信，然后看行尾有没有「已回信」。
- **「未回信」是可见性，不是收据。** 它只说明「经本插件发出的最后一条之后，对方没有经本插件回过」。对方用别的路子回你，这里看不到。
- **对正在跑的会话，我们是插话，不是排队。** 现在没有「别打断，等你这一轮做完」这个选项（见上面「和同类工具的关系」里的 `urgent`）。
- **归档的会话收不到消息**，也不会被冷路径拉起来；要联系它先恢复。
- **只在同一个 Host 进程内。** 桌面端和 web/qqbot 是不同进程，各有自己的一套会话与记录。
- **子代理不能用这些工具**：它们在 `execute` 期被明确拒绝，该用 `send_message` / `list_agents`。

## 卸载

从 profile 的 `dsh.profile.bundles` 与 `dependencies` 各删一行 → `pnpm --dir <profile> install` → 重启。重启后工具列表里应**没有**这八个工具。只把 `enabled` 关掉不算卸载。

卸载不会回头修改既有转录：旧会话里仍留着当时注入的系统提示词快照，以及 `source.kind === 'agent-message'` 的历史事件（这类事件不进 `session export`）。

## 更多

- 工具参数、返回值、报错、配置（`allow` / `maxBytes`）与兼容性：[docs/reference.md](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/reference.md)
- 消息怎么落到对方那儿、界面为什么是那个样子、`peers.json` 在哪、压缩通知的四种结局：[docs/mechanism.md](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/mechanism.md)
- 已知边界全表：[docs/boundaries.md](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/boundaries.md)
- 升级 DSH 之后的兼容性自检：[AGENTS.md](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/AGENTS.md)（`node scripts/compat-check.mjs`，非 0 退出就先别升级）
- 为什么这么实现、否决过什么：[DESIGN.md](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/DESIGN.md)
- 和 dsh-session-mail 的对比调研：[docs/research-dsh-session-mail.md](https://github.com/GavinMo1/dsh-session-mailbox/blob/main/docs/research-dsh-session-mail.md)

## License

MIT © 2026 GavinMo1
