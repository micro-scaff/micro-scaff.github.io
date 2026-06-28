/**
 * 复制配置说明：
 *
 * outDir:
 * - 输出目录，相对项目根目录。
 *
 * entry:
 * - 源目录，相对项目根目录。
 *
 * copyFiles:
 * - 不传或 false：使用包 README 模式。
 *   只复制包目录中的 README.md，并使用 package.json.name 生成输出文件名。
 *   如果包目录在二级目录下，会保留父目录，例如 packages-dev/eslint-config -> packages-dev/eslint-config.md。
 * - true：使用普通文件模式。
 *   不读取 package.json，不重命名文件，直接按原文件名复制，并保留相对目录结构。
 *
 * file:
 * - 包 README 模式：匹配一级或二级包目录名，例如 /^packages-/。
 * - 普通文件模式：同时匹配文件名和相对 entry 的路径。
 *   例如 /\.md$/ 匹配所有 markdown 文件，/^images\// 匹配 images 目录下的所有文件。
 * - 支持 string、RegExp、Array<string | RegExp>。
 *
 * ignore:
 * - 忽略规则，优先级高于 file。
 * - 普通文件模式下同样会匹配文件名和相对路径。
 */
const copyConfigs = [
  {
    outDir: "src/micro-tools",
    entry: "packages/micro-tools",
    ignore: ["packages-demo", "packages-docs"],
    file: /^packages-/
  },
  {
    outDir: "src/learn",
    entry: "packages/learn",
    copyFiles: true,
    file: [/\.md$/, /^images\//]
  }
];

import { executeFileCopy } from "./utils/index.js";

executeFileCopy(copyConfigs);
