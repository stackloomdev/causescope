# Privacy and threat model

CauseScope is designed for local development. It has no account system, telemetry, analytics, cloud service, or upload endpoint.

## Data it can observe

Depending on configuration and the selected element, CauseScope can observe:

- instrumented JSX expression operands and results;
- current props and hook state for the selected React component path;
- observed Fetch/XHR request metadata and bounded response bodies;
- storage operations made after instrumentation is installed;
- explicitly configured React Query caches and Zustand stores.

This access is powerful. Do not enable CauseScope on a public or untrusted development deployment.

## Redaction

Built-in rules redact authorization, cookie, API-key, token, password, and secret variants. Matching covers common camelCase, snake_case, and kebab-case forms. Custom rules extend rather than replace defaults. JSON and Markdown exports perform redaction again.

No automatic redaction system can understand every domain-specific secret. Add project-specific keys and review every export before sharing it.

The exported fields, compatibility rules, and synthetic example are documented in the [trace export contract](/trace-export).

## Recording bounds

Defaults limit the runtime to 10,000 trace nodes, 200 timeline events, 1 MB per response, 20 MB of response data in total, object depth 5, and 100 array entries. Object getters are never invoked for diagnostics.

Disable optional observation when it is unnecessary:

```ts
causeScope({
  traceNetwork: false,
  traceStorage: false,
});
```

## Editor endpoint

The editor endpoint accepts only a CauseScope POST request, resolves real paths, and rejects files outside the Vite project root. Set `openInEditor: false` when this capability is not required.
