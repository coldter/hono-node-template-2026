import { serve } from "@hono/node-server";
import { showRoutes } from "hono/dev";
import { env } from "@/env";
import { app } from "@/routers/main";

showRoutes(app, { colorize: true });

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    process.stdout.write(
      `[admin-server] running on http://${info.address}:${info.port}\n`
    );
  }
);
