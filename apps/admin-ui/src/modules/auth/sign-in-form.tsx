import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";
import { sessionQueryOptions } from "@/query/session-query";

interface SignInFormProps {
  initialEmail?: string;
  onSuccess?: () => void;
  onTwoFactorRequired?: (email: string) => void;
  showEmailField?: boolean;
}

export function SignInForm({
  onSuccess,
  onTwoFactorRequired,
  initialEmail = "",
  showEmailField = true,
}: SignInFormProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!(email && password)) {
      toast.error("Please enter email and password");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        toast.error(result.error.message ?? "Sign in failed");
        setPassword("");
        return;
      }

      if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      ) {
        onTwoFactorRequired?.(email);
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      toast.success("Signed in successfully");
      onSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign in failed";
      toast.error(message);
      setPassword("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {showEmailField && (
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            autoComplete="email"
            disabled={isLoading}
            id="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="current-password"
          disabled={isLoading}
          id="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          type="password"
          value={password}
        />
      </div>

      <Button className="w-full" disabled={isLoading} type="submit">
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
