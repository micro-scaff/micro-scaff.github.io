<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import morphdom from "morphdom";

// @ts-ignore
const learnMarkdownModules = import.meta.glob<string>("../../packages/learn/**/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
});

type DocumentSource = {
  id: string;
  label: string;
  repository: string;
  description: string;
  imageUpload: boolean;
};

type LocalImage = {
  id: string;
  file: File;
  name: string;
  size: string;
  relativePath: string;
  previewUrl: string;
};

type DocumentFile = {
  id: string;
  name: string;
  path: string;
  folder: string;
  title: string;
  tags: string;
  content: string;
  isNew?: boolean;
};

type DiffLine = {
  type: "context" | "add" | "delete";
  oldLine: number | null;
  newLine: number | null;
  text: string;
};

const sources: DocumentSource[] = [
  {
    id: "learn",
    label: "Learn",
    repository: "Not-have/learn",
    description: "学习笔记与技术记录",
    imageUpload: true,
  },
  {
    id: "interview-files",
    label: "Interview Files",
    repository: "liyangting/interview-files",
    description: "面试资料与题目整理",
    imageUpload: false,
  },
  {
    id: "micro-tools",
    label: "Micro Tools",
    repository: "micro-scaff/micro-tools",
    description: "工具库文档",
    imageUpload: false,
  },
  {
    id: "flow-talk",
    label: "流言",
    repository: "micro-scaff/flow-talk-server",
    description: "项目文档",
    imageUpload: false,
  },
];

const defaultContent = `# 用一句话说清楚这篇文档

在这里写一段简短的背景，让读者快速知道这篇文档解决什么问题。

## 核心内容

- 先描述结论
- 再补充必要的步骤
- 最后给出可以验证的结果

## 示例

\`\`\`ts
export function hello(name: string) {
  return \`Hello, \${name}\`;
}
\`\`\`

> 提示：Learn 支持把图片拖到编辑区，其他文档来源仅支持 Markdown。`;

function createLearnFiles(): DocumentFile[] {
  // @ts-ignore
  return Object.entries(learnMarkdownModules)
    .map(([modulePath, fileContent]) => {
      const relativePath = modulePath.split("/packages/learn/")[1];
      const segments = relativePath.split("/");
      const name = segments.at(-1) ?? relativePath;
      const folder = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
      const documentTitle = name.replace(/\.md$/, "");

      return {
        id: `learn:${relativePath}`,
        name,
        path: relativePath,
        folder,
        title: documentTitle,
        tags: "",
        content: fileContent,
      };
    })
    // 与 VitePress 服务端生成 Learn 侧栏时的 Node 排序保持一致。
    // 浏览器在中文系统下默认会按拼音排序，因此这里固定使用英文 locale。
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

const learnFiles = createLearnFiles();

const filesBySource = ref<Record<string, DocumentFile[]>>({
  learn: learnFiles,
  "interview-files": [
    {
      id: "interview-js",
      name: "javascript.md",
      path: "docs/frontend/javascript.md",
      folder: "docs/frontend",
      title: "JavaScript 面试题整理",
      tags: "JavaScript, 面试",
      content: "# JavaScript 面试题整理\n\n## 作用域与闭包\n\n在这里整理问题与答案。",
    },
    {
      id: "interview-network",
      name: "network.md",
      path: "docs/fundamentals/network.md",
      folder: "docs/fundamentals",
      title: "计算机网络基础",
      tags: "网络, 面试",
      content: "# 计算机网络基础\n\n记录常见网络问题。",
    },
  ],
  "micro-tools": [
    {
      id: "tools-readme",
      name: "README.md",
      path: "README.md",
      folder: "仓库根目录",
      title: "Micro Tools",
      tags: "工具, 文档",
      content: "# Micro Tools\n\n工具库使用说明。",
    },
  ],
  "flow-talk": [
    {
      id: "flow-api",
      name: "api.md",
      path: "docs/api.md",
      folder: "docs",
      title: "接口说明",
      tags: "API, 项目文档",
      content: "# 接口说明\n\n记录服务端接口。",
    },
  ],
});

const originalFileLocations = new Map<string, { name: string; path: string }>();
Object.values(filesBySource.value).flat().forEach(file => {
  originalFileLocations.set(file.id, { name: file.name, path: file.path });
});

const selectedSourceId = ref("learn");
const selectedFileId = ref(learnFiles[0]?.id ?? "");
const title = ref(learnFiles[0]?.title ?? "");
const tags = ref(learnFiles[0]?.tags ?? "");
const content = ref(learnFiles[0]?.content ?? defaultContent);
const localImages = ref<LocalImage[]>([]);
const textarea = ref<HTMLTextAreaElement>();
const previewPane = ref<HTMLElement>();
const saveState = ref<"idle" | "saved" | "saving">("idle");
const imageNotice = ref("");
const isDragging = ref(false);
const createDialogOpen = ref(false);
const newFileName = ref("");
const renameDialogOpen = ref(false);
const renameConfirmStep = ref(false);
const renameFileName = ref("");
const deleteDialogOpen = ref(false);
const pendingDeleteFile = ref<DocumentFile>();
const submitReviewOpen = ref(false);
const submissionError = ref("");
const renamedFileIds = ref(new Set<string>());
const highlightVersion = ref(0);
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let imageNoticeTimer: ReturnType<typeof setTimeout> | undefined;
let mermaidRenderVersion = 0;
let isSynchronizingScroll = false;
let isHydratingFile = true;
let codeHighlighter: any;

const selectedSource = computed(() => (
  sources.find(source => source.id === selectedSourceId.value) ?? sources[0]
));

const imageUploadEnabled = computed(() => selectedSource.value.imageUpload);

const activeFiles = computed(() => filesBySource.value[selectedSourceId.value] ?? []);

const selectedFile = computed(() => (
  activeFiles.value.find(file => file.id === selectedFileId.value) ?? activeFiles.value[0]
));

const folderGroups = computed(() => {
  const groups = new Map<string, DocumentFile[]>();
  activeFiles.value.forEach(file => {
    const current = groups.get(file.folder) ?? [];
    current.push(file);
    groups.set(file.folder, current);
  });
  return Array.from(groups, ([folder, files]) => ({ folder, files }));
});

const slug = computed(() => {
  const normalized = title.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "untitled-document";
});

const documentPath = computed(() => selectedFile.value?.path ?? `history/${slug.value}.md`);

const isDirty = computed(() => {
  const file = selectedFile.value;
  if (!file) return false;
  return Boolean(
    file.isNew
    || renamedFileIds.value.has(file.id)
    || title.value !== file.title
    || tags.value !== file.tags
    || content.value !== file.content
    || localImages.value.length,
  );
});

const normalizedNewFileName = computed(() => normalizeMarkdownFileName(newFileName.value));
const normalizedRenameFileName = computed(() => normalizeMarkdownFileName(renameFileName.value));

const createFileError = computed(() => validateFileName(normalizedNewFileName.value));
const renameFileError = computed(() => validateFileName(normalizedRenameFileName.value, selectedFileId.value));

const diffLines = computed(() => buildDiffLines(selectedFile.value?.content ?? "", content.value));
const addedLineCount = computed(() => diffLines.value.filter(line => line.type === "add").length);
const deletedLineCount = computed(() => diffLines.value.filter(line => line.type === "delete").length);

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const markdownRenderer = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});

