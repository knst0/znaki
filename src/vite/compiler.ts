import MagicString from "magic-string";
import type { SourceMap } from "magic-string";
import { parseSync } from "oxc-parser";

export interface CompileIconsResult {
  code: string;
  map?: SourceMap;
  names: Set<string>;
  dynamic: boolean;
}

const ZNAKI_SOURCE = "znaki";
const RUNTIME_SOURCE = "znaki/runtime";
const FROM_ZNAKI_RE = /(?:from|import)\s*["']znaki["']/;
const INTRINSIC_NAMES: Record<string, true> = { Icon: true, PreloadSprite: true };

interface N {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

type BindingKind = "icon" | "preload" | "namespace" | "other";

interface Scope {
  parent: Scope | null;
  bindings: Map<string, BindingKind>;
}

interface FileState {
  id: string;
  code: string;
  ms: MagicString;
  taken: Set<string>;
  names: Set<string>;
  dynamic: boolean;
  dirty: boolean;
  needSpriteHref: string | null;
  needSvgProps: string | null;
  needSpriteUrl: string | null;
}

/**
 * Lowers the `Icon` / `PreloadSprite` compile-time intrinsics imported from
 * `"znaki"` into ordinary JSX `<svg><use /></svg>`, collecting the icon names
 * the file needs.
 *
 * Backend-independent: every `Icon` becomes a direct `<svg><use /></svg>`
 * whose `href` resolves through the synchronous runtime `spriteHref` (main
 * sprite or shared lazy sprite). No framework components, no inline SVG
 * body, no async delivery. Fully static icons emit an explicit
 * `<svg><use /></svg>`; anything dynamic or spread routes through one
 * `svgProps` spread whose merged literal evaluates once per framework
 * spread update, with the `<use>` built by a children callback inside the
 * same binding so React re-renders and Solid fine-grained effects keep
 * tracking the original slices.
 *
 * Returns `null` when the file imports no intrinsic (nothing to do) or cannot
 * be parsed (leaves reporting to the downstream compiler). Recognized
 * intrinsic usages that cannot be lowered throw a `znaki:` diagnostic instead
 * of silently becoming missing icons.
 */
export function compileIcons(code: string, id: string): CompileIconsResult | null {
  if (!FROM_ZNAKI_RE.test(code)) return null;

  let program: N;
  try {
    const parsed = parseSync(id, code, { lang: "tsx", sourceType: "module", preserveParens: false });
    if (parsed.errors.length > 0) return null;
    program = parsed.program as unknown as N;
  } catch {
    return null;
  }

  const file: FileState = {
    id,
    code,
    ms: new MagicString(code),
    taken: new Set(),
    names: new Set(),
    dynamic: false,
    dirty: false,
    needSpriteHref: null,
    needSvgProps: null,
    needSpriteUrl: null,
  };

  const root: Scope = { parent: null, bindings: new Map() };
  const removals: Array<{ node: N; specifiers: N[] }> = [];
  if (!collectImports(program, root, file, removals)) return null;
  const nodes = [program];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.type === "Identifier" || node.type === "JSXIdentifier") {
      const name = strField(node, "name");
      if (name) file.taken.add(name);
    }
    for (const child of childEntries(node)) nodes.push(child.node);
  }

  const scope: Scope = { parent: root, bindings: new Map() };
  const body = nodeList(program, "body");
  declareStatementList(body, scope);
  for (const statement of body) walk(statement, file, scope, program);

  stripIntrinsicImports(file, removals);
  insertHelperImports(file, program, removals);

  if (!file.dirty) return null;
  return {
    code: file.ms.toString(),
    map: file.ms.generateMap({ source: id, hires: true, includeContent: true }),
    names: file.names,
    dynamic: file.dynamic,
  };
}

function asNode(value: unknown): N | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("type" in value) || typeof value.type !== "string") return null;
  return value as N;
}

function nodeField(node: N, key: string): N | null {
  return asNode(node[key]);
}

