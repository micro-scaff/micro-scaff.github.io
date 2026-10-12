<script setup lang="ts">
import type { DefaultTheme as DefaultThemeTypes } from "vitepress";

import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import ImageViewer from "./ImageViewer.vue";

const { Layout } = DefaultTheme;
const { frontmatter, theme } = useData<DefaultThemeTypes.Config & { buildTime: string }>();
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <p v-if="frontmatter.layout === 'home'" class="build-time">
        更新时间：{{ theme.buildTime }}
      </p>
    </template>
  </Layout>
  <ImageViewer />
</template>

<style scoped>
.build-time {
  position: relative;
  z-index: var(--vp-z-index-footer);
  margin: -2rem 0 0;
  padding-bottom: 2rem;
  line-height: 1.7143;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: center;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg);
}
</style>

