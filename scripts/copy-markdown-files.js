/**
 * outDir 输出目录
 * entry 入口
 * file 只复制匹配到的一级或二级包目录
 * ignore 要忽略的文件名
 */
const copyConfigs = [
  {
    outDir: "src/micro-tools",
    entry: "packages/micro-tools",
    ignore: ["packages-demo", "packages-docs"],
    file: /^packages-/
  },
];

import { executeFileCopy } from "./utils/index.js";

executeFileCopy(copyConfigs);
