# Community and support

CauseScope is developed in public. Pick the channel that matches the state of the work:

| Need | Channel |
| --- | --- |
| Installation or configuration help | [GitHub Discussions](https://github.com/stackloomdev/causescope/discussions) |
| Beta observation not yet reduced to a public fixture | [GitHub Discussions](https://github.com/stackloomdev/causescope/discussions) |
| Early idea with open product or API questions | [GitHub Discussions](https://github.com/stackloomdev/causescope/discussions) |
| Reproducible defect with a public TypeScript fixture | [Bug report](https://github.com/stackloomdev/causescope/issues/new?template=bug_report.yml) |
| Focused, implementation-ready improvement | [Feature request](https://github.com/stackloomdev/causescope/issues/new?template=feature_request.yml) |
| Security concern or sensitive reproduction | [Private vulnerability report](https://github.com/stackloomdev/causescope/security/advisories/new) |

Never post credentials, customer data, private source code, or unredacted trace exports publicly.

Before testing the current beta in a real application, follow the [Beta testing guide](beta-testing.md) for the scenario matrix, minimal public reproduction workflow, and artifact sanitization checklist.

## Current direction

The [public roadmap](https://github.com/stackloomdev/causescope/blob/main/ROADMAP.md) prioritizes 1.0 reliability, browser and accessibility coverage, a documented trace-export contract, and regression fixtures based on real provenance gaps.

The roadmap is directional rather than a delivery promise. An integration is supported only after it has public fixtures, automated checks, and documentation.

## Your first contribution

1. Pick a bounded [`good first issue`](https://github.com/stackloomdev/causescope/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22).
2. Follow the pnpm Workspace setup in [CONTRIBUTING.md](https://github.com/stackloomdev/causescope/blob/main/CONTRIBUTING.md).
3. Add or update the smallest fixture that reproduces the evidence path.
4. Run `pnpm check` and verify the selected element in a real browser.
5. Describe user-visible behavior, privacy impact, and production-bundle impact in the pull request.

See the complete [support policy](https://github.com/stackloomdev/causescope/blob/main/SUPPORT.md) and [Code of Conduct](https://github.com/stackloomdev/causescope/blob/main/CODE_OF_CONDUCT.md).
