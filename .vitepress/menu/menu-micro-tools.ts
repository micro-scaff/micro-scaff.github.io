import createDirectoryMenu from "./create-directory-menu";

/**
 * micro-tools 菜单规则：
 * - src/micro-tools/*.md 生成一级菜单项。
 * - src/micro-tools/<目录>/*.md 生成分组菜单。
 */
export default function menuMicroTools() {
  return createDirectoryMenu({
    root: "src/micro-tools",
    text: "Micro Tools"
  });
}

