interface NetworkStartInput {
  transport: "fetch" | "xhr";
  method: string;
  url: string;
  headers?: HeadersInit;
}

interface NetworkCompleteInput {
  id: string;
  status?: number;
  responseType?: string;
  error?: unknown;
}

interface StorageAccessInput {
  storage: "localStorage" | "sessionStorage";
  operation: "getItem" | "setItem" | "removeItem";
  key: string;
  value?: string | null;
}

export interface BrowserInstrumentationHooks {
  networkStart(input: NetworkStartInput): string | null;
  networkComplete(input: NetworkCompleteInput): void;
  networkBody(id: string, value: unknown, responseType: string): void;
  storageAccess(input: StorageAccessInput): void;
}

interface InstrumentationState {
  hooks: BrowserInstrumentationHooks;
  responseIds: WeakMap<Response, string>;
  xhrRequests: WeakMap<XMLHttpRequest, { method: string; url: string; headers: Headers }>;
  xhrTraceIds: WeakMap<XMLHttpRequest, string>;
  xhrBodiesRecorded: WeakSet<XMLHttpRequest>;
}

const STATE_KEY = Symbol.for("causescope.browser-instrumentation");

function runtimeState(): InstrumentationState | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[STATE_KEY] as InstrumentationState | undefined;
}

function safeCall(callback: () => void): void {
  try {
    callback();
  } catch {
    // Diagnostics must never alter host behavior.
  }
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit): NetworkStartInput {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return {
      transport: "fetch",
      method: init?.method ?? input.method ?? "GET",
      url: input.url,
      headers: init?.headers ?? input.headers,
    };
  }
  return {
    transport: "fetch",
    method: init?.method ?? "GET",
    url: String(input),
    ...(init?.headers ? { headers: init.headers } : {}),
  };
}

function storageName(storage: Storage): "localStorage" | "sessionStorage" | null {
  try {
    if (storage === window.localStorage) return "localStorage";
    if (storage === window.sessionStorage) return "sessionStorage";
  } catch {
    // Storage access can be denied by the browser.
  }
  return null;
}

