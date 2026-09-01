import { parseSync } from "oxc-parser";
import type {
  Expression,
  JSXAttribute,
  JSXChild,
  JSXElement,
  JSXOpeningElement,
  MemberExpression,
  Node,
  Program,
  PropertyKey,
} from "oxc-parser";

type Value =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "array"; items: Value[] }
  | { kind: "object"; props: Record<string, Value> };

type Env = Map<string, Value>;

export interface IconSite {
  name: string;
  insertPos: number;
}

export interface ScanResult {
  names: Set<string>;
  sites: IconSite[];
  dynamic: boolean;
}

interface Ctx {
  names: Set<string>;
  sites: IconSite[];
  dynamic: boolean;
  component: string;
}

export function scanIcons(code: string, component: string): ScanResult {
  const ctx: Ctx = { names: new Set(), sites: [], dynamic: false, component };
  let program: Program;
  try {
    program = parseSync("component.tsx", code, { lang: "tsx", sourceType: "module", preserveParens: false }).program;
  } catch {
    return { names: ctx.names, sites: ctx.sites, dynamic: false };
  }
  scan(program, collectModuleConsts(program), ctx);
  return { names: ctx.names, sites: ctx.sites, dynamic: ctx.dynamic };
}

function collectModuleConsts(program: Program): Env {
  const env = new Map<string, Value>();
  for (const statement of program.body) {
    if (statement.type !== "VariableDeclaration" || statement.kind !== "const") continue;
    for (const declarator of statement.declarations) {
      if (declarator.id.type !== "Identifier" || !declarator.init) continue;
      const value = evaluate(declarator.init, env);
      if (value) env.set(declarator.id.name, value);
    }
  }
  return env;
}

