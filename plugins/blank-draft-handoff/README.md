# @local/dsh-blank-draft-handoff

DSH 每按一次「新建对话」都会铸一个新的 Session id。在空白对话里打了一半、还没发送就切走，这段草稿就永远留在那个被抛弃的 id 下面：回到侧栏那个会话还能捡回来，下次新建的空白对话是空的。这个插件把最新一份未发送的空白草稿接到下一次新建的对话上。

包名带 `@local/` 前缀（沿用发布时的名字），目录名不带——`link:` 指向目录，装的仍然是这个包名。

## 它怎么接上去

Host 半边是空的：`index.js` 的 `apply()` 什么都不做，全部逻辑在 `client.js`。

做法是**包住** `uiWorkspace.connectBlank`：新建空白会话时会先过这个方法，插件在它返回、导航把 composer 挂上去之前，把草稿写进新 Session 的草稿记录，composer 随后就像读普通存档草稿一样把它读出来。草稿本身存在浏览器 localStorage，键前缀 `dsh.conversation.`，和 Host 自己存草稿用的是同一套记录（结构化 `{ draft: { text } }` 和早期的裸字符串两种形态都认）。

取哪一份草稿，规则收得很紧：

- **只认同一个工作区**：候选会话的 `cwd` 必须等于目标工作区的 `path`。工作区解析不出来就直接放弃，宁可这次不接——借来别的项目的草稿，等于把用户没在那个项目里打过的字翻出来。
- **只认空白会话**：会话摘要必须 `blank === true`，且不在 `archivedSessionIds` 里。
- **目标已有内容就不动**：新会话草稿非空说明用户已经在打了，任何情况下都不覆盖。
- **取最新的一份**：按 localStorage 的插入顺序近似「这条草稿是什么时候写的」，选最后一个非空的。
- **源记录不删**。被抛弃的空白会话仍然可路由，删掉它的槽位就把一份可恢复的草稿变成永久数据丢失。

## 出问题时先看这里

`client.js` 在 `globalThis.__blankDraftHandoff` 上挂了一个自检对象：

```js
// DevTools 控制台
window.__blankDraftHandoff
// { version: '1.0.1', active: true, reason: 'hooked', hook: 'uiWorkspace.connectBlank',
//   lastCarry: { from: '<被抛弃的 id>', to: '<新会话 id>', at: 1763000000000 } }
```

`active: false` 时 `reason` 会直说原因，例如 `incompatible: uiWorkspace.connectBlank is missing`——那说明这个 DSH 版本改了 seam，需要跟着改。控制台另有 `[blank-draft-handoff]` 前缀的 warn。

## 布局

```
client.js        浏览器半边（全部逻辑）；通过 window.__ModuleLoader__.load 注册
index.js         Host 半边，空的，只为让 bundle 挂上一行
cordis.patch.yml insert 一行 id: blank-draft-handoff
locale/          meta.title / meta.description，插件管理页用
icon.svg
```

## 安装

本仓库统一用 `link:`：

```powershell
node scripts/link-plugins.mjs --dry-run
node scripts/link-plugins.mjs --apply
```

然后重启 DSH。`link:` 指向的目录不受 `dsh-hmr` 跟踪，改源码不会自动热重载。

## 已知缺口

- 没有测试。`carry()` 的取舍全在纯函数与 localStorage 的配合上，补测试需要先给 `localStorage` 做个桩。
- 「最新」是靠 localStorage 插入顺序估的，不是真时间戳。清过站点数据的浏览器里，顺序会退化成「谁先被写谁在前」。
