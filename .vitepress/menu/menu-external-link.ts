import type {
  DefaultTheme
} from "vitepress";

const externalLinkItems = [
  {
    text: "前端学习与面试笔记",
    link: "https://liyangting.github.io/share-files/",
  }
];

/**
 * 顶部导航中的外部链接集合。
 *
 * 使用带 items 的导航项后，VitePress 会在鼠标划过时展示下拉菜单。
 */
export default function menuExternalLink(): DefaultTheme.NavItemWithChildren {
  return {
    text: '<span class="external-link-menu-label vp-external-link-icon">外部链接</span>',
    items: externalLinkItems.map(item => ({
      text: item.text,
      link: item.link,
      noIcon: true
    }))
  };
}
