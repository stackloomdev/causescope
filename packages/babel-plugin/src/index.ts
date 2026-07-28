import { createHash } from "node:crypto";
import { relative, sep } from "node:path";
import type { NodePath, PluginObj, PluginPass } from "@babel/core";
import { generate } from "@babel/generator";
import * as t from "@babel/types";

export interface CauseScopeBabelPluginOptions {
  root?: string;
}

interface SetterMetadata {
  bindingIdentifier: t.Identifier;
  stateBindingIdentifier: t.Identifier;
  setterIdentifier: t.Identifier;
  stateIdentifier: t.Identifier;
  stateId: string;
  stateName: string;
  componentName: string;
  source: { file: string; line: number; column: number };
  hookType: "state" | "reducer";
}

interface PropBindingMetadata {
  componentName: string;
  path: string;
}

interface StorageBindingMetadata {
  storage: "localStorage" | "sessionStorage";
  key: string;
}

interface DerivedBindingMetadata {
  bindingIdentifier: t.Identifier;
  initPath: NodePath<t.Expression>;
  source: { file: string; line: number; column: number };
  inputNamespace: string;
  traceIdentifier?: t.Identifier;
  condition?: t.ObjectExpression;
  used: boolean;
}

interface DerivedConditionReference {
  id: string;
  condition: t.ObjectExpression;
}

interface CauseScopePluginState extends PluginPass {
  opts: CauseScopeBabelPluginOptions;
  causeScope: {
    needsRuntime: boolean;
    runtimeIdentifier?: t.Identifier;
    registrations: Map<t.VariableDeclaration, SetterMetadata[]>;
    setters: Map<t.Identifier, SetterMetadata>;
    states: Map<t.Identifier, SetterMetadata>;
    props: Map<t.Identifier, PropBindingMetadata>;
    storage: Map<t.Identifier, StorageBindingMetadata>;
    derived: Map<t.Identifier, DerivedBindingMetadata>;
    aliases: Map<t.Identifier, LocalAliasMetadata>;
  };
}

/**
 * A local binding that reads a fixed path out of another binding, through
 * destructuring or a static member read. `const { status } = order` and
 * `const status = order.status` both resolve to the same root and path, so a
 * primitive read through either form keeps the provenance that a direct
 * `order.status` in JSX would have had.
 */
interface LocalAliasMetadata {
  /** Binding identifier of the root object the path is read from. */
  root: t.Identifier;
  /** Root variable name, re-resolved at capture time to reject shadowing. */
  rootName: string;
  /** Access path from the root, in the same form as `staticMemberInfo`. */
  accessPath: string;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha1").update(value).digest("hex").slice(0, 10)}`;
}

function normalizeFile(filename: string, root?: string): string {
  const normalized = root ? relative(root, filename) : filename;
  return normalized.split(sep).join("/");
}

function getSource(path: NodePath, state: CauseScopePluginState): { file: string; line: number; column: number } {
  const start = path.node.loc?.start;
  const filename = state.file.opts.filename ?? "unknown.tsx";
  return {
    file: normalizeFile(filename, state.opts.root),
    line: start?.line ?? 1,
    column: (start?.column ?? 0) + 1,
  };
}

function getComponentName(path: NodePath): string {
  const functionPath = path.findParent(
    (candidate) =>
      candidate.isFunctionDeclaration() || candidate.isFunctionExpression() || candidate.isArrowFunctionExpression(),
  );
  if (!functionPath) return "UnknownComponent";

  if (functionPath.isFunctionDeclaration() && functionPath.node.id) return functionPath.node.id.name;
  if ((functionPath.isFunctionExpression() || functionPath.isArrowFunctionExpression()) && functionPath.parentPath.isVariableDeclarator()) {
    const id = functionPath.parentPath.node.id;
    if (t.isIdentifier(id)) return id.name;
  }

  return "AnonymousComponent";
}

function isNativeElement(path: NodePath<t.JSXOpeningElement>): boolean {
  const name = path.node.name;
  return t.isJSXIdentifier(name) && (name.name[0] === name.name[0]?.toLowerCase() || name.name.includes("-"));
}

