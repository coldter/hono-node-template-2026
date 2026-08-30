import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { Badge } from "@/modules/ui/badge";
import { Button } from "@/modules/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/modules/ui/form";
import { Input } from "@/modules/ui/input";
import { useUserStore } from "@/store/user";

const profileInfoSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(50, "Name must not be longer than 50 characters."),
});

type ProfileInfoValues = z.infer<typeof profileInfoSchema>;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProfileInfoForm() {
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);

  const form = useForm<ProfileInfoValues>({
    defaultValues: {
      name: user?.name ?? "",
    },
    resolver: zodResolver(profileInfoSchema),
  });

  async function onSubmit(data: ProfileInfoValues) {
    const { error } = await authClient.updateUser({
      name: data.name,
    });

    if (error) {
      toast.error(error.message || "Failed to update profile");
      return;
    }

    updateUser({ name: data.name });
    toast.success("Profile updated");
  }

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage alt={user?.name ?? ""} src={user?.image ?? ""} />
            <AvatarFallback className="text-lg">
              {getInitials(user?.name ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="font-medium leading-none">{user?.name ?? ""}</p>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground text-sm">
                {user?.email ?? ""}
              </p>
              {user?.emailVerified ? (
                <Badge variant="secondary">Verified</Badge>
              ) : (
                <Badge variant="outline">Unverified</Badge>
              )}
            </div>
          </div>
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="Your name" {...field} />
              </FormControl>
              <FormDescription>
                This is the name displayed on your profile and in emails.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
          type="submit"
        >
          {form.formState.isSubmitting ? "Saving..." : "Save changes"}
        </Button>
      </form>
    </Form>
  );
}
