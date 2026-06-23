# micro-scaff.github.io
文档

## 更新 packages

执行下面的命令会根据 `.gitmodules` 拉取或更新 `packages` 目录下的仓库：

```bash
npm run update:packages
```

脚本会把每个仓库的 push 地址设置为 `no_push_allowed`，用于避免本地误推。
