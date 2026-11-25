# dsh-user-model

Host plugin: an agent consults a private library of durable user facts and decisions before asking the user, and records new ones after the user says to.

Two parts, deliberately separated:

- **data** — `~/.agents/user-model`, a private git repository (`GavinMo1/user-model`). One file per entry, no index, no cache.
  The path is fixed: `pluginRoot()` resolves `os.homedir()` and never reads `UM_HOME`, so to keep the repository elsewhere
  (another drive, say) the **only** supported move is to put it back at that path — a directory junction works and is what
  this machine uses (`~/.agents/user-model` → `D:\project\user-model`). Do not repoint it by editing code.
- **this plugin** — three tools plus one prompt block. It also ships `bin/um.mjs`, the `um` CLI, and a local page (`um serve`) for the human.

## Tools

| Tool | What it does |
|---|---|
| `user_model_search` | 1–3 content words → the newest ≤3 matching entries plus `# total:` |
| `user_model_append` | record an entry: lands it, commits and pushes in one call |
| `user_model_approve` | leftovers only: move a staged entry to `entries/`, stamp it, commit and push |

`user_model_append` lands and pushes in one call, so an entry the agent records is searchable immediately — there is no chat-side approval step. The user reviews, edits and retires entries on the local page (`um serve`). The staging area still exists for the CLI (`um append` then `um approve`) and for anything a failed landing left behind.

## CLI

```powershell
node <plugin>/bin/um.mjs list
node <plugin>/bin/um.mjs show <id>
node <plugin>/bin/um.mjs search 提交 中文
node <plugin>/bin/um.mjs append --slug commit-lang --kind decision --title 提交信息用中文 --body 团队都用中文
node <plugin>/bin/um.mjs approve 20261124-commit-lang --approved-by "user, 2026-11-24"
node <plugin>/bin/um.mjs edit 20261124-commit-lang --title 新标题 --body 新正文
node <plugin>/bin/um.mjs retire 20261124-commit-lang --reason 记错了
node <plugin>/bin/um.mjs restore 20261124-commit-lang
node <plugin>/bin/um.mjs serve --port 7326
node <plugin>/bin/um.mjs status
node <plugin>/bin/um.mjs check
node <plugin>/bin/um.mjs sync
```

`UM_HOME` overrides the library root **for the CLI only** — that is how the acceptance recipes run against a throwaway library. The plugin resolves `os.homedir()` and ignores `UM_HOME`, so an environment variable can never quietly point the live agent somewhere else.

## 页面（`um serve`）

```powershell
node <plugin>/bin/um.mjs serve               # http://127.0.0.1:7326/
node <plugin>/bin/um.mjs serve --port 7400   # 端口被占用时换一个
```

浏览器打开就是库的完整视图：左侧按待批准 / 已生效 / 已删除分组列出，右侧改标题和正文、批准、删除、恢复，下面显示这一条的 git 历史。零依赖，只用 `node:http` 和 `node:fs`，新机器上不需要 `pnpm install`。

**它不是一个服务，是一个进程。** 没有开机自启，没有守护，关掉终端就没了，每次要用就起一次。监听地址写死在 `127.0.0.1`。

**它也不是插件功能。** `index.js` 完全不引用 `server.mjs` 和 `page.html`，插件装载时不会启动任何东西；agent 的三个工具直接调 `lib/store.mjs`，不经过 HTTP。所以页面没开、挂了、慢，对 agent 一点影响都没有——这是有意的，页面是给人看的旁路，接进 agent 的路径只会让它变成故障点。

**改了 `page.html` 要重启进程。** 它在 `server.mjs` 里是模块加载时 `readFileSync` 一次，不会自己重新读。

写侧的三道门，都是因为这东西**能写**：

- 只监听回环；`Host` 头不是本端口的请求直接 421，那是 DNS rebinding 的特征；
- `Origin` 存在时必须也是回环地址；
- `POST` 必须 `application/json`，别的来源的表单因此连简单请求都发不出来，而这里没有任何 CORS 头。

## 在新机器上用

两件事，缺一不可：拿代码，拿数据。

**1. 代码**（本仓库，公开）

```powershell
git clone https://github.com/GavinMo1/dsh-plugins.git C:\Users\<user>\Documents\dsh-plugins
# 然后按仓库根目录 README 的「新机器接线」把它 link 进 DSH profile
```

`um` 不需要安装：在任何工作目录下 `node <repo>\plugins\user-model\bin\um.mjs <命令>` 都能跑。库的位置由 `os.homedir()` 决定，与当前目录无关，所以不存在「在哪个目录下执行」的问题。

