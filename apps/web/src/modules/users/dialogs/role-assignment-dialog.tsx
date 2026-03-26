import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
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
import { RoleMultiSelect } from "../components/role-multi-select";
import { useUpdateUserRolesMutation } from "../query";
import type { User, UserDetail } from "../types";

const rolesSchema = z.object({
  roleSlugs: z.array(z.string()).min(1, "At least one role is required"),
});

type RolesFormValues = z.infer<typeof rolesSchema>;

interface RoleAssignmentDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: User | UserDetail;
}

export function RoleAssignmentDialog({
  user,
  open,
  onOpenChange,
}: RoleAssignmentDialogProps) {
  const updateMutation = useUpdateUserRolesMutation();

  const form = useForm<RolesFormValues>({
    resolver: zodResolver(rolesSchema),
    defaultValues: {
      roleSlugs: user.roleSlugs,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        roleSlugs: user.roleSlugs,
      });
    }
  }, [open, user, form]);

  const onSubmit = async (values: RolesFormValues) => {
    await updateMutation.mutateAsync({
      userId: user.id,
      data: values,
    });
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Roles</DialogTitle>
          <DialogDescription>
            Update role assignments for {user.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="roleSlugs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  <FormControl>
                    <RoleMultiSelect
                      onChange={field.onChange}
                      value={field.value}
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
              <Button disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending ? "Updating..." : "Update Roles"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
