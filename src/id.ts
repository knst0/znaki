const UNSAFE_RE = /[^a-zA-Z0-9_-]/g;

export function symbolId(name: string): string {
  return `znaki-${name.replace(UNSAFE_RE, "-")}`;
}
