<script lang="ts">
// Mermaid 的配置是全局状态。同一页面中的组件共用队列，可避免多个图表
// 在明暗主题初始化期间相互覆盖配置。
let diagramId = 0;
let renderQueue = Promise.resolve();
</script>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";
import { useData } from "vitepress";

const props = defineProps<{
  /** markdown 插件传入的 URI 编码 Mermaid 源码。 */
  source: string;
}>();

const { isDark } = useData();
const diagram = ref<HTMLElement>();
const viewport = ref<HTMLElement>();
const container = ref<HTMLElement>();
const errorMessage = ref("");
const rendering = ref(true);
const zoomLevel = ref(1);
const isFullscreen = ref(false);
const canFullscreen = ref(false);
const canDrag = ref(false);
const isDragging = ref(false);
const initialViewportHeight = ref<number>();
const decodedSource = computed(() => decodeURIComponent(props.source));
const zoomPercent = computed(() => `${Math.round(zoomLevel.value * 100)}%`);
const viewportStyle = computed(() => {
  if (isFullscreen.value || initialViewportHeight.value === undefined) {
    return undefined;
  }

  return {
    height: `${initialViewportHeight.value}px`
  };
});

let componentRenderVersion = 0;
let baseSvgSize: { width: number; height: number } | undefined;
let dragState: {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
} | undefined;
let suppressClickAfterDrag = false;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/**
 * 直接调整 SVG 的实际尺寸，而不是依赖兼容性不稳定的 CSS zoom。
 * 宽高变化会参与页面布局，所以放大后外层容器可以正确出现滚动条。
 */
function applySvgZoom(): void {
  const svg = container.value?.querySelector<SVGSVGElement>("svg");

  if (!svg) {
    return;
  }

  if (!baseSvgSize) {
    const bounds = svg.getBoundingClientRect();
    baseSvgSize = {
      width: bounds.width,
      height: bounds.height
    };
  }

  svg.style.width = `${baseSvgSize.width * zoomLevel.value}px`;
  svg.style.height = `${baseSvgSize.height * zoomLevel.value}px`;
  svg.style.maxWidth = "none";
  void nextTick(updateDragState);
}

function updateDragState(): void {
  if (!viewport.value) {
    canDrag.value = false;
    return;
  }

  canDrag.value = viewport.value.scrollWidth > viewport.value.clientWidth
    || viewport.value.scrollHeight > viewport.value.clientHeight;
}

/** 第一次成功渲染后锁定视口高度，后续缩放只改变内部 SVG。 */
function lockInitialViewportHeight(): void {
  if (!viewport.value || initialViewportHeight.value !== undefined) {
    return;
  }

  initialViewportHeight.value = viewport.value.getBoundingClientRect().height;
}

function setZoom(value: number): void {
  zoomLevel.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  void nextTick(applySvgZoom);
}

function handleFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement === diagram.value;
  void nextTick(updateDragState);
}

/** 按住鼠标左键拖动画布，本质上是同步移动可滚动视口。 */
function startDragging(event: PointerEvent): void {
  if (event.button !== 0 || !viewport.value || !canDrag.value) {
    return;
  }

  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: viewport.value.scrollLeft,
    scrollTop: viewport.value.scrollTop
  };
  suppressClickAfterDrag = false;
  isDragging.value = true;
  viewport.value.setPointerCapture(event.pointerId);
}

function dragViewport(event: PointerEvent): void {
  if (!viewport.value || !dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  const offsetX = event.clientX - dragState.startX;
  const offsetY = event.clientY - dragState.startY;

  if (Math.abs(offsetX) > 3 || Math.abs(offsetY) > 3) {
    suppressClickAfterDrag = true;
  }

  viewport.value.scrollLeft = dragState.scrollLeft - offsetX;
  viewport.value.scrollTop = dragState.scrollTop - offsetY;
  event.preventDefault();
}

function stopDragging(event: PointerEvent, cancelled = false): void {
  if (!viewport.value || !dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  if (viewport.value.hasPointerCapture(event.pointerId)) {
    viewport.value.releasePointerCapture(event.pointerId);
  }

  dragState = undefined;
  isDragging.value = false;

  if (cancelled) {
    suppressClickAfterDrag = false;
  }
}

function preventClickAfterDrag(event: MouseEvent): void {
  if (!suppressClickAfterDrag) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  suppressClickAfterDrag = false;
}

async function toggleFullscreen(): Promise<void> {
  if (!diagram.value || !document.fullscreenEnabled) {
    return;
  }

  if (document.fullscreenElement === diagram.value) {
    await document.exitFullscreen();
  } else {
    await diagram.value.requestFullscreen();
  }
}

function enqueueRender(task: () => Promise<void>): Promise<void> {
  renderQueue = renderQueue.then(task, task);
  return renderQueue;
}

async function renderDiagram(): Promise<void> {
  const renderVersion = ++componentRenderVersion;

  rendering.value = true;
  errorMessage.value = "";
  await nextTick();

  return enqueueRender(async () => {
    if (!container.value || renderVersion !== componentRenderVersion) {
      return;
    }

    try {
      // 按需导入避免 Mermaid 在服务端渲染阶段访问浏览器 API，同时将
      // 体积较大的渲染器拆成独立 chunk。
      const { default: mermaid } = await import("mermaid");

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: isDark.value ? "dark" : "default"
      });

      const id = `mermaid-diagram-${++diagramId}`;
      const { svg, bindFunctions } = await mermaid.render(
        id,
        decodedSource.value
      );

      if (!container.value || renderVersion !== componentRenderVersion) {
        return;
      }

      baseSvgSize = undefined;
      container.value.innerHTML = svg;
      bindFunctions?.(container.value);
      await nextTick();
      applySvgZoom();
    } catch (error) {
      if (renderVersion !== componentRenderVersion) {
        return;
      }

      errorMessage.value = error instanceof Error
        ? error.message
        : "未知 Mermaid 渲染错误";
      container.value?.replaceChildren();
    } finally {
      if (renderVersion === componentRenderVersion) {
        rendering.value = false;
        await nextTick();
        lockInitialViewportHeight();
        await nextTick();
        updateDragState();
      }
    }
  });
}

