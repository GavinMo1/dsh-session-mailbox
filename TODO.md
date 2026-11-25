# TODO / 交接（其他插件）

user-model 的设计取舍与已经否决的方向都在 `design.md`，那份是给 user-model 的。这份只管**其他插件**的待办与已知缺口，每条都写证据和「改的话动哪里」。

---

## 1. 四个收回来的插件：还差什么（2026-11-25）

**背景**：这四个插件原本只存在于 `C:\Users\27017\dsh-local\plugins\dist\*.tgz`，各自的源码目录要么已不在、要么从来没有过，也没有 git 历史。2026-11-25 从 tgz 解出来收进 `plugins/`，一个插件一个 commit：`e1ee99d`（branch-switcher）、`334cacf`（input-history）、`4b40fcf`（message-editor）、`f93a5c5`（blank-draft-handoff）。

收回的东西和当时发出去的**完全一致**：解包目录与仓库目录逐文件比过 SHA256，只有 CRLF/LF 差异，已统一成 LF（仓库 `core.autocrlf=input`）。四个的 `index.js` 和 `client.js` 都过了 `node --check`。

| 目录 | 包名 | 版本 | 形态 |
| --- | --- | --- | --- |
| `plugins/dsh-branch-switcher` | `dsh-branch-switcher` | 1.1.0 | 纯 Client |
| `plugins/dsh-input-history` | `dsh-input-history` | 1.0.5 | 纯 Client |
| `plugins/dsh-message-editor` | `dsh-message-editor` | 1.4.1 | 纯 Client |
| `plugins/blank-draft-handoff` | `@local/dsh-blank-draft-handoff` | 1.0.1 | 纯 Client |

**已经做完的接线**（2026-11-25）：

- profile 已从 `file:…/*.tgz` 切到 `link:`，跑的是 `node scripts/link-plugins.mjs --apply`，`pnpm install` 退出 0。
- profile 的 `package.json` 改前备份在 `C:\Users\27017\.dsh\profiles\desktop\backups\package.json.bak-link-plugins-20261125044516`（同目录还有一份 `pnpm-lock.yaml` 的备份）。**回滚** = 用那份覆盖回去，再 `pnpm install`，再重启 DSH。
- 四个包在 profile 的 `node_modules` 里都是符号链接，指向 `D:\project\dsh-plugins\plugins\*`，已用 `createRequire` 从 profile 的 `package.json` 出发逐个解析验证过。
- **`dsh-unrestricted` 没动**，仍是 `file:…tgz`（见第 2 节）。

**还差的**：

- **测试**。四个里只有一个本来有测试（`dsh-branch-switcher` 的 `test/tree.test.mjs`，15 项纯函数测试），收进来时源码只剩打包产物，`test/` 没留下；另外三个本来就没有。这是这批插件目前最大的缺口：改 `client.js` 之后没有任何东西能告诉你哪里坏了，只能手动点。补的时候：`branch-switcher` 的 `client.js` 里 `__test` 导出还在，按 README 里的描述可以直接把测试写回来；另外三个没有 `__test`，得先把纯逻辑抽出来。
- **`C:\Users\27017\dsh-local\plugins\dist\` 里那两份 `INSTALL.md` 已经过时**：它们详细写着 `dsh-globe-panel` 和 `dsh-claude-style` 的安装步骤，而那两套源码 2026-11-25 已删（进回收站）。留着当历史存档可以，但别再照着做。
- **换机器要重跑 `--apply`**：`link:` 存的是本机绝对路径，这是设计如此（见根 README「新机器接线」），不是缺口，但容易忘。

---

## 2. `dsh-unrestricted`：不进仓库（已定，2026-11-25）

**结论：不加进这个仓库。** 用户 2026-11-25 明确说「unrestricted 不是我们的本地开发的，我之前没有说要把这个加进去」。

**它是第三方插件，不是自研**（证据）：

- 包里的 `package.json` 自己写着 `repository: https://github.com/yexi-by/dsh-unrestricted.git`、`license: MIT`。
- GitHub API：`yexi-by/dsh-unrestricted` 存在，MIT，1380 stars，最新 tag 已到 **v0.2.15**。
- npm 上没有这个包（404）。
- 本地 tgz 里的 `src/rules.js` 与上游 tag `v0.2.8` 的同一文件 SHA256 **完全一致**（`CF32063D…10101F`）：本地这份是上游原样构建，没有本地改动。

**现状**：仍然从 `C:\Users\27017\dsh-local\plugins\dist\dsh-unrestricted-0.2.8.tgz` 以 `file:` 安装，`cordis.patch.yml` 里 `enabled: true`。

**因此**：

- 那个 tgz 是这台机器上的**唯一副本**（源码目录从未留下）。别和临时文件一起清掉。
- 升级靠手动：去上游取新版本、自己打包、改 profile 的 spec、`pnpm install`。
- 它和本仓库其他插件不是一个范畴（往系统提示里融规则），不要因为它「也装在同一个 profile 里」就顺手收进来。
