import createDirectoryMenu from "./create-directory-menu";

/**
 * learn 菜单规则：
 * - src/learn/*.md 生成一级菜单项。
 * - src/learn/<目录>/*.md 生成分组菜单。
 */
export default function menuLearn() {
  return createDirectoryMenu({
    root: "src/learn",
    text: "Learn"
  });
}

