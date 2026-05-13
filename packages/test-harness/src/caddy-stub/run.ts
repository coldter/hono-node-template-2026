/**
 * Caddy-ask stub. Polls the server's `/caddy/ask?domain=...` endpoint
 * once per configured domain and records the responses; callers inspect
 * `results()` to assert the on-demand-TLS contract.
 */

import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";

export type CaddyStubOptions = {
  readonly serverUrl: string;
  readonly domains: readonly string[];
};

export type CaddyAskResult = {
  readonly domain: string;
  readonly status: number;
  readonly body: string;
};

export type CaddyStub = {
  readonly url: string;
  results(): readonly CaddyAskResult[];
  close(): Promise<void>;
};

export async function startCaddyStub(
  opts: CaddyStubOptions
): Promise<CaddyStub> {
  const collected: CaddyAskResult[] = [];

  // Trivial liveness app — the real work is the outbound poll loop below.
  const app = new Hono().get("/health", (c) => c.text("ok"));

  const server: ServerType = await new Promise((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s));
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error(
      "caddy-stub: serve() did not return an AddressInfo — cannot determine bound port"
    );
  }
  const url = `http://127.0.0.1:${address.port}`;

  await Promise.all(
    opts.domains.map(async (domain) => {
      const askUrl = new URL("/caddy/ask", opts.serverUrl);
      askUrl.searchParams.set("domain", domain);
      const res = await fetch(askUrl.toString());
      const body = await res.text();
      collected.push({ domain, status: res.status, body });
    })
  );

  return {
    url,
    results: () => collected,
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}