onMounted(() => {
  canFullscreen.value = document.fullscreenEnabled;
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  void renderDiagram();
});

watch(
  [() => props.source, isDark],
  renderDiagram,
  {
    flush: "post"
  }
);

onBeforeUnmount(() => {
  componentRenderVersion += 1;
  dragState = undefined;
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
});
</script>

<template>
  <div
    ref="diagram"
    class="mermaid-diagram"
  >
    <div class="mermaid-diagram__toolbar">
      <button
        type="button"
        :disabled="zoomLevel <= MIN_ZOOM"
        aria-label="缩小图表"
        title="缩小"
        @click="setZoom(zoomLevel - ZOOM_STEP)"
      >
        −
      </button>
      <button
        type="button"
        class="mermaid-diagram__zoom"
        :disabled="zoomLevel === 1"
        aria-label="将图表缩放重置为 100%"
        title="重置缩放"
        @click="setZoom(1)"
      >
        {{ zoomPercent }}
      </button>
      <button
        type="button"
        :disabled="zoomLevel >= MAX_ZOOM"
        aria-label="放大图表"
        title="放大"
        @click="setZoom(zoomLevel + ZOOM_STEP)"
      >
        +
      </button>
      <button
        v-if="canFullscreen"
        type="button"
        class="mermaid-diagram__fullscreen"
        :aria-label="isFullscreen ? '退出全屏观看' : '全屏观看图表'"
        @click="toggleFullscreen"
      >
        {{ isFullscreen ? "退出全屏" : "全屏" }}
      </button>
    </div>

    <div
      ref="viewport"
      class="mermaid-diagram__viewport"
      :class="{
        'is-pannable': canDrag,
        'is-dragging': isDragging
      }"
      :style="viewportStyle"
      @click.capture="preventClickAfterDrag"
      @dragstart.prevent
      @pointercancel="stopDragging($event, true)"
      @pointerdown="startDragging"
      @pointermove="dragViewport"
      @pointerup="stopDragging"
    >
      <div
        v-if="rendering"
        class="mermaid-diagram__status"
        role="status"
      >
        正在渲染图表…
      </div>

      <div
        v-if="errorMessage"
        class="mermaid-diagram__error"
        role="alert"
      >
        <strong>Mermaid 图表渲染失败</strong>
        <span>{{ errorMessage }}</span>
      </div>

      <div
        ref="container"
        class="mermaid-diagram__canvas"
        :class="{ 'is-visible': !rendering && !errorMessage }"
      />
    </div>
  </div>
</template>

<style scoped>
.mermaid-diagram {
  margin: 20px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.mermaid-diagram__toolbar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.mermaid-diagram__toolbar button {
  min-width: 32px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.mermaid-diagram__toolbar button:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.mermaid-diagram__toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.mermaid-diagram__zoom {
  width: 64px;
}

.mermaid-diagram__fullscreen {
  margin-left: auto;
}

.mermaid-diagram__viewport {
  box-sizing: border-box;
  overflow: auto;
  padding: 20px;
}

.mermaid-diagram__viewport.is-pannable {
  cursor: grab;
}

.mermaid-diagram__viewport.is-dragging {
  cursor: grabbing;
  user-select: none;
}

.mermaid-diagram__viewport.is-dragging :deep(*) {
  cursor: grabbing !important;
}

.mermaid-diagram__status,
.mermaid-diagram__error {
  color: var(--vp-c-text-2);
  font-size: 14px;
  text-align: center;
}

.mermaid-diagram__error {
  display: grid;
  gap: 6px;
  color: var(--vp-c-danger-1);
}

.mermaid-diagram__canvas {
  width: fit-content;
  min-width: 100%;
  opacity: 0;
  text-align: center;
  transition: opacity 0.2s ease;
}

.mermaid-diagram__canvas.is-visible {
  opacity: 1;
}

.mermaid-diagram__canvas :deep(svg) {
  max-width: 100%;
  height: auto;
}

/*
 * Mermaid 使用 foreignObject + HTML 标签绘制节点文字。VitePress 的正文样式
 * 会给其中的 p 标签增加上下边距和较大的行高，但 Mermaid 计算节点尺寸时并
 * 不包含这些外部样式，最终会导致末行文字被节点边界裁切。
 */
.mermaid-diagram__canvas :deep(.nodeLabel),
.mermaid-diagram__canvas :deep(.edgeLabel),
.mermaid-diagram__canvas :deep(.cluster-label) {
  line-height: normal;
}

.mermaid-diagram__canvas :deep(foreignObject p) {
  margin: 0;
  line-height: normal;
}

.mermaid-diagram:fullscreen {
  display: flex;
  flex-direction: column;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: var(--vp-c-bg);
}

.mermaid-diagram:fullscreen .mermaid-diagram__viewport {
  flex: 1;
  min-height: 0;
}

@media (prefers-reduced-motion: reduce) {
  .mermaid-diagram__canvas {
    transition: none;
  }
}
</style>
