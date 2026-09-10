import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { capabilitiesQueryOptions } from "@/hooks/use-authorization";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";
import { sessionQueryOptions } from "@/query/session-query";

interface SignUpVerifyStepProps {
  email: string;
  onBack: () => void;
  onSignInFallback?: () => void;
  onSuccess: () => void;
  password: string;
}

export function SignUpVerifyStep({
  email,
  password,
  onSuccess,
  onBack,
  onSignInFallback,
}: SignUpVerifyStepProps) {
  const queryClient = useQueryClient();
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = otp.trim();
    if (trimmed.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    setIsLoading(true);

    try {
      const verifyResult = await authClient.emailOtp.verifyEmail({
        email,
        otp: trimmed,
      });

      if (verifyResult.error) {
        toast.error(verifyResult.error.message ?? "Verification failed");
        setOtp("");
        inputRef.current?.focus();
        return;
      }

      const signInResult = await authClient.signIn.email({ email, password });

      if (signInResult.error) {
        toast.success("Email verified. Please sign in.");
        (onSignInFallback ?? onBack)();
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      queryClient.removeQueries({
        queryKey: capabilitiesQueryOptions.queryKey,
      });
      toast.success("Welcome!");
      onSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsSending(true);
    setOtp("");
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) {
        toast.error(error.message ?? "Failed to send verification code");
        return;
      }
      toast.success(`Verification code sent to ${email}`);
    } catch {
      toast.error("Failed to send verification code");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="otp">Verification code</Label>
          <Input
            autoComplete="one-time-code"
            disabled={isLoading}
            id="otp"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            pattern="[0-9]{6}"
            placeholder="000000"
            ref={inputRef}
            value={otp}
          />
        </div>

        <Button
          className="w-full"
          disabled={isLoading || otp.trim().length !== 6}
          type="submit"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify email"
          )}
        </Button>

        <Button
          className="w-full"
          disabled={isLoading}
          onClick={onBack}
          type="button"
          variant="ghost"
        >
          Back
        </Button>
      </form>

      <p className="text-center text-muted-foreground text-sm">
        Didn&apos;t receive the code?{" "}
        <button
          className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={isSending}
          onClick={handleResend}
          type="button"
        >
          {isSending ? "Sending..." : "Resend code"}
        </button>
      </p>
    </div>
  );
}
