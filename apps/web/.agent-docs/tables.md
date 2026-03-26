# Tables

- Keep table column definitions in feature `table/columns.tsx` files.
- Keep table state (pagination/sort/filter) URL-driven when it affects navigation/shareability.
- Use shared `modules/data-table` primitives for common behavior.
- Keep data mapping/formatting in column renderers or feature utilities.
