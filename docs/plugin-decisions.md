# 其他插件的决策与遗留（原 `TODO.md`）

2026-11-25 由仓库根 `TODO.md` 合并而来。原文件里的每一条都已关闭，关闭理由和后续动作都在下面；**不要再新建一个 TODO 文件**，以后有新开的就追加到本文末尾的「新开的」小节，并写清证据和「改的话动哪里」。

user-model 自己的设计取舍与已否决方向在 `design.md`，本文只管其他插件。

---

## 1. 从 tgz 收回来的插件（已完成）

**背景**：这批插件原本只存在于 `C:\Users\<user>\dsh-local\plugins\dist\*.tgz`，各自的源码目录要么已不在、要么从来没有过，也没有 git 历史。2026-11-25 从 tgz 解出来收进 `plugins/`，一个插件一个 commit：`e1ee99d`（branch-switcher，已弃用）、`334cacf`（input-history）、`4b40fcf`（message-editor）、`f93a5c5`（blank-draft-handoff）。

| 目录 | 包名 | 版本 | 形态 |
| --- | --- | --- | --- |
| `plugins/dsh-input-history` | `dsh-input-history` | 1.0.5 | 纯 Client |
| `plugins/dsh-message-editor` | `dsh-message-editor` | 1.4.1 | 纯 Client |
| `plugins/blank-draft-handoff` | `@local/dsh-blank-draft-handoff` | 1.0.1 | 纯 Client |

**收回的东西和当时发出去的完全一致**：解包目录与仓库目录逐文件比过 SHA256，只有 CRLF/LF 差异，已统一成 LF（仓库 `core.autocrlf=input`）。各包的 `index.js` 和 `client.js` 都过了 `node --check`。

**接线（已完成）**：profile 从 `file:…/*.tgz` 切到 `link:`，用的是 `node scripts/link-plugins.mjs --apply`，`pnpm install` 退出 0；各包在 profile 的 `node_modules` 里都是符号链接，指向 `plugins/*`，已用 `createRequire` 从 profile 的 `package.json` 出发逐个解析验证过（`blank-draft-handoff` 的 `exports` 不含 `./package.json`，直接解析 `package.json` 会报 `ERR_PACKAGE_PATH_NOT_EXPORTED`，属正常）。

**回滚**：profile 的 `package.json` 与 `pnpm-lock.yaml` 备份在 `<profile>\backups\`（后缀 `-link-plugins-*` / `-retire-branch-switcher-*`），覆盖回去 → `pnpm --dir <profile> install` → 重启 DSH。

**换机器必须重跑 `--apply`**：`link:` 存的是本机绝对路径，这是设计如此（见根 README「新机器接线」），不是缺口。

---

## 2. 三个 Client 插件的测试覆盖：已评估，决定不做（2026-11-25）

原来这条写的是「零覆盖，要补得先把纯逻辑抽出来」。评估后的结论是**不做**，理由是可核对的：

- 三份 `client.js` 是**上游发布产物**（IIFE 打包）：`grep '^export '` 在三个文件里命中 **0**，也没有 `__test` 导出。仓库里**没有它们的源码，源码从来没有存在过**。
- 我们保存它们的全部价值就在于「与上游逐字节一致」（见第 1 节的 SHA256 核对）。往里加导出、抽函数，就等于把它们 fork 成另一份代码，之后再也无法用 SHA256 核对上游。
- 于是只有两条路：**(a) 保持不测（当前默认）**；**(b) 先 fork 成自研代码再补测试**——那需要重新拿到源码或反编译，是另一个决定，动手前必须用户拍板。**默认不 fork。**

**不做测试之后，回归靠人工点**（升级或改动后各点一次即可）：

- `dsh-input-history`：输入框空着时按 ↑ / ↓ 翻历史；
- `dsh-message-editor`：改写一条已发消息；再走一次「新分支」；
- `blank-draft-handoff`：留个未发送草稿，放弃该新会话，再开一个新会话看草稿是否接手。

**升级方式**：从新 tgz 重新解包替换，**不手工改文件**——手工改了就等于丢掉了第 1 节的一致性。

---

## 3. `dsh-unrestricted` 不进本仓库（已定，2026-11-25）

用户 2026-11-25 明确说：「unrestricted 不是我们的本地开发的，我之前没有说要把这个加进去」。

它是第三方插件，不是自研（证据）：

- 包里的 `package.json` 写着 `repository: https://github.com/yexi-by/dsh-unrestricted.git`、`license: MIT`。
- GitHub API：`yexi-by/dsh-unrestricted` 存在，MIT，最新 tag 已到 v0.2.15；npm 上没有这个包（404）。
- 本地 tgz 里的 `src/rules.js` 与上游 tag `v0.2.8` 的同一文件 SHA256 完全一致：本地这份是上游原样构建，没有本地改动。

