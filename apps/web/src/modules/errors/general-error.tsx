import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home, ServerCrash } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/modules/ui/button";

type GeneralErrorProps = React.HTMLAttributes<HTMLDivElement> & {
  minimal?: boolean;
};

export function GeneralError({
  className,
  minimal = false,
}: GeneralErrorProps) {
  const navigate = useNavigate();
  const { history } = useRouter();
  return (
    <div
      className={cn("flex h-svh w-full items-center justify-center", className)}
    >
      <div className="flex flex-col items-center gap-6 px-4 text-center">
        {!minimal && (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <ServerCrash className="h-10 w-10 text-destructive" />
          </div>
        )}

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Something Went Wrong
          </h1>
          <p className="max-w-md text-muted-foreground">
            We apologize for the inconvenience. Please try again later.
          </p>
        </div>

        {!minimal && (
          <>
            <p className="text-sm text-muted-foreground">Error Code: 500</p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => history.go(-1)} variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go Back
              </Button>
              <Button onClick={() => navigate({ to: "/" })}>
                <Home className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              If this problem persists, please contact support.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
