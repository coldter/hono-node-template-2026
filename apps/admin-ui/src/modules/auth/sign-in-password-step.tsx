import { ChevronLeft } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { SignInForm } from "./sign-in-form";

interface SignInPasswordStepProps {
  onBack: () => void;
  onSuccess: () => void;
  onTwoFactorRequired: (email: string) => void;
  user: {
    name: string | null;
    email: string;
    image: string | null;
  };
}

export function SignInPasswordStep({
  user,
  onBack,
  onSuccess,
  onTwoFactorRequired,
}: SignInPasswordStepProps) {
  const displayName = user.name || "User";
  const initials = user.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : (user.email[0] || "U").toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          className="group flex size-10 items-center justify-center rounded-full border bg-background transition-colors hover:bg-accent"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft className="size-6 text-muted-foreground group-hover:text-foreground" />
        </button>
        <div className="flex items-center space-x-3">
          <Avatar className="size-10">
            <AvatarImage alt={displayName} src={user.image ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-semibold text-sm leading-none">
              {displayName}
            </span>
            <span className="text-muted-foreground text-xs">{user.email}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="font-bold text-2xl text-foreground">Enter password</h1>
        <p className="text-muted-foreground text-sm">
          Please enter your password to continue.
        </p>
      </div>

      <SignInForm
        initialEmail={user.email}
        onSuccess={onSuccess}
        onTwoFactorRequired={onTwoFactorRequired}
        showEmailField={false}
      />
    </div>
  );
}
