import fs from "fs";
import path from "path";
import type {
  ProjectConfig,
  ProjectEntryConfig,
  ProjectSectionConfig
} from "./projects.ts";

/** 扫描后供复制脚本和菜单生成器共同使用的文档节点。 */
export interface ResolvedProjectDocument {
  kind: "document";
  text: string;
  source: string;
  target: string;
  heading?: string;
  order: number;
}

/** 文件系统目录会转换为可递归嵌套的侧边栏分组。 */
export interface ResolvedProjectGroup {
  kind: "group";
  text: string;
  collapsed?: boolean;
  order: number;
  items: Array<ResolvedProjectDocument | ResolvedProjectGroup>;
}

/** 非 Markdown 文件不会进入菜单，但需要复制并参与链接映射。 */
export interface ResolvedProjectAsset {
  kind: "asset";
  source: string;
  target: string;
}

export interface ResolvedProject {
  id: string;
  text: string;
  entry: ResolvedProjectDocument;
  groups: ResolvedProjectGroup[];
  files: Array<ResolvedProjectDocument | ResolvedProjectAsset>;
  repositories: ProjectConfig["repositories"];
  linkAliases?: ProjectConfig["linkAliases"];
}

interface MarkdownMetadata {
  title?: string;
  order?: number;
  sidebar?: boolean;
}

const defaultOrder = Number.MAX_SAFE_INTEGER;

/** README/index 和 OVERVIEW 是常见入口名，在没有显式 order 时优先展示。 */
function createDefaultOrder(fileName: string): number {
  const name = fileName.replace(/\.md$/i, "").toLowerCase();
  const numericPrefix = name.match(/^(\d+)[._-]+/)?.[1];

  if (numericPrefix) {
    return Number(numericPrefix);
  }

  if (name === "readme" || name === "index") {
    return -20;
  }

  if (name === "overview") {
    return -10;
  }

  return defaultOrder;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * 读取简单 Frontmatter 字段，不额外引入 YAML 依赖。
 *
 * 文档可以使用：
 * ---
 * title: 菜单显示名称
 * order: 10
 * sidebar: false
 * ---
 *
 * 未设置 title 时读取第一个一级标题；未设置 order 时按标题排序。
 */
function readMarkdownMetadata(filePath: string): MarkdownMetadata & { heading?: string } {
  const content = fs.readFileSync(filePath, "utf8");
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const metadata: MarkdownMetadata = {};

  frontmatterMatch?.[1].split(/\r?\n/).forEach(line => {
    const match = line.match(/^([a-zA-Z][\w-]*):\s*(.*?)\s*$/);

    if (!match) {
      return;
    }

    const value = match[2].replace(/^(["'])(.*)\1$/, "$2");

    if (match[1] === "title") {
      metadata.title = value;
    } else if (match[1] === "order" && Number.isFinite(Number(value))) {
      metadata.order = Number(value);
    } else if (match[1] === "sidebar") {
      metadata.sidebar = value !== "false";
    }
  });

  const heading = content.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];

  return {
    ...metadata,
    heading
  };
}

/** 去除可选的排序前缀，让 01-guide.md 能排序但菜单只显示 guide。 */
function createFallbackText(name: string): string {
  return name
    .replace(/\.md$/i, "")
    .replace(/^\d+[._-]+/, "")
    .replace(/^(README|index)$/i, "概览");
}

function resolveEntry(
  projectRoot: string,
  entry: ProjectEntryConfig
): ResolvedProjectDocument {
  const sourcePath = path.resolve(projectRoot, entry.source);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`项目入口不存在：${entry.source}`);
  }

  const metadata = readMarkdownMetadata(sourcePath);

  return {
    kind: "document",
    text: entry.text
      ?? metadata.title
      ?? metadata.heading
      ?? createFallbackText(path.basename(entry.source)),
    source: normalizePath(entry.source),
    target: normalizePath(entry.target),
    heading: entry.heading,
    order: metadata.order ?? createDefaultOrder(path.basename(entry.source))
  };
}

function isIgnored(relativePath: string, ignore: string[]): boolean {
  const normalizedPath = normalizePath(relativePath);

  return ignore.some(item => {
    const normalizedIgnore = normalizePath(item).replace(/\/$/, "");
    return normalizedPath === normalizedIgnore
      || normalizedPath.startsWith(`${normalizedIgnore}/`);
  });
}

function sortMenuItems(
  items: Array<ResolvedProjectDocument | ResolvedProjectGroup>
): void {
  items.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.text.localeCompare(right.text, "zh-CN", {
      numeric: true
    });
  });
}

/**
 * 递归扫描一个 docsDir：
 * - Markdown 转换成菜单文档；
 * - 子目录转换成菜单分组；
 * - JSON、图片等普通文件只复制，不进入菜单；
 * - 隐藏文件和配置中 ignore 的内容跳过。
 */
