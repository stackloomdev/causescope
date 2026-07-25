# Contributing to CauseScope

Thanks for helping improve CauseScope. Bug reports, focused fixes, tests, documentation, and narrowly scoped feature proposals are welcome.

The [public roadmap](ROADMAP.md) describes current priorities. Use [GitHub Discussions](https://github.com/stackloomdev/causescope/discussions) for setup questions and early ideas; use Issues for reproducible bugs or work with a concrete acceptance boundary. See [SUPPORT.md](SUPPORT.md) for the complete channel guide.

Testing the current beta in another application? Follow the [beta testing guide](https://stackloomdev.github.io/causescope/beta-testing) to reduce the case and sanitize public artifacts before opening a Discussion or Issue.

## Before opening an issue

- Search existing issues first.
- Reproduce the problem in a small React + Vite application when possible.
- Remove secrets, private source code, and customer data from screenshots and exported traces.
- Include React, Vite, Node.js, pnpm, browser, and CauseScope versions.

Security vulnerabilities should not be filed publicly. Follow [SECURITY.md](SECURITY.md).

## Choosing work

- `good first issue` means the expected files, evidence path, and acceptance check are already bounded.
- `help wanted` means a maintainer has accepted the direction, but the task may cross packages or require browser investigation.
- Feature proposals should identify a reliable evidence source. CauseScope does not add explanations that depend on guessing missing runtime data.
- Comment on an Issue before starting a large change so two contributors do not solve the same problem in parallel.

## Local setup

Requirements: Node.js 20 or 22 and pnpm 10.

```bash
pnpm install
pnpm check
```

Use `pnpm dev` to run the React 19 diagnostic lab. All authored source, tests, build configuration, and scripts must remain TypeScript or TSX. Do not add npm, Bun, or Yarn lockfiles.

Use a focused branch and keep generated output, credentials, private fixtures, and local trace exports out of commits.

## Pull requests

1. Keep each pull request focused on one behavior.
2. Add a regression test for behavior changes.
3. Verify the selected element in the browser for inspector or instrumentation changes.
4. Run `pnpm check` before requesting review.
5. Explain user-visible behavior, privacy implications, and production-bundle impact.

Maintainers use squash merges. A pull request is ready when its required checks pass, the browser-visible acceptance path has been exercised, and any public behavior or API change is represented in documentation and `CHANGELOG.md`.

CauseScope is evidence-first: when provenance is missing or ambiguous, report it as unavailable rather than inferring a convenient answer.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
