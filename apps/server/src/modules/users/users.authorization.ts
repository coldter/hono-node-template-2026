import { auth } from "@/auth/schema";

interface UserResource {
  email: string;
  id: string;
  roleSlugs: string[];
  status: string;
}

export const usersAuthorization = auth.createResource<UserResource>("user", {
  actions: [
    "list",
    "view",
    "create",
    "update",
    "delete",
    "deactivate",
    "activate",
    "unlock",
  ],
  policies: (p) => [
    p.allow("admin").to("*"),
    p.allow("user").to("list"),
    p.allow("user").to("view", "update").whereOwner(),
    p.deny("*").to("delete").whereTargetIsSelf(),
    p.deny("*").to("deactivate").whereTargetIsSelf(),
  ],
  resolveOwner: (resource) => resource.id,
});
