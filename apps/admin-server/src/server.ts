import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { applyChain, chain } from "@/chain";
import { env } from "@/env";
import type { Env } from "@/lib/context";
import { handleError } from "@/lib/errors";

const baseApp = new OpenAPIHono<Env>().basePath((env.BASE_PATH || "") as "");

applyChain(chain, baseApp);

baseApp.notFound(() => {
  throw new HTTPException(404, { message: "Not Found" });
});
baseApp.onError(handleError);

export default baseApp;
