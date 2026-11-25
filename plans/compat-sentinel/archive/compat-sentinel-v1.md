# compat-sentinel v1（Work Plan）

本方案自足。实现方只读本文件，不读评审记录。版本 v1，round 1 冻结文本。

强度词只有五个：**必须**（硬闸）、**不得**（禁止）、**默认**（可偏离，偏离要写进交付报告）、**可**（可选）、**只能**（唯一做法）。

## 1. 用户要什么（原话）

> 「兼容哨兵」：给 DSH 插件做接口兼容自检，外加两处小收敛。

动机原话：

> 哪天 DSH 出现破坏性更新，我们的插件静默失效，我们希望**升级当时**就红。

范围：新增 `scripts/compat-check.mjs`（含 35 行断言表）；`plugins/session-mailbox/index.js` 里两处重复收敛；`AGENTS.md` 加一行指路；`plans/compat-sentinel/` 随仓库提交推送。不做大重构（不拆多文件、不引入事件总线、不改配置驱动工具表）。

## 2. Core Task 与失败症状

**Core Task**：在一台装好 DSH 的机器上，`node scripts/compat-check.mjs` 一条命令给出结论——本仓库插件依赖的 35 个宿主接口在当前安装的 `app.asar` 里是否仍在；不在的逐条报出「包 + 断言 + 插件里哪一行依赖它 + 后果」，进程非 0 退出，最后一行是总评。

**失败症状**（任一条成立即判 Core Task 未达成）：

1. DSH 改了某个被依赖的接口，脚本仍然 exit 0。
2. 脚本 FAIL 了，但没有指出 `plugins/` 下具体的文件与行号。
3. 脚本依赖本机已解包的源码树，或在找不到 DSH 时抛栈而不是给人话。
4. 断言表里出现「条目在、正则不命中」的静默放过（例如把 `|` 写成未转义的分支）。

## 3. 开始指令

先做 Step 0，之后按 Step 1 → 7 的顺序做。每一步在上一步完成判据变绿之后才开始。

| Step | 一句话 | 卡住时 |
|---|---|---|
| 0 | 备份 + 记基线 + 确认 asar 可读 | 停下问 |
| 1 | 写定位层与读取层（复用 `scripts/asar.mjs`） | 停下问 |
| 2 | 落 35 行断言表 + 判定 | 停下问 |
| 3 | 输出格式、退出码、总评、脚本头注释 | 停下问 |
| 4 | 自测三连（绿、pattern 不命中、stale site） | 停下问 |
| 5 | 收敛 1：`resolvePeer` | 停下问 |
| 6 | 收敛 2：`liveOrThrow` | 停下问 |
| 7 | 文档一行 + 版本 + 提交推送 | 停下问 |

**Step 0 · 准备与基线**
读 `scripts/asar.mjs` 全文、`plugins/session-mailbox/index.js` 全文（尤其 `send_session_message` 161–235 行与 `rename_session` 261–333 行）、`plugins/session-mailbox/lib/pure.js`、`AGENTS.md`。
把将要修改的 `plugins/session-mailbox/index.js`、`plugins/session-mailbox/package.json`、`AGENTS.md` 各复制一份到 `backups/compat-sentinel-<yyyyMMdd-HHmmss>/`（保持原相对路径；`backups/` 已在 `.gitignore`）。`scripts/compat-check.mjs` 是新建文件，不备份。
在交付报告里记下三个基线值：`git rev-parse HEAD`、`node --test plugins/session-mailbox/test/*.test.mjs` 输出的 `ℹ tests <N>`、`node --version`。
确认 asar 可读：`node scripts/asar.mjs list "$env:DSH_INSTALL_DIR" 'dsh-agent/src/index\.ts'` 必须打印 `"matched":1` 及以上。
完成判据：`Get-ChildItem backups/compat-sentinel-*/ -Recurse -File` 列出 3 个文件；三个基线值与 asar 探测结果都在交付报告里。