function nodeList(node: N, key: string): N[] {
  const value = node[key];
  if (!Array.isArray(value)) return [];
  const out: N[] = [];
  for (const item of value) {
    const child = asNode(item);
    if (child) out.push(child);
  }
  return out;
}

function strField(node: N, key: string): string | null {
  const value = node[key];
  return typeof value === "string" ? value : null;
}

function childEntries(node: N): Array<{ key: string; node: N }> {
  const out: Array<{ key: string; node: N }> = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const child = asNode(item);
        if (child) out.push({ key, node: child });
      }
    } else {
      const child = asNode(value);
      if (child) out.push({ key, node: child });
    }
  }
  return out;
}

function collectImports(program: N, root: Scope, file: FileState, removals: Array<{ node: N; specifiers: N[] }>): boolean {
  let found = false;
  for (const statement of nodeList(program, "body")) {
    if (statement.type === "ExportNamedDeclaration") {
      const source = nodeField(statement, "source");
      if (!source || source.type !== "Literal" || source.value !== ZNAKI_SOURCE) continue;
      for (const specifier of nodeList(statement, "specifiers")) {
        if (specifier.type !== "ExportSpecifier") continue;
        if (statement.exportKind === "type" || specifier.exportKind === "type") continue;
        const name = exportedName(nodeField(specifier, "local"));
        if (name && INTRINSIC_NAMES[name]) {
          fail(file, specifier, `"${name}" imported from "znaki" is a compile-time intrinsic and cannot be re-exported`);
        }
      }
      continue;
    }
    if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
    const source = nodeField(statement, "source");
    if (!source || source.type !== "Literal" || source.value !== ZNAKI_SOURCE) continue;
    const intrinsic: N[] = [];
    for (const specifier of nodeList(statement, "specifiers")) {
      if (specifier.type === "ImportNamespaceSpecifier") {
        const local = nodeField(specifier, "local");
        const name = local ? strField(local, "name") : null;
        if (name) {
          root.bindings.set(name, "namespace");
          file.taken.add(name);
          found = true;
        }
        continue;
      }
      if (specifier.type !== "ImportSpecifier") continue;
      const local = nodeField(specifier, "local");
      const imported = nodeField(specifier, "imported");
      const localName = local ? strField(local, "name") : null;
      const importedName = exportedName(imported);
      if (!localName || !importedName) continue;
      file.taken.add(localName);
      if (specifier.importKind === "type" || statement.importKind === "type") {
        root.bindings.set(localName, "other");
        continue;
      }
      if (importedName === "Icon") {
        root.bindings.set(localName, "icon");
        intrinsic.push(specifier);
        found = true;
      } else if (importedName === "PreloadSprite") {
        root.bindings.set(localName, "preload");
        intrinsic.push(specifier);
        found = true;
      } else {
        root.bindings.set(localName, "other");
      }
    }
    if (intrinsic.length > 0) removals.push({ node: statement, specifiers: intrinsic });
  }
  return found;
}

function exportedName(node: N | null): string | null {
  if (!node) return null;
  if (node.type === "Identifier") return strField(node, "name");
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

function resolveBinding(name: string, scope: Scope): BindingKind | undefined {
  let current: Scope | null = scope;
  while (current) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
    current = current.parent;
  }
  return undefined;
}

function declarePattern(node: N, scope: Scope): void {
  if (node.type === "Identifier") {
    const name = strField(node, "name");
    if (name) scope.bindings.set(name, "other");
    return;
  }
  if (node.type === "RestElement") {
    const argument = nodeField(node, "argument");
    if (argument) declarePattern(argument, scope);
    return;
  }
  if (node.type === "AssignmentPattern") {
    const left = nodeField(node, "left");
    if (left) declarePattern(left, scope);
    return;
  }
  if (node.type === "ObjectPattern") {
    for (const property of nodeList(node, "properties")) {
      if (property.type === "Property") {
        const value = nodeField(property, "value");
        if (value) declarePattern(value, scope);
      } else if (property.type === "RestElement") {
        const argument = nodeField(property, "argument");
        if (argument) declarePattern(argument, scope);
      }
    }
    return;
  }
  if (node.type === "ArrayPattern") {
    for (const element of nodeList(node, "elements")) declarePattern(element, scope);
    return;
  }
  if (node.type === "TSParameterProperty") {
    const parameter = nodeField(node, "parameter");
    if (parameter) declarePattern(parameter, scope);
  }
}

