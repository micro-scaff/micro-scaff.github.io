<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from "vue";

const activeUrl = ref("");
const visible = ref(false);
const scale = ref(1);
const rotation = ref(0);
const offsetX = ref(0);
const offsetY = ref(0);
const stage = ref<HTMLElement>();
const previewImage = ref<HTMLImageElement>();
const canDrag = ref(false);
const dragging = ref(false);

const IMAGE_SELECTOR = ".vp-doc img:not(.no-preview):not([data-no-preview])";
const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const SCALE_STEP = 0.2;
const WHEEL_SCALE_STEP = 0.08;

let previousBodyOverflow = "";
let dragState: {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
} | undefined;
let suppressClickAfterDrag = false;

function getPanBounds(): { maxX: number; maxY: number } {
  if (!stage.value || !previewImage.value) {
    return {
      maxX: 0,
      maxY: 0
    };
  }

  const quarterTurns = Math.abs(Math.round(rotation.value / 90)) % 2;
  const imageWidth = quarterTurns
    ? previewImage.value.offsetHeight
    : previewImage.value.offsetWidth;
  const imageHeight = quarterTurns
    ? previewImage.value.offsetWidth
    : previewImage.value.offsetHeight;

  return {
    maxX: Math.max(0, (imageWidth * scale.value - stage.value.clientWidth) / 2),
    maxY: Math.max(0, (imageHeight * scale.value - stage.value.clientHeight) / 2)
  };
}

function updatePanState(): void {
  const { maxX, maxY } = getPanBounds();

  canDrag.value = maxX > 0 || maxY > 0;
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value));
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value));
}

function resetTransform(): void {
  scale.value = 1;
  rotation.value = 0;
  offsetX.value = 0;
  offsetY.value = 0;
  void nextTick(updatePanState);
}

function close(): void {
  if (dragState && stage.value?.hasPointerCapture(dragState.pointerId)) {
    stage.value.releasePointerCapture(dragState.pointerId);
  }

  dragState = undefined;
  dragging.value = false;
  suppressClickAfterDrag = false;
  visible.value = false;
}

function setScale(value: number): void {
  scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  void nextTick(updatePanState);
}

function rotate(degrees: number): void {
  rotation.value += degrees;
  void nextTick(updatePanState);
}

function startDragging(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }

  updatePanState();

  if (!canDrag.value || !stage.value) {
    return;
  }

  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startOffsetX: offsetX.value,
    startOffsetY: offsetY.value
  };
  suppressClickAfterDrag = false;
  dragging.value = true;
  stage.value.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function dragImage(event: PointerEvent): void {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  const { maxX, maxY } = getPanBounds();
  const movedX = event.clientX - dragState.startX;
  const movedY = event.clientY - dragState.startY;

  if (Math.abs(movedX) > 3 || Math.abs(movedY) > 3) {
    suppressClickAfterDrag = true;
  }

  offsetX.value = Math.min(
    maxX,
    Math.max(-maxX, dragState.startOffsetX + movedX)
  );
  offsetY.value = Math.min(
    maxY,
    Math.max(-maxY, dragState.startOffsetY + movedY)
  );
}

function stopDragging(event: PointerEvent, cancelled = false): void {
  if (!dragState || event.pointerId !== dragState.pointerId) {
    return;
  }

  if (stage.value?.hasPointerCapture(event.pointerId)) {
    stage.value.releasePointerCapture(event.pointerId);
  }

  dragState = undefined;
  dragging.value = false;

  if (cancelled) {
    suppressClickAfterDrag = false;
  }
}

function handleStageClick(event: MouseEvent): void {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (suppressClickAfterDrag) {
    suppressClickAfterDrag = false;
    return;
  }

  close();
}

function openFromImage(clickedImage: HTMLImageElement): void {
  const url = clickedImage.currentSrc || clickedImage.src;

  if (!url) {
    return;
  }

  activeUrl.value = url;
  resetTransform();
  visible.value = true;
}