const languageAliases: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  md: "markdown",
  text: "plaintext",
  txt: "plaintext",
};

function renderCodeBlock(code: string, language: string) {
  const normalizedLanguage = (languageAliases[language] ?? language) || "plaintext";
  let highlighted = `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  if (codeHighlighter) {
    try {
      const loadedLanguages = codeHighlighter.getLoadedLanguages() as string[];
      const shikiLanguage = loadedLanguages.includes(normalizedLanguage) ? normalizedLanguage : "plaintext";
      highlighted = codeHighlighter.codeToHtml(code, {
        lang: shikiLanguage,
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
        defaultColor: false,
      });
    } catch {
      // 未识别的语言按照 VitePress 的纯文本代码块降级展示。
    }
  }
  return `<div class="language-${escapeHtml(normalizedLanguage)}"><button type="button" class="copy" title="复制代码" data-copied="已复制"></button><span class="lang">${escapeHtml(language || "text")}</span>${highlighted}</div>`;
}

async function initializeCodeHighlighter() {
  if (codeHighlighter || typeof window === "undefined") return;
  const { createHighlighter } = await import("shiki");
  codeHighlighter = await createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [
      "plaintext", "javascript", "typescript", "vue", "html", "css", "json",
      "bash", "python", "java", "c", "cpp", "go", "sql", "yaml", "markdown",
    ],
  });
  highlightVersion.value += 1;
}

markdownRenderer.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase();
  if (language === "mermaid") {
    return `<div class="mermaid-block" data-mermaid-source="${encodeURIComponent(token.content)}"><span>正在渲染 Mermaid 图表…</span></div>`;
  }
  return renderCodeBlock(token.content, language);
};

const defaultImageRenderer = markdownRenderer.renderer.rules.image;
markdownRenderer.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = token.attrGet("src") ?? "";
  const localImage = localImages.value.find(image => image.relativePath === src);
  const normalizedSrc = src.replace(/^\.\//, "");
  const repositorySrc = selectedSourceId.value === "learn" && normalizedSrc.startsWith("images/")
    ? `/learn/${normalizedSrc}`
    : src;
  token.attrSet("src", localImage?.previewUrl ?? repositorySrc);
  token.attrSet("loading", "lazy");
  return defaultImageRenderer?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options);
};

markdownRenderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return self.renderToken(tokens, index, options);
};

function renderMarkdown(value: string): string {
  void highlightVersion.value;
  return markdownRenderer.render(value.replace(/\r\n?/g, "\n"));
}

const previewHtml = computed(() => renderMarkdown(content.value));

function patchPreviewHtml(html = previewHtml.value) {
  const pane = previewPane.value;
  if (!pane) return;
  const nextPane = pane.cloneNode(false) as HTMLElement;
  nextPane.innerHTML = html;
  morphdom(pane, nextPane, {
    childrenOnly: true,
    onBeforeElUpdated(fromElement, toElement) {
      return !fromElement.isEqualNode(toElement);
    },
  });
}

async function refreshPreview(html = previewHtml.value) {
  await nextTick();
  patchPreviewHtml(html);
  await renderMermaidDiagrams();
}

async function renderMermaidDiagrams() {
  if (typeof window === "undefined") return;
  const version = ++mermaidRenderVersion;
  await nextTick();
  const blocks = previewPane.value?.querySelectorAll<HTMLElement>(".mermaid-block");
  if (!blocks?.length) return;

  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
  });

  for (const [index, block] of Array.from(blocks).entries()) {
    if (version !== mermaidRenderVersion) return;
    try {
      const source = decodeURIComponent(block.dataset.mermaidSource ?? "");
      const { svg, bindFunctions } = await mermaid.render(`editor-mermaid-${version}-${index}`, source);
      if (version !== mermaidRenderVersion) return;
      block.innerHTML = svg;
      bindFunctions?.(block);
    } catch (error) {
      block.textContent = `Mermaid 图表解析失败：${error instanceof Error ? error.message : "语法错误"}`;
      block.classList.add("has-error");
    }
  }
}

function synchronizeScroll(source: "write" | "preview") {
  if (isSynchronizingScroll) return;
  const sourceElement = source === "write" ? textarea.value : previewPane.value;
  const targetElement = source === "write" ? previewPane.value : textarea.value;
  if (!sourceElement || !targetElement) return;

  const sourceRange = sourceElement.scrollHeight - sourceElement.clientHeight;
  const targetRange = targetElement.scrollHeight - targetElement.clientHeight;
  if (sourceRange <= 0 || targetRange <= 0) return;

  isSynchronizingScroll = true;
  targetElement.scrollTop = (sourceElement.scrollTop / sourceRange) * targetRange;
  window.requestAnimationFrame(() => {
    isSynchronizingScroll = false;
  });
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  return name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `image-${Date.now()}.png`;
}

function showImageNotice(message: string) {
  imageNotice.value = message;
  if (imageNoticeTimer) clearTimeout(imageNoticeTimer);
  imageNoticeTimer = setTimeout(() => {
    imageNotice.value = "";
  }, 2400);
}

function addFiles(files: FileList | File[], fromClipboard = false) {
  if (!imageUploadEnabled.value) return;
  const markdownImages: string[] = [];
  Array.from(files).forEach((file, index) => {
    if (!file.type.startsWith("image/")) return;
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const clipboardName = `image-${Date.now()}-${index + 1}.${extension}`;
    const name = safeFileName(fromClipboard ? clipboardName : file.name);
    const relativePath = `./images/${name}`;
    const image: LocalImage = {
      id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
      file,
      name,
      size: formatBytes(file.size),
      relativePath,
      previewUrl: URL.createObjectURL(file),
    };
    localImages.value.push(image);
    markdownImages.push(`![${name.replace(/\.[^.]+$/, "")}](${relativePath})`);
  });

  if (!markdownImages.length) return;
  const markdown = `${markdownImages.join("\n\n")}\n`;
  const element = textarea.value;
  if (element) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    content.value = `${content.value.slice(0, start)}${markdown}${content.value.slice(end)}`;
    nextTick(() => {
      element.focus();
      element.setSelectionRange(start + markdown.length, start + markdown.length);
    });
  } else {
    const separator = content.value.endsWith("\n") ? "" : "\n\n";
    content.value += `${separator}${markdown}`;
  }
  showImageNotice(`${markdownImages.length} 张图片已插入正文`);
}

function handleDrop(event: DragEvent) {
  isDragging.value = false;
  if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
}

function handlePaste(event: ClipboardEvent) {
  if (!imageUploadEnabled.value || !event.clipboardData) return;
  const files = Array.from(event.clipboardData.items)
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (!files.length) return;
  event.preventDefault();
  addFiles(files, true);
}

function resetDraft() {
  const file = selectedFile.value;
  if (!file) return;
  title.value = file.title;
  tags.value = file.tags;
  content.value = file.content;
  if (!file.isNew) {
    const originalLocation = originalFileLocations.get(file.id);
    if (originalLocation) {
      file.name = originalLocation.name;
      file.path = originalLocation.path;
    }
    renamedFileIds.value.delete(file.id);
  }
  localImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl));
  localImages.value = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(`micro-scaff-editor-draft:${file.id}`);
  }
}

function openFile(file: DocumentFile) {
  if (file.id === selectedFileId.value) return;
  localImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl));
  localImages.value = [];
  selectedFileId.value = file.id;
}

function normalizeMarkdownFileName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
}

function validateFileName(fileName: string, excludedId = "") {
  if (!fileName) return "请先填写文件名";
  if (/[\\/:*?"<>|]/.test(fileName)) return "文件名不能包含 \\ / : * ? \" < > |";
  const duplicated = activeFiles.value.some(file => (
    file.id !== excludedId && file.name.toLowerCase() === fileName.toLowerCase()
  ));
  return duplicated ? "当前目录已存在同名文件" : "";
}

function openCreateDialog() {
  newFileName.value = "";
  createDialogOpen.value = true;
}

function createFile() {
  if (createFileError.value) return;
  const fileName = normalizedNewFileName.value;
  const documentTitle = fileName.replace(/\.md$/i, "");
  const id = `${selectedSourceId.value}-draft-${Date.now()}`;
  const file: DocumentFile = {
    id,
    name: fileName,
    path: fileName,
    folder: "",
    title: documentTitle,
    tags: "",
    content: `# ${documentTitle}\n\n`,
    isNew: true,
  };
  filesBySource.value[selectedSourceId.value].push(file);
  selectedFileId.value = id;
  createDialogOpen.value = false;
}

