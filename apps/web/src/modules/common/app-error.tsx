import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import * as z from "zod/mini";
import { reportableErrorSchema, reportError } from "@/lib/report-error";
import { Button } from "@/modules/ui/button";
import { Card, CardContent, CardHeader } from "@/modules/ui/card";

const boundaryErrorSchema = z.catch(
  z.union([
    z.pipe(
      z.instanceof(Error),
      z.transform((error) => {
        try {
          return {
            message: error.message || JSON.stringify(error),
            stack: error.stack,
          };
        } catch {
          return { message: "Something went wrong.", stack: error.stack };
        }
      })
    ),
    z.pipe(
      z.string(),
      z.transform((message) => ({ message, stack: undefined }))
    ),
  ]),
  (ctx) => {
    try {
      return {
        message: JSON.stringify(ctx.value) ?? String(ctx.value),
        stack: undefined,
      };
    } catch {
      return { message: "Something went wrong.", stack: undefined };
    }
  }
);

export default function AppError({ error, reset }: ErrorComponentProps) {
  const { message, stack } = boundaryErrorSchema.parse(error);

  useEffect(() => {
    reportError(reportableErrorSchema.parse(error), {
      source: "router-error-boundary",
    });
  }, [error]);

  return (
    <div className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <h1 className="font-semibold text-2xl">Unexpected error</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            The application encountered an unexpected condition. You can try
            again or go back home.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Message</p>
            <p className="mt-1 text-muted-foreground">{message}</p>
          </div>

          {import.meta.env.DEV ? (
            <>
              <p className="mt-4 font-medium text-sm">Stack trace</p>
              <pre className="mt-2 max-h-60 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
                {stack}
              </pre>
            </>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={reset} type="button">
              Try again
            </Button>
            <Button
              asChild
              className="w-full sm:w-auto"
              type="button"
              variant="outline"
            >
              <Link to="/">Go home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
