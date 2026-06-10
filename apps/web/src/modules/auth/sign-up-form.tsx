import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";

interface SignUpFormProps {
  onVerificationRequired: (email: string, password: string) => void;
}

export function SignUpForm({ onVerificationRequired }: SignUpFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!(name && email && password)) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.signUp.email({ name, email, password });

      if (result.error) {
        toast.error(result.error.message ?? "Sign up failed");
        return;
      }

      toast.success(
        "Account created. Check your email for a verification code."
      );
      onVerificationRequired(email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign up failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          autoComplete="name"
          disabled={isLoading}
          id="name"
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          value={name}
        />
      </div>

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

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="new-password"
          disabled={isLoading}
          id="password"
          minLength={8}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a password"
          required
          type="password"
          value={password}
        />
      </div>

      <Button className="w-full" disabled={isLoading} type="submit">
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}
