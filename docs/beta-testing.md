# Beta testing before 1.0

CauseScope is in public beta while its existing React + Vite evidence paths are hardened for stable 1.0. Beta testing is most useful when it checks a real debugging question and returns a small, public reproduction—not a private application dump.

CauseScope remains local-first and development-only throughout this process. It has no account, telemetry, hosted backend, or trace-upload service.

## Start with the smallest path

Choose one of these routes:

1. **No-install check:** [fork the live lab](https://stackblitz.com/fork/github/stackloomdev/causescope/tree/main/examples/stackblitz?title=CauseScope%20Live%20Lab), start it, select an element, and exercise the scenarios below.
2. **Existing application:** follow [Getting started](getting-started.md), install `causescope@beta`, and run the normal Vite development server.

Do not paste proprietary application code or production data into the live lab. Build an equivalent public fixture with invented names and values.

## What to validate

Test the evidence path that matches your application. An explicit **unavailable** result is correct when CauseScope does not have reliable evidence; a plausible guess is not.

| Scenario | What to verify |
| --- | --- |
| Ordinary text or static markup | The selected element resolves to the exact component, TypeScript file, line, column, and source snippet without inventing a dynamic cause. |
| Multiple pages, components, and files | After route changes and nested-component selections, the coordinates and component owner follow the newly selected element rather than stale state from the previous selection. |
| Decisions and expressions | The Why view shows the real runtime result and available operands or branches; missing evidence is marked unavailable. |
| Props and React state | After a real input, click, setter, or reducer update, Values and State belong to the selected component instance and the latest transition has the correct source and triggering event. |
| Network and storage | A development request or accessed storage key is correlated only when evidence exists, recording stays bounded, and credentials or secret-like values remain redacted. |
| React Query and Zustand | An explicitly installed adapter reports only the cache or stores supplied by the application, with no unrelated-store scan. |
| Selection and keyboard flow | Directly select another element while the drawer is open; then test Inspect, element selection, tab navigation, close, and focus return with the keyboard. |
| Trace export | The export uses trace schema v1, contains the selected evidence chain, stays bounded, and remains redacted after manual inspection. |

The current automated matrix is documented in [Validation](validation.md). Reports outside the documented compatibility range are still useful for discovery, but they are not support claims.

## Make a minimal public reproduction

1. Reproduce on the latest `causescope@beta` release.
2. Fork the live lab or create a small React + Vite project that uses only `.ts` and `.tsx` authored code.
3. Remove unrelated routes, components, dependencies, styles, and data while keeping the failure.
4. Preserve the boundary that matters: the selected element, component split, route change, updater, request, adapter setup, or plugin configuration.
5. Replace organization names, private paths, URLs, identifiers, payloads, and values with invented equivalents.
6. Run the development reproduction and a production build. Record whether production output contains any CauseScope control or marker.
7. Share a public StackBlitz or repository together with the exact interaction, observed evidence, and expected evidence.

If the behavior cannot be reproduced without private material, do not upload that material. Ask an abstract setup question in Discussions or use the private security channel when the behavior may be a vulnerability.

## Include this evidence

Copy this checklist into a Discussion or bug report:

```text
CauseScope version:
React version:
Vite version and React plugin:
Node.js version:
Package manager and version:
Browser and operating system:
Selected element and route:
Interaction before selection:
Observed evidence:
Expected evidence:
Minimal public reproduction:
Production build check:
Sanitization confirmed: yes/no
```

Do not attach an entire application trace when a source location, one transition, or a short redacted excerpt proves the issue.

## Sanitize before posting

CauseScope applies redaction, but the reporter is still responsible for reviewing every public artifact. Remove:

- passwords, tokens, API keys, cookies, authorization headers, session values, and recovery data;
- customer, employee, account, order, payment, or other personal identifiers;
- private source code, repository names, organization names, absolute local paths, and internal URLs;
- request or response bodies, state values, storage values, and query parameters that are not invented test data;
- browser chrome that reveals private tabs, bookmarks, profiles, or extensions;
- unreviewed screenshots, console output, source maps, and trace exports.

When in doubt, rebuild the case with generated data. Never weaken application security or npm/GitHub account security to produce a report.

## Choose the right channel

| Feedback state | Channel |
| --- | --- |
| Setup question, early beta observation, or behavior not yet reduced | [GitHub Discussions](https://github.com/stackloomdev/causescope/discussions) |
| Reproducible defect with a sanitized public TypeScript fixture | [Bug report](https://github.com/stackloomdev/causescope/issues/new?template=bug_report.yml) |
| Focused improvement with a reliable evidence source and acceptance boundary | [Feature request](https://github.com/stackloomdev/causescope/issues/new?template=feature_request.yml) |
| Suspected vulnerability or reproduction that must remain private | [Private vulnerability report](https://github.com/stackloomdev/causescope/security/advisories/new) |

The beta may intentionally adjust APIs before stable 1.0, but every package-surface change remains reviewable under the [Public API policy](public-api.md). CauseScope is not production monitoring, analytics, telemetry, or a hosted debugging service.
