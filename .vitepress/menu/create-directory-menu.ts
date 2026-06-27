import fs from "fs";
import path from "path";
import type {
  DefaultTheme
} from "vitepress";

interface IMenuRules {
  // 顶部导航项，必须包含可点击链接，用来展示在 VitePress 顶部 nav 中。
  nav: DefaultTheme.NavItemWithLink;
  // 当前导航对应的侧边栏菜单列表，用来挂到 themeConfig.sidebar。
  menu: DefaultTheme.SidebarItem[];
}

interface IDirectoryMenuOptions {
  // 文档目录，相对项目根目录，例如 src/learn 或 src/micro-tools。
  root: string;
  // 顶部导航显示的文案，例如 Learn 或 Micro Tools。
  text: string;
}

/**
 * VitePress 链接不需要 .md 后缀，这里统一把文件名转成路由片段。
 *
 * 例如：
 * - React.md -> React
 * - packages-dev/eslint-config.md -> eslint-config
 */
function removeMarkdownExt(fileName: string): string {
  return fileName.replace(/\.md$/, "");
}

/**
 * 拼接 VitePress 文档链接。
 *
 * 使用数组统一拼接，避免各处手写 /src/learn/xxx 或 /src/micro-tools/xxx。
 */
function createLink(base: string, ...segments: string[]): string {
  return [
    base,
    ...segments
  ].join("/");
}

/**
 * 从侧边栏项中递归取出第一个真实链接，作为顶部导航入口。
 *
 * VitePress 的 sidebar item 可能是：
 * - 普通链接项：{ text, link }
 * - 分组项：{ text, items }
 *
 * 顶部 nav 必须有 link，所以如果遇到分组，就继续找它的第一个子项。
 */
function getSidebarItemLink(item: DefaultTheme.SidebarItem): string | undefined {
  return "link" in item
    ? item.link
    : item.items?.[0] && getSidebarItemLink(item.items[0]);
}

/**
 * 根据指定文档目录生成顶部导航和侧边栏。
 *
 * - root/*.md 会生成一级侧边栏项。
 * - root/<目录>/*.md 会生成分组侧边栏项。
 */
export default async function createDirectoryMenu({
  root,
  text
}: IDirectoryMenuOptions): Promise<IMenuRules | undefined> {
  // sourceDir 是本地文件系统路径，用来读取真实目录。
  const sourceDir = path.resolve(__dirname, "../..", root);

  // base 是 VitePress 路由前缀，用来生成页面链接。
  const base = `/${root}`;

  // 目录不存在时不生成菜单，调用方会自动跳过这个导航。
  if (!fs.existsSync(sourceDir)) {
    return undefined;
  }

  const entries = await fs.promises.readdir(sourceDir, {
    withFileTypes: true
  });

  // 第一层目录项有两类：
  // 1. markdown 文件：生成普通 sidebar link。
  // 2. 子目录：读取其内部 markdown，生成 sidebar 分组。
  const menuItems = await Promise.all(entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(async entry => {
      const sourcePath = path.join(sourceDir, entry.name);

      // 根目录下的 markdown 文件直接作为一级侧边栏项。
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const name = removeMarkdownExt(entry.name);

        return {
          text: name,
          link: createLink(base, name)
        };
      }

      // 图片、JSON、锁文件等非目录内容不应该出现在文档菜单里。
      if (!entry.isDirectory()) {
        return undefined;
      }

      // 子目录下的 markdown 文件聚合为一个分组。
      const files = await fs.promises.readdir(sourcePath);
      const children = files
        .sort((a, b) => a.localeCompare(b))
        .filter(file => file.endsWith(".md"))
        .map(file => {
          const name = removeMarkdownExt(file);

          return {
            text: name,
            link: createLink(base, entry.name, name)
          };
        });

      // 空目录或只有图片资源的目录不生成侧边栏分组。
      if (!children.length) {
        return undefined;
      }

      return {
        text: entry.name,
        items: children
      };
    }));

  // 上面为了方便跳过无效项会返回 undefined，这里统一过滤掉。
  const menu = menuItems.filter(Boolean) as DefaultTheme.SidebarItem[];

  // 顶部 nav 的 link 指向该目录下第一个可访问文档。
  const firstLink = menu[0] && getSidebarItemLink(menu[0]);

  if (!firstLink) {
    return undefined;
  }

  return {
    nav: {
      text,
      link: firstLink,
      // activeMatch 用于当前路由命中这个目录时，高亮对应顶部导航。
      activeMatch: `${base}/`
    },
    menu
  };
}
