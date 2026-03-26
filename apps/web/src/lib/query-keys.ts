export function createQueryKeys<T extends string>(resource: T) {
  return {
    all: [resource] as const,
    lists: () => [resource, "list"] as const,
    list: <P>(params: P) => [resource, "list", params] as const,
    details: () => [resource, "detail"] as const,
    detail: (id: string) => [resource, "detail", id] as const,
  };
}

export const queryKeys = {
  users: createQueryKeys("users"),
  roles: createQueryKeys("roles"),
  auditLogs: createQueryKeys("audit-logs"),
};
