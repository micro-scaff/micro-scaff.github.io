import path from "path";
import type {
  DefaultTheme
} from "vitepress";
import projects from "../projects.ts";
import {
  resolveProjects,
  type ResolvedProjectDocument,
  type ResolvedProjectGroup
} from "../project-documents.ts";

interface IMenuRules {
  nav: DefaultTheme.NavItemWithLink;
  menu: DefaultTheme.SidebarItem[];
}

/**
 * 将输出 Markdown 路径转换为 VitePress 路由。
 * index.md 是目录首页，因此必须保留结尾斜杠；普通 Markdown 去掉扩展名。
 */
function createDocumentLink(projectId: string, target: string): string {
  let route = target.replace(/\\/g, "/");

  if (route.endsWith("index.md")) {
    route = route.slice(0, -"index.md".length);
  } else {
    route = route.replace(/\.md$/, "");
  }

  return `/projects/${projectId}/${route}`;
}

/** 递归转换扫描器生成的目录树，目录层数不受限制。 */
function createSidebarItem(
  projectId: string,
  item: ResolvedProjectDocument | ResolvedProjectGroup
): DefaultTheme.SidebarItem {
  if (item.kind === "document") {
    return {
      text: item.text,
      link: createDocumentLink(projectId, item.target)
    };
  }

  return {
    text: item.text,
    collapsed: item.collapsed,
    items: item.items.map(child => createSidebarItem(projectId, child))
  };
}

/**
 * 项目菜单完全由 projects.ts 和真实文件目录生成。
 * 新增、删除 docsDir 中的 Markdown 后，不需要再修改这个文件。
 */
export default function menuProject(): IMenuRules | undefined {
  const projectRoot = path.resolve(import.meta.dirname, "../..");
  const resolvedProjects = resolveProjects(projectRoot, projects);

  if (!resolvedProjects.length) {
    return undefined;
  }

  const menu = resolvedProjects.map(project => ({
    text: project.text,
    collapsed: false,
    items: [
      createSidebarItem(project.id, project.entry),
      ...project.groups.map(group => createSidebarItem(project.id, group))
    ]
  }));

  return {
    nav: {
      text: "项目",
      link: createDocumentLink(
        resolvedProjects[0].id,
        resolvedProjects[0].entry.target
      ),
      activeMatch: "/projects/"
    },
    menu
  };
}