**现状**：仍从 `file:…dsh-unrestricted-0.2.8.tgz` 安装，`cordis.patch.yml` 里 `enabled: true`。

- 那个 tgz 是本机上**唯一的安装源**（源码目录从未留下）；`backups\dsh-unrestricted-0.2.8.tgz` 有一份副本（`backups/` 在 `.gitignore` 里），别和临时文件一起清掉。
- 升级靠手动：去上游取新版本、自己打包、改 profile 的 spec、`pnpm install`，完整步骤见 [`packaging.md`](packaging.md)。
- 它和本仓库其他插件不是一个范畴（往系统提示里融规则），不要因为它「也装在同一个 profile 里」就顺手收进来。

---

## 4. `dsh-branch-switcher` 已弃用（已定，2026-11-25）

用户原话「删了吧」。不是坏了，是**用不上了**：

- 它的设计是「没有分支就什么都不渲染」，所以图标不出现是正常行为，不是故障。
- 实测：498 个会话的 header 里 `parent` 关系 416 条，其中 **409 条是 `origin: subagent`**（插件主动排除），真正的 fork 只有 **7 条**。用户不再用 fork，这个视图永远不出现。
- 顺带排除过一个怀疑：`dsh-claude-style` 的 `lib/client.js` 里 `conversation.session.header.actions` 只命中 1 次，是一条把第三方条目抬到装饰层之上的 CSS，方向与「挤掉」相反；bundle 里 `branch-switcher` 出现 0 次。主题没有压制它。

**做了哪些**：profile 的 `package.json` / `pnpm-lock.yaml` 备份（后缀 `-retire-branch-switcher-20261125-131033`）→ 从 `dependencies` 与 `dsh.profile.bundles` 删掉同名条目 → 重跑 `link-plugins --apply` 与 `pnpm install`（均退 0）→ 仓库 `git rm -r`（commit `8fa82c5`，历史保留）→ `pnpm install` 没清掉的悬空符号链接按 A2 用 `SendToRecycleBin` 移走 → 文档更新。

**tag `dsh-branch-switcher/v1.1.0` 不要删、不要重打**：它是唯一能指回旧实现的锚点，`git show dsh-branch-switcher/v1.1.0:plugins/dsh-branch-switcher/client.js` 可取回当年实现。

**回滚**：

```powershell
git revert 8fa82c5                        # 恢复源码到 plugins/dsh-branch-switcher
node scripts/link-plugins.mjs --apply     # 重新写 profile 的 dependencies 与 bundles
# 重启 DSH
```

**一个容易误判的后果**：`dsh-message-editor` 的「新分支」照样能用（它走 `session.fork`，跟这个视图无关），只是分支树没有可视化入口了。这不是 bug，别再当 bug 查。

---

## 5. `dist/` 里的旧 tgz 与 dist 目录

- `dist/` 现在只剩 tgz 产物：4 个是这批插件的旧安装源（profile 已改 `link:`，不再被引用，可删）、1 个是 `dsh-unrestricted`（还在用，**别删**）。
- 本机（2026-11-25 实测，`C:\Users\ruike\…`）不存在 `dsh-local\plugins\dist` 目录，无需处理；上一台机器（`C:\Users\27017\…`、`D:\project\dsh-plugins`）上如仍有该目录，按上一行处理。

---

## 新开的

（暂无）
