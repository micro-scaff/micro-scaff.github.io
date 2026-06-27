import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件的路径，用于在 ES Module 中模拟 CommonJS 的 __dirname。
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 当前工具文件在 scripts/utils 下，所以向上两级就是项目根目录。
// 后续 entry / outDir 都会基于项目根目录进行解析，脚本从哪里执行都不影响结果。
const projectRoot = path.resolve(__dirname, "../../");

const readmeFileName = "README.md";
const packageJsonFileName = "package.json";

/**
 * 判断某个文件名或目录名是否命中匹配规则。
 *
 * 支持三种常见写法：
 * 1. RegExp：file: /^packages-/
 * 2. string：file: "packages-utils"
 * 3. string[] / RegExp[]：file: ["packages-utils", /^packages-style/]
 *
 * @param {string} name 当前要判断的目录名或文件名
 * @param {string | RegExp | Array<string | RegExp> | undefined} matcher 匹配规则
 * @returns {boolean} 是否命中规则
 */
function matchName(name, matcher) {
  // 没有传规则时，表示不限制范围。
  if (!matcher) {
    return true;
  }

  // 数组规则中任意一项命中即可。
  if (Array.isArray(matcher)) {
    return matcher.some(item => matchName(name, item));
  }

  // 正则规则用于匹配一类包名，例如 /^packages-/。
  if (matcher instanceof RegExp) {
    // 兼容带 g / y 标记的正则，避免多次 test 时 lastIndex 影响结果。
    matcher.lastIndex = 0;

    return matcher.test(name);
  }

  // 字符串规则用于精确匹配某个包名。
  return name === matcher;
}

/**
 * 判断某个文件名或目录名是否应该被忽略。
 *
 * ignore 的优先级高于 file：
 * - file 决定“可以复制哪些”
 * - ignore 决定“即使命中 file 也不要复制哪些”
 *
 * @param {string} name 当前要判断的目录名或文件名
 * @param {Array<string | RegExp>} ignore 忽略规则列表
 * @returns {boolean} 是否应该跳过
 */
function shouldIgnore(name, ignore = []) {
  return ignore.some(item => matchName(name, item));
}

/**
 * 读取包目录下 package.json 中的 name 字段。
 *
 * 输出 markdown 文件名来自 package.json.name，而不是目录名。
 * 例如 packages/micro-tools/packages-conf/package.json 中：
 * {
 *   "name": "@mt-kit/conf"
 * }
 * 最终会用 conf 作为包名来源。
 *
 * @param {string} packageDir 包目录的绝对路径
 * @returns {string | undefined} 去掉 @mt-kit/ 前缀后的 package.json name 字段
 */
