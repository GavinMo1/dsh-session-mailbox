# compat-sentinel v2（Work Plan）

本方案自足。实现方只读本文件，不读评审记录。版本 v2，round 2 冻结文本。

强度词只有五个：**必须**（硬闸）、**不得**（禁止）、**默认**（可偏离，偏离要写进交付报告）、**可**（可选）、**只能**（唯一做法）。

## 1. 用户要什么（原话）

> 「兼容哨兵」：给 DSH 插件做接口兼容自检，外加两处小收敛。

动机原话：

> 哪天 DSH 出现破坏性更新，我们的插件静默失效，我们希望**升级当时**就红。

范围：新增 `scripts/compat-check.mjs`（含 47 行断言表）；`plugins/session-mailbox/index.js` 里两处重复收敛；`AGENTS.md` 加一行指路；`plans/compat-sentinel/` 随仓库提交推送。

两批交付，**分开提交、分开推送**：

- **单元 A（主诉求）**：Step 0–5。哨兵本身 + `AGENTS.md` 一行 + commit 1。A 完成即可向用户报告。
- **单元 B（次要）**：Step 6–8。两处收敛 + 版本号 + tag + commit 2。B 不阻塞 A 的交付，也可以被推迟；用户只放行 A 时，做完 Step 5 就停。

本仓另有三个纯客户端插件（`blank-draft-handoff`、`dsh-input-history`、`dsh-message-editor`），它们的宿主 UI 接口**不在本表**内（BS-7）。不得把它们顺手并进来：那会改变用户确认过的交付规模。

不做大重构（不拆多文件、不引入事件总线、不改配置驱动工具表）。

## 2. Core Task 与失败症状

**Core Task**：在一台装好 DSH 的机器上，`node scripts/compat-check.mjs` 一条命令给出结论——本仓库 Host 侧两个插件（`session-mailbox`、`user-model`）依赖的 47 个宿主接口在当前安装的 `app.asar` 里是否仍在；不在的逐条报出「包 + 断言 + 插件里哪一行依赖它 + 后果」，进程非 0 退出，最后一行是总评。

**失败症状**（任一条成立即判 Core Task 未达成）：

1. DSH 改了某个被依赖的接口，脚本仍然 exit 0。
2. 脚本 FAIL 了，但没有指出 `plugins/` 下具体的文件与行号。
3. 脚本依赖本机已解包的源码树，或在找不到 DSH 时抛栈而不是给人话。
4. 拿错路径 / 坏 asar 时，脚本给出「这个构建不附源码」这种**错误结论**而不是报路径有问题。
5. 断言的匹配面比它声称的面宽：同一文件里另一个同名符号就能满足它，于是真改动仍然绿。
6. 交付后的哨兵在仓库自己的 HEAD 上报 STALE（哨兵的依赖表与插件代码不同步）。

## 3. 开始指令

先做 Step 0，之后按 Step 1 → 8 的顺序做；单元 A 到 Step 5 结束，单元 B 从 Step 6 开始。每一步在上一步完成判据变绿之后才开始。

| Step | 一句话 | 卡住时 |
|---|---|---|
| 0 | 备份 + 记基线 + 确认 asar 可读 | 停下问 |
| 1 | 定位层与读取层（复用 `scripts/asar.mjs`） | 停下问 |
| 2 | 落 47 行断言表 + 判定 | 停下问 |
| 3 | 输出格式、退出码、总评、脚本头注释 | 停下问 |
| 4 | 自测六连（绿、pattern 不命中、stale site、坏路径、空 asar、无环境变量） | 停下问 |
| 5 | `AGENTS.md` 一行 + commit 1 + push（**单元 A 到此交付**） | 停下问 |
| 6 | 收敛 1：`resolvePeer` | 停下问 |
| 7 | 收敛 2：`liveOrThrow` | 停下问 |
| 8 | 版本号 + commit 2 + tag + push + 复跑哨兵（单元 B 交付） | 停下问 |

**Step 0 · 准备与基线**
读 `scripts/asar.mjs` 全文、`plugins/session-mailbox/index.js` 全文（`send_session_message` 161–235 行、`rename_session` 261–333 行）、`plugins/session-mailbox/lib/pure.js`、`AGENTS.md`。
把将要修改的 `plugins/session-mailbox/index.js`、`plugins/session-mailbox/package.json`、`AGENTS.md` 各复制一份到 `backups/compat-sentinel-<yyyyMMdd-HHmmss>/`（保持原相对路径；`backups/` 已在 `.gitignore`）。`scripts/compat-check.mjs` 是新建文件，Step 3 完成后再复制一份到同一目录，名为 `compat-check.step3.mjs`，供 Step 4 还原。
在交付报告里记下三个基线值：`git rev-parse HEAD`、`node --test plugins/session-mailbox/test/*.test.mjs` 输出的 `ℹ tests <N>`、`node --version`。
确认 asar 可读：`node scripts/asar.mjs list "$env:DSH_INSTALL_DIR" 'dsh-agent/src/index\.ts'` 必须打印 `"matched":1` 及以上。
完成判据：`Get-ChildItem backups/compat-sentinel-*/ -Recurse -File` 列出 3 个文件（Step 3 之后是 4 个）；三个基线值与 asar 探测结果都在交付报告里。

**Step 1 · 定位层与读取层**
在 `scripts/compat-check.mjs` 里写三样东西，规格见 §4 S1：`resolveAsar()`、`readEntry(entry)`、`dshVersion()`。读取**只能**通过子进程调 `scripts/asar.mjs`（`cat`），不得在脚本里自己解析 asar 二进制。
完成判据：`node --check scripts/compat-check.mjs` 退出码 0；`(Select-String -Path scripts/compat-check.mjs -Pattern 'asar\.mjs').Count` ≥ 1；`(Select-String -Path scripts/compat-check.mjs -Pattern 'openSync|readSync|readUInt32LE').Count` 为 0。