function openRenameDialog() {
  if (!selectedFile.value) return;
  renameFileName.value = selectedFile.value.name;
  renameConfirmStep.value = false;
  renameDialogOpen.value = true;
}

function requestRenameConfirmation() {
  if (renameFileError.value || normalizedRenameFileName.value === selectedFile.value?.name) return;
  renameConfirmStep.value = true;
}

function confirmRenameFile() {
  const file = selectedFile.value;
  if (!file || renameFileError.value) return;
  const oldBaseName = file.name.replace(/\.md$/i, "");
  const nextName = normalizedRenameFileName.value;
  file.name = nextName;
  file.path = file.folder ? `${file.folder}/${nextName}` : nextName;
  if (title.value === oldBaseName) title.value = nextName.replace(/\.md$/i, "");
  if (!file.isNew) renamedFileIds.value.add(file.id);
  renameDialogOpen.value = false;
  renameConfirmStep.value = false;
}

function openDeleteDialog(file: DocumentFile) {
  if (!file.isNew) return;
  pendingDeleteFile.value = file;
  deleteDialogOpen.value = true;
}

function confirmDeleteFile() {
  const file = pendingDeleteFile.value;
  if (!file?.isNew) return;
  const sourceFiles = filesBySource.value[selectedSourceId.value];
  const fileIndex = sourceFiles.findIndex(item => item.id === file.id);
  if (fileIndex < 0) return;

  if (file.id === selectedFileId.value) {
    localImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl));
    localImages.value = [];
    const nextFile = sourceFiles[fileIndex + 1] ?? sourceFiles[fileIndex - 1];
    selectedFileId.value = nextFile?.id ?? "";
  }
  sourceFiles.splice(fileIndex, 1);
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(`micro-scaff-editor-draft:${file.id}`);
  }
  pendingDeleteFile.value = undefined;
  deleteDialogOpen.value = false;
}

