const UNSAFE_RE = /[^a-zA-Z0-9_-]/g;

export function symbolId(name: string): string {
  return `znaki-${name.replace(UNSAFE_RE, "-")}`;
}

export function shardKey(name: string): string {
  const colon = name.indexOf(":");
  const prefix = colon === -1 ? "" : name.slice(0, colon);
  const local = colon === -1 ? name : name.slice(colon + 1);
  const head = local.slice(0, 2) || "_";
  return `${prefix ? `${prefix}-` : ""}${head}`.toLowerCase().replace(UNSAFE_RE, "-");
}
