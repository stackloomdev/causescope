# Configuration

```ts
causeScope({
  enabled: true,
  openInEditor: true,
  editor: undefined,
  maxTimelineEvents: 200,
  maxTraceNodes: 10_000,
  maxNetworkResponseBytes: 1_000_000,
  maxNetworkBytes: 20_000_000,
  traceNetwork: true,
  traceStorage: true,
  ignoreComponents: ["src/components/ui", "InternalWrapper"],
  redact: {
    headers: ["x-workspace-secret"],
    queryParams: ["workspace_token"],
    objectKeys: ["privateNote"],
  },
});
```

| Option | Default | Purpose |
| --- | --- | --- |
| `enabled` | `true` | Disables every CauseScope development hook when false. |
| `include` | TSX/JSX files | Vite filter for source files. |
| `exclude` | dependencies and build output | Vite exclusion filter. |
| `openInEditor` | `true` | Enables the local development editor endpoint. |
| `editor` | auto-detected | Optional editor command understood by `launch-editor`. |
| `ignoreComponents` | `[]` | Component names or project-relative directories to exclude. |
| `traceNetwork` | `true` | Records bounded Fetch/XHR metadata and response bodies. |
| `traceStorage` | `true` | Records storage operations observed during the page run. |
| `redact` | secure defaults | Adds redaction keys; defaults are always retained. |

Configured redaction entries extend the built-in list rather than replacing it.

JSON downloads follow the versioned [trace export contract](/trace-export). Recording limits and redaction are applied before the document is created.
