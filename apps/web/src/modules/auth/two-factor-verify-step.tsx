import { ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";

interface TwoFactorVerifyStepProps {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function TwoFactorVerifyStep({
  email,
  onBack,
  onSuccess,
}: TwoFactorVerifyStepProps) {
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSentInitial = useRef(false);

  const sendOtp = useCallback(async () => {
    setIsSending(true);
    try {
      const { error } = await authClient.twoFactor.sendOtp();
      if (error) {
        toast.error(error.message || "Failed to send verification code");
        return;
      }
      toast.success(`Verification code sent to ${email}`);
    } catch {
      toast.error("Failed to send verification code");
    } finally {
      setIsSending(false);
    }
  }, [email]);

  useEffect(() => {
    inputRef.current?.focus();
    if (!hasSentInitial.current) {
      hasSentInitial.current = true;
      sendOtp();
    }
  }, [sendOtp]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    setIsVerifying(true);
    try {
      const { error } = await authClient.twoFactor.verifyOtp({
        code: trimmed,
      });

      if (error) {
        toast.error(error.message || "Invalid verification code");
        setCode("");
        inputRef.current?.focus();
        return;
      }

      toast.success("Signed in successfully");
      onSuccess();
    } catch {
      toast.error("Verification failed");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setIsVerifying(false);
    }
  }

  function handleResend() {
    setCode("");
    sendOtp();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <button
          className="group flex size-10 items-center justify-center rounded-full border bg-background transition-colors hover:bg-accent"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft className="size-6 text-muted-foreground group-hover:text-foreground" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6 text-primary" />
          <h1 className="font-bold text-2xl text-foreground">
            Two-factor authentication
          </h1>
        </div>
        <p className="text-muted-foreground text-sm">
          A 6-digit verification code has been sent to{" "}
          <span className="font-medium text-foreground">{email}</span>. Enter it
          below to complete sign-in.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="otp-code">Verification code</Label>
          <Input
            autoComplete="one-time-code"
            disabled={isVerifying}
            id="otp-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            pattern="[0-9]{6}"
            placeholder="000000"
            ref={inputRef}
            value={code}
          />
        </div>

        <Button
          className="w-full"
          disabled={isVerifying || code.trim().length !== 6}
          type="submit"
        >
          {isVerifying ? (
            <>
              <Loader2 className="animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify and sign in"
          )}
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
