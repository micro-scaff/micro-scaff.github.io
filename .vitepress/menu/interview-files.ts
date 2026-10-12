import type {
  DefaultTheme
} from "vitepress";

interface IMenuRules {
  nav: DefaultTheme.NavItemWithLink;
  menu: DefaultTheme.SidebarItem[];
}

/** Interview Files 使用独立站点，不再生成本地文档菜单。 */
export default function menuInterviewFiles(): IMenuRules {
  return {
    nav: {
      text: "Interview Files",
      link: "https://liyangting.github.io/share-files/"
    },
    menu: []
  };
}

