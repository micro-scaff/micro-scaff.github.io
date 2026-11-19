import type {
  Theme
} from "vitepress";

import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import MarkdownEditor from "./MarkdownEditor.vue";

// @ts-ignore
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("MarkdownEditor", MarkdownEditor);
  },
} satisfies Theme;