function buildDiffLines(previous: string, next: string): DiffLine[] {
  const oldLines = previous ? previous.replace(/\r\n?/g, "\n").split("\n") : [];
  const newLines = next ? next.replace(/\r\n?/g, "\n").split("\n") : [];
  if (oldLines.length * newLines.length > 2_000_000) {
    let prefixLength = 0;
    while (prefixLength < oldLines.length && prefixLength < newLines.length && oldLines[prefixLength] === newLines[prefixLength]) {
      prefixLength += 1;
    }
    let suffixLength = 0;
    while (
      suffixLength < oldLines.length - prefixLength
      && suffixLength < newLines.length - prefixLength
      && oldLines[oldLines.length - 1 - suffixLength] === newLines[newLines.length - 1 - suffixLength]
    ) {
      suffixLength += 1;
    }
    return [
      ...oldLines.slice(0, prefixLength).map((text, index): DiffLine => ({ type: "context", oldLine: index + 1, newLine: index + 1, text })),
      ...oldLines.slice(prefixLength, oldLines.length - suffixLength).map((text, index): DiffLine => ({ type: "delete", oldLine: prefixLength + index + 1, newLine: null, text })),
      ...newLines.slice(prefixLength, newLines.length - suffixLength).map((text, index): DiffLine => ({ type: "add", oldLine: null, newLine: prefixLength + index + 1, text })),
      ...oldLines.slice(oldLines.length - suffixLength).map((text, index): DiffLine => ({
        type: "context",
        oldLine: oldLines.length - suffixLength + index + 1,
        newLine: newLines.length - suffixLength + index + 1,
        text,
      })),
    ];
  }
  const rows = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1));

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      rows[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? rows[oldIndex + 1][newIndex + 1] + 1
        : Math.max(rows[oldIndex + 1][newIndex], rows[oldIndex][newIndex + 1]);
    }
  }

  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      result.push({ type: "context", oldLine: oldIndex + 1, newLine: newIndex + 1, text: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (newIndex < newLines.length && (oldIndex === oldLines.length || rows[oldIndex][newIndex + 1] >= rows[oldIndex + 1][newIndex])) {
      result.push({ type: "add", oldLine: null, newLine: newIndex + 1, text: newLines[newIndex] });
      newIndex += 1;
    } else {
      result.push({ type: "delete", oldLine: oldIndex + 1, newLine: null, text: oldLines[oldIndex] });
      oldIndex += 1;
    }
  }
  return result;
}

function openSubmitReview() {
  if (!isDirty.value) return;
  submissionError.value = "";
  submitReviewOpen.value = true;
}

async function handoffToGitHub() {
  const issueUrl = new URL("https://github.com/micro-scaff/micro-scaff.github.io/issues/new");
  issueUrl.searchParams.set("template", "publish-history-document.yml");
  issueUrl.searchParams.set("title", `[文档发布] ${title.value.trim() || selectedFile.value?.name || "未命名文档"}`);

  try {
    await navigator.clipboard.writeText(content.value);
    submissionError.value = "";
    window.open(issueUrl.toString(), "_blank", "noopener,noreferrer");
  } catch {
    submissionError.value = "浏览器未允许复制正文，请允许剪贴板权限后重试。";
  }
}

async function handlePreviewClick(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.copy");
  if (!button) return;
  const code = button.parentElement?.querySelector("code")?.textContent ?? "";
  await navigator.clipboard.writeText(code);
  button.classList.add("copied");
  window.setTimeout(() => button.classList.remove("copied"), 1600);
}

watch([title, tags, content, () => selectedFile.value?.path, () => localImages.value.length], () => {
  if (typeof window === "undefined") return;
  const file = selectedFile.value;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  if (!file || isHydratingFile) return;
  if (!isDirty.value) {
    window.localStorage.removeItem(`micro-scaff-editor-draft:${file.id}`);
    saveState.value = "idle";
    return;
  }
  saveState.value = "saving";
  const draftFileId = file.id;
  const draft = {
    title: title.value,
    tags: tags.value,
    content: content.value,
    name: file.name,
    path: file.path,
  };
  saveTimer = setTimeout(() => {
    window.localStorage.setItem(`micro-scaff-editor-draft:${draftFileId}`, JSON.stringify(draft));
    saveTimer = undefined;
    if (selectedFileId.value === draftFileId && isDirty.value) saveState.value = "saved";
  }, 500);
});

watch(previewHtml, html => {
  void refreshPreview(html);
}, { flush: "post" });

watch(selectedSourceId, () => {
  const firstFile = activeFiles.value[0];
  if (firstFile) selectedFileId.value = firstFile.id;
  if (!imageUploadEnabled.value) {
    localImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl));
    localImages.value = [];
  }
});

watch(selectedFileId, () => {
  const file = selectedFile.value;
  if (!file) return;
  isHydratingFile = true;
  const saved = typeof window !== "undefined"
    ? window.localStorage.getItem(`micro-scaff-editor-draft:${file.id}`)
    : null;
  if (saved) {
    try {
      const draft = JSON.parse(saved);
      title.value = draft.title ?? file.title;
      tags.value = draft.tags ?? file.tags;
      content.value = draft.content ?? file.content;
      if (draft.name && draft.path) {
        const wasRenamed = draft.name !== file.name || draft.path !== file.path;
        file.name = draft.name;
        file.path = draft.path;
        if (!file.isNew && wasRenamed) renamedFileIds.value.add(file.id);
      }
      saveState.value = "saved";
      void nextTick(() => { isHydratingFile = false; });
      return;
    } catch {
      window.localStorage.removeItem(`micro-scaff-editor-draft:${file.id}`);
    }
  }
  title.value = file.title;
  tags.value = file.tags;
  content.value = file.content;
  saveState.value = "idle";
  void nextTick(() => { isHydratingFile = false; });
});

onMounted(() => {
  window.localStorage.removeItem("micro-scaff-editor-draft");
  const saved = window.localStorage.getItem(`micro-scaff-editor-draft:${selectedFileId.value}`);
  if (!saved) {
    isHydratingFile = false;
    void initializeCodeHighlighter();
    void refreshPreview();
    return;
  }
  try {
    const draft = JSON.parse(saved);
    title.value = draft.title || selectedFile.value?.title || "";
    tags.value = draft.tags || selectedFile.value?.tags || "";
    content.value = draft.content || defaultContent;
    const file = selectedFile.value;
    if (file && draft.name && draft.path) {
      const wasRenamed = draft.name !== file.name || draft.path !== file.path;
      file.name = draft.name;
      file.path = draft.path;
      if (!file.isNew && wasRenamed) renamedFileIds.value.add(file.id);
    }
    saveState.value = "saved";
  } catch {
    window.localStorage.removeItem(`micro-scaff-editor-draft:${selectedFileId.value}`);
  }
  isHydratingFile = false;
  void initializeCodeHighlighter();
  void refreshPreview();
});

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  if (imageNoticeTimer) clearTimeout(imageNoticeTimer);
  localImages.value.forEach(image => URL.revokeObjectURL(image.previewUrl));
});
</script>

