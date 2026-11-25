# TODO / 交接（其他插件）

user-model 的设计取舍与已经否决的方向都在 `design.md`，那份是给 user-model 的。这份只管**其他插件**的待办与已知缺口，每条都写证据和「改的话动哪里」。

---

## 1. 从本地 tgz 收回来的四个插件：还差什么（2026-11-25）

**背景**：这四个插件原本只存在于 `C:\Users\27017\dsh-local\plugins\dist\*.tgz`，各自的源码目录要么已不在、要么从来没有过，也没有 git 历史。2026-11-25 从 tgz 解出来收进 `plugins/`，一个插件一个 commit：`e1ee99d`（branch-switcher）、`334cacf`（input-history）、`4b40fcf`（message-editor）、`f93a5c5`（blank-draft-handoff）。

收回的东西和当时发出去的**完全一致**：解包目录与仓库目录逐文件比过 SHA256，只有 CRLF/LF 差异，已统一成 LF（仓库 `core.autocrlf=input`）。四个的 `index.js` 和 `client.js` 都过了 `node --check`。

| 目录 | 包名 | 版本 | 形态 |
| --- | --- | --- | --- |
| `plugins/dsh-branch-switcher` | `dsh-branch-switcher` | 1.1.0 | 纯 Client |
| `plugins/dsh-input-history` | `dsh-input-history` | 1.0.5 | 纯 Client |
| `plugins/dsh-message-editor` | `dsh-message-editor` | 1.4.1 | 纯 Client |
| `plugins/blank-draft-handoff` | `@local/dsh-blank-draft-handoff` | 1.0.1 | 纯 Client |

**还没做的**：

- **profile 的依赖仍然指向 `file:…/*.tgz`**，不是仓库里的 `link:`。`node scripts/link-plugins.mjs --dry-run` 已经把 4 条改写计划列出来了，`--apply` 还没跑——那一步会改 profile 的 `package.json` 并跑 `pnpm install`，之后要重启 DSH。
- **四个里只有一个本来有测试**（`dsh-branch-switcher` 的 `test/tree.test.mjs`，15 项纯函数测试），收进来时源码只剩打包产物，`test/` 没留下。另外三个本来就没有测试。这是这批插件目前最大的缺口：改 `client.js` 之后没有任何东西能告诉你哪里坏了，只能手动点。
- **`C:\Users\27017\dsh-local\plugins\dist\` 里那两份 `INSTALL.md` 已经过时**：它们详细写着 `dsh-globe-panel` 和 `dsh-claude-style` 的安装步骤，而那两套源码 2026-11-25 已删（进回收站）。留着当历史存档可以，但别再照着做。

---

## 2. `dsh-unrestricted` 要不要进仓库（未决定）

本地跑的是 `dsh-unrestricted@0.2.8`，装自 `file:…dist\dsh-unrestricted-0.2.8.tgz`，在 `cordis.patch.yml` 里 `enabled: true`。

**证据**（2026-11-25 查证）：

- `package.json` 里有 `repository: https://github.com/yexi-by/dsh-unrestricted.git`、`license: MIT`。
- GitHub API：`yexi-by/dsh-unrestricted` 存在，MIT，1380 stars，最新 tag 已到 **v0.2.15**（本地还停在 0.2.8）。
- npm 上没有这个包（404）。
- 把本地 tgz 里的 `src/rules.js` 和上游 tag `v0.2.8` 的同一文件比 SHA256：**完全一致**（`CF32063D…10101F`）。也就是说本地这份是上游原样构建，没有本地改动。

**所以这是一个第三方插件，不是自研**。MIT 允许再分发，但把它原样搬进自己的仓库等于替上游做镜像，还要负责跟上游对齐——所以就停在这里没动。

**待决策**，三个选项：

1. **不进仓库**（当前状态）。dist 里那个 tgz 留着继续用；想升级就自己去上游取新版本重新打包。代价是升级靠手动。
2. **进仓库当 vendored 副本**，保留 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`，README 第一行写清"这是 `yexi-by/dsh-unrestricted` 的构建副本，上游已到 v0.2.15"。代价是仓库里多一份要跟上游对齐的代码。
3. **删掉不用**。它在干的事是往系统提示里融破限规则，和本仓库其他插件不是一个范畴。

顺带一提：如果选 1 或 3，`dsh-local\plugins\dist\dsh-unrestricted-0.2.8.tgz` 就是唯一副本了，别和别的临时文件一起清掉。
