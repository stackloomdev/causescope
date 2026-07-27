import type {
  ConditionDefinition,
  ConditionEvaluation,
  ConditionalRenderDefinition,
  ConditionalRenderResult,
} from "@causescope/shared";

function evaluationBase(definition: ConditionDefinition): Omit<ConditionDefinition, "children"> {
  const { children: _children, ...base } = definition;
  return base;
}

function markShortCircuited(definition: ConditionDefinition): ConditionEvaluation {
  const children = definition.children?.map(markShortCircuited);
  return {
    ...evaluationBase(definition),
    evaluated: false,
    shortCircuited: true,
    ...(children ? { children } : {}),
  };
}

function boundDerivedEvaluation(
  evaluation: ConditionEvaluation,
  expanded: Set<string>,
): ConditionEvaluation {
  const { children, ...summary } = evaluation;
  const key = `condition:${evaluation.id}`;
  if (expanded.has(key)) return summary;
  expanded.add(key);
  return {
    ...summary,
    ...(children ? { children: children.map((child) => boundDerivedEvaluation(child, expanded)) } : {}),
  };
}

const COERCION_UNAVAILABLE = Symbol("coercion-unavailable");

function evaluateBinary(operator: string | undefined, left: unknown, right: unknown): unknown {
  const needsUserCoercion = (value: unknown): boolean =>
    (typeof value === "object" && value !== null) || typeof value === "function";
  if (operator !== "===" && operator !== "!==" && (needsUserCoercion(left) || needsUserCoercion(right))) {
    return COERCION_UNAVAILABLE;
  }
  switch (operator) {
    case "===": return left === right;
    case "!==": return left !== right;
    case "==": return left == right; // eslint-disable-line eqeqeq
    case "!=": return left != right; // eslint-disable-line eqeqeq
    case ">": return (left as number) > (right as number);
    case ">=": return (left as number) >= (right as number);
    case "<": return (left as number) < (right as number);
    case "<=": return (left as number) <= (right as number);
    default: return COERCION_UNAVAILABLE;
  }
}

function markDeciding(evaluation: ConditionEvaluation): ConditionEvaluation {
  if (!evaluation.children?.length) return { ...evaluation, deciding: true };
  let lastEvaluatedIndex = -1;
  for (let index = evaluation.children.length - 1; index >= 0; index -= 1) {
    if (evaluation.children[index]?.evaluated) {
      lastEvaluatedIndex = index;
      break;
    }
  }
  if (lastEvaluatedIndex < 0) return { ...evaluation, deciding: true };
  return {
    ...evaluation,
    children: evaluation.children.map((child, index) => index === lastEvaluatedIndex ? markDeciding(child) : child),
  };
}

type DerivedConditionEvaluations = Record<string, ConditionEvaluation | undefined>;

