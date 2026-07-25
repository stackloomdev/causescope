# Trace export contract

CauseScope exports a UTF-8 JSON document that contains the evidence for one selected element. The export is local: CauseScope creates a browser download and does not send the document to a service.

```ts
import type { TraceExportVersion } from "causescope";

export function hasSupportedTraceVersion(
  trace: unknown,
): trace is { version: TraceExportVersion } {
  return typeof trace === "object"
    && trace !== null
    && "version" in trace
    && trace.version === 1;
}
```

This guard establishes only the version boundary. Validate the required fields below before treating untrusted JSON as a complete `TraceExport`.

[Download the synthetic v1 example](/examples/trace-v1.json). The example is produced through the real runtime exporter, compared with the documented JSON, and type-checked against the packed public declaration; it contains no application or credential data.

## Version boundary

`version` identifies the trace format independently from the CauseScope package version. The current and only supported value is `1`.

- A CauseScope patch release can fix redaction, ordering, labels, or captured values without changing the v1 structure.
- A CauseScope minor release can add optional fields. Readers must ignore unknown fields and handle documented optional fields being absent.
- Removing or renaming a field, making an optional field required, changing a field type, or changing its meaning requires a new trace-format version.
- Readers must reject or explicitly migrate an unsupported `version`; they must not silently interpret it as v1.

## Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `version` | yes | Numeric trace format. It is `1` for this contract. |
| `generatedAt` | yes | ISO 8601 time when the export was created. |
| `element` | yes | Selected DOM tag, visible label, and captured attributes. |
| `source` | no | Project-relative file, one-based line, and one-based column for the selected source node. |
| `component` | no | Selected React component, parent component names, and captured props. |
| `expressions` | yes | Instrumented JSX expressions associated with the selected element. |
| `stateChanges` | yes | Recorded setter and reducer transitions available to this inspection. |
| `networkRequests` | yes | Bounded Fetch/XHR evidence observed during the page run. |
| `storageAccesses` | yes | Observed storage operations; CauseScope never enumerates browser storage. |
| `storeUpdates` | yes | Updates supplied by explicitly installed state adapters. |
| `timeline` | yes | Bounded event, update, render, and inspection chronology. |

Empty collections are exported as empty arrays rather than omitted. `source` and `component` are optional contract fields; the current exporter still includes component parents and props when a component name is unavailable. Timestamps inside evidence records are Unix milliseconds; `generatedAt` is an ISO string.

## Values and source locations

Captured structured values use a tagged representation: `primitive`, `date`, `array`, `object`, `function`, `react-element`, `dom-node`, or `unsupported`. Arrays and objects may include `truncated: true`. Unsupported or intentionally unevaluated values carry a reason instead of a guessed value.

Source locations use project-relative paths. A consumer must not assume a particular editor, operating-system path separator, or repository root.

## Redaction

JSON export performs a second redaction pass over expression inputs and results, state transitions, event metadata, element text and attributes, origin metadata, storage values, and timeline labels. Network headers, URLs, and response bodies are already redacted when recorded.

Built-in matching covers common authorization, cookie, API-key, token, password, and secret variants. Project-specific redaction rules extend those defaults. Automatic redaction cannot understand every business secret, so review an export before sharing it.

## Recording bounds

Exports reflect the configured in-memory recording limits. Defaults are 10,000 trace nodes, 200 timeline events, 1 MB per response, and 20 MB of response data in total. Serialized values stop at object depth 5, 100 array entries, and 100 enumerable object properties. A truncated response or structured value is marked in its value record; missing evidence is not reconstructed during export.

See [Configuration](/configuration) for runtime options and [Privacy](/privacy) for the complete observation and threat-model boundary.
