# Data Fetching

- Use TanStack Query for all server state.
- Keep stable query key factories per feature.
- Put API calls inside feature query/mutation hooks, not directly inside components.
- Use shared mutation helpers for consistent toast/error/cache invalidation behavior.
- Use optimistic updates only when rollback behavior is clearly defined.
