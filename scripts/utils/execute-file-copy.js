import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件的路径，用于在 ES Module 中模拟 CommonJS 的 __dirname。
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 当前工具文件在 scripts/utils 下，所以向上两级就是项目根目录。
// 后续 entry / outDir 都会基于项目根目录进行解析，脚本从哪里执行都不影响结果。
const projectRoot = path.resolve(__dirname, "../../");

// 当前复制工具只处理包说明文档，不复制其他类型文件。
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
 * 最终会用 @mt-kit/conf 作为包名来源。
 *
 * @param {string} packageDir 包目录的绝对路径
 * @returns {string | undefined} package.json 中的 name 字段
 */
function readPackageName(packageDir) {
  const packageJsonPath = path.join(packageDir, packageJsonFileName);

  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  return packageJson.name;
}

/**
 * 将 package.json.name 转成安全的 markdown 文件名。
 *
 * scoped package 的 name 中会包含 /，例如 @mt-kit/conf。
 * 如果直接把它作为文件名，/ 会被 path.join 当成目录分隔符，
 * 所以这里统一替换成 -，最终输出为 @mt-kit-conf.md。
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
 * -> src/micro-tools/@mt-kit-conf.md
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
 * 执行 README.md 复制操作。
 *
 * 配置示例：
 * {
 *   outDir: "src/micro-tools",      // 输出目录，相对项目根目录
 *   entry: "packages/micro-tools",  // 源入口目录，相对项目根目录
 *   file: /^packages-/,             // 只复制命中的一级或二级包目录
 *   ignore: ["packages-demo"],      // 排除指定一级或二级包目录
 * }
 *
 * 复制规则：
 * 1. 始终只复制 README.md。
 * 2. 输出文件名来自包目录 package.json.name，例如 @mt-kit/conf -> @mt-kit-conf.md。
 * 3. file 用于缩小复制范围，支持匹配一级分类目录和二级包目录。
 * 4. ignore 优先级高于 file，命中 ignore 的目录不会复制。
 * 5. 未传 file 时，兼容旧逻辑：优先复制 entry 自身的 README.md；
 *    如果 entry 自身没有 README.md，则复制 entry 下最多二级目录中的包 README.md。
 *
 * @param {Array<{
 *   outDir: string;
 *   entry: string;
 *   file?: string | RegExp | Array<string | RegExp>;
 *   ignore?: Array<string | RegExp>;
 * }>} files 复制配置列表
 */
export default function executeFileCopy(files) {
  files.forEach(({
    outDir,
    entry,
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
