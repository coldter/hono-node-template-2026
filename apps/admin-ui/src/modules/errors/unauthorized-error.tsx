import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Home, Lock } from "lucide-react";
import { Button } from "@/modules/ui/button";

export function UnauthorisedError() {
  const navigate = useNavigate();
  const { history } = useRouter();
  return (
    <div className="flex h-svh w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6 px-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-10 w-10 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Unauthorized Access
          </h1>
          <p className="max-w-md text-muted-foreground">
            Please log in with the appropriate credentials to access this
            resource.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">Error Code: 401</p>

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
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
}