**Step 2 · 断言表**
把 §4 S2 的 `const ASSERTIONS = [...]` 逐字落进脚本；写 `runTable()`：逐条按 `region` 取子串、逐条判 PASS/FAIL，并解析每条 `sites` 的当前行号。
完成判据：`node -e "const s=require('node:fs').readFileSync('scripts/compat-check.mjs','utf8');console.log((s.match(/id: 'A\d\d'/g)||[]).length)"` 输出 `47`；`(Select-String -Path scripts/compat-check.mjs -Pattern 'patterns: \[\]').Count` 为 0；`node --check scripts/compat-check.mjs` 退出码 0。

**Step 3 · 输出与退出码**
按 §4 S3、S4 写 PASS 行、三种 FAIL 形态（`entry-missing` 单行块、`pattern-miss` 完整块、`STALE` 块）、总评行与退出码；写脚本头注释（用法、三个退出码、`DSH_INSTALL_DIR` 与 `--asar`）。
完成判据：`node --check` 退出码 0；`Select-String -SimpleMatch -Pattern 'STALE','entry missing','compat:','asar unreadable'` 各至少 1 行，且都出现在代码行（不在 `//` 开头的注释行里）。

**Step 4 · 自测六连**
按 §6 第 1–7 行跑：本机全绿、临时改坏一条 pattern、临时改坏一条 site、`--asar` 指向不存在的路径、坏 asar、空 asar、清空 `DSH_INSTALL_DIR`。改坏的两次用 `backups/…/compat-check.step3.mjs` 还原，还原后重跑全绿。
完成判据：§6 第 1–7 行逐行对上；`(Select-String -Path scripts/compat-check.mjs -Pattern 'followupXX|steerERR').Count` 为 0（改坏的痕迹已还原）。

**Step 5 · 单元 A 交付**
按 §4 S7 的 A 部分改 `AGENTS.md` 一行；`git add scripts/compat-check.mjs AGENTS.md plans/compat-sentinel`；commit message `scripts: add a compat sentinel that asserts the host plugin API from app.asar`；`git push`。
完成判据：§6 第 8、9、10 行逐行对上；`git status --short -- scripts AGENTS.md plans/compat-sentinel` 无输出；`git log --oneline -1` 是 `scripts: add a compat sentinel …`。做完这一步停下来向用户报告：单元 A 已交付，单元 B 等放行（用户已一并授权时继续 Step 6，否则停）。

