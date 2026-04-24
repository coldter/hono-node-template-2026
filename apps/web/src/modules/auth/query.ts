export { sessionQueryOptions } from "@/query/session-query";

export const authKeys = {
  all: ["auth"] as const,
  session: ["session"] as const,
  user: ["auth", "user"] as const,
} as const;