function declareStatementList(body: N[], scope: Scope): void {
  for (const statement of body) {
    const exported = statement.type === "ExportNamedDeclaration" ? nodeField(statement, "declaration") : null;
    const target = exported ?? statement;
    if (target.type === "VariableDeclaration") {
      for (const declarator of nodeList(target, "declarations")) {
        const id = nodeField(declarator, "id");
        if (id) declarePattern(id, scope);
      }
    } else if (target.type === "FunctionDeclaration" || target.type === "ClassDeclaration") {
      const id = nodeField(target, "id");
      const name = id ? strField(id, "name") : null;
      if (name) scope.bindings.set(name, "other");
    }
  }
}

function walkFunctionNode(node: N, file: FileState, scope: Scope): void {
  if (node.type === "FunctionDeclaration") {
    const id = nodeField(node, "id");
    const name = id ? strField(id, "name") : null;
    if (name) scope.bindings.set(name, "other");
  }
  const inner: Scope = { parent: scope, bindings: new Map() };
  if (node.type === "FunctionExpression") {
    const id = nodeField(node, "id");
    const name = id ? strField(id, "name") : null;
    if (name) inner.bindings.set(name, "other");
  }
  for (const param of nodeList(node, "params")) declarePattern(param, inner);
  for (const param of nodeList(node, "params")) walk(param, file, inner, node);
  const body = nodeField(node, "body");
  if (body) walk(body, file, inner, node);
}

