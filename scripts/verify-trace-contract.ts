import { deepStrictEqual, equal, match, ok } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { traceExportV1Example } from "./trace-export-v1-example";

const documentedExamplePath = fileURLToPath(
  new URL("../docs/public/examples/trace-v1.json", import.meta.url),
);
const documentedExample = JSON.parse(readFileSync(documentedExamplePath, "utf8")) as unknown;

deepStrictEqual(documentedExample, traceExportV1Example);
equal(traceExportV1Example.version, 1);

const serializedExample = JSON.stringify(documentedExample);
match(serializedExample, /\[REDACTED\]/);
ok(!serializedExample.includes("/Users/"));
ok(!serializedExample.includes("\\Users\\"));
ok(!/npm_[A-Za-z0-9]{20,}/.test(serializedExample));

console.log("Trace export v1 documentation matches the public TypeScript contract.");
