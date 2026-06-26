/**
 * outDir 输出目录
 * entry 入口
 * ignore 要忽略的文件名
 */
const copyConfigs = [
  {
    outDir: "",
    entry: "packages/micro-tools",
    ignore: [],
  },
];

import { executeFileCopy } from "./utils/index.js";

executeFileCopy(copyConfigs);
