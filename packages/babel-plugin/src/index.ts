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
  };
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
  originValue?: t.Expression;
  accessPath?: string;
}): t.ObjectExpression {
  const properties: t.ObjectProperty[] = [];
  if (input.prop) properties.push(t.objectProperty(t.identifier("origin"), propOriginObject(input.prop)));
  if (input.storage) properties.push(t.objectProperty(t.identifier("origin"), storageOriginObject(input.storage)));
  if (input.originValue) properties.push(t.objectProperty(t.identifier("originValue"), input.originValue));
  if (input.accessPath) properties.push(t.objectProperty(t.identifier("accessPath"), t.stringLiteral(input.accessPath)));
  return t.objectExpression(properties);
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

function wrapCapturedMember(
  path: NodePath<t.MemberExpression | t.OptionalMemberExpression>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
): boolean {
  if (isMemberWriteTarget(path)) return false;
  const parent = path.parentPath;
  if ((parent.isCallExpression() || parent.isOptionalCallExpression()) && parent.node.callee === path.node) return false;
  if (parent.isTaggedTemplateExpression() && parent.node.tag === path.node) return false;
  const member = staticMemberInfo(path.node);
  if (!member) return false;
  const binding = path.scope.getBinding(member.root.name);
  const stateMetadata = binding ? state.causeScope.states.get(binding.identifier) : undefined;
  const propMetadata = binding ? state.causeScope.props.get(binding.identifier) : undefined;
  const storageMetadata = binding ? state.causeScope.storage.get(binding.identifier) : undefined;
  const original = t.cloneNode(path.node, true);
  const originIdentifier = path.scope.generateUidIdentifier(`${member.root.name}Origin`);
  const evaluatedMember = memberWithRoot(original, originIdentifier);
  const captureArguments: t.Expression[] = [
    t.stringLiteral(generate(original).code),
    evaluatedMember,
    stateMetadata ? t.stringLiteral(stateMetadata.stateId) : t.identifier("undefined"),
    originHintObject({
      ...(propMetadata ? { prop: propMetadata } : {}),
      ...(storageMetadata ? { storage: storageMetadata } : {}),
      originValue: t.cloneNode(originIdentifier),
      accessPath: member.accessPath,
    }),
  ];
  path.replaceWith(t.callExpression(
    t.arrowFunctionExpression(
      [t.cloneNode(originIdentifier)],
      t.callExpression(t.cloneNode(captureIdentifier), captureArguments),
    ),
    [t.cloneNode(member.root)],
  ));
  path.skip();
  return true;
}

function wrapCapturedCall(
  path: NodePath<t.CallExpression | t.OptionalCallExpression>,
  captureIdentifier: t.Identifier,
  expressionName: string,
): void {
  const original = t.cloneNode(path.node, true);
  path.replaceWith(t.callExpression(t.cloneNode(captureIdentifier), [
    t.stringLiteral(expressionName),
    original,
  ]));
  path.skip();
}

function instrumentCallArguments(
  path: NodePath<t.CallExpression | t.OptionalCallExpression>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
): void {
  for (const argumentPath of path.get("arguments")) {
    if (argumentPath.isSpreadElement()) {
      const spreadArgument = argumentPath.get("argument");
      if (spreadArgument.isExpression()) instrumentExpressionInputs(spreadArgument, captureIdentifier, state);
      continue;
    }
    if (argumentPath.isExpression()) instrumentExpressionInputs(argumentPath, captureIdentifier, state);
  }
}

function wrapCapturedIdentifier(
  path: NodePath<t.Identifier>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
): void {
  if (!shouldCaptureIdentifier(path)) return;
  const original = t.cloneNode(path.node);
  const captureArguments: t.Expression[] = [
    t.stringLiteral(original.name),
    original,
  ];
  const binding = path.scope.getBinding(original.name);
  const stateMetadata = binding ? state.causeScope.states.get(binding.identifier) : undefined;
  const propMetadata = binding ? state.causeScope.props.get(binding.identifier) : undefined;
  const storageMetadata = binding ? state.causeScope.storage.get(binding.identifier) : undefined;
  if (stateMetadata || propMetadata || storageMetadata) {
    captureArguments.push(stateMetadata ? t.stringLiteral(stateMetadata.stateId) : t.identifier("undefined"));
  }
  if (propMetadata || storageMetadata) {
    captureArguments.push(originHintObject({
      ...(propMetadata ? { prop: propMetadata } : {}),
      ...(storageMetadata ? { storage: storageMetadata } : {}),
    }));
  }
  path.replaceWith(t.callExpression(t.cloneNode(captureIdentifier), captureArguments));
  path.skip();
}

function instrumentExpressionInputs(
  expressionPath: NodePath<t.Expression>,
  captureIdentifier: t.Identifier,
  state: CauseScopePluginState,
): void {
  if (expressionPath.isIdentifier()) {
    wrapCapturedIdentifier(expressionPath, captureIdentifier, state);
    return;
  }
  if (expressionPath.isMemberExpression() || expressionPath.isOptionalMemberExpression()) {
    wrapCapturedMember(expressionPath, captureIdentifier, state);
    return;
  }
  if (expressionPath.isCallExpression() || expressionPath.isOptionalCallExpression()) {
    const expressionName = generate(expressionPath.node).code;
    instrumentCallArguments(expressionPath, captureIdentifier, state);
    wrapCapturedCall(expressionPath, captureIdentifier, expressionName);
    return;
  }
  if (expressionPath.isFunctionExpression() || expressionPath.isArrowFunctionExpression()) return;

  const callExpressionNames = new WeakMap<t.Node, string>();
  expressionPath.traverse({
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
      wrapCapturedMember(memberPath, captureIdentifier, state);
    },
    OptionalMemberExpression(memberPath) {
      wrapCapturedMember(memberPath, captureIdentifier, state);
    },
    CallExpression: {
      enter(callPath) {
        callExpressionNames.set(callPath.node, generate(callPath.node).code);
      },
      exit(callPath) {
        wrapCapturedCall(callPath, captureIdentifier, callExpressionNames.get(callPath.node) ?? generate(callPath.node).code);
      },
    },
    OptionalCallExpression: {
      enter(callPath) {
        callExpressionNames.set(callPath.node, generate(callPath.node).code);
      },
      exit(callPath) {
        wrapCapturedCall(callPath, captureIdentifier, callExpressionNames.get(callPath.node) ?? generate(callPath.node).code);
      },
    },
    ReferencedIdentifier(identifierPath) {
      if (!identifierPath.isIdentifier()) return;
      wrapCapturedIdentifier(identifierPath, captureIdentifier, state);
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

function conditionDefinitionObject(node: t.Expression, seed: string): t.ObjectExpression {
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
    properties.push(t.objectProperty(t.identifier("inputName"), t.stringLiteral(expression)));
  }
  const literal = literalValueNode(node);
  if (literal) properties.push(t.objectProperty(t.identifier("literalValue"), literal));

  let children: t.Expression[] = [];
  if (t.isUnaryExpression(node) && t.isExpression(node.argument)) {
    children = [conditionDefinitionObject(node.argument, seed)];
  } else if (t.isLogicalExpression(node) || t.isBinaryExpression(node)) {
    const left = t.isExpression(node.left) ? conditionDefinitionObject(node.left, seed) : null;
    const right = t.isExpression(node.right) ? conditionDefinitionObject(node.right, seed) : null;
    children = [left, right].filter((child): child is t.ObjectExpression => Boolean(child));
  } else if (t.isConditionalExpression(node)) {
    children = [node.test, node.consequent, node.alternate].map((child) => conditionDefinitionObject(child, seed));
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
    metadataProperties.push(t.objectProperty(
      t.identifier("condition"),
      conditionDefinitionObject(conditionExpression, `${source.file}:${source.line}:${source.column}`),
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
      };
    },
    visitor: {
      Program: {
        enter(path, state) {
          state.causeScope.runtimeIdentifier = path.scope.generateUidIdentifier("causeScopeRuntime");
          collectStateSetters(path, state);
          collectPropBindings(path, state);
          collectStorageBindings(path, state);
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