function walk(node: N, file: FileState, scope: Scope, parent: N | null): void {
  if (node.type === "ImportDeclaration" || node.type === "ImportAttribute") return;
  if (
    node.type.startsWith("TS") &&
    node.type !== "TSAsExpression" &&
    node.type !== "TSSatisfiesExpression" &&
    node.type !== "TSTypeQuery" &&
    node.type !== "TSNonNullExpression"
  ) {
    return;
  }
  if (node.type === "TSTypeQuery") {
    return;
  }
  if (node.type === "Identifier") {
    if (parent && !isDeclaration(parent)) checkReference(node, file, scope);
    return;
  }
  if (node.type === "JSXElement") {
    walkJsxElement(node, file, scope);
    return;
  }
  if (node.type === "JSXFragment") {
    for (const child of nodeList(node, "children")) walk(child, file, scope, node);
    return;
  }
  if (node.type === "Program" || node.type === "BlockStatement" || node.type === "StaticBlock") {
    const inner: Scope = { parent: scope, bindings: new Map() };
    const body = nodeList(node, "body");
    declareStatementList(body, inner);
    for (const statement of body) walk(statement, file, inner, node);
    return;
  }
  if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
    walkFunctionNode(node, file, scope);
    return;
  }
  if (node.type === "CatchClause") {
    const inner: Scope = { parent: scope, bindings: new Map() };
    const param = nodeField(node, "param");
    if (param) declarePattern(param, inner);
    if (param) walk(param, file, inner, node);
    const body = nodeField(node, "body");
    if (body) walk(body, file, inner, node);
    return;
  }
  if (node.type === "ForStatement" || node.type === "ForInStatement" || node.type === "ForOfStatement") {
    const inner: Scope = { parent: scope, bindings: new Map() };
    for (const entry of childEntries(node)) {
      if (entry.node.type === "VariableDeclaration") {
        for (const declarator of nodeList(entry.node, "declarations")) {
          const id = nodeField(declarator, "id");
          if (id) declarePattern(id, inner);
        }
      }
      walk(entry.node, file, inner, node);
    }
    return;
  }
  if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
    if (node.type === "ClassDeclaration") {
      const id = nodeField(node, "id");
      const name = id ? strField(id, "name") : null;
      if (name) scope.bindings.set(name, "other");
    }
    const inner: Scope = { parent: scope, bindings: new Map() };
    if (node.type === "ClassExpression") {
      const id = nodeField(node, "id");
      const name = id ? strField(id, "name") : null;
      if (name) inner.bindings.set(name, "other");
    }
    for (const entry of childEntries(node)) walk(entry.node, file, inner, node);
    return;
  }
  if (node.type === "ExportNamedDeclaration") {
    const declaration = nodeField(node, "declaration");
    if (declaration) {
      walk(declaration, file, scope, node);
      return;
    }
    for (const specifier of nodeList(node, "specifiers")) {
      const local = nodeField(specifier, "local");
      if (local && local.type === "Identifier") checkReference(local, file, scope);
    }
    return;
  }
  if (node.type === "VariableDeclarator") {
    const init = nodeField(node, "init");
    if (init) walk(init, file, scope, node);
    return;
  }
  if (node.type === "Property" || node.type === "PropertyDefinition" || node.type === "MethodDefinition") {
    if (node.computed === true) {
      const key = nodeField(node, "key");
      if (key) walk(key, file, scope, node);
    }
    const value = nodeField(node, "value");
    if (value) walk(value, file, scope, node);
    return;
  }
  if (node.type === "MemberExpression") {
    const object = nodeField(node, "object");
    if (object?.type === "Identifier" && resolveBinding(strField(object, "name") ?? "", scope) === "namespace") {
      const property = nodeField(node, "property");
      const name =
        node.computed === true ? (property?.type === "Literal" ? exportedName(property) : null) : property && strField(property, "name");
      if (!name || INTRINSIC_NAMES[name]) {
        fail(file, node, "compile-time intrinsic namespace members cannot be used as values");
      }
      return;
    }
    if (object) walk(object, file, scope, node);
    if (node.computed === true) {
      const property = nodeField(node, "property");
      if (property) walk(property, file, scope, node);
    }
    return;
  }
  if (node.type === "JSXAttribute") {
    const value = nodeField(node, "value");
    if (value) walk(value, file, scope, node);
    return;
  }
  if (node.type === "LabeledStatement" || node.type === "BreakStatement" || node.type === "ContinueStatement") {
    for (const entry of childEntries(node)) {
      if (entry.key === "label") continue;
      walk(entry.node, file, scope, node);
    }
    return;
  }
  for (const entry of childEntries(node)) walk(entry.node, file, scope, node);
}

function isDeclaration(parent: N): boolean {
  return (
    parent.type === "FunctionDeclaration" ||
    parent.type === "FunctionExpression" ||
    parent.type === "ClassDeclaration" ||
    parent.type === "ClassExpression" ||
    parent.type === "ImportSpecifier" ||
    parent.type === "ImportDefaultSpecifier" ||
    parent.type === "ImportNamespaceSpecifier"
  );
}

function checkReference(node: N, file: FileState, scope: Scope): void {
  const name = strField(node, "name");
  if (!name) return;
  const binding = resolveBinding(name, scope);
  if (binding === "icon" || binding === "preload" || binding === "namespace") {
    fail(file, node, `"${name}" imported from "znaki" is a compile-time intrinsic and cannot be used as a value`);
  }
}

