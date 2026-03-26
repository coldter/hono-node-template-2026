import { Link, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Unlock,
  UserCog,
  User as UserIcon,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { PERMISSIONS, usePermission } from "@/modules/permissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { Badge } from "@/modules/ui/badge";
import { Button } from "@/modules/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/modules/ui/card";
import { Separator } from "@/modules/ui/separator";
import { Skeleton } from "@/modules/ui/skeleton";
import { UserRoleBadges } from "../components/user-role-badges";
import { UserStatusBadge } from "../components/user-status-badge";
import { DeactivateDialog } from "../dialogs/deactivate-dialog";
import { EditUserDialog } from "../dialogs/edit-user-dialog";
import { RoleAssignmentDialog } from "../dialogs/role-assignment-dialog";
import {
  useActivateUserMutation,
  useUnlockUserMutation,
  useUserQuery,
} from "../query";
import type { UserStatus } from "../types";

export function UserDetailPage() {
  const { userId } = useParams({ strict: false });
  const { data: user, isLoading, isError } = useUserQuery(userId ?? "");
  const { hasPermission } = usePermission();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showRolesDialog, setShowRolesDialog] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);

  const activateMutation = useActivateUserMutation();
  const unlockMutation = useUnlockUserMutation();

  const status = user?.status as UserStatus | undefined;

  if (isLoading) {
    return <UserDetailSkeleton />;
  }

  if (isError || !user) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">User not found</h2>
          <p className="text-muted-foreground mt-2">
            The user you are looking for does not exist.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/users">Back to Users</Link>
          </Button>
        </div>
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="@container/content space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button asChild size="icon" variant="ghost">
          <Link to="/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">User Details</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission(PERMISSIONS.USERS.UPDATE) && (
            <>
              <Button
                className="gap-2 font-medium transition-colors focus-visible:ring-2"
                onClick={() => setShowEditDialog(true)}
                size="sm"
                variant="outline"
              >
                <UserCog className="h-4 w-4" />
                Edit Profile
              </Button>
              <Button
                className="gap-2 font-medium transition-colors focus-visible:ring-2"
                onClick={() => setShowRolesDialog(true)}
                size="sm"
                variant="outline"
              >
                <ShieldCheck className="h-4 w-4" />
                Manage Roles
              </Button>
            </>
          )}

          {status === "active" &&
            hasPermission(PERMISSIONS.USERS.DEACTIVATE) && (
              <Button
                className="gap-2 font-medium transition-colors focus-visible:ring-destructive/50"
                onClick={() => setShowDeactivateDialog(true)}
                size="sm"
                variant="destructive"
              >
                <UserX className="h-4 w-4" />
                Deactivate
              </Button>
            )}

          {status === "inactive" &&
            hasPermission(PERMISSIONS.USERS.ACTIVATE) && (
              <Button
                className="gap-2 font-medium transition-all focus-visible:ring-2"
                disabled={activateMutation.isPending}
                onClick={() => activateMutation.mutate(user.id)}
                size="sm"
              >
                {activateMutation.isPending ? "Activating..." : "Activate"}
              </Button>
            )}

          {status === "locked" && hasPermission(PERMISSIONS.USERS.UNLOCK) && (
            <Button
              className="gap-2 font-medium transition-all focus-visible:ring-2"
              disabled={unlockMutation.isPending}
              onClick={() => unlockMutation.mutate(user.id)}
              size="sm"
            >
              <Unlock className="h-4 w-4" />
              {unlockMutation.isPending ? "Unlocking..." : "Unlock"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="text-center">
            <Avatar className="mx-auto h-24 w-24">
              <AvatarImage alt={user.name} src={user.image ?? undefined} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <CardTitle className="mt-4">{user.name}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <UserStatusBadge status={user.status as UserStatus} />
              {user.emailVerified && (
                <Badge variant="outline">Email Verified</Badge>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Roles</h4>
              <UserRoleBadges max={10} roles={user.roleSlugs} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    User ID
                  </dt>
                  <dd className="font-mono text-sm">{user.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Email
                  </dt>
                  <dd className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {user.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Created
                  </dt>
                  <dd className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(user.createdAt), "PPP")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Last Updated
                  </dt>
                  <dd className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {format(new Date(user.updatedAt), "PPP")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Failed Login Attempts
                  </dt>
                  <dd
                    className={
                      user.failedLoginAttempts > 0 ? "text-destructive" : ""
                    }
                  >
                    {user.failedLoginAttempts}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm font-medium">
                    Locked Until
                  </dt>
                  <dd>
                    {user.lockedUntil ? (
                      <span className="text-destructive flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        {format(new Date(user.lockedUntil), "PPP p")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not locked</span>
                    )}
                  </dd>
                </div>
                {user.deactivatedAt && (
                  <>
                    <div>
                      <dt className="text-muted-foreground text-sm font-medium">
                        Deactivated At
                      </dt>
                      <dd>{format(new Date(user.deactivatedAt), "PPP p")}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground text-sm font-medium">
                        Deactivation Reason
                      </dt>
                      <dd>{user.deactivatedReason || "No reason provided"}</dd>
                    </div>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <EditUserDialog
        onOpenChange={setShowEditDialog}
        open={showEditDialog}
        user={user}
      />

      <RoleAssignmentDialog
        onOpenChange={setShowRolesDialog}
        open={showRolesDialog}
        user={user}
      />

      <DeactivateDialog
        onOpenChange={setShowDeactivateDialog}
        open={showDeactivateDialog}
        user={user}
      />
    </div>
  );
}

function UserDetailSkeleton() {
  return (
    <div className="@container/content space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-6 md:col-span-2">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
