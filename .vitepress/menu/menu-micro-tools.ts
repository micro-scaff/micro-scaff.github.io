import fs from "fs";
import path from "path";
import {
  DefaultTheme
} from "vitepress";

const microToolsDir = path.resolve(__dirname, "../../src/micro-tools");
const microToolsBase = "/src/micro-tools";

/**
 * micro-tools 菜单规则：
 * - src/micro-tools/*.md 生成一级菜单项。
 * - src/micro-tools/<目录>/*.md 生成带 children 的分组菜单。
 */
interface IMenuRules {
  nav: DefaultTheme.NavItemWithLink;
  menu: DefaultTheme.SidebarItem[];
}

/**
 * VitePress 链接不需要 .md 后缀，这里统一把文件名转成路由片段。
 */
function removeMarkdownExt(fileName: string): string {
  return fileName.replace(/\.md$/, "");
}

/**
 * 拼接文档路由，避免在多个分支里重复写 /src/micro-tools 前缀。
 */
function createLink(...segments: string[]): string {
  return [
    microToolsBase,
    ...segments
  ].join("/");
}

/**
 * 根据 src/micro-tools 的实际产物生成顶部导航和侧边栏。
 */
export default async function menuMicroTools(): Promise<IMenuRules | undefined> {
  if (!fs.existsSync(microToolsDir)) {
    return undefined;
  }

  const entries = await fs.promises.readdir(microToolsDir, {
    withFileTypes: true
  });

  const menuItems = await Promise.all(entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(async entry => {
      const sourcePath = path.join(microToolsDir, entry.name);

      // 根目录下的 markdown 文件直接作为一级侧边栏项。
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const name = removeMarkdownExt(entry.name);

        return {
          text: name,
          link: createLink(name)
        };
      }

      if (!entry.isDirectory()) {
        return undefined;
      }

      // 子目录下的 markdown 文件聚合为一个分组，例如 packages-dev/*。
      const files = await fs.promises.readdir(sourcePath);
      const children = files
        .sort((a, b) => a.localeCompare(b))
        .filter(file => file.endsWith(".md"))
        .map(file => {
          const name = removeMarkdownExt(file);

          return {
            text: name,
            link: createLink(entry.name, name)
          };
        });

      if (!children.length) {
        return undefined;
      }

      return {
        text: entry.name,
        items: children
      };
    }));

  const menu = menuItems.filter(Boolean) as DefaultTheme.SidebarItem[];
  const firstMenu = menu[0];
  let firstLink: string | undefined;

  // 顶部导航需要落到一个真实页面：优先使用第一个菜单项或第一个分组子项。
  if (firstMenu) {
    firstLink = "link" in firstMenu
      ? firstMenu.link
      : firstMenu.items?.[0]?.link;
  }

  if (!firstLink) {
    return undefined;
  }

  return {
    nav: {
      text: "Micro Tools",
      link: firstLink,
      activeMatch: `${microToolsBase}/`
    },
    menu
  };
}
