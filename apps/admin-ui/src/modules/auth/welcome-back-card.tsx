import { ArrowRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { Button } from "@/modules/ui/button";

interface WelcomeBackCardProps {
  onContinue: () => void;
  onSwitchAccount: () => void;
  user: {
    name: string | null;
    email: string;
    image: string | null;
  };
}

export function WelcomeBackCard({
  user,
  onContinue,
  onSwitchAccount,
}: WelcomeBackCardProps) {
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
    <div className="flex flex-col items-center space-y-6 py-4">
      <Avatar className="size-20">
        <AvatarImage alt={displayName} src={user.image ?? undefined} />
        <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
      </Avatar>

      <div className="text-center">
        <h2 className="font-bold text-2xl text-foreground">
          Welcome back, {displayName}!
        </h2>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <div className="w-full space-y-4">
        <Button className="w-full py-6 text-lg" onClick={onContinue} size="lg">
          Continue as {displayName}
          <ArrowRight className="ml-2 size-5" />
        </Button>

        <button
          className="w-full text-center text-muted-foreground text-sm hover:text-foreground hover:underline"
          onClick={onSwitchAccount}
          type="button"
        >
          Not you? Use a different account
        </button>
      </div>
    </div>
  );
}
