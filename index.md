---
layout: home

hero:
  name: "Micro Scaff"
  text: "工程知识与项目实践"
  tagline: "工具沉淀 · 学习记录 · 项目实践 · AI Agent"
  image: /logo.png
  actions:
    - theme: brand
      text: 🚀 Micro Tools
      link: /src/micro-tools/components.html
    - theme: alt
      text: 📚 Learn
      link: /src/learn/Composition%20API.html

features:
  - title: 🛠 Micro Tools
    details: 基于 pnpm workspace 维护的 @mt-kit/* 工具集，覆盖工具函数、组件、请求封装、Vite 插件和工程配置。
  - title: 📖 Learn
    details: 记录 JavaScript、CSS、Vue、React、工程化、服务端与跨端开发实践，把零散经验整理成可检索文档。
  - title: 🏗 项目实践
    details: 按项目聚合客户端、服务端、接口、数据库与部署文档，用真实业务验证工具和工程方案。

footer: |
  MIT License | © 2022-2026 Micro Scaff | Built with VitePress
---

<!-- markdownlint-disable MD041 MD012 MD033 -->

<div class="home-intro" style="margin: 40px 0; padding: 30px; border-radius: 18px; background: linear-gradient(135deg, rgba(38, 168, 242, 0.14), rgba(111, 187, 57, 0.14)); border: 1px solid rgba(38, 168, 242, 0.2);">
  <div style="font-size: 1.35em; font-weight: 700; margin-bottom: 10px;">Micro Scaff 是什么？</div>
  <div style="line-height: 1.9; color: var(--vp-c-text-2);">
    这里不是单一项目文档，而是一个从真实代码仓库持续生长的工程知识库。它聚合前端工具、学习笔记、全栈项目和 AI Agent 实践，方便查找、复用和继续补充。
  </div>
</div>

## 内容版图

<div class="home-map" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin: 24px 0 36px;">
  <a class="home-map-card" href="/src/micro-tools/components.html" aria-label="进入 Micro Tools 文档" style="display: block; padding: 22px; border-radius: 14px; background: linear-gradient(135deg, #26a8f2 0%, #147ed0 100%); color: white; text-decoration: none; box-shadow: 0 12px 28px rgba(38, 168, 242, 0.22);">
    <div style="font-size: 2em; font-weight: 800;">01</div>
    <div style="font-weight: 700; margin: 8px 0;">工具与组件</div>
    <div style="opacity: 0.9; line-height: 1.7;">工具函数、通用组件、请求封装、Vite 插件和共享工程配置。</div>
  </a>

  <a class="home-map-card" href="/src/micro-tools/packages-vue/vue-components.html" aria-label="查看框架生态文档" style="display: block; padding: 22px; border-radius: 14px; background: linear-gradient(135deg, #6fbb39 0%, #4e9b2b 100%); color: white; text-decoration: none; box-shadow: 0 12px 28px rgba(111, 187, 57, 0.22);">
    <div style="font-size: 2em; font-weight: 800;">02</div>
    <div style="font-weight: 700; margin: 8px 0;">框架生态</div>
    <div style="opacity: 0.9; line-height: 1.7;">Vue、React、Lit、Hooks、指令、UI 扩展组件与主题样式。</div>
  </a>

  <a class="home-map-card" href="/src/learn/Composition%20API.html" aria-label="进入 Learn 学习笔记" style="display: block; padding: 22px; border-radius: 14px; background: linear-gradient(135deg, #ffd76a 0%, #f0a83a 100%); color: #3a2a12; text-decoration: none; box-shadow: 0 12px 28px rgba(255, 215, 106, 0.22);">
    <div style="font-size: 2em; font-weight: 800;">03</div>
    <div style="font-weight: 700; margin: 8px 0;">学习笔记</div>
    <div style="opacity: 0.88; line-height: 1.7;">前端基础、框架实践、工程化、跨端和服务端技术记录。</div>
  </a>

  <div class="home-map-card" style="padding: 22px; border-radius: 14px; background: linear-gradient(135deg, #f3a9c9 0%, #d34a36 100%); color: white; box-shadow: 0 12px 28px rgba(243, 169, 201, 0.22);">
    <div style="font-size: 2em; font-weight: 800;">04</div>
    <div style="font-weight: 700; margin: 8px 0;">项目实践</div>
    <div style="opacity: 0.9; line-height: 1.7;">聚合多个真实项目，统一展示项目介绍、模块文档和静态附件。</div>
  </div>

  <a class="home-map-card" href="/src/micro-tools/packages-agent/skills.html" aria-label="查看 AI Agent 文档" style="display: block; padding: 22px; border-radius: 14px; background: linear-gradient(135deg, #2f3548 0%, #26a8f2 100%); color: white; text-decoration: none; box-shadow: 0 12px 28px rgba(47, 53, 72, 0.22);">
    <div style="font-size: 2em; font-weight: 800;">05</div>
    <div style="font-weight: 700; margin: 8px 0;">AI Agent</div>
    <div style="opacity: 0.9; line-height: 1.7;">沉淀 Agent、Skills、工具调用和智能研发能力。</div>
  </a>
</div>

## 当前入口

- **[Micro Tools](/src/micro-tools/components.html)**：工具函数、Vue / React / Lit 能力、请求封装、Vite 插件和共享工程配置。
- **[Learn](/src/learn/Composition%20API.html)**：JavaScript、CSS、框架、工程化、跨端和服务端学习记录。
- **项目**：按项目聚合多个仓库、模块和文档目录，后续新增项目时自动扩展导航。

## 建设目标

- **可复用**：把重复出现的代码、配置和流程抽出来，形成稳定资产。
- **可追溯**：每一次问题排查、方案选择和实践经验都能回到文档里。
- **可验证**：通过真实项目检验工具、接口、数据设计和部署方案。
- **可维护**：内容从 `packages` 自动聚合，新增文档和附件后能够自然扩展。
