import {
  createFileRoute,
  redirect,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Logo } from "@/assets/logo";
import { authClient } from "@/lib/auth-client";
import {
  AuthStepTransition,
  SignInForm,
  SignInPasswordStep,
  WelcomeBackCard,
} from "@/modules/auth";
import { LoginLeftPanel } from "@/modules/auth/login-left-panel";
import { Skeleton } from "@/modules/ui/skeleton";
import { useLastUserStore } from "@/store";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: async ({ cause }) => {
    if (cause !== "enter") {
      return;
    }
    try {
      const { data } = await authClient.getSession({
        query: { disableCookieCache: true },
      });

      if (data?.session) {
        throw redirect({
          to: "/dashboard",
        });
      }
    } catch (error) {
      console.error("Error fetching session:", error);
      throw error;
    }
  },
  pendingComponent: () => <Skeleton className="h-full w-full" />,
});

type LoginStep = "welcome" | "password" | "fresh";

function RouteComponent() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ strict: false });
  const { clearLastUser, lastUser } = useLastUserStore();

  const [step, setStep] = useState<LoginStep>("fresh");

  useEffect(() => {
    if (lastUser) {
      setStep("welcome");
    }
  }, [lastUser]);

  const handleSuccess = () => {
    navigate({ to: redirect ?? "/dashboard" });
  };

  const handleSwitchAccount = () => {
    clearLastUser();
    setStep("fresh");
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden md:block">
        <LoginLeftPanel />
      </div>
      <div className="flex w-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 text-left">
          <Logo className="mb-8 size-12 md:hidden" />

          <AuthStepTransition step={step}>
            {step === "welcome" && lastUser && (
              <WelcomeBackCard
                onContinue={() => setStep("password")}
                onSwitchAccount={handleSwitchAccount}
                user={lastUser}
              />
            )}

            {step === "password" && lastUser && (
              <SignInPasswordStep
                onBack={() => setStep("welcome")}
                onSuccess={handleSuccess}
                user={lastUser}
              />
            )}

            {step === "fresh" && (
              <div className="space-y-8">
                <div>
                  <h1 className="mb-2 font-bold text-3xl text-foreground">
                    Sign in
                  </h1>
                  <p className="text-muted-foreground">
                    Welcome! Enter your credentials to continue.
                  </p>
                </div>
                <SignInForm onSuccess={handleSuccess} />
              </div>
            )}
          </AuthStepTransition>
        </div>
      </div>
    </div>
  );
}