**2. 数据**（`GavinMo1/user-model`，私有，那边也得登录）

```powershell
git clone https://github.com/GavinMo1/user-model.git "$env:USERPROFILE\.agents\user-model"
```

**这个路径不能改。** `lib/paths.mjs` 的 `pluginRoot()` 是 `os.homedir()` 拼 `.agents/user-model`，故意不读环境变量——否则一个 `UM_HOME` 就能把线上 agent 悄悄指到假库上。想把仓库放在别的盘只能做 junction（这台机器就是这么干的：`~/.agents/user-model` → `D:\project\user-model`），别改代码。

**页面不能跨机器访问。** 它绑 `127.0.0.1` 并且 `Host` 也校验回环，所以只能在跑它的那台机器的浏览器里打开。要「在这台机器上看那台机器的库」，得给 `serve` 加 `--host 0.0.0.0` 并同时加一层口令——现在没有，因为那几个路由能批准也能删除，裸暴露到局域网不划算。

## 什么会同步，什么不会

| 位置 | 在 git 里 | 换机器后 |
|---|---|---|
| `entries/*.md`（已生效） | 是 | 有 |
| `entries/.retired/*.md`（已删除） | 是 | 有，页面和 `um restore` 都看得见 |
| `entries/.pending/*.md`（待批准） | **否，`.gitignore` 明确排除** | **没有** |

待批准条目只存在于暂存它的那台机器上。这是有意的取舍（没批准的草稿不该被当作库的一部分到处跑），代价是「暂存了但没批准就换机器」会丢。要搬就先 `approve`，或者手动把文件拷过去。

## 删除是怎么实现的

`retire` **不硬删**。文件从 `entries/` 移到 `entries/.retired/`，提交一次，`search` 不再读它——对使用者（人和 agent）的效果就是「这条不存在了」。留下文件有两个理由：删掉一条也是个决定，值得留在历史里；以及点错了还能 `restore` 回来。

`.retired/` 和 `.pending/` 一样，是 `entries/` 里被当作**状态**而不是条目的子目录：`search` 跳过，`check` 进去检查。

改内容（`edit`）只重写标题和正文，front matter 原样保留，所以日期、kind、批准人和批准时间都不会因为一次编辑而改变。旧内容在提交历史里。

## Output contract

`# `-prefixed lines are metadata, everything else is data:

```
# library: ok | missing     ← the library root exists vs has never been cloned here
# root: <absolute path>
# staged: <pending count>
<id> | <date> | <kind> | <title> | <body>
# total: <matching entries, not rows printed>
# skipped: <file name>      ← parse/validation failure; the read was incomplete
# no match
```

`library` keys off the library **root**, not `entries/`. A library that has been cloned and never written to has no `entries/` directory at all — git does not track empty directories — so keying it off `entries/` used to report such a library as `missing`, i.e. with the same answer as "this machine has no library". Those are different facts and now have different answers.

## Layout

```
index.js            three tools + prompt block
lib/um.mjs          pure: tokenize, parse, validate, rank, format
lib/store.mjs       fs + git; every function takes the library root
lib/server.mjs      loopback HTTP face over store.mjs
lib/page.html       the page, served as-is (no template step)
lib/paths.mjs       cliRoot() honours UM_HOME, pluginRoot() does not
bin/um.mjs          CLI
tests/um.test.mjs   node --test
```

## Tests

```powershell
node --test plugins/user-model/tests/um.test.mjs
```

## Notes

- Landing uses `fs.linkSync` (or `copyFileSync` with `COPYFILE_EXCL` on filesystems without hard links). `fs.renameSync` is never used for that: it overwrites an existing target silently.
  The one place `fs.renameSync` *is* used is `replaceText` (edit), where replacing a file that was just read and re-validated is the intent and atomicity is the point.
- `retire` and `restore` use `fs.renameSync` inside `entries/`, which is one volume, so the move is atomic; a half-moved entry cannot exist.
- A failed commit or push does **not** roll the entry back — it stays readable locally and `um sync` retries. `sync` groups the changed paths by entry id, because a retire shows up as a deletion plus an addition and passing only the old name makes `git add` fail on a pathspec that no longer exists.
- Ordering is `date` descending first: when two entries cover the same subject, the newer one wins, and that is a property of the sort rather than something the prompt has to remember.
- 维护待办（触发条件那个还没决定的问题、以及别的已知缺口）在仓库根目录的 `TODO.md`，不要只记在对话里。