export function installBrowserInstrumentation(hooks: BrowserInstrumentationHooks): void {
  if (typeof window === "undefined") return;
  const existing = runtimeState();
  if (existing) {
    existing.hooks = hooks;
    return;
  }

  const state: InstrumentationState = {
    hooks,
    responseIds: new WeakMap<Response, string>(),
    xhrRequests: new WeakMap<XMLHttpRequest, { method: string; url: string; headers: Headers }>(),
    xhrTraceIds: new WeakMap<XMLHttpRequest, string>(),
    xhrBodiesRecorded: new WeakSet<XMLHttpRequest>(),
  };
  (globalThis as Record<PropertyKey, unknown>)[STATE_KEY] = state;

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch;
    window.fetch = async function causeScopeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const details = requestDetails(input, init);
      let traceId: string | null = null;
      safeCall(() => { traceId = state.hooks.networkStart(details); });
      try {
        const response = await originalFetch.call(this, input, init);
        if (traceId) {
          state.responseIds.set(response, traceId);
          safeCall(() => state.hooks.networkComplete({
            id: traceId as string,
            status: response.status,
            responseType: response.headers.get("content-type") ?? "",
          }));
        }
        return response;
      } catch (error) {
        if (traceId) safeCall(() => state.hooks.networkComplete({ id: traceId as string, error }));
        throw error;
      }
    };
  }

  if (typeof Response !== "undefined") {
    const originalJson = Response.prototype.json;
    Response.prototype.json = async function causeScopeJson(): Promise<unknown> {
      const value = await originalJson.call(this);
      const traceId = state.responseIds.get(this);
      if (traceId) safeCall(() => state.hooks.networkBody(traceId, value, "json"));
      return value;
    };
  }

  if (typeof XMLHttpRequest !== "undefined") {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalResponse = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");

    // Bind JSON provenance at the exact moment application code reads
    // `request.response`. This is earlier than a promise resolution or state
    // update made from the consumer's load callback and preserves identity.
    if (originalResponse?.get && originalResponse.configurable) {
      Object.defineProperty(XMLHttpRequest.prototype, "response", {
        ...originalResponse,
        get(this: XMLHttpRequest): unknown {
          const value = originalResponse.get?.call(this);
          const traceId = state.xhrTraceIds.get(this);
          if (
            traceId
            && this.responseType === "json"
            && value !== null
          ) {
            state.xhrBodiesRecorded.add(this);
            // Some browser implementations may materialize a fresh parsed
            // object on a later getter call. Register every object returned to
            // application code; runtime response recording remains bounded.
            safeCall(() => state.hooks.networkBody(traceId, value, "json"));
          }
          return value;
        },
      });
    }

    XMLHttpRequest.prototype.open = function causeScopeOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
      state.xhrRequests.set(this, { method, url: String(url), headers: new Headers() });
      state.xhrBodiesRecorded.delete(this);
    };

    XMLHttpRequest.prototype.setRequestHeader = function causeScopeSetRequestHeader(name: string, value: string): void {
      originalSetRequestHeader.call(this, name, value);
      state.xhrRequests.get(this)?.headers.append(name, value);
    };

    XMLHttpRequest.prototype.send = function causeScopeSend(body?: Document | XMLHttpRequestBodyInit | null): void {
      const request = state.xhrRequests.get(this) ?? { method: "GET", url: "", headers: new Headers() };
      let traceId: string | null = null;
      safeCall(() => {
        traceId = state.hooks.networkStart({
          transport: "xhr",
          method: request.method,
          url: request.url,
          headers: request.headers,
        });
      });
      if (traceId) state.xhrTraceIds.set(this, traceId);
      const recordBody = (): void => {
        if (state.xhrBodiesRecorded.has(this) || this.responseType !== "json") return;
        const response = this.response;
        if (state.xhrBodiesRecorded.has(this) || response === null) return;
        const currentTraceId = state.xhrTraceIds.get(this);
        if (!currentTraceId) return;
        state.xhrBodiesRecorded.add(this);
        safeCall(() => state.hooks.networkBody(currentTraceId, response, "json"));
      };
      const complete = (): void => {
        const currentTraceId = state.xhrTraceIds.get(this);
        if (!currentTraceId) return;
        safeCall(() => state.hooks.networkComplete({
          id: currentTraceId,
          status: this.status,
          responseType: this.responseType || "text",
        }));
        recordBody();
      };
      // `readystatechange` reaches DONE before the consumer's `load` handler.
      // Registering the exact JSON object here preserves identity when the
      // consumer immediately resolves a promise or writes the response to state.
      const recordBodyWhenDone = (): void => {
        if (this.readyState !== XMLHttpRequest.DONE) return;
        this.removeEventListener("readystatechange", recordBodyWhenDone, true);
        recordBody();
      };
      this.addEventListener("readystatechange", recordBodyWhenDone, { capture: true });
      this.addEventListener("load", recordBody, { once: true, capture: true });
      this.addEventListener("loadend", complete, { once: true });
      try {
        originalSend.call(this, body ?? null);
      } catch (error) {
        if (traceId) safeCall(() => state.hooks.networkComplete({ id: traceId as string, error }));
        throw error;
      }
    };
  }

  if (typeof Storage !== "undefined") {
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;

    Storage.prototype.getItem = function causeScopeGetItem(key: string): string | null {
      const value = originalGetItem.call(this, key);
      const storage = storageName(this);
      if (storage) safeCall(() => state.hooks.storageAccess({ storage, operation: "getItem", key, value }));
      return value;
    };

    Storage.prototype.setItem = function causeScopeSetItem(key: string, value: string): void {
      originalSetItem.call(this, key, value);
      const storage = storageName(this);
      if (storage) safeCall(() => state.hooks.storageAccess({ storage, operation: "setItem", key, value }));
    };

    Storage.prototype.removeItem = function causeScopeRemoveItem(key: string): void {
      originalRemoveItem.call(this, key);
      const storage = storageName(this);
      if (storage) safeCall(() => state.hooks.storageAccess({ storage, operation: "removeItem", key }));
    };
  }
}
