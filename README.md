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

## 新增项目文档

项目展示由 [`.vitepress/projects.ts`](./.vitepress/projects.ts) 统一配置。构建时会读取真实文件目录，递归生成侧边栏，并把 Markdown、JSON、图片等资源复制到 `src/projects/<项目 ID>`。

> `src` 和 `public/projects` 是执行脚本时自动生成的目录，请不要直接修改。源文档及附件应放在 `packages` 下对应的项目仓库中。

### 1. 准备项目文档

推荐每个项目至少提供一个主入口 README，并把详细文档放在 `docs` 目录中。例如：

```text
packages/
├── example-web/
│   ├── README.md
│   └── docs/
│       └── 前端部署.md
└── example-server/
    ├── README.md
    └── docs/
        ├── OVERVIEW.md
        ├── openapi.json
        └── 数据库/
            ├── 数据库表创建.md
            └── 数据库表关系.md
```

`docs` 内的目录可以任意嵌套，不需要逐个登记文件。Markdown 会进入侧边栏；JSON、PDF、图片等普通文件不会生成菜单项，但会自动同步到 `public/projects`，并在正式构建中按原文件名和目录结构发布。

### 2. 注册项目

在 `.vitepress/projects.ts` 的 `projects` 数组中增加一个对象：

```ts
{
  // 用于页面路由，只能包含小写字母、数字和连字符。
  // 最终入口地址为 /projects/example/
  id: "example",
  text: "示例项目",

  // 项目的主页面。一个项目包含多个仓库时，可选择其中一个 README 作为入口。
  entry: {
    text: "项目介绍",
    heading: "示例项目",
    source: "packages/example-web/README.md",
    target: "index.md",

    // 可选：这些源 Markdown 链接在生成页面后使用新标签页打开。
    // 路径必须与 README.md 中写的相对地址完全一致。
    newTabLinks: [
      "../example-server/docs/OVERVIEW.md",
      "../example-server/docs/openapi.json"
    ]
  },

  // 一个项目可以聚合多个仓库或模块。
  sections: [
    {
      text: "Web 客户端",
      docsDir: "packages/example-web/docs",
      targetDir: "web",
      menuText: "filename"
    },
    {
      text: "服务端",
      entry: {
        text: "服务端介绍",
        source: "packages/example-server/README.md",
        target: "server/index.md"
      },
      docsDir: "packages/example-server/docs",
      targetDir: "server/docs",
      menuText: "filename"
    }
  ],

  // 用于把未复制到站点的源码相对链接转换为 GitHub 链接。
  repositories: [
    {
      root: "packages/example-web",
      url: "https://github.com/your-org/example-web",
      branch: "main"
    },
    {
      root: "packages/example-server",
      url: "https://github.com/your-org/example-server",
      branch: "main"
    }
  ],

  // 可选：兼容旧文件名，或给“目录链接”指定实际打开的页面。
  // key 和 value 都是相对当前站点仓库根目录的源文件路径。
  linkAliases: {
    "packages/example-server/docs":
      "packages/example-server/docs/OVERVIEW.md",
    "packages/example-server/docs/旧部署文档.md":
      "packages/example-server/docs/部署文档.md"
  }
}
```

配置字段说明：

| 字段 | 说明 |
| --- | --- |
| `entry` | 项目或分组的入口 Markdown。`heading` 只修改生成页面的第一个一级标题，不会修改源文件。 |
| `sections` | 项目下的文档分组，可配置多个仓库或模块。 |
| `docsDir` | 要递归扫描的源文档目录。 |
| `targetDir` | 文档在 `src/projects/<id>` 下的输出目录，不同分组不能重复。 |
| `menuText` | `filename` 使用完整文件名；`heading` 优先使用 frontmatter `title` 或第一个一级标题。`OVERVIEW.md` 始终优先使用正文标题。 |
| `collapsed` | 是否默认折叠当前一级分组。扫描出的子目录默认展开。 |
| `stripDirectoryPrefix` | 默认 `false`，保留完整文件名。设为 `true` 后，可将“数据库/数据库表关系”显示为“表关系”。 |
| `ignore` | 不复制、不展示的相对路径列表；忽略目录时会同时忽略其内部文件。 |
| `newTabLinks` | 指定当前入口 Markdown 中需要新标签页打开的链接，并自动补充安全的 `rel` 属性。 |
| `repositories` | 为未复制的源码文件生成 GitHub 地址。 |
| `linkAliases` | 处理旧路径、重命名文件和没有默认页面的目录链接。 |

### 3. 控制文档菜单

自动扫描的 Markdown 可以在文件顶部添加 frontmatter：

```md
---
title: 菜单显示名称
order: 10
sidebar: true
---

# 页面标题
```

- `title`：在 `menuText: "heading"` 时覆盖侧边栏名称。
- `order`：数值越小，同级菜单越靠前。
- `sidebar: false`：复制并保留页面链接，但不显示在侧边栏。
- 未设置 `order` 时，`README.md`、`index.md` 和 `OVERVIEW.md` 会优先排列，其余内容按名称排序。
- 文件名和目录名可以添加 `01-`、`02-` 等数字前缀控制顺序，菜单会自动隐藏该前缀。
- 长文件名会自动换行并完整显示，不会用省略号截断。

### 4. Mermaid 图表

项目 Markdown 可以直接使用标准的 Mermaid 代码块，不需要导入组件：

````md
```mermaid
flowchart LR
  A[编写 Markdown] --> B[VitePress 构建]
  B --> C[渲染 SVG 图表]
```
````

站点会在浏览器端按需加载 Mermaid，并在切换明暗主题时重新渲染。语法错误会直接显示在图表位置，方便定位具体文档。

### 5. 本地检查

新增或调整文档后执行：

```bash
# 复制文档并启动开发服务器
npm run docs:dev

# 执行正式构建检查
npm run docs:build
```

只需要重新生成 `src` 时，可以运行：

```bash
npm run copy:md
```

新增、删除或移动 `docsDir` 下的文件后需要重新执行以上命令，侧边栏会根据当前目录结构自动更新。
