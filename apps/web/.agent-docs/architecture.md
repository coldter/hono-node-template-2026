# Web Architecture

## Core Layout
- `src/routes`: TanStack Router route files
- `src/modules`: feature modules and shared UI building blocks
- `src/api.gen`: generated API client/types (do not hand-edit)
- `src/query`: query client setup
- `src/store`: Zustand stores for client-only state
- `src/lib`: shared frontend utilities

## Patterns
- Keep feature behavior inside `modules/<feature>`.
- Keep page routing concerns in `routes/*` and reusable UI in `modules/ui` or `modules/common`.