function walkJsxElement(element: N, file: FileState, scope: Scope): void {
  const opening = nodeField(element, "openingElement");
  if (!opening) return;
  const tag = nodeField(opening, "name");
  if (tag && tag.type === "JSXIdentifier") {
    const name = strField(tag, "name");
    const binding = name ? resolveBinding(name, scope) : undefined;
    if (binding === "icon" || binding === "preload") {
      lowerIntrinsic(element, opening, binding, null, file, scope);
      return;
    }
    if (binding === "namespace") {
      fail(file, tag, `"${name}" imported from "znaki" is a compile-time intrinsic and cannot be used as a value`);
    }
  } else if (tag && tag.type === "JSXMemberExpression") {
    const object = nodeField(tag, "object");
    const property = nodeField(tag, "property");
    if (object && object.type === "JSXIdentifier" && property && property.type === "JSXIdentifier") {
      const objectName = strField(object, "name");
      const propName = strField(property, "name");
      const binding = objectName ? resolveBinding(objectName, scope) : undefined;
      if (binding === "namespace" && propName && INTRINSIC_NAMES[propName]) {
        lowerIntrinsic(element, opening, propName === "Icon" ? "icon" : "preload", objectName, file, scope);
        return;
      }
      if (binding === "icon" || binding === "preload") {
        fail(file, tag, `"${objectName}" imported from "znaki" is a compile-time intrinsic and cannot be used as a value`);
      }
    }
  }
  for (const attribute of nodeList(opening, "attributes")) walk(attribute, file, scope, opening);
  for (const child of nodeList(element, "children")) walk(child, file, scope, element);
}

interface NameInfo {
  names: Set<string>;
  dynamic: boolean;
}