<template>
  <main class="markdown-editor-shell">
    <header class="editor-header">
      <div class="editor-brand">
        <span class="editor-eyebrow">文档工作台</span>
        <h1>在线编辑</h1>
      </div>

      <div class="compact-title-field">
        <span class="title-document-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4"/><path d="M9 13h6M9 17h4"/></svg>
        </span>
        <label class="title-input-group" for="document-title">
          <span>文档标题</span>
          <input id="document-title" v-model="title" type="text" maxlength="100" placeholder="请输入文档标题" />
        </label>
        <button type="button" class="file-path-button" title="修改文件名" @click.prevent="openRenameDialog">
          <span>{{ documentPath }}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l3.5-.8L19 7.7a1.8 1.8 0 0 0 0-2.5l-.2-.2a1.8 1.8 0 0 0-2.5 0L4.8 16.5 4 20Z"/></svg>
        </button>
      </div>

      <div class="editor-header-actions">
        <span
          v-if="isDirty && saveState !== 'idle'"
          class="save-state"
          :class="{ saving: saveState === 'saving' }"
        >
          <span aria-hidden="true"></span>
          {{ saveState === "saving" ? "正在保存" : "草稿已保存在本机" }}
        </span>
        <button class="secondary-button" type="button" :disabled="!isDirty" @click="resetDraft">重置草稿</button>
        <button class="primary-button" type="button" :disabled="!isDirty" @click="openSubmitReview">
          自动发布到 GitHub
        </button>
      </div>
    </header>

    <div class="editor-main-layout">
      <aside class="document-sidebar" aria-label="文档目录">
        <div class="sidebar-heading">
          <span>
            <small>当前仓库</small>
            <strong>{{ selectedSource.repository }}</strong>
          </span>
          <button type="button" title="新建 Markdown 文件" @click="openCreateDialog">＋</button>
        </div>

        <nav class="file-tree">
          <div v-for="group in folderGroups" :key="group.folder" class="tree-group">
            <div v-if="group.folder" class="tree-folder">
              <svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/></svg>
              <span>{{ group.folder }}</span>
            </div>
            <div v-for="file in group.files" :key="file.id" class="tree-file-row">
              <button
                class="tree-file"
                :class="{ active: file.id === selectedFileId }"
                type="button"
                @click="openFile(file)"
              >
                <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4"/></svg>
                <span>{{ file.name.replace(/\.md$/, "") }}</span>
                <i v-if="file.id === selectedFileId" aria-label="当前文件"></i>
              </button>
              <button
                v-if="file.isNew"
                class="delete-file-button"
                type="button"
                :aria-label="`删除 ${file.name}`"
                :title="`删除 ${file.name}`"
                @click="openDeleteDialog(file)"
              >
                <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
              </button>
            </div>
          </div>
        </nav>

        <div class="sidebar-summary">
          <span>{{ activeFiles.length }} 个 Markdown 文件</span>
          <small>{{ imageUploadEnabled ? "当前目录支持图片" : "当前目录仅支持文本" }}</small>
        </div>
      </aside>

      <div class="editor-content-column">
    <section class="editor-workspace">
      <div class="workspace-body">
        <div class="write-pane">
          <span v-if="imageNotice" class="paste-notice">{{ imageNotice }}</span>
          <textarea
            ref="textarea"
            v-model="content"
            aria-label="Markdown 正文"
            spellcheck="false"
            @scroll="synchronizeScroll('write')"
            @paste="handlePaste"
            @dragenter.prevent="isDragging = imageUploadEnabled"
            @dragover.prevent
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
          ></textarea>
          <div v-if="isDragging" class="drop-overlay">
            <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/></svg>
            <strong>松开即可加入文档</strong>
          </div>
        </div>

        <article
          ref="previewPane"
          class="preview-pane editor-preview vp-doc"
          tabindex="0"
          @scroll="synchronizeScroll('preview')"
          @click="handlePreviewClick"
        ></article>
      </div>
    </section>
      </div>
    </div>

    <div v-if="createDialogOpen" class="dialog-backdrop" @click.self="createDialogOpen = false">
      <form class="editor-dialog" @submit.prevent="createFile">
        <div class="dialog-heading">
          <div>
            <small>新建 Markdown 文件</small>
            <h2>先填写文件名</h2>
          </div>
          <button type="button" aria-label="关闭" @click="createDialogOpen = false">×</button>
        </div>
        <label class="dialog-field">
          <span>文件名</span>
          <input v-model="newFileName" autofocus placeholder="例如：vitepress-guide.md" />
          <small :class="{ error: createFileError && newFileName.trim() }">
            {{ newFileName.trim() ? (createFileError || `将创建 ${normalizedNewFileName}`) : "必须填写后才能创建" }}
          </small>
        </label>
        <div class="dialog-actions">
          <button type="button" class="secondary-button" @click="createDialogOpen = false">取消</button>
          <button type="submit" class="primary-button" :disabled="Boolean(createFileError)">创建文件</button>
        </div>
      </form>
    </div>

    <div v-if="renameDialogOpen" class="dialog-backdrop" @click.self="renameDialogOpen = false">
      <form class="editor-dialog" @submit.prevent="renameConfirmStep ? confirmRenameFile() : requestRenameConfirmation()">
        <div class="dialog-heading">
          <div>
            <small>修改文件名</small>
            <h2>{{ renameConfirmStep ? "再次确认重命名" : "输入新的文件名" }}</h2>
          </div>
          <button type="button" aria-label="关闭" @click="renameDialogOpen = false">×</button>
        </div>
        <template v-if="!renameConfirmStep">
          <label class="dialog-field">
            <span>新文件名</span>
            <input v-model="renameFileName" autofocus />
            <small :class="{ error: Boolean(renameFileError) }">{{ renameFileError || `新路径：${selectedFile?.folder ? `${selectedFile.folder}/` : ''}${normalizedRenameFileName}` }}</small>
          </label>
        </template>
        <div v-else class="rename-confirmation">
          <p>文件路径将发生变化，请确认没有其他文档依赖旧路径。</p>
          <code>{{ documentPath }}</code>
          <span>↓</span>
          <code>{{ selectedFile?.folder ? `${selectedFile.folder}/` : '' }}{{ normalizedRenameFileName }}</code>
        </div>
        <div class="dialog-actions">
          <button v-if="renameConfirmStep" type="button" class="secondary-button" @click="renameConfirmStep = false">返回修改</button>
          <button v-else type="button" class="secondary-button" @click="renameDialogOpen = false">取消</button>
          <button type="submit" class="primary-button" :disabled="Boolean(renameFileError) || normalizedRenameFileName === selectedFile?.name">
            {{ renameConfirmStep ? "确认重命名" : "下一步" }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="deleteDialogOpen" class="dialog-backdrop" @click.self="deleteDialogOpen = false">
      <section class="editor-dialog" role="dialog" aria-modal="true" aria-label="删除新建文件">
        <div class="dialog-heading">
          <div>
            <small>删除新建文件</small>
            <h2>确认删除 {{ pendingDeleteFile?.name }}？</h2>
          </div>
          <button type="button" aria-label="关闭" @click="deleteDialogOpen = false">×</button>
        </div>
        <p class="delete-warning">该文件尚未提交到仓库，删除后会同时清除它在本机保存的草稿。</p>
        <div class="dialog-actions">
          <button type="button" class="secondary-button" @click="deleteDialogOpen = false">取消</button>
          <button type="button" class="danger-button" @click="confirmDeleteFile">确认删除</button>
        </div>
      </section>
    </div>

    <div v-if="submitReviewOpen" class="dialog-backdrop diff-backdrop" @click.self="submitReviewOpen = false">
      <section class="editor-dialog diff-dialog" role="dialog" aria-modal="true" aria-label="提交前核对更改">
        <div class="dialog-heading">
          <div>
            <small>自动发布到 GitHub</small>
            <h2>核对本次更改</h2>
          </div>
          <button type="button" aria-label="关闭" @click="submitReviewOpen = false">×</button>
        </div>
        <div class="diff-summary">
          <strong>{{ documentPath }}</strong>
          <span class="addition">+{{ addedLineCount }}</span>
          <span class="deletion">−{{ deletedLineCount }}</span>
        </div>
        <div v-if="renamedFileIds.has(selectedFileId)" class="rename-summary">
          已重命名：{{ originalFileLocations.get(selectedFileId)?.path }} → {{ documentPath }}
        </div>
        <div class="diff-table" role="table" aria-label="文件内容差异">
          <div class="diff-header">@@ 原始内容 → 当前草稿 @@</div>
          <div v-for="(line, index) in diffLines" :key="`${index}-${line.type}`" class="diff-row" :class="line.type">
            <span class="line-number">{{ line.oldLine ?? '' }}</span>
            <span class="line-number">{{ line.newLine ?? '' }}</span>
            <span class="diff-mark">{{ line.type === 'add' ? '+' : line.type === 'delete' ? '−' : ' ' }}</span>
            <code>{{ line.text || ' ' }}</code>
          </div>
          <div v-if="!diffLines.length" class="empty-diff">正文内容没有变化，仅包含文件名或标题信息调整。</div>
        </div>
        <div class="github-handoff-note">
          <strong>下一步将在 GitHub 完成身份确认</strong>
          <span>点击后会复制当前 Markdown，并打开自动发布表单。请把正文粘贴到“Markdown 正文”字段。</span>
          <span>指定发布人员点击 GitHub 的 Create 后，系统会直接写入 learn/main 并关闭任务，无需创建或合并 PR；只有并发冲突时才转为 PR。</span>
          <span v-if="localImages.length">当前还有 {{ localImages.length }} 张本地图片，请在 GitHub 表单的图片字段中再次粘贴。</span>
          <span v-if="submissionError" class="submission-error">{{ submissionError }}</span>
        </div>
        <div class="dialog-actions">
          <button type="button" class="secondary-button" @click="submitReviewOpen = false">返回编辑</button>
          <button type="button" class="primary-button" @click="handoffToGitHub">复制正文并创建自动发布任务</button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.markdown-editor-shell {
  --editor-border: color-mix(in srgb, var(--vp-c-divider) 82%, transparent);
  --editor-surface: color-mix(in srgb, var(--vp-c-bg) 94%, var(--vp-c-brand-soft));
  display: flex;
  width: 100%;
  height: calc(100vh - var(--vp-nav-height, 64px));
  margin: 0 auto;
  padding: 10px 14px 14px;
  flex-direction: column;
  overflow: hidden;
  color: var(--vp-c-text-1);
}

.editor-header,
.editor-header-actions,
.document-stats,
.editor-note {
  display: flex;
  align-items: center;
}

.editor-header {
  display: grid;
  min-height: 72px;
  flex: 0 0 auto;
  grid-template-areas: "brand title actions";
  grid-template-columns: minmax(190px, 0.75fr) minmax(360px, 1.5fr) minmax(300px, 1fr);
  gap: 16px;
  margin-bottom: 10px;
  padding: 0 4px;
}

.editor-brand {
  display: flex;
  grid-area: brand;
  min-width: 150px;
  align-items: baseline;
  gap: 10px;
}

.editor-eyebrow {
  margin: 0;
  color: var(--vp-c-brand-1);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.editor-header h1 {
  margin: 0;
  border: 0;
  font-size: 20px;
  line-height: 1.15;
  letter-spacing: -0.035em;
}

.compact-title-field {
  display: grid;
  width: 100%;
  max-width: 720px;
  min-width: 0;
  grid-area: title;
  grid-template-columns: 38px minmax(160px, 1fr) minmax(110px, auto);
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow: 0 4px 18px rgb(15 23 42 / 4%);
  justify-self: start;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.compact-title-field:focus-within {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 65%, var(--editor-border));
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft), 0 6px 22px rgb(15 23 42 / 6%);
}

.title-document-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.title-document-icon svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.title-input-group {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.title-input-group > span {
  color: var(--vp-c-text-3);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.compact-title-field input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--vp-c-text-1);
  background: transparent;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
}

.file-path-button {
  display: flex;
  overflow: hidden;
  min-width: 0;
  max-width: 210px;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
}

.file-path-button span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path-button svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.file-path-button:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.editor-header-actions {
  grid-area: actions;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.save-state {
  margin-right: 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  white-space: nowrap;
}

.save-state span {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--vp-c-green-1);
}

.save-state.saving span {
  background: var(--vp-c-yellow-1);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.primary-button,
.secondary-button {
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid var(--editor-border);
  border-radius: 9px;
  font-size: 14px;
  font-weight: 650;
}

.primary-button {
  border-color: var(--vp-c-brand-1);
  color: #fff;
  background: var(--vp-c-brand-1);
}

.primary-button:disabled {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 36%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 54%, var(--vp-c-bg));
  cursor: not-allowed;
}

.secondary-button {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

.secondary-button:disabled {
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  cursor: not-allowed;
}

.editor-settings {
  display: grid;
  grid-template-columns: 1.15fr 1.6fr 1fr minmax(210px, 0.9fr);
  gap: 14px;
  margin-bottom: 16px;
}

.field,
.capability-card {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--editor-border);
  border-radius: 12px;
  background: var(--editor-surface);
}

.field > span:first-child {
  display: block;
  margin-bottom: 7px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.field input,
.field select {
  width: 100%;
  height: 34px;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--vp-c-text-1);
  background: transparent;
  font-size: 15px;
  font-weight: 600;
}

.field input::placeholder {
  color: var(--vp-c-text-3);
  font-weight: 450;
}

.field small,
.capability-card small {
  display: block;
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-wrap {
  position: relative;
  display: block;
}

.select-wrap::after {
  position: absolute;
  top: 50%;
  right: 2px;
  width: 7px;
  height: 7px;
  border-right: 1.5px solid var(--vp-c-text-2);
  border-bottom: 1.5px solid var(--vp-c-text-2);
  content: "";
  pointer-events: none;
  transform: translateY(-70%) rotate(45deg);
}

.field select {
  padding-right: 20px;
  appearance: none;
}

.capability-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.capability-card.enabled {
  border-color: color-mix(in srgb, var(--vp-c-green-1) 45%, var(--editor-border));
  background: color-mix(in srgb, var(--vp-c-green-soft) 65%, var(--vp-c-bg));
}

.capability-icon {
  display: grid;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
}

.enabled .capability-icon {
  color: var(--vp-c-green-1);
  background: color-mix(in srgb, var(--vp-c-green-1) 12%, var(--vp-c-bg));
}

.capability-icon svg,
.drop-overlay svg,
.editor-note svg {
  width: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.capability-card strong {
  display: block;
  margin-bottom: 3px;
  font-size: 14px;
}

.editor-main-layout {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 270px minmax(0, 1fr);
  align-items: stretch;
  gap: 10px;
}

.editor-content-column {
  min-width: 0;
  min-height: 0;
}

.document-sidebar {
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--editor-border);
  border-radius: 14px;
  background: var(--vp-c-bg);
  box-shadow: 0 18px 55px rgb(15 23 42 / 6%);
}

.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 15px 14px;
  border-bottom: 1px solid var(--editor-border);
  background: var(--editor-surface);
}

.sidebar-heading span {
  min-width: 0;
}

.sidebar-heading small,
.sidebar-heading strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-heading small {
  margin-bottom: 3px;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.sidebar-heading strong {
  font-size: 13px;
}

.sidebar-heading button {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 1px solid var(--editor-border);
  border-radius: 8px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  font-size: 20px;
  line-height: 1;
}

.file-tree {
  min-height: 0;
  flex: 1;
  max-height: none;
  overflow: auto;
  padding: 10px 8px;
}

.tree-group + .tree-group {
  margin-top: 9px;
}

.tree-folder,
.tree-file {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.tree-file-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.tree-file-row .tree-file {
  min-width: 0;
  flex: 1;
}

.tree-folder {
  padding: 6px 8px;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
}

.tree-file {
  min-height: 36px;
  padding: 0 8px 0 24px;
  border: 0;
  border-radius: 7px;
  color: var(--vp-c-text-2);
  background: transparent;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  text-align: left;
}

.tree-file:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-default-soft);
}

.tree-file.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  font-weight: 700;
}

