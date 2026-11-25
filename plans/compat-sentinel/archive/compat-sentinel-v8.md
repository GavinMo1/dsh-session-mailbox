# compat-sentinel v8（Work Plan）

本方案自足。实现方只读本文件，不读评审记录。版本 v8，round 8 冻结文本。

强度词只有五个：**必须**（硬闸）、**不得**（禁止）、**默认**（可偏离，偏离要写进交付报告）、**可**（可选）、**只能**（唯一做法）。

## 1. 用户要什么（原话）

> 「兼容哨兵」：给 DSH 插件做接口兼容自检，外加两处小收敛。

动机原话：

> 哪天 DSH 出现破坏性更新，我们的插件静默失效，我们希望**升级当时**就红。

范围：新增 `scripts/compat-check.mjs`（含 61 行断言表）；`plugins/session-mailbox/index.js` 里两处重复收敛；`AGENTS.md` 加一行指路；`plans/compat-sentinel/` 随仓库提交推送。

两批交付，**分开提交、分开推送**：

- **单元 A（主诉求）**：Step 0–5。哨兵本身 + `AGENTS.md` 一行 + commit 1。A 完成即可向用户报告。
- **单元 B（次要）**：Step 6–8。两处收敛 + 版本号 + 复跑哨兵 + tag + commit 2。B 不阻塞 A 的交付，也可以被推迟；用户只放行 A 时，做完 Step 5 就停。

本仓另有三个纯客户端插件（`blank-draft-handoff`、`dsh-input-history`、`dsh-message-editor`），它们的宿主 UI 接口**不在本表**内（BS-7）。不得把它们顺手并进来：那会改变用户确认过的交付规模。

不做大重构（不拆多文件、不引入事件总线、不改配置驱动工具表）。

## 2. Core Task 与失败症状

**Core Task**：在一台装好 DSH 的机器上，`node scripts/compat-check.mjs` 一条命令给出结论——本仓库 Host 侧两个插件（`session-mailbox`、`user-model`）依赖的 61 个宿主接口在当前安装的 `app.asar` 里是否仍在；不在的逐条报出「包 + 断言 + 插件里哪一行依赖它 + 后果」，进程非 0 退出，最后一行是总评。断言表的准入条件只约束新增行：**宿主改了它，插件不报错地降级**（会当场抛错的新依赖点不新开行，§4 S2）。

**失败症状**（任一条成立即判 Core Task 未达成）：

1. DSH 改了某个被依赖的接口，脚本仍然 exit 0。
2. 脚本 FAIL 了，但没有指出 `plugins/` 下具体的文件与行号。
3. 脚本依赖本机已解包的源码树，或在找不到 DSH 时抛栈而不是给人话。
4. 拿错路径 / 坏 asar 时，脚本给出「这个构建不附源码」这种**错误结论**而不是报路径有问题。
5. 断言的匹配面比它声称的面宽：同一文件里另一个同名符号、或同一块里被搬进嵌套对象的同名字段，就能满足它，于是真改动仍然绿。
6. 交付后的哨兵在仓库自己的 HEAD 上报 STALE（哨兵的依赖表与插件代码不同步）。

## 3. 开始指令

先做 Step 0，之后按 Step 1 → 8 的顺序做；单元 A 到 Step 5 结束，单元 B 从 Step 6 开始。每一步在上一步完成判据变绿之后才开始。

| Step | 一句话 | 卡住时 |
|---|---|---|
| 0 | 备份 + 记基线 + 确认 asar 可读 | 停下问 |
| 1 | 定位层与读取层（复用 `scripts/asar.mjs`） | 停下问 |
| 2 | 落 61 行断言表 + `region` 窗口 + 判定 | 停下问 |
| 3 | 输出格式、退出码、总评、脚本头注释 | 停下问 |
| 4 | 自测（见 §6 第 1–11 行） | 停下问 |
| 5 | `AGENTS.md` 一行 + commit 1 + push（**单元 A 到此交付**） | 停下问 |
| 6 | 收敛 1：`resolvePeer` | 停下问 |
| 7 | 收敛 2：`liveOrThrow` | 停下问 |
| 8 | 版本号 + 复跑哨兵 + commit 2 + tag + push（单元 B 交付） | 停下问 |

**Step 0 · 准备与基线**
读 `scripts/asar.mjs` 全文、`plugins/session-mailbox/index.js` 全文（`send_session_message` 161–235 行、`rename_session` 261–333 行）、`plugins/session-mailbox/lib/pure.js`、`AGENTS.md`。
把将要修改的 `plugins/session-mailbox/index.js`、`plugins/session-mailbox/package.json`、`AGENTS.md` 各复制一份到 `backups/compat-sentinel-<yyyyMMdd-HHmmss>/`（保持原相对路径；`backups/` 已在 `.gitignore`）。`scripts/compat-check.mjs` 是新建文件，Step 3 完成后再复制一份到同一目录，名为 `compat-check.step3.mjs`，供 Step 4 还原。
在交付报告里记下三个基线值：`git rev-parse HEAD`、`node --test plugins/session-mailbox/test/*.test.mjs` 输出的 `ℹ tests <N>`、`node --version`。
确认 asar 可读：先把路径解析成 asar 文件再探测——`$asar = if ($env:DSH_INSTALL_DIR -and (Test-Path "$env:DSH_INSTALL_DIR\resources\app.asar")) { "$env:DSH_INSTALL_DIR\resources\app.asar" } elseif ($env:DSH_INSTALL_DIR -and (Test-Path $env:DSH_INSTALL_DIR -PathType Leaf)) { $env:DSH_INSTALL_DIR } else { (Get-ChildItem "$env:LOCALAPPDATA\Programs\DSH*\resources\app.asar" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }`（变量为空时退回 §4 S1 第 3 条的探测；探测也找不到才停下问），再 `node scripts/asar.mjs list $asar 'dsh-agent/src/index\.ts'`，必须打印 `"matched":1` 及以上。
完成判据：`Get-ChildItem backups/compat-sentinel-*/ -Recurse -File` 列出 3 个文件（Step 3 之后是 4 个）；三个基线值与 asar 探测结果都在交付报告里。

**Step 1 · 定位层与读取层**
在 `scripts/compat-check.mjs` 里写三样东西，规格见 §4 S1：`resolveAsar()`、`readEntry(entry)`、`dshVersion()`。读取**只能**通过子进程调 `scripts/asar.mjs`（`cat`），不得在脚本里自己解析 asar 二进制。
完成判据：`node --check scripts/compat-check.mjs` 退出码 0；`(Select-String -Path scripts/compat-check.mjs -Pattern 'asar\.mjs').Count` ≥ 1；`(Select-String -Path scripts/compat-check.mjs -Pattern 'openSync|readSync|readUInt32LE').Count` 为 0。

**Step 2 · 断言表与窗口**
把 §4 S2 的 `const ASSERTIONS = [...]` 逐字落进脚本；写 `windowOf(text, region)` 与 `runTable()`，规格见 §4 S2 与 S3。
完成判据：`node -e "const s=require('node:fs').readFileSync('scripts/compat-check.mjs','utf8');console.log((s.match(/id: 'A\d\d'/g)||[]).length)"` 输出 `61`；`(Select-String -Path scripts/compat-check.mjs -Pattern 'patterns: \[\]').Count` 为 0；`node --check scripts/compat-check.mjs` 退出码 0。