**Step 1 · 定位层与读取层**
在 `scripts/compat-check.mjs` 里写三样东西，规格见 §4 S1：`resolveAsar()`、`readEntry(entry)`、`dshVersion()`。读取**只能**通过子进程调 `scripts/asar.mjs`（`list` / `cat`），不得在脚本里自己解析 asar 二进制。
完成判据：`node --check scripts/compat-check.mjs` 退出码 0；`Select-String -Path scripts/compat-check.mjs -Pattern 'asar\.mjs'` 至少 1 行；`Select-String -Path scripts/compat-check.mjs -Pattern 'openSync|readSync|readUInt32LE'` 为 0 行。

**Step 2 · 断言表**
把 §4 S2 的 `const ASSERTIONS = [...]` 逐字落进脚本；写 `runTable()`：逐条读条目、逐条判 PASS/FAIL，并解析每条 `sites` 的当前行号。
完成判据：`node -e "const s=require('node:fs').readFileSync('scripts/compat-check.mjs','utf8');console.log((s.match(/id: 'A\d\d'/g)||[]).length)"` 输出 `35`；`node --check scripts/compat-check.mjs` 退出码 0。

**Step 3 · 输出与退出码**
按 §4 S3、S4 写 PASS 行、三种 FAIL 形态（条目缺失单行块、断言不命中完整块、`STALE` 块）、总评行与退出码。
完成判据：`node --check` 退出码 0；脚本里出现 `STALE`、`entry missing`、`compat:` 三个字面量（`Select-String -SimpleMatch` 各至少 1 行）。

**Step 4 · 自测三连**
按 §6 第 1–6 行跑：本机全绿、临时改坏一条 pattern、临时改坏一条 site、`--asar` 指向不存在的路径、空 asar、清空 `DSH_INSTALL_DIR`。改坏的两次必须用 Step 0 的备份还原，还原后重跑全绿。
完成判据：§6 第 1–6 行逐行对上；`Select-String -Path scripts/compat-check.mjs -Pattern 'followupXX|steerERR'` 为 0 行（改坏的痕迹已还原）。

**Step 5 · 收敛 1：`resolvePeer`**
按 §4 S5 在 `apply()` 里、`rows()` 之后加一个局部函数 `resolvePeer(list, arg, selfId, text)`，把 `send_session_message` 与 `rename_session` 里各写一遍的五分支换成一次调用。两处传给它的五条文案与改动前逐字相同。
完成判据：`Select-String -Path plugins/session-mailbox/index.js -Pattern 'found\.reason ===' | Measure-Object` 计数为 `1`（改前 8）；`Select-String -Path plugins/session-mailbox/index.js -Pattern 'pure\.resolveTarget\('` 计数为 `1`（改前 2）；`node --test plugins/session-mailbox/test/*.test.mjs` 退出码 0 且 `ℹ tests` 仍等于 Step 0 记下的 N。

**Step 6 · 收敛 2：`liveOrThrow`**
按 §4 S6 加 `liveOrThrow(id)`，让 `send_session_message` 用它替换 198–214 行那三段检查。`rename_session` 不动（它要走 `controller.resolveAgent` 唤醒冷会话，见 §5）。
完成判据：`Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'is no longer live in this process'` 计数为 `1`（位置从 `send_session_message` 体内挪到 `liveOrThrow`）；`Select-String -Path plugins/session-mailbox/index.js -Pattern 'ctx\.workspaceRegistry\.archivedSessionIds'` 计数为 `2`（`liveRows()` 一处、`liveOrThrow()` 一处；改前也是 2，但第二处从工具体内挪了出来）；`node --check plugins/session-mailbox/index.js` 退出码 0。

**Step 7 · 文档、版本、交付**
按 §4 S7 改 `AGENTS.md` 一行、`package.json` 版本、两次提交、打 tag、推送。
完成判据：§6 第 10–13 行逐行对上。

## 4. Steps 的细节

