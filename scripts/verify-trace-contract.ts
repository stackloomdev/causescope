import { deepStrictEqual, equal, match, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { traceExportV1Example } from "./trace-export-v1-example";

const documentedExamplePath = fileURLToPath(
  new URL("../docs/public/examples/trace-v1.json", import.meta.url),
);
const sharedSourcePath = fileURLToPath(new URL("../packages/shared/src/index.ts", import.meta.url));
const publishedSharedTypesPath = fileURLToPath(
  new URL("../packages/causescope/types/shared.d.ts", import.meta.url),
);
const documentedExample = JSON.parse(readFileSync(documentedExamplePath, "utf8")) as unknown;

equal(readFileSync(sharedSourcePath, "utf8"), readFileSync(publishedSharedTypesPath, "utf8"));
deepStrictEqual(documentedExample, traceExportV1Example);
equal(traceExportV1Example.version, 1);
deepStrictEqual(traceExportV1Example.timeline[0]?.metadata?.handlerProperty, {
  type: "primitive",
  value: "onClick",
});
deepStrictEqual(traceExportV1Example.expressions[0]?.inputs.policyReason, {
  type: "undefined",
});

const serializedExample = JSON.stringify(documentedExample);
match(serializedExample, /\[REDACTED\]/);
ok(!serializedExample.includes("/Users/"));
ok(!serializedExample.includes("\\Users\\"));
ok(!/npm_[A-Za-z0-9]{20,}/.test(serializedExample));

console.log("Trace export v1 documentation matches the real exporter and published TypeScript contract.");
