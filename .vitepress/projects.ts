/**
 * 项目文档的数据源配置。
 *
 * 这里只配置“无法从文件系统可靠推断”的项目级信息，例如：
 * - 多个仓库属于哪个项目；
 * - 哪个 README 是项目主入口；
 * - 每个仓库在侧边栏中的显示名称；
 * - 源码链接应该跳转到哪个 GitHub 仓库。
 *
 * docsDir 下的 Markdown、JSON、图片等文件不需要逐个登记。构建时会递归读取，
 * Markdown 自动进入侧边栏，其它文件作为静态资源原样复制。
 *
 * Markdown 菜单元数据约定：
 * - 默认使用第一个 `# 一级标题` 作为菜单文案；
 * - frontmatter `title` 可以覆盖菜单文案；
 * - frontmatter `order` 可以控制同级顺序；
 * - frontmatter `sidebar: false` 可以复制页面但不显示在菜单；
 * - 子目录自动变成嵌套菜单，目录名可用 `01-名称` 的前缀排序。
 */

export interface ProjectRepositoryConfig {
  /** 仓库在本站根目录下的位置，用于识别 Markdown 中的源码链接。 */
  root: string;
  /** 仓库浏览地址，不要以斜杠结尾。 */
  url: string;
  /** 生成 GitHub blob/tree 链接时使用的分支。 */
  branch: string;
}

export interface ProjectEntryConfig {
  /** 侧边栏文案；不传时依次读取 frontmatter title、一级标题和文件名。 */
  text?: string;
  /** 可选：复制时替换文档的第一个一级标题，不修改 packages 中的源文件。 */
  heading?: string;
  /** Markdown 源文件，相对站点仓库根目录。 */
  source: string;
  /** 输出位置，相对 src/projects/<project-id>。目录首页建议命名为 index.md。 */
  target: string;
  /**
   * 当前 Markdown 中需要在新标签页打开的相对链接。
   * 路径以当前 source 文件所在目录为基准，必须与源 Markdown 中的地址一致。
   */
  newTabLinks?: string[];
}

export interface ProjectSectionConfig {
  /** 侧边栏分组名称，例如“Web 客户端”或“服务端”。 */
  text: string;
  /** 文档源目录；会递归读取。只需要入口页时可以省略。 */
  docsDir?: string;
  /** docsDir 的输出目录，相对 src/projects/<project-id>。 */
  targetDir?: string;
  /** 分组入口，例如服务端仓库根目录下的 README.md。 */
  entry?: ProjectEntryConfig;
  /** 是否默认折叠该分组。 */
  collapsed?: boolean;
  /**
   * 自动发现的 Markdown 使用哪个菜单名称：
   * - heading：优先使用 frontmatter title 或一级标题；
   * - filename：使用文件名，适合标题较长、侧边栏空间有限的项目。
   * OVERVIEW.md 无论选择哪种方式都会优先使用正文标题。
   */
  menuText?: "heading" | "filename";
  /**
   * 是否移除子文档名称中重复的目录前缀。
   * 默认关闭，确保菜单忠实使用文件名；显式设为 true 时，
   * “数据库/数据库表关系.md”会显示为“表关系”。
   */
  stripDirectoryPrefix?: boolean;
  /**
   * 相对 docsDir 的忽略路径。目录会连同内部文件一起忽略。
   * 示例：["drafts", "internal/方案.md"]。
   */
  ignore?: string[];
}

export interface ProjectConfig {
  /** 路由 ID，只允许小写字母、数字和连字符。 */
  id: string;
  /** 项目在侧边栏中的名称。 */
  text: string;
  /** 项目主入口。流言使用 Web README，而不是 Server README。 */
  entry: ProjectEntryConfig;
  /** 一个项目可以聚合任意数量的仓库或文档目录。 */
  sections: ProjectSectionConfig[];
  /** 项目包含的源码仓库，用于把未复制的相对源码链接转换为 GitHub 链接。 */
  repositories: ProjectRepositoryConfig[];
  /**
   * 处理源文档中无法自动推断的旧链接或目录链接。
   * key 和 value 都是相对站点仓库根目录的源路径。
   */
  linkAliases?: Record<string, string>;
}

/**
 * 新增项目时复制下面的对象即可：
 * 1. 配置项目入口 entry；
 * 2. 为每个仓库或模块增加 section；
 * 3. 把代码仓库加入 repositories；
 * 4. 文档文件本身由扫描器自动发现，无需在这里维护列表。
 */
const projects: ProjectConfig[] = [
  {
    id: "flow-talk",
    text: "流言",
    entry: {
      text: "项目介绍",
      heading: "流言",
      source: "packages/flow-talk-web/README.md",
      target: "index.md",
      newTabLinks: [
        "../flow-talk-server/docs/OVERVIEW.md",
        "../flow-talk-server/docs/openapi.json"
      ]
    },
    sections: [
      {
        text: "Web 客户端",
        docsDir: "packages/flow-talk-web/docs",
        targetDir: "web",
        menuText: "filename"
      },
      {
        text: "服务端",
        entry: {
          text: "服务端介绍",
          source: "packages/flow-talk-server/README.md",
          target: "server/index.md"
        },
        docsDir: "packages/flow-talk-server/docs",
        targetDir: "server/docs",
        menuText: "filename"
      }
    ],
    repositories: [
      {
        root: "packages/flow-talk-web",
        url: "https://github.com/micro-scaff/flow-talk-web",
        branch: "main"
      },
      {
        root: "packages/flow-talk-server",
        url: "https://github.com/micro-scaff/flow-talk-server",
        branch: "main"
      }
    ],
    linkAliases: {
      // 目录链接没有唯一页面，明确指定进入目录时展示的首篇文档。
      "packages/flow-talk-server/docs": "packages/flow-talk-server/docs/OVERVIEW.md",
      "packages/flow-talk-server/docs/数据库": "packages/flow-talk-server/docs/数据库/数据库落地执行指南.md",
      // Server README 中保留过旧文件名，在站点构建阶段兼容到当前文件。
      "packages/flow-talk-server/docs/Alibaba Cloud Linux 3 部署指南.md": "packages/flow-talk-server/docs/部署指南.md"
    }
  }
];

export default projects;
