import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Micro Scaff",
  description: "Micro Scaff",
  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
    ],
    [
      "meta",
      {
        name: "theme-color",
        content: "#5f67ee",
      },
    ],
    [
      "meta",
      {
        property: "og:type",
        content: "website",
      },
    ],
    [
      "meta",
      {
        property: "og:site_name",
        content: "Micro Tools",
      },
    ],
  ],
  themeConfig: {
    logo: "/favicon.svg",
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/micro-scaff/",
      },
      {
        icon: "juejin",
        link: "https://juejin.im/user/3465273327490062/posts",
      },
      {
        icon: "npm",
        link: "https://www.npmjs.com/~not-have-warehouse",
      },
      {
        icon: "csdn",
        link: "https://blog.csdn.net/qq_45669178",
      },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.636H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>',
        },
        link: "mailto:2233792530@qq.com",
      },
      {
        icon: {
          svg: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        },
        link: "https://github.com/Not-have/demo/",
        ariaLabel: "学习 Demo",
      },
    ],
    footer: {
      message: "基于 MIT 许可发布",
      copyright: `© 2022-${new Date().getFullYear()}`,
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    outline: {
      label: "页面导航",
      level: [2, 3],
    },
  },
});
