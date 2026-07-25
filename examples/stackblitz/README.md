# CauseScope live lab

This folder is a standalone TypeScript project used by the public StackBlitz link. It intentionally installs the published `causescope` package instead of reaching outside this directory, because StackBlitz imports only this subfolder.

```bash
pnpm install
pnpm dev
```

Open the CauseScope inspector and select the static heading, release status, progress bar, or disabled publish button. Unlock the review and add an approval to produce real React state transitions before inspecting the affected UI again.
