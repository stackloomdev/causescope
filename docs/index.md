---
layout: home
title: CauseScope
titleTemplate: Click any UI. Trace the cause.
description: Trace rendered React UI back to the exact TSX, branch, state, props, store, and network evidence.
---

<main class="cs-landing">
  <section class="cs-hero" aria-labelledby="hero-title">
    <div class="cs-hero-copy">
      <div class="cs-eyebrow"><span class="cs-pulse"></span> Local-first · Development only</div>
      <h1 id="hero-title">The evidence chain<br><em>behind any React UI.</em></h1>
      <p class="cs-lede">Click a rendered element. CauseScope follows it back to the exact TSX, live expression, deciding branch, state transition, prop, store, or request that produced it.</p>
      <div class="cs-actions">
        <a class="cs-button cs-button-primary" href="./getting-started">Install in one minute <span aria-hidden="true">↗</span></a>
        <a class="cs-button cs-button-secondary" href="https://stackblitz.com/fork/github/stackloomdev/causescope?startScript=dev%3Astackblitz">Try the live lab</a>
      </div>
      <div class="cs-proofline" aria-label="Compatibility and privacy facts">
        <span>React 18–19</span><span>Vite 5–8</span><span>No account</span><span>Zero production code</span>
      </div>
    </div>
    <div class="cs-hero-visual">
      <div class="cs-visual-head">
        <span><i></i><i></i><i></i></span>
        <code>localhost:5173/orders</code>
        <b>INSPECTING</b>
      </div>
      <img src="./assets/causescope-inspector.png" alt="CauseScope inspector tracing a React UI element to source and runtime evidence" />
      <div class="cs-crosshair" aria-hidden="true"><span></span></div>
      <div class="cs-evidence-tag cs-evidence-source"><small>01 · SOURCE</small><strong>ProductEditor.tsx:112</strong></div>
      <div class="cs-evidence-tag cs-evidence-state"><small>02 · STATE</small><strong>isDirty = true</strong></div>
    </div>
  </section>

  <section class="cs-chain" aria-labelledby="chain-title">
    <div class="cs-section-intro">
      <span class="cs-kicker">THE TRACE, NOT A GUESS</span>
      <h2 id="chain-title">One click. Four layers of evidence.</h2>
      <p>CauseScope keeps the DOM, source, runtime values, and update history connected—so each answer shows where it came from.</p>
    </div>
    <ol class="cs-chain-grid">
      <li><span>01</span><b>Rendered UI</b><p>Select text, buttons, inputs, lists, or any ordinary DOM element.</p></li>
      <li><span>02</span><b>Exact TSX</b><p>See the component, file, line, column, source snippet, and component stack.</p></li>
      <li><span>03</span><b>Live decision</b><p>Inspect operands, computed results, conditions, props, hooks, and stores.</p></li>
      <li><span>04</span><b>Update trail</b><p>Follow setter calls, events, network requests, and storage changes over time.</p></li>
    </ol>
  </section>

  <section class="cs-case" aria-labelledby="case-title">
    <div class="cs-case-question">
      <span class="cs-kicker">A REAL DEBUGGING QUESTION</span>
      <h2 id="case-title">“Why can’t this order be refunded?”</h2>
      <p>The disabled button is only the symptom. The useful answer is the branch and the live value behind it.</p>
      <div class="cs-case-button"><span>Refund order</span><small>disabled</small></div>
    </div>
    <div class="cs-case-trace" aria-label="Example CauseScope evidence chain">
      <div class="cs-trace-row"><span>ELEMENT</span><code>&lt;button disabled={!canRefund}&gt;</code></div>
      <div class="cs-trace-row cs-trace-hot"><span>DECISION</span><code>canRefund → false</code></div>
      <div class="cs-trace-row"><span>OPERAND</span><code>order.status === "paid" → false</code></div>
      <div class="cs-trace-row"><span>STATE</span><code>order.status = "pending"</code></div>
      <div class="cs-trace-row"><span>ORIGIN</span><code>GET /api/orders/4821 · 200</code></div>
      <div class="cs-trace-footer"><span>5 linked observations</span><b>Local browser memory only</b></div>
    </div>
  </section>

  <section class="cs-principles" aria-labelledby="principles-title">
    <div class="cs-section-intro">
      <span class="cs-kicker">BUILT FOR THE INNER LOOP</span>
      <h2 id="principles-title">Evidence-rich without becoming infrastructure.</h2>
    </div>
    <div class="cs-principle-grid">
      <article><span>LOCAL</span><h3>Your app stays on your machine.</h3><p>No account, cloud service, API key, telemetry, or upload path. Export redaction is applied again before data leaves the panel.</p></article>
      <article><span>PRECISE</span><h3>Coordinates you can act on.</h3><p>Jump from a normal page element to its exact TSX location, then switch directly to another element without restarting inspection.</p></article>
      <article><span>ABSENT</span><h3>Nothing ships to production.</h3><p>The plugin runs only in Vite’s development server. Production builds contain no overlay, endpoint, instrumentation, or debug attributes.</p></article>
    </div>
  </section>

  <section class="cs-compare" aria-labelledby="compare-title">
    <div class="cs-section-intro">
      <span class="cs-kicker">A DIFFERENT LAYER</span>
      <h2 id="compare-title">Use the right instrument for the question.</h2>
      <p>CauseScope complements the tools already in a React developer’s browser.</p>
    </div>
    <div class="cs-table-wrap">
      <table>
        <thead><tr><th>Tool category</th><th>Best at</th><th>Evidence chain</th></tr></thead>
        <tbody>
          <tr><td>React DevTools</td><td>Component tree, props, and hooks</td><td>Component-level runtime view</td></tr>
          <tr><td>Performance scanners</td><td>Finding expensive renders</td><td>Performance observations</td></tr>
          <tr><td>Source locators</td><td>Opening a component file</td><td>UI → source location</td></tr>
          <tr class="cs-table-featured"><td>CauseScope</td><td>Explaining why rendered UI has its current value or state</td><td>UI → TSX → decision → update origin</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section class="cs-install" aria-labelledby="install-title">
    <div>
      <span class="cs-kicker">TWO LINES TO START</span>
      <h2 id="install-title">Add evidence to your next debugging session.</h2>
      <p>CauseScope supports React 18–19 and Vite 5–8. This repository is a pnpm Workspace + Turborepo monorepo; consumers can use any npm-compatible package manager.</p>
      <div class="cs-actions">
        <a class="cs-button cs-button-primary" href="./getting-started">Read the guide <span aria-hidden="true">↗</span></a>
        <a class="cs-button cs-button-secondary" href="https://github.com/stackloomdev/causescope">View the source</a>
      </div>
    </div>
    <div class="cs-code-window">
      <div class="cs-code-tabs"><b>terminal</b><span>vite.config.ts</span></div>
      <pre><code><span class="cs-code-muted">$</span> pnpm add -D causescope@beta<br /><br /><span class="cs-code-pink">import</span> causeScope <span class="cs-code-pink">from</span> <span class="cs-code-green">"causescope/vite"</span>;<br /><br /><span class="cs-code-pink">export default</span> defineConfig({
  plugins: [react(), causeScope()],
});</code></pre>
    </div>
  </section>
</main>
