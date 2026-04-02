import { Plus } from "lucide-react";
import { useState } from "react";
import { Authorized } from "@/components/authorized";
import { Button } from "@/modules/ui/button";

import { CreateUserDialog } from "../dialogs/create-user-dialog";
import { UsersTable } from "../table";

export function UsersPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <div className="@container/content space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts, roles, and permissions.
          </p>
        </div>

        <Authorized capability="user:create">
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </Authorized>
      </div>

      <UsersTable />

      <CreateUserDialog
        onOpenChange={setShowCreateDialog}
        open={showCreateDialog}
      />
    </div>
  );
}