.tree-folder svg,
.tree-file svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.tree-folder span,
.tree-file span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-file i {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  margin-left: auto;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
}

.delete-file-button {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  margin-left: 2px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 7px;
  color: var(--vp-c-text-3);
  background: transparent;
}

.delete-file-button:hover {
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}

.delete-file-button svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.sidebar-summary {
  padding: 12px 14px;
  border-top: 1px solid var(--editor-border);
  color: var(--vp-c-text-2);
  background: var(--editor-surface);
}

.sidebar-summary span,
.sidebar-summary small {
  display: block;
}

.sidebar-summary span {
  font-size: 12px;
  font-weight: 650;
}

.sidebar-summary small {
  margin-top: 3px;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.editor-workspace {
  display: flex;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--editor-border);
  border-radius: 14px;
  background: var(--vp-c-bg);
  box-shadow: 0 18px 55px rgb(15 23 42 / 7%);
}

.paste-notice {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 3;
  padding: 4px 9px;
  border-radius: 999px;
  color: var(--vp-c-green-1);
  background: var(--vp-c-green-soft);
  font-weight: 650;
}

.workspace-body {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: 1fr 1fr;
}

.write-pane,
.preview-pane {
  min-width: 0;
}

.write-pane {
  position: relative;
  min-height: 0;
  border-right: 1px solid var(--editor-border);
}

