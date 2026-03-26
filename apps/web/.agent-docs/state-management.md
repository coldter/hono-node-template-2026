# State Management

- Use Zustand for client-only/UI/session state.
- Keep persisted store state minimal and serializable.
- Do not mirror server list/detail payloads in Zustand when TanStack Query already owns them.
- Keep actions pure and predictable.
