# Architecture

CauseScope keeps build-time, browser-runtime, React-internal, and presentation responsibilities separate.

1. The Vite plugin runs only in the development server and invokes the Babel transform before React's transform.
2. The Babel plugin adds stable source metadata and wraps expressions without changing their evaluation count or short-circuit behavior.
3. The core runtime records bounded evidence and correlates values with state, events, stores, network responses, and storage accesses.
4. The React adapter is the only package that reads Fiber internals and supports both React 18 and 19 layouts.
5. The overlay renders with Preact inside Shadow DOM so application CSS does not affect it.
6. A production verification gate scans built application output for every known runtime and instrumentation marker.

The public `causescope` package bundles all private workspace modules. Consumers install one package and never resolve internal `@causescope/*` names.
