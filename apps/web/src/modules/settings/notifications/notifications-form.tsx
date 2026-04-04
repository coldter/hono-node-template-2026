import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/modules/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/modules/ui/form";
import { Skeleton } from "@/modules/ui/skeleton";
import { Switch } from "@/modules/ui/switch";
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from "./query";

const notificationsFormSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
});

type NotificationsFormValues = z.infer<typeof notificationsFormSchema>;

export function NotificationsForm() {
  const { data: preferences, isLoading } = useNotificationPreferencesQuery();
  const updateMutation = useUpdateNotificationPreferencesMutation();

  const form = useForm<NotificationsFormValues>({
    resolver: zodResolver(notificationsFormSchema),
    defaultValues: {
      emailEnabled: true,
      pushEnabled: true,
    },
  });

  useEffect(() => {
    if (preferences) {
      form.reset({
        emailEnabled: preferences.emailEnabled,
        pushEnabled: preferences.pushEnabled,
      });
    }
  }, [preferences, form]);

  function onSubmit(data: NotificationsFormValues) {
    updateMutation.mutate(data);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="emailEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    Email notifications
                  </FormLabel>
                  <FormDescription>
                    Receive email notifications for account activity and
                    updates.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pushEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">
                    Push notifications
                  </FormLabel>
                  <FormDescription>
                    Receive push notifications on your registered devices.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="text-base font-medium">Security notifications</p>
              <p className="text-muted-foreground text-sm">
                Notifications about password changes, new device logins, and
                account security events.
              </p>
            </div>
            <Switch aria-readonly checked disabled />
          </div>
        </div>
        <Button
          disabled={updateMutation.isPending || !form.formState.isDirty}
          type="submit"
        >
          {updateMutation.isPending ? "Saving..." : "Update notifications"}
        </Button>
      </form>
    </Form>
  );
}
