import { defineConfig } from "vitepress";

export default defineConfig({
  title: "CauseScope",
  description: "Click any UI. Trace the cause.",
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ["meta", { name: "theme-color", content: "#111315" }],
  ],
  themeConfig: {
    logo: {
      light: "/mark.svg",
      dark: "/mark.svg",
    },
    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "Configuration", link: "/configuration" },
      { text: "Examples", link: "https://github.com/stackloomdev/causescope/tree/main/examples" },
      { text: "中文", link: "https://github.com/stackloomdev/causescope/blob/main/README.zh-CN.md" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Configuration", link: "/configuration" },
          { text: "Data adapters", link: "/adapters" },
          { text: "Privacy", link: "/privacy" },
        ],
      },
      {
        text: "Project",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Validation", link: "/validation" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/stackloomdev/causescope" },
    ],
    search: { provider: "local" },
    footer: {
      message: "Local-first React provenance inspection.",
      copyright: "MIT © 2026 stackloomdev",
    },
  },
});