function evaluateNode(
  definition: ConditionDefinition,
  inputs: Record<string, unknown>,
  derivedEvaluations: DerivedConditionEvaluations,
  expandedDerived: Set<string>,
): ConditionEvaluation {
  if (definition.type === "literal") {
    return { ...evaluationBase(definition), evaluated: true, value: definition.literalValue };
  }

  if (definition.type === "identifier" || definition.type === "member") {
    const inputName = definition.inputName ?? definition.expression;
    if (!Object.prototype.hasOwnProperty.call(inputs, inputName)) return { ...evaluationBase(definition), evaluated: false };
    const derivedEvaluation = derivedEvaluations[inputName];
    const derivedKey = `input:${inputName}`;
    const children = derivedEvaluation && !expandedDerived.has(derivedKey)
      ? (expandedDerived.add(derivedKey), [boundDerivedEvaluation(derivedEvaluation, expandedDerived)])
      : definition.children?.map((child) => evaluateNode(child, inputs, derivedEvaluations, expandedDerived));
    return {
      ...evaluationBase(definition),
      evaluated: true,
      value: inputs[inputName],
      ...(children?.length ? { children } : {}),
    };
  }

  if (definition.type === "call" || definition.type === "unknown") {
    const inputName = definition.inputName ?? definition.expression;
    if (!Object.prototype.hasOwnProperty.call(inputs, inputName)) return { ...evaluationBase(definition), evaluated: false };
    return { ...evaluationBase(definition), evaluated: true, value: inputs[inputName] };
  }

  const childDefinitions = definition.children ?? [];
  if (definition.type === "unary") {
    const child = childDefinitions[0] ? evaluateNode(childDefinitions[0], inputs, derivedEvaluations, expandedDerived) : undefined;
    if (!child?.evaluated) return { ...evaluationBase(definition), evaluated: false, children: child ? [child] : [] };
    const value = definition.operator === "!" ? !child.value : undefined;
    return { ...evaluationBase(definition), evaluated: true, value, children: [child] };
  }

  if (definition.type === "binary") {
    const left = childDefinitions[0] ? evaluateNode(childDefinitions[0], inputs, derivedEvaluations, expandedDerived) : undefined;
    const right = childDefinitions[1] ? evaluateNode(childDefinitions[1], inputs, derivedEvaluations, expandedDerived) : undefined;
    const children = [left, right].filter((child): child is ConditionEvaluation => Boolean(child));
    if (!left?.evaluated || !right?.evaluated) return { ...evaluationBase(definition), evaluated: false, children };
    const value = evaluateBinary(definition.operator, left.value, right.value);
    if (value === COERCION_UNAVAILABLE) return { ...evaluationBase(definition), evaluated: false, children };
    return {
      ...evaluationBase(definition),
      evaluated: true,
      value,
      children,
    };
  }

  if (definition.type === "logical") {
    const leftDefinition = childDefinitions[0];
    const rightDefinition = childDefinitions[1];
    const left = leftDefinition ? evaluateNode(leftDefinition, inputs, derivedEvaluations, expandedDerived) : undefined;
    if (!left?.evaluated) return { ...evaluationBase(definition), evaluated: false, children: left ? [left] : [] };

    const operator = definition.operator;
    const shortCircuits = (operator === "&&" && !left.value)
      || (operator === "||" && Boolean(left.value))
      || (operator === "??" && left.value !== null && left.value !== undefined);
    if (shortCircuits) {
      const children = rightDefinition ? [markDeciding(left), markShortCircuited(rightDefinition)] : [markDeciding(left)];
      return { ...evaluationBase(definition), evaluated: true, value: left.value, children };
    }

    const right = rightDefinition ? evaluateNode(rightDefinition, inputs, derivedEvaluations, expandedDerived) : undefined;
    const children = right ? [left, markDeciding(right)] : [left];
    return {
      ...evaluationBase(definition),
      evaluated: Boolean(right?.evaluated),
      ...(right?.evaluated ? { value: right.value } : {}),
      children,
    };
  }

  if (definition.type === "conditional") {
    const testDefinition = childDefinitions[0];
    const consequentDefinition = childDefinitions[1];
    const alternateDefinition = childDefinitions[2];
    const test = testDefinition ? evaluateNode(testDefinition, inputs, derivedEvaluations, expandedDerived) : undefined;
    if (!test?.evaluated) return { ...evaluationBase(definition), evaluated: false, children: test ? [test] : [] };
    const chooseConsequent = Boolean(test.value);
    const chosenDefinition = chooseConsequent ? consequentDefinition : alternateDefinition;
    const skippedDefinition = chooseConsequent ? alternateDefinition : consequentDefinition;
    const chosen = chosenDefinition ? evaluateNode(chosenDefinition, inputs, derivedEvaluations, expandedDerived) : undefined;
    const children: ConditionEvaluation[] = [markDeciding(test)];
    if (chooseConsequent) {
      if (chosen) children.push(chosen);
      if (skippedDefinition) children.push(markShortCircuited(skippedDefinition));
    } else {
      if (skippedDefinition) children.push(markShortCircuited(skippedDefinition));
      if (chosen) children.push(chosen);
    }
    return {
      ...evaluationBase(definition),
      evaluated: Boolean(chosen?.evaluated),
      ...(chosen?.evaluated ? { value: chosen.value } : {}),
      children,
    };
  }

  return { ...evaluationBase(definition), evaluated: false };
}

export function evaluateCondition(
  definition: ConditionDefinition | undefined,
  inputs: Record<string, unknown>,
  result: unknown,
  derivedEvaluations: DerivedConditionEvaluations = {},
  useObservedResult = false,
): ConditionEvaluation | undefined {
  if (!definition) return undefined;
  const evaluation = evaluateNode(definition, inputs, derivedEvaluations, new Set());
  return useObservedResult || !evaluation.evaluated
    ? { ...evaluation, evaluated: true, value: result }
    : evaluation;
}

export function findDecidingBranch(evaluation: ConditionEvaluation | undefined): string | undefined {
  if (!evaluation) return undefined;
  if (evaluation.deciding) return evaluation.expression;
  for (const child of evaluation.children ?? []) {
    const branch = findDecidingBranch(child);
    if (branch) return branch;
  }
  return undefined;
}

export function evaluateConditionalRender(
  definition: ConditionalRenderDefinition | undefined,
  condition: ConditionEvaluation | undefined,
  result: unknown,
): ConditionalRenderResult | undefined {
  if (!definition) return undefined;
  const conditionValue = condition?.value;
  if (definition.kind === "logical") {
    const rendered = Boolean(result) && typeof result === "object";
    return {
      ...definition,
      outcome: rendered ? "rendered" : "hidden",
      ...(!rendered ? {
        skippedBranch: definition.renderedBranch,
        failedCondition: findDecidingBranch(condition) ?? definition.conditionExpression,
      } : {}),
    };
  }

  const choseConsequent = Boolean(conditionValue);
  const skippedBranch = choseConsequent ? definition.alternateBranch : definition.renderedBranch;
  return {
    ...definition,
    outcome: choseConsequent ? "consequent" : "alternate",
    ...(skippedBranch ? { skippedBranch } : {}),
  };
}
