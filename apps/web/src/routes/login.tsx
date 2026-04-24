import {
  createFileRoute,
  redirect,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Logo } from "@/assets/logo";
import {
  AuthStepTransition,
  SignInForm,
  SignInPasswordStep,
  TwoFactorVerifyStep,
  WelcomeBackCard,
} from "@/modules/auth";
import { LoginLeftPanel } from "@/modules/auth/login-left-panel";
import { Skeleton } from "@/modules/ui/skeleton";
import { sessionQueryOptions } from "@/query/session-query";
import { useLastUserStore } from "@/store";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  beforeLoad: ({ context, search }) => {
    const session = context.queryClient.getQueryData(
      sessionQueryOptions.queryKey
    );
    if (session) {
      throw redirect({ to: search.redirect ?? "/dashboard" });
    }
  },
  pendingComponent: () => <Skeleton className="h-full w-full" />,
});

type LoginStep = "welcome" | "password" | "fresh" | "verify-otp";

function RouteComponent() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ strict: false });
  const { clearLastUser, lastUser } = useLastUserStore();

  const [step, setStep] = useState<LoginStep>("fresh");
  const [twoFactorEmail, setTwoFactorEmail] = useState("");

  useEffect(() => {
    if (lastUser) {
      setStep("welcome");
    }
  }, [lastUser]);

  const handleSuccess = () => {
    navigate({ to: redirect ?? "/dashboard" });
  };

  const handleTwoFactorRequired = (email: string) => {
    setTwoFactorEmail(email);
    setStep("verify-otp");
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
                onTwoFactorRequired={handleTwoFactorRequired}
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
                <SignInForm
                  onSuccess={handleSuccess}
                  onTwoFactorRequired={handleTwoFactorRequired}
                />
              </div>
            )}

            {step === "verify-otp" && (
              <TwoFactorVerifyStep
                email={twoFactorEmail}
                onBack={() => setStep(lastUser ? "password" : "fresh")}
                onSuccess={handleSuccess}
              />
            )}
          </AuthStepTransition>
        </div>
      </div>
    </div>
  );
}