**Step 3 · 输出与退出码**
按 §4 S3、S4 写 PASS 行、四种 FAIL 形态（`entry-missing` 单行块、`pattern-miss` 完整块、`region` 锚错误块、`STALE` 块）、总评行与退出码；写脚本头注释（用法、三个退出码、`DSH_INSTALL_DIR` 与 `--asar`）。
完成判据：`node --check` 退出码 0；对 `STALE`、`entry missing`、`compat:`、`asar unreadable`、`region` 五个词各跑一次 `(Select-String -Path scripts/compat-check.mjs -SimpleMatch -Pattern '<词>' | Where-Object { $_.Line -notmatch '^\s*//' }).Count`，五次都 ≥ 1（注释行不算）。

**Step 4 · 自测（§6 第 1–11 行）**
按 §6 第 1–11 行跑：本机全绿、改坏一条 pattern、改坏一条 site、pattern 与 site 同时改坏、改坏一条 `region` 起锚、0 字节条目、`--asar` 指到目录、`--asar` 指到不存在的路径、坏 asar、空 asar、清空 `DSH_INSTALL_DIR`。改坏的几次用 `backups/…/compat-check.step3.mjs` 还原，还原后重跑全绿。
完成判据：§6 第 1–11 行逐行对上；`(Select-String -Path scripts/compat-check.mjs -Pattern 'followupXX|steerERR|SessionHeaderXXX').Count` 为 0（改坏的痕迹已还原）。

**Step 5 · 单元 A 交付**
按 §4 S7 的 A 部分改 `AGENTS.md` 一行；`git add scripts/compat-check.mjs AGENTS.md plans/compat-sentinel`；commit message `scripts: add a compat sentinel that asserts the host plugin API from app.asar`；`git push`。
完成判据：§6 第 1–12 行全绿；`git status --short -- scripts AGENTS.md plans/compat-sentinel` 无输出；`git log --oneline -1` 是 `scripts: add a compat sentinel …`。做完这一步停下来向用户报告：单元 A 已交付，单元 B 等放行（用户已一并授权时继续 Step 6，否则停）。

