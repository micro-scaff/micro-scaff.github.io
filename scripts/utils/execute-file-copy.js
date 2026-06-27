import fs from "fs";
import path from "path";
import { projectRoot, readmeFileName } from "./execute-file-copy-constants.js";
import { copyMatchedFiles } from "./execute-file-copy-matched-files.js";
import { copyEntryReadme, copyPackageReadmes } from "./execute-file-copy-package-readmes.js";

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
 * 复制规则：
 * 1. 默认包 README 模式始终只复制 README.md。
 * 2. 输出文件名来自包目录 package.json.name，并移除公共前缀 @mt-kit/，例如 @mt-kit/conf -> conf.md。
 *    二级包会保留父目录，例如 packages-dev/eslint-config -> packages-dev/eslint-config.md。
 * 3. file 用于缩小复制范围，支持匹配一级分类目录和二级包目录。
 * 4. ignore 优先级高于 file，命中 ignore 的目录不会复制。
 * 5. 未传 file 时，兼容旧逻辑：优先复制 entry 自身的 README.md；
 *    如果 entry 自身没有 README.md，则复制 entry 下最多二级目录中的包 README.md。
 * 6. copyFiles 为 true 时，复制普通文件，file / ignore 支持匹配文件名和相对路径。
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

    fs.mkdirSync(outputDir, {
      recursive: true
    });

    if (copyFiles) {
      copyMatchedFiles(entryDir, outputDir, file, ignore);
      return;
    }

    if (!file && fs.existsSync(entryReadmePath)) {
      copyEntryReadme(entryDir, outputDir);
      return;
    }

    copyPackageReadmes(entryDir, outputDir, file, ignore);
  });
}