function readPackageName(packageDir) {
  const packageJsonPath = path.join(packageDir, packageJsonFileName);

  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  return packageJson.name?.replace(/^@mt-kit\//, "");
}

/**
 * 将 package.json.name 转成安全的 markdown 文件名。
 *
 * scoped package 的 name 中会包含 /，例如 @mt-kit/conf。
 * 如果直接把它作为文件名，/ 会被 path.join 当成目录分隔符，
 * 所以这里统一替换成 -。readPackageName 会先移除 @mt-kit/ 前缀，最终输出为 conf.md。
 *
 * @param {string} packageName package.json 中的 name 字段
 * @returns {string} 可安全写入文件系统的 markdown 文件名
 */
function createMarkdownFileName(packageName) {
  return `${packageName.replace(/[\\/]+/g, "-")}.md`;
}

/**
 * 将某个 README.md 复制到输出目录，并使用 package.json.name 生成文件名。
 *
 * 例如：
 * packages/micro-tools/packages-conf/README.md
 * packages/micro-tools/packages-conf/package.json name: @mt-kit/conf
 * -> src/micro-tools/conf.md
 *
 * @param {string} readmePath README.md 的绝对路径
 * @param {string} outputDir 输出目录的绝对路径
 * @param {string} packageName package.json 中的 name 字段
 */
function copyReadmeFile(readmePath, outputDir, packageName) {
  const content = fs.readFileSync(readmePath, "utf8");
  const targetFilePath = path.join(outputDir, createMarkdownFileName(packageName));

  fs.writeFileSync(targetFilePath, content);
}

/**
 * 将系统路径分隔符统一为 /，方便配置里的正则稳定匹配相对路径。
 *
 * @param {string} filePath 文件路径
 * @returns {string} 统一后的路径
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

/**
 * 判断文件名或相对路径是否命中匹配规则。
 *
 * 普通文件模式下，file / ignore 既可以写文件名，也可以写相对路径：
 * - "React.md" 命中文件名
 * - /^images\// 命中 images/xxx.png 这类相对路径
 * - [/\.md$/, /^images\//] 同时命中根目录 markdown 和 images 目录资源
 *
 * @param {string} fileName 文件名
 * @param {string} relativePath 相对 entry 的路径
 * @param {string | RegExp | Array<string | RegExp> | undefined} matcher 匹配规则
 * @returns {boolean} 是否命中
 */
function matchFile(fileName, relativePath, matcher) {
  return matchName(fileName, matcher) || matchName(relativePath, matcher);
}

/**
 * 复制普通文件，不依赖 package.json，也不重命名文件。
 *
 * 这个模式会递归扫描 entry 下的所有子目录，但只复制命中 file 的文件。
 * 输出时保留相对 entry 的目录结构，例如：
 * - packages/learn/React.md -> src/learn/React.md
 * - packages/learn/images/a.png -> src/learn/images/a.png
 *
 * 适合复制散落在目录中的文档和静态资源，例如 learn 下的 .md 与 images。
 *
 * @param {string} entryDir 入口目录的绝对路径
 * @param {string} outputDir 输出目录的绝对路径
 * @param {string | RegExp | Array<string | RegExp> | undefined} file 文件匹配规则，会匹配文件名和相对路径
 * @param {Array<string | RegExp>} ignore 忽略规则列表，会匹配文件名和相对路径
 */
function copyMatchedFiles(entryDir, outputDir, file, ignore = []) {
  function walk(currentDir) {
    fs.readdirSync(currentDir).forEach(name => {
      const sourcePath = path.join(currentDir, name);
      const relativePath = normalizePath(path.relative(entryDir, sourcePath));
      const stat = fs.statSync(sourcePath);

      if (shouldIgnore(name, ignore) || shouldIgnore(relativePath, ignore)) {
        return;
      }

      if (stat.isDirectory()) {
        walk(sourcePath);
        return;
      }

      if (!stat.isFile()) {
        return;
      }

      if (file && !matchFile(name, relativePath, file)) {
        return;
      }

      const targetFilePath = path.join(outputDir, relativePath);

      fs.mkdirSync(path.dirname(targetFilePath), {
        recursive: true
      });
      fs.copyFileSync(sourcePath, targetFilePath);
    });
  }

  walk(entryDir);
}

/**
 * 判断相对路径的任意一段是否命中规则。
 *
 * file / ignore 不再只看一级目录名，而是同时看二级包的路径片段：
 * - packages-conf 命中 /^packages-/
 * - packages-react/react-hooks 也会因为 packages-react 命中 /^packages-/ 而被包含
 * - file: "react-hooks" 也可以直接命中二级包名
 *
 * @param {string[]} relativeSegments 包目录相对 entry 的路径片段
 * @param {string | RegExp | Array<string | RegExp> | undefined} matcher 匹配规则
 * @returns {boolean} 是否命中
 */
function matchPathSegments(relativeSegments, matcher) {
  return relativeSegments.some(segment => matchName(segment, matcher));
}

/**
 * 从 entry 目录中收集可复制的包目录。
 *
 * 这里最多向下扫描两层：
 * - 一级包：packages-conf/README.md + package.json
 * - 二级包：packages-react/react-hooks/README.md + package.json
 *
 * 只有同时包含 README.md 和 package.json 的目录才会被视为“包目录”。
 *
 * @param {string} entryDir 入口目录的绝对路径
 * @returns {Array<{ dir: string; relativeSegments: string[] }>} 包目录列表
 */
function collectPackageDirs(entryDir) {
  const packageDirs = [];

  fs.readdirSync(entryDir).forEach(firstLevelName => {
    const firstLevelDir = path.join(entryDir, firstLevelName);

    if (!fs.statSync(firstLevelDir).isDirectory()) {
      return;
    }

    const firstLevelReadmePath = path.join(firstLevelDir, readmeFileName);
    const firstLevelPackageJsonPath = path.join(firstLevelDir, packageJsonFileName);

    if (fs.existsSync(firstLevelReadmePath) && fs.existsSync(firstLevelPackageJsonPath)) {
      packageDirs.push({
        dir: firstLevelDir,
        relativeSegments: [
          firstLevelName
        ]
      });
    }

    fs.readdirSync(firstLevelDir).forEach(secondLevelName => {
      const secondLevelDir = path.join(firstLevelDir, secondLevelName);

      if (!fs.statSync(secondLevelDir).isDirectory()) {
        return;
      }

      const secondLevelReadmePath = path.join(secondLevelDir, readmeFileName);
      const secondLevelPackageJsonPath = path.join(secondLevelDir, packageJsonFileName);

      if (!fs.existsSync(secondLevelReadmePath) || !fs.existsSync(secondLevelPackageJsonPath)) {
        return;
      }

      packageDirs.push({
        dir: secondLevelDir,
        relativeSegments: [
          firstLevelName,
          secondLevelName
        ]
      });
    });
  });

  return packageDirs;
}

/**
 * 执行文件复制操作。
 *
 * 当前支持两种模式：
 *
 * 1. 包 README 模式（默认）
 *    用于 packages/micro-tools 这类包目录。
 *    脚本会查找 README.md + package.json 成对存在的包目录，
 *    复制 README.md，并用 package.json.name 生成输出文件名。
 *
 * 2. 普通文件模式（copyFiles: true）
 *    用于 packages/learn 这类普通文档目录。
 *    脚本会递归扫描 entry 下的文件，不读取 package.json，
 *    不重命名文件，并保留源文件相对 entry 的目录结构。
 *
 * 配置示例：
 * {
 *   outDir: "src/micro-tools",      // 输出目录，相对项目根目录
 *   entry: "packages/micro-tools",  // 源入口目录，相对项目根目录
 *   file: /^packages-/,             // 只复制命中的一级或二级包目录
 *   ignore: ["packages-demo"],      // 排除指定一级或二级包目录
 * }
 * {
 *   outDir: "src/learn",
 *   entry: "packages/learn",
 *   copyFiles: true,                // 复制普通文件，不依赖 package.json
 *   file: [/\.md$/, /^images\//],   // 复制所有 .md，以及 images/ 下的所有文件
 * }
 *
 * 复制规则：
 * 1. 默认包 README 模式始终只复制 README.md。
 * 2. 输出文件名来自包目录 package.json.name，并移除公共前缀 @mt-kit/，例如 @mt-kit/conf -> conf.md。
 * 3. file 用于缩小复制范围，支持匹配一级分类目录和二级包目录。
 * 4. ignore 优先级高于 file，命中 ignore 的目录不会复制。
 * 5. 未传 file 时，兼容旧逻辑：优先复制 entry 自身的 README.md；
 *    如果 entry 自身没有 README.md，则复制 entry 下最多二级目录中的包 README.md。
 * 6. copyFiles 为 true 时，复制普通文件，file / ignore 支持匹配文件名和相对路径。
 * 7. 普通文件模式默认递归扫描，但不会复制未命中 file 的文件。
 *    例如 file: [/\.md$/, /^images\//] 不会复制 drawio/ 或 vscode-settings/ 下的其他文件。
 *
 * @param {Array<{
 *   outDir: string;
 *   entry: string;
 *   copyFiles?: boolean;
 *   file?: string | RegExp | Array<string | RegExp>;
 *   ignore?: Array<string | RegExp>;
 * }>} files 复制配置列表
 */
export default function executeFileCopy(files) {
  files.forEach(({
    outDir,
    entry,
    copyFiles = false,
    file,
    ignore = []
  }) => {
    const outputDir = path.resolve(projectRoot, outDir);
    const entryDir = path.resolve(projectRoot, entry);
    const entryReadmePath = path.join(entryDir, readmeFileName);

    if (!fs.existsSync(entryDir)) {
      throw new Error(`复制入口不存在：${entryDir}`);
    }

    // 确保输出目录存在，避免后续写文件时报 ENOENT。
    fs.mkdirSync(outputDir, {
      recursive: true
    });

    if (copyFiles) {
      copyMatchedFiles(entryDir, outputDir, file, ignore);

      return;
    }

    // 没有传 file 时，保留参考实现的行为：
    // 如果 entry 目录自身存在 README.md，就复制它，并使用 entry/package.json.name 作为输出文件名。
    if (!file && fs.existsSync(entryReadmePath)) {
      const packageName = readPackageName(entryDir);

      if (!packageName) {
        return;
      }

      copyReadmeFile(entryReadmePath, outputDir, packageName);

      return;
    }

    collectPackageDirs(entryDir).forEach(({
      dir,
      relativeSegments
    }) => {
      const readmePath = path.join(dir, readmeFileName);

      // ignore 优先级最高：即使命中了 file，也可以通过 ignore 显式排除。
      if (relativeSegments.some(segment => shouldIgnore(segment, ignore))) {
        return;
      }

      // file 用来缩小复制范围；未传 file 时，表示不过滤包名。
      if (file && !matchPathSegments(relativeSegments, file)) {
        return;
      }

      const packageName = readPackageName(dir);

      // 目录如果没有 package.json.name，就无法按包名生成文件，直接跳过。
      if (!packageName) {
        return;
      }

      copyReadmeFile(readmePath, outputDir, packageName);
    });
  });
}