**Step 6 · 收敛 1：`resolvePeer`**
按 §4 S5 在 `apply()` 里、`liveRows()` 之后加一个局部函数 `resolvePeer(list, arg, selfId, text)`，把 `send_session_message` 与 `rename_session` 里各写一遍的五分支换成一次调用。两处**各写一遍**五条文案（不得把两条相同的提成共享常量——§6 第 14 行按源码出现次数验「一条都没丢」），与改动前逐字相同。
完成判据：`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'found\.reason ===').Count` 为 4；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'pure\.resolveTarget\(').Count` 为 1；`node --test plugins/session-mailbox/test/*.test.mjs` 退出码 0 且 `ℹ tests` 仍等于 Step 0 记下的 N。

**Step 7 · 收敛 2：`liveOrThrow`**
按 §4 S6 加 `liveOrThrow(id)`，让 `send_session_message` 用它替换「从 `const target = ctx.agents.get(` 到「归档拒绝」`throw` 那一段」的四处检查（按**符号**定位，不按行号；行号会随并发提交漂移）。`rename_session` 不动（它要走 `controller.resolveAgent` 唤醒冷会话，见 §5）。
完成判据：`(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'is no longer live in this process').Count` 为 1；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'ctx\.workspaceRegistry\.archivedSessionIds').Count` 为 2；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'liveOrThrow\(').Count` 为 1；`node --check plugins/session-mailbox/index.js` 退出码 0。

**Step 8 · 单元 B 交付**
按这个顺序做，一步都不能提前：① `package.json` 的 `version` 改成 `0.8.2`；② `git add plugins/session-mailbox/index.js plugins/session-mailbox/package.json` 并 commit（message `session-mailbox: dedupe target resolution and liveness checks`）；③ 跑 §6 第 13、14、15 行（测试与计数）；④ 跑 §6 第 17 行（复跑哨兵，必须 61 PASS / exit 0）；⑤ ③④ 全绿了才 `git tag dsh-session-mailbox/v0.8.2`、`git push`、`git push origin dsh-session-mailbox/v0.8.2`；⑥ 推送之后再跑 §6 第 16 行（git/tag 的检查）。
完成判据：§6 第 13–17 行逐行对上；第 13–15 或第 17 行红时不得打 tag、不得 push。

## 4. Steps 的细节

### S1 `scripts/compat-check.mjs` 的定位层与读取层

**asar 定位顺序**（`resolveAsar()`，命中即停）：

1. 命令行 `--asar <path>`，或第一个位置参数：
   - 路径不存在（`statSync` 抛 `ENOENT`/`ENOTDIR`）→ 打印 `compat: cannot locate app.asar` + 三行提示（`set DSH_INSTALL_DIR=...`、`--asar <path>`、`node scripts/asar.mjs list <asarPath> ...`），exit 2。
   - 路径存在但 `isFile()` 为假 → 打印 `compat: asar path is not a file — <path>`，exit 2。
2. `process.env.DSH_INSTALL_DIR`：是文件就用它；是目录就依次试 `<dir>/app.asar`、`<dir>/resources/app.asar`。
3. 探测（仅在 Windows）：`%LOCALAPPDATA%\Programs\DSH*\resources\app.asar` 与 `%ProgramFiles%\DSH*\resources\app.asar`，按该 `app.asar` 的 `mtime` 倒序取最新的一个。
4. 都不成立：走第 1 条那三行提示，exit 2。

探测命中多于一个时，把全部候选与各自 `mtime` 打印出来，并写明「用了最新的这个」。

**读取层**：`readEntry(entry)` 用 `spawnSync(process.execPath, [<脚本所在目录>/asar.mjs, 'cat', asarPath, entry], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })`，返回三种结果：

| 结果 | 判据 | 后续 |
|---|---|---|
| `{ status: 'ok', text, bytes }` | 退出码 0（**空 stdout 也算 ok**，`bytes: 0`） | 进入断言判定 |
| `{ status: 'missing' }` | 退出码非 0 且 stderr 以 `not found:` 开头 | 该行判 `entry-missing` |
| `{ status: 'error', detail }` | 其他非 0（坏 asar、路径不是 asar、读盘错误） | **中止整次运行**：打印 `compat: asar unreadable — <detail 首行>`，exit 2 |

同一 entry 只读一次（`Map` 缓存）。`dshVersion()` 读条目 `package.json`，取 `name` 与 `version`，只用于首行展示；结果是 `missing` 或解析失败就打印 `dsh <unknown>`，不计入 PASS/FAIL。

首行必须是 `asar: <绝对路径>  dsh <name> <version>`。

**约束**：只用 `node:` 内置（`node:fs` / `node:path` / `node:os` / `node:child_process` / `node:url`）；不写任何文件；不新增依赖；不 import `asar.mjs`（它是 CLI）。断言对象默认是随包 TS 源码（Decision 3），例外是 A44/A45 锁 `lib/index.js` 的运行时导出。

### S2 断言表（逐字）

字段含义：`pkg` = 宿主包；`entry` = 在 asar 里的条目路径；`patterns` = 断言（**全部**命中才算 PASS，每个都是 `new RegExp(p)`，不加 flag、大小写敏感）；`region` = 可选，`[起锚, 止锚]` 两个正则字符串；`sites` = 插件里依赖它的位置（`[文件, 正则]`，FAIL 时现场求行号）；`means` = 失败意味着什么。

**`region` 的取窗规则**（`windowOf(text, [start, stop])`）：

1. 起锚在**整个条目**里的匹配次数必须**恰好为 1**；0 次或 ≥2 次都是锚错误（防止同名声明被插在真声明之前）。
2. 止锚固定是**声明块的结尾行**：`\n}`（列首声明）或 `\n  }`（声明本身缩进在 `declare module … {` 里，例如 `interface Agent` / `interface AssembleContext`）——与起锚所在声明的缩进一致，取起锚之后的**第一个**。找不到就是锚错误。
3. 命中面 = 起锚匹配的起点到止锚匹配的**终点**；`patterns` 只在这个子串上匹配。
3b. **归属校验**：把命中面按 `\n` 切开、**逐行**匹配（不是对整窗跑一次 `.test()`——`^` 在无 `m` 旗标时只认串首，那样等于没查）。起锚那一行之后，任何**缩进不超过起锚缩进**、且匹配 `^(export\s+)?(declare\s+)?(interface|type|class|const|let|function|enum|namespace)\s` 的行，都说明块尾不是这个声明的收尾（块尾形态变了、或声明被压成一行）→ 该行判 `region-mismatch`，不得把窗口拉长到下一个声明。「缩进不超过起锚缩进」这一条是为了放过块内注释里的代码示例（它们缩进更深）。
4. 锚错误、以及 3b 的归属校验失败，**不得**退回整条目匹配，该行判 `region-mismatch`（§4 S3）。

**pattern 的收尾规则**：字段一律带缩进锚（`\n  readonly cwd\?: string`）——这样把同名字段搬进嵌套对象（缩进变 4 格）就不再满足它。**所有** pattern 都要有右边界：字段用 `(?:\r?\n|\s*\{|\s*[,;]|$)`（类型后面不许再跟 `| Undefined` 之类），签名/语句用前瞻 `(?=\s*(?:\r?\n|//|/\*|[,;:(){}[\]]|$))`（同时放过行尾注释）。例外只有两类：以 `<` 结尾的泛型函数声明（`export function defineTool<`），以及已经自带 `\r?\n` 的导出行。

**进表条件（只约束新增行）**：新增**一整行**时，只收「宿主改了它 → 插件**不报错**地降级」的依赖点；改了会当场抛错的点不新开行（那类问题一跑工具就暴露）。往**已有行**里补 pattern 不受这条约束（A41 的 `content` 就是这样补的）。表里已经存在、且按 `means` 是「会抛/会崩」的行不因这条被删：它们抓的是「插件根本起不来」，比静默失效更值得知道。

匹配是纯文本正则：**命中源码注释也算命中**（已知取舍，BS-6），不得为此加语法解析。

```js
const ASSERTIONS = [
  { id: 'A01', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['super\\(ctx, \'agents\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'inject = \\[\'tools\', \'agents\'']],
    means: 'ctx.agents 服务消失：插件 inject 的 agents 缺失，list_sessions 无会话可取，整块功能静默失效' },
  { id: 'A02', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['get\\(id: SessionId\\): Agent \\| undefined(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.get\\(']],
    means: 'get 改名或换了参数：send_session_message 取不到目标 agent，投递前就抛错' },
  { id: 'A03', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['list\\(\\): Agent\\[\\](?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.list\\(\\)']],
    means: 'list 改名或变异步：list_sessions 与别名表拿不到任何会话' },
  { id: 'A04', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['export type AgentStatus = \'idle\' \\| \'running\'\\r?\\n\\r?\\n'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'status === \'running\'']],
    means: 'status 取值变了：pageStatus 把所有会话塌成 inactive，投递原语从 steer 退成 followup' },
  { id: 'A05', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['\\n    followup\\(message: UserMessage\\): void(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n    steer\\(message: UserMessage\\): void(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'target\\.followup\\(message\\)'], ['plugins/session-mailbox/index.js', 'target\\.steer\\(message\\)']],
    region: ['interface Agent \\{', '\\n  \\}'],
    means: '投递原语消失或改名：send_session_message 抛 TypeError，消息发不出去' },
  { id: 'A06', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['super\\(ctx, \'sessionController\'(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionController\'\\)']],
    means: 'sessionController 服务消失：create_session 与 rename_session 全部报「服务不可用」' },
  { id: 'A07', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['@Remote\\(\'create\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'create\\(request: SessionCreateRequest\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(']],
    means: 'create 不再是 create(request)：create_session 造不出会话' },
  { id: 'A08', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['@Remote\\(\'prompt\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'async prompt\\(request: SessionPromptRequest, signal: AbortSignal\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await controller\\.prompt\\(']],
    means: 'prompt 的 signal 位置或 request 形状变了：create_session 的首条消息投递失败，且已建的会话留在那里' },
  { id: 'A09', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['resolveAgent\\(sessionId: SessionId\\): Promise<ApiSessionAgentResult>(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.resolveAgent\\(entry\\.id\\)']],
    means: 'resolveAgent 签名变了或消失：rename_session 无法装载冷会话，冷会话改名全失败' },
  { id: 'A10', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['super\\(ctx, \'sessionTitle\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)']],
    means: 'sessionTitle 服务消失：list_sessions 的 title 列全变成 (untitled)，rename_session 报不可用' },
  { id: 'A11', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['get\\(session: Session\\): SessionTitleSnapshot \\| undefined(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: 'get 签名变了：标题读不出来，列表退回无标题' },
  { id: 'A12', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['rename\\(session: Session, title: string\\): SessionTitleSnapshot(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: 'rename 签名变了：rename_session 失效（用户钉住标题的能力丢失）' },
  { id: 'A13', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['\'session/title\': SessionTitleEventData(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: '事件名或载荷变了：标题投影断流，get() 永远返回旧值或 undefined' },
  { id: 'A14', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['\\n  readonly maxTitleBytes: number(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    region: ['export interface Config \\{', '\\n\\}'],
    means: '公开 Config 失去 maxTitleBytes：超长标题不再被服务端拒绝，README 与工具描述的长度承诺落空' },
  { id: 'A15', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['export class SessionTitleInvalidError extends Error(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: '错误类消失：空标题与其它 rename 失败不再能按类型区分（插件目前原样透传 message，影响在报文的可解释性与 README 承诺）' },
  { id: 'A16', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['super\\(ctx, \'workspaceRegistry\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)'], ['plugins/session-mailbox/index.js', 'ctx\\.workspaceRegistry\\.archivedSessionIds']],
    means: 'workspaceRegistry 服务消失（还是 inject 的必填项）：插件整个 apply 失败，六个工具全没了' },
  { id: 'A17', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['async create\\(path: string, title\\?: string\\): Promise<Workspace>(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.create\\(path\\)']],
    means: 'create 返回形状变了（例如 { workspace, created }）：entity.id 变成 undefined，随后的 registry.get(undefined) 让 create_session 报「workspace disappeared after the session was created」——是响的，但报文会把人引向错误方向' },
  { id: 'A18', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['get\\(id: WorkspaceId\\): Workspace \\| undefined(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)\\.get\\(entity\\.id\\)']],
    means: 'get 变了：create_session 的「会话已入账」闸门失效，可能报告成功却没挂上' },
  { id: 'A19', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['list\\(\\): Workspace\\[\\](?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)\\.list\\(\\)']],
    means: 'list 变异步：list_workspaces 与 create_session 的默认工作区选择直接崩（.map 在 Promise 上）' },
  { id: 'A20', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['get archivedSessionIds\\(\\): readonly SessionId\\[\\](?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.workspaceRegistry\\.archivedSessionIds']],
    means: 'archivedSessionIds 消失：归档闸读不到集合，list_sessions 会把归档会话列成可投递，投递也失去拒绝依据' },
  { id: 'A21', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['archiveSession\\(sessionId: SessionId, options: ArchiveSessionOptions = \\{\\}\\): Promise<void>(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'throw new WorkspaceActiveSessionError\\(sessionId, activity\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.archiveSession\\(']],
    means: 'archiveSession 的返回类型变了、或「运行中拒绝归档」的那个 throw 消失：archive_sessions 只看有没有抛错，会把「运行中被拒、实际没归档」报成 archived' },
  { id: 'A22', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['delete\\(id: WorkspaceId\\): Promise<boolean>(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.delete\\(id\\)']],
    means: 'delete 不再返回 boolean（改成 void）：delete_workspaces 把每次成功都报成 skipped' },
  { id: 'A23', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/index.ts',
    patterns: ['super\\(ctx, \'subagents\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'subagents\'\\)']],
    means: 'subagents 服务消失：create_session 拒绝一切调用（判为无法验证调用方身份）' },
  { id: 'A24', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/index.ts',
    patterns: ['rootOf\\(caller: Agent\\): Agent(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'subagents\\.rootOf\\(exec\\.agent\\)']],
    means: 'rootOf 签名变了：create_session 的 subagent 闸门直接取不到判定函数' },
  { id: 'A25', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/schema.ts',
    patterns: ['export function defineTool<'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)'], ['plugins/user-model/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 的源码声明消失：两个插件的全部工具都注册不上（A44 另锁运行时那一份）' },
  { id: 'A26', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['export \\* from \'./schema.ts\'\\r?\\n'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 不再出现在包根的 src 汇总里（源码层的重导出约定变了；运行时那一份由 A44 锁）' },
  { id: 'A27', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['register\\(definition: ToolDefinition, options: ToolRegistrationOptions = \\{\\}\\): \\(\\) => void(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.tools\\.register\\('], ['plugins/user-model/index.js', 'ctx\\.tools\\.register\\(']],
    means: 'tools.register 签名变了：工具静默不注册，症状是「插件加载成功但一个工具都没有」' },
  { id: 'A28', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['export function createUserMessage<'],
    sites: [['plugins/session-mailbox/index.js', 'createUserMessage\\(']],
    means: 'createUserMessage 的源码声明消失：send_session_message 造不出 user 消息' },
  { id: 'A29', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/index.ts',
    patterns: ['export \\* from \'./message.ts\'\\r?\\n'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: 'createUserMessage 不再出现在包根的 src 汇总里（运行时那一份由 A45 锁）' },
  { id: 'A30', pkg: '@deepseek-ai/dsh',
    entry: 'node_modules/@deepseek-ai/dsh/src/profile-boot.ts',
    patterns: ['provide\\(\'profileContext\'(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor'], ['plugins/user-model/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor']],
    means: 'profileContext 不再挂上 Context：两个插件的 createRequire 锚点两条路都断，apply 直接抛错' },
  { id: 'A31', pkg: '@deepseek-ai/dsh-app-boot',
    entry: 'node_modules/@deepseek-ai/dsh-app-boot/src/profile-context.ts',
    patterns: ['\\n  readonly installAnchor: string(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor'], ['plugins/user-model/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor']],
    region: ['export interface ProfileContext \\{', '\\n\\}'],
    means: 'installAnchor 字段改名：同上，两个插件起不来' },
  { id: 'A32', pkg: '@deepseek-ai/dsh-session',
    entry: 'node_modules/@deepseek-ai/dsh-session/src/types.ts',
    patterns: ['\\n  readonly id: SessionId(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly createdAt: number(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly cwd\\?: string(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly origin\\?: \'subagent\'(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly delegationDepth\\?: number(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.cwd'], ['plugins/session-mailbox/index.js', 'origin !== \'subagent\''], ['plugins/session-mailbox/index.js', 'session\\.header\\.origin === \'subagent\''], ['plugins/session-mailbox/lib/create.js', 'header\\.delegationDepth']],
    region: ['export interface SessionHeader \\{', '\\n\\}'],
    means: 'SessionHeader 字段改名、换类型或搬进嵌套对象：别名表、排序、cwd 列、delegationDepth 守卫与「顶层会话」判定全错（子代理会被当成顶层）' },
  { id: 'A33', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts',
    patterns: ['event\\.data\\.source\\.kind !== \'user\'(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: '聊天投影的非 user 分叉变了：relay 消息可能不再折叠成上下文行，甚至从对话里消失' },
  { id: 'A34', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['getContextOrder\\(name: PromptContextOrderName\\): number(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'context\\(context: PromptContext\\): \\(\\) => void(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'SUBAGENT_DELEGATION: 120,(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\('], ['plugins/user-model/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    means: 'systemPrompt.context 或 getContextOrder 变了：两段提示词挂不上，工具在模型侧完全没有说明' },
  { id: 'A35', pkg: '@deepseek-ai/schemastery',
    entry: 'node_modules/@deepseek-ai/schemastery/src/index.ts',
    patterns: ['export default Schema(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'natural\\(\\): Schema<number>(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'from \'@deepseek-ai/schemastery\''], ['plugins/user-model/index.js', 'from \'@deepseek-ai/schemastery\'']],
    means: 'schemastery 默认导出或 z.natural 变了：两个插件的 Config 解析失败，apply 之前就崩' },
  { id: 'A36', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['super\\(ctx, \'tools\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'inject = \\[\'tools\''], ['plugins/user-model/index.js', 'inject = \\[\'tools\'']],
    means: 'tools 服务键改名：插件 inject 的 tools 缺失，加载器静默跳过，十个工具一个都不在' },
  { id: 'A37', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['super\\(ctx, \'systemPrompt\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\('], ['plugins/user-model/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    means: 'systemPrompt 服务键改名：同上，提示词与工具注册一起消失' },
  { id: 'A38', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['\\n    readonly session: Session(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n    readonly status: AgentStatus(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'pure\\.pageStatus\\(a\\.status\\)']],
    region: ['interface Agent \\{', '\\n  \\}'],
    means: 'Agent 的 session / status 字段改名或搬进嵌套对象：list_sessions 的 id/cwd/createdAt 与 running/inactive 全塌，投递原语判错' },
  { id: 'A39', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/types.ts',
    patterns: ['\\n  readonly path: string(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly title: string(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly sessionIds: readonly SessionId\\[\\](?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'title: String\\(w\\.title\\)'], ['plugins/session-mailbox/index.js', 'workspacePath: String\\(entity\\.path\\)']],
    region: ['export interface Workspace \\{', '\\n\\}'],
    means: 'Workspace 实体字段改名：list_workspaces 打出 "undefined | undefined"，create_session 的默认工作区选择与 created 判定失去依据' },
  { id: 'A40', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['\\n  readonly workspaceId\\?: WorkspaceId(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(']],
    region: ['export interface SessionCreateRequest \\{', '\\n\\}'],
    means: 'SessionCreateRequest.workspaceId 改名：create_session 传的 { workspaceId } 被忽略，会话落到默认位置或创建失败' },
  { id: 'A41', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['\\n  readonly requestId: SessionRequestId(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly mode: \'queue\' \\| \'steer\'(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly content: readonly PromptContentPart\\[\\](?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'await controller\\.prompt\\(']],
    region: ['export interface SessionPromptRequest \\{', '\\n\\}'],
    means: 'SessionPromptRequest 的 requestId / mode / content 改名：幂等键、排队语义或首条消息载荷失效' },
  { id: 'A42', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/types.ts',
    patterns: ['\\n  readonly title: string(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    region: ['export interface SessionTitleEventData \\{', '\\n\\}'],
    means: '标题事件载荷的 title 字段改名：titleOf 恒为 undefined，列表全变 (untitled)，rename 回显退回入参' },
  { id: 'A43', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/agent.ts',
    patterns: ['\\{ readonly agent: Agent \\}(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\{ readonly error: ApiSessionAgentError \\}(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'resolved\\?\\.agent']],
    means: 'resolveAgent 的返回联合形状变了：rename_session 读不到 resolved.agent，每次改名都报「could not be loaded」' },
  { id: 'A44', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/lib/index.js',
    patterns: ['function defineTool\\([^)]{0,40}\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'export \\{[^}]*defineTool[^}]*\\}(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)'], ['plugins/user-model/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: '运行时（lib）不再导出 defineTool：hostRequire 解构出 undefined，apply 阶段抛 TypeError（这一条锁的是真正被执行的那份）' },
  { id: 'A45', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/lib/index.js',
    patterns: ['function createUserMessage\\([a-z]+\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'export \\{[^}]*createUserMessage[^}]*\\}(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: '运行时（lib）不再导出 createUserMessage：send_session_message 造不出 user 消息' },
  { id: 'A46', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['form: \'relay\'(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: '上下文来源不再接受 relay 表单：中继消息要么构造失败，要么退化成本插件的普通上下文行' },
  { id: 'A47', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/commands.ts',
    patterns: ['\'session/workspace-attach-failed\'(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', '\'session/workspace-attach-failed\'']],
    means: 'attach 失败的稳定错误码改名（两个 throw 点一起改才会红）：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现' },
  { id: 'A48', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/types.ts',
    patterns: ['\\n  readonly id: SessionId(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'id: String\\(a\\.id\\)']],
    region: ['export interface Agent \\{', '\\n\\}'],
    means: 'Agent.id 消失：别名表、self 判定、messageSource 的发送者 id 全部变成字符串 "undefined"，投递指向错误会话' },
  { id: 'A49', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['\\n    agent\\?: Agent(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'text: \\(\\{ agent \\}\\)']],
    region: ['interface AssembleContext \\{', '\\n  \\}'],
    means: 'AssembleContext 不再带 agent：systemPrompt 的 text 回调用到 undefined，MAILBOX_PROMPT 静默变空串（模型再也不知道这些工具怎么用）' },
  { id: 'A50', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/chat/ContextBody.tsx',
    patterns: ['function relaySender\\(source: unknown\\): string \\| null(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'asRecord\\(source\\)\\?\\.\\[\'senderSessionId\'\\](?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'case \'relay\':(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'senderSessionId: String\\(senderId\\)']],
    means: 'relay 行不再读 senderSessionId：中继消息退化成 opaque 上下文行，「来自会话 <id>」那行消失' },
  { id: 'A51', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/event-projection.ts',
    patterns: ['KNOWN_FORMS: readonly KnownContextForm\\[\\] = \\[(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\'instructions\', \'catalog\', \'snapshot\', \'notice\', \'relay\', \'recall\'(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: 'KNOWN_FORMS 不再包含 relay：整条上下文事件的 form 判定失败，消息在聊天里被丢弃' },
  { id: 'A52', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/contracts.ts',
    patterns: ['\\n  readonly agent\\?: Agent(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)', '\\n  readonly signal: AbortSignal(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'exec\\.signal']],
    region: ['export interface ToolExecutionInput \\{', '\\n\\}'],
    means: 'ToolExecutionInput 的 agent / signal 改名：exec.signal 丢失后首条消息不再随工具取消而中止（静默），exec.agent 丢失后 list_sessions 会把调用者自己列进去' },
  { id: 'A53', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/manager.ts',
    patterns: ['rootOf\\(caller: Agent\\): Agent \\{(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'throw new SubagentError\\(\'subagent tree access requires the exact live caller\', \'UNAUTHORIZED\'\\)(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'return activation\\.root(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'return caller(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'subagents\\.rootOf\\(exec\\.agent\\)']],
    means: 'rootOf 的实现语义变了（签名不变）：create_session 的 subagent 闸门方向可能整体反转（全拒 → 全放），而签名断言看不见' },
  { id: 'A54', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/types.ts',
    patterns: ['export interface SessionTitleSnapshot extends SessionTitleEventData \\{(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: 'Snapshot 不再继承事件载荷：title 从快照上消失，titleOf 恒 undefined，列表全变 (untitled)、rename 回显退回入参（零报错）' },
  { id: 'A56', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['\\n  readonly stopActivity\\?: boolean(?:\\r?\\n|\\s*\\{|\\s*[,;]|$)'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.archiveSession\\(']],
    region: ['export interface ArchiveSessionOptions \\{', '\\n\\}'],
    means: 'ArchiveSessionOptions.stopActivity 改名或被搬走：archive_sessions 的 stop 选项静默失效，运行中的会话被拒并报成 failed' },
  { id: 'A55', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['\'session/workspace-attach-failed\': \\{ readonly sessionId: SessionId(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'error\\?\\.details\\?\\.sessionId']],
    means: 'attach 失败的 details.sessionId 改名：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现（用户重试可能造出重复会话）' },
  { id: 'A57', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/commands.ts',
    patterns: ['\\{ sessionId, workspaceId: workspace\\.id \\}(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'error\\?\\.details\\?\\.sessionId']],
    means: 'attach 失败时构造的 details 形状变了（声明还在但值不再带 sessionId）：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现（用户重试可能造出重复会话）' },
  { id: 'A58', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/schema.ts',
    patterns: ['\\n  readonly name: string(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly description: string(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly output: \\{(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'name: \'list_sessions\'']],
    region: ['export interface DefineToolOptions<S extends ParameterSchemaSpec, O extends ValueSchemaSpec> \\{', '\\n\\}'],
    means: 'DefineToolOptions 的字段改名：工具仍注册成功，但模型拿到的 schema 没有描述/没有 output 声明（工具成了无说明函数），零报错' },
  { id: 'A59', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['\\n  readonly id: MessageId(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly content: readonly ContentBlock\\[\\](?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly source: MessageSource(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'createUserMessage\\(']],
    region: ['interface MessageBase \\{', '\\n\\}'],
    means: 'UserMessage 的 content/source 字段改名：createUserMessage 是盲透传，畸形消息照常投递，坏在接收方（模型收到空的中继消息）' },
  { id: 'A60', pkg: '@deepseek-ai/dsh-typert-protocol',
    entry: 'node_modules/@deepseek-ai/dsh-typert-protocol/src/remote-error.ts',
    patterns: ['readonly code: Code,(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', 'readonly details: RemoteErrorDetailsMap\\[Code\\],(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'error\\?\\.details\\?\\.sessionId']],
    means: 'RemoteError 的 details 属性改名：attach 失败的报文退回笼统的 create failed，已建好的会话 id 不再浮现（零报错）' },
  { id: 'A61', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['\\n  readonly name: string(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly order: number(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly text: string \\|(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly interpolate\\?: boolean(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))', '\\n  readonly required\\?: boolean(?=\\s*(?:\\r?\\n|//|/\\*|[,;:(){}[\\]]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    region: ['export interface PromptContext \\{', '\\n\\}'],
    means: 'PromptContext 的字段改名：两段提示词要么挂不上、要么在可选运行时上下文被关掉时静默消失（工具照常注册，模型不知道该怎么用）' },
]
```

### S3 判定与输出

**每行的判定顺序**：① 解析该行全部 `sites`；任一 site 的文件不存在或其正则在文件里匹配不到 → 该行状态为 `STALE`，**不再往下判**。② 读条目：`missing` → `entry-missing`；`error` → 中止整次运行。③ 条目内容去掉空白后为空（`bytes === 0` 或只剩 `\n`/BOM/空格）→ `pattern-miss`（`missing` 列全部 pattern，`lines` 写 `匹配面：整个条目，<bytes> 字节（条目存在但为空）`），**不再取窗口**：文件是空的，谈不上「锚被改名」。④ 取窗口：`region` 报错 → `region-mismatch`。⑤ 判 `patterns`：全中 → PASS，否则 `pattern-miss`。一行只能处于一种状态。

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
  missing : \n  readonly cwd\?: string + \n  readonly origin\?: 'subagent'
  depends : plugins/session-mailbox/index.js:51  const topLevel = () => ctx.agents.list().filter((a) => a.session.header.origin !== 'subagent') | plugins/session-mailbox/lib/create.js:15  if (typeof header.delegationDepth === 'number' && header.delegationDepth > 0) return 'subagent'
  means   : SessionHeader 字段改名、换类型或搬进嵌套对象：别名表、排序、cwd 列、delegationDepth 守卫与「顶层会话」判定全错（子代理会被当成顶层）
  lines   : 断言 5 条，命中 3 条（匹配面：export interface SessionHeader \{，1857 字节）
```

- `missing` 按**源码里的原文**打印 pattern（保留 `\(` / `\?` / `\|` 这些反斜杠），多个用 ` + ` 分隔。`missing` / `site` / `region` 三类输出都写原始正则，不去转义——否则「原文」这个词在三条规则里含义不一致。
- `depends` 里每个 site 用 ` | ` 分隔，每段是 `文件:行号  两空格  命中的那一行（trim）`；一个 site 命中多行时打印前 3 个命中行号与首行文本，末尾加 `(+N more)`。
- `lines` 写匹配面：有 `region` 时写 `匹配面：<起锚>，<字节数> 字节`；无 `region` 时写 `匹配面：整个条目，<字节数> 字节`；**内容为空**（去空白后为空，不论 `bytes` 是 0 还是只含 BOM/空白）时一律写 `匹配面：整个条目，<bytes> 字节（条目存在但为空）`。

**`region-mismatch`（1 行标题 + 3 行内容）**：`region:` 那一行按 §4 S2 规则 1/2/3b 的四种失败之一逐字写：`起锚匹配 0 次（要求恰好 1 次）: <起锚>`、`起锚匹配 <N> 次（要求恰好 1 次）: <起锚>`、`止锚在起锚之后找不到: <止锚>`、`块尾之后还有声明头: <那一行的前 40 字>`。

```
FAIL A32  @deepseek-ai/dsh-session  node_modules/@deepseek-ai/dsh-session/src/types.ts
  region  : 起锚匹配 0 次（要求恰好 1 次）: export interface SessionHeader \{
  depends : plugins/session-mailbox/index.js:51  const topLevel = () => …
  means   : 断言的锚不见了：要么这个声明被改名/合并，要么它搬去了别的文件；先看 DSH 到底把这批字段放哪了
```

锚错误**不得**退回整条目匹配，且计入 FAIL（`p + f + s = 61`）。

**`STALE`（1 行标题 + 2 行内容）**：

```
STALE A02  @deepseek-ai/dsh-agent  node_modules/@deepseek-ai/dsh-agent/src/index.ts
  site    : plugins/session-mailbox/index.js  /ctx\.agents\.get\(/  匹配不到
  means   : 断言表里这条的依赖点已过期；先修 sites 再谈 DSH
```

**总评（最后一行，永远打印）**：`compat: <p> PASS / <f> FAIL / <s> STALE（61 条断言，dsh <name> <version>）— <判定>`，且 `p + f + s` 必须等于 61。判定五种，按顺序取第一条成立者：

1. `f === 0 && s === 0` → `全部依赖接口仍在，可以升级`
2. `f === 0 && s > 0` → `哨兵的依赖表过期了：先按上面的 STALE 行修 sites，再谈 DSH`
3. 所有 FAIL 行都属于「条目不存在或内容为空」（即 `f === 无法判定行数`）→ 判定改成 `哨兵无法判定：<N> 行条目不存在或为空，不说明接口变了，也不说明插件会坏`；若此时 `s > 0`，在其后追加 `（另有 <s> 行 STALE：依赖表已过期，先修 sites）`
4. 有 FAIL，且其中有一部分是「条目不存在或内容为空」、另一部分是真不命中 → 先插一段 `（其中 <N> 行无法判定：条目不存在或为空）`，再接 `有接口变了：先别升级 DSH，按上面的 FAIL 行改插件或改断言`；若 `s > 0`，同样追加 `（另有 <s> 行 STALE）`
5. 其余 → `有接口变了：先别升级 DSH，按上面的 FAIL 行改插件或改断言`；若 `s > 0`，在其后追加 `（另有 <s> 行 STALE）`

### S4 退出码

| 码 | 含义 |
|---|---|
| 0 | 61 条全 PASS，无 STALE |
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
  } catch {
    throw new Error('cannot verify the archived state of ' + id + '; refusing to deliver')
  }
  if (!Array.isArray(archived)) throw new Error('cannot verify the archived state of ' + id + '; refusing to deliver')
  if (archived.includes(target.id)) {
    throw new Error('target session is archived; unarchive it before messaging')
  }
  return target
}
```

`send_session_message` 里把「取 agent → 拒子代理 → 读归档集合 → 拒归档」那一段换成 `const target = liveOrThrow(entry.id)`，其余顺序不变：`statusBefore` 与 `primitive` 仍在投递前读。定位用符号（`const target = ctx.agents.get(` … `target session is archived`），不按行号。

### S7 文档、版本、交付

**A 部分（Step 5 做）**

- `AGENTS.md` 的「改完必须做的验证」代码块之后加一行（`默认` 位置；放这里因为升 DSH 和 `git pull` 之后都会看这一段）：
  `升级 DSH 或 pull 本仓库后：node scripts/compat-check.mjs（读 app.asar 断言宿主接口；非 0 退出＝先别升级，见 FAIL 行指到的插件位置）。`
- 提交：`git add scripts/compat-check.mjs AGENTS.md plans/compat-sentinel` → message `scripts: add a compat sentinel that asserts the host plugin API from app.asar` → `git push`。

**B 部分（Step 8 做，顺序不可换）**

- `plugins/session-mailbox/package.json` 的 `version`：`0.8.1` → `0.8.2`（纯重构，AGENTS.md 的 patch 规则）。
- README 不改：两处收敛不改变任何对外行为与文案。
- 提交：`git add plugins/session-mailbox/index.js plugins/session-mailbox/package.json` → message `session-mailbox: dedupe target resolution and liveness checks`。
- **先跑 §6 第 17 行**（复跑哨兵）；红了就停在这里，不打 tag、不 push。
- 绿了才 `git tag dsh-session-mailbox/v0.8.2` → `git push` → `git push origin dsh-session-mailbox/v0.8.2`。
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
10. 不得把 `region` 做成块解析器或括号匹配器；取窗只能是 §4 S2 的四条规则（Decision 8）。
11. 不得让 `region` 锚错误退回整条目匹配（那会把 `region` 变成一句空话，Decision 8）。
12. 不得把「改了会当场抛错」的**新依赖点**新开成一行（§4 S2 的进表条件，Decision 9）；已有行、以及往已有行里补 pattern，不受此限。
13. 不得提交 `.tmp-*.ts`、`.tmp-*.txt` 或 `plans/mailbox-wake/`（另一个会话的产物）。
14. 不得用 `rm` / `del` / `Remove-Item`；要删就移入回收站。
15. 不得改 profile 配置，不装/卸载插件，不重启 Host。

## 6. 验收表

| # | 配方（操作序列） | 期望退出码 | 期望输出消息集合 |
|---|---|---|---|
| 1 | `node scripts/compat-check.mjs *> $env:TEMP\compat.txt; $LASTEXITCODE` | 0 | 首行匹配 `^asar: .*app\.asar  dsh \S+ \S+$`；`(Select-String -Path $env:TEMP\compat.txt -Pattern '^PASS A\d\d ').Count` 为 61；末行匹配 `^compat: 61 PASS / 0 FAIL / 0 STALE（61 条断言，dsh .+）— 全部依赖接口仍在，可以升级$` |
| 2 | 把 A05 的第一个 pattern 临时改成 `followupXX\(message: UserMessage\): void`；跑脚本；再跑 `(Select-String -Path plugins\session-mailbox\index.js -Pattern 'target\.followup\(message\)').LineNumber` | 1 / 0 | 有且只有 1 行以 `^FAIL A05 ` 开头；该块含 `missing : followupXX\(message: UserMessage\): void`（原文，带反斜杠）、`depends : plugins/session-mailbox/index.js:<L>`、`means   :`；**`<L>` 必须等于第二条命令打印的行号**；末行 `^compat: 60 PASS / 1 FAIL / 0 STALE` |
| 3 | 还原第 2 行；把 A05 的第二个 site 临时改成 `target\.steerERR\(message\)`；跑脚本 | 1 | 有且只有 1 段以 `^STALE A05 ` 开头；含 `site    : plugins/session-mailbox/index.js  /target\.steerERR\(message\)/  匹配不到`；末行匹配 `^compat: 60 PASS / 0 FAIL / 1 STALE（61 条断言.*）— 哨兵的依赖表过期了：先按上面的 STALE 行修 sites，再谈 DSH$` |
| 4 | 还原第 3 行；把 A05 的第一个 pattern 与第二个 site **同时**改坏；跑脚本 | 1 | 有且只有 1 段以 `^STALE A05 ` 开头，且**没有** `^FAIL A05 `；末行 `^compat: 60 PASS / 0 FAIL / 1 STALE`（STALE 优先） |
| 5 | 还原第 4 行；把 A32 的 `region` 起锚临时改成 `export interface SessionHeaderXXX \{`；跑脚本 | 1 | 有且只有 1 段以 `^FAIL A32 ` 开头，且含 `region  : 起锚匹配 0 次（要求恰好 1 次）`；不含 `missing :`（锚错误不退回整条目匹配）；末行 `^compat: 60 PASS / 1 FAIL / 0 STALE` |
| 6 | 还原第 5 行；造 0 字节条目 fixture：`node -e "const fs=require('fs');const j=Buffer.from(JSON.stringify({files:{node_modules:{files:{'@deepseek-ai':{files:{'dsh-agent':{files:{src:{files:{'index.ts':{size:0,offset:'0'}}}}}}}}}}}));const h=Buffer.alloc(16);h.writeUInt32LE(4,0);h.writeUInt32LE(j.length+8,4);h.writeUInt32LE(j.length+8,8);h.writeUInt32LE(j.length,12);fs.writeFileSync(process.env.TEMP+'/zero-entry.asar',Buffer.concat([h,j]))"`；`node scripts/compat-check.mjs --asar "$env:TEMP\zero-entry.asar"; $LASTEXITCODE` | 1 | 首行 `asar: <…>\zero-entry.asar  dsh <unknown>`；`(Select-String -Pattern '（条目存在但为空）').Count` 为 3（A01、A02、A03 共用同一个 entry）；`(Select-String -Pattern 'entry missing').Count` 为 58；末行含 `compat: 0 PASS / 61 FAIL` 与 `哨兵无法判定：61 行条目不存在或为空` |
| 7 | `New-Item -ItemType Directory -Force "$env:TEMP\dir-not-file"`；`node scripts/compat-check.mjs --asar "$env:TEMP\dir-not-file"; $LASTEXITCODE` | 2 | 含 `compat: asar path is not a file`；`(Select-String -Pattern '^PASS ').Count` 为 0 |
| 8 | `node scripts/compat-check.mjs --asar "$env:TEMP\nope.asar"; $LASTEXITCODE` | 2 | 含 `compat: cannot locate app.asar` 与 `--asar`；`(Select-String -Pattern '^PASS ').Count` 为 0 |
| 9 | `Set-Content -Path "$env:TEMP\bad.asar" -Value 'not an asar'`；`node scripts/compat-check.mjs --asar "$env:TEMP\bad.asar"; $LASTEXITCODE` | 2 | 含 `compat: asar unreadable —`；**不含** `entry missing`、**不含** `compat: 0 PASS` |
| 10 | 空 asar：`node -e "const fs=require('fs');const j=Buffer.from(JSON.stringify({files:{}}));const h=Buffer.alloc(16);h.writeUInt32LE(4,0);h.writeUInt32LE(j.length+8,4);h.writeUInt32LE(j.length+8,8);h.writeUInt32LE(j.length,12);fs.writeFileSync(process.env.TEMP+'/empty-asar.asar',Buffer.concat([h,j]))"`；`node scripts/compat-check.mjs --asar "$env:TEMP\empty-asar.asar"; $LASTEXITCODE` | 1 | 61 行 `^FAIL A\d\d `，每行含 `entry missing`；末行含 `compat: 0 PASS / 61 FAIL` 与 `哨兵无法判定：61 行条目不存在或为空` |
| 11 | `$env:DSH_INSTALL_DIR = $null; node scripts/compat-check.mjs; $LASTEXITCODE` | 0 | 首行仍是 `asar: <与第 1 行同一路径>`；末行 `^compat: 61 PASS / 0 FAIL / 0 STALE` |
| 12 | `node --check scripts/compat-check.mjs; $LASTEXITCODE`；`(Select-String -Path scripts/compat-check.mjs -Pattern 'asar\.mjs').Count`；`(Select-String -Path scripts/compat-check.mjs -Pattern 'openSync|readSync|readUInt32LE').Count` | 0 ×3 | 无输出；`≥ 1`；`0` |
| 13 | `node --test plugins/session-mailbox/test/*.test.mjs *> $env:TEMP\mb.txt; $LASTEXITCODE`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'found\.reason ===').Count`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'pure\.resolveTarget\(').Count`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'liveOrThrow\(').Count` | 0 ×4 | 测试含 `ℹ fail 0` 且 `ℹ tests` 等于 Step 0 记下的 N；`4`（改前 8）；`1`（改前 2）；`1` |
| 14 | 九条文案各查一次 `(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern "'<文案>'").Count`（**带引号**，这样「文案被加长」也会变 0）：`'agent must not be empty'`、`'cannot send to yourself'`、`'cannot rename yourself; ask your peer, or the user'`、`'no live top-level session matches "'`、`'no top-level session matches "'`、`'target session is archived; unarchive it before messaging'`、`'send_session_message addresses top-level sessions only'`、`'unexpected resolve verdict: '`；第 9 项用模板串前缀，查 `(Select-String -Pattern 'ambiguous session "').Count` | 0 ×9 | 九项**各为 2、1、1、1、1、1、1、1、2**（第 1 项与第 9 项各 2 处，因为 §4 S5 要求两处各写一遍、不得提成共享常量；其余七项在收敛后各剩 1 处）。任何一项是 0 → 文案丢了；任何一项比预期多 → 有人把文案复制到了别处 |
| 15 | `(Select-String -Path plugins/session-mailbox/index.js -Pattern 'ctx\.workspaceRegistry\.archivedSessionIds').Count`；`(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'is no longer live in this process').Count`；`(Select-String -Path plugins/session-mailbox/index.js -Pattern 'Array\.isArray\(archived\)').Count`；`(Select-String -Path plugins/session-mailbox/index.js -SimpleMatch -Pattern 'cannot verify the archived state of').Count` | 0 ×4 | `2`（`liveRows()` 一处、`liveOrThrow()` 一处）；`1`；`2`（`liveOrThrow()` 的两条分支各一句——两分支同文案之后，这条计数是唯一能证明「非数组」那条没被删掉的验收项） |
| 16 | `(Select-String -Path AGENTS.md -SimpleMatch -Pattern 'scripts/compat-check.mjs').Count`；`(Get-Content plugins/session-mailbox/package.json \| ConvertFrom-Json).version`；`git log --oneline <commit-1-sha>..HEAD`；`git show --stat --oneline HEAD`；`git show --stat --oneline <commit-1-sha>`；`git status --short`；`git ls-remote --tags origin`；`git check-ignore -v <任一 .tmp- 路径>` | 0 ×6 | `≥ 1`；`0.8.2`；`<commit-1-sha>` 用 Step 5 记下的 commit 1 的 sha（钉 sha 而不是位置，因为本仓库有并发写入者）；`git log --oneline <commit-1-sha>..HEAD` 只有 commit 2 一行；`git show --stat --oneline HEAD` 只含 `plugins/session-mailbox/{index.js,package.json}`；`git show --stat --oneline <commit-1-sha>` 只含 `scripts/compat-check.mjs`、`AGENTS.md`、`plans/compat-sentinel/*`、`plugins/session-mailbox/{index.js,package.json}`；`git status --short` **不出现** `plans/compat-sentinel` 与 `plugins/session-mailbox`（`.tmp-*` 已被 `.gitignore` 忽略，本来就不会列出——本条只要求「将要提交的路径已经干净」，并要求 `check-ignore` 证明 `.tmp-*` 是被忽略而不是被提交）；含 `dsh-session-mailbox/v0.8.2` |
| 18 | 还原第 5 行；把 A32 的 `region` 块尾临时改成 `\n  }`（形态变了），再在 `SessionHeader` 之后插一个 `export interface SessionHeaderExtras { }`；跑脚本 | 1 | 有且只有 1 段以 `^FAIL A32 ` 开头，且含 `region  : 块尾之后还有声明头:`；不含 `missing :` |
| 17 | 单元 B 的 commit 之后、打 tag 之前**再跑一次**：`node scripts/compat-check.mjs *> $env:TEMP\compat2.txt; $LASTEXITCODE` | 0 | `(Select-String -Path $env:TEMP\compat2.txt -Pattern '^PASS A\d\d ').Count` 为 61；`(Select-String -Pattern '^(FAIL|STALE) ').Count` 为 0；末行 `^compat: 61 PASS / 0 FAIL / 0 STALE`（收敛改过插件代码之后，哨兵的依赖表仍然对得上） |

## 7. 何时停下问

- Step 0 解析出的 `$asar` 为空，或 `node scripts/asar.mjs list $asar 'dsh-agent/src/index\.ts'` 的 `matched` 为 0 → 停（要么 asar 路径不对，要么这个构建不附源码）。
- 任一断言在**当前**安装上不命中，而它看起来像真的行为变更（不是笔误）→ 停，把它写进交付报告，不要为了变绿去改断言。
- 把某个 pattern 写得更松就能过、而更松的写法会漏掉一种真实变更 → 停。
- 要让某条断言的 `region` 换成块解析、括号匹配，或要用 `m`/`s` 等 regex flag → 停。
- 要让 `region` 的起锚允许多次匹配 → 停（那会重新打开「同名块」的洞）。
- 两处收敛需要改 `pure.js`、改错误文案、改输出 schema，或需要第三个函数 → 停。
- 要让三个客户端插件进表、或要加第二个脚本文件 → 停（越权扩范围）。
- `git status` 显示将要提交的路径里出现 `.tmp-*`、`plans/mailbox-wake/` 或任何 profile 路径 → 停。
- §6 第 16 行因**第三方提交或别人的未提交改动**变红（本仓库有并发写入者）→ 不停：把别人的 commit sha / 改动路径写进交付报告，按 sha 复核本条的两个 commit，再继续。
- 需要 `rm`、需要改 profile、需要重启 Host → 停。

## 8. Blind Spot List

- **BS-1 断言读的是随包源码，运行时跑的是 `lib/*.js`**：A44/A45 只覆盖 `dsh-tools` 与 `dsh-llm` 两个包的运行时导出，其余包没有。回来条件——某次升级 `src` 未变而插件行为变了（或反过来）。
- **BS-2 这个构建可能不再随包附 `src`**：回来条件——首跑出现成片 `entry missing`；此时按总评追加段处理，不改断言。
- **BS-3 个别断言锁了常量值**（`SUBAGENT_DELEGATION: 120`）：回来条件——只因数值变了而红，就把该 pattern 改成只匹配键名。
- **BS-4 只回答「当前这台机器装的 DSH」**：回来条件——同一 commit 在两台机器上跑出不同结论。
- **BS-5 `dsh-client-ui-chat` 只存在于桌面/Web 安装**：回来条件——A33/A50/A51 在某台机器上常态红。
- **BS-6 文本匹配会命中注释**：回来条件——某个接口已在运行时消失、而源码注释里还留着它的名字，导致本该红的断言保持绿。
- **BS-7 三个纯客户端插件的宿主 UI 接口零覆盖**：回来条件——任一客户端插件出现「页面没反应但插件状态正常」的故障。
- **BS-8 多安装机器上按 `app.asar` 的 mtime 选最新**：回来条件——哨兵结论与插件实际行为相反。
- **BS-9 过紧的 pattern / 锚会在非破坏性重构上假红**：形参改名、给可选参数加默认值、把 `declare module` 的增补块折叠进真声明、把某个 interface 体整体重排缩进（12 条字段 pattern 依赖那 2/4 格缩进，一次格式化会一起红）、**块内出现一行恰好是列首 `}` 的注释或模板串**（会把 `region` 窗口截短成假红）、**两块尾形态互换**（`\n}` ↔ `\n  }`，会让窗口改锚或直接判 `region-mismatch`）、**声明被整体搬进 `declare module`**（块尾与缩进同时失配）。回来条件——出现一次「插件行为完全正常而哨兵红」的升级。
- **BS-10 61 条断言里只有 27 条有验收级反例**（A32 两条、A14 一条、A05/A21/A34/A38/A39/A41/A42/A48/A49/A52/A54/A55/A56/A57/A36/A44 各一条，外加 A01/A02/A03 的三条 0 字节分支）：其余靠 `region` 与字段右边界的设计，没有逐条反例。§6 第 12 行的 `asar\.mjs` 计数只证明「这个字符串出现过」，是弱证据，靠第 1 行的全绿兜底。回来条件——出现一次「改了接口而某条断言没红」。
- **BS-11 进表条件（§4 S2）是判断题**：某个依赖点到底「静默降级」还是「当场抛错」需要人读代码；判错方向只是少一条/多一条断言。回来条件——某次失效既没进表、也没在任何工具调用上抛错。
- **BS-12 A53 只锁「整段替换」**：`rootOf` 的四个标记都在、但在前面加一条早退（`if (adopted !== undefined) return adopted`）仍然全绿——文本匹配抓不到新增分支。回来条件——`rootOf` 的判定方向在真机上反转而哨兵全绿。
