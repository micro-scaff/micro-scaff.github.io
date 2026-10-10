import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import projects from "../.vitepress/projects.ts";
import { resolveProjects } from "../.vitepress/project-documents.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(projectRoot, "src/projects");

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

/** 将链接拆分为文件路径和 ?query/#hash，重写路径时保留后两者。 */
function splitLink(link) {
  const match = link.match(/^([^?#]*)([?#].*)?$/);

  return {
    pathname: decodeURI(match?.[1] ?? link),
    suffix: match?.[2] ?? ""
  };
}

/**
 * 当 Markdown 指向没有复制进站点的源码时，将相对路径转换为 GitHub 链接。
 * 文件使用 blob，目录使用 tree；仓库根目录直接返回仓库首页。
 */
function createRepositoryLink(project, sourcePath) {
  const repository = project.repositories.find(item => {
    const repositoryRoot = path.resolve(projectRoot, item.root);
    return sourcePath === repositoryRoot
      || sourcePath.startsWith(`${repositoryRoot}${path.sep}`);
  });

  if (!repository) {
    return undefined;
  }

  const repositoryRoot = path.resolve(projectRoot, repository.root);
  const relativePath = normalizePath(path.relative(repositoryRoot, sourcePath));

  if (!relativePath) {
    return repository.url;
  }

  const type = fs.existsSync(sourcePath) && fs.statSync(sourcePath).isDirectory()
    ? "tree"
    : "blob";

  return encodeURI(`${repository.url}/${type}/${repository.branch}/${relativePath}`);
}

/** 根据两个输出文件的位置生成站点内部相对链接。 */
function createSiteLink(currentTarget, linkedTarget, suffix) {
  let relativePath = normalizePath(path.relative(path.dirname(currentTarget), linkedTarget));

  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }

  return `${encodeURI(relativePath)}${suffix}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 新标签页链接同时添加 rel，避免目标页面获得 opener 引用。 */
function createNewTabLink(label, href) {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

/**
 * 原生 HTML 链接不会经过 VitePress 的 Markdown 路由转换，因此需要显式把
 * foo.md 转成 foo.html，把目录入口 index.md 转成对应目录。
 */
function createRenderedPageLink(href) {
  return href
    .replace(/index\.md(?=([?#]|$))/, "")
    .replace(/\.md(?=([?#]|$))/, ".html");
}

/**
 * 重写复制后会失效的 Markdown 链接：
 * 1. 已扫描的文档和资源指向新的站点相对位置；
 * 2. linkAliases 处理旧文件名和目录入口；
 * 3. 未复制的仓库源码跳转到 GitHub；
 * 4. HTTP、mailto、锚点等外部链接保持不变。
 */
function rewriteMarkdown(content, document, project, sourceMap) {
  const currentSource = path.resolve(projectRoot, document.source);
  const currentTarget = path.resolve(outputRoot, project.id, document.target);
  const aliases = new Map(
    Object.entries(project.linkAliases ?? {}).map(([source, target]) => [
      path.resolve(projectRoot, source),
      path.resolve(projectRoot, target)
    ])
  );
  const newTabLinks = new Set(
    (document.newTabLinks ?? []).map(link => {
      const { pathname } = splitLink(link);
      return path.resolve(path.dirname(currentSource), pathname);
    })
  );

  const rewrittenContent = content.replace(
    /(!?)\[([^\]]*)\]\(([^)]+)\)/g,
    (match, imagePrefix, label, link) => {
      const trimmedLink = link.trim();

      if (
        !trimmedLink
        || trimmedLink.startsWith("#")
        || /^[a-z][a-z\d+.-]*:/i.test(trimmedLink)
        || trimmedLink.startsWith("//")
      ) {
        return match;
      }

      const { pathname, suffix } = splitLink(trimmedLink);
      const resolvedSource = path.resolve(path.dirname(currentSource), pathname);
      const aliasedSource = aliases.get(resolvedSource) ?? resolvedSource;
      const linkedTarget = sourceMap.get(aliasedSource);

      if (linkedTarget) {
        const siteLink = createSiteLink(currentTarget, linkedTarget, suffix);

        if (!imagePrefix && newTabLinks.has(resolvedSource)) {
          return createNewTabLink(label, createRenderedPageLink(siteLink));
        }

        return `${imagePrefix}[${label}](${siteLink})`;
      }

      const repositoryLink = createRepositoryLink(project, resolvedSource);

      if (repositoryLink) {
        const href = `${repositoryLink}${suffix}`;

        if (!imagePrefix && newTabLinks.has(resolvedSource)) {
          return createNewTabLink(label, href);
        }

        return `${imagePrefix}[${label}](${href})`;
      }

      return match;
    }
  );

  if (!document.heading) {
    return rewrittenContent;
  }

  return rewrittenContent.replace(/^# .+$/m, `# ${document.heading}`);
}

/**
 * 复制所有自动发现的项目文档和资源。
 *
 * 扫描结果同时被 menu-project.ts 使用，所以 docsDir 中新增 Markdown 后，
 * 下一次构建会自动复制文件并出现对应菜单项。
 */
export default function copyProjectDocs() {
  const resolvedProjects = resolveProjects(projectRoot, projects);

  resolvedProjects.forEach(project => {
    const sourceMap = new Map();
    const targetPaths = new Set();
    const projectOutputRoot = path.resolve(outputRoot, project.id);

    project.files.forEach(file => {
      const sourcePath = path.resolve(projectRoot, file.source);
      const targetPath = path.resolve(projectOutputRoot, file.target);

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`项目“${project.text}”缺少文档源文件：${file.source}`);
      }

      if (!targetPath.startsWith(`${projectOutputRoot}${path.sep}`)) {
        throw new Error(`项目“${project.text}”的输出路径越界：${file.target}`);
      }

      if (targetPaths.has(targetPath)) {
        throw new Error(`项目“${project.text}”的输出路径重复：${file.target}`);
      }

      sourceMap.set(sourcePath, targetPath);
      targetPaths.add(targetPath);
    });

    project.files.forEach(file => {
      const sourcePath = path.resolve(projectRoot, file.source);
      const targetPath = path.resolve(projectOutputRoot, file.target);

      fs.mkdirSync(path.dirname(targetPath), {
        recursive: true
      });

      if (file.kind === "document") {
        const content = fs.readFileSync(sourcePath, "utf8");
        fs.writeFileSync(
          targetPath,
          rewriteMarkdown(content, file, project, sourceMap)
        );
        return;
      }

      fs.copyFileSync(sourcePath, targetPath);
    });
  });
}
