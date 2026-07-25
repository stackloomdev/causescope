export const overlayStyles = `
  :host {
    all: initial;
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    pointer-events: none;
    color-scheme: dark;
    --cs-bg: #111315;
    --cs-surface: #181a1c;
    --cs-raised: #1f2124;
    --cs-hover: #292b2e;
    --cs-text: #f4f2ef;
    --cs-muted: #aaa7a2;
    --cs-faint: #73726e;
    --cs-border: rgba(255, 255, 255, 0.11);
    --cs-border-strong: rgba(255, 255, 255, 0.18);
    --cs-accent: #ff385c;
    --cs-accent-soft: rgba(255, 56, 92, 0.13);
    --cs-radius-sm: 8px;
    --cs-radius-md: 14px;
    --cs-radius-lg: 20px;
    font-family: ui-rounded, "SF Pro Rounded", "Avenir Next", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  *, *::before, *::after { box-sizing: border-box; }
  button { font: inherit; }
  code, time, .cs-mono {
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  }

  button:focus-visible {
    outline: 2px solid var(--cs-accent);
    outline-offset: 3px;
  }

  .cs-toggle,
  .cs-drawer {
    pointer-events: auto;
  }

  .cs-toggle {
    position: fixed;
    right: 24px;
    bottom: 24px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 0 18px;
    border: 1px solid var(--cs-border-strong);
    border-radius: 999px;
    color: var(--cs-text);
    background: var(--cs-raised);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.025), 0 4px 10px rgba(0,0,0,0.24), 0 18px 48px rgba(0,0,0,0.32);
    font-size: 14px;
    font-weight: 650;
    cursor: pointer;
    transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
  }

  .cs-toggle:hover {
    transform: translateY(-2px);
    border-color: var(--cs-accent);
    background: var(--cs-hover);
  }

  .cs-toggle[data-active="true"] {
    border-color: var(--cs-accent);
    color: #fff;
  }

  .cs-toggle-dot {
    width: 10px;
    height: 10px;
    border: 2px solid var(--cs-accent);
    border-radius: 50%;
  }

  .cs-shortcut {
    padding: 3px 7px;
    border-radius: 6px;
    color: var(--cs-faint);
    background: #111315;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
  }

  .cs-highlight {
    position: fixed;
    pointer-events: none;
    border: 2px solid var(--cs-accent);
    border-radius: 7px;
    background: rgba(255, 56, 92, 0.07);
    box-shadow: 0 0 0 3px rgba(255, 56, 92, 0.08);
  }

  .cs-highlight-label {
    position: absolute;
    top: -32px;
    left: -2px;
    max-width: 320px;
    overflow: hidden;
    padding: 6px 9px;
    border-radius: 7px;
    color: #fff;
    background: var(--cs-accent);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cs-drawer {
    position: fixed;
    top: 0;
    right: 0;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    width: var(--cs-drawer-width, 420px);
    height: 100vh;
    overflow: hidden;
    border-left: 1px solid var(--cs-border);
    color: var(--cs-text);
    background: var(--cs-surface);
    box-shadow: -18px 0 48px rgba(0, 0, 0, 0.28);
    animation: cs-enter 180ms ease-out both;
  }

  .cs-drawer[data-static="true"] {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .cs-resizer {
    position: absolute;
    z-index: 5;
    top: 0;
    bottom: 0;
    left: -6px;
    width: 12px;
    border: 0;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
  }

  .cs-resizer::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 4px;
    width: 3px;
    height: 52px;
    border-radius: 999px;
    background: var(--cs-border-strong);
    transform: translateY(-50%);
  }

  .cs-header {
    padding: 22px 22px 18px;
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-title-row,
  .cs-section-title,
  .cs-source-title,
  .cs-step-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .cs-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .cs-title {
    margin: 0;
    font-size: 20px;
    font-weight: 720;
    letter-spacing: -0.4px;
  }

  .cs-header-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .cs-text-button,
  .cs-open-editor,
  .cs-export-button,
  .cs-tab {
    border: 0;
    color: var(--cs-muted);
    background: transparent;
    cursor: pointer;
  }

  .cs-text-button {
    min-height: 34px;
    padding: 0 11px;
    border-radius: 999px;
    background: var(--cs-raised);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  .cs-text-button:hover,
  .cs-open-editor:hover,
  .cs-export-button:hover,
  .cs-tab:hover { color: #fff; }

  .cs-summary {
    display: grid;
    gap: 10px;
    margin: 18px 0 14px;
  }

  .cs-summary-row {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    align-items: baseline;
    gap: 14px;
  }

  .cs-summary-label {
    color: var(--cs-faint);
    font-size: 12px;
    font-weight: 600;
  }

  .cs-summary-value {
    min-width: 0;
    overflow: hidden;
    color: var(--cs-text);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cs-open-editor {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 0;
    border-bottom: 1px solid currentColor;
    font-size: 13px;
    font-weight: 650;
  }

  .cs-export-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }

  .cs-export-button {
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid var(--cs-border);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 650;
  }

  .cs-tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    padding: 0 12px;
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-tab {
    position: relative;
    min-width: 0;
    padding: 15px 3px 13px;
    font-size: 12px;
    font-weight: 650;
  }

  .cs-tab[data-active="true"] { color: var(--cs-accent); }
  .cs-tab[data-active="true"]::after {
    content: "";
    position: absolute;
    right: 16%;
    bottom: -1px;
    left: 16%;
    height: 2px;
    border-radius: 999px;
    background: var(--cs-accent);
  }

  .cs-content {
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: #3b3d40 transparent;
  }

  .cs-content:focus-visible {
    outline: 2px solid var(--cs-accent);
    outline-offset: -4px;
  }

  .cs-panel { padding: 22px; }
  .cs-source-title,
  .cs-section-title { margin-bottom: 14px; }
  .cs-source-title h2,
  .cs-section-title h2,
  .cs-empty h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 680;
    letter-spacing: -0.18px;
  }

  .cs-source-title span,
  .cs-section-title span {
    min-width: 0;
    overflow: hidden;
    color: var(--cs-faint);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cs-code {
    padding: 13px 0;
    border-top: 1px solid var(--cs-border);
    border-bottom: 1px solid var(--cs-border);
    background: #151719;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    line-height: 1.65;
  }

  .cs-code-row {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    min-height: 23px;
    padding-right: 10px;
  }

  .cs-code-row[data-active="true"] {
    padding-block: 4px;
    background: rgba(255, 255, 255, 0.025);
  }

  .cs-code-expression + .cs-code-expression {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--cs-border);
  }

  .cs-line-number {
    padding-right: 10px;
    color: var(--cs-faint);
    text-align: right;
    user-select: none;
  }

  .cs-code-text {
    min-width: 0;
    overflow-wrap: anywhere;
    color: #d9d5cf;
    white-space: pre-wrap;
  }

  .cs-code-property { color: #bdb9b3; }
  .cs-code-mark {
    display: inline-block;
    padding: 2px 4px;
    border: 1px solid rgba(255, 56, 92, 0.72);
    border-radius: 4px;
    color: #fff;
    background: var(--cs-accent-soft);
  }

  .cs-inline-values {
    display: grid;
    gap: 5px;
    margin: 9px 10px 4px 34px;
  }

  .cs-inline-value {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding-left: 10px;
    border-left: 1px solid rgba(255, 56, 92, 0.72);
    color: var(--cs-accent);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
  }

  .cs-result {
    display: grid;
    gap: 5px;
    margin-top: 16px;
    padding: 16px;
    border: 1px solid rgba(255, 56, 92, 0.24);
    border-radius: var(--cs-radius-md);
    background: var(--cs-accent-soft);
  }

  .cs-result strong {
    color: var(--cs-accent);
    font-size: 18px;
    letter-spacing: -0.18px;
  }

  .cs-result span {
    color: var(--cs-muted);
    font-size: 12px;
  }

  .cs-result code { color: var(--cs-accent); }

  .cs-trace-boundary {
    display: grid;
    gap: 4px;
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 56, 92, 0.22);
  }
  .cs-trace-boundary b { color: #ddd8d1; font-size: 11px; }
  .cs-trace-boundary span { line-height: 1.5; }

  .cs-expression-section { padding-top: 2px; }
  .cs-expression-list {
    display: grid;
    gap: 10px;
  }
  .cs-expression-list .cs-result { margin-top: 0; }
  .cs-expression-group {
    overflow: hidden;
    border-radius: var(--cs-radius-md);
  }
  .cs-expression-kind {
    color: var(--cs-faint) !important;
    font-size: 9px !important;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cs-condition-tree {
    padding: 14px 16px 16px;
    border: 1px solid var(--cs-border);
    border-top: 0;
    border-radius: 0 0 var(--cs-radius-md) var(--cs-radius-md);
    background: #131517;
  }
  .cs-condition-tree h3,
  .cs-subsection h3 { margin: 0; font-size: 12px; }
  .cs-condition-tree ol {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }
  .cs-condition-node > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 34px;
    padding: 5px 0 5px 10px;
    border-left: 1px solid var(--cs-border-strong);
  }
  .cs-condition-node ol { margin: 0 0 0 14px; }
  .cs-condition-node code { color: var(--cs-muted); font-size: 10px; }
  .cs-condition-node span { color: var(--cs-faint); font-size: 9px; text-align: right; }
  .cs-condition-node[data-evaluated="false"] { opacity: 0.54; }
  .cs-condition-node[data-deciding="true"] > div { border-left-color: var(--cs-accent); }
  .cs-condition-node[data-deciding="true"] > div code,
  .cs-condition-node[data-deciding="true"] > div span { color: var(--cs-accent); }

  .cs-hidden-branches .cs-result strong { font-size: 14px; }

  .cs-inline-empty {
    padding: 18px;
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-md);
    background: #151719;
  }
  .cs-inline-empty h2 {
    margin: 0;
    font-size: 15px;
  }
  .cs-inline-empty p {
    margin: 7px 0 0;
    color: var(--cs-faint);
    font-size: 12px;
    line-height: 1.55;
  }

  .cs-provenance {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--cs-border);
  }

  .cs-step {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 11px;
    padding: 14px 0;
  }

  .cs-step + .cs-step { border-top: 1px solid var(--cs-border); }
  .cs-step-index {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--cs-border-strong);
    border-radius: 50%;
    color: var(--cs-muted);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
  }

  .cs-step:last-child .cs-step-index { border-color: var(--cs-accent); color: #fff; }
  .cs-step-title strong { font-size: 13px; }
  .cs-step-title span { color: var(--cs-faint); font-size: 10px; }
  .cs-step-values {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 10px;
  }

  .cs-chip {
    padding: 7px 9px;
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-sm);
    color: var(--cs-muted);
    background: #131517;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
  }

  .cs-value-list { border-top: 1px solid var(--cs-border); }
  .cs-value-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-value-row span { color: var(--cs-faint); font-size: 12px; }
  .cs-value-row code {
    min-width: 0;
    max-width: 62%;
    overflow-wrap: anywhere;
    color: var(--cs-text);
    font-size: 11px;
    text-align: right;
  }

  .cs-subsection {
    display: grid;
    gap: 10px;
    margin-top: 24px;
    padding-top: 18px;
    border-top: 1px solid var(--cs-border);
  }

  .cs-origin-card,
  .cs-network-card {
    display: grid;
    gap: 9px;
    padding: 13px 14px;
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-md);
    background: #151719;
  }
  .cs-origin-card > div,
  .cs-network-title,
  .cs-network-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .cs-origin-card strong { font-size: 12px; }
  .cs-origin-card > div span,
  .cs-network-title span {
    flex: 0 0 auto;
    color: var(--cs-faint);
    font-size: 9px;
    text-transform: uppercase;
  }
  .cs-origin-card[data-confidence="confirmed"] { border-color: rgba(255, 56, 92, 0.24); }
  .cs-origin-card code { overflow-wrap: anywhere; color: var(--cs-muted); font-size: 10px; }
  .cs-origin-card p,
  .cs-network-card p { margin: 0; color: var(--cs-faint); font-size: 10px; line-height: 1.5; }

  .cs-network-list { display: grid; gap: 10px; }
  .cs-network-title { justify-content: flex-start; }
  .cs-network-title strong { color: var(--cs-accent); font-size: 11px; }
  .cs-network-title code {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--cs-text);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cs-network-title span[data-status="error"] { color: var(--cs-accent); }
  .cs-network-meta { justify-content: flex-start; flex-wrap: wrap; }
  .cs-network-meta span { color: var(--cs-faint); font-size: 9px; }
  .cs-network-path {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-top: 9px;
    border-top: 1px solid var(--cs-border);
  }
  .cs-network-path span { flex: 0 0 auto; color: var(--cs-faint); font-size: 9px; }
  .cs-network-path code { overflow-wrap: anywhere; color: var(--cs-muted); font-size: 10px; text-align: right; }

  .cs-state-list {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }

  .cs-state-card {
    overflow: hidden;
    border: 1px solid var(--cs-border);
    border-radius: var(--cs-radius-md);
    background: #151719;
  }

  .cs-state-card[data-relationship="component"] {
    border-color: rgba(255, 56, 92, 0.28);
  }

  .cs-state-card-title,
  .cs-state-update-heading,
  .cs-state-source {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .cs-state-card-title {
    padding: 15px 16px;
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-state-card-title > div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .cs-state-card-title strong { font-size: 14px; }
  .cs-state-card-title > div span {
    overflow: hidden;
    color: var(--cs-faint);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cs-state-relationship {
    flex: 0 0 auto;
    padding: 5px 7px;
    border: 1px solid var(--cs-border);
    border-radius: 999px;
    color: var(--cs-muted);
    font-size: 9px;
  }

  .cs-state-values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-state-values > div {
    display: grid;
    gap: 7px;
    min-width: 0;
    padding: 14px 16px;
  }

  .cs-state-values > div + div { border-left: 1px solid var(--cs-border); }
  .cs-state-values span,
  .cs-state-source span { color: var(--cs-faint); font-size: 10px; }
  .cs-state-values code {
    overflow-wrap: anywhere;
    color: var(--cs-text);
    font-size: 12px;
  }

  .cs-state-source {
    padding: 11px 16px;
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-state-source code {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--cs-muted);
    font-size: 9px;
    text-align: right;
  }

  .cs-state-update { background: rgba(255, 255, 255, 0.015); }
  .cs-state-update-heading {
    padding: 13px 16px;
    border-bottom: 1px solid var(--cs-border);
  }
  .cs-state-update-heading strong { font-size: 12px; }
  .cs-state-update-heading time { color: var(--cs-faint); font-size: 9px; }
  .cs-state-card > .cs-note { margin: 0; padding: 13px 16px; }

  .cs-eyebrow {
    margin: 0 0 7px;
    color: var(--cs-accent);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .cs-panel-heading {
    margin: 0 0 22px;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .cs-note,
  .cs-empty p {
    color: var(--cs-faint);
    font-size: 12px;
    line-height: 1.55;
  }

  .cs-empty {
    display: grid;
    place-items: center;
    min-height: 360px;
    padding: 36px;
    text-align: center;
  }

  .cs-empty p { max-width: 34ch; margin: 9px 0 0; }
  .cs-timeline { margin: 0; padding: 0; border-top: 1px solid var(--cs-border); list-style: none; }
  .cs-timeline li {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 12px;
    padding: 13px 0;
    border-bottom: 1px solid var(--cs-border);
  }

  .cs-timeline time { color: var(--cs-faint); font-size: 9px; }
  .cs-timeline span { color: var(--cs-muted); font-family: "SFMono-Regular", Consolas, monospace; font-size: 10px; }
  .cs-timeline li[data-accent="true"] span { color: var(--cs-accent); }
  .cs-notice {
    position: absolute;
    right: 18px;
    bottom: 18px;
    left: 18px;
    padding: 12px 14px;
    border: 1px solid rgba(255, 56, 92, 0.72);
    border-radius: 11px;
    color: #fff;
    background: #242125;
    box-shadow: 0 12px 36px rgba(0,0,0,0.34);
    font-size: 11px;
    text-align: center;
  }

  @keyframes cs-enter {
    from { opacity: 0; transform: translateX(12px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @media (max-width: 680px) {
    .cs-drawer {
      top: 10px;
      right: 10px;
      bottom: 10px;
      width: calc(100vw - 20px);
      height: calc(100vh - 20px);
      border: 1px solid var(--cs-border-strong);
      border-radius: var(--cs-radius-lg);
      box-shadow: 0 0 0 999px rgba(0,0,0,0.56), -18px 0 48px rgba(0,0,0,0.28);
    }
    .cs-resizer { display: none; }
    .cs-header { padding: 18px; }
    .cs-title-row { gap: 10px; }
    .cs-brand { gap: 8px; }
    .cs-title { font-size: 18px; }
    .cs-header-actions { gap: 4px; }
    .cs-text-button {
      min-height: 32px;
      padding: 0 9px;
      font-size: 11px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`;
