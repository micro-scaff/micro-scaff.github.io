# micro-scaff.github.io
文档

## 更新 packages

执行下面的命令会根据 `.gitmodules` 拉取或更新 `packages` 目录下的仓库：

```bash
npm run update:packages
```

脚本会把每个仓库的 push 地址设置为 `no_push_allowed`，用于避免本地误推。

## 添加子模块

```bash
# 清理目前手写的 .gitmodules 配置
git config -f .gitmodules --remove-section 'submodule.packages/micro-tools'

git submodule add -f https://仓库地址 packages/文件名称

git add *

git commit -m "feat: register package submodules"
```
