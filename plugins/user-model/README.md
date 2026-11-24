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
| `user_model_append` | stage an entry in `entries/.pending/`, returns its `id` |
| `user_model_approve` | move it to `entries/`, stamp the approval, commit and push |

A staged entry is **not** searchable. That is the point: the read side only ever sees what the user agreed to keep.

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

## 页面（`um serve`）

`um serve` 起一个只绑 `127.0.0.1` 的小服务器，浏览器打开就是库的完整视图：左侧列出待批准 / 已生效 / 已删除三组，右侧可以改标题和正文、批准、删除、恢复，下面显示这一条的 git 历史。零依赖，只用 `node:http`。

它不是 agent 的路径——三个工具直接调 `lib/store.mjs`——所以页面挂掉或没开，对 agent 没有任何影响。

写侧的三道门，都是因为这东西**能写**：

- 只监听回环；`Host` 头不是本端口的请求直接 421，那是 DNS rebinding 的特征；
- `Origin` 存在时必须也是回环地址；
- `POST` 必须 `application/json`，别的来源的表单因此连简单请求都发不出来，而这里没有任何 CORS 头。

## 删除是怎么实现的

`retire` **不硬删**。文件从 `entries/` 移到 `entries/.retired/`，提交一次，`search` 不再读它——对使用者（人和 agent）的效果就是「这条不存在了」。留下文件有两个理由：删掉一条也是个决定，值得留在历史里；以及点错了还能 `restore` 回来。

`.retired/` 和 `.pending/` 一样，是 `entries/` 里被当作**状态**而不是条目的子目录：`search` 跳过，`check` 进去检查。

改内容（`edit`）只重写标题和正文，front matter 原样保留，所以日期、kind、批准人和批准时间都不会因为一次编辑而改变。旧内容在提交历史里。

`UM_HOME` overrides the library root **for the CLI only** — that is how the acceptance recipes run against a throwaway library. The plugin resolves `os.homedir()` and ignores `UM_HOME`, so an environment variable can never quietly point the live agent somewhere else.

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
