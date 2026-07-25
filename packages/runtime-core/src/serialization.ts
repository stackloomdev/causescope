import type { RedactOptions, SerializedValue } from "@causescope/shared";

export const DEFAULT_REDACTION: RedactOptions = {
  headers: [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "token",
    "access_token",
    "refresh_token",
    "auth_token",
    "password",
    "secret",
    "client_secret",
    "api_key",
  ],
  queryParams: ["token", "access_token", "refresh_token", "auth_token", "password", "secret", "client_secret", "api_key"],
  objectKeys: ["password", "secret", "token", "access_token", "refresh_token", "auth_token", "client_secret", "api_key"],
};

const REDACTED = "[REDACTED]";

function canonicalKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveKey(key: string, candidates: string[]): boolean {
  const canonical = canonicalKey(key);
  if (!canonical) return false;
  return candidates.some((candidate) => {
    const sensitive = canonicalKey(candidate);
    return Boolean(sensitive) && (canonical === sensitive || canonical.endsWith(sensitive));
  });
}

export function mergeRedaction(overrides?: Partial<RedactOptions>): RedactOptions {
  const merge = (defaults: string[], configured: string[] | undefined): string[] => [
    ...new Set([...defaults, ...(configured ?? [])].map((value) => value.toLowerCase())),
  ];
  return {
    headers: merge(DEFAULT_REDACTION.headers, overrides?.headers),
    queryParams: merge(DEFAULT_REDACTION.queryParams, overrides?.queryParams),
    objectKeys: merge(DEFAULT_REDACTION.objectKeys, overrides?.objectKeys),
  };
}

export function redactUrl(url: string, options: RedactOptions): string {
  try {
    const base = typeof location === "undefined" ? "http://causescope.local" : location.href;
    const parsed = new URL(url, base);
    if (["data:", "javascript:"].includes(parsed.protocol)) return "[REDACTED URL]";
    if (parsed.username) parsed.username = REDACTED;
    if (parsed.password) parsed.password = REDACTED;
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveKey(key, options.queryParams)) parsed.searchParams.set(key, REDACTED);
    }
    if (parsed.hash) parsed.hash = REDACTED;
    if (/^[a-z][a-z\d+.-]*:/i.test(url)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "[REDACTED URL]";
  }
}

export function redactHeaders(headers: HeadersInit | undefined, options: RedactOptions): Record<string, string> {
  const output: Record<string, string> = {};
  if (!headers) return output;
  try {
    const parsed = new Headers(headers);
    parsed.forEach((value, key) => {
      output[key] = isSensitiveKey(key, options.headers) ? REDACTED : value;
    });
  } catch {
    // Invalid application headers should keep their original fetch behavior.
  }
  return output;
}

export function serializeValue(
  value: unknown,
  options: RedactOptions,
  maxDepth = 5,
  maxArrayLength = 100,
): SerializedValue {
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number): SerializedValue => {
    if (current instanceof Date) {
      return { type: "date", value: Number.isNaN(current.valueOf()) ? "Invalid Date" : current.toISOString() };
    }
    if (typeof current === "function") return { type: "function", ...(current.name ? { name: current.name } : {}) };
    if (typeof Element !== "undefined" && current instanceof Element) {
      return { type: "dom-node", tagName: current.tagName.toLowerCase() };
    }
    if (current === undefined) return { type: "undefined" };
    if (current === null || typeof current === "string" || typeof current === "boolean") {
      return { type: "primitive", value: current };
    }
    if (typeof current === "number") {
      return Number.isFinite(current)
        ? { type: "primitive", value: current }
        : { type: "unsupported", reason: `Non-finite number: ${String(current)}` };
    }
    if (typeof current === "bigint") return { type: "primitive", value: `${current.toString()}n` };
    if (typeof current === "symbol") return { type: "primitive", value: String(current) };
    if (typeof current !== "object") return { type: "unsupported", reason: "Unknown primitive value" };
    if (seen.has(current)) return { type: "unsupported", reason: "Circular reference" };
    if (depth >= maxDepth) return { type: "unsupported", reason: "Maximum depth reached" };
    seen.add(current);

    if (Array.isArray(current)) {
      let descriptors: Record<string, PropertyDescriptor>;
      try {
        descriptors = Object.getOwnPropertyDescriptors(current);
      } catch {
        return { type: "unsupported", reason: "Properties unavailable" };
      }
      const arrayLength = typeof descriptors.length?.value === "number" ? descriptors.length.value : 0;
      const visibleLength = Math.min(arrayLength, maxArrayLength);
      const values = Array.from({ length: visibleLength }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor) return { type: "undefined" } as const;
        return Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? visit(descriptor.value, depth + 1)
          : { type: "unsupported", reason: "Accessor not evaluated" } as const;
      });
      return {
        type: "array",
        value: values,
        ...(arrayLength > maxArrayLength ? { truncated: true } : {}),
      };
    }

    const output: Record<string, SerializedValue> = {};
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      descriptors = Object.getOwnPropertyDescriptors(current);
    } catch {
      return { type: "unsupported", reason: "Properties unavailable" };
    }
    const entries = Object.entries(descriptors).filter(([, descriptor]) => descriptor.enumerable);
    const limitedEntries = entries.slice(0, 100);
    for (const [key, descriptor] of limitedEntries) {
      output[key] = isSensitiveKey(key, options.objectKeys)
        ? { type: "primitive", value: REDACTED }
        : Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? visit(descriptor.value, depth + 1)
          : { type: "unsupported", reason: "Accessor not evaluated" };
    }
    return {
      type: "object",
      value: output,
      ...(entries.length > limitedEntries.length ? { truncated: true } : {}),
    };
  };

  return visit(value, 0);
}

export function serializedByteLength(value: SerializedValue): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}