function evaluate(expr: Expression, env: Env): Value | null {
  switch (expr.type) {
    case "Literal":
      if (typeof expr.value === "string") return { kind: "string", value: expr.value };
      if (typeof expr.value === "number") return { kind: "number", value: expr.value };
      if (typeof expr.value === "boolean") return { kind: "boolean", value: expr.value };
      if (expr.value === null) return { kind: "null" };
      return null;
    case "TemplateLiteral":
      if (expr.expressions.length === 0) return { kind: "string", value: expr.quasis[0].value.cooked ?? "" };
      return null;
    case "Identifier":
      if (expr.name === "undefined") return { kind: "null" };
      return env.get(expr.name) ?? null;
    case "ArrayExpression": {
      const items: Value[] = [];
      for (const element of expr.elements) {
        if (element === null || element.type === "SpreadElement") return null;
        const value = evaluate(element, env);
        if (!value) return null;
        items.push(value);
      }
      return { kind: "array", items };
    }
    case "ObjectExpression": {
      const props: Record<string, Value> = {};
      for (const property of expr.properties) {
        if (property.type !== "Property" || property.computed || property.kind !== "init") return null;
        const key = propertyKeyName(property.key);
        if (!key) return null;
        const value = evaluate(property.value, env);
        if (!value) return null;
        props[key] = value;
      }
      return { kind: "object", props };
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      return evaluate(expr.expression, env);
    default:
      return null;
  }
}

function scan(node: Node, env: Env, ctx: Ctx): void {
  switch (node.type) {
    case "Program":
    case "BlockStatement":
    case "StaticBlock":
      for (const statement of node.body) scan(statement, env, ctx);
      return;
    case "ExportNamedDeclaration":
    case "ExportDefaultDeclaration":
      if (node.declaration) scan(node.declaration, env, ctx);
      return;
    case "ExpressionStatement":
      if ("directive" in node) return;
      scan(node.expression, env, ctx);
      return;
    case "ReturnStatement":
    case "AwaitExpression":
    case "YieldExpression":
      if (node.argument) scan(node.argument, env, ctx);
      return;
    case "IfStatement":
      scan(node.consequent, env, ctx);
      if (node.alternate) scan(node.alternate, env, ctx);
      return;
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
    case "WhileStatement":
    case "DoWhileStatement":
      scan(node.body, env, ctx);
      return;
    case "VariableDeclaration":
      for (const declarator of node.declarations) if (declarator.init) scan(declarator.init, env, ctx);
      return;
    case "ConditionalExpression":
      scan(node.consequent, env, ctx);
      scan(node.alternate, env, ctx);
      return;
    case "LogicalExpression":
    case "BinaryExpression":
      scan(node.left, env, ctx);
      scan(node.right, env, ctx);
      return;
    case "SequenceExpression":
      for (const expression of node.expressions) scan(expression, env, ctx);
      return;
    case "CallExpression":
      if (node.callee.type === "ArrowFunctionExpression") scan(node.callee, env, ctx);
      for (const argument of node.arguments) scan(argument, env, ctx);
      return;
    case "ArrowFunctionExpression":
    case "FunctionExpression":
    case "FunctionDeclaration":
      if (node.body) scan(node.body, env, ctx);
      return;
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      scan(node.expression, env, ctx);
      return;
    case "JSXElement":
      scanJsxElement(node, env, ctx);
      return;
    case "JSXFragment":
      for (const child of node.children) scan(child, env, ctx);
      return;
    case "JSXExpressionContainer":
      if (node.expression.type !== "JSXEmptyExpression") scan(node.expression, env, ctx);
      return;
    default:
      return;
  }
}

function scanJsxElement(element: JSXElement, env: Env, ctx: Ctx): void {
  const opening = element.openingElement;
  const attributes = opening.attributes;
  const tagName = opening.name.type === "JSXIdentifier" ? opening.name.name : null;

  if (tagName === ctx.component) {
    const nameAttribute = findAttribute(attributes, "name");
    const resolved = nameAttribute?.value ? resolveIconName(nameAttribute.value, env) : null;

    if (resolved) {
      for (const name of resolved) ctx.names.add(name);
      if (resolved.size === 1 && !findAttribute(attributes, "data")) {
        ctx.sites.push({ name: [...resolved][0], insertPos: opening.name.end });
      }
    } else if (nameAttribute?.value) {
      ctx.dynamic = true;
    }
  }

  for (const attribute of attributes) {
    if (attribute.type !== "JSXAttribute" || !attribute.value) continue;
    if (attribute.value.type === "JSXElement" || attribute.value.type === "JSXFragment") {
      scan(attribute.value, env, ctx);
    } else if (attribute.value.type === "JSXExpressionContainer" && attribute.value.expression.type !== "JSXEmptyExpression") {
      scan(attribute.value.expression, env, ctx);
    }
  }

  let childEnv = env;
  if (tagName === "For") {
    const eachAttribute = findAttribute(attributes, "each");
    if (eachAttribute?.value?.type === "JSXExpressionContainer" && eachAttribute.value.expression.type !== "JSXEmptyExpression") {
      const eachValue = evaluate(eachAttribute.value.expression, env);
      if (eachValue) {
        childEnv = new Map(env);
        for (const child of element.children) bindForParam(child, eachValue, childEnv);
      }
    }
  }

  for (const child of element.children) scan(child, childEnv, ctx);
}

function findAttribute(attributes: JSXOpeningElement["attributes"], name: string): JSXAttribute | undefined {
  return attributes.find(
    (attribute): attribute is JSXAttribute =>
      attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === name,
  );
}

function resolveIconName(value: JSXAttribute["value"], env: Env): Set<string> | null {
  if (!value) return null;
  if (value.type === "Literal") return typeof value.value === "string" ? new Set([value.value]) : null;
  if (value.type !== "JSXExpressionContainer" || value.expression.type === "JSXEmptyExpression") return null;
  return resolveExpressionName(value.expression, env);
}

function resolveExpressionName(expr: Expression, env: Env): Set<string> | null {
  switch (expr.type) {
    case "Literal":
      return typeof expr.value === "string" ? new Set([expr.value]) : null;
    case "TemplateLiteral":
      return expr.expressions.length === 0 ? new Set([expr.quasis[0].value.cooked ?? ""]) : null;
    case "Identifier": {
      const value = env.get(expr.name);
      if (value?.kind === "string") return new Set([value.value]);
      if (value?.kind === "array") return stringItems(value);
      return null;
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      return resolveExpressionName(expr.expression, env);
    case "MemberExpression": {
      const object = resolveMemberObject(expr.object, env);
      if (!object) return null;
      const key = memberKey(expr);
      return key ? memberStrings(object, key) : null;
    }
    case "ConditionalExpression": {
      const consequent = resolveExpressionName(expr.consequent, env);
      const alternate = resolveExpressionName(expr.alternate, env);
      return consequent && alternate ? new Set([...consequent, ...alternate]) : null;
    }
    case "LogicalExpression": {
      const left = resolveExpressionName(expr.left, env);
      const right = resolveExpressionName(expr.right, env);
      return left && right ? new Set([...left, ...right]) : null;
    }
    default:
      return null;
  }
}

function bindForParam(child: JSXChild, eachValue: Value, env: Env): void {
  if (child.type !== "JSXExpressionContainer" || child.expression.type !== "ArrowFunctionExpression") return;
  const param = child.expression.params[0];
  if (!param) return;
  if (param.type === "Identifier") {
    env.set(param.name, eachValue);
    return;
  }
  if (param.type !== "ObjectPattern") return;
  for (const property of param.properties) {
    if (property.type !== "Property" || property.computed || property.kind !== "init") continue;
    const key = propertyKeyName(property.key);
    if (!key || property.value.type !== "Identifier") continue;
    const memberValue = memberOf(eachValue, key);
    if (memberValue) env.set(property.value.name, memberValue);
  }
}

function resolveMemberObject(expr: Expression, env: Env): Value | null {
  switch (expr.type) {
    case "Identifier":
      return env.get(expr.name) ?? null;
    case "TSAsExpression":
    case "TSSatisfiesExpression":
      return resolveMemberObject(expr.expression, env);
    case "MemberExpression": {
      const object = resolveMemberObject(expr.object, env);
      if (!object) return null;
      const key = memberKey(expr);
      return key ? memberOf(object, key) : null;
    }
    default:
      return null;
  }
}

function memberKey(expr: MemberExpression): string | null {
  if (!expr.computed && expr.property.type === "Identifier") return expr.property.name;
  if (expr.computed && expr.property.type === "Literal" && typeof expr.property.value === "string") return expr.property.value;
  return null;
}

function memberOf(value: Value, key: string): Value | null {
  if (value.kind === "object") return value.props[key] ?? null;
  if (value.kind !== "array") return null;
  const members: Value[] = [];
  for (const item of value.items) {
    if (item.kind === "object" && item.props[key]) members.push(item.props[key]);
  }
  return members.length > 0 ? { kind: "array", items: members } : null;
}

function memberStrings(value: Value, key: string): Set<string> | null {
  if (value.kind === "object") {
    const member = value.props[key];
    return member?.kind === "string" ? new Set([member.value]) : null;
  }
  if (value.kind !== "array") return null;
  const names = new Set<string>();
  for (const item of value.items) {
    if (item.kind === "object" && item.props[key]?.kind === "string") names.add(item.props[key].value);
  }
  return names.size > 0 ? names : null;
}

function stringItems(value: { items: Value[] }): Set<string> | null {
  const names = new Set<string>();
  for (const item of value.items) {
    if (item.kind !== "string") return null;
    names.add(item.value);
  }
  return names.size > 0 ? names : null;
}

function propertyKeyName(key: PropertyKey): string | null {
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}
