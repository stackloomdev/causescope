import { defineConfig } from "vitepress";

const base = process.env.CAUSESCOPE_DOCS_BASE ?? "/";
const liveDemo = "https://stackblitz.com/fork/github/stackloomdev/causescope/tree/main/examples/stackblitz?title=CauseScope%20Live%20Lab";

export default defineConfig({
  base,
  title: "CauseScope",
  description: "The evidence chain behind any React UI.",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { name: "theme-color", content: "#09090b" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "CauseScope — Click any UI. Trace the cause." }],
    ["meta", { property: "og:description", content: "Trace rendered React UI back to the exact TSX, branch, state, props, store, and network evidence." }],
    ["meta", { property: "og:image", content: "https://stackloomdev.github.io/causescope/og.png" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    logo: {
      light: "/mark.svg",
      dark: "/mark.svg",
    },
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Configuration", link: "/configuration" },
      { text: "Community", link: "/community" },
      { text: "Live demo", link: liveDemo },
      { text: "中文", link: "https://github.com/stackloomdev/causescope/blob/main/README.zh-CN.md" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Configuration", link: "/configuration" },
          { text: "Data adapters", link: "/adapters" },
          { text: "Trace export contract", link: "/trace-export" },
          { text: "Privacy", link: "/privacy" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Performance budgets", link: "/performance" },
          { text: "Validation", link: "/validation" },
          { text: "Community and support", link: "/community" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/stackloomdev/causescope" },
    ],
    search: { provider: "local" },
    footer: {
      message: "Built for local evidence, not another dashboard.",
      copyright: "MIT © 2026 stackloomdev",
    },
  },
});
