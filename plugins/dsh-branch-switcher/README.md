# dsh-branch-switcher

会话标题栏里的分支切换器：当前会话只要存在分支（自己是从别的会话分出来的，或者自己被分出去过），标题栏右侧就出现一个分支图标 + 数字，点开是把整棵分支树铺成一张小地图，点谁跳谁，不用回左侧会话列表。

## 它从哪拿数据

不新增任何 Host 能力。`session.fork` 早就把父会话写进了子会话的 header（`parentSession`），Client 的会话列表投影把同一份血统挂在每一行的 `parentId` 上。这里只做三件事：

1. 从当前会话沿 `parentId` 向上走到仍在列表里的最高祖先；
2. 以它为根，按列表顺序（也就是侧栏用的血统顺序）展开整棵子树；
3. 点某一行时调用已有的 `uiWorkspace.openSession`。

「已归档」来自另一个 store：`ctx.workspaces.list` 快照的 `archivedSessionIds`。归档会话**并没有从 `sessions.list.byId` 里消失**（消失的是侧栏的显示，不是数据），所以它们照常参与血统展开，只是带着归档标记。

因此：

- 站在分叉父会话上，看得到从它分出去的所有分支；
- 站在某个分支上，看得到兄弟分支，也看得到自己往下延伸的分支；
- 当前会话标「当前」，从根到当前的祖先路径会淡一档，运行中的会话带脉动小绿点；
- **已归档的行照常列出、标「已归档」、整行降透明度并且不可点**：渲染成 `div[aria-disabled]` 而不是 `button`，没有 hover 反馈，也不占 Tab 停靠点。归档会话的日志在恢复之前是只读的，从这里跳过去只会制造一个半坏的界面。
- 触发器上的数字仍然数**所有亲戚**（含已归档），因为「这个会话存在分支」这件事本身不因归档而消失。典型场景：「改写原会话」之后，新会话的分支图里会看到被归档的原会话标着「已归档」，看得见来路，但点不进去。
- 父会话已归档时不会打断上溯：它仍然会被走过并标记，除非它整条记录都不在了，那时当前会话成为根。

**子代理会话不算分支**。它们同样有 `parentId`，但那是「谁创建了我」而不是「从哪条对话分叉」，混进来会让人误点进只读的子代理聊天窗，所以 `origin: 'subagent'` 的行一律排除。

## 行为细节

- 没有任何分支时**不渲染任何东西**，普通会话的标题栏保持原样。
- 面板走 `react-dom` portal 挂到 `document.body`，避开标题栏的 `overflow`/层叠；位置按触发器 `getBoundingClientRect()` 计算，下方放不下就翻到上方，右侧溢出会向左收；窗口缩放、任意祖先滚动都会重新定位（拿不到 `react-dom` 时退化为标题栏内的内联定位，仍可用）。
- Esc 关闭（capture 阶段监听，不会被内层吞掉），点击面板和触发器以外的地方关闭，列表里当前会话被归档时自动关闭。
- 打开时焦点落在「当前」这一行并滚到可见处；行是真正的 `button[role=menuitem]`，Tab/Shift+Tab 和回车都能用。
- 时间是相对的（刚刚 / n 分钟前 / n 小时前 / n 天前 / 超过一周显示日期），面板开着时每 30 秒刷新一次。

## 布局

```
client.js        浏览器半边（全部逻辑）；通过 window.__ModuleLoader__.load 注册
index.js         Host 半边，空的，只为让 bundle 挂上一行
cordis.patch.yml insert 一行 id: branch-switcher
locale/          meta.title / meta.description，插件管理页用
icon.svg
README.md
```

## 安装

本仓库统一用 `link:`：

```powershell
node scripts/link-plugins.mjs --dry-run
node scripts/link-plugins.mjs --apply
```

然后重启 DSH。`link:` 指向的目录不受 `dsh-hmr` 跟踪，改源码不会自动热重载。

只挂了 `conversation.session.header.actions` 这一个 slot，`id: branch-switcher`、`order: 15`，和「编辑历史消息」（order 30）、任务列表（order 20）并排不冲突。

## 测试

```powershell
node --test plugins/dsh-branch-switcher/test/tree.test.mjs
```

`test/tree.test.mjs` 直接加载**发布用的** `client.js`（不是副本、不打包），用桩替掉 `window.__ModuleLoader__.load` 和 `react` / `react-dom`，拿到工厂返回的插件对象后只测它导出的 `__test`（`familyOf` / `relativeTime` / `isBranchRow`）。产品代码一行没为测试改过。

18 个用例：血统展开（父/兄弟/深链深度与连接线、last 兄弟、子代理排除、父会话缺失、父环、归档标记与计数、标题三级回退、字段默认值、不可用视图返回 `null`）、`isBranchRow`、时间分档（刚刚/分钟/小时/天/超过一周的绝对日期、非法时间戳、时钟倒退）。

## 已知缺口

- 测试只覆盖三个纯函数。渲染、portal 定位、键盘交互、归档行不可点这些都在 `client.js` 的 React 层里，没有自动化覆盖，改那部分只能手动点。