**Step 6 · 收敛 1：`resolvePeer`**
按 §4 S5 在 `apply()` 里、`liveRows()` 之后加一个局部函数 `resolvePeer(list, arg, selfId, text)`，把 `send_session_message` 与 `rename_session` 里各写一遍的五分支换成一次调用。两处传给它的五条文案与改动前逐字相同。
完成判据：`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'found\.reason ===').Count` 为 4；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'pure\.resolveTarget\(').Count` 为 1；`node --test plugins/session-mailbox/test/*.test.mjs` 退出码 0 且 `ℹ tests` 仍等于 Step 0 记下的 N。

**Step 7 · 收敛 2：`liveOrThrow`**
按 §4 S6 加 `liveOrThrow(id)`，让 `send_session_message` 用它替换 198–214 行那三段检查。`rename_session` 不动（它要走 `controller.resolveAgent` 唤醒冷会话，见 §5）。
完成判据：`(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'is no longer live in this process').Count` 为 1；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'ctx\.workspaceRegistry\.archivedSessionIds').Count` 为 2；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'liveOrThrow\(').Count` 为 1；`node --check plugins/session-mailbox/index.js` 退出码 0。

**Step 8 · 单元 B 交付**
`package.json` 的 `version` 改成 `0.8.2`；`git add plugins/session-mailbox/index.js plugins/session-mailbox/package.json`；commit message `session-mailbox: dedupe target resolution and liveness checks`；`git tag dsh-session-mailbox/v0.8.2`；`git push`；`git push origin dsh-session-mailbox/v0.8.2`；最后**再跑一次哨兵**，必须是 45 PASS / exit 0。
完成判据：§6 第 9–15 行逐行对上。

## 4. Steps 的细节

### S1 `scripts/compat-check.mjs` 的定位层与读取层

**asar 定位顺序**（`resolveAsar()`，命中即停）：

1. 命令行 `--asar <path>`，或第一个位置参数。路径必须 `statSync(p).isFile()` 为真，否则报 `asar path is not a file` 并 exit 2。
2. `process.env.DSH_INSTALL_DIR`：是文件就用它；是目录就依次试 `<dir>/app.asar`、`<dir>/resources/app.asar`。
3. 探测（仅在 Windows）：`%LOCALAPPDATA%\Programs\DSH*\resources\app.asar` 与 `%ProgramFiles%\DSH*\resources\app.asar`，按该 `app.asar` 的 `mtime` 倒序取最新的一个。
4. 都不成立：打印 `compat: cannot locate app.asar` 加三行提示（`set DSH_INSTALL_DIR=...`、`--asar <path>`、`node scripts/asar.mjs list <asarPath> ...`），exit 2。

探测命中多于一个时，把全部候选与各自 `mtime` 打印出来，并写明「用了最新的这个」。`--asar` 指到目录时同样按第 1 步的 `isFile()` 检查 exit 2。

**读取层**：`readEntry(entry)` 用 `spawnSync(process.execPath, [<脚本所在目录>/asar.mjs, 'cat', asarPath, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })`，返回三种结果：

| 结果 | 判据 | 后续 |
|---|---|---|
| `{ status: 'ok', text, bytes }` | 退出码 0（**空 stdout 也算 ok**，`bytes: 0`） | 进入断言判定 |
| `{ status: 'missing' }` | 退出码非 0 且 stderr 以 `not found:` 开头 | 该行判 `entry-missing` |
| `{ status: 'error', detail }` | 其他非 0（坏 asar、路径不是 asar、读盘错误） | **中止整次运行**：打印 `compat: asar unreadable — <detail 首行>`，exit 2 |

同一 entry 只读一次（`Map` 缓存）。`dshVersion()` 读条目 `package.json`，取 `name` 与 `version`，只用于首行展示；结果是 `missing` 或解析失败就打印 `dsh <unknown>`，不计入 PASS/FAIL。

首行必须是 `asar: <绝对路径>  dsh <name> <version>`。

**约束**：只用 `node:` 内置（`node:fs` / `node:path` / `node:os` / `node:child_process` / `node:url`）；不写任何文件；不新增依赖；不 import `asar.mjs`（它是 CLI）。断言对象是随包 TS 源码（Decision 3），唯一的例外是 A44/A45 两条锁 `lib/index.js` 的运行时导出。

### S2 断言表（逐字）

字段含义：`pkg` = 宿主包；`entry` = 在 asar 里的条目路径；`patterns` = 断言（**全部**命中才算 PASS，每个都是 `new RegExp(p)`，不加 flag、大小写敏感）；`region` = 可选，`[起始锚, 结束锚]` 两个正则字符串——命中面只取「第一个起锚匹配」到「其后第一个止锚匹配」之间的子串；没有 `region` 就在整个条目文本上匹配；`sites` = 插件里依赖它的位置（`[文件, 正则]`，FAIL 时现场求行号）；`means` = 失败意味着什么。

`region` 是为了让断言落在它声称的声明块内：同一文件里另一个同名符号不得满足它（例如 `SessionHeader.cwd` 与 `CreateSessionOptions.meta.cwd`）。

匹配是纯文本正则：**命中源码注释也算命中**（已知取舍，BS-6），不得为此加语法解析。

```js
const ASSERTIONS = [
  { id: 'A01', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['super\\(ctx, \'agents\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'inject = \\[\'tools\', \'agents\'']],
    means: 'ctx.agents 服务消失：插件 inject 的 agents 缺失，list_sessions 无会话可取，整块功能静默失效' },
  { id: 'A02', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['get\\(id: SessionId\\): Agent \\| undefined'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.get\\(']],
    means: 'get 改名或换了参数：send_session_message 取不到目标 agent，投递前就抛错' },
  { id: 'A03', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['list\\(\\): Agent\\[\\]'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.list\\(\\)']],
    means: 'list 改名或变异步：list_sessions 与别名表拿不到任何会话' },
  { id: 'A04', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['export type AgentStatus = \'idle\' \\| \'running\'\\r?\\n', 'readonly status: AgentStatus'],
    sites: [['plugins/session-mailbox/index.js', 'pure\\.pageStatus\\(a\\.status\\)'], ['plugins/session-mailbox/lib/pure.js', 'status === \'running\'']],
    means: 'status 取值或字段变了：pageStatus 把所有会话塌成 inactive，投递原语从 steer 退成 followup' },
  { id: 'A05', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['followup\\(message: UserMessage\\): void', 'steer\\(message: UserMessage\\): void'],
    sites: [['plugins/session-mailbox/index.js', 'target\\.followup\\(message\\)'], ['plugins/session-mailbox/index.js', 'target\\.steer\\(message\\)']],
    means: '投递原语消失或改名：send_session_message 抛 TypeError，消息发不出去' },
  { id: 'A06', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['super\\(ctx, \'sessionController\''],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionController\'\\)']],
    means: 'sessionController 服务消失：create_session 与 rename_session 全部报「服务不可用」' },
  { id: 'A07', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['@Remote\\(\'create\'\\)', 'create\\(request: SessionCreateRequest\\)'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(']],
    means: 'create 不再是 create({ workspaceId })：create_session 造不出会话' },
  { id: 'A08', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['@Remote\\(\'prompt\'\\)', 'async prompt\\(request: SessionPromptRequest, signal: AbortSignal\\)'],
    sites: [['plugins/session-mailbox/index.js', 'await controller\\.prompt\\(']],
    means: 'prompt 的 signal 位置或 request 形状变了：create_session 的首条消息投递失败，且已建的会话留在那里' },
  { id: 'A09', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['resolveAgent\\(sessionId: SessionId\\): Promise<ApiSessionAgentResult>'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.resolveAgent\\(entry\\.id\\)']],
    means: 'resolveAgent 签名变了或消失：rename_session 无法装载冷会话，冷会话改名全失败' },
  { id: 'A10', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['super\\(ctx, \'sessionTitle\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)']],
    means: 'sessionTitle 服务消失：list_sessions 的 title 列全变成 (untitled)，rename_session 报不可用' },
  { id: 'A11', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['get\\(session: Session\\): SessionTitleSnapshot \\| undefined'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: 'get 签名变了：标题读不出来，列表退回无标题' },
  { id: 'A12', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['rename\\(session: Session, title: string\\): SessionTitleSnapshot'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: 'rename 签名变了：rename_session 失效（用户钉住标题的能力丢失）' },
  { id: 'A13', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['\'session/title\': SessionTitleEventData'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: '事件名或载荷变了：标题投影断流，get() 永远返回旧值或 undefined' },
  { id: 'A14', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['readonly maxTitleBytes: number'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    region: ['export interface Config \\{', '\\n\\}'],
    means: '公开 Config 失去 maxTitleBytes：超长标题不再被服务端拒绝，README 与工具描述的长度承诺落空' },
  { id: 'A15', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['export class SessionTitleInvalidError'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: '错误类消失：空标题与其它 rename 失败不再能按类型区分（插件目前原样透传 message，影响在报文的可解释性与 README 承诺）' },
  { id: 'A16', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['super\\(ctx, \'workspaceRegistry\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)'], ['plugins/session-mailbox/index.js', 'ctx\\.workspaceRegistry\\.archivedSessionIds']],
    means: 'workspaceRegistry 服务消失（还是 inject 的必填项）：插件整个 apply 失败，六个工具全没了' },
  { id: 'A17', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['async create\\(path: string, title\\?: string\\): Promise<Workspace>'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.create\\(path\\)']],
    means: 'create 返回形状变了（例如 { workspace, created }）：created/reused 判定与后续 sessionIds 读取全错' },
  { id: 'A18', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['get\\(id: WorkspaceId\\): Workspace \\| undefined'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)\\.get\\(entity\\.id\\)']],
    means: 'get 变了：create_session 的「会话已入账」闸门失效，可能报告成功却没挂上' },
  { id: 'A19', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['list\\(\\): Workspace\\[\\]'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)\\.list\\(\\)']],
    means: 'list 变异步：list_workspaces 与 create_session 的默认工作区选择直接崩（.map 在 Promise 上）' },
  { id: 'A20', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['get archivedSessionIds\\(\\): readonly SessionId\\[\\]'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.workspaceRegistry\\.archivedSessionIds']],
    means: 'archivedSessionIds 消失：归档闸读不到集合，list_sessions 会把归档会话列成可投递，投递也失去拒绝依据' },
  { id: 'A21', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['archiveSession\\(sessionId: SessionId, options: ArchiveSessionOptions = \\{\\}\\)', 'readonly stopActivity\\?: boolean'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.archiveSession\\(']],
    means: 'archiveSession 签名变了或 stopActivity 改名：archive_sessions 的 stop 选项静默失效（运行中的会话被拒，报成 failed）' },
  { id: 'A22', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['delete\\(id: WorkspaceId\\): Promise<boolean>'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.delete\\(id\\)']],
    means: 'delete 不再返回 boolean（改成 void）：delete_workspaces 把每次成功都报成 skipped' },
  { id: 'A23', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/index.ts',
    patterns: ['super\\(ctx, \'subagents\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'subagents\'\\)']],
    means: 'subagents 服务消失：create_session 拒绝一切调用（判为无法验证调用方身份）' },
  { id: 'A24', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/index.ts',
    patterns: ['rootOf\\(caller: Agent\\): Agent'],
    sites: [['plugins/session-mailbox/index.js', 'subagents\\.rootOf\\(exec\\.agent\\)']],
    means: 'rootOf 签名或语义变了：subagent 闸门可能把顶层调用者判成子代理（或反过来），create_session 要么全拒要么放开' },
  { id: 'A25', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/schema.ts',
    patterns: ['export function defineTool'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)'], ['plugins/user-model/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 的源码声明消失：两个插件的全部工具都注册不上（A44 另锁运行时那一份）' },
  { id: 'A26', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['export \\* from \'./schema.ts\''],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 不再出现在包根的 src 汇总里（源码层的重导出约定变了；运行时那一份由 A44 锁）' },
  { id: 'A27', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['register\\(definition: ToolDefinition, options: ToolRegistrationOptions = \\{\\}\\): \\(\\) => void'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.tools\\.register\\('], ['plugins/user-model/index.js', 'ctx\\.tools\\.register\\(']],
    means: 'tools.register 签名变了：工具静默不注册，症状是「插件加载成功但一个工具都没有」' },
  { id: 'A28', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['export function createUserMessage'],
    sites: [['plugins/session-mailbox/index.js', 'createUserMessage\\(']],
    means: 'createUserMessage 的源码声明消失：send_session_message 造不出 user 消息' },
  { id: 'A29', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/index.ts',
    patterns: ['export \\* from \'./message.ts\''],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: 'createUserMessage 不再出现在包根的 src 汇总里（运行时那一份由 A45 锁）' },
  { id: 'A30', pkg: '@deepseek-ai/dsh',
    entry: 'node_modules/@deepseek-ai/dsh/src/profile-boot.ts',
    patterns: ['provide\\(\'profileContext\''],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor'], ['plugins/user-model/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor']],
    means: 'profileContext 不再挂上 Context：两个插件的 createRequire 锚点两条路都断，apply 直接抛错' },
  { id: 'A31', pkg: '@deepseek-ai/dsh-app-boot',
    entry: 'node_modules/@deepseek-ai/dsh-app-boot/src/profile-context.ts',
    patterns: ['readonly installAnchor: string'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor'], ['plugins/user-model/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor']],
    means: 'installAnchor 字段改名：同上，两个插件起不来' },
  { id: 'A32', pkg: '@deepseek-ai/dsh-session',
    entry: 'node_modules/@deepseek-ai/dsh-session/src/types.ts',
    patterns: ['readonly id: SessionId', 'readonly createdAt: number', 'readonly cwd\\?: string', 'readonly origin\\?: \'subagent\'', 'readonly delegationDepth\\?: number'],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.cwd'], ['plugins/session-mailbox/index.js', 'origin !== \'subagent\''], ['plugins/session-mailbox/index.js', 'session\\.header\\.origin === \'subagent\''], ['plugins/session-mailbox/lib/create.js', 'header\\.delegationDepth']],
    region: ['export interface SessionHeader \\{', '\\n\\}'],
    means: 'SessionHeader 字段改名或换类型：别名表、排序、cwd 列、delegationDepth 守卫与「顶层会话」判定全错（子代理会被当成顶层）' },
  { id: 'A33', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts',
    patterns: ['event\\.data\\.source\\.kind !== \'user\''],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: '聊天投影的非 user 分叉变了：relay 消息可能不再折叠成上下文行，甚至从对话里消失' },
  { id: 'A34', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['getContextOrder\\(name: PromptContextOrderName\\): number', 'context\\(context: PromptContext\\): \\(\\) => void', 'SUBAGENT_DELEGATION: 120'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\('], ['plugins/user-model/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    means: 'systemPrompt.context 或 getContextOrder 变了：两段提示词挂不上，工具在模型侧完全没有说明' },
  { id: 'A35', pkg: '@deepseek-ai/schemastery',
    entry: 'node_modules/@deepseek-ai/schemastery/src/index.ts',
    patterns: ['export default Schema', 'natural\\(\\): Schema<number>'],
    sites: [['plugins/session-mailbox/index.js', 'from \'@deepseek-ai/schemastery\''], ['plugins/user-model/index.js', 'from \'@deepseek-ai/schemastery\'']],
    means: 'schemastery 默认导出或 z.natural 变了：两个插件的 Config 解析失败，apply 之前就崩' },
  { id: 'A36', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['super\\(ctx, \'tools\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'inject = \\[\'tools\''], ['plugins/user-model/index.js', 'inject = \\[\'tools\'']],
    means: 'tools 服务键改名：插件 inject 的 tools 缺失，加载器静默跳过，十个工具一个都不在' },
  { id: 'A37', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['super\\(ctx, \'systemPrompt\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\('], ['plugins/user-model/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    means: 'systemPrompt 服务键改名：同上，提示词与工具注册一起消失' },
  { id: 'A38', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['readonly session: Session', 'readonly status: AgentStatus'],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'pure\\.pageStatus\\(a\\.status\\)']],
    region: ['interface Agent \\{', '\\n\\}'],
    means: 'Agent 的 session / status 字段改名：list_sessions 的 id/cwd/createdAt 与 running/inactive 全塌，投递原语判错' },
  { id: 'A39', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/types.ts',
    patterns: ['readonly path: string', 'readonly title: string', 'readonly sessionIds: readonly SessionId\\[\\]'],
    sites: [['plugins/session-mailbox/index.js', 'title: String\\(w\\.title\\)'], ['plugins/session-mailbox/index.js', 'workspacePath: String\\(entity\\.path\\)']],
    region: ['export interface Workspace \\{', '\\n\\}'],
    means: 'Workspace 实体字段改名：list_workspaces 打出 "undefined | undefined"，create_session 的默认工作区选择与 created 判定失去依据' },
  { id: 'A40', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['readonly workspaceId\\?: WorkspaceId'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(']],
    region: ['export interface SessionCreateRequest \\{', '\\n\\}'],
    means: 'SessionCreateRequest.workspaceId 改名：create_session 传的 { workspaceId } 被忽略，会话落到默认位置或创建失败' },
  { id: 'A41', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['readonly requestId: SessionRequestId', 'readonly mode: \'queue\' \\| \'steer\''],
    sites: [['plugins/session-mailbox/index.js', 'await controller\\.prompt\\(']],
    region: ['export interface SessionPromptRequest \\{', '\\n\\}'],
    means: 'SessionPromptRequest 的 requestId / mode 改名：首条消息的幂等键或排队语义变了，重试可能重复投递' },
  { id: 'A42', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/types.ts',
    patterns: ['readonly title: string'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    region: ['export interface SessionTitleEventData \\{', '\\n\\}'],
    means: '标题事件载荷的 title 字段改名：titleOf 恒为 undefined，列表全变 (untitled)，rename 回显退回入参' },
  { id: 'A43', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/agent.ts',
    patterns: ['\\{ readonly agent: Agent \\}', '\\{ readonly error: ApiSessionAgentError \\}'],
    sites: [['plugins/session-mailbox/index.js', 'resolved\\?\\.agent']],
    means: 'resolveAgent 的返回联合形状变了：rename_session 读不到 resolved.agent，每次改名都报「could not be loaded」' },
  { id: 'A44', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/lib/index.js',
    patterns: ['function defineTool\\(options\\)', 'export \\{[^}]*defineTool[^}]*\\}'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)'], ['plugins/user-model/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: '运行时（lib）不再导出 defineTool：hostRequire 解构出 undefined，apply 阶段抛 TypeError（这一条锁的是真正被执行的那份）' },
  { id: 'A45', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/lib/index.js',
    patterns: ['function createUserMessage\\([a-z]+\\)', 'export \\{[^}]*createUserMessage[^}]*\\}'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: '运行时（lib）不再导出 createUserMessage：send_session_message 造不出 user 消息' },
  { id: 'A46', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['form: \'relay\''],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: '上下文来源不再接受 relay 表单：中继消息要么构造失败，要么退化成本插件的普通上下文行（「来自会话 <id>」那行也没了）' },
  { id: 'A47', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/commands.ts',
    patterns: ['\'session/workspace-attach-failed\''],
    sites: [['plugins/session-mailbox/index.js', '\'session/workspace-attach-failed\'']],
    means: 'attach 失败的稳定错误码改名：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现' },
]

```

### S3 判定与输出

**每行的判定顺序**（先 STALE，后断言）：先解析该行全部 `sites`；任一 site 的文件不存在或其正则在文件里匹配不到 → 该行状态为 `STALE`，**不再继续判断言**（一行只能处于一种状态，STALE 优先）。site 全部可解析，再判条目与 `patterns`。

**PASS 行（一行）**：`PASS <id>  <pkg>  <entry>`

```
PASS A32  @deepseek-ai/dsh-session  node_modules/@deepseek-ai/dsh-session/src/types.ts
```

**`entry-missing`（单行）**：

```
FAIL A21  @deepseek-ai/dsh-workspace  node_modules/@deepseek-ai/dsh-workspace/src/index.ts  entry missing（该构建可能不随包附源码；用 node scripts/asar.mjs list <asar> '@deepseek-ai/dsh-workspace/' 确认）
```

**`pattern-miss`（1 行标题 + 4 行内容，顺序固定）**：

```
FAIL A32  @deepseek-ai/dsh-session  node_modules/@deepseek-ai/dsh-session/src/types.ts
  missing : readonly cwd?: string + readonly origin?: 'subagent' + readonly delegationDepth?: number
  depends : plugins/session-mailbox/index.js:51  const topLevel = () => ctx.agents.list().filter((a) => a.session.header.origin !== 'subagent') | plugins/session-mailbox/lib/create.js:15  if (typeof header.delegationDepth === 'number' && header.delegationDepth > 0) return 'subagent'
  means   : SessionHeader 字段改名或换类型：别名表、排序、cwd 列、delegationDepth 守卫与「顶层会话」判定全错（子代理会被当成顶层）
  lines   : 断言 5 条，命中 2 条（匹配面：SessionHeader 块，312 字节）
```

- `missing` 一行列出**所有**不命中的 pattern 原文，多个用 ` + ` 分隔。
- `depends` 里每个 site 用 ` | ` 分隔，每段是 `文件:行号  两空格  命中的那一行（trim）`；一个 site 在文件里命中多行时，打印前 3 个命中行号与首行文本，并在该段末尾加 `(+N more)`。
- `lines` 里写明「匹配面」：有 `region` 时写 `匹配面：<起始锚>，<字节数> 字节`，没有则写 `匹配面：整个条目，<字节数> 字节`。条目存在但 `bytes` 为 0 时写 `匹配面：整个条目，0 字节（条目存在但为空）`。

**`STALE`（1 行标题 + 2 行内容）**：

```
STALE A02  @deepseek-ai/dsh-agent  node_modules/@deepseek-ai/dsh-agent/src/index.ts
  site    : plugins/session-mailbox/index.js  /ctx\.agents\.get\(/  匹配不到
  means   : 断言表里这条的依赖点已过期；先修 sites 再谈 DSH
```

**总评（最后一行，永远打印）**：`compat: <p> PASS / <f> FAIL / <s> STALE（47 条断言，dsh <name> <version>）— <判定>`，且 `p + f + s` 必须等于 47。判定三种：

- 全绿：`全部依赖接口仍在，可以升级`
- 有红：`有接口变了：先别升级 DSH，按上面的 FAIL 行改插件或改断言`
- `entry-missing` 的条数超过一半时，在判定前插入一段：`（大量条目不存在：这个 asar 可能不附 TS 源码，哨兵无法判定，不等于插件会坏）`

### S4 退出码

| 码 | 含义 |
|---|---|
| 0 | 47 条全 PASS，无 STALE |
| 1 | 至少一条 FAIL 或 STALE |
| 2 | 用法错误 / 找不到或读不了 app.asar（不跑断言表） |

### S5 收敛 1：`resolvePeer(list, arg, selfId, text)`

放在 `apply()` 内、`liveRows` 之后，`list_sessions` 注册之前：

```js
// The five resolveTarget failures, written once. Each call site owns its own
// wording: the two tools differ on `self` and `notfound`, and those strings are
// part of what the caller sees.
const resolvePeer = (list, arg, selfId, text) => {
  const found = pure.resolveTarget(list, arg, selfId)
  if (found.ok === true) return found.entry
  if (found.reason === 'empty') throw new Error(text.empty)
  if (found.reason === 'self') throw new Error(text.self)
  if (found.reason === 'ambiguous') throw new Error(text.ambiguous(found.candidates.join(', ')))
  if (found.reason === 'notfound') throw new Error(text.notfound(arg))
  throw new Error(`unexpected resolve verdict: ${found.reason}`)
}
```

两个调用点（文案与改动前逐字相同，`<…>` 表示插值）：

| 工具 | empty | self | ambiguous(c) | notfound(arg) |
|---|---|---|---|---|
| `send_session_message` | `agent must not be empty` | `cannot send to yourself` | ``ambiguous session "<arg>": <c>; repeat the call with the full id of the one you mean`` | ``no live top-level session matches "<arg>"; this tool reaches only sessions loaded in this process`` |
| `rename_session` | `agent must not be empty` | `cannot rename yourself; ask your peer, or the user` | 同上 | ``no top-level session matches "<arg>"; pass the full id of the session you mean`` |

调用形态：`const entry = resolvePeer(list, args.agent, String(exec.agent.id), { empty: ..., self: ..., ambiguous: (c) => ..., notfound: (q) => ... })`。`pure.js` 一个字都不改。

`found.reason ===` 在本文件里的计数：改动前 8，改动后 **4**（`resolvePeer` 体内四条判定；两个调用点不再各写一遍）。

### S6 收敛 2：`liveOrThrow(id)`

放在 `resolvePeer` 之后。它把 `send_session_message` 里「取活的 agent → 拒子代理 → 读归档集合 → 拒归档」四步收成一处：

```js
// The target-side trio: live, top-level, not archived. Fail closed when the
// archived set cannot be read. rename_session does NOT use this: it must load a
// cold session through sessionController.resolveAgent, so "must be live" is the
// wrong test there.
const liveOrThrow = (id) => {
  const target = ctx.agents.get(id)
  if (target === undefined) throw new Error(`session ${id} is no longer live in this process`)
  if (target.session.header.origin === 'subagent') {
    throw new Error('send_session_message addresses top-level sessions only')
  }
  let archived
  try {
    archived = ctx.workspaceRegistry.archivedSessionIds
    if (!Array.isArray(archived)) throw new Error('archivedSessionIds is not an array')
  } catch {
    throw new Error('cannot verify the archived state of ' + id + '; refusing to deliver')
  }
  if (archived.includes(target.id)) {
    throw new Error('target session is archived; unarchive it before messaging')
  }
  return target
}
```

`send_session_message` 里 198–214 行那三段换成 `const target = liveOrThrow(entry.id)`，其余顺序不变：`statusBefore` 与 `primitive` 仍在投递前读。

### S7 文档、版本、交付

**A 部分（Step 5 做）**

- `AGENTS.md` 的「改完必须做的验证」代码块之后加一行（`默认` 位置；放这里因为升 DSH 和 `git pull` 之后都会看这一段）：
  `升级 DSH 或 pull 本仓库后：node scripts/compat-check.mjs（读 app.asar 断言宿主接口；非 0 退出＝先别升级，见 FAIL 行指到的插件位置）。`
- 提交：`git add scripts/compat-check.mjs AGENTS.md plans/compat-sentinel` → message `scripts: add a compat sentinel that asserts the host plugin API from app.asar` → `git push`。

**B 部分（Step 8 做）**

- `plugins/session-mailbox/package.json` 的 `version`：`0.8.1` → `0.8.2`（纯重构，AGENTS.md 的 patch 规则）。
- README 不改：两处收敛不改变任何对外行为与文案。
- 提交：`git add plugins/session-mailbox/index.js plugins/session-mailbox/package.json` → message `session-mailbox: dedupe target resolution and liveness checks` → `git tag dsh-session-mailbox/v0.8.2` → `git push` → `git push origin dsh-session-mailbox/v0.8.2`。
- 两次提交都**不得** `git add -A` 或 `git add .`。

## 5. No-go 项

1. 不得在 `scripts/compat-check.mjs` 里自己解析 asar 二进制或 import `scripts/asar.mjs`；读取**只能**走子进程调 `scripts/asar.mjs`（Decision 2）。
2. 不得引入任何运行时依赖；脚本与插件只用 `node:` 内置（AGENTS.md 硬规则 3）。
3. 不得为了变绿而放宽断言：任何一条 FAIL 都要先判断是「DSH 变了」还是「断言写错了」，改断言必须写进交付报告（Decision 6）。
4. 不得改 `plugins/session-mailbox/lib/pure.js`、`lib/create.js` 与任何测试文件：两处收敛是纯搬移（Decision 4）。
5. 不得改任何工具名、参数、输出 schema、工具描述、`MAILBOX_PROMPT` 与 README：两处收敛不改变对外行为与错误文案（Decision 4）。
6. 不得让 `rename_session` 走 `liveOrThrow`：它靠 `sessionController.resolveAgent` 装载冷会话，「必须活」在那条路径上是错的（Decision 5）。
7. 不得引入第三处收敛（例如把顶层守卫 `origin === 'subagent'` 抽出来）：`list_sessions` 对子代理返 `[]`、`create_session` 走 `subagentVerdict`，三处语义不同（Decision 4）。
8. 不得把断言表做成配置驱动或拆成多文件；表只能内嵌在脚本里，一处维护（Decision 1）。
9. 不得把 `blank-draft-handoff`、`dsh-input-history`、`dsh-message-editor` 三个客户端插件的宿主 UI 接口并进表内（Decision 7）。
10. 不得把 `region` 做成块解析器或括号匹配器：它只能是「第一个起锚匹配到其后第一个止锚匹配之间的子串」（Decision 8）。
11. 不得提交 `.tmp-*.ts`、`.tmp-*.txt` 或 `plans/mailbox-wake/`（另一个会话的产物）；交付后这些路径仍是未跟踪。
12. 不得用 `rm` / `del` / `Remove-Item`；要删就移入回收站。
13. 不得改 profile 配置，不装/卸载插件，不重启 Host。

## 6. 验收表

| # | 配方（操作序列） | 期望退出码 | 期望输出消息集合 |
|---|---|---|---|
| 1 | `node scripts/compat-check.mjs *> $env:TEMP\compat.txt; $LASTEXITCODE` | 0 | 首行匹配 `^asar: .*app\.asar  dsh \S+ \S+$`；`(Select-String -Path $env:TEMP\compat.txt -Pattern '^PASS A\d\d ').Count` 为 47；末行匹配 `^compat: 47 PASS / 0 FAIL / 0 STALE（47 条断言，dsh .+）— 全部依赖接口仍在，可以升级$` |
| 2 | 把 A05 的第一个 pattern 临时改成 `followupXX\(message: UserMessage\): void`；跑脚本 | 1 | 有且只有 1 行以 `^FAIL ` 开头；该块含 `missing : followupXX(message: UserMessage): void`；含 `depends : plugins/session-mailbox/index.js:\d+`（**数字必须存在**）与 `target.followup(message)`；含 `means   :`；末行 `^compat: 46 PASS / 1 FAIL / 0 STALE` |
| 3 | 还原第 2 行，把 A05 的第二个 site 临时改成 `target\.steerERR\(message\)`；跑脚本 | 1 | 有且只有 1 段以 `^STALE A05 ` 开头；含 `site    : plugins/session-mailbox/index.js  /target\.steerERR\(message\)/  匹配不到`；末行 `^compat: 46 PASS / 0 FAIL / 1 STALE` |
| 4 | 还原第 3 行；`node scripts/compat-check.mjs --asar "$env:TEMP\dir-not-file"; $LASTEXITCODE`（先 `New-Item -ItemType Directory "$env:TEMP\dir-not-file"`） | 2 | 含 `asar path is not a file`；`(Select-String -Pattern '^PASS ').Count` 为 0 |
| 5 | `node scripts/compat-check.mjs --asar "$env:TEMP\nope.asar"; $LASTEXITCODE` | 2 | 含 `cannot locate app.asar` 与 `--asar`；`(Select-String -Pattern '^PASS ').Count` 为 0 |
| 6 | 造一个坏 asar：`Set-Content -Path "$env:TEMP\bad.asar" -Value 'not an asar'`；`node scripts/compat-check.mjs --asar "$env:TEMP\bad.asar"; $LASTEXITCODE` | 2 | 含 `compat: asar unreadable —`；**不含** `entry missing`，**不含** `compat: 0 PASS`（不得把路径问题说成「不附源码」） |
| 7 | 造空 asar：`node -e "const fs=require('fs');const j=Buffer.from(JSON.stringify({files:{}}));const h=Buffer.alloc(16);h.writeUInt32LE(4,0);h.writeUInt32LE(j.length+8,4);h.writeUInt32LE(j.length+8,8);h.writeUInt32LE(j.length,12);fs.writeFileSync(process.env.TEMP+'/empty-asar.asar',Buffer.concat([h,j]))"`；`node scripts/compat-check.mjs --asar "$env:TEMP\empty-asar.asar"; $LASTEXITCODE` | 1 | 首行 `asar: <…>\empty-asar.asar  dsh <unknown>`；47 行 `^FAIL A\d\d `，每行含 `entry missing`；末行含 `compat: 0 PASS / 47 FAIL` 与 `哨兵无法判定` |
| 8 | `$env:DSH_INSTALL_DIR = $null; node scripts/compat-check.mjs; $LASTEXITCODE` | 0 | 首行仍是 `asar: <与第 1 行同一路径>`；末行 `^compat: 47 PASS / 0 FAIL / 0 STALE`（探测路径生效） |
| 9 | `node --check scripts/compat-check.mjs; $LASTEXITCODE` | 0 | 无输出 |
| 10 | `(Select-String -Path scripts/compat-check.mjs -Pattern 'asar\.mjs').Count`；`(Select-String -Path scripts/compat-check.mjs -Pattern 'openSync|readSync|readUInt32LE').Count` | 0 / 0 | (1) ≥ 1；(2) 为 0（没自己解析 asar） |
| 11 | `node --test plugins/session-mailbox/test/*.test.mjs *> $env:TEMP\mb.txt; $LASTEXITCODE`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'found\.reason ===').Count`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'pure\.resolveTarget\(').Count`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'liveOrThrow\(').Count` | 0 / 0 / 0 / 0 | 依次为：测试含 `ℹ fail 0` 且 `ℹ tests` 等于 Step 0 记下的 N；`4`（改前 8）；`1`（改前 2）；`1` |
| 12 | `(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'agent must not be empty').Count`；同上分别查 `cannot send to yourself`、`cannot rename yourself; ask your peer, or the user`、`no live top-level session matches`、`no top-level session matches`、`target session is archived; unarchive it before messaging`、`send_session_message addresses top-level sessions only`、`unexpected resolve verdict`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'ambiguous session "').Count` | 0 ×9 | 八个 -SimpleMatch 各命中 1 行（文案未变，一条都没丢）；`ambiguous session "` 命中 2 行（两个调用点各一条） |
| 13 | `(Select-String -Path plugins/session-mailbox/index.js -Pattern 'ctx\.workspaceRegistry\.archivedSessionIds').Count`；`(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'is no longer live in this process').Count` | 0 / 0 | `2`（`liveRows()` 一处、`liveOrThrow()` 一处）；`1` |
| 14 | `(Select-String -Path AGENTS.md -SimpleMatch -Pattern 'scripts/compat-check.mjs').Count`；`(Get-Content plugins/session-mailbox/package.json \| ConvertFrom-Json).version`；`git show --stat --oneline HEAD~1 HEAD`；`git status --short`；`git ls-remote --tags origin` | 0 ×5 | `≥ 1`；`0.8.2`；两个 commit 合计只含 `scripts/compat-check.mjs`、`AGENTS.md`、`plans/compat-sentinel/*`、`plugins/session-mailbox/{index.js,package.json}`，不含 `.tmp-` 与 `plans/mailbox-wake/`；仍列出 `.tmp-*` 与 `plans/` 的未跟踪项；含 `dsh-session-mailbox/v0.8.2` |
| 15 | 单元 B 落完之后**再跑一次**：`node scripts/compat-check.mjs *> $env:TEMP\compat2.txt; $LASTEXITCODE` | 0 | `(Select-String -Path $env:TEMP\compat2.txt -Pattern '^PASS A\d\d ').Count` 为 47；`(Select-String -Pattern '^(FAIL|STALE) ').Count` 为 0；末行 `^compat: 47 PASS / 0 FAIL / 0 STALE`（收敛改过插件代码之后，哨兵的依赖表仍然对得上） |

## 7. 何时停下问

- Step 0 里 `node scripts/asar.mjs list "$env:DSH_INSTALL_DIR" ...` 的 `matched` 为 0 → 停（要么 asar 路径不对，要么这个构建不附源码）。
- 任一断言在**当前**安装上不命中，而它看起来像真的行为变更（不是笔误）→ 停，把它写进交付报告，不要为了变绿去改断言。
- 把某个 pattern 写得更松就能过、而更松的写法会漏掉一种真实变更 → 停。
- 要让某条断言的 `region` 换成块解析、括号匹配，或要用 `m`/`s` 等 regex flag → 停。
- 两处收敛需要改 `pure.js`、改错误文案、改输出 schema，或需要第三个函数 → 停。
- 要让三个客户端插件进表、或要加第二个脚本文件 → 停（越权扩范围）。
- `git status` 显示将要提交的路径里出现 `.tmp-*`、`plans/mailbox-wake/` 或任何 profile 路径 → 停。
- 需要 `rm`、需要改 profile、需要重启 Host → 停。

## 8. Blind Spot List

- **BS-1 断言读的是随包源码，运行时跑的是 `lib/*.js`**：A44/A45 只覆盖 `dsh-tools` 与 `dsh-llm` 两个包，其余包的运行时导出没有断言。回来条件——某次升级 `src` 未变而插件行为变了（或反过来）。
- **BS-2 这个构建可能不再随包附 `src`**：回来条件——首跑出现成片 `entry missing`；此时按总评追加段处理，不改断言。
- **BS-3 个别断言锁了常量值**（`SUBAGENT_DELEGATION: 120`）：回来条件——只因数值变了而红，就把该 pattern 改成只匹配键名。
- **BS-4 只回答「当前这台机器装的 DSH」**：另一台机器版本不同，表可能已过期；回来条件——同一 commit 在两台机器上跑出不同结论。
- **BS-5 `dsh-client-ui-chat` 只存在于桌面/Web 安装**：纯 headless 安装可能没有 A33 的条目；回来条件——A33 在某台机器上常态红。
- **BS-6 文本匹配会命中注释**：回来条件——某个接口已在运行时消失、而源码注释里还留着它的名字，导致本该红的断言保持绿。
- **BS-7 三个纯客户端插件的宿主 UI 接口零覆盖**（`blank-draft-handoff` 的 `ctx.uiWorkspace`、`dsh-input-history` 与 `dsh-message-editor` 的 `ctx.slots` / `ctx.get('uiWorkspace')` 等）：它们的能力全在 `client.js`，宿主客户端 API 一改同样静默死。回来条件——任一客户端插件出现「页面没反应但插件状态正常」的故障。
- **BS-8 多安装机器上按 `app.asar` 的 mtime 选最新**：真正的判据是「当前 profile 实际加载的那个」，脚本读不到这个关系。回来条件——同一台机器上哨兵结论与插件实际行为相反。
- **BS-9 过紧的签名 pattern 会在非破坏性改名上假红**（形参改名、给可选参数加默认值）：回来条件——出现一次「插件行为完全正常而哨兵红」的升级。
- **BS-10 §6 第 2、3 行只对 A05 做过反例检验**：其余 45 条断言的判别力靠 §4 S2 的 `region` 与 mutation 设计，没有逐条的反例验收。回来条件——出现一次「改了接口而某条断言没红」。
