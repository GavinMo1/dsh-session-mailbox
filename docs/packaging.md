# 把一个插件打成 tgz 装进 profile

本仓库的插件默认走 `link:`（见根 README），**只有第三方插件需要这条路**：东西不是我们的、也不进这个仓库，只能从 tgz 装。目前唯一的例子是 `dsh-unrestricted`（上游 `yexi-by/dsh-unrestricted`，MIT）。

## 两种来源，别搞混

- **本仓库的插件**：直接 `link:`，不要打包。`client.js` 是手写的浏览器 bundle，没有构建步骤。
- **带构建的第三方**（如 `dsh-unrestricted`）：上游把构建产物 `lib/` 一起提交了，所以 `npm pack` 之前**不需要**先 build；要重建才 `pnpm install && pnpm run build`（它用 `tsdown`）。

## 步骤（以升级 `dsh-unrestricted` 为例，2026-11-25 实测）

```powershell
# 1) 取上游源码。上游没有 release 附件（v0.2.15 实测 assets 为空），只能从 tag 拿
git clone --depth 1 --branch v0.2.15 https://github.com/yexi-by/dsh-unrestricted $env:TEMP\up
cd $env:TEMP\up
node -e "console.log(require('./package.json').version)"      # 确认与 tag 一致

# 2) 打包落到 dist（--pack-destination 是唯一需要的参数）
npm pack --pack-destination C:\Users\27017\dsh-local\plugins\dist
#    -> dsh-unrestricted-0.2.15.tgz

# 3) 校验：tgz 里的浏览器半边与源码逐字节一致
tar -xzf C:\Users\27017\dsh-local\plugins\dist\dsh-unrestricted-0.2.15.tgz -C $env:TEMP\verify
(Get-FileHash $env:TEMP\verify\package\lib\client.js).Hash -eq (Get-FileHash .\lib\client.js).Hash
#    True 才算打包成功。注意这个包的浏览器半边叫 lib/client.js（由 src/client/*.tsx 构建），不是 client.js

# 4) profile 依赖改指新 tgz，然后安装
cd C:\Users\27017\.dsh\profiles\desktop
#    package.json: "dsh-unrestricted": "file:C:/Users/27017/dsh-local/plugins/dist/dsh-unrestricted-0.2.15.tgz"
pnpm install

# 5) 重启 DSH Desktop
```

## 三条会咬人的

- **`node_modules\<插件>\` 里的文件是 pnpm store 的硬链接**，原地编辑会写穿全局 store。要试就改名移走再复制源码进去，或在 profile 里临时 `link:` 源码目录，测完 `pnpm install` 复原。
- **client 模块的 revision 在启动时扫描**：改完只刷新窗口，有时仍拿到旧 rev；重启 Desktop 才稳。
- **改 profile 的 `package.json` 前先备份**。`scripts/link-plugins.mjs --apply` 会自动备份到 `profiles\desktop\backups\`；手动改就自己 `Copy-Item` 一份。

## 为什么这份文档在仓库里

2026-11-25 之前的打包/安装说明住在 `C:\Users\27017\dsh-local\plugins\dist\*.md`，那是**产物目录**：没有版本历史、不能 diff、清理 dist 时会连带一起扔掉，而且它们描述的大部分插件后来被删了，整份文档里只剩这一节还有用。所以流程提炼到这里，那两份原文件已进回收站。规矩：**说明文档进仓库，产物目录只放产物。**