function handleDocumentClick(event: MouseEvent): void {
  if (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) {
    return;
  }

  const target = event.target;

  if (!(target instanceof HTMLImageElement) || !target.matches(IMAGE_SELECTOR)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  openFromImage(target);
}

function handleKeydown(event: KeyboardEvent): void {
  if (!visible.value) {
    return;
  }

  if (event.key === "Escape") {
    close();
  } else if (event.key === "+" || event.key === "=") {
    setScale(scale.value + SCALE_STEP);
  } else if (event.key === "-") {
    setScale(scale.value - SCALE_STEP);
  } else {
    return;
  }

  event.preventDefault();
}

function handleWheel(event: WheelEvent): void {
  setScale(
    scale.value + (event.deltaY < 0 ? WHEEL_SCALE_STEP : -WHEEL_SCALE_STEP)
  );
}

watch(visible, value => {
  if (value) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return;
  }

  document.body.style.overflow = previousBodyOverflow;
});

onMounted(() => {
  document.addEventListener("click", handleDocumentClick, true);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", updatePanState);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", handleDocumentClick, true);
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("resize", updatePanState);
  document.body.style.overflow = previousBodyOverflow;
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="docs-image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      @click.self="close"
    >
      <button
        class="docs-image-viewer__close"
        type="button"
        title="关闭（Esc）"
        aria-label="关闭图片预览"
        @click="close"
      >
        ×
      </button>

      <div
        ref="stage"
        class="docs-image-viewer__stage"
        @click="handleStageClick"
        @wheel.prevent="handleWheel"
        @pointermove="dragImage"
        @pointerup="stopDragging"
        @pointercancel="stopDragging($event, true)"
      >
        <img
          :key="activeUrl"
          ref="previewImage"
          class="docs-image-viewer__image"
          :class="{
            'is-draggable': canDrag,
            'is-dragging': dragging
          }"
          :src="activeUrl"
          alt="预览图片"
          draggable="false"
          :style="{
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotation}deg)`
          }"
          @load="updatePanState"
          @pointerdown="startDragging"
        >
      </div>

      <div class="docs-image-viewer__toolbar">
        <button
          type="button"
          title="缩小（-）"
          aria-label="缩小图片"
          @click="setScale(scale - SCALE_STEP)"
        >
          −
        </button>
        <span>{{ Math.round(scale * 100) }}%</span>
        <button
          type="button"
          title="放大（+）"
          aria-label="放大图片"
          @click="setScale(scale + SCALE_STEP)"
        >
          ＋
        </button>
        <button
          type="button"
          title="向左旋转"
          aria-label="向左旋转图片"
          @click="rotate(-90)"
        >
          ↶
        </button>
        <button
          type="button"
          title="向右旋转"
          aria-label="向右旋转图片"
          @click="rotate(90)"
        >
          ↷
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.docs-image-viewer {
  position: fixed;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  inset: 0;
  background: rgb(0 0 0 / 88%);
}

.docs-image-viewer__stage {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 72px 88px 96px;
}

.docs-image-viewer__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 160ms ease;
  touch-action: none;
  user-select: none;
}

.docs-image-viewer__image.is-draggable {
  cursor: grab;
}

.docs-image-viewer__image.is-dragging {
  cursor: grabbing;
  transition: none;
}

.docs-image-viewer button {
  border: 0;
  color: #fff;
  background: rgb(255 255 255 / 14%);
  cursor: pointer;
}

.docs-image-viewer button:hover {
  background: rgb(255 255 255 / 24%);
}

.docs-image-viewer__close {
  position: absolute;
  z-index: 2;
  top: 22px;
  right: 24px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: 32px;
  line-height: 40px;
}

.docs-image-viewer__toolbar {
  position: absolute;
  z-index: 2;
  bottom: 24px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  color: #fff;
  background: rgb(0 0 0 / 55%);
  transform: translateX(-50%);
  white-space: nowrap;
}

.docs-image-viewer__toolbar button {
  min-width: 36px;
  height: 34px;
  padding: 0 9px;
  border-radius: 8px;
  font-size: 16px;
}

@media (max-width: 640px) {
  .docs-image-viewer__stage {
    padding: 64px 20px 104px;
  }

  .docs-image-viewer__toolbar {
    bottom: 24px;
    max-width: calc(100vw - 32px);
    overflow-x: auto;
  }
}
</style>

