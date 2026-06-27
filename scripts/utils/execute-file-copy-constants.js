import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 当前文件在 scripts/utils 下，所以向上两级就是项目根目录。
export const projectRoot = path.resolve(__dirname, "../../");

export const readmeFileName = "README.md";
export const packageJsonFileName = "package.json";