.write-pane textarea {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  resize: none;
  padding: 26px 28px 40px;
  border: 0;
  outline: none;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  line-height: 1.8;
  tab-size: 2;
}

.drop-overlay {
  position: absolute;
  inset: 14px;
  display: grid;
  z-index: 2;
  place-content: center;
  place-items: center;
  border: 2px dashed var(--vp-c-brand-1);
  border-radius: 12px;
  color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 88%, var(--vp-c-bg));
  pointer-events: none;
}

.drop-overlay svg {
  width: 32px;
  margin-bottom: 8px;
}

.preview-pane {
  overflow: auto;
  height: 100%;
  max-height: none;
  padding: 26px 34px 48px;
  background: color-mix(in srgb, var(--vp-c-bg) 98%, var(--vp-c-bg-soft));
}

.editor-preview :deep(figure) {
  margin: 24px 0;
}

.editor-preview :deep(figure img) {
  display: block;
  max-width: 100%;
  max-height: 420px;
  margin: 0 auto;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  object-fit: contain;
}

.editor-preview :deep(> p > img),
.editor-preview :deep(> img) {
  display: block;
  max-width: 100%;
  max-height: 520px;
  margin: 24px auto;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  object-fit: contain;
}

.editor-preview :deep(figcaption) {
  margin-top: 8px;
  color: var(--vp-c-text-3);
  font-size: 12px;
  text-align: center;
}

.editor-preview :deep(.mermaid-block) {
  overflow: auto;
  margin: 24px 0;
  padding: 18px;
  border: 1px solid var(--editor-border);
  border-radius: 10px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  text-align: center;
}

