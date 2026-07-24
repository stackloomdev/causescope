# Security policy

## Supported versions

Security fixes are provided for the latest published beta or stable release.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for `stackloomdev/causescope`. Do not open a public issue for a suspected vulnerability and do not include real credentials, source code, trace exports, or customer data in public discussions.

Include the affected version, impact, reproduction steps, and any suggested mitigation. You should receive an initial response within seven days. A coordinated disclosure date will be agreed upon after the report is validated.

## Trust boundary

CauseScope is a development-only tool with access to rendered UI, instrumented expression values, selected React component state and props, observed browser storage calls, and optionally recorded network metadata and response bodies. It should not be enabled on shared or public development environments unless everyone with page access is trusted.

CauseScope has no telemetry or upload path. Exports are created locally and are re-redacted, but they should still be reviewed before sharing. See [docs/privacy.md](docs/privacy.md) for the full threat model and controls.
