# Database Migrations

## Golden Rule

**Never create migration files or directories by hand.** Always use Drizzle Kit commands to generate them.

## Generated Migrations (Schema Changes)

When you add or change tables/columns/indexes in `src/db/schema/`:

```bash
bun run db:generate   # generates migration in src/db/migrations/
```

This produces a timestamped directory with `migration.sql` + `snapshot.json`. Both files are required — the snapshot tracks Drizzle's internal schema state. Do not edit generated files.

## Custom Migrations

Use a custom migration **only** for SQL that Drizzle cannot generate from the schema:
- PostgreSQL extensions (`CREATE EXTENSION`)
- PostGIS geometry columns (`ALTER TABLE ... ADD COLUMN geom geometry(...)`)
- Operator-class indexes (e.g., GiST spatial indexes)
- Data backfills (`UPDATE` statements)

### How to Create

Use the `--custom` flag — this generates a proper migration directory with an empty `migration.sql` and a valid `snapshot.json`:

```bash
# From apps/server/:
bunx drizzle-kit generate --custom --name=your_migration_name
```

Then edit the generated `migration.sql` to add your custom SQL.

### Ordering Matters

When custom SQL must run before or after a schema migration, **generate in the correct order**. Drizzle uses the directory timestamp for execution order and the `snapshot.json` chain (`id`/`prevIds`) for schema state tracking. Both must be consistent.

For a feature needing extensions + schema + PostGIS:

```bash
# Step 1: Custom migration for extensions (gets timestamp T1)
bunx drizzle-kit generate --custom --name=enable_extensions

# Step 2: Schema migration (gets timestamp T2 > T1)
bun run db:generate

# Step 3: Custom migration for PostGIS column (gets timestamp T3 > T2)
bunx drizzle-kit generate --custom --name=geo_areas_postgis
```

Result:
```
20260315103133_enable_extensions/       # custom: CREATE EXTENSION (runs first)
20260315103138_nostalgic_microbe/       # generated: tables, enums, indexes
20260315103143_geo_areas_postgis/       # custom: PostGIS geom column + GiST index (runs last)
```

**Do not rename migration directories** — the `snapshot.json` chain must match the directory order.

## Common Mistakes

- **Creating migration directories by hand.** Always use `drizzle-kit generate` (schema) or `drizzle-kit generate --custom` (custom SQL). Hand-created directories lack a valid `snapshot.json`, which breaks Drizzle's schema state tracking and causes incorrect diffs on future generates.
- **Writing migration SQL by hand instead of generating.** The generated SQL is the source of truth — it matches the Drizzle schema exactly (enum values, column types, index names, constraint names). Hand-written SQL drifts.
- **Renaming migration directories to fix ordering.** This breaks the `snapshot.json` chain (`id`/`prevIds`). Instead, delete and regenerate in the correct order.
- **Putting extensions in the schema file.** `CREATE EXTENSION` is not supported by Drizzle schema declarations. Use a custom migration that runs before the generated one.
