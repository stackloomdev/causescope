import type { ReactRuntimeAdapter } from "@causescope/shared";

type FiberLike = {
  alternate?: unknown;
  return?: unknown;
  type?: unknown;
  elementType?: unknown;
  memoizedProps?: unknown;
  memoizedState?: unknown;
  stateNode?: unknown;
};

type HookLike = {
  next?: unknown;
  queue?: unknown;
};

type NamedComponent = {
  displayName?: string;
  name?: string;
  render?: unknown;
  type?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFiber(value: unknown): FiberLike | null {
  return isRecord(value) ? (value as FiberLike) : null;
}

function readNamedComponent(value: unknown): string | null {
  if (typeof value === "function") {
    const component = value as NamedComponent;
    return component.displayName ?? component.name ?? null;
  }

  if (!isRecord(value)) return null;
  const component = value as NamedComponent;
  if (component.displayName) return component.displayName;
  if (component.name) return component.name;
  if (component.render) return readNamedComponent(component.render);
  if (component.type) return readNamedComponent(component.type);
  return null;
}

function collectStateSetterIdentities(fiber: unknown): object[] {
  const setters: object[] = [];
  const seenSetters = new Set<object>();
  const seenHooks = new Set<object>();
  const fibers = [asFiber(fiber), asFiber(asFiber(fiber)?.alternate)].filter(
    (candidate): candidate is FiberLike => Boolean(candidate),
  );

  for (const candidate of fibers) {
    let hook = candidate.memoizedState;
    let depth = 0;
    while (isRecord(hook) && depth < 100 && !seenHooks.has(hook)) {
      seenHooks.add(hook);
      const queue = isRecord((hook as HookLike).queue)
        ? (hook as HookLike).queue as Record<string, unknown>
        : null;
      const dispatch = queue?.dispatch;
      if (typeof dispatch === "function" && !seenSetters.has(dispatch)) {
        seenSetters.add(dispatch);
        setters.push(dispatch);
      }
      hook = (hook as HookLike).next;
      depth += 1;
    }
  }

  return setters;
}

function fiberRoot(fiber: FiberLike): FiberLike {
  let current = fiber;
  let depth = 0;
  while (depth < 100) {
    const parent = asFiber(current.return);
    if (!parent) return current;
    current = parent;
    depth += 1;
  }
  return current;
}

function resolveCurrentFiber(fiber: FiberLike, currentHostProps?: unknown): FiberLike {
  const alternate = asFiber(fiber.alternate);
  if (!alternate) return fiber;

  // React stores the currently committed host props directly on the DOM node.
  // Matching that object identity is the most precise way to choose between a
  // stale private Fiber pointer and its committed alternate.
  if (currentHostProps !== undefined) {
    if (alternate.memoizedProps === currentHostProps) return alternate;
    if (fiber.memoizedProps === currentHostProps) return fiber;
  }

  // Fallback for non-host callers: HostRoot.stateNode.current identifies the
  // root Fiber belonging to the committed tree.
  const root = fiberRoot(fiber);
  const alternateRoot = fiberRoot(alternate);
  const rootState = isRecord(root.stateNode) ? root.stateNode : null;
  const alternateRootState = isRecord(alternateRoot.stateNode) ? alternateRoot.stateNode : null;
  const currentRoot = rootState?.current ?? alternateRootState?.current;
  if (currentRoot === alternateRoot) return alternate;
  return fiber;
}

export interface ReactRuntimeAdapterOptions {
  ignoreComponents?: string[];
}

function ignoresComponent(name: string, patterns: string[]): boolean {
  if (name.endsWith("Provider")) return true;
  return patterns.some((pattern) => {
    const normalized = pattern.trim();
    return normalized.length > 0 && !normalized.includes("/")
      && (name === normalized || name.includes(normalized));
  });
}

export function createReactRuntimeAdapter(options: ReactRuntimeAdapterOptions = {}): ReactRuntimeAdapter {
  const ignoredComponents = options.ignoreComponents ?? [];
  return {
    findFiberFromElement(element: Element): unknown | null {
      const record = element as unknown as Record<string, unknown>;
      const key = Object.keys(record).find(
        (candidate) => candidate.startsWith("__reactFiber$") || candidate.startsWith("__reactInternalInstance$"),
      );
      const fiber = key ? asFiber(record[key]) : null;
      if (!fiber) return null;
      const propsKey = Object.keys(record).find((candidate) => candidate.startsWith("__reactProps$"));
      return resolveCurrentFiber(fiber, propsKey ? record[propsKey] : undefined);
    },

    getParentFiber(fiber: unknown): unknown | null {
      return asFiber(fiber)?.return ?? null;
    },

    getComponentName(fiber: unknown): string | null {
      const candidate = asFiber(fiber);
      if (!candidate) return null;
      if (typeof candidate.type === "string") return null;
      return readNamedComponent(candidate.type) ?? readNamedComponent(candidate.elementType);
    },

    getCurrentProps(fiber: unknown, element?: Element): unknown {
      if (element) {
        const record = element as unknown as Record<string, unknown>;
        const propsKey = Object.keys(record).find((candidate) => candidate.startsWith("__reactProps$"));
        if (propsKey) return record[propsKey];
      }
      return asFiber(fiber)?.memoizedProps;
    },

    getComponentStack(element: Element): string[] {
      const names: string[] = [];
      let fiber: unknown | null = this.findFiberFromElement(element);
      let depth = 0;

      while (fiber && depth < 40) {
        const name = this.getComponentName(fiber);
        if (name && !ignoresComponent(name, ignoredComponents) && names[names.length - 1] !== name) names.push(name);
        fiber = this.getParentFiber(fiber);
        depth += 1;
      }

      return names;
    },

    getComponentFrames(element: Element) {
      const frames: Array<{ componentName: string; props: Record<string, unknown> }> = [];
      let fiber: unknown | null = this.findFiberFromElement(element);
      let depth = 0;

      while (fiber && depth < 40) {
        const candidate = asFiber(fiber);
        const componentName = this.getComponentName(fiber);
        if (componentName && !ignoresComponent(componentName, ignoredComponents) && isRecord(candidate?.memoizedProps)) {
          frames.push({ componentName, props: candidate.memoizedProps });
        }
        fiber = this.getParentFiber(fiber);
        depth += 1;
      }

      return frames;
    },

    getComponentStateBindings(element: Element) {
      const bindings: Array<{ componentName: string; setterIdentities: object[] }> = [];
      let fiber: unknown | null = this.findFiberFromElement(element);
      let depth = 0;

      while (fiber && depth < 40) {
        const name = this.getComponentName(fiber);
        if (name && !ignoresComponent(name, ignoredComponents)) {
          bindings.push({
            componentName: name,
            setterIdentities: collectStateSetterIdentities(fiber),
          });
        }
        fiber = this.getParentFiber(fiber);
        depth += 1;
      }

      return bindings;
    },
  };
}
