import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/assets/logo";
import {
  AuthStepTransition,
  SignUpForm,
  SignUpVerifyStep,
} from "@/modules/auth";
import { LoginLeftPanel } from "@/modules/auth/login-left-panel";
import { sessionQueryOptions } from "@/query/session-query";

const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP === "true";

export const Route = createFileRoute("/signup")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    if (!signupEnabled) {
      throw redirect({ to: "/login" });
    }
    const session = context.queryClient.getQueryData(
      sessionQueryOptions.queryKey
    );
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
});

type SignupStep = "form" | "verify";

function RouteComponent() {
  const navigate = useNavigate();
  const [step, setStep] = useState<SignupStep>("form");
  const [credentials, setCredentials] = useState({ email: "", password: "" });

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden md:block">
        <LoginLeftPanel />
      </div>
      <div className="flex w-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 text-left">
          <Logo className="mb-8 size-12 md:hidden" />

          <AuthStepTransition step={step}>
            {step === "form" && (
              <div className="space-y-8">
                <div>
                  <h1 className="mb-2 font-bold text-3xl text-foreground">
                    Create your account
                  </h1>
                  <p className="text-muted-foreground">
                    Already have an account?{" "}
                    <Link className="text-primary underline" to="/login">
                      Sign in
                    </Link>
                  </p>
                </div>
                <SignUpForm
                  onVerificationRequired={(email, password) => {
                    setCredentials({ email, password });
                    setStep("verify");
                  }}
                />
              </div>
            )}

            {step === "verify" && (
              <div className="space-y-8">
                <div>
                  <h1 className="mb-2 font-bold text-3xl text-foreground">
                    Verify your email
                  </h1>
                  <p className="text-muted-foreground">
                    We sent a verification code to {credentials.email}.
                  </p>
                </div>
                <SignUpVerifyStep
                  email={credentials.email}
                  onBack={() => setStep("form")}
                  onSignInFallback={() => navigate({ to: "/login" })}
                  onSuccess={() => navigate({ to: "/dashboard" })}
                  password={credentials.password}
                />
              </div>
            )}
          </AuthStepTransition>
        </div>
      </div>
    </div>
  );
}
