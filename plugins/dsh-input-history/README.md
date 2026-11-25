# dsh-input-history

给输入栏补一条记忆：Harness 的 composer 只保存**当前**草稿，发送之后就忘了你写过什么。这个插件按会话记下每一条发出去的内容，并能把它们捡回来。

## 用法

- **时钟按钮**：工具行（`conversation.input.left`）多一个小图标，点开是**本会话**已发送内容的正序列表，点某一条直接填回输入栏。
- **↑ / ↓ 召回**：只在草稿**真的是空**的时候生效，所以不会跟 Lexical 编辑器的正常光标移动打架。↑ 往回走，↓ 往前走并把最初的草稿还回来。
- 多行条目的边界行为：光标已经在第一条（↑）或最后一条（↓）时，继续按会**接着走历史**，而不是把方向键交还给编辑器。

## 数据从哪来

- 记录来自会话日志（Session journal）里真正的 `user/message`：只有 composer 真发送过才会入列，不是"打过字"就算。
- 存在浏览器 localStorage，键前缀 `dsh-input-history.v2:`（`v1:` 是旧格式，仍可读）；总开关 `dsh-input-history.enabled`。
- 写回不自己拼草稿：调用 harness 提供的 `inputActions.setDraft`。

## 召回状态为什么不用 shadow ref

v1.0.3 重写了这段，原因写在这里免得下次又踩：

- 旧实现用一个本地 shadow ref 记"输入栏现在是什么"，而它只在**本插件自己写草稿**时更新，于是任何发送、手动清空、发送失败回滚、外部 `setDraft` 之后都会与事实脱节，召回逻辑开始乱跳。
- 现在所有判断都取自已发布的 InputState（`draft` / `draftRev` / `phase`）：
  - "草稿是不是空的"直接同步读 composer DOM 的 `textContent`，不会比编辑器慢一帧；
  - "我还在不在走历史"靠写入时捕获的 `draftRev` 代号——任何编辑都会把它顶掉，于是自动取消这次遍历；
  - 采纳的文本永远取自已发布的 `draft`，所以占位字符、CRLF、NFC/NFD 这类归一化差异不会把遍历卡死。

## 布局

```
client.js        浏览器半边（全部逻辑）；通过 window.__ModuleLoader__.load 注册
index.js         Host 半边，空的，只为让 bundle 挂上一行
cordis.patch.yml insert 一行 id: input-history
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

- 没有测试。`client.js` 里没有导出 `__test`，要补测试得先把"从 InputState 判定召回状态"那几段纯逻辑抽出来。
- npm 上另有一个同名包（`dsh-input-history`，作者 Dogtiti，1.1.3），措辞与功能描述都不同；这个目录是本地版本，两者没有引用关系，装哪个要看清 spec。