function resolveName(expr: N): NameInfo {
  switch (expr.type) {
    case "Literal":
      return typeof expr.value === "string" ? { names: new Set([expr.value]), dynamic: false } : { names: new Set(), dynamic: true };
    case "TemplateLiteral": {
      if (nodeList(expr, "expressions").length > 0) return { names: new Set(), dynamic: true };
      const literal = literalName(expr);
      return literal === null ? { names: new Set(), dynamic: true } : { names: new Set([literal]), dynamic: false };
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "TSNonNullExpression": {
      const inner = nodeField(expr, "expression");
      return inner ? resolveName(inner) : { names: new Set(), dynamic: true };
    }
    case "ConditionalExpression": {
      const consequent = nodeField(expr, "consequent");
      const alternate = nodeField(expr, "alternate");
      if (!consequent || !alternate) return { names: new Set(), dynamic: true };
      const left = resolveName(consequent);
      const right = resolveName(alternate);
      return { names: new Set([...left.names, ...right.names]), dynamic: left.dynamic || right.dynamic };
    }
    case "LogicalExpression": {
      const leftNode = nodeField(expr, "left");
      const rightNode = nodeField(expr, "right");
      if (!leftNode || !rightNode) return { names: new Set(), dynamic: true };
      const left = resolveName(leftNode);
      const right = resolveName(rightNode);
      return { names: new Set([...left.names, ...right.names]), dynamic: left.dynamic || right.dynamic };
    }
    default:
      return { names: new Set(), dynamic: true };
  }
}

interface IconAttr {
  node: N;
  spread: N | null;
  key: string | null;
  size: boolean;
  isName: boolean;
}

function attributeKey(attribute: N): string | null {
  const name = nodeField(attribute, "name");
  if (!name) return null;
  if (name.type === "JSXIdentifier") return strField(name, "name");
  if (name.type === "JSXNamespacedName") {
    const namespace = nodeField(name, "namespace");
    const local = nodeField(name, "name");
    if (namespace && local && namespace.type === "JSXIdentifier" && local.type === "JSXIdentifier") {
      const outer = strField(namespace, "name");
      const inner = strField(local, "name");
      return outer && inner ? `${outer}:${inner}` : null;
    }
  }
  return null;
}

function lowerIntrinsic(element: N, opening: N, kind: BindingKind, namespace: string | null, file: FileState, scope: Scope): void {
  const short = kind === "icon" ? "Icon" : "PreloadSprite";
  const display = namespace ? `${namespace}.${short}` : short;
  const attributes = nodeList(opening, "attributes");
  for (const child of nodeList(element, "children")) {
    if (child.type === "JSXText") {
      if (/^\s*$/.test(typeof child.value === "string" ? child.value : "")) continue;
    } else if (child.type === "JSXExpressionContainer") {
      const expression = nodeField(child, "expression");
      if (!expression || expression.type === "JSXEmptyExpression") continue;
    }
    fail(file, child, `<${display}> does not accept children`);
  }
  if (kind === "preload") {
    if (attributes.length > 0) {
      fail(file, attributes[0], `<${display}> does not accept props`);
    }
    const spriteUrl = importName(file, "needSpriteUrl", "spriteUrl");
    file.ms.overwrite(element.start, element.end, `<link rel="preload" as="image" type="image/svg+xml" href={${spriteUrl}} />`);
    file.dirty = true;
    return;
  }
  for (const attribute of attributes) walk(attribute, file, scope, opening);
  const attrs: IconAttr[] = attributes.map((node) => {
    if (node.type === "JSXSpreadAttribute") {
      return { node, spread: nodeField(node, "argument"), key: null, size: false, isName: false };
    }
    const key = attributeKey(node);
    return { node, spread: null, key, size: key === "size", isName: key === "name" };
  });
  const nameAttrs = attrs.filter((attr) => attr.isName);
  if (nameAttrs.length > 1) {
    fail(file, nameAttrs[1].node, `<${display}> accepts only one "name" prop`);
  }
  const nameAttr = nameAttrs[0] ?? null;
  const hasSpread = attrs.some((attr) => attr.spread);
  if (!nameAttr && !hasSpread) {
    fail(file, element, `<${display}> requires a "name" prop`);
  }
  const sizeAttr = attrs.find((attr) => attr.size) ?? null;
  if (sizeAttr && !nodeField(sizeAttr.node, "value")) {
    fail(file, sizeAttr.node, `<${display}> "size" requires a value`);
  }
  if (nameAttr) {
    const nameNode = nameExpression(nameAttr);
    if (!nameNode) {
      fail(file, nameAttr.node, `<${display}> requires a static or dynamic "name" expression`);
    }
    const info = resolveName(nameNode);
    for (const name of info.names) file.names.add(name);
    if (info.dynamic) file.dynamic = true;
  } else {
    file.dynamic = true;
  }
  if (hasSpread) file.dynamic = true;
  file.ms.overwrite(element.start, element.end, lowerIconSvg(attrs, nameAttr, sizeAttr, display, file));
  file.dirty = true;
}

function nameExpression(attr: IconAttr): N | null {
  const value = nodeField(attr.node, "value");
  if (!value) return null;
  if (value.type === "Literal") return value;
  if (value.type !== "JSXExpressionContainer") return null;
  const expression = nodeField(value, "expression");
  if (!expression || expression.type === "JSXEmptyExpression") return null;
  return expression;
}

function lowerIconSvg(attrs: IconAttr[], nameAttr: IconAttr | null, sizeAttr: IconAttr | null, display: string, file: FileState): string {
  const hasSpread = attrs.some((attr) => attr.spread);
  if (!hasSpread && nameAttr && sizeIsStatic(sizeAttr)) {
    const nameNode = nameExpression(nameAttr);
    if (nameNode && literalName(nameNode) !== null) return buildSvgFast(attrs, sizeAttr, nameNode, file);
  }
  return lowerHelper(attrs, display, file);
}

function sizeIsStatic(sizeAttr: IconAttr | null): boolean {
  if (!sizeAttr) return true;
  const value = nodeField(sizeAttr.node, "value");
  if (!value) return false;
  if (value.type === "Literal") return true;
  if (value.type !== "JSXExpressionContainer") return false;
  const expression = nodeField(value, "expression");
  if (!expression || expression.type === "JSXEmptyExpression") return true;
  return expression.type === "Literal";
}

function literalName(node: N): string | null {
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : null;
  if (node.type === "TemplateLiteral") {
    if (nodeList(node, "expressions").length > 0) return null;
    const quasis = nodeList(node, "quasis");
    const value = quasis[0]?.value;
    if (value && typeof value === "object" && "cooked" in value && typeof value.cooked === "string") return value.cooked;
    return null;
  }
  return null;
}

function buildSvgFast(attrs: IconAttr[], sizeAttr: IconAttr | null, nameNode: N, file: FileState): string {
  const parts: string[] = [];
  const hasAriaLabel = attrs.some((attr) => attr.key === "aria-label" || attr.key === "aria-labelledby");
  const hasAriaHidden = attrs.some((attr) => attr.key === "aria-hidden");
  if (!hasAriaLabel && !hasAriaHidden) parts.push(`aria-hidden="true"`);
  parts.push(sizeEmissionFast(sizeAttr, file));
  for (const attr of attrs) {
    if (!attr.isName && !attr.size) parts.push(file.code.slice(attr.node.start, attr.node.end));
  }
  const href = importName(file, "needSpriteHref", "spriteHref");
  return `<svg ${parts.join(" ")}><use href={${href}(${file.code.slice(nameNode.start, nameNode.end)})} /></svg>`;
}

function sizeEmissionFast(sizeAttr: IconAttr | null, file: FileState): string {
  if (!sizeAttr) return `width="1em" height="1em"`;
  const value = nodeField(sizeAttr.node, "value");
  if (value && value.type === "Literal") {
    const slice = file.code.slice(value.start, value.end);
    return `width=${slice} height=${slice}`;
  }
  const expression = value && value.type === "JSXExpressionContainer" ? nodeField(value, "expression") : null;
  if (!expression || expression.type === "JSXEmptyExpression") return `width="1em" height="1em"`;
  const slice = file.code.slice(expression.start, expression.end);
  return `width={${slice}} height={${slice}}`;
}

function lowerHelper(attrs: IconAttr[], display: string, file: FileState): string {
  const merged: string[] = [];
  for (const attr of attrs) {
    if (attr.spread) {
      const argument = attr.spread;
      if (!argument) fail(file, attr.node, `<${display}> spread requires an expression`);
      merged.push(`...${file.code.slice(argument.start, argument.end)}`);
      continue;
    }
    const key = attr.key;
    if (key === null) fail(file, attr.node, `<${display}> unsupported attribute`);
    merged.push(`${JSON.stringify(key)}: ${propValue(attr, display, file)}`);
  }
  const svgProps = importName(file, "needSvgProps", "svgProps");
  const href = importName(file, "needSpriteHref", "spriteHref");
  let param = "__znakiName";
  let index = 1;
  while (file.taken.has(param)) {
    index += 1;
    param = `__znakiName$${index}`;
  }
  file.taken.add(param);
  return `<svg {...${svgProps}({${merged.join(", ")}}, (${param}) => <use href={${href}(${param})} />)} />`;
}

function propValue(attr: IconAttr, display: string, file: FileState): string {
  const value = nodeField(attr.node, "value");
  if (!value) return "true";
  if (value.type === "Literal") return file.code.slice(value.start, value.end);
  if (value.type !== "JSXExpressionContainer") fail(file, attr.node, `<${display}> unsupported attribute`);
  const expression = nodeField(value, "expression");
  if (!expression || expression.type === "JSXEmptyExpression") return "true";
  return file.code.slice(expression.start, expression.end);
}

function importName(file: FileState, slot: "needSpriteHref" | "needSvgProps" | "needSpriteUrl", exported: string): string {
  const existing = file[slot];
  if (existing) return existing;
  const head = `${exported[0]?.toUpperCase() ?? ""}${exported.slice(1)}`;
  let candidate = `__znaki${head}`;
  let index = 1;
  while (file.taken.has(candidate)) {
    index += 1;
    candidate = `__znaki${head}$${index}`;
  }
  file.taken.add(candidate);
  file[slot] = candidate;
  return candidate;
}

function stripIntrinsicImports(file: FileState, removals: Array<{ node: N; specifiers: N[] }>): void {
  for (const { node, specifiers } of removals) {
    const removed = new Set(specifiers);
    const remaining = nodeList(node, "specifiers").filter((specifier) => !removed.has(specifier));
    if (remaining.length === 0) {
      removeStatement(file, node);
      file.dirty = true;
      continue;
    }
    const runs = specifierRuns(nodeList(node, "specifiers"), removed);
    for (const run of runs) {
      const before = remaining.filter((candidate) => candidate.start < run.start).sort((a, b) => b.start - a.start)[0];
      const after = remaining.filter((candidate) => candidate.start > run.start).sort((a, b) => a.start - b.start)[0];
      if (after) {
        file.ms.remove(before ? before.end : run.start, after.start);
      } else if (before) {
        file.ms.remove(before.end, run.end);
      }
    }
    file.dirty = true;
  }
}

function specifierRuns(all: N[], removed: Set<N>): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = [];
  const ordered = [...all].sort((a, b) => a.start - b.start);
  let open: N | null = null;
  let close: N | null = null;
  const flush = (): void => {
    if (open && close) runs.push({ start: open.start, end: close.end });
    open = null;
    close = null;
  };
  for (const specifier of ordered) {
    if (!removed.has(specifier)) {
      flush();
      continue;
    }
    if (!open) open = specifier;
    close = specifier;
  }
  flush();
  return runs;
}

