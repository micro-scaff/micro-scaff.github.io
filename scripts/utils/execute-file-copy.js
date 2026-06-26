import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件的路径
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

export default function executeFileCopy() {
  const outputDir = path.resolve(__dirname, `../../packages/micro-tools/`);
  console.log(outputDir, "outputDir");
}