function jsxName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string {
  if (t.isJSXIdentifier(name)) return name.name;
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`;
  return `${jsxName(name.object)}.${jsxName(name.property)}`;
}

function collectPropBindings(programPath: NodePath<t.Program>, state: CauseScopePluginState): void {
  programPath.traverse({
    Function(functionPath) {
      const componentName = functionPath.isFunctionDeclaration() && functionPath.node.id
        ? functionPath.node.id.name
        : functionPath.parentPath.isVariableDeclarator() && t.isIdentifier(functionPath.parentPath.node.id)
          ? functionPath.parentPath.node.id.name
          : "AnonymousComponent";
      const firstParameter = functionPath.node.params[0];
      if (!firstParameter || !t.isPatternLike(firstParameter)) return;

      const register = (patternPath: NodePath): void => {
        patternPath.traverse({
          Identifier(identifierPath) {
            if (!identifierPath.isBindingIdentifier()) return;
            const binding = identifierPath.scope.getBinding(identifierPath.node.name);
            if (!binding) return;
            let path = identifierPath.node.name;
            const parent = identifierPath.parentPath;
            if (parent.isObjectProperty() && parent.parentPath.isObjectPattern()) {
              const key = parent.node.key;
              if (t.isIdentifier(key)) path = key.name;
              if (t.isStringLiteral(key)) path = key.value;
            }
            state.causeScope.props.set(binding.identifier, { componentName, path });
          },
        });
      };

      const parameterPaths = functionPath.get("params");
      const firstParameterPath = parameterPaths[0];
      if (!firstParameterPath) return;
      if (firstParameterPath.isIdentifier()) {
        const binding = firstParameterPath.scope.getBinding(firstParameterPath.node.name);
        if (binding) state.causeScope.props.set(binding.identifier, { componentName, path: "" });
      } else {
        register(firstParameterPath);
      }
    },
  });
}

function storageCallMetadata(
  path: NodePath<t.VariableDeclarator>,
): StorageBindingMetadata | null {
  const init = path.node.init;
  if (!t.isCallExpression(init) || !t.isMemberExpression(init.callee) || init.callee.computed) return null;
  if (!t.isIdentifier(init.callee.property, { name: "getItem" })) return null;
  const key = init.arguments[0];
  if (!t.isStringLiteral(key)) return null;

  const object = init.callee.object;
  if (t.isIdentifier(object) && (object.name === "localStorage" || object.name === "sessionStorage")) {
    if (path.scope.getBinding(object.name)) return null;
    return { storage: object.name, key: key.value };
  }
  if (
    t.isMemberExpression(object)
    && !object.computed
    && t.isIdentifier(object.object)
    && (object.object.name === "window" || object.object.name === "globalThis")
    && t.isIdentifier(object.property)
    && (object.property.name === "localStorage" || object.property.name === "sessionStorage")
  ) {
    if (path.scope.getBinding(object.object.name)) return null;
    return { storage: object.property.name, key: key.value };
  }
  return null;
}

function collectStorageBindings(programPath: NodePath<t.Program>, state: CauseScopePluginState): void {
  programPath.traverse({
    VariableDeclarator(declaratorPath) {
      if (!t.isIdentifier(declaratorPath.node.id)) return;
      const metadata = storageCallMetadata(declaratorPath);
      if (!metadata) return;
      const binding = declaratorPath.scope.getBinding(declaratorPath.node.id.name);
      if (!binding?.constant) return;
      state.causeScope.storage.set(binding.identifier, metadata);
    },
  });
}

function isDerivedConditionExpression(node: t.Expression): boolean {
  return (t.isUnaryExpression(node) && node.operator === "!")
    || t.isLogicalExpression(node)
    || t.isBinaryExpression(node)
    || t.isConditionalExpression(node);
}

function visitReferencedIdentifiers(
  path: NodePath<t.Expression>,
  visit: (identifierPath: NodePath<t.Identifier>) => void,
): void {
  if (path.isFunctionExpression() || path.isArrowFunctionExpression()) return;
  if (path.isIdentifier() && path.isReferencedIdentifier()) visit(path);
  path.traverse({
    Function(functionPath) {
      functionPath.skip();
    },
    ReferencedIdentifier(identifierPath) {
      if (identifierPath.isIdentifier()) visit(identifierPath);
    },
  });
}

function buildDerivedCondition(
  metadata: DerivedBindingMetadata,
  state: CauseScopePluginState,
): t.ObjectExpression {
  if (metadata.condition) return metadata.condition;
  const dependencies = new Map<string, DerivedConditionReference>();
  visitReferencedIdentifiers(metadata.initPath, (identifierPath) => {
    const binding = identifierPath.scope.getBinding(identifierPath.node.name);
    const dependency = binding ? state.causeScope.derived.get(binding.identifier) : undefined;
    if (!dependency?.used || dependency === metadata) return;
    // Expand one dependency level only. This preserves a useful drill-down
    // without turning a derived-value DAG into an exponentially duplicated
    // condition tree at every JSX use site.
    dependencies.set(identifierPath.node.name, {
      id: dependency.inputNamespace,
      condition: conditionDefinitionObject(
        dependency.initPath.node,
        `${dependency.source.file}:${dependency.source.line}:${dependency.source.column}`,
        new Map(),
        dependency.inputNamespace,
      ),
    });
  });
  metadata.condition = conditionDefinitionObject(
    metadata.initPath.node,
    `${metadata.source.file}:${metadata.source.line}:${metadata.source.column}`,
    dependencies,
    metadata.inputNamespace,
  );
  return metadata.condition;
}

function isInstrumentedJsxExpressionContainer(path: NodePath<t.JSXExpressionContainer>): boolean {
  const parent = path.parentPath;
  if (parent.isJSXAttribute()) {
    const opening = parent.parentPath;
    return opening.isJSXOpeningElement() && isNativeElement(opening);
  }
  if (parent.isJSXElement()) return isNativeElement(parent.get("openingElement"));
  return false;
}

function collectDerivedBindings(programPath: NodePath<t.Program>, state: CauseScopePluginState): void {
  programPath.traverse({
    VariableDeclarator(declaratorPath) {
      if (!t.isIdentifier(declaratorPath.node.id)) return;
      if (!declaratorPath.parentPath.isVariableDeclaration({ kind: "const" })) return;
      const initPath = declaratorPath.get("init");
      if (!initPath.isExpression() || !isDerivedConditionExpression(initPath.node)) return;
      // Await and yield must remain in their original async/generator context;
      // moving either into the synchronous trace callback produces invalid JS.
      if (requiresOriginalFunctionContext(initPath)) return;
      const binding = declaratorPath.scope.getBinding(declaratorPath.node.id.name);
      if (!binding?.constant) return;
      const source = getSource(initPath, state);
      state.causeScope.derived.set(binding.identifier, {
        bindingIdentifier: binding.identifier,
        initPath,
        source,
        inputNamespace: stableId(
          "cs_derived",
          `${source.file}:${source.line}:${source.column}:${binding.identifier.name}`,
        ),
        used: false,
      });
    },
  });

  const markUsed = (metadata: DerivedBindingMetadata): void => {
    if (metadata.used) return;
    metadata.used = true;
    visitReferencedIdentifiers(metadata.initPath, (identifierPath) => {
      const binding = identifierPath.scope.getBinding(identifierPath.node.name);
      const dependency = binding ? state.causeScope.derived.get(binding.identifier) : undefined;
      if (dependency) markUsed(dependency);
    });
  };

  programPath.traverse({
    JSXExpressionContainer(containerPath) {
      // Component props are traced as prop passes, not host expressions. Do
      // not pay for a derivation whose evidence cannot cross that boundary.
      if (!isInstrumentedJsxExpressionContainer(containerPath)) return;
      const expressionPath = containerPath.get("expression");
      if (!expressionPath.isExpression()) return;
      visitReferencedIdentifiers(expressionPath, (identifierPath) => {
        const binding = identifierPath.scope.getBinding(identifierPath.node.name);
        const metadata = binding ? state.causeScope.derived.get(binding.identifier) : undefined;
        if (metadata) markUsed(metadata);
      });
    },
  });

  for (const metadata of state.causeScope.derived.values()) {
    if (!metadata.used) continue;
    metadata.traceIdentifier = metadata.initPath.scope.generateUidIdentifier(`${metadata.bindingIdentifier.name}Derivation`);
    buildDerivedCondition(metadata, state);
  }
}

function joinAccessPath(base: string, segment: string): string {
  if (!base) return segment;
  return segment.startsWith("[") ? `${base}${segment}` : `${base}.${segment}`;
}

function propertyKeySegment(key: t.Node, computed: boolean): string | null {
  if (!computed && t.isIdentifier(key)) return key.name;
  if (t.isStringLiteral(key)) return computed ? `[${JSON.stringify(key.value)}]` : key.value;
  if (computed && t.isNumericLiteral(key)) return `[${String(key.value)}]`;
  return null;
}

/**
 * Resolves the root binding and access path an initializer reads from, folding
 * an already-recorded alias into the result so chains such as
 * `const { data } = response; const { order } = data;` still resolve back to
 * `response`. Returns null when the initializer is not a statically known read.
 */
function aliasSource(
  init: t.Expression,
  scope: NodePath["scope"],
  state: CauseScopePluginState,
): LocalAliasMetadata | null {
  let rootNode: t.Identifier;
  let path: string;

  if (t.isIdentifier(init)) {
    rootNode = init;
    path = "";
  } else if (t.isMemberExpression(init) || t.isOptionalMemberExpression(init)) {
    const member = staticMemberInfo(init);
    if (!member) return null;
    rootNode = member.root;
    path = member.accessPath;
  } else {
    return null;
  }

  const binding = scope.getBinding(rootNode.name);
  // A reassignable root would be re-read at capture time, so the recorded path
  // could describe a different object than the one the alias was taken from.
  if (!binding || !binding.constant) return null;

  const existing = state.causeScope.aliases.get(binding.identifier);
  if (existing) {
    return {
      root: existing.root,
      rootName: existing.rootName,
      accessPath: path ? joinAccessPath(existing.accessPath, path) : existing.accessPath,
    };
  }
  return { root: binding.identifier, rootName: rootNode.name, accessPath: path };
}

function recordAliasPattern(
  patternPath: NodePath,
  source: LocalAliasMetadata,
  state: CauseScopePluginState,
): void {
  if (patternPath.isIdentifier()) {
    const binding = patternPath.scope.getBinding(patternPath.node.name);
    if (!binding || !binding.constant) return;
    state.causeScope.aliases.set(binding.identifier, source);
    return;
  }

  if (patternPath.isObjectPattern()) {
    for (const property of patternPath.get("properties")) {
      if (!property.isObjectProperty()) continue;
      const segment = propertyKeySegment(property.node.key, property.node.computed);
      if (segment === null) continue;
      recordAliasPattern(property.get("value") as NodePath, {
        ...source,
        accessPath: joinAccessPath(source.accessPath, segment),
      }, state);
    }
    return;
  }

  if (patternPath.isArrayPattern()) {
    patternPath.get("elements").forEach((element, index) => {
      if (!element || element.node === null) return;
      recordAliasPattern(element as NodePath, {
        ...source,
        accessPath: joinAccessPath(source.accessPath, `[${index}]`),
      }, state);
    });
    return;
  }

  // Defaults (`const { status = "pending" } = order`) keep the same path: the
  // fallback only applies when the read is undefined, and the runtime resolves
  // origins from the value that was actually produced.
  if (patternPath.isAssignmentPattern()) {
    recordAliasPattern(patternPath.get("left") as NodePath, source, state);
  }
}

/**
 * Records local bindings that alias a fixed path into another object, so a
 * destructured primitive keeps the provenance a direct member read would have
 * had. Without this, `const { status } = order` erases the link back to the
 * response that produced `order`, because primitives carry no identity.
 */
function collectAliasBindings(programPath: NodePath<t.Program>, state: CauseScopePluginState): void {
  programPath.traverse({
    VariableDeclarator(declaratorPath) {
      const init = declaratorPath.node.init;
      if (!init) return;
      const source = aliasSource(init, declaratorPath.scope, state);
      if (!source) return;
      recordAliasPattern(declaratorPath.get("id") as NodePath, source, state);
    },
  });
}

function derivedConditionsForExpression(
  path: NodePath<t.Expression>,
  state: CauseScopePluginState,
): Map<string, DerivedConditionReference> {
  const conditions = new Map<string, DerivedConditionReference>();
  visitReferencedIdentifiers(path, (identifierPath) => {
    const binding = identifierPath.scope.getBinding(identifierPath.node.name);
    const metadata = binding ? state.causeScope.derived.get(binding.identifier) : undefined;
    if (metadata?.used && metadata.condition) {
      conditions.set(identifierPath.node.name, {
        id: metadata.inputNamespace,
        condition: metadata.condition,
      });
    }
  });
  return conditions;
}

function hasAttribute(node: t.JSXOpeningElement, name: string): boolean {
  return node.attributes.some(
    (attribute) => t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name }),
  );
}

function stringAttribute(name: string, value: string): t.JSXAttribute {
  return t.jsxAttribute(t.jsxIdentifier(name), t.stringLiteral(value));
}

function expressionStringAttribute(name: string, value: string): t.JSXAttribute {
  return t.jsxAttribute(
    t.jsxIdentifier(name),
    t.jsxExpressionContainer(t.stringLiteral(value)),
  );
}

function sourceObject(source: { file: string; line: number; column: number }): t.ObjectExpression {
  return t.objectExpression([
    t.objectProperty(t.identifier("file"), t.stringLiteral(source.file)),
    t.objectProperty(t.identifier("line"), t.numericLiteral(source.line)),
    t.objectProperty(t.identifier("column"), t.numericLiteral(source.column)),
  ]);
}

function sourceSnippet(node: t.JSXElement): string {
  const fullSnippet = generate(node).code.trim();
  const hasNestedMarkup = node.children.some((child) => t.isJSXElement(child) || t.isJSXFragment(child));
  if (!hasNestedMarkup && fullSnippet.length <= 320) return fullSnippet;

  const opening = generate(node.openingElement).code.trim();
  if (node.openingElement.selfClosing || !node.closingElement) return opening;
  const closing = generate(node.closingElement).code.trim();
  return `${opening}\n  …\n${closing}`;
}

const NON_VALUE_IDENTIFIERS = new Set(["undefined", "NaN", "Infinity"]);

function isAssignmentTargetIdentifier(path: NodePath<t.Identifier>): boolean {
  let current: NodePath = path;

  while (current.parentPath) {
    const parent = current.parentPath;

    if (parent.isUpdateExpression() && parent.node.argument === current.node) return true;
    if (parent.isAssignmentExpression() && parent.node.left === current.node) return true;
    if (
      (parent.isForOfStatement() || parent.isForInStatement()) &&
      parent.node.left === current.node
    ) return true;

    if (parent.isAssignmentPattern() && parent.node.left === current.node) {
      current = parent;
      continue;
    }
    if (parent.isRestElement() && parent.node.argument === current.node) {
      current = parent;
      continue;
    }
    if (parent.isArrayPattern()) {
      current = parent;
      continue;
    }
    if (
      parent.isObjectProperty() &&
      parent.parentPath.isObjectPattern() &&
      parent.node.value === current.node
    ) {
      current = parent;
      continue;
    }
    if (parent.isObjectPattern()) {
      current = parent;
      continue;
    }
    if (
      (parent.isTSAsExpression() ||
        parent.isTSTypeAssertion() ||
        parent.isTSNonNullExpression() ||
        parent.isTSSatisfiesExpression()) &&
      parent.node.expression === current.node
    ) {
      current = parent;
      continue;
    }

    return false;
  }

  return false;
}

function shouldCaptureIdentifier(path: NodePath<t.Identifier>): boolean {
  if (NON_VALUE_IDENTIFIERS.has(path.node.name) || !path.isReferencedIdentifier()) return false;
  if (isAssignmentTargetIdentifier(path)) return false;
  const parent = path.parentPath;
  if (
    (parent.isCallExpression() || parent.isOptionalCallExpression()) &&
    parent.node.callee === path.node
  ) return false;
  if (parent.isUnaryExpression({ operator: "typeof" }) && parent.node.argument === path.node) return false;
  return true;
}

function propOriginObject(metadata: PropBindingMetadata): t.ObjectExpression {
  const originId = stableId("cs_origin_prop", `${metadata.componentName}:${metadata.path}`);
  return t.objectExpression([
    t.objectProperty(t.identifier("id"), t.stringLiteral(originId)),
    t.objectProperty(t.identifier("kind"), t.stringLiteral("prop")),
    t.objectProperty(t.identifier("confidence"), t.stringLiteral("confirmed")),
    t.objectProperty(t.identifier("label"), t.stringLiteral(`${metadata.componentName}.props`)),
    ...(metadata.path ? [t.objectProperty(t.identifier("path"), t.stringLiteral(metadata.path))] : []),
  ]);
}

function storageOriginObject(metadata: StorageBindingMetadata): t.ObjectExpression {
  return t.objectExpression([
    t.objectProperty(
      t.identifier("id"),
      t.stringLiteral(stableId("cs_origin_storage", `${metadata.storage}:${metadata.key}`)),
    ),
    t.objectProperty(t.identifier("kind"), t.stringLiteral("storage")),
    t.objectProperty(t.identifier("confidence"), t.stringLiteral("confirmed")),
    t.objectProperty(t.identifier("label"), t.stringLiteral(metadata.storage)),
    t.objectProperty(t.identifier("path"), t.stringLiteral(metadata.key)),
  ]);
}

function originHintObject(input: {
  prop?: PropBindingMetadata;
  storage?: StorageBindingMetadata;
  derived?: t.Identifier;
  originValue?: t.Expression;
  accessPath?: string | t.Expression;
}): t.ObjectExpression {
  const properties: t.ObjectProperty[] = [];
  if (input.prop) properties.push(t.objectProperty(t.identifier("origin"), propOriginObject(input.prop)));
  if (input.storage) properties.push(t.objectProperty(t.identifier("origin"), storageOriginObject(input.storage)));
  if (input.derived) properties.push(t.objectProperty(t.identifier("derived"), t.cloneNode(input.derived)));
  if (input.originValue) properties.push(t.objectProperty(t.identifier("originValue"), input.originValue));
  if (input.accessPath) {
    properties.push(t.objectProperty(
      t.identifier("accessPath"),
      typeof input.accessPath === "string" ? t.stringLiteral(input.accessPath) : input.accessPath,
    ));
  }
  return t.objectExpression(properties);
}

/**
 * Builds the runtime path segment for a computed key whose value is only known
 * at render time, matching the grammar `parseAccessPath` accepts: `[0]` for a
 * number and `["key"]` for anything else, escaped the way the parser un-escapes
 * it with `JSON.parse`.
 */
function dynamicSegmentExpression(key: t.Identifier): t.Expression {
  const concat = (left: t.Expression, right: t.Expression): t.BinaryExpression =>
    t.binaryExpression("+", left, right);
  return t.conditionalExpression(
    t.binaryExpression("===", t.unaryExpression("typeof", t.cloneNode(key)), t.stringLiteral("number")),
    concat(concat(t.stringLiteral("["), t.cloneNode(key)), t.stringLiteral("]")),
    concat(
      concat(
        t.stringLiteral("["),
        t.callExpression(
          t.memberExpression(t.identifier("JSON"), t.identifier("stringify")),
          [t.callExpression(t.identifier("String"), [t.cloneNode(key)])],
        ),
      ),
      t.stringLiteral("]"),
    ),
  );
}

type ChainSegment =
  | { kind: "static"; text: string }
  | { kind: "dynamic"; key: t.Expression };

/**
 * Like `staticMemberInfo`, but keeps computed keys whose value is only known at
 * render time instead of abandoning the chain. `row[columnId]` and
 * `items[index].name` are ordinary table and list code; giving up on them
 * dropped the whole access path, which left a primitive read with no provenance
 * at all.
 */
function memberChainInfo(
  node: t.MemberExpression | t.OptionalMemberExpression,
): { root: t.Identifier; segments: ChainSegment[] } | null {
  const segments: ChainSegment[] = [];
  let current: t.Expression | t.Super = node;
  while (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
    if (current.computed) {
      if (t.isStringLiteral(current.property)) {
        segments.unshift({ kind: "static", text: `[${JSON.stringify(current.property.value)}]` });
      } else if (t.isNumericLiteral(current.property)) {
        segments.unshift({ kind: "static", text: `[${String(current.property.value)}]` });
      } else if (t.isExpression(current.property)) {
        segments.unshift({ kind: "dynamic", key: current.property });
      } else {
        return null;
      }
    } else if (t.isIdentifier(current.property)) {
      segments.unshift({ kind: "static", text: current.property.name });
    } else {
      return null;
    }
    current = current.object;
  }
  if (!t.isIdentifier(current)) return null;
  return { root: current, segments };
}

function staticMemberInfo(
  node: t.MemberExpression | t.OptionalMemberExpression,
): { root: t.Identifier; accessPath: string } | null {
  const segments: string[] = [];
  let current: t.Expression | t.Super = node;
  while (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
    if (current.computed) {
      if (t.isStringLiteral(current.property)) segments.unshift(`[${JSON.stringify(current.property.value)}]`);
      else if (t.isNumericLiteral(current.property)) segments.unshift(`[${String(current.property.value)}]`);
      else return null;
    } else if (t.isIdentifier(current.property)) {
      segments.unshift(current.property.name);
    } else {
      return null;
    }
    current = current.object;
  }
  if (!t.isIdentifier(current)) return null;
  return {
    root: current,
    accessPath: segments.map((segment, index) => segment.startsWith("[") || index === 0 ? segment : `.${segment}`).join(""),
  };
}

function isMemberWriteTarget(path: NodePath<t.MemberExpression | t.OptionalMemberExpression>): boolean {
  const parent = path.parentPath;
  return (parent.isAssignmentExpression() && parent.node.left === path.node)
    || (parent.isUpdateExpression() && parent.node.argument === path.node)
    || ((parent.isForInStatement() || parent.isForOfStatement()) && parent.node.left === path.node)
    || (parent.isUnaryExpression({ operator: "delete" }) && parent.node.argument === path.node);
}

function memberWithRoot(
  node: t.MemberExpression | t.OptionalMemberExpression,
  replacement: t.Identifier,
): t.MemberExpression | t.OptionalMemberExpression {
  const cloned = t.cloneNode(node, true);
  let current: t.MemberExpression | t.OptionalMemberExpression = cloned;
  while (t.isMemberExpression(current.object) || t.isOptionalMemberExpression(current.object)) {
    current = current.object;
  }
  current.object = t.cloneNode(replacement);
  return cloned;
}

/**
 * Rewrites a member chain so the root and every dynamic key read from the
 * hoisted parameters instead of the original expressions. Both the value and
 * its access path then come from one evaluation, so a key with side effects or
 * an unstable result cannot disagree between them.
 */
function memberWithRootAndKeys(
  node: t.MemberExpression | t.OptionalMemberExpression,
  replacement: t.Identifier,
  keys: Map<number, t.Identifier>,
): t.MemberExpression | t.OptionalMemberExpression {
  const cloned = t.cloneNode(node, true);
  const chain: Array<t.MemberExpression | t.OptionalMemberExpression> = [];
  let current: t.Node = cloned;
  while (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
    chain.push(current);
    current = current.object;
  }
  // Walked outermost-first; segment indexes count from the root inward.
  chain.reverse();
  chain.forEach((memberNode, index) => {
    const key = keys.get(index);
    if (key) memberNode.property = t.cloneNode(key);
  });
  const innermost = chain[0];
  if (innermost) innermost.object = t.cloneNode(replacement);
  return cloned;
}

/**
 * Folds chain segments into the access path the runtime parses, emitting a
 * plain string when every key is known at build time and a concatenation only
 * when a dynamic key forces it.
 */
function accessPathFromSegments(
  segments: ChainSegment[],
  keys: Map<number, t.Identifier>,
): string | t.Expression {
  const parts: t.Expression[] = [];
  let literal = "";
  segments.forEach((segment, index) => {
    if (segment.kind === "static") {
      literal += segment.text.startsWith("[") || index === 0 ? segment.text : `.${segment.text}`;
      return;
    }
    if (literal) {
      parts.push(t.stringLiteral(literal));
      literal = "";
    }
    const key = keys.get(index);
    if (key) parts.push(dynamicSegmentExpression(key));
  });
  if (literal) parts.push(t.stringLiteral(literal));
  if (parts.length === 0) return "";
  if (parts.length === 1 && t.isStringLiteral(parts[0])) return parts[0].value;
  return parts.reduce((left, right) => t.binaryExpression("+", left, right));
}

function captureInputName(displayName: string, inputNamespace?: string, node?: t.Node): string {
  if (!inputNamespace) return displayName;
  const occurrence = node?.start ?? `${node?.loc?.start.line ?? 0}-${node?.loc?.start.column ?? 0}`;
  return `${inputNamespace}:${occurrence}:${displayName}`;
}

function wrapCapturedMember(
  path: NodePath<t.MemberExpression | t.OptionalMemberExpression>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
  inputNamespace?: string,
): boolean {
  if (isMemberWriteTarget(path)) return false;
  const parent = path.parentPath;
  if ((parent.isCallExpression() || parent.isOptionalCallExpression()) && parent.node.callee === path.node) return false;
  if (parent.isTaggedTemplateExpression() && parent.node.tag === path.node) return false;
  const chain = memberChainInfo(path.node);
  if (!chain) return false;
  const binding = path.scope.getBinding(chain.root.name);
  const stateMetadata = binding ? state.causeScope.states.get(binding.identifier) : undefined;
  const propMetadata = binding ? state.causeScope.props.get(binding.identifier) : undefined;
  const storageMetadata = binding ? state.causeScope.storage.get(binding.identifier) : undefined;
  const original = t.cloneNode(path.node, true);
  const displayName = generate(original).code;
  const originIdentifier = path.scope.generateUidIdentifier(`${chain.root.name}Origin`);

  // Each dynamic key becomes a parameter so it is evaluated exactly once, in
  // the same inner-to-outer order the original expression used.
  const keyIdentifiers = new Map<number, t.Identifier>();
  const keyArguments: t.Expression[] = [];
  chain.segments.forEach((segment, index) => {
    if (segment.kind !== "dynamic") return;
    const identifier = path.scope.generateUidIdentifier("causeScopeKey");
    keyIdentifiers.set(index, identifier);
    keyArguments.push(t.cloneNode(segment.key, true));
  });

  const evaluatedMember = keyIdentifiers.size === 0
    ? memberWithRoot(original, originIdentifier)
    : memberWithRootAndKeys(original, originIdentifier, keyIdentifiers);
  const captureArguments: t.Expression[] = [
    t.stringLiteral(captureInputName(displayName, inputNamespace, path.node)),
    evaluatedMember,
    stateMetadata ? t.stringLiteral(stateMetadata.stateId) : t.identifier("undefined"),
    originHintObject({
      ...(propMetadata ? { prop: propMetadata } : {}),
      ...(storageMetadata ? { storage: storageMetadata } : {}),
      originValue: t.cloneNode(originIdentifier),
      accessPath: accessPathFromSegments(chain.segments, keyIdentifiers),
    }),
    ...(inputNamespace ? [t.stringLiteral(displayName)] : []),
  ];
  path.replaceWith(t.callExpression(
    t.arrowFunctionExpression(
      [t.cloneNode(originIdentifier), ...[...keyIdentifiers.values()].map((identifier) => t.cloneNode(identifier))],
      t.callExpression(t.cloneNode(captureIdentifier), captureArguments),
    ),
    [t.cloneNode(chain.root), ...keyArguments],
  ));
  path.skip();
  return true;
}

function wrapCapturedCall(
  path: NodePath<t.CallExpression | t.OptionalCallExpression>,
  captureIdentifier: t.Identifier,
  expressionName: string,
  inputNamespace?: string,
): void {
  const original = t.cloneNode(path.node, true);
  const captureArguments: t.Expression[] = [
    t.stringLiteral(captureInputName(expressionName, inputNamespace, path.node)),
    original,
  ];
  if (inputNamespace) {
    captureArguments.push(t.identifier("undefined"), t.identifier("undefined"), t.stringLiteral(expressionName));
  }
  path.replaceWith(t.callExpression(t.cloneNode(captureIdentifier), captureArguments));
  path.skip();
}

function instrumentCallArguments(
  path: NodePath<t.CallExpression | t.OptionalCallExpression>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
  inputNamespace?: string,
): void {
  for (const argumentPath of path.get("arguments")) {
    if (argumentPath.isSpreadElement()) {
      const spreadArgument = argumentPath.get("argument");
      if (spreadArgument.isExpression()) instrumentExpressionInputs(spreadArgument, captureIdentifier, state, inputNamespace);
      continue;
    }
    if (argumentPath.isExpression()) instrumentExpressionInputs(argumentPath, captureIdentifier, state, inputNamespace);
  }
}

/**
 * Returns the alias hint to emit for a captured identifier, or undefined when
 * it cannot be trusted. The root name is re-resolved in the use-site scope: a
 * shadowing declaration between the alias and this read would otherwise make
 * the emitted `originValue` reference a different object entirely.
 */
function aliasHintFor(
  path: NodePath<t.Identifier>,
  binding: { identifier: t.Identifier },
  state: CauseScopePluginState,
): LocalAliasMetadata | undefined {
  const alias = state.causeScope.aliases.get(binding.identifier);
  // An empty path means a plain rename, which carries no provenance the
  // runtime cannot already recover from the value itself.
  if (!alias?.accessPath) return undefined;
  const rootBinding = path.scope.getBinding(alias.rootName);
  if (!rootBinding || rootBinding.identifier !== alias.root) return undefined;
  return alias;
}

function wrapCapturedIdentifier(
  path: NodePath<t.Identifier>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
  inputNamespace?: string,
): void {
  if (!shouldCaptureIdentifier(path)) return;
  const original = t.cloneNode(path.node);
  const captureArguments: t.Expression[] = [
    t.stringLiteral(captureInputName(original.name, inputNamespace, path.node)),
    original,
  ];
  const binding = path.scope.getBinding(original.name);
  const stateMetadata = binding ? state.causeScope.states.get(binding.identifier) : undefined;
  const propMetadata = binding ? state.causeScope.props.get(binding.identifier) : undefined;
  const storageMetadata = binding ? state.causeScope.storage.get(binding.identifier) : undefined;
  const derivedMetadata = binding ? state.causeScope.derived.get(binding.identifier) : undefined;
  const derivedIdentifier = derivedMetadata?.used ? derivedMetadata.traceIdentifier : undefined;
  const aliasMetadata = binding ? aliasHintFor(path, binding, state) : undefined;
  if (stateMetadata || propMetadata || storageMetadata || derivedIdentifier || aliasMetadata || inputNamespace) {
    captureArguments.push(stateMetadata ? t.stringLiteral(stateMetadata.stateId) : t.identifier("undefined"));
  }
  if (propMetadata || storageMetadata || derivedIdentifier || aliasMetadata || inputNamespace) {
    captureArguments.push(
      propMetadata || storageMetadata || derivedIdentifier || aliasMetadata
        ? originHintObject({
          ...(propMetadata ? { prop: propMetadata } : {}),
          ...(storageMetadata ? { storage: storageMetadata } : {}),
          ...(derivedIdentifier ? { derived: derivedIdentifier } : {}),
          ...(aliasMetadata
            ? { originValue: t.identifier(aliasMetadata.rootName), accessPath: aliasMetadata.accessPath }
            : {}),
        })
        : t.identifier("undefined"),
    );
  }
  if (inputNamespace) captureArguments.push(t.stringLiteral(original.name));
  path.replaceWith(t.callExpression(t.cloneNode(captureIdentifier), captureArguments));
  path.skip();
}

function instrumentExpressionInputs(
  expressionPath: NodePath<t.Expression>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
  inputNamespace?: string,
): void {
  if (expressionPath.isIdentifier()) {
    wrapCapturedIdentifier(expressionPath, captureIdentifier, state, inputNamespace);
    return;
  }
  if (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression()) {
    wrapCapturedMember(expressionPath, captureIdentifier, state, inputNamespace);
    return;
  }
  if (expressionPath.isCallExpression() || expressionPath.isOptionalCallExpression()) {
    const expressionName = generate(expressionPath.node).code;
    instrumentCallArguments(expressionPath, captureIdentifier, state, inputNamespace);
    wrapCapturedCall(expressionPath, captureIdentifier, expressionName, inputNamespace);
    return;
  }
  if (expressionPath.isFunctionExpression() || expressionPath.isArrowFunctionExpression()) return;

  const callExpressionNames = new WeakMap<t.Node, string>();
  expressionPath.traverse({
    TSType(typePath) {
      typePath.skip();
    },
    Function(functionPath) {
      functionPath.skip();
    },
    JSXElement(jsxPath) {
      jsxPath.skip();
    },
    JSXFragment(fragmentPath) {
      fragmentPath.skip();
    },
    MemberExpression(memberPath) {
      wrapCapturedMember(memberPath, captureIdentifier, state, inputNamespace);
    },
    OptionalMemberExpression(memberPath) {
      wrapCapturedMember(memberPath, captureIdentifier, state, inputNamespace);
    },
    CallExpression: {
      enter(callPath) {
        callExpressionNames.set(callPath.node, generate(callPath.node).code);
      },
      exit(callPath) {
        wrapCapturedCall(
          callPath,
          captureIdentifier,
          callExpressionNames.get(callPath.node) ?? generate(callPath.node).code,
          inputNamespace,
        );
      },
    },
    OptionalCallExpression: {
      enter(callPath) {
        callExpressionNames.set(callPath.node, generate(callPath.node).code);
      },
      exit(callPath) {
        wrapCapturedCall(
          callPath,
          captureIdentifier,
          callExpressionNames.get(callPath.node) ?? generate(callPath.node).code,
          inputNamespace,
        );
      },
    },
    ReferencedIdentifier(identifierPath) {
      if (!identifierPath.isIdentifier()) return;
      wrapCapturedIdentifier(identifierPath, captureIdentifier, state, inputNamespace);
    },
  });
}

function createRuntimeImport(localIdentifier: t.Identifier): t.ImportDeclaration {
  return t.importDeclaration(
    [t.importSpecifier(t.cloneNode(localIdentifier), t.identifier("__cs"))],
    t.stringLiteral("virtual:causescope-runtime"),
  );
}

function createStateRegistration(
  runtimeIdentifier: t.Identifier,
  metadata: SetterMetadata,
): t.ExpressionStatement {
  return t.expressionStatement(
    t.callExpression(
      t.memberExpression(t.cloneNode(runtimeIdentifier), t.identifier("registerState")),
      [
        t.objectExpression([
          t.objectProperty(t.identifier("stateId"), t.stringLiteral(metadata.stateId)),
          t.objectProperty(t.identifier("stateName"), t.stringLiteral(metadata.stateName)),
          t.objectProperty(t.identifier("componentName"), t.stringLiteral(metadata.componentName)),
          t.objectProperty(t.identifier("source"), sourceObject(metadata.source)),
          t.objectProperty(t.identifier("setter"), t.cloneNode(metadata.setterIdentifier)),
          t.objectProperty(t.identifier("currentValue"), t.cloneNode(metadata.stateIdentifier)),
          t.objectProperty(t.identifier("hookType"), t.stringLiteral(metadata.hookType)),
        ]),
      ],
    ),
  );
}

function requiresOriginalFunctionContext(expressionPath: NodePath<t.Expression>): boolean {
  if (expressionPath.isAwaitExpression() || expressionPath.isYieldExpression()) return true;
  let requiresOriginalContext = false;
  expressionPath.traverse({
    Function(functionPath) {
      functionPath.skip();
    },
    AwaitExpression(awaitPath) {
      requiresOriginalContext = true;
      awaitPath.stop();
    },
    YieldExpression(yieldPath) {
      requiresOriginalContext = true;
      yieldPath.stop();
    },
  });
  return requiresOriginalContext;
}

function conditionType(node: t.Expression): string {
  if (t.isIdentifier(node)) return "identifier";
  if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) return "member";
  if (t.isLiteral(node)) return "literal";
  if (t.isUnaryExpression(node)) return "unary";
  if (t.isLogicalExpression(node)) return "logical";
  if (t.isBinaryExpression(node)) return "binary";
  if (t.isConditionalExpression(node)) return "conditional";
  if (t.isCallExpression(node) || t.isOptionalCallExpression(node)) return "call";
  return "unknown";
}

function literalValueNode(node: t.Expression): t.Expression | null {
  if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)) {
    return t.cloneNode(node);
  }
  if (t.isBigIntLiteral(node)) return t.stringLiteral(`${node.value}n`);
  return null;
}

function conditionDefinitionObject(
  node: t.Expression,
  seed: string,
  derivedConditions: Map<string, DerivedConditionReference> = new Map(),
  inputNamespace?: string,
  expandedDerivations: Set<string> = new Set(),
): t.ObjectExpression {
  const expression = generate(node).code;
  const type = conditionType(node);
  const properties: t.ObjectProperty[] = [
    t.objectProperty(t.identifier("id"), t.stringLiteral(stableId("cs_condition", `${seed}:${expression}`))),
    t.objectProperty(t.identifier("type"), t.stringLiteral(type)),
    t.objectProperty(t.identifier("expression"), t.stringLiteral(expression)),
  ];
  if (t.isUnaryExpression(node) || t.isLogicalExpression(node) || t.isBinaryExpression(node)) {
    properties.push(t.objectProperty(t.identifier("operator"), t.stringLiteral(node.operator)));
  }
  if (t.isIdentifier(node) || t.isMemberExpression(node) || t.isOptionalMemberExpression(node) || t.isCallExpression(node) || t.isOptionalCallExpression(node)) {
    properties.push(t.objectProperty(
      t.identifier("inputName"),
      t.stringLiteral(captureInputName(expression, inputNamespace, node)),
    ));
  }
  const literal = literalValueNode(node);
  if (literal) properties.push(t.objectProperty(t.identifier("literalValue"), literal));

  let children: t.Expression[] = [];
  if (t.isIdentifier(node) && derivedConditions.has(node.name)) {
    const derived = derivedConditions.get(node.name);
    if (derived && !expandedDerivations.has(derived.id)) {
      expandedDerivations.add(derived.id);
      children = [t.cloneNode(derived.condition, true)];
    }
  } else if (t.isUnaryExpression(node) && t.isExpression(node.argument)) {
    children = [conditionDefinitionObject(node.argument, seed, derivedConditions, inputNamespace, expandedDerivations)];
  } else if (t.isLogicalExpression(node) || t.isBinaryExpression(node)) {
    const left = t.isExpression(node.left)
      ? conditionDefinitionObject(node.left, seed, derivedConditions, inputNamespace, expandedDerivations)
      : null;
    const right = t.isExpression(node.right)
      ? conditionDefinitionObject(node.right, seed, derivedConditions, inputNamespace, expandedDerivations)
      : null;
    children = [left, right].filter((child): child is t.ObjectExpression => Boolean(child));
  } else if (t.isConditionalExpression(node)) {
    children = [node.test, node.consequent, node.alternate].map((child) =>
      conditionDefinitionObject(child, seed, derivedConditions, inputNamespace, expandedDerivations),
    );
  }
  if (children.length > 0) properties.push(t.objectProperty(t.identifier("children"), t.arrayExpression(children)));
  return t.objectExpression(properties);
}

function branchLabel(node: t.Expression): string {
  if (t.isJSXElement(node)) return jsxName(node.openingElement.name);
  if (t.isJSXFragment(node)) return "Fragment";
  return generate(node).code;
}

function conditionalRenderMetadata(node: t.Expression): {
  definition: t.ObjectExpression;
  condition: t.Expression;
} | null {
  if (t.isLogicalExpression(node) && node.operator === "&&" && (t.isJSXElement(node.right) || t.isJSXFragment(node.right))) {
    return {
      condition: node.left,
      definition: t.objectExpression([
        t.objectProperty(t.identifier("kind"), t.stringLiteral("logical")),
        t.objectProperty(t.identifier("conditionExpression"), t.stringLiteral(generate(node.left).code)),
        t.objectProperty(t.identifier("renderedBranch"), t.stringLiteral(branchLabel(node.right))),
      ]),
    };
  }
  if (t.isConditionalExpression(node)) {
    return {
      condition: node.test,
      definition: t.objectExpression([
        t.objectProperty(t.identifier("kind"), t.stringLiteral("conditional")),
        t.objectProperty(t.identifier("conditionExpression"), t.stringLiteral(generate(node.test).code)),
        t.objectProperty(t.identifier("renderedBranch"), t.stringLiteral(branchLabel(node.consequent))),
        t.objectProperty(t.identifier("alternateBranch"), t.stringLiteral(branchLabel(node.alternate))),
      ]),
    };
  }
  return null;
}

function supportsConditionTree(node: t.Expression): boolean {
  return t.isIdentifier(node)
    || t.isMemberExpression(node)
    || t.isOptionalMemberExpression(node)
    || t.isLiteral(node)
    || t.isUnaryExpression(node)
    || t.isLogicalExpression(node)
    || t.isBinaryExpression(node)
    || t.isConditionalExpression(node)
    || t.isCallExpression(node)
    || t.isOptionalCallExpression(node);
}

function exactDecisionLabel(expression: t.Expression, expressionCode: string): string | undefined {
  if (
    t.isIdentifier(expression) ||
    t.isMemberExpression(expression) ||
    t.isOptionalMemberExpression(expression) ||
    (t.isUnaryExpression(expression) && expression.operator === "!")
  ) return expressionCode;
  return undefined;
}

function instrumentJsxExpression(
  expressionPath: NodePath<t.Expression>,
  state: CauseScopePluginState,
  input: {
    kind: "attribute" | "children" | "spread";
    nodeId: string;
    property: string;
    instanceBinding?: "host-prop";
  },
): void {
  const runtimeIdentifier = state.causeScope.runtimeIdentifier;
  if (!runtimeIdentifier) return;

  const source = getSource(expressionPath, state);
  const originalExpression = t.cloneNode(expressionPath.node, true);
  const expressionCode = generate(originalExpression).code;
  const expressionId = stableId(
    "cs_expr",
    `${source.file}:${source.line}:${source.column}:${input.kind}:${input.property}:${expressionCode}`,
  );
  const metadataProperties: t.ObjectProperty[] = [
    t.objectProperty(t.identifier("id"), t.stringLiteral(expressionId)),
    t.objectProperty(t.identifier("nodeId"), t.stringLiteral(input.nodeId)),
    t.objectProperty(t.identifier("kind"), t.stringLiteral(input.kind)),
    t.objectProperty(t.identifier("property"), t.stringLiteral(input.property)),
    t.objectProperty(t.identifier("expression"), t.stringLiteral(expressionCode)),
    t.objectProperty(t.identifier("source"), sourceObject(source)),
    t.objectProperty(t.identifier("componentName"), t.stringLiteral(getComponentName(expressionPath))),
  ];
  const renderMetadata = conditionalRenderMetadata(originalExpression);
  const conditionExpression = renderMetadata?.condition ?? originalExpression;
  if (supportsConditionTree(conditionExpression)) {
    const derivedConditions = derivedConditionsForExpression(expressionPath, state);
    metadataProperties.push(t.objectProperty(
      t.identifier("condition"),
      conditionDefinitionObject(conditionExpression, `${source.file}:${source.line}:${source.column}`, derivedConditions),
    ));
  }
  if (renderMetadata) {
    metadataProperties.push(t.objectProperty(t.identifier("conditionalRender"), renderMetadata.definition));
  }
  const decisionLabel = exactDecisionLabel(originalExpression, expressionCode);
  if (decisionLabel) {
    metadataProperties.push(t.objectProperty(t.identifier("decisionLabel"), t.stringLiteral(decisionLabel)));
  }
  if (input.instanceBinding) {
    metadataProperties.push(t.objectProperty(t.identifier("instanceBinding"), t.stringLiteral(input.instanceBinding)));
  }
  const metadata = t.objectExpression(metadataProperties);

  if (requiresOriginalFunctionContext(expressionPath)) {
    expressionPath.replaceWith(t.callExpression(
      t.memberExpression(t.cloneNode(runtimeIdentifier), t.identifier("traceValue")),
      [
        t.objectExpression([
          t.objectProperty(t.identifier("metadata"), metadata),
          t.objectProperty(t.identifier("value"), originalExpression),
        ]),
      ],
    ));
    state.causeScope.needsRuntime = true;
    return;
  }

  const captureIdentifier = expressionPath.scope.generateUidIdentifier("causeScopeCapture");
  instrumentExpressionInputs(expressionPath, captureIdentifier, state);
  const instrumentedExpression = t.cloneNode(expressionPath.node, true);

  expressionPath.replaceWith(t.callExpression(
    t.memberExpression(t.cloneNode(runtimeIdentifier), t.identifier("traceExpression")),
    [
      t.objectExpression([
        t.objectProperty(
          t.identifier("metadata"),
          metadata,
        ),
        t.objectProperty(
          t.identifier("evaluate"),
          t.arrowFunctionExpression([captureIdentifier], instrumentedExpression),
        ),
      ]),
    ],
  ));
  state.causeScope.needsRuntime = true;
}

function collectStateSetters(
  programPath: NodePath<t.Program>,
  state: CauseScopePluginState,
): void {
  const hookBindings = new Map<t.Identifier, "state" | "reducer">();
  const reactNamespaceBindings = new Set<t.Identifier>();

  programPath.traverse({
    ImportDeclaration(importPath) {
      if (importPath.node.source.value !== "react") return;
      for (const specifier of importPath.node.specifiers) {
        if (t.isImportNamespaceSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
          const namespaceBinding = importPath.scope.getBinding(specifier.local.name);
          if (namespaceBinding) reactNamespaceBindings.add(namespaceBinding.identifier);
          continue;
        }
        if (!t.isImportSpecifier(specifier) || !t.isIdentifier(specifier.imported)) continue;
        const hookType = specifier.imported.name === "useState"
          ? "state"
          : specifier.imported.name === "useReducer" ? "reducer" : null;
        if (!hookType) continue;
        const binding = importPath.scope.getBinding(specifier.local.name);
        if (binding) hookBindings.set(binding.identifier, hookType);
      }
    },
  });

  programPath.traverse({
    VariableDeclarator(declaratorPath) {
      if (!t.isArrayPattern(declaratorPath.node.id) || !t.isCallExpression(declaratorPath.node.init)) return;
      const callee = declaratorPath.node.init.callee;
      let hookType: "state" | "reducer" | undefined;
      if (t.isIdentifier(callee)) {
        const hookBinding = declaratorPath.scope.getBinding(callee.name);
        hookType = hookBinding ? hookBindings.get(hookBinding.identifier) : undefined;
      } else if (
        t.isMemberExpression(callee)
        && !callee.computed
        && t.isIdentifier(callee.object)
        && t.isIdentifier(callee.property)
      ) {
        const namespaceBinding = declaratorPath.scope.getBinding(callee.object.name);
        if (namespaceBinding && reactNamespaceBindings.has(namespaceBinding.identifier)) {
          hookType = callee.property.name === "useState"
            ? "state"
            : callee.property.name === "useReducer" ? "reducer" : undefined;
        }
      }
      if (!hookType) return;

      const stateIdentifier = declaratorPath.node.id.elements[0];
      const setterIdentifier = declaratorPath.node.id.elements[1];
      if (!t.isIdentifier(stateIdentifier) || !t.isIdentifier(setterIdentifier)) return;
      const setterBinding = declaratorPath.scope.getBinding(setterIdentifier.name);
      const stateBinding = declaratorPath.scope.getBinding(stateIdentifier.name);
      if (!setterBinding || !stateBinding) return;

      const source = getSource(declaratorPath, state);
      const stateId = stableId(
        "cs_state",
        `${source.file}:${source.line}:${source.column}:${stateIdentifier.name}`,
      );
      const metadata: SetterMetadata = {
        bindingIdentifier: setterBinding.identifier,
        stateBindingIdentifier: stateBinding.identifier,
        setterIdentifier,
        stateIdentifier,
        stateId,
        stateName: stateIdentifier.name,
        componentName: getComponentName(declaratorPath),
        source,
        hookType,
      };
      state.causeScope.setters.set(setterBinding.identifier, metadata);
      state.causeScope.states.set(stateBinding.identifier, metadata);
      const declaration = declaratorPath.parentPath;
      if (declaration.isVariableDeclaration()) {
        const registrations = state.causeScope.registrations.get(declaration.node) ?? [];
        registrations.push(metadata);
        state.causeScope.registrations.set(declaration.node, registrations);
      }
    },
  });
}

function tracePropCall(
  runtimeIdentifier: t.Identifier,
  input: {
    componentName: string;
    parentComponentName: string;
    property: string;
    expression: string;
    source: { file: string; line: number; column: number };
    value: t.Expression;
  },
): t.CallExpression {
  const id = stableId(
    "cs_prop",
    `${input.source.file}:${input.source.line}:${input.source.column}:${input.componentName}:${input.property}`,
  );
  return t.callExpression(
    t.memberExpression(t.cloneNode(runtimeIdentifier), t.identifier("traceProp")),
    [
      t.objectExpression([
        t.objectProperty(t.identifier("metadata"), t.objectExpression([
          t.objectProperty(t.identifier("id"), t.stringLiteral(id)),
          t.objectProperty(t.identifier("componentName"), t.stringLiteral(input.componentName)),
          t.objectProperty(t.identifier("parentComponentName"), t.stringLiteral(input.parentComponentName)),
          t.objectProperty(t.identifier("property"), t.stringLiteral(input.property)),
          t.objectProperty(t.identifier("expression"), t.stringLiteral(input.expression)),
          t.objectProperty(t.identifier("source"), sourceObject(input.source)),
        ])),
        t.objectProperty(t.identifier("value"), input.value),
      ]),
    ],
  );
}

function instrumentComponentProps(path: NodePath<t.JSXOpeningElement>, state: CauseScopePluginState): void {
  const runtimeIdentifier = state.causeScope.runtimeIdentifier;
  if (!runtimeIdentifier) return;
  const componentName = jsxName(path.node.name);
  if (componentName === "Fragment" || componentName.endsWith(".Fragment")) return;
  const parentComponentName = getComponentName(path);

  for (const attributePath of path.get("attributes")) {
    if (attributePath.isJSXSpreadAttribute()) {
      const argumentPath = attributePath.get("argument");
      if (!argumentPath.isExpression()) continue;
      const original = t.cloneNode(argumentPath.node, true);
      argumentPath.replaceWith(tracePropCall(runtimeIdentifier, {
        componentName,
        parentComponentName,
        property: "...spread",
        expression: `...${generate(original).code}`,
        source: getSource(attributePath, state),
        value: original,
      }));
      state.causeScope.needsRuntime = true;
      continue;
    }
    if (!attributePath.isJSXAttribute() || !t.isJSXIdentifier(attributePath.node.name)) continue;
    const property = attributePath.node.name.name;
    if (property === "key" || property === "ref") continue;
    const valuePath = attributePath.get("value");
    let value: t.Expression;
    let expression: string;
    if (valuePath.isJSXExpressionContainer()) {
      const expressionPath = valuePath.get("expression");
      if (!expressionPath.isExpression()) continue;
      value = t.cloneNode(expressionPath.node, true);
      expression = generate(value).code;
      expressionPath.replaceWith(tracePropCall(runtimeIdentifier, {
        componentName,
        parentComponentName,
        property,
        expression,
        source: getSource(attributePath, state),
        value,
      }));
    } else if (valuePath.isStringLiteral()) {
      value = t.stringLiteral(valuePath.node.value);
      expression = JSON.stringify(valuePath.node.value);
      attributePath.node.value = t.jsxExpressionContainer(tracePropCall(runtimeIdentifier, {
        componentName,
        parentComponentName,
        property,
        expression,
        source: getSource(attributePath, state),
        value,
      }));
    } else if (valuePath.node === null) {
      value = t.booleanLiteral(true);
      expression = "true";
      attributePath.node.value = t.jsxExpressionContainer(tracePropCall(runtimeIdentifier, {
        componentName,
        parentComponentName,
        property,
        expression,
        source: getSource(attributePath, state),
        value,
      }));
    } else {
      continue;
    }
    state.causeScope.needsRuntime = true;
  }
}

function instrumentDerivedBinding(
  path: NodePath<t.VariableDeclarator>,
  state: CauseScopePluginState,
): void {
  if (!t.isIdentifier(path.node.id)) return;
  const binding = path.scope.getBinding(path.node.id.name);
  const metadata = binding ? state.causeScope.derived.get(binding.identifier) : undefined;
  const runtimeIdentifier = state.causeScope.runtimeIdentifier;
  const traceIdentifier = metadata?.traceIdentifier;
  const condition = metadata?.condition;
  if (!metadata?.used || !runtimeIdentifier || !traceIdentifier || !condition) return;
  const initPath = path.get("init");
  if (!initPath.isExpression()) return;

  const captureIdentifier = initPath.scope.generateUidIdentifier("causeScopeDerivedCapture");
  instrumentExpressionInputs(initPath, captureIdentifier, state, metadata.inputNamespace);
  const instrumentedExpression = t.cloneNode(initPath.node, true);
  const traceCall = t.callExpression(
    t.memberExpression(t.cloneNode(runtimeIdentifier), t.identifier("traceDerived")),
    [t.objectExpression([
      t.objectProperty(t.identifier("condition"), t.cloneNode(condition, true)),
      t.objectProperty(
        t.identifier("evaluate"),
        t.arrowFunctionExpression([captureIdentifier], instrumentedExpression),
      ),
    ])],
  );

  path.insertBefore(t.variableDeclarator(t.cloneNode(traceIdentifier), traceCall));
  initPath.replaceWith(t.memberExpression(t.cloneNode(traceIdentifier), t.identifier("value")));
  state.causeScope.needsRuntime = true;
}

export default function causeScopeBabelPlugin(): PluginObj<CauseScopePluginState> {
  return {
    name: "causescope-instrumentation",
    pre() {
      this.causeScope = {
        needsRuntime: false,
        registrations: new Map<t.VariableDeclaration, SetterMetadata[]>(),
        setters: new Map<t.Identifier, SetterMetadata>(),
        states: new Map<t.Identifier, SetterMetadata>(),
        props: new Map<t.Identifier, PropBindingMetadata>(),
        storage: new Map<t.Identifier, StorageBindingMetadata>(),
        derived: new Map<t.Identifier, DerivedBindingMetadata>(),
        aliases: new Map<t.Identifier, LocalAliasMetadata>(),
      };
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.causeScope.runtimeIdentifier = path.scope.generateUidIdentifier("causeScopeRuntime");
          collectStateSetters(path, state);
          collectPropBindings(path, state);
          collectStorageBindings(path, state);
          collectAliasBindings(path, state);
          collectDerivedBindings(path, state);
        },
        exit(path, state) {
          if (!state.causeScope.needsRuntime) return;
          const runtimeIdentifier = state.causeScope.runtimeIdentifier;
          if (runtimeIdentifier) path.unshiftContainer("body", createRuntimeImport(runtimeIdentifier));
        },
      },

      VariableDeclaration(path, state) {
        const registrations = state.causeScope.registrations.get(path.node);
        const runtimeIdentifier = state.causeScope.runtimeIdentifier;
        if (!registrations?.length || !runtimeIdentifier) return;
        if (!path.parentPath.isBlockStatement() && !path.parentPath.isProgram()) return;

        path.insertAfter(registrations.map((metadata) => createStateRegistration(runtimeIdentifier, metadata)));
        state.causeScope.needsRuntime = true;
      },

      VariableDeclarator(path, state) {
        instrumentDerivedBinding(path, state);
      },

      CallExpression(path, state) {
        if (!t.isIdentifier(path.node.callee)) return;
        const binding = path.scope.getBinding(path.node.callee.name);
        if (!binding) return;
        const metadata = state.causeScope.setters.get(binding.identifier);
        const runtimeIdentifier = state.causeScope.runtimeIdentifier;
        if (!metadata || !runtimeIdentifier || binding.identifier !== metadata.bindingIdentifier) return;
        const isReducer = metadata.hookType === "reducer";
        const argument = path.node.arguments[0];
        if (
          (!argument && !isReducer) ||
          t.isSpreadElement(argument) ||
          t.isJSXNamespacedName(argument) ||
          t.isArgumentPlaceholder(argument)
        ) return;

        const source = getSource(path, state);
        const argumentExpression = argument ? t.cloneNode(argument) : t.identifier("undefined");
        const call = t.callExpression(t.memberExpression(
          t.cloneNode(runtimeIdentifier),
          t.identifier(isReducer ? "dispatchReducer" : "setState"),
        ), [
          t.objectExpression([
            t.objectProperty(t.identifier("stateId"), t.stringLiteral(metadata.stateId)),
            t.objectProperty(t.identifier("stateName"), t.stringLiteral(metadata.stateName)),
            t.objectProperty(t.identifier("componentName"), t.stringLiteral(metadata.componentName)),
            t.objectProperty(t.identifier("source"), sourceObject(source)),
            t.objectProperty(t.identifier(isReducer ? "dispatch" : "setter"), t.cloneNode(metadata.setterIdentifier)),
            t.objectProperty(t.identifier("previousValue"), t.cloneNode(metadata.stateIdentifier)),
            t.objectProperty(t.identifier(isReducer ? "action" : "nextValue"), argumentExpression),
          ]),
        ]);

        state.causeScope.needsRuntime = true;
        path.replaceWith(call);
        path.skip();
      },

      JSXElement(path, state) {
        const openingPath = path.get("openingElement");
        if (!isNativeElement(openingPath)) return;
        const source = getSource(openingPath, state);
        const nodeId = stableId(
          "cs_node",
          `${source.file}:${source.line}:${source.column}:JSXOpeningElement`,
        );

        if (!hasAttribute(openingPath.node, "data-causescope-source")) {
          openingPath.node.attributes.push(expressionStringAttribute("data-causescope-source", sourceSnippet(path.node)));
        }

        for (const childPath of path.get("children")) {
          if (!childPath.isJSXExpressionContainer()) continue;
          const expressionPath = childPath.get("expression");
          if (!expressionPath.isExpression()) continue;
          instrumentJsxExpression(expressionPath, state, {
            kind: "children",
            nodeId,
            property: "children",
            instanceBinding: "host-prop",
          });
        }
      },

      JSXOpeningElement(path, state) {
        if (!isNativeElement(path)) {
          instrumentComponentProps(path, state);
          return;
        }
        const runtimeIdentifier = state.causeScope.runtimeIdentifier;
        if (!runtimeIdentifier) return;
        const source = getSource(path, state);
        const componentName = getComponentName(path);
        const nodeId = stableId(
          "cs_node",
          `${source.file}:${source.line}:${source.column}:JSXOpeningElement`,
        );

        if (!hasAttribute(path.node, "data-causescope-node")) {
          path.node.attributes.push(
            stringAttribute("data-causescope-node", nodeId),
            stringAttribute("data-causescope-file", source.file),
            stringAttribute("data-causescope-line", String(source.line)),
            stringAttribute("data-causescope-column", String(source.column)),
            stringAttribute("data-causescope-component", componentName),
          );
        }
        state.causeScope.needsRuntime = true;

        const hasSpreadAttribute = path.node.attributes.some((attribute) => t.isJSXSpreadAttribute(attribute));

        for (const attributePath of path.get("attributes")) {
          if (attributePath.isJSXSpreadAttribute()) {
            const argumentPath = attributePath.get("argument");
            if (!argumentPath.isExpression()) continue;
            instrumentJsxExpression(argumentPath, state, {
              kind: "spread",
              nodeId,
              property: "spread",
            });
            continue;
          }
          if (!attributePath.isJSXAttribute() || !t.isJSXIdentifier(attributePath.node.name)) continue;
          const property = attributePath.node.name.name;
          if (property === "key" || property === "ref" || property.startsWith("data-causescope-")) continue;
          const valuePath = attributePath.get("value");
          if (!valuePath.isJSXExpressionContainer()) continue;
          const expressionPath = valuePath.get("expression");
          if (!expressionPath.isExpression()) continue;
          const sameNameAttributeCount = path.node.attributes.filter(
            (attribute) => t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, { name: property }),
          ).length;
          const hasExplicitChildren = property === "children" && path.parentPath.isJSXElement()
            ? path.parentPath.node.children.length > 0
            : false;
          const instanceBinding = !hasSpreadAttribute && sameNameAttributeCount === 1 && !hasExplicitChildren
            ? "host-prop" as const
            : undefined;
          instrumentJsxExpression(expressionPath, state, {
            kind: "attribute",
            nodeId,
            property,
            ...(instanceBinding ? { instanceBinding } : {}),
          });
        }
      },
    },
  };
}
