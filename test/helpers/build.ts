import znaki from "../../src/vite/index.ts";
import type { Rollup } from "./vite.ts";
import { build } from "./vite.ts";

export type ZnakiOptions = Parameters<typeof znaki>[0];
export type Output = Rollup.RollupOutput["output"];

export interface BuildResult {
  output: Output;
  warnings: string[];
  chunk: string;
  sprite: string;
}

export interface BuildParams {
  root: string;
  options: ZnakiOptions;
  entry?: string;
}

function chunkCode(output: Output): string {
  return output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
}

function spriteMarkup(output: Output): string {
  const asset = output.find((item) => item.type === "asset" && String(item.fileName).endsWith(".svg"));
  return asset && asset.type === "asset" ? String(asset.source) : "";
}

export async function buildProject({ root, options, entry = "main.tsx" }: BuildParams): Promise<BuildResult> {
  const warnings: string[] = [];

  const result = (await build({
    root,
    logLevel: "silent",
    oxc: { jsx: { runtime: "classic" } },
    customLogger: {
      info: () => {},
      warn: (message: string) => warnings.push(message),
      warnOnce: (message: string) => warnings.push(message),
      error: (message: string) => warnings.push(message),
      clearScreen: () => {},
      hasErrorLogged: () => false,
      hasWarned: false,
    },
    plugins: [znaki(options)],
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ["es"], fileName: "out" },
    },
  })) as Rollup.RollupOutput | Rollup.RollupOutput[];

  const outputs = Array.isArray(result) ? result : [result];
  const output = outputs.flatMap((item) => [...item.output]) as Output;

  return { output, warnings, chunk: chunkCode(output), sprite: spriteMarkup(output) };
}