.editor-preview :deep(.mermaid-block svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.editor-preview :deep(.mermaid-block.has-error) {
  border-color: color-mix(in srgb, var(--vp-c-danger-1) 45%, var(--editor-border));
  color: var(--vp-c-danger-1);
  text-align: left;
  white-space: pre-wrap;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  z-index: 100;
  padding: 24px;
  place-items: center;
  background: rgb(15 23 42 / 46%);
  backdrop-filter: blur(3px);
}

.editor-dialog {
  width: min(100%, 480px);
  padding: 22px;
  border: 1px solid var(--editor-border);
  border-radius: 14px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  box-shadow: 0 24px 70px rgb(15 23 42 / 28%);
}

.dialog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dialog-heading small {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 700;
}

.dialog-heading h2 {
  margin: 3px 0 0;
  border: 0;
  font-size: 20px;
}

.dialog-heading > button {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 7px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  font-size: 22px;
}

.dialog-field {
  display: block;
  margin-top: 22px;
}

.dialog-field > span {
  display: block;
  margin-bottom: 7px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 650;
}

.dialog-field input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--editor-border);
  border-radius: 8px;
  outline: none;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

.dialog-field input:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.dialog-field small {
  display: block;
  min-height: 18px;
  margin-top: 6px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.dialog-field small.error {
  color: var(--vp-c-danger-1);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.danger-button {
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid var(--vp-c-danger-1);
  border-radius: 9px;
  color: #fff;
  background: var(--vp-c-danger-1);
  font-size: 14px;
  font-weight: 650;
}

.delete-warning {
  margin: 20px 0 0;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 32%, var(--editor-border));
  border-radius: 8px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-danger-soft);
  font-size: 13px;
  line-height: 1.6;
}

.rename-confirmation {
  display: grid;
  gap: 8px;
  margin-top: 20px;
  padding: 14px;
  border: 1px solid var(--editor-border);
  border-radius: 9px;
  background: var(--vp-c-bg-soft);
}

.rename-confirmation p {
  margin: 0 0 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.rename-confirmation code {
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-confirmation > span {
  color: var(--vp-c-text-3);
  text-align: center;
}

.diff-backdrop {
  padding: 4vh 3vw;
}

.diff-dialog {
  display: flex;
  width: min(1100px, 100%);
  max-height: 92vh;
  flex-direction: column;
}

.diff-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  padding: 10px 12px;
  border: 1px solid var(--editor-border);
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: var(--vp-c-bg-soft);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}

.diff-summary strong {
  overflow: hidden;
  margin-right: auto;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.addition {
  color: var(--vp-c-success-1);
}

.deletion {
  color: var(--vp-c-danger-1);
}

.rename-summary {
  padding: 8px 12px;
  border-right: 1px solid var(--editor-border);
  border-left: 1px solid var(--editor-border);
  color: var(--vp-c-text-2);
  background: var(--vp-c-warning-soft);
  font-size: 12px;
}

.diff-table {
  min-height: 160px;
  flex: 1;
  overflow: auto;
  border: 1px solid var(--editor-border);
  border-radius: 0 0 8px 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
}

.diff-header {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  color: var(--vp-c-text-2);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 72%, var(--vp-c-bg));
}

.diff-row {
  display: grid;
  min-height: 24px;
  grid-template-columns: 48px 48px 24px minmax(0, 1fr);
  line-height: 24px;
}

.diff-row.add {
  background: var(--vp-code-line-diff-add-color);
}

.diff-row.delete {
  background: var(--vp-code-line-diff-remove-color);
}

.line-number {
  padding: 0 8px;
  border-right: 1px solid color-mix(in srgb, var(--editor-border) 70%, transparent);
  color: var(--vp-c-text-3);
  text-align: right;
  user-select: none;
}

.diff-mark {
  color: var(--vp-c-text-3);
  text-align: center;
  user-select: none;
}

.diff-row.add .diff-mark {
  color: var(--vp-c-success-1);
}

.diff-row.delete .diff-mark {
  color: var(--vp-c-danger-1);
}

.diff-row code {
  overflow: visible;
  padding: 0 8px;
  color: var(--vp-c-text-1);
  background: transparent;
  white-space: pre;
}

.empty-diff {
  padding: 32px;
  color: var(--vp-c-text-3);
  text-align: center;
}

.github-handoff-note {
  display: grid;
  gap: 3px;
  margin-top: 12px;
  padding: 11px 13px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 28%, var(--editor-border));
  border-radius: 8px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-brand-soft);
  font-size: 12px;
  line-height: 1.55;
}

.github-handoff-note strong {
  color: var(--vp-c-text-1);
  font-size: 13px;
}

.submission-error {
  margin-top: 3px;
  color: var(--vp-c-danger-1);
  font-weight: 650;
}

.editor-note {
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 13px 15px;
  border-radius: 10px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  font-size: 13px;
}

.editor-note span {
  flex: 0 0 auto;
  color: var(--vp-c-brand-1);
}

.editor-note p {
  margin: 0;
  line-height: 1.55;
}

@media (max-width: 1180px) {
  .editor-header {
    grid-template-areas:
      "brand actions"
      "title title";
    grid-template-columns: minmax(190px, 1fr) auto;
    padding-top: 8px;
  }

  .compact-title-field {
    max-width: none;
  }
}

@media (max-width: 760px) {
  .editor-settings {
    grid-template-columns: 1fr 1fr;
  }

  .workspace-body {
    grid-template-columns: 1fr;
  }

  .write-pane {
    border-right: 0;
  }

  .editor-main-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .markdown-editor-shell {
    width: min(100% - 28px, 1480px);
    padding-top: 24px;
  }

  .editor-header {
    grid-template-areas:
      "brand"
      "title"
      "actions";
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .compact-title-field {
    grid-template-columns: 38px minmax(0, 1fr);
  }

  .file-path-button {
    max-width: none;
    grid-column: 1 / -1;
  }

  .editor-header-actions {
    justify-content: flex-start;
  }

  .save-state {
    width: 100%;
  }

  .editor-settings {
    grid-template-columns: 1fr;
  }

  .editor-main-layout {
    grid-template-columns: 1fr;
  }

  .document-sidebar {
    position: static;
  }

  .file-tree {
    max-height: 240px;
  }

  .workspace-body,
  .write-pane textarea {
    min-height: 480px;
  }

  .write-pane textarea,
  .preview-pane {
    padding: 20px;
  }
}
</style>
