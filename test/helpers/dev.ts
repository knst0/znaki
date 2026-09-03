import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import znaki from "../../src/vite/index.ts";
import type { ZnakiOptions } from "../../src/vite/index.ts";
import type { IconSource } from "../../src/vite/source.ts";
import type { ViteDevServer } from "./vite.ts";
import { createServer } from "./vite.ts";

export interface DevHarness {
  server: ViteDevServer;
  transform: (id: string) => Promise<string>;
  request: (path: string) => Promise<Response>;
  close: () => Promise<void>;
}

export interface DevParams {
  root: string;
  sources: IconSource[];
  options?: Partial<ZnakiOptions>;
  base?: string;
}

export async function createDevHarness({ root, sources, options = {}, base }: DevParams): Promise<DevHarness> {
  const server = await createServer({
    root,
    ...(base ? { base } : {}),
    logLevel: "silent",
    oxc: { jsx: "preserve" },
    server: { middlewareMode: true, watch: null },
    plugins: [znaki({ sources, dts: false, ...options })],
  });

  return {
    server,
    async transform(id) {
      const result = await server.environments.client.transformRequest(id);
      return result?.code ?? "";
    },
    async request(path) {
      const http = createHttpServer(server.middlewares);
      await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
      const { port } = http.address() as AddressInfo;
      try {
        return await fetch(`http://127.0.0.1:${port}${path}`);
      } finally {
        await new Promise((done) => http.close(done));
      }
    },
    close: () => server.close(),
  };
}
