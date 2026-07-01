import fs from "fs";
import path from "path";
import { matchFile, shouldIgnore } from "./execute-file-copy-matchers.js";

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

/**
 * 复制普通文件，不依赖 package.json，也不重命名文件。
 *
 * @param {string} entryDir 入口目录的绝对路径
 * @param {string} outputDir 输出目录的绝对路径
 * @param {string | RegExp | Array<string | RegExp> | undefined} file 文件匹配规则，会匹配文件名和相对路径
 * @param {Array<string | RegExp>} ignore 忽略规则列表，会匹配文件名和相对路径
 * @param {string | undefined} targetFileName 输出文件名，适用于单文件重命名
 */
export function copyMatchedFiles(entryDir, outputDir, file, ignore = [], targetFileName) {
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

      const targetRelativePath = targetFileName
        ? path.join(path.dirname(relativePath), targetFileName)
        : relativePath;
      const targetFilePath = path.join(outputDir, targetRelativePath);

      fs.mkdirSync(path.dirname(targetFilePath), {
        recursive: true
      });
      fs.copyFileSync(sourcePath, targetFilePath);
    });
  }

  walk(entryDir);
}
