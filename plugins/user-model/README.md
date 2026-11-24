# dsh-user-model

Host plugin: an agent consults a private library of durable user facts and decisions before asking the user, and records new ones after the user says to.

Two parts, deliberately separated:

- **data** — `~/.agents/user-model`, a private git repository (`GavinMo1/user-model`). One file per entry, no index, no cache.
  The path is fixed: `pluginRoot()` resolves `os.homedir()` and never reads `UM_HOME`, so to keep the repository elsewhere
  (another drive, say) the **only** supported move is to put it back at that path — a directory junction works and is what
  this machine uses (`~/.agents/user-model` → `D:\project\user-model`). Do not repoint it by editing code.
- **this plugin** — three tools plus one prompt block. It also ships `bin/um.mjs`, the `um` CLI, for the human.

## Tools

| Tool | What it does |
|---|---|
| `user_model_search` | 1–3 content words → the newest ≤3 matching entries plus `# total:` |
| `user_model_append` | stage an entry in `entries/.pending/`, returns its `id` |
| `user_model_approve` | move it to `entries/`, stamp the approval, commit and push |

A staged entry is **not** searchable. That is the point: the read side only ever sees what the user agreed to keep.

## CLI

```powershell
node <plugin>/bin/um.mjs search 提交 中文
node <plugin>/bin/um.mjs append --slug commit-lang --kind decision --title 提交信息用中文 --body 团队都用中文
node <plugin>/bin/um.mjs approve 20261124-commit-lang --approved-by "user, 2026-11-24"
node <plugin>/bin/um.mjs status
node <plugin>/bin/um.mjs check
node <plugin>/bin/um.mjs sync
```

`UM_HOME` overrides the library root **for the CLI only** — that is how the acceptance recipes run against a throwaway library. The plugin resolves `os.homedir()` and ignores `UM_HOME`, so an environment variable can never quietly point the live agent somewhere else.

## Output contract

`# `-prefixed lines are metadata, everything else is data:

```
# library: ok | missing     ← not synced on this machine vs genuinely absent
# root: <absolute path>
# staged: <pending count>
<id> | <date> | <kind> | <title> | <body>
# total: <matching entries, not rows printed>
# skipped: <file name>      ← parse/validation failure; the read was incomplete
# no match
```

## Layout

```
index.js            three tools + prompt block
lib/um.mjs          pure: tokenize, parse, validate, rank, format
lib/store.mjs       fs + git; every function takes the library root
lib/paths.mjs       cliRoot() honours UM_HOME, pluginRoot() does not
bin/um.mjs          CLI
tests/um.test.mjs   node --test
```

## Tests

```powershell
node --test plugins/user-model/tests/um.test.mjs
```

## Notes

- Landing uses `fs.linkSync` (or `copyFileSync` with `COPYFILE_EXCL` on filesystems without hard links). `fs.renameSync` is never used: it overwrites an existing target silently.
- A failed commit or push does **not** roll the entry back — it stays readable locally and `um sync` retries.
- Ordering is `date` descending first: when two entries cover the same subject, the newer one wins, and that is a property of the sort rather than something the prompt has to remember.