function removeStatement(file: FileState, node: N): void {
  let end = node.end;
  if (file.code[end] === ";") end += 1;
  const lineStart = file.code.lastIndexOf("\n", node.start - 1) + 1;
  if (/^[ \t]*$/.test(file.code.slice(lineStart, node.start))) {
    if (file.code[end] === "\r" && file.code[end + 1] === "\n") end += 2;
    else if (file.code[end] === "\n") end += 1;
  }
  file.ms.remove(node.start, end);
}

function insertHelperImports(file: FileState, program: N, removals: Array<{ node: N; specifiers: N[] }>): void {
  const runtime: Array<[string, string]> = [];
  if (file.needSpriteHref) runtime.push(["spriteHref", file.needSpriteHref]);
  if (file.needSvgProps) runtime.push(["svgProps", file.needSvgProps]);
  if (file.needSpriteUrl) runtime.push(["spriteUrl", file.needSpriteUrl]);
  if (runtime.length === 0) return;
  const rendered = runtime.map(([name, alias]) => (name === alias ? name : `${name} as ${alias}`)).join(", ");
  const position = insertPosition(file, program, removals);
  const line = `import { ${rendered} } from ${JSON.stringify(RUNTIME_SOURCE)};`;
  file.ms.appendLeft(position, position === 0 ? `${line}\n` : `\n${line}`);
  file.dirty = true;
}