function scanSection(
  projectRoot: string,
  section: ProjectSectionConfig
): {
  items: Array<ResolvedProjectDocument | ResolvedProjectGroup>;
  files: Array<ResolvedProjectDocument | ResolvedProjectAsset>;
} {
  if (!section.docsDir && !section.targetDir) {
    return {
      items: [],
      files: []
    };
  }

  if (!section.docsDir || !section.targetDir) {
    throw new Error(
      `项目分组“${section.text}”必须同时配置 docsDir 和 targetDir`
    );
  }

  const docsRoot = path.resolve(projectRoot, section.docsDir);

  if (!fs.existsSync(docsRoot)) {
    throw new Error(`项目文档目录不存在：${section.docsDir}`);
  }

  if (!fs.statSync(docsRoot).isDirectory()) {
    throw new Error(`项目文档路径不是目录：${section.docsDir}`);
  }

  const ignore = section.ignore ?? [];

  function walk(currentDir: string, relativeDir = "") {
    const items: Array<ResolvedProjectDocument | ResolvedProjectGroup> = [];
    const files: Array<ResolvedProjectDocument | ResolvedProjectAsset> = [];

    fs.readdirSync(currentDir, {
      withFileTypes: true
    }).forEach(entry => {
      if (entry.name.startsWith(".")) {
        return;
      }

      const relativePath = normalizePath(path.join(relativeDir, entry.name));

      if (isIgnored(relativePath, ignore)) {
        return;
      }

      const sourcePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const child = walk(sourcePath, relativePath);

        if (child.items.length) {
          items.push({
            kind: "group",
            text: createFallbackText(entry.name),
            // 自动发现的子目录默认展开，避免用户误以为目录内文档没有生成。
            // 如果后续需要按目录控制折叠状态，可以再从目录 README 的
            // frontmatter 读取 collapsed 字段，而无需修改菜单生成器。
            collapsed: false,
            order: createDefaultOrder(entry.name),
            items: child.items
          });
        }

        files.push(...child.files);
        return;
      }

      if (!entry.isFile()) {
        return;
      }

      const source = normalizePath(path.join(section.docsDir!, relativePath));
      const targetName = /^(README|index)\.md$/i.test(entry.name)
        ? "index.md"
        : entry.name;
      const target = normalizePath(path.join(
        section.targetDir!,
        relativeDir,
        targetName
      ));

      if (!entry.name.toLowerCase().endsWith(".md")) {
        files.push({
          kind: "asset",
          source,
          target
        });
        return;
      }

      const metadata = readMarkdownMetadata(sourcePath);
      const document: ResolvedProjectDocument = {
        kind: "document",
        text: metadata.title
          ?? metadata.heading
          ?? createFallbackText(entry.name),
        source,
        target,
        order: metadata.order ?? createDefaultOrder(entry.name)
      };

      files.push(document);

      if (metadata.sidebar !== false) {
        items.push(document);
      }
    });

    sortMenuItems(items);

    return {
      items,
      files
    };
  }

  return walk(docsRoot);
}

/**
 * 解析全部项目。复制脚本和 VitePress 菜单必须共用此结果，防止出现
 * “文件已经复制但菜单没有更新”或“菜单链接指向不存在页面”的双份配置问题。
 */
export function resolveProjects(
  projectRoot: string,
  projects: ProjectConfig[]
): ResolvedProject[] {
  const projectIds = new Set<string>();

  return projects.map(project => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id)) {
      throw new Error(`项目 ID 必须使用小写字母、数字和连字符：${project.id}`);
    }

    if (projectIds.has(project.id)) {
      throw new Error(`项目 ID 重复：${project.id}`);
    }

    projectIds.add(project.id);

    const entry = resolveEntry(projectRoot, project.entry);
    const files: Array<ResolvedProjectDocument | ResolvedProjectAsset> = [entry];
    const groups = project.sections.map(section => {
      const scanned = scanSection(projectRoot, section);
      const sectionItems: Array<ResolvedProjectDocument | ResolvedProjectGroup> = [];

      if (section.entry) {
        const sectionEntry = resolveEntry(projectRoot, section.entry);
        sectionItems.push(sectionEntry);
        files.push(sectionEntry);
      }

      sectionItems.push(...scanned.items);
      files.push(...scanned.files);

      return {
        kind: "group" as const,
        text: section.text,
        collapsed: section.collapsed,
        order: defaultOrder,
        items: sectionItems
      };
    });

    return {
      id: project.id,
      text: project.text,
      entry,
      groups,
      files,
      repositories: project.repositories,
      linkAliases: project.linkAliases
    };
  });
}
