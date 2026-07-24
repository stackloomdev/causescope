# Contributing to CauseScope

Thanks for helping improve CauseScope. Bug reports, focused fixes, tests, documentation, and narrowly scoped feature proposals are welcome.

## Before opening an issue

- Search existing issues first.
- Reproduce the problem in a small React + Vite application when possible.
- Remove secrets, private source code, and customer data from screenshots and exported traces.
- Include React, Vite, Node.js, pnpm, browser, and CauseScope versions.

Security vulnerabilities should not be filed publicly. Follow [SECURITY.md](SECURITY.md).

## Local setup

Requirements: Node.js 20 or 22 and pnpm 10.

```bash
pnpm install
pnpm check
```

Use `pnpm dev` to run the React 19 diagnostic lab. All authored source, tests, build configuration, and scripts must remain TypeScript or TSX. Do not add npm, Bun, or Yarn lockfiles.

## Pull requests

1. Keep each pull request focused on one behavior.
2. Add a regression test for behavior changes.
3. Verify the selected element in the browser for inspector or instrumentation changes.
4. Run `pnpm check` before requesting review.
5. Explain user-visible behavior, privacy implications, and production-bundle impact.

CauseScope is evidence-first: when provenance is missing or ambiguous, report it as unavailable rather than inferring a convenient answer.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
