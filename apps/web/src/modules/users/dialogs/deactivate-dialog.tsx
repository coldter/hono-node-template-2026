import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/modules/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/modules/ui/form";
import { Textarea } from "@/modules/ui/textarea";

import { useDeactivateUserMutation } from "../query";
import type { User, UserDetail } from "../types";

const deactivateSchema = z.object({
  reason: z.string().max(500).optional(),
});

type DeactivateFormValues = z.infer<typeof deactivateSchema>;

interface DeactivateDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: User | UserDetail;
}

export function DeactivateDialog({
  user,
  open,
  onOpenChange,
}: DeactivateDialogProps) {
  const deactivateMutation = useDeactivateUserMutation();

  const form = useForm<DeactivateFormValues>({
    resolver: zodResolver(deactivateSchema),
    defaultValues: {
      reason: "",
    },
  });

  const onSubmit = async (values: DeactivateFormValues) => {
    await deactivateMutation.mutateAsync({
      userId: user.id,
      reason: values.reason,
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Deactivate User</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate {user.name}? This will revoke
            their access and log them out of all sessions.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter a reason for deactivation..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={deactivateMutation.isPending}
                type="submit"
                variant="destructive"
              >
                {deactivateMutation.isPending
                  ? "Deactivating..."
                  : "Deactivate User"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