### S1 `scripts/compat-check.mjs` 的定位层与读取层

**asar 定位顺序**（`resolveAsar()`，命中即停）：

1. 命令行 `--asar <path>`，或第一个位置参数。
2. `process.env.DSH_INSTALL_DIR`：是文件就用它；是目录就依次试 `<dir>/app.asar`、`<dir>/resources/app.asar`。
3. 探测（仅在 Windows）：`%LOCALAPPDATA%\Programs\DSH*\resources\app.asar` 与 `%ProgramFiles%\DSH*\resources\app.asar`，按目录名倒序取第一个存在项。多个命中时任取第一个并在输出里写明「探测到 N 个，用了这个」。
4. 都不成立：打印一行 `compat: cannot locate app.asar` 加三行提示（`set DSH_INSTALL_DIR=...`、`--asar <path>`、`node scripts/asar.mjs list <asarPath> ...`），exit 2。

**读取层**：
- `readEntry(entry)` 用 `spawnSync(process.execPath, [<repo>/scripts/asar.mjs, 'cat', asarPath, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })`。成功返回文本；非 0 退出返回 `undefined`（stderr 的 `not found:` 视为「条目不存在」）。同一 entry 只读一次（`Map` 缓存）。
- `dshVersion()` 读条目 `package.json`，取 `name` 与 `version`，只用于首行展示；读不到就打印 `dsh <unknown>`，不计入 PASS/FAIL。
- 首行必须是 `asar: <绝对路径>  dsh <name> <version>`。

**约束**：只用 `node:` 内置（`node:fs` / `node:path` / `node:os` / `node:child_process` / `node:url`）；不写任何文件；不新增依赖；不 import `asar.mjs`（它是 CLI）。断言对象是随包的 TS 源码（Decision 3）。

### S2 断言表（逐字）

字段含义：`pkg` = 宿主包；`entry` = 在 asar 里的条目路径；`patterns` = 断言（全部命中才算 PASS，每个都是 `new RegExp(p)`，大小写敏感）；`sites` = 插件里依赖它的位置（`[文件, 正则]`，FAIL 时现场求行号）；`means` = 失败意味着什么。

