# dsh-message-editor

在聊天记录里改一条**已经发出去**的用户消息。

DSH 的会话日志是唯一事实来源，而且只追加，所以"原地改写"在存储层不可能发生。这里的做法是：把目标消息**之前**的那一段前缀复制出来，在副本上说你要说的话。于是有两种去处：

| 去处 | 结果 |
| --- | --- |
| **新分支** | 副本成为一个新分支会话，原会话完全不动——适合试探另一条路 |
| **改写原会话** | 副本继承原会话的标题，原会话归档；看上去就像对话在那个位置继续下去了 |

## 入口

每条已发送的用户消息下方自带编辑入口，走 `conversation.chat.node` 的**行内替换**，不需要打开任何面板。

`shell.overlay` 上那个整框面板仍然挂着，但**没有入口**了——标题栏的触发按钮在某一版里被移除。留着它只是作为 fallback 实现，不打开就不渲染任何东西。哪天要恢复"整框面板"入口，改的是这一块而不是重写。

## 布局

```
client.js        浏览器半边（全部逻辑）；通过 window.__ModuleLoader__.load 注册
index.js         Host 半边，空的，只为让 bundle 挂上一行
cordis.patch.yml insert 一行 id: message-editor
locale/          meta.title / meta.description，插件管理页用
icon.svg
```

文案字典的 namespace 是 `messageEditor`，中英文都在 `client.js` 里（`zh` / `en` 两个对象），不在 `locale/`——`locale/*.json` 只喂插件管理页的标题和描述。

## 和分支切换器的关系

「改写原会话」会把原会话归档，而 `dsh-branch-switcher` 照常把归档会话列在分支图里（标「已归档」、不可点）。所以改写之后去看分支图，能看到来路但点不进去——这是设计，不是 bug。

两者挂的 slot 不同（这里是 `conversation.chat.node`，那边是 `conversation.session.header.actions`），可以同时装。

## 安装

本仓库统一用 `link:`：

```powershell
node scripts/link-plugins.mjs --dry-run
node scripts/link-plugins.mjs --apply
```

然后重启 DSH。`link:` 指向的目录不受 `dsh-hmr` 跟踪，改源码不会自动热重载。

## 已知缺口

- 没有测试。
- npm 上有一个近名的第三方包 `dsh-plugin-message-edit`（1.6.5，"rewind and branch + 版本计数 + 树形浏览"），和这个目录没有引用关系，功能划分也不同：这里只有「新分支」和「改写原会话」两种去处，没有版本计数器。
