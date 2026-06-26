/**
 * outDir 输出目录
 * entry 入口
 * ignore 要忽略的文件名
 */
const copyConfigs = [
  {
    outDir: "src/micro-tools",
    entry: "packages/micro-tools",
    ignore: [],
    file: /^packages-/
  },
];

import { executeFileCopy } from "./utils/index.js";

executeFileCopy(copyConfigs);
