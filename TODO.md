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

- **测试**。`dsh-branch-switcher` 的回归测试 2026-11-25 已补回：`test/tree.test.mjs`，18 个用例，跑法见它的 README。**另外三个仍然是零覆盖**（`dsh-input-history`、`dsh-message-editor`、`blank-draft-handoff`）：它们的 `client.js` 里没有 `__test` 导出，要补得先把纯逻辑抽出来，成本比 `branch-switcher` 高一个量级。改这三个的 `client.js` 之后没有任何自动化能告诉你哪里坏了，只能手动点。
- **说明文档已搬进仓库**，产物目录不再放文档：原来 `C:\Users\27017\dsh-local\plugins\dist\` 下的 `INSTALL.md` 和 `dsh-local-plugins-1.0.0-INSTALL.md` 各 18/12 KB，90% 在讲已删除的 `dsh-globe-panel` / `dsh-claude-style`，2026-11-25 已提炼成仓库里的 [`docs/packaging.md`](docs/packaging.md)（打包与校验流程，含升级 `dsh-unrestricted` 的完整步骤）后进回收站；同目录那个 `dsh-local-plugins-1.0.0-install.ps1` 一键安装脚本也一并删了（它自己写着已过时，且引用的 globe-panel tgz 与主题渲染器目录都已不存在）。三份都在 `backups\` 里留了副本。
- **`dist\` 现在只剩 tgz 产物**：6 个包，其中 5 个是四个插件 + `blank-draft-handoff` 的旧安装源（现已改成 `link:`），1 个是 `dsh-unrestricted`（还在用）。
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

- 那个 tgz 是这台机器上**唯一的安装源**（源码目录从未留下）。2026-11-25 已额外复制一份到仓库的 `backups\dsh-unrestricted-0.2.8.tgz`（`backups/` 在 `.gitignore` 里），两份 SHA256 一致（`0DD17283…30BCA3`），别和临时文件一起清掉。
- 升级靠手动：去上游取新版本、自己打包、改 profile 的 spec、`pnpm install`。完整步骤见 [`docs/packaging.md`](docs/packaging.md)。
- 它和本仓库其他插件不是一个范畴（往系统提示里融规则），不要因为它「也装在同一个 profile 里」就顺手收进来。
