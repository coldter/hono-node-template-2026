import { auth } from "@/auth/schema";

interface RoleResource {
  id: string;
  name: string;
  slug: string;
}

export const rolesAuthorization = auth.createResource<RoleResource>("role", {
  actions: ["list", "view", "update"],
  policies: (p) => [p.allow("admin").to("*"), p.allow("user").to("list")],
});