function insertPosition(file: FileState, program: N, removals: Array<{ node: N; specifiers: N[] }>): number {
  const body = nodeList(program, "body");
  const stripped = new Set<N>();
  for (const { node, specifiers } of removals) {
    const remaining = nodeList(node, "specifiers").filter((specifier) => !specifiers.includes(specifier));
    if (remaining.length === 0) stripped.add(node);
  }
  let lastSurvivingEnd: number | null = null;
  let firstStrippedStart: number | null = null;
  for (const statement of body) {
    if (statement.type !== "ImportDeclaration") break;
    if (stripped.has(statement)) {
      firstStrippedStart ??= statement.start;
    } else {
      lastSurvivingEnd = statement.end;
    }
  }
  if (lastSurvivingEnd !== null) return file.code[lastSurvivingEnd] === ";" ? lastSurvivingEnd + 1 : lastSurvivingEnd;
  if (firstStrippedStart !== null) return firstStrippedStart;
  let position = 0;
  for (const statement of body) {
    if (statement.type !== "ExpressionStatement") break;
    const expression = nodeField(statement, "expression");
    if (!expression || expression.type !== "Literal" || typeof expression.value !== "string") break;
    position = statement.end + (file.code[statement.end] === ";" ? 1 : 0);
  }
  return position;
}

function fail(file: FileState, node: N, message: string): never {
  throw new Error(`znaki: ${file.id}:${offsetToLineCol(file.code, node.start)}: ${message}`);
}

function offsetToLineCol(code: string, offset: number): string {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset && index < code.length; index += 1) {
    if (code[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return `${line}:${column}`;
}
