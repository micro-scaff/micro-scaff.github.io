import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 获取当前文件的路径
const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

export default function executeFileCopy(files) {
  const outputDir = path.resolve(__dirname, `../../`);
  console.log(outputDir, "outputDir");

  
}
