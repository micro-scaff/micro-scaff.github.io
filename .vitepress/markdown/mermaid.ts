import type MarkdownIt from "markdown-it";

const mermaidComponentPath = "/.vitepress/markdown/MermaidDiagram.vue";

function isMermaidFence(info: string): boolean {
  return info.trim().split(/\s+/, 1)[0].toLowerCase() === "mermaid";
}

/**
 * 把 Mermaid fenced code block 转成 Vue 组件。
 *
 * 保留其它代码块原有的 Shiki 高亮行为，只处理语言名完全等于 mermaid 的
 * 代码块。源码先进行 URI 编码，避免引号、尖括号和换行破坏生成的 Vue 模板。
 */
export function mermaidMarkdownPlugin(markdown: MarkdownIt): void {
  const renderFence = markdown.renderer.rules.fence;

  // 只给实际包含 Mermaid 的页面注入局部组件导入。普通 Markdown 不会加载
  // MermaidDiagram，也不再依赖主题 enhanceApp 的全局组件注册。
  markdown.core.ruler.after("block", "mermaid-component-import", state => {
    if (!state.tokens.some(token => (
      token.type === "fence" && isMermaidFence(token.info)
    ))) {
      return;
    }

    const importToken = new state.Token("html_block", "", 0);
    importToken.content = [
      '<script setup lang="ts">',
      `import MermaidDiagram from "${mermaidComponentPath}";`,
      "</script>",
      ""
    ].join("\n");
    state.tokens.unshift(importToken);
  });

  markdown.renderer.rules.fence = (tokens, index, options, environment, self) => {
    const token = tokens[index];

    if (!isMermaidFence(token.info)) {
      return renderFence
        ? renderFence(tokens, index, options, environment, self)
        : self.renderToken(tokens, index, options);
    }

    const source = encodeURIComponent(token.content.trim());

    return `<MermaidDiagram source="${source}" />\n`;
  };
}
