import { type ClientRequestOptions, hc } from "hono/client";
import type { app } from "@/routers/main";

/**
 * @lintignore
 */
export const getHonoRpcClient = (
  url: string,
  options: ClientRequestOptions | undefined
) =>
  hc<typeof app>(
    url,
    options ?? {
      init: {
        credentials: "include",
      },
    }
  );
