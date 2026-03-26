import { Eye, EyeOff } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/modules/ui/button";

type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  ref?: React.Ref<HTMLInputElement>;
};

export function PasswordInput({
  className,
  disabled,
  ref,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <div className={cn("relative rounded-md", className)}>
      <input
        className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        ref={ref}
        type={showPassword ? "text" : "password"}
        {...props}
      />
      <Button
        className="text-muted-foreground absolute end-1 top-1/2 h-6 w-6 -translate-y-1/2 rounded-md"
        disabled={disabled}
        onClick={() => setShowPassword((prev) => !prev)}
        size="icon"
        type="button"
        variant="ghost"
      >
        {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
      </Button>
    </div>
  );
}