匹配是纯文本正则：**命中源码注释也算命中**。这是已知取舍（BS-6），不得为此加语法解析。

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
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.get\\(entry\\.id\\)']],
    means: 'get 改名或换了参数：send_session_message 取不到目标 agent，投递前就抛错' },
  { id: 'A03', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['list\\(\\): Agent\\[\\]'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.list\\(\\)']],
    means: 'list 改名或变异步：list_sessions 与别名表拿不到任何会话' },
  { id: 'A04', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['export type AgentStatus = \'idle\' \\| \'running\''],
    sites: [['plugins/session-mailbox/index.js', 'pure\\.pageStatus\\(a\\.status\\)'], ['plugins/session-mailbox/lib/pure.js', 'status === \'running\'']],
    means: 'status 取值变了：pageStatus 把所有会话塌成 inactive，投递原语从 steer 退成 followup' },
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
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(\\{ workspaceId: entity\\.id \\}\\)']],
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
    means: 'resolveAgent 签名或返回形状变了：rename_session 无法装载冷会话，冷会话改名全失败' },
  { id: 'A10', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['super\\(ctx, \'sessionTitle\'\\)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)']],
    means: 'sessionTitle 服务消失：list_sessions 的 title 列全变成 (untitled)，rename_session 报不可用' },
  { id: 'A11', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['get\\(session: Session\\): SessionTitleSnapshot \\| undefined'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: 'get 签名或快照形状变了：标题读不出来，列表退回无标题' },
  { id: 'A12', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['rename\\(session: Session, title: string\\): SessionTitleSnapshot'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: 'rename 签名变了：rename_session 失效（用户钉住标题的能力丢失）' },
  { id: 'A13', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['\'session/title\': SessionTitleEventData'],
    sites: [['plugins/session-mailbox/README.md', '`session/title` 事件的折叠值']],
    means: '事件名或载荷变了：标题投影断流，get() 永远返回旧值或 undefined' },
  { id: 'A14', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['readonly maxTitleBytes: number'],
    sites: [['plugins/session-mailbox/lib/pure.js', '`maxTitleBytes`']],
    means: 'maxTitleBytes 消失：超长标题不再被服务端拒绝，rename_session 的长度承诺落空' },
  { id: 'A15', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['export class SessionTitleInvalidError'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: '错误类消失：空标题与「会话不活」两类错误混成一条，rename_session 的报文不再能区分' },
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
    patterns: ['archiveSession\\(sessionId: SessionId, options: ArchiveSessionOptions = \\{\\}\\)'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.archiveSession\\(']],
    means: 'archiveSession 签名变了（例如 stopActivity 换名）：archive_sessions 的 stop 选项静默失效' },
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
    means: 'defineTool 消失：两个插件的全部工具都注册不上（加载器不报错，工具零个）' },
  { id: 'A26', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['export \\* from \'./schema.ts\''],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 不再从包根导出：hostRequire 解构出 undefined，apply 阶段抛 TypeError' },
  { id: 'A27', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['register\\(definition: ToolDefinition, options: ToolRegistrationOptions = \\{\\}\\): \\(\\) => void'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.tools\\.register\\('], ['plugins/user-model/index.js', 'ctx\\.tools\\.register\\(']],
    means: 'tools.register 签名变了：工具静默不注册，症状是「插件加载成功但一个工具都没有」' },
  { id: 'A28', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['export function createUserMessage'],
    sites: [['plugins/session-mailbox/index.js', 'createUserMessage\\(']],
    means: 'createUserMessage 消失：send_session_message 造不出 user 消息' },
  { id: 'A29', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/index.ts',
    patterns: ['export \\* from \'./message.ts\''],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: 'createUserMessage 不再从包根导出：hostRequire 解构出 undefined' },
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
    patterns: ['readonly id: SessionId', 'readonly createdAt: number', 'readonly cwd\\?: string', 'readonly origin\\?: \'subagent\''],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.cwd'], ['plugins/session-mailbox/index.js', 'session\\.header\\.origin === \'subagent\'']],
    means: 'SessionHeader 字段改名或换类型：别名表、排序、cwd 列与「顶层会话」判定全错（子代理会被当成顶层）' },
  { id: 'A33', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts',
    patterns: ['event\\.data\\.source\\.kind !== \'user\''],
    sites: [['plugins/session-mailbox/README.md', 'event\\.data\\.source\\.kind !== .user.']],
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
]
```

### S3 判定与输出

**每条断言的判定**：条目读不出来 → `entry-missing`；条目读出来但任一 `patterns` 不命中 → `pattern-miss`，并列出所有不命中的 pattern 原文；全部命中 → PASS。

**PASS 行（一行）**：`PASS <id>  <pkg>  <entry>`
`PASS A05  @deepseek-ai/dsh-agent  node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts`

**`entry-missing`（单行）**：
`FAIL A05  @deepseek-ai/dsh-agent  node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts  entry missing（该构建可能不随包附源码；用 node scripts/asar.mjs list <asar> '<包>/src/' 确认）`

**`pattern-miss`（块，1 行标题 + 4 行内容，顺序固定）**：
```
FAIL A05  @deepseek-ai/dsh-agent  node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts
  missing : followupXX(message: UserMessage): void
  depends : plugins/session-mailbox/index.js:224  target.followup(message) | plugins/session-mailbox/index.js:225  target.steer(message)
  means   : 投递原语消失或改名：send_session_message 抛 TypeError，消息发不出去
  lines   : 断言 2 条，命中 1 条
```
`missing` 一行列出**所有**不命中的 pattern 原文（多个用 ` + ` 分隔）；`depends` 里每个 site 用 ` | ` 分隔，端口是 `文件:行号  两空格  命中的那一行（trim）`；行号由脚本**现场**按 site 正则求得。

**`STALE`（块，1 行标题 + 2 行内容）**：某个 site 的文件不存在，或它的正则在文件里匹配不到。
```
STALE A05  @deepseek-ai/dsh-agent  node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts
  site    : plugins/session-mailbox/index.js  /target\.steer\(message\)/  匹配不到
  means   : 断言表里这条的依赖点已过期；先修 sites 再谈 DSH
```
`STALE` 与 `FAIL` 同等计入非 0 退出：否则插件改个名字，哨兵会永远绿。

**总评（最后一行，永远打印）**，两种形态：
- 全绿：`compat: 35 PASS / 0 FAIL / 0 STALE（35 条断言，dsh dsh-desktop-next 2.0.24-next）— 全部依赖接口仍在，可以升级`
- 有红：`compat: 32 PASS / 3 FAIL / 0 STALE（35 条断言，dsh dsh-desktop-next 2.0.24-next）— 有接口变了：先别升级 DSH，按上面的 FAIL 行改插件或改断言`
- 条目缺失超过一半时，总评末尾追加一段：`（大量条目不存在：这个 asar 可能不附 TS 源码，哨兵无法判定，不等于插件会坏）`

### S4 退出码

| 码 | 含义 |
|---|---|
| 0 | 35 条全 PASS，无 STALE |
| 1 | 至少一条 FAIL 或 STALE |
| 2 | 用法错误 / 找不到 app.asar（不跑断言表） |

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

- `AGENTS.md` 的「改完必须做的验证」代码块之后加一行（`默认` 位置；放这里因为升 DSH 和 `git pull` 之后都会看这一段）：
  `升级 DSH 或 pull 本仓库后：node scripts/compat-check.mjs（读 app.asar 断言宿主接口；非 0 退出＝先别升级，见 FAIL 行指到的插件位置）。`
- `plugins/session-mailbox/package.json` 的 `version`：`0.8.1` → `0.8.2`（纯重构，AGENTS.md 的 patch 规则）。
- README 不改：两处收敛不改变任何对外行为与文案。
- 两次提交，按路径精确 add，**不得** `git add -A`：
  1. `git add scripts/compat-check.mjs AGENTS.md plans/compat-sentinel` → commit message `scripts: add a compat sentinel that asserts the host plugin API from app.asar`
  2. `git add plugins/session-mailbox/index.js plugins/session-mailbox/package.json` → commit message `session-mailbox: dedupe target resolution and liveness checks`；`git tag dsh-session-mailbox/v0.8.2`
- 推送：`git push`；`git push origin dsh-session-mailbox/v0.8.2`。

## 5. No-go 项

1. 不得在 `scripts/compat-check.mjs` 里自己解析 asar 二进制或 import `scripts/asar.mjs`；读取**只能**走子进程调 `scripts/asar.mjs`（Decision 2）。
2. 不得引入任何运行时依赖；脚本与插件只用 `node:` 内置（AGENTS.md 硬规则 3）。
3. 不得为了变绿而放宽断言：任何一条 FAIL 都要先判断是「DSH 变了」还是「断言写错了」，改断言必须写进交付报告（Decision 6）。
4. 不得改 `plugins/session-mailbox/lib/pure.js`、`lib/create.js` 与任何测试文件：两处收敛是纯搬移（Decision 4）。
5. 不得改任何工具名、参数、输出 schema、工具描述、`MAILBOX_PROMPT` 与 README：两处收敛不改变对外行为与错误文案。
6. 不得让 `rename_session` 走 `liveOrThrow`：它靠 `sessionController.resolveAgent` 装载冷会话，「必须活」在那条路径上是错的（Decision 5）。
7. 不得引入「必须活 + 非 subagent + 非归档」之外的第三条收敛（例如把顶层守卫 `origin === 'subagent'` 也抽出来）：`list_sessions` 对子代理返 `[]`、`create_session` 走 `subagentVerdict`，三处语义不同（Decision 4）。
8. 不得把断言表做成配置驱动或拆成多文件；表只能内嵌在脚本里，一处维护（Decision 1）。
9. 不得提交 `.tmp-*.ts`、`.tmp-*.txt` 或 `plans/mailbox-wake/`（另一个会话的产物）；`git status` 里这些路径交付后仍是未跟踪。
10. 不得用 `rm` / `del` / `Remove-Item`；要删就移入回收站。
11. 不得改 profile 配置，不装/卸载插件，不重启 Host。

## 6. 验收表

| 配方（操作序列） | 期望退出码 | 期望输出消息集合 |
|---|---|---|
| (1) `node scripts/compat-check.mjs *> $env:TEMP\compat.txt; $LASTEXITCODE` | 0 | 首行匹配 `^asar: .*app\.asar  dsh \S+ \S+$`；`(Select-String -Path $env:TEMP\compat.txt -Pattern '^PASS A\d\d ').Count` 为 35；末行匹配 `^compat: 35 PASS / 0 FAIL / 0 STALE` |
| (1) 把 A05 的第一个 pattern 临时改成 `followupXX\(message: UserMessage\): void`；(2) 跑脚本 | 1 | 输出含 `FAIL A05`、`missing : followupXX(message: UserMessage): void`、`depends : plugins/session-mailbox/index.js:`、`means   :`；`(Select-String -Pattern '^FAIL ').Count` 为 1；末行 `compat: 34 PASS / 1 FAIL / 0 STALE` |
| (1) 还原上一步，把 A05 的第二个 site 临时改成 `target\.steerERR\(message\)`；(2) 跑脚本 | 1 | 输出含 `STALE A05`、`site    : plugins/session-mailbox/index.js`、`匹配不到`；末行 `0 FAIL / 1 STALE` |
| (1) 还原上一步；(2) `node scripts/compat-check.mjs --asar "$env:TEMP\nope.asar"` | 2 | 输出含 `cannot locate app.asar` 与 `--asar`；`(Select-String -Pattern '^PASS ').Count` 为 0（不跑断言表） |
| (1) 造一个空 asar：`node -e "const fs=require('fs');const j=Buffer.from(JSON.stringify({files:{}}));const h=Buffer.alloc(16);h.writeUInt32LE(4,0);h.writeUInt32LE(j.length+8,4);h.writeUInt32LE(j.length+8,8);h.writeUInt32LE(j.length,12);fs.writeFileSync(process.env.TEMP+'/empty-asar.asar',Buffer.concat([h,j]))"`；(2) `node scripts/compat-check.mjs --asar "$env:TEMP\empty-asar.asar"; $LASTEXITCODE` | 1 | 首行 `asar: <…>\empty-asar.asar  dsh <unknown>`；35 行 `^FAIL A\d\d `，每行含 `entry missing`；末行含 `compat: 0 PASS / 35 FAIL` 与 `哨兵无法判定` |
| (1) `$env:DSH_INSTALL_DIR = $null; node scripts/compat-check.mjs; $LASTEXITCODE` | 0 | 首行仍是 `asar: <同一路径>`；末行 `compat: 35 PASS / 0 FAIL / 0 STALE`（探测路径生效） |
| (1) `node --check scripts/compat-check.mjs; $LASTEXITCODE` | 0 | 无输出 |
| (1) `(Select-String -Path scripts/compat-check.mjs -Pattern 'asar\.mjs').Count`；(2) `(Select-String -Path scripts/compat-check.mjs -Pattern 'openSync|readSync|readUInt32LE').Count` | 0 / 0 | (1) ≥ 1；(2) 为 0（没自己解析 asar） |
| (1) `node --test plugins/session-mailbox/test/*.test.mjs *> $env:TEMP\mb.txt; $LASTEXITCODE`；(2) `(Select-String -Path plugins/session-mailbox/index.js -Pattern 'found\.reason ===').Count`；(3) `(Select-String -Path plugins/session-mailbox/index.js -Pattern 'pure\.resolveTarget\(').Count` | 0 / 0 / 0 | (1) 含 `ℹ fail 0`，`ℹ tests` 等于 Step 0 记下的 N；(2) 为 1（改前 8）；(3) 为 1（改前 2） |
| (1) `(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'is no longer live in this process').Count`；(2) `(Select-String -Path plugins/session-mailbox/index.js -Pattern 'ctx\.workspaceRegistry\.archivedSessionIds').Count`；(3) `(Select-String -Path plugins/session-mailbox/index.js -Pattern 'liveOrThrow\(').Count` | 0 / 0 / 0 | (1) 为 1；(2) 为 2（改前也是 2，但第二处已挪进 `liveOrThrow`）；(3) 为 2（定义 1 处 + 调用 1 处） |
| (1) `Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'cannot rename yourself; ask your peer, or the user','no live top-level session matches','no top-level session matches','target session is archived; unarchive it before messaging'` | 0 | 四条各命中恰好 1 行（文案未变） |
| (1) `(Select-String -Path AGENTS.md -SimpleMatch -Pattern 'scripts/compat-check.mjs').Count`；(2) `(Get-Content plugins/session-mailbox/package.json \| ConvertFrom-Json).version` | 0 / 0 | (1) ≥ 1；(2) 输出 `0.8.2` |
| (1) `git show --stat --oneline HEAD~1 HEAD`；(2) `git status --short`；(3) `git ls-remote --tags origin` | 0 / 0 / 0 | (1) 两个 commit 合计只含 `scripts/compat-check.mjs`、`AGENTS.md`、`plans/compat-sentinel/*`、`plugins/session-mailbox/{index.js,package.json}`，不含 `.tmp-` 与 `plans/mailbox-wake/`；(2) 仍列出 `.tmp-*` 与 `plans/` 的未跟踪项（未被我提交）；(3) 含 `dsh-session-mailbox/v0.8.2` |

## 7. 何时停下问

- Step 0 里 `node scripts/asar.mjs list "$env:DSH_INSTALL_DIR" ...` 的 `matched` 为 0 → 停（要么 asar 路径不对，要么这个构建不附源码）。
- 任一断言在**当前**安装上不命中，而它看起来像真的行为变更（不是笔误）→ 停，把它写进交付报告，不要为了变绿去改断言。
- 把某个 pattern 写得更松就能过、而更松的写法会漏掉一种真实变更 → 停。
- 两处收敛需要改 `pure.js`、改错误文案、改输出 schema，或需要第三个函数 → 停。
- `git status` 显示将要提交的路径里出现 `.tmp-*`、`plans/mailbox-wake/` 或任何 profile 路径 → 停。
- 需要 `rm`、需要改 profile、需要重启 Host → 停。

## 8. Blind Spot List

- **BS-1 断言读的是随包 TS 源码，运行时跑的是 `lib/*.js`**：回来条件——某次升级 `src` 未变而插件行为变了（或反过来），即断言与真机行为相反。
- **BS-2 这个构建可能不再随包附 `src`**：回来条件——首跑出现成片 `entry missing`；此时按总评追加段处理，不改断言。
- **BS-3 个别断言锁了常量值**（`SUBAGENT_DELEGATION: 120`）：回来条件——只因数值变了而红，就把该 pattern 改成只匹配键名。
- **BS-4 只回答「当前这台机器装的 DSH」**：另一台机器版本不同，表可能已过期；回来条件——同一 commit 在两台机器上跑出不同结论。
- **BS-5 `dsh-client-ui-chat` 只存在于桌面/Web 安装**：纯 headless 安装可能没有 A33 的条目；回来条件——A33 在某台机器上常态红。
- **BS-6 断言是文本匹配，注释里的旧名字也算命中**：回来条件——某个接口已在运行时消失、而源码注释里还留着它的名字，导致本该红的断言保持绿。
