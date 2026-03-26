import { Link } from "@tanstack/react-router";
import useDialogState from "@/hooks/use-dialog-state";
import { authClient } from "@/lib/auth-client";
import { SignOutDialog } from "@/modules/common/sign-out-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { Button } from "@/modules/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/modules/ui/dropdown-menu";

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState();
  const session = authClient.useSession();
  const user = session.data?.user;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button className="relative h-8 w-8 rounded-full" variant="ghost">
            <Avatar className="h-8 w-8">
              <AvatarImage alt={user?.name || ""} src={user?.image || ""} />
              <AvatarFallback>
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm leading-none font-medium">
                {user?.name || "User"}
              </p>
              <p className="text-muted-foreground text-xs leading-none">
                {user?.email || ""}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to="/settings">Profile</Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen(true)} variant="destructive">
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog onOpenChange={setOpen} open={!!open} />
    </>
  );
}
